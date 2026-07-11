# Architecture Decision Records — cross-stitch-platform

Reverse-engineered from `../05-SAD.md` §9. These record decisions already in effect in the
current implementation, not proposals — `Status: Accepted` reflects "this is what's built,"
not "this was formally decided and later implemented" (no contemporaneous decision record
existed before this ADR log).

New decisions going forward should be added here as new numbered files, following the same
template, rather than folded back into the SAD.

| ADR | Title |
|---|---|
| [0001](0001-split-pin-creation-from-analytics.md) | Split Pinterest pin-creation (autopinner) from analytics/defense (pinterest-agent) |
| [0002](0002-desktop-uploader-not-web-admin.md) | Desktop application (WPF), not a web admin panel, for publishing |
| [0003](0003-no-captcha-heuristic-ip-blocking.md) | No CAPTCHA; heuristic detection + human-reviewed IP blocking instead |
| [0004](0004-shared-database-integration.md) | Shared-database integration (DynamoDB) instead of internal APIs between components |
| [0005](0005-legacy-aspx-url-preservation.md) | Preserve legacy `.aspx` URLs via catch-all routing |
