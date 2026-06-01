import { afterEach, describe, expect, it, vi } from 'vitest';

const awsMock = vi.hoisted(() => ({
  sendMock: vi.fn(),
  queryInputs: [] as Array<Record<string, unknown>>,
}));

vi.mock('@aws-sdk/client-dynamodb', () => {
  class QueryCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
      awsMock.queryInputs.push(input);
    }
  }

  class DynamoDBClient {
    send = awsMock.sendMock;

    constructor() {}
  }

  class GetItemCommand {
    constructor(public input: Record<string, unknown>) {}
  }

  class PutItemCommand {
    constructor(public input: Record<string, unknown>) {}
  }

  class DeleteItemCommand {
    constructor(public input: Record<string, unknown>) {}
  }

  return {
    DynamoDBClient,
    QueryCommand,
    GetItemCommand,
    PutItemCommand,
    DeleteItemCommand,
  };
});

import { getUserDesignVotes } from './design-likes';

afterEach(() => {
  awsMock.sendMock.mockReset();
  awsMock.queryInputs.length = 0;
});

describe('getUserDesignVotes', () => {
  it('queries the user GSI across pages and returns sorted valid votes', async () => {
    const lastEvaluatedKey = {
      GSI1PK: { S: 'USER#ann@example.com' },
      GSI1SK: { S: 'DESIGN#9' },
    };

    awsMock.sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            DesignID: { N: '11' },
            VoteDirection: { S: 'up' },
            CreatedAt: { S: '2026-03-20T10:00:00.000Z' },
          },
          {
            GSI1SK: { S: 'DESIGN#9' },
            VoteValue: { N: '-1' },
            UpdatedAt: { S: '2026-03-21T10:00:00.000Z' },
          },
          {
            DesignID: { N: '0' },
            VoteDirection: { S: 'up' },
          },
        ],
        LastEvaluatedKey: lastEvaluatedKey,
      })
      .mockResolvedValueOnce({
        Items: [
          {
            GSI1SK: { S: 'DESIGN#15' },
            VoteDirection: { S: 'up' },
            UpdatedAt: { S: '2026-03-22T10:00:00.000Z' },
          },
          {
            DesignID: { N: '22' },
            EntityType: { S: 'IGNORE' },
          },
        ],
      });

    const votes = await getUserDesignVotes(' Ann@Example.com ');

    expect(awsMock.sendMock).toHaveBeenCalledTimes(2);
    expect(awsMock.queryInputs).toHaveLength(2);
    expect(awsMock.queryInputs[0]).toMatchObject({
      TableName: 'CrossStitchLikes',
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: {
        ':gsi1pk': { S: 'USER#ann@example.com' },
      },
      ExclusiveStartKey: undefined,
    });
    expect(awsMock.queryInputs[1]).toMatchObject({
      ExclusiveStartKey: lastEvaluatedKey,
    });

    expect(votes).toEqual([
      {
        designId: 15,
        voteDirection: 'up',
        updatedAt: '2026-03-22T10:00:00.000Z',
      },
      {
        designId: 9,
        voteDirection: 'down',
        updatedAt: '2026-03-21T10:00:00.000Z',
      },
      {
        designId: 11,
        voteDirection: 'up',
        createdAt: '2026-03-20T10:00:00.000Z',
      },
    ]);
  });

  it('rejects invalid emails before querying DynamoDB', async () => {
    await expect(getUserDesignVotes('bad-email')).rejects.toThrow('Valid email is required');
    expect(awsMock.sendMock).not.toHaveBeenCalled();
    expect(awsMock.queryInputs).toHaveLength(0);
  });
});