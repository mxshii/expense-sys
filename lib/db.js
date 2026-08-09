const { Pool } = require("pg");

// ─── Connection Pool ──────────────────────────────────────────────────────────
// Uses DATABASE_URL env var (set by Neon / Vercel).
// For local dev, add DATABASE_URL to a .env file and load with dotenv.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ─── Schema Bootstrap ─────────────────────────────────────────────────────────
// Called once on first request. Creates tables if they don't exist yet.
let initialized = false;
async function initDB() {
  if (initialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      username    TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'staff'
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
  `);
  initialized = true;
}

// ─── User Helpers ─────────────────────────────────────────────────────────────
async function getUsers() {
  await initDB();
  const { rows } = await pool.query(
    "SELECT id, username, role FROM users ORDER BY username"
  );
  return rows;
}

async function getUserByUsername(username) {
  await initDB();
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE username = $1",
    [username]
  );
  return rows[0] || null;
}

async function getUserById(id) {
  await initDB();
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE id = $1",
    [id]
  );
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
  await pool.query(
    "UPDATE users SET password_hash = $1 WHERE id = $2",
    [newPasswordHash, id]
  );
}

async function deleteUser(id) {
  await initDB();
  await pool.query("DELETE FROM users WHERE id = $1", [id]);
}

// ─── Expense Helpers ──────────────────────────────────────────────────────────
async function getExpenses() {
  await initDB();
  const { rows } = await pool.query(
    `SELECT
       id, category, description,
       amount::float AS amount,
       note,
       logged_by   AS "loggedBy",
       created_at  AS "createdAt"
     FROM expenses
     ORDER BY created_at DESC`
  );
  return rows;
}

async function insertExpense({ id, category, description, amount, note, loggedBy }) {
  await initDB();
  const { rows } = await pool.query(
    `INSERT INTO expenses (id, category, description, amount, note, logged_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING
       id, category, description,
       amount::float AS amount,
       note,
       logged_by   AS "loggedBy",
       created_at  AS "createdAt"`,
    [id, category, description, amount, note || null, loggedBy]
  );
  return rows[0];
}

async function deleteExpense(id) {
  await initDB();
  await pool.query("DELETE FROM expenses WHERE id = $1", [id]);
}

module.exports = {
  // users
  getUsers,
  getUserByUsername,
  getUserById,
  countUsers,
  insertUser,
  updateUserPassword,
  deleteUser,
  // expenses
  getExpenses,
  insertExpense,
  deleteExpense,
};
