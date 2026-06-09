// Lambda entry point — runs the full daily pipeline.
// Equivalent to daily-run.bat but runs in AWS Lambda.
// All environment variables must be set in the Lambda configuration (see env-vars.md).
// REPORTS_DIR is set to /tmp automatically below so transient files go to Lambda's writable storage.

import "dotenv/config"; // no-op in Lambda; env vars come from Lambda configuration

// Set REPORTS_DIR to /tmp before any script imports touch it
process.env.REPORTS_DIR = "/tmp";

import { run as runDailyReport } from "../scripts/daily-business-report";
import { run as runBuildHistory } from "../scripts/build-business-history";
import { run as runPromotedAds } from "../scripts/build-promoted-ads-report";
import { run as runLandingPages } from "../scripts/build-landing-page-report";
import { run as runPinAttribution } from "../scripts/build-pin-attribution-report";
import { run as runPinMap } from "../scripts/export-design-pin-map";
import { run as runPerf } from "../scripts/build-design-performance";
import { run as runAiTrend } from "../scripts/test-ai-trend-analysis";
import { run as runAiDesign } from "../scripts/test-ai-design-analysis";
import { runAnomalyDetection } from "../src/services/anomalyDetector";
import { notifyAnomalies } from "../src/services/anomalyNotifier";
import { notifyRecommendationChange } from "../src/services/recommendationChangeNotifier";
import { sendDailySummary } from "../src/services/dailySummary";
import { sendGoogleTokenReminderIfDue } from "../src/services/googleTokenReminder";
import { formatDate, yesterdayDate } from "../src/services/dateUtils";

export interface PipelineEvent {
  date?: string; // override reporting date (YYYY-MM-DD); defaults to yesterday
}

export const handler = async (event: PipelineEvent = {}): Promise<void> => {
  const dateStr = event.date ?? formatDate(yesterdayDate());
  console.log(`[pipeline] starting for date=${dateStr}`);

  console.log("[1/13] daily business report");
  await runDailyReport(dateStr);

  console.log("[2/13] build business history");
  await runBuildHistory("/tmp");

  console.log("[3/13] promoted ads report");
  await runPromotedAds(dateStr);

  console.log("[4/13] landing page report");
  await runLandingPages(dateStr);

  console.log("[5/13] pin attribution");
  await runPinAttribution(dateStr);

  console.log("[6/13] anomaly detection");
  const anomalyResult = await runAnomalyDetection();
  if (!anomalyResult.checked) {
    console.log(`  skipped: ${anomalyResult.reason}`);
  } else {
    console.log(`  checked ${anomalyResult.forDate}, ${anomalyResult.anomalies.length} anomaly(s)`);
  }

  console.log("[7/13] anomaly notifications");
  const notifyResult = await notifyAnomalies();
  if (notifyResult.unnotifiedFound === 0) {
    console.log("  no unnotified anomalies");
  } else {
    console.log(`  sent email for ${notifyResult.unnotifiedFound} anomaly(s)`);
  }

  console.log("[8/13] AI trend analysis");
  await runAiTrend("/tmp");

  console.log("[9/13] recommendation change alert");
  const changeResult = await notifyRecommendationChange();
  if (changeResult.sent) {
    console.log(`  recommendation changed: ${changeResult.from} → ${changeResult.to}`);
  } else {
    console.log("  no recommendation change");
  }

  // Send email before the slow design-analysis steps (10-12) so a timeout there
  // doesn't prevent the daily report from going out.
  console.log("[10/13] daily summary email");
  const { messageId, date } = await sendDailySummary();
  console.log(`  sent → SES MessageId=${messageId} (date=${date})`);

  const tokenReminderSent = await sendGoogleTokenReminderIfDue();
  if (tokenReminderSent) console.log("  Google token refresh reminder sent via Telegram");

  // Steps 11-13 (design pin map, design performance, AI design analysis) are
  // disabled — output is not surfaced anywhere yet. Re-enable when the email
  // or a separate report includes the design analysis. See Milestones doc.
  // console.log("[11/13] design pin map export");
  // await runPinMap();
  // console.log("[12/13] design performance build");
  // await runPerf();
  // console.log("[13/13] AI design analysis");
  // await runAiDesign();

  console.log(`[pipeline] complete for date=${dateStr}`);
};
