const OpenAIService = require('../services/ai/OpenAIService');

class HealthCheckJob {
    static async run(supabase, botManager, auditService) {
        console.log('🔍 Running health checks...');

        try {
            // 1. Check all active business bots
            const { data: businesses } = await supabase
                .from('businesses')
                .select('*')
                .eq('status', 'active')
                .not('bot_username', 'is', null);

            for (const business of businesses || []) {
                await this.checkBusinessHealth(business, supabase, botManager, auditService);
            }

            // 2. Check Secretary Mode disconnections
            await this.checkSecretaryDisconnections(supabase, botManager);

            // 3. Cleanup old data
            await this.cleanupOldData(supabase);

            console.log('✅ Health checks completed');
        } catch (error) {
            console.error('❌ Health check error:', error);
            await auditService.logBotAction({
                botId: 'system',
                action: 'HEALTH_CHECK_FAILED',
                details: { error: error.message }
            });
        }
    }

    static async checkBusinessHealth(business, supabase, botManager, auditService) {
        const bot = botManager.getBusinessBot(business.id);

        if (!bot) {
            // Bot not loaded - try to reconnect
            console.log(`⚠️ Bot not found for ${business.business_name}, attempting reconnect...`);

            // Get token from encrypted storage
            const { data: secret } = await supabase
                .from('encrypted_secrets')
                .select('*')
                .eq('entity_type', 'business')
                .eq('entity_id', business.id)
                .eq('secret_type', 'bot_token')
                .single();

            if (secret) {
                try {
                    const token = botManager.encryption.decrypt({
                        encrypted: secret.encrypted_value,
                        iv: secret.iv,
                        authTag: secret.auth_tag
                    });

                    await botManager.addBusinessBot(business.id, token, business.bot_username);

                    await supabase
                        .from('businesses')
                        .update({ 
                            health_check_failures: 0,
                            last_health_check: new Date().toISOString()
                        })
                        .eq('id', business.id);

                    await auditService.logBotAction({
                        botId: business.bot_username,
                        action: 'RECONNECTED',
                        businessId: business.id
                    });
                } catch (error) {
                    await this.incrementFailure(business, supabase, auditService, error.message);
                }
            }
        } else {
            // Bot is active, reset failures
            await supabase
                .from('businesses')
                .update({ 
                    health_check_failures: 0,
                    last_health_check: new Date().toISOString()
                })
                .eq('id', business.id);
        }
    }

    static async checkSecretaryDisconnections(supabase, botManager) {
        // Find businesses in secretary mode with no recent activity
        const { data: inactiveBusinesses } = await supabase
            .from('businesses')
            .select('*')
            .eq('status', 'active')
            .eq('primary_mode', 'secretary')
            .lt('last_secretary_activity', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .eq('fallback_to_bot', true);

        for (const business of inactiveBusinesses || []) {
            console.log(`📴 Secretary inactive for ${business.business_name}, enabling fallback...`);

            // Enable fallback bot mode
            await supabase
                .from('businesses')
                .update({ 
                    secretary_connected: false,
                    primary_mode: 'bot'
                })
                .eq('id', business.id);

            // Notify owner
            try {
                await botManager.mainBot.telegram.sendMessage(
                    business.owner_telegram_id,
                    `⚠️ *Secretary Mode Disconnected*\n\n` +
                    `I haven't seen activity from your account for 24 hours.\n` +
                    `I've temporarily switched to *Bot Mode* so customers still get replies.\n\n` +
                    `To reconnect Secretary Mode, just send any message to your business account.\n` +
                    `Or tap below to switch back now:`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔌 Reconnect Secretary', callback_data: 'reconnect_secretary' }
                            ]]
                        }
                    }
                );
            } catch (error) {
                console.error(`Failed to notify owner ${business.owner_telegram_id}:`, error);
            }
        }
    }

    static async cleanupOldData(supabase) {
        // Clean old search logs (keep 90 days)
        const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

        await supabase
            .from('search_logs')
            .delete()
            .lt('created_at', cutoffDate)
            .eq('converted_to_conversation', false);

        // Clean old pending replies (keep 30 days)
        const pendingCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        await supabase
            .from('pending_replies')
            .delete()
            .lt('created_at', pendingCutoff)
            .in('status', ['approved', 'rejected', 'expired']);

        // Clean old audit logs (keep 1 year)
        const auditCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

        await supabase
            .from('audit_logs')
            .delete()
            .lt('created_at', auditCutoff)
            .eq('severity', 'info');
    }

    static async incrementFailure(business, supabase, auditService, error) {
        const newFailures = (business.health_check_failures || 0) + 1;

        await supabase
            .from('businesses')
            .update({ 
                health_check_failures: newFailures,
                last_health_check: new Date().toISOString()
            })
            .eq('id', business.id);

        await auditService.logBotAction({
            botId: business.bot_username,
            action: 'HEALTH_CHECK_FAILED',
            businessId: business.id,
            details: { 
                failures: newFailures,
                error: error,
                will_suspend: newFailures >= 5
            }
        });

        // Suspend if too many failures
        if (newFailures >= 5) {
            await supabase
                .from('businesses')
                .update({ status: 'suspended' })
                .eq('id', business.id);

            await auditService.logBotAction({
                botId: business.bot_username,
                action: 'AUTO_SUSPENDED',
                businessId: business.id,
                details: { reason: '5 consecutive health check failures' }
            });
        }
    }
}

module.exports = HealthCheckJob;
