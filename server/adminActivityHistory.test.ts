import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => dbMock);

import { adminRouter } from "./routers/adminRouter";

function caller(role: "admin" | "borrower") {
  return adminRouter.createCaller({ user: { id: 1, role, name: role, openId: `${role}-test` } as any, req: {} as any, res: {} as any } as any);
}

describe("adminRouter.getActivityHistory", () => {
  beforeEach(() => dbMock.getDb.mockReset());

  it("uses decision timestamps, resolves the actor, and sorts newest-first", async () => {
    const from = vi.fn()
      .mockResolvedValueOnce([{ id: 9, status: "rejected", approvedById: 3, requestedAt: new Date("2026-08-01"), approvedAt: new Date("2026-08-02"), decidedAt: new Date("2026-08-10") }])
      .mockResolvedValueOnce([{ id: 5, loanId: 77, status: "verified", verifiedById: 4, paymentDate: new Date("2026-08-06"), verifiedAt: new Date("2026-08-08") }])
      .mockResolvedValueOnce([{ id: 3, name: "ผู้ดูแลอนุมัติ", email: null, role: "admin" }, { id: 4, name: "ผู้ตรวจสลิป", email: null, role: "lender" }, { id: 5, name: "ผู้ให้กู้สัญญา", email: null, role: "lender" }])
      .mockResolvedValueOnce([{ id: 77, requestId: 9, lenderId: 5 }]);
    dbMock.getDb.mockResolvedValue({ select: vi.fn(() => ({ from })) });

    const history = await caller("admin").getActivityHistory({ limit: 12 });
    expect(history.map((activity) => activity.id)).toEqual(["request-9", "payment-5"]);
    expect(history[0]).toMatchObject({ actorName: "ผู้ดูแลอนุมัติ", actorRole: "admin", lenderId: 5, lenderName: "ผู้ให้กู้สัญญา", occurredAt: new Date("2026-08-10") });
    await expect(caller("borrower").getActivityHistory({ limit: 12 })).rejects.toThrow();
  });

  it("filters activities inclusively by the selected date range and rejects an inverted range", async () => {
    const from = vi.fn()
      .mockResolvedValueOnce([
        { id: 1, status: "approved", approvedById: 3, requestedAt: new Date("2026-08-01"), decidedAt: new Date("2026-08-01T04:00:00Z") },
        { id: 2, status: "rejected", approvedById: 3, requestedAt: new Date("2026-08-15"), decidedAt: new Date("2026-08-15T04:00:00Z") },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 3, name: "ผู้ดูแล", email: null, role: "admin" }])
      .mockResolvedValueOnce([]);
    dbMock.getDb.mockResolvedValue({ select: vi.fn(() => ({ from })) });

    const history = await caller("admin").getActivityHistory({ limit: 200, startDate: "2026-08-01", endDate: "2026-08-01" });
    expect(history.map((activity) => activity.id)).toEqual(["request-1"]);
    await expect(caller("admin").getActivityHistory({ startDate: "2026-08-20", endDate: "2026-08-01" })).rejects.toThrow("วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น");
  });
});
