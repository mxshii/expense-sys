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

if (process.env.NODE_ENV !== "production") {
  app.use(express.static(path.join(__dirname, "..", "public")));
}

const CATEGORIES = ["Ads", "Printing", "Packaging", "Delivery"];

// ─── DB SEEDING ───────────────────────────────────────────────────────────────
// Seed the founder account once if no users exist yet.
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

// Middleware applied only to routes that need the DB
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
app.get("/api/ping", (req, res) => {
  res.json({ ok: true });
});

// ─── AUTH (no DB needed for /me and /logout) ──────────────────────────────────
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

// ─── AUTH (DB needed) ─────────────────────────────────────────────────────────
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
  const users = await db.getUsers();
  res.json(users);
});

app.post("/api/users", requireLogin, requireFounder, withDB, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "need a username and password" });
  const existing = await db.getUserByUsername(username);
  if (existing) {
    return res.status(400).json({ error: "that username is already taken" });
  }
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
  if (target.role === "founder")
    return res.status(400).json({ error: "cannot delete the founder account" });
  await db.deleteUser(req.params.id);
  res.json({ ok: true });
});

// ─── EXPENSES ─────────────────────────────────────────────────────────────────
app.get("/api/expenses", requireLogin, withDB, async (req, res) => {
  const expenses = await db.getExpenses();
  res.json(expenses);
});

app.post("/api/expenses", requireLogin, withDB, async (req, res) => {
  const { category, description, amount, note } = req.body;
  if (!category || !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "pick a valid category" });
  }
  if (!description || !description.trim()) {
    return res.status(400).json({ error: "description is required" });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: "enter a valid amount" });
  }
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

module.exports = app;
