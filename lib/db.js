const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "db.json");
const emptyDB = { users: [], expenses: [] };

// On Netlify, process.env.NETLIFY is always "true"
const isNetlify = process.env.NETLIFY === "true";

// ─── Public API ──────────────────────────────────────────────────────────────
async function loadDB() {
  if (!isNetlify) {
    // Local dev: read from db.json
    if (!fs.existsSync(DB_PATH)) return { ...emptyDB };
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  }
  // Production: Netlify Blobs — no setup needed, just works
  const { getStore } = require("@netlify/blobs");
  const store = getStore("expense-system");
  const data = await store.get("db", { type: "json" });
  return data || { ...emptyDB };
}

async function saveDB(data) {
  if (!isNetlify) {
    // Local dev: write to db.json
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return;
  }
  // Production: Netlify Blobs
  const { getStore } = require("@netlify/blobs");
  const store = getStore("expense-system");
  await store.set("db", JSON.stringify(data));
}

module.exports = { loadDB, saveDB };
