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

    CREATE TABLE IF NOT EXISTS brand_expenses (
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

// ─── Brand Expense Helpers (Company Money) ───────────────────────────────────
async function getBrandExpenses() {
  await initDB();
  const { rows } = await pool.query(`
    SELECT id, category, description,
           amount::float AS amount, note,
           logged_by  AS "loggedBy",
           created_at AS "createdAt"
    FROM brand_expenses ORDER BY created_at DESC
  `);
  return rows;
}

async function insertBrandExpense({ id, category, description, amount, note, loggedBy }) {
  await initDB();
  const { rows } = await pool.query(
    `INSERT INTO brand_expenses (id, category, description, amount, note, logged_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, category, description,
               amount::float AS amount, note,
               logged_by AS "loggedBy", created_at AS "createdAt"`,
    [id, category, description, amount, note || null, loggedBy]
  );
  return rows[0];
}

async function deleteBrandExpense(id) {
  await initDB();
  await pool.query("DELETE FROM brand_expenses WHERE id = $1", [id]);
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

async function updateRevenue(id, { category, description, amount, note }) {
  await initDB();
  const fields = [];
  const vals = [];
  let i = 1;
  if (category    !== undefined) { fields.push(`category = $${i++}`);    vals.push(category); }
  if (description !== undefined) { fields.push(`description = $${i++}`); vals.push(description); }
  if (amount      !== undefined) { fields.push(`amount = $${i++}`);      vals.push(amount); }
  if (note        !== undefined) { fields.push(`note = $${i++}`);        vals.push(note); }
  if (!fields.length) return;
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE revenue SET ${fields.join(", ")} WHERE id = $${i}
     RETURNING id, category, description,
               amount::float AS amount, note,
               collected_by AS "collectedBy",
               created_at AS "createdAt"`,
    vals
  );
  return rows[0] || null;
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
  const order = rows[0];
  if (order) await syncOrderRevenue(order);
  return order;
}

async function updateOrder(id, { customerName, phone, email, items, address, shippingPrice, paymentStatus, deliveryStatus }) {
  await initDB();
  const fields = [];
  const vals = [];
  let i = 1;
  if (customerName  !== undefined) { fields.push(`customer_name   = $${i++}`); vals.push(customerName); }
  if (phone         !== undefined) { fields.push(`phone           = $${i++}`); vals.push(phone); }
  if (email         !== undefined) { fields.push(`email           = $${i++}`); vals.push(email || null); }
  if (items         !== undefined) { fields.push(`items           = $${i++}`); vals.push(JSON.stringify(items)); }
  if (address       !== undefined) { fields.push(`address         = $${i++}`); vals.push(address); }
  if (shippingPrice !== undefined) { fields.push(`shipping_price  = $${i++}`); vals.push(shippingPrice); }
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
  const updatedOrder = rows[0];
  if (updatedOrder) await syncOrderRevenue(updatedOrder);
  return updatedOrder;
}

async function deleteOrder(id) {
  await initDB();
  await pool.query("DELETE FROM orders WHERE id = $1", [id]);
  await pool.query("DELETE FROM revenue WHERE id = $1 OR id LIKE $2", ["rev_ord_" + id, "rev_ord_" + id + "_%"]);
}

// ─── Order Revenue Sync (Paid Orders -> Revenue Tab by Barcode) ───────────────
function detectItemCategory(item, stockMap) {
  const stock = (item.stockId && stockMap.get(item.stockId))
             || (item.id && stockMap.get(item.id))
             || null;
  const barcode = String(item.sku || item.barcode || (stock && (stock.sku || stock.barcode)) || "").trim().toLowerCase();

  // Barcode prefix rules:
  // - Begins with "stk" or "ssh" -> Stickers
  // - Begins with "ptr"          -> Posters
  // - Begins with "mls"          -> Mail Subscription
  if (barcode.startsWith("stk") || barcode.startsWith("ssh")) {
    return "Stickers";
  }
  if (barcode.startsWith("ptr")) {
    return "Posters";
  }
  if (barcode.startsWith("mls")) {
    return "Mail Subscription";
  }

  // Name-based fallback if barcode is not set yet
  const name = String(item.name || (stock && stock.itemName) || "").toLowerCase();
  if (name.includes("sticker") || name.includes("sheet")) return "Stickers";
  if (name.includes("poster")) return "Posters";
  if (name.includes("mail") || name.includes("subscription")) return "Mail Subscription";

  return "Other";
}

async function syncOrderRevenue(order, preloadedStockMap = null) {
  if (!order || !order.id) return;
  
  // Clean up any previous revenue records for this order
  await pool.query("DELETE FROM revenue WHERE id = $1 OR id LIKE $2", ["rev_ord_" + order.id, "rev_ord_" + order.id + "_%"]);

  if (order.paymentStatus !== "paid") {
    return;
  }

  let stockMap = preloadedStockMap;
  if (!stockMap) {
    const { rows: stockList } = await pool.query("SELECT id, sku, item_name AS \"itemName\" FROM stock");
    stockMap = new Map();
    stockList.forEach(s => {
      stockMap.set(s.id, s);
      if (s.sku) stockMap.set(s.sku, s);
    });
  }

  const rawItems = Array.isArray(order.items)
    ? order.items
    : (typeof order.items === "string" ? JSON.parse(order.items || "[]") : []);

  // Group items by detected category
  const catGroups = {};
  for (const item of rawItems) {
    const cat = detectItemCategory(item, stockMap);
    if (!catGroups[cat]) catGroups[cat] = [];
    catGroups[cat].push(item);
  }

  const categories = Object.keys(catGroups);
  const customer = (order.customerName || "").trim();
  const noteParts = [];
  if (order.phone) noteParts.push("Phone: " + order.phone);
  if (order.deliveryStatus) noteParts.push("Status: " + order.deliveryStatus);
  if (order.address) noteParts.push("Address: " + order.address);
  const note = noteParts.join(" · ");
  const shipping = Number(order.shippingPrice) || 0;

  if (categories.length === 0) {
    const totalAmount = shipping;
    if (totalAmount > 0) {
      await pool.query(`
        INSERT INTO revenue (id, category, description, amount, note, collected_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          category = EXCLUDED.category, description = EXCLUDED.description,
          amount = EXCLUDED.amount, note = EXCLUDED.note,
          collected_by = EXCLUDED.collected_by, created_at = EXCLUDED.created_at
      `, [
        "rev_ord_" + order.id,
        "Other",
        `Order #${order.id}${customer ? " — " + customer : ""}`,
        totalAmount,
        note || null,
        order.createdBy || "system",
        order.createdAt || new Date()
      ]);
    }
    return;
  }

  // Single category in this order
  if (categories.length === 1) {
    const cat = categories[0];
    const items = catGroups[cat];
    const itemsTotal = items.reduce((s, it) => s + (Number(it.qty || 1) * Number(it.price || 0)), 0);
    const totalAmount = itemsTotal + shipping;
    const itemNames = items.map(it => `${it.name || it.itemName || "Item"} ×${it.qty || 1}`).join(", ");
    const desc = `Order #${order.id}${customer ? " — " + customer : ""}${itemNames ? " (" + itemNames + ")" : ""}`;

    await pool.query(`
      INSERT INTO revenue (id, category, description, amount, note, collected_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        category     = EXCLUDED.category,
        description  = EXCLUDED.description,
        amount       = EXCLUDED.amount,
        note         = EXCLUDED.note,
        collected_by = EXCLUDED.collected_by,
        created_at   = EXCLUDED.created_at
    `, [
      "rev_ord_" + order.id,
      cat,
      desc,
      totalAmount,
      note || null,
      order.createdBy || "system",
      order.createdAt || new Date()
    ]);
  } else {
    // Multi-category in this order: split into category lines and allocate shipping to primary
    let maxSub = -1;
    let primaryCat = categories[0];
    categories.forEach(cat => {
      const sub = catGroups[cat].reduce((s, it) => s + (Number(it.qty || 1) * Number(it.price || 0)), 0);
      if (sub > maxSub) { maxSub = sub; primaryCat = cat; }
    });

    for (const cat of categories) {
      const items = catGroups[cat];
      const itemsTotal = items.reduce((s, it) => s + (Number(it.qty || 1) * Number(it.price || 0)), 0);
      const catShipping = (cat === primaryCat) ? shipping : 0;
      const totalAmount = itemsTotal + catShipping;
      const itemNames = items.map(it => `${it.name || it.itemName || "Item"} ×${it.qty || 1}`).join(", ");
      const desc = `Order #${order.id} [${cat}]${customer ? " — " + customer : ""}${itemNames ? " (" + itemNames + ")" : ""}`;
      const revId = `rev_ord_${order.id}_${cat.toLowerCase().replace(/\s+/g, "_")}`;

      await pool.query(`
        INSERT INTO revenue (id, category, description, amount, note, collected_by, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          category     = EXCLUDED.category,
          description  = EXCLUDED.description,
          amount       = EXCLUDED.amount,
          note         = EXCLUDED.note,
          collected_by = EXCLUDED.collected_by,
          created_at   = EXCLUDED.created_at
      `, [
        revId,
        cat,
        desc,
        totalAmount,
        note || null,
        order.createdBy || "system",
        order.createdAt || new Date()
      ]);
    }
  }
}

async function syncAllPaidOrdersToRevenue() {
  try {
    const { rows: stockList } = await pool.query("SELECT id, sku, item_name AS \"itemName\" FROM stock");
    const stockMap = new Map();
    stockList.forEach(s => {
      stockMap.set(s.id, s);
      if (s.sku) stockMap.set(s.sku, s);
    });

    const { rows: orders } = await pool.query("SELECT * FROM orders");
    for (const o of orders) {
      const rawItems = Array.isArray(o.items)
        ? o.items
        : (typeof o.items === "string" ? JSON.parse(o.items || "[]") : []);
      const normOrder = {
        id: o.id,
        customerName: o.customer_name,
        phone: o.phone,
        email: o.email,
        items: rawItems,
        address: o.address,
        shippingPrice: o.shipping_price,
        paymentStatus: o.payment_status,
        deliveryStatus: o.delivery_status,
        createdBy: o.created_by,
        createdAt: o.created_at
      };
      if (normOrder.paymentStatus === "paid") {
        await syncOrderRevenue(normOrder, stockMap);
      } else {
        await pool.query("DELETE FROM revenue WHERE id = $1 OR id LIKE $2", ["rev_ord_" + normOrder.id, "rev_ord_" + normOrder.id + "_%"]);
      }
    }
  } catch (err) {
    console.error("Order revenue sync error:", err.message);
  }
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

// Reconcile stock quantities when order items are modified
async function reconcileStockForOrder(oldItems = [], newItems = []) {
  await initDB();
  const oldMap = {};
  for (const it of (oldItems || [])) {
    const stockId = it.stockId || it.id || it.stockItemId;
    const qty = Number(it.qty || it.quantity || 0);
    if (stockId && qty > 0) oldMap[stockId] = (oldMap[stockId] || 0) + qty;
  }
  const newMap = {};
  for (const it of (newItems || [])) {
    const stockId = it.stockId || it.id || it.stockItemId;
    const qty = Number(it.qty || it.quantity || 0);
    if (stockId && qty > 0) newMap[stockId] = (newMap[stockId] || 0) + qty;
  }

  const allStockIds = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
  for (const stockId of allStockIds) {
    const oldQty = oldMap[stockId] || 0;
    const newQty = newMap[stockId] || 0;
    const diff = newQty - oldQty;
    if (diff > 0) {
      // More items ordered -> deduct diff from stock
      await pool.query(
        "UPDATE stock SET quantity = GREATEST(0, quantity - $1) WHERE id = $2",
        [diff, stockId]
      );
    } else if (diff < 0) {
      // Items returned/reduced -> restore -diff back to stock
      await pool.query(
        "UPDATE stock SET quantity = quantity + $1 WHERE id = $2",
        [-diff, stockId]
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

// ─── Bootstrap (Fast Consolidated Fetch) ──────────────────────────────────────
async function getBootstrapData() {
  await initDB();
  const [orders, stock, expenses, brandExpenses, revenue] = await Promise.all([
    getOrders(),
    getStock(),
    getExpenses(),
    getBrandExpenses(),
    getRevenue(),
  ]);
  return { orders, stock, expenses, brandExpenses, revenue };
}

module.exports = {
  // bootstrap
  getBootstrapData,
  // users
  getUsers, getUserByUsername, getUserById, countUsers,
  insertUser, updateUserPassword, deleteUser,
  // expenses (personal)
  getExpenses, insertExpense, deleteExpense,
  // brand expenses (company money)
  getBrandExpenses, insertBrandExpense, deleteBrandExpense,
  // revenue
  getRevenue, insertRevenue, updateRevenue, deleteRevenue, syncOrderRevenue, syncAllPaidOrdersToRevenue,
  // stock
  getStock, insertStockItem, updateStockItem, deleteStockItem,
  // orders
  getOrders, getOrderById, getNextOrderId, insertOrder, updateOrder, deleteOrder, deductStockForOrder, reconcileStockForOrder,
  // customers
  getCustomers, getCustomerByEmail, getCustomerById, insertCustomer, deleteCustomer,
};