# Nearzy Backend API v2.0

Hyperlocal delivery platform backend — Node.js + Express + MongoDB

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your MongoDB URI, Razorpay keys, etc.

# 3. Seed the database (creates test users, shops, products, promos)
npm run seed

# 4. Start the server
npm run dev       # development (nodemon)
npm start         # production
```

## Test Credentials (after seeding)
| Role       | Email               | Password   |
|------------|---------------------|------------|
| Admin      | admin@nearzy.in     | Admin@123  |
| User       | demo@nearzy.in      | Demo@123   |
| Shop Owner | shop@nearzy.in      | Shop@123   |

## API Endpoints

### Auth
- `POST /api/auth/signup` — Register
- `POST /api/auth/login` — Login → returns JWT token
- `POST /api/auth/logout`

### Users
- `GET /api/users/me` — Get profile
- `PUT /api/users/me` — Update profile
- `PUT /api/users/me/password` — Change password
- `POST /api/users/me/addresses` — Add address
- `DELETE /api/users/me/addresses/:id`

### Shops & Products
- `GET /api/shops?city=Hyderabad&category=restaurant`
- `GET /api/shops/:id`
- `GET /api/products?shop=shopId`
- `POST /api/shops` — Create shop (shop_owner role)

### Orders
- `POST /api/orders` — Place order
- `GET /api/orders/my` — My orders
- `GET /api/orders/:id`
- `PUT /api/orders/:id/cancel`

### Payments (Razorpay)
- `POST /api/payment/create-order`
- `POST /api/payment/verify`

### Wallet
- `GET /api/wallet/balance`
- `GET /api/wallet/transactions`
- `POST /api/wallet/topup-create`
- `POST /api/wallet/topup-verify`

### Notifications
- `GET /api/notifications`
- `PUT /api/notifications/read-all`

### Search
- `GET /api/search?q=biryani&city=Hyderabad`
- `GET /api/search/suggestions?q=bir`

### Promo Codes
- `POST /api/promo/validate`
- `GET /api/promo/available`

### Referral
- `GET /api/referral/my-code`
- `POST /api/referral/apply`

### Subscription (Pro)
- `GET /api/subscription/status`
- `POST /api/subscription/activate`

### Bookings
- `POST /api/bookings`
- `GET /api/bookings/my`
- `DELETE /api/bookings/:id`

### Admin
- `GET /api/admin/stats`
- `GET /api/admin/users`
- `PUT /api/admin/shops/:id/verify`
- `POST /api/admin/broadcast`

## Deployment (Render.com)
1. Push to GitHub
2. Create Web Service on Render, connect repo
3. Set environment variables in Render dashboard
4. Deploy!

Free MongoDB: [MongoDB Atlas](https://cloud.mongodb.com)
