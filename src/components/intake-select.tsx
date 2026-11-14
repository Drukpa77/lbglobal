"use client";

import { useMemo, useState } from "react";

import {
  INTAKE_CUSTOM_MAX_LENGTH,
  INTAKE_CUSTOM_MIN_LENGTH,
  INTAKE_OTHER_VALUE,
  getIntakeCustomFieldName,
  getUpcomingIntakeOptions,
} from "@/lib/intake-options";

type IntakeSelectProps = {
  name?: string;
  required?: boolean;
  className?: string;
  label?: string;
  labelClassName?: string;
  wrapperClassName?: string;
  placeholder?: string;
};

export function IntakeSelect({
  name = "preferredIntake",
  required = false,
  className,
  label = "Preferred intake",
  labelClassName = "block text-sm font-medium text-slate-700",
  wrapperClassName,
  placeholder = "e.g. Trimester 3 2026, Mid-Sep intake",
}: IntakeSelectProps) {
  const customFieldName = getIntakeCustomFieldName(name);
  const options = useMemo(() => getUpcomingIntakeOptions(), []);

  const [selectValue, setSelectValue] = useState("");
  const [customValue, setCustomValue] = useState("");
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
