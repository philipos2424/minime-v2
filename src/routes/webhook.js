const express = require('express');
const router = express.Router();

// ── Telegram webhooks ──────────────────────────────────────────────────────
// Use bot.handleUpdate() directly to bypass Telegraf's internal path check
// (which fails when routes are mounted on a sub-path because req.url is stripped)

router.post('/telegram/main', async (req, res) => {
    const botManager = req.app.locals.botManager;
    if (!botManager?.mainBot) {
        console.warn('[webhook/telegram/main] botManager.mainBot not ready');
        return res.status(503).json({ error: 'Bot not ready' });
    }
    try {
        await botManager.mainBot.handleUpdate(req.body);
        res.status(200).json({ ok: true });
    } catch (e) {
        console.error('[webhook/telegram/main] error:', e.message, e.stack?.slice(0, 200));
        res.status(200).json({ ok: true }); // Always 200 so Telegram doesn't retry
    }
});

router.post('/telegram/search', async (req, res) => {
    const botManager = req.app.locals.botManager;
    if (!botManager?.searchBot) {
        return res.status(503).json({ error: 'Search bot not configured' });
    }
    try {
        await botManager.searchBot.handleUpdate(req.body);
        res.status(200).json({ ok: true });
    } catch (e) {
        console.error('[webhook/telegram/search] error:', e.message);
        res.status(200).json({ ok: true });
    }
});

router.post('/telegram/business/:businessId', async (req, res) => {
    const botManager = req.app.locals.botManager;
    const { businessId } = req.params;
    const bizBot = botManager?.bots?.get(businessId);
    if (!bizBot?.bot) {
        return res.status(503).json({ error: 'Business bot not found' });
    }
    try {
        await bizBot.bot.handleUpdate(req.body);
        res.status(200).json({ ok: true });
    } catch (e) {
        console.error(`[webhook/telegram/business/${businessId}] error:`, e.message);
        res.status(200).json({ ok: true });
    }
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
