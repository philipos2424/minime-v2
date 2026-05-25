class AuditService {
    constructor(supabase) {
        this.supabase = supabase;
    }

    async log({
        tableName,
        recordId,
        action,
        oldData = null,
        newData = null,
        actorTelegramId = null,
        actorIp = null,
        actorUserAgent = null,
        severity = 'info'
    }) {
        try {
            // Don't block on audit failures
            const { error } = await this.supabase
                .from('audit_logs')
                .insert({
                    table_name: tableName,
                    record_id: recordId,
                    action,
                    old_data: oldData,
                    new_data: newData,
                    actor_telegram_id: actorTelegramId,
                    actor_ip: actorIp,
                    actor_user_agent: actorUserAgent,
                    severity
                });

            if (error) {
                console.error('Audit log failed:', error);
            }
        } catch (err) {
            console.error('Audit service error:', err);
        }
    }

    async logAuth({
        telegramId,
        action,
        success,
        ip,
        userAgent,
        details = {}
    }) {
        await this.log({
            tableName: 'auth',
            action: `AUTH_${action}`,
            actorTelegramId: telegramId,
            actorIp: ip,
            actorUserAgent: userAgent,
            newData: { success, ...details },
            severity: success ? 'info' : 'warning'
        });
    }

    async logPayment({
        transactionId,
        action,
        amount,
        status,
        details = {}
    }) {
        await this.log({
            tableName: 'transactions',
            recordId: transactionId,
            action: `PAYMENT_${action}`,
            newData: { amount, status, ...details },
            severity: status === 'failed' ? 'critical' : 'info'
        });
    }

    async logBotAction({
        botId,
        action,
        businessId,
        customerId,
        details = {}
    }) {
        await this.log({
            tableName: 'bot_actions',
            action: `BOT_${action}`,
            actorTelegramId: customerId,
            newData: { bot_id: botId, business_id: businessId, ...details }
        });
    }

    async getRecentLogs(limit = 100, severity = null) {
        let query = this.supabase
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (severity) {
            query = query.eq('severity', severity);
        }

        return await query;
    }
}

module.exports = AuditService;
