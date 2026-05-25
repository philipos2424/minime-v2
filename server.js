require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

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

const HealthCheckJob = require('./src/cron/HealthCheckJob');
const PriceReminderJob = require('./src/cron/PriceReminderJob');
const AnalyticsJob = require('./src/cron/AnalyticsJob');

validateEnv();

const app = express();
const PORT = config.PORT || 3000;
const IS_PRODUCTION = config.NODE_ENV === 'production';

// ── Database & Services ────────────────────────────────────────────────────
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});
const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);
const auditService = new AuditService(supabase);
const rateLimiter = new RateLimiter(supabase);

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet(securityConfig.helmet));
app.use(cors(securityConfig.cors));
app.set('trust proxy', 1);

// Telegram webhooks need raw JSON before express.json() parses it
app.use('/webhook/telegram', (req, res, next) => {
    express.raw({ type: 'application/json' })(req, res, () => {
        if (req.body && Buffer.isBuffer(req.body)) {
            try { req.body = JSON.parse(req.body.toString()); } catch {}
        }
        next();
    });
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);
app.use('/miniapp/', limiter);

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

// ── Start ──────────────────────────────────────────────────────────────────
async function startServer() {
    try {
        const botManager = new BotManager(supabase, encryptionService, config);
        await botManager.initialize();
        app.locals.botManager = botManager;

        if (IS_PRODUCTION && config.WEB_URL && config.WEB_URL !== 'https://minime.app') {
            // Production: webhook mode
            await registerWebhooks(config);
            console.log('🔗 Webhook mode active');
        } else {
            // Dev: polling mode
            await botManager.launchPolling();
        }

        // Cron jobs
        cron.schedule('*/5 * * * *', () => HealthCheckJob.run(supabase, botManager, auditService));
        cron.schedule('0 9 * * 1', () => PriceReminderJob.run(supabase, botManager));
        cron.schedule('0 0 * * *', () => AnalyticsJob.run(supabase));

        const server = app.listen(PORT, () => {
            console.log(`🪞 MiniMe running on port ${PORT}`);
            console.log(`🔐 Env: ${config.NODE_ENV}`);
            console.log(`🤖 Bots: ${botManager.getBotCount()} active`);
        });

        const shutdown = async (signal) => {
            console.log(`🛑 ${signal} — shutting down`);
            server.close();
            await botManager.shutdown();
            process.exit(0);
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        console.error('Failed to start:', error);
        process.exit(1);
    }
}

async function registerWebhooks(cfg) {
    const base = cfg.WEB_URL.replace(/\/$/, '');

    const r1 = await fetch(`https://api.telegram.org/bot${cfg.TELEGRAM_BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            url: `${base}/webhook/telegram/main`,
            allowed_updates: [
                'message', 'edited_message', 'callback_query', 'inline_query',
                'pre_checkout_query', 'business_connection', 'business_message', 'edited_business_message'
            ],
            drop_pending_updates: false
        })
    });
    const j1 = await r1.json();
    console.log('Main bot webhook:', j1.ok ? 'OK' : j1.description);

    if (cfg.SEARCH_BOT_TOKEN) {
        const r2 = await fetch(`https://api.telegram.org/bot${cfg.SEARCH_BOT_TOKEN}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: `${base}/webhook/telegram/search`, allowed_updates: ['message', 'inline_query'] })
        });
        const j2 = await r2.json();
        console.log('Search bot webhook:', j2.ok ? 'OK' : j2.description);
    }
}

startServer();
module.exports = app;
