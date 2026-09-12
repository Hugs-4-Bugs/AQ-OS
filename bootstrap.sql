-- ═══════════════════════════════════════════════════════════════════════
-- AcquisitionOS — PostgreSQL Bootstrap / Initialization Script
-- ═══════════════════════════════════════════════════════════════════════
--
-- Purpose : Creates the database, extensions, roles, and schemas required
--           BEFORE Prisma migrations run. Safe to execute multiple times
--           (idempotent via IF NOT EXISTS patterns).
--
-- Usage   : psql -U postgres -f bootstrap.sql
--
-- Notes   :
--   - This script is intended for production-like local setups and CI.
--   - Prisma manages all table DDL; this script only prepares the
--     infrastructure that Prisma cannot (database, extensions, roles).
--   - Run this as a superuser (typically `postgres`).
--
-- ═══════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────
-- 1. Database
-- ───────────────────────────────────────────────────────────────────────

-- Create the database if it does not already exist.
-- `CREATE DATABASE` cannot run inside a transaction, so we use a DO block
-- that queries pg_database to check first.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'acquisitionos') THEN
        PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE acquisitionos');
    END IF;
END
$$;

-- If dblink is not available, fall back to the simpler approach:
-- Just run: CREATE DATABASE acquisitionos;
-- (Commented out because CREATE DATABASE cannot be inside IF blocks)
-- CREATE DATABASE acquisitionos;

-- Alternative: use the shell approach (outside this file):
--   createdb -U postgres acquisitionos 2>/dev/null || true

\connect acquisitionos;

COMMENT ON DATABASE acquisitionos IS
    'AcquisitionOS — AI-powered sales acquisition platform database';


-- ───────────────────────────────────────────────────────────────────────
-- 2. Extensions
-- ───────────────────────────────────────────────────────────────────────

-- uuid-ossp: Provides functions to generate universally unique identifiers
--   (UUID v1, v4, etc.). Used by Prisma @default(uuid()) and general ID
--   generation throughout the application.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;

COMMENT ON EXTENSION "uuid-ossp" IS
    'UUID generation functions — used for primary keys and correlation IDs';

-- pgcrypto: Cryptographic functions for hashing, encryption, and random
--   data generation. Used for password hashing (bcrypt), token generation,
--   and sensitive field encryption at the database level.
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

COMMENT ON EXTENSION pgcrypto IS
    'Cryptographic functions — password hashing, token generation, field encryption';


-- ───────────────────────────────────────────────────────────────────────
-- 3. Timezone
-- ───────────────────────────────────────────────────────────────────────

-- Ensure all timestamps are stored and compared in UTC. This prevents
-- subtle bugs from timezone mismatches between application servers and
-- the database, and is required for correct billing period calculations.
SET timezone = 'UTC';

-- Also set the default timezone at the database level so that new
-- connections inherit it.
ALTER DATABASE acquisitionos SET timezone = 'UTC';


-- ───────────────────────────────────────────────────────────────────────
-- 4. Application User & Role
-- ───────────────────────────────────────────────────────────────────────

-- Create a dedicated application user. This is the user that Prisma
-- connects as (configured via DATABASE_URL). Separating this from the
-- superuser follows the principle of least privilege.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acquisitionos') THEN
        CREATE ROLE acquisitionos
            WITH
                LOGIN
                PASSWORD 'acquisitionos_secret'
                NOSUPERUSER
                NOCREATEDB
                NOCREATEROLE
                NOINHERIT
                NOREPLICATION
                CONNECTION LIMIT 100;
    ELSE
        -- If the role already exists, update the password to ensure it
        -- matches the expected value (useful in fresh-provision scenarios).
        ALTER ROLE acquisitionos PASSWORD 'acquisitionos_secret';
    END IF;
END
$$;

COMMENT ON ROLE acquisitionos IS
    'AcquisitionOS application role — used by Prisma Client for all DB operations';


-- ───────────────────────────────────────────────────────────────────────
-- 5. Schemas
-- ───────────────────────────────────────────────────────────────────────

-- The public schema is the default and where Prisma creates all tables.
-- We ensure it exists and grant the application user full access.

-- Grant the application user full privileges on the public schema
GRANT ALL PRIVILEGES ON SCHEMA public TO acquisitionos;

-- Ensure the application user can create objects in public
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO acquisitionos;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON SEQUENCES TO acquisitionos;

-- If future needs require a separate schema for audit or analytics data,
-- create them here. For now they are placeholders.

CREATE SCHEMA IF NOT EXISTS audit;
COMMENT ON SCHEMA audit IS
    'Audit schema — reserved for audit log tables and compliance data';

GRANT USAGE ON SCHEMA audit TO acquisitionos;
GRANT ALL PRIVILEGES ON SCHEMA audit TO acquisitionos;

ALTER DEFAULT PRIVILEGES IN SCHEMA audit
    GRANT ALL PRIVILEGES ON TABLES TO acquisitionos;

ALTER DEFAULT PRIVILEGES IN SCHEMA audit
    GRANT ALL PRIVILEGES ON SEQUENCES TO acquisitionos;


-- ───────────────────────────────────────────────────────────────────────
-- 6. Database-Level Privileges
-- ───────────────────────────────────────────────────────────────────────

-- Grant the application user full privileges on the database
GRANT ALL PRIVILEGES ON DATABASE acquisitionos TO acquisitionos;

-- Ensure the application user owns all future tables created in public
-- by any role (important for migration scenarios)
ALTER DATABASE acquisitionos OWNER TO acquisitionos;


-- ───────────────────────────────────────────────────────────────────────
-- 7. Performance & Maintenance Settings
-- ───────────────────────────────────────────────────────────────────────

-- Enable parallel query execution for better performance on larger datasets
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET max_parallel_workers = 8;

-- Ensure sufficient connections for connection pooling
ALTER SYSTEM SET max_connections = 200;

-- WAL settings for better write performance
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET max_wal_size = '1GB';
ALTER SYSTEM SET min_wal_size = '80MB';

-- Autovacuum tuning for production-like workloads
ALTER SYSTEM SET autovacuum = on;
ALTER SYSTEM SET autovacuum_max_workers = 4;
ALTER SYSTEM SET autovacuum_naptime = '30s';


-- ───────────────────────────────────────────────────────────────────────
-- 8. Verification
-- ───────────────────────────────────────────────────────────────────────

-- Output a summary of what was created
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE '  AcquisitionOS Bootstrap Complete';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE '  Database  : acquisitionos';
    RAISE NOTICE '  Extensions: uuid-ossp, pgcrypto';
    RAISE NOTICE '  Timezone  : UTC';
    RAISE NOTICE '  Role      : acquisitionos (password: acquisitionos_secret)';
    RAISE NOTICE '  Schemas   : public, audit';
    RAISE NOTICE '';
    RAISE NOTICE '  Next steps:';
    RAISE NOTICE '    1. Set DATABASE_URL in .env';
    RAISE NOTICE '    2. Run: npx prisma migrate deploy';
    RAISE NOTICE '    3. Run: psql -U acquisitionos -d acquisitionos -f seed-dev.sql';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE '';
END
$$;
