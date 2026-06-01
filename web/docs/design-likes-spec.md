# Design Likes Spec

## Goal

Define the exact DynamoDB item format and API contract for a like button on each design page.

This document assumes the likes table is:

`CrossStitchLikes`

## V1 Behavior

The first version should do only this:

1. A signed-in user can like a design.
2. A signed-in user can unlike a design.
3. A design page can show the total number of likes.
4. A design page can show whether the current user has liked it.

Not included in V1:

1. Notifications
2. Activity feed
3. Popularity ranking
4. Recommendation logic

## Table Structure

Table name:

`CrossStitchLikes`

Primary key:

1. `PK` string
2. `SK` string

GSI:

1. `GSI1PK` string
2. `GSI1SK` string

## Recommended Like Item Shape

Each like is one item.

Example:

```json
{
  "PK": "DESIGN#5425",
  "SK": "USER#ann@example.com",
  "GSI1PK": "USER#ann@example.com",
  "GSI1SK": "DESIGN#5425",
  "EntityType": "LIKE",
  "DesignID": 5425,
  "UserEmail": "ann@example.com",
  "CreatedAt": "2026-03-16T12:00:00.000Z"
}
```

## Why This Shape

This supports the two critical queries:

1. Get all likes for one design.
2. Check whether one user has liked one design.

### Design-centric query

Use:

1. `PK = DESIGN#<DesignID>`

This lets you count likes for one design by querying the partition.

### User-centric query

Use GSI1:

1. `GSI1PK = USER#<UserEmail or UserID>`
2. `GSI1SK = DESIGN#<DesignID>`

This lets you check whether the current user already liked the design.

## Identity Choice

For V1, use normalized email if that is the most reliable identity available in the existing auth flow.

If a durable internal user ID becomes standard later, it can replace email in new writes.

No separate `AuthorName` field is needed for the like record.

Preferred V1 user identity field:

1. `UserEmail`

Normalized format:

1. lowercased
2. trimmed

## Optional Counter Item

If you want fast counts without querying all likes, add a second item per design.

Example:

```json
{
  "PK": "DESIGN#5425",
  "SK": "META#LIKES",
  "EntityType": "LIKE_META",
  "DesignID": 5425,
  "LikeCount": 12,
  "UpdatedAt": "2026-03-16T12:00:00.000Z"
}
```

This is optional.

For a simple first version, you can count likes by querying the design partition and excluding the meta item if you add one.

## API Contract

### 1. Get like state for a design

Route:

`GET /api/designs/[designId]/like`

Response example:

```json
{
  "designId": 5425,
  "count": 12,
  "likedByCurrentUser": true
}
```

Responsibilities:

1. Validate `designId`.
2. Count likes for the design.
3. If user is signed in, determine whether that user liked the design.
4. Return both count and user state.

### 2. Add like

Route:

`POST /api/designs/[designId]/like`

Behavior:

1. Require logged-in user.
2. Validate `designId` exists.
3. Write like item only if it does not already exist.

Response example:

```json
{
  "ok": true,
  "designId": 5425,
  "likedByCurrentUser": true
}
```

### 3. Remove like

Route:

`DELETE /api/designs/[designId]/like`

Behavior:

1. Require logged-in user.
2. Delete that user’s like item for the design.

Response example:

```json
{
  "ok": true,
  "designId": 5425,
  "likedByCurrentUser": false
}
```

## Server-side Rules

### Create like

Write one item with:

1. `PK = DESIGN#<DesignID>`
2. `SK = USER#<NormalizedUserEmail>`

Use a conditional write so the same user cannot create duplicate likes.

### Remove like

Delete the same item by key.

### Count likes

Two options:

1. Query `PK = DESIGN#<DesignID>` and count returned like items.
2. Maintain `LIKE_META` counter item.

For low to moderate traffic, option 1 is simpler.

## UI Contract

The client Like button should receive or fetch:

1. `count`
2. `likedByCurrentUser`
3. `designId`

Suggested UI states:

1. Default: heart outline plus count
2. Liked: filled heart plus count
3. Loading: disabled while request in flight
4. Logged out: clicking prompts login/register

## Suggested Frontend Component Behavior

1. Fetch current state from `GET /api/designs/[designId]/like`.
2. If user clicks and is signed in:
   send `POST` if not liked
   send `DELETE` if liked
3. Update count and liked state after success.
4. Optionally do optimistic UI updates.

## Error Handling

Recommended API responses:

1. `400` invalid design id
2. `401` not signed in
3. `404` design not found
4. `409` duplicate like if needed
5. `500` internal error

## Security Notes

1. Do not trust client-provided user identity.
2. Resolve the current user on the server.
3. Normalize email before building keys.
4. Use conditional writes to avoid duplicates.

## Recommended First Implementation

1. Data-access helpers in `src/lib`
2. API route at `src/app/api/designs/[designId]/like`
3. Client Like button component in `src/app/components`
4. Render it on `src/app/designs/[designId]/page.tsx`

## Example Queries

### Count likes for design 5425

Query:

1. `PK = DESIGN#5425`

### Check whether `ann@example.com` liked design 5425

Either:

1. read exact item by `PK = DESIGN#5425`, `SK = USER#ann@example.com`

Or via GSI1:

1. `GSI1PK = USER#ann@example.com`
2. `GSI1SK = DESIGN#5425`

## Recommendation Summary

Use one like item per user per design in `CrossStitchLikes`, keyed by design and user, with a user-centric GSI. Start with three endpoints:

1. `GET /api/designs/[designId]/like`
2. `POST /api/designs/[designId]/like`
3. `DELETE /api/designs/[designId]/like`

That is the simplest structure that supports a real like button cleanly.