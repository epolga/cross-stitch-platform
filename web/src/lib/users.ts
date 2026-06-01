// src/lib/users.ts
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand,
  type PutItemCommandInput,
  type AttributeValue,
  type ScanCommandInput,
  type UpdateItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

const REGION = process.env.AWS_REGION || 'us-east-1';
const USERS_TABLE_NAME = process.env.DDB_USERS_TABLE || 'CrossStitchUsers';
const PRIMARY_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

const client = new DynamoDBClient({ region: REGION });

export interface NewUserRegistration {
  email: string;
  firstName: string;
  password: string;
  verificationToken?: string;
  verificationTokenExpiresAt?: string;
  username?: string;
  subscriptionId?: string;
  receiveUpdates?: boolean;
  idOverride?: string;
  startTrial?: boolean;
  trialDownloadLimit?: number;
  trialDurationDays?: number;
}

export interface UserSubscriptionStatus {
  subscriptionId: string | null;
  subscriptionActive: boolean;
  subscriptionStartedAt?: string;
}

export type TrialStatus = 'NOT_STARTED' | 'ACTIVE' | 'LIMIT_REACHED' | 'EXPIRED';

export interface UserTrialStatus {
  status: TrialStatus;
  available: boolean;
  startedAt?: string;
  endsAt?: string;
  downloadLimit: number;
  downloadsUsed: number;
  downloadsRemaining: number;
}

export interface UserEntitlementStatus {
  subscription: UserSubscriptionStatus;
  trial: UserTrialStatus;
}

interface UserRecordSnapshot {
  id: string;
  email?: string;
  subscriptionId: string | null;
  subscriptionActive: boolean;
  subscriptionStartedAt?: string;
  trialStartedAt?: string;
  trialEndsAt?: string;
  trialDownloadLimit: number;
  trialDownloadsUsed: number;
  trialDownloadedDesignIds: Set<string>;
}

const DEFAULT_TRIAL_DOWNLOAD_LIMIT = 10;
const DEFAULT_TRIAL_DURATION_DAYS = 30;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.floor(numeric);
  return rounded > 0 ? rounded : fallback;
}

function getConfiguredTrialDownloadLimit(): number {
  return parsePositiveInteger(
    process.env.TRIAL_DOWNLOAD_LIMIT,
    DEFAULT_TRIAL_DOWNLOAD_LIMIT,
  );
}

function getConfiguredTrialDurationDays(): number {
  return parsePositiveInteger(
    process.env.TRIAL_DURATION_DAYS,
    DEFAULT_TRIAL_DURATION_DAYS,
  );
}

function isTrialDownloadLimitEnabled(): boolean {
  return (process.env.TRIAL_DOWNLOAD_LIMIT_ENABLED || '').trim().toLowerCase() === 'true';
}

export function getTrialDownloadLimit(): number {
  return getConfiguredTrialDownloadLimit();
}

export function getTrialDurationDays(): number {
  return getConfiguredTrialDurationDays();
}

function addDaysToIso(isoDate: string, days: number): string {
  return new Date(new Date(isoDate).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Error thrown when email already exists in the users table */
export class EmailExistsError extends Error {
  public readonly code = 'EmailExists';

  constructor(message = 'Email already registered') {
    super(message);
    this.name = 'EmailExistsError';
  }
}

const USER_ENTITLEMENT_PROJECTION =
  'ID, Email, SubscriptionId, SubscriptionActive, SubscriptionStartedAt, TrialStartedAt, TrialEndsAt, TrialDownloadLimit, TrialDownloadsUsed, TrialDownloadedDesignIds';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeTrialLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return getConfiguredTrialDownloadLimit();
  const rounded = Math.floor(limit as number);
  return rounded > 0 ? rounded : getConfiguredTrialDownloadLimit();
}

function normalizeTrialDurationDays(days?: number): number {
  if (!Number.isFinite(days)) return getConfiguredTrialDurationDays();
  const rounded = Math.floor(days as number);
  return rounded > 0 ? rounded : getConfiguredTrialDurationDays();
}

function parseUserRecord(item: Record<string, AttributeValue> | undefined): UserRecordSnapshot | null {
  if (!item?.ID?.S) return null;

  const trialDownloadedDesignIds = new Set(
    (item.TrialDownloadedDesignIds?.SS || [])
      .map((value) => value.trim())
      .filter(Boolean),
  );

  const configuredLimit = getConfiguredTrialDownloadLimit();
  const trialDownloadLimitRaw = item.TrialDownloadLimit?.N
    ? parseInt(item.TrialDownloadLimit.N, 10)
    : configuredLimit;
  const trialDownloadLimit = Number.isFinite(trialDownloadLimitRaw) && trialDownloadLimitRaw > 0
    ? trialDownloadLimitRaw
    : configuredLimit;

  const trialDownloadsUsedRaw = item.TrialDownloadsUsed?.N
    ? parseInt(item.TrialDownloadsUsed.N, 10)
    : trialDownloadedDesignIds.size;
  const trialDownloadsUsed = Number.isFinite(trialDownloadsUsedRaw) && trialDownloadsUsedRaw >= 0
    ? trialDownloadsUsedRaw
    : trialDownloadedDesignIds.size;

  return {
    id: item.ID.S,
    email: item.Email?.S?.trim() || undefined,
    subscriptionId: item.SubscriptionId?.S?.trim() || null,
    subscriptionActive: item.SubscriptionActive?.BOOL === true,
    subscriptionStartedAt: item.SubscriptionStartedAt?.S?.trim() || undefined,
    trialStartedAt: item.TrialStartedAt?.S?.trim() || undefined,
    trialEndsAt: item.TrialEndsAt?.S?.trim() || undefined,
    trialDownloadLimit,
    trialDownloadsUsed,
    trialDownloadedDesignIds,
  };
}

function computeTrialStatus(record: UserRecordSnapshot): TrialStatus {
  const hasStarted = Boolean(record.trialStartedAt && record.trialEndsAt);
  if (!hasStarted) return 'NOT_STARTED';

  const endsAtMs = new Date(record.trialEndsAt as string).getTime();
  if (!Number.isFinite(endsAtMs) || endsAtMs < Date.now()) return 'EXPIRED';

  if (
    isTrialDownloadLimitEnabled() &&
    record.trialDownloadsUsed >= record.trialDownloadLimit
  ) {
    return 'LIMIT_REACHED';
  }

  return 'ACTIVE';
}

function toTrialStatus(record: UserRecordSnapshot): UserTrialStatus {
  const status = computeTrialStatus(record);
  const downloadsRemaining = Math.max(
    0,
    record.trialDownloadLimit - record.trialDownloadsUsed,
  );

  return {
    status,
    available: status === 'NOT_STARTED',
    startedAt: record.trialStartedAt,
    endsAt: record.trialEndsAt,
    downloadLimit: record.trialDownloadLimit,
    downloadsUsed: record.trialDownloadsUsed,
    downloadsRemaining,
  };
}

function isConditionalCheckFailure(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === 'ConditionalCheckFailedException' ||
    message.includes('ConditionalCheckFailed') ||
    message.includes('ConditionalCheckFailedException')
  );
}

async function getUserRecordByEmail(
  email: string,
): Promise<UserRecordSnapshot | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const primaryId = `USR#${normalizedEmail}`;

  try {
    const { Item } = await client.send(
      new GetItemCommand({
        TableName: USERS_TABLE_NAME,
        Key: { ID: { S: primaryId } },
        ProjectionExpression: USER_ENTITLEMENT_PROJECTION,
      }),
    );

    const parsedByPrimaryKey = parseUserRecord(Item);
    if (parsedByPrimaryKey) {
      return parsedByPrimaryKey;
    }
  } catch (error) {
    console.error('Error fetching user by primary key:', error);
  }

  const scanParams: ScanCommandInput = {
    TableName: USERS_TABLE_NAME,
    FilterExpression: '#email = :email',
    ExpressionAttributeNames: { '#email': 'Email' },
    ExpressionAttributeValues: { ':email': { S: normalizedEmail } },
    ProjectionExpression: USER_ENTITLEMENT_PROJECTION,
    Limit: 100,
  };

  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;

  do {
    const { Items, LastEvaluatedKey } = await client.send(
      new ScanCommand({
        ...scanParams,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    const parsed = Items?.map((item) => parseUserRecord(item)).find(
      (value): value is UserRecordSnapshot => Boolean(value),
    );
    if (parsed) {
      return parsed;
    }

    lastEvaluatedKey = LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return null;
}


/**
 * Save user to CrossStitchUsers with PK = USR#email.
 * Table schema:
 *  - pk: string (partition key) "USR#<email>"
 *  - email: string
 *  - firstName: string
 *  - passwordHash: string (hex)
 *  - passwordSalt: string (hex)
 *  - createdAt: ISO string
 */
export async function saveUserToDynamoDB(
  input: NewUserRegistration,
): Promise<{ userId: string }> {
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const password = input.password;
  const subscriptionId = input.subscriptionId?.trim();
  const username = input.username?.trim();
  const receiveUpdates =
    typeof input.receiveUpdates === 'boolean' ? input.receiveUpdates : true;
  const unsubscribeToken = randomUUID();
  const cid = randomUUID();
  const verificationToken = input.verificationToken || randomUUID();
  const verificationTokenExpiresAt =
    input.verificationTokenExpiresAt ||
    new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(); // 48h default

  if (!email || !firstName || !password) {
    throw new Error('Missing required fields');
  }

  const overrideId = input.idOverride?.trim();
  const id = overrideId || `USR#${email}`;
  const createdAt = new Date().toISOString();
  const shouldStartTrial = input.startTrial === true;
  const trialDownloadLimit = normalizeTrialLimit(input.trialDownloadLimit);
  const trialDurationDays = normalizeTrialDurationDays(input.trialDurationDays);
  const trialEndsAt = addDaysToIso(createdAt, trialDurationDays);

  const item: Record<string, AttributeValue> = {
    ID: { S: id },
    Email: { S: email },
    FirstName: { S: firstName },
    Password: { S: password }, // Storing plain password for migration purposes
    CreatedAt: { S: createdAt },
    ReceiveUpdates: { BOOL: receiveUpdates },
    UnsubscribeToken: { S: unsubscribeToken },
    Unsubscribed: { BOOL: false },
    cid: { S: cid },
    VerificationToken: { S: verificationToken },
    VerificationTokenExpiresAt: { S: verificationTokenExpiresAt },
    Verified: { BOOL: false },
    VerifiedAt: { S: '' },
  };

  if (shouldStartTrial) {
    item.TrialStartedAt = { S: createdAt };
    item.TrialEndsAt = { S: trialEndsAt };
    item.TrialDownloadLimit = { N: String(trialDownloadLimit) };
    item.TrialDownloadsUsed = { N: '0' };
  }

  if (subscriptionId) {
    item.SubscriptionId = { S: subscriptionId };
    item.SubscriptionActive = { BOOL: true };
    item.SubscriptionStartedAt = { S: createdAt };
  }

  if (username) {
    item.UserName = { S: username };
  }

  const params: PutItemCommandInput = {
    TableName: USERS_TABLE_NAME,
    Item: item,
    // Do not overwrite existing user
    ConditionExpression: 'attribute_not_exists(ID)',
  };

  try {
    await client.send(new PutItemCommand(params));
    return { userId: id };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : String(error);

    if (
      msg.includes('ConditionalCheckFailed') ||
      msg.includes('ConditionalCheckFailedException')
    ) {
      throw new EmailExistsError();
    }
    console.error('Error saving user to DynamoDB:', error);
    throw error;
  }
}

export type UnsubscribeResult =
  | { status: 'updated'; email?: string }
  | { status: 'already-unsubscribed'; email?: string }
  | { status: 'not-found' };

/**
 * Fetch a verified user by cid (secondary users table).
 */
export async function getVerifiedUserByCid(
  cid: string,
): Promise<{ id: string; email?: string; firstName?: string } | null> {
  const tableName = process.env.DDB_USERS_TABLE;
  if (!tableName) {
    console.warn('DDB_USERS_TABLE not set; cannot fetch verified user by cid');
    return null;
  }

  const trimmedCid = cid.trim();
  if (!trimmedCid) return null;

  const scanParams: ScanCommandInput = {
    TableName: tableName,
    FilterExpression: '#cid = :cid',
    ExpressionAttributeNames: { '#cid': 'cid' },
    ExpressionAttributeValues: { ':cid': { S: trimmedCid } },
    ProjectionExpression: 'ID, Email, FirstName, Verified, VerifiedAt',
  };

  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;
  let match:
    | {
        id: string;
        email?: string;
        firstName?: string;
        verified?: boolean;
        verifiedAt?: string;
      }
    | null = null;

  do {
    const { Items, LastEvaluatedKey } = await client.send(
      new ScanCommand({ ...scanParams, ExclusiveStartKey: lastEvaluatedKey }),
    );
    const found = Items?.find((item) => item?.ID?.S);
    if (found?.ID?.S) {
      match = {
        id: found.ID.S,
        email: found.Email?.S,
        firstName: found.FirstName?.S,
        verified: found.Verified?.BOOL,
        verifiedAt: found.VerifiedAt?.S,
      };
      break;
    }
    lastEvaluatedKey = LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (!match) return null;
  if (match.verified || (match.verifiedAt && match.verifiedAt.length > 0)) {
    return { id: match.id, email: match.email, firstName: match.firstName };
  }
  return null;
}

/**
 * Mark user verified by verification token; returns basic info or null if not found/expired.
 */
export async function verifyUserByToken(
  token: string,
): Promise<{ email?: string; firstName?: string; cid?: string } | null> {
  const tableName = process.env.DDB_USERS_TABLE;
  if (!tableName) {
    console.warn('DDB_USERS_TABLE not set; cannot verify user');
    return null;
  }

  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return null;
  }

  const scanParams: ScanCommandInput = {
    TableName: tableName,
    FilterExpression: '#token = :token',
    ExpressionAttributeNames: { '#token': 'VerificationToken' },
    ExpressionAttributeValues: { ':token': { S: trimmedToken } },
    ProjectionExpression:
      'ID, Email, FirstName, VerificationTokenExpiresAt, Verified, cid',
  };

  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;
  let match:
    | {
        id: string;
        email?: string;
        firstName?: string;
        expiresAt?: string;
        verified?: boolean;
        cid?: string;
      }
    | undefined;

  do {
    const { Items, LastEvaluatedKey } = await client.send(
      new ScanCommand({ ...scanParams, ExclusiveStartKey: lastEvaluatedKey }),
    );
    const found = Items?.find((item) => item?.ID?.S);
    if (found?.ID?.S) {
      match = {
        id: found.ID.S,
        email: found.Email?.S,
        firstName: found.FirstName?.S,
        expiresAt: found.VerificationTokenExpiresAt?.S,
        verified: found.Verified?.BOOL,
        cid: found.cid?.S,
      };
      break;
    }
    lastEvaluatedKey = LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (!match) return null;

  if (match.verified) {
    return { email: match.email, firstName: match.firstName, cid: match.cid };
  }

  if (match.expiresAt && new Date(match.expiresAt).getTime() < Date.now()) {
    console.warn('Verification token expired for user', match.id);
    return null;
  }

  const nowIso = new Date().toISOString();

  await client.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { ID: { S: match.id } },
      UpdateExpression:
        'SET #verified = :true, #verifiedAt = :now REMOVE #token, #tokenExp',
      ExpressionAttributeNames: {
        '#verified': 'Verified',
        '#verifiedAt': 'VerifiedAt',
        '#token': 'VerificationToken',
        '#tokenExp': 'VerificationTokenExpiresAt',
      },
      ExpressionAttributeValues: {
        ':true': { BOOL: true },
        ':now': { S: nowIso },
      },
    }),
  );

  return { email: match.email, firstName: match.firstName, cid: match.cid };
}

/**
 * Update LastEmailEntry for a user in the secondary users table by cid.
 * Uses a scan (no index on cid) and updates the first matching record.
 */
export async function updateLastEmailEntryInUsersTable(
  cid: string,
): Promise<void> {
  const tableName = process.env.DDB_USERS_TABLE;
  if (!tableName) {
    console.warn('DDB_USERS_TABLE not set; skipping LastEmailEntry update');
    return;
  }

  const trimmedCid = cid.trim();
  if (!trimmedCid) {
    console.warn('Empty cid provided; skipping LastEmailEntry update');
    return;
  } 
   
  const scanParams: ScanCommandInput = {
    TableName: tableName,
    FilterExpression: '#cid = :cid',
    ExpressionAttributeNames: { '#cid': 'cid' },
    ExpressionAttributeValues: { ':cid': { S: trimmedCid } },
    ProjectionExpression: 'ID',
  };

  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;
  let id: string | undefined;

  do {
    const { Items, LastEvaluatedKey } = await client.send(
      new ScanCommand({ ...scanParams, ExclusiveStartKey: lastEvaluatedKey }),
    );
    const match = Items?.find((item) => item?.ID?.S);
    if (match?.ID?.S) {
      id = match.ID.S;
      break;
    }
    lastEvaluatedKey = LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (!id) {
    console.warn(`No user found for cid ${trimmedCid} in ${tableName}`);
    return;
  }

  const nowIso = new Date().toISOString();

  await client.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { ID: { S: id } },
      UpdateExpression: 'SET #lastEmailEntry = :now',
      ExpressionAttributeNames: { '#lastEmailEntry': 'LastEmailEntry' },
      ExpressionAttributeValues: { ':now': { S: nowIso } },
    }),
  );
}

export async function updateLastSeenAtByEmail(email: string): Promise<void> {
  const tableName = USERS_TABLE_NAME;
  if (!tableName) {
    console.warn('DDB_USERS_TABLE not set; skipping LastSeenAt update');
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    console.warn('Empty email provided; skipping LastSeenAt update');
    return;
  }

  const nowIso = new Date().toISOString();
  const primaryId = `USR#${normalizedEmail}`;
  const updateParams: UpdateItemCommandInput = {
    TableName: tableName,
    Key: { ID: { S: primaryId } },
    UpdateExpression:
      'SET #lastSeenAt = :now, #lastSeenCount = if_not_exists(#lastSeenCount, :zero) + :inc',
    ExpressionAttributeNames: {
      '#lastSeenAt': 'LastSeenAt',
      '#lastSeenCount': 'LastSeenCount',
    },
    ExpressionAttributeValues: {
      ':now': { S: nowIso },
      ':zero': { N: '0' },
      ':inc': { N: '1' },
    },
    ConditionExpression: 'attribute_exists(ID)',
  };

  try {
    await client.send(new UpdateItemCommand(updateParams));
    return;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !message.includes('ConditionalCheckFailed') &&
      !message.includes('ConditionalCheckFailedException')
    ) {
      console.error('Error updating LastSeenAt in users table:', error);
      return;
    }
  }

  const scanParams: ScanCommandInput = {
    TableName: tableName,
    FilterExpression: '#email = :email',
    ExpressionAttributeNames: { '#email': 'Email' },
    ExpressionAttributeValues: { ':email': { S: normalizedEmail } },
    ProjectionExpression: 'ID',
    Limit: 100,
  };

  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;
  let id: string | undefined;

  do {
    const { Items, LastEvaluatedKey } = await client.send(
      new ScanCommand({ ...scanParams, ExclusiveStartKey: lastEvaluatedKey }),
    );
    const match = Items?.find((item) => item?.ID?.S);
    if (match?.ID?.S) {
      id = match.ID.S;
      break;
    }
    lastEvaluatedKey = LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (!id) {
    console.warn(`No user found for email ${normalizedEmail} in ${tableName}`);
    return;
  }

  await client.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { ID: { S: id } },
      UpdateExpression:
        'SET #lastSeenAt = :now, #lastSeenCount = if_not_exists(#lastSeenCount, :zero) + :inc',
      ExpressionAttributeNames: {
        '#lastSeenAt': 'LastSeenAt',
        '#lastSeenCount': 'LastSeenCount',
      },
      ExpressionAttributeValues: {
        ':now': { S: nowIso },
        ':zero': { N: '0' },
        ':inc': { N: '1' },
      },
      ConditionExpression: 'attribute_exists(ID)',
    }),
  );
}

export async function getUserSubscriptionStatusByEmail(
  email: string,
): Promise<UserSubscriptionStatus | null> {
  const tableName = USERS_TABLE_NAME;
  if (!tableName) {
    console.warn('DDB_USERS_TABLE not set; cannot check subscription status');
    return null;
  }

  const user = await getUserRecordByEmail(email);
  if (!user) return null;

  return {
    subscriptionId: user.subscriptionId,
    subscriptionActive: user.subscriptionActive,
    subscriptionStartedAt: user.subscriptionStartedAt,
  };
}

export async function getUserSubscriptionIdByEmail(
  email: string,
): Promise<string | null> {
  const subscription = await getUserSubscriptionStatusByEmail(email);
  return subscription?.subscriptionId ?? null;
}

function toEntitlementStatus(record: UserRecordSnapshot): UserEntitlementStatus {
  return {
    subscription: {
      subscriptionId: record.subscriptionId,
      subscriptionActive: record.subscriptionActive,
      subscriptionStartedAt: record.subscriptionStartedAt,
    },
    trial: toTrialStatus(record),
  };
}

export async function getUserEntitlementStatusByEmail(
  email: string,
): Promise<UserEntitlementStatus | null> {
  if (!USERS_TABLE_NAME) {
    console.warn('DDB_USERS_TABLE not set; cannot check entitlement status');
    return null;
  }

  const record = await getUserRecordByEmail(email);
  if (!record) return null;
  return toEntitlementStatus(record);
}

export interface StartTrialInput {
  email: string;
  password?: string;
  firstName?: string;
  username?: string;
  receiveUpdates?: boolean;
  trialDownloadLimit?: number;
  trialDurationDays?: number;
}

export type StartTrialOutcome =
  | 'USER_CREATED_AND_STARTED'
  | 'STARTED'
  | 'ALREADY_STARTED'
  | 'SUBSCRIPTION_ACTIVE'
  | 'SUBSCRIPTION_INACTIVE'
  | 'MISSING_REGISTRATION_FIELDS';

export interface StartTrialResult {
  outcome: StartTrialOutcome;
  entitlement: UserEntitlementStatus | null;
}

export interface SubscriptionUserSnapshot {
  userId: string;
  email?: string;
  subscriptionId: string;
  subscriptionActive: boolean;
  subscriptionStartedAt?: string;
  trialStartedAt?: string;
}

function parseSubscriptionUserSnapshot(
  item: Record<string, AttributeValue> | undefined,
): SubscriptionUserSnapshot | null {
  if (!item) {
    return null;
  }

  const userId = item?.ID?.S?.trim();
  const subscriptionId = item?.SubscriptionId?.S?.trim();
  if (!userId || !subscriptionId) {
    return null;
  }

  return {
    userId,
    email: item.Email?.S?.trim() || undefined,
    subscriptionId,
    subscriptionActive: item.SubscriptionActive?.BOOL === true,
    subscriptionStartedAt: item.SubscriptionStartedAt?.S?.trim() || undefined,
    trialStartedAt: item.TrialStartedAt?.S?.trim() || undefined,
  };
}

export async function getSubscriptionUserSnapshotBySubscriptionId(
  subscriptionId: string,
): Promise<SubscriptionUserSnapshot | null> {
  if (!USERS_TABLE_NAME) {
    console.warn('DDB_USERS_TABLE not set; cannot resolve subscription state');
    return null;
  }

  const normalizedSubscriptionId = subscriptionId.trim();
  if (!normalizedSubscriptionId) return null;

  const scanParams: ScanCommandInput = {
    TableName: USERS_TABLE_NAME,
    FilterExpression: '#subscriptionId = :subscriptionId',
    ExpressionAttributeNames: { '#subscriptionId': 'SubscriptionId' },
    ExpressionAttributeValues: { ':subscriptionId': { S: normalizedSubscriptionId } },
    ProjectionExpression:
      'ID, Email, SubscriptionId, SubscriptionActive, SubscriptionStartedAt, TrialStartedAt',
    ConsistentRead: true,
    Limit: 100,
  };

  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;

  do {
    const { Items, LastEvaluatedKey } = await client.send(
      new ScanCommand({
        ...scanParams,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    const parsed = Items?.map((item) => parseSubscriptionUserSnapshot(item)).find(
      (value): value is SubscriptionUserSnapshot => Boolean(value),
    );
    if (parsed) {
      return parsed;
    }

    lastEvaluatedKey = LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return null;
}

export async function startTrialForEmail(
  input: StartTrialInput,
): Promise<StartTrialResult> {
  if (!USERS_TABLE_NAME) {
    console.warn('DDB_USERS_TABLE not set; cannot start trial');
    return { outcome: 'MISSING_REGISTRATION_FIELDS', entitlement: null };
  }

  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) {
    throw new Error('Email is required');
  }

  const existing = await getUserRecordByEmail(normalizedEmail);
  if (!existing) {
    const password = input.password?.trim() || '';
    const firstName = input.firstName?.trim() || '';
    if (!password || !firstName) {
      return { outcome: 'MISSING_REGISTRATION_FIELDS', entitlement: null };
    }

    try {
      await saveUserToDynamoDB({
        email: normalizedEmail,
        firstName,
        password,
        username: input.username,
        receiveUpdates: input.receiveUpdates,
        startTrial: true,
        trialDownloadLimit: input.trialDownloadLimit,
        trialDurationDays: input.trialDurationDays,
      });
    } catch (error) {
      if (!isConditionalCheckFailure(error)) {
        throw error;
      }
    }

    const created = await getUserRecordByEmail(normalizedEmail);
    return {
      outcome: 'USER_CREATED_AND_STARTED',
      entitlement: created ? toEntitlementStatus(created) : null,
    };
  }

  if (existing.subscriptionActive) {
    return {
      outcome: 'SUBSCRIPTION_ACTIVE',
      entitlement: toEntitlementStatus(existing),
    };
  }

  if (existing.subscriptionId && !existing.subscriptionActive) {
    return {
      outcome: 'SUBSCRIPTION_INACTIVE',
      entitlement: toEntitlementStatus(existing),
    };
  }

  if (existing.trialStartedAt) {
    return {
      outcome: 'ALREADY_STARTED',
      entitlement: toEntitlementStatus(existing),
    };
  }

  const trialStartedAt = new Date().toISOString();
  const trialDurationDays = normalizeTrialDurationDays(input.trialDurationDays);
  const trialEndsAt = addDaysToIso(trialStartedAt, trialDurationDays);
  const trialDownloadLimit = normalizeTrialLimit(input.trialDownloadLimit);

  try {
    await client.send(
      new UpdateItemCommand({
        TableName: USERS_TABLE_NAME,
        Key: { ID: { S: existing.id } },
        UpdateExpression:
          'SET TrialStartedAt = :startedAt, TrialEndsAt = :endsAt, TrialDownloadLimit = if_not_exists(TrialDownloadLimit, :limit), TrialDownloadsUsed = if_not_exists(TrialDownloadsUsed, :zero)',
        ConditionExpression:
          'attribute_exists(ID) AND (attribute_not_exists(TrialStartedAt) OR TrialStartedAt = :emptyString)',
        ExpressionAttributeValues: {
          ':startedAt': { S: trialStartedAt },
          ':endsAt': { S: trialEndsAt },
          ':limit': { N: String(trialDownloadLimit) },
          ':zero': { N: '0' },
          ':emptyString': { S: '' },
        },
      }),
    );
  } catch (error) {
    if (!isConditionalCheckFailure(error)) {
      throw error;
    }
  }

  const refreshed = await getUserRecordByEmail(normalizedEmail);
  return {
    outcome: 'STARTED',
    entitlement: refreshed ? toEntitlementStatus(refreshed) : null,
  };
}

export async function setSubscriptionActiveByEmail(
  email: string,
  subscriptionId: string,
): Promise<boolean> {
  if (!USERS_TABLE_NAME) {
    console.warn('DDB_USERS_TABLE not set; cannot activate subscription');
    return false;
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  const normalizedSubscriptionId = subscriptionId.trim();
  if (!normalizedSubscriptionId) return false;

  const user = await getUserRecordByEmail(normalizedEmail);
  if (!user) return false;

  const now = new Date().toISOString();
  await client.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE_NAME,
      Key: { ID: { S: user.id } },
      UpdateExpression:
        'SET SubscriptionId = :subscriptionId, SubscriptionActive = :active, SubscriptionStartedAt = :startedAt',
      ExpressionAttributeValues: {
        ':subscriptionId': { S: normalizedSubscriptionId },
        ':active': { BOOL: true },
        ':startedAt': { S: now },
      },
    }),
  );

  return true;
}

export async function setSubscriptionActiveBySubscriptionId(
  subscriptionId: string,
  subscriptionActive: boolean,
): Promise<boolean> {
  if (!USERS_TABLE_NAME) {
    console.warn('DDB_USERS_TABLE not set; cannot update subscription state');
    return false;
  }

  const normalizedSubscriptionId = subscriptionId.trim();
  if (!normalizedSubscriptionId) return false;

  const user = await getSubscriptionUserSnapshotBySubscriptionId(
    normalizedSubscriptionId,
  );
  if (!user?.userId) return false;

  const now = new Date().toISOString();
  await client.send(
    new UpdateItemCommand({
      TableName: USERS_TABLE_NAME,
      Key: { ID: { S: user.userId } },
      UpdateExpression:
        'SET SubscriptionActive = :active, SubscriptionStatusUpdatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':active': { BOOL: subscriptionActive },
        ':updatedAt': { S: now },
      },
    }),
  );

  return true;
}

export type DownloadAccessReason =
  | 'SUBSCRIPTION_ACTIVE'
  | 'SUBSCRIPTION_INACTIVE'
  | 'TRIAL_ACTIVE'
  | 'TRIAL_NOT_STARTED'
  | 'TRIAL_LIMIT_REACHED'
  | 'TRIAL_EXPIRED'
  | 'USER_NOT_FOUND';

export interface DownloadAccessResult {
  allowed: boolean;
  reason: DownloadAccessReason;
  subscriptionActive: boolean;
  counted: boolean;
  trial: UserTrialStatus;
}

function buildMissingUserTrialStatus(): UserTrialStatus {
  const limit = getConfiguredTrialDownloadLimit();
  return {
    status: 'NOT_STARTED',
    available: true,
    downloadLimit: limit,
    downloadsUsed: 0,
    downloadsRemaining: limit,
  };
}

function mapBlockedTrialReason(status: TrialStatus): DownloadAccessReason {
  if (status === 'LIMIT_REACHED') return 'TRIAL_LIMIT_REACHED';
  if (status === 'EXPIRED') return 'TRIAL_EXPIRED';
  return 'TRIAL_NOT_STARTED';
}

function toDownloadAccessResultFromRecord(
  record: UserRecordSnapshot,
): DownloadAccessResult {
  const trial = toTrialStatus(record);
  if (record.subscriptionActive) {
    return {
      allowed: true,
      reason: 'SUBSCRIPTION_ACTIVE',
      subscriptionActive: true,
      counted: false,
      trial,
    };
  }

  if (record.subscriptionId && trial.status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: 'SUBSCRIPTION_INACTIVE',
      subscriptionActive: false,
      counted: false,
      trial,
    };
  }

  if (trial.status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: mapBlockedTrialReason(trial.status),
      subscriptionActive: false,
      counted: false,
      trial,
    };
  }

  return {
    allowed: true,
    reason: 'TRIAL_ACTIVE',
    subscriptionActive: false,
    counted: false,
    trial,
  };
}

export async function getDownloadAccessByEmail(
  email: string,
): Promise<DownloadAccessResult> {
  const user = await getUserRecordByEmail(email);
  if (!user) {
    return {
      allowed: false,
      reason: 'USER_NOT_FOUND',
      subscriptionActive: false,
      counted: false,
      trial: buildMissingUserTrialStatus(),
    };
  }
  return toDownloadAccessResultFromRecord(user);
}

export async function consumeTrialDownloadByEmail(
  email: string,
  designId: number,
): Promise<DownloadAccessResult> {
  const user = await getUserRecordByEmail(email);
  if (!user) {
    return {
      allowed: false,
      reason: 'USER_NOT_FOUND',
      subscriptionActive: false,
      counted: false,
      trial: buildMissingUserTrialStatus(),
    };
  }

  if (user.subscriptionActive) {
    return {
      allowed: true,
      reason: 'SUBSCRIPTION_ACTIVE',
      subscriptionActive: true,
      counted: false,
      trial: toTrialStatus(user),
    };
  }

  const trial = toTrialStatus(user);
  if (user.subscriptionId && trial.status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: 'SUBSCRIPTION_INACTIVE',
      subscriptionActive: false,
      counted: false,
      trial,
    };
  }

  if (trial.status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: mapBlockedTrialReason(trial.status),
      subscriptionActive: false,
      counted: false,
      trial,
    };
  }

  const designToken = String(designId);
  if (user.trialDownloadedDesignIds.has(designToken)) {
    return {
      allowed: true,
      reason: 'TRIAL_ACTIVE',
      subscriptionActive: false,
      counted: false,
      trial,
    };
  }

  try {
    const limitCondition = isTrialDownloadLimitEnabled()
      ? ' AND (attribute_not_exists(TrialDownloadsUsed) OR TrialDownloadsUsed < :limit)'
      : '';

    await client.send(
      new UpdateItemCommand({
        TableName: USERS_TABLE_NAME,
        Key: { ID: { S: user.id } },
        UpdateExpression:
          'SET TrialDownloadsUsed = if_not_exists(TrialDownloadsUsed, :zero) + :inc, TrialDownloadLimit = if_not_exists(TrialDownloadLimit, :limit) ADD TrialDownloadedDesignIds :designSet',
        ConditionExpression:
          `attribute_exists(ID) AND attribute_exists(TrialStartedAt) AND TrialEndsAt >= :now${limitCondition} AND (attribute_not_exists(TrialDownloadedDesignIds) OR NOT contains(TrialDownloadedDesignIds, :designToken))`,
        ExpressionAttributeValues: {
          ':zero': { N: '0' },
          ':inc': { N: '1' },
          ':limit': { N: String(user.trialDownloadLimit) },
          ':designSet': { SS: [designToken] },
          ':designToken': { S: designToken },
          ':now': { S: new Date().toISOString() },
        },
      }),
    );

    const updatedRecord: UserRecordSnapshot = {
      ...user,
      trialDownloadsUsed: user.trialDownloadsUsed + 1,
      trialDownloadedDesignIds: new Set([
        ...Array.from(user.trialDownloadedDesignIds),
        designToken,
      ]),
    };

    return {
      allowed: true,
      reason: 'TRIAL_ACTIVE',
      subscriptionActive: false,
      counted: true,
      trial: toTrialStatus(updatedRecord),
    };
  } catch (error) {
    if (!isConditionalCheckFailure(error)) {
      throw error;
    }

    const refreshed = await getUserRecordByEmail(email);
    if (!refreshed) {
      return {
        allowed: false,
        reason: 'USER_NOT_FOUND',
        subscriptionActive: false,
        counted: false,
        trial: buildMissingUserTrialStatus(),
      };
    }

    const fallback = toDownloadAccessResultFromRecord(refreshed);
    if (fallback.allowed && fallback.reason === 'TRIAL_ACTIVE') {
      return {
        ...fallback,
        counted: false,
      };
    }

    return fallback;
  }
}

async function findUserByUnsubscribeToken(
  tableName: string,
  token: string,
  entityType?: string,
): Promise<Record<string, AttributeValue> | null> {
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;

  do {
    const expressionNames: Record<string, string> = {
      '#token': 'UnsubscribeToken',
    };
    const expressionValues: Record<string, AttributeValue> = {
      ':token': { S: token },
    };
    let filterExpression = '#token = :token';

    if (entityType) {
      expressionNames['#entityType'] = 'EntityType';
      expressionValues[':entityType'] = { S: entityType };
      filterExpression += ' AND #entityType = :entityType';
    }

    const scanParams: ScanCommandInput = {
      TableName: tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
      ProjectionExpression: 'ID, Email, Unsubscribed',
      Limit: 100,
    };

    if (lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    const { Items, LastEvaluatedKey } = await client.send(
      new ScanCommand(scanParams),
    );
    const match = Items?.find((item) => item?.ID?.S);
    if (match) {
      return match;
    }
    lastEvaluatedKey = LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return null;
}

/**
 * Marks a user as unsubscribed based on their unique unsubscribe token.
 * Scans CrossStitchUsers for the token, then flips Unsubscribed to true.
 */
export async function unsubscribeUserByToken(
  token: string,
): Promise<UnsubscribeResult> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return { status: 'not-found' };
  }

  const tables: Array<{ name: string; entityType?: string }> = [];
  if (USERS_TABLE_NAME) {
    tables.push({ name: USERS_TABLE_NAME });
  }
  if (PRIMARY_TABLE_NAME && PRIMARY_TABLE_NAME !== USERS_TABLE_NAME) {
    tables.push({ name: PRIMARY_TABLE_NAME, entityType: 'USER' });
  }

  for (const table of tables) {
    const user = await findUserByUnsubscribeToken(
      table.name,
      trimmedToken,
      table.entityType,
    );
    const userId = user?.ID?.S;
    if (!user || !userId) {
      continue;
    }

    const alreadyUnsubscribed = user.Unsubscribed?.BOOL === true;

    if (!alreadyUnsubscribed) {
      const updateParams: UpdateItemCommandInput = {
        TableName: table.name,
        Key: { ID: { S: userId } },
        UpdateExpression: 'SET #unsub = :true',
        ExpressionAttributeNames: {
          '#unsub': 'Unsubscribed',
        },
        ExpressionAttributeValues: {
          ':true': { BOOL: true },
        },
      };

      await client.send(new UpdateItemCommand(updateParams));
    }

    return {
      status: alreadyUnsubscribed
        ? 'already-unsubscribed'
        : 'updated',
      email: user.Email?.S,
    };
  }

  return { status: 'not-found' };
}
