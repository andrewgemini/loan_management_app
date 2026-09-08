import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ getDb: vi.fn(), getActivityHistoryFilterPresets: vi.fn(), saveActivityHistoryFilterPreset: vi.fn(), deleteActivityHistoryFilterPreset: vi.fn() }));
vi.mock("./db", () => dbMock);

import { adminRouter } from "./routers/adminRouter";

function caller(role: "admin" | "borrower") {
  return adminRouter.createCaller({ user: { id: 41, role, name: role, openId: `${role}-test` } as any, req: {} as any, res: {} as any } as any);
}

const input = { name: "ตรวจผู้ให้กู้", startDate: "2026-08-01", endDate: "2026-08-31", eventType: "all", actorName: "all", actorRole: "all", lenderId: 12 };

describe("admin Activity History saved presets", () => {
  beforeEach(() => { Object.values(dbMock).forEach((mock) => mock.mockReset()); });

  it("lists and saves presets only for the authenticated admin account", async () => {
    dbMock.getActivityHistoryFilterPresets.mockResolvedValue([{ id: 9, userId: 41, ...input }]);
    dbMock.saveActivityHistoryFilterPreset.mockResolvedValue(9);
    await expect(caller("admin").listActivityFilterPresets()).resolves.toEqual([{ id: 9, userId: 41, ...input }]);
    await expect(caller("admin").saveActivityFilterPreset(input)).resolves.toEqual({ id: 9 });
    expect(dbMock.getActivityHistoryFilterPresets).toHaveBeenCalledWith(41);
    expect(dbMock.saveActivityHistoryFilterPreset).toHaveBeenCalledWith(41, input);
    await expect(caller("borrower").listActivityFilterPresets()).rejects.toThrow();
  });

  it("deletes only the selected preset in the authenticated admin scope and rejects invalid date ranges", async () => {
    await expect(caller("admin").deleteActivityFilterPreset({ id: 9 })).resolves.toEqual({ success: true });
    expect(dbMock.deleteActivityHistoryFilterPreset).toHaveBeenCalledWith(41, 9);
    await expect(caller("admin").saveActivityFilterPreset({ ...input, startDate: "2026-08-31", endDate: "2026-08-01" })).rejects.toThrow("วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น");
  });
});
