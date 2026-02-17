import type { Prisma } from "@prisma/client";
import { z } from "zod";

const questionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "select"]),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
});

const questionsSchema = z.array(questionSchema);

export type QuestionnaireQuestion = z.infer<typeof questionSchema>;

export function parseTemplateQuestions(raw: Prisma.JsonValue): QuestionnaireQuestion[] {
  const result = questionsSchema.safeParse(raw);
  if (!result.success) {
    return [];
  }
  return result.data;
}
