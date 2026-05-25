const { body, validationResult } = require('express-validator');

class ValidationMiddleware {
    static validateSignup() {
        return [
            body('telegramId').isNumeric().notEmpty(),
            body('businessName').isString().trim().isLength({ min: 2, max: 100 }),
            body('category').isIn(['electronics', 'beauty', 'food', 'clothing', 'furniture', 'services', 'other']),
            body('location').optional().isString().trim(),
            body('phone').optional().isMobilePhone('any'),
            ValidationMiddleware.handleErrors
        ];
    }

    static validateProductUpdate() {
        return [
            body('productId').isUUID(),
            body('updates').isObject(),
            body('updates.name').optional().isString().trim().isLength({ min: 1, max: 200 }),
            body('updates.price').optional().isNumeric().isFloat({ min: 0 }),
            body('updates.description').optional().isString().trim().isLength({ max: 2000 }),
            ValidationMiddleware.handleErrors
        ];
    }

    static validatePayment() {
        return [
            body('amount').isNumeric().isFloat({ min: 1 }),
            body('currency').optional().isIn(['ETB', 'USD']),
            body('method').isIn(['chapa', 'telebirr', 'cash']),
            body('productId').optional().isUUID(),
            ValidationMiddleware.handleErrors
        ];
    }

    static handleErrors(req, res, next) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }
        next();
    }
}

module.exports = ValidationMiddleware;
