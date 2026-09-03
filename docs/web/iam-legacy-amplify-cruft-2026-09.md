# Legacy IAM cruft from the pre-EB Amplify hosting era

2026-09-02. Found while auditing the DynamoDB IAM allowlist (see
`gsc-indexing-investigation-2026-08.md`-style audits and Focus.md Open item
#30's `SubscriptionEvents` fix). Olga asked whether there are other legacy
policies still in use, after `AmplifyCrossStitchPolicy` turned out to still
matter for `CrossStitchItems` access. Audited the full account policy list
(`aws iam list-policies --scope Local`) and checked attachment status +
`RoleLastUsed` for everything Amplify-flavored or zero-attachment.

**Nothing has been deleted.** This is a documentation-only pass — any
deletion is a separate, explicit ask, same rule as any other sensitive AWS
action.

## Confirmed dead (evidence-backed, not deleted yet)

- **`AmplifyCrossStitchRole`** — last used 2025-04-30. Still assumable from
  the live `aws-elasticbeanstalk-ec2-role` via
  `AllowAssumeAmplifyCrossStitchRolePolicy` (also attached to the live
  role) — grants `AmazonDynamoDBFullAccess` + `AdministratorAccess-Amplify`
  if ever assumed. Vestigial, real (if low-probability) excess privilege on
  the live production role.
- **`PublicDynamoDBReadPolicy`** (broad DynamoDB *read*, `Resource: "*"` —
  name is misleading, not internet-public) — attached to
  `AmplifyCrossStitchRole` (dead, above) and to
  `amplify-login-lambda-38d47e4f`'s role — confirmed that Lambda function
  itself no longer exists (`aws lambda get-function` →
  `ResourceNotFoundException`), so this second attachment is fully
  orphaned.
- **8× `AmplifySSRLoggingRole-<uuid>`** + matching
  `AmplifySSRLoggingPolicy-<uuid>` — one per old Amplify SSR compute
  deployment. All 8 last used in a single week, 2025-04-15 to 2025-04-23;
  one (`54c6423c-...`) has `RoleLastUsed: null` — never used at all.
- **`CrossStitchApiEC2Role`** + **`CrossStitchApiPolicy`** — last used
  2025-05-02.
- **`RDSBackupRestoreRole`** + **`RDSAccessToS3ForBackupRestore`** — last
  used 2025-03-04, an hour after creation. No RDS instance exists in the
  account at all (`aws rds describe-db-instances` → empty) — fully
  obsolete, not just idle.
- **`S3CrossStitchPolicy`**, **`CrossStitchApiPolicyV2`** — zero
  attachments, attached to nothing.

## Not individually checked, probably current/fine

Newer `CrossStitch-<Table>-<Verb>` naming, recent 2026-05 update dates,
consistent with the automation/pinterest-agent Lambda infra that's actively
maintained:

`CrossStitch-Likes-RW`, `CrossStitch-SES-Send`,
`CrossStitch-SitemapCache-RW`, `CrossStitch-DynamoDB-ReadOnly`,
`CrossStitch-BusinessHistory-Admin`, `CrossStitch-BusinessHistory-Write`,
`CrossStitch-AIReports-Write`, `CrossStitch-CoreTables-FullAccess`,
`CloudWatchPolicy` (known-active, WAF-related per
`project_waf_bot_control` memory).

Several `AWSLambdaBasicExecutionRole-<uuid>` policies (one per Lambda
function, auto-generated) also weren't individually verified against
still-existing functions — lower priority, standard/expected pattern, not
part of the Amplify-legacy signal specifically.

## Not yet done

Decide whether to actually delete the confirmed-dead roles/policies above
(a real IAM deletion — needs Olga's explicit go-ahead, same rule as any
other sensitive AWS action), or at minimum detach
`AllowAssumeAmplifyCrossStitchRolePolicy` from the live EB role so it can
no longer assume the over-privileged dead `AmplifyCrossStitchRole` even
vestigially.
