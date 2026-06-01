import { pinterestGet } from "../src/services/pinterestClient";

async function main() {
  console.log("=== Ad Accounts (ads:read) ===");
  const ads = await pinterestGet<{ items: { id: string; name: string }[] }>("/ad_accounts");
  for (const a of ads.items) {
    console.log(`  ${a.id} - ${a.name}`);
  }

  console.log("\n=== Boards (boards:read) ===");
  const boards = await pinterestGet<{ items: { id: string; name: string }[] }>("/boards");
  console.log(`  Found ${boards.items.length} boards`);
  for (const b of boards.items.slice(0, 5)) {
    console.log(`  ${b.id} - ${b.name}`);
  }
  if (boards.items.length > 5) console.log(`  ... and ${boards.items.length - 5} more`);

  console.log("\n=== Pins (pins:read) ===");
  const pins = await pinterestGet<{ items: { id: string; title?: string }[] }>("/pins");
  console.log(`  Found ${pins.items.length} pins`);
  for (const p of pins.items.slice(0, 3)) {
    console.log(`  ${p.id} - ${p.title || "(no title)"}`);
  }
  if (pins.items.length > 3) console.log(`  ... and ${pins.items.length - 3} more`);

  console.log("\n✓ All scopes verified (ads:read, boards:read, pins:read)");
}

main().catch(console.error);
