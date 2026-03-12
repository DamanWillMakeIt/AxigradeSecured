# Security Hardening — Production-Ready Fixes

This document details all security fixes applied to make the application production-ready for Vercel deployment.

## ✅ FIXED: Critical Security Issues

### 1. ✅ Rate Limiter — Production-Grade with Upstash Redis

**Issue:** In-memory rate limiter was instance-specific and reset on cold starts, making it trivially bypassable in serverless environments.

**Fix:**
- Replaced in-memory Map with **Upstash Redis**-backed rate limiter
- Persistent across all Vercel function instances
- Sliding window algorithm for accurate rate limiting
- Separate limiters for each endpoint type

**Files Modified:**
- `package.json` — Added `@upstash/ratelimit` and `@upstash/redis`
- `src/lib/rate-limit.ts` — Complete rewrite using Upstash
- All API routes — Updated to use new async rate limiter

**Required Environment Variables:**
```bash
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
```

**Setup:** Create free Redis database at https://upstash.com

---

### 2. ✅ JWT Revocation & Token Versioning

**Issue:** JWTs lived for 7 days with stale `role` data. No way to revoke tokens when demoting admins or suspending accounts.

**Fix:**
- Added `tokenVersion` field to User model (increment to invalidate all user tokens)
- Added `isActive` field for account suspension
- Middleware validates token against **live database state** on every request
- Role always read from DB, not stale JWT payload
- Login checks account status before issuing token

**Files Modified:**
- `prisma/schema.prisma` — Added `tokenVersion`, `isActive` to User
- `src/lib/auth.ts` — Updated SessionUser type
- `src/middleware.ts` — Added DB validation for every protected route
- `src/app/api/auth/login/route.ts` — Includes tokenVersion & isActive in JWT

**Admin Operations:**
```typescript
// Revoke all user's tokens
await prisma.user.update({
  where: { id: userId },
  data: { tokenVersion: { increment: 1 } }
});

// Suspend account
await prisma.user.update({
  where: { id: userId },
  data: { isActive: false }
});
```

---

### 3. ✅ Gemini API Key Moved to Header

**Issue:** API key exposed in URL query parameters, logged in Vercel function logs and upstream server logs.

**Fix:**
- Moved from `?key=${GEMINI_API_KEY}` to `x-goog-api-key` request header
- Google's API supports header-based auth
- Keeps keys out of all log files

**Files Modified:**
- `src/app/api/scene-modify/route.ts`

---

### 4. ✅ API Keys Encrypted at Rest

**Issue:** API keys stored as plaintext in MongoDB — database breach = immediate key compromise.

**Fix:**
- AES-256-GCM encryption for all API keys in database
- Per-record random IVs with authentication tags
- Keys encrypted before DB write, decrypted on read
- Applied to both `SeoApiKey` and `ArchitectApiKey`

**Files Modified:**
- `src/lib/encryption.ts` — NEW: Encryption utility
- `src/app/api/seo-key/route.ts` — Encrypt/decrypt keys
- `src/app/api/architect-key/route.ts` — Encrypt/decrypt keys
- `src/app/api/architect-generate/route.ts` — Decrypt when using

**Required Environment Variable:**
```bash
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=your_64_character_hex_string_here
```

---

### 5. ✅ Video Proxy Size Cap & SSRF Protection

**Issue:** 
- No size limit on proxied videos — could stream multi-GB files, exhausting bandwidth
- `storage.googleapis.com` too broad — allows proxying ANY GCS bucket

**Fix:**
- 100 MB hard cap on video proxy streaming
- Abort stream if size exceeds limit (checked both in Content-Length header and during streaming)
- Narrowed SSRF allowlist to specific xAI bucket paths only
- Rejects broad `storage.googleapis.com` domain

**Files Modified:**
- `src/app/api/video-proxy/route.ts`

**New Allowlist:**
```typescript
const ALLOWED_HOSTS = [
  "vidgen.x.ai",
  "cdn.x.ai",
  "storage.googleapis.com/xai-video-outputs",  // Specific buckets only
  "storage.googleapis.com/xai-cdn",
];
```

---

### 6. ✅ Script Validator — Scene Count & Schema Validation

**Issue:** Unsanitized scene data forwarded to external service with no limits — could send 50,000 scenes.

**Fix:**
- Maximum 100 scenes per request
- Schema validation on each scene object
- Prevents DoS via excessive payload size

**Files Modified:**
- `src/app/api/script-validate/route.ts`

---

### 7. ✅ Removed `detail` from External API Errors

**Issue:** Upstream API error responses forwarded to client could leak internal stack traces, config hints.

**Fix:**
- Removed `detail` field from all error responses
- Errors logged server-side only
- Generic error messages sent to client

**Files Modified:**
- `src/app/api/scene-modify/route.ts`
- `src/app/api/xai-video-generate/route.ts`
- `src/app/api/architect-generate/route.ts`
- `src/app/api/architect-key/route.ts`
- `src/app/api/seo-key/route.ts`

---

### 8. ✅ Global Request Body Size Limit

**Issue:** No default body size limit — unauthenticated routes accept arbitrarily large JSON.

**Fix:**
- Next.js 14 has a built-in 1 MB default body size limit for API routes
- Routes with larger needs (file uploads) implement their own validation
- `thumbnail-generate`: 10 MB image size check
- `xai-video-generate`: 10 MB image base64 check
- `visual-hook`: 10 MB image base64 check
- Prevents memory exhaustion on all routes

**Files Modified:**
- `next.config.js` — Removed invalid `api.bodyParser` config (not supported in Next.js 14)
- All file upload routes already have size validation

---

### 9. ✅ Added `createdAt` to All Models

**Issue:** Only `updatedAt` tracked — made audit trails and debugging difficult.

**Fix:**
- Added `createdAt DateTime @default(now())` to:
  - `Architect`
  - `ClickEngineer`
  - `AlgorithmWhisperer`
  - `QualityCritic`
  - `VisualHook`

**Files Modified:**
- `prisma/schema.prisma`

---

## 📋 Deployment Checklist

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Environment Variables

**Vercel Environment Variables (required):**
```bash
# Database
DATABASE_URL=mongodb+srv://...

# Session & Encryption
SESSION_SECRET=your_session_secret_here
ENCRYPTION_KEY=your_64_char_hex_key_here  # openssl rand -hex 32

# Upstash Redis (for rate limiting)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here

# External APIs
GEMINI_API_KEY=your_gemini_key
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
```

### 3. Update Database Schema
```bash
npm run db:push
```

### 4. Deploy to Vercel
```bash
vercel --prod
```

---

## 🔒 Additional Security Notes

### Rate Limits (per user, per hour)
- Login attempts: 10 per IP per 15 minutes
- Scene modifications: 30
- Video generation: 10
- Thumbnail generation: 10
- Architect generation: 20

### JWT Configuration
- Expiry: 7 days
- Algorithm: HS256
- httpOnly: true
- sameSite: strict
- secure: true (production only)

### Password Security
- Bcrypt with 10 rounds
- Timing-attack protection on login

### CORS & Security Headers
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security: enabled
- CSP with minimal unsafe-inline/eval (Next.js requirement)

---

## 🚨 Still TODO (Not Blockers for Initial Deployment)

### Recommended for Future Improvements

1. **xAI API Key Storage**
   - Currently sent from client on every request
   - Should be stored encrypted server-side after first entry
   - Lower priority: keys are sent over HTTPS and not logged

2. **Nonce-based CSP**
   - Replace `unsafe-inline`/`unsafe-eval` with Next.js nonce support
   - Next.js 14 supports this via middleware

3. **Admin Panel Pagination**
   - Currently returns last 20 users hardcoded
   - Add proper pagination endpoint

4. **Audit Logging**
   - Log admin actions (user suspension, role changes)
   - Log API key regeneration events

---

## 🎯 Testing the Fixes

### Test Rate Limiting
```bash
# Should fail after 10 attempts
for i in {1..15}; do
  curl -X POST https://your-app.vercel.app/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
```

### Test Token Revocation
```typescript
// In Prisma Studio or admin panel
// 1. Login as user
// 2. Increment tokenVersion
// 3. Try accessing protected route -> should redirect to login
```

### Test API Key Encryption
```typescript
// Check MongoDB directly
// All keys in SeoApiKey and ArchitectApiKey should be base64 gibberish
// Not readable plaintext
```

---

## 📞 Support

For security issues, contact: [your-email]

Generated: 2025-03-12
Version: Production-Ready v1.0
