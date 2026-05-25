const { createClient } = require('@supabase/supabase-js');

class AuthMiddleware {
    static async telegramAuth(req, res, next) {
        try {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Telegram ')) {
                return res.status(401).json({ error: 'Missing Telegram auth' });
            }

            const initData = authHeader.replace('Telegram ', '');

            // Verify init data (implement Telegram's verification)
            // For now, extract user ID
            const urlParams = new URLSearchParams(initData);
            const userJson = urlParams.get('user');

            if (!userJson) {
                return res.status(401).json({ error: 'Invalid init data' });
            }

            const user = JSON.parse(decodeURIComponent(userJson));
            req.telegramUser = user;
            req.userId = user.id;

            // Set for RLS
            await req.context.supabase.rpc('set_config', {
                name: 'app.current_user_id',
                value: user.id.toString()
            });

            next();
        } catch (error) {
            res.status(401).json({ error: 'Authentication failed' });
        }
    }

    static async apiKeyAuth(req, res, next) {
        try {
            const apiKey = req.headers['x-api-key'];

            if (!apiKey) {
                return res.status(401).json({ error: 'Missing API key' });
            }

            // Verify API key against encrypted_secrets
            const { data: secret } = await req.context.supabase
                .from('encrypted_secrets')
                .select('*')
                .eq('secret_type', 'api_key')
                .single();

            if (!secret) {
                return res.status(401).json({ error: 'Invalid API key' });
            }

            const decrypted = req.context.encryptionService.decrypt({
                encrypted: secret.encrypted_value,
                iv: secret.iv,
                authTag: secret.auth_tag
            });

            if (decrypted !== apiKey) {
                return res.status(401).json({ error: 'Invalid API key' });
            }

            next();
        } catch (error) {
            res.status(401).json({ error: 'API key verification failed' });
        }
    }
}

module.exports = AuthMiddleware;
