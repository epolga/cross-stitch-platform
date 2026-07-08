# Editor Error Logging and Diagnostics

## Context

The editor now has real users.

Today's analytics showed:

| Date | Opened | Generated | Gen% | PDF | PDF% | Feedback | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-06-30 | 169 | 66 | 39% | 20 | 30% | — | 3 |

The conversion numbers are useful, but the `Errors = 3` number is not actionable yet.

I need to understand what those errors actually were.

Please implement a practical error diagnostics system for the editor.

## Goal

When the daily summary says there were 3 errors, I should be able to answer:

- What failed?
- At which step?
- Was it a user-facing validation issue or a real bug?
- Did it affect generation, PDF export, registration, saving, or something else?
- How many users were affected?
- Is this a repeated error?
- Is it urgent?

## Please design this cleanly

You know the project architecture better than this document.

Please do not implement this as a messy collection of logs.

Design a small but maintainable error reporting layer that fits the existing codebase.

## Error Categories

Please distinguish between at least these two categories:

### Expected / user-facing issues

Examples:

- unsupported image format
- image too large
- user already registered
- invalid input
- user not logged in
- missing required field

These should usually be logged as warnings or handled events.

### Unexpected technical errors

Examples:

- unhandled exception
- database error
- PDF generation failure
- pattern generation crash
- timeout
- failed API call
- internal server error

These should be logged as real errors with enough diagnostic detail.

## Suggested Data Model

Create something like `EditorErrorLog` or use an existing logging mechanism if one already exists.

Suggested fields:

```ts
type EditorErrorLog = {
  id: string;
  createdAt: string;

  severity: "info" | "warning" | "error" | "critical";
  category: "user_input" | "auth" | "generation" | "pdf_export" | "save_project" | "feedback" | "unknown";

  step?: string;
  operation?: string;

  errorCode?: string;
  userMessage?: string;
  technicalMessage?: string;
  stackTrace?: string;

  userId?: string;
  sessionId?: string;
  anonymousId?: string;

  pageUrl?: string;
  referrer?: string;

  designId?: string;
  projectId?: string;

  browserLanguage?: string;
  userAgent?: string;

  patternWidth?: number;
  patternHeight?: number;
  colorsCount?: number;

  metadata?: Record<string, unknown>;
};