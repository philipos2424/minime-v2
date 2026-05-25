const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
    const { supabase, config } = req.context;
    const botManager = req.app.locals.botManager;

    try {
        // Check database
        const { error: dbError } = await supabase
            .from('businesses')
            .select('id')
            .limit(1);

        const dbHealthy = !dbError;

        // Check bots
        const botCount = botManager ? botManager.getBotCount() : 0;

        // Check OpenAI
        const openAIHealthy = !!config.OPENAI_API_KEY;

        const healthy = dbHealthy && openAIHealthy;

        res.status(healthy ? 200 : 503).json({
            status: healthy ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            checks: {
                database: dbHealthy ? 'up' : 'down',
                bots: {
                    status: botCount > 0 ? 'up' : 'down',
                    count: botCount
                },
                openai: openAIHealthy ? 'configured' : 'missing_key',
                uptime: process.uptime()
            }
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/detailed', async (req, res) => {
    const { supabase, auditService } = req.context;
    const botManager = req.app.locals.botManager;

    try {
        // Get system stats
        const { count: totalBusinesses } = await supabase
            .from('businesses')
            .select('*', { count: 'exact', head: true });

        const { count: activeBusinesses } = await supabase
            .from('businesses')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');

        const { count: todayConversations } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', new Date().toISOString().split('T')[0]);

        const { count: pendingReplies } = await supabase
            .from('pending_replies')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        const { count: totalProducts } = await supabase
            .from('business_content')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');

        // Get recent errors
        const { data: recentErrors } = await auditService.getRecentLogs(10, 'critical');

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            stats: {
                totalBusinesses: totalBusinesses || 0,
                activeBusinesses: activeBusinesses || 0,
                todayConversations: todayConversations || 0,
                pendingReplies: pendingReplies || 0,
                totalProducts: totalProducts || 0,
                activeBots: botManager ? botManager.getBotCount() : 0,
                uptime: process.uptime()
            },
            recentErrors: recentErrors || []
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get detailed health' });
    }
});

module.exports = router;
