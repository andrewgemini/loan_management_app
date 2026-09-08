import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", () => ({ Clock3: () => React.createElement("svg"), SlidersHorizontal: () => React.createElement("svg") }));

import { AdminAuditVirtualList } from "../client/src/components/AdminAuditVirtualList";

describe("AdminAuditVirtualList", () => {
  it("renders a bounded initial window instead of every audit row", () => {
    const rows = Array.from({ length: 1000 }, (_, index) => ({ id: index + 1, userId: 1, userName: "ผู้ใช้", userEmail: "user@example.com", userRole: "borrower" as const, action: "updated", changedFields: "emailLoanApproval", createdAt: new Date("2026-08-25T10:00:00Z") }));
    const markup = renderToStaticMarkup(React.createElement(AdminAuditVirtualList, { rows }));
    expect(markup).toContain("แสดงแบบ virtualized เพื่อรองรับข้อมูลจำนวนมาก");
    expect(markup).toContain("1,000 รายการ");
    expect(markup.match(/<li/g)?.length).toBeLessThan(20);
  });
});
