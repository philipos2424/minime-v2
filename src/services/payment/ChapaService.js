const axios = require('axios');

class ChapaService {
    constructor(config) {
        this.secretKey = config.CHAPA_SECRET_KEY;
        this.publicKey = config.CHAPA_PUBLIC_KEY;
        this.baseUrl = 'https://api.chapa.co/v1';
        this.webhookSecret = config.CHAPA_WEBHOOK_SECRET;
    }

    async initializePayment({
        amount,
        currency = 'ETB',
        email,
        firstName,
        lastName,
        phone,
        txRef,
        callbackUrl,
        returnUrl,
        description,
        metadata = {}
    }) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/transaction/initialize`,
                {
                    amount: amount.toString(),
                    currency,
                    email,
                    first_name: firstName,
                    last_name: lastName,
                    phone_number: phone,
                    tx_ref: txRef,
                    callback_url: callbackUrl,
                    return_url: returnUrl,
                    description,
                    customization: {
                        title: 'MiniMe Payment',
                        description: description || 'Payment for reservation'
                    },
                    meta: metadata
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                checkoutUrl: response.data.data.checkout_url,
                txRef: response.data.data.tx_ref,
                reference: response.data.data.reference
            };
        } catch (error) {
            console.error('Chapa initialization error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || 'Payment initialization failed'
            };
        }
    }

    async verifyPayment(txRef) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/transaction/verify/${txRef}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`
                    }
                }
            );

            return {
                success: true,
                status: response.data.data.status, // 'success', 'pending', 'failed'
                amount: response.data.data.amount,
                currency: response.data.data.currency,
                reference: response.data.data.reference,
                customer: response.data.data.customer
            };
        } catch (error) {
            console.error('Chapa verification error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || 'Verification failed'
            };
        }
    }

    async handleWebhook(payload, signature) {
        // Verify webhook signature
        const crypto = require('crypto');
        const expectedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(JSON.stringify(payload))
            .digest('hex');

        if (signature !== expectedSignature) {
            return { success: false, error: 'Invalid signature' };
        }

        return {
            success: true,
            event: payload.event,
            data: payload.data
        };
    }

    async transferToBusiness({
        accountName,
        accountNumber,
        bankCode,
        amount,
        currency = 'ETB',
        reference,
        reason
    }) {
        try {
            const response = await axios.post(
                `${this.baseUrl}/transfers`,
                {
                    account_name: accountName,
                    account_number: accountNumber,
                    bank_code: bankCode,
                    amount: amount.toString(),
                    currency,
                    reference,
                    reason
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                transferId: response.data.data.id,
                status: response.data.data.status
            };
        } catch (error) {
            console.error('Chapa transfer error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || 'Transfer failed'
            };
        }
    }
}

module.exports = ChapaService;
