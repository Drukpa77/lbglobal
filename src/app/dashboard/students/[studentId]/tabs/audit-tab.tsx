type ActivityRow = {
  id: string;
  action: string;
  createdAt: Date;
  actor: {
    name: string | null;
    email: string;
  };
};

export function AuditTab({ activityLogs }: { activityLogs: ActivityRow[] }) {
  return (
    <section id="audit" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Audit Log</h2>
      <p className="mt-1 text-sm text-slate-600">
        History of changes on this client profile. See who did what and when.
      </p>
      {activityLogs.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">No activity recorded yet.</p>
      ) : (
        <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
          {activityLogs.map((activity) => (
            <li key={activity.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <p className="text-sm font-medium text-slate-900">{activity.action}</p>
              <p className="mt-1 text-xs text-slate-500">
                <span className="font-medium">{activity.actor.name ?? activity.actor.email}</span>
                <span className="mx-1.5">·</span>
                <span>{activity.createdAt.toLocaleString()}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
