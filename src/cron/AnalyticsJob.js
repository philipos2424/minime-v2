class AnalyticsJob {
    static async run(supabase) {
        console.log('📊 Running analytics aggregation...');

        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);

            const today = new Date(yesterday);
            today.setDate(today.getDate() + 1);

            const dateStr = yesterday.toISOString().split('T')[0];

            // Get all active businesses
            const { data: businesses } = await supabase
                .from('businesses')
                .select('id')
                .eq('status', 'active');

            for (const business of businesses || []) {
                await this.aggregateBusinessAnalytics(
                    business.id, 
                    yesterday.toISOString(), 
                    today.toISOString(),
                    dateStr,
                    supabase
                );
            }

            console.log('✅ Analytics aggregation completed');
        } catch (error) {
            console.error('❌ Analytics error:', error);
        }
    }

    static async aggregateBusinessAnalytics(businessId, startDate, endDate, dateStr, supabase) {
        // Count conversations
        const { count: totalConversations } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .gte('created_at', startDate)
            .lt('created_at', endDate);

        // Count by mode
        const { count: autoReplies } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .eq('mode_used', 'bot')
            .gte('created_at', startDate)
            .lt('created_at', endDate);

        const { count: shadowApproved } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .eq('mode_used', 'owner_reply')
            .gte('created_at', startDate)
            .lt('created_at', endDate);

        const { count: fallbackReplies } = await supabase
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .eq('mode_used', 'fallback_bot')
            .gte('created_at', startDate)
            .lt('created_at', endDate);

        // Search appearances
        const { count: searchAppearances } = await supabase
            .from('search_logs')
            .select('*', { count: 'exact', head: true })
            .contains('results_business_ids', [businessId])
            .gte('created_at', startDate)
            .lt('created_at', endDate);

        // Product views
        const { count: productViews } = await supabase
            .from('business_content')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .gte('updated_at', startDate)
            .lt('updated_at', endDate);

        // Calculate response time
        const { data: responseTimes } = await supabase
            .from('conversations')
            .select('created_at, updated_at')
            .eq('business_id', businessId)
            .eq('mode_used', 'owner_reply')
            .gte('created_at', startDate)
            .lt('created_at', endDate);

        let avgResponseTime = null;
        if (responseTimes && responseTimes.length > 0) {
            const totalSeconds = responseTimes.reduce((sum, conv) => {
                const created = new Date(conv.created_at);
                const updated = new Date(conv.updated_at);
                return sum + (updated - created) / 1000;
            }, 0);
            avgResponseTime = Math.round(totalSeconds / responseTimes.length);
        }

        // Upsert analytics
        await supabase
            .from('analytics_daily')
            .upsert({
                business_id: businessId,
                date: dateStr,
                total_conversations: totalConversations || 0,
                auto_replies: autoReplies || 0,
                shadow_approved: shadowApproved || 0,
                fallback_replies: fallbackReplies || 0,
                search_appearances: searchAppearances || 0,
                products_viewed: productViews || 0,
                avg_response_time: avgResponseTime,
                leads_generated: (totalConversations || 0) - (fallbackReplies || 0)
            }, {
                onConflict: 'business_id,date'
            });

        // Update business stats
        await supabase
            .from('businesses')
            .update({
                total_conversations: supabase.rpc('increment', { x: totalConversations || 0 }),
                response_rate: autoReplies && totalConversations 
                    ? (autoReplies / totalConversations * 100).toFixed(2)
                    : 0,
                avg_response_time: avgResponseTime,
                last_active_at: new Date().toISOString()
            })
            .eq('id', businessId);
    }
}

module.exports = AnalyticsJob;
