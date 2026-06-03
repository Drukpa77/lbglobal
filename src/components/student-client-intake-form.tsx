"use client";

import { useState } from "react";

import { getUpcomingIntakeOptions } from "@/lib/intake-options";
import {
  ENGLISH_TEST_TYPES,
  isOtherVisaService,
  isStudentVisaService,
  OTHER_SERVICE_DESCRIPTION_KEY,
  VISA_SERVICE_OPTIONS,
} from "@/lib/visa-services";

type StudentClientIntakeFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  error: string | null;
  success: boolean;
  successType: "client";
  description: string;
};

const commonInputClass = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

const EDUCATION_LEVEL_OPTIONS = [
  "+2 / High School",
  "Diploma",
  "Bachelors",
  "Masters",
  "Other",
] as const;

export function StudentClientIntakeForm({
  action,
  error,
  success,
  successType,
  description,
}: StudentClientIntakeFormProps) {
  const [visaServiceType, setVisaServiceType] = useState("");
  const showStudentFields = isStudentVisaService(visaServiceType);
  const showOtherServiceField = isOtherVisaService(visaServiceType);

  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Add Client</h2>
          <p className="mt-1 text-xs text-gray-600">{description}</p>
        </div>
        {success ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Client added
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <form action={action} className="mt-4 grid gap-3 rounded-md border border-gray-200 p-4 md:grid-cols-2">
        <label className="text-xs font-medium text-gray-700 md:col-span-2">
          Service required *
          <select
            name="visaServiceType"
            required
            value={visaServiceType}
            onChange={(event) => setVisaServiceType(event.target.value)}
            className={commonInputClass}
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
          <label className="text-xs font-medium text-gray-700 md:col-span-2">
            Which service are they looking for? *
            <textarea
              name={OTHER_SERVICE_DESCRIPTION_KEY}
              required
              rows={3}
              minLength={3}
              maxLength={500}
              placeholder="Describe the service needed"
              className={commonInputClass}
            />
          </label>
        ) : null}
        <label className="text-xs font-medium text-gray-700">
          Name *
          <input name="name" required minLength={2} maxLength={100} className={commonInputClass} />
        </label>
        <label className="text-xs font-medium text-gray-700">
          Email *
          <input name="email" type="email" required className={commonInputClass} />
        </label>
        <label className="text-xs font-medium text-gray-700">
          Phone *
          <input name="phone" required className={commonInputClass} />
        </label>
        <label className="text-xs font-medium text-gray-700">
          Country *
          <input name="country" required className={commonInputClass} />
        </label>
        <label className="text-xs font-medium text-gray-700">
          City *
          <input name="city" required className={commonInputClass} />
        </label>

        {showStudentFields ? (
          <>
            <label className="text-xs font-medium text-gray-700">
              Current education *
              <select name="currentEducation" required defaultValue="" className={commonInputClass}>
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
            <label className="text-xs font-medium text-gray-700">
              Target course *
              <input name="course" required className={commonInputClass} />
            </label>
            <label className="text-xs font-medium text-gray-700 md:col-span-2">
              Preferred intake *
              <select name="intake" required defaultValue="" className={commonInputClass}>
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
          </>
        ) : null}

        <label className="text-xs font-medium text-gray-700">
          English test type
          <select name="englishTestType" defaultValue="" className={commonInputClass}>
            <option value="">N/A</option>
            {ENGLISH_TEST_TYPES.map((testType) => (
              <option key={testType} value={testType}>
                {testType}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-700">
          English test score
          <input name="englishTestScore" placeholder="e.g. 6.5" className={commonInputClass} />
        </label>
        <label className="text-xs font-medium text-gray-700 md:col-span-2">
          Notes
          <textarea name="notes" rows={3} className={commonInputClass} />
        </label>
        <div className="md:col-span-2">
          <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
            Add client and assign to me
          </button>
        </div>
      </form>
    </section>
  );
}
