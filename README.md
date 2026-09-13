# UrjaOS ⚡

> **Optimize Energy. Reduce Cost. Power Smarter.**

UrjaOS is an AI-powered energy management platform that monitors solar generation
and electricity consumption, forecasts energy demand, and optimizes battery usage
to reduce electricity costs.

It is built as a production-quality, student-friendly full-stack application:
it works today as a college project on simulated IoT data, and is architected to
evolve into a commercially viable SaaS product.

---

## Project Overview

Solar generation is variable, consumption changes throughout the day, and battery
storage needs intelligent scheduling. Owners usually cannot easily answer:

- How much solar energy will I generate tomorrow?
- When is electricity expensive, and when should my battery charge/discharge?
- Why did my bill increase? Is my solar system performing normally?
- How much money is solar (and battery optimization) actually saving me?

UrjaOS turns raw energy data into actionable decisions:

> **Do not merely show the user what happened. Tell the user what they should do next — and why.**

### Product philosophy: Monitor → Understand → Predict → Optimize → Automate

**V1 = Monitor + Understand + Predict + Simulated Optimization.**
UrjaOS V1 is a *decision-support and simulation platform*. It does **not** control
physical batteries, inverters, or grid equipment. All optimization outputs are
clearly labeled as recommendations/simulations.

## Features (MVP)

| Area | Status |
| --- | --- |
| Authentication (email/password, Supabase Auth) | ✅ Done |
| Energy system CRUD (solar + battery + grid config) | ✅ Done |
| Dashboard (KPIs, charts, energy flow) | ✅ Phase 5 |
| Simulated IoT energy data (realistic patterns) | ✅ Done |
| Analytics (cost, savings, utilization) | ✅ Phase 7 |
| Solar + consumption forecasting (with MAE/RMSE/MAPE) | ✅ Phase 8 |
| Battery optimization engine (rule-based, constraint-safe) | ✅ Phase 9 |
| AI Energy Copilot (context-grounded, server-side key) | ✅ Phase 10 |
| Alerts + Bill analyzer | ✅ Phase 11 |
| Reports | ✅ Phase 12 |
| Demo mode (Factory Alpha dataset) | ✅ Phase 6 |

## Architecture

```text
┌────────────────────────── Next.js (App Router) ──────────────────────────┐
│  UI (React + Tailwind + shadcn/ui + Recharts)                            │
│    ↓                                                                     │
│  Route Handlers / Server Actions (validation via Zod, auth checks)       │
│    ↓                                                                     │
│  Domain logic (src/lib)                                                  │
│    ├── energy/        cost + savings engines                             │
│    ├── forecasting/   statistical models + accuracy metrics              │
│    ├── optimization/  battery constraints + schedule optimizer           │
│    ├── ai/            provider-agnostic LLM calls (server-only)          │
│    └── simulation/    realistic IoT data simulator                        │
│    ↓                                                                     │
│  Supabase client (src/lib/supabase)                                      │
└──────────────────────────────────────────────────────────────────────────┘
                                 ↓
                    Supabase (PostgreSQL + Auth + RLS)
```

### Project structure

```text
urjaos/
├── src/
│   ├── app/            # App Router pages (landing, (auth), (app), actions)
│   ├── components/     # ui/ (shadcn), auth/, dashboard/, charts/, ...
│   ├── lib/            # supabase/, auth/, validation/, energy/, forecasting/
│   ├── proxy.ts        # Next 16 session middleware (protected routes)
│   ├── types/          # shared TypeScript types
│   └── utils/
├── supabase/migrations/ # SQL migrations (schema + RLS policies)
├── tests/              # unit tests for core logic (vitest)
├── .env.example        # documented environment variables
└── README.md
```

## Tech Stack

- **Next.js 16** (App Router) + **TypeScript** (strict)
- **Tailwind CSS v4** + **shadcn/ui**
- **Supabase** — PostgreSQL, Auth (email/password), Row Level Security
- **Recharts** for charts
- **Zod** for validation
- **Vercel** for deployment

## Prerequisites

- **Node.js 20+** (developed on Node 24) — <https://nodejs.org>
- **npm 10+**
- A free **Supabase** account — <https://supabase.com>
- Git

## Installation

```bash
# 1. Clone and enter the project
git clone <your-repo-url>
cd urjaos

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env.local    # PowerShell: Copy-Item .env.example .env.local
```

## Environment Variables

| Variable | Where it's used | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Public anon key (safe — RLS protects data) |
| `AI_API_KEY` | **server only** | LLM API key (Phase 10). Never use the `NEXT_PUBLIC_` prefix for secrets |
| `AI_PROVIDER` | server only | Which AI provider to call (e.g. `openai`) |

- `.env.local` is git-ignored — never commit secrets.
- Get the Supabase URL + anon key from **Supabase Dashboard → Project Settings → API**.

## Supabase Setup

1. Create a project at <https://supabase.com> (free tier is enough).
2. Copy the **Project URL** and **anon public key** into `.env.local`.
3. **Authentication → Providers → Email**: enabled by default. For local dev you
   may disable "Confirm email" to make registration instant.

   ```powershell
   # apply the profiles migration (and all future ones)
   npx supabase db push
   ```
4. **Authentication → URL Configuration**: add `http://localhost:3000/**` to
   redirect URLs (add your Vercel domain later).
5. Run the database migrations (once Phase 3 lands):

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

6. Verify **Row Level Security** is enabled on all tables with the policies from
   `supabase/migrations/`. Users can only read/write data belonging to their own
   `energy_systems`.

### Database schema

| Table | Purpose |
| --- | --- |
| `profiles` | App profile per auth user (auto-created by trigger; roles: user/admin/energy_manager) |
| `energy_systems` | Solar + battery + grid configuration; root of the data model |
| `solar_readings` | PV generation telemetry (kW, kWh, irradiance, temperature) |
| `consumption_readings` | Load telemetry (kW, kWh) |
| `battery_readings` | Battery state (SOC, SOH, voltage, current, temperature, power) |
| `grid_readings` | Grid import/export with the tariff in effect |
| `forecasts` | Predictions with actuals → MAE/RMSE/MAPE accuracy tracking |
| `optimization_schedules` | Recommended hourly battery actions (simulation output) |
| `alerts` | Anomaly alerts with five severity levels |
| `bills` | User-entered utility bills for the analyzer |

**Guarantees enforced by the migrations:**

- **RLS on every table.** Child tables use a `can_access_system()` helper
  (SECURITY DEFINER) so ownership checks never recurse through policies.
- **Ownership is immutable.** Updates can never re-point a row's `user_id`.
- **Deduplicated time series.** All readings are unique on
  `(system_id, timestamp)` — safe for idempotent simulator upserts.
- **Physics mirrored in SQL.** SOC ∈ [0,100], `min_soc < max_soc`, efficiencies
  ∈ (0,1], non-negative powers/energy, and no simultaneous charge + discharge.
- **Cascade deletes.** Removing a system removes all of its data.
- **Indexed for time-series access:** `system_id` + `timestamp` on every
  reading table, partial indexes for unresolved alerts and pending actuals.

These guarantees are enforced in CI by `tests/schema.test.ts`, which parses the
migrations and fails if a table lacks RLS, policies, or its indexes.

## Running Locally

```bash
npm run dev
```

Open <http://localhost:3000>. You should see the UrjaOS landing page.

Other commands:

```bash
npm run lint     # ESLint
npm run build    # production build (also type-checks)
npm run start    # serve the production build
npm test         # unit tests (Phase 14)
```

## Demo Mode

The app ships with a **Factory Alpha** demo dataset — one click seeds it:

- Solar: 100 kW · Battery: 200 kWh
- Average daily consumption: 850 kWh · Tariff: ₹8.50/kWh

Click **“Try the demo system”** on the empty systems page (or the dashboard)
to create the demo system with 30 days of realistic hourly data, then explore
the platform. The simulator also exposes scenario controls on every system
page (sunny day, cloudy day, custom ranges) plus a reset.

### How the simulator works

- **Deterministic:** a seeded PRNG (mulberry32) means the same seed + inputs
  always produce identical readings — reproducible for demos and tests.
- **Solar:** sun-altitude bell curve (peaks ~13:00), seasonal factors,
  cloud-cover reduction, panel-temperature derating, ±6% electrical noise.
- **Consumption:** three load profiles (residential / commercial / industrial)
  with weekday/weekend behavior, seasonal multipliers, and noise; hourly
  energy is normalized so the day sums to the configured daily target.
- **Battery + grid:** an hourly energy-balance loop — solar serves load first,
  surplus charges the battery (respecting max charge power, SOC window, and
  efficiency), then exports; deficits discharge during expensive tariff
  windows and import the rest, never below min SOC.
- **Pipeline:** Simulator → Zod validation → batched upserts (unique
  `system_id, timestamp` keeps reruns idempotent) → Supabase → Dashboard.
- **API:** `POST /api/simulation/generate` and `GET|DELETE /api/simulation`
  (both verify authentication and system ownership).

## Testing

Unit tests run with **Vitest**. Auth logic (validation schemas, error mapping,
redirect sanitization) is already covered:

```bash
npm test        # 24 tests passing
```

More suites land with each phase: cost & savings calculations, battery SOC
constraints, charge/discharge limits, forecast validity, optimization schedule
validity, and API authorization behavior.

### How authentication works

- `src/proxy.ts` (Next.js 16's renamed middleware) refreshes Supabase session
  cookies on every request and **fails closed**: protected routes redirect to
  `/login?next=…` without a verified session.
- The `(app)` route group re-verifies the user server-side in its layout
  (defense in depth).
- Redirect targets are sanitized against open redirects
  (`src/lib/auth/redirect.ts`).
- Supabase Auth errors are mapped to safe, friendly messages
  (`src/lib/auth/errors.ts`).
- Profiles are created automatically by a database trigger and protected by RLS
  (`supabase/migrations/*_profiles.sql`).

### Energy systems

- `/systems` lists your systems (with an empty-state CTA for new users);
  `/systems/new` and `/systems/[id]/edit` share one validated form.
- Configuration covers solar capacity, battery limits (capacity, power,
  SOC window, efficiencies), and tariffs — flat rate **or** time-of-use
  periods with overnight-wrap support.
- The same Zod rules run in the form actions and mirror the database CHECK
  constraints, so invalid configurations are rejected at every layer.
- Deleting a system requires an explicit two-step confirmation and cascades
  to all readings, forecasts, schedules, and alerts.

## Git Workflow

```bash
git checkout -b feature/my-feature
# ... commit small, focused commits ...
git push -u origin feature/my-feature   # then open a Pull Request
```

Commit style follows the build order of the project (e.g. `Add authentication`,
`Add energy simulator`, `Add battery optimization`).

## Deployment (Vercel + Supabase)

1. Push the repository to GitHub.
2. In Vercel, **Import Project** and select the repository.
3. Add the environment variables from `.env.example` in **Settings → Environment Variables**.
4. Deploy. Then in Supabase → **Authentication → URL Configuration**, add
   `https://<your-app>.vercel.app/**` as a redirect URL.
5. Verify: register/login, dashboard, forecast, optimization, AI Copilot.

## Security Notes

- Supabase Auth handles passwords (never stored in our database).
- **RLS is always on** — users can only access their own systems and readings.
- AI keys are server-side only; the browser talks to `/api/ai/*`, never to the
  LLM provider directly.
- All API inputs are validated with Zod; errors never leak stack traces.

## Future Roadmap

| Version | Scope |
| --- | --- |
| **V2** | Real inverter APIs, smart meters, real IoT telemetry, advanced forecasting |
| **V3** | EV charging optimization, industrial load optimization, multi-site management |
| **V4** | Battery health prediction, predictive maintenance, advanced BESS analytics |
| **V5** | Demand response, virtual power plants, energy trading, grid optimization |

The database is designed so Organizations → Sites → Systems → Devices multi-tenancy
can be layered in later without breaking the MVP schema.

---

Built with ⚡ by the UrjaOS team.
