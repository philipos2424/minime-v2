-- ============================================================
-- ANALYTICS & REPORTING MIGRATION
-- ============================================================

-- Hourly analytics (for real-time dashboards)
CREATE TABLE IF NOT EXISTS analytics_hourly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id),
    hour TIMESTAMPTZ NOT NULL,

    -- Conversations
    conversations_count INT DEFAULT 0,
    bot_replies_count INT DEFAULT 0,
    owner_replies_count INT DEFAULT 0,
    fallback_replies_count INT DEFAULT 0,
    avg_response_time_seconds INT,

    -- Search
    search_appearances INT DEFAULT 0,
    search_clicks INT DEFAULT 0,

    -- Content
    product_views INT DEFAULT 0,
    product_inquiries INT DEFAULT 0,

    -- Engagement
    unique_customers INT DEFAULT 0,
    returning_customers INT DEFAULT 0,

    -- Financial
    reservations_count INT DEFAULT 0,
    reservations_value DECIMAL(12, 2) DEFAULT 0,
    completed_sales_count INT DEFAULT 0,
    completed_sales_value DECIMAL(12, 2) DEFAULT 0,
    fees_earned DECIMAL(12, 2) DEFAULT 0,

    UNIQUE(business_id, hour)
);

CREATE INDEX IF NOT EXISTS idx_analytics_hourly ON analytics_hourly(business_id, hour DESC);

-- Monthly analytics (for reporting)
CREATE TABLE IF NOT EXISTS analytics_monthly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id),
    year INT NOT NULL,
    month INT NOT NULL,

    -- Aggregated from daily
    total_conversations INT DEFAULT 0,
    total_auto_replies INT DEFAULT 0,
    total_owner_replies INT DEFAULT 0,
    total_fallback_replies INT DEFAULT 0,
    avg_response_time_seconds INT,

    -- Search
    total_search_appearances INT DEFAULT 0,
    total_search_clicks INT DEFAULT 0,
    search_ctr DECIMAL(5,2),

    -- Content
    total_product_views INT DEFAULT 0,
    total_product_inquiries INT DEFAULT 0,
    product_conversion_rate DECIMAL(5,2),

    -- Customers
    unique_customers INT DEFAULT 0,
    returning_customers INT DEFAULT 0,
    customer_retention_rate DECIMAL(5,2),

    -- Financial
    total_reservations INT DEFAULT 0,
    total_reservations_value DECIMAL(12, 2) DEFAULT 0,
    total_completed_sales INT DEFAULT 0,
    total_completed_sales_value DECIMAL(12, 2) DEFAULT 0,
    total_fees_earned DECIMAL(12, 2) DEFAULT 0,
    avg_order_value DECIMAL(12, 2),

    -- Reputation
    new_reviews INT DEFAULT 0,
    avg_rating DECIMAL(2,1),
    reputation_score_change INT DEFAULT 0,

    UNIQUE(business_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_analytics_monthly ON analytics_monthly(business_id, year DESC, month DESC);

-- Customer analytics (per business-customer pair)
CREATE TABLE IF NOT EXISTS customer_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    customer_telegram_id BIGINT NOT NULL,

    -- Engagement
    first_contact_at TIMESTAMPTZ,
    last_contact_at TIMESTAMPTZ,
    total_conversations INT DEFAULT 0,
    total_messages_sent INT DEFAULT 0,

    -- Interests
    viewed_products UUID[],
    inquired_products UUID[],
    reserved_products UUID[],
    purchased_products UUID[],

    -- Preferences (learned over time)
    preferred_categories TEXT[],
    price_range_min DECIMAL(12, 2),
    price_range_max DECIMAL(12, 2),
    preferred_brands TEXT[],
    preferred_payment_method TEXT,

    -- Value
    total_spent DECIMAL(12, 2) DEFAULT 0,
    avg_order_value DECIMAL(12, 2),
    lifetime_value DECIMAL(12, 2) DEFAULT 0,

    -- Status
    customer_segment TEXT DEFAULT 'new' CHECK (customer_segment IN ('new', 'engaged', 'loyal', 'at_risk', 'dormant')),

    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(business_id, customer_telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_analytics ON customer_analytics(business_id, customer_segment);
CREATE INDEX IF NOT EXISTS idx_customer_analytics_value ON customer_analytics(business_id, lifetime_value DESC);

-- Product analytics
CREATE TABLE IF NOT EXISTS product_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES business_content(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id),

    -- Views
    total_views INT DEFAULT 0,
    unique_viewers INT DEFAULT 0,

    -- Engagement
    total_inquiries INT DEFAULT 0,
    total_reservations INT DEFAULT 0,
    total_purchases INT DEFAULT 0,

    -- Conversion
    inquiry_rate DECIMAL(5,2),
    reservation_rate DECIMAL(5,2),
    purchase_rate DECIMAL(5,2),

    -- Revenue
    revenue_generated DECIMAL(12, 2) DEFAULT 0,

    -- Time-based
    views_last_7d INT DEFAULT 0,
    views_last_30d INT DEFAULT 0,
    inquiries_last_7d INT DEFAULT 0,
    inquiries_last_30d INT DEFAULT 0,

    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_analytics ON product_analytics(product_id);
CREATE INDEX IF NOT EXISTS idx_product_analytics_business ON product_analytics(business_id, total_views DESC);

-- Search analytics (what people search for)
CREATE TABLE IF NOT EXISTS search_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_text TEXT NOT NULL,
    normalized_query TEXT,
    query_category TEXT,

    -- Volume
    search_count INT DEFAULT 1,
    unique_searchers INT DEFAULT 0,

    -- Results
    avg_results_count INT,
    zero_results_count INT DEFAULT 0,

    -- Conversion
    click_through_count INT DEFAULT 0,
    conversation_count INT DEFAULT 0,
    purchase_count INT DEFAULT 0,

    -- Trending
    trending_score DECIMAL(10,2) DEFAULT 0,
    last_searched_at TIMESTAMPTZ DEFAULT now(),

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(normalized_query)
);

CREATE INDEX IF NOT EXISTS idx_search_analytics ON search_analytics(trending_score DESC, last_searched_at DESC);

-- Function to update product analytics
CREATE OR REPLACE FUNCTION update_product_analytics()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO product_analytics (product_id, business_id, total_views, updated_at)
    VALUES (NEW.id, NEW.business_id, 0, now())
    ON CONFLICT (product_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_analytics_init
    AFTER INSERT ON business_content
    FOR EACH ROW
    EXECUTE FUNCTION update_product_analytics();

-- Function to calculate trending score
CREATE OR REPLACE FUNCTION calculate_trending_score()
RETURNS TRIGGER AS $$
BEGIN
    NEW.trending_score := (
        NEW.search_count * 1.0 +
        NEW.click_through_count * 5.0 +
        NEW.conversation_count * 10.0 +
        NEW.purchase_count * 20.0
    ) / EXTRACT(EPOCH FROM (now() - NEW.created_at)) / 3600 * 24;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trending_score
    BEFORE INSERT OR UPDATE ON search_analytics
    FOR EACH ROW
    EXECUTE FUNCTION calculate_trending_score();
