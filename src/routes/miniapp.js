const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// ── Verify Telegram WebApp initData ────────────────────────────────────────
function verifyInitData(initData, botToken) {
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return null;
        params.delete('hash');
        const dataCheckString = [...params.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');
        const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
        if (calc !== hash) return null;
        const userParam = params.get('user');
        return userParam ? JSON.parse(userParam) : null;
    } catch { return null; }
}

const auth = (req, res, next) => {
    const { initData, userId } = req.body;
    if (!initData && !userId) return res.status(401).json({ error: 'Missing auth' });
    if (initData) {
        const tgUser = verifyInitData(initData, req.context.config.TELEGRAM_BOT_TOKEN);
        if (tgUser) {
            req.tgUser = tgUser;
            req.userId = tgUser.id;
            return next();
        }
    }
    // Fallback for testing: trust userId in body
    req.userId = Number(userId);
    next();
};

async function getBusiness(supabase, userId) {
    const { data } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_telegram_id', userId)
        .single();
    return data;
}

// ── /miniapp/auth — issue a simple session token ──────────────────────────
router.post('/auth', auth, async (req, res) => {
    const business = await getBusiness(req.context.supabase, req.userId);
    res.json({
        token: 'tg-' + req.userId,
        user: req.tgUser,
        business: business || null
    });
});

// ── /miniapp/dashboard ─────────────────────────────────────────────────────
router.post('/dashboard', auth, async (req, res) => {
    const { supabase } = req.context;
    try {
        const business = await getBusiness(supabase, req.userId);
        if (!business) return res.status(404).json({ error: 'Business not found. Send /start to @MiniMeAgentBot first.' });

        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayISO = todayStart.toISOString();

        // Real data from v1 schema: customers + messages
        const [
            { count: totalCustomers },
            { count: todayMessageCount },
            { count: pendingCount },
            { data: recentConversations },
            { count: totalProducts }
        ] = await Promise.all([
            supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
            supabase.from('messages').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', todayISO),
            supabase.from('pending_replies').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'pending'),
            // Get recent conversations joined with customer + latest message
            supabase
                .from('conversations')
                .select('id, last_message_at, message_count, requires_owner, customers(name, telegram_id, total_orders, last_active_at)')
                .eq('business_id', business.id)
                .order('last_message_at', { ascending: false })
                .limit(10),
            supabase.from('products').select('id', { count: 'exact', head: true }).eq('business_id', business.id)
        ]);

        // For each recent convo, get the latest message preview
        const enrichedConvos = await Promise.all((recentConversations || []).map(async (c) => {
            const { data: lastMsg } = await supabase
                .from('messages')
                .select('content, direction, created_at, is_ai_generated')
                .eq('conversation_id', c.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            return {
                id: c.id,
                customer_name: c.customers?.name || 'Customer',
                customer_telegram_id: c.customers?.telegram_id,
                customer_message: lastMsg?.content || '',
                bot_reply: null,
                mode_used: lastMsg?.is_ai_generated ? 'bot' : 'owner_reply',
                read_by_owner: !c.requires_owner,
                created_at: c.last_message_at,
                confidence: null
            };
        }));

        const unreadCount = enrichedConvos.filter(c => !c.read_by_owner).length;

        res.json({
            business,
            stats: {
                total_conversations: todayMessageCount || 0,
                total_customers: totalCustomers || 0,
                total_products: totalProducts || 0
            },
            unreadCount,
            pendingCount: pendingCount || 0,
            recentConversations: enrichedConvos
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

// ── /miniapp/inbox ─────────────────────────────────────────────────────────
router.post('/inbox', auth, async (req, res) => {
    const { supabase } = req.context;
    try {
        const business = await getBusiness(supabase, req.userId);
        if (!business) return res.status(404).json({ error: 'Business not found' });

        const { data: convos } = await supabase
            .from('conversations')
            .select('id, last_message_at, requires_owner, message_count, customers(id, name, telegram_id, last_active_at, total_orders)')
            .eq('business_id', business.id)
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(50);

        // Fetch the latest message for each
        const conversations = await Promise.all((convos || []).map(async (c) => {
            const { data: lastMsg } = await supabase
                .from('messages')
                .select('content, direction, is_ai_generated, created_at')
                .eq('conversation_id', c.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            return {
                id: c.id,
                customer_id: c.customers?.id,
                customer_name: c.customers?.name || 'Customer',
                customer_telegram_id: c.customers?.telegram_id,
                customer_message: lastMsg?.content || '',
                mode_used: lastMsg?.is_ai_generated ? 'bot' : 'owner_reply',
                read_by_owner: !c.requires_owner,
                created_at: c.last_message_at,
                message_count: c.message_count
            };
        }));

        res.json({ conversations });
    } catch (error) {
        console.error('Inbox error:', error);
        res.status(500).json({ error: 'Failed to load inbox' });
    }
});

// ── /miniapp/conversation — full message thread ───────────────────────────
router.post('/conversation', auth, async (req, res) => {
    const { supabase } = req.context;
    const { conversationId } = req.body;
    try {
        const business = await getBusiness(supabase, req.userId);
        if (!business) return res.status(404).json({ error: 'Business not found' });
        if (!conversationId) return res.status(400).json({ error: 'conversationId required' });

        const [{ data: conv }, { data: messages }] = await Promise.all([
            supabase
                .from('conversations')
                .select('id, last_message_at, requires_owner, message_count, customers(id, name, telegram_id, total_orders, total_spent, last_active_at)')
                .eq('id', conversationId)
                .eq('business_id', business.id)
                .single(),
            supabase
                .from('messages')
                .select('id, direction, content, is_ai_generated, ai_confidence, owner_edited, created_at, telegram_message_id')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true })
                .limit(200)
        ]);

        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        // Mark as read
        await supabase
            .from('conversations')
            .update({ requires_owner: false })
            .eq('id', conversationId)
            .eq('business_id', business.id);

        res.json({
            conversation: {
                id: conv.id,
                customer_name: conv.customers?.name || 'Customer',
                customer_telegram_id: conv.customers?.telegram_id,
                total_orders: conv.customers?.total_orders || 0,
                total_spent: conv.customers?.total_spent || 0,
                message_count: conv.message_count
            },
            messages: messages || []
        });
    } catch (error) {
        console.error('Conversation error:', error);
        res.status(500).json({ error: 'Failed to load conversation' });
    }
});

// ── /miniapp/customers ─────────────────────────────────────────────────────
router.post('/customers', auth, async (req, res) => {
    const { supabase } = req.context;
    try {
        const business = await getBusiness(supabase, req.userId);
        if (!business) return res.status(404).json({ error: 'Business not found' });

        const { data: customers } = await supabase
            .from('customers')
            .select('id, name, telegram_id, total_orders, total_spent, last_active_at, created_at, phone, mood, tier')
            .eq('business_id', business.id)
            .order('last_active_at', { ascending: false, nullsFirst: false })
            .limit(100);

        res.json({ customers: customers || [] });
    } catch (error) {
        console.error('Customers error:', error);
        res.status(500).json({ error: 'Failed to load customers' });
    }
});

// ── /miniapp/products ──────────────────────────────────────────────────────
router.post('/products', auth, async (req, res) => {
    const { supabase } = req.context;
    try {
        const business = await getBusiness(supabase, req.userId);
        if (!business) return res.status(404).json({ error: 'Business not found' });

        // Try v1 schema (products) first, fall back to v2 schema (business_content)
        const { data: v1Products } = await supabase
            .from('products')
            .select('*')
            .eq('business_id', business.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(100);

        if (v1Products?.length) {
            return res.json({
                products: v1Products.map(p => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    price: p.price,
                    currency: p.currency || 'ETB',
                    category: p.category,
                    tags: p.tags || [],
                    stock_quantity: p.stock_quantity,
                    in_stock: p.stock_quantity == null || p.stock_quantity > 0,
                    image_url: p.image_url,
                    status: 'active'
                }))
            });
        }

        // v2 fallback
        const { data: v2Products } = await supabase
            .from('business_content')
            .select('*')
            .eq('business_id', business.id)
            .eq('extracted_type', 'product')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(100);

        res.json({ products: v2Products || [] });
    } catch (error) {
        console.error('Products error:', error);
        res.status(500).json({ error: 'Failed to load products' });
    }
});

// ── /miniapp/analytics ─────────────────────────────────────────────────────
router.post('/analytics', auth, async (req, res) => {
    const { supabase } = req.context;
    const { period = '7d' } = req.body;
    try {
        const business = await getBusiness(supabase, req.userId);
        if (!business) return res.status(404).json({ error: 'Business not found' });

        const days = period === '30d' ? 30 : period === '90d' ? 90 : 7;
        const since = new Date(Date.now() - days * 86400000);

        const [
            { count: totalMessages },
            { count: aiReplies },
            { count: ownerReplies },
            { count: totalCustomers },
            { count: newCustomers },
            { count: ordersCount }
        ] = await Promise.all([
            supabase.from('messages').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', since.toISOString()),
            supabase.from('messages').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', since.toISOString()).eq('is_ai_generated', true),
            supabase.from('messages').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', since.toISOString()).eq('direction', 'outbound').eq('is_ai_generated', false),
            supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', business.id),
            supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', since.toISOString()),
            supabase.from('orders').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', since.toISOString())
        ]);

        // Daily breakdown
        const { data: dailyMsgs } = await supabase
            .from('messages')
            .select('created_at, is_ai_generated')
            .eq('business_id', business.id)
            .gte('created_at', since.toISOString())
            .limit(2000);

        const dailyMap = {};
        (dailyMsgs || []).forEach(m => {
            const day = m.created_at.split('T')[0];
            if (!dailyMap[day]) dailyMap[day] = { date: day, total_conversations: 0, auto_replies: 0, leads_generated: 0 };
            dailyMap[day].total_conversations++;
            if (m.is_ai_generated) dailyMap[day].auto_replies++;
        });

        const daily = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
            daily.push(dailyMap[d] || { date: d, total_conversations: 0, auto_replies: 0, leads_generated: 0 });
        }

        res.json({
            daily,
            totals: {
                conversations: totalMessages || 0,
                autoReplies: aiReplies || 0,
                ownerReplies: ownerReplies || 0,
                customers: totalCustomers || 0,
                newCustomers: newCustomers || 0,
                orders: ordersCount || 0,
                leads: newCustomers || 0,
                fees: 0
            }
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to load analytics', daily: [], totals: {} });
    }
});

// ── /miniapp/settings — update persona ─────────────────────────────────────
router.post('/settings', auth, async (req, res) => {
    const { supabase } = req.context;
    const { assistant_name, tone, language_preference, shadow_mode } = req.body;
    try {
        const business = await getBusiness(supabase, req.userId);
        if (!business) return res.status(404).json({ error: 'Business not found' });

        const updates = {};
        if (assistant_name) updates.assistant_name = assistant_name.slice(0, 30);
        if (tone) updates.tone = tone;
        if (language_preference) updates.language_preference = language_preference;
        if (typeof shadow_mode === 'boolean') {
            updates.rules = { ...(business.rules || {}), shadow_mode };
        }

        const { data } = await supabase
            .from('businesses')
            .update(updates)
            .eq('id', business.id)
            .select()
            .single();

        res.json({ business: data });
    } catch (error) {
        console.error('Settings update error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

module.exports = router;
