const OpenAIService = require('../ai/OpenAIService');

class CompetitorIntelService {
    constructor(supabase, config) {
        this.supabase = supabase;
        this.config = config;
        this.ai = new OpenAIService(config.OPENAI_API_KEY);
    }

    async analyzeCompetitorPrices(businessId, productName, category) {
        // Get all businesses in same category with similar products
        const { data: competitors } = await this.supabase
            .from('business_content')
            .select(`
                *,
                businesses!inner(business_name, sub_city, reputation_score, verified)
            `)
            .eq('extracted_type', 'product')
            .eq('category', category)
            .eq('status', 'active')
            .ilike('name', `%${productName}%`)
            .not('business_id', 'eq', businessId);

        if (!competitors || competitors.length === 0) {
            return { hasCompetition: false, message: 'No competitors found for this product' };
        }

        // Calculate market stats
        const prices = competitors.map(c => c.price).filter(p => p > 0);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        // Get our price
        const { data: ourProduct } = await this.supabase
            .from('business_content')
            .select('price')
            .eq('business_id', businessId)
            .ilike('name', `%${productName}%`)
            .single();

        const ourPrice = ourProduct?.price || 0;
        const pricePosition = ourPrice > 0 ? ((ourPrice - minPrice) / (maxPrice - minPrice) * 100).toFixed(0) : null;

        // AI analysis
        const analysis = await this.ai.client.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'system',
                content: `Analyze this competitor pricing data for an Ethiopian electronics market.
                Return JSON with insights and recommendations.`
            }, {
                role: 'user',
                content: JSON.stringify({
                    ourPrice,
                    marketAverage: avgPrice,
                    marketMin: minPrice,
                    marketMax: maxPrice,
                    competitorCount: competitors.length,
                    topCompetitors: competitors.slice(0, 5).map(c => ({
                        name: c.businesses?.business_name,
                        price: c.price,
                        location: c.businesses?.sub_city,
                        reputation: c.businesses?.reputation_score,
                        verified: c.businesses?.verified
                    }))
                })
            }],
            response_format: { type: 'json_object' },
            max_tokens: 500
        });

        const result = JSON.parse(analysis.choices[0].message.content);

        return {
            hasCompetition: true,
            ourPrice,
            marketStats: {
                average: Math.round(avgPrice),
                min: minPrice,
                max: maxPrice,
                competitorCount: competitors.length,
                ourPosition: pricePosition ? `${pricePosition}%` : 'Unknown'
            },
            insights: result.insights || [],
            recommendations: result.recommendations || [],
            competitors: competitors.slice(0, 5).map(c => ({
                businessName: c.businesses?.business_name,
                price: c.price,
                location: c.businesses?.sub_city,
                reputation: c.businesses?.reputation_score,
                verified: c.businesses?.verified
            }))
        };
    }

    async generatePriceAlert(businessId, productId) {
        const { data: product } = await this.supabase
            .from('business_content')
            .select('*, businesses!inner(business_name, owner_telegram_id)')
            .eq('id', productId)
            .single();

        if (!product) return null;

        const intel = await this.analyzeCompetitorPrices(
            businessId,
            product.name,
            product.category
        );

        if (!intel.hasCompetition) return null;

        // Check if our price is significantly higher
        const priceDiff = intel.ourPrice - intel.marketStats.average;
        const priceDiffPercent = ((priceDiff / intel.marketStats.average) * 100).toFixed(0);

        if (priceDiffPercent > 15) {
            return {
                type: 'price_too_high',
                urgency: 'high',
                message: `Your ${product.name} is ${priceDiffPercent}% above market average`,
                currentPrice: intel.ourPrice,
                marketAverage: intel.marketStats.average,
                recommendation: `Consider pricing at ${Math.round(intel.marketStats.average * 1.05)} ETB to stay competitive`,
                competitors: intel.competitors
            };
        }

        if (priceDiffPercent < -20) {
            return {
                type: 'price_too_low',
                urgency: 'medium',
                message: `Your ${product.name} is ${Math.abs(priceDiffPercent)}% below market average - you might be leaving money on the table`,
                currentPrice: intel.ourPrice,
                marketAverage: intel.marketStats.average,
                recommendation: `You could increase price to ${Math.round(intel.marketStats.average * 0.95)} ETB and still be competitive`,
                competitors: intel.competitors
            };
        }

        return {
            type: 'price_optimal',
            urgency: 'low',
            message: `Your ${product.name} is competitively priced`,
            currentPrice: intel.ourPrice,
            marketAverage: intel.marketStats.average,
            position: intel.marketStats.ourPosition
        };
    }

    async getMarketTrends(category, days = 30) {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data: products } = await this.supabase
            .from('business_content')
            .select('price, price_updated_at, created_at')
            .eq('category', category)
            .eq('status', 'active')
            .gte('created_at', startDate)
            .order('created_at', { ascending: true });

        if (!products || products.length < 5) {
            return { trend: 'insufficient_data', message: 'Not enough data for trend analysis' };
        }

        // Calculate price trend
        const prices = products.map(p => p.price).filter(p => p > 0);
        const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
        const secondHalf = prices.slice(Math.floor(prices.length / 2));

        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg * 100).toFixed(1);

        return {
            trend: change > 5 ? 'rising' : change < -5 ? 'falling' : 'stable',
            changePercent: change,
            currentAverage: Math.round(secondAvg),
            previousAverage: Math.round(firstAvg),
            sampleSize: products.length,
            insight: change > 5 
                ? 'Prices are trending up. Good time to sell.' 
                : change < -5 
                ? 'Prices are dropping. Consider promotions.' 
                : 'Market is stable.'
        };
    }

    async notifyOwnerOfCompetitorActivity(businessId) {
        const { data: business } = await this.supabase
            .from('businesses')
            .select('owner_telegram_id, business_name')
            .eq('id', businessId)
            .single();

        if (!business) return;

        // Get products that need price attention
        const { data: products } = await this.supabase
            .from('business_content')
            .select('*')
            .eq('business_id', businessId)
            .eq('status', 'active')
            .eq('extracted_type', 'product');

        const alerts = [];
        for (const product of products || []) {
            const alert = await this.generatePriceAlert(businessId, product.id);
            if (alert && alert.urgency !== 'low') {
                alerts.push(alert);
            }
        }

        if (alerts.length === 0) return;

        // Send notification to owner
        // Implementation depends on your notification system
        return {
            ownerId: business.owner_telegram_id,
            alerts,
            totalAlerts: alerts.length
        };
    }
}

module.exports = CompetitorIntelService;
