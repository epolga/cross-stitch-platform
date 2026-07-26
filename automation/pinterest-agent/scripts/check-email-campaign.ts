// CLI: npx tsx scripts/check-email-campaign.ts <eid> [<eid2> ...]
// Reports send + entry stats for one or more newsletter campaigns, joining:
//   - EmailSendLog (PK=eid, SK=email): who was actually sent this campaign,
//     with SES MessageId (written by UploaderCli's SendNewsletterAsync)
//   - EmailEntryEvents (PK=eid, SK=cid): who actually clicked into the site
//     from this campaign's link
// Since EmailSendLog is keyed by email and EmailEntryEvents by cid, the join
// is by cid: EmailSendLog rows carry cid when the recipient had one at send
// time (recipient.Cid, may be absent for legacy/no-cid users).
import "dotenv/config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const SEND_LOG_TABLE = process.env.DDB_EMAIL_SEND_LOG_TABLE ?? "EmailSendLog";
const ENTRY_TABLE = process.env.DDB_EMAIL_ENTRY_EVENTS_TABLE ?? "EmailEntryEvents";

async function queryByEid(client: DynamoDBDocumentClient, table: string, eid: string) {
  let items: any[] = [];
  let ExclusiveStartKey: any;
  try {
    do {
      const resp = await client.send(new QueryCommand({
        TableName: table,
        KeyConditionExpression: "eid = :eid",
        ExpressionAttributeValues: { ":eid": eid },
        ExclusiveStartKey,
      }));
      items = items.concat(resp.Items ?? []);
      ExclusiveStartKey = resp.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  } catch (e: any) {
    if (e.name === "ResourceNotFoundException") {
      console.log(`(table ${table} doesn't exist yet — self-provisions/created on first real write)`);
      return [];
    }
    throw e;
  }
  return items;
}

async function main() {
  const eids = process.argv.slice(2);
  if (eids.length === 0) {
    console.error("Usage: npx tsx scripts/check-email-campaign.ts <eid> [<eid2> ...]");
    process.exit(1);
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  for (const eid of eids) {
    const [sent, entered] = await Promise.all([
      queryByEid(client, SEND_LOG_TABLE, eid),
      queryByEid(client, ENTRY_TABLE, eid),
    ]);

    const enteredByCid = new Map(entered.map((e) => [e.cid, e]));
    const sentWithCid = sent.filter((s) => s.cid);
    const engaged = sentWithCid.filter((s) => enteredByCid.has(s.cid));

    console.log(`\n=== Campaign eid=${eid} ===`);
    console.log(`Sent: ${sent.length} (${sentWithCid.length} with a cid, ${sent.length - sentWithCid.length} without)`);
    console.log(`Unique entries (clicked): ${entered.length}`);
    console.log(`Sent-with-cid who entered: ${engaged.length}/${sentWithCid.length}`);

    const neverEntered = sentWithCid.filter((s) => !enteredByCid.has(s.cid));
    if (neverEntered.length) {
      console.log(`\nSent but never entered (${neverEntered.length}):`);
      for (const s of neverEntered.sort((a, b) => a.email.localeCompare(b.email))) {
        console.log(`  ${s.email}  messageId=${s.messageId ?? "-"}`);
      }
    }
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
