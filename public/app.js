let me = null;
let allExpenses = [];
let allOrders   = [];
let activeFilter = "all";

const $ = (sel) => document.querySelector(sel);

/* ─── SIDEBAR ──────────────────────────────────────────────────── */
(function initSidebar() {
  const sidebar  = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  const isMobile = () => window.innerWidth <= 768;

  function openMobile() {
    sidebar.classList.add("mobile-open");
    backdrop.classList.add("active");
    document.body.style.overflow = "hidden";
  }
  function closeMobile() {
    sidebar.classList.remove("mobile-open");
    backdrop.classList.remove("active");
    document.body.style.overflow = "";
  }
  function toggleDesktop() {
    const collapsed = sidebar.classList.toggle("collapsed");
    localStorage.setItem("sidebarCollapsed", collapsed);
  }

  const saved = localStorage.getItem("sidebarCollapsed");
  if (saved === "true" && !isMobile()) sidebar.classList.add("collapsed");

  document.getElementById("sidebarToggle").addEventListener("click", () => {
    if (isMobile()) {
      sidebar.classList.contains("mobile-open") ? closeMobile() : openMobile();
    } else {
      toggleDesktop();
    }
  });

  backdrop.addEventListener("click", closeMobile);

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => { if (isMobile()) closeMobile(); });
  });

  // Native swipe-to-close for mobile
  let touchStartX = 0;
  sidebar.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
  sidebar.addEventListener('touchend', e => {
    if (isMobile() && touchStartX - e.changedTouches[0].screenX > 50) closeMobile();
  }, {passive: true});
  backdrop.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
  backdrop.addEventListener('touchend', e => {
    if (isMobile() && touchStartX - e.changedTouches[0].screenX > 50) closeMobile();
  }, {passive: true});

  window.addEventListener("resize", () => {
    if (!isMobile()) {
      closeMobile();
      if (localStorage.getItem("sidebarCollapsed") === "true") {
        sidebar.classList.add("collapsed");
      }
    }
  });
})();

/* ─── API HELPER ───────────────────────────────────────────────── */
async function api(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "something broke");
  return data;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function money(n) {
  return Number(n || 0).toLocaleString("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── DARK MODE ────────────────────────────────────────────────── */
function applyDarkMode(dark) {
  document.body.classList.toggle("dark", dark);
  const btn = $("#darkModeToggle");
  if (!btn) return;
  const icon = btn.querySelector("svg");
  if (dark) {
    if (icon) icon.innerHTML = '<path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>';
    btn.lastChild.textContent = " Light mode";
    btn.classList.add("active-toggle");
  } else {
    if (icon) icon.innerHTML = '<path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>';
    btn.lastChild.textContent = " Dark mode";
    btn.classList.remove("active-toggle");
  }
}

(function initDark() {
  const saved = localStorage.getItem("darkMode");
  if (saved === "true") applyDarkMode(true);
})();

/* ─── BOOT ─────────────────────────────────────────────────────── */
(async function boot() {
  const now = new Date();
  const dayEl = $("#topbarDate");
  if (dayEl) {
    dayEl.textContent = now.toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  }

  try {
    const { user } = await api("/api/me");
    if (user) {
      me = user;
      enterApp();
    } else {
      $("#loginScreen").classList.remove("hidden");
    }
  } catch (err) {
    $("#loginScreen").classList.remove("hidden");
    $("#loginError").textContent = "Could not reach server. Please refresh.";
    console.error("Boot error:", err);
  }
})();

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginError").textContent = "";
  try {
    const { user } = await api("/api/login", "POST", {
      username: $("#loginUsername").value.trim(),
      password: $("#loginPassword").value,
    });
    me = user;
    enterApp();
  } catch (err) {
    $("#loginError").textContent = err.message;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", "POST");
  location.reload();
});

/* ─── ENTER APP ────────────────────────────────────────────────── */
function enterApp() {
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.remove("hidden");

  $("#meUsername").textContent = me.username;
  $("#meRole").textContent = me.role;
  const avatarEl = $("#userAvatarLetter");
  if (avatarEl) avatarEl.textContent = me.username.charAt(0).toUpperCase();

  if (me.role === "founder") {
    document.querySelectorAll(".founder-only").forEach((el) => el.classList.remove("hidden"));
  }

  applyDarkMode(document.body.classList.contains("dark"));

  const dmBtn = $("#darkModeToggle");
  if (dmBtn) {
    dmBtn.addEventListener("click", () => {
      const isDark = !document.body.classList.contains("dark");
      applyDarkMode(isDark);
      localStorage.setItem("darkMode", isDark);
    });
  }

  loadOrders();
  loadStock();
  loadExpenses();
  if (me.role === "founder") loadUsers();
}

/* ─── NAV TABS ─────────────────────────────────────────────────── */
const pageTitles = { orders: "Orders", stock: "Stock", expenses: "Expenses", team: "Team Access" };

function switchTab(tab) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".mobile-nav-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach((b) => b.classList.add("active"));
  const panel = document.getElementById("tab-" + tab);
  if (panel) panel.classList.add("active");
  const titleEl = $("#pageTitle");
  if (titleEl) titleEl.textContent = pageTitles[tab] || tab;
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// Mobile bottom nav
document.querySelectorAll(".mobile-nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

/* ─── SYNC ─────────────────────────────────────────────────────── */
async function syncAll() {
  if (!me) return;
  if (document.visibilityState === "hidden") return;
  await Promise.all([loadOrders(), loadStock(), loadExpenses()]);
  if (me.role === "founder") await loadUsers();
  $("#syncTime").textContent = new Date().toLocaleTimeString();
}
setInterval(syncAll, 15000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && me) syncAll();
});

/* ─── ORDERS ───────────────────────────────────────────────────── */
async function loadOrders() {
  allOrders = await api("/api/orders");
  const body = $("#ordersBody");
  body.innerHTML = "";
  $("#ordersEmpty").classList.toggle("hidden", allOrders.length > 0);

  allOrders.forEach((o) => {
    const total = (o.items || []).reduce((sum, it) => sum + it.qty * it.price, 0) + Number(o.shippingPrice || 0);
    const itemsText = (o.items || []).map((it) => `${it.name} ×${it.qty}`).join(", ") || "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Customer">
        <div style="font-weight:600;font-family:var(--font)">${escapeHtml(o.customerName)}</div>
        ${o.email ? `<div style="font-size:11px;color:var(--text-muted)">${escapeHtml(o.email)}</div>` : ""}
      </td>
      <td data-label="Phone">${escapeHtml(o.phone || "—")}</td>
      <td data-label="Items" title="${escapeHtml(itemsText)}">${escapeHtml(itemsText.length > 40 ? itemsText.slice(0, 38) + "…" : itemsText)}</td>
      <td data-label="Address">${escapeHtml(o.address)}</td>
      <td data-label="Total" style="font-weight:600">${money(total)} EGP</td>
      <td data-label="Shipping">${money(o.shippingPrice)} EGP</td>
      <td data-label="Payment">
        <select data-order-id="${o.id}" class="payment-select inline-select">
          <option value="unpaid"  ${o.paymentStatus === "unpaid"  ? "selected" : ""}>Unpaid</option>
          <option value="pending" ${o.paymentStatus === "pending" ? "selected" : ""}>Pending</option>
          <option value="paid"    ${o.paymentStatus === "paid"    ? "selected" : ""}>Paid</option>
        </select>
      </td>
      <td data-label="Delivery">
        <select data-order-id="${o.id}" class="delivery-select inline-select">
          <option value="processing" ${o.deliveryStatus === "processing" ? "selected" : ""}>Processing</option>
          <option value="shipped"    ${o.deliveryStatus === "shipped"    ? "selected" : ""}>Shipped</option>
          <option value="delivered"  ${o.deliveryStatus === "delivered"  ? "selected" : ""}>Delivered</option>
        </select>
      </td>
      <td data-label="Date" style="white-space:nowrap">${new Date(o.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
      <td>${me.role === "founder" ? `<button class="icon-btn" data-del-order="${o.id}" title="Delete order">✕</button>` : ""}</td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll(".payment-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await api(`/api/orders/${sel.dataset.orderId}`, "PUT", { paymentStatus: sel.value });
    });
  });
  body.querySelectorAll(".delivery-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await api(`/api/orders/${sel.dataset.orderId}`, "PUT", { deliveryStatus: sel.value });
    });
  });
  body.querySelectorAll("[data-del-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Delete this order permanently?")) {
        await api(`/api/orders/${btn.dataset.delOrder}`, "DELETE");
        loadOrders();
      }
    });
  });
}

/* ─── NEW ORDER MODAL ──────────────────────────────────────────── */
let stockCache = [];
async function refreshStockCache() {
  stockCache = await api("/api/stock");
}

$("#openAddOrder").addEventListener("click", async () => {
  await refreshStockCache();
  $("#orderItemsList").innerHTML = "";
  addItemRow();
  updateOrderTotalPreview();
  $("#ordCustomer").value = "";
  $("#ordPhone").value = "";
  $("#ordEmail").value = "";
  $("#ordAddress").value = "";
  $("#ordShipping").value = "0";
  $("#ordPayment").value = "unpaid";
  $("#ordDelivery").value = "processing";
  $("#orderModal").classList.remove("hidden");
});

$("#addItemRow").addEventListener("click", () => addItemRow());

function addItemRow() {
  const row = document.createElement("div");
  row.className = "item-row";

  const options = stockCache
    .map((s) => `<option value="${s.id}" data-price="${s.price}" data-name="${escapeHtml(s.itemName)}">${escapeHtml(s.itemName)} (${s.quantity} in stock) — ${money(s.price)} EGP</option>`)
    .join("");

  row.innerHTML = `
    <select class="item-stock-select">${options || '<option disabled>No stock items yet — add some in Stock tab first</option>'}</select>
    <input type="number" class="item-qty" min="1" value="1" />
    <button type="button" class="icon-btn remove-item-row" title="Remove">✕</button>
  `;
  $("#orderItemsList").appendChild(row);

  row.querySelector(".item-qty").addEventListener("input", updateOrderTotalPreview);
  row.querySelector(".item-stock-select").addEventListener("change", updateOrderTotalPreview);
  row.querySelector(".remove-item-row").addEventListener("click", () => {
    row.remove();
    updateOrderTotalPreview();
  });
  updateOrderTotalPreview();
}

function collectOrderItems() {
  return Array.from($("#orderItemsList").querySelectorAll(".item-row"))
    .map((row) => {
      const select = row.querySelector(".item-stock-select");
      const opt = select.options[select.selectedIndex];
      if (!opt || opt.disabled) return null;
      return {
        stockId: opt.value,
        name: opt.dataset.name,
        price: Number(opt.dataset.price),
        qty: Number(row.querySelector(".item-qty").value) || 1,
      };
    })
    .filter(Boolean);
}

function updateOrderTotalPreview() {
  const items = collectOrderItems();
  const itemsTotal = items.reduce((sum, it) => sum + it.qty * it.price, 0);
  const shipping = Number($("#ordShipping").value) || 0;
  $("#orderTotalPreview").textContent = money(itemsTotal + shipping) + " EGP";
}
$("#ordShipping").addEventListener("input", updateOrderTotalPreview);

$("#orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const items = collectOrderItems();
  if (items.length === 0) { alert("Pick at least one item from stock."); return; }
  try {
    await api("/api/orders", "POST", {
      customerName: $("#ordCustomer").value.trim(),
      phone: $("#ordPhone").value.trim(),
      email: $("#ordEmail").value.trim() || null,
      address: $("#ordAddress").value.trim(),
      items,
      shippingPrice: $("#ordShipping").value,
      paymentStatus: $("#ordPayment").value,
      deliveryStatus: $("#ordDelivery").value,
    });
    e.target.reset();
    $("#orderItemsList").innerHTML = "";
    $("#orderModal").classList.add("hidden");
    loadOrders();
    loadStock(); // refresh stock after deduction
  } catch (err) {
    alert(err.message);
  }
});

/* ─── STOCK ────────────────────────────────────────────────────── */
async function loadStock() {
  const stock = await api("/api/stock");
  const body = $("#stockBody");
  body.innerHTML = "";
  $("#stockEmpty").classList.toggle("hidden", stock.length > 0);

  stock.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Item" style="font-family:var(--font);font-weight:500">${escapeHtml(s.itemName)}</td>
      <td data-label="Qty"><input type="number" min="0" value="${s.quantity}" data-qty-id="${s.id}" style="width:80px;font-size:13px;padding:5px 8px" /></td>
      <td data-label="Price">${money(s.price)} EGP</td>
      <td>${me.role === "founder" ? `<button class="icon-btn" data-del-stock="${s.id}" title="Remove">✕</button>` : ""}</td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll("[data-qty-id]").forEach((input) => {
    input.addEventListener("change", async () => {
      await api(`/api/stock/${input.dataset.qtyId}`, "PUT", { quantity: Number(input.value) });
    });
  });
  body.querySelectorAll("[data-del-stock]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Remove this item from stock?")) {
        await api(`/api/stock/${btn.dataset.delStock}`, "DELETE");
        loadStock();
      }
    });
  });
}

$("#openAddStock").addEventListener("click", () => {
  $("#stkName").value = "";
  $("#stkQty").value = "0";
  $("#stkPrice").value = "0";
  $("#stockModal").classList.remove("hidden");
});

$("#stockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/stock", "POST", {
    itemName: $("#stkName").value.trim(),
    quantity: Number($("#stkQty").value),
    price: Number($("#stkPrice").value),
  });
  e.target.reset();
  $("#stockModal").classList.add("hidden");
  loadStock();
});

/* ─── EXPENSES ─────────────────────────────────────────────────── */
const CAT_ICON = {
  Ads:       '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>',
  Printing:  '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v6a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9h8v3H6v-3zm8-4a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd"/></svg>',
  Packaging: '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z"/><path fill-rule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>',
  Delivery:  '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h.09A2.5 2.5 0 018 14.5h4A2.5 2.5 0 0116.91 16H17a1 1 0 001-1v-5l-3.04-4.56A1 1 0 0014.12 5H3zm7 5V7h4.12l2.02 3H10V9z"/></svg>',
};

const CAT_CHIPS = {
  Ads:       `<span class="cat-chip cat-chip-ads">${CAT_ICON.Ads} Ads</span>`,
  Printing:  `<span class="cat-chip cat-chip-printing">${CAT_ICON.Printing} Printing</span>`,
  Packaging: `<span class="cat-chip cat-chip-packaging">${CAT_ICON.Packaging} Packaging</span>`,
  Delivery:  `<span class="cat-chip cat-chip-delivery">${CAT_ICON.Delivery} Delivery</span>`,
};

function egp(n) {
  return Number(n || 0).toLocaleString("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EGP";
}

async function loadExpenses() {
  allExpenses = await api("/api/expenses");
  renderExpenses();
  renderSummary();
}

function renderSummary() {
  const cats = ["Ads", "Printing", "Packaging", "Delivery"];
  const totals = { all: 0 };
  cats.forEach((c) => (totals[c] = 0));
  allExpenses.forEach((e) => {
    totals.all += e.amount;
    if (totals[e.category] !== undefined) totals[e.category] += e.amount;
  });
  $("#totalAll").textContent      = egp(totals.all);
  $("#totalAds").textContent      = egp(totals.Ads);
  $("#totalPrinting").textContent = egp(totals.Printing);
  $("#totalPackaging").textContent= egp(totals.Packaging);
  $("#totalDelivery").textContent = egp(totals.Delivery);

  const pt = $("#printTotals");
  if (pt) {
    pt.innerHTML = `
      <div class="print-totals-grid">
        <div class="print-total-item"><span class="print-total-label">Total Spent</span><span class="print-total-amount print-total-main">${egp(totals.all)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Ads</span><span class="print-total-amount">${egp(totals.Ads)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Printing</span><span class="print-total-amount">${egp(totals.Printing)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Packaging</span><span class="print-total-amount">${egp(totals.Packaging)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Delivery</span><span class="print-total-amount">${egp(totals.Delivery)}</span></div>
      </div>
    `;
  }
}

function renderExpenses() {
  const filtered = activeFilter === "all"
    ? allExpenses
    : allExpenses.filter((e) => e.category === activeFilter);

  const body = $("#expensesBody");
  body.innerHTML = "";
  $("#expensesEmpty").classList.toggle("hidden", filtered.length > 0);

  filtered.slice().reverse().forEach((e) => {
    const tr = document.createElement("tr");
    const initial = (e.loggedBy || "?").charAt(0).toUpperCase();
    tr.innerHTML = `
      <td>${CAT_CHIPS[e.category] || escapeHtml(e.category)}</td>
      <td style="font-family:var(--font);font-weight:500;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(e.description)}">${escapeHtml(e.description)}</td>
      <td class="amount-cell">${egp(e.amount)}</td>
      <td>
        <div class="logged-by-cell">
          <div class="mini-avatar">${escapeHtml(initial)}</div>
          <span style="font-family:var(--font);font-size:12.5px">${escapeHtml(e.loggedBy || "—")}</span>
        </div>
      </td>
      <td class="note-cell" title="${escapeHtml(e.note || "")}">${e.note ? escapeHtml(e.note) : '<span style="opacity:0.35">—</span>'}</td>
      <td style="white-space:nowrap">${new Date(e.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
      <td>${me.role === "founder" ? `<button class="icon-btn" data-del-expense="${e.id}" title="Delete">✕</button>` : ""}</td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll("[data-del-expense]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Delete this expense entry?")) {
        await api(`/api/expenses/${btn.dataset.delExpense}`, "DELETE");
        loadExpenses();
      }
    });
  });
}

/* ─── PRINT SYSTEM ─────────────────────────────────────────────── */

/** Filter an array to the selected period. dateField defaults to 'createdAt'. */
function filterByPeriod(items, period, dateField = "createdAt") {
  if (period === "all") return items;
  const now   = new Date();
  const start = new Date();
  if (period === "week") {
    start.setDate(now.getDate() - now.getDay()); // Sunday of current week
    start.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return items.filter((item) => new Date(item[dateField]) >= start);
}

const PERIOD_LABEL = { all: "All Time", month: "This Month", week: "This Week" };

function printReport(type, period) {
  const section   = $("#printSection");
  const label     = PERIOD_LABEL[period] || "";
  const dateStr   = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const byStr     = me ? me.username : "";

  if (type === "orders") {
    const data = filterByPeriod(allOrders, period);
    const totalRevenue = data.reduce((s, o) => {
      return s + (o.items || []).reduce((si, it) => si + it.qty * it.price, 0) + Number(o.shippingPrice || 0);
    }, 0);
    const paid      = data.filter((o) => o.paymentStatus  === "paid").length;
    const delivered = data.filter((o) => o.deliveryStatus === "delivered").length;

    section.innerHTML = `
      <div class="print-brand">
        <div class="print-brand-name">STATIC</div>
        <div class="print-brand-sub">Orders Report &mdash; ${label}</div>
      </div>
      <div class="print-meta">
        <div>Generated: ${dateStr}</div>
        <div>By: ${escapeHtml(byStr)}</div>
        <div>Period: ${label}</div>
      </div>
      <div class="print-totals-grid" style="margin-bottom:16px">
        <div class="print-total-item"><span class="print-total-label">Total Orders</span><span class="print-total-amount print-total-main">${data.length}</span></div>
        <div class="print-total-item"><span class="print-total-label">Total Revenue</span><span class="print-total-amount print-total-main">${money(totalRevenue)} EGP</span></div>
        <div class="print-total-item"><span class="print-total-label">Paid</span><span class="print-total-amount">${paid}</span></div>
        <div class="print-total-item"><span class="print-total-label">Delivered</span><span class="print-total-amount">${delivered}</span></div>
      </div>
      <div class="print-divider"></div>
      <table class="print-report-table">
        <thead>
          <tr>
            <th>#</th><th>Customer</th><th>Phone</th><th>Items</th>
            <th>Address</th><th>Total</th><th>Shipping</th>
            <th>Payment</th><th>Delivery</th><th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((o, i) => {
            const tot = (o.items||[]).reduce((s,it)=>s+it.qty*it.price,0) + Number(o.shippingPrice||0);
            const its = (o.items||[]).map(it=>`${it.name} x${it.qty}`).join(", ") || "—";
            return `<tr>
              <td>${i+1}</td>
              <td>${escapeHtml(o.customerName)}</td>
              <td>${escapeHtml(o.phone)}</td>
              <td>${escapeHtml(its)}</td>
              <td>${escapeHtml(o.address)}</td>
              <td><strong>${money(tot)} EGP</strong></td>
              <td>${money(o.shippingPrice)} EGP</td>
              <td style="text-transform:capitalize">${o.paymentStatus}</td>
              <td style="text-transform:capitalize">${o.deliveryStatus}</td>
              <td>${new Date(o.createdAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      ${data.length === 0 ? '<p style="text-align:center;color:#888;padding:24px">No orders found for this period.</p>' : ""}
    `;
  } else if (type === "expenses") {
    const data = filterByPeriod(allExpenses, period);
    const cats = ["Ads", "Printing", "Packaging", "Delivery"];
    const totals = { all: 0 };
    cats.forEach((c) => (totals[c] = 0));
    data.forEach((e) => {
      totals.all += e.amount;
      if (totals[e.category] !== undefined) totals[e.category] += e.amount;
    });

    section.innerHTML = `
      <div class="print-brand">
        <div class="print-brand-name">STATIC</div>
        <div class="print-brand-sub">Expense Report &mdash; ${label}</div>
      </div>
      <div class="print-meta">
        <div>Generated: ${dateStr}</div>
        <div>By: ${escapeHtml(byStr)}</div>
        <div>Period: ${label}</div>
      </div>
      <div class="print-totals-grid" style="margin-bottom:16px">
        <div class="print-total-item"><span class="print-total-label">Total Spent</span><span class="print-total-amount print-total-main">${egp(totals.all)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Ads</span><span class="print-total-amount">${egp(totals.Ads)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Printing</span><span class="print-total-amount">${egp(totals.Printing)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Packaging</span><span class="print-total-amount">${egp(totals.Packaging)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Delivery</span><span class="print-total-amount">${egp(totals.Delivery)}</span></div>
      </div>
      <div class="print-divider"></div>
      <table class="print-report-table">
        <thead>
          <tr><th>#</th><th>Category</th><th>Description</th><th>Amount</th><th>Logged by</th><th>Note</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${data.slice().reverse().map((e, i) => `<tr>
            <td>${i+1}</td>
            <td>${escapeHtml(e.category)}</td>
            <td>${escapeHtml(e.description)}</td>
            <td><strong>${egp(e.amount)}</strong></td>
            <td>${escapeHtml(e.loggedBy || "—")}</td>
            <td>${escapeHtml(e.note || "—")}</td>
            <td>${new Date(e.createdAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${data.length === 0 ? '<p style="text-align:center;color:#888;padding:24px">No expenses found for this period.</p>' : ""}
    `;
  }

  window.print();
  // Clean up after print dialog closes
  setTimeout(() => { if (section) section.innerHTML = ""; }, 2000);
}

/* ─── PRINT DROPDOWN TOGGLES ──────────────────────────────────── */
document.querySelectorAll(".print-drop-trigger").forEach((trigger) => {
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    // Close any other open menus
    document.querySelectorAll(".print-drop-menu").forEach((m) => {
      if (m !== trigger.nextElementSibling) m.classList.add("hidden");
    });
    trigger.nextElementSibling.classList.toggle("hidden");
  });
});

// Close on click outside
document.addEventListener("click", () => {
  document.querySelectorAll(".print-drop-menu").forEach((m) => m.classList.add("hidden"));
});

// Wire up period buttons
document.querySelectorAll(".print-drop-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".print-drop-menu").forEach((m) => m.classList.add("hidden"));
    printReport(btn.dataset.print, btn.dataset.period);
  });
});

/* ─── FILTER BUTTONS ───────────────────────────────────────────── */
document.querySelectorAll(".cat-filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".cat-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    renderExpenses();
  });
});

/* ─── PRINT PDF ────────────────────────────────────────────────── */
function printExpenses() {
  const dateEl = $("#printDate");
  const byEl   = $("#printGeneratedBy");
  if (dateEl) dateEl.textContent = "Period: all entries as of " + new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  if (byEl && me) byEl.textContent = "Generated by: " + me.username;
  const filterLabel = activeFilter === "all" ? "All Categories" : activeFilter;
  const headerEl = $("#printHeader");
  if (headerEl) {
    const sub = headerEl.querySelector(".print-filter-label");
    if (!sub) {
      const lbl = document.createElement("div");
      lbl.className = "print-filter-label";
      lbl.textContent = "Showing: " + filterLabel;
      headerEl.querySelector(".print-meta").appendChild(lbl);
    } else {
      sub.textContent = "Showing: " + filterLabel;
    }
  }
  window.print();
}

$("#printPdfBtn").addEventListener("click", printExpenses);

/* ─── ADD EXPENSE MODAL ────────────────────────────────────────── */
let selectedCategory = "";

$("#openAddExpense").addEventListener("click", () => {
  selectedCategory = "";
  $("#expCategory").value = "";
  $("#expDescription").value = "";
  $("#expAmount").value = "";
  $("#expNote").value = "";
  $("#expError").textContent = "";
  document.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("selected"));
  $("#expenseModal").classList.remove("hidden");
});

document.querySelectorAll(".cat-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("selected"));
    pill.classList.add("selected");
    selectedCategory = pill.dataset.val;
    $("#expCategory").value = selectedCategory;
  });
});

$("#expenseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#expError").textContent = "";
  if (!selectedCategory) { $("#expError").textContent = "Pick a category first."; return; }
  try {
    await api("/api/expenses", "POST", {
      category: selectedCategory,
      description: $("#expDescription").value.trim(),
      amount: $("#expAmount").value,
      note: $("#expNote").value.trim() || null,
    });
    e.target.reset();
    selectedCategory = "";
    document.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("selected"));
    $("#expenseModal").classList.add("hidden");
    loadExpenses();
  } catch (err) {
    $("#expError").textContent = err.message;
  }
});

/* ─── TEAM ─────────────────────────────────────────────────────── */
async function loadUsers() {
  const users = await api("/api/users");
  const body = $("#usersBody");
  body.innerHTML = "";
  users.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-family:var(--font);font-weight:500">${escapeHtml(u.username)}</td>
      <td><span class="role-badge" style="background:var(--surface-raised);border-color:var(--border);color:var(--text-muted)">${u.role}</span></td>
      <td>${u.role !== "founder" ? `<button class="icon-btn" data-del-user="${u.id}" title="Revoke access">✕</button>` : ""}</td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll("[data-del-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("Revoke this account's access?")) {
        await api(`/api/users/${btn.dataset.delUser}`, "DELETE");
        loadUsers();
      }
    });
  });
}

$("#addStaffForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/users", "POST", {
    username: $("#newStaffUsername").value.trim(),
    password: $("#newStaffPassword").value,
  });
  e.target.reset();
  loadUsers();
});

/* ─── CHANGE PASSWORD ──────────────────────────────────────────── */
$("#openChangePassword").addEventListener("click", () => {
  $("#pwOld").value = "";
  $("#pwNew").value = "";
  $("#pwError").textContent = "";
  $("#passwordModal").classList.remove("hidden");
});

$("#passwordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#pwError").textContent = "";
  try {
    await api("/api/change-password", "POST", {
      oldPassword: $("#pwOld").value,
      newPassword: $("#pwNew").value,
    });
    e.target.reset();
    $("#passwordModal").classList.add("hidden");
    alert("Password changed. Use the new one next time you log in.");
  } catch (err) {
    $("#pwError").textContent = err.message;
  }
});

/* ─── MODAL CLOSE HELPERS ──────────────────────────────────────── */
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => $("#" + btn.dataset.close).classList.add("hidden"));
});

document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
});
