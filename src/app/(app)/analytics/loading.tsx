export default function AnalyticsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading analytics">
      <div>
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted" />
      </div>

      <div className="h-11 w-full max-w-xl animate-pulse rounded-xl bg-muted" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-4">
            <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-28 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-xl border border-border" />
        <div className="h-80 animate-pulse rounded-xl border border-border" />
      </div>

      <div className="h-48 animate-pulse rounded-xl border border-border" />
    </div>
  );
}
