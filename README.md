# 💚 NaijaSpend

**A personal finance tracker with AI insights — built for how money moves in Naija.** ₦

Track every Naira, budget by category, set savings goals, and let the built-in AI engine turn
your ledger into plain-language advice: spending anomaly alerts, next-month forecasts, a
financial health score, personalised tips, and an assistant chat that answers questions with
your *actual* numbers.

---

## ✨ Features

| Area | What you get |
|---|---|
| 🔐 **Auth** | Email/password sign-up & login (scrypt hashing + JWT) |
| 🧾 **Transactions** | Full CRUD, categories with emoji + colour, payment methods (Transfer/Card/Cash/USSD/POS), search, filters, pagination, CSV export |
| 🎯 **Budgets** | Monthly limits per category with live progress bars, over-budget warnings, carry-over helper |
| 🏁 **Goals** | Savings goals with targets, deadlines, progress tracking and quick contributions |
| 📊 **Dashboard** | Income/spending/net/savings-rate stat cards, 6-month income-vs-spend chart, category donut, budget snapshot, recent activity |
| 🤖 **AI Insights** | Financial health score (0–100 with breakdown), spending anomaly detection, unusually-large-transaction flags, month-over-month movers, next-month forecast, suggested budgets (one-click apply), personalised Nigerian-context tips |
| 💬 **Naija AI chat** | Ask things like *"How much did I spend on Transport?"*, *"Can I afford 150k for a laptop?"*, *"What's my savings rate?"*, *"How much did I spend last month?"* — answered from your real data |
| 📥 **Bank-alert import** | Paste GTB / Kuda / OPay / Access / Moniepoint-style debit & credit alert texts — amounts, dates, types and narrations are auto-detected, categories auto-suggested, review & import in one click |
| 🔁 **Recurring transactions** | Rules for rent, salary, subscriptions, tithe — auto-logged on schedule (monthly/weekly), with automatic catch-up for missed periods, pause/resume, and "log now" |
| 📊 **Reports** | 12-month income vs spending chart, month-by-month table with savings rates, category × month breakdown, averages and best-month stats |
| 🧾 **Receipt photos** | Attach a photo to any transaction — compressed in the browser, stored server-side, viewable with one tap |
| 📱 **Installable (PWA)** | Add NaijaSpend to your phone's home screen; app shell cached for offline loading |
| ₦ **Naija-first** | Naira formatting everywhere, categories that match real life — *Data & Airtime*, *Utilities (NEPA/diesel)*, market runs and Bolt rides |

### How the AI works

The intelligence is a **self-contained insight engine** (`server/insights.js` + `server/assistant.js`)
— no API key or internet required:

- **Run-rate-aware projections** — mid-month numbers are projected using actual pace *blended*
  with your historical average, so day-3 spikes (rent!) don't produce silly forecasts.
- **Anomaly detection** — a category is flagged when its projected spend runs ≥ 30% above your
  trailing average; single transactions ≥ 2× your category norm are surfaced too.
- **Alert parsing** — the bank-alert importer uses layered heuristics (currency markers, 2-decimal
  amounts, verb phrasing, balance exclusion) plus a merchant-keyword auto-categorizer, with a
  confidence score shown per parsed row.
- **Recurring engine** — each rule keeps a `next_run` pointer; on your next API call after any due
  date, missed transactions are back-filled with their correct dates (idempotent, capped at 60
  iterations, day-of-month clamped for short months).
- **Health score** — weighted composite of savings rate (40), budget adherence (25), spending
  consistency (15), income trend (10) and goal progress (10).
- **Forecast** — linear regression over completed months, clamped to a sane band.
- **Assistant** — an intent-matching rules engine that computes answers from your ledger.

**Optional LLM upgrade:** set `OPENAI_API_KEY` (plus optional `OPENAI_BASE_URL`, `OPENAI_MODEL`,
e.g. for any OpenAI-compatible endpoint) and the chat automatically uses an LLM with your compact
financial context as grounding — falling back to the rules engine on any error.

---

## 🚀 Quick start

Requires **Node.js ≥ 22.5** (uses the built-in `node:sqlite`).

```bash
npm run setup     # install server + client dependencies
npm run build     # build the React frontend into server/public
npm start         # start the app on http://localhost:3000
```

Then open **http://localhost:3000**.

**First run:** open http://localhost:3000 and create your account — then bring your real data in
via **Transactions → 📥 Import alerts** (paste your bank's debit/credit alert texts) or add
transactions manually.

### Development mode

```bash
npm run dev:server        # API on :3000
npm run dev:client        # Vite dev server on :5173 (proxies /api → :3000)
```

### Configuration (all optional)

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | random, persisted to `server/data/.secret` | Token signing secret |
| `OPENAI_API_KEY` | — | Enables LLM-powered assistant chat |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model name |

---

## 🗄️ Tech stack

- **Backend** — Node.js, Express, SQLite via `node:sqlite`, zero-native-dependency JWT (HMAC-SHA256) & scrypt password hashing
- **Frontend** — React 18, React Router, Recharts, Vite, hand-rolled CSS design system
- **Data** — single SQLite file at `server/data/naijaspend.db` (WAL mode). Delete it to reset the world.

## 📁 Project structure

```
├── server/
│   ├── index.js            # Express app + static hosting of the built frontend
│   ├── db.js               # SQLite schema, default categories, helpers
│   ├── util.js             # JWT, scrypt, auth middleware, date helpers
│   ├── insights.js         # 🤖 AI insight engine (scores, anomalies, forecasts, tips)
│   ├── assistant.js        # 🤖 Chat assistant (rules engine + optional LLM)
│   ├── seed.js             # Demo data generator
│   ├── routes/             # auth, transactions, budgets, goals, dashboard, insights, assistant, export
│   └── public/             # built frontend (generated by `npm run build`)
└── client/
    └── src/
        ├── pages/          # Login, Dashboard, Transactions, Budgets, Goals, Insights, Settings
        ├── components/     # Layout, charts, icons, modals, widgets
        └── …               # auth context, API client, formatting, design system CSS
```

## 🔌 API overview

All routes are under `/api` and (except auth) require `Authorization: Bearer <token>`.

```
POST   /api/auth/register|login             PUT  /api/auth/me|password    DELETE /api/auth/data
GET    /api/auth/me                         PUT  /api/auth/me|password
GET/POST/DELETE  /api/categories[/:id]
GET/POST/PUT/DELETE /api/transactions[/:id]  (filters: month, type, category_id, q, page)
GET/POST/DELETE  /api/budgets[/:id]?month=YYYY-MM
GET/POST/PUT/DELETE /api/goals[/:id]         POST /api/goals/:id/contribute
GET    /api/dashboard?month=                GET  /api/insights?month=
POST   /api/assistant { message, history }  GET  /api/export (CSV)
POST   /api/import/parse { text }           POST /api/import/commit { items }
GET/POST/PUT/DELETE /api/recurrences[/:id]   POST /api/recurrences/:id/toggle|run-now
GET    /api/reports?months=12               PUT/DELETE /api/transactions/:id/receipt
GET    /api/receipts/:txId[?token=]
```

---

Built with 💚 — Naija to the world. 🇳🇬
