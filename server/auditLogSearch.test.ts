import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUDIT_LOG_SEARCH_DEBOUNCE_MS, splitAuditLogHighlight } from "../client/src/lib/auditLogSearch";

describe("Audit Log search enhancements", () => {
  it("splits matched name or email segments without changing unmatched text", () => {
    expect(splitAuditLogHighlight("Somchai@example.com", "chai")).toEqual([{ text: "Som", matched: false }, { text: "chai", matched: true }, { text: "@example.com", matched: false }]);
    expect(splitAuditLogHighlight("ผู้ใช้", "")).toEqual([{ text: "ผู้ใช้", matched: false }]);
  });

  it("uses a bounded debounce duration and passes the debounced query to the Audit Logs page", () => {
    const pageSource = readFileSync(new URL("../client/src/pages/AdminAuditLogs.tsx", import.meta.url), "utf8");
    expect(AUDIT_LOG_SEARCH_DEBOUNCE_MS).toBeGreaterThanOrEqual(250);
    expect(AUDIT_LOG_SEARCH_DEBOUNCE_MS).toBeLessThanOrEqual(500);
    expect(pageSource).toContain("useDebouncedValue(search.trim(), AUDIT_LOG_SEARCH_DEBOUNCE_MS)");
    expect(pageSource).toContain("highlightQuery={debouncedSearch}");
  });
});
