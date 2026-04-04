# 🎨 Tattoo Studio — AI Automation Dashboard

An AI-powered advertising & marketing automation dashboard for tattoo and piercing studios.
Built with **Next.js 16**, **Supabase**, and **n8n** automation workflows.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Ads Analysis** | AI competitor analysis via n8n webhook — hooks, gaps, market insights |
| **Create Ad** | AI-generated ad copy + direct video generation trigger |
| **Approval Queue** | Review, schedule, approve or reject ad drafts per-ad or in bulk |
| **Live Campaigns** | Monitor and stop active Meta campaigns with optimistic UI |
| **Social Posts** | Trigger AI social content for seasonal events across 4 platforms |
| **Reports** | Real-time Supabase-powered report management with modal detail view |
| **Ad Previews** | Live video availability check from Supabase storage with refresh |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL + Realtime subscriptions) |
| Storage | Supabase Storage (AD1, AD2, AD3 buckets) |
| Automation | n8n self-hosted webhooks |
| Styling | Vanilla CSS + CSS custom properties (design tokens) |
| Font | Inter (Google Fonts via `next/font`) |

---

## 🚀 Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Set up environment variables
Create a `.env.local` file in the root (**never commit this file**):
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📁 Project Structure

```
tatoo/
├── app/
│   ├── page.js                  # Main dashboard — all 7 tabs
│   ├── components.js            # Shared UI components (Badge, Card, Spinner, etc.)
│   ├── globals.css              # Design system / CSS custom properties
│   ├── layout.js                # Root layout + SEO metadata
│   └── api/
│       ├── trigger-n8n/         # CORS proxy — routes actions to n8n webhooks
│       └── trigger-ads/         # Supabase DB update + ads webhook trigger
├── lib/
│   └── supabase.js              # Supabase client
├── public/                      # Static assets (SVGs, favicon)
├── next.config.mjs              # Next.js + GitHub Pages config
├── jsconfig.json                # Path aliases (@/ → root)
└── package.json
```

---

## ⚙️ n8n Webhook Actions

All webhook calls are proxied through `/api/trigger-n8n` to avoid CORS issues.

| Action | n8n Endpoint | Triggered From |
|---|---|---|
| `competitor_analysis` | `/webhook/meta_ads_scraper` | Ads Analysis tab |
| `generate_ad` | `/webhook/generate_ad` | Create Ad tab |
| `launch_meta_ad` | `/webhook/launch_ad` | Create Ad tab |
| `stop_campaign` | `/webhook/stop_campaign` | Live Campaigns tab |
| `generate_report` | `/webhook/generate_report` | Reports tab |
| `generate_social_post` | `/webhook/social_post` | Social Posts tab |

---

## 📦 Build for Production / GitHub Pages

```bash
npm run build
```

Outputs to `/out/` — static export ready for GitHub Pages deployment.

> The `out/` folder is **gitignored** — it is regenerated on each build and should not be committed.

---

## 🔒 Security Notes

- Supabase credentials must be stored in `.env.local` (gitignored)
- The `/api/trigger-n8n` proxy prevents direct browser-to-n8n CORS issues
- All `.map()` calls use optional chaining: `(data?.field || []).map()`
- All object accesses use optional chaining: `data?.field?.subfield`

---

## 🧠 n8n Analysis Data Structure

The `analysisData` object received from n8n webhooks has this exact shape:

```js
analysisData.executive_summary        // string
analysisData.competitor_analysis      // array
analysisData.gap_opportunities        // array
analysisData.ready_ad_scripts         // array
analysisData.action_plan              // array
analysisData.hook_analysis.top_hook_patterns  // array
analysisData.market_insights          // object
analysisData.budget_recommendation    // object
```

> **Never** use `analysisData.ideas` (use `gap_opportunities`) or `analysisData.competitors` (use `competitor_analysis`).
