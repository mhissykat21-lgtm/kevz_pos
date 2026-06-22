// ─── WILCY POS — app.js (Dashboard) ──────────────────────────────────────────

let cart = [];  // [{ itemId, name, sku, qty, price, origPrice, soldByKilo }]

// ── HELPERS ───────────────────────────────────────────────────────────────────

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n) {
  return '₱' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  const el = document.getElementById('dateBadge');
  if (el) el.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });

  await initDB();
  renderSalesLog();
  renderLowStockAlert();
  bindEvents();
  onPaymentChange();

  // Handle ?addToCart=itemId coming from inventory.html
  const params = new URLSearchParams(window.location.search);
  const addId  = params.get('addToCart');
  if (addId) {
    history.replaceState({}, '', window.location.pathname);
    addItemToCartById(addId);
  }
}

// ── LOW STOCK ALERT ───────────────────────────────────────────────────────────

function renderLowStockAlert() {
  const strip = document.getElementById('lowStockAlert');
  if (!strip) return;
  const low = db.items.filter(i => i.qty > 0 && i.qty <= (i.threshold || 5));
  const out = db.items.filter(i => i.qty === 0);
  if (!low.length && !out.length) { strip.style.display = 'none'; return; }
  const parts = [];
  if (out.length) parts.push(`<strong>${out.length} item${out.length !== 1 ? 's' : ''} out of stock</strong>`);
  if (low.length) parts.push(`${low.length} item${low.length !== 1 ? 's' : ''} running low`);
  strip.innerHTML = `<span class="alert-ico">⚠</span> ${parts.join(' · ')} — 
    ${[...out, ...low].slice(0, 4).map(i => `<em>${escHtml(i.name)}</em>`).join(', ')}
    ${(out.length + low.length) > 4 ? ` and ${(out.length + low.length) - 4} more` : ''}
    &nbsp;·&nbsp; <a href="inventory.html" style="color:inherit;text-decoration:underline;">Manage Inventory →</a>`;
  strip.style.display = 'flex';
}

// ── ITEM SEARCH DROPDOWN ──────────────────────────────────────────────────────

function renderItemSearch(query) {
  const resultsEl = document.getElementById('itemResults');
  if (!resultsEl) return;

  const q = (query || '').toLowerCase().trim();

  let matches = q
    ? db.items.filter(i =>
        i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)
      )
    : db.items.slice(0, 20);

  if (!matches.length) {
    resultsEl.innerHTML = `<div class="ir-empty">No items found${q ? ` for "<strong>${escHtml(query)}</strong>"` : ''}.</div>`;
    resultsEl.classList.add('open');
    return;
  }

  resultsEl.innerHTML = matches.map(item => {
    const thresh   = item.threshold || 5;
    const isOut    = item.qty === 0;
    const isLow    = !isOut && item.qty <= thresh;
    const stockCls = isOut ? 'out' : isLow ? 'low' : '';
    const stockLbl = isOut
      ? 'Out of stock'
      : isLow
        ? `⚠ Low (${item.soldByKilo ? Number(item.qty).toFixed(2) + ' kg' : item.qty})`
        : `${item.soldByKilo ? Number(item.qty).toFixed(2) + ' kg' : item.qty} in stock`;

    return `<div class="item-result-row${isOut ? ' disabled' : ''}" onclick="addItemToCartById('${item.id}')">
      <div class="ir-left">
        <div class="ir-name">${escHtml(item.name)}${item.soldByKilo ? ' <span style="font-size:0.7rem;background:var(--accent-lt);color:var(--accent);padding:1px 5px;border-radius:4px;margin-left:4px;">⚖ kg</span>' : ''}</div>
        <div class="ir-sku">${escHtml(item.sku)}</div>
      </div>
      <div class="ir-right">
        <span class="ir-price">${fmt(item.price)} / ${item.soldByKilo ? 'kg' : 'pc'}</span>
        <span class="ir-stock ${stockCls}">${stockLbl}</span>
        <button class="ir-add" onclick="event.stopPropagation();addItemToCartById('${item.id}')" ${isOut ? 'disabled' : ''}>+ Cart</button>
      </div>
    </div>`;
  }).join('');

  resultsEl.classList.add('open');
}

function closeItemSearch() {
  document.getElementById('itemResults')?.classList.remove('open');
}

// ── CART ──────────────────────────────────────────────────────────────────────

function addItemToCartById(id, qty = null) {
  const item = db.items.find(i => i.id === id);
  if (!item) return toast('Item not found.', 'error');
  if (item.qty === 0) return toast(`${escHtml(item.name)} is out of stock.`, 'error');

  if (qty === null) qty = item.soldByKilo ? 0.5 : 1;

  const inCart    = cart.filter(c => c.itemId === id).reduce((a, c) => a + c.qty, 0);
  const available = item.qty - inCart;

  if (qty > available) {
    return toast(
      `Only ${available > 0 ? (item.soldByKilo ? available.toFixed(2) + ' kg' : available) : 'no'} more available.`,
      'error'
    );
  }

  const existing = cart.find(c => c.itemId === id);
  if (existing) {
    existing.qty = Number((existing.qty + qty).toFixed(3)); // avoid float drift
  } else {
    cart.push({
      itemId:      id,
      name:        item.name,
      sku:         item.sku,
      qty,
      price:       item.price,
      origPrice:   item.origPrice,
      soldByKilo:  !!item.soldByKilo
    });
  }

  renderCart();
  const unit = item.soldByKilo ? 'kg' : 'pc';
  toast(`${escHtml(item.name)} × ${qty}${unit} added to cart.`, 'success');

  const inp = document.getElementById('itemSearchInput');
  if (inp) inp.value = '';
  closeItemSearch();
}

function removeFromCart(idx) {
  cart.splice(idx, 1);
  renderCart();
}

function updateCartQty(idx, val) {
  const entry = cart[idx];
  if (!entry) return;
  const item = db.items.find(i => i.id === entry.itemId);
  if (!item) return;

  // While user is still mid-typing — don't act yet
  if (val === '' || val === '.' || val === '-') return;

  const qty = entry.soldByKilo ? parseFloat(val) : parseInt(val, 10);
  if (isNaN(qty) || qty <= 0) return;

  const maxQty    = item.qty;
  cart[idx].qty   = qty > maxQty ? maxQty : qty;
  if (qty > maxQty) toast(`Only ${item.soldByKilo ? maxQty.toFixed(2) + ' kg' : maxQty} in stock.`, 'error');

  // Patch only this row's total — no full DOM rebuild = no focus loss
  const totalEl = document.querySelector(`.cart-item-total[data-idx="${idx}"]`);
  if (totalEl) totalEl.textContent = fmt(cart[idx].qty * cart[idx].price);

  _refreshCartSummary();
}

function finalizeCartQty(idx, inputEl) {
  const entry = cart[idx];
  if (!entry) return;
  const qty = entry.soldByKilo ? parseFloat(inputEl.value) : parseInt(inputEl.value, 10);
  if (!inputEl.value || isNaN(qty) || qty <= 0) {
    removeFromCart(idx);
  } else {
    cart[idx].qty = qty;
    if (entry.soldByKilo) inputEl.value = Number(qty).toFixed(2);
    const totalEl = document.querySelector(`.cart-item-total[data-idx="${idx}"]`);
    if (totalEl) totalEl.textContent = fmt(qty * entry.price);
    _refreshCartSummary();
  }
}

function _refreshCartSummary() {
  const subtotal = cart.reduce((a, c) => a + (c.qty * c.price), 0);
  const revenue  = cart.reduce((a, c) => a + (c.qty * (c.price - c.origPrice)), 0);
  setText('cartSubtotal', fmt(subtotal));
  setText('cartRevenue',  fmt(revenue));
  calcChange();
}

function clearCart() {
  cart = [];
  renderCart();
}

function renderCart() {
  const el    = document.getElementById('cartItems');
  const empty = document.getElementById('cartEmpty');
  const btn   = document.getElementById('checkoutBtn');
  const count = document.getElementById('cartCount');
  if (!el) return;

  if (!cart.length) {
    el.innerHTML = '';
    if (empty) { empty.style.display = 'block'; el.appendChild(empty); }
    if (btn)   btn.disabled = true;
    if (count) count.textContent = '0';
    setText('cartSubtotal', '₱0.00');
    setText('cartRevenue',  '₱0.00');
    return;
  }

  if (empty) empty.style.display = 'none';
  if (btn)   btn.disabled = false;

  const subtotal = cart.reduce((a, c) => a + (c.qty * c.price), 0);
  const revenue  = cart.reduce((a, c) => a + (c.qty * (c.price - c.origPrice)), 0);

  if (count) count.textContent = cart.length;
  setText('cartSubtotal', fmt(subtotal));
  setText('cartRevenue',  fmt(revenue));

  el.innerHTML = cart.map((c, i) => {
    const unit   = c.soldByKilo ? 'kg' : 'pc';
    const step   = c.soldByKilo ? '0.5' : '1';
    const minQty = c.soldByKilo ? '0.5' : '1';
    const qtyVal = c.soldByKilo ? Number(c.qty).toFixed(2) : c.qty;
    return `<div class="cart-row">
      <div class="cart-item-info">
        <div class="cart-item-name">${escHtml(c.name)}${c.soldByKilo ? ' <span class="kilo-tag">⚖ kg</span>' : ''}</div>
        <div class="cart-item-price">${fmt(c.price)} / ${unit}</div>
      </div>
      <input class="cart-qty-input" type="number" min="${minQty}" step="${step}"
        value="${qtyVal}" data-idx="${i}"
        oninput="updateCartQty(${i}, this.value)"
        onblur="finalizeCartQty(${i}, this)" />
      <div class="cart-item-total" data-idx="${i}">${fmt(c.qty * c.price)}</div>
      <button class="cart-remove" onclick="removeFromCart(${i})" title="Remove">✕</button>
    </div>`;
  }).join('');
}

// ── BILL & CHANGE ─────────────────────────────────────────────────────────────

function onPaymentChange() {
  const method = document.getElementById('sellPayment')?.value;
  const row    = document.getElementById('billChangeRow');
  if (!row) return;
  if (method === 'Cash') {
    row.style.display = 'grid';
    calcChange();
  } else {
    row.style.display = 'none';
    const billEl = document.getElementById('billAmount');
    if (billEl) billEl.value = '';
  }
}

function calcChange() {
  const bill     = parseFloat(document.getElementById('billAmount')?.value) || 0;
  const subtotal = cart.reduce((a, c) => a + (c.qty * c.price), 0);
  const display  = document.getElementById('changeDisplay');
  const amountEl = document.getElementById('changeAmount');
  if (!amountEl || !display) return;

  if (bill === 0) {
    amountEl.textContent = '—';
    display.classList.remove('insufficient');
    return;
  }

  const change = bill - subtotal;
  amountEl.textContent = change >= 0 ? fmt(change) : `Short ${fmt(Math.abs(change))}`;
  display.classList.toggle('insufficient', change < 0);
}

// ── CHECKOUT ──────────────────────────────────────────────────────────────────

async function processCartSale() {
  if (!cart.length) return toast('Cart is empty.', 'error');

  const customer = (document.getElementById('sellCustomer')?.value || '').trim() || 'Walk-in';
  const payment  = document.getElementById('sellPayment')?.value || 'Cash';
  const txnId    = genId();
  const now      = new Date();
  const date     = now.toISOString().slice(0, 10);
  const time     = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Validate stock
  for (const c of cart) {
    const item = db.items.find(i => i.id === c.itemId);
    if (!item) return toast(`Item "${escHtml(c.name)}" not found.`, 'error');
    const unitLabel = c.soldByKilo ? 'kg' : 'unit(s)';
    if (c.qty > item.qty) return toast(`Only ${item.soldByKilo ? item.qty.toFixed(2) + ' kg' : item.qty} ${unitLabel} left for "${escHtml(c.name)}".`, 'error');
  }

  // Build sale records
  const newSales = cart.map(c => {
    const qty     = Number(c.qty);
    const revenue = (c.price - c.origPrice) * qty;
    const total   = c.price * qty;
    return {
      id:          genId(),
      itemId:      c.itemId,
      itemName:    c.name,
      sku:         c.sku,
      qty,
      soldByKilo:  !!c.soldByKilo,
      pricePerPc:  c.price,
      origPrice:   c.origPrice,
      revenue,
      total,
      customer,
      payment,
      date,
      time,
      txnId
    };
  });

  // Deduct stock
  newSales.forEach(s => {
    const idx = db.items.findIndex(i => i.id === s.itemId);
    if (idx > -1) {
      // FIX: round to avoid float drift on kilo items (e.g. 2.5 - 0.5 = 1.9999...)
      db.items[idx].qty = Number((db.items[idx].qty - s.qty).toFixed(4));
      if (db.items[idx].qty < 0) db.items[idx].qty = 0;
    }
  });

  db.sales.push(...newSales);

  await saveData({ newSales });

  // Sync updated inventory items to Supabase
  const updatedItems = newSales
    .map(s => db.items.find(i => i.id === s.itemId))
    .filter(Boolean);
  for (const item of updatedItems) {
    await saveData({ updatedItem: item });
  }

  const grandTotal = newSales.reduce((a, s) => a + s.total, 0);
  const grandRev   = newSales.reduce((a, s) => a + s.revenue, 0);

  showReceipt({ newSales, customer, payment, date, time, grandTotal, grandRev });

  cart = [];
  renderCart();
  setVal('sellCustomer', '');
  setVal('billAmount', '');
  calcChange();
  renderSalesLog();
  renderLowStockAlert();
}

// ── RECEIPT ───────────────────────────────────────────────────────────────────

function showReceipt({ newSales, customer, payment, date, time, grandTotal, grandRev }) {
  const el = document.getElementById('receiptBody');
  if (!el) return;

  const bill   = parseFloat(document.getElementById('billAmount')?.value) || 0;
  const change = payment === 'Cash' && bill > 0 ? bill - grandTotal : null;

  el.innerHTML = `
    <div class="receipt">
      <div class="receipt-store">WILCY POS</div>
      <div class="receipt-meta">${date} &nbsp;·&nbsp; ${time}</div>
      <div class="receipt-meta">Customer: ${escHtml(customer)} &nbsp;·&nbsp; ${payment}</div>
      <div class="receipt-line"></div>
      <table class="receipt-table">
        <thead><tr><th style="width:40%">Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>
          ${newSales.map(s => `<tr>
            <td>${escHtml(s.itemName)}</td>
            <td>${s.soldByKilo ? Number(s.qty).toFixed(2) + ' kg' : s.qty + ' pc'}</td>
            <td>${fmt(s.pricePerPc)}/${s.soldByKilo ? 'kg' : 'pc'}</td>
            <td>${fmt(s.total)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="receipt-line"></div>
      <div class="receipt-total-row"><span>Grand Total</span><strong>${fmt(grandTotal)}</strong></div>
      <div class="receipt-total-row" style="color:var(--text3);font-size:0.78rem;"><span>Revenue</span><span>${fmt(grandRev)}</span></div>
      ${payment === 'Cash' && bill > 0 ? `
      <div class="receipt-total-row" style="color:var(--text3);font-size:0.78rem;"><span>Bill</span><span>${fmt(bill)}</span></div>
      <div class="receipt-total-row" style="color:${change >= 0 ? 'var(--green)' : 'var(--red)'};"><span>Change</span><strong>${change >= 0 ? fmt(change) : '⚠ Short ' + fmt(Math.abs(change))}</strong></div>
      ` : ''}
      <div class="receipt-line"></div>
      <div class="receipt-thanks">Thank you for your purchase!</div>
    </div>`;

  buildPrintReceipt({ newSales, customer, payment, date, time, grandTotal, grandRev, bill, change });
  openModal('receiptModal');
}

function buildPrintReceipt({ newSales, customer, payment, date, time, grandTotal, grandRev, bill, change }) {
  const mount = document.getElementById('printReceiptMount');
  if (!mount) return;

  mount.innerHTML = `
    <div class="print-receipt-page">
      <div class="prp-store">WILCY POS</div>
      <div class="prp-tagline">Point of Sale &amp; Inventory System</div>
      <hr class="prp-line-dash">
      <div class="prp-meta-row"><span>Date:</span><span>${date}</span></div>
      <div class="prp-meta-row"><span>Time:</span><span>${time}</span></div>
      <div class="prp-meta-row"><span>Customer:</span><span>${escHtml(customer)}</span></div>
      <div class="prp-meta-row"><span>Payment:</span><span>${payment}</span></div>
      <hr class="prp-line-dash">
      <div class="prp-section-label">Items</div>
      <table class="prp-item-table">
        <thead>
          <tr>
            <th style="width:42%">Item</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${newSales.map(s => `<tr>
            <td>${escHtml(s.itemName)}</td>
            <td>${s.soldByKilo ? Number(s.qty).toFixed(2) + ' kg' : s.qty + ' pc'}</td>
            <td>${fmt(s.pricePerPc)}/${s.soldByKilo ? 'kg' : 'pc'}</td>
            <td>${fmt(s.total)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <hr class="prp-line-dash">
      <div class="prp-total-row prp-grand-total"><span>GRAND TOTAL</span><span>${fmt(grandTotal)}</span></div>
      ${payment === 'Cash' && bill > 0 ? `
        <div class="prp-total-row"><span>Bill</span><span>${fmt(bill)}</span></div>
        <div class="prp-change-row"><span>CHANGE</span><span>${change >= 0 ? fmt(change) : 'SHORT ' + fmt(Math.abs(change))}</span></div>
      ` : ''}
      <hr class="prp-line-dash">
      <div class="prp-thanks">Thank you for your purchase!</div>
      <div class="prp-powered">Powered by WILCY POS</div>
    </div>`;
}

function printReceipt() {
  document.body.classList.add('print-receipt');
  window.print();
  document.body.classList.remove('print-receipt');
}

// ── SALES LOG ─────────────────────────────────────────────────────────────────

function renderSalesLog() {
  const body    = document.getElementById('salesLogBody');
  const countEl = document.getElementById('saleCount');
  if (!body) return;

  const today      = todayStr();
  const todaySales = db.sales.filter(s => s.date === today).slice().reverse();

  if (countEl) countEl.textContent = `${todaySales.length} record${todaySales.length !== 1 ? 's' : ''}`;

  if (!todaySales.length) {
    body.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No sales recorded today.</p></div>`;
    return;
  }

  body.innerHTML = todaySales.map(s => `
    <div class="sale-row">
      <div class="sale-dot"></div>
      <div class="sale-info">
        <div class="sale-name">${escHtml(s.itemName)}</div>
        <div class="sale-meta">${s.soldByKilo ? Number(s.qty).toFixed(2) + ' kg' : s.qty + ' pc' + (s.qty !== 1 ? 's' : '')} × ${fmt(s.pricePerPc)} · ${s.time}
          ${s.customer && s.customer !== 'Walk-in' ? ` · ${escHtml(s.customer)}` : ''}
          &nbsp;<span class="pay-chip pay-${(s.payment || 'Cash').toLowerCase()}">${s.payment || 'Cash'}</span>
        </div>
      </div>
      <div class="sale-rev-col">
        <div class="sale-rev-amt">+${fmt(s.revenue)}</div>
        <div class="sale-rev-lbl">revenue</div>
      </div>
    </div>`).join('');
}

async function clearSales() {
  const today = todayStr();
  const count = db.sales.filter(s => s.date === today).length;
  if (!count) return toast('No sales to clear today.', 'warn');
  if (!confirm("Clear today's sales from the dashboard?\n\nThis only clears the Today view — all sales remain saved in Sales History and Supabase.")) return;
  db.sales = db.sales.filter(s => s.date !== today);
  // FIX: was only calling saveLocal() — now also persists to localStorage properly
  saveLocal();
  renderSalesLog();
  toast("Today's sales cleared from dashboard.", 'warn');
}

// ── MODAL HELPERS ─────────────────────────────────────────────────────────────

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// ── EVENT BINDINGS ────────────────────────────────────────────────────────────

function bindEvents() {
  // Receipt modal close on backdrop click
  document.getElementById('receiptModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal('receiptModal');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal('receiptModal');
  });

  // Item search input
  const searchInput = document.getElementById('itemSearchInput');

  searchInput?.addEventListener('input', e => {
    renderItemSearch(e.target.value.trim());
  });

  searchInput?.addEventListener('focus', () => {
    renderItemSearch(searchInput.value);
  });

  // Close dropdown when clicking outside the search wrap
  document.addEventListener('click', e => {
    const wrap = document.getElementById('itemSearchWrap');
    if (wrap && !wrap.contains(e.target)) closeItemSearch();
  });

  searchInput?.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeItemSearch(); searchInput.blur(); }
  });
}

// ── BOOT ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);