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
  const quietModules = 12; // 12 modules quiet zone on each side

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
  const topY = 4;
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
  const textY = topY + barHeight + 13;
  const totalHeight = showText ? (textY + 4) : (topY + barHeight + 4);

  const textElement = showText
    ? `<text x="${totalWidth / 2}" y="${textY}" font-family="'SF Mono', 'Courier New', Courier, monospace" font-size="11.5" font-weight="700" fill="#000000" text-anchor="middle" letter-spacing="1.2">${escapeHtml(displayText)}</text>`
    : "";

  return `<svg viewBox="0 0 ${totalWidth} ${totalHeight}" class="receipt-upc-barcode" style="max-width:100%;height:auto;background:#ffffff;border-radius:4px;"><rect width="${totalWidth}" height="${totalHeight}" fill="#ffffff"/>${rects.join("")}${textElement}</svg>`;
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

  loadOrders();
  loadStock();
  loadExpenses();
  loadRevenue();
  if (me.role === "founder") loadUsers();
}

/* ─── NAV TABS ─────────────────────────────────────────────────── */
const pageTitles = { orders: "Orders", stock: "Stock", expenses: "Expenses", revenue: "Revenue", team: "Team Access" };

function switchTab(tab) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".mobile-nav-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach((b) => b.classList.add("active"));
  const panel = document.getElementById("tab-" + tab);
  if (panel) panel.classList.add("active");
  const titleEl = $("#pageTitle");
  if (titleEl) titleEl.textContent = pageTitles[tab] || tab;
  window.scrollTo(0, 0);
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
  await Promise.all([loadOrders(), loadStock(), loadExpenses(), loadRevenue()]);
  if (me.role === "founder") await loadUsers();
  $("#syncTime").textContent = new Date().toLocaleTimeString();
}
setInterval(syncAll, 120000); // 2 min — lets Neon auto-suspend between polls
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
      }
    };
  } else {
    delWrap.style.display = "none";
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
          <button class="icon-btn receipt-btn" data-receipt-order="${o.id}" title="Print receipt" style="color:var(--text-muted);font-size:15px">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px;vertical-align:middle"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v6a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9h8v3H6v-3zm8-4a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd"/></svg>
          </button>
          ${me.role === "founder" ? `<button class="icon-btn" data-del-order="${o.id}" title="Delete order">✕</button>` : ""}
        </div>
      </td>
    `;

    tr.addEventListener("click", (evt) => {
      if (evt.target.closest("select") || evt.target.closest("[data-del-order]") || evt.target.closest(".receipt-btn")) return;
      openOrderDetail(o.id);
    });

    body.appendChild(tr);
  });

  body.querySelectorAll(".payment-select").forEach((sel) => {
    sel.addEventListener("change", async (evt) => {
      evt.stopPropagation();
      await api(`/api/orders/${sel.dataset.orderId}`, "PUT", { paymentStatus: sel.value });
    });
  });
  body.querySelectorAll(".delivery-select").forEach((sel) => {
    sel.addEventListener("change", async (evt) => {
      evt.stopPropagation();
      await api(`/api/orders/${sel.dataset.orderId}`, "PUT", { deliveryStatus: sel.value });
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
      return `<option value="${s.id}" data-price="${s.price}" data-name="${escapeHtml(s.itemName)}" ${isOut ? 'disabled' : ''}>
        ${escapeHtml(s.itemName)} ${isOut ? '(Out of Stock)' : `(${s.quantity} in stock)`} — ${money(s.price)} EGP
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
    loadStock(); // refresh stock after deduction
  } catch (err) {
    alert(err.message);
  }
});

/* ─── STOCK ────────────────────────────────────────────────────── */
let allStock = [];
let activeStockDetailId = null;

function openStockDetail(stockId) {
  const s = allStock.find((item) => String(item.id) === String(stockId));
  if (!s) return;
  activeStockDetailId = s.id;

  $("#modalStockName").value = s.itemName;
  $("#modalStockPrice").value = s.price;
  $("#modalStockQty").value = s.quantity;

  if (me.role !== "founder") {
    $("#modalStockName").disabled = true;
    $("#modalStockPrice").disabled = true;
  } else {
    $("#modalStockName").disabled = false;
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
    const tr = document.createElement("tr");
    tr.className = "clickable-row";
    tr.innerHTML = `
      <td data-label="Item" style="font-family:var(--font);font-weight:500">${escapeHtml(s.itemName)}</td>
      <td data-label="Qty"><input type="number" min="0" value="${s.quantity}" data-qty-id="${s.id}" style="width:80px;font-size:13px;padding:5px 8px" /></td>
      <td data-label="Price">${money(s.price)} EGP</td>
      <td>${me.role === "founder" ? `<button class="icon-btn" data-del-stock="${s.id}" title="Remove">✕</button>` : ""}</td>
    `;

    tr.addEventListener("click", (evt) => {
      if (evt.target.closest("input") || evt.target.closest("[data-del-stock]")) return;
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

/* ─── REVENUE ─────────────────────────────────────────────────── */
let allRevenue = [];
let activeRevFilter = "all";

const REV_CAT_ICON = {
  Stickers:            '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>',
  Posters:             '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/></svg>',
  "Mail Subscription": '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>',
  Other:               '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd"/></svg>',
};

const REV_CAT_CHIPS = {
  Stickers:            `<span class="cat-chip cat-chip-stickers">${REV_CAT_ICON.Stickers} Stickers</span>`,
  Posters:             `<span class="cat-chip cat-chip-posters">${REV_CAT_ICON.Posters} Posters</span>`,
  "Mail Subscription": `<span class="cat-chip cat-chip-mail">${REV_CAT_ICON["Mail Subscription"]} Mail Sub</span>`,
  Other:               `<span class="cat-chip cat-chip-other">${REV_CAT_ICON.Other} Other</span>`,
};

async function loadRevenue() {
  allRevenue = await api("/api/revenue");
  renderRevenue();
  renderRevenueSummary();
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
  if (me.role === "founder") {
    delWrap.style.display = "block";
    $("#modalRevenueDeleteBtn").onclick = async () => {
      if (confirm("Delete this revenue entry permanently?")) {
        await api(`/api/revenue/${rev.id}`, "DELETE");
        $("#revenueDetailModal").classList.add("hidden");
        loadRevenue();
      }
    };
  } else {
    delWrap.style.display = "none";
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

        <div class="receipt-total-row">
          <span>TOTAL AMOUNT</span>
          <span>${money(grandTotal)} EGP</span>
        </div>

        <div class="receipt-meta-row" style="margin-top:8px;">
          <span>PAYMENT</span>
          <span style="text-transform:uppercase;font-weight:700;">${escapeHtml(o.paymentStatus || "UNPAID")}</span>
        </div>
        <div class="receipt-meta-row">
          <span>DELIVERY</span>
          <span style="text-transform:uppercase;font-weight:700;">${escapeHtml(o.deliveryStatus || "PROCESSING")}</span>
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
