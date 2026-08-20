const { Pool } = require("pg");

// ─── Connection Pool ──────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 3,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 5000,
});

// ─── Schema Bootstrap ─────────────────────────────────────────────────────────
let initialized = false;
async function initDB() {
  if (initialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'staff'
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id          TEXT PRIMARY KEY,
      category    TEXT NOT NULL,
      description TEXT NOT NULL,
      amount      NUMERIC(12, 2) NOT NULL,
      note        TEXT,
      logged_by   TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS revenue (
      id           TEXT PRIMARY KEY,
      category     TEXT NOT NULL,
      description  TEXT NOT NULL,
      amount       NUMERIC(12, 2) NOT NULL,
      note         TEXT,
      collected_by TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock (
      id        TEXT PRIMARY KEY,
      item_name TEXT NOT NULL,
      quantity  INTEGER NOT NULL DEFAULT 0,
      price     NUMERIC(12, 2) NOT NULL DEFAULT 0,
      sku       TEXT
    );

    ALTER TABLE stock ADD COLUMN IF NOT EXISTS sku TEXT;

    CREATE TABLE IF NOT EXISTS orders (
      id               TEXT PRIMARY KEY,
      customer_name    TEXT NOT NULL,
      phone            TEXT NOT NULL,
      email            TEXT,
      items            JSONB NOT NULL DEFAULT '[]',
      address          TEXT NOT NULL,
      shipping_price   NUMERIC(12, 2) NOT NULL DEFAULT 0,
      payment_status   TEXT NOT NULL DEFAULT 'unpaid',
      delivery_status  TEXT NOT NULL DEFAULT 'processing',
      created_by       TEXT NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customers (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      phone         TEXT,
      address       TEXT,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  initialized = true;
}

// ─── User Helpers ─────────────────────────────────────────────────────────────
async function getUsers() {
  await initDB();
  const { rows } = await pool.query("SELECT id, username, role FROM users ORDER BY username");
  return rows;
}

async function getUserByUsername(username) {
  await initDB();
  const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
  return rows[0] || null;
}

async function getUserById(id) {
  await initDB();
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] || null;
}

async function countUsers() {
  await initDB();
  const { rows } = await pool.query("SELECT COUNT(*) AS cnt FROM users");
  return parseInt(rows[0].cnt, 10);
}

async function insertUser({ id, username, passwordHash, role }) {
  await initDB();
  await pool.query(
    "INSERT INTO users (id, username, password_hash, role) VALUES ($1, $2, $3, $4)",
    [id, username, passwordHash, role]
  );
}

async function updateUserPassword(id, newPasswordHash) {
  await initDB();
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newPasswordHash, id]);
}

async function deleteUser(id) {
  await initDB();
  await pool.query("DELETE FROM users WHERE id = $1", [id]);
}

// ─── Expense Helpers ──────────────────────────────────────────────────────────
async function getExpenses() {
  await initDB();
  const { rows } = await pool.query(`
    SELECT id, category, description,
           amount::float AS amount, note,
           logged_by  AS "loggedBy",
           created_at AS "createdAt"
    FROM expenses ORDER BY created_at DESC
  `);
  return rows;
}

async function insertExpense({ id, category, description, amount, note, loggedBy }) {
  await initDB();
  const { rows } = await pool.query(
    `INSERT INTO expenses (id, category, description, amount, note, logged_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, category, description,
               amount::float AS amount, note,
               logged_by AS "loggedBy", created_at AS "createdAt"`,
    [id, category, description, amount, note || null, loggedBy]
  );
  return rows[0];
}

async function deleteExpense(id) {
  await initDB();
  await pool.query("DELETE FROM expenses WHERE id = $1", [id]);
}

// ─── Revenue Helpers ──────────────────────────────────────────────────────────
async function getRevenue() {
  await initDB();
  const { rows } = await pool.query(`
    SELECT id, category, description,
           amount::float AS amount, note,
           collected_by AS "collectedBy",
           created_at   AS "createdAt"
    FROM revenue ORDER BY created_at DESC
  `);
  return rows;
}

async function insertRevenue({ id, category, description, amount, note, collectedBy }) {
  await initDB();
  const { rows } = await pool.query(
    `INSERT INTO revenue (id, category, description, amount, note, collected_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, category, description,
               amount::float AS amount, note,
               collected_by AS "collectedBy", created_at AS "createdAt"`,
    [id, category, description, amount, note || null, collectedBy]
  );
  return rows[0];
}

async function deleteRevenue(id) {
  await initDB();
  await pool.query("DELETE FROM revenue WHERE id = $1", [id]);
}

// ─── Stock Helpers ────────────────────────────────────────────────────────────
async function getStock() {
  await initDB();
  const { rows } = await pool.query(`
    SELECT id, item_name AS "itemName", quantity, price::float AS price, sku
    FROM stock ORDER BY item_name
  `);
  return rows;
}

async function insertStockItem({ id, itemName, quantity, price, sku }) {
  await initDB();
  const { rows } = await pool.query(
    `INSERT INTO stock (id, item_name, quantity, price, sku) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, item_name AS "itemName", quantity, price::float AS price, sku`,
    [id, itemName, quantity, price, sku || null]
  );
  return rows[0];
}

async function updateStockItem(id, { itemName, quantity, price, sku }) {
  await initDB();
  const fields = [];
  const vals = [];
  let i = 1;
  if (itemName  !== undefined) { fields.push(`item_name = $${i++}`); vals.push(itemName); }
  if (quantity  !== undefined) { fields.push(`quantity  = $${i++}`); vals.push(quantity); }
  if (price     !== undefined) { fields.push(`price     = $${i++}`); vals.push(price); }
  if (sku       !== undefined) { fields.push(`sku       = $${i++}`); vals.push(sku); }
  if (!fields.length) return;
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE stock SET ${fields.join(", ")} WHERE id = $${i}
     RETURNING id, item_name AS "itemName", quantity, price::float AS price, sku`,
    vals
  );
  return rows[0];
}

async function deleteStockItem(id) {
  await initDB();
  await pool.query("DELETE FROM stock WHERE id = $1", [id]);
}

// ─── Order Helpers ────────────────────────────────────────────────────────────
async function getOrders() {
  await initDB();
  const { rows } = await pool.query(`
    SELECT id,
           customer_name   AS "customerName",
           phone, email, items, address,
           shipping_price::float AS "shippingPrice",
           payment_status  AS "paymentStatus",
           delivery_status AS "deliveryStatus",
           created_by      AS "createdBy",
           created_at      AS "createdAt"
    FROM orders ORDER BY created_at DESC
  `);
  return rows;
}

async function getOrderById(id) {
  await initDB();
  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  return rows[0] || null;
}

async function getNextOrderId() {
  await initDB();
  const { rows } = await pool.query("SELECT id FROM orders");
  let maxNum = 1000;
  for (const r of rows) {
    const rawId = String(r.id || "").trim();
    if (/^\d{1,8}$/.test(rawId)) {
      const n = parseInt(rawId, 10);
      if (n > maxNum && n < 10000000) maxNum = n;
    } else if (/^ord[-_]?(\d{1,8})$/i.test(rawId)) {
      const match = rawId.match(/^ord[-_]?(\d{1,8})$/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum && n < 10000000) maxNum = n;
      }
    }
  }
  return String(maxNum + 1);
}

async function insertOrder({ id, customerName, phone, email, items, address, shippingPrice, paymentStatus, deliveryStatus, createdBy }) {
  await initDB();
  let orderId = id ? String(id).trim() : "";
  if (!orderId) {
    orderId = await getNextOrderId();
  }
  const { rows } = await pool.query(
    `INSERT INTO orders
       (id, customer_name, phone, email, items, address, shipping_price, payment_status, delivery_status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id,
               customer_name   AS "customerName",
               phone, email, items, address,
               shipping_price::float AS "shippingPrice",
               payment_status  AS "paymentStatus",
               delivery_status AS "deliveryStatus",
               created_by      AS "createdBy",
               created_at      AS "createdAt"`,
    [orderId, customerName, phone, email || null, JSON.stringify(items), address, shippingPrice, paymentStatus, deliveryStatus, createdBy]
  );
  return rows[0];
}

async function updateOrder(id, { paymentStatus, deliveryStatus }) {
  await initDB();
  const fields = [];
  const vals = [];
  let i = 1;
  if (paymentStatus  !== undefined) { fields.push(`payment_status  = $${i++}`); vals.push(paymentStatus); }
  if (deliveryStatus !== undefined) { fields.push(`delivery_status = $${i++}`); vals.push(deliveryStatus); }
  if (!fields.length) return;
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE orders SET ${fields.join(", ")} WHERE id = $${i}
     RETURNING id,
               customer_name   AS "customerName",
               phone, email, items, address,
               shipping_price::float AS "shippingPrice",
               payment_status  AS "paymentStatus",
               delivery_status AS "deliveryStatus",
               created_by      AS "createdBy",
               created_at      AS "createdAt"`,
    vals
  );
  return rows[0];
}

async function deleteOrder(id) {
  await initDB();
  await pool.query("DELETE FROM orders WHERE id = $1", [id]);
}

// Deduct stock quantities when order is placed
async function deductStockForOrder(items) {
  await initDB();
  for (const item of items) {
    const qty = Number(item.qty || item.quantity || 0);
    const stockId = item.stockId || item.id || item.stockItemId;
    if (stockId && qty > 0) {
      await pool.query(
        "UPDATE stock SET quantity = GREATEST(0, quantity - $1) WHERE id = $2",
        [qty, stockId]
      );
    }
  }
}

// ─── Customer Helpers (Website Accounts) ──────────────────────────────────────
async function getCustomers() {
  await initDB();
  const { rows } = await pool.query(
    `SELECT id, name, email, phone, address, created_at AS "createdAt"
     FROM customers ORDER BY created_at DESC`
  );
  return rows;
}

async function getCustomerByEmail(email) {
  await initDB();
  const { rows } = await pool.query(
    `SELECT id, name, email, phone, address, password_hash, created_at AS "createdAt"
     FROM customers WHERE LOWER(email) = LOWER($1)`,
    [String(email).trim()]
  );
  return rows[0] || null;
}

async function getCustomerById(id) {
  await initDB();
  const { rows } = await pool.query(
    `SELECT id, name, email, phone, address, created_at AS "createdAt"
     FROM customers WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function insertCustomer({ id, name, email, phone, address, passwordHash }) {
  await initDB();
  const { rows } = await pool.query(
    `INSERT INTO customers (id, name, email, phone, address, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, email, phone, address, created_at AS "createdAt"`,
    [id, name, String(email).trim().toLowerCase(), phone || null, address || null, passwordHash]
  );
  return rows[0];
}

async function deleteCustomer(id) {
  await initDB();
  await pool.query("DELETE FROM customers WHERE id = $1", [id]);
}

module.exports = {
  // users
  getUsers, getUserByUsername, getUserById, countUsers,
  insertUser, updateUserPassword, deleteUser,
  // expenses
  getExpenses, insertExpense, deleteExpense,
  // revenue
  getRevenue, insertRevenue, deleteRevenue,
  // stock
  getStock, insertStockItem, updateStockItem, deleteStockItem,
  // orders
  getOrders, getOrderById, getNextOrderId, insertOrder, updateOrder, deleteOrder, deductStockForOrder,
  // customers
  getCustomers, getCustomerByEmail, getCustomerById, insertCustomer, deleteCustomer,
};