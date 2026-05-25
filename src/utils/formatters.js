/**
 * Data Formatters
 */

class Formatters {
    /**
     * Format currency
     */
    static currency(amount, currency = 'ETB') {
        if (amount === null || amount === undefined) return 'N/A';
        return `${parseFloat(amount).toLocaleString('en-ET')} ${currency}`;
    }

    /**
     * Format percentage
     */
    static percentage(value, decimals = 1) {
        if (value === null || value === undefined) return '0%';
        return `${parseFloat(value).toFixed(decimals)}%`;
    }

    /**
     * Format date
     */
    static date(date, format = 'short') {
        if (!date) return 'N/A';
        const d = new Date(date);

        if (format === 'short') {
            return d.toLocaleDateString('en-ET', { month: 'short', day: 'numeric' });
        }
        if (format === 'long') {
            return d.toLocaleDateString('en-ET', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        if (format === 'time') {
            return d.toLocaleTimeString('en-ET', { hour: '2-digit', minute: '2-digit' });
        }
        if (format === 'relative') {
            return this.relativeTime(d);
        }
        return d.toISOString();
    }

    /**
     * Relative time
     */
    static relativeTime(date) {
        const now = new Date();
        const then = new Date(date);
        const diffMs = now - then;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
        return `${Math.floor(diffDays / 365)}y ago`;
    }

    /**
     * Format business hours
     */
    static businessHours(hours) {
        if (!hours) return 'Not set';
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const dayNames = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

        const today = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
        const todayHours = hours[today];

        if (!todayHours || todayHours === 'closed') return 'Closed today';
        return `Open ${todayHours}`;
    }

    /**
     * Format rating stars
     */
    static ratingStars(rating, maxStars = 5) {
        const fullStars = Math.floor(rating);
        const hasHalf = rating % 1 >= 0.5;
        const emptyStars = maxStars - fullStars - (hasHalf ? 1 : 0);

        return '★'.repeat(fullStars) + (hasHalf ? '½' : '') + '☆'.repeat(emptyStars);
    }

    /**
     * Format file size
     */
    static fileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    }

    /**
     * Format phone number for display
     */
    static phoneNumber(phone) {
        if (!phone) return '';
        const cleaned = phone.replace(/[^\d]/g, '');
        if (cleaned.startsWith('251')) {
            return `+251 ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8)}`;
        }
        if (cleaned.startsWith('09')) {
            return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8)}`;
        }
        return cleaned;
    }

    /**
     * Truncate text
     */
    static truncate(text, maxLength = 100, suffix = '...') {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength).trim() + suffix;
    }

    /**
     * Format list
     */
    static list(items, separator = ', ') {
        if (!items || !items.length) return '';
        return items.join(separator);
    }

    /**
     * Format bot response for display
     */
    static botResponse(text) {
        if (!text) return '';
        return text
            .replace(/\*\*/g, '')  // Remove markdown bold
            .replace(/\*/g, '')     // Remove markdown italic
            .replace(/`/g, '')      // Remove code blocks
            .trim();
    }
}

module.exports = Formatters;
