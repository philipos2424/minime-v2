-- ============================================================
-- PAYMENT & ESCROW MIGRATION
-- ============================================================

-- Payment methods configuration per business
CREATE TABLE IF NOT EXISTS business_payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('cash', 'telebirr', 'chapa', 'bank_transfer', 'escrow')),
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    config JSONB DEFAULT '{}', -- API keys, account numbers, etc (encrypted)
    processing_fee DECIMAL(4,2) DEFAULT 0,
    settlement_time TEXT DEFAULT 'instant', -- 'instant', '24h', '7d'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(business_id, method)
);

CREATE INDEX IF NOT EXISTS idx_business_payment_methods ON business_payment_methods(business_id, is_active);

-- Payment transactions (detailed)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_transaction_id UUID REFERENCES transactions(id),

    -- Payer info
    payer_telegram_id BIGINT,
    payer_name TEXT,
    payer_phone TEXT,
    payer_email TEXT,

    -- Payee info
    business_id UUID NOT NULL REFERENCES businesses(id),
    business_name TEXT,

    -- Amount breakdown
    subtotal DECIMAL(12, 2) NOT NULL,
    discount_amount DECIMAL(12, 2) DEFAULT 0,
    discount_code TEXT,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    platform_fee DECIMAL(12, 2) DEFAULT 0,
    platform_fee_percentage DECIMAL(4,2) DEFAULT 2.00,
    payment_processing_fee DECIMAL(12, 2) DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL,
    currency TEXT DEFAULT 'ETB',

    -- Payment method
    method TEXT NOT NULL,
    provider TEXT, -- 'chapa', 'telebirr', 'manual'
    provider_reference TEXT,
    provider_response JSONB,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'authorized', 'captured', 'completed', 'failed', 'refunded', 'partially_refunded', 'disputed', 'cancelled')),

    -- Timestamps
    authorized_at TIMESTAMPTZ,
    captured_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    refunded_at TIMESTAMPTZ,
    refund_amount DECIMAL(12, 2),
    refund_reason TEXT,

    -- Metadata
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_business ON payment_transactions(business_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_payer ON payment_transactions(payer_telegram_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider ON payment_transactions(provider_reference) WHERE provider_reference IS NOT NULL;

-- Escrow accounts
CREATE TABLE IF NOT EXISTS escrow_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    business_id UUID NOT NULL REFERENCES businesses(id),
    customer_telegram_id BIGINT NOT NULL,

    -- Escrow details
    amount DECIMAL(12, 2) NOT NULL,
    currency TEXT DEFAULT 'ETB',
    fee DECIMAL(12, 2) DEFAULT 0,

    -- Status
    status TEXT DEFAULT 'held' CHECK (status IN ('held', 'released', 'disputed', 'refunded')),

    -- Release conditions
    release_conditions JSONB DEFAULT '{}',
    auto_release_at TIMESTAMPTZ,

    -- Release info
    released_at TIMESTAMPTZ,
    released_by UUID,
    release_reason TEXT,

    -- Dispute
    disputed_at TIMESTAMPTZ,
    dispute_reason TEXT,
    dispute_resolved_at TIMESTAMPTZ,
    dispute_resolution TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escrow_transactions ON escrow_accounts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_escrow_business ON escrow_accounts(business_id, status);
CREATE INDEX IF NOT EXISTS idx_escrow_auto_release ON escrow_accounts(auto_release_at) WHERE status = 'held';

-- Payouts to businesses
CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),

    -- Amount
    amount DECIMAL(12, 2) NOT NULL,
    currency TEXT DEFAULT 'ETB',
    platform_fee_deducted DECIMAL(12, 2) DEFAULT 0,
    net_amount DECIMAL(12, 2) NOT NULL,

    -- Method
    method TEXT NOT NULL,
    destination_account TEXT, -- Bank account, Telebirr number, etc
    destination_bank TEXT,
    destination_name TEXT,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    provider_reference TEXT,
    provider_response JSONB,

    -- Timestamps
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,

    -- Period covered
    period_start DATE,
    period_end DATE,
    transaction_count INT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_business ON payouts(business_id, status, created_at);

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_payment_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION update_payment_timestamps();
CREATE TRIGGER update_escrow_accounts_updated_at BEFORE UPDATE ON escrow_accounts FOR EACH ROW EXECUTE FUNCTION update_payment_timestamps();
CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION update_payment_timestamps();
