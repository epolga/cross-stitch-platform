# Design Comments Proposal

## Goal

Add a comments feature to each design page so signed-in users can leave feedback, ask questions, and interact around a specific cross-stitch design.

## Recommendation

Use a separate DynamoDB comments table.

Do not store comments inside the existing design items. Comments are user-generated, can grow without bound, and should be queried and moderated independently from design metadata.

## Why A Separate Table

Storing comments inside each design item would create avoidable problems:

1. Design records would grow over time and could hit DynamoDB item size limits.
2. Every new comment would require rewriting the design item.
3. Pagination would be difficult.
4. Moderation workflows would be awkward.
5. It would mix public catalog data with user-generated content.

## Recommended V1 Scope

Start with a strict first version:

1. Logged-in users only.
2. Top-level comments only.
3. No replies in V1.
4. New comments start as `PENDING`.
5. Only `APPROVED` comments are shown publicly.
6. Basic pagination for comment lists.

This keeps the feature safer and easier to operate.

## Proposed DynamoDB Table

Suggested table name:

`DesignComments`

Suggested attributes:

1. `CommentID`
2. `DesignID`
3. `UserID`
4. `UserEmail`
5. `AuthorName`
6. `Body`
7. `Status`
8. `CreatedAt`
9. `UpdatedAt`
10. `ParentCommentID` optional for future replies
11. `ModeratedBy` optional
12. `ModeratedAt` optional
13. `ModerationReason` optional

Suggested status values:

1. `PENDING`
2. `APPROVED`
3. `REJECTED`
4. `DELETED`

## Suggested Access Pattern

The main read pattern is:

1. Get approved comments for one design.
2. Return newest first or oldest first, consistently.

The main write pattern is:

1. Add a new comment for one design by one authenticated user.

The main moderation patterns are:

1. Get pending comments.
2. Approve comment.
3. Reject comment.
4. Delete or hide comment.

## Suggested Key Design

One practical option:

1. Partition key: `PK = DESIGN#<DesignID>`
2. Sort key: `SK = COMMENT#<CreatedAt>#<CommentID>`

This makes it straightforward to fetch comments for a single design in sorted order.

If moderation needs a fast queue view, add a GSI such as:

1. `GSI1PK = STATUS#PENDING`
2. `GSI1SK = <CreatedAt>#<CommentID>`

## API Proposal

### Public Read API

`GET /api/designs/[designId]/comments`

Responsibilities:

1. Validate `designId`.
2. Return only `APPROVED` comments.
3. Support pagination.
4. Return comment count if practical.

### Authenticated Write API

`POST /api/designs/[designId]/comments`

Responsibilities:

1. Validate the user is signed in.
2. Validate `designId` exists.
3. Validate comment body length and content.
4. Store the comment with `PENDING` status.
5. Return success plus moderation state.

### Optional Moderation APIs

1. `GET /api/comments/pending`
2. `POST /api/comments/[commentId]/approve`
3. `POST /api/comments/[commentId]/reject`
4. `DELETE /api/comments/[commentId]`

## UI Proposal

Add a comments section to each design detail page.

Suggested UI pieces:

1. Comment count near the section heading.
2. Comment list.
3. Empty state such as `No comments yet.`
4. Logged-in comment form.
5. Logged-out prompt telling users to sign in first.
6. Submission confirmation such as `Your comment is awaiting approval.`

## Authentication Recommendation

Require authentication for posting comments.

This codebase already has login and user infrastructure, so using signed-in comments is the fastest safe approach. Anonymous comments would increase spam risk and require more abuse protection.

## Moderation Recommendation

Moderate comments before public display.

This is the safer default for a public site. It reduces spam, abuse, and low-quality content without needing a full automated trust-and-safety system.

## Validation Rules

Recommended basic rules:

1. Minimum length: 3 characters.
2. Maximum length: 1000 characters.
3. Trim whitespace.
4. Reject empty comments.
5. Escape or sanitize rendered content.
6. Rate-limit repeated submissions if possible.

## Optional Future Features

These can wait until after V1:

1. Replies.
2. Comment editing by author.
3. Comment deletion by author.
4. Upvotes or likes.
5. Admin dashboard.
6. Email notifications for new comments.
7. Abuse reporting.

## Implementation Notes For This Repository

This project already has:

1. Design data access in `src/lib/data-access.ts`.
2. User and auth-related logic in `src/lib/users.ts`.
3. Client-side auth control in `src/app/components/AuthControl.tsx`.

That means the clean integration path is:

1. Add a comments data-access module.
2. Add comment APIs under `src/app/api`.
3. Add a comments UI section to the design page.
4. Use signed-in identity from the existing auth flow.

## Recommended Decision Summary

For V1, implement:

1. A separate DynamoDB table for comments.
2. Logged-in-only commenting.
3. Moderation before publish.
4. No replies.
5. Paginated approved comments on each design page.

This is the most practical and maintainable path for the current application.