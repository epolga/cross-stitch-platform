import "dotenv/config";
import { runAnomalyDetection, SIGMA_THRESHOLD } from "../src/services/anomalyDetector";

(async () => {
  console.log("=== Anomaly Detection ===");
  const result = await runAnomalyDetection();

  if (!result.checked) {
    console.log(`  Skipped: ${result.reason}`);
    console.log(`  Rows scanned: ${result.rowsScanned}, trailing window available: ${result.trailingSize}`);
    return;
  }

  console.log(`  Checked forDate=${result.forDate} vs trailing ${result.trailingSize} rows (threshold ${SIGMA_THRESHOLD}σ)`);

  if (result.anomalies.length === 0) {
    console.log("  No anomalies detected.");
    return;
  }

  console.log(`  ${result.anomalies.length} anomaly event(s) written:`);
  for (const a of result.anomalies) {
    console.log(
      `    ${a.metric}: observed=${a.observedValue.toFixed(4)}  mean=${a.expectedMean.toFixed(4)}  σ=${a.expectedSigma.toFixed(4)}  deviation=${a.deviationSigmas.toFixed(2)}σ ${a.direction}`
    );
  }
})().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
