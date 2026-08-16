const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
const db = require("../lib/db");

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || "yeetSecretDoNotDeployToTheMoonWithThis";

app.use(express.json());
app.use(cookieParser());

// Serve static files in all environments (local + Vercel)
app.use(express.static(path.join(__dirname, "..", "public")));

const CATEGORIES = ["Ads", "Printing", "Packaging", "Delivery"];
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

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/api/ping", (req, res) => res.json({ ok: true }));

// ─── AUTH ─────────────────────────────────────────────────────────────────────
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

// ─── USERS ────────────────────────────────────────────────────────────────────
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

// ─── STOCK ────────────────────────────────────────────────────────────────────
app.get("/api/stock", requireLogin, withDB, async (req, res) => {
  res.json(await db.getStock());
});

app.post("/api/stock", requireLogin, withDB, async (req, res) => {
  const { itemName, quantity, price } = req.body;
  if (!itemName) return res.status(400).json({ error: "item needs a name" });
  const item = await db.insertStockItem({
    id: "stk_" + Date.now(),
    itemName,
    quantity: Number(quantity) || 0,
    price: Number(price) || 0,
  });
  res.json(item);
});

app.put("/api/stock/:id", requireLogin, withDB, async (req, res) => {
  const { itemName, quantity, price } = req.body;
  // Staff can only update quantity; founder can update everything
  const updates = req.user.role === "founder"
    ? { itemName, quantity: quantity !== undefined ? Number(quantity) : undefined, price: price !== undefined ? Number(price) : undefined }
    : { quantity: quantity !== undefined ? Number(quantity) : undefined };
  const item = await db.updateStockItem(req.params.id, updates);
  if (!item) return res.status(404).json({ error: "stock item not found" });
  res.json(item);
});

app.delete("/api/stock/:id", requireLogin, requireFounder, withDB, async (req, res) => {
  await db.deleteStockItem(req.params.id);
  res.json({ ok: true });
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────
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

  // Deduct stock quantities
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

// ─── SPA FALLBACK ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

module.exports = app;
