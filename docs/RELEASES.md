# Release History

## v1.2.0 - 2026-07-12

Production synchronization release for the current local uAI News application.

Highlights:

- Replaces the legacy English demo-feed fallback with real PostgreSQL-backed feeds.
- Adds paginated feed and longform loading, stable sorting, source diversity, and deduplication.
- Adds automatic longform discovery and bounded transcript/article extraction.
- Adds structured feed-health queue diagnostics and queue-processing consistency.
- Adds feed-performance indexes and the `raw_posts.urls` database migration.
- Adds focused unit tests and API smoke coverage.

Database changes:

- `db/migrations/add-raw-post-urls.sql`
- `db/migrations/add-user-pass-feedback.sql`
- `db/migrations/add-feed-performance-indexes.sql`

Release verification:

- `npm.cmd run test:unit`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run test:api-smoke`
- Public homepage and API browser smoke checks

Rollback:

- The prior Vercel production commit is retained in Git history and marked with a dedicated production backup tag before `v1.2.0` is merged to `main`.
