-- ============================================================
-- SECURITY & AUDIT MIGRATION
-- ============================================================

-- Rate limit logs (for rate limiter)
CREATE TABLE IF NOT EXISTS rate_limit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    limit_key TEXT NOT NULL,
    limit_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_key ON rate_limit_logs(limit_key, limit_type, created_at);

-- Failed auth attempts (for brute force protection)
CREATE TABLE IF NOT EXISTS failed_auth_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL, -- IP or user ID
    auth_type TEXT NOT NULL, -- 'telegram', 'api_key', 'webhook'
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_failed_auth ON failed_auth_attempts(identifier, created_at);

-- Suspicious activity log
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL, -- 'brute_force', 'token_theft', 'unusual_access', 'data_exfiltration'
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT,
    source_ip INET,
    user_agent TEXT,
    affected_business_id UUID REFERENCES businesses(id),
    metadata JSONB DEFAULT '{}',
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events ON security_events(event_type, severity, created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_business ON security_events(affected_business_id) WHERE resolved = false;

-- API keys for server-to-server auth
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id),
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT,
    permissions TEXT[] DEFAULT '{read}',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_business ON api_keys(business_id) WHERE revoked = false;

-- Backup codes for 2FA (future feature)
CREATE TABLE IF NOT EXISTS backup_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id),
    code_hash TEXT NOT NULL,
    used BOOLEAN DEFAULT false,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Session tokens (for Mini App sessions)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ DEFAULT now(),
    user_agent TEXT,
    ip_address INET,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at) WHERE revoked = false;

-- Cleanup function for old sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM sessions WHERE expires_at < now() OR revoked = true;
    DELETE FROM rate_limit_logs WHERE created_at < now() - interval '1 hour';
    DELETE FROM failed_auth_attempts WHERE created_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-cleanup
CREATE OR REPLACE FUNCTION trigger_cleanup_sessions()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM cleanup_expired_sessions();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Run cleanup every 1000 sessions created
CREATE TRIGGER cleanup_sessions_trigger
    AFTER INSERT ON sessions
    FOR EACH ROW
    WHEN (pg_trigger_depth() = 0)
    EXECUTE FUNCTION trigger_cleanup_sessions();
