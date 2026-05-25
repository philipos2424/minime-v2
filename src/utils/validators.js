/**
 * Input Validators
 */

class Validators {
    /**
     * Validate Ethiopian phone number
     */
    static isValidPhone(phone) {
        if (!phone) return false;
        const cleaned = phone.replace(/[^\d]/g, '');
        // Ethiopian mobile: starts with 09 or 2519, followed by 8 digits
        return /^((\+?251)?9\d{8})$/.test(cleaned);
    }

    /**
     * Validate Telegram username
     */
    static isValidTelegramUsername(username) {
        if (!username) return false;
        const clean = username.replace('@', '');
        return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(clean);
    }

    /**
     * Validate price
     */
    static isValidPrice(price) {
        const num = parseFloat(price);
        return !isNaN(num) && num >= 0 && num <= 999999999;
    }

    /**
     * Validate business name
     */
    static isValidBusinessName(name) {
        if (!name) return false;
        return name.length >= 2 && name.length <= 100;
    }

    /**
     * Validate category
     */
    static isValidCategory(category) {
        const valid = ['electronics', 'beauty', 'food', 'clothing', 'furniture', 'services', 'other'];
        return valid.includes(category);
    }

    /**
     * Validate email
     */
    static isValidEmail(email) {
        if (!email) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    /**
     * Validate URL
     */
    static isValidUrl(url) {
        if (!url) return false;
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Validate UUID
     */
    static isValidUUID(uuid) {
        if (!uuid) return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
    }

    /**
     * Validate coordinates
     */
    static isValidCoordinates(lat, lng) {
        const numLat = parseFloat(lat);
        const numLng = parseFloat(lng);
        return !isNaN(numLat) && !isNaN(numLng) &&
               numLat >= -90 && numLat <= 90 &&
               numLng >= -180 && numLng <= 180;
    }

    /**
     * Validate file type
     */
    static isValidFileType(mimeType, allowedTypes = ['image/jpeg', 'image/png', 'image/webp']) {
        return allowedTypes.includes(mimeType);
    }

    /**
     * Validate file size (max 10MB default)
     */
    static isValidFileSize(sizeBytes, maxBytes = 10 * 1024 * 1024) {
        return sizeBytes > 0 && sizeBytes <= maxBytes;
    }

    /**
     * Sanitize string for database
     */
    static sanitizeString(str, maxLength = 255) {
        if (!str) return '';
        return str
            .replace(/[<>]/g, '')
            .trim()
            .substring(0, maxLength);
    }

    /**
     * Validate reservation code format
     */
    static isValidReservationCode(code) {
        if (!code) return false;
        return /^MM-[A-Z0-9]+-[A-Z0-9]+$/i.test(code);
    }
}

module.exports = Validators;
