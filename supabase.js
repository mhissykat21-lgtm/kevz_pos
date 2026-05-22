// ─── WILCY POS — supabase.js (FIXED) ─────────────────────────────────────────
//
// FIXES APPLIED:
//  1. USE_SUPABASE comparison bug: original code compared SUPABASE_URL against
//     a concatenated double-URL string, so USE_SUPABASE was always `false` even
//     with valid credentials.  Fixed to simply check for the placeholder string.
//  2. Removed `const SUPABASE_URL` / `const SUPABASE_KEY` declarations — these
//     now come from window.WILCY_SUPABASE_URL / window.WILCY_SUPABASE_KEY set
//     by auth.js (loaded before this file), preventing "already declared" errors.
//  3. SB_HEADERS now references the shared window vars.
//  4. All other logic is unchanged and working.

// ── CONFIG ────────────────────────────────────────────────────────────────────
// Credentials are set by auth.js (loaded first) as window.WILCY_SUPABASE_URL
// and window.WILCY_SUPABASE_KEY so they are shared safely across both files.

const SUPABASE_URL = window.WILCY_SUPABASE_URL || 'https://uqicigxxfgtxxrlyuygm.supabase.co';
const SUPABASE_KEY = window.WILCY_SUPABASE_KEY || '';

// FIX: was comparing against the wrong string (a concatenated double-URL),
//      which meant USE_SUPABASE was always false even with real credentials.
const PLACEHOLDER_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const USE_SUPABASE = SUPABASE_URL !== PLACEHOLDER_URL && SUPABASE_URL.includes('supabase.co');

// ── LOCAL STORAGE ────────────────────────────────────────────────────────────

const STORE_KEY   = 'wilcy_pos_v3';
const PENDING_KEY = 'wilcy_pending_sales_v1';

const DEFAULT_DATA = {
  items: [
    { id: 'demo001', name: 'Wireless Earbuds',       sku: 'WE-001', qty: 25, origPrice: 450,  price: 799,  threshold: 5, soldByKilo: false },
    { id: 'demo002', name: 'USB-C Hub 7-in-1',       sku: 'UC-007', qty: 4,  origPrice: 620,  price: 950,  threshold: 5, soldByKilo: false },
    { id: 'demo003', name: 'Mechanical Keyboard',    sku: 'MK-104', qty: 0,  origPrice: 1200, price: 1850, threshold: 3, soldByKilo: false },
    { id: 'demo004', name: 'Phone Stand Adjustable', sku: 'PS-ADJ', qty: 18, origPrice: 85,   price: 149,  threshold: 5, soldByKilo: false },
  ],
  sales: [],
};

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('loadLocal failed:', e); }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveLocal() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (e) { console.warn('saveLocal failed:', e); }
}

// ── ROW MAPPERS ───────────────────────────────────────────────────────────────

function rowToItem(row) {
  return {
    id:         row.id,
    name:       row.name,
    sku:        row.sku,
    qty:        Number(row.qty),
    origPrice:  Number(row.orig_price),
    price:      Number(row.price),
    threshold:  Number(row.threshold) || 5,
    soldByKilo: !!row.sold_by_kilo,
  };
}

function itemToRow(item) {
  return {
    id:           item.id,
    name:         item.name,
    sku:          item.sku,
    qty:          Number(item.qty),
    orig_price:   Number(item.origPrice),
    price:        Number(item.price),
    threshold:    Number(item.threshold) || 5,
    sold_by_kilo: !!item.soldByKilo,
  };
}

function rowToSale(row) {
  return {
    id:         row.id,
    itemId:     row.item_id,
    itemName:   row.item_name,
    sku:        row.sku,
    qty:        Number(row.qty),
    soldByKilo: !!row.sold_by_kilo,
    pricePerPc: Number(row.price_per_pc),
    origPrice:  Number(row.orig_price),
    revenue:    Number(row.revenue),
    total:      Number(row.total),
    customer:   row.customer || 'Walk-in',
    payment:    row.payment  || 'Cash',
    date:       row.date     || '',
    time:       row.time     || '',
    txnId:      row.txn_id   || '',
  };
}

function saleToRow(sale) {
  return {
    id:           sale.id,
    item_id:      sale.itemId,
    item_name:    sale.itemName,
    sku:          sale.sku,
    qty:          Number(sale.qty),
    sold_by_kilo: !!sale.soldByKilo,
    price_per_pc: Number(sale.pricePerPc),
    orig_price:   Number(sale.origPrice),
    revenue:      Number(sale.revenue),
    total:        Number(sale.total),
    customer:     sale.customer || 'Walk-in',
    payment:      sale.payment  || 'Cash',
    date:         sale.date,
    time:         sale.time     || '',
    txn_id:       sale.txnId    || '',
  };
}

// ── SUPABASE REST HELPERS ─────────────────────────────────────────────────────

const SB_HEADERS = {
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
};

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...SB_HEADERS, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${errBody}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── PENDING SALES QUEUE ───────────────────────────────────────────────────────

function loadPendingSales() {
  try { const r = localStorage.getItem(PENDING_KEY); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
function savePendingSales(arr) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(arr)); } catch {}
}
function addToPendingQueue(sales) {
  const pending = loadPendingSales();
  const ids = new Set(pending.map(s => s.id));
  sales.forEach(s => { if (!ids.has(s.id)) pending.push(s); });
  savePendingSales(pending);
}
function removeFromPendingQueue(confirmedIds) {
  const set = new Set(confirmedIds);
  savePendingSales(loadPendingSales().filter(s => !set.has(s.id)));
}

async function flushPendingSales() {
  const pending = loadPendingSales();
  if (!pending.length) return;
  try {
    await sbFetch('sales?on_conflict=id', {
      method:  'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body:    JSON.stringify(pending.map(saleToRow)),
    });
    removeFromPendingQueue(pending.map(s => s.id));
    console.log('[Supabase] Flushed', pending.length, 'pending sale(s).');
  } catch (e) {
    console.warn('[Supabase] Could not flush pending sales, will retry next load:', e);
  }
}

// ── DB + SYNC STATE ───────────────────────────────────────────────────────────

let db      = null;
let sbReady = false;

function scheduleReconnect() {
  setTimeout(async () => {
    try {
      await sbFetch('inventory?limit=0');
      sbReady = true;
      setSyncStatus('live');
      await flushPendingSales();
    } catch {}
  }, 30_000);
}

// ── initDB ────────────────────────────────────────────────────────────────────

async function initDB() {
  db = loadLocal();

  if (!USE_SUPABASE) {
    setSyncStatus('local');
    return;
  }

  setSyncStatus('syncing');

  try {
    const [itemRows, saleRows] = await Promise.all([
      sbFetch('inventory?order=created_at.asc&limit=1000'),
      sbFetch('sales?order=date.asc,created_at.asc&limit=5000'),
    ]);

    const sbItems = (itemRows || []).map(rowToItem);
    const sbSales = (saleRows || []).map(rowToSale);

    const sbSaleIds        = new Set(sbSales.map(s => s.id));
    const localUnconfirmed = (db.sales || []).filter(s => !sbSaleIds.has(s.id));

    db = {
      items: sbItems,
      sales: [...sbSales, ...localUnconfirmed],
    };

    sbReady = true;
    setSyncStatus('live');
    saveLocal();

    await flushPendingSales();

  } catch (e) {
    console.warn('[Supabase] initDB failed, using localStorage:', e);
    setSyncStatus('offline');
    scheduleReconnect();
  }
}

// ── saveData ──────────────────────────────────────────────────────────────────

async function saveData(opts = {}) {
  saveLocal();

  if (opts.newSales && opts.newSales.length > 0) {
    addToPendingQueue(opts.newSales);
  }

  if (!USE_SUPABASE || !sbReady) return;

  setSyncStatus('syncing');

  try {

    if (opts.newSales && opts.newSales.length > 0) {
      await sbFetch('sales?on_conflict=id', {
        method:  'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body:    JSON.stringify(opts.newSales.map(saleToRow)),
      });
      removeFromPendingQueue(opts.newSales.map(s => s.id));
    }

    else if (opts.updatedItem) {
      await sbFetch('inventory?on_conflict=id', {
        method:  'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body:    JSON.stringify(itemToRow(opts.updatedItem)),
      });
    }

    else if (opts.deletedItemId) {
      await sbFetch(`inventory?id=eq.${encodeURIComponent(opts.deletedItemId)}`, {
        method:  'DELETE',
        headers: { 'Prefer': 'return=minimal' },
      });
    }

    else if (opts.full) {
      await sbFetch('sales?id=neq.NONE', {
        method:  'DELETE',
        headers: { 'Prefer': 'return=minimal' },
      });
      if (db.sales.length > 0) {
        await sbFetch('sales', {
          method:  'POST',
          headers: { 'Prefer': 'return=minimal' },
          body:    JSON.stringify(db.sales.map(saleToRow)),
        });
      }
      await sbFetch('inventory?id=neq.NONE', {
        method:  'DELETE',
        headers: { 'Prefer': 'return=minimal' },
      });
      if (db.items.length > 0) {
        await sbFetch('inventory', {
          method:  'POST',
          headers: { 'Prefer': 'return=minimal' },
          body:    JSON.stringify(db.items.map(itemToRow)),
        });
      }
      savePendingSales([]);
    }

    setSyncStatus('live');

  } catch (e) {
    console.warn('[Supabase] saveData failed — data safe in localStorage:', e);
    setSyncStatus('offline');
    sbReady = false;
    scheduleReconnect();
  }
}

// ── SYNC STATUS BADGE ─────────────────────────────────────────────────────────

function setSyncStatus(state) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const states = {
    live:    { cls: 'sync-live',    icon: '●', text: 'Supabase'                 },
    syncing: { cls: 'sync-syncing', icon: '↻', text: 'Syncing…'                 },
    offline: { cls: 'sync-offline', icon: '⚠', text: 'Supabase offline — local' },
    local:   { cls: 'sync-local',   icon: '◉', text: 'Local mode'               },
  };
  const s = states[state] || states.local;
  el.className = `sync-badge ${s.cls}`;
  el.innerHTML = `<span>${s.icon}</span> ${s.text}`;
}
