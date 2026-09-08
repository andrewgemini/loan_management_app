import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  select: vi.fn(), from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: vi.fn(async () => database) }));

import { adminRouter } from "./routers/adminRouter";

function caller(role: "admin" | "lender" | "borrower") {
  return adminRouter.createCaller({ user: { id: 7, role, openId: role, name: role } as any, req: {} as any, res: {} as any } as any);
}

describe("Admin notification preference audit logs", () => {
  beforeEach(() => {
    database.select.mockReset(); database.from.mockReset(); database.innerJoin.mockReset(); database.where.mockReset(); database.orderBy.mockReset(); database.limit.mockReset();
    database.select.mockReturnValue(database);
    database.from.mockReturnValue(database);
    database.innerJoin.mockReturnValue(database);
    database.where.mockReturnValue(database);
    database.orderBy.mockReturnValue(database);
    database.limit.mockResolvedValue([{ id: 11, userId: 4, userName: "ผู้กู้", action: "updated", changedFields: "emailLoanApproval", createdAt: new Date() }]);
  });

  it("rejects non-admin callers before querying audit records", async () => {
    await expect(caller("borrower").listNotificationPreferenceAuditLogs({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(database.select).not.toHaveBeenCalled();
  });

  it("returns filtered, sorted audit rows only through the admin contract", async () => {
    const rows = await caller("admin").listNotificationPreferenceAuditLogs({ startDate: "2026-08-01", endDate: "2026-08-31", action: "updated", search: "borrower@example.com", sortBy: "action", sortDirection: "asc", limit: 25 });
    expect(rows).toHaveLength(1);
    expect(database.innerJoin).toHaveBeenCalledTimes(1);
    expect(database.where).toHaveBeenCalledTimes(1);
    expect(database.orderBy).toHaveBeenCalledTimes(1);
    expect(database.limit).toHaveBeenCalledWith(25);
  });

  it("rejects an invalid date range without loading records", async () => {
    await expect(caller("admin").listNotificationPreferenceAuditLogs({ startDate: "2026-08-22", endDate: "2026-08-01" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(database.select).not.toHaveBeenCalled();
  });
});
