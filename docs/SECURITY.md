# MiniMe Security Guide

## Architecture

### Encryption
- AES-256-GCM for secrets at rest
- SHA-256 for token hashing
- TLS 1.2+ for all communications

### Authentication
- Telegram WebApp init data verification
- API key authentication for webhooks
- Row Level Security (RLS) in Supabase

### Authorization
- Business owners can only access their data
- Customers can only see their conversations
- Admin access requires explicit grant

## Data Protection

### PII Handling
- Customer phone numbers encrypted
- Message content retained for 90 days
- Audit logs retained for 1 year

### Compliance
- GDPR right to deletion supported
- Data export available via API
- Consent tracking for marketing

## Threat Model

### Mitigated Risks
| Threat | Mitigation |
|--------|-----------|
| Token theft | Encrypted storage, rotation |
| SQL injection | Parameterized queries, RLS |
| XSS | Helmet CSP, input validation |
| CSRF | SameSite cookies, token verification |
| Rate limiting | Multi-tier limits per endpoint |

### Monitoring
- Failed auth attempts logged
- Unusual activity alerts
- Automated suspension on abuse

## Incident Response

1. Isolate affected business
2. Rotate compromised tokens
3. Notify affected users
4. Post-incident review
