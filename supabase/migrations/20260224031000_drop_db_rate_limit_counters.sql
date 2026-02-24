-- Remove database-backed API rate limit counters.
-- MoneyDrop request rate limiting now uses Redis for horizontal scalability.

DROP TABLE IF EXISTS public.api_rate_limit_counters CASCADE;

