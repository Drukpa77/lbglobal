export type TemplateVariables = Record<string, string | number | null | undefined>;

const tokenRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Escapes HTML to prevent XSS when rendering user-controlled data into templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderTemplate(raw: string, variables: TemplateVariables) {
  return raw.replace(tokenRegex, (_, key: string) => {
    const value = variables[key];
    if (value === null || value === undefined) return "";
    return escapeHtml(String(value));
  });
}

export function extractTemplatePlaceholders(raw: string) {
  const placeholders = new Set<string>();
  let match: RegExpExecArray | null = tokenRegex.exec(raw);
  while (match) {
    placeholders.add(match[1]);
    match = tokenRegex.exec(raw);
  }
  tokenRegex.lastIndex = 0;
  return Array.from(placeholders);
}
