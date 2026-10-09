# Transaction recurrence and enrichment recovery

Apply `migrations/0044_add_transaction_recurrence_rules.sql` before deploying the
API and workers. It saves existing positive recurrence classifications as rules
and protects those transactions from automatic reclassification. Historical
`false` values cannot be distinguished from CSV defaults, so historical opt-outs
must be confirmed again.

New single and bulk recurrence corrections save a team-specific rule atomically
with the edited transaction. Rules survive deletion of their source transaction.
Imports and manual creation apply rules immediately; both enrichment workers
apply them again after merchant normalization. This also covers transactions
that are later linked to receipts; a receipt alone does not create a payment or
establish a billing schedule.

Matching requires an exact normalized merchant (or raw name before enrichment),
the same currency and payment direction, and an amount within 5% (minimum one
cent tolerance). Weekly/biweekly billing allows one day of drift; monthly/annual
billing allows three days and handles month ends. The newest matching correction
wins. Negative corrections block the payment pattern independent of date.
Unknown and semi-monthly schedules are not inferred from a single anchor.
Rules fill empty categories before AI categorization; existing categories and
explicit recurrence overrides are preserved. This does not discover new
subscriptions without an existing recurrence classification.

To preview the backfill for one team, from `packages/db` with the worker database
credentials configured:

```sh
bun run src/scripts/backfill-transaction-recurrence.ts --team-id TEAM_UUID
```

Add `--apply` to persist it. The script processes 500 transactions at a time,
skips explicit overrides, and prints a match count. It is safe to rerun.

The transaction table polls while visible transactions remain incomplete and
keeps category selection available. After ten minutes it shows “Analysis delayed”
with a team-scoped retry action. CSV retries requeue incomplete duplicate rows;
REST/MCP creation now queues enrichment too. Model calls have a 90-second abort
deadline. These changes do not replace monitoring worker/queue availability.

Regression checks:

```sh
bun test src/test/transaction-recurrence.test.ts
RECURRENCE_TEST_DATABASE_URL=postgres://... bun test src/test/transaction-recurrence.integration.test.ts
```

Use a dedicated PostgreSQL test database. The integration suite uses a disposable
schema and installs `pg_trgm` and the minimal authentication role/function if absent.
