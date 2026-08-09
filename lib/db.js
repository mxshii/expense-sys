const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "db.json");
const emptyDB = { users: [], expenses: [] };

// ─── Public API ──────────────────────────────────────────────────────────────
async function loadDB() {
  // NETLIFY_BLOBS_CONTEXT is injected by the Netlify Functions runtime on every
  // invocation — this is the reliable signal that we're running inside a function.
  // process.env.NETLIFY is a BUILD-TIME variable only, not available in functions.
  if (process.env.NETLIFY_BLOBS_CONTEXT) {
    const { getStore } = require("@netlify/blobs");
    const store = getStore("expense-system");
    const data = await store.get("db", { type: "json" });
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
    await store.set("db", JSON.stringify(data));
    return;
  }
  // Local dev fallback → write to db.json
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { loadDB, saveDB };
