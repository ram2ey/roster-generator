# Roster Generator operations

## Required environment

- `DATABASE_URL`: PostgreSQL connection string with TLS enabled outside a private network.
- `PAYSTACK_SECRET_KEY`: live or test Paystack secret for the deployed environment.
- `APP_URL`: public HTTPS origin, for example `https://rosters.example.com`.
- `TRUST_PROXY`: trusted proxy address/CIDR, or the exact number of proxy hops. For a single Coolify proxy hop, use `1` after confirming the topology.
- `NODE_ENV=production`.

Never reuse production secrets in preview deployments. Rotate a Paystack key immediately if it appears in logs or source control.

## Deployment

The Docker command applies committed Drizzle migrations before starting Fastify. A migration failure prevents the application from starting. Check for `Migrations applied.` in Coolify logs. Migration `0005` establishes a credit-ledger opening balance and removes duplicate facility/date-range roster rows, keeping a downloaded row first and otherwise the newest generation.

Deploy database-changing releases with a fresh backup. Do not run more than one deployment migration job against the same database unless the platform serializes releases.

`/healthz` reports process liveness. `/readyz` checks PostgreSQL and is used by the container health check.

## Backup and restore

Enable encrypted daily PostgreSQL backups in Coolify, retain at least 30 daily copies, and store a second copy outside the application server. Restrict backup access to operators.

Test this restore procedure quarterly in a separate database:

1. Create an empty PostgreSQL database.
2. Restore the newest backup into it.
3. Start the current image with `DATABASE_URL` pointing to the restored database.
4. Confirm migrations complete and `/readyz` returns 200.
5. Verify account login, roster history, credit balances, credit ledger, and an existing immutable export.
6. Delete the temporary restored database securely.

## Billing reconciliation

Every paid transaction produces one `credit_ledger` purchase row. Every charged export produces one download row tied to roster ID and version. Reconcile paid `billing_payments` against purchase ledger rows and the facility balance regularly. Investigate any mismatch before manually adjusting credits; manual changes require an `adjustment` ledger row in the same transaction.

Configure the Paystack webhook as `https://YOUR_DOMAIN/api/billing/webhook`. Alert on repeated Paystack verification failures, HTTP 5xx responses, negative-balance constraint errors, migration failures, and readiness failures.

## Privacy and retention

The database contains staff names, work patterns, and leave categories. Limit database, log, and backup access to authorized operators. Do not log request bodies. Agree on a retention period with each facility and delete expired roster exports, rosters, leave, and inactive staff according to that policy. Account deletion cascades tenant-owned database records; take a final authorized export first when required.

Session tokens are opaque and only their hashes are stored. A deployment no longer restores logged-out sessions. The first deployment of persistent sessions signs existing users out once because older stateless cookies have no database session record.

## Release checklist

- CI build, tests, migration check, dependency audit, and Docker build pass.
- Production backup completed.
- Coolify `APP_URL`, `PAYSTACK_SECRET_KEY`, `DATABASE_URL`, and `TRUST_PROXY` verified.
- Paystack test-mode purchase and download checked in staging.
- Deploy and confirm `Migrations applied.` and `/readyz` status.
- Complete one small live payment only when a production billing change requires it, then reconcile it in the ledger.
