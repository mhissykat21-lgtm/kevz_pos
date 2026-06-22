// ─── WILCY POS — auth.js ──────────────────────────────────────────────────────

const AUTH_KEY     = 'wilcy_session';
const IDLE_MINUTES = 15;
const WARN_SECONDS = 60;

// ── SUPABASE CONFIG ───────────────────────────────────────────────────────────
window.WILCY_SUPABASE_URL = 'https://uqicigxxfgtxxrlyuygm.supabase.co';
window.WILCY_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaWNpZ3h4Zmd0eHhybHl1eWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NjA4OTAsImV4cCI6MjA5MzIzNjg5MH0.6VGStCwF0K9zMLlTcgqpdLHTkUP7bEIZtY-wo8wx6o8';

// ── LOCAL FALLBACK (used ONLY when Supabase is unreachable) ──────────────────
// These are never checked when Supabase is online — the RPC is the source of truth.
const LOCAL_FALLBACK_USERS = [
  { username: 'admin',   password: 'admin123', role: 'Admin',   display: 'Administrator' },
  { username: 'cashier', password: 'pos2024',  role: 'Cashier', display: 'Cashier'       },
];

// ── SESSION ──────────────────────────────────────────────────────────────────

function getSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setSession(user) {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify({
    username: user.username,
    role:     user.role,
    display:  user.display,
    loginAt:  Date.now(),
  }));
}

function clearSession() {
  sessionStorage.removeItem(AUTH_KEY);
}

function requireAuth() {
  const session = getSession();
  if (!session) { window.location.href = 'login.html'; return null; }
  return session;
}

// ── LOGIN HELPERS ────────────────────────────────────────────────────────────

function showLoginError(msg) {
  const el = document.getElementById('loginError');
  if (el) { el.textContent = msg; el.style.display = 'flex'; }
}

function togglePw() {
  const inp = document.getElementById('loginPass');
  const btn = document.getElementById('pwToggle');
  if (!inp) return;
  inp.type        = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

// ── LOGIN — checks Supabase first, falls back to local only if offline ────────

async function doLogin() {
  const username = document.getElementById('loginUser')?.value.trim();
  const password = document.getElementById('loginPass')?.value;

  if (!username || !password) {
    showLoginError('Please enter both username and password.');
    return;
  }

  // Disable button while we check
  const btn = document.querySelector('.login-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }

  try {
    // ── 1. Try Supabase RPC first (always the source of truth) ────────────────
    const result = await verifyPasswordSupabase(username, password);

    if (result.online) {
      // Supabase responded
      if (result.success) {
        setSession({
          username: result.username,
          role:     result.role,
          display:  result.display_name,
        });
        window.location.href = 'index.html';
      } else {
        showLoginError(result.error || 'Invalid username or password.');
        document.getElementById('loginPass').value = '';
        document.getElementById('loginPass').focus();
      }
      return;
    }

    // ── 2. Supabase offline — fall back to local array ─────────────────────
    console.warn('[Auth] Supabase offline, using local fallback');
    const user = LOCAL_FALLBACK_USERS.find(
      u => u.username === username && u.password === password
    );
    if (user) {
      setSession({ username: user.username, role: user.role, display: user.display });
      window.location.href = 'index.html';
    } else {
      showLoginError('Invalid username or password. (Offline mode — using last known credentials)');
      document.getElementById('loginPass').value = '';
      document.getElementById('loginPass').focus();
    }

  } catch (err) {
    showLoginError('An unexpected error occurred. Please try again.');
    console.error('[Auth] doLogin error:', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
  }
}

// ── SUPABASE: verify_user_password RPC ───────────────────────────────────────

async function verifyPasswordSupabase(username, password) {
  try {
    const res = await fetch(
      `${window.WILCY_SUPABASE_URL}/rest/v1/rpc/verify_user_password`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         window.WILCY_SUPABASE_KEY,
          'Authorization': `Bearer ${window.WILCY_SUPABASE_KEY}`,
        },
        body: JSON.stringify({ p_username: username, p_password: password }),
        // 6-second timeout — don't make users wait too long before offline fallback
        signal: AbortSignal.timeout(6000),
      }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // 404 = RPC not deployed yet → tell the caller we're "offline" so it
      // falls through to the local array (temporary until schema is deployed)
      if (res.status === 404) {
        console.warn('[Auth] verify_user_password RPC not found — run add_verify_rpc.sql in Supabase');
        return { online: false };
      }
      return { online: true, success: false, error: data?.message || 'Login failed' };
    }

    return { online: true, ...data };

  } catch (err) {
    // Network error or timeout → treat as offline
    return { online: false };
  }
}

// ── SUPABASE: change_user_password RPC ───────────────────────────────────────

async function changePasswordSupabase(username, currentPassword, newPassword) {
  try {
    const res = await fetch(
      `${window.WILCY_SUPABASE_URL}/rest/v1/rpc/change_user_password`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         window.WILCY_SUPABASE_KEY,
          'Authorization': `Bearer ${window.WILCY_SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          p_username:     username,
          p_old_password: currentPassword,
          p_new_password: newPassword,
        }),
      }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { ok: false, error: data?.message || `HTTP ${res.status}` };
    }
    if (data?.success === true)  return { ok: true };
    if (data?.success === false) return { ok: false, error: data.error || 'Unknown error' };

    return { ok: false, error: 'Unexpected response. Is change_user_password deployed?' };

  } catch (err) {
    return { ok: false, error: 'Network error: ' + err.message };
  }
}

// ── PASSWORD CHANGE MODAL ─────────────────────────────────────────────────────

function openChangePasswordModal() {
  if (document.getElementById('changePasswordModal')) return;

  const modal = document.createElement('div');
  modal.id        = 'changePasswordModal';
  modal.className = 'modal-overlay open';
  modal.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-header">
        <div class="modal-title">🔐 Change Password</div>
        <button class="modal-close" onclick="closeChangePasswordModal()">✕</button>
      </div>

      <div id="cpError"
           style="display:none;background:var(--red-lt);border:1px solid #fca5a5;
                  color:var(--red);padding:12px 16px;border-radius:var(--radius-xs);
                  margin-bottom:14px;font-size:0.875rem;"></div>
      <div id="cpSuccess"
           style="display:none;background:var(--green-lt);border:1px solid #86efac;
                  color:var(--green);padding:12px 16px;border-radius:var(--radius-xs);
                  margin-bottom:14px;font-size:0.875rem;"></div>

      <div class="form-group">
        <label>Current Password</label>
        <input type="password" id="cpCurrent" placeholder="Enter current password" />
      </div>
      <div class="form-group">
        <label>New Password</label>
        <input type="password" id="cpNew" placeholder="Minimum 8 characters"
               oninput="checkPasswordStrength()" />
      </div>
      <div class="form-group">
        <label>Confirm New Password</label>
        <input type="password" id="cpConfirm" placeholder="Repeat new password" />
      </div>

      <div id="pwStrength" style="display:none;margin-bottom:14px;">
        <div style="height:6px;background:var(--surface3);border-radius:3px;
                    overflow:hidden;margin-bottom:6px;">
          <div id="strengthFill"
               style="height:100%;width:0;transition:all .3s;border-radius:3px;"></div>
        </div>
        <span id="strengthText"
              style="font-size:0.75rem;font-weight:600;text-transform:uppercase;
                     letter-spacing:.5px;"></span>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost"   onclick="closeChangePasswordModal()">Cancel</button>
        <button class="btn btn-primary" id="cpSubmit"
                onclick="submitChangePassword()">Change Password</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeChangePasswordModal(); });
  setTimeout(() => document.getElementById('cpCurrent')?.focus(), 80);
}

function closeChangePasswordModal() {
  document.getElementById('changePasswordModal')?.remove();
}

function checkPasswordStrength() {
  const pw   = document.getElementById('cpNew')?.value || '';
  const fill = document.getElementById('strengthFill');
  const text = document.getElementById('strengthText');
  const wrap = document.getElementById('pwStrength');
  if (!fill || !text || !wrap) return;
  if (!pw) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  let score = 0;
  if (pw.length >= 8)                        score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw))                         score++;
  if (/[^a-zA-Z\d]/.test(pw))               score++;

  const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
  const pcts   = [20, 40, 60, 80, 100];
  fill.style.width           = pcts[score] + '%';
  fill.style.backgroundColor = colors[score];
  text.textContent           = labels[score];
  text.style.color           = colors[score];
}

async function submitChangePassword() {
  const current   = document.getElementById('cpCurrent')?.value    || '';
  const newPw     = document.getElementById('cpNew')?.value        || '';
  const confirm   = document.getElementById('cpConfirm')?.value    || '';
  const errorEl   = document.getElementById('cpError');
  const successEl = document.getElementById('cpSuccess');
  const submitBtn = document.getElementById('cpSubmit');

  const showErr = msg => {
    errorEl.textContent     = msg;
    errorEl.style.display   = 'block';
    successEl.style.display = 'none';
  };
  errorEl.style.display   = 'none';
  successEl.style.display = 'none';

  if (!current || !newPw || !confirm) return showErr('Please fill in all fields.');
  if (newPw.length < 8)              return showErr('New password must be at least 8 characters.');
  if (newPw !== confirm)             return showErr('Passwords do not match.');
  if (current === newPw)             return showErr('New password must be different from current.');

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Changing…';

  try {
    const session  = getSession();
    const username = session?.username || 'admin';
    const result   = await changePasswordSupabase(username, current, newPw);

    if (result.ok) {
      successEl.textContent   = '✓ Password changed successfully!';
      successEl.style.display = 'block';
      document.getElementById('cpCurrent').value = '';
      document.getElementById('cpNew').value     = '';
      document.getElementById('cpConfirm').value = '';
      document.getElementById('pwStrength').style.display = 'none';

      // Also update the local fallback so offline mode uses the new password
      const localUser = LOCAL_FALLBACK_USERS.find(u => u.username === username);
      if (localUser) localUser.password = newPw;

      setTimeout(() => {
        closeChangePasswordModal();
        if (typeof toast === 'function') toast('Password changed successfully! 🔐', 'success');
      }, 1800);
    } else {
      showErr(result.error || 'Failed to change password. Check your current password.');
    }
  } catch (err) {
    showErr('An error occurred: ' + err.message);
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Change Password';
  }
}

// ── IDLE TIMER ───────────────────────────────────────────────────────────────

let idleTimer   = null;
let warnTimer   = null;
let warnVisible = false;
const IDLE_MS   = IDLE_MINUTES * 60 * 1000;
const WARN_MS   = (IDLE_MINUTES * 60 - WARN_SECONDS) * 1000;

function resetIdle() {
  clearTimeout(idleTimer);
  clearTimeout(warnTimer);
  if (warnVisible) hideIdleWarning();
  warnTimer = setTimeout(showIdleWarning, WARN_MS);
  idleTimer = setTimeout(forceLogout,     IDLE_MS);
}

function showIdleWarning() {
  warnVisible = true;
  if (document.getElementById('idleWarning')) return;
  const div = document.createElement('div');
  div.id        = 'idleWarning';
  div.className = 'idle-warning';
  div.innerHTML = `
    <div class="idle-warning-inner">
      <div class="idle-ico">⏱</div>
      <div>
        <strong>Still there?</strong>
        <p>You'll be signed out in <span id="idleCountdown">${WARN_SECONDS}</span>s due to inactivity.</p>
      </div>
      <button class="btn btn-primary btn-sm" onclick="stayActive()">Stay signed in</button>
    </div>`;
  document.body.appendChild(div);
  let count = WARN_SECONDS;
  const interval = setInterval(() => {
    count--;
    const el = document.getElementById('idleCountdown');
    if (el) el.textContent = count;
    if (count <= 0) clearInterval(interval);
  }, 1000);
  div._interval = interval;
}

function hideIdleWarning() {
  warnVisible = false;
  const el = document.getElementById('idleWarning');
  if (el) { clearInterval(el._interval); el.remove(); }
}

function stayActive()  { resetIdle(); }

function forceLogout() {
  clearSession();
  window.location.href = 'login.html?reason=idle';
}

function doLogout() {
  clearSession();
  window.location.href = 'login.html';
}

function initIdleTimer() {
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(ev => {
    document.addEventListener(ev, resetIdle, { passive: true });
  });
  resetIdle();
}

// ── HEADER USER CHIP ─────────────────────────────────────────────────────────

function renderUserChip(session) {
  const wrap = document.getElementById('userChip');
  if (!wrap || !session) return;
  wrap.innerHTML = `
    <div class="user-chip">
      <div class="user-avatar">${escHtml(session.display[0])}</div>
      <div class="user-info">
        <span class="user-name">${escHtml(session.display)}</span>
        <span class="user-role">${escHtml(session.role)}</span>
      </div>
      <button class="user-chip-btn" onclick="openChangePasswordModal()" title="Change password">🔐</button>
      <button class="logout-btn"    onclick="doLogout()" title="Sign out">⏻</button>
    </div>`;
}

// ── BOOT ─────────────────────────────────────────────────────────────────────

function bootAuth() {
  const onLoginPage = window.location.pathname.endsWith('login.html');

  if (onLoginPage) {
    if (getSession()) { window.location.href = 'index.html'; return; }

    const params = new URLSearchParams(window.location.search);
    if (params.get('reason') === 'idle') {
      const show = () => showLoginError('You were signed out due to inactivity.');
      document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', show)
        : show();
    }

    const bindKeys = () => {
      document.getElementById('loginPass')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
      });
      document.getElementById('loginUser')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('loginPass')?.focus();
      });
    };
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', bindKeys)
      : bindKeys();
    return;
  }

  const session = requireAuth();
  if (!session) return;

  const setup = () => {
    renderUserChip(session);
    initIdleTimer();
    window.currentSession = session;
    if (session.role !== 'Admin') {
      document.querySelectorAll('[data-role="admin"]').forEach(el => {
        el.style.display = 'none';
      });
    }
  };

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', setup)
    : setup();
}

// ── SHARED HELPERS ────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg, type = 'success') {
  const icons = { success: '✓', error: '✕', warn: '⚠' };
  const el    = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="t-icon">${icons[type] || '•'}</span><span>${msg}</span>`;
  document.getElementById('toastContainer')?.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

bootAuth();
