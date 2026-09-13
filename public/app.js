let me = null;
let allExpenses = [];
let allBrandExpenses = [];
let allOrders   = [];
let allCustomers = [];
let allStores   = [];
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
  initOrderNotifications();
}

/* ─── FAST BOOTSTRAP LOADER ────────────────────────────────────── */
async function loadBootstrap() {
  try {
    const data = await api("/api/bootstrap");
    if (data.orders) {
      allOrders = data.orders;
      allOrders.forEach((o) => knownOrderIds.add(String(o.id)));
      hasInitialOrdersLoaded = true;
      renderOrders();
    }
    if (data.stock) {
      allStock = data.stock;
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
    if (data.stores) {
      allStores = data.stores;
      renderStores();
    }
    renderBrandFunds();
    loadStock();
  } catch (err) {
    console.error("Bootstrap fetch error, falling back to individual calls:", err);
    await Promise.all([loadOrders(), loadStock(), loadExpenses(), loadBrandExpenses(), loadRevenue(), loadStores()]);
  }
}

/* ─── NAV TABS ─────────────────────────────────────────────────── */
const pageTitles = {
  orders: "Orders",
  stock: "Stock",
  "stock-ops": "Stock Operations & Warehouse Intake",
  scanner: "Stock Operations & Warehouse Intake",
  expenses: "Personal Expenses",
  "brand-funds": "Brand Funds & Treasury",
  "brand-expenses": "Brand Expenses",
  revenue: "Revenue",
  customers: "Customers",
  team: "Team Access",
};

function switchTab(tab) {
  // Alias legacy scanner -> stock-ops
  if (tab === "scanner") {
    tab = "stock-ops";
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

  if (tab === "orders") {
    clearOrdersUnreadBadge();
  }

  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".mobile-nav-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(`[data-tab="${tab}"], [data-legacy-tab="${tab}"]`).forEach((b) => b.classList.add("active"));
  const panel = document.getElementById("tab-" + tab) || document.querySelector(`[data-alias-tab="tab-${tab}"]`);
  if (panel) {
    panel.classList.remove("hidden");
    panel.classList.add("active");
  }
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

  if (tab === "stock-ops") {
    setTimeout(() => {
      const input = $("#scannerManualInput");
      if (input) {
        input.focus();
        input.select();
      }
    }, 60);
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

/* ─── ORDER NOTIFICATIONS & AUTO-SYNC (PC & LAPTOP) ───────────── */
let orderNotifSoundEnabled = true;
let orderPollInterval = null;
let orderEventSource = null;
let knownOrderIds = new Set();
let hasInitialOrdersLoaded = false;
let lastOrderPollTimestamp = null;   // ISO string of newest known order
let newOrderHighlightIds = new Set();
let unreadOrdersCount = 0;
let originalTabTitle = document.title || "Static — Admin Panel";
let tabFlashInterval = null;

// Global audio unlock for browser autoplay policy
function unlockAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!audioCtxInstance) audioCtxInstance = new AudioCtx();
  if (audioCtxInstance.state === "suspended") {
    audioCtxInstance.resume().catch(() => {});
  }
}
window.addEventListener("click", unlockAudioContext, { passive: true });
window.addEventListener("keydown", unlockAudioContext, { passive: true });
window.addEventListener("touchstart", unlockAudioContext, { passive: true });

function playOrderChime() {
  if (!orderNotifSoundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtxInstance) audioCtxInstance = new AudioCtx();
    if (audioCtxInstance.state === "suspended") {
      audioCtxInstance.resume().catch(() => {});
    }

    const t = audioCtxInstance.currentTime;
    // Harmonious 4-tone boutique chime (C5 -> E5 -> G5 -> C6)
    const notes = [
      { freq: 523.25, time: 0,    dur: 0.30, gain: 0.22 },
      { freq: 659.25, time: 0.08, dur: 0.32, gain: 0.24 },
      { freq: 783.99, time: 0.16, dur: 0.40, gain: 0.26 },
      { freq: 1046.50, time: 0.24, dur: 0.60, gain: 0.28 },
    ];

    notes.forEach((n) => {
      const osc = audioCtxInstance.createOscillator();
      const gain = audioCtxInstance.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.freq, t + n.time);
      gain.gain.setValueAtTime(n.gain, t + n.time);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.time + n.dur);
      osc.connect(gain);
      gain.connect(audioCtxInstance.destination);
      osc.start(t + n.time);
      osc.stop(t + n.time + n.dur);
    });
  } catch (err) {
    console.warn("Audio chime playback error:", err);
  }
}

function ringBellIcon() {
  const bell = $("#notifBellBtn .bell-icon:not(.hidden)");
  if (bell) {
    bell.classList.remove("bell-ring-anim");
    void bell.offsetWidth;
    bell.classList.add("bell-ring-anim");
    setTimeout(() => bell.classList.remove("bell-ring-anim"), 1000);
  }
}

function showDesktopNotification(order) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const total = (order.items || []).reduce(
    (sum, it) => sum + Number(it.qty ?? it.quantity ?? 1) * Number(it.price || 0),
    0
  ) + Number(order.shippingPrice || 0);

  const itemsText = (order.items || [])
    .map((it) => `${it.name || it.itemName} ×${it.qty ?? it.quantity ?? 1}`)
    .join(", ") || "Order items";

  try {
    const notif = new Notification(`New Order #${formatOrderId(order.id)}`, {
      body: `${order.customerName || "Customer"} • ${total.toFixed(2)} EGP\n${itemsText}`,
      tag: `order-${order.id}`,
    });

    notif.onclick = () => {
      window.focus();
      switchTab("orders");
      openOrderDetail(order.id);
    };
  } catch (err) {
    console.error("Desktop notification dispatch error:", err);
  }
}

function showOrderToast(order) {
  const container = $("#notifToastContainer");
  if (!container) return;

  const total = (order.items || []).reduce(
    (sum, it) => sum + Number(it.qty ?? it.quantity ?? 1) * Number(it.price || 0),
    0
  ) + Number(order.shippingPrice || 0);

  const itemsText = (order.items || [])
    .map((it) => `${it.name || it.itemName} ×${it.qty ?? it.quantity ?? 1}`)
    .join(", ") || "No items";

  const toast = document.createElement("div");
  toast.className = "notif-toast";
  toast.innerHTML = `
    <div class="notif-toast-icon">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    </div>
    <div class="notif-toast-content">
      <div class="notif-toast-title">New Order #${escapeHtml(formatOrderId(order.id))}</div>
      <div class="notif-toast-body">${escapeHtml(order.customerName || "Customer")} • ${money(total)} EGP • ${escapeHtml(itemsText)}</div>
    </div>
    <button type="button" class="notif-toast-close" title="Dismiss" aria-label="Dismiss">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  toast.addEventListener("click", (e) => {
    if (e.target.closest(".notif-toast-close")) return;
    switchTab("orders");
    openOrderDetail(order.id);
    dismissToast(toast);
  });

  const closeBtn = toast.querySelector(".notif-toast-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissToast(toast);
    });
  }

  container.prepend(toast);
  setTimeout(() => dismissToast(toast), 8000);
}

function dismissToast(toast) {
  if (!toast || toast.classList.contains("fade-out")) return;
  toast.classList.add("fade-out");
  setTimeout(() => toast.remove(), 320);
}

function flashTabTitle(text) {
  if (document.hasFocus()) return;
  if (tabFlashInterval) clearInterval(tabFlashInterval);

  let showAlt = true;
  tabFlashInterval = setInterval(() => {
    document.title = showAlt ? text : originalTabTitle;
    showAlt = !showAlt;
  }, 1200);
}

function stopFlashTabTitle() {
  if (tabFlashInterval) {
    clearInterval(tabFlashInterval);
    tabFlashInterval = null;
  }
  document.title = originalTabTitle;
}

window.addEventListener("focus", () => {
  stopFlashTabTitle();
});

function incrementOrdersUnreadBadge() {
  unreadOrdersCount++;
  const badge = $("#ordersUnreadBadge");
  if (badge) {
    badge.textContent = unreadOrdersCount;
    badge.classList.remove("hidden");
  }
}

function clearOrdersUnreadBadge() {
  unreadOrdersCount = 0;
  const badge = $("#ordersUnreadBadge");
  if (badge) {
    badge.classList.add("hidden");
    badge.textContent = "0";
  }
  stopFlashTabTitle();
}

// Handles an incoming real-time or polled new order
function handleIncomingRealtimeOrder(order) {
  if (!order || !order.id) return;
  const idStr = String(order.id);
  if (knownOrderIds.has(idStr)) return;
  knownOrderIds.add(idStr);

  // Prepend to in-memory order list
  const existingIdx = allOrders.findIndex((o) => String(o.id) === idStr);
  if (existingIdx === -1) {
    allOrders.unshift(order);
  }
  newOrderHighlightIds.add(idStr);
  renderOrders();

  // Trigger sound, visual bell ring, desktop OS notification, floating toast, and flashing title
  playOrderChime();
  ringBellIcon();
  showDesktopNotification(order);
  showOrderToast(order);
  flashTabTitle(`(1) New Order! — Static`);

  const activeTab = document.querySelector(".tab-panel.active")?.id?.replace("tab-", "");
  if (activeTab !== "orders") {
    incrementOrdersUnreadBadge();
  }

  setTimeout(() => {
    newOrderHighlightIds.delete(idStr);
    const row = document.querySelector(`tr[data-order-row="${idStr}"]`);
    if (row) row.classList.remove("new-order-flash");
  }, 5000);
}

// Instant Real-time SSE Stream (works on local Node server, not on Vercel serverless)
function initOrderSSE() {
  if (!me || orderEventSource) return;
  try {
    orderEventSource = new EventSource("/api/orders/stream");
    orderEventSource.onmessage = (e) => {
      if (!e.data) return;
      try {
        const order = JSON.parse(e.data);
        if (order && order.id) {
          console.log("[SSE] New order received via stream:", order.id);
          handleIncomingRealtimeOrder(order);
        }
      } catch (err) {
        console.warn("[SSE] Parse error:", err.message, "Data:", e.data);
      }
    };
    orderEventSource.addEventListener("message", (e) => {
      // Handled by onmessage above
    });
    orderEventSource.onerror = (err) => {
      console.warn("[SSE] Stream error or disconnected (will auto-reconnect)");
      // EventSource natively retries — polling fallback covers any gap
    };
    console.log("[Notifications] SSE stream connected to /api/orders/stream");
  } catch (err) {
    console.warn("[SSE] Could not init stream:", err.message);
  }
}

async function checkNewOrders() {
  if (!me) return;
  try {
    const latestOrders = await api("/api/orders");
    if (!Array.isArray(latestOrders)) return;

    if (!hasInitialOrdersLoaded) {
      // First poll — just mark everything as known, no alerts
      allOrders = latestOrders;
      latestOrders.forEach((o) => knownOrderIds.add(String(o.id)));
      if (latestOrders.length > 0) {
        // Track the newest order's timestamp for future comparison
        lastOrderPollTimestamp = latestOrders[0].createdAt || null;
      }
      hasInitialOrdersLoaded = true;
      renderOrders();
      console.log("[Notifications] Initial orders loaded:", latestOrders.length, "orders. Watching for new ones...");
      return;
    }

    // On subsequent polls — detect new order IDs
    let foundNew = false;
    latestOrders.forEach((o) => {
      const idStr = String(o.id);
      if (!knownOrderIds.has(idStr)) {
        console.log("[Notifications] New order detected via poll:", idStr);
        foundNew = true;
        handleIncomingRealtimeOrder(o);
      }
    });

    if (!foundNew && latestOrders.length !== allOrders.length) {
      // An order was deleted — resync silently
      allOrders = latestOrders;
      renderOrders();
    }
  } catch (err) {
    console.warn("[Notifications] Poll failed, will retry:", err.message);
  }
}

function requestNotificationPermission() {
  if (!("Notification" in window)) {
    alert("Desktop notifications are not supported by your browser.");
    return;
  }
  unlockAudioContext();
  Notification.requestPermission().then((permission) => {
    updateNotifUI();
    playOrderChime();
    if (permission === "granted") {
      new Notification("Desktop Alerts Active", {
        body: "You will receive desktop alerts when new orders arrive.",
      });
    }
  });
}

function updateNotifUI() {
  const activeIcon = $("#bellIconActive");
  const mutedIcon = $("#bellIconMuted");
  const dot = $("#notifStatusDot");
  const statusBadge = $("#notifStatusText");
  const permStatus = $("#notifPermStatus");
  const permBtn = $("#notifPermBtn");

  const isMuted = !orderNotifSoundEnabled;
  if (activeIcon) activeIcon.classList.toggle("hidden", isMuted);
  if (mutedIcon) mutedIcon.classList.toggle("hidden", !isMuted);

  if (dot) dot.classList.toggle("muted", isMuted);
  if (statusBadge) {
    statusBadge.textContent = isMuted ? "Muted" : "Active";
    statusBadge.classList.toggle("muted", isMuted);
  }

  if (!("Notification" in window)) {
    if (permStatus) permStatus.textContent = "Not supported in browser";
    if (permBtn) permBtn.classList.add("hidden");
  } else if (Notification.permission === "granted") {
    if (permStatus) permStatus.textContent = "Desktop alerts enabled";
    if (permBtn) {
      permBtn.textContent = "Allowed";
      permBtn.disabled = true;
      permBtn.style.opacity = "0.7";
      permBtn.style.cursor = "default";
    }
  } else if (Notification.permission === "denied") {
    if (permStatus) permStatus.textContent = "Blocked in browser settings";
    if (permBtn) {
      permBtn.textContent = "Blocked";
      permBtn.disabled = true;
      permBtn.style.opacity = "0.7";
    }
  } else {
    if (permStatus) permStatus.textContent = "Click Enable to allow alerts";
    if (permBtn) {
      permBtn.textContent = "Enable";
      permBtn.disabled = false;
      permBtn.style.opacity = "1";
      permBtn.style.cursor = "pointer";
    }
  }
}

function initOrderNotifications() {
  const savedSound = localStorage.getItem("orderNotifSound");
  if (savedSound !== null) {
    orderNotifSoundEnabled = savedSound === "true";
  }
  const soundCb = $("#notifSoundCheckbox");
  if (soundCb) soundCb.checked = orderNotifSoundEnabled;

  updateNotifUI();

  // Banner prompt for permission
  const banner = $("#notifBannerPrompt");
  const dismissed = localStorage.getItem("notifBannerDismissed");
  if (banner && "Notification" in window && Notification.permission === "default" && !dismissed) {
    banner.classList.remove("hidden");
  }

  const bannerEnableBtn = $("#notifBannerEnableBtn");
  if (bannerEnableBtn) {
    bannerEnableBtn.addEventListener("click", () => {
      unlockAudioContext();
      Notification.requestPermission().then((perm) => {
        banner?.classList.add("hidden");
        updateNotifUI();
        playOrderChime();
        if (perm === "granted") {
          new Notification("Desktop Alerts Active", {
            body: "You will receive desktop alerts when new orders arrive.",
          });
        }
      });
    });
  }

  const bannerDismissBtn = $("#notifBannerDismissBtn");
  if (bannerDismissBtn) {
    bannerDismissBtn.addEventListener("click", () => {
      banner?.classList.add("hidden");
      localStorage.setItem("notifBannerDismissed", "true");
    });
  }

  const bellBtn = $("#notifBellBtn");
  const menu = $("#notifMenu");
  if (bellBtn && menu) {
    bellBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && e.target !== bellBtn && !bellBtn.contains(e.target)) {
        menu.classList.add("hidden");
      }
    });
  }

  if (soundCb) {
    soundCb.addEventListener("change", () => {
      orderNotifSoundEnabled = soundCb.checked;
      localStorage.setItem("orderNotifSound", orderNotifSoundEnabled);
      updateNotifUI();
    });
  }

  const permBtn = $("#notifPermBtn");
  if (permBtn) {
    permBtn.addEventListener("click", () => {
      requestNotificationPermission();
    });
  }

  const testBtn = $("#notifTestSoundBtn");
  if (testBtn) {
    testBtn.addEventListener("click", async () => {
      unlockAudioContext();
      const prev = orderNotifSoundEnabled;
      orderNotifSoundEnabled = true;
      playOrderChime();
      orderNotifSoundEnabled = prev;
      ringBellIcon();
      showOrderToast({
        id: "TEST",
        customerName: "Test Order",
        shippingPrice: 30,
        items: [{ itemName: "Sample Item", price: 120, quantity: 1 }],
      });
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Test Notification Active", {
          body: "Test Order • 150.00 EGP\nSample Item ×1",
        });
      }
      // Also fire server-side test: SSE broadcast + ntfy push
      try {
        const r = await api("/api/notify-test", "POST");
        console.log("[Test] Server-side notify-test response:", r);
        if (r && r.ntfy && r.ntfy.topics) {
          const sentTopics = r.ntfy.topics.join(", ");
          showOrderToast({
            id: "PHONE",
            customerName: "Mobile Alert Dispatched",
            shippingPrice: 0,
            items: [{ itemName: "Sent to: " + sentTopics, price: 0, quantity: 1 }],
          });
        }
      } catch (e) {
        console.warn("[Test] notify-test endpoint error:", e.message);
      }
    });
  }

  // Connect SSE for instant (0ms lag) order alerts (works on local Node server)
  initOrderSSE();

  // Polling fallback — primary detection method on Vercel/serverless (SSE doesn't survive there)
  // Fires first check at 3 s so we don't wait a full interval after login
  if (!orderPollInterval) {
    setTimeout(() => {
      if (me && !orderPollInterval) {
        checkNewOrders();
        orderPollInterval = setInterval(checkNewOrders, 10000);
        console.log("[Notifications] Polling active — checking every 10 s");
      }
    }, 3000);
  }
}

/* ─── ORDERS ───────────────────────────────────────────────────── */
function renderOrders() {
  const body = $("#ordersBody");
  if (!body) return;
  body.innerHTML = "";
  $("#ordersEmpty")?.classList.toggle("hidden", allOrders.length > 0);

  allOrders.forEach((o) => {
    const total = (o.items || []).reduce(
      (sum, it) => sum + Number(it.qty ?? it.quantity ?? 1) * Number(it.price || 0),
      0
    ) + Number(o.shippingPrice || 0);

    const itemsText = (o.items || [])
      .map((it) => `${it.name || it.itemName} ×${it.qty ?? it.quantity ?? 1}`)
      .join(", ") || "—";

    const isFlashing = newOrderHighlightIds.has(String(o.id));
    const tr = document.createElement("tr");
    tr.className = "clickable-row" + (isFlashing ? " new-order-flash" : "");
    tr.setAttribute("data-order-row", String(o.id));
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
          ${me?.role === "founder" ? `<button class="icon-btn" data-del-order="${o.id}" title="Delete order">✕</button>` : ""}
        </div>
      </td>
    `;

    tr.addEventListener("click", (evt) => {
      if (
        evt.target.closest("select") ||
        evt.target.closest("[data-del-order]") ||
        evt.target.closest(".receipt-btn") ||
        evt.target.closest(".edit-order-btn")
      )
        return;
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

async function loadOrders() {
  allOrders = await api("/api/orders");
  allOrders.forEach((o) => knownOrderIds.add(String(o.id)));
  hasInitialOrdersLoaded = true;
  renderOrders();
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
    const created = await api("/api/orders", "POST", {
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
    if (created?.id) knownOrderIds.add(String(created.id));
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

/* ─── STOCK STATE & HELPERS ────────────────────────────────────── */
let stockActiveFilter = "all";
let stockSearchQuery = "";
let stockActiveSort = "name_asc";
let stockActiveView = localStorage.getItem("static_stock_view") || "table";
const stockDebounceTimers = new Map();
let isStockEventsBound = false;

function getStockStatus(qty) {
  const q = Number(qty || 0);
  if (q <= 0) {
    return {
      status: "out_stock",
      label: "Out of stock",
      badgeClass: "stock-status-badge out-stock",
      dotClass: "stock-dot-danger",
      percent: 0,
    };
  }
  if (q <= 5) {
    return {
      status: "low_stock",
      label: `Low: ${q} left`,
      badgeClass: "stock-status-badge low-stock",
      dotClass: "stock-dot-warning",
      percent: Math.min(100, Math.round((q / 20) * 100)),
    };
  }
  return {
    status: "in_stock",
    label: `${q} in stock`,
    badgeClass: "stock-status-badge in-stock",
    dotClass: "stock-dot-success",
    percent: Math.min(100, Math.round((q / 20) * 100)),
  };
}

function getStockCategoryPill(item) {
  const sku = formatStockSku(item).toLowerCase();
  const name = String(item.itemName || "").toLowerCase();
  if (sku.startsWith("stk") || sku.startsWith("ssh") || name.includes("sticker")) {
    return `<span class="stock-cat-pill cat-stickers">Stickers</span>`;
  }
  if (sku.startsWith("ptr") || name.includes("poster")) {
    return `<span class="stock-cat-pill cat-posters">Posters</span>`;
  }
  if (sku.startsWith("mls") || name.includes("mail")) {
    return `<span class="stock-cat-pill cat-mail">Mail Sub</span>`;
  }
  return `<span class="stock-cat-pill cat-general">Product</span>`;
}

function renderStockKPIs() {
  const totalProducts = allStock.length;
  const totalUnits = allStock.reduce((sum, s) => sum + Number(s.quantity || 0), 0);
  const totalValuation = allStock.reduce((sum, s) => sum + (Number(s.quantity || 0) * Number(s.price || 0)), 0);

  const inStockCount = allStock.filter((s) => Number(s.quantity || 0) > 5).length;
  const lowStockCount = allStock.filter((s) => Number(s.quantity || 0) > 0 && Number(s.quantity || 0) <= 5).length;
  const outStockCount = allStock.filter((s) => Number(s.quantity || 0) <= 0).length;
  const alertCount = lowStockCount + outStockCount;

  const kpiProducts = $("#stockKpiTotalProducts");
  if (kpiProducts) kpiProducts.textContent = `${totalProducts} item${totalProducts === 1 ? "" : "s"}`;

  const kpiUnits = $("#stockKpiTotalUnits");
  if (kpiUnits) kpiUnits.textContent = `${totalUnits.toLocaleString()} units`;

  const kpiVal = $("#stockKpiTotalValue");
  if (kpiVal) kpiVal.textContent = money(totalValuation) + " EGP";

  const kpiAlert = $("#stockKpiAlertCount");
  if (kpiAlert) kpiAlert.textContent = alertCount === 1 ? "1 item" : `${alertCount} items`;

  const alertCard = $("#stockKpiAlertCard");
  if (alertCard) alertCard.classList.toggle("has-alerts", alertCount > 0);

  const cAll = $("#countStockAll");
  if (cAll) cAll.textContent = totalProducts;
  const cIn = $("#countStockIn");
  if (cIn) cIn.textContent = inStockCount;
  const cLow = $("#countStockLow");
  if (cLow) cLow.textContent = lowStockCount;
  const cOut = $("#countStockOut");
  if (cOut) cOut.textContent = outStockCount;
}

function saveStockQuantityDebounced(stockId, newQty) {
  if (stockDebounceTimers.has(stockId)) {
    clearTimeout(stockDebounceTimers.get(stockId));
  }
  const timer = setTimeout(async () => {
    try {
      await api(`/api/stock/${stockId}`, "PUT", { quantity: Number(newQty) });
      stockDebounceTimers.delete(stockId);
      stockCache = allStock;
    } catch (err) {
      console.error("Failed to save stock quantity:", err);
      loadStock();
    }
  }, 320);
  stockDebounceTimers.set(stockId, timer);
}

function changeStockQty(stockId, delta) {
  const item = allStock.find((s) => String(s.id) === String(stockId));
  if (!item) return;

  const newQty = Math.max(0, (Number(item.quantity) || 0) + delta);
  item.quantity = newQty;

  document.querySelectorAll(`input[data-qty-id="${stockId}"]`).forEach((input) => {
    input.value = newQty;
  });

  const status = getStockStatus(newQty);

  const row = document.querySelector(`tr[data-stock-row-id="${stockId}"]`);
  if (row) {
    const statusWrap = row.querySelector(".stock-status-badge-wrap") || row.querySelector(".stock-status-cell");
    if (statusWrap) {
      statusWrap.innerHTML = `<span class="stock-status-badge ${status.badgeClass}"><span class="stock-dot ${status.dotClass}"></span><span class="stock-status-text">${status.label}</span></span>`;
    }
    const valCell = row.querySelector(".stock-val-cell");
    if (valCell) {
      valCell.textContent = `Val: ${money(newQty * Number(item.price || 0))} EGP`;
    }
  }

  const card = document.querySelector(`div[data-stock-card-id="${stockId}"]`);
  if (card) {
    const cardStatus = card.querySelector(".stock-card-status");
    if (cardStatus) {
      cardStatus.className = `stock-card-status ${status.badgeClass}`;
      cardStatus.innerHTML = `<span class="stock-dot ${status.dotClass}"></span>${status.label}`;
    }
    const cardVal = card.querySelector(".stock-card-valuation-val");
    if (cardVal) {
      cardVal.textContent = money(newQty * Number(item.price || 0)) + " EGP";
    }
  }

  renderStockKPIs();
  saveStockQuantityDebounced(stockId, newQty);
}

function renderStockTableView(items) {
  const body = $("#stockBody");
  if (!body) return;
  body.innerHTML = "";

  items.forEach((s) => {
    const sku = formatStockSku(s);
    const status = getStockStatus(s.quantity);
    const catPill = getStockCategoryPill(s);
    const initial = (s.itemName || "P").trim().charAt(0).toUpperCase();
    const valuation = Number(s.quantity || 0) * Number(s.price || 0);

    const tr = document.createElement("tr");
    tr.className = "clickable-row stock-item-row";
    tr.setAttribute("data-stock-row-id", String(s.id));
    tr.innerHTML = `
      <td class="stock-col-product" data-label="Product & Status">
        <div class="stock-item-info">
          <div class="stock-item-avatar">${escapeHtml(initial)}</div>
          <div class="stock-item-names">
            <div class="stock-item-name" title="${escapeHtml(s.itemName)}">${escapeHtml(s.itemName)}</div>
            <div class="stock-item-sub">
              ${catPill}
              <span class="stock-sku-badge" title="SKU: ${escapeHtml(sku)}">${escapeHtml(sku)}</span>
              <span class="stock-status-badge-wrap">
                <span class="stock-status-badge ${status.badgeClass}">
                  <span class="stock-dot ${status.dotClass}"></span>
                  <span class="stock-status-text">${status.label}</span>
                </span>
              </span>
            </div>
          </div>
        </div>
      </td>
      <td class="stock-col-qty" data-label="Stock Level">
        <div class="stock-stepper">
          <button type="button" class="stock-step-btn minus" data-step-minus="${s.id}" title="Decrease quantity">−</button>
          <input type="number" min="0" value="${s.quantity}" data-qty-id="${s.id}" class="stock-step-input" />
          <button type="button" class="stock-step-btn plus" data-step-plus="${s.id}" title="Increase quantity">+</button>
        </div>
      </td>
      <td class="stock-col-price" data-label="Price & Valuation">
        <div class="stock-price-block">
          <div class="stock-unit-price">${money(s.price)} <small>EGP</small></div>
          <div class="stock-val-sub stock-val-cell" title="Total inventory valuation: ${money(valuation)} EGP">Val: ${money(valuation)} EGP</div>
        </div>
      </td>
      <td class="stock-col-actions" data-label="Actions">
        <div class="stock-row-actions">
          <button type="button" class="barcode-action-btn sm" data-barcode-stock="${s.id}" title="Print Barcode Labels">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8v8"/><path d="M10 8v8"/><path d="M14 8v8"/><path d="M17 8v8"/></svg>
            <span class="stock-action-btn-text">Labels</span>
          </button>
          <button type="button" class="icon-btn edit-stock-row-btn" data-edit-stock="${s.id}" title="Edit Product Details">
            <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
          </button>
          ${me.role === "founder" ? `<button type="button" class="icon-btn danger-hover" data-del-stock="${s.id}" title="Delete item">✕</button>` : ""}
        </div>
      </td>
    `;

    tr.addEventListener("click", (evt) => {
      if (
        evt.target.closest("input") ||
        evt.target.closest("button") ||
        evt.target.closest(".stock-stepper") ||
        evt.target.closest(".stock-row-actions")
      ) return;
      openStockDetail(s.id);
    });

    body.appendChild(tr);
  });

  attachStockInteractiveListeners(body);
}

function renderStockGridView(items) {
  const container = $("#stockCardsGrid");
  if (!container) return;
  container.innerHTML = "";

  items.forEach((s) => {
    const sku = formatStockSku(s);
    const status = getStockStatus(s.quantity);
    const catPill = getStockCategoryPill(s);
    const initial = (s.itemName || "P").trim().charAt(0).toUpperCase();
    const valuation = Number(s.quantity || 0) * Number(s.price || 0);

    const card = document.createElement("div");
    card.className = "stock-grid-card";
    card.setAttribute("data-stock-card-id", String(s.id));
    card.innerHTML = `
      <div class="stock-grid-card-top">
        <div class="stock-card-info">
          <div class="stock-item-avatar lg">${escapeHtml(initial)}</div>
          <div class="stock-card-title-box">
            <div class="stock-card-name" title="${escapeHtml(s.itemName)}">${escapeHtml(s.itemName)}</div>
            <div class="stock-card-meta">
              <span class="stock-sku-badge">${escapeHtml(sku)}</span>
              ${catPill}
            </div>
          </div>
        </div>
        <span class="stock-card-status ${status.badgeClass}">
          <span class="stock-dot ${status.dotClass}"></span>${status.label}
        </span>
      </div>

      <div class="stock-grid-card-metrics">
        <div class="stock-card-metric">
          <span class="stock-metric-label">Unit Price</span>
          <span class="stock-metric-val">${money(s.price)} <small>EGP</small></span>
        </div>
        <div class="stock-card-metric">
          <span class="stock-metric-label">Valuation</span>
          <span class="stock-metric-val stock-card-valuation-val" style="color:var(--accent);font-weight:700;">${money(valuation)} <small>EGP</small></span>
        </div>
      </div>

      <div class="stock-grid-card-qty-row">
        <span class="stock-metric-label" style="font-weight:600;color:var(--text);">Inventory:</span>
        <div class="stock-stepper">
          <button type="button" class="stock-step-btn minus" data-step-minus="${s.id}" title="Decrease quantity">−</button>
          <input type="number" min="0" value="${s.quantity}" data-qty-id="${s.id}" class="stock-step-input" />
          <button type="button" class="stock-step-btn plus" data-step-plus="${s.id}" title="Increase quantity">+</button>
        </div>
      </div>

      <div class="stock-grid-card-footer">
        <button type="button" class="barcode-action-btn" data-barcode-stock="${s.id}" title="Print Barcode Labels">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8v8"/><path d="M10 8v8"/><path d="M14 8v8"/><path d="M17 8v8"/></svg>
          <span>Print Labels</span>
        </button>
        <div style="display:flex;gap:6px;align-items:center;">
          <button type="button" class="ghost-btn stock-edit-btn" data-edit-stock="${s.id}">Edit</button>
          ${me.role === "founder" ? `<button type="button" class="icon-btn danger-hover" data-del-stock="${s.id}" title="Delete item">✕</button>` : ""}
        </div>
      </div>
    `;

    card.addEventListener("click", (evt) => {
      if (
        evt.target.closest("input") ||
        evt.target.closest("button") ||
        evt.target.closest(".stock-stepper") ||
        evt.target.closest(".stock-grid-card-footer")
      ) return;
      openStockDetail(s.id);
    });

    container.appendChild(card);
  });

  attachStockInteractiveListeners(container);
}

function attachStockInteractiveListeners(parent) {
  parent.querySelectorAll("[data-step-plus]").forEach((btn) => {
    btn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      changeStockQty(btn.dataset.stepPlus, 1);
    });
  });

  parent.querySelectorAll("[data-step-minus]").forEach((btn) => {
    btn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      changeStockQty(btn.dataset.stepMinus, -1);
    });
  });

  parent.querySelectorAll("input[data-qty-id]").forEach((input) => {
    input.addEventListener("change", (evt) => {
      evt.stopPropagation();
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      const s = allStock.find((item) => String(item.id) === String(input.dataset.qtyId));
      if (s) {
        s.quantity = val;
        renderStockKPIs();
        saveStockQuantityDebounced(s.id, val);
      }
    });
    input.addEventListener("click", (evt) => evt.stopPropagation());
  });

  parent.querySelectorAll("[data-edit-stock]").forEach((btn) => {
    btn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      openStockDetail(btn.dataset.editStock);
    });
  });

  parent.querySelectorAll("[data-del-stock]").forEach((btn) => {
    btn.addEventListener("click", async (evt) => {
      evt.stopPropagation();
      if (confirm("Remove this item from stock?")) {
        await api(`/api/stock/${btn.dataset.delStock}`, "DELETE");
        loadStock();
      }
    });
  });

  parent.querySelectorAll("[data-barcode-stock]").forEach((btn) => {
    btn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      openStockBarcodeModal(btn.dataset.barcodeStock);
    });
  });
}

function bindStockToolbarEvents() {
  if (isStockEventsBound) return;
  isStockEventsBound = true;

  const searchInput = $("#stockSearchInput");
  const searchClear = $("#stockSearchClear");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      stockSearchQuery = searchInput.value;
      if (searchClear) searchClear.classList.toggle("hidden", !stockSearchQuery);
      renderStock();
    });
  }

  if (searchClear && searchInput) {
    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      stockSearchQuery = "";
      searchClear.classList.add("hidden");
      searchInput.focus();
      renderStock();
    });
  }

  document.querySelectorAll("#stockFilterChips .stock-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#stockFilterChips .stock-chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      stockActiveFilter = chip.dataset.stockFilter || "all";
      renderStock();
    });
  });

  document.querySelectorAll("#stockSummaryGrid .stock-kpi-card").forEach((card) => {
    card.addEventListener("click", () => {
      const kpiType = card.dataset.stockKpi;
      let targetFilter = "all";
      if (kpiType === "in_stock") targetFilter = "in_stock";
      else if (kpiType === "alert") targetFilter = "low_stock";
      else targetFilter = "all";

      const targetChip = document.querySelector(`#stockFilterChips [data-stock-filter="${targetFilter}"]`);
      if (targetChip) {
        targetChip.click();
      } else {
        stockActiveFilter = targetFilter;
        renderStock();
      }
    });
  });

  const sortSelect = $("#stockSortSelect");
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      stockActiveSort = sortSelect.value || "name_asc";
      renderStock();
    });
  }

  const viewTableBtn = $("#stockViewTableBtn");
  const viewGridBtn = $("#stockViewGridBtn");

  if (viewTableBtn && viewGridBtn) {
    viewTableBtn.addEventListener("click", () => {
      stockActiveView = "table";
      localStorage.setItem("static_stock_view", "table");
      viewTableBtn.classList.add("active");
      viewGridBtn.classList.remove("active");
      renderStock();
    });

    viewGridBtn.addEventListener("click", () => {
      stockActiveView = "grid";
      localStorage.setItem("static_stock_view", "grid");
      viewGridBtn.classList.add("active");
      viewTableBtn.classList.remove("active");
      renderStock();
    });

    if (stockActiveView === "grid") {
      viewGridBtn.classList.add("active");
      viewTableBtn.classList.remove("active");
    } else {
      viewTableBtn.classList.add("active");
      viewGridBtn.classList.remove("active");
    }
  }

  const resetBtn = $("#stockResetFiltersBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      stockSearchQuery = "";
      if (searchClear) searchClear.classList.add("hidden");
      const allChip = document.querySelector('#stockFilterChips [data-stock-filter="all"]');
      if (allChip) allChip.click();
      else {
        stockActiveFilter = "all";
        renderStock();
      }
    });
  }
}

function renderStock() {
  renderStockKPIs();

  const emptyEl = $("#stockEmpty");
  const noResultsEl = $("#stockNoResults");
  const tableWrap = $("#stockTableWrap");
  const gridWrap = $("#stockGridWrap");

  if (!allStock || allStock.length === 0) {
    if (emptyEl) emptyEl.classList.remove("hidden");
    if (noResultsEl) noResultsEl.classList.add("hidden");
    if (tableWrap) tableWrap.classList.add("hidden");
    if (gridWrap) gridWrap.classList.add("hidden");
    return;
  }
  if (emptyEl) emptyEl.classList.add("hidden");

  const q = (stockSearchQuery || "").toLowerCase().trim();
  let filtered = allStock.filter((s) => {
    const qty = Number(s.quantity || 0);

    if (stockActiveFilter === "in_stock" && qty <= 5) return false;
    if (stockActiveFilter === "low_stock" && (qty <= 0 || qty > 5)) return false;
    if (stockActiveFilter === "out_stock" && qty > 0) return false;
    if (stockActiveFilter === "alert" && qty > 5) return false;

    if (q) {
      const sku = formatStockSku(s).toLowerCase();
      const name = String(s.itemName || "").toLowerCase();
      const rawId = String(s.id || "").toLowerCase();
      if (!name.includes(q) && !sku.includes(q) && !rawId.includes(q)) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    if (noResultsEl) noResultsEl.classList.remove("hidden");
    if (tableWrap) tableWrap.classList.add("hidden");
    if (gridWrap) gridWrap.classList.add("hidden");
    return;
  }
  if (noResultsEl) noResultsEl.classList.add("hidden");

  filtered.sort((a, b) => {
    const nameA = String(a.itemName || "");
    const nameB = String(b.itemName || "");
    const qtyA = Number(a.quantity || 0);
    const qtyB = Number(b.quantity || 0);
    const priceA = Number(a.price || 0);
    const priceB = Number(b.price || 0);

    switch (stockActiveSort) {
      case "name_desc":
        return nameB.localeCompare(nameA);
      case "qty_asc":
        return qtyA - qtyB;
      case "qty_desc":
        return qtyB - qtyA;
      case "price_desc":
        return priceB - priceA;
      case "price_asc":
        return priceA - priceB;
      case "name_asc":
      default:
        return nameA.localeCompare(nameB);
    }
  });

  if (stockActiveView === "grid") {
    if (tableWrap) tableWrap.classList.add("hidden");
    if (gridWrap) gridWrap.classList.remove("hidden");
    renderStockGridView(filtered);
  } else {
    if (tableWrap) tableWrap.classList.remove("hidden");
    if (gridWrap) gridWrap.classList.add("hidden");
    renderStockTableView(filtered);
  }
}

async function loadStock() {
  allStock = await api("/api/stock");
  stockCache = allStock;
  bindStockToolbarEvents();
  renderStock();
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

/* ─── PHYSICAL STORES & CONSIGNED STOCK MODULE ───────────────────── */
const LUCIDE = {
  mapPin: '<svg class="lucide lucide-map-pin" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  phone: '<svg class="lucide lucide-phone" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  fileText: '<svg class="lucide lucide-file-text" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  store: '<svg class="lucide lucide-store" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>',
  boxes: '<svg class="lucide lucide-boxes" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  pencil: '<svg class="lucide lucide-pencil" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
  printer: '<svg class="lucide lucide-printer" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>',
  plus: '<svg class="lucide lucide-plus" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  minus: '<svg class="lucide lucide-minus" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash2: '<svg class="lucide lucide-trash-2" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  x: '<svg class="lucide lucide-x" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
};

let activeStore = null;

// Initialize Stock Subnav switcher
function initStockSubnav() {
  document.querySelectorAll("#stockSubnav .subnav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#stockSubnav .subnav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.stockSubtab;
      document.querySelectorAll("#tab-stock .stock-subtab-view").forEach((view) => {
        view.classList.toggle("hidden", view.id !== target);
      });
      if (target === "subtab-stock-stores") {
        loadStores();
      }
    });
  });
}

async function loadStores() {
  try {
    const data = await api("/api/stores");
    allStores = data || [];
    renderStores();
  } catch (err) {
    console.error("loadStores error:", err.message);
  }
}

function renderStores(filterText = "") {
  const grid = $("#storesGrid");
  const empty = $("#storesEmpty");
  if (!grid) return;

  const q = (filterText || $("#storeSearchInput")?.value || "").toLowerCase().trim();
  const filtered = q
    ? allStores.filter((s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.location || "").toLowerCase().includes(q) ||
        (s.contact || "").toLowerCase().includes(q) ||
        (s.notes || "").toLowerCase().includes(q)
      )
    : allStores;

  // Update Store KPIs
  const totalShops = allStores.length;
  const totalUnits = allStores.reduce((sum, s) => sum + (Number(s.totalUnits) || 0), 0);
  const totalVal = allStores.reduce((sum, s) => sum + (Number(s.totalValuation) || 0), 0);

  if ($("#storeKpiTotalShops")) $("#storeKpiTotalShops").textContent = `${totalShops} shop${totalShops === 1 ? "" : "s"}`;
  if ($("#storeKpiTotalUnits")) $("#storeKpiTotalUnits").textContent = `${totalUnits.toLocaleString("en-EG")} units`;
  if ($("#storeKpiTotalValue")) $("#storeKpiTotalValue").textContent = `${money(totalVal)} EGP`;

  if (!filtered.length) {
    grid.innerHTML = "";
    if (empty) {
      empty.classList.remove("hidden");
      empty.textContent = q ? "No partner shops match your search." : 'No physical shops added yet. Click "+ Add New Shop" to register your first partner store.';
    }
    return;
  }

  if (empty) empty.classList.add("hidden");

  grid.innerHTML = filtered.map((s) => `
    <div class="store-card" data-store-id="${s.id}">
      <div>
        <div class="store-card-header">
          <div>
            <div class="store-card-title">${escapeHtml(s.name)}</div>
            <div class="store-card-meta">
              ${s.location ? `<div class="store-card-meta-item">${LUCIDE.mapPin} <span>${escapeHtml(s.location)}</span></div>` : ""}
              ${s.contact ? `<div class="store-card-meta-item">${LUCIDE.phone} <span>${escapeHtml(s.contact)}</span></div>` : ""}
              ${s.notes ? `<div class="store-card-meta-item" style="font-style:italic;">${LUCIDE.fileText} <span>${escapeHtml(s.notes)}</span></div>` : ""}
            </div>
          </div>
          <span class="offline-badge">Offline Stock</span>
        </div>

        <div class="store-card-stats" style="margin-top:14px;">
          <div>
            <div class="store-card-stat-label">Items</div>
            <div class="store-card-stat-val">${s.itemTypesCount || 0}</div>
          </div>
          <div>
            <div class="store-card-stat-label">Units</div>
            <div class="store-card-stat-val">${(s.totalUnits || 0).toLocaleString("en-EG")}</div>
          </div>
          <div>
            <div class="store-card-stat-label">Valuation</div>
            <div class="store-card-stat-val" style="color:var(--accent);">${money(s.totalValuation || 0)}</div>
          </div>
        </div>
      </div>

      <div class="store-card-actions">
        <button type="button" class="primary-btn" data-manage-store="${s.id}" style="padding:6px 14px;font-size:12.5px;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
          ${LUCIDE.boxes}
          <span>Manage Stock</span>
        </button>
        <div style="display:flex;gap:6px;align-items:center;">
          <button type="button" class="ghost-btn" data-edit-store="${s.id}" title="Edit Shop Info" style="padding:6px 10px;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
            ${LUCIDE.pencil}
            <span>Edit</span>
          </button>
          <button type="button" class="ghost-btn" data-print-store="${s.id}" title="Print Consignment Slip" style="padding:6px 10px;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
            ${LUCIDE.printer}
            <span>Slip</span>
          </button>
        </div>
      </div>
    </div>
  `).join("");

  // Attach card event listeners
  grid.querySelectorAll("[data-manage-store]").forEach((btn) => {
    btn.addEventListener("click", () => openStoreDetail(btn.dataset.manageStore));
  });
  grid.querySelectorAll("[data-edit-store]").forEach((btn) => {
    btn.addEventListener("click", () => openEditStoreModal(btn.dataset.editStore));
  });
  grid.querySelectorAll("[data-print-store]").forEach((btn) => {
    btn.addEventListener("click", () => printStoreSlip(btn.dataset.printStore));
  });
}

function openAddStoreModal() {
  $("#storeModalTitle").textContent = "Add Partner Shop";
  $("#storeEditId").value = "";
  $("#storeName").value = "";
  $("#storeLocation").value = "";
  $("#storeContact").value = "";
  $("#storeNotes").value = "";
  $("#storeSubmitBtn").textContent = "Save Shop";
  $("#storeModal").classList.remove("hidden");
  $("#storeName").focus();
}

function openEditStoreModal(storeId) {
  const store = allStores.find((s) => s.id === storeId);
  if (!store) return;
  $("#storeModalTitle").textContent = "Edit Partner Shop";
  $("#storeEditId").value = store.id;
  $("#storeName").value = store.name || "";
  $("#storeLocation").value = store.location || "";
  $("#storeContact").value = store.contact || "";
  $("#storeNotes").value = store.notes || "";
  $("#storeSubmitBtn").textContent = "Save Changes";
  $("#storeModal").classList.remove("hidden");
  $("#storeName").focus();
}

async function openStoreDetail(storeId) {
  try {
    const store = await api(`/api/stores/${storeId}`);
    if (!store) return;
    activeStore = store;

    $("#storeDetailName").textContent = store.name;
    const locEl = $("#storeDetailLocation");
    if (locEl) {
      locEl.innerHTML = store.location
        ? `<span style="display:inline-flex;align-items:center;gap:4px;">${LUCIDE.mapPin} <span>${escapeHtml(store.location)}</span></span>`
        : `<span style="display:inline-flex;align-items:center;gap:4px;">${LUCIDE.mapPin} <span>No location specified</span></span>`;
    }
    const conEl = $("#storeDetailContact");
    if (conEl) {
      conEl.innerHTML = store.contact
        ? `<span style="display:inline-flex;align-items:center;gap:4px;">${LUCIDE.phone} <span>${escapeHtml(store.contact)}</span></span>`
        : `<span style="display:inline-flex;align-items:center;gap:4px;">${LUCIDE.phone} <span>No contact</span></span>`;
    }

    // Populate the dropdown selector from warehouse stock
    const select = $("#storeProductSelect");
    if (select) {
      select.innerHTML = '<option value="">-- Choose from warehouse stock --</option>' +
        (allStock || []).map((stk) => `
          <option value="${escapeHtml(stk.id)}" data-name="${escapeHtml(stk.itemName)}" data-sku="${escapeHtml(stk.sku || '')}" data-price="${stk.price || 0}">
            ${escapeHtml(stk.itemName)} (${stk.quantity} in warehouse · ${money(stk.price)} EGP)
          </option>
        `).join("");
    }

    // Reset item form
    $("#storeCustomItemName").value = "";
    $("#storeCustomSku").value = "";
    $("#storeAddQty").value = "10";
    $("#storeAddPrice").value = "0";
    $("#storeAddNote").value = "";

    renderStoreItems(store.items || []);
    $("#storeDetailModal").classList.remove("hidden");
  } catch (err) {
    alert("Could not load store details: " + err.message);
  }
}

function renderStoreItems(items = []) {
  const tbody = $("#storeItemsBody");
  const empty = $("#storeItemsEmpty");
  if (!tbody) return;

  const totalUnits = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const totalVal = items.reduce((s, it) => s + (Number(it.totalValue) || (Number(it.quantity || 0) * Number(it.price || 0))), 0);

  if ($("#storeDetailItemsCount")) $("#storeDetailItemsCount").textContent = items.length;
  if ($("#storeDetailUnitsCount")) $("#storeDetailUnitsCount").textContent = `${totalUnits.toLocaleString("en-EG")} units`;
  if ($("#storeDetailTotalVal")) $("#storeDetailTotalVal").textContent = `${money(totalVal)} EGP`;

  if (!items.length) {
    tbody.innerHTML = "";
    if (empty) empty.classList.remove("hidden");
    return;
  }

  if (empty) empty.classList.add("hidden");

  tbody.innerHTML = items.map((it) => {
    const unitPrice = Number(it.price) || 0;
    const qty = Number(it.quantity) || 0;
    const lineVal = qty * unitPrice;

    return `
      <tr data-store-item-id="${it.id}">
        <td>
          <strong style="color:var(--text);font-size:13.5px;">${escapeHtml(it.itemName)}</strong>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:1px;">
            ${it.sku ? `<span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--accent);">${escapeHtml(it.sku)}</span>` : ""}
            <span class="store-item-unit-price-mobile" style="font-size:11.5px;color:var(--text-muted);">· ${money(unitPrice)} EGP ea</span>
          </div>
          ${it.notes ? `<div class="store-item-note-sub" style="font-size:11px;color:var(--text-muted);margin-top:2px;display:inline-flex;align-items:center;gap:4px;">${LUCIDE.fileText} <span>${escapeHtml(it.notes)}</span></div>` : ""}
        </td>
        <td class="store-table-unitprice-col" style="text-align:right;font-weight:600;font-size:13px;white-space:nowrap;">
          ${money(unitPrice)} EGP
        </td>
        <td style="text-align:center;">
          <div class="store-qty-ctrl">
            <button type="button" class="store-qty-btn" data-step-store-item="${it.id}" data-delta="-1" title="Deduct 1">${LUCIDE.minus}</button>
            <span class="store-qty-val">${qty}</span>
            <button type="button" class="store-qty-btn" data-step-store-item="${it.id}" data-delta="1" title="Add 1">${LUCIDE.plus}</button>
          </div>
        </td>
        <td style="text-align:right;font-weight:700;color:var(--text);white-space:nowrap;">
          ${money(lineVal)} EGP
        </td>
        <td class="store-table-note-col" style="color:var(--text-muted);font-size:12px;">
          ${escapeHtml(it.notes || "—")}
        </td>
        <td style="text-align:right;white-space:nowrap;">
          <button type="button" class="icon-btn" data-del-store-item="${it.id}" title="Remove this item from shop" style="color:var(--danger,#e53935);display:inline-flex;align-items:center;justify-content:center;padding:4px;">${LUCIDE.trash2}</button>
        </td>
      </tr>
    `;
  }).join("");

  // Attach quantity stepper events
  tbody.querySelectorAll("[data-step-store-item]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemId = btn.dataset.stepStoreItem;
      const delta = parseInt(btn.dataset.delta, 10);
      const item = items.find((it) => it.id === itemId);
      if (!item || !activeStore) return;

      const newQty = Math.max(0, (Number(item.quantity) || 0) + delta);
      try {
        const updated = await api(`/api/stores/${activeStore.id}/items/${itemId}`, "PUT", { quantity: newQty });
        item.quantity = updated.quantity;
        item.totalValue = Number(updated.quantity) * Number(updated.price);
        renderStoreItems(items);
        loadStores(); // update background cards
      } catch (err) {
        alert("Failed to update quantity: " + err.message);
      }
    });
  });

  // Attach item delete events
  tbody.querySelectorAll("[data-del-store-item]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemId = btn.dataset.delStoreItem;
      const item = items.find((it) => it.id === itemId);
      if (!item || !activeStore) return;
      if (!confirm(`Remove "${item.itemName}" from ${activeStore.name}?`)) return;

      try {
        await api(`/api/stores/${activeStore.id}/items/${itemId}`, "DELETE");
        const idx = items.findIndex((it) => it.id === itemId);
        if (idx !== -1) items.splice(idx, 1);
        renderStoreItems(items);
        loadStores();
      } catch (err) {
        alert("Failed to remove item: " + err.message);
      }
    });
  });
}

async function printStoreSlip(storeId) {
  let store = allStores.find((s) => s.id === storeId) || activeStore;
  if (!store && storeId) {
    try {
      store = await api(`/api/stores/${storeId}`);
    } catch (e) {
      console.warn("Could not find store:", e);
    }
  }
  if (!store) return;

  // Ensure full store items are loaded even if opened directly from card
  if (!store.items || (activeStore && activeStore.id === store.id && activeStore.items)) {
    if (activeStore && activeStore.id === store.id && activeStore.items) {
      store = activeStore;
    } else {
      try {
        const full = await api(`/api/stores/${store.id}`);
        if (full) store = full;
      } catch (e) {
        console.warn("Could not fetch full store details:", e);
      }
    }
  }

  const section = $("#printSection");
  if (!section) return;

  // Clear any modal scroll locks
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";

  const items = store.items || [];
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const totalUnits = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const totalVal = items.reduce((s, it) => s + ((Number(it.quantity) || 0) * (Number(it.price) || 0)), 0);

  section.innerHTML = `
    <div class="print-page print-report-page">
      <div class="print-header">
        <div class="print-logo-row">
          <img src="img/1111-removebg-preview.png" class="print-brand-logo" alt="Static" />
          <div class="print-brand-text">
            <div class="print-brand-name">STATIC</div>
            <div class="print-brand-tagline">Consignment Delivery Slip · Physical Partner Store</div>
          </div>
        </div>
        <div class="print-doc-info">
          <div class="print-doc-title">CONSIGNMENT SLIP</div>
          <div class="print-doc-meta"><strong>Date:</strong> ${dateStr}</div>
          <div class="print-doc-meta"><strong>Partner:</strong> ${escapeHtml(store.name)}</div>
        </div>
      </div>

      <div class="print-store-meta-box">
        <div><strong>Shop Name:</strong> ${escapeHtml(store.name)}</div>
        <div><strong>Location:</strong> ${escapeHtml(store.location || "N/A")}</div>
        <div><strong>Contact:</strong> ${escapeHtml(store.contact || "N/A")}</div>
        <div><strong>Inventory Type:</strong> Consigned Partner Stock (Offline)</div>
        ${store.notes ? `<div style="grid-column:1 / -1;"><strong>Notes:</strong> ${escapeHtml(store.notes)}</div>` : ""}
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th style="width:40px;text-align:center;">#</th>
            <th>Item Description</th>
            <th style="width:130px;">SKU / Code</th>
            <th style="text-align:right;width:120px;">Unit Price</th>
            <th style="text-align:center;width:90px;">Quantity</th>
            <th style="text-align:right;width:130px;">Total Value</th>
          </tr>
        </thead>
        <tbody>
          ${items.length ? items.map((it, idx) => `
            <tr>
              <td style="text-align:center;color:#6b7280;">${idx + 1}</td>
              <td><strong>${escapeHtml(it.itemName)}</strong>${it.notes ? `<div style="font-size:10.5px;color:#6b7280;margin-top:2px;">${escapeHtml(it.notes)}</div>` : ""}</td>
              <td style="font-family:monospace;font-size:11px;color:#4b5563;">${escapeHtml(it.sku || "—")}</td>
              <td style="text-align:right;">${money(it.price)} EGP</td>
              <td style="text-align:center;font-weight:700;">${it.quantity}</td>
              <td style="text-align:right;font-weight:700;">${money((Number(it.quantity) || 0) * (Number(it.price) || 0))} EGP</td>
            </tr>
          `).join("") : '<tr><td colspan="6" style="text-align:center;padding:24px;color:#6b7280;">No stock items recorded for this partner shop.</td></tr>'}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="text-align:right;">TOTAL CONSIGNED:</td>
            <td style="text-align:center;">${totalUnits} units</td>
            <td style="text-align:right;">${money(totalVal)} EGP</td>
          </tr>
        </tfoot>
      </table>

      <div class="print-signatures">
        <div class="print-sign-box">
          <div><strong>Delivered By (Static Team):</strong></div>
          <div class="print-sign-line">Signature: ___________________________________</div>
        </div>
        <div class="print-sign-box">
          <div><strong>Received By (Store Manager):</strong></div>
          <div class="print-sign-line">Signature: ___________________________________</div>
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

// Wire up store forms and controls
(function initStoreEventListeners() {
  initStockSubnav();

  // Add shop button
  const openAddBtn = $("#openAddStoreBtn");
  if (openAddBtn) {
    openAddBtn.addEventListener("click", openAddStoreModal);
  }

  // Store form submission (Add / Edit)
  const storeForm = $("#storeForm");
  if (storeForm) {
    storeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const editId = $("#storeEditId").value;
      const payload = {
        name: $("#storeName").value.trim(),
        location: $("#storeLocation").value.trim(),
        contact: $("#storeContact").value.trim(),
        notes: $("#storeNotes").value.trim(),
      };

      try {
        if (editId) {
          await api(`/api/stores/${editId}`, "PUT", payload);
        } else {
          await api("/api/stores", "POST", payload);
        }
        $("#storeModal").classList.add("hidden");
        await loadStores();
      } catch (err) {
        alert("Failed to save store: " + err.message);
      }
    });
  }

  // Search filter
  const searchInput = $("#storeSearchInput");
  const clearBtn = $("#storeSearchClear");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const val = searchInput.value;
      if (clearBtn) clearBtn.classList.toggle("hidden", !val);
      renderStores(val);
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      clearBtn.classList.add("hidden");
      renderStores("");
    });
  }

  // Product select in store detail modal
  const prodSelect = $("#storeProductSelect");
  if (prodSelect) {
    prodSelect.addEventListener("change", () => {
      const opt = prodSelect.options[prodSelect.selectedIndex];
      if (opt && opt.value) {
        $("#storeCustomItemName").value = opt.dataset.name || "";
        $("#storeCustomSku").value = opt.dataset.sku || "";
        $("#storeAddPrice").value = opt.dataset.price || "0";
      }
    });
  }

  // Add item to store form
  const addItemForm = $("#storeAddItemForm");
  if (addItemForm) {
    addItemForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!activeStore) return;

      const itemName = $("#storeCustomItemName").value.trim();
      const sku = $("#storeCustomSku").value.trim();
      const quantity = Number($("#storeAddQty").value) || 0;
      const price = Number($("#storeAddPrice").value) || 0;
      const notes = $("#storeAddNote").value.trim();

      if (!itemName) {
        alert("Please enter or select a product name.");
        return;
      }

      try {
        const newItem = await api(`/api/stores/${activeStore.id}/items`, "POST", {
          itemName,
          sku,
          quantity,
          price,
          notes,
        });

        if (!activeStore.items) activeStore.items = [];
        activeStore.items.push(newItem);
        renderStoreItems(activeStore.items);

        // Reset inputs
        $("#storeProductSelect").value = "";
        $("#storeCustomItemName").value = "";
        $("#storeCustomSku").value = "";
        $("#storeAddQty").value = "10";
        $("#storeAddPrice").value = "0";
        $("#storeAddNote").value = "";

        loadStores(); // update background cards
      } catch (err) {
        alert("Failed to add item to store: " + err.message);
      }
    });
  }

  // Delete store button inside detail modal
  const delStoreBtn = $("#storeDeleteShopBtn");
  if (delStoreBtn) {
    delStoreBtn.addEventListener("click", async () => {
      if (!activeStore) return;
      if (!confirm(`Are you sure you want to delete "${activeStore.name}" and all its recorded inventory?\n\nThis cannot be undone.`)) return;

      try {
        await api(`/api/stores/${activeStore.id}`, "DELETE");
        $("#storeDetailModal").classList.add("hidden");
        activeStore = null;
        await loadStores();
      } catch (err) {
        alert("Failed to delete store: " + err.message);
      }
    });
  }

  // Print slip button in detail modal
  const printSlipBtn = $("#printStoreSlipBtn");
  if (printSlipBtn) {
    printSlipBtn.addEventListener("click", () => {
      if (activeStore) printStoreSlip(activeStore.id);
    });
  }
})();

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

  const itemsSubtotal = (o.items || []).reduce((sum, it) => {
    const q = Number(it.qty ?? it.quantity ?? 1) || 0;
    const p = Number(it.price ?? it.unitPrice ?? 0) || 0;
    return sum + (q * p);
  }, 0);
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
    ? o.items.map((it) => {
        const q = Number(it.qty ?? it.quantity ?? 1) || 1;
        const p = Number(it.price ?? it.unitPrice ?? 0);
        const name = escapeHtml(it.name || it.itemName || "Item");
        return `
        <div class="receipt-item-line">
          <span class="receipt-item-name">${q} x ${name}</span>
          <span class="receipt-item-price">${money(q * p)} EGP</span>
        </div>
      `;
    }).join("")
    : `<div class="receipt-item-line"><span>1 x Custom Order</span><span>${money(grandTotal)} EGP</span></div>`;

  const paymentStatus = (o.paymentStatus || "unpaid").toUpperCase();

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
        <div class="receipt-meta-row">
          <span>Payment:</span>
          <span style="font-weight:700;">${paymentStatus}</span>
        </div>

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
   BARCODE SCANNER MODULE (Manual / USB Barcode Gun)
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

let scannerCurrentMode = "batch_intake"; // "batch_intake" | "decrement" | "audit" | "lookup"
let stockOpsBatchQty = 25;              // Default intake batch size (+25)
let sessionAuditCounts = {};            // itemId -> { count, item, expectedQty, reconciled }
let scannerSoundEnabled = true;
let lastScannedCode = null;
let lastScannedTime = 0;
let lastScanUndoPayload = null;
let sessionScanHistory = loadSavedScanHistory();
let audioCtxInstance = null;

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
    stockScanShortcut.addEventListener("click", () => switchTab("stock-ops"));
  }

  // Stock Operations Mode Switcher (batch_intake, decrement, audit, lookup)
  const modeButtons = document.querySelectorAll("#scannerModeSelector .ops-mode-btn");
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      scannerCurrentMode = btn.dataset.mode || "batch_intake";

      const batchSubbar = $("#opsBatchSubbar");
      const auditSubbar = $("#opsAuditSubbar");
      const customQtyWrap = $("#scannerCustomQtyWrap");
      const resultVarianceBox = $("#resultAuditVarianceBox");

      if (batchSubbar) batchSubbar.classList.toggle("hidden", scannerCurrentMode !== "batch_intake");
      if (auditSubbar) {
        auditSubbar.classList.toggle("hidden", scannerCurrentMode !== "audit");
        if (scannerCurrentMode === "audit") updateAuditSubbarStats();
      }
      if (customQtyWrap) {
        customQtyWrap.classList.toggle("hidden", scannerCurrentMode !== "decrement");
        if (scannerCurrentMode === "decrement") {
          const input = $("#scannerCustomQtyInput");
          if (input) input.focus();
        }
      }
      if (resultVarianceBox && scannerCurrentMode !== "audit") {
        resultVarianceBox.classList.add("hidden");
      }

      // Re-focus barcode input
      const scanInput = $("#scannerManualInput");
      if (scanInput) scanInput.focus();
    });
  });

  // Batch Intake Preset Chips & Custom Input
  const batchChips = document.querySelectorAll("#opsBatchChips .ops-chip");
  const customBatchInput = $("#opsCustomBatchInput");
  batchChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      batchChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      stockOpsBatchQty = parseInt(chip.dataset.batchQty, 10) || 25;
      if (customBatchInput) customBatchInput.value = "";
      const scanInput = $("#scannerManualInput");
      if (scanInput) scanInput.focus();
    });
  });

  if (customBatchInput) {
    customBatchInput.addEventListener("input", () => {
      const val = parseInt(customBatchInput.value, 10);
      if (val > 0) {
        stockOpsBatchQty = val;
        batchChips.forEach((c) => c.classList.remove("active"));
      }
    });
  }

  // Audit Session Reset Button
  const resetAuditBtn = $("#resetAuditSessionBtn");
  if (resetAuditBtn) {
    resetAuditBtn.addEventListener("click", () => {
      if (Object.keys(sessionAuditCounts).length === 0) return;
      if (confirm("Reset current audit session counts?")) {
        sessionAuditCounts = {};
        updateAuditSubbarStats();
        const varianceBox = $("#resultAuditVarianceBox");
        if (varianceBox) varianceBox.classList.add("hidden");
      }
      const scanInput = $("#scannerManualInput");
      if (scanInput) scanInput.focus();
    });
  }

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

  // Manual / USB Barcode Gun Form Submit
  const manualForm = $("#scannerManualForm");
  const scanInput = $("#scannerManualInput");
  const clearInputBtn = $("#scannerClearInputBtn");

  if (scanInput && clearInputBtn) {
    scanInput.addEventListener("input", () => {
      clearInputBtn.classList.toggle("hidden", !scanInput.value);
    });
    clearInputBtn.addEventListener("click", () => {
      scanInput.value = "";
      clearInputBtn.classList.add("hidden");
      scanInput.focus();
    });
  }

  if (manualForm) {
    manualForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const code = scanInput?.value.trim();
      if (!code) return;
      scanInput.value = "";
      if (clearInputBtn) clearInputBtn.classList.add("hidden");
      processBarcodeScan(code, "gun");
      setTimeout(() => {
        if (scanInput) scanInput.focus();
      }, 50);
    });
  }

  // Undo Button
  const undoBtn = $("#scannerUndoBtn");
  if (undoBtn) {
    undoBtn.addEventListener("click", handleScannerUndo);
  }

  // Result Card hover-pause and manual close button
  const resultCard = $("#scannerResultCard");
  if (resultCard) {
    resultCard.addEventListener("mouseenter", () => {
      if (scanResultDismissTimeout) {
        clearTimeout(scanResultDismissTimeout);
        scanResultDismissTimeout = null;
      }
    });
    resultCard.addEventListener("mouseleave", () => {
      if (!resultCard.classList.contains("hidden")) {
        scanResultDismissTimeout = setTimeout(hideResultCard, 2000);
      }
    });
  }

  const closeResultBtn = $("#scannerCloseResultBtn");
  if (closeResultBtn) {
    closeResultBtn.addEventListener("click", hideResultCard);
  }

  // Collapsible History Header Toggle
  const historyHeaderToggle = $("#opsHistoryHeaderToggle");
  const historyContent = $("#opsHistoryContent");
  const historyChevron = $("#opsHistoryChevron");
  if (historyHeaderToggle && historyContent) {
    historyHeaderToggle.addEventListener("click", (e) => {
      if (e.target.closest("#scannerClearHistoryBtn")) return;
      const isHidden = historyContent.classList.toggle("hidden");
      if (historyChevron) {
        historyChevron.style.transform = isHidden ? "rotate(0deg)" : "rotate(180deg)";
        historyChevron.style.transition = "transform 0.2s ease";
      }
    });
  }

  // Clear Session Log
  const clearHistoryBtn = $("#scannerClearHistoryBtn");
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      if (sessionScanHistory.length === 0) return;
      sessionScanHistory = [];
      saveScanHistory();
      renderScannerHistoryTable();
      updateOpsHistoryCount();
      if (scanInput) scanInput.focus();
    });
  }

  // Render any saved history & initialize counts on startup
  renderScannerHistoryTable();
  updateOpsHistoryCount();
}

async function processBarcodeScan(rawCode, source = "gun") {
  if (!rawCode || !String(rawCode).trim()) return;
  const cleanCode = String(rawCode).trim().toUpperCase();

  // Rapid repeat throttle: 350ms debounce for hardware barcode gun, 1800ms for camera
  const now = Date.now();
  const throttleLimit = source === "camera" ? 1800 : 350;
  if (cleanCode === lastScannedCode && now - lastScannedTime < throttleLimit) {
    return;
  }
  lastScannedCode = cleanCode;
  lastScannedTime = now;

  // Ensure input field is clear and immediately refocused for the next laser scan
  const scanInput = $("#scannerManualInput");
  if (scanInput && scanInput.value) {
    scanInput.value = "";
    const clearBtn = $("#scannerClearInputBtn");
    if (clearBtn) clearBtn.classList.add("hidden");
  }
  setTimeout(() => {
    if (scanInput) scanInput.focus();
  }, 40);

  try {
    // ── AUDIT MODE ──
    if (scannerCurrentMode === "audit") {
      // Look up current stock without modifying DB
      const res = await api("/api/stock/scan", "POST", {
        code: cleanCode,
        mode: "lookup",
        qty: 0,
      });

      const item = res.item;
      if (!sessionAuditCounts[item.id]) {
        sessionAuditCounts[item.id] = {
          count: 0,
          item: item,
          expectedQty: Number(item.quantity) || 0,
          reconciled: false,
        };
      }
      sessionAuditCounts[item.id].count += 1;
      const auditData = sessionAuditCounts[item.id];
      const variance = auditData.count - auditData.expectedQty;

      playScanAudioBeep(true);
      showAuditResult(auditData, variance);
      updateAuditSubbarStats();

      // Log to session history
      const varianceStr = variance === 0 ? "Exact" : (variance > 0 ? `+${variance}` : `${variance}`);
      sessionScanHistory.unshift({
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        itemName: item.itemName,
        sku: item.sku || cleanCode,
        price: item.price,
        action: "audit",
        delta: `Physical: ${auditData.count} (${varianceStr})`,
        previousQty: auditData.expectedQty,
        newQty: auditData.count,
      });

      saveScanHistory();
      renderScannerHistoryTable();
      updateOpsHistoryCount();
      return;
    }

    // ── BATCH INTAKE / DISPATCH / LOOKUP MODES ──
    let apiMode = "decrement";
    let scanQty = 1;

    if (scannerCurrentMode === "batch_intake") {
      apiMode = "increment";
      scanQty = stockOpsBatchQty || 25;
    } else if (scannerCurrentMode === "decrement" || scannerCurrentMode === "custom_decrement") {
      const customInput = $("#scannerCustomQtyInput");
      scanQty = Math.max(1, parseInt(customInput ? customInput.value : 1, 10) || 1);
      apiMode = "decrement";
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
    updateOpsHistoryCount();

    // Refresh stock list in background
    loadStock();
  } catch (err) {
    console.error("Stock scan error:", err);
    playScanAudioBeep(false);
    showScanResultError(err.message || `No stock item found matching barcode "${cleanCode}"`);
  }
}

function updateAuditSubbarStats() {
  const items = Object.values(sessionAuditCounts);
  const totalAuditedUnits = items.reduce((sum, entry) => sum + entry.count, 0);
  const matched = items.filter(entry => entry.count === entry.expectedQty).length;
  const discrepancies = items.filter(entry => entry.count !== entry.expectedQty).length;

  const countEl = $("#auditItemsCount");
  if (countEl) countEl.textContent = totalAuditedUnits;

  const matchedBadge = $("#auditMatchedBadge");
  if (matchedBadge) matchedBadge.textContent = `${matched} Matched`;

  const discBadge = $("#auditDiscrepancyBadge");
  if (discBadge) discBadge.textContent = `${discrepancies} Discrepanc${discrepancies === 1 ? 'y' : 'ies'}`;
}

let scanResultDismissTimeout = null;

function showResultCardWithAutoDismiss(delayMs = 4000) {
  const card = $("#scannerResultCard");
  if (!card) return;

  if (scanResultDismissTimeout) {
    clearTimeout(scanResultDismissTimeout);
    scanResultDismissTimeout = null;
  }

  card.classList.remove("hidden", "fade-out");
  card.style.opacity = "";
  card.style.transform = "";

  scanResultDismissTimeout = setTimeout(() => {
    hideResultCard();
  }, delayMs);
}

function hideResultCard() {
  const card = $("#scannerResultCard");
  if (!card || card.classList.contains("hidden")) return;

  if (scanResultDismissTimeout) {
    clearTimeout(scanResultDismissTimeout);
    scanResultDismissTimeout = null;
  }

  card.classList.add("fade-out");
  setTimeout(() => {
    card.classList.add("hidden");
    card.classList.remove("fade-out");
  }, 350);
}

function showAuditResult(auditData, variance) {
  const card = $("#scannerResultCard");
  if (!card) return;

  showResultCardWithAutoDismiss(variance === 0 ? 4000 : 7500);
  card.classList.remove("is-error");
  const icon = $("#resultStatusIcon");
  if (icon) {
    icon.className = "result-status-icon " + (variance === 0 ? "success" : "warning");
    icon.innerHTML = variance === 0
      ? `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`
      : `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  }

  $("#resultItemName").textContent = auditData.item.itemName;
  $("#resultSkuBadge").textContent = auditData.item.sku || "STK";
  $("#resultPriceBadge").textContent = `${money(auditData.item.price)} EGP`;

  const transitionEl = $("#resultStockTransition");
  if (transitionEl) {
    transitionEl.innerHTML = `Physical Scanned: <strong>${auditData.count} units</strong> &bull; System DB Expectation: <strong>${auditData.expectedQty} units</strong>`;
  }

  const varianceBox = $("#resultAuditVarianceBox");
  if (varianceBox) {
    varianceBox.classList.remove("hidden");
    let badgeClass = variance === 0 ? "badge-success" : (variance > 0 ? "badge-warning" : "badge-danger");
    let varianceText = variance === 0 ? "Exact Match" : (variance > 0 ? `+${variance} Surplus` : `${variance} Shortage`);

    varianceBox.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="badge ${badgeClass}" style="font-size:12px;font-weight:800;padding:3px 8px;">${varianceText}</span>
        <span style="font-size:12px;color:var(--text-muted);">
          Physical Shelf: <strong>${auditData.count}</strong> vs System: <strong>${auditData.expectedQty}</strong>
        </span>
      </div>
      <button type="button" class="primary-btn reconcile-btn" data-reconcile-id="${auditData.item.id}" data-target-qty="${auditData.count}" style="padding:4px 12px;font-size:12px;font-weight:700;">
        Reconcile DB to ${auditData.count}
      </button>
    `;

    varianceBox.querySelector(".reconcile-btn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const itemId = btn.dataset.reconcileId;
      const targetQty = parseInt(btn.dataset.targetQty, 10);
      try {
        btn.disabled = true;
        btn.textContent = "Updating...";
        await api(`/api/stock/${itemId}`, "PUT", { quantity: targetQty });
        auditData.expectedQty = targetQty;
        auditData.reconciled = true;
        playScanAudioBeep(true);
        showAuditResult(auditData, 0);
        updateAuditSubbarStats();
        loadStock();
      } catch (err) {
        alert("Failed to reconcile DB: " + err.message);
        btn.disabled = false;
        btn.textContent = `Reconcile DB to ${targetQty}`;
      }
    });
  }

  const undoBtn = $("#scannerUndoBtn");
  if (undoBtn) undoBtn.style.display = "none";
}

function showScanResultSuccess(data) {
  const card = $("#scannerResultCard");
  if (!card) return;

  showResultCardWithAutoDismiss(4000);
  card.classList.remove("is-error");

  const varianceBox = $("#resultAuditVarianceBox");
  if (varianceBox) varianceBox.classList.add("hidden");

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
      transitionEl.innerHTML = `Batch intake restocked: <strong>${data.previousQuantity}</strong> ➔ <span class="new-qty-highlight">${data.newQuantity} in stock (+${data.delta})</span> &bull; Price: <strong>${money(data.item.price)} EGP</strong>`;
    } else {
      transitionEl.innerHTML = `Product info: <span class="new-qty-highlight">${data.newQuantity} currently in stock</span> &bull; Price: <strong>${money(data.item.price)} EGP</strong>`;
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

  showResultCardWithAutoDismiss(5000);
  card.classList.add("is-error");

  const varianceBox = $("#resultAuditVarianceBox");
  if (varianceBox) varianceBox.classList.add("hidden");

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

    showResultCardWithAutoDismiss(3500);
    loadStock();
  } catch (err) {
    alert("Could not undo: " + err.message);
  }
}

function updateOpsHistoryCount() {
  const countEl = $("#opsHistoryCount");
  if (countEl) countEl.textContent = sessionScanHistory.length;
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
      if (s.action === "increment" || s.action === "batch_intake") {
        actionBadge = `<span class="badge" style="background:rgba(34,197,94,0.12);color:#16a34a;font-weight:700;">+${s.delta || 1} Intake</span>`;
      } else if (s.action === "audit") {
        actionBadge = `<span class="badge" style="background:rgba(99,102,241,0.14);color:#6366f1;font-weight:700;">Rack Audit</span>`;
      } else if (s.action === "lookup") {
        actionBadge = `<span class="badge" style="background:rgba(160,120,96,0.12);color:var(--accent);font-weight:700;">Lookup</span>`;
      }

      const adjText = s.action === "audit" ? s.delta : `${s.previousQty} ➔ ${s.newQty}`;
      const stockText = s.action === "audit" ? `Shelf: ${s.newQty}` : `${s.newQty} in stock`;

      return `
        <tr>
          <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">${s.time}</td>
          <td style="font-weight:600;">${escapeHtml(s.itemName)}</td>
          <td><span class="stock-sku-badge">${escapeHtml(s.sku)}</span></td>
          <td style="font-weight:700;color:var(--accent);">${money(s.price)} EGP</td>
          <td>${actionBadge}</td>
          <td style="font-size:12px;color:var(--text-muted);">${adjText}</td>
          <td style="font-weight:700;color:var(--text);">${stockText}</td>
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