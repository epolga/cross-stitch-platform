# Deploy web app to Elastic Beanstalk

Build the Next.js app, deploy to Elastic Beanstalk, then check environment status.

## Steps

1. **Clean** — delete the `web/.next/` directory to avoid stale or mixed artifacts from any running dev server.

2. **Build** — run `npm run build` from the `web/` directory. Wait for it to complete. If the build fails, stop and report the error.

3. **Deploy** — run `eb deploy cross-stitch-com-env-clone` from the `web/` directory. Wait for it to complete. If it fails, stop and report the error.

4. **Check status** — run `eb status cross-stitch-com-env-clone` from the `web/` directory and report the Health field. If Health is not Green, fetch `eb logs cross-stitch-com-env-clone`, show the cause, and suggest next steps.
