const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
const db = require("../lib/db");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "yeetSecretDoNotDeployToTheMoonWithThis";
const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || JWT_SECRET + "_customer";

// --- CORS: allow ANY origin (storefront is public) ----------------------------
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "public")));

const CATEGORIES = ["Ads", "Printing", "Packaging", "Delivery"];
const REVENUE_CATEGORIES = ["Stickers", "Posters", "Mail Subscription", "Other"];

// --- DB SEEDING ---------------------------------------------------------------
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
    next(err);
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

// --- HEALTH CHECK -------------------------------------------------------------
app.get("/api/ping", (req, res) => res.json({ ok: true }));

// --- PUBLIC STOCK (no login needed) ------------------------------------------
app.get("/api/stock/public", withDB, async (req, res) => {
  const stock = await db.getStock();
  // Only return items with stock > 0 and a price set
  const available = stock.filter(s => s.quantity > 0 || s.quantity === 0);
  res.json(available);
});

// --- CUSTOMER AUTH (website accounts) ----------------------------------------
// Customer accounts are stored in a separate customers table
// We create it on first use via a raw pool query
async function ensureCustomersTable() {
  const { Pool } = require("pg");
  const pool = new (Pool || require("pg").Pool)({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  });
  // We borrow the pool from db module via a workaround - just use the db pool
  // Actually, let's use the db module's pool by exposing it, or just use raw pg here
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        email        TEXT UNIQUE NOT NULL,
        phone        TEXT,
        address      TEXT,
        password_hash TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    pool.end();
  } catch (e) {
    pool.end();
    throw e;
  }
}

// Initialize customers table on startup
ensureCustomersTable().catch(e => console.error("customers table init error:", e.message));

// Helper: get a fresh pool for customer queries
function getPool() {
  const { Pool } = require("pg");
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  });
}

app.post("/api/customers/register", async (req, res) => {
  const { name, email, password, phone, address } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "name, email and password are required" });
  if (password.length < 6)
    return res.status(400).json({ error: "password must be at least 6 characters" });

  const pool = getPool();
  try {
    const existing = await pool.query("SELECT id FROM customers WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      await pool.end();
      return res.status(400).json({ error: "an account with this email already exists" });
    }
    const id = "cust_" + Date.now();
    const hash = bcrypt.hashSync(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO customers (id, name, email, phone, address, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, email, phone, address, created_at AS "createdAt"`,
      [id, name, email.toLowerCase(), phone || null, address || null, hash]
    );
    await pool.end();
    const customer = rows[0];
    const token = jwt.sign({ id: customer.id, email: customer.email, name: customer.name }, CUSTOMER_JWT_SECRET, { expiresIn: "30d" });
    res.json({ ok: true, customer, token });
  } catch (e) {
    await pool.end();
    console.error("register error:", e.message);
    res.status(500).json({ error: "registration failed" });
  }
});

app.post("/api/customers/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "email and password are required" });

  const pool = getPool();
  try {
    const { rows } = await pool.query("SELECT * FROM customers WHERE email = $1", [email.toLowerCase()]);
    await pool.end();
    if (!rows.length || !bcrypt.compareSync(password, rows[0].password_hash))
      return res.status(401).json({ error: "wrong email or password" });
    const c = rows[0];
    const token = jwt.sign({ id: c.id, email: c.email, name: c.name }, CUSTOMER_JWT_SECRET, { expiresIn: "30d" });
    res.json({ ok: true, customer: { id: c.id, name: c.name, email: c.email, phone: c.phone, address: c.address }, token });
  } catch (e) {
    console.error("login error:", e.message);
    res.status(500).json({ error: "login failed" });
  }
});

app.get("/api/customers/orders", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "not logged in" });
  try {
    const payload = jwt.verify(token, CUSTOMER_JWT_SECRET);
    const orders = await db.getOrders();
    const mine = orders.filter(o => o.email && o.email.toLowerCase() === payload.email.toLowerCase());
    res.json(mine);
  } catch {
    res.status(401).json({ error: "session expired" });
  }
});

// --- AUTH (staff/founder) ----------------------------------------------------
app.get("/api/me", (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.json({ user: null });
  try { res.json({ user: jwt.verify(token, JWT_SECRET) }); }
  catch { res.json({ user: null }); }
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

// --- USERS -------------------------------------------------------------------
app.get("/api/users", requireLogin, requireFounder, withDB, async (req, res) => {
  res.json(await db.getUsers());
});

app.post("/api/users", requireLogin, requireFounder, withDB, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "need a username and password" });
  if (await db.getUserByUsername(username))
    return res.status(400).json({ error: "that username is already taken" });
  const newUser = { id: "u_" + Date.now(), username, passwordHash: bcrypt.hashSync(password, 10), role: "staff" };
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

// --- EXPENSES ----------------------------------------------------------------
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

// --- REVENUE -----------------------------------------------------------------
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

// --- STOCK -------------------------------------------------------------------
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

// --- ORDERS ------------------------------------------------------------------

// PUBLIC: storefront website places orders (no login needed)
app.post("/api/orders/storefront", withDB, async (req, res) => {
  const { customerName, phone, email, items, address, shippingPrice, note, paymentMethod } = req.body;
  if (!customerName || !address)
    return res.status(400).json({ error: "name and address are required" });
  if (!phone)
    return res.status(400).json({ error: "phone number is required" });
  if (!items || items.length === 0)
    return res.status(400).json({ error: "at least one item is required" });

  const orderId = await db.getNextOrderId();
  const order = await db.insertOrder({
    id: orderId,
    customerName,
    phone,
    email: email || null,
    items,
    address,
    shippingPrice: Number(shippingPrice) || 0,
    paymentStatus: "unpaid",
    deliveryStatus: "processing",
    createdBy: "storefront",
    note: [note, paymentMethod ? "Payment method: " + paymentMethod : null].filter(Boolean).join(" | ") || null,
  });
  res.json({ ok: true, id: order.id });
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
  res.json(order);
});

app.put("/api/orders/:id", requireLogin, withDB, async (req, res) => {
  const { paymentStatus, deliveryStatus } = req.body;
  const order = await db.updateOrder(req.params.id, { paymentStatus, deliveryStatus });
  if (!order) return res.status(404).json({ error: "order not found" });
  res.json(order);
});

app.delete("/api/orders/:id", requireLogin, requireFounder, withDB, async (req, res) => {
  await db.deleteOrder(req.params.id);
  res.json({ ok: true });
});

// --- SPA FALLBACK ------------------------------------------------------------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

module.exports = app;