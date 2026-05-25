const OpenAIService = require('../services/ai/OpenAIService');

class SearchHandler {
    constructor(supabase, config) {
        this.supabase = supabase;
        this.config = config;
        this.ai = new OpenAIService(config.OPENAI_API_KEY);
    }

    async handleTextQuery(ctx, query, userId) {
        const startTime = Date.now();

        try {
            // 1. Parse query with AI
            const parsed = await this.parseSearchQuery(query);

            // 2. Log search
            await this.logSearch(userId, query, parsed);

            // 3. Search businesses
            const results = await this.searchBusinesses(parsed);

            // 4. Format results
            const formatted = await this.formatResults(results, parsed);

            // 5. Send response
            if (results.length === 0) {
                await ctx.reply(
                    `🔍 No results for "${query}"\n\n` +
                    `Try:\n` +
                    `• Broader terms ("laptop" instead of "HP Pavilion 15")\n` +
                    `• Check spelling\n` +
                    `• Ask me: "What laptops do you have under 20k?"\n\n` +
                    `Or browse categories: [💻 Laptops] [📱 Phones] [🎧 Accessories]`
                );
                return;
            }

            // Send top 3 results with inline buttons
            for (const business of results.slice(0, 3)) {
                const keyboard = this.buildBusinessKeyboard(business);

                await ctx.reply(
                    `🏪 *${business.business_name}*\n` +
                    `${'⭐'.repeat(Math.round(business.average_rating || 0))} (${business.total_reviews} reviews)\n` +
                    `📍 ${business.sub_city || 'Addis Ababa'}${business.location ? ' • ' + business.location : ''}\n` +
                    `🕐 ${this.formatHours(business.rules?.business_hours)}\n\n` +
                    `${business.description || 'No description'}\n\n` +
                    `*Products:* ${business.product_count || 0} items | ` +
                    `*Response:* ${business.avg_response_time ? business.avg_response_time + 's' : 'Fast'}`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: keyboard }
                    }
                );
            }

            // Show more option
            if (results.length > 3) {
                await ctx.reply(
                    `Found ${results.length} results. Show more?`,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '⬇️ Show More', callback_data: `search_more_${parsed.query_hash}` }
                            ]]
                        }
                    }
                );
            }

            // Update search log with results
            await this.updateSearchResults(userId, query, results.length, Date.now() - startTime);

        } catch (error) {
            console.error('Search error:', error);
            await ctx.reply('Sorry, search is temporarily unavailable. Try again in a moment.');
        }
    }

    async handleInlineQuery(ctx, query, userId) {
        const startTime = Date.now();

        try {
            const parsed = await this.parseSearchQuery(query);
            const results = await this.searchBusinesses(parsed, 10);

            const articles = results.map((business, index) => ({
                type: 'article',
                id: `biz_${business.id}`,
                title: business.business_name,
                description: `${business.sub_city || 'Addis'} • ${business.description?.substring(0, 50) || 'Business'} • ⭐${business.average_rating || 0}`,
                input_message_content: {
                    message_text: `🏪 *${business.business_name}*\n` +
                        `⭐ ${business.average_rating || 0}/5 (${business.total_reviews} reviews)\n` +
                        `📍 ${business.sub_city || 'Addis Ababa'}\n` +
                        `💬 Message them: @${business.bot_username || business.secretary_username || 'MiniMeBot'}`,
                    parse_mode: 'Markdown'
                },
                reply_markup: {
                    inline_keyboard: [[
                        { text: '📩 Message Business', url: `https://t.me/${business.bot_username || 'MiniMeBot'}` },
                        { text: '📍 Location', callback_data: `loc_${business.id}` }
                    ]]
                }
            }));

            await ctx.answerInlineQuery(articles.slice(0, 10), {
                cache_time: 300,
                is_personal: true
            });

            await this.logSearch(userId, query, parsed, results.length, Date.now() - startTime);

        } catch (error) {
            console.error('Inline search error:', error);
            await ctx.answerInlineQuery([], { cache_time: 0 });
        }
    }

    async parseSearchQuery(query) {
        // First try keyword extraction
        const keywords = this.extractKeywords(query);

        // If complex query, use GPT
        let parsed = {
            raw: query,
            keywords: keywords,
            category: null,
            location: null,
            budget_min: null,
            budget_max: null,
            intent: 'search',
            filters: {}
        };

        // Check for budget patterns
        const budgetMatch = query.match(/(?:under|below|less than|cheaper than|max|maximum)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:etb|birr|ብር)?/i);
        if (budgetMatch) {
            parsed.budget_max = parseFloat(budgetMatch[1].replace(/,/g, ''));
        }

        const minBudgetMatch = query.match(/(?:above|over|more than|min|minimum|starting from|from)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:etb|birr|ብር)?/i);
        if (minBudgetMatch && !parsed.budget_max) {
            parsed.budget_min = parseFloat(minBudgetMatch[1].replace(/,/g, ''));
        }

        // Check for location
        const locations = ['bole', 'mexico', 'piassa', 'merkato', 'sarbet', 'kazanchis', 'gerji', 'ayertena', 'akaki', 'lebu'];
        for (const loc of locations) {
            if (query.toLowerCase().includes(loc)) {
                parsed.location = loc;
                break;
            }
        }

        // Check for category
        const categories = {
            'laptop': ['laptop', 'computer', 'pc', 'notebook', 'macbook', 'hp', 'dell', 'lenovo', 'asus'],
            'phone': ['phone', 'mobile', 'iphone', 'samsung', 'xiaomi', 'tecno', 'infinix', 'oppo'],
            'accessories': ['headphone', 'charger', 'cable', 'mouse', 'keyboard', 'case', 'cover'],
            'electronics': ['tv', 'camera', 'speaker', 'monitor', 'printer', 'router']
        };

        for (const [cat, terms] of Object.entries(categories)) {
            if (terms.some(t => query.toLowerCase().includes(t))) {
                parsed.category = cat;
                break;
            }
        }

        // Use GPT for complex queries
        if (query.length > 15 || parsed.budget_max || parsed.budget_min) {
            try {
                const gptParsed = await this.ai.analyzeMessage(query, { isSearch: true });
                if (gptParsed.extracted_entities) {
                    parsed.intent = gptParsed.intent || 'search';
                    if (gptParsed.extracted_entities.budget_max) parsed.budget_max = gptParsed.extracted_entities.budget_max;
                    if (gptParsed.extracted_entities.budget_min) parsed.budget_min = gptParsed.extracted_entities.budget_min;
                    if (gptParsed.extracted_entities.product) parsed.keywords.push(gptParsed.extracted_entities.product);
                }
            } catch (e) {
                // Fallback to keyword search
            }
        }

        parsed.query_hash = this.hashQuery(parsed);
        return parsed;
    }

    extractKeywords(query) {
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'and', 'but', 'or', 'yet', 'so', 'if', 'because', 'although', 'though', 'while', 'where', 'when', 'that', 'which', 'who', 'whom', 'whose', 'what', 'whatever', 'whoever', 'whomever', 'this', 'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now']);

        return query
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));
    }

    async searchBusinesses(parsed, limit = 5) {
        let query = this.supabase
            .from('businesses')
            .select(`
                *,
                business_content(count),
                reviews!inner(rating)
            `)
            .eq('status', 'active')
            .eq('directory_visible', true)
            .gte('trust_level', 'phone_verified');

        // Apply filters
        if (parsed.category) {
            query = query.eq('category', parsed.category);
        }

        if (parsed.location) {
            query = query.ilike('sub_city', `%${parsed.location}%`);
        }

        if (parsed.budget_max || parsed.budget_min) {
            // Join with products table for price filtering
            query = query.gte('business_content.price', parsed.budget_min || 0)
                        .lte('business_content.price', parsed.budget_max || 999999);
        }

        // Text search
        if (parsed.keywords.length > 0) {
            const searchTerm = parsed.keywords.join(' | ');
            query = query.textSearch('search_vector', searchTerm, {
                type: 'websearch',
                config: 'simple'
            });
        }

        // Order by relevance (reputation + recency)
        query = query.order('reputation_score', { ascending: false })
                    .order('last_active_at', { ascending: false })
                    .limit(limit);

        const { data, error } = await query;

        if (error) {
            console.error('Search error:', error);
            return [];
        }

        return data || [];
    }

    formatResults(results, parsed) {
        // Add distance calculation if location provided
        // Add product highlights
        // Format for display
        return results;
    }

    buildBusinessKeyboard(business) {
        const keyboard = [];

        // Main actions
        keyboard.push([
            { text: '💬 Message', url: `https://t.me/${business.bot_username || business.secretary_username || 'MiniMeBot'}` },
            { text: '📞 Call', callback_data: `call_${business.id}` }
        ]);

        // Products
        if (business.product_count > 0) {
            keyboard.push([
                { text: `📦 View ${business.product_count} Products`, callback_data: `products_${business.id}` }
            ]);
        }

        // Reviews
        if (business.total_reviews > 0) {
            keyboard.push([
                { text: `⭐ Reviews (${business.total_reviews})`, callback_data: `reviews_${business.id}` }
            ]);
        }

        // Location
        if (business.latitude && business.longitude) {
            keyboard.push([
                { text: '📍 Location', callback_data: `location_${business.id}` }
            ]);
        }

        return keyboard;
    }

    formatHours(hours) {
        if (!hours) return 'Hours not set';
        const today = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
        const todayHours = hours[today];
        if (!todayHours || todayHours === 'closed') return 'Closed today';
        return `Open ${todayHours}`;
    }

    hashQuery(parsed) {
        const str = JSON.stringify(parsed);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    async logSearch(userId, query, parsed, resultsCount = 0, queryTime = 0) {
        await this.supabase.from('search_logs').insert({
            searcher_telegram_id: userId,
            raw_query: query,
            normalized_query: parsed.keywords.join(' '),
            parsed_intent: parsed,
            category_filter: parsed.category,
            location_filter: parsed.location,
            budget_min_filter: parsed.budget_min,
            budget_max_filter: parsed.budget_max,
            results_count: resultsCount,
            query_time_ms: queryTime,
            used_gpt: query.length > 15
        });
    }

    async updateSearchResults(userId, query, resultsCount, queryTime) {
        // Update the last search log with results
        const { data } = await this.supabase
            .from('search_logs')
            .select('id')
            .eq('searcher_telegram_id', userId)
            .eq('raw_query', query)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (data) {
            await this.supabase
                .from('search_logs')
                .update({
                    results_count: resultsCount,
                    query_time_ms: queryTime
                })
                .eq('id', data.id);
        }
    }
}

module.exports = SearchHandler;
