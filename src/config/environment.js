require('dotenv').config();

const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'OPENAI_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'ENCRYPTION_KEY'
];

const config = {
    // Server
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    WEB_URL: process.env.WEB_URL || 'https://minime.app',

    // Database
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,

    // AI
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,

    // Telegram
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    SEARCH_BOT_TOKEN: process.env.SEARCH_BOT_TOKEN,

    // Security
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    JWT_SECRET: process.env.JWT_SECRET || process.env.ENCRYPTION_KEY,

    // Payments
    CHAPA_SECRET_KEY: process.env.CHAPA_SECRET_KEY,
    CHAPA_PUBLIC_KEY: process.env.CHAPA_PUBLIC_KEY,
    CHAPA_WEBHOOK_SECRET: process.env.CHAPA_WEBHOOK_SECRET,
    TELEBIRR_APP_ID: process.env.TELEBIRR_APP_ID,
    TELEBIRR_APP_KEY: process.env.TELEBIRR_APP_KEY,
    TELEBIRR_PUBLIC_KEY: process.env.TELEBIRR_PUBLIC_KEY,
    TELEBIRR_MERCHANT_CODE: process.env.TELEBIRR_MERCHANT_CODE,

    // Features
    ENABLE_SHADOW_MODE: process.env.ENABLE_SHADOW_MODE !== 'false',
    ENABLE_REFERRALS: process.env.ENABLE_REFERRALS !== 'false',
    FALLBACK_TIMEOUT_MINUTES: parseInt(process.env.FALLBACK_TIMEOUT_MINUTES) || 30,

    // Limits
    MAX_PRODUCTS_PER_BUSINESS: parseInt(process.env.MAX_PRODUCTS_PER_BUSINESS) || 100,
    MAX_FREE_CONVERSATIONS: parseInt(process.env.MAX_FREE_CONVERSATIONS) || 100,

    // Analytics
    ANALYTICS_RETENTION_DAYS: parseInt(process.env.ANALYTICS_RETENTION_DAYS) || 365
};

function validateEnv() {
    const missing = requiredEnvVars.filter(key => !config[key]);

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(key => console.error(`   • ${key}`));
        console.error('\nPlease set these in your .env file');
        process.exit(1);
    }

    // Validate encryption key length
    if (config.ENCRYPTION_KEY.length < 32) {
        console.error('❌ ENCRYPTION_KEY must be at least 32 characters');
        process.exit(1);
    }

    console.log('✅ Environment validated');
}

module.exports = { config, validateEnv };
