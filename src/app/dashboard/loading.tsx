export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-2" aria-busy="true" aria-label="Loading dashboard">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
      <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}
