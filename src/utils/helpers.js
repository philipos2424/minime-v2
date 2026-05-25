/**
 * MiniMe Utility Helpers
 */

const crypto = require('crypto');

class Helpers {
    /**
     * Generate a unique reservation code
     */
    static generateReservationCode(prefix = 'MM') {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    }

    /**
     * Format price in ETB
     */
    static formatPrice(amount, currency = 'ETB') {
        if (!amount) return 'Price not set';
        return `${amount.toLocaleString('en-ET')} ${currency}`;
    }

    /**
     * Format relative time
     */
    static formatRelativeTime(date) {
        const now = new Date();
        const then = new Date(date);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return then.toLocaleDateString('en-ET');
    }

    /**
     * Truncate text with ellipsis
     */
    static truncate(text, maxLength = 100) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + '...';
    }

    /**
     * Clean phone number for Ethiopia
     */
    static cleanPhone(phone) {
        if (!phone) return null;
        let cleaned = phone.replace(/[^\d]/g, '');
        if (cleaned.startsWith('0')) cleaned = '251' + cleaned.substring(1);
        if (!cleaned.startsWith('251')) cleaned = '251' + cleaned;
        return cleaned;
    }

    /**
     * Parse business hours string
     */
    static parseBusinessHours(hoursStr) {
        if (!hoursStr || hoursStr === 'closed') return null;
        const [open, close] = hoursStr.split('-').map(Number);
        return { open, close };
    }

    /**
     * Check if business is currently open
     */
    static isBusinessOpen(hours) {
        if (!hours) return false;
        const now = new Date();
        const day = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
        const todayHours = hours[day];

        if (!todayHours || todayHours === 'closed') return false;

        const { open, close } = this.parseBusinessHours(todayHours);
        const currentHour = now.getHours();

        return currentHour >= open && currentHour < close;
    }

    /**
     * Calculate distance between two coordinates (Haversine)
     */
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    /**
     * Sleep promise
     */
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Retry with exponential backoff
     */
    static async retry(fn, maxRetries = 3, delay = 1000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                await this.sleep(delay * Math.pow(2, i));
            }
        }
    }

    /**
     * Sanitize user input
     */
    static sanitizeInput(input) {
        if (!input) return '';
        return input
            .replace(/[<>]/g, '')
            .trim()
            .substring(0, 4000);
    }

    /**
     * Generate search keywords from text
     */
    static generateKeywords(text) {
        if (!text) return [];
        const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 
            'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of',
            'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
            'before', 'after', 'above', 'below', 'between', 'under', 'and', 'but', 'or', 'yet',
            'so', 'if', 'because', 'although', 'though', 'while', 'where', 'when', 'that', 'which',
            'who', 'whom', 'whose', 'what', 'this', 'these', 'those', 'i', 'me', 'my', 'myself',
            'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves',
            'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself',
            'they', 'them', 'their', 'theirs', 'themselves', 'am', 'are', 'was', 'were', 'be',
            'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a',
            'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at',
            'by', 'for', 'with', 'through', 'during', 'before', 'after', 'above', 'below', 'up',
            'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
            'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
            'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
            'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now']);

        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));
    }

    /**
     * Format number with commas
     */
    static formatNumber(num) {
        if (num === null || num === undefined) return '0';
        return num.toLocaleString('en-ET');
    }

    /**
     * Deep clone object
     */
    static deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Merge objects deeply
     */
    static deepMerge(target, source) {
        const output = Object.assign({}, target);
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) Object.assign(output, { [key]: source[key] });
                    else output[key] = this.deepMerge(target[key], source[key]);
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    static isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }
}

module.exports = Helpers;
