type Props = {
  caseReference?: string | null;
  className?: string;
};

export function CaseReferenceLabel({ caseReference, className = "" }: Props) {
  if (!caseReference) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-slate-700 ${className}`}
    >
      {caseReference}
    </span>
  );
}
