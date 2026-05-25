const express = require('express');
const router = express.Router();

// Public API - Search
router.get('/search', async (req, res) => {
    const { q, category, location, min_price, max_price, verified_only } = req.query;
    const { supabase } = req.context;

    try {
        let query = supabase
            .from('businesses')
            .select(`
                *,
                business_content(count)
            `)
            .eq('status', 'active')
            .eq('directory_visible', true);

        if (category) {
            query = query.eq('category', category);
        }

        if (location) {
            query = query.ilike('sub_city', `%${location}%`);
        }

        if (verified_only === 'true') {
            query = query.eq('verified', true);
        }

        if (q) {
            query = query.textSearch('search_vector', q, {
                type: 'websearch',
                config: 'simple'
            });
        }

        const { data, error, count } = await query
            .order('reputation_score', { ascending: false })
            .limit(20);

        if (error) throw error;

        res.json({
            results: data || [],
            total: count || 0,
            query: q,
            filters: { category, location, min_price, max_price, verified_only }
        });
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// Public API - Business profile
router.get('/business/:id', async (req, res) => {
    const { id } = req.params;
    const { supabase } = req.context;

    try {
        const { data: business } = await supabase
            .from('businesses')
            .select('*')
            .eq('id', id)
            .eq('status', 'active')
            .single();

        if (!business) {
            return res.status(404).json({ error: 'Business not found' });
        }

        // Get products
        const { data: products } = await supabase
            .from('business_content')
            .select('*')
            .eq('business_id', id)
            .eq('status', 'active')
            .eq('extracted_type', 'product')
            .order('created_at', { ascending: false })
            .limit(20);

        // Get reviews
        const { data: reviews } = await supabase
            .from('reviews')
            .select('*')
            .eq('business_id', id)
            .eq('status', 'published')
            .order('created_at', { ascending: false })
            .limit(10);

        res.json({
            business,
            products: products || [],
            reviews: reviews || []
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load business' });
    }
});

// Public API - Categories
router.get('/categories', async (req, res) => {
    const { supabase } = req.context;

    try {
        const { data } = await supabase
            .from('businesses')
            .select('category, count')
            .eq('status', 'active')
            .group('category');

        res.json({ categories: data || [] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load categories' });
    }
});

module.exports = router;
