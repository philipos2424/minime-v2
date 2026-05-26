const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
const CustomerHandler = require('../../handlers/CustomerHandler');
const SearchHandler = require('../../handlers/SearchHandler');
const OpenAIService = require('../ai/OpenAIService');

class BotManager {
    constructor(supabase, encryptionService, config) {
        this.supabase = supabase;
        this.encryption = encryptionService;
        this.config = config;
        this.bots = new Map();   // businessId -> { bot, token, username }
        this.ai = new OpenAIService(config.OPENAI_API_KEY);

        // Create bots synchronously so they're ready immediately for webhook calls.
        // Critical on Vercel: prevents race condition where a request hits before init.
        this.mainBot = new Telegraf(config.TELEGRAM_BOT_TOKEN);
        this.setupMainBotHandlers(this.mainBot);

        if (config.SEARCH_BOT_TOKEN) {
            this.searchBot = new Telegraf(config.SEARCH_BOT_TOKEN);
            this.setupSearchBotHandlers(this.searchBot);
        } else {
            this.searchBot = null;
        }
    }

    // ── Initialization (async — loads business bots from DB) ─────────────────
    async initialize() {
        await this.loadBusinessBots();
        console.log(`🤖 BotManager ready — ${this.bots.size} business bots loaded`);
    }

    // Express middleware for webhook mode
    getMainWebhookMiddleware(path = '/webhook/telegram/main') {
        return this.mainBot.webhookCallback(path);
    }

    getSearchWebhookMiddleware(path = '/webhook/telegram/search') {
        return this.searchBot ? this.searchBot.webhookCallback(path) : null;
    }

    // For local dev: use long-polling
    async launchPolling() {
        await this.mainBot.launch({ dropPendingUpdates: true });
        if (this.searchBot) await this.searchBot.launch({ dropPendingUpdates: true });
        for (const [, { bot }] of this.bots) {
            bot.launch({ dropPendingUpdates: true }).catch(console.error);
        }
        console.log('🔄 All bots running in polling mode');
    }

    // ── Main Bot Handlers ──────────────────────────────────────────────────────

    setupMainBotHandlers(bot) {
        bot.start(ctx => this.handleStart(ctx));
        bot.help(ctx => this.handleHelp(ctx));
        bot.command('orders', ctx => this.ownerOrders(ctx));
        bot.command('products', ctx => this.ownerProducts(ctx));
        bot.command('teach', ctx => this.ownerTeach(ctx));
        bot.command('status', ctx => this.ownerStatus(ctx));
        bot.command('sales', ctx => this.ownerSales(ctx));
        bot.command('customers', ctx => this.ownerCustomers(ctx));
        bot.command('settings', ctx => this.ownerSettings(ctx));
        bot.on(message('photo'), ctx => this.handleOwnerUpload(ctx));
        bot.on(message('document'), ctx => this.handleOwnerUpload(ctx));
        bot.on(message('voice'), ctx => this.handleOwnerUpload(ctx));
        bot.on(message('text'), ctx => this.handleMainBotText(ctx));
        bot.on('callback_query', ctx => this.handleMainCallback(ctx));
        bot.catch((err) => {
            console.error('[MainBot] error:', err.message);
        });
    }

    setupSearchBotHandlers(bot) {
        bot.on('inline_query', ctx => this.handleInlineQuery(ctx));
        bot.on(message('text'), ctx => this.handleSearchQuery(ctx));
        bot.catch(err => console.error('[SearchBot] error:', err.message));
    }

    // ── /start ─────────────────────────────────────────────────────────────────

    async handleStart(ctx) {
        const userId = ctx.from.id;

        const { data: business } = await this.supabase
            .from('businesses')
            .select('*')
            .eq('owner_telegram_id', userId)
            .single();

        if (business) {
            // Update private chat ID for notifications
            if (business.secretary_chat_id !== ctx.chat.id) {
                await this.supabase.from('businesses')
                    .update({ secretary_chat_id: ctx.chat.id })
                    .eq('id', business.id);
            }

            const today = await this.getTodayStats(business.id);
            return ctx.reply(
                `Welcome back, *${business.business_name}*!\n\n` +
                `Today: ${today.conversations} conversations, ${today.leads} leads\n` +
                `Rating: ${business.average_rating || 0}/5 (${business.total_reviews || 0} reviews)\n\n` +
                `Send a product photo to add inventory, or use a command below.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Open Dashboard', web_app: { url: this.config.WEB_URL } }],
                            [
                                { text: 'Add Product', callback_data: 'add_product' },
                                { text: 'Inbox', callback_data: 'view_inbox' }
                            ],
                            [
                                { text: 'Products', callback_data: 'view_products' },
                                { text: 'Settings', callback_data: 'settings' }
                            ]
                        ]
                    }
                }
            );
        }

        // New user — onboarding
        return ctx.reply(
            `Welcome to *MiniMe*!\n\n` +
            `I'm your AI sales assistant for Telegram. I handle customer messages while you focus on selling.\n\n` +
            `How do you want to get started?`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Open MiniMe App', web_app: { url: this.config.WEB_URL } }],
                        [{ text: 'Use My Account (Secretary Mode)', callback_data: 'signup_secretary' }],
                        [{ text: 'Create a Dedicated Bot', callback_data: 'signup_bot' }]
                    ]
                }
            }
        );
    }

    async handleHelp(ctx) {
        return ctx.reply(
            `*MiniMe Commands*\n\n` +
            `/start - Dashboard & quick actions\n` +
            `/orders - Pending orders & conversations\n` +
            `/products - Your product catalog\n` +
            `/sales - Revenue summary\n` +
            `/customers - Customer list\n` +
            `/teach - How to add products\n` +
            `/status - Bot health & mode\n` +
            `/settings - Configure your bot\n\n` +
            `Send a photo to add a product instantly.`,
            { parse_mode: 'Markdown' }
        );
    }

    // ── Owner Commands ─────────────────────────────────────────────────────────

    async ownerOrders(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first to set up your business.');

        const [{ data: pending }, { data: transactions }] = await Promise.all([
            this.supabase.from('pending_replies').select('*')
                .eq('business_id', business.id).eq('status', 'pending')
                .order('created_at', { ascending: false }).limit(5),
            this.supabase.from('transactions').select('*')
                .eq('business_id', business.id).eq('status', 'reserved')
                .order('created_at', { ascending: false }).limit(5)
        ]);

        let text = `*Pending Items*\n\n`;
        if (pending?.length) {
            text += `Messages awaiting reply (${pending.length}):\n`;
            pending.forEach((p, i) => {
                text += `${i + 1}. "${(p.original_message || '').slice(0, 60)}"\n`;
            });
            text += '\n';
        }
        if (transactions?.length) {
            text += `Active reservations (${transactions.length}):\n`;
            transactions.forEach((t, i) => {
                text += `${i + 1}. ${t.reservation_code} - ${t.total_amount || '?'} ETB\n`;
            });
        }
        if (!pending?.length && !transactions?.length) text += 'No pending items.';

        return ctx.reply(text, { parse_mode: 'Markdown' });
    }

    async ownerProducts(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');

        const { data: products, count } = await this.supabase
            .from('business_content')
            .select('name, price, currency', { count: 'exact' })
            .eq('business_id', business.id)
            .eq('extracted_type', 'product')
            .eq('status', 'active')
            .limit(10);

        const list = (products || []).map((p, i) =>
            `${i + 1}. ${p.name} - ${p.price ? `${p.price} ${p.currency || 'ETB'}` : 'No price'}`
        ).join('\n');

        return ctx.reply(
            `*Your Products* (${count || 0} total)\n\n${list || 'No products yet.'}\n\nSend a product photo to add more!`,
            { parse_mode: 'Markdown' }
        );
    }

    async ownerSales(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');

        const today = new Date().toISOString().split('T')[0];
        const { data: analytics } = await this.supabase
            .from('analytics_daily')
            .select('*')
            .eq('business_id', business.id)
            .gte('date', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0])
            .order('date', { ascending: false });

        const todayData = analytics?.find(a => a.date === today) || {};
        const weekTotal = analytics?.reduce((s, a) => s + (a.leads_generated || 0), 0) || 0;

        return ctx.reply(
            `*Sales Summary*\n\n` +
            `Today:\n` +
            `- Conversations: ${todayData.total_conversations || 0}\n` +
            `- Leads: ${todayData.leads_generated || 0}\n` +
            `- Reservations: ${todayData.reservations_made || 0}\n\n` +
            `This week: ${weekTotal} total leads`,
            { parse_mode: 'Markdown' }
        );
    }

    async ownerCustomers(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');

        const { data: convs } = await this.supabase
            .from('conversations')
            .select('customer_name, customer_telegram_id, created_at')
            .eq('business_id', business.id)
            .order('created_at', { ascending: false })
            .limit(20);

        const seen = new Set();
        const unique = (convs || []).filter(c => {
            if (seen.has(c.customer_telegram_id)) return false;
            seen.add(c.customer_telegram_id);
            return true;
        }).slice(0, 10);

        const list = unique.map((c, i) => `${i + 1}. ${c.customer_name || 'Anonymous'}`).join('\n');
        return ctx.reply(`*Recent Customers*\n\n${list || 'No customers yet.'}`, { parse_mode: 'Markdown' });
    }

    async ownerTeach(ctx) {
        return ctx.reply(
            `*Teaching MiniMe*\n\n` +
            `Send a product photo with the price in the caption\n` +
            `Example: "iPhone 15 Pro 256GB - 75,000 ETB"\n\n` +
            `Or just type product details as text.\n\n` +
            `Forward customer questions to teach FAQ answers.`,
            { parse_mode: 'Markdown' }
        );
    }

    async ownerStatus(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');

        const { count: productCount } = await this.supabase
            .from('business_content')
            .select('id', { count: 'exact', head: true })
            .eq('business_id', business.id)
            .eq('status', 'active');

        return ctx.reply(
            `*MiniMe Status*\n\n` +
            `Business: ${business.business_name}\n` +
            `Status: ${business.status === 'active' ? 'Active' : 'Inactive'}\n` +
            `Mode: ${(business.modes || ['secretary']).join(', ')}\n` +
            `Secretary: ${business.secretary_connected ? 'Connected' : 'Disconnected'}\n` +
            `Custom Bot: ${business.bot_username ? `@${business.bot_username}` : 'Not set'}\n\n` +
            `Products: ${productCount || 0}\n` +
            `Rating: ${business.average_rating || 0}/5`,
            { parse_mode: 'Markdown' }
        );
    }

    async ownerSettings(ctx) {
        return ctx.reply('Open the dashboard to manage all settings:', {
            reply_markup: {
                inline_keyboard: [[{ text: 'Open Settings', web_app: { url: this.config.WEB_URL } }]]
            }
        });
    }

    // ── Text & Media ───────────────────────────────────────────────────────────

    async handleMainBotText(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start to set up your business.');

        const text = ctx.message.text;

        // Owner replying to a bot suggestion
        if (ctx.message.reply_to_message?.from?.is_bot) {
            return this.handleOwnerCorrection(ctx, business);
        }

        // Otherwise treat as training text
        return this.handleOwnerTrainingText(ctx, business, text);
    }

    async handleOwnerUpload(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');

        await ctx.reply('Analyzing...');

        let fileId, fileType, caption;
        if (ctx.message.photo) {
            fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            fileType = 'photo';
            caption = ctx.message.caption || '';
        } else if (ctx.message.document) {
            fileId = ctx.message.document.file_id;
            fileType = 'document';
            caption = ctx.message.caption || '';
        } else if (ctx.message.voice) {
            fileId = ctx.message.voice.file_id;
            fileType = 'voice';
            caption = '';
        }

        try {
            const fileUrl = await this.getFileUrl(fileId);
            const extraction = fileType === 'photo'
                ? await this.ai.extractFromImage(fileUrl, caption)
                : await this.ai.extractFromText(caption || 'uploaded file');

            const { data: content } = await this.supabase.from('business_content').insert({
                business_id: business.id,
                content_type: fileType,
                file_url: fileUrl,
                file_id: fileId,
                raw_text: caption,
                caption,
                extracted_type: extraction.extracted_type || 'product',
                extracted_confidence: (extraction.confidence || 0) / 100,
                extracted_data: extraction,
                name: extraction.name,
                description: extraction.description,
                price: extraction.price,
                currency: extraction.currency || 'ETB',
                category: extraction.category,
                tags: extraction.tags || [],
                owner_confirmed: false
            }).select().single();

            await ctx.reply(
                `Got it!\n\n` +
                `*${extraction.name || 'Unnamed item'}*\n` +
                `${extraction.price ? `${extraction.price} ETB` : 'Price not found'}\n` +
                `${extraction.category || ''}\n\n` +
                `Confidence: ${extraction.confidence || 0}%`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Correct', callback_data: `confirm_${content?.id}` },
                                { text: 'Edit', callback_data: `edit_${content?.id}` }
                            ],
                            [{ text: 'Delete', callback_data: `delete_${content?.id}` }]
                        ]
                    }
                }
            );
        } catch (err) {
            console.error('Upload error:', err);
            await ctx.reply('Failed to analyze. Please try again or add manually via the dashboard.');
        }
    }

    async handleOwnerTrainingText(ctx, business, text) {
        const extraction = await this.ai.extractFromText(text);

        if (!extraction.name && extraction.confidence < 40) {
            return ctx.reply(
                `Not sure what to do with that.\n\n` +
                `Try:\n- Send a photo to add a product\n- Use /teach for help\n- Open the dashboard`
            );
        }

        await this.supabase.from('business_content').insert({
            business_id: business.id,
            content_type: 'text',
            raw_text: text,
            extracted_type: extraction.extracted_type || 'product',
            extracted_confidence: (extraction.confidence || 0) / 100,
            extracted_data: extraction,
            name: extraction.name,
            description: extraction.description,
            price: extraction.price,
            currency: extraction.currency || 'ETB',
            category: extraction.category,
            tags: extraction.tags || [],
            owner_confirmed: true
        });

        return ctx.reply(`Saved! Added "${extraction.name || extraction.extracted_type}" to your knowledge base.`);
    }

    async handleOwnerCorrection(ctx, business) {
        const correction = ctx.message.text;

        const { data: pending } = await this.supabase
            .from('pending_replies')
            .select('*')
            .eq('business_id', business.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!pending) return ctx.reply('No pending reply found.');

        await this.supabase.from('pending_replies')
            .update({ status: 'edited', owner_edited_text: correction, owner_action_at: new Date().toISOString() })
            .eq('id', pending.id);

        // Learn from this correction
        await this.supabase.from('business_content').insert({
            business_id: business.id,
            content_type: 'text',
            extracted_type: 'faq',
            extracted_data: {
                question: pending.original_message,
                answer: correction,
                source: 'owner_correction'
            },
            owner_confirmed: true
        });

        return ctx.reply(`Sent your correction and learned from it.\n\nQ: "${(pending.original_message || '').slice(0, 80)}"\nA: "${correction}"`);
    }

    // ── Callback Queries ───────────────────────────────────────────────────────

    async handleMainCallback(ctx) {
        const data = ctx.callbackQuery.data;
        await ctx.answerCbQuery();

        if (data === 'add_product') return ctx.reply('Send me a photo of your product with the price in the caption!');
        if (data === 'view_inbox') return this.ownerOrders(ctx);
        if (data === 'view_products') return this.ownerProducts(ctx);
        if (data === 'settings') return this.ownerSettings(ctx);
        if (data.startsWith('signup_')) return this.handleSignupChoice(ctx, data.replace('signup_', ''));

        if (data.startsWith('confirm_')) {
            await this.supabase.from('business_content').update({ owner_confirmed: true }).eq('id', data.replace('confirm_', ''));
            return ctx.reply('Product confirmed and live!');
        }
        if (data.startsWith('delete_')) {
            await this.supabase.from('business_content').update({ status: 'archived' }).eq('id', data.replace('delete_', ''));
            return ctx.reply('Item removed.');
        }
    }

    async handleSignupChoice(ctx, choice) {
        const msgs = {
            secretary: 'Secretary Mode: I reply from your existing Telegram account.\n\n1. Enable Telegram Business\n2. Add @MiniMeAgentBot as your chatbot\n3. Open the dashboard to complete setup',
            bot: 'Dedicated Bot Mode: I reply from a professional bot.\n\n1. Go to @BotFather and create a bot\n2. Open the dashboard to enter the token',
            both: 'Dual Mode (recommended): Your account + a backup bot.\n\nOpen the dashboard to get started'
        };
        return ctx.reply(msgs[choice] || 'Open the dashboard to get started', {
            reply_markup: {
                inline_keyboard: [[{ text: 'Open Dashboard', web_app: { url: this.config.WEB_URL } }]]
            }
        });
    }

    // ── Business Bots ──────────────────────────────────────────────────────────

    async loadBusinessBots() {
        const { data: businesses } = await this.supabase
            .from('businesses')
            .select('id, bot_username')
            .not('bot_username', 'is', null)
            .eq('status', 'active');

        for (const biz of businesses || []) {
            const { data: secret } = await this.supabase
                .from('encrypted_secrets')
                .select('*')
                .eq('entity_type', 'business')
                .eq('entity_id', biz.id)
                .eq('secret_type', 'bot_token')
                .single();

            if (secret) {
                try {
                    const token = this.encryption.decrypt({
                        encrypted: secret.encrypted_value,
                        iv: secret.iv,
                        authTag: secret.auth_tag
                    });
                    await this.addBusinessBot(biz.id, token, biz.bot_username);
                } catch (e) {
                    console.warn(`Failed to load bot for ${biz.bot_username}:`, e.message);
                }
            }
        }
    }

    async addBusinessBot(businessId, token, username) {
        const bot = new Telegraf(token);
        const customerHandler = new CustomerHandler(this.supabase, this.config);

        bot.start(ctx => ctx.reply(`Welcome! How can I help you today?`));
        bot.on(message('text'), ctx => customerHandler.handle(ctx, businessId, ctx.message.text));
        bot.catch(err => console.error(`[${username}] error:`, err.message));

        this.bots.set(businessId, { bot, token, username });
        return bot;
    }

    // ── Search Bot ─────────────────────────────────────────────────────────────

    async handleSearchQuery(ctx) {
        const handler = new SearchHandler(this.supabase, this.config);
        await handler.handleTextQuery(ctx, ctx.message.text, ctx.from.id);
    }

    async handleInlineQuery(ctx) {
        const handler = new SearchHandler(this.supabase, this.config);
        await handler.handleInlineQuery(ctx, ctx.inlineQuery.query, ctx.inlineQuery.from.id);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    async getOwnerBusiness(telegramId) {
        const { data } = await this.supabase
            .from('businesses')
            .select('*')
            .eq('owner_telegram_id', telegramId)
            .single();
        return data || null;
    }

    async getTodayStats(businessId) {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await this.supabase
            .from('analytics_daily')
            .select('total_conversations, leads_generated')
            .eq('business_id', businessId)
            .eq('date', today)
            .single();
        return { conversations: data?.total_conversations || 0, leads: data?.leads_generated || 0 };
    }

    async getFileUrl(fileId) {
        const resp = await fetch(
            `https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
        );
        const data = await resp.json();
        if (!data.ok) throw new Error('Failed to get file URL');
        return `https://api.telegram.org/file/bot${this.config.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
    }

    getBotCount() {
        return this.bots.size + (this.mainBot ? 1 : 0) + (this.searchBot ? 1 : 0);
    }

    async shutdown() {
        if (this.mainBot) await this.mainBot.stop('SIGTERM').catch(() => {});
        if (this.searchBot) await this.searchBot.stop('SIGTERM').catch(() => {});
        for (const [, { bot }] of this.bots) {
            await bot.stop('SIGTERM').catch(() => {});
        }
        console.log('All bots stopped');
    }
}

module.exports = BotManager;
