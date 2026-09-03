let me = null;
let allExpenses = [];
let allBrandExpenses = [];
let allOrders   = [];
let allCustomers = [];
let activeFilter = "all";
let activeBrandFilter = "all";

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
  if (!res.ok) {
    if (res.status === 404) throw new Error("Server route not found — please restart your dev server.");
    throw new Error(data.error || `Server error (${res.status})`);
  }
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

function formatDate12h(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatOrderId(id) {
  if (!id) return "1001";
  const str = String(id).trim();
  if (str.startsWith("ord_")) {
    const suffix = str.slice(4);
    // If it's a long timestamp, shorten it cleanly
    if (suffix.length > 8 && /^\d+$/.test(suffix)) {
      return "ORD-" + suffix.slice(-6);
    }
    return "ORD-" + suffix;
  }
  return str;
}

function formatStockSku(item) {
  if (!item) return "STK-1001";
  if (item.sku && String(item.sku).trim()) {
    return String(item.sku).trim().toUpperCase();
  }
  const idStr = String(item.id || "");
  if (idStr.startsWith("stk_")) {
    return "STK-" + idStr.slice(4).slice(-6);
  }
  return "STK-" + idStr.slice(-6);
}

/* ─── REAL SCANNABLE ISO/IEC 15417 CODE 128 BARCODE GENERATOR ──── */
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"                                // 100-106 (104=StartB, 106=Stop)
];

function generateCode128BarcodeSVG(rawText, options = {}) {
  const text = String(rawText || "").trim() || "1001";
  const moduleWidth = options.moduleWidth || 2;
  const barHeight   = options.barHeight || 46;
  const showText    = options.showText !== false;
  const displayText = options.displayText || text;
  const fontSize    = options.fontSize || 11.5;
  const quietModules = options.quietModules !== undefined ? options.quietModules : 12; // 12 modules quiet zone

  // Code 128 Character Set B encoding
  const codes = [104]; // Start Code B
  let checkSum = 104;

  for (let i = 0; i < text.length; i++) {
    let charCode = text.charCodeAt(i);
    let val = (charCode >= 32 && charCode <= 126) ? (charCode - 32) : 0;
    codes.push(val);
    checkSum += (i + 1) * val;
  }

  codes.push(checkSum % 103);
  codes.push(106); // Stop pattern

  // Build SVG rects
  let currentX = quietModules * moduleWidth;
  const topY = 2;
  const rects = [];

  for (let c = 0; c < codes.length; c++) {
    const pattern = CODE128_PATTERNS[codes[c]];
    if (!pattern) continue;
    for (let p = 0; p < pattern.length; p++) {
      const width = parseInt(pattern[p], 10) * moduleWidth;
      // Even index in pattern is a black bar, odd is white space
      if (p % 2 === 0) {
        rects.push(`<rect x="${currentX}" y="${topY}" width="${width}" height="${barHeight}" fill="#000000" shape-rendering="crispEdges"/>`);
      }
      currentX += width;
    }
  }

  const totalWidth = currentX + (quietModules * moduleWidth);
  const textY = topY + barHeight + Math.round(fontSize * 1.15);
  const totalHeight = showText ? (textY + 4) : (topY + barHeight + 3);

  const textElement = showText
    ? `<text x="${totalWidth / 2}" y="${textY}" font-family="'SF Mono', 'Courier New', Courier, monospace" font-size="${fontSize}" font-weight="700" fill="#000000" text-anchor="middle" letter-spacing="1.2">${escapeHtml(displayText)}</text>`
    : "";

  const cls = options.className || "receipt-upc-barcode";
  return `<svg viewBox="0 0 ${totalWidth} ${totalHeight}" class="${cls}" style="max-width:100%;height:auto;background:#ffffff;border-radius:2px;"><rect width="${totalWidth}" height="${totalHeight}" fill="#ffffff"/>${rects.join("")}${textElement}</svg>`;
}

// Backward compatibility alias
function generateBarcodeSVG(orderId, barHeight = 46) {
  return generateCode128BarcodeSVG(formatOrderId(orderId), { barHeight, showText: true });
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

  loadBootstrap();
  if (me.role === "founder") loadUsers();
  initBarcodeScanner();
}

/* ─── FAST BOOTSTRAP LOADER ────────────────────────────────────── */
async function loadBootstrap() {
  try {
    const data = await api("/api/bootstrap");
    if (data.orders) {
      allOrders = data.orders;
      renderOrders();
      renderOrdersSummary();
    }
    if (data.stock) {
      allStock = data.stock;
      renderStock();
      renderStockSummary();
      populateOrderStockSelects();
    }
    if (data.expenses) {
      allExpenses = data.expenses;
      renderExpenses();
      renderSummary();
    }
    if (data.brandExpenses) {
      allBrandExpenses = data.brandExpenses;
      renderBrandExpenses();
      renderBrandSummary();
    }
    if (data.revenue) {
      allRevenue = data.revenue;
      renderRevenue();
      renderRevenueSummary();
    }
    renderBrandFunds();
  } catch (err) {
    console.error("Bootstrap fetch error, falling back to individual calls:", err);
    await Promise.all([loadOrders(), loadStock(), loadExpenses(), loadBrandExpenses(), loadRevenue()]);
  }
}

/* ─── NAV TABS ─────────────────────────────────────────────────── */
const pageTitles = {
  orders: "Orders",
  stock: "Stock",
  scanner: "Barcode Scanner",
  expenses: "Personal Expenses",
  "brand-funds": "Brand Funds & Treasury",
  "brand-expenses": "Brand Expenses",
  revenue: "Revenue",
  customers: "Customers",
  team: "Team Access",
};

function switchTab(tab) {
  // If moving away from scanner, stop the camera to conserve battery and release hardware
  if (tab !== "scanner" && isCameraScanning) {
    stopCameraScanner();
  }

  // Seamless redirect for subtabs
  if (tab === "revenue") {
    switchTab("brand-funds");
    switchFundsSubTab("subtab-funds-revenue");
    return;
  }
  if (tab === "brand-expenses") {
    switchTab("brand-funds");
    switchFundsSubTab("subtab-funds-expenses");
    return;
  }

  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".mobile-nav-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach((b) => b.classList.add("active"));
  const panel = document.getElementById("tab-" + tab);
  if (panel) panel.classList.add("active");
  const titleEl = $("#pageTitle");
  if (titleEl) titleEl.textContent = pageTitles[tab] || tab;
  window.scrollTo(0, 0);

  if (tab === "customers" && me?.role === "founder") {
    loadCustomers();
  }
  if (tab === "brand-funds") {
    renderBrandFunds();
  }
  if (tab === "team" && me?.role === "founder") {
    loadUsers();
  }

  if (tab === "scanner") {
    setTimeout(() => {
      const input = $("#scannerManualInput");
      if (input && document.activeElement !== input) input.focus();
    }, 100);
  }
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
  await loadBootstrap();
  if (me.role === "founder") {
    loadCustomers();
    await loadUsers();
  }
  const syncTimeEl = $("#syncTime");
  if (syncTimeEl) syncTimeEl.textContent = new Date().toLocaleTimeString();
}
// Smart sync: only poll every 3 mins when user was recently active (saves Neon compute)
let lastUserActivity = Date.now();
["mousemove", "keydown", "click", "touchstart"].forEach(evt => {
  window.addEventListener(evt, () => { lastUserActivity = Date.now(); }, { passive: true });
});

setInterval(() => {
  // If user has been inactive for > 10 mins, don't poll (let Neon sleep)
  if (Date.now() - lastUserActivity < 600000) {
    syncAll();
  }
}, 180000); // 3 min interval
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && me) syncAll();
});

let activeOrderDetailId = null;

function openOrderDetail(orderId) {
  const o = allOrders.find((item) => String(item.id) === String(orderId));
  if (!o) return;
  activeOrderDetailId = o.id;

  const total = (o.items || []).reduce((sum, it) => sum + it.qty * it.price, 0) + Number(o.shippingPrice || 0);

  const orderCode = formatOrderId(o.id);
  const idEl = $("#orderDetailId");
  if (idEl) idEl.textContent = "#" + orderCode;
  $("#orderDetailCustomer").textContent = o.customerName;
  $("#orderDetailContact").textContent = [o.phone, o.email].filter(Boolean).join(" • ");
  $("#orderDetailTotal").textContent = money(total) + " EGP";

  // Render on-screen scannable Code 128 barcode
  const barcodeSvgEl = $("#orderDetailBarcodeSvg");
  if (barcodeSvgEl) {
    barcodeSvgEl.innerHTML = generateCode128BarcodeSVG(orderCode, {
      moduleWidth: 2,
      barHeight: 44,
      showText: true,
      displayText: "#" + orderCode,
    });
  }

  const itemsHTML = (o.items || []).map((it) => `
    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13.5px;">
      <span style="font-weight: 600; color: var(--text);">${escapeHtml(it.name)} <span style="color: var(--text-muted); font-size: 12px;">×${it.qty}</span></span>
      <span style="font-weight: 600; color: var(--accent);">${money(it.qty * it.price)} EGP</span>
    </div>
  `).join("") || '<span style="color: var(--text-muted); font-size: 13px;">No items</span>';

  $("#orderDetailItemsList").innerHTML = itemsHTML;

  const paySel = $("#modalOrderPayment");
  paySel.value = o.paymentStatus;
  paySel.onchange = async () => {
    await api(`/api/orders/${o.id}`, "PUT", { paymentStatus: paySel.value });
    loadOrders();
    loadRevenue();
  };

  const delSel = $("#modalOrderDelivery");
  delSel.value = o.deliveryStatus;
  delSel.onchange = async () => {
    await api(`/api/orders/${o.id}`, "PUT", { deliveryStatus: delSel.value });
    loadOrders();
  };

  $("#orderDetailAddress").textContent = o.address || "—";
  $("#orderDetailShipping").textContent = money(o.shippingPrice) + " EGP";
  $("#orderDetailDate").textContent = formatDate12h(o.createdAt);

  const delWrap = $("#modalOrderDeleteWrap");
  if (me.role === "founder") {
    delWrap.style.display = "block";
    $("#modalOrderDeleteBtn").onclick = async () => {
      if (confirm("Delete this order permanently?")) {
        await api(`/api/orders/${o.id}`, "DELETE");
        $("#orderDetailModal").classList.add("hidden");
        loadOrders();
        loadRevenue();
      }
    };
  } else {
    delWrap.style.display = "none";
  }

  const editBtn = $("#modalOrderEditBtn");
  if (editBtn) {
    editBtn.onclick = () => {
      $("#orderDetailModal").classList.add("hidden");
      openEditOrderModal(o.id);
    };
  }

  const receiptBtn = $("#modalOrderReceiptBtn");
  if (receiptBtn) {
    receiptBtn.onclick = () => {
      $("#orderDetailModal").classList.add("hidden");
      printOrderReceipt(o.id);
    };
  }

  $("#orderDetailModal").classList.remove("hidden");
}

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
    tr.className = "clickable-row";
    tr.innerHTML = `
      <td data-label="Customer">
        <div style="font-size:10.5px;font-family:var(--font-mono);color:var(--accent);font-weight:700;letter-spacing:0.5px;margin-bottom:2px">#${escapeHtml(formatOrderId(o.id))}</div>
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
      <td data-label="Date" style="white-space:nowrap">${formatDate12h(o.createdAt)}</td>
      <td>
        <div style="display:flex;gap:4px;align-items:center">
          <button class="icon-btn edit-order-btn" data-edit-order="${o.id}" title="Edit order" style="color:var(--text-muted);font-size:15px">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px;vertical-align:middle"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
          </button>
          <button class="icon-btn receipt-btn" data-receipt-order="${o.id}" title="Print receipt" style="color:var(--text-muted);font-size:15px">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px;vertical-align:middle"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v6a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9h8v3H6v-3zm8-4a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd"/></svg>
          </button>
          ${me.role === "founder" ? `<button class="icon-btn" data-del-order="${o.id}" title="Delete order">✕</button>` : ""}
        </div>
      </td>
    `;

    tr.addEventListener("click", (evt) => {
      if (evt.target.closest("select") || evt.target.closest("[data-del-order]") || evt.target.closest(".receipt-btn") || evt.target.closest(".edit-order-btn")) return;
      openOrderDetail(o.id);
    });

    body.appendChild(tr);
  });

  body.querySelectorAll(".payment-select").forEach((sel) => {
    sel.addEventListener("change", async (evt) => {
      evt.stopPropagation();
      await api(`/api/orders/${sel.dataset.orderId}`, "PUT", { paymentStatus: sel.value });
      loadRevenue();
    });
  });
  body.querySelectorAll(".delivery-select").forEach((sel) => {
    sel.addEventListener("change", async (evt) => {
      evt.stopPropagation();
      await api(`/api/orders/${sel.dataset.orderId}`, "PUT", { deliveryStatus: sel.value });
    });
  });
  body.querySelectorAll(".edit-order-btn").forEach((btn) => {
    btn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      openEditOrderModal(btn.dataset.editOrder);
    });
  });
  body.querySelectorAll("[data-del-order]").forEach((btn) => {
    btn.addEventListener("click", async (evt) => {
      evt.stopPropagation();
      if (confirm("Delete this order permanently?")) {
        await api(`/api/orders/${btn.dataset.delOrder}`, "DELETE");
        loadOrders();
      }
    });
  });
  body.querySelectorAll(".receipt-btn").forEach((btn) => {
    btn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      printOrderReceipt(btn.dataset.receiptOrder);
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

  // Pre-fill next sequential Order ID
  try {
    const { nextId } = await api("/api/orders/next-id");
    $("#ordId").value = nextId || "1001";
  } catch {
    $("#ordId").value = "";
  }

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
    .map((s) => {
      const isOut = s.quantity <= 0;
      const sku = formatStockSku(s);
      return `<option value="${s.id}" data-price="${s.price}" data-name="${escapeHtml(s.itemName)}" ${isOut ? 'disabled' : ''}>
        [${escapeHtml(sku)}] ${escapeHtml(s.itemName)} ${isOut ? '(Out of Stock)' : `(${s.quantity} in stock)`} — ${money(s.price)} EGP
      </option>`;
    })
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
      id: $("#ordId").value.trim() || undefined,
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
    loadRevenue();
    loadStock(); // refresh stock after deduction
  } catch (err) {
    alert(err.message);
  }
});

/* ─── EDIT ORDER MODAL ─────────────────────────────────────────── */
async function openEditOrderModal(orderId) {
  await refreshStockCache();
  const o = allOrders.find((item) => String(item.id) === String(orderId));
  if (!o) return;

  const orderCode = formatOrderId(o.id);
  $("#editOrdId").value = o.id;
  $("#editOrdIdBadge").textContent = "#" + orderCode;
  $("#editOrdCustomer").value = o.customerName || "";
  $("#editOrdPhone").value = o.phone || "";
  $("#editOrdEmail").value = o.email || "";
  $("#editOrdAddress").value = o.address || "";
  $("#editOrdShipping").value = o.shippingPrice ?? 0;
  $("#editOrdPayment").value = o.paymentStatus || "unpaid";
  $("#editOrdDelivery").value = o.deliveryStatus || "processing";

  const listEl = $("#editOrderItemsList");
  listEl.innerHTML = "";

  const orderItems = Array.isArray(o.items) ? o.items : [];
  if (orderItems.length > 0) {
    orderItems.forEach((it) => {
      const stockId = it.stockId || it.id || it.stockItemId;
      addEditItemRow(stockId, it.qty || 1, it.name, it.price);
    });
  } else {
    addEditItemRow();
  }

  updateEditOrderTotalPreview();
  $("#editOrderModal").classList.remove("hidden");
}

function addEditItemRow(selectedStockId = null, qty = 1, fallbackName = "", fallbackPrice = 0) {
  const row = document.createElement("div");
  row.className = "item-row";

  let matchFound = false;
  const options = stockCache
    .map((s) => {
      const isSelected = selectedStockId && String(s.id) === String(selectedStockId);
      if (isSelected) matchFound = true;
      const isOut = s.quantity <= 0 && !isSelected;
      const sku = formatStockSku(s);
      return `<option value="${s.id}" data-price="${s.price}" data-name="${escapeHtml(s.itemName)}" ${isSelected ? 'selected' : ''} ${isOut ? 'disabled' : ''}>
        [${escapeHtml(sku)}] ${escapeHtml(s.itemName)} ${isOut ? '(Out of Stock)' : `(${s.quantity} in stock)`} — ${money(s.price)} EGP
      </option>`;
    })
    .join("");

  let extraOption = "";
  if (selectedStockId && !matchFound && fallbackName) {
    extraOption = `<option value="${escapeHtml(selectedStockId)}" data-price="${fallbackPrice}" data-name="${escapeHtml(fallbackName)}" selected>
      ${escapeHtml(fallbackName)} (Custom / Archived) — ${money(fallbackPrice)} EGP
    </option>`;
  }

  row.innerHTML = `
    <select class="item-stock-select">${extraOption + options || '<option disabled>No stock items available</option>'}</select>
    <input type="number" class="item-qty" min="1" value="${Math.max(1, qty)}" />
    <button type="button" class="icon-btn remove-item-row" title="Remove">✕</button>
  `;
  $("#editOrderItemsList").appendChild(row);

  row.querySelector(".item-qty").addEventListener("input", updateEditOrderTotalPreview);
  row.querySelector(".item-stock-select").addEventListener("change", updateEditOrderTotalPreview);
  row.querySelector(".remove-item-row").addEventListener("click", () => {
    row.remove();
    updateEditOrderTotalPreview();
  });
  updateEditOrderTotalPreview();
}

$("#editAddItemRow").addEventListener("click", () => addEditItemRow());

function collectEditOrderItems() {
  return Array.from($("#editOrderItemsList").querySelectorAll(".item-row"))
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

function updateEditOrderTotalPreview() {
  const items = collectEditOrderItems();
  const itemsTotal = items.reduce((sum, it) => sum + it.qty * it.price, 0);
  const shipping = Number($("#editOrdShipping").value) || 0;
  $("#editOrderTotalPreview").textContent = money(itemsTotal + shipping) + " EGP";
}
$("#editOrdShipping").addEventListener("input", updateEditOrderTotalPreview);

$("#editOrderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const orderId = $("#editOrdId").value;
  if (!orderId) return;

  const items = collectEditOrderItems();
  if (items.length === 0) { alert("Pick at least one item from stock."); return; }

  try {
    await api(`/api/orders/${orderId}`, "PUT", {
      customerName: $("#editOrdCustomer").value.trim(),
      phone: $("#editOrdPhone").value.trim(),
      email: $("#editOrdEmail").value.trim() || null,
      address: $("#editOrdAddress").value.trim(),
      items,
      shippingPrice: Number($("#editOrdShipping").value) || 0,
      paymentStatus: $("#editOrdPayment").value,
      deliveryStatus: $("#editOrdDelivery").value,
    });

    $("#editOrderModal").classList.add("hidden");
    await loadOrders();
    await loadRevenue();
    await loadStock(); // refresh stock after reconciliation

    // If order details modal was open for this order, refresh its content
    if (activeOrderDetailId && String(activeOrderDetailId) === String(orderId)) {
      openOrderDetail(orderId);
    }
  } catch (err) {
    alert("Could not update order: " + err.message);
  }
});

/* ─── STOCK ────────────────────────────────────────────────────── */
let allStock = [];
let activeStockDetailId = null;
let activeBarcodeStockItem = null;

function openStockDetail(stockId) {
  const s = allStock.find((item) => String(item.id) === String(stockId));
  if (!s) return;
  activeStockDetailId = s.id;

  const sku = formatStockSku(s);
  $("#modalStockName").value = s.itemName;
  $("#modalStockSku").value = sku;
  $("#modalStockPrice").value = s.price;
  $("#modalStockQty").value = s.quantity;

  const skuBadge = $("#stockDetailBarcodeSkuBadge");
  if (skuBadge) skuBadge.textContent = sku;

  const barcodeSvgWrap = $("#stockDetailBarcodeSvg");
  if (barcodeSvgWrap) {
    barcodeSvgWrap.innerHTML = generateCode128BarcodeSVG(sku, {
      moduleWidth: 2,
      barHeight: 46,
      showText: true,
      displayText: sku,
    });
  }

  const printBtn = $("#modalStockPrintBarcodesBtn");
  if (printBtn) {
    printBtn.onclick = () => {
      $("#stockDetailModal").classList.add("hidden");
      openStockBarcodeModal(s.id);
    };
  }

  if (me.role !== "founder") {
    $("#modalStockName").disabled = true;
    $("#modalStockSku").disabled = true;
    $("#modalStockPrice").disabled = true;
  } else {
    $("#modalStockName").disabled = false;
    $("#modalStockSku").disabled = false;
    $("#modalStockPrice").disabled = false;
  }

  const delWrap = $("#modalStockDeleteWrap");
  if (me.role === "founder") {
    delWrap.style.display = "block";
    $("#modalStockDeleteBtn").onclick = async () => {
      if (confirm("Remove this item from stock permanently?")) {
        await api(`/api/stock/${s.id}`, "DELETE");
        $("#stockDetailModal").classList.add("hidden");
        loadStock();
      }
    };
  } else {
    delWrap.style.display = "none";
  }

  $("#stockDetailModal").classList.remove("hidden");
}

$("#modalStockQtyMinus").addEventListener("click", () => {
  const input = $("#modalStockQty");
  const val = Math.max(0, (Number(input.value) || 0) - 1);
  input.value = val;
});

$("#modalStockQtyPlus").addEventListener("click", () => {
  const input = $("#modalStockQty");
  input.value = (Number(input.value) || 0) + 1;
});

$("#stockDetailForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeStockDetailId) return;
  try {
    const payload = me.role === "founder"
      ? {
          itemName: $("#modalStockName").value.trim(),
          sku: $("#modalStockSku").value.trim(),
          price: Number($("#modalStockPrice").value),
          quantity: Number($("#modalStockQty").value),
        }
      : {
          quantity: Number($("#modalStockQty").value),
        };
    await api(`/api/stock/${activeStockDetailId}`, "PUT", payload);
    $("#stockDetailModal").classList.add("hidden");
    loadStock();
  } catch (err) {
    alert(err.message);
  }
});

async function loadStock() {
  allStock = await api("/api/stock");
  const body = $("#stockBody");
  body.innerHTML = "";
  $("#stockEmpty").classList.toggle("hidden", allStock.length > 0);

  allStock.forEach((s) => {
    const sku = formatStockSku(s);
    const tr = document.createElement("tr");
    tr.className = "clickable-row";
    tr.innerHTML = `
      <td data-label="Item" style="font-family:var(--font);font-weight:600">${escapeHtml(s.itemName)}</td>
      <td data-label="SKU"><span class="stock-sku-badge">${escapeHtml(sku)}</span></td>
      <td data-label="Qty"><input type="number" min="0" value="${s.quantity}" data-qty-id="${s.id}" style="width:80px;font-size:13px;padding:5px 8px" /></td>
      <td data-label="Price" style="font-weight:600">${money(s.price)} EGP</td>
      <td>
        <div style="display:flex;gap:6px;align-items:center;">
          <button type="button" class="barcode-action-btn" data-barcode-stock="${s.id}" title="Print Barcodes (e.g. 60x)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="vertical-align:middle"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8v8"/><path d="M10 8v8"/><path d="M14 8v8"/><path d="M17 8v8"/></svg>
            Barcodes
          </button>
          ${me.role === "founder" ? `<button class="icon-btn" data-del-stock="${s.id}" title="Remove">✕</button>` : ""}
        </div>
      </td>
    `;

    tr.addEventListener("click", (evt) => {
      if (evt.target.closest("input") || evt.target.closest("[data-del-stock]") || evt.target.closest("[data-barcode-stock]")) return;
      openStockDetail(s.id);
    });

    body.appendChild(tr);
  });

  body.querySelectorAll("[data-qty-id]").forEach((input) => {
    input.addEventListener("change", async (evt) => {
      evt.stopPropagation();
      await api(`/api/stock/${input.dataset.qtyId}`, "PUT", { quantity: Number(input.value) });
    });
  });
  body.querySelectorAll("[data-del-stock]").forEach((btn) => {
    btn.addEventListener("click", async (evt) => {
      evt.stopPropagation();
      if (confirm("Remove this item from stock?")) {
        await api(`/api/stock/${btn.dataset.delStock}`, "DELETE");
        loadStock();
      }
    });
  });
  body.querySelectorAll("[data-barcode-stock]").forEach((btn) => {
    btn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      openStockBarcodeModal(btn.dataset.barcodeStock);
    });
  });
}

$("#openAddStock").addEventListener("click", () => {
  $("#stkName").value = "";
  $("#stkSku").value = "";
  $("#stkQty").value = "0";
  $("#stkPrice").value = "0";
  $("#stockModal").classList.remove("hidden");
});

$("#stockForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/api/stock", "POST", {
    itemName: $("#stkName").value.trim(),
    sku: $("#stkSku").value.trim() || undefined,
    quantity: Number($("#stkQty").value),
    price: Number($("#stkPrice").value),
  });
  e.target.reset();
  $("#stockModal").classList.add("hidden");
  loadStock();
});

/* ─── PRINT STOCK BARCODES MODAL & GENERATION ──────────────────── */
function openStockBarcodeModal(stockId) {
  const s = allStock.find((item) => String(item.id) === String(stockId));
  if (!s) return;
  activeBarcodeStockItem = s;

  const sku = formatStockSku(s);
  $("#barcodeModalItemName").textContent = s.itemName;
  $("#barcodeModalSku").textContent = sku;
  $("#barcodeModalPrice").textContent = money(s.price) + " EGP";
  $("#barcodeModalStock").textContent = `Qty: ${s.quantity} in stock`;

  const matchChip = $("#barcodeChipMatchStock");
  if (matchChip) {
    matchChip.textContent = s.quantity > 0 ? `Stock (${s.quantity})` : "Stock (0)";
  }

  updateBarcodeLivePreview();
  $("#stockBarcodeModal").classList.remove("hidden");
}

function updateBarcodeLivePreview() {
  if (!activeBarcodeStockItem) return;
  const s = activeBarcodeStockItem;
  const sku = formatStockSku(s);

  const showBrand  = $("#optShowBrand")?.checked ?? true;
  const showIg     = $("#optShowIg")?.checked ?? true;
  const showName   = $("#optShowName")?.checked ?? true;
  const showPrice  = $("#optShowPrice")?.checked ?? true;
  const showSku    = $("#optShowSku")?.checked ?? true;
  const showBorder = $("#optShowBorder")?.checked ?? true;

  const qtyInput = $("#barcodePrintQty");
  let qty = parseInt(qtyInput.value, 10);
  if (isNaN(qty) || qty < 1) qty = 1;

  const layout = $("#barcodeSheetLayout")?.value || "a4-60";

  // Calculate pages estimate
  const estimateEl = $("#barcodeTotalPagesEstimate");
  if (estimateEl) {
    if (layout === "thermal") {
      estimateEl.textContent = `${qty} Label${qty > 1 ? "s" : ""} on Roll`;
    } else {
      let perSheet = 60;
      let paperLabel = "A4 Sheet";
      if (layout === "a4-60" || layout === "60") { perSheet = 60; paperLabel = "A4 Sheet"; }
      else if (layout === "a4-30" || layout === "30") { perSheet = 30; paperLabel = "A4 Sheet"; }
      else if (layout === "a4-24" || layout === "24") { perSheet = 24; paperLabel = "A4 Sheet"; }
      else if (layout === "a4-12" || layout === "12") { perSheet = 12; paperLabel = "A4 Sheet"; }
      else if (layout === "a5-30") { perSheet = 30; paperLabel = "A5 Sheet"; }
      else if (layout === "a5-20") { perSheet = 20; paperLabel = "A5 Sheet"; }
      else if (layout === "a5-12") { perSheet = 12; paperLabel = "A5 Sheet"; }
      else if (layout === "a5-8")  { perSheet = 8;  paperLabel = "A5 Sheet"; }

      const sheets = Math.ceil(qty / perSheet);
      estimateEl.textContent = `${sheets} ${paperLabel}${sheets > 1 ? "s" : ""} (${qty} labels total)`;
    }
  }

  // Update confirm button text with SVG icon
  const confirmBtn = $("#confirmPrintBarcodesBtn");
  if (confirmBtn) {
    confirmBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      <span>Print ${qty} Barcode${qty > 1 ? "s" : ""}</span>
    `;
  }

  // Render live single label mockup
  const mockupEl = $("#barcodeLiveMockup");
  if (mockupEl) {
    mockupEl.classList.toggle("has-mockup-border", showBorder);
    
    // Barcode SVG for mockup preview
    const svgCode = generateCode128BarcodeSVG(sku, {
      moduleWidth: 1.5,
      barHeight: 30,
      showText: false,
      quietModules: 6,
    });

    mockupEl.innerHTML = `
      ${(showBrand || showIg || showName || showPrice) ? `
      <div class="mockup-header">
        <div class="mockup-product-info">
          ${showBrand ? `<span class="mockup-brand-tag">STATIC</span>` : ""}
          ${showIg ? `<span class="mockup-ig-tag">@static._.eg</span>` : ""}
          ${showName ? `<span class="mockup-item-title" title="${escapeHtml(s.itemName)}">${escapeHtml(s.itemName)}</span>` : ""}
        </div>
        ${showPrice ? `<span class="mockup-price-badge">${money(s.price)} <small>EGP</small></span>` : ""}
      </div>` : ""}
      <div class="mockup-barcode-container">${svgCode}</div>
      ${showSku ? `<div class="mockup-sku-text">${escapeHtml(sku)}</div>` : ""}
    `;
  }
}

// Preset Qty Chips
document.querySelectorAll("#barcodeQtyChips .qty-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#barcodeQtyChips .qty-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    const val = chip.dataset.qty;
    if (val === "match") {
      $("#barcodePrintQty").value = activeBarcodeStockItem ? Math.max(1, activeBarcodeStockItem.quantity) : 1;
    } else {
      $("#barcodePrintQty").value = val;
    }
    updateBarcodeLivePreview();
  });
});

$("#barcodePrintQty").addEventListener("input", () => {
  document.querySelectorAll("#barcodeQtyChips .qty-chip").forEach((c) => c.classList.remove("active"));
  updateBarcodeLivePreview();
});

$("#barcodeSheetLayout").addEventListener("change", updateBarcodeLivePreview);

["optShowBrand", "optShowIg", "optShowName", "optShowPrice", "optShowSku", "optShowBorder"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", updateBarcodeLivePreview);
});

$("#confirmPrintBarcodesBtn").addEventListener("click", () => {
  if (!activeBarcodeStockItem) return;
  const qty = Math.max(1, parseInt($("#barcodePrintQty").value, 10) || 60);
  const layout = $("#barcodeSheetLayout").value || "a4-60";
  const options = {
    showBrand:  $("#optShowBrand").checked,
    showIg:     $("#optShowIg") ? $("#optShowIg").checked : true,
    showName:   $("#optShowName").checked,
    showPrice:  $("#optShowPrice").checked,
    showSku:    $("#optShowSku").checked,
    showBorder: $("#optShowBorder").checked,
  };

  $("#stockBarcodeModal").classList.add("hidden");
  printStockBarcodesSheet(activeBarcodeStockItem, qty, layout, options);
});

function printStockBarcodesSheet(item, qty, layout, options = {}) {
  // Clear any scroll lock
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";

  const sku = formatStockSku(item);
  const section = $("#printSection");
  if (!section) return;

  const showBrand  = options.showBrand !== false;
  const showIg     = options.showIg !== false;
  const showName   = options.showName !== false;
  const showPrice  = options.showPrice !== false;
  const showSku    = options.showSku !== false;
  const showBorder = options.showBorder !== false;

  // Determine SVG barHeight & moduleWidth based on layout density
  let barHeight = 20;
  let moduleWidth = 1.15;
  let paperClass = "sheet-paper-a4";
  let gridClass = "sheet-grid-a4-60";

  if (layout === "a4-60" || layout === "60") {
    barHeight = 15;
    moduleWidth = 1.0;
    paperClass = "sheet-paper-a4";
    gridClass = "sheet-grid-a4-60";
  } else if (layout === "a4-30" || layout === "30") {
    barHeight = 20;
    moduleWidth = 1.15;
    paperClass = "sheet-paper-a4";
    gridClass = "sheet-grid-a4-30";
  } else if (layout === "a4-24" || layout === "24") {
    barHeight = 24;
    moduleWidth = 1.25;
    paperClass = "sheet-paper-a4";
    gridClass = "sheet-grid-a4-24";
  } else if (layout === "a4-12" || layout === "12") {
    barHeight = 34;
    moduleWidth = 1.55;
    paperClass = "sheet-paper-a4";
    gridClass = "sheet-grid-a4-12";
  } else if (layout === "a5-30") {
    barHeight = 15;
    moduleWidth = 1.0;
    paperClass = "sheet-paper-a5";
    gridClass = "sheet-grid-a5-30";
  } else if (layout === "a5-20") {
    barHeight = 18;
    moduleWidth = 1.1;
    paperClass = "sheet-paper-a5";
    gridClass = "sheet-grid-a5-20";
  } else if (layout === "a5-12") {
    barHeight = 24;
    moduleWidth = 1.25;
    paperClass = "sheet-paper-a5";
    gridClass = "sheet-grid-a5-12";
  } else if (layout === "a5-8") {
    barHeight = 32;
    moduleWidth = 1.45;
    paperClass = "sheet-paper-a5";
    gridClass = "sheet-grid-a5-8";
  } else if (layout === "thermal") {
    barHeight = 24;
    moduleWidth = 1.25;
    paperClass = "sheet-paper-thermal";
    gridClass = "sheet-grid-thermal";
  }

  // Pre-generate the crisp SVG barcode once for optimal speed
  const singleBarcodeSvg = generateCode128BarcodeSVG(sku, {
    moduleWidth,
    barHeight,
    showText: false,
    quietModules: 6,
  });

  const cells = [];
  for (let i = 0; i < qty; i++) {
    cells.push(`
      <div class="barcode-sticker-cell ${showBorder ? 'has-border' : ''}">
        ${(showBrand || showIg || showName || showPrice) ? `
        <div class="sticker-header">
          <div class="sticker-product-info">
            ${showBrand ? `<span class="sticker-brand-tag">STATIC</span>` : ""}
            ${showIg ? `<span class="sticker-ig-tag">@static._.eg</span>` : ""}
            ${showName ? `<span class="sticker-item-title">${escapeHtml(item.itemName)}</span>` : ""}
          </div>
          ${showPrice ? `<span class="sticker-price-badge">${money(item.price)} <small>EGP</small></span>` : ""}
        </div>` : ""}
        <div class="sticker-barcode-container">${singleBarcodeSvg}</div>
        ${showSku ? `<div class="sticker-sku-text">${escapeHtml(sku)}</div>` : ""}
      </div>
    `);
  }

  section.innerHTML = `
    <div class="print-barcode-sheet ${paperClass} ${gridClass}">
      ${cells.join("")}
    </div>
  `;

  setTimeout(() => {
    window.print();
  }, 100);

  const cleanup = () => {
    section.innerHTML = "";
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 4000);
}

/* ─── EXPENSES ─────────────────────────────────────────────────── */
const CAT_ICON = {
  Ads:        '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>',
  Printing:   '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v6a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9h8v3H6v-3zm8-4a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd"/></svg>',
  Packaging:  '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z"/><path fill-rule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>',
  Delivery:   '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/><path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h.09A2.5 2.5 0 018 14.5h4A2.5 2.5 0 0116.91 16H17a1 1 0 001-1v-5l-3.04-4.56A1 1 0 0014.12 5H3zm7 5V7h4.12l2.02 3H10V9z"/></svg>',
  Operations: '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>',
  Other:      '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd"/></svg>',
};

const CAT_CHIPS = {
  Ads:        `<span class="cat-chip cat-chip-ads">${CAT_ICON.Ads} Ads</span>`,
  Printing:   `<span class="cat-chip cat-chip-printing">${CAT_ICON.Printing} Printing</span>`,
  Packaging:  `<span class="cat-chip cat-chip-packaging">${CAT_ICON.Packaging} Packaging</span>`,
  Delivery:   `<span class="cat-chip cat-chip-delivery">${CAT_ICON.Delivery} Delivery</span>`,
  Operations: `<span class="cat-chip cat-chip-operations">${CAT_ICON.Operations} Operations</span>`,
  Other:      `<span class="cat-chip cat-chip-other">${CAT_ICON.Other} Other</span>`,
};

function egp(n) {
  return Number(n || 0).toLocaleString("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EGP";
}

async function loadExpenses() {
  allExpenses = await api("/api/expenses");
  renderExpenses();
  renderSummary();
  renderBrandFunds();
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

function openExpenseDetail(expId) {
  const exp = allExpenses.find((item) => String(item.id) === String(expId));
  if (!exp) return;

  $("#detailCatChip").innerHTML = CAT_CHIPS[exp.category] || escapeHtml(exp.category);
  $("#detailAmount").textContent = egp(exp.amount);
  $("#detailDesc").textContent = exp.description || "—";
  $("#detailLoggedBy").textContent = exp.loggedBy || "—";
  $("#detailDate").textContent = formatDate12h(exp.createdAt);
  $("#detailNote").textContent = exp.note || "No note added";

  const delWrap = $("#modalExpenseDeleteWrap");
  if (me.role === "founder") {
    delWrap.style.display = "block";
    $("#modalExpenseDeleteBtn").onclick = async () => {
      if (confirm("Delete this expense entry permanently?")) {
        await api(`/api/expenses/${exp.id}`, "DELETE");
        $("#expenseDetailModal").classList.add("hidden");
        loadExpenses();
      }
    };
  } else {
    delWrap.style.display = "none";
  }

  $("#expenseDetailModal").classList.remove("hidden");
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
    tr.className = "clickable-row";
    const initial = (e.loggedBy || "?").charAt(0).toUpperCase();
    tr.innerHTML = `
      <td data-label="Category">${CAT_CHIPS[e.category] || escapeHtml(e.category)}</td>
      <td data-label="Description" style="font-family:var(--font);font-weight:500;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(e.description)}">${escapeHtml(e.description)}</td>
      <td data-label="Amount" class="amount-cell">${egp(e.amount)}</td>
      <td data-label="Logged by">
        <div class="logged-by-cell">
          <div class="mini-avatar">${escapeHtml(initial)}</div>
          <span style="font-family:var(--font);font-size:12.5px">${escapeHtml(e.loggedBy || "—")}</span>
        </div>
      </td>
      <td data-label="Note" class="note-cell" style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(e.note || "")}">${e.note ? escapeHtml(e.note) : '<span style="opacity:0.35">—</span>'}</td>
      <td data-label="Date" style="white-space:nowrap">${formatDate12h(e.createdAt)}</td>
      <td>${me.role === "founder" ? `<button class="icon-btn" data-del-expense="${e.id}" title="Delete">✕</button>` : ""}</td>
    `;

    tr.addEventListener("click", (evt) => {
      if (evt.target.closest("[data-del-expense]")) return;
      openExpenseDetail(e.id);
    });

    body.appendChild(tr);
  });

  body.querySelectorAll("[data-del-expense]").forEach((btn) => {
    btn.addEventListener("click", async (evt) => {
      evt.stopPropagation();
      if (confirm("Delete this expense entry?")) {
        await api(`/api/expenses/${btn.dataset.delExpense}`, "DELETE");
        loadExpenses();
      }
    });
  });
}

/* ─── BRAND EXPENSES (COMPANY MONEY) ────────────────────────── */
async function loadBrandExpenses() {
  allBrandExpenses = await api("/api/brand-expenses");
  renderBrandExpenses();
  renderBrandSummary();
  renderBrandFunds();
}

function renderBrandSummary() {
  const cats = ["Ads", "Printing", "Packaging", "Delivery", "Operations", "Other"];
  const totals = { all: 0 };
  cats.forEach((c) => (totals[c] = 0));
  allBrandExpenses.forEach((e) => {
    totals.all += e.amount;
    if (totals[e.category] !== undefined) totals[e.category] += e.amount;
  });
  $("#totalBrandAll").textContent        = egp(totals.all);
  $("#totalBrandAds").textContent        = egp(totals.Ads);
  $("#totalBrandPrinting").textContent   = egp(totals.Printing);
  $("#totalBrandPackaging").textContent  = egp(totals.Packaging);
  $("#totalBrandDelivery").textContent   = egp(totals.Delivery);
  $("#totalBrandOperations").textContent = egp(totals.Operations);
}

function openBrandExpenseDetail(expId) {
  const exp = allBrandExpenses.find((item) => String(item.id) === String(expId));
  if (!exp) return;

  $("#brandDetailCatChip").innerHTML = CAT_CHIPS[exp.category] || escapeHtml(exp.category);
  $("#brandDetailAmount").textContent = egp(exp.amount);
  $("#brandDetailDesc").textContent = exp.description || "—";
  $("#brandDetailLoggedBy").textContent = exp.loggedBy || "—";
  $("#brandDetailDate").textContent = formatDate12h(exp.createdAt);
  $("#brandDetailNote").textContent = exp.note || "No note added";

  const delWrap = $("#modalBrandExpenseDeleteWrap");
  if (me.role === "founder") {
    delWrap.style.display = "block";
    $("#modalBrandExpenseDeleteBtn").onclick = async () => {
      if (confirm("Delete this brand expense entry permanently?")) {
        await api(`/api/brand-expenses/${exp.id}`, "DELETE");
        $("#brandExpenseDetailModal").classList.add("hidden");
        loadBrandExpenses();
      }
    };
  } else {
    delWrap.style.display = "none";
  }

  $("#brandExpenseDetailModal").classList.remove("hidden");
}

function renderBrandExpenses() {
  const filtered = activeBrandFilter === "all"
    ? allBrandExpenses
    : allBrandExpenses.filter((e) => e.category === activeBrandFilter);

  const body = $("#brandExpensesBody");
  body.innerHTML = "";
  $("#brandExpensesEmpty").classList.toggle("hidden", filtered.length > 0);

  filtered.slice().reverse().forEach((e) => {
    const tr = document.createElement("tr");
    tr.className = "clickable-row";
    const initial = (e.loggedBy || "?").charAt(0).toUpperCase();
    tr.innerHTML = `
      <td data-label="Category">${CAT_CHIPS[e.category] || escapeHtml(e.category)}</td>
      <td data-label="Description" style="font-family:var(--font);font-weight:500;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(e.description)}">${escapeHtml(e.description)}</td>
      <td data-label="Amount" class="amount-cell" style="color:#C58A36;font-weight:700">${egp(e.amount)}</td>
      <td data-label="Logged by">
        <div class="logged-by-cell">
          <div class="mini-avatar">${escapeHtml(initial)}</div>
          <span style="font-family:var(--font);font-size:12.5px">${escapeHtml(e.loggedBy || "—")}</span>
        </div>
      </td>
      <td data-label="Note" class="note-cell" style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(e.note || "")}">${e.note ? escapeHtml(e.note) : '<span style="opacity:0.35">—</span>'}</td>
      <td data-label="Date" style="white-space:nowrap">${formatDate12h(e.createdAt)}</td>
      <td>${me.role === "founder" ? `<button class="icon-btn" data-del-brand-expense="${e.id}" title="Delete">✕</button>` : ""}</td>
    `;

    tr.addEventListener("click", (evt) => {
      if (evt.target.closest("[data-del-brand-expense]")) return;
      openBrandExpenseDetail(e.id);
    });

    body.appendChild(tr);
  });

  body.querySelectorAll("[data-del-brand-expense]").forEach((btn) => {
    btn.addEventListener("click", async (evt) => {
      evt.stopPropagation();
      if (confirm("Delete this brand expense entry?")) {
        await api(`/api/brand-expenses/${btn.dataset.delBrandExpense}`, "DELETE");
        loadBrandExpenses();
      }
    });
  });
}

/* ─── REVENUE ─────────────────────────────────────────────────── */
let allRevenue = [];
let activeRevFilter = "all";

const REV_CAT_ICON = {
  Orders:              '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/></svg>',
  Stickers:            '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>',
  Posters:             '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/></svg>',
  "Mail Subscription": '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>',
  Other:               '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd"/></svg>',
};

const REV_CAT_CHIPS = {
  Orders:              `<span class="cat-chip cat-chip-orders">${REV_CAT_ICON.Orders} Orders</span>`,
  Stickers:            `<span class="cat-chip cat-chip-stickers">${REV_CAT_ICON.Stickers} Stickers</span>`,
  Posters:             `<span class="cat-chip cat-chip-posters">${REV_CAT_ICON.Posters} Posters</span>`,
  "Mail Subscription": `<span class="cat-chip cat-chip-mail">${REV_CAT_ICON["Mail Subscription"]} Mail Sub</span>`,
  Other:               `<span class="cat-chip cat-chip-other">${REV_CAT_ICON.Other} Other</span>`,
};

async function loadRevenue() {
  allRevenue = await api("/api/revenue");
  renderRevenue();
  renderRevenueSummary();
  renderBrandFunds();
}

function renderRevenueSummary() {
  const totals = { all: 0, Stickers: 0, Posters: 0, "Mail Subscription": 0, Other: 0 };
  allRevenue.forEach((r) => {
    totals.all += r.amount;
    if (totals[r.category] !== undefined) totals[r.category] += r.amount;
  });
  $("#totalRevAll").textContent   = egp(totals.all);
  $("#totalStickers").textContent = egp(totals.Stickers);
  $("#totalPosters").textContent  = egp(totals.Posters);
  $("#totalMail").textContent     = egp(totals["Mail Subscription"]);
  $("#totalOther").textContent    = egp(totals.Other);
}

function openRevenueDetail(revId) {
  const rev = allRevenue.find((item) => String(item.id) === String(revId));
  if (!rev) return;

  $("#revDetailCatChip").innerHTML = REV_CAT_CHIPS[rev.category] || escapeHtml(rev.category);
  $("#revDetailAmount").textContent = egp(rev.amount);
  $("#revDetailDesc").textContent = rev.description || "—";
  $("#revDetailCollectedBy").textContent = rev.collectedBy || "—";
  $("#revDetailDate").textContent = formatDate12h(rev.createdAt);
  $("#revDetailNote").textContent = rev.note || "No note added";

  const delWrap = $("#modalRevenueDeleteWrap");
  const editWrap = $("#modalRevenueEditWrap");
  if (me.role === "founder") {
    delWrap.style.display = "block";
    $("#modalRevenueDeleteBtn").onclick = async () => {
      if (confirm("Delete this revenue entry permanently?")) {
        await api(`/api/revenue/${rev.id}`, "DELETE");
        $("#revenueDetailModal").classList.add("hidden");
        loadRevenue();
      }
    };
    if (editWrap) {
      editWrap.style.display = "block";
      $("#modalRevenueEditBtn").onclick = () => {
        $("#revenueDetailModal").classList.add("hidden");
        openEditRevenueModal(rev.id);
      };
    }
  } else {
    delWrap.style.display = "none";
    if (editWrap) editWrap.style.display = "none";
  }

  $("#revenueDetailModal").classList.remove("hidden");
}

function renderRevenue() {
  const filtered = activeRevFilter === "all"
    ? allRevenue
    : allRevenue.filter((r) => r.category === activeRevFilter);

  const body = $("#revenueBody");
  body.innerHTML = "";
  $("#revenueEmpty").classList.toggle("hidden", filtered.length > 0);

  filtered.slice().reverse().forEach((r) => {
    const tr = document.createElement("tr");
    tr.className = "clickable-row";
    const initial = (r.collectedBy || "?").charAt(0).toUpperCase();
    tr.innerHTML = `
      <td data-label="Category">${REV_CAT_CHIPS[r.category] || escapeHtml(r.category)}</td>
      <td data-label="Description" style="font-family:var(--font);font-weight:500;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.description)}">${escapeHtml(r.description)}</td>
      <td data-label="Amount" class="amount-cell" style="color:var(--success, #528265);font-weight:700">${egp(r.amount)}</td>
      <td data-label="Collected by">
        <div class="logged-by-cell">
          <div class="mini-avatar">${escapeHtml(initial)}</div>
          <span style="font-family:var(--font);font-size:12.5px">${escapeHtml(r.collectedBy || "—")}</span>
        </div>
      </td>
      <td data-label="Note" class="note-cell" style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.note || "")}">${r.note ? escapeHtml(r.note) : '<span style="opacity:0.35">—</span>'}</td>
      <td data-label="Date" style="white-space:nowrap">${formatDate12h(r.createdAt)}</td>
      <td>${me.role === "founder" ? `<button class="icon-btn" data-del-revenue="${r.id}" title="Delete">✕</button>` : ""}</td>
    `;

    tr.addEventListener("click", (evt) => {
      if (evt.target.closest("[data-del-revenue]")) return;
      openRevenueDetail(r.id);
    });

    body.appendChild(tr);
  });

  body.querySelectorAll("[data-del-revenue]").forEach((btn) => {
    btn.addEventListener("click", async (evt) => {
      evt.stopPropagation();
      if (confirm("Delete this revenue entry?")) {
        await api(`/api/revenue/${btn.dataset.delRevenue}`, "DELETE");
        loadRevenue();
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
  const section = $("#printSection");
  const label   = PERIOD_LABEL[period] || "";
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const byStr   = me ? me.username : "";

  if (type === "orders") {
    const data = filterByPeriod(allOrders, period);
    const totalRevenue = data.reduce((s, o) =>
      s + (o.items || []).reduce((si, it) => si + it.qty * it.price, 0) + Number(o.shippingPrice || 0), 0);
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
      <div class="print-totals-grid">
        <div class="print-total-item"><span class="print-total-label">Total Orders</span><span class="print-total-amount print-total-main">${data.length}</span></div>
        <div class="print-total-item"><span class="print-total-label">Total Revenue</span><span class="print-total-amount print-total-main">${money(totalRevenue)} EGP</span></div>
        <div class="print-total-item"><span class="print-total-label">Paid</span><span class="print-total-amount">${paid}</span></div>
        <div class="print-total-item"><span class="print-total-label">Delivered</span><span class="print-total-amount">${delivered}</span></div>
      </div>
      <div class="print-divider"></div>
      <table class="print-report-table">
        <thead>
          <tr><th>#</th><th>Customer</th><th>Phone</th><th>Items</th><th>Address</th><th>Total</th><th>Shipping</th><th>Payment</th><th>Delivery</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${data.map((o, i) => {
            const tot = (o.items||[]).reduce((s,it)=>s+it.qty*it.price,0) + Number(o.shippingPrice||0);
            const its = (o.items||[]).map(it=>`${it.name} x${it.qty}`).join(", ") || "—";
            return `<tr>
              <td>${i+1}</td><td>${escapeHtml(o.customerName)}</td><td>${escapeHtml(o.phone||"—")}</td>
              <td>${escapeHtml(its)}</td><td>${escapeHtml(o.address||"—")}</td>
              <td><strong>${money(tot)} EGP</strong></td><td>${money(o.shippingPrice)} EGP</td>
              <td style="text-transform:capitalize">${o.paymentStatus}</td>
              <td style="text-transform:capitalize">${o.deliveryStatus}</td>
              <td>${formatDate12h(o.createdAt)}</td>
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
      <div class="print-totals-grid">
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
            <td>${i+1}</td><td>${escapeHtml(e.category)}</td><td>${escapeHtml(e.description)}</td>
            <td><strong>${egp(e.amount)}</strong></td><td>${escapeHtml(e.loggedBy||"—")}</td>
            <td>${escapeHtml(e.note||"—")}</td>
            <td>${formatDate12h(e.createdAt)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${data.length === 0 ? '<p style="text-align:center;color:#888;padding:24px">No expenses found for this period.</p>' : ""}
    `;
  } else if (type === "brand-expenses") {
    const data = filterByPeriod(allBrandExpenses, period);
    const cats = ["Ads", "Printing", "Packaging", "Delivery", "Operations", "Other"];
    const totals = { all: 0 };
    cats.forEach((c) => (totals[c] = 0));
    data.forEach((e) => {
      totals.all += e.amount;
      if (totals[e.category] !== undefined) totals[e.category] += e.amount;
    });

    section.innerHTML = `
      <div class="print-brand">
        <div class="print-brand-name">STATIC</div>
        <div class="print-brand-sub">Brand Expenses Report (Company Funds) &mdash; ${label}</div>
      </div>
      <div class="print-meta">
        <div>Generated: ${dateStr}</div>
        <div>By: ${escapeHtml(byStr)}</div>
        <div>Period: ${label}</div>
      </div>
      <div class="print-totals-grid">
        <div class="print-total-item"><span class="print-total-label">Total Brand Spent</span><span class="print-total-amount print-total-main">${egp(totals.all)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Ads</span><span class="print-total-amount">${egp(totals.Ads)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Printing</span><span class="print-total-amount">${egp(totals.Printing)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Packaging</span><span class="print-total-amount">${egp(totals.Packaging)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Delivery</span><span class="print-total-amount">${egp(totals.Delivery)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Operations</span><span class="print-total-amount">${egp(totals.Operations)}</span></div>
      </div>
      <div class="print-divider"></div>
      <table class="print-report-table">
        <thead>
          <tr><th>#</th><th>Category</th><th>Description</th><th>Amount</th><th>Logged by</th><th>Note</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${data.slice().reverse().map((e, i) => `<tr>
            <td>${i+1}</td><td>${escapeHtml(e.category)}</td><td>${escapeHtml(e.description)}</td>
            <td><strong>${egp(e.amount)}</strong></td><td>${escapeHtml(e.loggedBy||"—")}</td>
            <td>${escapeHtml(e.note||"—")}</td>
            <td>${formatDate12h(e.createdAt)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${data.length === 0 ? '<p style="text-align:center;color:#888;padding:24px">No brand expenses found for this period.</p>' : ""}
    `;
  } else if (type === "revenue") {
    const data = filterByPeriod(allRevenue, period);
    const totals = { all: 0, Stickers: 0, Posters: 0, "Mail Subscription": 0, Other: 0 };
    data.forEach((r) => {
      totals.all += r.amount;
      if (totals[r.category] !== undefined) totals[r.category] += r.amount;
    });

    section.innerHTML = `
      <div class="print-brand">
        <div class="print-brand-name">STATIC</div>
        <div class="print-brand-sub">Revenue Report &mdash; ${label}</div>
      </div>
      <div class="print-meta">
        <div>Generated: ${dateStr}</div>
        <div>By: ${escapeHtml(byStr)}</div>
        <div>Period: ${label}</div>
      </div>
      <div class="print-totals-grid">
        <div class="print-total-item"><span class="print-total-label">Total Revenue</span><span class="print-total-amount print-total-main">${egp(totals.all)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Stickers</span><span class="print-total-amount">${egp(totals.Stickers)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Posters</span><span class="print-total-amount">${egp(totals.Posters)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Mail Sub</span><span class="print-total-amount">${egp(totals["Mail Subscription"])}</span></div>
        <div class="print-total-item"><span class="print-total-label">Other</span><span class="print-total-amount">${egp(totals.Other)}</span></div>
      </div>
      <div class="print-divider"></div>
      <table class="print-report-table">
        <thead>
          <tr><th>#</th><th>Category</th><th>Description</th><th>Amount</th><th>Collected by</th><th>Note</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${data.slice().reverse().map((r, i) => `<tr>
            <td>${i+1}</td><td>${escapeHtml(r.category)}</td><td>${escapeHtml(r.description)}</td>
            <td><strong>${egp(r.amount)}</strong></td><td>${escapeHtml(r.collectedBy||"—")}</td>
            <td>${escapeHtml(r.note||"—")}</td>
            <td>${formatDate12h(r.createdAt)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${data.length === 0 ? '<p style="text-align:center;color:#888;padding:24px">No revenue found for this period.</p>' : ""}
    `;
  } else if (type === "brand-funds") {
    const revData = filterByPeriod(allRevenue, period);
    const expData = filterByPeriod(allBrandExpenses, period);
    const totalRev = revData.reduce((s, r) => s + r.amount, 0);
    const totalExp = expData.reduce((s, e) => s + e.amount, 0);
    const netFunds = totalRev - totalExp;

    const txs = [
      ...revData.map(r => ({ type: "Inflow", ...r })),
      ...expData.map(e => ({ type: "Outflow", ...e }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    section.innerHTML = `
      <div class="print-brand">
        <div class="print-brand-name">STATIC</div>
        <div class="print-brand-sub">Brand Funds & Treasury Report &mdash; ${label}</div>
      </div>
      <div class="print-meta">
        <div>Generated: ${dateStr}</div>
        <div>By: ${escapeHtml(byStr)}</div>
        <div>Period: ${label}</div>
      </div>
      <div class="print-totals-grid">
        <div class="print-total-item"><span class="print-total-label">Net Available Funds</span><span class="print-total-amount print-total-main">${egp(netFunds)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Total Revenue Inflow</span><span class="print-total-amount" style="color:#2E7D32">${egp(totalRev)}</span></div>
        <div class="print-total-item"><span class="print-total-label">Brand Expenses Outflow</span><span class="print-total-amount" style="color:#C58A36">${egp(totalExp)}</span></div>
      </div>
      <div class="print-divider"></div>
      <table class="print-report-table">
        <thead>
          <tr><th>#</th><th>Flow</th><th>Category</th><th>Description</th><th>Amount</th><th>Logged by</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${txs.map((t, i) => `<tr>
            <td>${i+1}</td>
            <td><strong>${t.type}</strong></td>
            <td>${escapeHtml(t.category)}</td>
            <td>${escapeHtml(t.description)}</td>
            <td style="color:${t.type === 'Inflow' ? '#2E7D32' : '#C58A36'}"><strong>${t.type === 'Inflow' ? '+' : '−'}${egp(Math.abs(t.amount))}</strong></td>
            <td>${escapeHtml(t.collectedBy || t.loggedBy || "—")}</td>
            <td>${formatDate12h(t.createdAt)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${txs.length === 0 ? '<p style="text-align:center;color:#888;padding:24px">No transactions recorded for this period.</p>' : ""}
    `;
  }

  setTimeout(() => {
    window.print();
  }, 50);

  window.addEventListener("afterprint", () => {
    section.innerHTML = "";
  }, { once: true });
}

/* ─── CUSTOMER RECEIPT ───────────────────────────────────────── */
function printOrderReceipt(orderId) {
  const o = allOrders.find((item) => String(item.id) === String(orderId));
  if (!o) return;

  // Clear any potential scroll lock from open modals/sidebars
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";

  const itemsSubtotal = (o.items || []).reduce((sum, it) => sum + it.qty * it.price, 0);
  const shipping      = Number(o.shippingPrice || 0);
  const grandTotal    = itemsSubtotal + shipping;

  const orderDate = new Date(o.createdAt || Date.now());
  const dateFormatted = !isNaN(orderDate.getTime())
    ? orderDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })
    : new Date().toLocaleDateString("en-GB");
  const timeFormatted = !isNaN(orderDate.getTime())
    ? orderDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
    : "";

  const orderCode = formatOrderId(o.id);

  const itemsRows = (o.items && o.items.length > 0)
    ? o.items.map((it) => `
        <div class="receipt-item-line">
          <span class="receipt-item-name">${it.qty} x ${escapeHtml(it.name)}</span>
          <span class="receipt-item-price">${money(it.qty * it.price)} EGP</span>
        </div>
      `).join("")
    : `<div class="receipt-item-line"><span>1 x Custom Order</span><span>${money(grandTotal)} EGP</span></div>`;

  const section = $("#printSection");
  section.innerHTML = `
    <div class="print-receipt">
      <div class="receipt-paper">
        <div class="receipt-stars">****************************************</div>
        <div class="receipt-title">RECEIPT</div>
        <div class="receipt-subtitle">STATIC</div>
        <div class="receipt-stars">****************************************</div>

        <div class="receipt-meta-row">
          <span>Order #${escapeHtml(orderCode)}</span>
          <span>${dateFormatted}  ${timeFormatted}</span>
        </div>
        <div class="receipt-meta-row">
          <span>Customer:</span>
          <span style="font-weight:700;">${escapeHtml(o.customerName || "Customer")}</span>
        </div>
        ${o.phone ? `
        <div class="receipt-meta-row">
          <span>Phone:</span>
          <span>${escapeHtml(o.phone)}</span>
        </div>` : ""}
        ${o.address ? `
        <div class="receipt-meta-row" style="align-items:flex-start;">
          <span>Address:</span>
          <span style="text-align:right;max-width:65%;word-break:break-word;">${escapeHtml(o.address)}</span>
        </div>` : ""}

        <div class="receipt-divider-dash">----------------------------------------</div>

        <div class="receipt-items-list">
          ${itemsRows}
        </div>

        <div class="receipt-divider-dash">----------------------------------------</div>

        <div class="receipt-meta-row">
          <span>Items Subtotal:</span>
          <span style="font-weight:600;">${money(itemsSubtotal)} EGP</span>
        </div>
        <div class="receipt-meta-row">
          <span>Shipping:</span>
          <span style="font-weight:600;">${money(shipping)} EGP</span>
        </div>

        <div class="receipt-divider-dash">----------------------------------------</div>

        <div class="receipt-total-row">
          <span>TOTAL AMOUNT</span>
          <span>${money(grandTotal)} EGP</span>
        </div>

        <div class="receipt-divider-dash">----------------------------------------</div>

        <div class="receipt-thankyou">********** THANK YOU! **********</div>

        <div class="receipt-barcode-wrap">
          ${generateCode128BarcodeSVG(orderCode, { moduleWidth: 2, barHeight: 48, showText: true, displayText: "ORDER #" + orderCode })}
          <div class="receipt-social-link">
            <div class="receipt-ig-handle">@static._.eg</div>
            <div class="receipt-ig-url">instagram.com/static._.eg</div>
          </div>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    window.print();
  }, 120);

  const cleanup = () => {
    section.innerHTML = "";
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 4000);
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
// Print is triggered via the Print ▾ dropdown menus (printReport function above)

/* ─── ADD EXPENSE MODAL ────────────────────────────────────────── */
let selectedCategory = "";

$("#openAddExpense").addEventListener("click", () => {
  selectedCategory = "";
  $("#expCategory").value = "";
  $("#expDescription").value = "";
  $("#expAmount").value = "";
  $("#expNote").value = "";
  $("#expError").textContent = "";
  const group = $("#catPillGroup");
  if (group) group.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("selected"));
  $("#expenseModal").classList.remove("hidden");
});

const expPillGroup = $("#catPillGroup");
if (expPillGroup) {
  expPillGroup.querySelectorAll(".cat-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      expPillGroup.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("selected"));
      pill.classList.add("selected");
      selectedCategory = pill.dataset.val;
      $("#expCategory").value = selectedCategory;
    });
  });
}

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
    if (expPillGroup) expPillGroup.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("selected"));
    $("#expenseModal").classList.add("hidden");
    loadExpenses();
  } catch (err) {
    $("#expError").textContent = err.message;
  }
});

/* ─── BRAND EXPENSE FILTERS & FORM ────────────────────────────── */
document.querySelectorAll("[data-brand-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-brand-filter]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeBrandFilter = btn.dataset.brandFilter;
    renderBrandExpenses();
  });
});

let selectedBrandCategory = "";

const openAddBrandExpenseBtn = $("#openAddBrandExpense");
if (openAddBrandExpenseBtn) {
  openAddBrandExpenseBtn.addEventListener("click", () => {
    selectedBrandCategory = "";
    $("#brandExpCategory").value = "";
    $("#brandExpDescription").value = "";
    $("#brandExpAmount").value = "";
    $("#brandExpNote").value = "";
    $("#brandExpError").textContent = "";
    const group = $("#brandCatPillGroup");
    if (group) group.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("selected"));
    $("#brandExpenseModal").classList.remove("hidden");
  });
}

const brandExpPillGroup = $("#brandCatPillGroup");
if (brandExpPillGroup) {
  brandExpPillGroup.querySelectorAll(".cat-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      brandExpPillGroup.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("selected"));
      pill.classList.add("selected");
      selectedBrandCategory = pill.dataset.val;
      $("#brandExpCategory").value = selectedBrandCategory;
    });
  });
}

const brandExpenseForm = $("#brandExpenseForm");
if (brandExpenseForm) {
  brandExpenseForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#brandExpError").textContent = "";
    if (!selectedBrandCategory) { $("#brandExpError").textContent = "Pick a category first."; return; }
    try {
      await api("/api/brand-expenses", "POST", {
        category: selectedBrandCategory,
        description: $("#brandExpDescription").value.trim(),
        amount: $("#brandExpAmount").value,
        note: $("#brandExpNote").value.trim() || null,
      });
      e.target.reset();
      selectedBrandCategory = "";
      if (brandExpPillGroup) brandExpPillGroup.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("selected"));
      $("#brandExpenseModal").classList.add("hidden");
      loadBrandExpenses();
    } catch (err) {
      $("#brandExpError").textContent = err.message;
    }
  });
}

/* ─── ADD REVENUE MODAL ────────────────────────────────────────── */
let selectedRevCategory = "";

$("#openAddRevenue").addEventListener("click", () => {
  selectedRevCategory = "";
  $("#revCategory").value = "";
  $("#revDescription").value = "";
  $("#revAmount").value = "";
  $("#revNote").value = "";
  $("#revError").textContent = "";
  const group = $("#revCatPillGroup");
  if (group) group.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("selected"));
  $("#revenueModal").classList.remove("hidden");
});

const revPillGroup = $("#revCatPillGroup");
if (revPillGroup) {
  revPillGroup.querySelectorAll(".cat-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      revPillGroup.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("selected"));
      pill.classList.add("selected");
      selectedRevCategory = pill.dataset.val;
      $("#revCategory").value = selectedRevCategory;
    });
  });
}

$("#revenueForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#revError").textContent = "";
  if (!selectedRevCategory) { $("#revError").textContent = "Pick a category first."; return; }
  try {
    await api("/api/revenue", "POST", {
      category: selectedRevCategory,
      description: $("#revDescription").value.trim(),
      amount: $("#revAmount").value,
      note: $("#revNote").value.trim() || null,
    });
    e.target.reset();
    selectedRevCategory = "";
    if (revPillGroup) revPillGroup.querySelectorAll(".cat-pill").forEach((p) => p.classList.remove("selected"));
    $("#revenueModal").classList.add("hidden");
    loadRevenue();
  } catch (err) {
    $("#revError").textContent = err.message;
  }
});

/* ─── REVENUE FILTER BUTTONS ───────────────────────────────────── */
document.querySelectorAll("[data-rev-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-rev-filter]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeRevFilter = btn.dataset.revFilter;
    renderRevenue();
  });
});

/* ─── BRAND FUNDS SUB-TABS & QUICK ACTIONS ─────────────────────── */
function switchFundsSubTab(subtabId) {
  if (!subtabId) return;
  const targetId = subtabId.startsWith("subtab-") ? subtabId : ("subtab-" + subtabId);
  const rawId = targetId.replace(/^subtab-/, "");

  document.querySelectorAll("#brandFundsSubnav .subnav-btn").forEach((btn) => {
    const val = btn.dataset.subtab;
    btn.classList.toggle("active", val === targetId || val === rawId);
  });
  document.querySelectorAll("#tab-brand-funds .subtab-view").forEach((view) => {
    view.classList.toggle("hidden", view.id !== targetId);
  });
}

document.querySelectorAll("#brandFundsSubnav .subnav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchFundsSubTab(btn.dataset.subtab);
  });
});

const fundsQuickAddBtn = $("#fundsQuickLogBrandExp");
if (fundsQuickAddBtn) {
  fundsQuickAddBtn.addEventListener("click", () => {
    switchFundsSubTab("subtab-funds-expenses");
    const btn = $("#openAddBrandExpense");
    if (btn) btn.click();
  });
}

const fundsQuickAdjustBtn = $("#fundsQuickAdjustTotal");
if (fundsQuickAdjustBtn) {
  fundsQuickAdjustBtn.addEventListener("click", () => {
    openAdjustRevenueModal();
  });
}

const openAdjRevBtn = $("#openAdjustRevenue");
if (openAdjRevBtn) {
  openAdjRevBtn.addEventListener("click", () => {
    openAdjustRevenueModal();
  });
}

function openAdjustRevenueModal() {
  const currentTotal = allRevenue.reduce((s, r) => s + r.amount, 0);
  $("#adjCurrTotalVal").textContent = egp(currentTotal);
  $("#adjNewTotal").value = currentTotal.toFixed(2);
  $("#adjReason").value = "";
  $("#adjError").textContent = "";
  $("#adjustRevenueModal").classList.remove("hidden");
}

const adjustRevForm = $("#adjustRevenueForm");
if (adjustRevForm) {
  adjustRevForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#adjError").textContent = "";
    const newTotal = $("#adjNewTotal").value;
    const reason = $("#adjReason").value.trim();
    try {
      await api("/api/revenue/adjust", "POST", { newTotal, note: reason });
      $("#adjustRevenueModal").classList.add("hidden");
      loadRevenue();
    } catch (err) {
      $("#adjError").textContent = err.message;
    }
  });
}

function openEditRevenueModal(revId) {
  const rev = allRevenue.find((item) => String(item.id) === String(revId));
  if (!rev) return;
  $("#editRevId").value = rev.id;
  $("#editRevCategory").value = rev.category;
  $("#editRevDescription").value = rev.description;
  $("#editRevAmount").value = rev.amount;
  $("#editRevNote").value = rev.note || "";
  $("#editRevError").textContent = "";
  $("#editRevenueModal").classList.remove("hidden");
}

const editRevForm = $("#editRevenueForm");
if (editRevForm) {
  editRevForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#editRevError").textContent = "";
    const id = $("#editRevId").value;
    try {
      await api(`/api/revenue/${id}`, "PUT", {
        category: $("#editRevCategory").value,
        description: $("#editRevDescription").value.trim(),
        amount: $("#editRevAmount").value,
        note: $("#editRevNote").value.trim() || null,
      });
      $("#editRevenueModal").classList.add("hidden");
      loadRevenue();
    } catch (err) {
      $("#editRevError").textContent = err.message;
    }
  });
}

/* ─── BRAND FUNDS & TREASURY ───────────────────────────────────── */
let activeFundsFilter = "all";

document.querySelectorAll("[data-funds-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-funds-filter]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeFundsFilter = btn.dataset.fundsFilter;
    renderBrandFunds();
  });
});

function renderBrandFunds() {
  const totalRev = allRevenue.reduce((s, r) => s + r.amount, 0);
  const totalBrandExp = allBrandExpenses.reduce((s, e) => s + e.amount, 0);
  const totalPersonalExp = allExpenses.reduce((s, e) => s + e.amount, 0);
  const brandCashOnHand = totalRev - totalBrandExp;

  const heroAmount = $("#fundsHeroAmount");
  if (heroAmount) heroAmount.textContent = egp(brandCashOnHand);
  const fundsTotalRev = $("#fundsTotalRevenue");
  if (fundsTotalRev) fundsTotalRev.textContent = "+ " + egp(totalRev);
  const fundsTotalBrand = $("#fundsTotalBrandSpent");
  if (fundsTotalBrand) fundsTotalBrand.textContent = "− " + egp(totalBrandExp);
  const fundsTotalPersonal = $("#fundsTotalPersonalSpent");
  if (fundsTotalPersonal) fundsTotalPersonal.textContent = egp(totalPersonalExp);

  // Combine inflows (revenue) and outflows (brand expenses) into a unified ledger
  const transactions = [];
  allRevenue.forEach((r) => {
    transactions.push({
      id: r.id,
      type: "inflow",
      category: r.category,
      description: r.description,
      amount: r.amount,
      by: r.collectedBy,
      note: r.note,
      createdAt: r.createdAt,
    });
  });
  allBrandExpenses.forEach((b) => {
    transactions.push({
      id: b.id,
      type: "outflow",
      category: b.category,
      description: b.description,
      amount: b.amount,
      by: b.loggedBy,
      note: b.note,
      createdAt: b.createdAt,
    });
  });

  // Sort by date descending
  transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const filtered = activeFundsFilter === "all"
    ? transactions
    : transactions.filter((t) => t.type === activeFundsFilter);

  const body = $("#brandFundsBody");
  if (!body) return;
  body.innerHTML = "";
  const emptyEl = $("#brandFundsEmpty");
  if (emptyEl) emptyEl.classList.toggle("hidden", filtered.length > 0);

  filtered.forEach((t) => {
    const tr = document.createElement("tr");
    const isInflow = t.type === "inflow";
    const typeBadge = isInflow
      ? '<span class="flow-badge flow-badge-in">↑ Inflow</span>'
      : '<span class="flow-badge flow-badge-out">↓ Outflow</span>';
    const amountClass = isInflow ? "amount-inflow" : "amount-outflow";
    const prefix = isInflow ? (t.amount >= 0 ? "+" : "−") : "−";
    const initial = (t.by || "?").charAt(0).toUpperCase();

    tr.innerHTML = `
      <td data-label="Flow">${typeBadge}</td>
      <td data-label="Category">${isInflow ? (REV_CAT_CHIPS[t.category] || escapeHtml(t.category)) : (CAT_CHIPS[t.category] || escapeHtml(t.category))}</td>
      <td data-label="Description" style="font-family:var(--font);font-weight:500;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(t.description)}">${escapeHtml(t.description)}</td>
      <td data-label="Amount" class="${amountClass}">${prefix}${egp(Math.abs(t.amount))}</td>
      <td data-label="Logged By">
        <div class="logged-by-cell">
          <div class="mini-avatar">${escapeHtml(initial)}</div>
          <span style="font-family:var(--font);font-size:12.5px">${escapeHtml(t.by || "—")}</span>
        </div>
      </td>
      <td data-label="Note" class="note-cell" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(t.note || "")}">${t.note ? escapeHtml(t.note) : '<span style="opacity:0.35">—</span>'}</td>
      <td data-label="Date" style="white-space:nowrap">${formatDate12h(t.createdAt)}</td>
    `;
    body.appendChild(tr);
  });
}

/* ─── SUMMARY CARDS QUICK-FILTER ──────────────────────────────── */
document.querySelectorAll("[data-cat]").forEach((card) => {
  card.addEventListener("click", () => {
    const cat = card.dataset.cat;
    const targetBtn = document.querySelector(`[data-filter="${cat}"]`);
    if (targetBtn) targetBtn.click();
  });
});

document.querySelectorAll("[data-rev-cat]").forEach((card) => {
  card.addEventListener("click", () => {
    const cat = card.dataset.revCat;
    const targetBtn = document.querySelector(`[data-rev-filter="${cat}"]`);
    if (targetBtn) targetBtn.click();
  });
});

document.querySelectorAll("[data-brand-cat]").forEach((card) => {
  card.addEventListener("click", () => {
    const cat = card.dataset.brandCat;
    const targetBtn = document.querySelector(`[data-brand-filter="${cat}"]`);
    if (targetBtn) targetBtn.click();
  });
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

/* ═══════════════════════════════════════════════════════════════════════════
   BARCODE SCANNER MODULE (Camera Live Stream, File Upload, Instant Decrement)
   ═══════════════════════════════════════════════════════════════════════════ */
const SCAN_HISTORY_STORAGE_KEY = "static_barcode_scan_history_v1";

function loadSavedScanHistory() {
  try {
    const raw = localStorage.getItem(SCAN_HISTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 100);
    }
  } catch (e) {
    console.warn("Could not load scan history from localStorage:", e);
  }
  return [];
}

function saveScanHistory() {
  try {
    localStorage.setItem(SCAN_HISTORY_STORAGE_KEY, JSON.stringify(sessionScanHistory.slice(0, 100)));
  } catch (e) {
    console.warn("Could not save scan history to localStorage:", e);
  }
}

let isCameraScanning = false;
let html5QrCodeInstance = null;
let currentCameraFacing = "environment"; // Rear camera default on phones
let activeZoomLevel = 2.0;               // 2.0x default zoom so barcodes are sharp at natural 25cm distance
let currentFocusMode = "auto";          // "auto" | "macro" | "far"
let scannerCurrentMode = "decrement";    // "decrement" | "custom_decrement" | "increment" | "lookup"
let scannerSoundEnabled = true;
let lastScannedCode = null;
let lastScannedTime = 0;
let lastScanUndoPayload = null;
let sessionScanHistory = loadSavedScanHistory();
let audioCtxInstance = null;
let nativeBarcodeDetectorInstance = null;
let zxingMultiFormatReaderInstance = null;
let frameScanIntervalId = null;
let offscreenCanvas = null;
let offscreenCtx = null;

// Initialize native hardware BarcodeDetector if available
if ("BarcodeDetector" in window) {
  try {
    nativeBarcodeDetectorInstance = new BarcodeDetector({
      formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code", "upc_a", "upc_e"],
    });
  } catch (e) {
    console.warn("BarcodeDetector init error:", e);
  }
}

// Initialize ZXing MultiFormatReader cross-platform fallback
function getZXingReader() {
  if (zxingMultiFormatReaderInstance) return zxingMultiFormatReaderInstance;
  if (window.ZXing && window.ZXing.MultiFormatReader) {
    try {
      const hints = new Map();
      const formats = [
        ZXing.BarcodeFormat.CODE_128,
        ZXing.BarcodeFormat.CODE_39,
        ZXing.BarcodeFormat.EAN_13,
        ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.UPC_E,
        ZXing.BarcodeFormat.QR_CODE,
      ];
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      zxingMultiFormatReaderInstance = new ZXing.MultiFormatReader();
      zxingMultiFormatReaderInstance.setHints(hints);
      return zxingMultiFormatReaderInstance;
    } catch (e) {
      console.warn("ZXing reader init error:", e);
    }
  }
  return null;
}

function decodeCanvasWithZXing(canvas) {
  const reader = getZXingReader();
  if (!reader || !window.ZXing) return null;
  try {
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const lumSource = new ZXing.RGBLuminanceSource(imgData.data, canvas.width, canvas.height);
    const bin = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lumSource));
    const result = reader.decode(bin);
    return result ? result.getText() : null;
  } catch (e) {
    return null;
  }
}

function playScanAudioBeep(success = true) {
  if (!scannerSoundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtxInstance) audioCtxInstance = new AudioCtx();
    if (audioCtxInstance.state === "suspended") audioCtxInstance.resume();

    const osc = audioCtxInstance.createOscillator();
    const gain = audioCtxInstance.createGain();
    osc.connect(gain);
    gain.connect(audioCtxInstance.destination);

    if (success) {
      // Pleasant POS double-tone chime (high E to high A)
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtxInstance.currentTime);
      osc.frequency.setValueAtTime(1760, audioCtxInstance.currentTime + 0.08);
      gain.gain.setValueAtTime(0.2, audioCtxInstance.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtxInstance.currentTime + 0.22);
      osc.start();
      osc.stop(audioCtxInstance.currentTime + 0.22);
    } else {
      // Error low buzz
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, audioCtxInstance.currentTime);
      gain.gain.setValueAtTime(0.25, audioCtxInstance.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtxInstance.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtxInstance.currentTime + 0.35);
    }
  } catch (e) {
    // Silently ignore audio context failures
  }
}

function initBarcodeScanner() {
  // Shortcut from Stock Tab
  const stockScanShortcut = $("#openStockScannerBtn");
  if (stockScanShortcut) {
    stockScanShortcut.addEventListener("click", () => switchTab("scanner"));
  }

  // Focus & Sharpen button
  const triggerFocusBtn = $("#scannerTriggerFocusBtn");
  if (triggerFocusBtn) {
    triggerFocusBtn.addEventListener("click", () => {
      triggerCameraAutofocus(null, true);
    });
  }

  // Focus mode selector chips (Auto, Macro, Far)
  document.querySelectorAll(".focus-mode-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".focus-mode-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      currentFocusMode = chip.dataset.focus || "auto";
      triggerCameraAutofocus(null, true);
    });
  });

  // Zoom preset buttons (Helps fixed-focus webcams scan clearly from a distance)
  document.querySelectorAll(".zoom-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".zoom-preset-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const zoomVal = parseFloat(btn.dataset.zoom) || 1.0;
      setScannerZoom(zoomVal);
    });
  });

  // Tap on viewfinder to trigger autofocus reticle
  const viewportWrap = $("#scannerViewport");
  if (viewportWrap) {
    viewportWrap.addEventListener("click", (e) => {
      // Don't trigger if clicked on controls
      if (e.target.closest(".scanner-camera-controls")) return;
      triggerCameraAutofocus(e, true);
    });
  }

  // Mode Selector Pills
  document.querySelectorAll("#scannerModeSelector .mode-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#scannerModeSelector .mode-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      scannerCurrentMode = pill.dataset.mode || "decrement";

      const customQtyWrap = $("#scannerCustomQtyWrap");
      if (customQtyWrap) {
        customQtyWrap.classList.toggle("hidden", scannerCurrentMode !== "custom_decrement");
        if (scannerCurrentMode === "custom_decrement") {
          const input = $("#scannerCustomQtyInput");
          if (input) input.focus();
        }
      }
    });
  });

  // Custom Quantity Stepper Buttons
  const qtyMinusBtn = $("#scannerQtyMinusBtn");
  const qtyPlusBtn = $("#scannerQtyPlusBtn");
  const customQtyInput = $("#scannerCustomQtyInput");

  if (qtyMinusBtn && customQtyInput) {
    qtyMinusBtn.addEventListener("click", () => {
      let val = Math.max(1, (parseInt(customQtyInput.value, 10) || 1) - 1);
      customQtyInput.value = val;
    });
  }

  if (qtyPlusBtn && customQtyInput) {
    qtyPlusBtn.addEventListener("click", () => {
      let val = Math.max(1, (parseInt(customQtyInput.value, 10) || 1) + 1);
      customQtyInput.value = val;
    });
  }

  // Sound Chime Toggle
  const soundToggle = $("#scannerSoundToggle");
  if (soundToggle) {
    soundToggle.addEventListener("click", () => {
      scannerSoundEnabled = !scannerSoundEnabled;
      soundToggle.classList.toggle("active-toggle", scannerSoundEnabled);
      const span = soundToggle.querySelector("span");
      if (span) span.textContent = scannerSoundEnabled ? "Sound ON" : "Sound OFF";
    });
  }

  // Camera Controls
  const startBtn = $("#startCameraBtn");
  if (startBtn) startBtn.addEventListener("click", startCameraScanner);

  const stopBtn = $("#stopCameraBtn");
  if (stopBtn) stopBtn.addEventListener("click", stopCameraScanner);

  const switchBtn = $("#switchCameraBtn");
  if (switchBtn) switchBtn.addEventListener("click", switchCameraFacing);

  // Native Camera App Triggers (Opens system Camera App with full hardware autofocus/macro/flash)
  const nativeCameraInput = $("#scannerNativeCameraInput");
  const snapWithCameraAppBtn = $("#snapWithCameraAppBtn");
  const scannerSnapPhotoBtn = $("#scannerSnapPhotoBtn");

  if (nativeCameraInput) {
    if (snapWithCameraAppBtn) {
      snapWithCameraAppBtn.addEventListener("click", () => {
        nativeCameraInput.click();
      });
    }
    if (scannerSnapPhotoBtn) {
      scannerSnapPhotoBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        nativeCameraInput.click();
      });
    }
    nativeCameraInput.addEventListener("change", () => {
      if (nativeCameraInput.files && nativeCameraInput.files.length > 0) {
        handleBarcodeImageFile(nativeCameraInput.files[0]);
        nativeCameraInput.value = "";
      }
    });
  }

  // File Upload Dropzone
  const dropzone = $("#scannerDropzone");
  const fileInput = $("#scannerFileInput");
  const browseBtn = $("#scannerBrowseBtn");

  if (browseBtn && fileInput) {
    browseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", (e) => {
      // Don't trigger if clicked on the Take Photo button
      if (e.target.closest("#scannerSnapPhotoBtn") || e.target.closest("#scannerBrowseBtn")) return;
      fileInput.click();
    });

    ["dragenter", "dragover"].forEach((evtName) => {
      dropzone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((evtName) => {
      dropzone.addEventListener(evtName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleBarcodeImageFile(files[0]);
      }
    });

    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleBarcodeImageFile(fileInput.files[0]);
        fileInput.value = "";
      }
    });
  }

  // Manual SKU / USB Scanner Input Form
  const manualForm = $("#scannerManualForm");
  if (manualForm) {
    manualForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#scannerManualInput");
      const code = input?.value.trim();
      if (!code) return;
      input.value = "";
      processBarcodeScan(code, "manual");
    });
  }

  // Undo Button
  const undoBtn = $("#scannerUndoBtn");
  if (undoBtn) {
    undoBtn.addEventListener("click", handleScannerUndo);
  }

  // Clear Session Log
  const clearHistoryBtn = $("#scannerClearHistoryBtn");
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      if (sessionScanHistory.length === 0) return;
      sessionScanHistory = [];
      saveScanHistory();
      renderScannerHistoryTable();
    });
  }

  // Render any saved history on startup
  renderScannerHistoryTable();
}

async function startCameraScanner() {
  if (isCameraScanning) return;

  const placeholder = $("#scannerCameraPlaceholder");
  const viewportWrap = $("#scannerViewport");
  const statusBadge = $("#scannerStatusBadge");
  const startBtn = $("#startCameraBtn");
  const stopBtn = $("#stopCameraBtn");
  const switchBtn = $("#switchCameraBtn");
  const zoomControls = $("#scannerZoomControls");
  const triggerFocusBtn = $("#scannerTriggerFocusBtn");
  const focusModes = $("#scannerFocusModes");

  if (!window.Html5Qrcode) {
    alert("Barcode camera engine is loading. Please check your internet connection or try file upload.");
    return;
  }

  try {
    if (!html5QrCodeInstance) {
      html5QrCodeInstance = new Html5Qrcode("scannerReader", { verbose: false });
    }

    if (statusBadge) {
      statusBadge.className = "scanner-status-badge status-scanning";
      statusBadge.textContent = "Starting Camera...";
    }

    // High-resolution camera configuration with continuous autofocus
    const config = {
      fps: 25,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const width = Math.min(Math.floor(viewfinderWidth * 0.92), 440);
        const height = Math.min(Math.max(140, Math.floor(viewfinderHeight * 0.62)), 250);
        return { width, height };
      },
      aspectRatio: 1.333334,
      videoConstraints: {
        facingMode: currentCameraFacing,
        width: { min: 1280, ideal: 1920 },
        height: { min: 720, ideal: 1080 },
        focusMode: "continuous",
        advanced: [{ focusMode: "continuous" }, { zoom: 2.0 }],
      },
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true,
      },
    };

    await html5QrCodeInstance.start(
      { facingMode: currentCameraFacing },
      config,
      (decodedText) => {
        processBarcodeScan(decodedText, "camera");
      },
      (error) => {
        // Continuous scan frame processing misses - normal
      }
    );

    isCameraScanning = true;
    if (placeholder) placeholder.style.display = "none";
    if (viewportWrap) viewportWrap.classList.add("is-scanning");
    if (startBtn) startBtn.classList.add("hidden");
    if (stopBtn) stopBtn.classList.remove("hidden");
    if (switchBtn) switchBtn.classList.remove("hidden");
    if (zoomControls) zoomControls.classList.remove("hidden");
    if (triggerFocusBtn) triggerFocusBtn.classList.remove("hidden");
    if (focusModes) focusModes.classList.remove("hidden");

    if (statusBadge) {
      statusBadge.className = "scanner-status-badge status-scanning";
      statusBadge.textContent = "Live Scanning";
    }

    // Start direct high-speed hardware & contrast booster scanning loop
    startHighSpeedScannerLoop();

    // Initial focus & zoom application (default 2.0x for sharp focal distance)
    setTimeout(() => {
      triggerCameraAutofocus(null, false);
      setScannerZoom(activeZoomLevel);
    }, 350);
  } catch (err) {
    console.error("Camera scan start error:", err);
    if (statusBadge) {
      statusBadge.className = "scanner-status-badge status-error";
      statusBadge.textContent = "Camera Error";
    }
    alert("Camera permission denied or camera is in use by another app. You can also upload photos or type SKU codes!");
    stopCameraScanner();
  }
}

// High-speed frame scanner with multi-pass real-time contrast enhancer
function startHighSpeedScannerLoop() {
  if (frameScanIntervalId) clearInterval(frameScanIntervalId);

  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement("canvas");
    offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
  }

  frameScanIntervalId = setInterval(async () => {
    if (!isCameraScanning) return;
    const videoEl = $("#scannerReader video");
    if (!videoEl || videoEl.readyState < 2) return;

    // 1. Direct hardware BarcodeDetector scan on live video frame
    if (nativeBarcodeDetectorInstance) {
      try {
        const barcodes = await nativeBarcodeDetectorInstance.detect(videoEl);
        if (barcodes && barcodes.length > 0) {
          processBarcodeScan(barcodes[0].rawValue, "camera");
          return;
        }
      } catch (e) {}
    }

    // 2. High-resolution center crop for small / medium barcodes
    try {
      const vW = videoEl.videoWidth || 640;
      const vH = videoEl.videoHeight || 480;
      const cropW = Math.floor(vW * 0.75);
      const cropH = Math.floor(vH * 0.55);
      const startX = Math.floor((vW - cropW) / 2);
      const startY = Math.floor((vH - cropH) / 2);

      if (offscreenCanvas.width !== cropW || offscreenCanvas.height !== cropH) {
        offscreenCanvas.width = cropW;
        offscreenCanvas.height = cropH;
      }

      offscreenCtx.drawImage(videoEl, startX, startY, cropW, cropH, 0, 0, cropW, cropH);

      // Try BarcodeDetector on raw center crop
      if (nativeBarcodeDetectorInstance) {
        try {
          const cropBarcodes = await nativeBarcodeDetectorInstance.detect(offscreenCanvas);
          if (cropBarcodes && cropBarcodes.length > 0) {
            processBarcodeScan(cropBarcodes[0].rawValue, "camera");
            return;
          }
        } catch (e) {}
      }

      // Try ZXing on raw center crop
      const zxRaw = decodeCanvasWithZXing(offscreenCanvas);
      if (zxRaw) {
        processBarcodeScan(zxRaw, "camera");
        return;
      }

      // 3. High-contrast enhancement pass for blurry/low-light/low-focus barcodes
      const imgData = offscreenCtx.getImageData(0, 0, cropW, cropH);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        // Binarize threshold to turn blurry grey stripes into crisp pure black and white
        const val = lum < 125 ? 0 : 255;
        d[i] = val;
        d[i + 1] = val;
        d[i + 2] = val;
      }
      offscreenCtx.putImageData(imgData, 0, 0);

      if (nativeBarcodeDetectorInstance) {
        try {
          const enhancedBarcodes = await nativeBarcodeDetectorInstance.detect(offscreenCanvas);
          if (enhancedBarcodes && enhancedBarcodes.length > 0) {
            processBarcodeScan(enhancedBarcodes[0].rawValue, "camera");
            return;
          }
        } catch (e) {}
      }

      // Try ZXing on enhanced binarized crop
      const zxEnhanced = decodeCanvasWithZXing(offscreenCanvas);
      if (zxEnhanced) {
        processBarcodeScan(zxEnhanced, "camera");
        return;
      }
    } catch (err) {}
  }, 75);
}

function triggerCameraAutofocus(e = null, showRing = true) {
  // Show visual tap focus ring
  if (showRing) {
    const ring = $("#scannerFocusRing");
    const viewport = $("#scannerViewport");
    if (ring && viewport) {
      let x = viewport.clientWidth / 2;
      let y = viewport.clientHeight / 2;
      if (e) {
        const rect = viewport.getBoundingClientRect();
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
      }
      ring.style.left = `${x}px`;
      ring.style.top = `${y}px`;
      ring.classList.remove("hidden");
      ring.style.animation = "none";
      void ring.offsetWidth; // trigger reflow
      ring.style.animation = "focusRingPulse 0.6s ease-out forwards";
    }
  }

  // Apply track hardware focus constraints
  try {
    const videoEl = $("#scannerReader video");
    const stream = videoEl?.srcObject;
    const track = stream?.getVideoTracks()[0];
    if (track && track.applyConstraints) {
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      const advanced = [];

      // Points of interest
      if (e) {
        const viewport = $("#scannerViewport");
        if (viewport) {
          const rect = viewport.getBoundingClientRect();
          const normX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          const normY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
          advanced.push({ pointsOfInterest: [{ x: normX, y: normY }] });
        }
      }

      if (currentFocusMode === "macro") {
        const minDist = capabilities.focusDistance?.min || 0.05;
        advanced.push({ focusMode: "manual", focusDistance: minDist });
      } else if (currentFocusMode === "far") {
        advanced.push({ focusMode: "continuous", focusDistance: 0.6 });
      } else {
        if (capabilities.focusMode && capabilities.focusMode.includes("continuous")) {
          advanced.push({ focusMode: "continuous" });
        }
      }

      if (advanced.length > 0) {
        track.applyConstraints({ advanced }).catch(() => {});
      }
    }
  } catch (err) {
    // Non-critical focus constraint failure
  }
}

function setScannerZoom(zoomMultiplier = 1.0) {
  activeZoomLevel = zoomMultiplier;

  // 1. Attempt hardware track zoom
  try {
    const videoEl = $("#scannerReader video");
    const stream = videoEl?.srcObject;
    const track = stream?.getVideoTracks()[0];
    if (track && track.applyConstraints) {
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      if (capabilities.zoom) {
        const minZ = capabilities.zoom.min || 1;
        const maxZ = capabilities.zoom.max || 3;
        const clampedZoom = Math.min(Math.max(zoomMultiplier, minZ), maxZ);
        track.applyConstraints({ advanced: [{ zoom: clampedZoom }] }).catch(() => {});
      }
    }

    // 2. Also apply CSS scale crop (makes barcodes huge & sharp from a natural distance)
    if (videoEl) {
      if (zoomMultiplier > 1.05) {
        videoEl.style.transform = `scale(${zoomMultiplier})`;
        videoEl.style.transformOrigin = "center center";
      } else {
        videoEl.style.transform = "none";
      }
    }
  } catch (e) {
    // Non-critical zoom failure
  }
}

async function stopCameraScanner() {
  if (frameScanIntervalId) {
    clearInterval(frameScanIntervalId);
    frameScanIntervalId = null;
  }

  const placeholder = $("#scannerCameraPlaceholder");
  const viewportWrap = $("#scannerViewport");
  const statusBadge = $("#scannerStatusBadge");
  const startBtn = $("#startCameraBtn");
  const stopBtn = $("#stopCameraBtn");
  const switchBtn = $("#switchCameraBtn");
  const zoomControls = $("#scannerZoomControls");
  const triggerFocusBtn = $("#scannerTriggerFocusBtn");
  const focusModes = $("#scannerFocusModes");

  if (html5QrCodeInstance && isCameraScanning) {
    try {
      await html5QrCodeInstance.stop();
    } catch (e) {
      console.warn("Camera stop error:", e);
    }
  }

  isCameraScanning = false;
  if (placeholder) placeholder.style.display = "flex";
  if (viewportWrap) viewportWrap.classList.remove("is-scanning");
  if (startBtn) startBtn.classList.remove("hidden");
  if (stopBtn) stopBtn.classList.add("hidden");
  if (switchBtn) switchBtn.classList.add("hidden");
  if (zoomControls) zoomControls.classList.add("hidden");
  if (triggerFocusBtn) triggerFocusBtn.classList.add("hidden");
  if (focusModes) focusModes.classList.add("hidden");

  // Reset zoom style
  const videoEl = $("#scannerReader video");
  if (videoEl) videoEl.style.transform = "none";

  if (statusBadge) {
    statusBadge.className = "scanner-status-badge status-idle";
    statusBadge.textContent = "Ready";
  }
}

async function switchCameraFacing() {
  if (!isCameraScanning) return;
  currentCameraFacing = currentCameraFacing === "environment" ? "user" : "environment";
  await stopCameraScanner();
  await startCameraScanner();
}

async function handleBarcodeImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("Please select a valid image file (PNG, JPG, WEBP).");
    return;
  }

  const statusBadge = $("#scannerStatusBadge");
  if (statusBadge) {
    statusBadge.className = "scanner-status-badge status-scanning";
    statusBadge.textContent = "Decoding Photo...";
  }

  try {
    const bitmap = await createImageBitmap(file);

    // 1. Direct Native BarcodeDetector on full-res image
    if (nativeBarcodeDetectorInstance) {
      try {
        const barcodes = await nativeBarcodeDetectorInstance.detect(bitmap);
        if (barcodes && barcodes.length > 0) {
          processBarcodeScan(barcodes[0].rawValue, "upload");
          return;
        }
      } catch (nativeErr) {}
    }

    // 2. Draw to canvas with optimal downscaling for instant ZXing decoding
    const photoCanvas = document.createElement("canvas");
    const photoCtx = photoCanvas.getContext("2d", { willReadFrequently: true });
    
    // Scale high-res mobile photos (4000x3000 -> max 1600) for instant decode
    const maxDim = 1600;
    let targetW = bitmap.width;
    let targetH = bitmap.height;
    if (targetW > maxDim || targetH > maxDim) {
      if (targetW > targetH) {
        targetH = Math.round((targetH * maxDim) / targetW);
        targetW = maxDim;
      } else {
        targetW = Math.round((targetW * maxDim) / targetH);
        targetH = maxDim;
      }
    }
    photoCanvas.width = targetW;
    photoCanvas.height = targetH;
    photoCtx.drawImage(bitmap, 0, 0, targetW, targetH);

    // Try BarcodeDetector on scaled canvas
    if (nativeBarcodeDetectorInstance) {
      try {
        const barcodes = await nativeBarcodeDetectorInstance.detect(photoCanvas);
        if (barcodes && barcodes.length > 0) {
          processBarcodeScan(barcodes[0].rawValue, "upload");
          return;
        }
      } catch (e) {}
    }

    // Try ZXing MultiFormat on scaled canvas
    const zxCode = decodeCanvasWithZXing(photoCanvas);
    if (zxCode) {
      processBarcodeScan(zxCode, "upload");
      return;
    }

    // 3. Contrast threshold enhancement pass for low-light/distant photos
    const imgData = photoCtx.getImageData(0, 0, targetW, targetH);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      const val = lum < 128 ? 0 : 255;
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
    }
    photoCtx.putImageData(imgData, 0, 0);

    // Try ZXing on high-contrast enhanced canvas
    const zxEnhanced = decodeCanvasWithZXing(photoCanvas);
    if (zxEnhanced) {
      processBarcodeScan(zxEnhanced, "upload");
      return;
    }

    if (nativeBarcodeDetectorInstance) {
      try {
        const enhancedBarcodes = await nativeBarcodeDetectorInstance.detect(photoCanvas);
        if (enhancedBarcodes && enhancedBarcodes.length > 0) {
          processBarcodeScan(enhancedBarcodes[0].rawValue, "upload");
          return;
        }
      } catch (e) {}
    }

    // 4. Fallback to Html5Qrcode scanFile engine
    let tempScanner = html5QrCodeInstance;
    if (!tempScanner && window.Html5Qrcode) {
      tempScanner = new Html5Qrcode("scannerReader", { verbose: false });
    }

    if (tempScanner) {
      const decodedResult = await tempScanner.scanFile(file, true);
      if (decodedResult) {
        processBarcodeScan(decodedResult, "upload");
        return;
      }
    }

    throw new Error("No barcode detected in image");
  } catch (err) {
    console.error("Image decode error:", err);
    playScanAudioBeep(false);
    showScanResultError(`Could not detect a clear barcode in "${file.name}". Please snap the photo directly facing the barcode lines.`);
  } finally {
    if (statusBadge && !isCameraScanning) {
      statusBadge.className = "scanner-status-badge status-idle";
      statusBadge.textContent = "Ready";
    }
  }
}

async function processBarcodeScan(rawCode, source = "camera") {
  if (!rawCode || !String(rawCode).trim()) return;
  const cleanCode = String(rawCode).trim().toUpperCase();

  // Throttle rapid repeated scans for the same barcode within 1.8s
  const now = Date.now();
  if (cleanCode === lastScannedCode && now - lastScannedTime < 1800) {
    return;
  }
  lastScannedCode = cleanCode;
  lastScannedTime = now;

  try {
    let apiMode = "decrement";
    let scanQty = 1;

    if (scannerCurrentMode === "custom_decrement") {
      const customInput = $("#scannerCustomQtyInput");
      scanQty = Math.max(1, parseInt(customInput ? customInput.value : 1, 10) || 1);
      apiMode = "decrement";
    } else if (scannerCurrentMode === "increment") {
      apiMode = "increment";
      scanQty = 1;
    } else if (scannerCurrentMode === "lookup") {
      apiMode = "lookup";
      scanQty = 0;
    } else {
      apiMode = "decrement";
      scanQty = 1;
    }

    const res = await api("/api/stock/scan", "POST", {
      code: cleanCode,
      mode: apiMode,
      qty: scanQty,
    });

    playScanAudioBeep(true);
    showScanResultSuccess(res);

    // Save undo information
    lastScanUndoPayload = {
      itemId: res.item.id,
      previousQty: res.previousQuantity,
      sku: res.item.sku,
      itemName: res.item.itemName,
    };

    // Log to session history
    sessionScanHistory.unshift({
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      itemName: res.item.itemName,
      sku: res.item.sku || cleanCode,
      price: res.item.price,
      action: res.action,
      delta: res.delta,
      previousQty: res.previousQuantity,
      newQty: res.newQuantity,
    });

    saveScanHistory();
    renderScannerHistoryTable();

    // Refresh stock list in background
    loadStock();
  } catch (err) {
    console.error("Stock scan error:", err);
    playScanAudioBeep(false);
    showScanResultError(err.message || `No stock item found matching barcode "${cleanCode}"`);
  }
}

function showScanResultSuccess(data) {
  const card = $("#scannerResultCard");
  if (!card) return;

  card.classList.remove("hidden", "is-error");

  const icon = $("#resultStatusIcon");
  if (icon) {
    icon.className = "result-status-icon success";
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
  }

  $("#resultItemName").textContent = data.item.itemName;
  $("#resultSkuBadge").textContent = data.item.sku || data.code;
  $("#resultPriceBadge").textContent = `${money(data.item.price)} EGP`;

  const transitionEl = $("#resultStockTransition");
  if (transitionEl) {
    if (data.action === "decrement") {
      transitionEl.innerHTML = `Stock deducted: <strong>${data.previousQuantity}</strong> ➔ <span class="new-qty-highlight">${data.newQuantity} in stock (-${data.delta})</span> &bull; Price: <strong>${money(data.item.price)} EGP</strong>`;
    } else if (data.action === "increment") {
      transitionEl.innerHTML = `Stock increased: <strong>${data.previousQuantity}</strong> ➔ <span class="new-qty-highlight">${data.newQuantity} in stock (+${data.delta})</span> &bull; Price: <strong>${money(data.item.price)} EGP</strong>`;
    } else {
      transitionEl.innerHTML = `Product found: <span class="new-qty-highlight">${data.newQuantity} currently in stock</span> &bull; Price: <strong>${money(data.item.price)} EGP</strong>`;
    }
  }

  const undoBtn = $("#scannerUndoBtn");
  if (undoBtn) {
    undoBtn.style.display = data.action === "lookup" ? "none" : "inline-flex";
  }
}

function showScanResultError(msg) {
  const card = $("#scannerResultCard");
  if (!card) return;

  card.classList.remove("hidden");
  card.classList.add("is-error");

  const icon = $("#resultStatusIcon");
  if (icon) {
    icon.className = "result-status-icon error";
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  }

  $("#resultItemName").textContent = "Item Not Found";
  $("#resultSkuBadge").textContent = lastScannedCode || "ERROR";
  $("#resultPriceBadge").textContent = "";

  const transitionEl = $("#resultStockTransition");
  if (transitionEl) {
    transitionEl.innerHTML = `<span style="color:#ef4444;font-weight:600;">${escapeHtml(msg)}</span>`;
  }

  const undoBtn = $("#scannerUndoBtn");
  if (undoBtn) undoBtn.style.display = "none";
}

async function handleScannerUndo() {
  if (!lastScanUndoPayload) return;
  const p = lastScanUndoPayload;

  try {
    await api(`/api/stock/${p.itemId}`, "PUT", { quantity: p.previousQty });
    lastScanUndoPayload = null;

    const transitionEl = $("#resultStockTransition");
    if (transitionEl) {
      transitionEl.innerHTML = `Stock restored: <span class="new-qty-highlight">${p.previousQty} in stock (reverted)</span>`;
    }

    const undoBtn = $("#scannerUndoBtn");
    if (undoBtn) undoBtn.style.display = "none";

    loadStock();
  } catch (err) {
    alert("Could not undo: " + err.message);
  }
}

function renderScannerHistoryTable() {
  const tbody = $("#scannerHistoryBody");
  if (!tbody) return;

  if (sessionScanHistory.length === 0) {
    tbody.innerHTML = `
      <tr id="scannerHistoryEmptyRow">
        <td colspan="7" style="text-align:center;color:var(--text-muted);padding:18px;">No barcodes scanned yet in this session.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = sessionScanHistory
    .map((s) => {
      let actionBadge = `<span class="badge" style="background:rgba(239,68,68,0.12);color:#ef4444;font-weight:700;">-${s.delta || 1} Deduct</span>`;
      if (s.action === "increment") {
        actionBadge = `<span class="badge" style="background:rgba(34,197,94,0.12);color:#16a34a;font-weight:700;">+${s.delta || 1} Restock</span>`;
      } else if (s.action === "lookup") {
        actionBadge = `<span class="badge" style="background:rgba(160,120,96,0.12);color:var(--accent);font-weight:700;">Lookup</span>`;
      }

      return `
        <tr>
          <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">${s.time}</td>
          <td style="font-weight:600;">${escapeHtml(s.itemName)}</td>
          <td><span class="stock-sku-badge">${escapeHtml(s.sku)}</span></td>
          <td style="font-weight:700;color:var(--accent);">${money(s.price)} EGP</td>
          <td>${actionBadge}</td>
          <td>${s.previousQty} ➔ ${s.newQty}</td>
          <td style="font-weight:700;color:var(--text);">${s.newQty} in stock</td>
        </tr>
      `;
    })
    .join("");
}

// ─── WEBSITE CUSTOMERS ────────────────────────────────────────────────────────
async function loadCustomers() {
  if (!me || me.role !== "founder") return;
  try {
    const data = await api("/api/customers");
    allCustomers = data || [];
    renderCustomers(allCustomers);
  } catch (e) {
    console.error("customers load error:", e.message);
  }
}

function renderCustomers(list) {
  const tbody = $("#customersBody");
  const countEl = $("#customerCount");
  if (!tbody) return;
  if (countEl) countEl.textContent = list.length + " customer" + (list.length !== 1 ? "s" : "");

  tbody.innerHTML = "";
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:40px;">No website customers registered yet</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong style="color:var(--text);">${escapeHtml(c.name)}</strong></td>
      <td style="color:var(--text-muted);">${escapeHtml(c.email)}</td>
      <td style="color:var(--text-muted);">${escapeHtml(c.phone || "—")}</td>
      <td style="color:var(--text-muted);white-space:nowrap;font-size:12.5px;">${formatDate12h(c.createdAt)}</td>
      <td style="text-align:right">
        <button class="icon-btn" data-del-customer="${c.id}" data-cust-name="${escapeHtml(c.name)}" title="Delete account" style="color:var(--danger,#e53935);">✕</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-del-customer]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const name = btn.dataset.custName || "this customer";
      if (!confirm(`Delete website account for "${name}"?\n\nThis cannot be undone.`)) return;
      try {
        await api("/api/customers/" + btn.dataset.delCustomer, "DELETE");
        await loadCustomers();
      } catch (err) {
        alert("Failed to delete customer: " + err.message);
      }
    });
  });
}

// Wire up customer search
(function initCustomerSearch() {
  const searchEl = document.getElementById("customerSearch");
  if (searchEl) {
    searchEl.addEventListener("input", () => {
      const q = searchEl.value.toLowerCase().trim();
      const filtered = q
        ? allCustomers.filter(c =>
            (c.name || "").toLowerCase().includes(q) ||
            (c.email || "").toLowerCase().includes(q) ||
            (c.phone || "").toLowerCase().includes(q) ||
            (c.address || "").toLowerCase().includes(q)
          )
        : allCustomers;
      renderCustomers(filtered);
    });
  }
})();