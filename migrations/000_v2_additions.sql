-- ============================================================
-- MiniMe V2 — Additive migration for existing Supabase DB
-- Adds new v2 tables and columns without touching existing data
-- Run FIRST before the other migrations
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Add new columns to existing businesses table
-- ============================================================
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS modes TEXT[] DEFAULT '{secretary}';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS primary_mode TEXT DEFAULT 'secretary';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS secretary_chat_id BIGINT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS secretary_connection_id TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS secretary_connected BOOLEAN DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS last_secretary_activity TIMESTAMPTZ;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS bot_username TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS bot_pool_id UUID;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS fallback_to_bot BOOLEAN DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS fallback_after_minutes INT DEFAULT 30;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trust_level TEXT DEFAULT 'shadow';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS reputation_score INT DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS response_rate DECIMAL(5,2) DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS rules JSONB DEFAULT '{"auto_reply": false, "shadow_mode": true, "notify_on_sale": true, "payment_methods": ["cash", "telebirr"]}';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS health_check_failures INT DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMPTZ;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS directory_visible BOOLEAN DEFAULT true;

-- ============================================================
-- ENCRYPTED SECRETS (for bot tokens)
-- ============================================================
CREATE TABLE IF NOT EXISTS encrypted_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    secret_type TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    rotated_at TIMESTAMPTZ,
    UNIQUE(entity_type, entity_id, secret_type)
);

CREATE INDEX IF NOT EXISTS idx_encrypted_secrets_entity ON encrypted_secrets(entity_type, entity_id);

-- ============================================================
-- BUSINESS CONTENT (products, FAQs, portfolio — v2 unified)
-- ============================================================
CREATE TABLE IF NOT EXISTS business_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL DEFAULT 'photo',
    file_url TEXT,
    file_id TEXT,
    raw_text TEXT,
    caption TEXT,
    voice_transcript TEXT,
    extracted_type TEXT DEFAULT 'product',
    extracted_confidence DECIMAL(3,2) DEFAULT 0,
    extracted_data JSONB DEFAULT '{}',
    name TEXT,
    slug TEXT,
    description TEXT,
    price DECIMAL(12, 2),
    compare_price DECIMAL(12, 2),
    currency TEXT DEFAULT 'ETB',
    category TEXT,
    sub_category TEXT,
    tags TEXT[],
    attributes JSONB DEFAULT '{}',
    specs JSONB DEFAULT '{}',
    in_stock BOOLEAN DEFAULT true,
    stock_quantity INT,
    gallery_urls TEXT[],
    status TEXT DEFAULT 'active',
    price_updated_at TIMESTAMPTZ DEFAULT now(),
    price_expires_at TIMESTAMPTZ,
    auto_expire_days INT DEFAULT 7,
    trigger_keywords TEXT[],
    trigger_intents TEXT[],
    owner_confirmed BOOLEAN DEFAULT true,
    owner_edited JSONB,
    owner_notes TEXT,
    view_count INT DEFAULT 0,
    inquiry_count INT DEFAULT 0,
    conversion_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_business ON business_content(business_id, status);
CREATE INDEX IF NOT EXISTS idx_content_type ON business_content(extracted_type, category, status);
CREATE INDEX IF NOT EXISTS idx_content_price ON business_content(price) WHERE status = 'active';

-- ============================================================
-- CONVERSATION STATES (AI memory per customer)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_telegram_id BIGINT NOT NULL,
    current_intent TEXT,
    intent_history TEXT[],
    category TEXT,
    budget_min DECIMAL(12, 2),
    budget_max DECIMAL(12, 2),
    budget_currency TEXT DEFAULT 'ETB',
    purpose TEXT,
    urgency INT DEFAULT 5,
    preferences JSONB DEFAULT '{}',
    stage TEXT DEFAULT 'greeting',
    stage_history JSONB DEFAULT '[]',
    last_question TEXT,
    questions_asked TEXT[],
    shown_content_ids UUID[],
    content_interactions JSONB DEFAULT '{}',
    customer_profile JSONB DEFAULT '{}',
    purchase_history JSONB DEFAULT '[]',
    session_started_at TIMESTAMPTZ DEFAULT now(),
    last_activity_at TIMESTAMPTZ DEFAULT now(),
    session_count INT DEFAULT 1,
    UNIQUE(business_id, customer_telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_states_active ON conversation_states(last_activity_at);

-- ============================================================
-- PENDING REPLIES (shadow mode queue)
-- ============================================================
CREATE TABLE IF NOT EXISTS pending_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_chat_id BIGINT,
    customer_telegram_id BIGINT,
    original_message TEXT,
    original_message_id INT,
    suggested_reply TEXT,
    suggested_reply_confidence DECIMAL(3,2),
    status TEXT DEFAULT 'pending',
    owner_edited_text TEXT,
    owner_action_at TIMESTAMPTZ,
    owner_action_via TEXT,
    auto_approve_at TIMESTAMPTZ,
    auto_approved BOOLEAN DEFAULT false,
    learned_from_this BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT now() + interval '1 hour'
);

CREATE INDEX IF NOT EXISTS idx_pending_replies_business ON pending_replies(business_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_pending_replies_expiry ON pending_replies(expires_at) WHERE status = 'pending';

-- ============================================================
-- TRANSACTIONS (reservations & purchases)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_telegram_id BIGINT,
    product_id UUID REFERENCES business_content(id),
    product_name TEXT,
    product_price DECIMAL(12, 2),
    quantity INT DEFAULT 1,
    subtotal DECIMAL(12, 2),
    fee_amount DECIMAL(12, 2),
    total_amount DECIMAL(12, 2),
    currency TEXT DEFAULT 'ETB',
    reservation_code TEXT UNIQUE,
    reservation_expires_at TIMESTAMPTZ,
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending',
    payment_reference TEXT,
    paid_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_business ON transactions(business_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_code ON transactions(reservation_code) WHERE reservation_code IS NOT NULL;

-- ============================================================
-- BOT POOL
-- ============================================================
CREATE TABLE IF NOT EXISTS bot_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_token_hash TEXT NOT NULL UNIQUE,
    bot_username TEXT NOT NULL,
    bot_name TEXT,
    assigned_to_business_id UUID REFERENCES businesses(id),
    assigned_at TIMESTAMPTZ,
    status TEXT DEFAULT 'available',
    last_used_at TIMESTAMPTZ,
    health_status TEXT DEFAULT 'healthy',
    last_error TEXT,
    error_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_pool_status ON bot_pool(status) WHERE status = 'available';

-- ============================================================
-- ANALYTICS DAILY
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_conversations INT DEFAULT 0,
    auto_replies INT DEFAULT 0,
    shadow_approved INT DEFAULT 0,
    owner_replies INT DEFAULT 0,
    fallback_replies INT DEFAULT 0,
    search_appearances INT DEFAULT 0,
    search_clicks INT DEFAULT 0,
    products_viewed INT DEFAULT 0,
    reservations_made INT DEFAULT 0,
    leads_generated INT DEFAULT 0,
    lead_value DECIMAL(12, 2) DEFAULT 0,
    avg_response_time INT,
    customer_satisfaction DECIMAL(2,1),
    UNIQUE(business_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily ON analytics_daily(business_id, date DESC);

-- ============================================================
-- Update timestamp function (if not exists)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_business_content_updated_at
    BEFORE UPDATE ON business_content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_pending_replies_updated_at
    BEFORE UPDATE ON pending_replies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
