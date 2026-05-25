const express = require('express');
const router = express.Router();

// Admin middleware - check if user is admin
async function adminAuth(req, res, next) {
    const { supabase } = req.context;
    const userId = req.telegramUser?.id;

    // Check if user is admin (you'd have an admins table or check a flag)
    const { data: admin } = await supabase
        .from('admin_users')
        .select('*')
        .eq('telegram_id', userId)
        .single();

    if (!admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }

    req.isAdmin = true;
    req.adminLevel = admin.level; // 'super', 'support', 'moderator'
    next();
}

// Get dashboard stats
router.get('/dashboard', adminAuth, async (req, res) => {
    try {
        const { supabase } = req.context;

        // Total businesses
        const { count: totalBusinesses } = await supabase
            .from('businesses')
            .select('*', { count: 'exact', head: true });

        // Active today
        const today = new Date().toISOString().split('T')[0];
        const { count: activeToday } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today);

        // Total conversations
        const { count: totalConversations } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true });

        // Revenue (fees earned)
        const { data: revenue } = await supabase
            .from('analytics_daily')
            .select('fees_earned')
            .order('date', { ascending: false })
            .limit(30);

        const totalRevenue = revenue?.reduce((sum, r) => sum + (r.fees_earned || 0), 0) || 0;

        // Recent signups
        const { data: recentSignups } = await supabase
            .from('businesses')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        // Pending verifications
        const { count: pendingVerifications } = await supabase
            .from('businesses')
            .select('*', { count: 'exact', head: true })
            .eq('verified', false)
            .eq('status', 'active');

        res.json({
            stats: {
                totalBusinesses,
                activeToday,
                totalConversations,
                totalRevenue,
                pendingVerifications
            },
            recentSignups,
            growth: {
                businessesThisWeek: 0, // Calculate from data
                conversationsThisWeek: 0,
                revenueThisWeek: 0
            }
        });

    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all businesses with filters
router.get('/businesses', adminAuth, async (req, res) => {
    try {
        const { supabase } = req.context;
        const { status, verified, category, search, page = 1, limit = 50 } = req.query;

        let query = supabase
            .from('businesses')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (status) query = query.eq('status', status);
        if (verified !== undefined) query = query.eq('verified', verified === 'true');
        if (category) query = query.eq('category', category);
        if (search) query = query.or(`business_name.ilike.%${search}%,owner_telegram_username.ilike.%${search}%`);

        const { data, count, error } = await query;

        if (error) throw error;

        res.json({
            businesses: data || [],
            total: count || 0,
            page: parseInt(page),
            pages: Math.ceil((count || 0) / limit)
        });

    } catch (error) {
        console.error('Admin businesses error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get business details
router.get('/businesses/:id', adminAuth, async (req, res) => {
    try {
        const { supabase } = req.context;
        const { id } = req.params;

        const { data: business } = await supabase
            .from('businesses')
            .select('*')
            .eq('id', id)
            .single();

        if (!business) {
            return res.status(404).json({ error: 'Business not found' });
        }

        // Get conversations
        const { data: conversations } = await supabase
            .from('conversations')
            .select('*')
            .eq('business_id', id)
            .order('created_at', { ascending: false })
            .limit(50);

        // Get products
        const { data: products } = await supabase
            .from('business_content')
            .select('*')
            .eq('business_id', id)
            .order('created_at', { ascending: false });

        // Get analytics
        const { data: analytics } = await supabase
            .from('analytics_daily')
            .select('*')
            .eq('business_id', id)
            .order('date', { ascending: false })
            .limit(30);

        res.json({
            business,
            conversations: conversations || [],
            products: products || [],
            analytics: analytics || []
        });

    } catch (error) {
        console.error('Admin business detail error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update business status
router.put('/businesses/:id/status', adminAuth, async (req, res) => {
    try {
        const { supabase, auditService } = req.context;
        const { id } = req.params;
        const { status, reason } = req.body;

        const { data, error } = await supabase
            .from('businesses')
            .update({
                status,
                suspension_reason: reason,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Audit log
        await auditService.log({
            tableName: 'businesses',
            recordId: id,
            action: 'UPDATE',
            newData: { status, reason },
            actorTelegramId: req.telegramUser?.id,
            severity: 'warning'
        });

        res.json({ business: data });

    } catch (error) {
        console.error('Admin update status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify business
router.put('/businesses/:id/verify', adminAuth, async (req, res) => {
    try {
        const { supabase, auditService } = req.context;
        const { id } = req.params;
        const { level, method } = req.body;

        const { data, error } = await supabase
            .from('businesses')
            .update({
                verified: true,
                verification_level: level,
                verification_method: method,
                verified_at: new Date().toISOString(),
                verified_by: req.telegramUser?.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        await auditService.log({
            tableName: 'businesses',
            recordId: id,
            action: 'UPDATE',
            newData: { verified: true, level, method },
            actorTelegramId: req.telegramUser?.id,
            severity: 'info'
        });

        res.json({ business: data });

    } catch (error) {
        console.error('Admin verify error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get audit logs
router.get('/audit-logs', adminAuth, async (req, res) => {
    try {
        const { supabase } = req.context;
        const { severity, table, page = 1, limit = 100 } = req.query;

        let query = supabase
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);

        if (severity) query = query.eq('severity', severity);
        if (table) query = query.eq('table_name', table);

        const { data, error } = await query;

        if (error) throw error;

        res.json({ logs: data || [] });

    } catch (error) {
        console.error('Admin audit logs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get system health
router.get('/health', adminAuth, async (req, res) => {
    try {
        const { supabase } = req.context;

        // Database health
        const dbStart = Date.now();
        await supabase.from('businesses').select('count', { count: 'exact', head: true });
        const dbLatency = Date.now() - dbStart;

        // Bot health (from app locals)
        const { botManager } = req.app.locals;
        const botHealth = {
            mainBot: !!botManager?.mainBot,
            searchBot: !!botManager?.searchBot,
            businessBots: botManager?.getBotCount() || 0
        };

        // Recent errors
        const { data: recentErrors } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('severity', 'critical')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(10);

        res.json({
            database: {
                status: dbLatency < 1000 ? 'healthy' : 'slow',
                latency: dbLatency
            },
            bots: botHealth,
            recentErrors: recentErrors || [],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Admin health error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Data export (GDPR compliance)
router.get('/export/:businessId', adminAuth, async (req, res) => {
    try {
        const { supabase } = req.context;
        const { businessId } = req.params;

        // Get all data for a business
        const [
            { data: business },
            { data: content },
            { data: conversations },
            { data: transactions },
            { data: reviews }
        ] = await Promise.all([
            supabase.from('businesses').select('*').eq('id', businessId).single(),
            supabase.from('business_content').select('*').eq('business_id', businessId),
            supabase.from('conversations').select('*').eq('business_id', businessId),
            supabase.from('transactions').select('*').eq('business_id', businessId),
            supabase.from('reviews').select('*').eq('business_id', businessId)
        ]);

        const exportData = {
            exported_at: new Date().toISOString(),
            business,
            content: content || [],
            conversations: conversations || [],
            transactions: transactions || [],
            reviews: reviews || []
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="export-${businessId}.json"`);
        res.json(exportData);

    } catch (error) {
        console.error('Admin export error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete business (GDPR right to deletion)
router.delete('/businesses/:id', adminAuth, async (req, res) => {
    try {
        const { supabase, auditService } = req.context;
        const { id } = req.params;
        const { reason } = req.body;

        // First export data for compliance
        // Then anonymize instead of hard delete
        const { data, error } = await supabase
            .from('businesses')
            .update({
                status: 'deleted',
                business_name: '[DELETED]',
                description: null,
                owner_telegram_id: null,
                owner_telegram_username: null,
                owner_phone: null,
                bot_username: null,
                secretary_username: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        await auditService.log({
            tableName: 'businesses',
            recordId: id,
            action: 'DELETE',
            newData: { reason, anonymized: true },
            actorTelegramId: req.telegramUser?.id,
            severity: 'critical'
        });

        res.json({ success: true, message: 'Business data anonymized' });

    } catch (error) {
        console.error('Admin delete error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
