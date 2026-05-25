
-- ============================================================
-- MINIME DATABASE SCHEMA - SECURITY FIRST
-- ============================================================
-- Run this in Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- AUDIT LOGGING (Foundation Layer)
-- ============================================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'SELECT', 'AUTH', 'PAYMENT', 'BOT_ACTION')),
    old_data JSONB,
    new_data JSONB,
    actor_telegram_id BIGINT,
    actor_ip INET,
    actor_user_agent TEXT,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_telegram_id);
CREATE INDEX idx_audit_logs_table ON audit_logs(table_name, created_at);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity) WHERE severity != 'info';

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_data, actor_telegram_id)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD), current_setting('app.current_user_id', true)::BIGINT);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, actor_telegram_id)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW), current_setting('app.current_user_id', true)::BIGINT);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs (table_name, record_id, action, new_data, actor_telegram_id)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW), current_setting('app.current_user_id', true)::BIGINT);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ENCRYPTED TOKENS (Security Layer)
-- ============================================================
CREATE TABLE encrypted_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL, -- 'business', 'bot', 'payment'
    entity_id UUID NOT NULL,
    secret_type TEXT NOT NULL, -- 'bot_token', 'api_key', 'payment_key'
    encrypted_value BYTEA NOT NULL,
    iv BYTEA NOT NULL,
    auth_tag BYTEA NOT NULL,
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    rotated_at TIMESTAMPTZ,
    UNIQUE(entity_type, entity_id, secret_type)
);

CREATE INDEX idx_encrypted_secrets_entity ON encrypted_secrets(entity_type, entity_id);

-- ============================================================
-- BUSINESSES (Core Entity)
-- ============================================================
CREATE TABLE businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    owner_telegram_id BIGINT NOT NULL UNIQUE,
    owner_telegram_username TEXT,
    owner_phone TEXT,
    owner_name TEXT,

    -- Business Info
    business_name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'electronics',
    sub_category TEXT,

    -- Location
    location TEXT,
    sub_city TEXT,
    address_details TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Media
    logo_url TEXT,
    shop_photo_url TEXT,
    owner_photo_url TEXT,
    id_document_url TEXT,

    -- Mode Configuration
    modes TEXT[] DEFAULT '{secretary}',
    primary_mode TEXT DEFAULT 'secretary' CHECK (primary_mode IN ('secretary', 'bot')),

    -- Secretary Mode
    secretary_username TEXT,
    secretary_chat_id BIGINT,
    secretary_connection_id TEXT,
    secretary_connected BOOLEAN DEFAULT true,
    last_secretary_activity TIMESTAMPTZ,

    -- Bot Mode
    bot_username TEXT,
    bot_pool_id UUID,

    -- Fallback Configuration
    fallback_to_bot BOOLEAN DEFAULT true,
    fallback_after_minutes INT DEFAULT 30,

    -- Trust & Verification
    trust_level TEXT DEFAULT 'shadow' CHECK (trust_level IN ('shadow', 'phone_verified', 'photo_verified', 'human_verified', 'premium')),
    verified BOOLEAN DEFAULT false,
    verification_method TEXT,
    verified_at TIMESTAMPTZ,
    verified_by UUID,

    -- Reputation
    reputation_score INT DEFAULT 0,
    response_rate DECIMAL(5,2) DEFAULT 0,
    avg_response_time INT, -- seconds
    total_conversations INT DEFAULT 0,
    total_reviews INT DEFAULT 0,
    average_rating DECIMAL(2,1) DEFAULT 0,

    -- Settings
    rules JSONB DEFAULT '{
        "auto_reply": false,
        "shadow_mode": true,
        "notify_on_sale": true,
        "allow_referrals": true,
        "business_hours": {"mon": "9-18", "tue": "9-18", "wed": "9-18", "thu": "9-18", "fri": "9-18", "sat": "9-14", "sun": "closed"},
        "languages": ["en", "am"],
        "payment_methods": ["cash", "telebirr", "chapa"]
    }',

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'suspended', 'banned')),
    suspension_reason TEXT,

    -- Health
    health_check_failures INT DEFAULT 0,
    last_health_check TIMESTAMPTZ,

    -- Analytics
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_active_at TIMESTAMPTZ,

    -- Search
    search_vector tsvector,
    directory_visible BOOLEAN DEFAULT true,
    featured_until TIMESTAMPTZ
);

-- Search vector update trigger
CREATE OR REPLACE FUNCTION update_business_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('simple', COALESCE(NEW.business_name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(NEW.category, '')), 'C') ||
        setweight(to_tsvector('simple', COALESCE(NEW.sub_city, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER business_search_vector_update
    BEFORE INSERT OR UPDATE ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION update_business_search_vector();

CREATE INDEX idx_businesses_search ON businesses USING GIN(search_vector);
CREATE INDEX idx_businesses_category ON businesses(category, sub_city) WHERE status = 'active';
CREATE INDEX idx_businesses_reputation ON businesses(reputation_score DESC) WHERE status = 'active';
CREATE INDEX idx_businesses_verified ON businesses(verified, verification_level) WHERE status = 'active';

-- Audit trigger
CREATE TRIGGER businesses_audit
    AFTER INSERT OR UPDATE OR DELETE ON businesses
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================================
-- BUSINESS CONTENT (Products, FAQs, Portfolio)
-- ============================================================
CREATE TABLE business_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    -- Content
    content_type TEXT NOT NULL CHECK (content_type IN ('photo', 'video', 'voice', 'document', 'text', 'forward')),
    file_url TEXT,
    file_id TEXT, -- Telegram file_id for re-sending
    raw_text TEXT,
    caption TEXT,
    voice_transcript TEXT,

    -- AI Extracted
    extracted_type TEXT CHECK (extracted_type IN ('product', 'faq', 'business_info', 'portfolio', 'service_desc', 'price_list')),
    extracted_confidence DECIMAL(3,2) DEFAULT 0,
    extracted_data JSONB DEFAULT '{}',

    -- Product Fields
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

    -- Inventory
    in_stock BOOLEAN DEFAULT true,
    stock_quantity INT,
    sku TEXT,

    -- Media Gallery
    gallery_urls TEXT[],
    primary_image_index INT DEFAULT 0,

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending_review', 'rejected', 'sold_out', 'archived')),
    rejection_reason TEXT,

    -- Pricing
    price_updated_at TIMESTAMPTZ DEFAULT now(),
    price_expires_at TIMESTAMPTZ,
    auto_expire_days INT DEFAULT 7,

    -- Triggers
    trigger_keywords TEXT[],
    trigger_intents TEXT[],

    -- Owner Interaction
    owner_confirmed BOOLEAN DEFAULT true,
    owner_edited JSONB,
    owner_notes TEXT,

    -- Analytics
    view_count INT DEFAULT 0,
    inquiry_count INT DEFAULT 0,
    conversion_count INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(business_id, slug)
);

CREATE INDEX idx_content_business ON business_content(business_id, status);
CREATE INDEX idx_content_type ON business_content(extracted_type, category, status);
CREATE INDEX idx_content_price ON business_content(price) WHERE status = 'active' AND extracted_type = 'product';
CREATE INDEX idx_content_search ON business_content USING GIN(to_tsvector('simple', COALESCE(name, '') || ' ' || COALESCE(description, '')));

CREATE TRIGGER business_content_audit
    AFTER INSERT OR UPDATE OR DELETE ON business_content
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================================
-- CONVERSATIONS (Unified for all modes)
-- ============================================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),

    -- Customer
    customer_telegram_id BIGINT NOT NULL,
    customer_chat_id BIGINT,
    customer_username TEXT,
    customer_name TEXT,
    customer_phone TEXT,

    -- Message
    customer_message TEXT,
    customer_message_id INT,
    bot_reply TEXT,
    bot_message_id INT,

    -- Mode & Source
    mode_used TEXT NOT NULL CHECK (mode_used IN ('secretary', 'bot', 'fallback_bot', 'owner_reply', 'system')),
    source TEXT CHECK (source IN ('direct', 'search', 'referral', 'inline', 'group')),

    -- AI Analysis
    confidence DECIMAL(5,2),
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'angry', 'excited')),
    intent TEXT,
    intent_confidence DECIMAL(3,2),
    extracted_entities JSONB,
    language_detected TEXT,

    -- Status
    read_by_owner BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    escalated BOOLEAN DEFAULT false,
    escalated_reason TEXT,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,

    -- Content Referenced
    content_shown_ids UUID[],
    product_recommended_ids UUID[],

    -- Reservation
    reservation_code TEXT,
    reservation_expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(business_id, customer_telegram_id, customer_message_id)
);

CREATE INDEX idx_conversations_business ON conversations(business_id, created_at DESC);
CREATE INDEX idx_conversations_customer ON conversations(customer_telegram_id, business_id);
CREATE INDEX idx_conversations_unread ON conversations(business_id, read_by_owner) WHERE read_by_owner = false;
CREATE INDEX idx_conversations_mode ON conversations(mode_used, created_at);

CREATE TRIGGER conversations_audit
    AFTER INSERT OR UPDATE OR DELETE ON conversations
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================================
-- CONVERSATION STATES (Consultant Memory)
-- ============================================================
CREATE TABLE conversation_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    customer_telegram_id BIGINT NOT NULL,

    -- Context
    current_intent TEXT,
    intent_history TEXT[],
    category TEXT,

    -- Qualification
    budget_min DECIMAL(12, 2),
    budget_max DECIMAL(12, 2),
    budget_currency TEXT DEFAULT 'ETB',
    purpose TEXT,
    urgency INT DEFAULT 5,

    -- Preferences
    preferences JSONB DEFAULT '{}',
    brand_preferences TEXT[],
    color_preferences TEXT[],
    size_preferences TEXT[],

    -- Flow
    stage TEXT DEFAULT 'greeting' CHECK (stage IN ('greeting', 'qualifying', 'recommending', 'comparing', 'reserving', 'negotiating', 'closing', 'follow_up')),
    stage_history JSONB DEFAULT '[]',
    last_question TEXT,
    questions_asked TEXT[],

    -- Content Shown
    shown_content_ids UUID[],
    content_interactions JSONB DEFAULT '{}',

    -- Customer Profile
    customer_profile JSONB DEFAULT '{}',
    purchase_history JSONB DEFAULT '[]',

    -- Context from Forward
    context_from_forward JSONB,

    -- Session
    session_started_at TIMESTAMPTZ DEFAULT now(),
    last_activity_at TIMESTAMPTZ DEFAULT now(),
    session_count INT DEFAULT 1,

    UNIQUE(business_id, customer_telegram_id)
);

CREATE INDEX idx_conversation_states_active ON conversation_states(last_activity_at) WHERE last_activity_at > now() - interval '24 hours';

-- ============================================================
-- PENDING REPLIES (Shadow Mode)
-- ============================================================
CREATE TABLE pending_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    conversation_id UUID REFERENCES conversations(id),

    -- Customer
    customer_chat_id BIGINT,
    customer_telegram_id BIGINT,

    -- Messages
    original_message TEXT,
    original_message_id INT,
    suggested_reply TEXT,
    suggested_reply_confidence DECIMAL(3,2),

    -- Owner Action
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'edited', 'rejected', 'expired', 'auto_approved')),
    owner_edited_text TEXT,
    owner_action_at TIMESTAMPTZ,
    owner_action_via TEXT CHECK (owner_action_via IN ('telegram', 'miniapp', 'api')),

    -- Auto-approval
    auto_approve_at TIMESTAMPTZ,
    auto_approved BOOLEAN DEFAULT false,

    -- Learning
    learned_from_this BOOLEAN DEFAULT false,
    added_to_faq BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Expire after 1 hour if not acted
    expires_at TIMESTAMPTZ DEFAULT now() + interval '1 hour'
);

CREATE INDEX idx_pending_replies_business ON pending_replies(business_id, status, created_at);
CREATE INDEX idx_pending_replies_expiry ON pending_replies(expires_at) WHERE status = 'pending';

-- ============================================================
-- SECRETARY WINDOWS (24h Window Tracking)
-- ============================================================
CREATE TABLE secretary_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    customer_telegram_id BIGINT NOT NULL,
    customer_chat_id BIGINT,

    -- Window Tracking
    first_contact_at TIMESTAMPTZ DEFAULT now(),
    last_activity_at TIMESTAMPTZ DEFAULT now(),
    window_expires_at TIMESTAMPTZ,

    -- Fallback
    fallback_used BOOLEAN DEFAULT false,
    fallback_bot_message_id INT,
    fallback_triggered_at TIMESTAMPTZ,
    fallback_reason TEXT,

    -- Stats
    total_messages INT DEFAULT 1,
    total_fallbacks INT DEFAULT 0,

    UNIQUE(business_id, customer_telegram_id)
);

CREATE INDEX idx_secretary_windows_expiry ON secretary_windows(window_expires_at) WHERE window_expires_at IS NOT NULL;
CREATE INDEX idx_secretary_windows_business ON secretary_windows(business_id, customer_telegram_id);

-- ============================================================
-- SEARCH LOGS
-- ============================================================
CREATE TABLE search_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    searcher_telegram_id BIGINT,
    searcher_username TEXT,

    -- Query
    raw_query TEXT NOT NULL,
    normalized_query TEXT,
    parsed_intent JSONB,

    -- Filters Applied
    category_filter TEXT,
    location_filter TEXT,
    budget_min_filter DECIMAL(12, 2),
    budget_max_filter DECIMAL(12, 2),
    verified_only BOOLEAN DEFAULT false,

    -- Results
    results_count INT DEFAULT 0,
    results_business_ids UUID[],
    clicked_business_id UUID,
    clicked_content_id UUID,

    -- Performance
    query_time_ms INT,
    used_gpt BOOLEAN DEFAULT false,

    -- Conversion
    converted_to_conversation BOOLEAN DEFAULT false,
    converted_to_purchase BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_search_logs_query ON search_logs(searcher_telegram_id, created_at);
CREATE INDEX idx_search_logs_converted ON search_logs(converted_to_conversation) WHERE converted_to_conversation = true;

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    customer_telegram_id BIGINT,
    search_log_id UUID REFERENCES search_logs(id),
    conversation_id UUID REFERENCES conversations(id),

    -- Rating
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title TEXT,
    comment TEXT,

    -- Verified
    verified_purchase BOOLEAN DEFAULT false,
    purchase_amount DECIMAL(12, 2),
    purchase_date TIMESTAMPTZ,

    -- Media
    photo_urls TEXT[],

    -- Moderation
    status TEXT DEFAULT 'published' CHECK (status IN ('published', 'pending', 'rejected', 'flagged')),
    moderation_reason TEXT,
    moderated_by UUID,
    moderated_at TIMESTAMPTZ,

    -- Engagement
    helpful_count INT DEFAULT 0,
    report_count INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reviews_business ON reviews(business_id, status, created_at DESC);
CREATE INDEX idx_reviews_rating ON reviews(business_id, rating) WHERE status = 'published';

-- Update business rating trigger
CREATE OR REPLACE FUNCTION update_business_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE businesses
    SET 
        total_reviews = (SELECT COUNT(*) FROM reviews WHERE business_id = NEW.business_id AND status = 'published'),
        average_rating = (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE business_id = NEW.business_id AND status = 'published')
    WHERE id = NEW.business_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_business_rating_trigger
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_business_rating();

-- ============================================================
-- TRANSACTIONS (Payments & Reservations)
-- ============================================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    customer_telegram_id BIGINT,
    conversation_id UUID REFERENCES conversations(id),

    -- Item
    product_id UUID REFERENCES business_content(id),
    product_name TEXT,
    product_price DECIMAL(12, 2),
    quantity INT DEFAULT 1,

    -- Financial
    subtotal DECIMAL(12, 2),
    fee_amount DECIMAL(12, 2),
    fee_percentage DECIMAL(4,2) DEFAULT 2.00,
    total_amount DECIMAL(12, 2),
    currency TEXT DEFAULT 'ETB',

    -- Reservation
    reservation_code TEXT UNIQUE,
    reservation_expires_at TIMESTAMPTZ,

    -- Payment
    payment_method TEXT CHECK (payment_method IN ('cash', 'telebirr', 'chapa', 'bank_transfer', 'escrow')),
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'disputed')),
    payment_reference TEXT,
    paid_at TIMESTAMPTZ,

    -- Escrow
    escrow_released BOOLEAN DEFAULT false,
    escrow_released_at TIMESTAMPTZ,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reserved', 'confirmed', 'completed', 'cancelled', 'disputed', 'refunded')),
    cancellation_reason TEXT,

    -- Dispute
    disputed BOOLEAN DEFAULT false,
    dispute_reason TEXT,
    dispute_resolved_at TIMESTAMPTZ,
    dispute_resolution TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transactions_business ON transactions(business_id, status, created_at);
CREATE INDEX idx_transactions_customer ON transactions(customer_telegram_id, status);
CREATE INDEX idx_transactions_code ON transactions(reservation_code) WHERE reservation_code IS NOT NULL;

-- ============================================================
-- REFERRALS
-- ============================================================
CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_business_id UUID NOT NULL REFERENCES businesses(id),
    to_business_id UUID NOT NULL REFERENCES businesses(id),
    customer_telegram_id BIGINT,

    -- Context
    original_intent TEXT,
    matched_reason TEXT,

    -- Financial
    amount_earned DECIMAL(12, 2) DEFAULT 0,
    amount_paid DECIMAL(12, 2) DEFAULT 0,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'paid', 'expired')),
    converted_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_referrals_from ON referrals(from_business_id, status);
CREATE INDEX idx_referrals_to ON referrals(to_business_id, status);

-- ============================================================
-- BOT POOL
-- ============================================================
CREATE TABLE bot_pool (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_token_hash TEXT NOT NULL UNIQUE, -- Hashed for security
    bot_username TEXT NOT NULL,
    bot_name TEXT,

    -- Assignment
    assigned_to_business_id UUID REFERENCES businesses(id),
    assigned_at TIMESTAMPTZ,

    -- Status
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'suspended', 'revoked')),
    last_used_at TIMESTAMPTZ,

    -- Health
    health_status TEXT DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'warning', 'error')),
    last_error TEXT,
    error_count INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bot_pool_status ON bot_pool(status) WHERE status = 'available';

-- ============================================================
-- ANALYTICS (Time-series)
-- ============================================================
CREATE TABLE analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id),
    date DATE NOT NULL,

    -- Conversations
    total_conversations INT DEFAULT 0,
    auto_replies INT DEFAULT 0,
    shadow_approved INT DEFAULT 0,
    owner_replies INT DEFAULT 0,
    fallback_replies INT DEFAULT 0,

    -- Search
    search_appearances INT DEFAULT 0,
    search_clicks INT DEFAULT 0,

    -- Content
    products_viewed INT DEFAULT 0,
    products_inquired INT DEFAULT 0,
    reservations_made INT DEFAULT 0,

    -- Financial
    leads_generated INT DEFAULT 0,
    lead_value DECIMAL(12, 2) DEFAULT 0,
    fees_earned DECIMAL(12, 2) DEFAULT 0,

    -- Performance
    avg_response_time INT, -- seconds
    customer_satisfaction DECIMAL(2,1),

    UNIQUE(business_id, date)
);

CREATE INDEX idx_analytics_daily ON analytics_daily(business_id, date DESC);

-- ============================================================
-- RLS POLICIES (Row Level Security)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE secretary_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Businesses: Owners can only see their own
CREATE POLICY businesses_owner_isolation ON businesses
    FOR ALL
    USING (owner_telegram_id = current_setting('app.current_user_id', true)::BIGINT);

-- Business Content: Only owner of business
CREATE POLICY content_owner_isolation ON business_content
    FOR ALL
    USING (business_id IN (
        SELECT id FROM businesses 
        WHERE owner_telegram_id = current_setting('app.current_user_id', true)::BIGINT
    ));

-- Conversations: Business owner or customer
CREATE POLICY conversations_access ON conversations
    FOR ALL
    USING (
        business_id IN (
            SELECT id FROM businesses 
            WHERE owner_telegram_id = current_setting('app.current_user_id', true)::BIGINT
        )
        OR customer_telegram_id = current_setting('app.current_user_id', true)::BIGINT
    );

-- Search logs: Only searcher
CREATE POLICY search_logs_access ON search_logs
    FOR ALL
    USING (searcher_telegram_id = current_setting('app.current_user_id', true)::BIGINT);

-- Reviews: Public read, owner can manage theirs
CREATE POLICY reviews_public_read ON reviews
    FOR SELECT
    USING (status = 'published');

CREATE POLICY reviews_owner_manage ON reviews
    FOR ALL
    USING (business_id IN (
        SELECT id FROM businesses 
        WHERE owner_telegram_id = current_setting('app.current_user_id', true)::BIGINT
    ));

-- ============================================================
-- FUNCTIONS & HELPERS
-- ============================================================

-- Update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_business_content_updated_at BEFORE UPDATE ON business_content FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pending_replies_updated_at BEFORE UPDATE ON pending_replies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Calculate reputation score
CREATE OR REPLACE FUNCTION calculate_reputation_score(business_id UUID)
RETURNS INT AS $$
DECLARE
    score INT := 0;
    biz RECORD;
BEGIN
    SELECT * INTO biz FROM businesses WHERE id = business_id;

    -- Verification (max 300)
    score := score + CASE biz.verification_level
        WHEN 'phone_verified' THEN 100
        WHEN 'photo_verified' THEN 200
        WHEN 'human_verified' THEN 300
        WHEN 'premium' THEN 350
        ELSE 0
    END;

    -- Rating (max 250)
    score := score + LEAST((biz.average_rating * 50)::INT, 250);

    -- Response rate (max 150)
    score := score + LEAST((biz.response_rate * 1.5)::INT, 150);

    -- Activity (max 100)
    score := score + CASE 
        WHEN biz.last_active_at > now() - interval '1 day' THEN 100
        WHEN biz.last_active_at > now() - interval '7 days' THEN 70
        WHEN biz.last_active_at > now() - interval '30 days' THEN 40
        ELSE 10
    END;

    -- Content (max 100)
    score := score + LEAST((SELECT COUNT(*) FROM business_content WHERE business_id = biz.id AND status = 'active') * 10, 100);

    -- Reviews (max 100)
    score := score + LEAST(biz.total_reviews * 5, 100);

    RETURN LEAST(score, 1000);
END;
$$ LANGUAGE plpgsql;

-- Auto-update reputation trigger
CREATE OR REPLACE FUNCTION auto_update_reputation()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE businesses 
    SET reputation_score = calculate_reputation_score(NEW.business_id)
    WHERE id = NEW.business_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_reputation_on_review AFTER INSERT OR UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION auto_update_reputation();

-- ============================================================
-- SEED DATA
-- ============================================================

-- Insert default bot pool entries (you'll replace with real tokens)
INSERT INTO bot_pool (bot_token_hash, bot_username, bot_name, status) VALUES
('placeholder_hash_1', 'MiniMeBot1', 'MiniMe Assistant 1', 'available'),
('placeholder_hash_2', 'MiniMeBot2', 'MiniMe Assistant 2', 'available'),
('placeholder_hash_3', 'MiniMeBot3', 'MiniMe Assistant 3', 'available');

-- ============================================================
-- GRANTS
-- ============================================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
