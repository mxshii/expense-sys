const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
const db = require("../lib/db");
const { notifyNewOrder } = require("../lib/notifications");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "yeetSecretDoNotDeployToTheMoonWithThis";
const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || (JWT_SECRET + "_customer");

// ─── CORS: allow all origins for public storefront & APIs ─────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));

const CATEGORIES = ["Ads", "Printing", "Packaging", "Delivery", "Other"];
const BRAND_EXPENSE_CATEGORIES = ["Ads", "Printing", "Packaging", "Delivery", "Operations", "Other"];
const REVENUE_CATEGORIES = ["Stickers", "Posters", "Mail Subscription", "Other"];

// ─── DB SEEDING ───────────────────────────────────────────────────────────────
let seeded = false;
async function ensureFounderSeeded() {
  if (seeded) return;
  const count = await db.countUsers();
  if (count === 0) {
    await db.insertUser({
      id: "u_" + Date.now(),
      username: "founder",
      passwordHash: bcrypt.hashSync("changeme123", 10),
      role: "founder",
    });
  }
  seeded = true;
}

async function withDB(req, res, next) {
  try {
    await ensureFounderSeeded();
    next();
  } catch (err) {
    console.error("DB error:", err.message);
    res.status(500).json({ error: "database error" });
  }
}

function requireLogin(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "not logged in" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "session expired, log in again" });
  }
}

function requireFounder(req, res, next) {
  if (req.user?.role !== "founder") {
    return res.status(403).json({ error: "founder-only zone" });
  }
  next();
}

function cookieOptions() {
  return {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 12,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  };
}

// ─── HEALTH CHECK & BOOTSTRAP ────────────────────────────────────────────────
app.get("/api/ping", (req, res) => res.json({ ok: true }));

app.get("/api/bootstrap", requireLogin, withDB, async (req, res) => {
  try {
    const data = await db.getBootstrapData();
    res.json(data);
  } catch (err) {
    console.error("Bootstrap error:", err);
    res.status(500).json({ error: "Failed to load data" });
  }
});

// ─── NOTIFICATION SELF-TEST (admin only) ─────────────────────────────────────
// Call from browser: fetch('/api/notify-test', {method:'POST'})
app.post("/api/notify-test", requireLogin, async (req, res) => {
  const testOrder = {
    id: "TEST-" + Date.now(),
    customerName: `${req.user.username} (Self-Test)`,
    phone: "01000000000",
    address: "Admin notification test",
    shippingPrice: 30,
    items: [{ itemName: "Test Item", name: "Test Item", quantity: 1, qty: 1, price: 100 }],
  };
  // Fire SSE to all connected dashboard tabs
  broadcastNewOrder(testOrder);
  // Fire ntfy push
  await notifyNewOrder(testOrder).catch((e) => console.error("[notify-test] ntfy error:", e.message));
  res.json({ ok: true, testOrderId: testOrder.id, ntfyTopic: process.env.NTFY_TOPIC || "(not set)" });
});


// ─── PUBLIC STOCK (website shop catalog) ──────────────────────────────────────
app.get("/api/stock/public", withDB, async (req, res) => {
  try {
    // Cache stock at Vercel CDN edge for 60s (reduces Neon DB hits to 1 per min)
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    const stock = await db.getStock();
    res.json(stock);
  } catch (e) {
    console.error("public stock error:", e.message);
    res.status(500).json({ error: "could not load stock" });
  }
});

// ─── CUSTOMER AUTH (website customer accounts) ────────────────────────────────
app.post("/api/customers/register", withDB, async (req, res) => {
  const { name, email, password, phone, address } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "name, email and password are required" });
  if (String(password).length < 6)
    return res.status(400).json({ error: "password must be at least 6 characters" });

  try {
    const existing = await db.getCustomerByEmail(email.trim());
    if (existing) {
      return res.status(400).json({ error: "an account with this email already exists" });
    }
    const id = "cust_" + Date.now();
    const hash = bcrypt.hashSync(password, 10);
    const customer = await db.insertCustomer({
      id,
      name: name.trim(),
      email: email.trim(),
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      passwordHash: hash,
    });
    const token = jwt.sign(
      { id: customer.id, email: customer.email, name: customer.name },
      CUSTOMER_JWT_SECRET,
      { expiresIn: "30d" }
    );
    res.json({ ok: true, customer, token });
  } catch (e) {
    console.error("register error:", e.message);
    res.status(500).json({ error: "registration failed" });
  }
});

app.post("/api/customers/login", withDB, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "email and password are required" });

  try {
    const customer = await db.getCustomerByEmail(email.trim());
    if (!customer || !bcrypt.compareSync(password, customer.password_hash)) {
      return res.status(401).json({ error: "wrong email or password" });
    }
    const token = jwt.sign(
      { id: customer.id, email: customer.email, name: customer.name },
      CUSTOMER_JWT_SECRET,
      { expiresIn: "30d" }
    );
    res.json({
      ok: true,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
      },
      token,
    });
  } catch (e) {
    console.error("login error:", e.message);
    res.status(500).json({ error: "login failed" });
  }
});

app.get("/api/customers/orders", withDB, async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "not logged in" });
  try {
    const payload = jwt.verify(token, CUSTOMER_JWT_SECRET);
    const orders = await db.getOrders();
    const mine = orders.filter(
      (o) => o.email && o.email.toLowerCase() === payload.email.toLowerCase()
    );
    res.json(mine);
  } catch {
    res.status(401).json({ error: "session expired" });
  }
});

// Customer self-delete account
app.delete("/api/customers/me", withDB, async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "not authenticated" });
  try {
    const payload = jwt.verify(token, CUSTOMER_JWT_SECRET);
    await db.deleteCustomer(payload.id);
    res.json({ ok: true });
  } catch (e) {
    if (e.name === "JsonWebTokenError" || e.name === "TokenExpiredError") {
      return res.status(401).json({ error: "session expired" });
    }
    console.error("self-delete error:", e.message);
    res.status(500).json({ error: "could not delete account" });
  }
});

// ─── WEBSITE CUSTOMERS MANAGEMENT (admin / founder only) ──────────────────────
app.get("/api/customers", requireLogin, requireFounder, withDB, async (req, res) => {
  try {
    const rows = await db.getCustomers();
    res.json(rows);
  } catch (e) {
    console.error("list customers error:", e.message);
    res.status(500).json({ error: "could not load customers" });
  }
});

app.delete("/api/customers/:id", requireLogin, requireFounder, withDB, async (req, res) => {
  try {
    await db.deleteCustomer(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error("delete customer error:", e.message);
    res.status(500).json({ error: "could not delete customer" });
  }
});

// ─── ADMIN AUTH (staff / founder login to dashboard) ──────────────────────────
app.get("/api/me", (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.json({ user: null });
  try {
    res.json({ user: jwt.verify(token, JWT_SECRET) });
  } catch {
    res.json({ user: null });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

app.post("/api/login", withDB, async (req, res) => {
  const { username, password } = req.body;
  const user = await db.getUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "wrong username or password" });
  }
  const payload = { id: user.id, username: user.username, role: user.role };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
  res.cookie("token", token, cookieOptions());
  res.json({ user: payload });
});

app.post("/api/change-password", requireLogin, withDB, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword)
    return res.status(400).json({ error: "need both old and new password" });
  if (newPassword.length < 6)
    return res.status(400).json({ error: "new password must be 6+ characters" });
  const user = await db.getUserById(req.user.id);
  if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(401).json({ error: "old password is wrong" });
  }
  await db.updateUserPassword(user.id, bcrypt.hashSync(newPassword, 10));
  res.json({ ok: true });
});

// ─── USERS (staff / team management) ──────────────────────────────────────────
app.get("/api/users", requireLogin, requireFounder, withDB, async (req, res) => {
  res.json(await db.getUsers());
});

app.post("/api/users", requireLogin, requireFounder, withDB, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "need a username and password" });
  if (await db.getUserByUsername(username))
    return res.status(400).json({ error: "that username is already taken" });
  const newUser = {
    id: "u_" + Date.now(),
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "staff",
  };
  await db.insertUser(newUser);
  res.json({ id: newUser.id, username: newUser.username, role: newUser.role });
});

app.delete("/api/users/:id", requireLogin, requireFounder, withDB, async (req, res) => {
  const target = await db.getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: "user not found" });
  if (target.role === "founder") return res.status(400).json({ error: "cannot delete the founder account" });
  await db.deleteUser(req.params.id);
  res.json({ ok: true });
});

// ─── EXPENSES ─────────────────────────────────────────────────────────────────
app.get("/api/expenses", requireLogin, withDB, async (req, res) => {
  res.json(await db.getExpenses());
});

app.post("/api/expenses", requireLogin, withDB, async (req, res) => {
  const { category, description, amount, note } = req.body;
  if (!category || !CATEGORIES.includes(category))
    return res.status(400).json({ error: "pick a valid category" });
  if (!description || !description.trim())
    return res.status(400).json({ error: "description is required" });
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
    return res.status(400).json({ error: "enter a valid amount" });
  const expense = await db.insertExpense({
    id: "exp_" + Date.now(),
    category,
    description: description.trim(),
    amount: Number(amount),
    note: note?.trim() || null,
    loggedBy: req.user.username,
  });
  res.json(expense);
});

app.delete("/api/expenses/:id", requireLogin, requireFounder, withDB, async (req, res) => {
  await db.deleteExpense(req.params.id);
  res.json({ ok: true });
});

// ─── BRAND EXPENSES (Company Own Money) ───────────────────────────────────────
app.get("/api/brand-expenses", requireLogin, withDB, async (req, res) => {
  res.json(await db.getBrandExpenses());
});

app.post("/api/brand-expenses", requireLogin, withDB, async (req, res) => {
  const { category, description, amount, note } = req.body;
  if (!category || !BRAND_EXPENSE_CATEGORIES.includes(category))
    return res.status(400).json({ error: "pick a valid category" });
  if (!description || !description.trim())
    return res.status(400).json({ error: "description is required" });
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
    return res.status(400).json({ error: "enter a valid amount" });
  const expense = await db.insertBrandExpense({
    id: "bexp_" + Date.now(),
    category,
    description: description.trim(),
    amount: Number(amount),
    note: note?.trim() || null,
    loggedBy: req.user.username,
  });
  res.json(expense);
});

app.delete("/api/brand-expenses/:id", requireLogin, requireFounder, withDB, async (req, res) => {
  await db.deleteBrandExpense(req.params.id);
  res.json({ ok: true });
});

// ─── REVENUE ──────────────────────────────────────────────────────────────────
app.get("/api/revenue", requireLogin, withDB, async (req, res) => {
  res.json(await db.getRevenue());
});

app.post("/api/revenue", requireLogin, withDB, async (req, res) => {
  const { category, description, amount, note } = req.body;
  if (!category || !REVENUE_CATEGORIES.includes(category))
    return res.status(400).json({ error: "pick a valid revenue category" });
  if (!description || !description.trim())
    return res.status(400).json({ error: "description is required" });
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
    return res.status(400).json({ error: "enter a valid amount" });
  const revenue = await db.insertRevenue({
    id: "rev_" + Date.now(),
    category,
    description: description.trim(),
    amount: Number(amount),
    note: note?.trim() || null,
    collectedBy: req.user.username,
  });
  res.json(revenue);
});

app.delete("/api/revenue/:id", requireLogin, requireFounder, withDB, async (req, res) => {
  await db.deleteRevenue(req.params.id);
  res.json({ ok: true });
});

// Founder quick revenue total adjustment (e.g. for lost cash, discrepancies)
app.post("/api/revenue/adjust", requireLogin, requireFounder, withDB, async (req, res) => {
  const { newTotal, note } = req.body;
  if (newTotal === undefined || isNaN(Number(newTotal))) {
    return res.status(400).json({ error: "Please enter a valid total amount" });
  }
  const revList = await db.getRevenue();
  const currentTotal = revList.reduce((s, r) => s + Number(r.amount || 0), 0);
  const target = Number(newTotal);
  const diff = Math.round((target - currentTotal) * 100) / 100;
  if (Math.abs(diff) < 0.01) {
    return res.json({ ok: true, message: "Total is already matching", newTotal: target });
  }

  const desc = (note && note.trim())
    ? `Cash Adjustment: ${note.trim()}`
    : (diff < 0 ? "Cash Adjustment (Lost Cash / Deficit)" : "Cash Adjustment (Surplus / Correction)");

  const adj = await db.insertRevenue({
    id: "rev_adj_" + Date.now(),
    category: "Other",
    description: desc,
    amount: diff,
    note: `Adjusted total revenue from ${currentTotal.toFixed(2)} EGP to ${target.toFixed(2)} EGP`,
    collectedBy: req.user.username,
  });

  res.json({ ok: true, adjustment: adj, previousTotal: currentTotal, newTotal: target });
});

app.put("/api/revenue/:id", requireLogin, requireFounder, withDB, async (req, res) => {
  const { category, description, amount, note } = req.body;
  const updated = await db.updateRevenue(req.params.id, {
    category,
    description: description ? description.trim() : undefined,
    amount: amount !== undefined ? Number(amount) : undefined,
    note: note !== undefined ? (note ? note.trim() : null) : undefined,
  });
  if (!updated) return res.status(404).json({ error: "Revenue record not found" });
  res.json(updated);
});

// ─── STOCK ────────────────────────────────────────────────────────────────────
app.get("/api/stock", requireLogin, withDB, async (req, res) => {
  res.json(await db.getStock());
});

app.post("/api/stock", requireLogin, withDB, async (req, res) => {
  const { itemName, quantity, price, sku } = req.body;
  if (!itemName) return res.status(400).json({ error: "item needs a name" });
  const stockId = "stk_" + Date.now();
  const finalSku = (sku && String(sku).trim())
    ? String(sku).trim().toUpperCase()
    : "STK-" + stockId.slice(-6);
  const item = await db.insertStockItem({
    id: stockId,
    itemName: itemName.trim(),
    quantity: Number(quantity) || 0,
    price: Number(price) || 0,
    sku: finalSku,
  });
  res.json(item);
});

app.put("/api/stock/:id", requireLogin, withDB, async (req, res) => {
  const { itemName, quantity, price, sku } = req.body;
  const updates = req.user.role === "founder"
    ? {
        itemName: itemName !== undefined ? itemName.trim() : undefined,
        quantity: quantity !== undefined ? Number(quantity) : undefined,
        price: price !== undefined ? Number(price) : undefined,
        sku: sku !== undefined ? (String(sku).trim().toUpperCase() || null) : undefined,
      }
    : { quantity: quantity !== undefined ? Number(quantity) : undefined };
  const item = await db.updateStockItem(req.params.id, updates);
  if (!item) return res.status(404).json({ error: "stock item not found" });
  res.json(item);
});

app.post("/api/stock/scan", requireLogin, withDB, async (req, res) => {
  const { code, mode = "decrement", qty = 1 } = req.body;
  if (!code || !String(code).trim()) {
    return res.status(400).json({ error: "No barcode or SKU code provided" });
  }
  const rawCode = String(code).trim();
  const allStock = await db.getStock();
  const item = allStock.find((s) => {
    const sSku = (s.sku || "").trim().toUpperCase();
    const sId = (s.id || "").trim().toLowerCase();
    const target = rawCode.toUpperCase();
    return sSku === target || sId === rawCode.toLowerCase();
  });
  if (!item) {
    return res.status(404).json({
      error: `No stock item found matching barcode "${rawCode}"`,
      code: rawCode,
    });
  }
  const delta = Math.max(1, Number(qty) || 1);
  const previousQuantity = Number(item.quantity) || 0;
  let newQuantity = previousQuantity;
  if (mode === "decrement") {
    newQuantity = Math.max(0, previousQuantity - delta);
  } else if (mode === "increment") {
    newQuantity = previousQuantity + delta;
  }
  let updatedItem = item;
  if (mode !== "lookup") {
    updatedItem = await db.updateStockItem(item.id, { quantity: newQuantity });
  }
  res.json({
    ok: true,
    action: mode,
    delta,
    previousQuantity,
    newQuantity: updatedItem ? updatedItem.quantity : newQuantity,
    item: updatedItem || item,
    code: rawCode,
    scannedAt: new Date().toISOString(),
  });
});

app.delete("/api/stock/:id", requireLogin, requireFounder, withDB, async (req, res) => {
  await db.deleteStockItem(req.params.id);
  res.json({ ok: true });
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────

// ─── REALTIME ORDER BROADCASTER (SSE for instant PC/Laptop alerts) ───────────
const orderClients = new Set();

function broadcastNewOrder(order) {
  if (!order || orderClients.size === 0) return;
  const payload = `data: ${JSON.stringify(order)}\n\n`;
  for (const client of orderClients) {
    try {
      client.res.write(payload);
    } catch {
      orderClients.delete(client);
    }
  }
}

// PUBLIC: Storefront order submission (no login required)
app.post("/api/orders/storefront", withDB, async (req, res) => {
  const { customerName, phone, email, items, address, shippingPrice, note, paymentMethod } = req.body;
  if (!customerName || !address)
    return res.status(400).json({ error: "name and address are required" });
  if (!phone)
    return res.status(400).json({ error: "phone number is required" });
  if (!items || items.length === 0)
    return res.status(400).json({ error: "at least one item is required" });

  const orderId = await db.getNextOrderId();

  const noteParts = [address];
  if (paymentMethod) noteParts.push("[Payment: " + paymentMethod + "]");
  if (note) noteParts.push("[Note: " + note + "]");

  const order = await db.insertOrder({
    id: orderId,
    customerName: customerName.trim(),
    phone: phone.trim(),
    email: email ? email.trim() : null,
    items,
    address: noteParts.join(" — "),
    shippingPrice: Number(shippingPrice) || 0,
    paymentStatus: "unpaid",
    deliveryStatus: "processing",
    createdBy: "storefront",
  });
  broadcastNewOrder(order);
  notifyNewOrder(order).catch(() => {});
  res.json({ ok: true, id: order.id });
});

app.get("/api/orders/stream", requireLogin, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
  });
  res.write(": connected\n\n");

  const client = { res, id: Date.now() };
  orderClients.add(client);

  const heartbeat = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {
      clearInterval(heartbeat);
      orderClients.delete(client);
    }
  }, 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    orderClients.delete(client);
  });
});

app.get("/api/orders", requireLogin, withDB, async (req, res) => {
  res.json(await db.getOrders());
});

app.get("/api/orders/next-id", requireLogin, withDB, async (req, res) => {
  const nextId = await db.getNextOrderId();
  res.json({ nextId });
});

app.post("/api/orders", requireLogin, withDB, async (req, res) => {
  const { id, customerName, phone, email, items, address, paymentStatus, deliveryStatus, shippingPrice } = req.body;
  if (!customerName || !address)
    return res.status(400).json({ error: "name and address are required" });
  if (!phone)
    return res.status(400).json({ error: "phone number is required" });
  if (!items || items.length === 0)
    return res.status(400).json({ error: "pick at least one item from stock" });

  let orderId = id ? String(id).trim() : "";
  if (orderId) {
    const existing = await db.getOrderById(orderId);
    if (existing) {
      return res.status(400).json({ error: `Order ID "${orderId}" already exists. Pick another ID.` });
    }
  } else {
    orderId = await db.getNextOrderId();
  }

  await db.deductStockForOrder(items);

  const order = await db.insertOrder({
    id: orderId,
    customerName,
    phone,
    email: email || null,
    items,
    address,
    shippingPrice: Number(shippingPrice) || 0,
    paymentStatus: paymentStatus || "unpaid",
    deliveryStatus: deliveryStatus || "processing",
    createdBy: req.user.username,
  });
  broadcastNewOrder(order);
  notifyNewOrder(order).catch(() => {});
  res.json(order);
});

app.put("/api/orders/:id", requireLogin, withDB, async (req, res) => {
  const { customerName, phone, email, items, address, shippingPrice, paymentStatus, deliveryStatus } = req.body;
  const existing = await db.getOrderById(req.params.id);
  if (!existing) return res.status(404).json({ error: "order not found" });

  if (customerName !== undefined && !customerName.trim()) {
    return res.status(400).json({ error: "customer name cannot be empty" });
  }
  if (phone !== undefined && !phone.trim()) {
    return res.status(400).json({ error: "phone number cannot be empty" });
  }
  if (address !== undefined && !address.trim()) {
    return res.status(400).json({ error: "address cannot be empty" });
  }
  if (items !== undefined) {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "order must contain at least one item" });
    }
    const oldItems = Array.isArray(existing.items)
      ? existing.items
      : (typeof existing.items === "string" ? JSON.parse(existing.items || "[]") : []);
    await db.reconcileStockForOrder(oldItems, items);
  }

  const updates = {};
  if (customerName !== undefined) updates.customerName = customerName.trim();
  if (phone !== undefined) updates.phone = phone.trim();
  if (email !== undefined) updates.email = email ? email.trim() : null;
  if (items !== undefined) updates.items = items;
  if (address !== undefined) updates.address = address.trim();
  if (shippingPrice !== undefined) updates.shippingPrice = Number(shippingPrice) || 0;
  if (paymentStatus !== undefined) updates.paymentStatus = paymentStatus;
  if (deliveryStatus !== undefined) updates.deliveryStatus = deliveryStatus;

  const order = await db.updateOrder(req.params.id, updates);
  res.json(order);
});

app.delete("/api/orders/:id", requireLogin, requireFounder, withDB, async (req, res) => {
  await db.deleteOrder(req.params.id);
  res.json({ ok: true });
});

// ─── SPA FALLBACK ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

module.exports = app;