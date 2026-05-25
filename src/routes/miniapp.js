const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Auth middleware for Mini App
const verifyTelegramAuth = (req, res, next) => {
    const { initData } = req.body;

    if (!initData) {
        return res.status(401).json({ error: 'Missing init data' });
    }

    // Verify Telegram WebApp init data
    // Implementation depends on Telegram's validation method
    // For now, basic check
    next();
};

// Get dashboard data
router.post('/dashboard', verifyTelegramAuth, async (req, res) => {
    const { userId } = req.body;
    const { supabase } = req.context;

    try {
        // Get business
        const { data: business } = await supabase
            .from('businesses')
            .select('*')
            .eq('owner_telegram_id', userId)
            .single();

        if (!business) {
            return res.status(404).json({ error: 'Business not found' });
        }

        // Get today's stats
        const today = new Date().toISOString().split('T')[0];
        const { data: todayStats } = await supabase
            .from('analytics_daily')
            .select('*')
            .eq('business_id', business.id)
            .eq('date', today)
            .single();

        // Get unread messages
        const { count: unreadCount } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', business.id)
            .eq('read_by_owner', false);

        // Get pending replies
        const { count: pendingCount } = await supabase
            .from('pending_replies')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', business.id)
            .eq('status', 'pending');

        // Get recent conversations
        const { data: recentConversations } = await supabase
            .from('conversations')
            .select('*')
            .eq('business_id', business.id)
            .order('created_at', { ascending: false })
            .limit(10);

        res.json({
            business,
            stats: todayStats || {},
            unreadCount: unreadCount || 0,
            pendingCount: pendingCount || 0,
            recentConversations: recentConversations || []
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// Get inbox
router.post('/inbox', verifyTelegramAuth, async (req, res) => {
    const { userId, filter = 'all', page = 1, limit = 20 } = req.body;
    const { supabase } = req.context;

    try {
        const { data: business } = await supabase
            .from('businesses')
            .select('id')
            .eq('owner_telegram_id', userId)
            .single();

        if (!business) return res.status(404).json({ error: 'Business not found' });

        let query = supabase
            .from('conversations')
            .select('*')
            .eq('business_id', business.id);

        if (filter === 'unread') {
            query = query.eq('read_by_owner', false);
        } else if (filter === 'pending') {
            query = query.eq('resolved', false);
        }

        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        res.json({ conversations: data || [], total: count || 0 });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load inbox' });
    }
});

// Get products
router.post('/products', verifyTelegramAuth, async (req, res) => {
    const { userId, status = 'active', page = 1, limit = 20 } = req.body;
    const { supabase } = req.context;

    try {
        const { data: business } = await supabase
            .from('businesses')
            .select('id')
            .eq('owner_telegram_id', userId)
            .single();

        if (!business) return res.status(404).json({ error: 'Business not found' });

        const { data, count } = await supabase
            .from('business_content')
            .select('*', { count: 'exact' })
            .eq('business_id', business.id)
            .eq('status', status)
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        res.json({ products: data || [], total: count || 0 });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load products' });
    }
});

// Update product
router.post('/products/update', verifyTelegramAuth, async (req, res) => {
    const { userId, productId, updates } = req.body;
    const { supabase, auditService } = req.context;

    try {
        const { data: business } = await supabase
            .from('businesses')
            .select('id')
            .eq('owner_telegram_id', userId)
            .single();

        if (!business) return res.status(404).json({ error: 'Business not found' });

        // Verify product belongs to business
        const { data: product } = await supabase
            .from('business_content')
            .select('*')
            .eq('id', productId)
            .eq('business_id', business.id)
            .single();

        if (!product) return res.status(403).json({ error: 'Not authorized' });

        const { data: updated } = await supabase
            .from('business_content')
            .update({
                ...updates,
                price_updated_at: updates.price ? new Date().toISOString() : undefined
            })
            .eq('id', productId)
            .select()
            .single();

        await auditService.log({
            tableName: 'business_content',
            recordId: productId,
            action: 'UPDATE',
            oldData: product,
            newData: updated,
            actorTelegramId: userId
        });

        res.json({ success: true, product: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Get analytics
router.post('/analytics', verifyTelegramAuth, async (req, res) => {
    const { userId, period = '7d' } = req.body;
    const { supabase } = req.context;

    try {
        const { data: business } = await supabase
            .from('businesses')
            .select('id')
            .eq('owner_telegram_id', userId)
            .single();

        if (!business) return res.status(404).json({ error: 'Business not found' });

        const days = parseInt(period) || 7;
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const { data } = await supabase
            .from('analytics_daily')
            .select('*')
            .eq('business_id', business.id)
            .gte('date', startDate)
            .order('date', { ascending: true });

        // Calculate totals
        const totals = (data || []).reduce((acc, day) => ({
            conversations: (acc.conversations || 0) + (day.total_conversations || 0),
            autoReplies: (acc.autoReplies || 0) + (day.auto_replies || 0),
            leads: (acc.leads || 0) + (day.leads_generated || 0),
            fees: (acc.fees || 0) + (day.fees_earned || 0)
        }), {});

        res.json({ daily: data || [], totals });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load analytics' });
    }
});

// Update settings
router.post('/settings', verifyTelegramAuth, async (req, res) => {
    const { userId, settings } = req.body;
    const { supabase, auditService } = req.context;

    try {
        const { data: business } = await supabase
            .from('businesses')
            .select('*')
            .eq('owner_telegram_id', userId)
            .single();

        if (!business) return res.status(404).json({ error: 'Business not found' });

        const { data: updated } = await supabase
            .from('businesses')
            .update({
                rules: { ...business.rules, ...settings },
                primary_mode: settings.primaryMode || business.primary_mode,
                fallback_to_bot: settings.fallbackToBot !== undefined ? settings.fallbackToBot : business.fallback_to_bot,
                fallback_after_minutes: settings.fallbackAfterMinutes || business.fallback_after_minutes
            })
            .eq('id', business.id)
            .select()
            .single();

        await auditService.log({
            tableName: 'businesses',
            recordId: business.id,
            action: 'UPDATE',
            oldData: business,
            newData: updated,
            actorTelegramId: userId
        });

        res.json({ success: true, settings: updated.rules });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

module.exports = router;
