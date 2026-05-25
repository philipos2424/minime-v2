const axios = require('axios');
const crypto = require('crypto');

class TelebirrService {
    constructor(config) {
        this.appId = config.TELEBIRR_APP_ID;
        this.appKey = config.TELEBIRR_APP_KEY;
        this.publicKey = config.TELEBIRR_PUBLIC_KEY;
        this.baseUrl = config.TELEBIRR_BASE_URL || 'https://api.telebirr.com';
        this.merchantCode = config.TELEBIRR_MERCHANT_CODE;
    }

    async initializePayment({
        amount,
        nonce,
        notifyUrl,
        outTradeNo,
        subject,
        timeoutExpress = '30m',
        totalAmount,
        shortCode,
        receiveName,
        returnUrl,
        appId
    }) {
        try {
            const requestData = {
                appId: appId || this.appId,
                nonce,
                notifyUrl,
                outTradeNo,
                subject,
                timeoutExpress,
                totalAmount: totalAmount || amount.toString(),
                shortCode: shortCode || this.merchantCode,
                receiveName: receiveName || 'MiniMe',
                returnUrl
            };

            // Sign the request
            const sign = this.signRequest(requestData);
            requestData.sign = sign;
            requestData.signType = 'SHA256WithRSA';

            const response = await axios.post(
                `${this.baseUrl}/payment/v1/merchant/preOrder`,
                requestData,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.code === '0') {
                return {
                    success: true,
                    tradeNo: response.data.data.tradeNo,
                    paymentUrl: response.data.data.paymentUrl
                };
            }

            return {
                success: false,
                error: response.data.msg
            };
        } catch (error) {
            console.error('Telebirr initialization error:', error.response?.data || error.message);
            return {
                success: false,
                error: 'Payment initialization failed'
            };
        }
    }

    async queryPayment(outTradeNo) {
        try {
            const requestData = {
                appId: this.appId,
                outTradeNo,
                nonce: this.generateNonce(),
                timestamp: Date.now().toString()
            };

            requestData.sign = this.signRequest(requestData);
            requestData.signType = 'SHA256WithRSA';

            const response = await axios.post(
                `${this.baseUrl}/payment/v1/merchant/queryOrder`,
                requestData,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.code === '0') {
                return {
                    success: true,
                    status: response.data.data.tradeStatus,
                    amount: response.data.data.totalAmount,
                    transactionNo: response.data.data.transactionNo
                };
            }

            return {
                success: false,
                error: response.data.msg
            };
        } catch (error) {
            console.error('Telebirr query error:', error.response?.data || error.message);
            return {
                success: false,
                error: 'Query failed'
            };
        }
    }

    signRequest(data) {
        const sortedKeys = Object.keys(data).sort();
        const signString = sortedKeys.map(key => `${key}=${data[key]}`).join('&');

        const sign = crypto.createSign('SHA256');
        sign.update(signString);
        sign.end();

        return sign.sign(this.appKey, 'base64');
    }

    generateNonce() {
        return crypto.randomBytes(16).toString('hex');
    }

    verifyWebhook(payload, signature) {
        try {
            const verify = crypto.createVerify('SHA256');
            verify.update(JSON.stringify(payload));
            verify.end();

            return verify.verify(this.publicKey, signature, 'base64');
        } catch (error) {
            console.error('Webhook verification error:', error);
            return false;
        }
    }
}

module.exports = TelebirrService;
