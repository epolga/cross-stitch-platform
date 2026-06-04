import "dotenv/config";
import { getGA4LandingPageStats } from "../src/services/googleAnalytics";
import { batchPutLandingPageStats } from "../src/services/historyStore";
import { formatDate, yesterdayDate } from "../src/services/dateUtils";

export async function run(dateStr?: string): Promise<void> {
  const date = dateStr ?? formatDate(yesterdayDate());
  const pages = await getGA4LandingPageStats(date);

  if (!pages.length) {
    console.log(`  no Pinterest landing page data for ${date}`);
    return;
  }

  await batchPutLandingPageStats(pages.map((p) => ({ date, ...p })));

  const total = pages.reduce((s, p) => s + p.paidSessions + p.organicSessions + p.referralSessions, 0);
  console.log(`  ${pages.length} landing pages, ${total} total Pinterest sessions`);
  for (const p of pages.slice(0, 10)) {
    const t = p.paidSessions + p.organicSessions + p.referralSessions;
    console.log(`    ${String(t).padStart(3)}s (paid:${p.paidSessions} org:${p.organicSessions})  ${p.page}`);
  }
}

if (!process.env.AWS_LAMBDA_FUNCTION_NAME) run().catch(console.error);
