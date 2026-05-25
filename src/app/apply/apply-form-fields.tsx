import { getUpcomingIntakeOptions } from "@/lib/intake-options";
import type { QuestionnaireQuestion } from "@/lib/questionnaire";

const inputClass =
  "mt-1 w-full rounded-md border border-rose-200/50 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const NOTE_IDS = new Set([
  "additionalNote",
  "additionalNotes",
  "note",
  "notes",
  "comment",
  "comments",
]);

export function ApplyFormFields({
  questions,
  prioritizedCountries,
}: {
  questions: QuestionnaireQuestion[];
  prioritizedCountries: readonly string[];
}) {
  const hearFromQuestion = questions.find((q) => q.id === "hearFrom");
  const additionalNoteQuestion = questions.find((q) => NOTE_IDS.has(q.id));
  const normalQuestions = questions.filter(
    (q) => q.id !== "hearFrom" && !NOTE_IDS.has(q.id),
  );

  function renderQuestion(q: QuestionnaireQuestion) {
    const isRequired = q.required !== false;
    const name = q.id;

    if (q.type === "textarea") {
      return (
        <label key={q.id} className="block text-sm font-medium text-slate-700">
          {q.label}
          {isRequired && " *"}
          <textarea
            name={name}
            required={isRequired}
            placeholder={q.placeholder}
            rows={4}
            className={inputClass}
          />
        </label>
      );
    }

    if (q.type === "select") {
      const options =
        q.id === "country"
          ? prioritizedCountries
          : q.id === "preferredIntake"
            ? getUpcomingIntakeOptions()
            : (q.options ?? []);

      return (
        <label key={q.id} className="block text-sm font-medium text-slate-700">
          {q.label}
          {isRequired && " *"}
          <select
            name={name}
            required={isRequired}
            defaultValue=""
            className={inputClass}
          >
            <option value="" disabled>
              Select...
            </option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
    }

    const inputType = q.id === "email" ? "email" : q.id === "phone" ? "tel" : "text";
    return (
      <label key={q.id} className="block text-sm font-medium text-slate-700">
        {q.label}
        {isRequired && " *"}
        <input
          name={name}
          type={inputType}
          required={isRequired}
          placeholder={q.placeholder}
          minLength={q.id === "fullName" ? 2 : undefined}
          maxLength={q.id === "fullName" ? 100 : q.id === "phone" ? 25 : undefined}
          className={inputClass}
        />
      </label>
    );
  }

  return (
    <>
      {normalQuestions.map(renderQuestion)}

      {(hearFromQuestion || additionalNoteQuestion) && (
        <div className="rounded-xl border border-blue-100/70 bg-blue-50/40 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Final details
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {hearFromQuestion ? renderQuestion(hearFromQuestion) : null}
            {additionalNoteQuestion ? renderQuestion(additionalNoteQuestion) : null}
          </div>
          <p className="mt-2 text-xs text-slate-600">
            If you choose <span className="font-semibold">Other</span> for referral source, please explain it in Additional note.
          </p>
        </div>
      )}
    </>
  );
}
