module.exports = {
    // Business categories
    CATEGORIES: [
        'electronics',
        'beauty',
        'food',
        'clothing',
        'furniture',
        'services',
        'other'
    ],

    // Sub-categories for electronics
    ELECTRONICS_SUBCATEGORIES: [
        'laptops',
        'phones',
        'accessories',
        'cameras',
        'audio',
        'gaming',
        'components'
    ],

    // Verification levels
    VERIFICATION_LEVELS: {
        SHADOW: 'shadow',
        PHONE_VERIFIED: 'phone_verified',
        PHOTO_VERIFIED: 'photo_verified',
        HUMAN_VERIFIED: 'human_verified',
        PREMIUM: 'premium'
    },

    // Modes
    MODES: {
        SECRETARY: 'secretary',
        BOT: 'bot',
        FALLBACK: 'fallback_bot'
    },

    // Payment methods
    PAYMENT_METHODS: {
        CASH: 'cash',
        TELEBIRR: 'telebirr',
        CHAPA: 'chapa',
        BANK_TRANSFER: 'bank_transfer',
        ESCROW: 'escrow'
    },

    // Transaction statuses
    TRANSACTION_STATUSES: {
        PENDING: 'pending',
        RESERVED: 'reserved',
        CONFIRMED: 'confirmed',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled',
        DISPUTED: 'disputed',
        REFUNDED: 'refunded'
    },

    // Content types
    CONTENT_TYPES: {
        PHOTO: 'photo',
        VIDEO: 'video',
        VOICE: 'voice',
        DOCUMENT: 'document',
        TEXT: 'text',
        FORWARD: 'forward'
    },

    // Extracted types
    EXTRACTED_TYPES: {
        PRODUCT: 'product',
        FAQ: 'faq',
        BUSINESS_INFO: 'business_info',
        PORTFOLIO: 'portfolio',
        SERVICE_DESC: 'service_desc',
        PRICE_LIST: 'price_list'
    },

    // Conversation stages
    CONVERSATION_STAGES: {
        GREETING: 'greeting',
        QUALIFYING: 'qualifying',
        RECOMMENDING: 'recommending',
        COMPARING: 'comparing',
        RESERVING: 'reserving',
        NEGOTIATING: 'negotiating',
        CLOSING: 'closing',
        FOLLOW_UP: 'follow_up'
    },

    // Fee structure
    FEES: {
        PER_TRANSACTION_PERCENTAGE: 2.0,
        MIN_FEE: 10, // ETB
        MAX_FEE: 500, // ETB
        REFERRAL_PERCENTAGE: 1.0
    },

    // Timeouts
    TIMEOUTS: {
        PENDING_REPLY_AUTO_APPROVE: 30 * 60 * 1000, // 30 minutes
        SECRETARY_FALLBACK: 30 * 60 * 1000, // 30 minutes
        PRICE_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 days
        RESERVATION_EXPIRY: 2 * 60 * 60 * 1000, // 2 hours
        CONVERSATION_SESSION: 24 * 60 * 60 * 1000 // 24 hours
    },

    // Rate limits
    RATE_LIMITS: {
        MESSAGE: { max: 30, window: 60 },
        SEARCH: { max: 20, window: 60 },
        UPLOAD: { max: 10, window: 60 },
        SIGNUP: { max: 5, window: 3600 },
        PAYMENT: { max: 10, window: 3600 }
    },

    // Messages
    MESSAGES: {
        WELCOME: "👋 Welcome to MiniMe! I'm your AI sales assistant.",
        FALLBACK_ACTIVATED: "⚡ I've switched to Bot Mode while you're away. Customers will still get replies!",
        SECRETARY_RECONNECTED: "✅ Secretary Mode reconnected! I'll stop auto-replying now.",
        PRICE_EXPIRED: "⏰ Your product price has expired. Please update to keep it visible.",
        RESERVATION_CONFIRMED: "✅ Reservation confirmed! Show this code at pickup:",
        PAYMENT_RECEIVED: "💰 Payment received! Your reservation is confirmed."
    }
};
