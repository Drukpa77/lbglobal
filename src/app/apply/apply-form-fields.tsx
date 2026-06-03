"use client";

import { useMemo, useState } from "react";

import { getUpcomingIntakeOptions } from "@/lib/intake-options";
import type { QuestionnaireQuestion } from "@/lib/questionnaire";
import {
  ENGLISH_TEST_TYPES,
  isOtherVisaService,
  isStudentVisaService,
  OTHER_SERVICE_DESCRIPTION_KEY,
  STUDENT_ONLY_QUESTION_IDS,
  VISA_SERVICE_OPTIONS,
} from "@/lib/visa-services";

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

const EDUCATION_LEVEL_OPTIONS = [
  "+2 / High School",
  "Diploma",
  "Bachelors",
  "Masters",
  "Other",
] as const;

export function ApplyFormFields({
  questions,
  prioritizedCountries,
}: {
  questions: QuestionnaireQuestion[];
  prioritizedCountries: readonly string[];
}) {
  const [visaServiceType, setVisaServiceType] = useState("");
  const showStudentFields = isStudentVisaService(visaServiceType);
  const showOtherServiceField = isOtherVisaService(visaServiceType);

  const hearFromQuestion = questions.find((q) => q.id === "hearFrom");
  const additionalNoteQuestion = questions.find((q) => NOTE_IDS.has(q.id));
  const normalQuestions = useMemo(
    () =>
      questions.filter(
        (q) =>
          q.id !== "hearFrom" &&
          !NOTE_IDS.has(q.id) &&
          q.id !== "visaServiceType" &&
          !STUDENT_ONLY_QUESTION_IDS.has(q.id),
      ),
    [questions],
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
      <label className="block text-sm font-medium text-slate-700">
        Service required *
        <select
          name="visaServiceType"
          required
          value={visaServiceType}
          onChange={(event) => setVisaServiceType(event.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            Select a service...
          </option>
          {VISA_SERVICE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {showOtherServiceField ? (
        <label className="block text-sm font-medium text-slate-700">
          Which service are you looking for? *
          <textarea
            name={OTHER_SERVICE_DESCRIPTION_KEY}
            required
            rows={3}
            minLength={3}
            maxLength={500}
            placeholder="e.g. Partner visa consultation, business visa advice..."
            className={inputClass}
          />
        </label>
      ) : null}

      {normalQuestions.map(renderQuestion)}

      {showStudentFields ? (
        <div className="rounded-xl border border-amber-100/80 bg-amber-50/50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Student visa details
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Current education level *
              <select
                name="currentEducationLevel"
                required
                defaultValue=""
                className={inputClass}
              >
                <option value="" disabled>
                  Select...
                </option>
                {EDUCATION_LEVEL_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700 md:col-span-2">
              Target course *
              <input
                name="targetCourse"
                required
                placeholder="e.g. Master of Information Technology"
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 md:col-span-2">
              Preferred intake *
              <select name="preferredIntake" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Select intake...
                </option>
                {getUpcomingIntakeOptions().map((intake) => (
                  <option key={intake} value={intake}>
                    {intake}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
          English test (optional)
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Test type
            <select name="englishTestType" defaultValue="" className={inputClass}>
              <option value="">Not taken yet / N/A</option>
              {ENGLISH_TEST_TYPES.map((testType) => (
                <option key={testType} value={testType}>
                  {testType}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Score
            <input
              name="englishTestScore"
              placeholder="e.g. 6.5 overall or 79"
              className={inputClass}
            />
          </label>
        </div>
      </div>

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
            If you choose <span className="font-semibold">Other</span> for referral source, please
            explain it in Additional note.
          </p>
        </div>
      )}
    </>
  );
}
