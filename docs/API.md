# MiniMe API Documentation

## Authentication

All requests require either:
- `Authorization: Telegram <init_data>` (Mini App)
- `X-API-Key: <key>` (Server-to-server)

## Endpoints

### Public

#### GET /api/search
Search businesses and products.

**Query Parameters:**
- `q` - Search query
- `category` - Filter by category
- `location` - Filter by location
- `min_price` - Minimum price
- `max_price` - Maximum price
- `verified_only` - Only verified businesses

**Response:**
```json
{
  "results": [...],
  "total": 42,
  "query": "laptop under 20k"
}
```

#### GET /api/business/:id
Get business profile with products and reviews.

### Mini App (Authenticated)

#### POST /miniapp/dashboard
Get dashboard data for logged-in owner.

**Response:**
```json
{
  "business": {...},
  "stats": {...},
  "unreadCount": 5,
  "pendingCount": 2,
  "recentConversations": [...]
}
```

#### POST /miniapp/inbox
Get conversations with filtering.

**Body:**
```json
{
  "filter": "all|unread|pending",
  "page": 1,
  "limit": 20
}
```

#### POST /miniapp/products
Get business products.

#### POST /miniapp/products/update
Update product details.

**Body:**
```json
{
  "productId": "uuid",
  "updates": {
    "name": "New Name",
    "price": 15000,
    "description": "..."
  }
}
```

#### POST /miniapp/analytics
Get analytics data.

**Body:**
```json
{
  "period": "7d|30d|90d"
}
```

#### POST /miniapp/settings
Update business settings.

### Webhooks

#### POST /webhook/telegram/:token
Telegram bot webhook endpoint.

#### POST /webhook/chapa
Chapa payment webhook.

#### POST /webhook/telebirr
Telebirr payment webhook.

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad request / validation error |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not found |
| 429 | Rate limited |
| 500 | Internal server error |

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| /api/* | 100/min |
| /miniapp/* | 100/min |
| /webhook/telegram | 50/min |
| /webhook/payment | 10/min |
