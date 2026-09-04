## Description

Brief summary of the change.

## Background

Context and problem this PR addresses.

<!-- For epic PRs with multiple stories, keep this section; otherwise remove it. -->

## Stories in this Epic

| Story | Description       | PR   |
| ----- | ----------------- | ---- |
| 1     | Brief description | #XXX |
| 2     | Brief description | #XXX |

<!-- For bugs only, remove if not needed -->

## Root Cause and Solution

**Root cause:** _Primary cause of the issue._

**Solution:** _Summary of the fix._

## Changes

<!-- Use tables to organize file changes. Remove sections that don't apply. -->

### New Files

| File              | Description                              |
| ----------------- | ---------------------------------------- |
| `path/to/file.ts` | Brief description of what this file does |

### Modified Files

| File              | Description                       |
| ----------------- | --------------------------------- |
| `path/to/file.ts` | Brief description of changes made |

## How Has This Been Tested?

Describe how you verified the changes work correctly.

```bash
# Commands used for testing, or remove this block
npm run build
npm run lint
```

## Architecture Context for AI Review

<!-- Help AI reviewers understand the implementation. Remove if not applicable. -->

### Key Concepts

Explain the main architectural patterns or flows:

```
Request → Guard (auth) → Controller → Service → Database
```

### Database Relations

```
table_a.foreign_key → table_b.id
table_b → table_c (one-to-many)
```

### Design Decisions

- Why certain approaches were chosen
- Trade-offs considered
- Security considerations

## Checklist

- [ ] Self-review done
- [ ] No new warnings from my changes
- [ ] Linting, typecheck, tests and build pass

## Additional information

Any other context for reviewers.
