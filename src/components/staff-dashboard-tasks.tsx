import Link from "next/link";

import type { TaskAssigneeOption } from "@/lib/task-assignment";

type DashboardTask = {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate: Date | null;
  assigneeId: string;
  assignee: { name: string | null; email: string };
  studentProfile: {
    user: { id: string; name: string | null; email: string };
  };
};

type StaffDashboardTasksProps = {
  tasks: DashboardTask[];
  assigneeOptions: TaskAssigneeOption[];
  bulkUpdateTasksAction: (formData: FormData) => Promise<void>;
  reassignTaskAction: (formData: FormData) => Promise<void>;
  updateTaskStatusAction: (formData: FormData) => Promise<void>;
  returnTab: string;
};

function taskStatusTone(status: string) {
  if (status === "DONE") return "bg-emerald-50 text-emerald-700";
  if (status === "IN_PROGRESS") return "bg-blue-50 text-blue-700";
  if (status === "BLOCKED") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function AssigneeSelect({
  assigneeOptions,
  defaultAssigneeId,
  name = "assigneeId",
}: {
  assigneeOptions: TaskAssigneeOption[];
  defaultAssigneeId?: string;
  name?: string;
}) {
  const caseManagers = assigneeOptions.filter((option) => option.role === "INTERNAL_STAFF");
  const agents = assigneeOptions.filter((option) => option.role === "SUB_ADMIN");

  return (
    <select
      name={name}
      required
      defaultValue={defaultAssigneeId ?? ""}
      className="min-w-48 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
    >
      <option value="" disabled>
        Select assignee
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

export function StaffDashboardTasks({
  tasks,
  assigneeOptions,
  bulkUpdateTasksAction,
  reassignTaskAction,
  updateTaskStatusAction,
  returnTab,
}: StaffDashboardTasksProps) {
  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="text-sm font-semibold">My Tasks</h2>
      <p className="mt-1 text-xs text-gray-600">
        Assign tasks to case managers or agents on your team. Everyone involved is notified when ownership changes.
      </p>
      {tasks.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600">No tasks assigned.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <form
            id="staff-dashboard-task-bulk-form"
            action={bulkUpdateTasksAction}
            className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2"
          >
            <input type="hidden" name="returnTab" value={returnTab} />
            <select
              name="status"
              required
              defaultValue="DONE"
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
            >
              <option value="DONE">Mark selected as DONE</option>
              <option value="IN_PROGRESS">Mark selected as IN_PROGRESS</option>
              <option value="BLOCKED">Mark selected as BLOCKED</option>
              <option value="TODO">Mark selected as TODO</option>
            </select>
            <button
              type="submit"
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800"
            >
              Apply to Selected Tasks
            </button>
          </form>
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-md border border-gray-200 p-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name="taskIds"
                    value={task.id}
                    form="staff-dashboard-task-bulk-form"
                    className="mt-1 h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-gray-600">
                          {task.priority} · {task.studentProfile.user.name ?? task.studentProfile.user.email}
                        </p>
                        <p className="mt-1 text-xs text-gray-700">
                          Assigned to: {task.assignee.name ?? task.assignee.email}
                        </p>
                        <p className="text-xs text-gray-700">
                          Due: {task.dueDate ? task.dueDate.toLocaleDateString() : "No due date"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${taskStatusTone(task.status)}`}
                      >
                        {task.status}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <form action={reassignTaskAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="returnTab" value={returnTab} />
                        <AssigneeSelect
                          assigneeOptions={assigneeOptions}
                          defaultAssigneeId={task.assigneeId}
                        />
                        <button
                          type="submit"
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800"
                        >
                          Reassign
                        </button>
                      </form>
                      <form action={updateTaskStatusAction} className="flex items-center gap-2">
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="returnTab" value={returnTab} />
                        <select
                          name="status"
                          defaultValue={task.status}
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="TODO">TODO</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="BLOCKED">BLOCKED</option>
                          <option value="DONE">DONE</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium"
                        >
                          Update
                        </button>
                      </form>
                      <Link
                        href={`/dashboard/students/${task.studentProfile.user.id}?tab=tasks`}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700"
                      >
                        Open Client
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
