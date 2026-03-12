# Quick Start Guide — Production Deployment

## 🚀 Deploy in 5 Minutes

### 1. Install Dependencies
```bash
npm install
```

### 2. Create Upstash Redis (FREE)
1. Go to https://upstash.com
2. Sign up → Create Database
3. Copy REST URL and REST TOKEN

### 3. Set Environment Variables

Create `.env.local`:
```bash
# Database
DATABASE_URL="mongodb+srv://..."

# Auth & Encryption (REQUIRED)
SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")"
ENCRYPTION_KEY="$(openssl rand -hex 32)"

# Upstash Redis (REQUIRED)
UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your_token_here"

# Cloudinary
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."

# Gemini
GEMINI_API_KEY="..."
```

### 4. Initialize Database
```bash
npm run db:push
```

### 5. Deploy to Vercel
```bash
vercel --prod
```

**Important:** Add all environment variables in Vercel dashboard!

---

## ✅ Security Checklist

After deployment, verify:

- [ ] Rate limiting works (try 11 failed logins)
- [ ] Token revocation works (change tokenVersion in DB)
- [ ] Keys are encrypted (check MongoDB with Prisma Studio)
- [ ] Video proxy has 100MB cap
- [ ] All environment variables set

---

## 🔒 All Security Issues Fixed

✅ Rate limiter → Upstash Redis (persistent)  
✅ JWT revocation → tokenVersion field  
✅ API keys → AES-256-GCM encrypted  
✅ Gemini key → Moved to header  
✅ Video proxy → 100MB size cap  
✅ SSRF → Narrowed allowlist  
✅ Scene validation → 100 scene max  
✅ Body size → 10MB global limit  
✅ Error responses → Sanitized  
✅ Audit trail → createdAt added  

---

## 📚 Full Documentation

- `COMPLETE_FIX_SUMMARY.md` — All fixes explained
- `SECURITY_FIXES.md` — Technical details
- `DEPLOYMENT.md` — Full deployment guide
- `.env.example` — All environment variables

---

## 🆘 Need Help?

**Common Issues:**

1. **"UPSTASH_REDIS_REST_URL is not set"**
   → Add to Vercel environment variables

2. **"ENCRYPTION_KEY must be 64 characters"**
   → Run: `openssl rand -hex 32`

3. **Rate limiting not working**
   → Check Upstash dashboard for connection

4. **Users still logged in after suspension**
   → Wait for JWT expiry OR increment tokenVersion

---

**Status:** ✅ Production-Ready  
**Deploy Time:** ~5 minutes  
**All CTO Issues:** FIXED
