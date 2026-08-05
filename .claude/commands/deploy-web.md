# Deploy web app to Elastic Beanstalk

Build the Next.js app, deploy to Elastic Beanstalk, then check environment status.

## Steps

0. **Check CI status after every push, before building.** After pushing the commit being deployed, run `gh run list --branch main --limit 1` and confirm the run's `headSha` matches the pushed commit and its status is `completed`/`success` — poll (`sleep`-and-recheck) until it finishes if it's still `in_progress`. **Do not proceed to build/deploy on an unverified or failing commit** — stop and report the failure instead. This is a hard rule, not a suggestion: local build/typecheck passing is not sufficient on its own (see the 2026-08-04 incident where local `npm run build` missed an ESLint error CI caught) — CI is the actual gate.

1. **Kill dev server** — stop any running `next dev` process before building. A running dev server contaminates webpack module IDs in the production build, causing homepage 500 errors. On Windows, kill by port: `Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue`. Confirm port 3000 is no longer listening before continuing. If it still shows LISTENING, do not proceed until it's gone.

2. **Clean** — delete the `web/.next/` directory to avoid stale or mixed artifacts from any running dev server.

2a. **Remove stray/throwaway files before building.** `eb deploy` zips and uploads the entire local working directory as-is — not just git-committed state — so any untracked scratch file left on disk (e.g. a one-off diagnostic script in `web/scripts/`) gets deployed too, and if it has a type error or other build-breaking issue, the server-side build fails, `next start` finds no valid `.next` output, and the whole app 502s (this has happened for real — see `docs/session-log/2026-08.md`, 2026-08-03 incident). Run `git status --short` in `web/`; for any untracked file that was a temporary/diagnostic script (not a real deliverable), delete it now, before building. When in doubt about whether an untracked file is meant to stay, ask rather than deploy it or delete it silently.

2b. **Check static-page lastmod** — `web/src/app/sitemap.xml/route.ts` has a hand-maintained `STATIC_PAGE_LASTMOD` map (one date per static route with no DB row behind it, e.g. `/`, `/WhyCrossStitch`, `/exercises`). Check `git status`/`git diff` for changes to any of those routes' source files; if one changed, bump its date in `STATIC_PAGE_LASTMOD` to **today (this deploy's date)** before building — not the date the file was committed, since a commit can sit undeployed for a while and the deploy date is what actually matches when a crawler would see the new content. Otherwise the sitemap's `<lastmod>` for that page silently goes stale or wrong.

3. **Build** — run `npm run build` from the `web/` directory. Wait for it to complete. If the build fails, stop and report the error.

3b. **Verify production manifest** — open `web/.next/build-manifest.json` and confirm `lowPriorityFiles` references a hashed path like `static/<hash>/`, NOT `static/development/`. A `static/development/` path means `next dev` contaminated the manifest after the build — delete `.next/`, ensure no dev server is running, and rebuild.

4. **Local smoke test** — first kill anything listening on port 3001 (a stale server there will silently serve the old build and mask failures). Then run `npm start -- -p 3001` from the `web/` directory in the background, wait 8 seconds for startup. Confirm the server actually started by checking port 3001 is now listening. Curl `/`, `/albums`, and a design page (e.g. `/designs/4217`) — all must return HTTP 200. Also verify the `buildId` in the JSON of the `/` response matches the contents of `web/.next/BUILD_ID` (a mismatch means you're hitting an old server). If any route returns 500 or the buildId doesn't match, stop and debug before deploying — do not proceed. Kill the test server after the check.

4b. **Re-verify manifest before deploying** — open `web/.next/build-manifest.json` again and confirm `lowPriorityFiles` still references a hashed path, not `static/development/`. `next dev` can be started by the user at any time and will contaminate the manifest. If it's been contaminated, rebuild from step 1.

5. **Deploy** — run `eb deploy cross-stitch-com-env-clone` from the `web/` directory. Wait for it to complete. If it fails, stop and report the error.

6. **Check status** — run `eb status cross-stitch-com-env-clone` from the `web/` directory and report the Health field.

7. **If Health is not Green (or the site itself returns 5xx): roll back first, investigate second.** Before this deploy, note the currently-deployed version label from `eb status` (`Deployed Version:`) so it's available to roll back to. If the new deploy leaves the environment unhealthy or the live site down, immediately redeploy that prior version — `eb deploy cross-stitch-com-env-clone --version <prior-version-label>` — and confirm the site responds again (curl the homepage) before doing anything else. Only once service is restored should the actual cause be investigated (build logs, `eb logs`, CloudWatch) — don't leave production down while debugging. This is a hard rule, not just a suggestion: a live outage always gets rolled back before it gets diagnosed.
