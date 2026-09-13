import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BatteryCharging,
  Bell,
  ChartLine,
  FileText,
  Gauge,
  Leaf,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FEATURES = [
  {
    icon: Sun,
    title: "Solar Monitoring",
    description:
      "Track generation hourly, daily and monthly. Spot underperformance before it costs you money.",
  },
  {
    icon: Activity,
    title: "Consumption Analytics",
    description:
      "Understand when and why you consume energy, with peak demand and usage pattern insights.",
  },
  {
    icon: BatteryCharging,
    title: "Battery Intelligence",
    description:
      "A rule-based optimizer schedules charging and discharging around tariffs and solar surplus.",
  },
  {
    icon: ChartLine,
    title: "Energy Forecasting",
    description:
      "Statistical models predict tomorrow's solar generation and consumption, with measured accuracy.",
  },
  {
    icon: Sparkles,
    title: "AI Energy Copilot",
    description:
      "Ask questions in plain language. Get answers grounded in your own energy data — not guesswork.",
  },
  {
    icon: Bell,
    title: "Alerts & Reports",
    description:
      "Automatic anomaly detection and clear periodic reports on energy, cost and performance.",
  },
];

const WORKFLOW = [
  {
    step: "01",
    icon: Gauge,
    title: "Monitor",
    description: "Solar, consumption, battery and grid data in one live dashboard.",
  },
  {
    step: "02",
    icon: TrendingUp,
    title: "Understand",
    description: "Analytics explain where your energy and money actually go.",
  },
  {
    step: "03",
    icon: ChartLine,
    title: "Predict",
    description: "Forecasts for generation and demand, validated against actuals.",
  },
  {
    step: "04",
    icon: BatteryCharging,
    title: "Optimize",
    description: "Battery schedules that minimize cost under real constraints.",
  },
  {
    step: "05",
    icon: Sparkles,
    title: "Automate",
    description: "The AI Copilot turns data into decisions you can act on.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Zap className="size-4.5" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Urja<span className="text-primary">OS</span>
            </span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#copilot" className="transition-colors hover:text-foreground">
              AI Copilot
            </a>
            <a href="#vision" className="transition-colors hover:text-foreground">
              Vision
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="border-b border-border/60 bg-gradient-to-b from-secondary/60 to-background">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <Leaf className="size-3.5 text-primary" aria-hidden="true" />
                AI + CleanTech Energy Platform
              </span>
              <h1 className="mt-6 text-4xl font-bold tracking-tight text-balance sm:text-5xl md:text-6xl">
                Optimize Energy.
                <br />
                Reduce Cost.
                <br />
                <span className="text-primary">Power Smarter.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
                UrjaOS uses AI-powered analytics, forecasting and battery
                optimization to help solar and energy-system owners make smarter
                energy decisions.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link href="/register">
                    Get Started
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#how-it-works">View Demo</a>
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Free to start · Runs on simulated IoT data — no hardware required
              </p>
            </div>

            {/* Hero panel — illustrative energy flow */}
            <div className="mx-auto mt-16 max-w-4xl" aria-hidden="true">
              <Card className="overflow-hidden border-border/80 shadow-lg shadow-primary/5">
                <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4">
                  {[
                    { icon: Sun, label: "Solar", value: "42.8 kWh", tone: "text-energy-amber" },
                    { icon: Zap, label: "Consumption", value: "35.4 kWh", tone: "text-energy-blue" },
                    { icon: BatteryCharging, label: "Battery SOC", value: "78%", tone: "text-energy-green" },
                    { icon: TrendingUp, label: "Est. Savings", value: "₹426", tone: "text-primary" },
                  ].map((kpi) => (
                    <div key={kpi.label} className="flex flex-col gap-1.5 bg-card p-5">
                      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <kpi.icon className={`size-4 ${kpi.tone}`} />
                        {kpi.label}
                      </span>
                      <span className="text-xl font-semibold tabular-nums sm:text-2xl">
                        {kpi.value}
                      </span>
                    </div>
                  ))}
                </div>
                <CardContent className="border-t border-border/60 bg-muted/30 px-5 py-3">
                  <p className="text-center text-xs text-muted-foreground">
                    Sample dashboard KPIs — values shown are illustrative
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* ── Problem ──────────────────────────────────────────── */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Solar energy is variable. Bills are not intuitive.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Most owners cannot easily answer simple questions about their own
              energy. UrjaOS is built to answer them.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "How much solar energy will I generate tomorrow?",
              "When is my electricity most expensive?",
              "When should my battery charge — and when discharge?",
              "Why did my bill increase this month?",
              "Is my solar system performing normally?",
              "How much money is solar actually saving me?",
            ].map((question) => (
              <Card key={question} className="bg-card/60">
                <CardContent className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <Zap className="size-3.5" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-medium leading-relaxed">{question}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────── */}
        <section id="how-it-works" className="border-y border-border/60 bg-muted/40">
          <div className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                From raw data to decisions
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                UrjaOS is not just another monitoring dashboard. It follows a
                clear progression — each stage builds on the last.
              </p>
            </div>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {WORKFLOW.map((item) => (
                <li key={item.step}>
                  <Card className="h-full">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <item.icon className="size-4.5" aria-hidden="true" />
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.step}
                        </span>
                      </div>
                      <CardTitle className="mt-3 text-base">{item.title}</CardTitle>
                      <CardDescription className="text-sm leading-relaxed">
                        {item.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────── */}
        <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              One platform for your entire energy system
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Solar, battery, grid and consumption — monitored, forecast and
              optimized together.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="size-5" aria-hidden="true" />
                  </span>
                  <CardTitle className="mt-4">{feature.title}</CardTitle>
                  <CardDescription className="leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* ── Energy Optimization ──────────────────────────────── */}
        <section className="border-y border-border/60 bg-muted/40">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Battery optimization that respects physics
              </h2>
              <p className="mt-4 text-lg text-pretty text-muted-foreground">
                The optimizer works within your real battery limits — capacity,
                state-of-charge bounds, power ratings and efficiency losses —
                and schedules around time-of-use tariffs and solar surplus.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Charge from solar surplus before exporting it",
                  "Discharge during expensive tariff windows",
                  "Never violate min/max state-of-charge constraints",
                  "Compare current cost vs. the optimized cost — always labeled as an estimate",
                ].map((point) => (
                  <li key={point} className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Optimization preview</CardTitle>
                <CardDescription>Illustrative example — not a guarantee</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium">Current strategy</p>
                    <p className="text-xs text-muted-foreground">Manual battery use</p>
                  </div>
                  <p className="text-xl font-semibold tabular-nums">₹4,820</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div>
                    <p className="text-sm font-medium text-primary">UrjaOS strategy</p>
                    <p className="text-xs text-muted-foreground">Simulated optimization</p>
                  </div>
                  <p className="text-xl font-semibold tabular-nums text-primary">₹4,120</p>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-secondary p-4">
                  <p className="text-sm font-medium">Potential saving</p>
                  <p className="text-xl font-bold tabular-nums text-primary">≈ ₹700</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Estimates depend on tariffs, weather and usage. Savings are
                  simulated, not guaranteed.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── AI Copilot ───────────────────────────────────────── */}
        <section id="copilot" className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Card className="order-last lg:order-first">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" aria-hidden="true" />
                  AI Energy Copilot
                </CardTitle>
                <CardDescription>
                  Example questions the Copilot can answer from your data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  "Why was my bill high last month?",
                  "How can I save money this week?",
                  "When should I charge my battery tomorrow?",
                  "How did my solar perform this week?",
                ].map((q) => (
                  <div
                    key={q}
                    className="rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm"
                  >
                    {q}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  The Copilot only sees your permitted energy data, clearly
                  separates facts from estimates, and states when data is
                  insufficient.
                </p>
              </CardContent>
            </Card>
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Ask questions. Get grounded answers.
              </h2>
              <p className="mt-4 text-lg text-pretty text-muted-foreground">
                Instead of staring at charts, ask the Copilot why your grid
                import spiked, what tomorrow looks like, or what the battery
                should do next — with every answer tied to your measured data.
              </p>
            </div>
          </div>
        </section>

        {/* ── Vision / Roadmap ─────────────────────────────────── */}
        <section id="vision" className="border-y border-border/60 bg-muted/40">
          <div className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                An operating system for distributed energy
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                V1 starts with monitoring, prediction and simulated optimization.
                The roadmap goes much further.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { version: "V2", title: "Real integration", items: "Inverter APIs · Smart meters · Real IoT telemetry · Advanced forecasting" },
                { version: "V3", title: "Scale", items: "EV charging optimization · Industrial loads · Multi-site management" },
                { version: "V4", title: "Intelligence", items: "Battery health prediction · Predictive maintenance · BESS analytics" },
                { version: "V5", title: "Grid", items: "Demand response · Virtual power plants · Energy trading" },
              ].map((phase) => (
                <Card key={phase.version}>
                  <CardHeader>
                    <span className="w-fit rounded-md bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                      {phase.version}
                    </span>
                    <CardTitle className="mt-2 text-base">{phase.title}</CardTitle>
                    <CardDescription className="leading-relaxed">{phase.items}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────── */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <Card className="border-primary/20 bg-gradient-to-br from-secondary/70 to-card">
            <CardContent className="flex flex-col items-center gap-6 py-12 text-center">
              <h2 className="max-w-xl text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Start making smarter energy decisions today
              </h2>
              <p className="max-w-xl text-muted-foreground">
                Create an account, configure your solar + battery system, and
                explore UrjaOS instantly with realistic simulated data.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link href="/register">
                    Create free account
                    <ArrowRight data-icon="inline-end" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Zap className="size-3.5" aria-hidden="true" />
            </span>
            <span className="font-semibold text-foreground">UrjaOS</span>
            <span className="text-xs">Optimize Energy. Reduce Cost. Power Smarter.</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-3.5" aria-hidden="true" />
              Decision-support platform · V1 simulation
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
