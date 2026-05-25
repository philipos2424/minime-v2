class ErrorMiddleware {
    static async handle(err, req, res, next) {
        console.error('Error:', err);

        // Log to audit
        if (req.context?.auditService) {
            await req.context.auditService.log({
                tableName: 'errors',
                action: 'ERROR',
                newData: {
                    message: err.message,
                    stack: err.stack,
                    url: req.url,
                    method: req.method
                },
                actorTelegramId: req.userId,
                severity: 'critical'
            });
        }

        // Don't leak error details in production
        const isDev = req.context?.config?.NODE_ENV === 'development';

        res.status(err.status || 500).json({
            error: isDev ? err.message : 'Internal server error',
            ...(isDev && { stack: err.stack }),
            requestId: req.id
        });
    }

    static notFound(req, res) {
        res.status(404).json({
            error: 'Not found',
            path: req.path
        });
    }
}

module.exports = ErrorMiddleware;
