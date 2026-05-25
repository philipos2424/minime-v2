# MiniMe Deployment Guide

## Prerequisites

- Node.js 18+ 
- Docker & Docker Compose (optional)
- Supabase account
- Telegram Bot tokens
- OpenAI API key
- Domain name (for production)

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/your-org/minime.git
cd minime
cp .env.example .env
# Edit .env with your credentials
```

### 2. Database Setup

1. Create Supabase project
2. Run the schema: `migrations/001_complete_schema.sql`
3. Add connection details to `.env`

### 3. Telegram Bot Setup

1. Message @BotFather
2. Create main bot: `/newbot` → name it "MiniMe Assistant"
3. Create search bot: `/newbot` → name it "MiniMe Search"
4. Enable Business Mode: `/mybots` → select bot → Bot Settings → Business Mode → Turn On
5. Copy tokens to `.env`

### 4. Run Locally

```bash
npm install
npm run dev
```

### 5. Deploy with Docker

```bash
cd docker
docker-compose up -d
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `TELEGRAM_BOT_TOKEN` | Yes | Main bot token |
| `ENCRYPTION_KEY` | Yes | 32+ char encryption key |
| `SEARCH_BOT_TOKEN` | No | Search bot token |
| `CHAPA_SECRET_KEY` | No | Chapa payment key |
| `TELEBIRR_APP_ID` | No | Telebirr app ID |

## Production Checklist

- [ ] SSL certificates configured
- [ ] Webhook URLs set in Telegram
- [ ] Rate limiting enabled
- [ ] Audit logging active
- [ ] Health checks configured
- [ ] Backup strategy in place
- [ ] Monitoring setup (Sentry/DataDog)
- [ ] GDPR/privacy compliance

## Scaling

### Horizontal Scaling
- Use Redis for session storage
- Load balancer with multiple app instances
- Separate worker processes for cron jobs

### Database Optimization
- Enable connection pooling
- Add read replicas for analytics
- Archive old conversations monthly

## Troubleshooting

### Bot not responding
1. Check webhook URL is set correctly
2. Verify bot token is valid
3. Check server logs for errors

### High latency
1. Enable Redis caching
2. Optimize database queries
3. Use CDN for static assets

### Payment failures
1. Verify Chapa/Telebirr credentials
2. Check webhook endpoints are accessible
3. Review transaction logs
