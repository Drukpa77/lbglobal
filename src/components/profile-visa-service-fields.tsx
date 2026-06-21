"use client";

import { useState } from "react";

import { IntakeSelect } from "@/components/intake-select";
import {
  ENGLISH_TEST_TYPES,
  isOtherVisaService,
  OTHER_SERVICE_DESCRIPTION_KEY,
  parseLegacyEnglishTestScore,
  usesStudentClientFields,
  VISA_SERVICE_OPTIONS,
} from "@/lib/visa-services";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400";

const EDUCATION_LEVEL_OPTIONS = [
  "+2 / High School",
  "Diploma",
  "Bachelors",
  "Masters",
  "Other",
] as const;

type ProfileVisaServiceFieldsProps = {
  visaServiceType?: string | null;
  otherServiceDescription?: string | null;
  currentEducationLevel?: string | null;
  targetCourse?: string | null;
  preferredIntake?: string | null;
  englishTestType?: string | null;
  englishTestScore?: string | null;
};

export function ProfileVisaServiceFields({
  visaServiceType: initialServiceType,
  otherServiceDescription,
  currentEducationLevel,
  targetCourse,
  preferredIntake,
  englishTestType: initialEnglishType,
  englishTestScore: initialEnglishScore,
}: ProfileVisaServiceFieldsProps) {
  const legacyEnglish = parseLegacyEnglishTestScore(
    !initialEnglishType ? initialEnglishScore : null,
  );
  const resolvedEnglishType = initialEnglishType ?? legacyEnglish.type ?? "";
  const resolvedEnglishScore =
    initialEnglishType || legacyEnglish.type
      ? (initialEnglishScore ?? legacyEnglish.score ?? "")
      : (legacyEnglish.score ?? initialEnglishScore ?? "");

  const [visaServiceType, setVisaServiceType] = useState(initialServiceType ?? "");
  const showStudentFields = usesStudentClientFields(visaServiceType);
  const showOtherServiceField = isOtherVisaService(visaServiceType);

  return (
    <>
      <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
        Service required
        <select
          name="visaServiceType"
          value={visaServiceType}
          onChange={(event) => setVisaServiceType(event.target.value)}
          className={inputClass}
        >
          <option value="">Select a service...</option>
          {VISA_SERVICE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {showOtherServiceField ? (
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Service requested
          <textarea
            name={OTHER_SERVICE_DESCRIPTION_KEY}
            required
            rows={3}
            minLength={3}
            maxLength={500}
            defaultValue={otherServiceDescription ?? ""}
            placeholder="Describe the service the client needs"
            className={inputClass}
          />
        </label>
      ) : (
        <input type="hidden" name={OTHER_SERVICE_DESCRIPTION_KEY} value="" />
      )}

      {showStudentFields ? (
        <>
          <label className="block text-sm font-medium text-slate-700">
            Current Education Level
            <select
              name="currentEducationLevel"
              defaultValue={currentEducationLevel ?? ""}
              className={inputClass}
            >
              <option value="">Select level...</option>
              {EDUCATION_LEVEL_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Target Course
            <input
              type="text"
              name="targetCourse"
              defaultValue={targetCourse ?? ""}
              className={inputClass}
            />
          </label>
          <IntakeSelect
            savedValue={preferredIntake}
            editable
            label="Preferred Intake"
            labelClassName="block text-sm font-medium text-slate-700"
            className={inputClass}
          />
        </>
      ) : (
        <>
          <input type="hidden" name="currentEducationLevel" value="" />
          <input type="hidden" name="targetCourse" value="" />
          <input type="hidden" name="preferredIntake" value="" />
        </>
      )}

      <label className="block text-sm font-medium text-slate-700">
        English test type
        <select name="englishTestType" defaultValue={resolvedEnglishType} className={inputClass}>
          <option value="">Not taken yet / N/A</option>
          {ENGLISH_TEST_TYPES.map((testType) => (
            <option key={testType} value={testType}>
              {testType}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        English test score
        <input
          type="text"
          name="englishTestScore"
          defaultValue={resolvedEnglishScore}
          placeholder="e.g. 6.5 overall or 79"
          className={inputClass}
        />
      </label>
    </>
  );
}
