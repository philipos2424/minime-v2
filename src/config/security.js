module.exports = {
    helmet: {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://telegram.org"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https:", "blob:"],
                connectSrc: ["'self'", "https://api.telegram.org", "https://*.supabase.co"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'", "https:"],
                frameSrc: ["https://telegram.org"]
            }
        },
        crossOriginEmbedderPolicy: false, // Needed for Telegram WebApp
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    },
    cors: {
        origin: [
            'https://t.me',
            'https://web.telegram.org',
            process.env.WEB_URL
        ].filter(Boolean),
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        credentials: true
    }
};
