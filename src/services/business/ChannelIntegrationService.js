class ChannelIntegrationService {
    constructor(supabase, botManager, config) {
        this.supabase = supabase;
        this.botManager = botManager;
        this.config = config;
    }

    async postToChannel(channelUsername, content) {
        // Post product highlights to Telegram channel
        // This would be used for @dagilaptop style channels

        try {
            const bot = this.botManager.mainBot;

            // Format the post
            const message = this.formatChannelPost(content);

            // Send to channel
            const result = await bot.telegram.sendMessage(
                channelUsername,
                message.text,
                {
                    parse_mode: 'Markdown',
                    reply_markup: message.buttons ? {
                        inline_keyboard: message.buttons
                    } : undefined
                }
            );

            // Log the post
            await this.supabase.from('channel_posts').insert({
                channel_username: channelUsername,
                business_id: content.businessId,
                product_id: content.productId,
                message_id: result.message_id,
                content: message.text,
                posted_at: new Date().toISOString()
            });

            return { success: true, messageId: result.message_id };

        } catch (error) {
            console.error('Channel post error:', error);
            return { success: false, error: error.message };
        }
    }

    formatChannelPost(content) {
        const { product, business } = content;

        let text = `🏪 *${business.business_name}*\n\n`;

        if (product.file_url) {
            // Photo post
            text = `[Photo]\n\n${text}`;
        }

        text += `📦 *${product.name}*\n`;

        if (product.price) {
            text += `💰 *${product.price.toLocaleString()} ETB*\n`;
        }

        if (product.condition) {
            text += `🔧 Condition: ${product.condition}\n`;
        }

        if (product.specs && Object.keys(product.specs).length > 0) {
            text += `\n📋 *Specs:*\n`;
            Object.entries(product.specs).forEach(([key, value]) => {
                text += `• ${key}: ${value}\n`;
            });
        }

        if (product.selling_points?.length > 0) {
            text += `\n✨ *Highlights:*\n`;
            product.selling_points.forEach(point => {
                text += `• ${point}\n`;
            });
        }

        text += `\n📍 ${business.sub_city || 'Addis Ababa'}${business.verified ? ' ✅ Verified' : ''}\n`;

        if (business.average_rating > 0) {
            text += `⭐ ${business.average_rating}/5 (${business.total_reviews} reviews)\n`;
        }

        // Contact buttons
        const buttons = [];

        if (business.bot_username) {
            buttons.push([{
                text: '💬 Message on MiniMe',
                url: `https://t.me/${business.bot_username}`
            }]);
        }

        if (business.secretary_username) {
            buttons.push([{
                text: '📱 Direct Message',
                url: `https://t.me/${business.secretary_username}`
            }]);
        }

        if (business.latitude && business.longitude) {
            buttons.push([{
                text: '📍 Get Directions',
                url: `https://maps.google.com/?q=${business.latitude},${business.longitude}`
            }]);
        }

        return { text, buttons };
    }

    async scheduleChannelPost(channelUsername, content, scheduledTime) {
        // Store scheduled post
        const { data, error } = await this.supabase
            .from('scheduled_posts')
            .insert({
                channel_username: channelUsername,
                business_id: content.businessId,
                product_id: content.productId,
                content: content,
                scheduled_for: scheduledTime,
                status: 'pending'
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async processScheduledPosts() {
        // Called by cron job
        const now = new Date().toISOString();

        const { data: pendingPosts } = await this.supabase
            .from('scheduled_posts')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_for', now)
            .order('scheduled_for', { ascending: true })
            .limit(10);

        for (const post of pendingPosts || []) {
            try {
                const result = await this.postToChannel(
                    post.channel_username,
                    post.content
                );

                await this.supabase
                    .from('scheduled_posts')
                    .update({
                        status: result.success ? 'posted' : 'failed',
                        error: result.error || null,
                        posted_at: result.success ? new Date().toISOString() : null
                    })
                    .eq('id', post.id);

            } catch (error) {
                await this.supabase
                    .from('scheduled_posts')
                    .update({
                        status: 'failed',
                        error: error.message
                    })
                    .eq('id', post.id);
            }
        }
    }

    async getChannelStats(channelUsername, days = 30) {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const { data: posts } = await this.supabase
            .from('channel_posts')
            .select('*')
            .eq('channel_username', channelUsername)
            .gte('posted_at', startDate);

        const { data: engagements } = await this.supabase
            .from('channel_engagements')
            .select('*')
            .eq('channel_username', channelUsername)
            .gte('created_at', startDate);

        return {
            totalPosts: posts?.length || 0,
            totalEngagements: engagements?.length || 0,
            clickThroughRate: posts?.length > 0 ? ((engagements?.length || 0) / posts.length * 100).toFixed(2) : 0,
            topProducts: this.getTopProductsFromPosts(posts || []),
            recentPosts: (posts || []).slice(-5)
        };
    }

    getTopProductsFromPosts(posts) {
        const productCounts = {};
        posts.forEach(post => {
            if (post.product_id) {
                productCounts[post.product_id] = (productCounts[post.product_id] || 0) + 1;
            }
        });

        return Object.entries(productCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([productId, count]) => ({ productId, count }));
    }

    async autoPostTopProducts(channelUsername, frequency = 'daily') {
        // Automatically post top performing products
        const { data: topProducts } = await this.supabase
            .from('business_content')
            .select(`
                *,
                businesses!inner(*)
            `)
            .eq('status', 'active')
            .eq('extracted_type', 'product')
            .order('view_count', { ascending: false })
            .limit(3);

        for (const product of topProducts || []) {
            await this.scheduleChannelPost(channelUsername, {
                businessId: product.business_id,
                productId: product.id,
                product,
                business: product.businesses
            }, new Date().toISOString());
        }
    }
}

module.exports = ChannelIntegrationService;
