# WILCY POS — Fix Summary

---

## 🔴 Root Cause: The Modal Bug

The **Change Password modal** was showing only the dark backdrop overlay but **no modal content**. Here is exactly why:

### What happened
`login.html` had a `<style>` block that re-declared these classes:
```
.modal-overlay  →  display: flex  (inline CSS)
.modal-header   →  display: flex
.modal-close    →  display: flex
.modal-body     →  padding: 24px
.modal-footer   →  display: flex, background: #f9fafb
```

But `style.css` controls modal **visibility** this way:
```css
.modal-overlay              { opacity: 0; pointer-events: none; }
.modal-overlay.open         { opacity: 1; pointer-events: all;  }
.modal-overlay.open .modal  { transform: scale(1) translateY(0); }
```

The inline CSS from `login.html` **overrode** `style.css` — because inline `<style>` blocks in the same document have higher specificity than external stylesheets. This had two effects:

1. `.modal-overlay` was set to `display:flex` by login's inline CSS, so the **backdrop always appeared** even without `.open`.
2. `.modal-footer` got `background: #f9fafb` (white) from the inline CSS but `style.css` uses dark CSS variables — so on the dark-themed app the footer was invisible.
3. The dynamically created modal was appended **without** the `.open` class, so `style.css`'s `opacity:0` hid the inner content even though the overlay rendered.

### Fix
1. **Removed all conflicting modal CSS from `login.html`** — only kept the login-page-specific `.forgot-password` styles that don't exist in `style.css`.
2. **`openChangePasswordModal()` now creates the modal with class `"modal-overlay open"`** so it appears immediately, consistent with how `app.js` and `inventory.js` open modals.
3. **Used `style.css` CSS variables** (`var(--red-lt)`, `var(--green)`, etc.) for inline error/success message styles inside the modal.

---

## 🗄️ Database Fixes (`schema.sql`)

### Problems
- No `user_accounts` table existed in Supabase.
- No `change_user_password` RPC function existed.
- The auth.js password change flow was calling an endpoint that returned 404.
- `USE user_accounts` was in the original comments — this is MySQL syntax. PostgreSQL does not support it.

### Fixes
1. **Created `user_accounts` table** with `id`, `username`, `password_hash`, `role`, `display_name`, `created_at`, `updated_at`.
2. **Passwords stored as SHA-256 hex** using PostgreSQL's `pgcrypto` extension (`digest(password, 'sha256')`). Never stored in plaintext.
3. **Created `change_user_password(p_username, p_old_password, p_new_password)`** RPC function that:
   - Looks up the user
   - Hashes and compares the old password
   - Validates new password length
   - Updates the hash
   - Returns `{ "success": true }` or `{ "success": false, "error": "..." }`
4. **Created `verify_user_password`** RPC (optional, for future Supabase-backed login).
5. **Seeded default users** (`admin`/`admin123`, `cashier`/`pos2024`) using `on conflict do nothing` so running the script twice is safe.
6. **RLS (Row Level Security)** enabled on all tables. `user_accounts` has NO permissive policy — it cannot be read/written directly via REST. Only the `security definer` RPC functions can touch it.
7. **Pure PostgreSQL syntax** — no `USE`, no `SHOW DATABASES`, no MySQL-isms.

---

## ⚙️ `supabase.js` Fix

### Problem
```js
// ORIGINAL — always false!
const USE_SUPABASE = SUPABASE_URL !== 'https://uqicigxxfgtxxrlyuygm.supabase.co'
  + 'https://uqicigxxfgtxxrlyuygm.supabase.co';
//                   ↑ string concatenation makes this a doubled URL
//                     so USE_SUPABASE was ALWAYS false
```
This meant Supabase was **never activated** even with valid credentials — the app always ran in local-only mode and never wrote to the database.

### Fix
```js
const PLACEHOLDER_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const USE_SUPABASE = SUPABASE_URL !== PLACEHOLDER_URL && SUPABASE_URL.includes('supabase.co');
```

### Problem 2 — Duplicate `const` declarations
Both `auth.js` and `supabase.js` declared `const SUPABASE_URL` and `const SUPABASE_KEY`. Since both scripts are loaded on `index.html`, `inventory.html`, and `history.html`, this caused a `SyntaxError: Identifier already declared` in the browser console, crashing both files.

### Fix
`auth.js` now assigns to `window.WILCY_SUPABASE_URL` and `window.WILCY_SUPABASE_KEY`. `supabase.js` reads from those globals. No duplicate declarations.

---

## 🔐 `auth.js` Fixes

| # | Problem | Fix |
|---|---------|-----|
| 1 | Modal created without `.open` class — content invisible | Now created with `class="modal-overlay open"` |
| 2 | Modal used `<div class="modal-body">` which login.html's inline CSS styled incorrectly | Removed `modal-body` wrapper, laid out content directly inside `.modal` |
| 3 | `SUPABASE_URL` / `SUPABASE_KEY` const conflict with supabase.js | Moved to `window.WILCY_SUPABASE_URL` / `window.WILCY_SUPABASE_KEY` |
| 4 | Error message from RPC not surfaced clearly | `changePasswordSupabase()` now reads `data.error` from the RPC JSON response |
| 5 | Local `USERS` array not updated after password change | After successful change, the in-memory `USERS` entry is patched so subsequent login attempts work without a reload |

---

## 📁 Files Changed

| File | Status | Changes |
|------|--------|---------|
| `login.html` | ✅ Fixed | Removed conflicting `<style>` block (modal CSS) |
| `auth.js` | ✅ Fixed | Modal open fix, global vars, RPC error handling |
| `supabase.js` | ✅ Fixed | USE_SUPABASE logic, no duplicate const declarations |
| `schema.sql` | ✅ New | Full PostgreSQL schema with user_accounts + RPC functions |
| `app.js` | ✔ Unchanged | No bugs found |
| `inventory.js` | ✔ Unchanged | No bugs found |
| `history.js` | ✔ Unchanged | No bugs found |
| `index.html` | ✔ Unchanged | No bugs found |
| `inventory.html` | ✔ Unchanged | No bugs found |
| `history.html` | ✔ Unchanged | No bugs found |
| `style.css` | ✔ Unchanged | Modal CSS was correct; conflict was in login.html |
| `sw.js` | ✔ Unchanged | No bugs found |

---

## 🚀 Deployment Steps

1. Open **Supabase Dashboard → SQL Editor → New Query**
2. Paste the entire `schema.sql` and click **Run**
3. Replace your project files with the fixed versions
4. Verify the sync badge shows **"Supabase"** (not "Local") on the dashboard

---

## ⚠️ Security Note
Your publishable key was shared in this conversation. It's safe for frontend use (it's the anon/public key), but consider rotating it in **Supabase Dashboard → Settings → API → Regenerate** as a precaution since it was posted publicly.
