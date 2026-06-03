import { DeleteWithConfirm } from "@/components/delete-with-confirm";
import { FileSizeLimitedForm } from "@/components/file-size-limited-form";
import type { TaskAssigneeOption } from "@/lib/task-assignment";
import { MAX_STUDENT_DOCUMENT_UPLOAD_MB } from "@/lib/upload-limits";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: Date | null;
  assignee: {
    id: string;
    name: string | null;
    email: string;
  };
  completedBy: {
    name: string | null;
    email: string;
  } | null;
  completedAt: Date | null;
};

type DocumentRow = {
  id: string;
  title: string;
  category: string;
  storagePath: string;
  verificationStatus: string;
  notes: string | null;
  returnedAt: Date | null;
  returnedNote: string | null;
  returnResolvedAt: Date | null;
  returnedBy: {
    name: string | null;
    email: string;
  } | null;
  uploadedBy: {
    name: string | null;
    email: string;
  };
  previousVersions?: PreviousDocumentVersion[];
};

type PreviousDocumentVersion = {
  id: string;
  title: string;
  storagePath: string;
  verificationStatus: string;
  returnedAt: Date | null;
  returnedNote: string | null;
  returnedBy: {
    name: string | null;
    email: string;
  } | null;
  uploadedBy: {
    name: string | null;
    email: string;
  };
  createdAt: Date;
};

const DOCUMENT_CATEGORY_ORDER = [
  "PASSPORT",
  "IDENTITY",
  "TRANSCRIPT",
  "SOP",
  "OFFER_LETTER",
  "VISA",
  "FINANCIAL",
  "OTHER",
] as const;

const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  PASSPORT: "Asset",
  IDENTITY: "Identity",
  TRANSCRIPT: "Transcripts",
  SOP: "Statement of Purpose",
  OFFER_LETTER: "Offer Letters",
  VISA: "Visa",
  FINANCIAL: "Financial",
  OTHER: "Other",
};

const DOCUMENT_CATEGORY_BADGE_CLASSES: Record<string, string> = {
  PASSPORT: "bg-indigo-50 text-indigo-700 border-indigo-200",
  IDENTITY: "bg-amber-50 text-amber-800 border-amber-200",
  TRANSCRIPT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SOP: "bg-purple-50 text-purple-700 border-purple-200",
  OFFER_LETTER: "bg-blue-50 text-blue-700 border-blue-200",
  VISA: "bg-cyan-50 text-cyan-700 border-cyan-200",
  FINANCIAL: "bg-rose-50 text-rose-700 border-rose-200",
  OTHER: "bg-slate-100 text-slate-700 border-slate-200",
};

function getCategoryLabel(category: string) {
  return DOCUMENT_CATEGORY_LABELS[category] ?? category;
}

function getCategoryBadgeClasses(category: string) {
  return (
    DOCUMENT_CATEGORY_BADGE_CLASSES[category] ??
    DOCUMENT_CATEGORY_BADGE_CLASSES.OTHER
  );
}

function groupDocumentsByCategory(documents: DocumentRow[]) {
  const groups = new Map<string, DocumentRow[]>();
  for (const doc of documents) {
    const key = doc.category in DOCUMENT_CATEGORY_LABELS ? doc.category : "OTHER";
    const existing = groups.get(key);
    if (existing) {
      existing.push(doc);
    } else {
      groups.set(key, [doc]);
    }
  }
  const ordered: { category: string; documents: DocumentRow[] }[] = [];
  for (const category of DOCUMENT_CATEGORY_ORDER) {
    const docs = groups.get(category);
    if (docs && docs.length > 0) {
      ordered.push({ category, documents: docs });
    }
  }
  for (const [category, docs] of groups.entries()) {
    if (!DOCUMENT_CATEGORY_ORDER.includes(category as (typeof DOCUMENT_CATEGORY_ORDER)[number])) {
      ordered.push({ category, documents: docs });
    }
  }
  return ordered;
}

type TasksDocumentsTabProps = {
  studentId: string;
  tasks: TaskRow[];
  documents: DocumentRow[];
  taskAssigneeOptions: TaskAssigneeOption[];
  createTaskAction: (formData: FormData) => Promise<void>;
  reassignTaskAction: (formData: FormData) => Promise<void>;
  updateTaskStatusAction: (formData: FormData) => Promise<void>;
  updateTaskChecklistAction: (formData: FormData) => Promise<void>;
  uploadStudentDocumentAction: (formData: FormData) => Promise<void>;
  updateStudentDocumentVerificationAction: (formData: FormData) => Promise<void>;
  disputeStudentDocumentReturnAction: (formData: FormData) => Promise<void>;
  uploadReplacementDocumentAction: (formData: FormData) => Promise<void>;
  deleteStudentDocumentAction: (formData: FormData) => Promise<void>;
  viewerRole: "ADMIN" | "SUB_ADMIN" | "INTERNAL_STAFF";
  canCreateTasks: boolean;
  /** When true, HTTPS blob links use the authenticated API proxy (private Blob stores). */
  blobOpensThroughAuthenticatedApi: boolean;
};

function TaskAssigneePicker({
  options,
  name = "assigneeId",
  defaultAssigneeId,
  className,
}: {
  options: TaskAssigneeOption[];
  name?: string;
  defaultAssigneeId?: string;
  className?: string;
}) {
  const caseManagers = options.filter((option) => option.role === "INTERNAL_STAFF");
  const agents = options.filter((option) => option.role === "SUB_ADMIN");

  return (
    <select
      name={name}
      required
      defaultValue={defaultAssigneeId ?? ""}
      className={
        className ??
        "rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
      }
    >
      <option value="" disabled>
        Assign to
      </option>
      {caseManagers.length > 0 ? (
        <optgroup label="Case managers">
          {caseManagers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name ?? member.email}
            </option>
          ))}
        </optgroup>
      ) : null}
      {agents.length > 0 ? (
        <optgroup label="Agents">
          {agents.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name ?? member.email}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}

function documentOpenHref(
  studentId: string,
  documentId: string,
  storagePath: string,
  throughApi: boolean,
): string {
  if (throughApi && /^https?:\/\//i.test(storagePath)) {
    return `/api/students/${studentId}/documents/${documentId}/open`;
  }
  return storagePath;
}

export function TasksDocumentsTab({
  studentId,
  tasks,
  documents,
  taskAssigneeOptions,
  createTaskAction,
  reassignTaskAction,
  updateTaskStatusAction,
  updateTaskChecklistAction,
  uploadStudentDocumentAction,
  updateStudentDocumentVerificationAction,
  disputeStudentDocumentReturnAction,
  uploadReplacementDocumentAction,
  deleteStudentDocumentAction,
  viewerRole,
  canCreateTasks,
  blobOpensThroughAuthenticatedApi,
}: TasksDocumentsTabProps) {
  return (
    <>
      <section id="tasks" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Case Tasks</h2>
        {canCreateTasks ? (
          <form action={createTaskAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="studentId" value={studentId} />
            <input
              name="title"
              required
              placeholder="Task title"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 lg:col-span-2"
            />
            <input
              name="description"
              placeholder="Task description (optional)"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 lg:col-span-2"
            />
            <select
              name="priority"
              defaultValue="MEDIUM"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="LOW">Low priority</option>
              <option value="MEDIUM">Medium priority</option>
              <option value="HIGH">High priority</option>
              <option value="URGENT">Urgent</option>
            </select>
            <TaskAssigneePicker options={taskAssigneeOptions} />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Create task
            </button>
          </form>
        ) : viewerRole === "INTERNAL_STAFF" ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            You are not assigned to this client. Ask an administrator or case manager to assign you before you can create tasks here.
          </p>
        ) : null}
        <div className="mt-4">
          <form
            id="task-checklist-form"
            action={updateTaskChecklistAction}
            className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
          >
            <input type="hidden" name="studentId" value={studentId} />
            <p className="text-xs font-medium text-slate-600">Select tasks and apply status</p>
            <select
              name="status"
              defaultValue="DONE"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="DONE">Mark selected as DONE</option>
              <option value="IN_PROGRESS">Mark selected as IN_PROGRESS</option>
              <option value="BLOCKED">Mark selected as BLOCKED</option>
              <option value="TODO">Mark selected as TODO</option>
            </select>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Apply to Selected Tasks
            </button>
          </form>

          {tasks.length === 0 ? (
            <p className="text-base text-slate-600">No tasks yet.</p>
          ) : (
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {tasks.map((task) => (
                <article key={task.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="taskIds"
                        value={task.id}
                        form="task-checklist-form"
                        className="mt-1.5 h-4 w-4 rounded border-slate-300"
                      />
                      <div>
                        <p className="font-medium text-slate-900">{task.title}</p>
                        <p className="mt-0.5 text-sm text-slate-600">
                          Priority: {task.priority} · {task.status}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Due: {task.dueDate ? task.dueDate.toLocaleDateString() : "No due date"}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Owner: {task.assignee.name ?? task.assignee.email}
                          {task.completedBy ? (
                            <>
                              {" "}
                              | Completed by {task.completedBy.name ?? task.completedBy.email}
                              {task.completedAt ? ` on ${task.completedAt.toLocaleDateString()}` : ""}
                            </>
                          ) : null}
                        </p>
                        {task.description ? (
                          <p className="mt-1 text-sm text-slate-600">{task.description}</p>
                        ) : null}
                      </div>
                    </div>
                    <form action={updateTaskStatusAction} className="flex items-center gap-2">
                      <input type="hidden" name="taskId" value={task.id} />
                      <select
                        name="status"
                        defaultValue={task.status}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                      >
                        <option value="TODO">To Do</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="BLOCKED">Blocked</option>
                        <option value="DONE">Done</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Update
                      </button>
                    </form>
                  </div>
                  {canCreateTasks ? (
                    <form action={reassignTaskAction} className="mt-3 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="taskId" value={task.id} />
                      <span className="text-xs font-medium text-slate-600">Reassign to</span>
                      <TaskAssigneePicker
                        options={taskAssigneeOptions}
                        defaultAssigneeId={task.assignee.id}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Reassign
                      </button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Documents</h2>
        <p className="mt-1 text-sm text-slate-600">
          PDF, Word document, or image, up to about {MAX_STUDENT_DOCUMENT_UPLOAD_MB} MB per file (hosted upload limit).
        </p>
        <FileSizeLimitedForm
          action={uploadStudentDocumentAction}
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input type="hidden" name="studentId" value={studentId} />
          <input
            name="title"
            required
            placeholder="Document title"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
          <select
            name="category"
            defaultValue="OTHER"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          >
            {DOCUMENT_CATEGORY_ORDER.map((category) => (
              <option key={category} value={category}>
                {getCategoryLabel(category)}
              </option>
            ))}
          </select>
          <input
            name="file"
            type="file"
            required
            accept=".pdf,.doc,.docx,image/*"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-base file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Upload
          </button>
        </FileSizeLimitedForm>
        {documents.length === 0 ? (
          <p className="mt-4 text-base text-slate-600">No documents uploaded yet.</p>
        ) : (
          <div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto pr-1">
            {groupDocumentsByCategory(documents).map(({ category, documents: groupDocs }) => (
              <details
                key={category}
                open
                className="group rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="text-slate-400 transition-transform group-open:rotate-90"
                    >
                      &#x25B6;
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${getCategoryBadgeClasses(
                        category,
                      )}`}
                    >
                      {getCategoryLabel(category)}
                    </span>
                    <span className="text-sm text-slate-500">
                      {groupDocs.length} {groupDocs.length === 1 ? "document" : "documents"}
                    </span>
                  </div>
                </summary>
                <ul className="space-y-3 border-t border-slate-100 px-4 py-3">
                  {groupDocs.map((doc) => (
                    <li key={doc.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">
                            {doc.title}
                            <span
                              className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${getCategoryBadgeClasses(
                                doc.category,
                              )}`}
                            >
                              {getCategoryLabel(doc.category)}
                            </span>
                            {doc.previousVersions && doc.previousVersions.length > 0 ? (
                              <span className="ml-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                                Revised
                                {doc.previousVersions.length > 1 ? ` x${doc.previousVersions.length}` : ""}
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-sm text-slate-600">
                            Uploaded by {doc.uploadedBy.name ?? doc.uploadedBy.email} · {doc.verificationStatus}
                          </p>
                          {doc.notes ? (
                            <p className="mt-1 text-xs text-slate-600">Verification note: {doc.notes}</p>
                          ) : null}
                          {doc.returnedAt ? (
                            <p className="mt-1 text-xs text-amber-700">
                              Returned by {doc.returnedBy?.name ?? doc.returnedBy?.email ?? "Sub-admin"} on{" "}
                              {doc.returnedAt.toLocaleString()}
                              {doc.returnedNote ? ` - ${doc.returnedNote}` : ""}
                            </p>
                          ) : null}
                          {doc.previousVersions && doc.previousVersions.length > 0 ? (
                            <details className="mt-2 rounded-lg border border-slate-200 bg-white">
                              <summary className="cursor-pointer list-none px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                                <span className="text-slate-400">&#x25B6; </span>
                                View previous {doc.previousVersions.length === 1 ? "version" : `${doc.previousVersions.length} versions`}
                              </summary>
                              <ol className="space-y-2 border-t border-slate-100 px-3 py-2">
                                {doc.previousVersions.map((prev, index) => (
                                  <li
                                    key={prev.id}
                                    className="rounded-md border border-slate-100 bg-slate-50/60 p-2 text-xs text-slate-600"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="font-medium text-slate-700">
                                          v{doc.previousVersions!.length - index}: {prev.title}
                                        </p>
                                        <p className="mt-0.5">
                                          Uploaded by {prev.uploadedBy.name ?? prev.uploadedBy.email} on{" "}
                                          {prev.createdAt.toLocaleString()} ·{" "}
                                          <span className="font-medium">{prev.verificationStatus}</span>
                                        </p>
                                        {prev.returnedAt ? (
                                          <p className="mt-0.5 text-amber-700">
                                            Returned by{" "}
                                            {prev.returnedBy?.name ?? prev.returnedBy?.email ?? "Sub-admin"} on{" "}
                                            {prev.returnedAt.toLocaleString()}
                                            {prev.returnedNote ? ` - ${prev.returnedNote}` : ""}
                                          </p>
                                        ) : null}
                                      </div>
                                      <a
                                        href={documentOpenHref(
                                          studentId,
                                          prev.id,
                                          prev.storagePath,
                                          blobOpensThroughAuthenticatedApi,
                                        )}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                      >
                                        Open
                                      </a>
                                    </div>
                                  </li>
                                ))}
                              </ol>
                            </details>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={documentOpenHref(
                              studentId,
                              doc.id,
                              doc.storagePath,
                              blobOpensThroughAuthenticatedApi,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Open
                          </a>
                          {(viewerRole === "INTERNAL_STAFF" || viewerRole === "ADMIN") && (
                            <form action={updateStudentDocumentVerificationAction} className="flex items-center gap-2">
                              <input type="hidden" name="studentId" value={studentId} />
                              <input type="hidden" name="documentId" value={doc.id} />
                              <select
                                name="status"
                                defaultValue={doc.verificationStatus}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                              >
                                <option value="PENDING">PENDING</option>
                                <option value="VERIFIED">VERIFIED</option>
                                <option value="REJECTED">REJECTED</option>
                              </select>
                              <input
                                name="note"
                                placeholder="Note (optional)"
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                              />
                              <button
                                type="submit"
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Save
                              </button>
                            </form>
                          )}
                          {viewerRole === "SUB_ADMIN" && doc.verificationStatus === "VERIFIED" && (
                            <form
                              action={updateStudentDocumentVerificationAction}
                              className="flex flex-wrap items-center gap-2"
                            >
                              <input type="hidden" name="studentId" value={studentId} />
                              <input type="hidden" name="documentId" value={doc.id} />
                              <input type="hidden" name="mode" value="reverse" />
                              <select
                                name="status"
                                defaultValue="PENDING"
                                className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                              >
                                <option value="PENDING">Return to PENDING</option>
                                <option value="REJECTED">Return to REJECTED</option>
                              </select>
                              <input
                                name="note"
                                required
                                placeholder="Mandatory return note"
                                className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-900 placeholder:text-amber-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                              />
                              <button
                                type="submit"
                                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
                              >
                                Reverse
                              </button>
                            </form>
                          )}
                          {viewerRole === "INTERNAL_STAFF" &&
                          doc.returnedAt &&
                          !doc.returnResolvedAt &&
                          doc.returnedBy && (
                            <>
                              <FileSizeLimitedForm
                                action={uploadReplacementDocumentAction}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <input type="hidden" name="studentId" value={studentId} />
                                <input type="hidden" name="documentId" value={doc.id} />
                                <input
                                  name="title"
                                  placeholder="Replacement title (optional)"
                                  className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-900 placeholder:text-emerald-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                                />
                                <input
                                  name="file"
                                  type="file"
                                  required
                                  accept=".pdf,.doc,.docx,image/*"
                                  className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-900 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-xs file:font-medium file:text-emerald-800 hover:file:bg-emerald-100"
                                />
                                <button
                                  type="submit"
                                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                                >
                                  Upload Replacement
                                </button>
                              </FileSizeLimitedForm>
                              <form
                                action={disputeStudentDocumentReturnAction}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <input type="hidden" name="studentId" value={studentId} />
                                <input type="hidden" name="documentId" value={doc.id} />
                                <input
                                  name="note"
                                  required
                                  placeholder="Dispute note to sub-admin"
                                  className="rounded-lg border border-blue-300 px-3 py-1.5 text-sm text-blue-900 placeholder:text-blue-500 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                />
                                <button
                                  type="submit"
                                  className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100"
                                >
                                  Dispute Return
                                </button>
                              </form>
                            </>
                          )}
                          <DeleteWithConfirm
                            formAction={deleteStudentDocumentAction}
                            confirmMessage={`Delete "${doc.title}"? This cannot be undone.`}
                            buttonLabel="Delete"
                            buttonClassName="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                          >
                            <input type="hidden" name="studentId" value={studentId} />
                            <input type="hidden" name="documentId" value={doc.id} />
                          </DeleteWithConfirm>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
