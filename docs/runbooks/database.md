# AcquisitionOS — Runbook: Database Issues

**Alert names:**
- `DatabaseSlowQuery` (warning, p95 > 1s)
- `PostgresConnectionPoolWarning` (warning, >70% of max_connections)
- `PostgresExporterDown` (warning)
- `database-connection-failure` (in-app AlertEngine, critical)

## Diagnostic steps

1. **Confirm the database is reachable.**
   ```sh
   curl -s http://localhost:3000/api/health/database | jq
   ```
   For Postgres: `pg_isready -h <host> -p 5432`.
   For SQLite: check the file exists.

2. **Check the Database dashboard** (`acos-database`):
   - "DB Query Duration p95" — which operation is slowest?
   - "Postgres Active Connections" — is the pool saturated?

3. **Look at slow query logs.** The Prisma client logs slow queries to stderr (threshold: `SLOW_QUERY_THRESHOLD_MS=100`).

4. **Check for missing indexes.** Compare the query against the indexes in `prisma/schema.prisma`.

5. **Check for lock contention** (Postgres only):
   ```sql
   SELECT pid, state, wait_event_type, wait_event, query
   FROM pg_stat_activity WHERE state != 'idle';
   ```

## Mitigation

### Slow query
- **Add a Prisma migration** adding the missing `@@index` — only with explicit approval.
- **Rewrite the query** to be more selective.
- **Cache the result** via `src/lib/performance/api-cache.ts`.

### Connection pool exhaustion
- **Increase pool size** via `DATABASE_POOL_SIZE` env var (Postgres only).
- **Verify no long-running transactions** are holding connections.
- **Reduce concurrent workflows.**

### Database down
- **Check Docker**: `docker ps | grep postgres`, `docker logs acos-postgres`.
- **Failover** to the replica if using RDS multi-AZ.
- **Switch to read-only mode** if the primary is corrupt — set `READ_ONLY_MODE=true`.

## Escalation

The in-app AlertEngine `database-connection-failure` rule fires when >10% of DB-dependent endpoints return 5xx. Critical severity → Telegram + WhatsApp immediately.

## Recovery

Resolved when slow queries drop below threshold AND the connection pool utilization returns to <70%.

## False-positive considerations

- A single slow query during a migration or analytics batch can spike the p95 briefly. The `for: 5m` clause filters brief blips.
