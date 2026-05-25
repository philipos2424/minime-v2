const OpenAIService = require('./ai/OpenAIService');

class ContentService {
    constructor(supabase, config) {
        this.supabase = supabase;
        this.config = config;
        this.ai = new OpenAIService(config.OPENAI_API_KEY);
    }

    async processUpload({
        businessId,
        fileType,
        fileUrl,
        fileId,
        caption,
        ownerTelegramId
    }) {
        try {
            // 1. AI Extraction
            let extraction;
            if (fileType === 'photo') {
                extraction = await this.ai.extractFromImage(fileUrl, caption);
            } else {
                extraction = await this.ai.extractFromText(caption || '[voice note - no transcript]');
            }

            // 2. Validate extraction
            const validated = this.validateExtraction(extraction);

            // 3. Store content
            const { data: content, error } = await this.supabase
                .from('business_content')
                .insert({
                    business_id: businessId,
                    content_type: fileType,
                    file_url: fileUrl,
                    file_id: fileId,
                    raw_text: caption,
                    caption,
                    extracted_type: validated.extracted_type,
                    extracted_confidence: validated.confidence,
                    extracted_data: validated,
                    name: validated.name,
                    description: validated.description,
                    price: validated.price,
                    currency: 'ETB',
                    category: validated.category,
                    sub_category: validated.sub_category,
                    brand: validated.brand,
                    model: validated.model,
                    condition: validated.condition,
                    specs: validated.specs,
                    tags: validated.tags,
                    selling_points: validated.selling_points,
                    trigger_keywords: validated.trigger_keywords,
                    trigger_intents: this.generateTriggerIntents(validated),
                    owner_confirmed: false, // Wait for owner confirmation
                    status: 'pending_review'
                })
                .select()
                .single();

            if (error) throw error;

            // 4. Return for owner confirmation
            return {
                content,
                needsConfirmation: validated.confidence < 0.85 || !validated.price,
                message: this.formatConfirmationMessage(validated)
            };

        } catch (error) {
            console.error('Content processing error:', error);
            throw error;
        }
    }

    validateExtraction(extraction) {
        const defaults = {
            extracted_type: 'product',
            name: 'Unnamed Item',
            description: '',
            price: null,
            currency: 'ETB',
            category: 'other',
            sub_category: null,
            brand: null,
            model: null,
            condition: 'new',
            specs: {},
            tags: [],
            selling_points: [],
            trigger_keywords: [],
            confidence: 0,
            needs_clarification: []
        };

        // Merge with defaults
        const validated = { ...defaults, ...extraction };

        // Validate price
        if (validated.price && (isNaN(validated.price) || validated.price <= 0)) {
            validated.price = null;
            validated.needs_clarification.push('Price seems invalid, please confirm');
        }

        // Validate category
        const validCategories = ['electronics', 'beauty', 'food', 'clothing', 'furniture', 'services', 'other'];
        if (!validCategories.includes(validated.category)) {
            validated.category = 'other';
        }

        // Generate slug
        if (validated.name) {
            validated.slug = validated.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
        }

        return validated;
    }

    generateTriggerIntents(extraction) {
        const intents = [];

        if (extraction.category === 'electronics') {
            intents.push('buy_electronics', 'compare_electronics', 'repair_electronics');
        }
        if (extraction.price) {
            intents.push('price_inquiry', 'budget_check');
        }
        if (extraction.condition === 'used' || extraction.condition === 'refurbished') {
            intents.push('buy_used', 'trade_in');
        }

        return intents;
    }

    formatConfirmationMessage(extraction) {
        const lines = [
            `✅ I understood your upload!`,
            ``,
            `📦 *${extraction.name}*`,
            extraction.price ? `💰 ${extraction.price} ETB` : '💰 Price: Not detected',
            `🏷️ Category: ${extraction.category}`,
            extraction.brand ? `🏭 Brand: ${extraction.brand}` : '',
            extraction.model ? `📱 Model: ${extraction.model}` : '',
            extraction.condition ? `🔧 Condition: ${extraction.condition}` : '',
            ``,
            extraction.selling_points?.length > 0 
                ? `✨ Selling points:\n${extraction.selling_points.map(p => `• ${p}`).join('\n')}` 
                : '',
            ``,
            extraction.needs_clarification?.length > 0
                ? `⚠️ *Needs clarification:*\n${extraction.needs_clarification.map(c => `• ${c}`).join('\n')}`
                : '',
            ``,
            `Is this correct?`
        ];

        return lines.filter(l => l).join('\n');
    }

    async confirmContent(contentId, updates = {}) {
        const { data, error } = await this.supabase
            .from('business_content')
            .update({
                owner_confirmed: true,
                status: 'active',
                owner_edited: updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', contentId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async editContent(contentId, updates) {
        const { data, error } = await this.supabase
            .from('business_content')
            .update({
                ...updates,
                owner_edited: updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', contentId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async getBusinessContent(businessId, options = {}) {
        let query = this.supabase
            .from('business_content')
            .select('*')
            .eq('business_id', businessId);

        if (options.status) {
            query = query.eq('status', options.status);
        }

        if (options.type) {
            query = query.eq('extracted_type', options.type);
        }

        if (options.search) {
            query = query.ilike('name', `%${options.search}%`);
        }

        query = query.order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }

    async deleteContent(contentId) {
        const { error } = await this.supabase
            .from('business_content')
            .update({ status: 'archived' })
            .eq('id', contentId);

        if (error) throw error;
        return true;
    }

    async updatePrice(contentId, newPrice, reason = 'owner_update') {
        const { data, error } = await this.supabase
            .from('business_content')
            .update({
                price: newPrice,
                price_updated_at: new Date().toISOString(),
                price_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                owner_notes: reason
            })
            .eq('id', contentId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async bulkUpload(businessId, items) {
        const results = [];
        for (const item of items) {
            try {
                const result = await this.processUpload({
                    businessId,
                    ...item
                });
                results.push({ success: true, data: result });
            } catch (error) {
                results.push({ success: false, error: error.message });
            }
        }
        return results;
    }
}

module.exports = ContentService;
