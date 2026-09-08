export const AUDIT_LOG_SEARCH_DEBOUNCE_MS = 350;

export function splitAuditLogHighlight(value: string | null | undefined, query: string) {
  const text = value || "";
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [{ text, matched: false }];

  const lowerText = text.toLocaleLowerCase();
  const lowerQuery = normalizedQuery.toLocaleLowerCase();
  const parts: Array<{ text: string; matched: boolean }> = [];
  let cursor = 0;
  let index = lowerText.indexOf(lowerQuery, cursor);

  while (index !== -1) {
    if (index > cursor) parts.push({ text: text.slice(cursor, index), matched: false });
    parts.push({ text: text.slice(index, index + normalizedQuery.length), matched: true });
    cursor = index + normalizedQuery.length;
    index = lowerText.indexOf(lowerQuery, cursor);
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor), matched: false });
  return parts.length ? parts : [{ text, matched: false }];
}
