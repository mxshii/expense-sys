const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "db.json");
const emptyDB = { users: [], expenses: [] };

function withTimeout(promise, ms, label) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// ─── Public API ──────────────────────────────────────────────────────────────
async function loadDB() {
  // NETLIFY_BLOBS_CONTEXT is injected by the Netlify Functions runtime on every
  // invocation — this is the reliable signal that we're running inside a function.
  if (process.env.NETLIFY_BLOBS_CONTEXT) {
    const { getStore } = require("@netlify/blobs");
    const store = getStore("expense-system");
    const data = await withTimeout(
      store.get("db", { type: "json" }),
      5000,
      "loadDB (Netlify Blobs)"
    );
    return data || { ...emptyDB };
  }
  // Local dev fallback → read from db.json
  if (!fs.existsSync(DB_PATH)) return { ...emptyDB };
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

async function saveDB(data) {
  if (process.env.NETLIFY_BLOBS_CONTEXT) {
    const { getStore } = require("@netlify/blobs");
    const store = getStore("expense-system");
    await withTimeout(
      store.set("db", JSON.stringify(data)),
      5000,
      "saveDB (Netlify Blobs)"
    );
    return;
  }
  // Local dev fallback → write to db.json
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { loadDB, saveDB };
