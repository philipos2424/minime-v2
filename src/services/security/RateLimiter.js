class RateLimiter {
    constructor(supabase) {
        this.supabase = supabase;
        this.memoryCache = new Map(); // Fallback if DB is slow
        this.defaultLimits = {
            message: { max: 30, window: 60 },      // 30 messages per minute
            search: { max: 20, window: 60 },       // 20 searches per minute
            upload: { max: 10, window: 60 },       // 10 uploads per minute
            signup: { max: 5, window: 3600 },       // 5 signups per hour
            payment: { max: 10, window: 3600 },     // 10 payments per hour
            api: { max: 100, window: 60 }           // 100 API calls per minute
        };
    }

    async checkLimit(key, type = 'message') {
        const limit = this.defaultLimits[type] || this.defaultLimits.message;
        const windowStart = new Date(Date.now() - limit.window * 1000).toISOString();

        try {
            // Check in-memory first (fast path)
            const memKey = `${key}:${type}`;
            const memCount = this.memoryCache.get(memKey);
            if (memCount && memCount.resetAt > Date.now()) {
                if (memCount.count >= limit.max) {
                    return { allowed: false, retryAfter: Math.ceil((memCount.resetAt - Date.now()) / 1000) };
                }
                memCount.count++;
                return { allowed: true, remaining: limit.max - memCount.count };
            }

            // Check database
            const { count, error } = await this.supabase
                .from('rate_limit_logs')
                .select('*', { count: 'exact', head: true })
                .eq('limit_key', key)
                .eq('limit_type', type)
                .gte('created_at', windowStart);

            if (error) throw error;

            if (count >= limit.max) {
                return { allowed: false, retryAfter: limit.window };
            }

            // Log this request
            await this.supabase
                .from('rate_limit_logs')
                .insert({ limit_key: key, limit_type: type });

            // Update memory cache
            this.memoryCache.set(memKey, {
                count: count + 1,
                resetAt: Date.now() + limit.window * 1000
            });

            return { allowed: true, remaining: limit.max - count - 1 };

        } catch (error) {
            console.error('Rate limiter error:', error);
            // Fail open in case of error (don't block legitimate users)
            return { allowed: true, remaining: 1 };
        }
    }

    // Cleanup old memory entries
    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.memoryCache.entries()) {
            if (value.resetAt < now) {
                this.memoryCache.delete(key);
            }
        }
    }
}

// Cleanup every 5 minutes
setInterval(() => {
    // Will be called on instances
}, 5 * 60 * 1000);

module.exports = RateLimiter;
