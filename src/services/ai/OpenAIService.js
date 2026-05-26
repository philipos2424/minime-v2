const { OpenAI } = require('openai');

class OpenAIService {
    constructor(apiKey) {
        this.client = new OpenAI({ apiKey });
        this.models = {
            fast: 'gpt-4o-mini',      // 90% of queries
            smart: 'gpt-4o',          // Complex Amharic, nuanced
            vision: 'gpt-4o',         // Image analysis
            embedding: 'text-embedding-3-small'
        };
        this.tokenUsage = { prompt: 0, completion: 0, total: 0 };
    }

    async analyzeMessage(messageText, context = {}) {
        const systemPrompt = `You are MiniMe's intent analyzer for Ethiopian business conversations.
Analyze the customer message and return JSON only.

Context: ${JSON.stringify(context)}

Return EXACTLY this JSON structure:
{
  "intent": "price_inquiry|stock_check|purchase|consultation|complaint|joke|off_topic|bulk_order|refund|inappropriate|greeting|goodbye|thanks|other",
  "sentiment": "positive|neutral|negative|angry|excited",
  "urgency": 1-10,
  "confidence": 0-100,
  "needs_escalation": true|false,
  "suggested_tone": "friendly|professional|apologetic|humorous|formal|empathetic",
  "language": "en|am|mixed|other",
  "extracted_entities": {
    "product": "string or null",
    "brand": "string or null",
    "budget_min": number or null,
    "budget_max": number or null,
    "location": "string or null",
    "purpose": "school|work|gaming|programming|personal|gift|other|null",
    "urgency_type": "immediate|today|this_week|flexible|null",
    "quantity": number or null,
    "color": "string or null",
    "size": "string or null"
  },
  "missing_info": ["what we need to ask"],
  "suggested_questions": ["next question to ask"],
  "is_follow_up": true|false,
  "follow_up_context": "string or null"
}`;

        try {
            const response = await this.client.chat.completions.create({
                model: this.models.fast,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: messageText }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.3,
                max_tokens: 800
            });

            this.trackUsage(response.usage);
            const result = JSON.parse(response.choices[0].message.content);

            // Validate required fields
            return {
                intent: result.intent || 'other',
                sentiment: result.sentiment || 'neutral',
                urgency: Math.min(10, Math.max(1, result.urgency || 5)),
                confidence: Math.min(100, Math.max(0, result.confidence || 50)),
                needs_escalation: !!result.needs_escalation,
                suggested_tone: result.suggested_tone || 'friendly',
                language: result.language || 'en',
                extracted_entities: result.extracted_entities || {},
                missing_info: result.missing_info || [],
                suggested_questions: result.suggested_questions || [],
                is_follow_up: !!result.is_follow_up,
                follow_up_context: result.follow_up_context || null
            };
        } catch (error) {
            console.error('Analyze message error:', error);
            return this.getDefaultAnalysis();
        }
    }

    async generateConsultantReply(business, products, customerMessage, state, analysis, history = []) {
        const systemPrompt = this.buildConsultantPrompt(business, products, state, analysis);

        const model = analysis.language === 'am' ? this.models.smart : this.models.fast;

        try {
            const messages = [{ role: 'system', content: systemPrompt }];

            // Include recent conversation history (alternating user/assistant)
            for (const turn of history) {
                if (turn.customer_message) {
                    messages.push({ role: 'user', content: turn.customer_message.slice(0, 500) });
                }
                if (turn.bot_reply) {
                    messages.push({ role: 'assistant', content: turn.bot_reply.slice(0, 500) });
                }
            }

            messages.push({ role: 'user', content: customerMessage });

            const response = await this.client.chat.completions.create({
                model,
                messages,
                temperature: 0.8,
                max_tokens: 400,
                presence_penalty: 0.3,
                frequency_penalty: 0.2
            });

            this.trackUsage(response.usage);
            return response.choices[0].message.content;
        } catch (error) {
            console.error('Generate reply error:', error);
            return this.getFallbackReply(analysis.language || 'en');
        }
    }

    async extractFromImage(imageUrl, caption = '') {
        try {
            const response = await this.client.chat.completions.create({
                model: this.models.vision,
                messages: [
                    {
                        role: 'system',
                        content: `You are MiniMe's product extractor. Analyze this image and caption from an Ethiopian business owner.
Return JSON with extracted product information. Be precise about prices in ETB.

Return:
{
  "extracted_type": "product|faq|business_info|portfolio|service_desc|price_list|other",
  "name": "product name",
  "description": "short description",
  "price": number or null,
  "currency": "ETB",
  "category": "electronics|beauty|food|clothing|furniture|other",
  "sub_category": "string or null",
  "brand": "string or null",
  "model": "string or null",
  "condition": "new|used|refurbished|null",
  "specs": {"key": "value"},
  "tags": ["tag1", "tag2"],
  "selling_points": ["point1", "point2"],
  "confidence": 0-100,
  "needs_clarification": ["what to ask owner"]
}`
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: caption || 'Extract product details from this image' },
                            { type: 'image_url', image_url: { url: imageUrl } }
                        ]
                    }
                ],
                response_format: { type: 'json_object' },
                max_tokens: 800
            });

            this.trackUsage(response.usage);
            return JSON.parse(response.choices[0].message.content);
        } catch (error) {
            console.error('Vision extraction error:', error);
            return { extracted_type: 'other', confidence: 0, needs_clarification: ['Could not analyze image'] };
        }
    }

    async extractFromText(text) {
        try {
            const response = await this.client.chat.completions.create({
                model: this.models.fast,
                messages: [
                    {
                        role: 'system',
                        content: `Extract structured business data from Ethiopian business owner text. Return JSON:
{
  "extracted_type": "product|faq|business_info|portfolio|service_desc|price_list|other",
  "name": "string or null",
  "price": number or null,
  "currency": "ETB",
  "category": "electronics|beauty|food|clothing|furniture|services|other",
  "description": "string or null",
  "tags": ["tag1"],
  "attributes": {},
  "selling_points": ["point1"],
  "trigger_keywords": ["keyword1"],
  "confidence": 0-100
}`
                    },
                    { role: 'user', content: text }
                ],
                response_format: { type: 'json_object' },
                max_tokens: 500
            });

            this.trackUsage(response.usage);
            return JSON.parse(response.choices[0].message.content);
        } catch (error) {
            console.error('Text extraction error:', error);
            return { extracted_type: 'other', confidence: 0 };
        }
    }

    buildConsultantPrompt(business, products, state, analysis) {
        const assistantName = business.assistant_name || 'MiniMe';
        const tone = business.tone || 'warm';
        const langPref = business.language_preference || analysis.language || 'mixed';

        // Inventory
        const inventory = products.length ? products.map(p => {
            const specs = Object.entries(p.specs || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
            return `• ${p.name}: ${p.price} ETB${specs ? ` (${specs})` : ''}`;
        }).join('\n') : '(no products added yet)';

        // Voice profile from sample_replies — study the owner's actual style
        const samples = Array.isArray(business.sample_replies) ? business.sample_replies.slice(0, 6) : [];
        const voiceBlock = samples.length ? `
VOICE & STYLE — study these real examples from the owner and match this style:
${samples.map((s, i) => {
    if (typeof s === 'string') return `Example ${i + 1}: "${s}"`;
    if (s.question && s.answer) return `Q: ${s.question}\nA: ${s.answer}`;
    return `Example ${i + 1}: "${s.reply || s.text || JSON.stringify(s)}"`;
}).join('\n\n')}
` : '';

        // Owner rules (instructions that aren't FAQ)
        const allInstructions = Array.isArray(business.owner_instructions) ? business.owner_instructions : [];
        const rules = allInstructions.filter(r => r.source !== 'faq');
        const faqs = allInstructions.filter(r => r.source === 'faq');

        const rulesBlock = rules.length ? `
OWNER'S RULES — ALWAYS FOLLOW (these override anything else):
${rules.map((r, i) => `${i + 1}. ${r.content || r.rule || r.text || r}`).join('\n')}
` : '';

        const faqBlock = faqs.length ? `
FAQ — USE THESE EXACT ANSWERS when customer asks:
${faqs.map(f => `Q: ${f.question || f.trigger}\nA: ${f.answer || f.reply || f.content}`).join('\n\n')}
` : '';

        // Customer context
        const customerContext = state ? `
CUSTOMER CONTEXT:
- Sessions: ${state.session_count || 1}
- Budget: ${state.budget_min ? `${state.budget_min}-${state.budget_max} ETB` : 'unknown'}
- Purpose: ${state.purpose || 'unknown'}
- Stage: ${state.stage || 'greeting'}
- Preferences: ${JSON.stringify(state.preferences || {})}` : '';

        const languageInstruction =
            langPref === 'am' ? 'Reply in Amharic.' :
            langPref === 'en' ? 'Reply in English.' :
            'Use natural Amharic-English mix (Ethiopian code-switching) — match the customer\'s language.';

        const toneInstruction =
            tone === 'direct' ? 'Be direct, brief, no fluff. Just facts and answers.' :
            tone === 'professional' ? 'Be polite, formal, professional.' :
            'Be warm, friendly, like an Ethiopian shopkeeper who knows the customer.';

        return `You are ${assistantName} — ${business.business_name || 'this business'}'s AI sales assistant.
${business.description ? business.description : ''}
Category: ${business.category || 'general'}. Location: ${business.location || business.sub_city || 'Addis Ababa'}.

${voiceBlock}${rulesBlock}${faqBlock}

YOUR PRODUCTS:
${inventory}

HOURS: ${JSON.stringify(business.rules?.business_hours || 'Mon-Sat 9-6')}
PAYMENT: ${(business.rules?.payment_methods || ['cash', 'telebirr']).join(', ')}
${customerContext}

LANGUAGE: ${languageInstruction}
TONE: ${toneInstruction}

ABSOLUTE RULES:
1. Never invent prices, products, specs, or stock that aren't in YOUR PRODUCTS above
2. Keep replies to 1-3 sentences — Telegram chat style
3. End with a question OR concrete next step (price, location, button, reservation)
4. If you don't know something specific (delivery time, exact spec, etc.), say "let me check with the owner"
5. Refer to yourself as "${assistantName}" if introducing yourself
6. NEVER say "I'm an AI" — you're a sales assistant working for the business
7. If FAQ matches the question, use that answer verbatim

${state?.stage === 'recommending' ? 'You have enough context. Recommend 1-3 specific products with clear reasoning.' : ''}
${analysis.needs_escalation ? 'This is sensitive — apologize and say the owner will reply personally.' : ''}`;
    }

    getDefaultAnalysis() {
        return {
            intent: 'other',
            sentiment: 'neutral',
            urgency: 5,
            confidence: 50,
            needs_escalation: false,
            suggested_tone: 'friendly',
            language: 'en',
            extracted_entities: {},
            missing_info: ['What are you looking for?'],
            suggested_questions: ['What brings you in today?'],
            is_follow_up: false,
            follow_up_context: null
        };
    }

    getFallbackReply(language) {
        const fallbacks = {
            am: 'ይቅርታ፣ ጥያቄዎን በትክክል አልገባኝም። እባኮትን እንደገና ይንገሩኝ ወይም "ሰው መናገር" ይበሉ።',
            mixed: 'Sorry, I didn\'t get that. Could you rephrase? ወይስ ሰው መናገር ትፈልጋለህ?',
            en: 'Sorry, I didn\'t quite catch that. Could you rephrase? Or type "human" to talk to the owner.'
        };
        return fallbacks[language] || fallbacks.en;
    }

    trackUsage(usage) {
        if (usage) {
            this.tokenUsage.prompt += usage.prompt_tokens || 0;
            this.tokenUsage.completion += usage.completion_tokens || 0;
            this.tokenUsage.total += usage.total_tokens || 0;
        }
    }

    getUsageStats() {
        return { ...this.tokenUsage };
    }

    async generateEmbedding(text) {
        try {
            const response = await this.client.embeddings.create({
                model: this.models.embedding,
                input: text,
                encoding_format: 'float'
            });
            return response.data[0].embedding;
        } catch (error) {
            console.error('Embedding error:', error);
            return null;
        }
    }
}

module.exports = OpenAIService;
