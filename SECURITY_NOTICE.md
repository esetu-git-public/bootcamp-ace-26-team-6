# Security Notice

## ⚠️ Compromised Secrets

The file `backend/.env` was previously committed to git and contains **compromised secrets**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (service role key - full database access)
- `SUPABASE_ANON_KEY` (anon key)
- `JWT_SECRET` (used for signing access tokens)

## Required Actions

### 1. Immediately Rotate All Compromised Secrets

**Supabase Dashboard → Settings → API:**
- Regenerate **Service Role Key** (Project Settings → API → Project API keys)
- Regenerate **Anon/Public Key** if needed

**Supabase Dashboard → Authentication → Settings:**
- Rotate **JWT Secret** (JWT Secret → Rotate Secret)

### 2. Update Local Environment

```bash
cp backend/.env.exp backend/.env
# Edit backend/.env with new values from Supabase Dashboard
```

### 3. Verify No Secrets in Git History

```bash
# Check if secrets appear in git history
git log --all --full-history -- backend/.env

# If found, consider using git-filter-repo or BFG Repo-Cleaner to purge
```

### 4. Review Access Logs

Check Supabase Dashboard → Logs for any unauthorized access using the old keys.

---

## Security Best Practices Going Forward

1. **Never commit `.env` files** - Already in `.gitignore`
2. **Use different keys per environment** (dev/staging/prod)
3. **Rotate keys periodically** (every 90 days recommended)
4. **Use Supabase RLS policies** to limit data access
5. **Monitor audit logs** for suspicious activity