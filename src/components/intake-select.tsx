"use client";

import { useMemo, useState } from "react";

import {
  INTAKE_CUSTOM_MAX_LENGTH,
  INTAKE_CUSTOM_MIN_LENGTH,
  INTAKE_OTHER_VALUE,
  getEditableIntakeOptions,
  getIntakeCustomFieldName,
  getIntakeFieldState,
  getUpcomingIntakeOptions,
} from "@/lib/intake-options";

type IntakeSelectProps = {
  name?: string;
  savedValue?: string | null;
  required?: boolean;
  className?: string;
  label?: string;
  labelClassName?: string;
  /** When true, includes past months and a wider year range (for profile editing). */
  editable?: boolean;
  wrapperClassName?: string;
  placeholder?: string;
};

export function IntakeSelect({
  name = "preferredIntake",
  savedValue,
  required = false,
  className,
  label = "Preferred intake",
  labelClassName = "block text-sm font-medium text-slate-700",
  editable = false,
  wrapperClassName,
  placeholder = "e.g. Trimester 3 2026, Mid-Sep intake",
}: IntakeSelectProps) {
  const customFieldName = getIntakeCustomFieldName(name);

  const options = useMemo(
    () => (editable ? getEditableIntakeOptions() : getUpcomingIntakeOptions()),
    [editable],
  );

  const initial = useMemo(
    () => getIntakeFieldState(savedValue, options),
    [savedValue, options],
  );

  const [selectValue, setSelectValue] = useState(initial.selectValue);
  const [customValue, setCustomValue] = useState(initial.customValue);
  const showCustom = selectValue === INTAKE_OTHER_VALUE;

  return (
    <div className={wrapperClassName}>
      <label className={labelClassName}>
        {label}
        {required ? " *" : ""}
        <select
          name={name}
          required={required && !showCustom}
          value={selectValue}
          onChange={(event) => setSelectValue(event.target.value)}
          className={className}
        >
          <option value="" disabled>
            Select intake...
          </option>
          {options.map((intake) => (
            <option key={intake} value={intake}>
              {intake}
            </option>
          ))}
          <option value={INTAKE_OTHER_VALUE}>Other (custom)</option>
        </select>
      </label>
      {showCustom ? (
        <label className={`${labelClassName} mt-2`}>
          Custom intake
          {required ? " *" : ""}
          <input
            type="text"
            name={customFieldName}
            required={required}
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            placeholder={placeholder}
            minLength={INTAKE_CUSTOM_MIN_LENGTH}
            maxLength={INTAKE_CUSTOM_MAX_LENGTH}
            className={className}
          />
        </label>
      ) : null}
    </div>
  );
}
