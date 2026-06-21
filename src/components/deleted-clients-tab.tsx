import Link from "next/link";

import { DeleteWithConfirm } from "@/components/delete-with-confirm";
import { CaseReferenceLabel } from "@/components/case-reference-label";
import {
  getDeletedClientServiceLabel,
  type DeletedClientRecord,
} from "@/lib/deleted-clients";
import { caseStageLabel } from "@/lib/case-stage";
import { formatVisaStatus } from "@/lib/student-tracking";

type DeletedClientsTabProps = {
  clients: DeletedClientRecord[];
  isAdmin: boolean;
  returnPath: string;
  restoreDeletedClientAction: (formData: FormData) => Promise<void>;
  permanentDeleteDeletedClientAction: (formData: FormData) => Promise<void>;
  blobOpensThroughAuthenticatedApi: boolean;
};

function documentOpenHref(studentId: string, documentId: string, storagePath: string, throughApi: boolean) {
  if (throughApi && /^https?:\/\//i.test(storagePath)) {
    return `/api/students/${studentId}/documents/${documentId}/open`;
  }
  return storagePath;
}

export function DeletedClientsTab({
  clients,
  isAdmin,
  returnPath,
  restoreDeletedClientAction,
  permanentDeleteDeletedClientAction,
  blobOpensThroughAuthenticatedApi,
}: DeletedClientsTabProps) {
  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-medium text-amber-950">Deleted Clients archive</p>
        <p className="mt-1 text-sm text-amber-900">
          Removed clients stay here with their profile, submissions, and documents.
          {isAdmin
            ? " Team members can restore a client; only administrators can permanently delete them from the system."
            : " Restore a client from here if they were removed by mistake."}
        </p>
      </div>

      {clients.length === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-sm text-slate-600">No deleted clients.</p>
      ) : (
        <ul className="space-y-4">
          {clients.map((client) => {
            const profile = client.studentProfile;
            const displayName = client.name ?? client.email;
            const deletedByLabel =
              client.deletedBy?.name ?? client.deletedBy?.email ?? "Unknown";
            const serviceLabel = getDeletedClientServiceLabel(client);

            return (
              <li key={client.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{displayName}</p>
                    <p className="text-sm text-slate-600">{client.email}</p>
                    {profile ? (
                      <p className="mt-1 text-sm text-slate-600">
                        <CaseReferenceLabel caseReference={profile.caseReference} />
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-500">
                      Deleted {client.deletedAt?.toLocaleString() ?? "—"} by {deletedByLabel}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={restoreDeletedClientAction} className="inline">
                      <input type="hidden" name="studentId" value={client.id} />
                      <input type="hidden" name="returnPath" value={returnPath} />
                      <button
                        type="submit"
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        Restore client
                      </button>
                    </form>
                    {isAdmin ? (
                      <DeleteWithConfirm
                        formAction={permanentDeleteDeletedClientAction}
                        confirmMessage={`Permanently delete ${displayName} and all related data? This cannot be undone.`}
                        buttonLabel="Delete permanently"
                        buttonClassName="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <input type="hidden" name="studentId" value={client.id} />
                        <input type="hidden" name="returnPath" value={returnPath} />
                      </DeleteWithConfirm>
                    ) : null}
                  </div>
                </div>

                {profile ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <ArchiveField label="Service type" value={serviceLabel} />
                    <ArchiveField
                      label="Case stage"
                      value={caseStageLabel(profile.caseStage)}
                    />
                    <ArchiveField label="Visa status" value={formatVisaStatus(profile.visaStatus)} />
                    <ArchiveField label="Phone" value={profile.phone ?? "—"} />
                    <ArchiveField label="Nationality" value={profile.nationality ?? "—"} />
                    <ArchiveField label="City" value={profile.city ?? "—"} />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">No client profile on file.</p>
                )}

                {client.submissions.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Submissions
                    </p>
                    <ul className="mt-2 space-y-2">
                      {client.submissions.map((submission) => (
                        <li
                          key={submission.id}
                          className="rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-700"
                        >
                          <span className="font-medium">
                            {submission.template.title}
                          </span>
                          {" · "}
                          {submission.status} · {submission.submittedAt.toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {profile && profile.assignments.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Team history
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-slate-700">
                      {profile.assignments.map((assignment) => (
                        <li key={assignment.id}>
                          {assignment.assignedTo.name ?? assignment.assignedTo.email}
                          {assignment.isActive ? " (active)" : " (ended)"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {profile && profile.tasks.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tasks ({profile.tasks.length})
                    </p>
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-slate-700">
                      {profile.tasks.map((task) => (
                        <li key={task.id}>
                          {task.title} — {task.status} ·{" "}
                          {task.assignee.name ?? task.assignee.email}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {profile && profile.documents.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Documents ({profile.documents.length})
                    </p>
                    <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                      {profile.documents.map((document) => (
                        <li
                          key={document.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{document.title}</p>
                            <p className="text-xs text-slate-600">
                              {document.category} · {document.verificationStatus} ·{" "}
                              {document.createdAt.toLocaleDateString()}
                            </p>
                          </div>
                          <Link
                            href={documentOpenHref(
                              client.id,
                              document.id,
                              document.storagePath,
                              blobOpensThroughAuthenticatedApi,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white"
                          >
                            Open
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ArchiveField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50/80 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
