# 🔐 Security Setup Instructions

## CRITICAL SECURITY NOTICE

**⚠️ ALL CREDENTIALS HAVE BEEN REMOVED FROM THIS REPOSITORY FOR SECURITY**

The following credentials were previously exposed and **MUST BE REGENERATED**:

### 🔄 Credentials to Regenerate Immediately:

1. **Google OAuth Credentials**
   - Regenerate Google Client ID and Secret
   - Revoke and recreate refresh tokens
   - Update calendar API permissions

2. **Supabase Keys**
   - Regenerate service role key
   - Consider rotating anon key as well

3. **JWT Secret**
   - Generate new cryptographically secure JWT secret
   - Use: `openssl rand -base64 32`

4. **Admin Password**
   - Set strong, unique admin password
   - Avoid default passwords

5. **CRON Secret**
   - Generate random secret for cron endpoints
   - Use: `openssl rand -base64 32`

### 🛠 Setup Instructions:

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in all environment variables with new, secure values

3. **Never commit `.env.local` to git** - it's already in .gitignore

4. For Vercel deployment, set environment variables in the Vercel dashboard

### 🔍 Verifying Setup:

- [ ] All environment variables filled in `.env.local`
- [ ] No default/example values remain
- [ ] `.env.local` not committed to git
- [ ] Production environment variables set in Vercel
- [ ] All old credentials have been revoked/regenerated

### 🚨 If Credentials Were Already Compromised:

1. Immediately revoke all exposed API keys and tokens
2. Check for any unauthorized access in Google Calendar, Supabase, etc.
3. Regenerate all credentials before deploying
4. Consider enabling 2FA on all connected services
5. Monitor for unusual activity

## Next Steps

After setting up environment variables, run the application:

```bash
npm run dev
```

Verify all integrations work:
- [ ] Booking form loads available dates
- [ ] Admin login works with new password
- [ ] Email confirmations send (if Resend API key configured)
- [ ] Calendar events create successfully