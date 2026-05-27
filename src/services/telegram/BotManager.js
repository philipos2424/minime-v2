const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
const CustomerHandler = require('../../handlers/CustomerHandler');
const SearchHandler = require('../../handlers/SearchHandler');
const OpenAIService = require('../ai/OpenAIService');
const botInstance = require('./_botInstance');

class BotManager {
    constructor(supabase, encryptionService, config) {
        this.supabase = supabase;
        this.encryption = encryptionService;
        this.config = config;
        this.bots = new Map();   // businessId -> { bot, token, username }
        this.signupSessions = new Map(); // userId -> { step, data }
        this.ai = new OpenAIService(config.OPENAI_API_KEY);

        // Create bots synchronously so they're ready immediately for webhook calls.
        // Critical on Vercel: prevents race condition where a request hits before init.
        this.mainBot = new Telegraf(config.TELEGRAM_BOT_TOKEN);
        this.setupMainBotHandlers(this.mainBot);
        botInstance.set(this.mainBot); // expose to handlers

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
        // Persona & learning commands
        bot.command('name', ctx => this.cmdSetName(ctx));
        bot.command('tone', ctx => this.cmdSetTone(ctx));
        bot.command('lang', ctx => this.cmdSetLanguage(ctx));
        bot.command('rule', ctx => this.cmdAddRule(ctx));
        bot.command('rules', ctx => this.cmdListRules(ctx));
        bot.command('shadow', ctx => this.cmdToggleShadow(ctx));
        bot.command('connectbot', ctx => this.cmdConnectBot(ctx));
        bot.command('advisor', ctx => this.cmdAdvisor(ctx));
        bot.on(message('photo'), ctx => this.handleOwnerMedia(ctx));
        bot.on(message('document'), ctx => this.handleOwnerMedia(ctx));
        bot.on(message('voice'), ctx => this.handleOwnerMedia(ctx));
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
                `🎭 Assistant: *${business.assistant_name || 'MiniMe'}*\n` +
                `Today: ${today.conversations} conversations, ${today.leads} leads\n\n` +
                `Send a product photo to add inventory, or tap a button below.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📱 Open Dashboard', web_app: { url: this.config.WEB_URL } }],
                            [
                                { text: '📦 Products', callback_data: 'view_products' },
                                { text: '📬 Inbox', callback_data: 'view_inbox' }
                            ],
                            [
                                { text: '🎓 Teach', callback_data: 'show_teach' },
                                { text: '⚙️ Status', callback_data: 'show_status' }
                            ]
                        ]
                    }
                }
            );
        }

        // ── New user — start conversational signup ────────────────────────────
        this.signupSessions.set(userId, { step: 'name', data: { owner_name: ctx.from.first_name } });
        return ctx.reply(
            `👋 *Welcome to MiniMe!*\n\n` +
            `I'm your AI sales assistant. Customers message you on Telegram — I reply for you, in your voice, 24/7.\n\n` +
            `Let's get you set up (takes 30 seconds).\n\n` +
            `*What's your business called?*\n` +
            `_(Example: Selam Boutique, Bole Tech, Habesha Cafe)_`,
            { parse_mode: 'Markdown' }
        );
    }

    async handleSignupText(ctx) {
        const userId = ctx.from.id;
        const session = this.signupSessions.get(userId);
        if (!session) return false; // not in signup
        const text = ctx.message.text.trim();

        if (session.step === 'name') {
            if (text.length < 2 || text.length > 60) {
                await ctx.reply('Please send a business name between 2 and 60 characters.');
                return true;
            }
            session.data.business_name = text;
            session.step = 'category';
            this.signupSessions.set(userId, session);
            await ctx.reply(
                `Great — *${text}* 🎉\n\n*What do you sell?* Pick a category:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📱 Electronics', callback_data: 'signup_cat_electronics' },
                                { text: '👗 Fashion', callback_data: 'signup_cat_clothing' }
                            ],
                            [
                                { text: '🍽 Food & Catering', callback_data: 'signup_cat_food' },
                                { text: '💆 Beauty', callback_data: 'signup_cat_beauty' }
                            ],
                            [
                                { text: '🏠 Furniture/Home', callback_data: 'signup_cat_furniture' },
                                { text: '🛠 Services', callback_data: 'signup_cat_services' }
                            ],
                            [
                                { text: '📸 Photography', callback_data: 'signup_cat_photography' },
                                { text: '🚚 Delivery', callback_data: 'signup_cat_delivery' }
                            ],
                            [{ text: '🏪 Other', callback_data: 'signup_cat_other' }]
                        ]
                    }
                }
            );
            return true;
        }

        // Fallback — re-prompt
        await ctx.reply('Tap one of the category buttons above, or send /start to restart.');
        return true;
    }

    async pickBotMode(ctx, category) {
        const userId = ctx.from.id;
        const session = this.signupSessions.get(userId);
        if (!session) return ctx.reply('Session expired. Send /start to restart.');
        session.data.category = category;
        session.step = 'bot_mode';
        this.signupSessions.set(userId, session);

        return ctx.reply(
            `Last step — *how should customers reach you?*\n\n` +
            `*Option 1: Use MiniMe directly* (recommended for now)\n` +
            `Customers tap your unique link → chat with @MiniMeAgentBot which replies as ${session.data.business_name}. Zero setup, you can switch to your own bot anytime.\n\n` +
            `*Option 2: Connect your own bot*\n` +
            `Create a bot via @BotFather, paste the token in Settings. Customers chat with @YourShopBot directly.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⚡ Use MiniMe directly (recommended)', callback_data: 'signup_mode_shared' }],
                        [{ text: '🤖 I have my own bot', callback_data: 'signup_mode_custom' }]
                    ]
                }
            }
        );
    }

    async finishSignup(ctx, mode) {
        const userId = ctx.from.id;
        const session = this.signupSessions.get(userId);
        if (!session) return ctx.reply('Session expired. Send /start to restart.');

        // Generate a shop code for shared-mode users
        const shopCode = Math.random().toString(36).slice(2, 10);

        const { data: business, error } = await this.supabase.from('businesses').insert({
            owner_telegram_id: userId,
            owner_telegram_username: ctx.from.username || null,
            owner_name: session.data.owner_name || ctx.from.first_name || null,
            business_name: session.data.business_name,
            category: session.data.category,
            assistant_name: 'MiniMe',
            tone: 'warm',
            language_preference: 'mixed',
            secretary_chat_id: ctx.chat.id,
            status: 'active',
            modes: mode === 'shared' ? ['secretary'] : ['bot'],
            primary_mode: mode === 'shared' ? 'secretary' : 'bot',
            shop_code: mode === 'shared' ? shopCode : null,
            rules: {
                shadow_mode: true,
                auto_reply: false,
                notify_on_sale: true,
                payment_methods: ['cash', 'telebirr']
            }
        }).select().single();

        this.signupSessions.delete(userId);

        if (error) {
            console.error('[signup] insert failed:', error);
            return ctx.reply(`❌ Setup failed: ${error.message}\n\nTry /start again.`);
        }

        const sharedLink = `https://t.me/MiniMeAgentBot?start=shop_${shopCode}`;

        // Shared mode → done now. Custom mode → continue to token paste.
        if (mode === 'custom') {
            return this.promptForBotToken(ctx, business);
        }

        const successText =
            `✅ *${business.business_name} is live!*\n\n` +
            `Share this link with customers — when they tap it, I'll reply as your business:\n\n` +
            `🔗 ${sharedLink}\n\n` +
            `*What to do next:*\n` +
            `1️⃣ Send a product photo with price in caption\n` +
            `2️⃣ \`/teach We deliver to Bole free over 5000 ETB\`\n` +
            `3️⃣ \`/rule Always mention warranty\`\n` +
            `4️⃣ \`/name Selam\` — give your assistant a name\n\n` +
            `Shadow mode is ON — every reply comes to you for approval first.`;

        return ctx.reply(successText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 Open Dashboard', web_app: { url: this.config.WEB_URL } }],
                    [
                        { text: '🎓 Teach something', callback_data: 'show_teach' },
                        { text: '⚙️ Status', callback_data: 'show_status' }
                    ]
                ]
            }
        });
    }

    // ── Custom Bot Connect — BotFather deep-link + token paste ────────────────
    async promptForBotToken(ctx, business) {
        // Mark this user as awaiting a token
        this.signupSessions.set(ctx.from.id, {
            step: 'awaiting_token',
            businessId: business.id,
            data: { business_name: business.business_name }
        });

        return ctx.reply(
            `🤖 *Get your own bot in 60 seconds*\n\n` +
            `1️⃣ Tap *Open BotFather* below\n` +
            `2️⃣ Send \`/newbot\` to BotFather\n` +
            `3️⃣ Pick a display name (e.g. *${business.business_name}*)\n` +
            `4️⃣ Pick a username — must end in \`bot\` (e.g. \`${(business.business_name || 'shop').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}_bot\`)\n` +
            `5️⃣ Copy the token BotFather sends — looks like \`123456789:AAH...\`\n` +
            `6️⃣ Send the token back to me — that's it!\n\n` +
            `_I'll set everything up automatically — webhook, commands, the works._`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📱 Open BotFather', url: 'https://t.me/BotFather' }],
                        [{ text: '⚡ Use MiniMe directly instead', callback_data: 'switch_to_shared' }]
                    ]
                }
            }
        );
    }

    async handleBotTokenPaste(ctx, business, token) {
        const userId = ctx.from.id;

        // 1. Format check
        if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
            return ctx.reply(
                `That doesn't look like a bot token. It should be a long string like:\n\n` +
                `\`123456789:AAH-1234abcdEFG_xxxxxxxxxxxxxxxx\`\n\n` +
                `Try copying it again from BotFather and pasting the whole thing.`,
                { parse_mode: 'Markdown' }
            );
        }

        const placeholder = await ctx.reply('⏳ Validating your bot…');

        try {
            // 2. Validate with Telegram
            const meResp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
            const meJson = await meResp.json();
            if (!meJson.ok) {
                await ctx.telegram.editMessageText(
                    ctx.chat.id, placeholder.message_id, null,
                    `❌ That token isn't valid: _${meJson.description || 'unknown error'}_\n\n` +
                    `Double-check you copied the whole token from BotFather and try again.`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            const botUsername = meJson.result.username;
            const botId = meJson.result.id;

            // 3. Encrypt and store the token
            const encrypted = this.encryption.encrypt(token);
            await this.supabase.from('encrypted_secrets').upsert({
                entity_type: 'business',
                entity_id: business.id,
                secret_type: 'bot_token',
                encrypted_value: encrypted.encrypted,
                iv: encrypted.iv,
                auth_tag: encrypted.authTag,
                version: 1,
                created_at: new Date().toISOString()
            }, { onConflict: 'entity_type,entity_id,secret_type' });

            // 4. Update business
            const modes = Array.isArray(business.modes) ? business.modes : [];
            if (!modes.includes('bot')) modes.push('bot');
            await this.supabase.from('businesses').update({
                bot_username: botUsername,
                primary_mode: 'bot',
                modes
            }).eq('id', business.id);

            // 5. Set webhook on the new bot
            const webhookUrl = `${this.config.WEB_URL.replace(/\/$/, '')}/webhook/telegram/business/${business.id}`;
            const whResp = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: webhookUrl,
                    allowed_updates: ['message', 'edited_message', 'callback_query', 'pre_checkout_query'],
                    drop_pending_updates: true
                })
            });
            const whJson = await whResp.json();
            if (!whJson.ok) {
                console.warn('[token connect] setWebhook failed:', whJson.description);
            }

            // 6. Set default commands on the new bot
            await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    commands: [
                        { command: 'start', description: 'Start a conversation' },
                        { command: 'products', description: 'Browse products' },
                        { command: 'help', description: 'Get help' },
                        { command: 'human', description: 'Talk to a human' }
                    ]
                })
            }).catch(() => {});

            // 7. Register in-memory so customer messages route to CustomerHandler
            await this.addBusinessBot(business.id, token, botUsername);

            // 8. Clear signup state
            this.signupSessions.delete(userId);

            // 9. Success message
            await ctx.telegram.editMessageText(
                ctx.chat.id, placeholder.message_id, null,
                `✅ *@${botUsername} is LIVE!*\n\n` +
                `🔗 https://t.me/${botUsername}\n\n` +
                `Share this link with customers — they'll message your bot, and I'll reply as *${business.assistant_name || 'MiniMe'}*.\n\n` +
                `Shadow mode is ON: every reply comes to you for approval first.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📱 Open Dashboard', web_app: { url: this.config.WEB_URL } }],
                            [{ text: `📸 Test it — open @${botUsername}`, url: `https://t.me/${botUsername}` }]
                        ]
                    }
                }
            );
        } catch (e) {
            console.error('[token connect] error:', e.message);
            await ctx.telegram.editMessageText(
                ctx.chat.id, placeholder.message_id, null,
                `❌ Something went wrong: _${e.message}_\n\nTry again, or use \`/connectbot\` to retry.`,
                { parse_mode: 'Markdown' }
            );
        }
    }

    async cmdConnectBot(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');
        if (business.bot_username) {
            return ctx.reply(
                `You already have a bot connected: *@${business.bot_username}*\n\n` +
                `Send a new token to replace it, or run /status to see your setup.`,
                { parse_mode: 'Markdown' }
            );
        }
        return this.promptForBotToken(ctx, business);
    }

    async switchToSharedMode(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');
        // Generate shop_code if missing
        let shopCode = business.shop_code;
        if (!shopCode) {
            shopCode = Math.random().toString(36).slice(2, 10);
            await this.supabase.from('businesses').update({
                shop_code: shopCode,
                primary_mode: 'secretary'
            }).eq('id', business.id);
        }
        this.signupSessions.delete(ctx.from.id);
        return ctx.reply(
            `✅ Switched to MiniMe direct mode!\n\n` +
            `Share this link with customers:\n` +
            `🔗 https://t.me/MiniMeAgentBot?start=shop_${shopCode}\n\n` +
            `You can still connect your own bot later with /connectbot.`,
            { parse_mode: 'Markdown' }
        );
    }

    // legacy path — kept for old callback compatibility
    async _legacyStartFlow(ctx) {
        return ctx.reply('Welcome! Send /start to begin setup.',
            {
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
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');

        // /teach <text>  → save inline knowledge
        const inline = ctx.message.text.replace(/^\/teach(@\S+)?\s*/, '').trim();
        if (inline) {
            const existing = Array.isArray(business.owner_instructions) ? business.owner_instructions : [];
            const updated = [...existing, {
                content: inline,
                source: 'teach',
                created_at: new Date().toISOString()
            }];
            await this.supabase.from('businesses').update({ owner_instructions: updated }).eq('id', business.id);
            return ctx.reply(
                `✅ Learned!\n\n_"${inline}"_\n\n${business.assistant_name || 'MiniMe'} will use this knowledge when answering customers.`,
                { parse_mode: 'Markdown' }
            );
        }

        // Otherwise, show instructions
        return ctx.reply(
            `*Teaching ${business.assistant_name || 'MiniMe'}*\n\n` +
            `Send a product photo with price in the caption\n` +
            `Example: "iPhone 15 Pro 256GB - 75,000 ETB"\n\n` +
            `*Quick teach with text:*\n` +
            `\`/teach We deliver to Bole free for orders over 5000 ETB\`\n` +
            `\`/teach Our warranty is 1 year on all phones\`\n\n` +
            `*Add behavior rules:*\n` +
            `\`/rule Always mention warranty\`\n\n` +
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

        const rules = Array.isArray(business.owner_instructions) ? business.owner_instructions : [];
        const samples = Array.isArray(business.sample_replies) ? business.sample_replies : [];
        const shadowOn = business.rules?.shadow_mode !== false;

        return ctx.reply(
            `*Status — ${business.assistant_name || 'MiniMe'}*\n\n` +
            `🏪 Business: ${business.business_name}\n` +
            `🎭 Assistant: *${business.assistant_name || 'MiniMe'}*\n` +
            `🗣 Tone: ${business.tone || 'warm'}\n` +
            `🌍 Language: ${business.language_preference || 'mixed'}\n` +
            `👁 Shadow mode: ${shadowOn ? '*ON* (you approve drafts)' : '*OFF* (auto-pilot)'}\n` +
            `📦 Products: ${productCount || 0}\n` +
            `📚 Rules taught: ${rules.length}\n` +
            `💬 Sample replies learned: ${samples.length}\n` +
            `⭐ Rating: ${business.average_rating || 0}/5\n\n` +
            `Configure: /name /tone /lang /shadow /rules`,
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

    // ── Persona & Learning Commands ────────────────────────────────────────────

    async cmdSetName(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');
        const name = ctx.message.text.replace(/^\/name(@\S+)?\s*/, '').trim();
        if (!name) {
            return ctx.reply(
                `Your assistant's current name is *${business.assistant_name || 'MiniMe'}*.\n\n` +
                `To change it, send:\n\`/name Selam\`\n\nThis is how the AI will refer to itself when replying to customers.`,
                { parse_mode: 'Markdown' }
            );
        }
        if (name.length > 30) return ctx.reply('Name must be 30 characters or less.');
        await this.supabase.from('businesses').update({ assistant_name: name }).eq('id', business.id);
        return ctx.reply(`✅ Done! Your assistant is now called *${name}*.\n\nNext time a customer messages you, ${name} will introduce themselves.`, { parse_mode: 'Markdown' });
    }

    async cmdSetTone(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');
        const arg = ctx.message.text.replace(/^\/tone(@\S+)?\s*/, '').trim().toLowerCase();
        const valid = ['warm', 'direct', 'professional'];
        if (!valid.includes(arg)) {
            return ctx.reply(
                `Current tone: *${business.tone || 'warm'}*\n\n` +
                `Set tone with: \`/tone warm\` / \`/tone direct\` / \`/tone professional\`\n\n` +
                `• *warm* — friendly Ethiopian shopkeeper energy\n` +
                `• *direct* — brief, no fluff, just facts\n` +
                `• *professional* — polite, formal`,
                { parse_mode: 'Markdown' }
            );
        }
        await this.supabase.from('businesses').update({ tone: arg }).eq('id', business.id);
        return ctx.reply(`✅ Tone set to *${arg}*.`, { parse_mode: 'Markdown' });
    }

    async cmdSetLanguage(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');
        const arg = ctx.message.text.replace(/^\/lang(@\S+)?\s*/, '').trim().toLowerCase();
        const valid = ['en', 'am', 'mixed'];
        if (!valid.includes(arg)) {
            return ctx.reply(
                `Current language: *${business.language_preference || 'mixed'}*\n\n` +
                `Set with: \`/lang en\` / \`/lang am\` / \`/lang mixed\`\n\n` +
                `• *en* — English only\n• *am* — Amharic only\n• *mixed* — Natural code-switching (recommended)`,
                { parse_mode: 'Markdown' }
            );
        }
        await this.supabase.from('businesses').update({ language_preference: arg }).eq('id', business.id);
        return ctx.reply(`✅ Language set to *${arg}*.`, { parse_mode: 'Markdown' });
    }

    async cmdAddRule(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');
        const ruleText = ctx.message.text.replace(/^\/rule(@\S+)?\s*/, '').trim();
        if (!ruleText) {
            return ctx.reply(
                `Add a behavior rule. Examples:\n\n` +
                `• \`/rule Always mention the 1-year warranty\`\n` +
                `• \`/rule Use emojis in every reply\`\n` +
                `• \`/rule Never quote prices in DM, only in person\`\n` +
                `• \`/rule If asked about delivery, say free over 1000 ETB\`\n\n` +
                `Use \`/rules\` to see all current rules.`,
                { parse_mode: 'Markdown' }
            );
        }
        const existing = Array.isArray(business.owner_instructions) ? business.owner_instructions : [];
        const newRule = {
            content: ruleText,
            source: 'rule',
            created_at: new Date().toISOString()
        };
        const updated = [...existing, newRule];
        await this.supabase.from('businesses').update({ owner_instructions: updated }).eq('id', business.id);
        return ctx.reply(`✅ Rule #${updated.length} added:\n\n_"${ruleText}"_\n\n${business.assistant_name || 'MiniMe'} will follow this from now on.`, { parse_mode: 'Markdown' });
    }

    async cmdListRules(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');
        const rules = Array.isArray(business.owner_instructions) ? business.owner_instructions : [];
        if (!rules.length) {
            return ctx.reply(
                `No rules yet. Add one with:\n\`/rule Always mention warranty\``,
                { parse_mode: 'Markdown' }
            );
        }
        const text = rules.map((r, i) => `${i + 1}. ${r.content || r.rule || r.text || r}`).join('\n');
        const keyboard = rules.map((_, i) => [{ text: `🗑 Delete #${i + 1}`, callback_data: `rule_del_${i}` }]);
        return ctx.reply(`*Active rules:*\n\n${text}`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    async cmdToggleShadow(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');
        const arg = ctx.message.text.replace(/^\/shadow(@\S+)?\s*/, '').trim().toLowerCase();
        const rules = business.rules || {};
        if (arg === 'on') rules.shadow_mode = true;
        else if (arg === 'off') rules.shadow_mode = false;
        else {
            const current = rules.shadow_mode !== false;
            return ctx.reply(
                `Shadow mode is *${current ? 'ON' : 'OFF'}*.\n\n` +
                `• *ON* — drafts go to you first; you approve before they reach customers\n` +
                `• *OFF* — replies sent directly to customers (auto-pilot)\n\n` +
                `Toggle: \`/shadow on\` or \`/shadow off\``,
                { parse_mode: 'Markdown' }
            );
        }
        await this.supabase.from('businesses').update({ rules }).eq('id', business.id);
        return ctx.reply(`✅ Shadow mode *${rules.shadow_mode ? 'ON' : 'OFF'}*.`, { parse_mode: 'Markdown' });
    }

    // ── Pending Reply Approval (shadow mode) ───────────────────────────────────

    async handlePendingReplyCallback(ctx, action, pendingId) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.answerCbQuery('Not authorized');

        const { data: pending } = await this.supabase
            .from('pending_replies')
            .select('*')
            .eq('id', pendingId)
            .single();

        if (!pending) return ctx.answerCbQuery('Draft expired or not found');
        if (pending.status !== 'pending') return ctx.answerCbQuery('Already handled');

        if (action === 'approve') {
            try {
                await this.mainBot.telegram.sendMessage(pending.customer_chat_id, pending.suggested_reply, { parse_mode: 'Markdown' });
                await this.supabase.from('pending_replies').update({
                    status: 'approved',
                    owner_action_at: new Date().toISOString(),
                    owner_action_via: 'telegram'
                }).eq('id', pendingId);
                await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n✅ *Approved and sent.*', { parse_mode: 'Markdown' });
            } catch (e) {
                await ctx.answerCbQuery('Send failed: ' + e.message);
                return;
            }
            return ctx.answerCbQuery('Sent!');
        }

        if (action === 'skip') {
            await this.supabase.from('pending_replies').update({
                status: 'rejected',
                owner_action_at: new Date().toISOString(),
                owner_action_via: 'telegram'
            }).eq('id', pendingId);
            await ctx.editMessageText(ctx.callbackQuery.message.text + '\n\n⏭ *Skipped.*', { parse_mode: 'Markdown' });
            return ctx.answerCbQuery('Skipped');
        }

        if (action === 'edit') {
            await ctx.answerCbQuery('Reply to this message with your edited version');
            await this.mainBot.telegram.sendMessage(
                ctx.from.id,
                `✏️ *Edit draft #${pendingId.slice(0, 8)}*\n\nReply to THIS message with your new version. It will be sent to the customer.`,
                { parse_mode: 'Markdown', reply_markup: { force_reply: true } }
            );
            // Mark as pending-edit so handleOwnerCorrection can find it
            await this.supabase.from('pending_replies').update({ status: 'editing' }).eq('id', pendingId);
        }
    }

    async handleRuleDelete(ctx, index) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.answerCbQuery('Not authorized');
        const rules = Array.isArray(business.owner_instructions) ? business.owner_instructions : [];
        if (index < 0 || index >= rules.length) return ctx.answerCbQuery('Rule not found');
        const removed = rules.splice(index, 1)[0];
        await this.supabase.from('businesses').update({ owner_instructions: rules }).eq('id', business.id);
        await ctx.answerCbQuery('Deleted');
        await ctx.editMessageText(
            (ctx.callbackQuery.message.text || '') + `\n\n🗑 Removed: _"${(removed.content || removed).toString().slice(0, 60)}"_`,
            { parse_mode: 'Markdown' }
        );
    }

    // ── Text & Media ───────────────────────────────────────────────────────────

    async handleMainBotText(ctx) {
        const text = ctx.message.text || '';
        const userId = ctx.from.id;

        // Token detection (works during signup OR for existing owners pasting a token)
        const tokenMatch = text.trim().match(/^(\d+:[A-Za-z0-9_-]{30,})$/);
        if (tokenMatch) {
            const business = await this.getOwnerBusiness(userId);
            if (business) {
                return this.handleBotTokenPaste(ctx, business, tokenMatch[1]);
            }
            // If they're in awaiting_token signup state, business should already exist;
            // if not, fall through to signup handling
        }

        // Signup in progress?
        if (this.signupSessions.has(userId)) {
            const session = this.signupSessions.get(userId);
            // If awaiting token but they sent something else
            if (session.step === 'awaiting_token') {
                return ctx.reply(
                    `Send me the token from BotFather — it looks like:\n\n` +
                    `\`123456789:AAH-1234abcdEFG_xxxxxxxxxxxxxxxx\`\n\n` +
                    `Tap *Open BotFather* above if you haven't gotten one yet, or tap *Use MiniMe directly* to skip.`,
                    { parse_mode: 'Markdown' }
                );
            }
            return this.handleSignupText(ctx);
        }

        const business = await this.getOwnerBusiness(userId);
        if (!business) {
            return ctx.reply('👋 Send /start to set up your business.');
        }

        // Owner replying to a bot suggestion (draft edit)
        if (ctx.message.reply_to_message?.from?.is_bot) {
            return this.handleOwnerCorrection(ctx, business);
        }

        // Otherwise treat as training text
        return this.handleOwnerTrainingText(ctx, business, text);
    }

    // ── Forwarded message learning ─────────────────────────────────────────────
    async handleOwnerMedia(ctx) {
        const msg = ctx.message;
        // Detect forwarded messages (any version of the Telegram API)
        const isForwarded = !!(msg.forward_from || msg.forward_from_chat || msg.forward_sender_name || msg.forward_origin);
        if (isForwarded) return this.handleOwnerForward(ctx);
        return this.handleOwnerUpload(ctx);
    }

    async handleOwnerForward(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');

        const msg = ctx.message;
        const forwardedFrom =
            msg.forward_from?.first_name ||
            msg.forward_from?.username ||
            msg.forward_from_chat?.title ||
            msg.forward_origin?.sender_user?.first_name ||
            msg.forward_origin?.sender_user_name ||
            msg.forward_sender_name ||
            'a customer';

        const caption = (msg.caption || '').trim();
        const messageText = msg.text || caption || '';

        await ctx.reply(`📨 Learning from forwarded message from *${forwardedFrom}*…`, { parse_mode: 'Markdown' });

        try {
            let learnedText = messageText;

            // If there's media, transcribe / extract first
            if (msg.photo?.length) {
                const fileId = msg.photo[msg.photo.length - 1].file_id;
                const fileUrl = await this.getFileUrl(fileId);
                const extraction = await this.ai.extractFromImage(fileUrl, caption);
                learnedText = `[forwarded photo from ${forwardedFrom}]\n${caption}\n` + JSON.stringify(extraction);

                // Save as a product if extracted
                if (extraction.name || extraction.price) {
                    await this.supabase.from('business_content').insert({
                        business_id: business.id,
                        content_type: 'photo',
                        file_url: fileUrl,
                        file_id: fileId,
                        raw_text: caption,
                        caption,
                        extracted_type: extraction.extracted_type || 'product',
                        extracted_data: extraction,
                        name: extraction.name,
                        description: extraction.description,
                        price: extraction.price,
                        currency: 'ETB',
                        category: extraction.category,
                        tags: extraction.tags || [],
                        owner_confirmed: false
                    });
                }
            } else if (msg.document) {
                const fileId = msg.document.file_id;
                const fileUrl = await this.getFileUrl(fileId);
                learnedText = `[forwarded ${msg.document.mime_type || 'file'} from ${forwardedFrom}]\n${caption || msg.document.file_name}`;
                await this.supabase.from('business_content').insert({
                    business_id: business.id,
                    content_type: 'document',
                    file_url: fileUrl,
                    file_id: fileId,
                    raw_text: caption || msg.document.file_name,
                    caption,
                    extracted_type: 'business_info',
                    owner_confirmed: true
                });
            }

            // Always save as a learning sample — this is how the AI picks up the owner's
            // voice and typical customer questions
            const existingSamples = Array.isArray(business.sample_replies) ? business.sample_replies : [];
            const newSample = {
                source: 'forward',
                from: forwardedFrom,
                content: learnedText.slice(0, 1000),
                owner_caption: caption || null,
                created_at: new Date().toISOString()
            };
            const updatedSamples = [newSample, ...existingSamples].slice(0, 30);

            // If caption looks like "Q: ... A: ..." or has a clear answer, save as FAQ
            const looksLikeFaq = caption && (caption.length > 20 || /\?/.test(messageText));
            const instructionsUpdate = looksLikeFaq ? {
                owner_instructions: [
                    ...(business.owner_instructions || []),
                    {
                        source: 'faq',
                        question: messageText.slice(0, 200),
                        answer: caption,
                        created_at: new Date().toISOString()
                    }
                ]
            } : {};

            await this.supabase.from('businesses').update({
                sample_replies: updatedSamples,
                ...instructionsUpdate
            }).eq('id', business.id);

            const summary = looksLikeFaq
                ? `📚 Saved as FAQ!\n\nQ: _"${messageText.slice(0, 100)}"_\nA: _"${caption.slice(0, 150)}"_\n\nNext time a customer asks something similar, I'll use this exact answer.`
                : `✅ Learned!\n\nI saved this as a voice sample. Forward more messages with captions like "Q: ... A: ..." to teach me exact answers.\n\n*Tip:* Forward customer messages with the perfect reply you would have sent — I'll mimic your style.`;

            return ctx.reply(summary, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error('[forward learn] error:', e.message);
            return ctx.reply(`❌ Couldn't learn from that. ${e.message}`);
        }
    }

    // ── AI Advisor ─────────────────────────────────────────────────────────────
    async cmdAdvisor(ctx) {
        const business = await this.getOwnerBusiness(ctx.from.id);
        if (!business) return ctx.reply('Please /start first.');

        const question = ctx.message.text.replace(/^\/advisor(@\S+)?\s*/, '').trim();
        if (!question) {
            return ctx.reply(
                `🧠 *${business.assistant_name || 'MiniMe'} Advisor*\n\n` +
                `Ask me anything about your business:\n\n` +
                `• \`/advisor what should I focus on this week?\`\n` +
                `• \`/advisor which products sell best?\`\n` +
                `• \`/advisor how do I increase orders?\`\n` +
                `• \`/advisor what did customers ask today?\`\n\n` +
                `I'll analyze your data and give you a clear answer.`,
                { parse_mode: 'Markdown' }
            );
        }

        await ctx.reply(`🧠 Thinking...`);

        try {
            // Gather business context
            const today = new Date().toISOString().split('T')[0];
            const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

            const [
                { data: products },
                { count: todayConversations },
                { count: weekConversations },
                { data: recentConvos },
                { data: pendingReplies },
                { count: totalReservations }
            ] = await Promise.all([
                this.supabase.from('business_content').select('name, price, view_count, inquiry_count, stock_quantity').eq('business_id', business.id).eq('status', 'active').eq('extracted_type', 'product').limit(20),
                this.supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', today),
                this.supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', weekAgo),
                this.supabase.from('conversations').select('customer_message, intent, sentiment').eq('business_id', business.id).gte('created_at', weekAgo).limit(20),
                this.supabase.from('pending_replies').select('id', { count: 'exact', head: true }).eq('business_id', business.id).eq('status', 'pending'),
                this.supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', weekAgo)
            ]);

            const productLines = (products || []).map(p =>
                `• ${p.name} — ${p.price ? p.price + ' ETB' : 'no price'} (views: ${p.view_count || 0}, inquiries: ${p.inquiry_count || 0}${p.stock_quantity != null ? ', stock: ' + p.stock_quantity : ''})`
            ).join('\n') || '(no products)';

            const recentQuestions = (recentConvos || []).slice(0, 10).map(c =>
                `• ${c.customer_message?.slice(0, 80) || ''} (intent: ${c.intent}, ${c.sentiment})`
            ).join('\n') || '(no recent conversations)';

            const systemPrompt = `You are the AI advisor for ${business.business_name}, an Ethiopian ${business.category || 'business'}.
Be DIRECT, give SPECIFIC actionable advice. Use the business's actual data below. Don't generalize.

BUSINESS STATE:
- Today's conversations: ${todayConversations || 0}
- Last 7 days: ${weekConversations || 0} conversations, ${totalReservations || 0} reservations
- Pending draft replies awaiting owner: ${pendingReplies?.count || 0}

PRODUCTS:
${productLines}

RECENT CUSTOMER QUESTIONS (last 7 days):
${recentQuestions}

TONE: friendly, like a smart business mentor talking to an Ethiopian shopkeeper. Mix Amharic-English naturally if appropriate. Keep under 200 words. Use bullet points if listing.`;

            const response = await this.ai.client.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: question }
                ],
                temperature: 0.7,
                max_tokens: 500
            });

            const answer = response.choices[0].message.content;
            return ctx.reply(`🧠 *Advisor:*\n\n${answer}`, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error('[advisor] error:', e.message);
            return ctx.reply(`❌ Couldn't get advice right now. ${e.message}`);
        }
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

        // Find the most recent pending or editing reply
        const { data: pending } = await this.supabase
            .from('pending_replies')
            .select('*')
            .eq('business_id', business.id)
            .in('status', ['pending', 'editing'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!pending) return ctx.reply('No pending reply found.');

        // Send the edited reply to the customer
        try {
            await this.mainBot.telegram.sendMessage(pending.customer_chat_id, correction, { parse_mode: 'Markdown' });
        } catch (e) {
            console.error('[edit send] failed:', e.message);
            return ctx.reply(`❌ Couldn't send the edit to the customer: ${e.message}`);
        }

        await this.supabase.from('pending_replies')
            .update({
                status: 'edited',
                owner_edited_text: correction,
                owner_action_at: new Date().toISOString(),
                owner_action_via: 'telegram',
                learned_from_this: true
            }).eq('id', pending.id);

        // ── LEARNING: save edited reply as a sample_reply for future voice matching ──
        const existingSamples = Array.isArray(business.sample_replies) ? business.sample_replies : [];
        const isMeaningfulEdit = correction.length > 10 && correction.length < 800;
        if (isMeaningfulEdit) {
            const newSample = {
                source: 'owner_edit',
                question: pending.original_message?.slice(0, 300),
                answer: correction,
                created_at: new Date().toISOString()
            };
            const updatedSamples = [newSample, ...existingSamples].slice(0, 30);
            await this.supabase.from('businesses').update({ sample_replies: updatedSamples }).eq('id', business.id);
        }

        // Also store as FAQ if it's a clean Q&A pair
        if (pending.original_message && correction.length > 10) {
            await this.supabase.from('business_content').insert({
                business_id: business.id,
                content_type: 'text',
                extracted_type: 'faq',
                raw_text: pending.original_message,
                description: correction,
                extracted_data: {
                    question: pending.original_message,
                    answer: correction,
                    source: 'owner_correction'
                },
                owner_confirmed: true
            });
        }

        return ctx.reply(
            `✅ *Sent and learned!*\n\n` +
            `Q: _"${(pending.original_message || '').slice(0, 100)}"_\n` +
            `A: _"${correction.slice(0, 150)}"_\n\n` +
            `${business.assistant_name || 'MiniMe'} will use your style next time.`,
            { parse_mode: 'Markdown' }
        );
    }

    // ── Callback Queries ───────────────────────────────────────────────────────

    async handleMainCallback(ctx) {
        const data = ctx.callbackQuery.data;

        // Pending reply actions (shadow mode approval)
        if (data.startsWith('pr_approve_')) return this.handlePendingReplyCallback(ctx, 'approve', data.replace('pr_approve_', ''));
        if (data.startsWith('pr_edit_')) return this.handlePendingReplyCallback(ctx, 'edit', data.replace('pr_edit_', ''));
        if (data.startsWith('pr_skip_')) return this.handlePendingReplyCallback(ctx, 'skip', data.replace('pr_skip_', ''));

        // Rule delete
        if (data.startsWith('rule_del_')) return this.handleRuleDelete(ctx, parseInt(data.replace('rule_del_', ''), 10));

        // Signup: category picked → ask about bot mode
        if (data.startsWith('signup_cat_')) {
            await ctx.answerCbQuery();
            return this.pickBotMode(ctx, data.replace('signup_cat_', ''));
        }
        // Signup: bot mode picked → finalize
        if (data.startsWith('signup_mode_')) {
            await ctx.answerCbQuery('Setting up...');
            return this.finishSignup(ctx, data.replace('signup_mode_', ''));
        }
        // Switch from custom bot mode to shared mode (during/after signup)
        if (data === 'switch_to_shared') {
            await ctx.answerCbQuery('Switching...');
            return this.switchToSharedMode(ctx);
        }

        await ctx.answerCbQuery();

        if (data === 'add_product') return ctx.reply('Send me a photo of your product with the price in the caption!');
        if (data === 'view_inbox') return this.ownerOrders(ctx);
        if (data === 'view_products') return this.ownerProducts(ctx);
        if (data === 'settings') return this.ownerSettings(ctx);
        if (data === 'show_teach') return this.ownerTeach(ctx);
        if (data === 'show_status') return this.ownerStatus(ctx);

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
