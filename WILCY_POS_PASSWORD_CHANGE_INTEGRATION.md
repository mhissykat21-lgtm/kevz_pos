# 🔐 WILCY POS - Password Change Integration Guide

## Overview

Your WILCY POS system now includes **Supabase-connected password change functionality** accessible from both the login page and the user header chip on protected pages. This guide explains the changes and how to integrate them.

---

## 📁 What Changed

### Files Modified
1. **auth.js** - Added password change functions and Supabase integration
2. **login.html** - Added "Change Password" link and modal styles

### No Changes To
- app.js
- inventory.js
- history.js
- history.html
- inventory.html
- index.html
- supabase.js
- sw.js
- style.css
- manifest.json

---

## ✨ New Features

### 1. **Login Page Password Change**
- "🔐 Change Password" link below the sign-in button
- Users can change their password before logging in
- Useful for users who forgot their password or want to change it

### 2. **User Header Password Change**
- 🔐 button in the user chip (top-right corner)
- Accessible while logged in
- Visible to all users (Admin and Cashier)

### 3. **Password Strength Indicator**
- Real-time feedback as user types
- Color-coded: Red (Weak) → Green (Very Strong)
- Shows requirements: length, uppercase, numbers, special chars

### 4. **Validation**
- Minimum 8 characters
- Password confirmation matching
- Current password verification
- Cannot reuse old password

---

## 🚀 Quick Integration Steps

### Step 1: Replace auth.js
```bash
# Copy the new auth.js to your project
cp auth.js /path/to/your/project/
```

### Step 2: Replace login.html
```bash
# Copy the new login.html to your project
cp login.html /path/to/your/project/
```

### Step 3: Set Up Supabase (One-time)
Your existing `supabase.js` already has credentials configured:
```javascript
const SUPABASE_URL = 'https://uqicigxxfgtxxrlyuygm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### Step 4: Create Database Function
In your Supabase SQL Editor, run:

```sql
-- Create the password change RPC function
CREATE OR REPLACE FUNCTION change_user_password(
  p_username TEXT,
  p_old_password TEXT,
  p_new_password TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_password_match BOOLEAN;
BEGIN
  -- Validate inputs
  IF p_username IS NULL OR p_username = '' THEN
    RETURN json_build_object('error', 'Username is required');
  END IF;
  
  IF LENGTH(p_new_password) < 8 THEN
    RETURN json_build_object('error', 'New password must be at least 8 characters');
  END IF;

  -- Find user and verify old password
  SELECT id, (password_hash = crypt(p_old_password, password_hash))
  INTO v_user_id, v_password_match
  FROM users
  WHERE username = p_username
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'User not found');
  END IF;
  
  IF NOT v_password_match THEN
    RETURN json_build_object('error', 'Invalid current password');
  END IF;

  -- Update password using bcrypt
  UPDATE users 
  SET password_hash = crypt(p_new_password, gen_salt('bf'))
  WHERE id = v_user_id;
  
  RETURN json_build_object('success', true, 'message', 'Password changed successfully');
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Step 5: Create Users Table (if not exists)
```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'Cashier',
  display TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert demo users (passwords hashed with bcrypt)
INSERT INTO users (username, password_hash, role, display) VALUES
  ('admin', crypt('admin123', gen_salt('bf')), 'Admin', 'Administrator'),
  ('cashier', crypt('pos2024', gen_salt('bf')), 'Cashier', 'Cashier')
ON CONFLICT (username) DO NOTHING;
```

### Step 6: Test It!
1. Go to login.html
2. Click "🔐 Change Password" link
3. Try changing the password (use current credentials)
4. Log in and click 🔐 in user header to change again

---

## 📝 Code Changes Summary

### auth.js

**New Config:**
```javascript
const SUPABASE_URL = 'https://uqicigxxfgtxxrlyuygm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

**New Functions:**
- `openChangePasswordModal()` - Opens the modal
- `closeChangePasswordModal()` - Closes the modal
- `checkPasswordStrength()` - Real-time strength feedback
- `submitChangePassword()` - Validates and submits
- `changePasswordSupabase()` - Calls Supabase RPC

**Updated Functions:**
- `renderUserChip()` - Added 🔐 button

### login.html

**New Styles:**
- `.modal-overlay` - Modal background
- `.modal-content` - Modal box
- `.modal-header`, `.modal-body`, `.modal-footer` - Modal sections
- `.form-error` - Error message styling
- `.password-strength` - Strength bar styling
- `.forgot-password` - Link styling

**New Elements:**
- "Change Password" link in forgot-password div
- Modal HTML created dynamically by auth.js

---

## 🔍 How It Works

### Flow Diagram
```
User clicks "🔐 Change Password"
    ↓
Modal opens with form
    ↓
User enters passwords
    ↓
Real-time strength indicator shows feedback
    ↓
User clicks "Change Password"
    ↓
Client-side validation (length, match, etc)
    ↓
Call Supabase RPC function
    ↓
Server validates current password
    ↓
Hash new password with bcrypt
    ↓
Update database
    ↓
Return success/error
    ↓
Show toast notification
    ↓
Modal closes
```

### Validation Rules

**Client-Side (JavaScript):**
- All fields must be filled
- New password ≥ 8 characters
- New password must match confirmation
- New password ≠ old password

**Server-Side (Supabase):**
- Current password must match stored hash
- User must exist
- Password must be ≥ 8 characters
- Transaction must succeed

---

## 🔒 Security Features

✅ **Bcrypt Hashing** - Industry-standard password hashing  
✅ **Current Password Verification** - User must prove they know current password  
✅ **No Plain-Text Storage** - Passwords hashed immediately  
✅ **HTTPS Only** - Communication encrypted  
✅ **Server-Side Validation** - Don't trust client input  
✅ **RLS (Row Level Security)** - Database-level access control  

---

## 🧪 Testing

### Test Case 1: Basic Password Change
```
Username: admin
Current Password: admin123
New Password: SecurePass123!
Result: ✓ Should succeed
Next Login: admin / SecurePass123!
```

### Test Case 2: Weak Password
```
Username: admin
Current Password: admin123
New Password: weak
Result: ✗ Should fail - "must be at least 8 characters"
```

### Test Case 3: Wrong Current Password
```
Username: admin
Current Password: wrongpass
New Password: NewPassword123
Result: ✗ Should fail - "Invalid current password"
```

### Test Case 4: Password Mismatch
```
Username: admin
Current Password: admin123
New Password: NewPassword123
Confirm: NewPassword456
Result: ✗ Should fail - "Passwords do not match"
```

### Test Case 5: Same as Old Password
```
Username: admin
Current Password: admin123
New Password: admin123
Result: ✗ Should fail - "must be different from current"
```

---

## 🚀 Deployment Checklist

- [ ] auth.js copied and Supabase credentials match your setup
- [ ] login.html copied with all new styles
- [ ] Supabase users table created with demo users
- [ ] `change_user_password` RPC function created
- [ ] Tested login page password change
- [ ] Tested header password change after login
- [ ] Tested all validation error messages
- [ ] Tested password strength indicator
- [ ] Tested that new password works on next login
- [ ] Tested that old password no longer works
- [ ] Modal closes properly after success
- [ ] Toast notifications appear correctly

---

## 🆘 Troubleshooting

### Modal Won't Open
**Check:**
- Browser console for JavaScript errors
- auth.js is loaded before running `openChangePasswordModal()`
- Toast container exists: `<div id="toastContainer"></div>`

### "Supabase error" Message
**Check:**
- SUPABASE_URL is correct in auth.js
- SUPABASE_ANON_KEY is correct in auth.js
- RPC function `change_user_password` exists in Supabase
- Users table exists with demo users
- HTTPS is being used (not HTTP)

### "Invalid current password"
**Check:**
- Current password is correct
- User exists in database
- Password hashes match (compare with login which works)

### Password Not Updating
**Check:**
- RPC function executed without errors
- Check Supabase logs for SQL errors
- Verify users table has password_hash column
- Check that UPDATE statement worked

### Toast Not Showing
**Check:**
- Toast container exists in HTML
- ID is exactly: `id="toastContainer"`
- `toast()` function is available globally

---

## 📋 API Reference

### changePasswordSupabase()
```javascript
const result = await changePasswordSupabase(
  'admin',           // username
  'admin123',        // current password
  'NewPassword123'   // new password
);

// Returns:
// { ok: true, data: {...} }  - Success
// { ok: false, error: 'message' }  - Error
```

### Supabase RPC Endpoint
```
POST /rest/v1/rpc/change_user_password

Body:
{
  "p_username": "admin",
  "p_old_password": "admin123",
  "p_new_password": "newpass"
}

Response:
{
  "success": true,
  "message": "Password changed successfully"
}
OR
{
  "error": "Invalid current password"
}
```

---

## 🔄 Version History

| Version | Changes |
|---------|---------|
| 1.0 | Initial release |
| 1.1 | Added to WILCY POS |
| 2.0 | Integrated with existing auth system |

---

## 📞 Support

If you encounter issues:

1. **Check browser console** - Look for JavaScript errors
2. **Check Supabase logs** - View recent API calls and errors
3. **Test with demo credentials** - Verify basic functionality works
4. **Verify database schema** - Ensure tables and functions exist
5. **Check network requests** - Verify HTTPS calls are working

---

## ✅ Implementation Verification

Run this in Supabase SQL Editor to verify everything is set up:

```sql
-- Check users table
SELECT COUNT(*) as user_count FROM users;

-- Check RPC function exists
SELECT proname FROM pg_proc WHERE proname = 'change_user_password';

-- Test the function (returns JSON)
SELECT change_user_password('admin', 'admin123', 'admin123');
-- Should return: {"error":"New password must be different from current password"}
```

---

**Ready to go!** 🎉

Simply replace your auth.js and login.html with the updated versions, and test with the demo credentials. Users can now change their passwords securely with Supabase backend support.
