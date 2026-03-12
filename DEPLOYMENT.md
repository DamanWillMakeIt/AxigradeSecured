# Axigrade — Production Deployment Guide

## 🚀 Quick Deploy to Vercel

### Prerequisites
1. **Upstash Redis Account** (free tier available)
   - Sign up at https://upstash.com
   - Create a new Redis database
   - Copy REST URL and Token

2. **MongoDB Atlas** (free tier M0 available)
   - Connection string from MongoDB Atlas

3. **Cloudinary Account**
   - Get credentials from Cloudinary dashboard

4. **Gemini API Key**
   - Get from Google AI Studio

### Step 1: Clone and Install

```bash
git clone <your-repo>
cd axigrade-secured
npm install
```

### Step 2: Set Up Environment Variables

Create `.env.local` for local development:

```bash
# Copy example
cp .env.example .env.local

# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate ENCRYPTION_KEY
openssl rand -hex 32
```

Fill in all variables in `.env.local`:

```env
DATABASE_URL="mongodb+srv://..."
SESSION_SECRET="<64 char hex>"
ENCRYPTION_KEY="<64 char hex>"
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
GEMINI_API_KEY="..."
```

### Step 3: Initialize Database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to MongoDB
npm run db:push
```

### Step 4: Test Locally

```bash
npm run dev
```

Visit http://localhost:3000 and test:
- ✅ Signup/Login
- ✅ Create a project
- ✅ Rate limiting (try login 11 times with wrong password)

### Step 5: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

**Important:** Add all environment variables in Vercel dashboard:
1. Go to Project Settings → Environment Variables
2. Add all variables from `.env.local`
3. Redeploy

---

## 🔒 Security Checklist

### ✅ Before Going Live

- [ ] All environment variables set in Vercel
- [ ] `ENCRYPTION_KEY` is unique (not from example)
- [ ] `SESSION_SECRET` is unique (not from example)
- [ ] Upstash Redis connected and working
- [ ] Rate limiting tested (try 11 failed logins)
- [ ] Database schema pushed (`npm run db:push`)
- [ ] First admin account created

### ✅ Post-Deployment

- [ ] Test login/logout flow
- [ ] Test token revocation (change tokenVersion)
- [ ] Test account suspension (set isActive = false)
- [ ] Verify API keys are encrypted in MongoDB (check with Prisma Studio)
- [ ] Test rate limits under load

---

## 🛠️ Admin Operations

### Create First Admin User

```typescript
// In Prisma Studio or MongoDB Compass
// 1. Register a user normally through UI
// 2. Update their role:

await prisma.user.update({
  where: { email: "admin@example.com" },
  data: { role: "admin" }
});
```

### Revoke All User Tokens

```typescript
await prisma.user.update({
  where: { id: "user_id" },
  data: { tokenVersion: { increment: 1 } }
});
```

### Suspend Account

```typescript
await prisma.user.update({
  where: { id: "user_id" },
  data: { isActive: false }
});
```

---

## 📊 Monitoring

### Check Rate Limit Usage (Upstash)
- Visit Upstash dashboard
- View Redis metrics
- Monitor key patterns: `ratelimit:*`

### View Logs (Vercel)
```bash
vercel logs
```

### Common Issues

**Issue:** "UPSTASH_REDIS_REST_URL is not set"
- **Fix:** Add Upstash credentials to Vercel environment variables

**Issue:** "ENCRYPTION_KEY must be exactly 64 hex characters"
- **Fix:** Regenerate with `openssl rand -hex 32`

**Issue:** Rate limiting not working across instances
- **Fix:** Verify Upstash Redis is connected (check dashboard)

**Issue:** Users can still access after account suspension
- **Fix:** Wait for JWT to expire OR increment tokenVersion to force immediate revocation

---

## 🔐 Security Features Enabled

✅ **Rate Limiting:** Upstash Redis-backed, persistent across instances  
✅ **JWT Revocation:** Token versioning + isActive flag  
✅ **API Key Encryption:** AES-256-GCM at rest  
✅ **SSRF Protection:** Narrowed video proxy allowlist  
✅ **Request Size Limits:** 10 MB global cap  
✅ **Secure Headers:** HSTS, CSP, X-Frame-Options  
✅ **Timing Attack Prevention:** Constant-time password comparison  
✅ **User Enumeration Protection:** Generic login error messages  

---

## 📝 Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ | MongoDB connection string | `mongodb+srv://...` |
| `SESSION_SECRET` | ✅ | JWT signing secret (64 char hex) | Generate with crypto |
| `ENCRYPTION_KEY` | ✅ | Database encryption key (64 char hex) | `openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL` | ✅ | Upstash Redis REST endpoint | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Upstash Redis auth token | From Upstash dashboard |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Cloudinary cloud name | From Cloudinary |
| `CLOUDINARY_API_KEY` | ✅ | Cloudinary API key | From Cloudinary |
| `CLOUDINARY_API_SECRET` | ✅ | Cloudinary API secret | From Cloudinary |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key | From Google AI Studio |
| `NODE_ENV` | Optional | Environment mode | `production` |

---

## 🆘 Support

- **Security Issues:** See `SECURITY_FIXES.md`
- **Deployment Issues:** Check Vercel logs
- **Database Issues:** Verify MongoDB Atlas connection

---

**Last Updated:** 2025-03-12  
**Version:** Production-Ready v1.0
