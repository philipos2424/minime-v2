const OpenAIService = require('../services/ai/OpenAIService');
const { createClient } = require('@supabase/supabase-js');

class CustomerHandler {
    constructor(supabase, config) {
        this.supabase = supabase;
        this.config = config;
        this.ai = new OpenAIService(config.OPENAI_API_KEY);
    }

    async handle(ctx, businessId, text) {
        const customerId = ctx.from.id;
        const chatId = ctx.chat.id;
        const username = ctx.from.username;
        const firstName = ctx.from.first_name;

        try {
            // 1. Get or create conversation state
            const state = await this.getOrCreateState(businessId, customerId);

            // 2. Get business info
            const { data: business } = await this.supabase
                .from('businesses')
                .select('*')
                .eq('id', businessId)
                .single();

            if (!business) {
                await ctx.reply('Sorry, this business is not available.');
                return;
            }

            // 3. Analyze message intent
            const analysis = await this.ai.analyzeMessage(text, {
                businessId,
                customerId,
                state,
                language: state.preferences?.language || 'en'
            });

            // 4. Check escalation
            if (analysis.needs_escalation || analysis.confidence < 60) {
                await this.escalateToOwner(ctx, business, text, analysis);
                return;
            }

            // 5. Get relevant products
            const products = await this.getRelevantProducts(businessId, analysis);

            // 6. Generate reply
            const reply = await this.ai.generateConsultantReply(
                business,
                products,
                text,
                state,
                analysis
            );

            // 7. Update state
            await this.updateState(state, analysis, text);

            // 8. Generate buttons based on stage
            const buttons = this.generateButtons(state, analysis, products);

            // 9. Send reply
            await ctx.reply(reply, {
                reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
                parse_mode: 'Markdown'
            });

            // 10. Log conversation
            await this.logConversation({
                businessId,
                customerId,
                chatId,
                customerName: firstName,
                username,
                message: text,
                reply,
                modeUsed: 'bot',
                confidence: analysis.confidence,
                sentiment: analysis.sentiment,
                intent: analysis.intent,
                entities: analysis.extracted_entities
            });

            // 11. Check for reservation or purchase intent
            if (analysis.intent === 'purchase' || analysis.intent === 'reservation') {
                await this.handlePurchaseIntent(ctx, business, state, products);
            }

        } catch (error) {
            console.error('Customer handler error:', error);
            await ctx.reply('Sorry, something went wrong. Let me connect you with the owner.');
            await this.escalateToOwner(ctx, { id: businessId }, text, { needs_escalation: true });
        }
    }

    async getOrCreateState(businessId, customerId) {
        const { data: existing } = await this.supabase
            .from('conversation_states')
            .select('*')
            .eq('business_id', businessId)
            .eq('customer_telegram_id', customerId)
            .single();

        if (existing) {
            // Update last activity
            await this.supabase
                .from('conversation_states')
                .update({ last_activity_at: new Date().toISOString() })
                .eq('id', existing.id);
            return existing;
        }

        // Create new state
        const { data: newState } = await this.supabase
            .from('conversation_states')
            .insert({
                business_id: businessId,
                customer_telegram_id: customerId,
                session_count: 1
            })
            .select()
            .single();

        return newState;
    }

    async getRelevantProducts(businessId, analysis) {
        let query = this.supabase
            .from('business_content')
            .select('*')
            .eq('business_id', businessId)
            .eq('status', 'active')
            .eq('extracted_type', 'product');

        // Apply filters based on analysis
        if (analysis.extracted_entities?.budget_max) {
            query = query.lte('price', analysis.extracted_entities.budget_max);
        }

        if (analysis.extracted_entities?.budget_min) {
            query = query.gte('price', analysis.extracted_entities.budget_min);
        }

        if (analysis.extracted_entities?.product) {
            query = query.or(`name.ilike.%${analysis.extracted_entities.product}%,tags.cs.{${analysis.extracted_entities.product}}`);
        }

        const { data: products } = await query.limit(5);
        return products || [];
    }

    async updateState(state, analysis, message) {
        const updates = {
            last_activity_at: new Date().toISOString()
        };

        // Update intent
        if (analysis.intent) {
            updates.current_intent = analysis.intent;
            updates.intent_history = [...(state.intent_history || []), analysis.intent].slice(-10);
        }

        // Update budget
        if (analysis.extracted_entities?.budget_min) {
            updates.budget_min = analysis.extracted_entities.budget_min;
        }
        if (analysis.extracted_entities?.budget_max) {
            updates.budget_max = analysis.extracted_entities.budget_max;
        }

        // Update purpose
        if (analysis.extracted_entities?.purpose) {
            updates.purpose = analysis.extracted_entities.purpose;
        }

        // Update preferences
        const prefs = { ...(state.preferences || {}) };
        if (analysis.extracted_entities?.brand) {
            prefs.brand = analysis.extracted_entities.brand;
        }
        if (analysis.extracted_entities?.color) {
            prefs.color = analysis.extracted_entities.color;
        }
        if (analysis.extracted_entities?.size) {
            prefs.size = analysis.extracted_entities.size;
        }
        updates.preferences = prefs;

        // Update stage
        updates.stage = this.determineStage(state, analysis);
        updates.stage_history = [...(state.stage_history || []), { stage: updates.stage, at: new Date().toISOString() }].slice(-20);

        // Update questions asked
        if (analysis.suggested_questions?.length > 0) {
            updates.questions_asked = [...(state.questions_asked || []), ...analysis.suggested_questions].slice(-20);
        }

        // Update customer profile
        const profile = { ...(state.customer_profile || {}) };
        if (analysis.language) {
            profile.language = analysis.language;
        }
        updates.customer_profile = profile;

        await this.supabase
            .from('conversation_states')
            .update(updates)
            .eq('id', state.id);
    }

    determineStage(state, analysis) {
        const currentStage = state.stage || 'greeting';
        const hasBudget = state.budget_min || state.budget_max || analysis.extracted_entities?.budget_max;
        const hasPurpose = state.purpose || analysis.extracted_entities?.purpose;
        const hasProduct = analysis.extracted_entities?.product;
        const intent = analysis.intent;

        // Stage progression logic
        if (intent === 'greeting') return 'greeting';
        if (intent === 'goodbye') return 'closing';
        if (intent === 'purchase' || intent === 'reservation') return 'reserving';
        if (intent === 'complaint') return 'escalating';

        if (currentStage === 'greeting') {
            if (hasProduct || hasPurpose) return 'qualifying';
        }

        if (currentStage === 'qualifying') {
            if (hasBudget && hasPurpose) return 'recommending';
        }

        if (currentStage === 'recommending') {
            if (analysis.is_follow_up && state.shown_content_ids?.length > 0) return 'comparing';
        }

        if (currentStage === 'comparing') {
            if (intent === 'purchase') return 'reserving';
        }

        return currentStage;
    }

    generateButtons(state, analysis, products) {
        const stage = state.stage || 'greeting';
        const buttons = [];

        if (stage === 'greeting') {
            buttons.push([
                { text: '💻 Laptops', callback_data: 'category_laptop' },
                { text: '📱 Phones', callback_data: 'category_phone' }
            ]);
            buttons.push([
                { text: '💬 Ask a Question', callback_data: 'ask_question' }
            ]);
        }

        if (stage === 'qualifying') {
            if (!state.budget_min) {
                buttons.push([
                    { text: 'Under 15k', callback_data: 'budget_0_15000' },
                    { text: '15k-25k', callback_data: 'budget_15000_25000' }
                ]);
                buttons.push([
                    { text: '25k-40k', callback_data: 'budget_25000_40000' },
                    { text: '40k+', callback_data: 'budget_40000_999999' }
                ]);
            }
            if (!state.purpose) {
                buttons.push([
                    { text: '🎓 School', callback_data: 'purpose_school' },
                    { text: '💼 Work', callback_data: 'purpose_work' }
                ]);
                buttons.push([
                    { text: '🎮 Gaming', callback_data: 'purpose_gaming' },
                    { text: '💻 Programming', callback_data: 'purpose_programming' }
                ]);
            }
        }

        if (stage === 'recommending' && products.length > 0) {
            products.slice(0, 3).forEach((product, i) => {
                buttons.push([
                    { text: `🛒 ${product.name} - ${product.price} ETB`, callback_data: `product_${product.id}` }
                ]);
            });
            buttons.push([
                { text: '🔍 Compare', callback_data: 'compare_products' },
                { text: '❓ Ask More', callback_data: 'ask_more' }
            ]);
        }

        if (stage === 'reserving') {
            buttons.push([
                { text: '✅ Reserve Now', callback_data: 'reserve_now' },
                { text: '📍 Get Location', callback_data: 'get_location' }
            ]);
            buttons.push([
                { text: '💬 Talk to Owner', callback_data: 'talk_to_owner' }
            ]);
        }

        return buttons.length > 0 ? buttons : null;
    }

    async escalateToOwner(ctx, business, message, analysis) {
        // Create pending reply for shadow mode
        await this.supabase.from('pending_replies').insert({
            business_id: business.id,
            customer_chat_id: ctx.chat.id,
            customer_telegram_id: ctx.from.id,
            original_message: message,
            suggested_reply: 'Needs owner attention',
            suggested_reply_confidence: analysis.confidence,
            status: 'pending',
            auto_approve_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // Auto-approve in 30 min
        });

        // Notify owner
        const ownerMessage = `🚨 New message needs your attention!\n\n` +
            `Customer: ${ctx.from.first_name || 'Unknown'}\n` +
            `Message: "${message}"\n\n` +
            `Confidence: ${analysis.confidence}%\n` +
            `Reason: ${analysis.needs_escalation ? 'Needs human touch' : 'Low confidence'}\n\n` +
            `[Reply to handle]`;

        // Send to owner via main bot
        // Implementation depends on your bot setup

        // Tell customer
        await ctx.reply(
            `I've notified the owner about your message. They'll reply shortly!\n\n` +
            `In the meantime, can I help with anything else?`
        );
    }

    async handlePurchaseIntent(ctx, business, state, products) {
        // Generate reservation code
        const reservationCode = `MM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

        const expiryTime = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

        await ctx.reply(
            `✅ Reservation initiated!\n\n` +
            `Code: *${reservationCode}*\n` +
            `Valid until: ${expiryTime.toLocaleTimeString()}\n\n` +
            `📍 Pickup: ${business.location || 'Ask owner for location'}\n` +
            `💰 Payment: Cash, Telebirr, or Chapa\n\n` +
            `Show this code at pickup. The owner has been notified!`,
            { parse_mode: 'Markdown' }
        );

        // Store reservation
        await this.supabase.from('transactions').insert({
            business_id: business.id,
            customer_telegram_id: ctx.from.id,
            product_id: state.shown_content_ids?.[0],
            reservation_code: reservationCode,
            reservation_expires_at: expiryTime.toISOString(),
            status: 'reserved',
            payment_status: 'pending'
        });

        // Notify owner
        // Implementation depends on your setup
    }

    async logConversation(data) {
        await this.supabase.from('conversations').insert({
            business_id: data.businessId,
            customer_telegram_id: data.customerId,
            customer_chat_id: data.chatId,
            customer_name: data.customerName,
            customer_message: data.message,
            bot_reply: data.reply,
            mode_used: data.modeUsed,
            confidence: data.confidence,
            sentiment: data.sentiment,
            intent: data.intent,
            extracted_entities: data.entities,
            source: 'direct'
        });
    }
}

module.exports = CustomerHandler;
