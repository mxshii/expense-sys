const { Pool } = require("pg");

// ─── Connection Pool ──────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
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

    CREATE TABLE IF NOT EXISTS stock (
      id        TEXT PRIMARY KEY,
      item_name TEXT NOT NULL,
      quantity  INTEGER NOT NULL DEFAULT 0,
      price     NUMERIC(12, 2) NOT NULL DEFAULT 0
    );

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

// ─── Stock Helpers ────────────────────────────────────────────────────────────
async function getStock() {
  await initDB();
  const { rows } = await pool.query(`
    SELECT id, item_name AS "itemName", quantity, price::float AS price
    FROM stock ORDER BY item_name
  `);
  return rows;
}

async function insertStockItem({ id, itemName, quantity, price }) {
  await initDB();
  const { rows } = await pool.query(
    `INSERT INTO stock (id, item_name, quantity, price) VALUES ($1, $2, $3, $4)
     RETURNING id, item_name AS "itemName", quantity, price::float AS price`,
    [id, itemName, quantity, price]
  );
  return rows[0];
}

async function updateStockItem(id, { itemName, quantity, price }) {
  await initDB();
  const fields = [];
  const vals = [];
  let i = 1;
  if (itemName  !== undefined) { fields.push(`item_name = $${i++}`); vals.push(itemName); }
  if (quantity  !== undefined) { fields.push(`quantity  = $${i++}`); vals.push(quantity); }
  if (price     !== undefined) { fields.push(`price     = $${i++}`); vals.push(price); }
  if (!fields.length) return;
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE stock SET ${fields.join(", ")} WHERE id = $${i}
     RETURNING id, item_name AS "itemName", quantity, price::float AS price`,
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

async function insertOrder({ id, customerName, phone, email, items, address, shippingPrice, paymentStatus, deliveryStatus, createdBy }) {
  await initDB();
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
    [id, customerName, phone, email || null, JSON.stringify(items), address, shippingPrice, paymentStatus, deliveryStatus, createdBy]
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
    await pool.query(
      "UPDATE stock SET quantity = GREATEST(0, quantity - $1) WHERE id = $2",
      [item.qty, item.stockId]
    );
  }
}

module.exports = {
  // users
  getUsers, getUserByUsername, getUserById, countUsers,
  insertUser, updateUserPassword, deleteUser,
  // expenses
  getExpenses, insertExpense, deleteExpense,
  // stock
  getStock, insertStockItem, updateStockItem, deleteStockItem,
  // orders
  getOrders, insertOrder, updateOrder, deleteOrder, deductStockForOrder,
};
