export function taskStatusTone(status: string) {
  if (status === "DONE") return "bg-emerald-50 text-emerald-700";
  if (status === "IN_PROGRESS") return "bg-amber-50 text-amber-800";
  if (status === "BLOCKED") return "bg-rose-50 text-rose-700";
  return "bg-gray-100 text-gray-700";
}

export function taskStatusCardClass(status: string) {
  if (status === "DONE") return "border-emerald-200 bg-emerald-50/80";
  if (status === "IN_PROGRESS") return "border-amber-200 bg-amber-50/80";
  if (status === "BLOCKED") return "border-rose-200 bg-rose-50/80";
  return "border-gray-200 bg-white";
}
