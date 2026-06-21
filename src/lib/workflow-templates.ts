import { CaseStage } from "@prisma/client";

import {
  caseStageLabel,
  caseStageOrder,
  isStudentOnlyCaseStage,
} from "@/lib/case-stage";
import { isStudentVisaService } from "@/lib/visa-services";

/**
 * A single ordered step in a visa-service workflow template.
 *
 * `templateStageKey` ties a default step back to a known `CaseStage` enum value
 * so reporting (which aggregates by the synced `caseStage` column) keeps working.
 * Custom steps added per-client have a `null` template key (see CaseWorkflowStep).
 */
export type WorkflowTemplateStep = {
  templateStageKey: CaseStage;
  label: string;
};

function stepsFromStages(stages: CaseStage[]): WorkflowTemplateStep[] {
  return stages.map((stage) => ({
    templateStageKey: stage,
    label: caseStageLabel(stage),
  }));
}

/** Full student workflow (Consultation -> ... -> Visa Lodgment). */
export const studentWorkflowTemplate: WorkflowTemplateStep[] =
  stepsFromStages(caseStageOrder);

/** General visa workflow: the student-only study stages stripped out. */
export const generalWorkflowTemplate: WorkflowTemplateStep[] = stepsFromStages(
  caseStageOrder.filter((stage) => !isStudentOnlyCaseStage(stage)),
);

/**
 * Returns the default workflow template for a visa service type. Student Visa
 * gets the full student workflow; every other category (including the newer
 * ones and unknown values) gets the general workflow template.
 *
 * Templates are code-defined: there is intentionally no admin UI to edit them.
 * The returned steps are copied onto the individual client case at creation,
 * after which staff can customise that copy freely.
 */
export function getWorkflowTemplateForVisaService(
  visaServiceType?: string | null,
): WorkflowTemplateStep[] {
  if (isStudentVisaService(visaServiceType)) {
    return studentWorkflowTemplate;
  }
  return generalWorkflowTemplate;
}
