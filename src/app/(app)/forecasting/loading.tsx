/** Route-level loading skeleton (matches the app's pulse convention). */
export default function ForecastingLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-11 w-full max-w-xl animate-pulse rounded-xl bg-muted" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-44 animate-pulse rounded-xl bg-muted" />
        <div className="h-44 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
