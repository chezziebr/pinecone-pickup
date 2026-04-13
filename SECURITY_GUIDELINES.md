# Security Guidelines - Pinecone Pick Up

## 🚨 Critical Security Checklist

### ✅ Environment Variables Security
- **NEVER** commit environment files (`.env*`) to Git
- **ALWAYS** use Vercel environment variables for production secrets
- **VERIFY** that `.gitignore` includes all sensitive file patterns
- **ROTATE** credentials immediately if accidentally exposed

### ✅ What Was Previously Exposed (RESOLVED)
Analysis completed on 2026-04-13:
- ✅ **NO actual credentials** were found in the codebase
- ✅ Only placeholder values like `FILL_IN` or `your_api_key_here` were present
- ✅ All sensitive data was properly using environment variables
- ✅ `.gitignore` was correctly excluding `.env*` files

## 🔐 Environment Variables Guide

### Production Environment (Vercel) ✅ CONFIGURED
All variables are properly set in Vercel production environment:

**Google Calendar Integration:**
- `GOOGLE_CLIENT_ID` - OAuth client ID for calendar access
- `GOOGLE_CLIENT_SECRET` - OAuth client secret ⚠️ **HIGH SECURITY**
- `PERSONAL_GOOGLE_REFRESH_TOKEN` - Personal calendar access ⚠️ **HIGH SECURITY**
- `PINECONE_GOOGLE_REFRESH_TOKEN` - Business calendar access ⚠️ **HIGH SECURITY**
- `PERSONAL_CALENDAR_IDS` - Calendar ID for personal availability
- `PINECONE_CALENDAR_ID` - Calendar ID for business bookings

**Database (Supabase):**
- `NEXT_PUBLIC_SUPABASE_URL` - Public Supabase URL ℹ️ **PUBLIC**
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anonymous access key ℹ️ **PUBLIC**
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key ⚠️ **CRITICAL**

**Email Service (Resend):**
- `RESEND_API_KEY` - API key for email sending ⚠️ **HIGH SECURITY**
- `RESEND_FROM_EMAIL` - Verified sender email

**Application Security:**
- `NEXT_PUBLIC_BASE_URL` - Application base URL ℹ️ **PUBLIC**
- `CRON_SECRET` - Secret for protecting cron endpoints ⚠️ **HIGH SECURITY**
- `JWT_SECRET` - JWT signing secret ⚠️ **CRITICAL**
- `ADMIN_PASSWORD` - Admin dashboard password ⚠️ **CRITICAL**

## 🛡️ Security Best Practices

### 1. Environment Variable Security
```bash
# ✅ CORRECT: Set via Vercel CLI
vercel env add SECRET_NAME production --value "secret_value" --yes

# ❌ NEVER: Hardcode in files
const apiKey = "sk-1234567890abcdef"  # NEVER DO THIS!

# ✅ CORRECT: Use environment variables
const apiKey = process.env.RESEND_API_KEY
```

### 2. Git Security Rules
- **ALWAYS** check files before committing: `git diff --cached`
- **NEVER** force push to main: `git push --force` (dangerous)
- **VERIFY** `.gitignore` is working: `git status` should not show `.env` files

### 3. Credential Management
```bash
# Check if any secrets are accidentally tracked
git log --follow -- .env
git log --grep="password\|secret\|key" --all

# If credentials are exposed in Git history
# 1. Immediately rotate ALL affected credentials
# 2. Contact security team
# 3. Consider using BFG Repo-Cleaner to remove from history
```

### 4. NEXT_PUBLIC_ Variables ⚠️
**WARNING**: Variables prefixed with `NEXT_PUBLIC_` are bundled into the frontend and visible to users.
- ✅ OK: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_BASE_URL`
- ❌ NEVER: `NEXT_PUBLIC_SECRET_KEY`, `NEXT_PUBLIC_API_SECRET`

### 5. API Route Security
```typescript
// ✅ CORRECT: Validate cron secret
if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}

// ✅ CORRECT: Validate admin access
const { password } = await request.json()
if (password !== process.env.ADMIN_PASSWORD) {
  return Response.json({ error: 'Invalid password' }, { status: 401 })
}
```

## 🚨 Incident Response Plan

### If Credentials Are Exposed:

#### **IMMEDIATE (Within 15 minutes):**
1. **ROTATE** all exposed credentials immediately
2. **REVOKE** old credentials in their respective services
3. **UPDATE** Vercel environment variables with new credentials
4. **REDEPLOY** the application

#### **SHORT-TERM (Within 1 hour):**
1. **AUDIT** access logs for unauthorized usage
2. **NOTIFY** team members
3. **UPDATE** documentation with new procedures

#### **FOLLOW-UP (Within 24 hours):**
1. **REVIEW** how the exposure occurred
2. **IMPROVE** processes to prevent recurrence
3. **DOCUMENT** the incident for future reference

### Service-Specific Rotation Steps:

**Google OAuth:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Revoke old refresh tokens
3. Generate new client secret
4. Re-authorize OAuth flow for new refresh tokens

**Supabase:**
1. Go to Supabase Dashboard → Settings → API
2. Reset service role key
3. Update environment variables immediately

**Resend:**
1. Go to Resend Dashboard → API Keys
2. Delete compromised key
3. Create new API key
4. Update environment variables

## 🔍 Regular Security Audits

### Weekly Checks:
- [ ] Review recent Git commits for accidentally committed secrets
- [ ] Check Vercel deployment logs for errors indicating missing env vars
- [ ] Verify admin dashboard is accessible only with correct password

### Monthly Checks:
- [ ] Audit all environment variables in Vercel dashboard
- [ ] Review API access logs for suspicious activity
- [ ] Test backup and recovery procedures
- [ ] Update any outdated dependencies

### Quarterly Checks:
- [ ] Rotate all high-security credentials as a precaution
- [ ] Review and update this security documentation
- [ ] Conduct penetration testing if possible
- [ ] Train team on updated security practices

## 📋 Security Checklist for New Features

Before deploying new features:

- [ ] No hardcoded secrets or credentials
- [ ] All sensitive data uses environment variables
- [ ] API endpoints have proper authentication
- [ ] Input validation is implemented
- [ ] Rate limiting is considered for public endpoints
- [ ] Error messages don't leak sensitive information
- [ ] HTTPS is enforced for all connections

## 🛠️ Tools and Commands

### Check for exposed secrets:
```bash
# Search for potential secrets in codebase
grep -r "sk_\|pk_\|secret\|password\|token" --exclude-dir=node_modules .

# Check git history for secrets
git log --all --full-history -- "*.env*"
```

### Environment variable management:
```bash
# List all production environment variables
vercel env ls

# Add new environment variable
vercel env add VARIABLE_NAME production --value "value" --yes

# Remove environment variable
vercel env rm VARIABLE_NAME production --yes
```

---

**📞 Emergency Contact:** If you discover a security incident, contact the project maintainer immediately.

**📅 Last Updated:** April 13, 2026
**📝 Next Review:** May 13, 2026