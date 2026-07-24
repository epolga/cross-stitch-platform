---
name: publish-design
description: Invoke this skill whenever the user asks to publish, upload, or release a new cross-stitch design from a batch folder (any phrasing — "publish this design", "upload the folder", "process the new chart", "send the newsletter for it"). Validates the folder has everything required, uploads to S3, creates the Pinterest pin, inserts the DynamoDB catalog item, updates the design-spotlight newsletter templates for the new design, and sends a test email to the admin. Asks the user for clarification instead of guessing whenever the folder is missing something or looks ambiguous.
---

# Publish a new design (end to end)

Runs the full "select folder → upload → newsletter" pipeline for one batch
folder, using `uploader/UploaderCli` (headless equivalent of the WPF
Uploader's own flow — see its `Program.cs` for the authoritative
implementation; this skill just orchestrates calling it).

## Step 1 — Get the folder path

If the user hasn't given a path, ask for it. Confirm it's a directory that
exists before continuing.

## Step 2 — Validate the folder (stop and ask if anything is off)

Check, in this order, and **stop to ask the user** rather than guessing or
silently working around any failure here:

1. Exactly one `.txt` file, whose filename (minus extension) parses as a
   positive integer — this is the AlbumID. Zero, two-or-more, or a
   non-numeric name → ask which AlbumID this design belongs to.
2. `1.pdf`, `3.pdf`, and `5.pdf` all present. Missing any → ask whether the
   folder is actually ready, or if a different naming convention was used.
3. Exactly one `.scc` file present. Zero or multiple → ask which one is the
   real chart file.
4. `D:\ann\Git\Converter\bin\Release\net9.0\Converter.exe` exists (external
   PDF-debranding tool this pipeline shells out to; not part of this
   monorepo). Missing → tell the user exactly this, don't try to work
   around it — this has happened before from an unrelated folder rename.

A reference photo of the finished design (`.jpg`/`.png`, any filename) is
**not required** — if absent, the design's own extracted preview (`4.jpg`,
produced in Step 3) is used instead for the newsletter-content step.

## Step 3 — Run the upload, review before the irreversible part

```
cd D:\ann\Git\cross-stitch-platform\uploader\UploaderCli
dotnet run -- "<folder>"
```

(No `--yes` — let it stop at its own checkpoint.) This will: extract the
preview image from `1.pdf`, compute the next DesignID/NPage, upload the
chart/PDFs/images to S3, then print the exact DesignID/AlbumCaption/NPage it
computed and wait for confirmation before creating the **public** Pinterest
pin, inserting the **live** DynamoDB catalog item, and restarting the
**live** Elastic Beanstalk environment.

Show these computed values to the user and get an explicit go-ahead before
answering "yes" at that prompt (or re-running with `--yes`) — this step is
public and effectively irreversible, so don't skip the confirmation even
though the rest of this skill can otherwise run unattended. If the tool
throws an unexpected error here (not one of the known Step 2 checks), stop
and report it rather than retrying blindly — a partial failure after S3
uploads but before the DynamoDB insert leaves harmless orphaned S3 objects,
not a corrupt catalog entry, so there's no urgency to "fix" anything before
asking.

## Step 4 — Update the newsletter templates for this design

Invoke the `update-newsletter-template` skill, using the folder's reference
photo if one exists, otherwise the `4.jpg` that Step 3 produced in the same
folder. This rewrites `HtmlEmailTemplate.txt` and `TextEmailTemplate.txt` —
note this is the **design-spotlight newsletter**, not the Announcement
email (see that skill's scope note if unsure which templates are meant).

## Step 5 — Send the admin test email

```
cd D:\ann\Git\cross-stitch-platform\uploader\UploaderCli
dotnet run -- send-admin-test
```

This renders `HtmlEmailTemplate.txt` for whatever is currently the latest
DynamoDB design (which will be the one just published) and sends it to
`AdminEmail` only — never a mass send. Report the subject line and that it
was sent; ask the user to check their inbox.

## What this skill does NOT do

- **Never sends the mass/full newsletter** — only the single admin test
  email in Step 5. A real send to the subscriber list is a separate,
  explicit ask (same rule as the Announcement email — Claude doesn't send
  mass emails without an explicit per-send go-ahead).
- **Never restores/renames external folders** (e.g. `Converter.exe`'s repo)
  on its own if missing — that's exactly the kind of thing to surface in
  Step 2 and ask about, since it may indicate an unrelated cleanup happened
  and the user may want to fix it differently than last time.
