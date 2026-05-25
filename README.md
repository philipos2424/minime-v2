# 🪞 MiniMe

**AI Sales Assistant for Ethiopian Businesses**

MiniMe answers customer messages, manages products, and drives sales — while you focus on running your business.

## Features

🤖 **AI-Powered Replies** - GPT-4o trained on your products and style
📸 **Photo Upload** - Send product photos, AI extracts details automatically
🔍 **Smart Search** - Customers find you via @MiniMeSearchBot
💬 **Dual Mode** - Secretary (reply as you) or Dedicated Bot
⚡ **Fallback** - Auto-switch to bot when you're offline
💰 **Payments** - Chapa & Telebirr integration
📊 **Analytics** - Track conversations, leads, and revenue

## Quick Start

```bash
# 1. Clone
git clone https://github.com/your-org/minime.git
cd minime

# 2. Setup
cp .env.example .env
# Edit .env with your credentials

# 3. Install
npm install

# 4. Database
# Run migrations/001_complete_schema.sql in Supabase

# 5. Start
npm run dev
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Customer   │────▶│  Telegram   │────▶│   MiniMe    │
│             │◀────│   Bot API   │◀────│   Server    │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                    ┌─────────────┐     ┌──────▼──────┐
                    │   OpenAI    │◀───▶│  Supabase   │
                    │   GPT-4o    │     │  (Postgres) │
                    └─────────────┘     └─────────────┘
```

## Tech Stack

- **Backend:** Node.js, Express, Telegraf
- **AI:** OpenAI GPT-4o, Vision API
- **Database:** Supabase (PostgreSQL)
- **Frontend:** React, Telegram Mini App
- **Payments:** Chapa, Telebirr
- **Deploy:** Docker, Nginx

## Contributing

1. Fork the repo
2. Create feature branch
3. Commit changes
4. Open pull request

## License

MIT © MiniMe Team
