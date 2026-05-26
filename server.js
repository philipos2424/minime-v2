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

// ── Bot Manager — lazy singleton ───────────────────────────────────────────
let botManagerInstance = null;
let botManagerPromise = null;

async function getBotManager() {
    if (botManagerInstance) return botManagerInstance;
    if (botManagerPromise) return botManagerPromise;

    botManagerPromise = (async () => {
        const bm = new BotManager(supabase, encryptionService, config);
        await bm.initialize();
        botManagerInstance = bm;
        return bm;
    })();

    return botManagerPromise;
}

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet(securityConfig.helmet));
app.use(cors(securityConfig.cors));
app.set('trust proxy', 1);

// Telegram webhooks need raw body
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

// Inject context + lazy botManager into every request
app.use(async (req, res, next) => {
    req.context = { supabase, encryptionService, auditService, rateLimiter, config };
    try {
        if (!req.app.locals.botManager) {
            req.app.locals.botManager = await getBotManager();
        }
    } catch (e) {
        console.error('BotManager init error:', e.message);
    }
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

    getBotManager().then(async (bm) => {
        app.locals.botManager = bm;

        if (IS_PRODUCTION && config.WEB_URL && config.WEB_URL.startsWith('https://')) {
            await registerWebhooks(config);
        } else {
            await bm.launchPolling();
            console.log('🔄 Polling mode');
        }

        app.listen(PORT, () => {
            console.log(`🪞 MiniMe on port ${PORT} | env: ${config.NODE_ENV}`);
        });

        process.on('SIGTERM', async () => { await bm.shutdown(); process.exit(0); });
        process.on('SIGINT', async () => { await bm.shutdown(); process.exit(0); });
    }).catch(err => {
        console.error('Failed to start:', err);
        process.exit(1);
    });
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
