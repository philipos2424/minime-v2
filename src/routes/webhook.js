const express = require('express');
const router = express.Router();

// ── Telegram webhooks ──────────────────────────────────────────────────────
// Main bot webhook
router.post('/telegram/main', (req, res, next) => {
    const { botManager } = req.app.locals;
    if (!botManager?.mainBot) return res.status(404).json({ error: 'Bot not initialized' });
    return botManager.getMainWebhookMiddleware('/webhook/telegram/main')(req, res, next);
});

// Search bot webhook
router.post('/telegram/search', (req, res, next) => {
    const { botManager } = req.app.locals;
    const mw = botManager?.getSearchWebhookMiddleware('/webhook/telegram/search');
    if (!mw) return res.status(404).json({ error: 'Search bot not configured' });
    return mw(req, res, next);
});

// Business bot webhooks (by businessId)
router.post('/telegram/business/:businessId', (req, res, next) => {
    const { botManager } = req.app.locals;
    const { businessId } = req.params;
    const mw = botManager?.getBusinessWebhookMiddleware(businessId, `/webhook/telegram/business/${businessId}`);
    if (!mw) return res.status(404).json({ error: 'Business bot not found' });
    return mw(req, res, next);
});

// ── Chapa payment webhook ──────────────────────────────────────────────────
router.post('/chapa', async (req, res) => {
    const { supabase, auditService } = req.context;
    try {
        const payload = req.body;
        const signature = req.headers['x-chapa-signature'];

        const ChapaService = require('../services/payment/ChapaService');
        const chapa = new ChapaService(req.context.config);
        const verified = await chapa.handleWebhook(payload, signature);

        if (!verified.success) {
            return res.status(400).json({ error: 'Invalid signature' });
        }

        const { data: transaction } = await supabase
            .from('transactions')
            .update({
                payment_status: payload.status === 'success' ? 'completed' : 'failed',
                payment_reference: payload.reference,
                paid_at: payload.status === 'success' ? new Date().toISOString() : null,
                status: payload.status === 'success' ? 'confirmed' : 'cancelled'
            })
            .eq('reservation_code', payload.tx_ref)
            .select()
            .single();

        if (transaction && auditService) {
            await auditService.logPayment({
                transactionId: transaction.id,
                action: payload.status === 'success' ? 'COMPLETED' : 'FAILED',
                amount: transaction.total_amount,
                status: payload.status
            }).catch(() => {});
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Chapa webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// ── Telebirr payment webhook ───────────────────────────────────────────────
router.post('/telebirr', async (req, res) => {
    const { supabase, auditService } = req.context;
    try {
        const payload = req.body;

        const { data: transaction } = await supabase
            .from('transactions')
            .update({
                payment_status: payload.tradeStatus === 'SUCCESS' ? 'completed' : 'failed',
                payment_reference: payload.transactionNo,
                paid_at: payload.tradeStatus === 'SUCCESS' ? new Date().toISOString() : null,
                status: payload.tradeStatus === 'SUCCESS' ? 'confirmed' : 'cancelled'
            })
            .eq('reservation_code', payload.outTradeNo)
            .select()
            .single();

        if (transaction && auditService) {
            await auditService.logPayment({
                transactionId: transaction.id,
                action: payload.tradeStatus === 'SUCCESS' ? 'COMPLETED' : 'FAILED',
                amount: transaction.total_amount,
                status: payload.tradeStatus
            }).catch(() => {});
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Telebirr webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

module.exports = router;
