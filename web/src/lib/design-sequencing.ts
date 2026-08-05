// Sequential NPage / DesignID / NGlobalPage allocation for newly-published
// designs, plus an album-caption lookup for the publish dialog's preview.
// Ported verbatim (same GSIs, same query shape) from
// uploader/UploaderCli/Program.cs's GetNextNPageAsync/GetNextDesignIdAsync/
// GetMaxGlobalPageAsync/GetAlbumCaptionAsync — this is a rare, manual,
// single-operator action, so (like the desktop tool) there's no
// locking/transaction around these reads; a race would only matter if two
// admins published at the exact same moment.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE = process.env.DYNAMODB_TABLE_NAME || 'CrossStitchItems';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

function pad4(albumId: number): string {
  return albumId.toString().padStart(4, '0');
}

// Next 1-based NPage for a given album (parses the highest existing
// zero-padded NPage string for that album and adds 1; 1 if the album has
// no designs yet).
export async function getNextNPage(albumId: number): Promise<number> {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'ID = :id',
    ExpressionAttributeValues: { ':id': `ALB#${pad4(albumId)}` },
    ScanIndexForward: false,
    Limit: 1,
    ProjectionExpression: 'NPage',
  }));
  const current = res.Items?.[0]?.NPage as string | undefined;
  if (!current) return 1;
  const trimmed = current.replace(/^0+/, '');
  const maxNPage = trimmed ? parseInt(trimmed, 10) : 0;
  return maxNPage + 1;
}

// Next global sequential DesignID.
export async function getNextDesignId(): Promise<number> {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'DesignsByID-index',
    KeyConditionExpression: 'EntityType = :et',
    ExpressionAttributeValues: { ':et': 'DESIGN' },
    ScanIndexForward: false,
    Limit: 1,
    ProjectionExpression: 'DesignID',
  }));
  const current = res.Items?.[0]?.DesignID as number | undefined;
  return current !== undefined ? current + 1 : 1;
}

// Highest NGlobalPage currently in use (0 if no designs exist yet). Callers
// add 1 themselves, matching Program.cs's `nGlobalPage = maxGlobalPage + 1`.
export async function getMaxGlobalPage(): Promise<number> {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'Designs-index',
    KeyConditionExpression: 'EntityType = :et',
    ExpressionAttributeValues: { ':et': 'DESIGN' },
    ScanIndexForward: false,
    Limit: 1,
    ProjectionExpression: 'NGlobalPage',
  }));
  const current = res.Items?.[0]?.NGlobalPage as number | undefined;
  return current ?? 0;
}

// Album caption for the publish dialog's preview. Non-fatal — returns ''
// on any error or missing album, same as the desktop tool.
export async function getAlbumCaption(albumId: number): Promise<string> {
  try {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'ID = :pk',
      FilterExpression: 'EntityType = :albumType',
      ExpressionAttributeValues: {
        ':pk': `ALB#${pad4(albumId)}`,
        ':albumType': 'ALBUM',
      },
      ProjectionExpression: 'Caption',
      Limit: 1,
    }));
    const caption = res.Items?.[0]?.Caption as string | undefined;
    return caption?.trim() || '';
  } catch {
    return '';
  }
}
