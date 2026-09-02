# CLAUDE.md

Project-level guidance for Claude Code when working in this repository.

## Skills to use

- **Email template edits → `email-template-usage` skill.** Whenever the user asks to change, edit, modify, update, or fix the HTML email template (`Uploader/Templates/HtmlEmailTemplate.txt`) or the `HtmlEmailTemplatePath` setting in `Uploader/App.config`, invoke the [`email-template-usage`](.claude/skills/email-template-usage/SKILL.md) skill before making edits. It documents the required section headers, token substitution rules, and the load-vs-render split between the template file and the WPF Uploader's send pipeline. The skill is guidance only — it does not send email.

- **Newsletter template from image → `update-newsletter-template` skill.** Whenever the user asks to update the newsletter template from a new design image (any phrasing: "update newsletter", "new design for newsletter", "replace newsletter content"), invoke the [`update-newsletter-template`](.claude/skills/update-newsletter-template/SKILL.md) skill. It handles asking for the image path, verifying it is an image file, reading the image visually, and rewriting both template files with subject and body content matched to the design.

## Newsletter/Announcement links must always carry identifying tags

Every link in `HtmlEmailTemplate.txt` / `TextEmailTemplate.txt` (and the Announcement equivalents) must go through `AppendTrackingParameters` (cid + eid) or at minimum `AppendUtmParameters` — never a bare hardcoded URL. This was missed for real on 2026-09-02: a one-off multi-design newsletter (10 pattern links) hardcoded raw URLs directly in the template, so only the single `<pattern_url>` token (used for the "latest design" spotlight) carried tracking — the other 9 links carried none, meaning clicks on them couldn't be attributed to a recipient or even a campaign.

**Fix pattern, if a template ever needs more links than the single `<pattern_url>`/`<image_url>` tokens support:** add a `<pattern_url_N>` token per extra link, and build the replacements via `AppendTrackingParameters(rawUrl, cid, eid)` for each — reusing the *same* `cid`/`eid` already computed for that recipient/admin-test call, not a new one per link (`cid` identifies the recipient, not which link they clicked). `RenderHtmlEmailContent` takes an optional `extraReplacements` dictionary for exactly this (added 2026-09-02, kept in the signature after that send's own batch code — `BuildMultiLinkReplacements` and its 3 call sites — was removed once the send finished; re-add a similar helper the next time a template needs more than one tracked link, don't leave it wired in permanently for a one-off).
