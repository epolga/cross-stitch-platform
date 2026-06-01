import {
  DynamoDBClient,
  PutItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

const REGION = process.env.AWS_REGION || 'us-east-1';
const SUBSCRIPTION_EVENTS_TABLE_NAME =
  process.env.DDB_SUBSCRIPTION_EVENTS_TABLE || 'SubscriptionEvents';

const client = new DynamoDBClient({ region: REGION });

export type RecordedSubscriptionStatus =
  | 'ACTIVE_RECORDED'
  | 'INACTIVE_RECORDED'
  | 'NONE';

export type SubscriptionEventSource =
  | 'SUBSCRIPTION_CONFIRM'
  | 'PAYPAL_WEBHOOK'
  | 'MANUAL'
  | 'SYSTEM';

export interface RecordSubscriptionEventInput {
  source: SubscriptionEventSource;
  eventType: string;
  status: RecordedSubscriptionStatus;
  previousStatus?: RecordedSubscriptionStatus;
  subscriptionId?: string | null;
  userId?: string;
  email?: string;
  trialStartedAt?: string;
  paypalEventId?: string;
  rawStatus?: string;
  notes?: string;
}

function normalizeOptionalString(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function toRecordedSubscriptionStatus(
  snapshot?:
    | {
        subscriptionId?: string | null;
        subscriptionActive?: boolean;
      }
    | null,
): RecordedSubscriptionStatus {
  if (!snapshot?.subscriptionId) return 'NONE';
  return snapshot.subscriptionActive === true
    ? 'ACTIVE_RECORDED'
    : 'INACTIVE_RECORDED';
}

export async function recordSubscriptionEvent(
  input: RecordSubscriptionEventInput,
): Promise<string | null> {
  if (!SUBSCRIPTION_EVENTS_TABLE_NAME) {
    console.warn('[subscription-events] Table name is not configured');
    return null;
  }

  const now = new Date().toISOString();
  const eventId = `SEVT#${now}#${randomUUID()}`;
  const item: Record<string, AttributeValue> = {
    ID: { S: eventId },
    CreatedAt: { S: now },
    Source: { S: input.source },
    EventType: { S: input.eventType.trim() || 'UNKNOWN' },
    Status: { S: input.status },
  };

  const previousStatus = normalizeOptionalString(input.previousStatus);
  if (previousStatus) {
    item.PreviousStatus = { S: previousStatus };
  }

  const subscriptionId = normalizeOptionalString(input.subscriptionId);
  if (subscriptionId) {
    item.SubscriptionId = { S: subscriptionId };
  }

  const userId = normalizeOptionalString(input.userId);
  if (userId) {
    item.UserId = { S: userId };
  }

  const email = normalizeOptionalString(input.email);
  if (email) {
    item.Email = { S: email };
  }

  const trialStartedAt = normalizeOptionalString(input.trialStartedAt);
  if (trialStartedAt) {
    item.TrialStartedAt = { S: trialStartedAt };
  }

  const paypalEventId = normalizeOptionalString(input.paypalEventId);
  if (paypalEventId) {
    item.PaypalEventId = { S: paypalEventId };
  }

  const rawStatus = normalizeOptionalString(input.rawStatus);
  if (rawStatus) {
    item.RawStatus = { S: rawStatus };
  }

  const notes = normalizeOptionalString(input.notes);
  if (notes) {
    item.Notes = { S: notes };
  }

  try {
    await client.send(
      new PutItemCommand({
        TableName: SUBSCRIPTION_EVENTS_TABLE_NAME,
        Item: item,
      }),
    );
    return eventId;
  } catch (error) {
    console.error('[subscription-events] Failed to record event:', error);
    return null;
  }
}
