/**
 * One-shot IAM setup for Milestone 8: grant the pinterest-agent IAM user
 * permission to send email via SES using the existing Uploader-verified
 * sender identity (ann@cross-stitch.com / cross-stitch.com domain).
 *
 * Creates:
 *   - Customer-managed policy `CrossStitch-SES-Send` (ses:SendEmail +
 *     ses:SendRawEmail scoped to the two identity ARNs)
 *   - Attaches it to the `CrossStitch-Agents` group (so pinterest-agent
 *     inherits, per the project's never-attach-to-users rule).
 *
 * Idempotent: detects existing policy + existing attachment and skips.
 *
 * Requires admin AWS credentials (claude-dev). Run as:
 *   AWS_PROFILE=claude-dev npm run setup-ses-iam
 * or
 *   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... npx tsx scripts/setup-ses-iam.ts
 *
 * Not part of daily-run.bat.
 */
// No dotenv: must NOT pick up pinterest-agent's read-only .env creds.
import {
  IAMClient,
  CreatePolicyCommand,
  AttachGroupPolicyCommand,
  ListAttachedGroupPoliciesCommand,
  GetPolicyCommand,
} from "@aws-sdk/client-iam";

const ACCOUNT_ID = "358174257684";
const REGION = process.env.AWS_REGION || "us-east-1";
const POLICY_NAME = "CrossStitch-SES-Send";
const GROUP_NAME = "CrossStitch-Agents";
const POLICY_ARN = `arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}`;

const POLICY_DOCUMENT = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "SendFromVerifiedCrossStitchIdentity",
      Effect: "Allow",
      Action: ["ses:SendEmail", "ses:SendRawEmail"],
      Resource: [
        `arn:aws:ses:${REGION}:${ACCOUNT_ID}:identity/cross-stitch.com`,
        `arn:aws:ses:${REGION}:${ACCOUNT_ID}:identity/ann@cross-stitch.com`,
      ],
    },
  ],
};

const hasEnvCreds =
  !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
const hasProfile = !!process.env.AWS_PROFILE;
if (!hasEnvCreds && !hasProfile) {
  console.error(
    "No AWS credentials. Set AWS_PROFILE=claude-dev or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (admin creds needed for IAM:CreatePolicy + IAM:AttachGroupPolicy)."
  );
  process.exit(1);
}
if (hasProfile) {
  console.log(`auth: AWS_PROFILE=${process.env.AWS_PROFILE}`);
  // Clear User-scope env vars that otherwise collide with the profile.
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_SESSION_TOKEN;
}

const iam = new IAMClient({ region: REGION });

async function ensurePolicy(): Promise<void> {
  console.log(`\n--- IAM policy ${POLICY_NAME} ---`);
  try {
    await iam.send(new GetPolicyCommand({ PolicyArn: POLICY_ARN }));
    console.log("  exists, skipping create");
    return;
  } catch (err) {
    const e = err as { name?: string };
    if (e?.name !== "NoSuchEntityException") throw err;
  }

  console.log("  not found, creating");
  await iam.send(
    new CreatePolicyCommand({
      PolicyName: POLICY_NAME,
      Description: "Allow pinterest-agent automation to send email via SES using the cross-stitch.com verified identity.",
      PolicyDocument: JSON.stringify(POLICY_DOCUMENT),
    })
  );
  console.log("  created");
}

async function ensureAttachment(): Promise<void> {
  console.log(`\n--- Attach ${POLICY_NAME} to group ${GROUP_NAME} ---`);
  const attached = await iam.send(
    new ListAttachedGroupPoliciesCommand({ GroupName: GROUP_NAME })
  );
  if (attached.AttachedPolicies?.some((p) => p.PolicyArn === POLICY_ARN)) {
    console.log("  already attached, skipping");
    return;
  }

  await iam.send(
    new AttachGroupPolicyCommand({ GroupName: GROUP_NAME, PolicyArn: POLICY_ARN })
  );
  console.log("  attached");
}

async function main() {
  console.log("=== setup-ses-iam ===");
  console.log(`account: ${ACCOUNT_ID}`);
  console.log(`region:  ${REGION}`);
  console.log(`policy:  ${POLICY_NAME}`);
  console.log(`group:   ${GROUP_NAME}`);

  await ensurePolicy();
  await ensureAttachment();

  console.log("\nAll IAM resources ready. pinterest-agent can now ses:SendEmail.\n");
}

main().catch((err) => {
  const e = err as { message?: string; $metadata?: { httpStatusCode?: number } };
  console.error("\nError:", e?.message || err);
  if (e?.$metadata?.httpStatusCode) console.error("HTTP", e.$metadata.httpStatusCode);
  process.exit(1);
});
