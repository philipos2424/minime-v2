const express = require('express');
const router = express.Router();

// Simple health check — always 200 if server is running
router.get('/', (req, res) => {
    const botManager = req.app.locals.botManager;
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        bots: botManager ? botManager.getBotCount() : 0,
        env: process.env.NODE_ENV
    });
});

// Detailed stats
router.get('/detailed', async (req, res) => {
    const { supabase } = req.context;
    const botManager = req.app.locals.botManager;

    try {
        const { count: totalBusinesses } = await supabase
            .from('businesses')
            .select('*', { count: 'exact', head: true });

        const { count: todayConversations } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', new Date().toISOString().split('T')[0]);

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: Math.floor(process.uptime()),
            stats: {
                totalBusinesses: totalBusinesses || 0,
                todayConversations: todayConversations || 0,
                activeBots: botManager ? botManager.getBotCount() : 0
            }
        });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

module.exports = router;
