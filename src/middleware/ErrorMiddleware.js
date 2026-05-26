// Express error handler — must be a plain function, not a class
async function errorHandler(err, req, res, next) {
    console.error('[Error]', err.message);

    if (req.context?.auditService) {
        req.context.auditService.log({
            tableName: 'errors',
            action: 'ERROR',
            newData: { message: err.message, url: req.url, method: req.method },
            severity: 'critical'
        }).catch(() => {});
    }

    const isDev = process.env.NODE_ENV === 'development';
    res.status(err.status || 500).json({
        error: isDev ? err.message : 'Internal server error',
        ...(isDev && { stack: err.stack })
    });
}

function notFound(req, res) {
    res.status(404).json({ error: 'Not found', path: req.path });
}

module.exports = errorHandler;
module.exports.notFound = notFound;
