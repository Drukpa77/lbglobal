"use client";

import { useState } from "react";

type Message = {
  id: string;
  content: string;
  senderId: string;
  createdAt: Date | string;
  sender: { id: string; name: string | null; email: string | null };
};

type Props = {
  message: Message;
  currentUserId: string;
  canEditAny: boolean;
  studentId: string;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

export function StudentNoteItem({
  message,
  currentUserId,
  canEditAny,
  studentId,
  updateAction,
  deleteAction,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const canEdit = canEditAny || message.senderId === currentUserId;

  if (isEditing) {
    return (
      <li className="rounded-lg border border-rose-200 bg-white px-3 py-2">
        <form action={updateAction} className="space-y-2">
          <input type="hidden" name="messageId" value={message.id} />
          <input type="hidden" name="studentId" value={studentId} />
          <textarea
            name="content"
            required
            defaultValue={message.content}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-900">{message.content}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {message.sender.name ?? message.sender.email} · {new Date(message.createdAt).toLocaleString()}
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
            >
              Edit
            </button>
            <form
              action={deleteAction}
              data-confirm-submit="true"
              onSubmit={(e) => {
                if (!confirm("Delete this note?")) e.preventDefault();
              }}
              className="inline"
            >
              <input type="hidden" name="messageId" value={message.id} />
              <input type="hidden" name="studentId" value={studentId} />
              <button
                type="submit"
                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
              >
                Delete
              </button>
            </form>
          </div>
        )}
      </div>
    </li>
  );
}
