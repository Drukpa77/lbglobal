import { CaseStage } from "@prisma/client";

import { isStudentVisaService } from "@/lib/visa-services";

/** Stages that apply only to student visa / study enrolment workflows */
export const studentOnlyCaseStages: CaseStage[] = [
  CaseStage.ENROLMENT_PROCESS,
  CaseStage.CONDITIONAL_OFFER_LETTER,
  CaseStage.UNCONDITIONAL_OFFER_LETTER,
  CaseStage.TUITION_FEE_AND_OSHC_PAID,
  CaseStage.COE_RECEIVED,
  CaseStage.GTE_PROCESS,
];

export const caseStageOrder: CaseStage[] = [
  CaseStage.CONSULTATION_AND_DOCUMENTATION,
  CaseStage.RESEARCH_PROPOSAL,
  CaseStage.ENROLMENT_PROCESS,
  CaseStage.CONDITIONAL_OFFER_LETTER,
  CaseStage.UNCONDITIONAL_OFFER_LETTER,
  CaseStage.TUITION_FEE_AND_OSHC_PAID,
  CaseStage.COE_RECEIVED,
  CaseStage.GTE_PROCESS,
  CaseStage.VISA_DRAFT_PREPARATION,
  CaseStage.VISA_LODGMENT,
];

export const caseStageTerminals: CaseStage[] = [
  CaseStage.VISA_GRANTED,
  CaseStage.VISA_REFUSED,
  CaseStage.AAT_CASE,
  CaseStage.WITHDRAWN,
];

export const allCaseStages: CaseStage[] = [
  ...caseStageOrder,
  ...caseStageTerminals,
];

const labels: Record<CaseStage, string> = {
  CONSULTATION_AND_DOCUMENTATION: "Consultation and Documentation",
  RESEARCH_PROPOSAL: "Research Proposal",
  ENROLMENT_PROCESS: "Enrolment Process",
  CONDITIONAL_OFFER_LETTER: "Conditional Offer Letter",
  UNCONDITIONAL_OFFER_LETTER: "Unconditional Offer Letter",
  TUITION_FEE_AND_OSHC_PAID: "Tuition Fee and OSHC Paid",
  COE_RECEIVED: "COE Received",
  GTE_PROCESS: "GTE Process",
  VISA_DRAFT_PREPARATION: "Visa Draft Preparation",
  VISA_LODGMENT: "Visa Lodgment",
  VISA_GRANTED: "Visa Grant",
  VISA_REFUSED: "Visa Refused",
  AAT_CASE: "AAT Case",
  WITHDRAWN: "Withdrawn",
};

export function caseStageLabel(stage: CaseStage): string {
  return labels[stage] ?? String(stage);
}

export function caseStageTone(stage: CaseStage): string {
  switch (stage) {
    case CaseStage.CONSULTATION_AND_DOCUMENTATION:
    case CaseStage.RESEARCH_PROPOSAL:
      return "bg-gray-100 text-gray-700 border-gray-200";
    case CaseStage.ENROLMENT_PROCESS:
    case CaseStage.CONDITIONAL_OFFER_LETTER:
    case CaseStage.UNCONDITIONAL_OFFER_LETTER:
      return "bg-blue-50 text-blue-700 border-blue-200";
    case CaseStage.TUITION_FEE_AND_OSHC_PAID:
    case CaseStage.COE_RECEIVED:
      return "bg-violet-50 text-violet-700 border-violet-200";
    case CaseStage.GTE_PROCESS:
    case CaseStage.VISA_DRAFT_PREPARATION:
    case CaseStage.VISA_LODGMENT:
      return "bg-amber-50 text-amber-700 border-amber-200";
    case CaseStage.VISA_GRANTED:
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case CaseStage.VISA_REFUSED:
    case CaseStage.AAT_CASE:
      return "bg-rose-50 text-rose-700 border-rose-200";
    case CaseStage.WITHDRAWN:
      return "bg-slate-100 text-slate-600 border-slate-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

export function isTerminalStage(stage: CaseStage): boolean {
  return caseStageTerminals.includes(stage);
}

export function isPostLodgment(stage: CaseStage): boolean {
  if (isTerminalStage(stage)) return true;
  return stage === CaseStage.VISA_LODGMENT;
}

export function isStudentOnlyCaseStage(stage: CaseStage): boolean {
  return studentOnlyCaseStages.includes(stage);
}

export function getCaseStageOrderForVisaService(
  visaServiceType?: string | null,
): CaseStage[] {
  if (isStudentVisaService(visaServiceType)) {
    return caseStageOrder;
  }
  return caseStageOrder.filter((stage) => !isStudentOnlyCaseStage(stage));
}

export function isCaseStageAllowedForVisaService(
  stage: CaseStage,
  visaServiceType?: string | null,
): boolean {
  if (isTerminalStage(stage)) return true;
  return getCaseStageOrderForVisaService(visaServiceType).includes(stage);
}

/**
 * Suggests valid next stages from the current one based on the documented workflow.
 * The picker still allows any-to-any transition; this is just used for UI hints
 * (e.g. preselecting the most likely "next" choice).
 */
export function getNextSuggestedStages(
  current: CaseStage,
  visaServiceType?: string | null,
): CaseStage[] {
  const order = getCaseStageOrderForVisaService(visaServiceType);
  const linearIdx = order.indexOf(current);

  if (linearIdx >= 0) {
    const next = order[linearIdx + 1];
    const suggested: CaseStage[] = [];
    if (next) suggested.push(next);
    if (current === CaseStage.VISA_LODGMENT) {
      suggested.push(
        CaseStage.VISA_GRANTED,
        CaseStage.VISA_REFUSED,
      );
    }
    suggested.push(CaseStage.WITHDRAWN);
    return suggested.filter((stage) => isCaseStageAllowedForVisaService(stage, visaServiceType));
  }

  // Already in a terminal stage
  if (current === CaseStage.VISA_REFUSED) {
    return [CaseStage.AAT_CASE, CaseStage.WITHDRAWN];
  }
  return [];
}

export function getStageProgressPercent(
  stage: CaseStage,
  visaServiceType?: string | null,
): number {
  if (stage === CaseStage.VISA_GRANTED) return 100;
  if (stage === CaseStage.WITHDRAWN || stage === CaseStage.VISA_REFUSED || stage === CaseStage.AAT_CASE) {
    return 100;
  }
  const order = getCaseStageOrderForVisaService(visaServiceType);
  const idx = order.indexOf(stage);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / order.length) * 100);
}
