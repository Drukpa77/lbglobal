"use client";

import { useState } from "react";

type IntakeType = "student" | "client";

type StudentClientIntakeFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  error: string | null;
  success: boolean;
  successType: IntakeType;
  description: string;
};

const commonInputClass = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm";

export function StudentClientIntakeForm({
  action,
  error,
  success,
  successType,
  description,
}: StudentClientIntakeFormProps) {
  const [intakeType, setIntakeType] = useState<IntakeType | null>(null);
  const isClient = intakeType === "client";
  const selectedLabel = isClient ? "Client" : "Student";

  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Add Student or Client</h2>
          <p className="mt-1 text-xs text-gray-600">{description}</p>
        </div>
        {success ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {successType === "client" ? "Client" : "Student"} added
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-2">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Choose intake type">
          {(["student", "client"] as const).map((type) => {
            const active = intakeType === type;
            const label = type === "client" ? "Client" : "Student";
            return (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setIntakeType(type)}
                className={`rounded-md border px-3 py-2 text-left text-sm font-medium transition ${
                  active
                    ? "border-black bg-white text-black shadow-sm"
                    : "border-transparent text-gray-600 hover:border-gray-300 hover:bg-white"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {intakeType ? (
        <form action={action} className="mt-4 grid gap-3 rounded-md border border-gray-200 p-4 md:grid-cols-2">
          <input type="hidden" name="recordType" value={intakeType} />
          <label className="text-xs font-medium text-gray-700">
            Name
            <input name="name" required minLength={2} maxLength={100} className={commonInputClass} />
          </label>
          <label className="text-xs font-medium text-gray-700">
            Email
            <input name="email" type="email" required className={commonInputClass} />
          </label>
          <label className="text-xs font-medium text-gray-700">
            Phone
            <input name="phone" required className={commonInputClass} />
          </label>
          <label className="text-xs font-medium text-gray-700">
            Country
            <input name="country" required className={commonInputClass} />
          </label>
          <label className="text-xs font-medium text-gray-700">
            City
            <input name="city" required className={commonInputClass} />
          </label>
          <label className="text-xs font-medium text-gray-700">
            {isClient ? "Service required" : "Course"}
            <input name="course" required className={commonInputClass} />
          </label>
          <label className="text-xs font-medium text-gray-700">
            {isClient ? "Visa type" : "Intake"}
            <input name="intake" required className={commonInputClass} />
          </label>
          <label className="text-xs font-medium text-gray-700">
            Current education
            <input name="currentEducation" required className={commonInputClass} />
          </label>
          <label className="text-xs font-medium text-gray-700 md:col-span-2">
            Notes
            <textarea name="notes" rows={3} className={commonInputClass} />
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
              Add {selectedLabel} and assign to me
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
