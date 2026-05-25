
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_KEY', 'OPENAI_API_KEY', 'TELEGRAM_TOKEN'];
requiredEnv.forEach(env => {
    if (!process.env[env]) throw new Error(`Missing environment variable: ${env}`);
});
module.exports = {
    supabase: { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY },
    telegram: { token: process.env.TELEGRAM_TOKEN },
    port: process.env.PORT || 3000
};
