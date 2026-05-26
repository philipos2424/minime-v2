require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');

const { validateEnv, config } = require('./src/config/environment');
const securityConfig = require('./src/config/security');
const BotManager = require('./src/services/telegram/BotManager');
const EncryptionService = require('./src/services/security/EncryptionService');
const AuditService = require('./src/services/security/AuditService');
const RateLimiter = require('./src/services/security/RateLimiter');

const miniappRoutes = require('./src/routes/miniapp');
const webhookRoutes = require('./src/routes/webhook');
const healthRoutes = require('./src/routes/health');
const apiRoutes = require('./src/routes/api');
const errorMiddleware = require('./src/middleware/ErrorMiddleware');

validateEnv();

const app = express();

// ── Services (initialized once at module load) ─────────────────────────────
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});
const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);
const auditService = new AuditService(supabase);
const rateLimiter = new RateLimiter(supabase);

// ── Bot Manager — eager init at module load ────────────────────────────────
// Bot is constructed synchronously so mainBot is ready before any request.
// loadBusinessBots() runs async in the background (fire-and-forget).
const botManager = new BotManager(supabase, encryptionService, config);
app.locals.botManager = botManager;
botManager.initialize().catch(err =>
    console.error('[BotManager] async init error:', err.message)
);

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet(securityConfig.helmet));
app.use(cors(securityConfig.cors));
app.set('trust proxy', 1);

// JSON body parsing — works for both regular requests and Telegram webhooks.
// Vercel @vercel/node already parses bodies; this is a no-op there but works locally.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Inject service context into every request
app.use((req, res, next) => {
    req.context = { supabase, encryptionService, auditService, rateLimiter, config };
    next();
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/miniapp', miniappRoutes);
app.use('/webhook', webhookRoutes);
app.use('/health', healthRoutes);
app.use('/api', apiRoutes);
app.use(errorMiddleware);

// ── Local dev: start with polling ──────────────────────────────────────────
if (require.main === module) {
    const PORT = config.PORT || 3000;
    const IS_PRODUCTION = config.NODE_ENV === 'production';

    app.listen(PORT, async () => {
        console.log(`🪞 MiniMe on port ${PORT} | env: ${config.NODE_ENV}`);

        if (IS_PRODUCTION && config.WEB_URL && config.WEB_URL.startsWith('https://')) {
            await registerWebhooks(config);
        } else {
            await botManager.launchPolling();
            console.log('🔄 Polling mode');
        }
    });

    process.on('SIGTERM', async () => { await botManager.shutdown(); process.exit(0); });
    process.on('SIGINT', async () => { await botManager.shutdown(); process.exit(0); });
}

async function registerWebhooks(cfg) {
    const base = cfg.WEB_URL.replace(/\/$/, '');
    const r = await fetch(`https://api.telegram.org/bot${cfg.TELEGRAM_BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            url: `${base}/webhook/telegram/main`,
            allowed_updates: ['message', 'edited_message', 'callback_query', 'inline_query',
                'pre_checkout_query', 'business_connection', 'business_message', 'edited_business_message'],
            drop_pending_updates: false
        })
    });
    const j = await r.json();
    console.log('Webhook:', j.ok ? 'OK' : j.description);
}

// ── Vercel: export the Express app directly ────────────────────────────────
module.exports = app;
