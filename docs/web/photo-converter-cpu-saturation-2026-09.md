# Photo-converter CPU saturation — investigation and fix options

**Status: acute failure mode fixed and deployed to production.** Option 1
(worker threads, `31670f4`, 2026-09-01) and Option 5 (CPU-based Auto
Scaling trigger, `8ef2099`/`c0a66d1`, 2026-09-01) are both live —
confirmed 2026-09-03: `web/next.config.js` has `piscina` wired into
`serverExternalPackages`, and `aws cloudwatch describe-alarms` shows the
`AWSEBCloudwatchAlarmHighCPU` alarm live with `Statistic=Maximum,
Threshold=65`. Production deploy `app-260902_201907185445`
(2026-09-02 17:23 UTC, Health Green) postdates both fix commits. Options 2
(concurrency limit), 3 (algorithmic cost reduction), and 4 (background
queue) remain undone — defense-in-depth/nice-to-have, not blockers, per
the "suggested order of attack" below. Started 2026-09-01 from Olga
noticing GA4 Realtime showing 0-1 active users when she normally sees
several at once. Item #29 is now archived in `Focus.md` (fixed and
deployed 2026-09-03) — this file is the durable detailed write-up (same
pattern as `docs/web/gsc-indexing-investigation-2026-08.md`).

## Update 2026-09-01: CPU-based scaling policy drafted and tested

Draft config: `web/.ebextensions/08_cpu_scaling.config` (not yet deployed
to `cross-stitch-com-env-clone`). Adds a second CloudWatch alarm +
Auto Scaling scaling policy alongside EB's existing default NetworkOut
trigger (option 5 below) — `CPUUtilization`, `Threshold: 65`, scale up by
+1 instance, 360s cooldown, `EvaluationPeriods: 1` (matches the existing
NetworkOut alarm's responsiveness).

**Validated twice in a disposable clone environment
(`cross-stitch-test-scaling`, created via `eb clone ... --exact`, torn
down immediately after each test — see the AWS-cost discussion earlier in
the 2026-09-01 conversation for why disposable-on-demand was chosen over a
persistent staging environment: an idle load-balanced EB environment costs
~$16/mo for the ALB alone, which can't be paused, only deleted):**

1. **Alarm → policy → ASG wiring**: forced the alarm into `ALARM` state via
   `aws cloudwatch set-alarm-state` on a 1-instance test environment.
   Confirmed via `describe-scaling-activities`: the policy fired and
   desired capacity went 1→2, new instance launched successfully. Plumbing
   works.
2. **Multi-instance dilution — caught a real bug in the first draft**: the
   first draft used `Statistic: Average` (copied from EB's own NetworkOut
   alarm convention) on the `AutoScalingGroupName`-dimensioned
   `CPUUtilization` metric. Tested on a 2-instance clone with a real CPU
   stress load (SSM `RunShellScript`, busy-loop across all cores) on only
   one of the two instances: loaded instance read ~99.7% avg, idle instance
   ~1.6% avg, but the **ASG-aggregate `Average` statistic came out to
   ~50.67%** — because it's an arithmetic mean across all instances in the
   group, a single fully-saturated instance gets diluted by however many
   *other* instances happen to be idle. At the real production desired
   capacity (2), this would have sat *below* the 65% threshold — the alarm
   would not have fired in exactly the one-instance-chokes scenario this
   whole investigation is about. **Fix: `Statistic: Maximum` instead of
   `Average`** — same test showed the ASG-aggregate `Maximum` read ~99.71%,
   exactly matching the single overloaded instance, undiluted by however
   many other instances are idle. `08_cpu_scaling.config` now uses
   `Maximum`. (This also means the original 65% threshold reasoning, which
   was based on single-instance CPU behavior during the real incident, is
   valid again under `Maximum` — the fix was the statistic, not the
   number.)

**Important limitation, found by Olga's own question 2026-09-01 — CPU
scaling is a backstop for *sustained* load, not a fix for a single
request:** the alarm evaluates on `Period: 300` (5 minutes) before it even
notices a spike, and a new instance then takes roughly another 1-3 minutes
to launch and pass the target group's health check (`HealthyThresholdCount:
3` × `HealthCheckIntervalSeconds: 15` ≈ 45s, plus instance boot). Total
reactive latency is on the order of **5-7 minutes** from "CPU starts
spiking" to "a new instance is actually serving traffic." A single
conversion request only blocks its instance for seconds to tens of
seconds (per the ALB log evidence) — that episode is almost always over
before the alarm has even finished its first evaluation period, let alone
before a new instance arrives. **Scale-out cannot rescue anyone from one
isolated blocking request; reactive infra-level scaling is structurally
too slow for that.** It only helps when CPU pressure is *sustained* over
many minutes (many overlapping conversions back to back) — which does
match the real 2026-08-31 incident's shape (health flapped
Ok→Warning→Severe repeatedly across roughly an hour, not once), but is not
a general substitute for fixing the blocking behavior itself. **Options 1
(worker threads) and 2 (concurrency limit) act immediately, in-process,
and are the real fix for the acute single-request case; the CPU-based
scaling policy here should be treated as a secondary backstop for
sustained bursts, not the primary fix.**

**Update 2026-09-03: deployed.** `08_cpu_scaling.config` shipped to
`cross-stitch-com-env-clone` for real — confirmed live via
`aws cloudwatch describe-alarms` (`AWSEBCloudwatchAlarmHighCPU`,
`Statistic=Maximum`, `Threshold=65`, state `OK`).

## TL;DR

`/api/convert`, `/api/convert/pdf`, and the `/photo-to-cross-stitch` page
that calls them run the actual cross-stitch pattern generation (color
quantization, DMC thread matching, PDF/thumbnail rendering) as **plain
synchronous JavaScript inside the request handler**, on a Next.js app that
runs as a **single `next start` Node process per instance**, with **no
worker threads, no queue, no concurrency limit**. A synchronous computation
in Node blocks the *entire* process — not just the one request — for as
long as it runs. When a few real visitors trigger a conversion at the same
time (a totally normal, non-attack traffic pattern — confirmed from the ALB
logs, no single IP/UA dominated), the instance's CPU pegs at 100%, every
other concurrent request (including the ALB/EB health check itself) stalls
or times out, and the instance gets marked unhealthy and cycled. On
2026-08-31 this cut real GA4-tracked sessions by ~60% for a day, uniformly
across every traffic channel, because visitors who hit a 502/504 never got
far enough to fire the GA4 pageview beacon.

## How this was found

Full evidence chain (GA4 numbers, EB health events, EC2 CPU metrics, raw
ALB log breakdown) is in the conversation history around 2026-09-01 and
condensed in `Focus.md`'s archived Item #29. Short version: current IP not
blocked → ALB/WAF traffic volume normal (rules out a tracking/traffic
mystery) → GA4 tag verified firing live via a real browser test (rules out
"GA4 itself is broken") → daily session totals showed a real, channel-
uniform ~60% drop on 08-31 (rules out bot-blocking, since that would hit
one channel, not all of them proportionally) → EB environment health
history showed repeated Ok→Warning→Degraded→Severe flapping through 08-31
and into 09-01 → EC2 `CPUUtilization` hit 100% max in the exact same
windows (07:30-08:30 UTC 08-31, 00:00 UTC 09-01) → raw ALB access logs for
07:25-08:20 UTC 08-31 (5337 requests) showed the top *slow* (>3s) paths and
top *5xx* paths were the same set — `/api/convert/pdf`, `/api/convert`,
`/photo-to-cross-stitch` — while the 5xx errors themselves were smeared
across unrelated real pages, consistent with the whole process stalling
rather than one endpoint being individually broken.

## Concurrency deep-dive — why this specific shape of code breaks Node

**The Node.js model, for contrast with a typical .NET/ASP.NET mental
model:** ASP.NET (Kestrel) gives each incoming request its own thread (or
schedules it freely across a thread pool) — one slow request generally
doesn't stop another request's thread from making progress. Node.js is
different: **one process, one JS thread, one event loop.** Node is very
good at *concurrent I/O* (many requests can be "in flight" waiting on a
database call, an S3 upload, a network fetch, etc., because those hand off
to the OS/libuv and free the JS thread while waiting) — but if any single
piece of JS code runs a **synchronous, CPU-bound loop**, nothing else in
the entire process can run until that loop returns control to the event
loop. Not other requests, not the health-check handler, nothing. This is
true no matter how many concurrent connections the process has open — it's
a single-lane road, and Node's whole performance model depends on nothing
ever occupying that lane for long.

**What's actually running synchronously here, confirmed by reading the
code (not assumed):**

- **`web/src/app/api/convert/route.ts`** → `convertImage()` in
  **`web/src/lib/pattern-converter.ts`** (1214 lines, imports `sharp` but
  the actual color/pattern logic is hand-written). Confirmed via `grep` for
  loop/worker patterns — **zero** `worker_threads`, `setImmediate`, or
  `process.nextTick` chunking anywhere in the file; every heavy step is a
  plain nested `for` loop that runs to completion in one synchronous call:
  - **k-means color quantization** (`kmeansLab`/`kmeansQuantize`,
    ~line 300-410): `KMEANS_RUNS = 5` full runs, each up to
    `KMEANS_MAX_ITER = 30` Lloyd's-algorithm iterations, each iteration
    comparing up to `KMEANS_MAX_SAMPLE = 6000` sampled pixels against up to
    100 centroids (the max of `VALID_COLORS` in the route) — up to **~90
    million** Lab color-distance evaluations for one conversion at max
    settings, before any DMC matching even starts.
  - **CIEDE2000** (`ciede2000()`, ~line 138) — the file's own comment
    states it's "~10-20x more expensive" than the cheap CIE76
    (`labDist2`) distance function. Used for clustering itself in
    `colorDistanceMode='everywhere'`, and for the final DMC-thread match in
    `'final-only'`/`'everywhere'` (the public "Thread color accuracy"
    picker from docs/session-log/2026-08.md "Closed item #11" lets any
    visitor pick either mode).
  - **Final DMC matching against all 452 reference colors**
    (`dmc-colors.json` has 452 entries) — comparing the resolved palette
    against every DMC swatch.
  - **Dominant-color / box-blur neighborhood loops** (~line 494-531),
    **flood-fill for background/outline detection** (~line 547-568, a
    manual stack-based flood fill), and **nearest-neighbor upscale loops**
    (~line 578-628) — each iterates the full pixel or grid dimensions
    (up to 500×500 = **250,000 cells**, `MAX_DIM = 500` in `route.ts`)
    with nested per-cell inner loops.
  - **`sharp` is *not* the suspect** — sharp's decode/resize pipeline
    (used in `image-analysis.ts` and the start of `pattern-converter.ts`)
    is native libvips code that runs off the main thread via libuv's
    worker pool by design, specifically so it doesn't block Node's event
    loop. The custom color-matching/quantization code above is the actual
    bottleneck, not image I/O.

- **`web/src/app/api/convert/pdf/route.ts`** → `buildPatternPdf()` in
  **`web/src/lib/pattern-pdf.ts`** (618 lines): multiple full-grid nested
  loops for page layout, symbol placement, and grid-line drawing (e.g.
  ~line 414-415, 451-452, 506-534, 556-568), each iterating up to the full
  500×500 grid, run synchronously via `pdf-lib`. It also calls
  **`renderCoverThumbnailPng()`** (`server-cover-thumbnail.ts`) and
  **`renderSymbolToPng()`** (`server-symbol-renderer.ts`), both built on
  **`@napi-rs/canvas`** — unlike sharp, the Canvas 2D drawing API
  (`fillRect`, `drawImage`, etc.) executes **synchronously on the calling
  thread** even though it's native Rust code, because that's how the
  Canvas API works. `renderCoverThumbnailPng()` renders per Focus.md's own
  description "real Aida weave texture tiled under every cell, a drop
  shadow per stitch... at up to ~1200px on the long side" — a large number
  of individual synchronous draw calls. `renderSymbolToPng()` is at least
  cached per unique symbol rather than per cell, which helps, but the page
  layout loops themselves are not.

**Why one instance, one process matters:** the app runs as a single
`next start` process per EC2 instance (confirmed directly from
`web.stdout.log`: one `web[PID]` line, `▲ Next.js 15.5.20`, no cluster/PM2
fan-out visible). Desired Auto Scaling capacity is 2, but instances were
observed dropping to 1 in-service during the incident (an EB event
explicitly logged "1 instance online is below Auto Scaling group desired
capacity 2") — meaning at the worst moment, *all* live traffic funneled
through whichever single instance was still healthy, doubling its exposure
to this exact failure mode right when it was already struggling.

**The failure chain, end to end:** a normal, non-malicious burst of
concurrent conversions (confirmed: no dominant IP/UA in the incident
window, just a normal mix of real browser traffic) → the JS thread spends
seconds-to-tens-of-seconds inside `convertImage()`/`buildPatternPdf()` for
each one, serially, since there's only one thread → every other concurrent
request on that instance (unrelated page loads, other API calls, **and the
ALB/EB target-group health check itself**) queues behind it and times out
→ health check misses its threshold → EB flips the target group to
Warning/Degraded/Severe → Auto Scaling cycles the instance → briefly fewer
instances are in service, concentrating load further → repeats. Real
visitors who hit a 502/504 during this window never finish loading the
page, so the GA4 tag never fires, which is what showed up as a uniform
~60% session drop across every channel on 08-31.

## Proposed solutions

None of these are implemented yet — this is options for Olga to choose
from, not a decision already made.

### 1. Move the CPU-bound work into `worker_threads` (recommended first step)

Wrap `convertImage()` and `buildPatternPdf()` (plus the canvas rendering
they call) so they run inside a Node `worker_threads` worker instead of
inline in the request handler; the route `await`s a message back from the
worker. This is the standard, minimally-invasive fix for exactly this
failure mode: **zero change to the actual algorithm**, just moves *where*
it executes. The main thread's event loop stays free to keep serving
health checks and other requests while conversions run on separate
OS-scheduled threads (ideally a small worker pool, sized to available
CPU cores, rather than one worker per request, to cap total concurrent
CPU usage). Moderate effort — needs the conversion functions to be
callable with plain serializable data in/out (they mostly already are:
buffer in, JSON-shaped pattern out), plus wiring a worker pool and
message-passing around the two route handlers.

### 2. Concurrency limit / queue at the route level (cheap, immediate, defense-in-depth)

Add a simple in-process semaphore/queue capping how many `/api/convert`
and `/api/convert/pdf` executions can run at once on a given instance
(e.g. cap at 2-3 concurrent, queue or `429` beyond that with a "please
try again in a moment" message). Doesn't fix the underlying blocking
behavior, but bounds the blast radius — a burst can no longer fully starve
the process, only slow down conversions themselves. Cheapest to ship,
worth doing even alongside a real fix (option 1 or 4) as a safety net.

### 3. Reduce the algorithm's actual cost

Independent of where it runs, the current implementation does more work
than it needs to in a couple of identifiable spots:

- **Final DMC matching is (per the code's structure) positioned to run
  per grid cell rather than per cluster centroid** — but every cell in the
  same k-means cluster necessarily maps to the same nearest DMC color, so
  matching each of the ≤100 centroids once against the 452 DMC colors and
  then looking up by cluster ID would give identical output for a fraction
  of the comparisons (≤100×452 instead of up to 250,000×452). Worth
  confirming this isn't already how it's structured before assuming it's
  free — needs a closer read of the code path between k-means output and
  final palette assignment than this investigation did.
- **K-means has no early-stopping/convergence check** — `KMEANS_MAX_ITER
  = 30` always runs to completion; a standard "stop if centroids moved
  less than epsilon" check would cut the common case substantially without
  changing worst-case behavior or output quality.
- Lower-priority: consider whether `KMEANS_RUNS = 5` needs to stay fixed
  at 5 for the largest grid/color combinations, or could scale down for
  bigger, slower requests.

This reduces the cost of every request (good for UX regardless of the
concurrency fix) but doesn't by itself prevent a large enough burst from
still saturating a single-threaded process — worth doing *in addition to*,
not *instead of*, option 1 or 2.

### 4. Move conversion to a background job/queue architecture

Client uploads the image and gets a job ID; a separate worker process (or
Lambda) does the actual conversion and the client polls or gets notified
when it's ready. This fully decouples conversion load from the
page-serving tier — a burst of conversions can no longer affect anyone
just browsing the site, since they're different compute resources
entirely. This is consistent with how this codebase already handles other
heavy batch/background work (the AI-draft pipeline, the PDF-to-editable
catalog batch conversion) — it wouldn't be a new architectural pattern for
this project, just applying the existing one to a path that's currently
still synchronous/inline. Highest effort of the options here (real UX
change — the current "upload and get a result back" flow becomes
asynchronous), so probably not the first thing to ship, but worth keeping
in mind if options 1-3 don't fully solve it under real load.

### 5. Infra-level headroom (cheap, doesn't fix root cause, worth doing regardless)

- **Root cause of the capacity dip found 2026-09-01, checked directly via
  `describe-configuration-settings`/`describe-auto-scaling-groups`**: the
  ASG (`awseb-e-nmnqtzdpup-stack-AWSEBAutoScalingGroup-v6PQsvdLdBGz`) is
  `MinSize=1, MaxSize=4` — **not** hard-capped at 2. `DesiredCapacity=2` is
  just wherever the scaling trigger currently rests. The trigger
  (`AWSEBCloudwatchAlarmHigh`/`Low`) scales on **`NetworkOut`**, not CPU:
  scale up above 6,000,000 bytes/5min average, scale down below 2,000,000,
  360s cooldown. Photo conversion is CPU-bound, not bandwidth-bound (small
  request in, modest JSON/PDF response out), so a CPU-saturation event
  like this one likely never crosses the NetworkOut scale-up threshold —
  the ASG has headroom up to 4 instances but no signal telling it to use
  it for *this specific failure mode*. The "dropped to 1 in-service"
  observed during the incident was health-check-driven instance
  replacement, not the ASG failing to scale up; it wasn't trying to scale
  up at all. **Fix direction**: add a CPU-based scaling trigger/policy
  (alongside or instead of the NetworkOut one) so this specific failure
  mode actually triggers a scale-out response.
- Consider whether the conversion endpoints specifically warrant running
  on a separate, differently-scaled target group/service from ordinary
  page traffic, so a CPU spike there can't take out page-serving directly
  — a lighter-weight step toward option 4 without the full async-UX
  rework.

## Suggested order of attack (not yet decided with Olga)

1. Option 2 (concurrency limit) — ship first, cheap, immediately bounds
   the damage from any future burst while a real fix is built.
2. Option 1 (worker threads) — the real fix for the blocking behavior
   itself.
3. Option 3 (algorithmic cost reduction) — worth doing alongside option 1,
   improves latency for every user regardless of concurrency.
4. Option 4 (background queue) — only if 1-3 turn out insufficient under
   real measured load after shipping them.
5. Option 5 (infra headroom) — cheap, do independently of the above.

## Not yet done

- Options 2 (concurrency limit/queue), 3 (algorithmic cost reduction), and
  4 (background job queue) are still unimplemented — defense-in-depth on
  top of the deployed fix, not required to close this out, per the
  "suggested order of attack" above.
- Read the exact code path between k-means output and final DMC
  assignment closely enough to confirm/deny whether the final match
  already runs per-centroid or per-cell (option 3's first bullet) —
  flagged as worth checking, not yet checked.
- Decide whether to backfill/annotate the 08-31 GA4 dip somewhere so it
  doesn't get misread later as a real audience drop when someone reviews
  historical GA4 data.
