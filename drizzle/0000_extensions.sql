-- Extensions needed before any table: trigram index for accent-free airport search.
-- (gen_random_uuid() is built into Postgres 13+, no pgcrypto needed.)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
