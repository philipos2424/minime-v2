class GamificationService {
    constructor(supabase) {
        this.supabase = supabase;
        this.levels = [
            { name: 'Newbie', minScore: 0, maxScore: 100, badge: '🌱' },
            { name: 'Rising Star', minScore: 101, maxScore: 300, badge: '⭐' },
            { name: 'Trusted Seller', minScore: 301, maxScore: 600, badge: '🏆' },
            { name: 'Pro Merchant', minScore: 601, maxScore: 850, badge: '💎' },
            { name: 'Market Leader', minScore: 851, maxScore: 1000, badge: '👑' }
        ];

        this.badges = [
            { id: 'first_sale', name: 'First Blood', description: 'Complete your first sale', icon: '🩸', condition: (stats) => stats.totalSales >= 1 },
            { id: 'speed_demon', name: 'Speed Demon', description: 'Average response time under 2 minutes for a week', icon: '⚡', condition: (stats) => stats.avgResponseTime < 120 },
            { id: 'perfect_week', name: 'Perfect Week', description: '100% response rate for 7 days', icon: '🔥', condition: (stats) => stats.responseRate === 100 },
            { id: 'review_master', name: 'Review Master', description: 'Get 10 reviews with 4.5+ average', icon: '⭐', condition: (stats) => stats.totalReviews >= 10 && stats.avgRating >= 4.5 },
            { id: 'ai_trainer', name: 'AI Trainer', description: 'Correct AI 10 times (teaching mode)', icon: '🧠', condition: (stats) => stats.aiCorrections >= 10 },
            { id: 'inventory_pro', name: 'Inventory Pro', description: 'Have 20+ active products', icon: '📦', condition: (stats) => stats.activeProducts >= 20 },
            { id: 'night_owl', name: 'Night Owl', description: 'Make a sale after 10 PM', icon: '🦉', condition: (stats) => stats.nightSales >= 1 },
            { id: 'weekend_warrior', name: 'Weekend Warrior', description: '10+ sales on weekends', icon: '🏖️', condition: (stats) => stats.weekendSales >= 10 },
            { id: 'price_wizard', name: 'Price Wizard', description: 'Update prices 50 times', icon: '💰', condition: (stats) => stats.priceUpdates >= 50 },
            { id: 'referral_king', name: 'Referral King', description: 'Earn 5000 ETB from referrals', icon: '🤝', condition: (stats) => stats.referralEarnings >= 5000 },
            { id: 'search_star', name: 'Search Star', description: 'Appear in 1000 searches', icon: '🔍', condition: (stats) => stats.searchAppearances >= 1000 },
            { id: 'loyalty_legend', name: 'Loyalty Legend', description: '50+ repeat customers', icon: '❤️', condition: (stats) => stats.repeatCustomers >= 50 },
            { id: 'bulk_master', name: 'Bulk Master', description: 'Complete 5 bulk orders', icon: '📊', condition: (stats) => stats.bulkOrders >= 5 },
            { id: 'early_bird', name: 'Early Bird', description: 'First sale of the day 10 times', icon: '🌅', condition: (stats) => stats.earlyBirdSales >= 10 },
            { id: 'photo_pro', name: 'Photo Pro', description: 'Upload 50 product photos', icon: '📸', condition: (stats) => stats.photosUploaded >= 50 }
        ];
    }

    async calculateMiniMeScore(businessId) {
        const { data: business } = await this.supabase
            .from('businesses')
            .select('*')
            .eq('id', businessId)
            .single();

        if (!business) return null;

        // Get analytics
        const { data: analytics } = await this.supabase
            .from('analytics_daily')
            .select('*')
            .eq('business_id', businessId)
            .order('date', { ascending: false })
            .limit(30);

        // Calculate score components
        const score = {
            reputation: this.calculateReputationScore(business),
            activity: this.calculateActivityScore(analytics || []),
            customerSatisfaction: this.calculateSatisfactionScore(business, analytics || []),
            growth: this.calculateGrowthScore(analytics || []),
            aiOptimization: this.calculateAIOptimizationScore(business, analytics || [])
        };

        const totalScore = Object.values(score).reduce((a, b) => a + b, 0);
        const currentLevel = this.getLevel(totalScore);
        const nextLevel = this.getNextLevel(totalScore);

        return {
            totalScore,
            maxScore: 1000,
            level: currentLevel,
            nextLevel,
            progressToNext: nextLevel ? ((totalScore - currentLevel.minScore) / (nextLevel.minScore - currentLevel.minScore) * 100).toFixed(1) : 100,
            breakdown: score,
            updatedAt: new Date().toISOString()
        };
    }

    calculateReputationScore(business) {
        let score = 0;

        // Verification level (max 200)
        score += business.verification_level === 'premium' ? 200 :
                 business.verification_level === 'human_verified' ? 150 :
                 business.verification_level === 'photo_verified' ? 100 :
                 business.verification_level === 'phone_verified' ? 50 : 0;

        // Rating (max 150)
        score += Math.min((business.average_rating || 0) * 30, 150);

        // Reviews (max 100)
        score += Math.min((business.total_reviews || 0) * 5, 100);

        // Response rate (max 100)
        score += Math.min((business.response_rate || 0), 100);

        return score;
    }

    calculateActivityScore(analytics) {
        if (analytics.length === 0) return 0;

        const totalConversations = analytics.reduce((sum, a) => sum + (a.total_conversations || 0), 0);
        const totalSales = analytics.reduce((sum, a) => sum + (a.reservations_made || 0), 0);

        // Activity score (max 200)
        let score = Math.min(totalConversations * 2, 100);
        score += Math.min(totalSales * 10, 100);

        return score;
    }

    calculateSatisfactionScore(business, analytics) {
        // Customer satisfaction (max 150)
        let score = Math.min((business.average_rating || 0) * 25, 100);

        // Response time bonus (max 50)
        const avgResponseTime = analytics.length > 0 
            ? analytics.reduce((sum, a) => sum + (a.avg_response_time || 300), 0) / analytics.length
            : 300;

        if (avgResponseTime < 60) score += 50;
        else if (avgResponseTime < 120) score += 40;
        else if (avgResponseTime < 300) score += 25;
        else if (avgResponseTime < 600) score += 10;

        return score;
    }

    calculateGrowthScore(analytics) {
        if (analytics.length < 7) return 0;

        // Compare first half vs second half
        const firstHalf = analytics.slice(0, Math.floor(analytics.length / 2));
        const secondHalf = analytics.slice(Math.floor(analytics.length / 2));

        const firstSales = firstHalf.reduce((sum, a) => sum + (a.reservations_made || 0), 0);
        const secondSales = secondHalf.reduce((sum, a) => sum + (a.reservations_made || 0), 0);

        // Growth score (max 100)
        if (firstSales === 0) return secondSales > 0 ? 50 : 0;

        const growthRate = ((secondSales - firstSales) / firstSales) * 100;
        return Math.min(Math.max(growthRate, 0), 100);
    }

    calculateAIOptimizationScore(business, analytics) {
        if (analytics.length === 0) return 0;

        const totalAuto = analytics.reduce((sum, a) => sum + (a.auto_replies || 0), 0);
        const totalFallback = analytics.reduce((sum, a) => sum + (a.fallback_replies || 0), 0);
        const total = totalAuto + totalFallback;

        if (total === 0) return 0;

        // AI efficiency (max 100)
        const autoRate = (totalAuto / total) * 100;
        let score = Math.min(autoRate, 100);

        // Penalty for too many fallbacks
        const fallbackRate = (totalFallback / total) * 100;
        if (fallbackRate > 30) score -= 20;
        if (fallbackRate > 50) score -= 30;

        return Math.max(score, 0);
    }

    getLevel(score) {
        return this.levels.find(l => score >= l.minScore && score <= l.maxScore) || this.levels[0];
    }

    getNextLevel(score) {
        return this.levels.find(l => l.minScore > score);
    }

    async checkAndAwardBadges(businessId) {
        const { data: business } = await this.supabase
            .from('businesses')
            .select('*')
            .eq('id', businessId)
            .single();

        if (!business) return [];

        // Get stats
        const stats = await this.getBusinessStats(businessId);

        // Get currently owned badges
        const { data: ownedBadges } = await this.supabase
            .from('business_badges')
            .select('badge_id')
            .eq('business_id', businessId);

        const ownedIds = new Set((ownedBadges || []).map(b => b.badge_id));

        // Check which badges should be awarded
        const newBadges = [];
        for (const badge of this.badges) {
            if (!ownedIds.has(badge.id) && badge.condition(stats)) {
                newBadges.push(badge);

                // Award badge
                await this.supabase.from('business_badges').insert({
                    business_id: businessId,
                    badge_id: badge.id,
                    awarded_at: new Date().toISOString()
                });
            }
        }

        return newBadges;
    }

    async getBusinessStats(businessId) {
        // Aggregate all stats needed for badges
        const { data: analytics } = await this.supabase
            .from('analytics_daily')
            .select('*')
            .eq('business_id', businessId);

        const { count: totalSales } = await this.supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .eq('status', 'completed');

        const { count: activeProducts } = await this.supabase
            .from('business_content')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .eq('status', 'active');

        const { count: totalReviews } = await this.supabase
            .from('reviews')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .eq('status', 'published');

        const { data: avgRating } = await this.supabase
            .from('reviews')
            .select('rating')
            .eq('business_id', businessId)
            .eq('status', 'published');

        return {
            totalSales: totalSales || 0,
            activeProducts: activeProducts || 0,
            totalReviews: totalReviews || 0,
            avgRating: avgRating?.length > 0 ? avgRating.reduce((a, b) => a + b.rating, 0) / avgRating.length : 0,
            avgResponseTime: analytics?.length > 0 ? analytics.reduce((sum, a) => sum + (a.avg_response_time || 300), 0) / analytics.length : 300,
            responseRate: analytics?.length > 0 ? analytics.reduce((sum, a) => sum + (a.auto_replies || 0), 0) / Math.max(analytics.reduce((sum, a) => sum + (a.total_conversations || 0), 0), 1) * 100 : 0,
            searchAppearances: analytics?.reduce((sum, a) => sum + (a.search_appearances || 0), 0) || 0,
            // These would need additional tracking tables
            aiCorrections: 0, // From pending_replies where status='edited'
            nightSales: 0,
            weekendSales: 0,
            priceUpdates: 0,
            referralEarnings: 0,
            repeatCustomers: 0,
            bulkOrders: 0,
            earlyBirdSales: 0,
            photosUploaded: 0
        };
    }

    async getLeaderboard(category = null, limit = 10) {
        let query = this.supabase
            .from('businesses')
            .select('id, business_name, reputation_score, average_rating, total_reviews, category, sub_city')
            .eq('status', 'active')
            .order('reputation_score', { ascending: false })
            .limit(limit);

        if (category) {
            query = query.eq('category', category);
        }

        const { data } = await query;
        return data || [];
    }

    async getBusinessGamificationProfile(businessId) {
        const [score, badges, leaderboard] = await Promise.all([
            this.calculateMiniMeScore(businessId),
            this.getBusinessBadges(businessId),
            this.getLeaderboard(null, 100)
        ]);

        const rank = leaderboard.findIndex(b => b.id === businessId) + 1;

        return {
            score,
            badges,
            rank: rank > 0 ? rank : null,
            totalBusinesses: leaderboard.length,
            percentile: rank > 0 ? ((1 - (rank / leaderboard.length)) * 100).toFixed(1) : null
        };
    }

    async getBusinessBadges(businessId) {
        const { data } = await this.supabase
            .from('business_badges')
            .select('*')
            .eq('business_id', businessId)
            .order('awarded_at', { ascending: false });

        return (data || []).map(b => {
            const badgeDef = this.badges.find(bd => bd.id === b.badge_id);
            return {
                ...b,
                ...badgeDef,
                awardedAt: b.awarded_at
            };
        });
    }
}

module.exports = GamificationService;
