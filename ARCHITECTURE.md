# MiniMe Complete Architecture Reference

## System Overview

MiniMe is an AI-powered sales assistant platform for Ethiopian businesses, built on Telegram. It handles customer conversations, product management, search, payments, and analytics.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Customers  │  │   Owners    │  │   Admins    │  │  Telegram Search Bot │ │
│  │  (Telegram) │  │ (Mini App)  │  │   (Panel)   │  │   (@MiniMeSearch)   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
└─────────┼────────────────┼────────────────┼────────────────────┼────────────┘
          │                │                │                    │
          ▼                ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         Express Server (Node.js)                         │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │ │
│  │  │  Health  │ │  MiniApp │ │   API    │ │ Webhooks │ │    Admin     │  │ │
│  │  │  Routes  │ │  Routes  │ │  Routes  │ │  Routes  │ │    Routes    │  │ │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘  │ │
│  │       └─────────────┴─────────────┴─────────────┴──────────────┘        │ │
│  │                              │                                          │ │
│  │  ┌───────────────────────────┼──────────────────────────────────────┐   │ │
│  │  │                      MIDDLEWARE                                    │   │ │
│  │  │  Auth  │  Validation  │  Rate Limit  │  Error Handling  │  Audit  │   │ │
│  │  └───────────────────────────┼──────────────────────────────────────┘   │ │
│  └──────────────────────────────┼──────────────────────────────────────────┘ │
└─────────────────────────────────┼────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVICE LAYER                                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────────────┐ │
│  │  TELEGRAM       │ │      AI         │ │      SECURITY                   │ │
│  │  BotManager     │ │  OpenAIService  │ │  EncryptionService              │ │
│  │  - Main Bot     │ │  - Analyze      │ │  - AES-256-GCM                  │ │
│  │  - Search Bot   │ │  - Generate     │ │  - Token Hashing                │ │
│  │  - Business Bots│ │  - Vision       │ │  - RateLimiter                  │ │
│  │  - Webhook      │ │  - Extract      │ │  - AuditService                 │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────────────────────┘ │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────────────┐ │
│  │    BUSINESS     │ │    PAYMENT      │ │      CRON JOBS                  │ │
│  │  ContentService │ │  ChapaService   │ │  HealthCheckJob                 │ │
│  │  SearchService  │ │  TelebirrService│ │  PriceReminderJob               │ │
│  │  ReferralService│ │  WebhookHandler │ │  AnalyticsJob                   │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA LAYER                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         Supabase (PostgreSQL)                            │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │ │
│  │  │  businesses  │ │   business_  │ │ conversations│ │conversation_ │   │ │
│  │  │              │ │   content    │ │              │ │   states     │   │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │ │
│  │  │pending_replies│ │secretary_    │ │  search_logs │ │   reviews    │   │ │
│  │  │              │ │  windows     │ │              │ │              │   │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │ │
│  │  │ transactions │ │  referrals   │ │   bot_pool   │ │ audit_logs   │   │ │
│  │  │              │ │              │ │              │ │              │   │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │ │
│  │  │   sessions   │ │  api_keys    │ │security_events│ │ rate_limit_  │   │ │
│  │  │              │ │              │ │              │ │    logs      │   │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │ │
│  │  │payment_trans-│ │ escrow_      │ │   payouts    │ │analytics_    │   │ │
│  │  │   actions    │ │  accounts    │ │              │ │   daily      │   │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │ │
│  │  │analytics_    │ │  customer_   │ │  product_    │ │  search_     │   │ │
│  │  │  hourly      │ │  analytics   │ │  analytics   │ │  analytics   │   │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Workflows

### 1. Customer Message Flow
```
Customer sends message
    ↓
BotManager receives via Telegram API
    ↓
CustomerHandler.process()
    ├── Get/Create conversation state
    ├── AI.analyzeMessage() → intent, sentiment, entities
    ├── Check escalation rules
    ├── Get relevant products from DB
    ├── AI.generateConsultantReply()
    ├── Update conversation state
    ├── Generate inline buttons
    ├── Send reply to customer
    └── Log conversation
```

### 2. Owner Upload Flow
```
Owner sends photo with caption
    ↓
BotManager.handleOwnerUpload()
    ├── Download image from Telegram
    ├── Store in Supabase Storage
    ├── AI.extractFromImage() → product details
    ├── Store in business_content
    └── Send confirmation with [Correct] [Edit] [Details] buttons
```

### 3. Shadow Mode Flow
```
Customer sends message
    ↓
AI generates suggested reply
    ↓
Store in pending_replies (status: pending)
    ↓
Send to owner: "Suggested: [reply] [Approve] [Edit] [Reject]"
    ↓
Owner action:
    ├── Approve → send to customer, mark approved
    ├── Edit → send edited version, mark edited, learn from correction
    └── Reject → mark rejected, try alternative
    ↓
Auto-approve after 30 min if no action
```

### 4. Search Flow
```
Customer sends query to @MiniMeSearchBot
    ↓
SearchHandler.parseSearchQuery()
    ├── Extract keywords
    ├── Detect budget range
    ├── Detect location
    ├── Detect category
    └── Use GPT for complex queries
    ↓
Search businesses in DB
    ├── Full-text search on search_vector
    ├── Filter by category, location, price
    ├── Order by reputation_score
    └── Limit to top results
    ↓
Format results with inline keyboards
    ↓
Log search for analytics
```

### 5. Payment Flow
```
Customer confirms reservation
    ↓
Generate reservation code
    ↓
Store transaction (status: reserved)
    ↓
Customer chooses payment method
    ↓
PaymentService.initializePayment()
    ├── Chapa → get checkout URL
    └── Telebirr → get payment URL
    ↓
Customer completes payment
    ↓
Webhook receives confirmation
    ↓
Update transaction (status: completed)
    ↓
Notify owner and customer
```

## Security Architecture

### Encryption
- **AES-256-GCM** for secrets at rest (bot tokens, API keys)
- **SHA-256** for token hashing
- **TLS 1.2+** for all communications

### Authentication
- Telegram WebApp init data verification
- API key authentication for webhooks
- Session-based auth for Mini App

### Authorization
- Row Level Security (RLS) on all tables
- Business isolation (owners only see their data)
- Customer isolation (only their conversations)

### Audit
- Every table has audit trigger
- Security events logged separately
- Failed auth attempts tracked
- Rate limiting per endpoint

## Database Schema Summary

### Core Tables (001_complete_schema.sql)
| Table | Purpose |
|-------|---------|
| `businesses` | Business profiles, settings, reputation |
| `business_content` | Products, FAQs, portfolio items |
| `conversations` | All customer messages and replies |
| `conversation_states` | AI memory per customer |
| `pending_replies` | Shadow mode queue |
| `secretary_windows` | 24h window tracking |
| `search_logs` | Search queries and results |
| `reviews` | Customer reviews and ratings |
| `transactions` | Reservations and purchases |
| `referrals` | Business-to-business referrals |
| `bot_pool` | Available bot tokens |
| `audit_logs` | Comprehensive audit trail |

### Security Tables (002_security_tables.sql)
| Table | Purpose |
|-------|---------|
| `rate_limit_logs` | Rate limiting tracking |
| `failed_auth_attempts` | Brute force protection |
| `security_events` | Suspicious activity |
| `api_keys` | Server-to-server auth |
| `backup_codes` | 2FA backup (future) |
| `sessions` | Mini App sessions |

### Payment Tables (003_payment_tables.sql)
| Table | Purpose |
|-------|---------|
| `business_payment_methods` | Configured payment methods |
| `payment_transactions` | Detailed payment records |
| `escrow_accounts` | Escrow holding |
| `payouts` | Business payouts |

### Analytics Tables (004_analytics_tables.sql)
| Table | Purpose |
|-------|---------|
| `analytics_daily` | Daily aggregated stats |
| `analytics_hourly` | Hourly real-time stats |
| `analytics_monthly` | Monthly reports |
| `customer_analytics` | Per-customer insights |
| `product_analytics` | Per-product performance |
| `search_analytics` | Search trend tracking |

## API Endpoints

### Public API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search` | Search businesses |
| GET | `/api/business/:id` | Business profile |
| GET | `/api/categories` | List categories |

### Mini App API (Authenticated)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/miniapp/dashboard` | Dashboard data |
| POST | `/miniapp/inbox` | Conversations |
| POST | `/miniapp/products` | Product list |
| POST | `/miniapp/products/update` | Update product |
| POST | `/miniapp/analytics` | Analytics data |
| POST | `/miniapp/settings` | Update settings |

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhook/telegram/:token` | Telegram updates |
| POST | `/webhook/chapa` | Chapa payments |
| POST | `/webhook/telebirr` | Telebirr payments |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/health/detailed` | Detailed stats |

## Environment Variables

### Required
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key |
| `OPENAI_API_KEY` | OpenAI API key |
| `TELEGRAM_BOT_TOKEN` | Main bot token |
| `ENCRYPTION_KEY` | 32+ char encryption key |

### Optional
| Variable | Description |
|----------|-------------|
| `SEARCH_BOT_TOKEN` | Search bot token |
| `CHAPA_SECRET_KEY` | Chapa payment |
| `TELEBIRR_APP_ID` | Telebirr app |
| `WEB_URL` | Production URL |

## Deployment

### Docker
```bash
cd docker
docker-compose up -d
```

### Manual
```bash
npm install
npm run db:migrate
npm run db:seed
npm start
```

### Environment
- Node.js 18+
- PostgreSQL 14+ (via Supabase)
- Redis (optional, for caching)
- Nginx (reverse proxy)

## Monitoring

### Health Checks
- Bot connectivity (every 5 min)
- Database connectivity
- OpenAI API status
- Webhook endpoint status

### Alerts
- 5 consecutive bot failures → auto-suspend
- Unusual payment patterns
- Brute force attempts
- High error rates

### Analytics
- Daily aggregation job
- Hourly real-time metrics
- Monthly reporting
- Customer segmentation
