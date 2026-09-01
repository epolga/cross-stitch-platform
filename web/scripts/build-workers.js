// Bundles the worker-thread entry points (workers-src/*.ts) into plain,
// standalone CommonJS files under workers/*.js that Piscina can load
// directly with a real filesystem path - these can't go through Next's
// own route-bundling pipeline. All npm dependencies (sharp, pdf-lib,
// @napi-rs/canvas, etc.) are left external so they resolve normally from
// node_modules at runtime - only our own src/lib files get bundled in.
const esbuild = require("esbuild");
const path = require("path");

const entries = ["convert-worker", "pdf-worker"];

async function main() {
  for (const name of entries) {
    await esbuild.build({
      entryPoints: [path.join(__dirname, "..", "workers-src", `${name}.ts`)],
      outfile: path.join(__dirname, "..", "workers", `${name}.js`),
      bundle: true,
      platform: "node",
      target: "node22",
      format: "cjs",
      packages: "external",
      logLevel: "info",
    });
  }
  console.log(`Built ${entries.length} worker bundle(s) into web/workers/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
