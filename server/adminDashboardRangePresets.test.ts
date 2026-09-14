import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  leftJoin: vi.fn(),
  where: vi.fn(),
  groupBy: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  onDuplicateKeyUpdate: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  delete: vi.fn(),
}));
const dbMock = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("./db", () => dbMock);

import { adminRouter } from "./routers/adminRouter";

function caller(role: "admin" | "borrower", id = 41) {
  return adminRouter.createCaller({ user: { id, role, name: role, openId: `${role}-${id}` } as any, req: {} as any, res: {} as any } as any);
}

describe("admin dashboard range presets", () => {
  beforeEach(() => {
    Object.values(database).forEach((mock) => mock.mockReset());
    dbMock.getDb.mockReset();
    database.select.mockReturnValue(database);
    database.from.mockReturnValue(database);
    database.innerJoin.mockReturnValue(database);
    database.leftJoin.mockReturnValue(database);
    database.where.mockReturnValue(database);
    database.groupBy.mockReturnValue(database);
    database.orderBy.mockResolvedValue([]);
    database.limit.mockResolvedValue([]);
    database.update.mockReturnValue(database);
    database.set.mockReturnValue(database);
    database.insert.mockReturnValue(database);
    database.values.mockReturnValue(database);
    database.returning.mockResolvedValue([]);
    database.onDuplicateKeyUpdate.mockResolvedValue(undefined);
    database.onConflictDoUpdate.mockImplementation((value) => {
      database.onDuplicateKeyUpdate(value);
      return Promise.resolve(undefined);
    });
    database.delete.mockReturnValue(database);
    dbMock.getDb.mockResolvedValue(database);
  });

  it("restricts team preset list and sharing mutations to admins", async () => {
    await expect(caller("borrower").listDashboardRangePresets({ search: "สิ้นเดือน", sort: "name_asc" })).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    await expect(caller("borrower").setDashboardRangePresetSharing({ id: 8, isShared: true })).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    await expect(caller("borrower").resetDashboardRangePresetPinOrder()).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    await expect(caller("borrower").sortDashboardRangePresetPinsByUsage()).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    await expect(caller("borrower").listDashboardPresetCategories()).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    await expect(caller("borrower").listDashboardPresetCategoryMoveHistory()).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    await expect(caller("borrower").undoDashboardPresetCategoryMove({ id: 21 })).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    await expect(caller("borrower").createDashboardPresetCategory({ name: "งานติดตาม", color: "blue", icon: "folder" })).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    await expect(caller("borrower").renameDashboardPresetCategory({ id: 3, name: "ชื่อใหม่" })).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    await expect(caller("borrower").setDashboardRangePresetCategory({ presetId: 8, categoryId: 3 })).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    await expect(caller("borrower").setDashboardRangePresetCategories({ presetIds: [8, 9], categoryId: 3 })).rejects.toThrow("เฉพาะผู้ดูแลระบบ");
    expect(dbMock.getDb).not.toHaveBeenCalled();
  });

  it("uses server-side scope/search/sort contracts and returns creator metadata with non-owner shared presets", async () => {
    database.orderBy.mockResolvedValueOnce([
      { id: 1, userId: 41, name: "ติดตามเดือนนี้", startDate: "2026-08-01", endDate: "2026-08-31", isShared: false, creatorName: "ผู้ดูแลหนึ่ง", categoryName: "ประจำวัน", categoryColor: "blue", categoryIcon: "folder", updatedAt: new Date("2026-08-20") },
      { id: 2, userId: 52, name: "ทีมตรวจสอบ", startDate: "2026-08-10", endDate: "2026-08-20", isShared: true, creatorName: "ผู้ดูแลทีม", updatedAt: new Date("2026-08-21") },
    ]);

    await expect(caller("admin").listDashboardRangePresets({ scope: "team", search: "ทีม", creatorSearch: "ผู้ดูแล", sort: "name_asc" })).resolves.toMatchObject([
      { id: 1, creatorName: "ผู้ดูแลหนึ่ง", categoryName: "ประจำวัน", categoryColor: "blue", categoryIcon: "folder", isOwner: true },
      { id: 2, creatorName: "ผู้ดูแลทีม", isShared: true, isOwner: false },
    ]);
    expect(database.innerJoin).toHaveBeenCalledTimes(1);
    expect(database.leftJoin).toHaveBeenCalledTimes(4);
    expect(database.where).toHaveBeenCalledTimes(1);
    expect(database.orderBy).toHaveBeenCalledTimes(1);
  });

  it("accepts only the allowlisted private/team scope filter", async () => {
    await expect(caller("admin").listDashboardRangePresets({ scope: "private" })).resolves.toEqual([]);
    await expect(caller("admin").listDashboardRangePresets({ scope: "team" })).resolves.toEqual([]);
    await expect(caller("admin").listDashboardRangePresets({ scope: "other" as any })).rejects.toThrow();
  });

  it("creates, lists, assigns, and clears preset categories only for the caller", async () => {
    database.orderBy.mockResolvedValueOnce([{ id: 3, name: "งานติดตาม", color: "teal", icon: "flag", presetCount: 2, createdAt: new Date("2026-08-20"), updatedAt: new Date("2026-08-20") }]);
    await expect(caller("admin", 41).listDashboardPresetCategories()).resolves.toMatchObject([{ id: 3, name: "งานติดตาม", color: "teal", icon: "flag", presetCount: 2 }]);
    expect(database.leftJoin).toHaveBeenCalledTimes(1);
    expect(database.groupBy).toHaveBeenCalledTimes(1);

    database.returning.mockResolvedValueOnce([{ id: 3 }]);
    await expect(caller("admin", 41).createDashboardPresetCategory({ name: "งานติดตาม", color: "teal", icon: "flag" })).resolves.toEqual({ id: 3, name: "งานติดตาม", color: "teal", icon: "flag" });
    expect(database.values).toHaveBeenCalledWith({ userId: 41, name: "งานติดตาม", color: "teal", icon: "flag" });
    await expect(caller("admin", 41).createDashboardPresetCategory({ name: "ค่าไม่อนุญาต", color: "red" as any, icon: "flag" })).rejects.toThrow();

    await expect(caller("admin", 41).updateDashboardPresetCategoryAppearance({ id: 3, color: "violet", icon: "star" })).resolves.toEqual({ success: true });
    expect(database.set).toHaveBeenCalledWith({ color: "violet", icon: "star", updatedAt: expect.any(Date) });
    await expect(caller("admin", 41).renameDashboardPresetCategory({ id: 3, name: "งานติดตามเร่งด่วน" })).resolves.toEqual({ success: true });
    expect(database.set).toHaveBeenLastCalledWith({ name: "งานติดตามเร่งด่วน", updatedAt: expect.any(Date) });

    database.limit.mockResolvedValueOnce([{ id: 8 }]).mockResolvedValueOnce([{ id: 3 }]);
    await expect(caller("admin", 41).setDashboardRangePresetCategory({ presetId: 8, categoryId: 3 })).resolves.toEqual({ success: true });
    expect(database.values).toHaveBeenLastCalledWith({ userId: 41, presetId: 8, categoryId: 3 });
    expect(database.onConflictDoUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ set: { categoryId: 3 } }));

    database.limit.mockResolvedValueOnce([{ id: 8 }]);
    await expect(caller("admin", 41).setDashboardRangePresetCategory({ presetId: 8, categoryId: null })).resolves.toEqual({ success: true });
    expect(database.delete).toHaveBeenCalled();
  });

  it("moves multiple visible presets only into the caller's category and supports bulk unassignment", async () => {
    database.where.mockResolvedValueOnce([{ id: 8 }, { id: 9 }]).mockResolvedValueOnce([]);
    database.limit.mockResolvedValueOnce([{ id: 3 }]);
    database.values.mockReturnValueOnce(database).mockReturnValueOnce(database);
    database.returning.mockResolvedValueOnce([{ id: 21 }]);
    await expect(caller("admin", 41).setDashboardRangePresetCategories({ presetIds: [8, 9], categoryId: 3 })).resolves.toEqual({ success: true, count: 2, historyId: 21 });
    expect(database.values).toHaveBeenNthCalledWith(1, [{ userId: 41, presetId: 8, categoryId: 3 }, { userId: 41, presetId: 9, categoryId: 3 }]);
    expect(database.values).toHaveBeenLastCalledWith({ userId: 41, presetIds: "[8,9]", previousCategoryIds: "[null,null]", destinationCategoryId: 3 });
    expect(database.onConflictDoUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ set: { categoryId: 3 } }));

    database.where.mockResolvedValueOnce([{ id: 8 }, { id: 9 }]).mockResolvedValueOnce([{ presetId: 8, categoryId: 3 }, { presetId: 9, categoryId: 3 }]);
    database.returning.mockResolvedValueOnce([{ id: 22 }]);
    await expect(caller("admin", 41).setDashboardRangePresetCategories({ presetIds: [8, 9], categoryId: null })).resolves.toEqual({ success: true, count: 2, historyId: 22 });
    expect(database.delete).toHaveBeenCalled();

    database.where.mockResolvedValueOnce([{ id: 8 }]);
    await expect(caller("admin", 41).setDashboardRangePresetCategories({ presetIds: [8, 9], categoryId: 3 })).rejects.toThrow("พบ Preset");
    await expect(caller("admin", 41).setDashboardRangePresetCategories({ presetIds: [8, 8], categoryId: 3 })).rejects.toThrow("Preset ต้องไม่ซ้ำกัน");
  });

  it("lists only valid owner-scoped preset move history metadata", async () => {
    database.orderBy.mockReturnValueOnce(database);
    database.limit.mockResolvedValueOnce([
      { id: 31, presetIds: "[8,9]", previousCategoryIds: "[null,3]", destinationCategoryId: 4, undoneAt: null, createdAt: new Date("2026-08-26T08:00:00.000Z") },
      { id: 30, presetIds: "not-json", previousCategoryIds: "[]", destinationCategoryId: null, undoneAt: null, createdAt: new Date("2026-08-25T08:00:00.000Z") },
    ]);
    await expect(caller("admin", 41).listDashboardPresetCategoryMoveHistory()).resolves.toMatchObject([{ id: 31, presetCount: 2, destinationCategoryId: 4, undoneAt: null }]);
    expect(database.where).toHaveBeenCalledTimes(1);
    expect(database.limit).toHaveBeenCalledWith(10);
  });

  it("undoes only the latest owner-scoped preset move after rechecking visible presets", async () => {
    database.where.mockReturnValueOnce(database).mockReturnValueOnce(database).mockResolvedValueOnce([{ id: 8 }, { id: 9 }]);
    database.orderBy.mockReturnValueOnce(database);
    database.limit.mockResolvedValueOnce([{ id: 21, undoneAt: null }]).mockResolvedValueOnce([{ id: 21, userId: 41, presetIds: "[8,9]", previousCategoryIds: "[null,null]", destinationCategoryId: 3, undoneAt: null }]);
    await expect(caller("admin", 41).undoDashboardPresetCategoryMove({ id: 21 })).resolves.toEqual({ success: true, count: 2 });
    expect(database.delete).toHaveBeenCalled();
    expect(database.set).toHaveBeenCalledWith({ undoneAt: expect.any(Date) });

    Object.values(database).forEach((mock) => mock.mockReset());
    database.select.mockReturnValue(database);
    database.from.mockReturnValue(database);
    database.innerJoin.mockReturnValue(database);
    database.leftJoin.mockReturnValue(database);
    database.where.mockReturnValue(database);
    database.orderBy.mockReturnValue(database);
    database.limit.mockResolvedValueOnce([{ id: 22 }]);
    database.update.mockReturnValue(database);
    database.set.mockReturnValue(database);
    database.insert.mockReturnValue(database);
    database.values.mockReturnValue(database);
    database.returning.mockResolvedValue([]);
    database.onDuplicateKeyUpdate.mockResolvedValue(undefined);
    database.onConflictDoUpdate.mockImplementation((value) => {
      database.onDuplicateKeyUpdate(value);
      return Promise.resolve(undefined);
    });
    database.delete.mockReturnValue(database);
    await expect(caller("admin", 41).undoDashboardPresetCategoryMove({ id: 21 })).rejects.toThrow("เฉพาะการย้าย Preset ล่าสุด");
  });

  it("redoes only the latest undone move after rechecking the destination category", async () => {
    database.where.mockReturnValueOnce(database).mockReturnValueOnce(database).mockResolvedValueOnce([{ id: 8 }, { id: 9 }]).mockReturnValueOnce(database);
    database.orderBy.mockReturnValueOnce(database);
    database.limit.mockResolvedValueOnce([{ id: 21, undoneAt: new Date("2026-08-26T08:00:00.000Z") }]).mockResolvedValueOnce([{ id: 21, userId: 41, presetIds: "[8,9]", previousCategoryIds: "[null,null]", destinationCategoryId: 3, undoneAt: new Date("2026-08-26T08:00:00.000Z") }]).mockResolvedValueOnce([{ id: 3 }]);
    await expect(caller("admin", 41).redoDashboardPresetCategoryMove({ id: 21 })).resolves.toEqual({ success: true, count: 2 });
    expect(database.values).toHaveBeenCalledWith([{ userId: 41, presetId: 8, categoryId: 3 }, { userId: 41, presetId: 9, categoryId: 3 }]);
    expect(database.set).toHaveBeenCalledWith({ undoneAt: null });
  });

  it("applies sharing changes through the authenticated owner's scoped update", async () => {
    await expect(caller("admin", 41).setDashboardRangePresetSharing({ id: 8, isShared: true })).resolves.toEqual({ success: true });
    expect(database.update).toHaveBeenCalledTimes(1);
    expect(database.set).toHaveBeenCalledWith(expect.objectContaining({ isShared: true, updatedAt: expect.any(Date) }));
    expect(database.where).toHaveBeenCalledTimes(1);
  });

  it("copies only a visible shared team preset into a new private owner row", async () => {
    database.limit.mockResolvedValueOnce([{ id: 8, name: "รอบทีม", startDate: "2026-08-01", endDate: "2026-08-31", isShared: true }]).mockResolvedValueOnce([]);
    database.returning.mockResolvedValueOnce([{ id: 73 }]);

    await expect(caller("admin", 41).copyDashboardRangePresetToPrivate({ id: 8 })).resolves.toEqual({ id: 73, name: "รอบทีม · สำเนา" });
    expect(database.values).toHaveBeenCalledWith(expect.objectContaining({ userId: 41, name: "รอบทีม · สำเนา", isShared: false }));
  });

  it("records use only after checking that the preset is still visible to the admin", async () => {
    database.limit.mockResolvedValueOnce([{ id: 8 }]);
    await expect(caller("admin", 41).markDashboardRangePresetUsed({ id: 8 })).resolves.toEqual({ success: true });
    expect(database.values).toHaveBeenCalledWith(expect.objectContaining({ userId: 41, presetId: 8, lastUsedAt: expect.any(Date) }));
    expect(database.onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({ set: expect.objectContaining({ lastUsedAt: expect.any(Date), usageCount: expect.anything() }) }));
  });

  it("lists only the caller's recent visible presets with safe creator metadata", async () => {
    database.orderBy.mockReturnValue(database);
    database.limit.mockResolvedValueOnce([{ id: 8, userId: 52, name: "รอบทีม", startDate: "2026-08-01", endDate: "2026-08-31", isShared: true, creatorName: "ผู้ดูแลทีม", updatedAt: new Date("2026-08-20"), lastUsedAt: new Date("2026-08-21") }]);

    await expect(caller("admin", 41).listRecentDashboardRangePresets({ limit: 4 })).resolves.toMatchObject([{ id: 8, creatorName: "ผู้ดูแลทีม", isOwner: false }]);
    expect(database.innerJoin).toHaveBeenCalledTimes(2);
  });

  it("pins only a still-visible preset for the authenticated admin and permits owner-scoped unpin", async () => {
    database.limit.mockResolvedValueOnce([{ id: 8 }]);
    await expect(caller("admin", 41).setDashboardRangePresetPin({ id: 8, isPinned: true })).resolves.toEqual({ success: true });
    expect(database.values).toHaveBeenCalledWith(expect.objectContaining({ userId: 41, presetId: 8, pinnedAt: expect.any(Date) }));
    expect(database.onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({ set: { pinnedAt: expect.any(Date) } }));

    database.limit.mockResolvedValueOnce([{ id: 8 }]);
    await expect(caller("admin", 41).setDashboardRangePresetPin({ id: 8, isPinned: false })).resolves.toEqual({ success: true });
    expect(database.delete).toHaveBeenCalledTimes(1);
  });

  it("clears only the authenticated admin's recent preset history", async () => {
    await expect(caller("admin", 41).clearDashboardRangePresetHistory()).resolves.toEqual({ success: true });
    expect(database.delete).toHaveBeenCalledTimes(1);
    expect(database.where).toHaveBeenCalledTimes(1);
  });

  it("reorders exactly the caller's complete pin set and rejects incomplete ordering", async () => {
    database.where.mockResolvedValueOnce([{ presetId: 8 }, { presetId: 9 }]);
    await expect(caller("admin", 41).reorderDashboardRangePresetPins({ presetIds: [9, 8] })).resolves.toEqual({ success: true });
    expect(database.update).toHaveBeenCalledTimes(2);
    expect(database.set).toHaveBeenNthCalledWith(1, { sortOrder: 0 });
    expect(database.set).toHaveBeenNthCalledWith(2, { sortOrder: 1 });

    database.where.mockResolvedValueOnce([{ presetId: 8 }, { presetId: 9 }]);
    await expect(caller("admin", 41).reorderDashboardRangePresetPins({ presetIds: [8] })).rejects.toThrow("ลำดับหมุดไม่ตรง");
  });

  it("resets only the caller's pins to the deterministic default ordering", async () => {
    database.orderBy.mockResolvedValueOnce([{ presetId: 9 }, { presetId: 8 }]);
    await expect(caller("admin", 41).resetDashboardRangePresetPinOrder()).resolves.toEqual({ success: true, count: 2 });
    expect(database.update).toHaveBeenCalledTimes(2);
    expect(database.set).toHaveBeenNthCalledWith(1, { sortOrder: 0 });
    expect(database.set).toHaveBeenNthCalledWith(2, { sortOrder: 1 });
  });

  it("sorts only the caller's pinned presets from their recorded usage frequency", async () => {
    database.orderBy.mockResolvedValueOnce([{ presetId: 8 }, { presetId: 9 }]);
    await expect(caller("admin", 41).sortDashboardRangePresetPinsByUsage()).resolves.toEqual({ success: true, count: 2 });
    expect(database.leftJoin).toHaveBeenCalledTimes(1);
    expect(database.update).toHaveBeenCalledTimes(2);
    expect(database.set).toHaveBeenNthCalledWith(1, { sortOrder: 0 });
    expect(database.set).toHaveBeenNthCalledWith(2, { sortOrder: 1 });
  });

  it("clears only the authenticated admin's pinned preset rows", async () => {
    await expect(caller("admin", 41).clearDashboardRangePresetPins()).resolves.toEqual({ success: true });
    expect(database.delete).toHaveBeenCalledTimes(1);
    expect(database.where).toHaveBeenCalledTimes(1);
  });
});
