"use client";

import { useState, type ReactNode } from "react";

import { IntakeSelect } from "@/components/intake-select";
import {
  EDUCATION_LEVEL_OPTIONS,
  ENGLISH_TEST_TYPES,
  HEAR_FROM_OPTIONS,
  isOtherVisaService,
  OTHER_SERVICE_DESCRIPTION_KEY,
  usesStudentClientFields,
  VISA_SERVICE_OPTIONS,
} from "@/lib/visa-services";

const inputClass =
  "mt-1 w-full rounded-md border border-rose-200/50 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const labelClass = "block text-sm font-medium text-slate-700";

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className={labelClass}>
      {label}
      {required && " *"}
      {children}
    </label>
  );
}

export function ApplyFormFields({
  prioritizedCountries,
}: {
  prioritizedCountries: readonly string[];
}) {
  const [visaServiceType, setVisaServiceType] = useState("");
  const showStudentFields = usesStudentClientFields(visaServiceType);
  const showOtherServiceField = isOtherVisaService(visaServiceType);

  return (
    <>
      <Field label="Service required" required>
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
      </Field>

      {showOtherServiceField ? (
        <Field label="Which service are you looking for?" required>
          <textarea
            name={OTHER_SERVICE_DESCRIPTION_KEY}
            required
            rows={3}
            minLength={3}
            maxLength={500}
            placeholder="e.g. Partner visa consultation, business visa advice..."
            className={inputClass}
          />
        </Field>
      ) : null}

      <Field label="Full name" required>
        <input
          name="fullName"
          type="text"
          required
          minLength={2}
          maxLength={100}
          autoComplete="name"
          placeholder="Enter your full name"
          className={inputClass}
        />
      </Field>

      <Field label="Email" required>
        <input
          name="email"
          type="email"
          required
          maxLength={200}
          autoComplete="email"
          placeholder="you@example.com"
          className={inputClass}
        />
      </Field>

      <Field label="Phone number" required>
        <input
          name="phone"
          type="tel"
          required
          maxLength={25}
          autoComplete="tel"
          placeholder="e.g. +977-98XXXXXXXX"
          className={inputClass}
        />
      </Field>

      <Field label="City" required>
        <input
          name="city"
          type="text"
          required
          maxLength={100}
          autoComplete="address-level2"
          placeholder="Your current city"
          className={inputClass}
        />
      </Field>

      <Field label="Country" required>
        <select name="country" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Select...
          </option>
          {prioritizedCountries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      </Field>

      {showStudentFields ? (
        <div className="rounded-xl border border-amber-100/80 bg-amber-50/50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Student visa details
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Current education level" required>
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
            </Field>
            <label className={`${labelClass} md:col-span-2`}>
              Target course *
              <input
                name="targetCourse"
                required
                maxLength={200}
                placeholder="e.g. Master of Information Technology"
                className={inputClass}
              />
            </label>
            <IntakeSelect
              required
              className={inputClass}
              labelClassName={`${labelClass} md:col-span-2`}
              wrapperClassName="md:col-span-2"
            />
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
          English test (optional)
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Test type">
            <select name="englishTestType" defaultValue="" className={inputClass}>
              <option value="">Not taken yet / N/A</option>
              {ENGLISH_TEST_TYPES.map((testType) => (
                <option key={testType} value={testType}>
                  {testType}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Score">
            <input
              name="englishTestScore"
              maxLength={50}
              placeholder="e.g. 6.5 overall or 79"
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-xl border border-blue-100/70 bg-blue-50/40 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-700">
          Final details
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Where did you hear from us?" required>
            <select name="hearFrom" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select...
              </option>
              {HEAR_FROM_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Additional notes">
            <textarea
              name="additionalNote"
              rows={4}
              maxLength={5000}
              placeholder="Any extra details about your visa goals"
              className={inputClass}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          If you choose <span className="font-semibold">Others</span> for where you heard from us,
          please explain it in Additional notes.
        </p>
      </div>

      {/* Honeypot: hidden from people, filled in by bots. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />
    </>
  );
}
