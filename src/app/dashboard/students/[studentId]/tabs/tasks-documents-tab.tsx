import { DeleteWithConfirm } from "@/components/delete-with-confirm";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: Date | null;
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
};

type TasksDocumentsTabProps = {
  studentId: string;
  tasks: TaskRow[];
  documents: DocumentRow[];
  createTaskAction: (formData: FormData) => Promise<void>;
  updateTaskStatusAction: (formData: FormData) => Promise<void>;
  updateTaskChecklistAction: (formData: FormData) => Promise<void>;
  uploadStudentDocumentAction: (formData: FormData) => Promise<void>;
  updateStudentDocumentVerificationAction: (formData: FormData) => Promise<void>;
  disputeStudentDocumentReturnAction: (formData: FormData) => Promise<void>;
  uploadReplacementDocumentAction: (formData: FormData) => Promise<void>;
  deleteStudentDocumentAction: (formData: FormData) => Promise<void>;
  viewerRole: "ADMIN" | "SUB_ADMIN" | "INTERNAL_STAFF";
};

export function TasksDocumentsTab({
  studentId,
  tasks,
  documents,
  createTaskAction,
  updateTaskStatusAction,
  updateTaskChecklistAction,
  uploadStudentDocumentAction,
  updateStudentDocumentVerificationAction,
  disputeStudentDocumentReturnAction,
  uploadReplacementDocumentAction,
  deleteStudentDocumentAction,
  viewerRole,
}: TasksDocumentsTabProps) {
  return (
    <>
      <section id="tasks" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">My Tasks</h2>
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
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Create task
          </button>
        </form>
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
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Documents</h2>
        <form action={uploadStudentDocumentAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <option value="PASSPORT">PASSPORT</option>
            <option value="TRANSCRIPT">TRANSCRIPT</option>
            <option value="SOP">SOP</option>
            <option value="OFFER_LETTER">OFFER_LETTER</option>
            <option value="VISA">VISA</option>
            <option value="FINANCIAL">FINANCIAL</option>
            <option value="IDENTITY">IDENTITY</option>
            <option value="OTHER">OTHER</option>
          </select>
          <input
            name="file"
            type="file"
            required
            accept=".pdf,image/*"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-base file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Upload
          </button>
        </form>
        {documents.length === 0 ? (
          <p className="mt-4 text-base text-slate-600">No documents uploaded yet.</p>
        ) : (
          <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
            {documents.map((doc) => (
              <li key={doc.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {doc.title}
                      <span className="ml-2 text-sm font-normal text-slate-500">({doc.category})</span>
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
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={doc.storagePath}
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
                      <form action={updateStudentDocumentVerificationAction} className="flex flex-wrap items-center gap-2">
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
                        <form action={uploadReplacementDocumentAction} className="flex flex-wrap items-center gap-2">
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
                            accept=".pdf,image/*"
                            className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-900 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-xs file:font-medium file:text-emerald-800 hover:file:bg-emerald-100"
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                          >
                            Upload Replacement
                          </button>
                        </form>
                        <form action={disputeStudentDocumentReturnAction} className="flex flex-wrap items-center gap-2">
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
        )}
      </section>
    </>
  );
}
