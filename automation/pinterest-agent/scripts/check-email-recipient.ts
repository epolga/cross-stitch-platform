// CLI: npx tsx scripts/check-email-recipient.ts <email>
// Looks up one email address's full send history across all campaigns, via
// EmailSendLog's email-index GSI (PK=email). Built for handling complaints/
// inquiries ("did we email this address, when, what MessageId") without
// needing to know which eid/campaign to check first.
import "dotenv/config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const SEND_LOG_TABLE = process.env.DDB_EMAIL_SEND_LOG_TABLE ?? "EmailSendLog";

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: npx tsx scripts/check-email-recipient.ts <email>");
    process.exit(1);
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  let items: any[] = [];
  let ExclusiveStartKey: any;
  do {
    const resp = await client.send(new QueryCommand({
      TableName: SEND_LOG_TABLE,
      IndexName: "email-index",
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: { ":email": email },
      ExclusiveStartKey,
    }));
    items = items.concat(resp.Items ?? []);
    ExclusiveStartKey = resp.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  if (items.length === 0) {
    console.log(`No EmailSendLog rows found for ${email} (either never sent to, or sent before this tracking was deployed 2026-07-26).`);
    return;
  }

  console.log(`${items.length} send(s) found for ${email}:`);
  for (const i of items.sort((a, b) => a.sentAtUtc.localeCompare(b.sentAtUtc))) {
    console.log(`  eid=${i.eid}  sentAtUtc=${i.sentAtUtc}  recipientType=${i.recipientType}  designId=${i.designId}  messageId=${i.messageId ?? "-"}  cid=${i.cid ?? "-"}`);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
