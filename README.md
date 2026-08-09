# Static — Expense Tracker

Internal expense tracker for the Static brand. Log what the team spends on ads, printing, packaging, and delivery — everyone sees it in real time, synced across every device.

## How it works (the 30-second version)

- **Locally (same WiFi)**: one laptop runs the server, everyone else opens a browser and goes to its IP address.
- **On Vercel (any home, anywhere)**: the app lives at a real web link. Anyone with an account can log in from wherever.
- The dashboard auto-refreshes every 15 seconds (that's the pulsing green dot in the sidebar) — if someone logs an expense on their phone, it shows up on your screen within seconds.

---

## What you can track

| Category | What it covers |
|---|---|
| 📢 **Ads** | Facebook, Instagram, TikTok campaigns, boosts, etc. |
| 🖨️ **Printing** | Labels, flyers, stickers, any print job |
| 📦 **Packaging** | Boxes, tissue paper, tape, bags |
| 🚚 **Delivery** | Courier fees, shipping costs |

Each expense entry stores: **category**, **description**, **amount (EGP)**, **who logged it**, an optional note, and the date.

The top of the dashboard shows live running totals per category and overall.

---

## Option A: Deploy to Vercel (works from any home, anywhere)

Use this if the team is connecting from different locations.

**Step 1 — Push to GitHub**
- Create a repo on [github.com](https://github.com) and push this folder to it.

**Step 2 — Import into Vercel**
- Go to [vercel.com](https://vercel.com), log in, click **"Add New" → "Project"**
- Pick your GitHub repo, click **Deploy**
- It'll give you a URL like `https://static-expenses.vercel.app` — hold on, one more step.

**Step 3 — Add a Redis database (replaces `db.json` in production)**
- Vercel doesn't let projects write files permanently, so we need a real database online.
- In your Vercel project, go to **Storage** → **Create Database** → pick **Upstash → Redis**
- Complete the setup (free tier is plenty) and connect it to your project
- Vercel automatically injects the required environment variables — nothing to type manually

**Step 4 — Add your login secret**
- In Vercel, go to **Settings → Environment Variables**
- Add: `JWT_SECRET` = any long random string you make up
  - Example: `xk8Ptq2vLmZ9wRfN4hYbJ7cQeA1sUdVo`
  - This keeps login sessions secure — keep it private

**Step 5 — Redeploy**
- Go to **Deployments** → three dots on the latest one → **Redeploy**
- Visit your link, log in with `founder` / `changeme123`, and **change that password immediately**

Done — share the link with your team and create accounts for them from the Team tab.

---

## Option B: Run locally on your own WiFi (free, no account needed)

1. Install [Node.js](https://nodejs.org) if you don't have it.
2. Open a terminal in this folder and run:
   ```
   npm install
   npm start
   ```
3. You'll see:
   ```
   Server running on http://localhost:3000
   ```
4. Go to `http://localhost:3000`, log in with `founder` / `changeme123`, change your password.

**Let other people on the same WiFi connect:**
1. Find your laptop's local IP:
   - Windows: run `ipconfig` → look for "IPv4 Address"
   - Mac/Linux: run `ifconfig` → look for something like `192.168.1.42`
2. Tell others to open `http://192.168.1.42:3000` in their browser (swap in your real IP)
3. Log in — done.

> **Note:** that IP only works inside your home's WiFi. Someone in a different location can't reach it — that's what Option A is for.

---

## Accounts

| Role | Can do |
|---|---|
| **Founder** | Everything — log expenses, delete entries, manage team accounts |
| **Staff** | Log expenses only — cannot delete entries or touch the team list |

- Add team members from the **Team** tab (founder-only)
- Anyone can change their own password using the "Change password" button in the sidebar
- Default login on first run: `founder` / `changeme123` — change it immediately

---

## Data

- **Locally**: everything is stored in `db.json` in this folder. Back it up somewhere safe occasionally.
- **On Vercel**: data lives in your Upstash Redis database. Export it from the Upstash dashboard if you ever need a backup.

---

## File structure

```
├── api/
│   └── index.js        # All API routes (auth, expenses, users)
├── lib/
│   └── db.js           # JSON file read/write helper
├── public/
│   ├── index.html      # App UI
│   ├── app.js          # Frontend logic
│   └── style.css       # Design system + component styles
├── db.json             # Local database (auto-created)
├── server.js           # Express entry point
└── vercel.json         # Vercel routing config
```
