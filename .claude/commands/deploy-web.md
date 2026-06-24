# Deploy web app to Elastic Beanstalk

Build the Next.js app, deploy to Elastic Beanstalk, then check environment status.

## Steps

1. **Kill dev server** — stop any running `next dev` process before building. A running dev server contaminates webpack module IDs in the production build, causing homepage 500 errors. On Windows, kill by port: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue`. Confirm port 3000 is no longer listening before continuing. If it still shows LISTENING, do not proceed until it's gone.

2. **Clean** — delete the `web/.next/` directory to avoid stale or mixed artifacts from any running dev server.

3. **Build** — run `npm run build` from the `web/` directory. Wait for it to complete. If the build fails, stop and report the error.

3b. **Verify production manifest** — open `web/.next/build-manifest.json` and confirm `lowPriorityFiles` references a hashed path like `static/<hash>/`, NOT `static/development/`. A `static/development/` path means `next dev` contaminated the manifest after the build — delete `.next/`, ensure no dev server is running, and rebuild.

4. **Local smoke test** — first kill anything listening on port 3001 (a stale server there will silently serve the old build and mask failures). Then run `npm start -- -p 3001` from the `web/` directory in the background, wait 8 seconds for startup. Confirm the server actually started by checking port 3001 is now listening. Curl `/`, `/albums`, and a design page (e.g. `/designs/4217`) — all must return HTTP 200. Also verify the `buildId` in the JSON of the `/` response matches the contents of `web/.next/BUILD_ID` (a mismatch means you're hitting an old server). If any route returns 500 or the buildId doesn't match, stop and debug before deploying — do not proceed. Kill the test server after the check.

4b. **Re-verify manifest before deploying** — open `web/.next/build-manifest.json` again and confirm `lowPriorityFiles` still references a hashed path, not `static/development/`. `next dev` can be started by the user at any time and will contaminate the manifest. If it's been contaminated, rebuild from step 1.

5. **Deploy** — run `eb deploy cross-stitch-com-env-clone` from the `web/` directory. Wait for it to complete. If it fails, stop and report the error.

6. **Check status** — run `eb status cross-stitch-com-env-clone` from the `web/` directory and report the Health field. If Health is not Green, fetch `eb logs cross-stitch-com-env-clone`, show the cause, and suggest next steps.
