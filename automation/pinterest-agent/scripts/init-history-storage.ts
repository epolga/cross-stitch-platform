/**
 * One-shot initializer for the Milestone 5 historical-memory layer.
 *
 * Creates:
 *   - DynamoDB table CrossStitchBusinessHistory (PAY_PER_REQUEST, deletion protection, PITR)
 *   - S3 bucket cross-stitch-ai-reports (SSE-S3, block all public access)
 *
 * Idempotent: detects existing resources and skips creation. Safe to re-run.
 *
 * Requires admin AWS credentials (e.g. claude-dev). The pinterest-agent role
 * does NOT have CreateTable / CreateBucket permissions. Pass admin creds via
 * env so they override the .env file:
 *
 *   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... npm run init
 *
 * Not part of daily-run.bat.
 *
 * Schema reference: plan/integration/business-history-schema.md
 */
// No dotenv: this script must NOT pick up pinterest-agent's read-only .env creds.
// Credentials come from AWS_PROFILE or AWS_ACCESS_KEY_ID env vars in the parent shell.
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateContinuousBackupsCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutPublicAccessBlockCommand,
  PutBucketEncryptionCommand,
} from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE = process.env.HISTORY_TABLE_NAME || "CrossStitchBusinessHistory";
const BUCKET = process.env.AI_ARTIFACT_BUCKET || "cross-stitch-ai-reports";

if (REGION !== "us-east-1") {
  console.error(
    `Schema doc commits to us-east-1; got AWS_REGION=${REGION}. Adjust the schema doc before running this in another region.`
  );
  process.exit(1);
}

const hasEnvCreds =
  !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
const hasProfile = !!process.env.AWS_PROFILE;
if (!hasEnvCreds && !hasProfile) {
  console.error(
    "No AWS credentials. Set AWS_PROFILE=<name> or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY. Needs admin perms (CreateTable + CreateBucket), not pinterest-agent's read-only role."
  );
  process.exit(1);
}
if (hasProfile) {
  console.log(`auth:   AWS_PROFILE=${process.env.AWS_PROFILE}`);
  // System- or User-scope AWS_ACCESS_KEY_ID env vars (set in Windows env) otherwise
  // collide with the profile and produce a "Multiple credential sources detected" SDK warning.
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_SESSION_TOKEN;
}

const ddb = new DynamoDBClient({ region: REGION });
const s3 = new S3Client({ region: REGION });

async function ensureTable() {
  console.log(`\n--- DynamoDB table ${TABLE} (${REGION}) ---`);

  let needsCreate = false;
  try {
    const desc = await ddb.send(new DescribeTableCommand({ TableName: TABLE }));
    console.log(`  exists, status: ${desc.Table?.TableStatus}`);
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
    needsCreate = true;
  }

  if (needsCreate) {
    console.log("  not found, creating");
    await ddb.send(
      new CreateTableCommand({
        TableName: TABLE,
        AttributeDefinitions: [
          { AttributeName: "EntityType", AttributeType: "S" },
          { AttributeName: "SortKey", AttributeType: "S" },
        ],
        KeySchema: [
          { AttributeName: "EntityType", KeyType: "HASH" },
          { AttributeName: "SortKey", KeyType: "RANGE" },
        ],
        BillingMode: "PAY_PER_REQUEST",
        DeletionProtectionEnabled: true,
      })
    );

    process.stdout.write("  waiting for ACTIVE");
    while (true) {
      await new Promise((r) => setTimeout(r, 2000));
      const d = await ddb.send(new DescribeTableCommand({ TableName: TABLE }));
      process.stdout.write(".");
      if (d.Table?.TableStatus === "ACTIVE") {
        process.stdout.write(" done\n");
        break;
      }
    }
  }

  console.log("  enabling PITR (idempotent)");
  await ddb.send(
    new UpdateContinuousBackupsCommand({
      TableName: TABLE,
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    })
  );
}

async function ensureBucket() {
  console.log(`\n--- S3 bucket ${BUCKET} (${REGION}) ---`);

  let exists = false;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    exists = true;
    console.log("  exists");
  } catch (err) {
    const e = err as { $metadata?: { httpStatusCode?: number }; name?: string };
    const code = e?.$metadata?.httpStatusCode;
    if (code === 404 || e?.name === "NotFound") {
      // not found, fall through to create
    } else {
      throw err;
    }
  }

  if (!exists) {
    console.log("  not found, creating");
    // us-east-1 must omit CreateBucketConfiguration (it's the default region).
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }

  console.log("  applying block-public-access (idempotent)");
  await s3.send(
    new PutPublicAccessBlockCommand({
      Bucket: BUCKET,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        IgnorePublicAcls: true,
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      },
    })
  );

  console.log("  applying SSE-S3 encryption (idempotent)");
  await s3.send(
    new PutBucketEncryptionCommand({
      Bucket: BUCKET,
      ServerSideEncryptionConfiguration: {
        Rules: [
          {
            ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" },
            BucketKeyEnabled: true,
          },
        ],
      },
    })
  );
}

async function main() {
  console.log("=== init-history-storage ===");
  console.log(`region: ${REGION}`);
  console.log(`table:  ${TABLE}`);
  console.log(`bucket: ${BUCKET}`);

  await ensureTable();
  await ensureBucket();

  console.log("\nAll resources ready.\n");
}

main().catch((err) => {
  const e = err as { message?: string; $metadata?: { httpStatusCode?: number } };
  console.error("\nError:", e?.message || err);
  if (e?.$metadata?.httpStatusCode) {
    console.error("HTTP", e.$metadata.httpStatusCode);
  }
  process.exit(1);
});
