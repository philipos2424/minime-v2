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

    async generateConsultantReply(business, products, customerMessage, state, analysis) {
        const systemPrompt = this.buildConsultantPrompt(business, products, state, analysis);

        const model = analysis.language === 'am' ? this.models.smart : this.models.fast;

        try {
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: customerMessage }
            ];

            // Add conversation history if available
            if (state?.session_count > 1) {
                messages.unshift({
                    role: 'system',
                    content: `Previous context: This customer has chatted ${state.session_count} times. Previous preferences: ${JSON.stringify(state.preferences || {})}`
                });
            }

            const response = await this.client.chat.completions.create({
                model,
                messages,
                temperature: 0.8,
                max_tokens: 500,
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
        const inventory = products.map(p => {
            const specs = Object.entries(p.specs || {})
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
            return `- ${p.name}: ${p.price} ETB${p.condition ? ` (${p.condition})` : ''}${specs ? ` | ${specs}` : ''}`;
        }).join('\n');

        const customerContext = state ? `
CUSTOMER CONTEXT:
- Previous visits: ${state.session_count || 1}
- Budget: ${state.budget_min ? `${state.budget_min}-${state.budget_max} ETB` : 'Unknown'}
- Purpose: ${state.purpose || 'Unknown'}
- Preferences: ${JSON.stringify(state.preferences || {})}
- Stage: ${state.stage || 'greeting'}
` : '';

        return `You are ${business.business_name}'s best sales assistant. You sell ${business.category} in ${business.sub_city || 'Addis Ababa'}.

YOUR INVENTORY:
${inventory}

BUSINESS RULES:
${JSON.stringify(business.rules || {}, null, 2)}

LOCATION: ${business.location || 'Addis Ababa'}
HOURS: ${JSON.stringify(business.rules?.business_hours || {})}
PAYMENT: ${(business.rules?.payment_methods || ['cash']).join(', ')}

${customerContext}

LANGUAGE: ${analysis.language === 'mixed' ? 'Use natural Amharic-English mix (common in Ethiopia)' : analysis.language === 'am' ? 'Reply in Amharic' : 'Reply in English'}

STYLE RULES:
1. Warm, professional, Ethiopian shopkeeper energy
2. Ask 1-2 questions before recommending (unless you have enough info)
3. Recommend 2-3 specific items with clear WHY
4. Keep under 3 sentences per message
5. Always mention warranty and pickup location
6. Never promise what you don't have
7. End with next step (question, button, or action)
8. For mixed language: Natural code-switching, not formal translation

CURRENT STAGE: ${state?.stage || 'greeting'}
${state?.stage === 'recommending' ? '\nYou have enough info. Make specific recommendation now.' : ''}
${analysis.needs_escalation ? '\nThis needs owner attention. Apologize and say you will connect them.' : ''}`;
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
