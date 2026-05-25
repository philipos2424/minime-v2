class PriceReminderJob {
    static async run(supabase, botManager) {
        console.log('💰 Running price reminder job...');

        try {
            // Find products with expired prices
            const { data: expiredProducts } = await supabase
                .from('business_content')
                .select(`
                    *,
                    businesses!inner(owner_telegram_id, business_name)
                `)
                .lt('price_expires_at', new Date().toISOString())
                .eq('status', 'active')
                .eq('extracted_type', 'product');

            for (const product of expiredProducts || []) {
                await this.sendPriceReminder(product, botManager);
            }

            // Find products expiring in 24 hours
            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            const { data: expiringSoon } = await supabase
                .from('business_content')
                .select(`
                    *,
                    businesses!inner(owner_telegram_id, business_name)
                `)
                .lt('price_expires_at', tomorrow)
                .gt('price_expires_at', new Date().toISOString())
                .eq('status', 'active')
                .eq('extracted_type', 'product')
                .eq('price_reminder_sent', false);

            for (const product of expiringSoon || []) {
                await this.sendPriceWarning(product, botManager);
            }

            console.log('✅ Price reminders completed');
        } catch (error) {
            console.error('❌ Price reminder error:', error);
        }
    }

    static async sendPriceReminder(product, botManager) {
        try {
            await botManager.mainBot.telegram.sendMessage(
                product.businesses.owner_telegram_id,
                `⏰ *Price Update Needed*\n\n` +
                `Your product *${product.name}* price has expired.\n` +
                `Last price: ${product.price} ETB\n` +
                `Expired: ${new Date(product.price_expires_at).toLocaleDateString()}\n\n` +
                `Send a new photo with updated price, or tap below to update:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📸 Send New Photo', callback_data: `update_price_${product.id}` }],
                            [{ text: '✏️ Type New Price', callback_data: `type_price_${product.id}` }],
                            [{ text: '❌ Remove Product', callback_data: `remove_${product.id}` }]
                        ]
                    }
                }
            );

            // Mark as reminded
            await supabase
                .from('business_content')
                .update({ price_reminder_sent: true })
                .eq('id', product.id);

        } catch (error) {
            console.error(`Failed to send price reminder for ${product.id}:`, error);
        }
    }

    static async sendPriceWarning(product, botManager) {
        try {
            await botManager.mainBot.telegram.sendMessage(
                product.businesses.owner_telegram_id,
                `⚠️ *Price Expires Tomorrow*\n\n` +
                `Your product *${product.name}* price expires in 24 hours.\n` +
                `Current price: ${product.price} ETB\n\n` +
                `Update now to keep it active:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📸 Update Photo', callback_data: `update_price_${product.id}` }],
                            [{ text: '✏️ Update Price', callback_data: `type_price_${product.id}` }]
                        ]
                    }
                }
            );
        } catch (error) {
            console.error(`Failed to send price warning for ${product.id}:`, error);
        }
    }
}

module.exports = PriceReminderJob;
