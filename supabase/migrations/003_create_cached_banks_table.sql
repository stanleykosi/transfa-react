-- Create cached_banks table for storing bank information
-- This table is used to cache bank data from Anchor API to reduce API calls

CREATE TABLE IF NOT EXISTS cached_banks (
    id SERIAL PRIMARY KEY,
    banks_data JSONB NOT NULL,
    cached_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index on expires_at for efficient cleanup
CREATE INDEX IF NOT EXISTS idx_cached_banks_expires_at ON cached_banks(expires_at);

-- Create index on cached_at for efficient retrieval
CREATE INDEX IF NOT EXISTS idx_cached_banks_cached_at ON cached_banks(cached_at);

-- Add comment to the table
COMMENT ON TABLE cached_banks IS 'Caches bank information from Anchor API to reduce external API calls';
COMMENT ON COLUMN cached_banks.banks_data IS 'JSON array of bank objects from Anchor API';
COMMENT ON COLUMN cached_banks.cached_at IS 'When the banks were cached';
COMMENT ON COLUMN cached_banks.expires_at IS 'When the cache expires (typically 24 hours)';
