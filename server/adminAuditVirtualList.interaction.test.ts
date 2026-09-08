import React from "react";
import { create, act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("lucide-react", () => ({ Clock3: () => React.createElement("svg"), SlidersHorizontal: () => React.createElement("svg") }));

import { AdminAuditVirtualList } from "../client/src/components/AdminAuditVirtualList";

describe("AdminAuditVirtualList details interaction", () => {
  it("passes the clicked authorized row to the detail handler", async () => {
    const row = { id: 12, userId: 4, userName: "ผู้กู้", userEmail: "borrower@example.com", userRole: "borrower" as const, action: "updated", changedFields: "emailLoanApproval", createdAt: new Date() };
    const onSelect = vi.fn();
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(React.createElement(AdminAuditVirtualList, { rows: [row], onSelect })); });
    await act(async () => { tree!.root.findByType("button").props.onClick(); });
    expect(onSelect).toHaveBeenCalledWith(row);
  });
});
