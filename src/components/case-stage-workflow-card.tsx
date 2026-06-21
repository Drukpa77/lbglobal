"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

export type WorkflowStepView = {
  id: string;
  label: string;
  isCustom: boolean;
  hasTemplateAnchor: boolean;
  completed: boolean;
};

type DraftStep = WorkflowStepView & {
  draftId: string;
  persistedId: string | null;
};

type ServerAction = (formData: FormData) => Promise<void>;

type CaseStageWorkflowCardProps = {
  studentId: string;
  caseId: string;
  steps: WorkflowStepView[];
  currentStepId: string | null;
  currentStageLabel: string;
  currentStageToneClass: string;
  updatedAt: Date | null;
  isTerminal: boolean;
  terminalOptions: { value: string; label: string }[];
  hideStudentOnlyNote: boolean;
  saveAction: ServerAction;
  outcomeAction: ServerAction;
};

function toDraftSteps(steps: WorkflowStepView[]): DraftStep[] {
  return steps.map((step) => ({
    ...step,
    draftId: step.id,
    persistedId: step.id,
  }));
}

export function CaseStageWorkflowCard({
  studentId,
  caseId,
  steps,
  currentStepId,
  currentStageLabel,
  currentStageToneClass,
  updatedAt,
  isTerminal,
  terminalOptions,
  hideStudentOnlyNote,
  saveAction,
  outcomeAction,
}: CaseStageWorkflowCardProps) {
  const [mode, setMode] = useState<"overview" | "customise">("overview");
  const [draftSteps, setDraftSteps] = useState<DraftStep[]>(() => toDraftSteps(steps));
  const [draftCurrentId, setDraftCurrentId] = useState<string | null>(currentStepId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const overviewCurrentIndex = steps.findIndex((step) => step.id === currentStepId);
  const draftCurrentIndex = draftSteps.findIndex((step) => step.draftId === draftCurrentId);
  const templateAnchorCount = draftSteps.filter((step) => step.hasTemplateAnchor).length;

  const progressPct =
    isTerminal && currentStageLabel
      ? 100
      : overviewCurrentIndex >= 0 && steps.length > 0
        ? Math.round(((overviewCurrentIndex + 1) / steps.length) * 100)
        : 0;

  const hasDraftChanges = useMemo(() => {
    if (draftCurrentId !== currentStepId) return true;
    if (draftSteps.length !== steps.length) return true;
    return draftSteps.some((step, index) => {
      const original = steps[index];
      return (
        !original ||
        original.id !== step.persistedId ||
        original.label !== step.label
      );
    });
  }, [currentStepId, draftCurrentId, draftSteps, steps]);

  function resetDraft() {
    setDraftSteps(toDraftSteps(steps));
    setDraftCurrentId(currentStepId);
    setEditingId(null);
    setEditingLabel("");
    setIsAdding(false);
    setNewLabel("");
  }

  function openCustomise() {
    resetDraft();
    setMode("customise");
  }

  function cancelCustomise() {
    resetDraft();
    setMode("overview");
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draftSteps.findIndex((step) => step.draftId === active.id);
    const newIndex = draftSteps.findIndex((step) => step.draftId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setDraftSteps((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  function startEditing(step: DraftStep) {
    setEditingId(step.draftId);
    setEditingLabel(step.label);
  }

  function saveRename(stepId: string) {
    const trimmed = editingLabel.trim();
    setEditingId(null);
    if (!trimmed) return;
    setDraftSteps((prev) =>
      prev.map((step) =>
        step.draftId === stepId ? { ...step, label: trimmed } : step,
      ),
    );
  }

  function handleAdd() {
    const trimmed = newLabel.trim();
    if (!trimmed) {
      setIsAdding(false);
      return;
    }
    const draftId = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setDraftSteps((prev) => [
      ...prev,
      {
        id: draftId,
        draftId,
        persistedId: null,
        label: trimmed,
        isCustom: true,
        hasTemplateAnchor: false,
        completed: false,
      },
    ]);
    setIsAdding(false);
    setNewLabel("");
  }

  function handleRemove(stepId: string) {
    const step = draftSteps.find((item) => item.draftId === stepId);
    if (!step) return;
    const canRemove =
      draftSteps.length > 1 &&
      (!step.hasTemplateAnchor || templateAnchorCount > 1);
    if (!canRemove) return;

    const removeIndex = draftSteps.findIndex((item) => item.draftId === stepId);
    const nextCurrentId =
      draftCurrentId === stepId
        ? draftSteps[removeIndex - 1]?.draftId ??
          draftSteps[removeIndex + 1]?.draftId ??
          null
        : draftCurrentId;

    setDraftSteps((prev) => prev.filter((item) => item.draftId !== stepId));
    setDraftCurrentId(nextCurrentId);
  }

  function saveCustomisation() {
    const stepsToSave =
      editingId && editingLabel.trim()
        ? draftSteps.map((step) =>
            step.draftId === editingId
              ? { ...step, label: editingLabel.trim() }
              : step,
          )
        : draftSteps;
    const formData = new FormData();
    formData.set("studentId", studentId);
    formData.set("caseId", caseId);
    formData.set("currentStepDraftId", draftCurrentId ?? "");
    formData.set(
      "steps",
      JSON.stringify(
        stepsToSave.map((step) => ({
          draftId: step.draftId,
          id: step.persistedId,
          label: step.label,
        })),
      ),
    );
    startTransition(async () => {
      await saveAction(formData);
      setMode("overview");
    });
  }

  if (mode === "overview") {
    return (
      <section
        id="case-stage"
        className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Case Stage</h2>
            <p className="mt-1 text-sm text-slate-600">
              Track this client&apos;s position in the visa workflow.
              {hideStudentOnlyNote
                ? " Study-only stages are hidden for this service type."
                : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${currentStageToneClass}`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
              {currentStageLabel}
            </span>
            <button
              type="button"
              onClick={openCustomise}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Customise
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Linear progress</span>
            <span>
              {isTerminal
                ? "Outcome"
                : overviewCurrentIndex >= 0
                  ? `Step ${overviewCurrentIndex + 1} of ${steps.length}`
                  : "No current step"}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${
                isTerminal && currentStageLabel !== "Visa Grant"
                  ? "bg-rose-500"
                  : "bg-gradient-to-r from-rose-500 to-blue-500"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {steps.map((step, index) => {
              const isCurrent = step.id === currentStepId && !isTerminal;
              const isPast =
                !isTerminal && overviewCurrentIndex >= 0 && overviewCurrentIndex > index;
              return (
                <span
                  key={step.id}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    isCurrent
                      ? currentStageToneClass
                      : isPast
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  {step.label}
                </span>
              );
            })}
          </div>
        </div>

        {updatedAt ? (
          <p className="mt-3 text-xs text-slate-500">
            Stage last updated: {updatedAt.toLocaleString()}
          </p>
        ) : null}

        <div className="mt-6 border-t border-slate-100 pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Record an outcome
          </p>
          <form
            action={outcomeAction}
            className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]"
          >
            <input type="hidden" name="studentId" value={studentId} />
            <select
              name="caseStage"
              defaultValue={terminalOptions[0]?.value ?? ""}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              {terminalOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Set outcome
            </button>
          </form>
        </div>
      </section>
    );
  }

  return (
    <section
      id="case-stage"
      className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Customise Workflow</h2>
          <p className="mt-1 text-sm text-slate-600">
            Reorder, rename, add, remove, and choose the current step. Changes
            apply when you save.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={cancelCustomise}
            disabled={isPending}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveCustomisation}
            disabled={isPending || !hasDraftChanges}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Progress preview</span>
          <span>
            {draftCurrentIndex >= 0
              ? `Step ${draftCurrentIndex + 1} of ${draftSteps.length}`
              : "No current step"}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-blue-500 transition-all"
            style={{
              width:
                draftCurrentIndex >= 0 && draftSteps.length > 0
                  ? `${Math.round(((draftCurrentIndex + 1) / draftSteps.length) * 100)}%`
                  : "0%",
            }}
          />
        </div>
      </div>

      <div className={`mt-5 ${isPending ? "opacity-70" : ""}`}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={draftSteps.map((step) => step.draftId)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {draftSteps.map((step, index) => (
                <SortableStepRow
                  key={step.draftId}
                  step={step}
                  index={index}
                  isCurrent={step.draftId === draftCurrentId}
                  isEditing={editingId === step.draftId}
                  editingLabel={editingLabel}
                  canRemove={
                    draftSteps.length > 1 &&
                    (!step.hasTemplateAnchor || templateAnchorCount > 1)
                  }
                  onEditChange={setEditingLabel}
                  onStartEditing={() => startEditing(step)}
                  onSaveRename={() => saveRename(step.draftId)}
                  onCancelEditing={() => setEditingId(null)}
                  onSetCurrent={() => setDraftCurrentId(step.draftId)}
                  onRemove={() => handleRemove(step.draftId)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {isAdding ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              autoFocus
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAdd();
                }
                if (event.key === "Escape") {
                  setIsAdding(false);
                  setNewLabel("");
                }
              }}
              placeholder="New step name"
              maxLength={120}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewLabel("");
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50"
          >
            <Plus size={16} /> Add step
          </button>
        )}
      </div>
    </section>
  );
}

function SortableStepRow({
  step,
  index,
  isCurrent,
  isEditing,
  editingLabel,
  canRemove,
  onEditChange,
  onStartEditing,
  onSaveRename,
  onCancelEditing,
  onSetCurrent,
  onRemove,
}: {
  step: DraftStep;
  index: number;
  isCurrent: boolean;
  isEditing: boolean;
  editingLabel: string;
  canRemove: boolean;
  onEditChange: (value: string) => void;
  onStartEditing: () => void;
  onSaveRename: () => void;
  onCancelEditing: () => void;
  onSetCurrent: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.draftId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as const;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
        isCurrent
          ? "border-rose-300 bg-rose-50"
          : step.completed
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-slate-200 bg-white"
      } ${isDragging ? "opacity-60 shadow-md" : ""}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-slate-400 hover:text-slate-600"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>

      <span
        className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] font-semibold ${
          step.completed
            ? "bg-emerald-500 text-white"
            : isCurrent
              ? "bg-rose-500 text-white"
              : "bg-slate-200 text-slate-600"
        }`}
      >
        {step.completed ? <Check size={13} /> : index + 1}
      </span>

      {isEditing ? (
        <input
          autoFocus
          value={editingLabel}
          onChange={(event) => onEditChange(event.target.value)}
          onBlur={onSaveRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSaveRename();
            }
            if (event.key === "Escape") {
              onCancelEditing();
            }
          }}
          maxLength={120}
          className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
        />
      ) : (
        <span className="flex-1 font-medium text-slate-800">
          {step.label}
          {step.isCustom ? (
            <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
              Custom
            </span>
          ) : null}
        </span>
      )}

      <div className="flex flex-none items-center gap-1">
        {!isCurrent ? (
          <button
            type="button"
            onClick={onSetCurrent}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            title="Mark as current step"
          >
            Set current
          </button>
        ) : (
          <span className="rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
            Current
          </span>
        )}
        {isEditing ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onSaveRename}
            className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
            title="Save name"
          >
            <Check size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartEditing}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Rename step"
          >
            <Pencil size={14} />
          </button>
        )}
        {isEditing ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onCancelEditing}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Cancel rename"
          >
            <X size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
            title={canRemove ? "Remove step" : "A case must keep at least one reporting stage"}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </li>
  );
}
