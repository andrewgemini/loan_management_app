import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users, loans, loanRequests, loanPayments, notificationPreferenceAuditLogs, userDashboardPreferences, userDashboardRangePresets, userDashboardPresetRecentUses, userDashboardPresetPins, userDashboardPresetCategories, userDashboardPresetCategoryAssignments, userDashboardPresetCategoryMoveHistory } from "../../drizzle/schema";
import { adminExportPermissions, reportDownloadHistory } from "../../drizzle/schema";
import { asc, desc, eq, and, gte, inArray, isNotNull, isNull, like, lt, or, sql } from "drizzle-orm";
import { getLoanTypeDistribution, getPaymentStatusDistribution } from "../adminAnalytics";
import { buildDailyPaymentTrend, getDashboardComparisonWindow, getDashboardRangeWindow, type DashboardComparisonMode, type DashboardTimeRange } from "../dashboardTimeUtils";
import { deleteActivityHistoryFilterPreset, getActivityHistoryFilterPresets, saveActivityHistoryFilterPreset } from "../db";
import { recordNotificationPreferenceAudit } from "../notificationPreferencesDb";
import { randomUUID } from "crypto";
import {
  decideExportApprovalRequest,
  getGovernanceAnalytics,
  getEffectiveExportPermissions,
  getExportSecurityPolicy,
  getOwnExportApprovalRequests,
  getPendingExportApprovalRequests,
  getRecentExportSecurityEvents,
  getReportDownloads,
  recordReportDownload,
  requestHighSensitivityExport,
  runReportDownloadHistoryRetention,
  saveExportPermissions,
  saveExportSecurityPolicy,
  validateApprovedExportRequest,
  type ExportPermissionSet,
} from "../reportGovernanceDb";

const dashboardTrendInput = z.object({
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  comparisonMode: z.enum(["matching_period", "previous_month", "previous_quarter"]).default("matching_period"),
}).refine((value) => Boolean(value.startDate) === Boolean(value.endDate), { message: "กรุณาระบุวันเริ่มและวันสิ้นสุดให้ครบ", path: ["endDate"] }).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น", path: ["endDate"] }).refine((value) => !value.startDate || !value.endDate || (Date.parse(`${value.endDate}T00:00:00.000Z`) - Date.parse(`${value.startDate}T00:00:00.000Z`)) / 86400000 <= 365, { message: "Custom Date Range ต้องไม่เกิน 366 วัน", path: ["endDate"] }).default({ days: 30, comparisonMode: "matching_period" });

const dashboardPresetCategoryAppearanceInput = z.object({
  color: z.enum(["blue", "violet", "teal", "amber", "rose"]),
  icon: z.enum(["folder", "briefcase", "flag", "star", "bookmark"]),
});

function parsePresetMoveSnapshot(value: string, nullable = false): Array<number | null> | null {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((item) => item !== null && (!Number.isInteger(item) || item <= 0) || (!nullable && item === null))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const adminRouter = router({
  getDashboardPreferences: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [preference] = await db.select().from(userDashboardPreferences).where(eq(userDashboardPreferences.userId, ctx.user.id)).limit(1);
    return preference ?? { customRangeStartDate: null, customRangeEndDate: null, comparisonMode: "matching_period" as const };
  }),

  saveDashboardPreferences: protectedProcedure.input(dashboardTrendInput.refine((value) => Boolean(value.startDate && value.endDate), { message: "ต้องมี Custom Date Range ก่อนบันทึกเป็นค่าเริ่มต้น", path: ["startDate"] })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.insert(userDashboardPreferences).values({ userId: ctx.user.id, customRangeStartDate: input.startDate!, customRangeEndDate: input.endDate!, comparisonMode: input.comparisonMode }).onDuplicateKeyUpdate({ set: { customRangeStartDate: input.startDate!, customRangeEndDate: input.endDate!, comparisonMode: input.comparisonMode } });
    return { success: true };
  }),

  resetDashboardPreferences: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.delete(userDashboardPreferences).where(eq(userDashboardPreferences.userId, ctx.user.id));
    return { success: true };
  }),

  listDashboardRangePresets: protectedProcedure.input(z.object({
    search: z.string().trim().max(80).optional(),
    creatorSearch: z.string().trim().max(80).optional(),
    sort: z.enum(["updated_desc", "name_asc", "name_desc"]).default("updated_desc"),
    scope: z.enum(["all", "private", "team"]).default("all"),
  }).default({ sort: "updated_desc", scope: "all" })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่ดู Preset ของทีมได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const ownPrivate = and(eq(userDashboardRangePresets.userId, ctx.user.id), eq(userDashboardRangePresets.isShared, false));
    const teamShared = eq(userDashboardRangePresets.isShared, true);
    const visibility = input.scope === "private" ? ownPrivate : input.scope === "team" ? teamShared : or(ownPrivate, teamShared);
    const conditions = [visibility];
    if (input.search) conditions.push(like(userDashboardRangePresets.name, `%${input.search}%`));
    if (input.creatorSearch) conditions.push(like(users.name, `%${input.creatorSearch}%`));
    const condition = and(...conditions);
    const orderBy = input.sort === "name_asc" ? asc(userDashboardRangePresets.name) : input.sort === "name_desc" ? desc(userDashboardRangePresets.name) : desc(userDashboardRangePresets.updatedAt);
    const presets = await db.select({
      id: userDashboardRangePresets.id,
      userId: userDashboardRangePresets.userId,
      name: userDashboardRangePresets.name,
      startDate: userDashboardRangePresets.startDate,
      endDate: userDashboardRangePresets.endDate,
      isShared: userDashboardRangePresets.isShared,
      createdAt: userDashboardRangePresets.createdAt,
      updatedAt: userDashboardRangePresets.updatedAt,
      creatorName: users.name,
      pinnedAt: userDashboardPresetPins.pinnedAt,
      pinSortOrder: userDashboardPresetPins.sortOrder,
      usageCount: userDashboardPresetRecentUses.usageCount,
      categoryId: userDashboardPresetCategories.id,
      categoryName: userDashboardPresetCategories.name,
      categoryColor: userDashboardPresetCategories.color,
      categoryIcon: userDashboardPresetCategories.icon,
    }).from(userDashboardRangePresets).innerJoin(users, eq(userDashboardRangePresets.userId, users.id)).leftJoin(userDashboardPresetPins, and(eq(userDashboardPresetPins.presetId, userDashboardRangePresets.id), eq(userDashboardPresetPins.userId, ctx.user.id))).leftJoin(userDashboardPresetRecentUses, and(eq(userDashboardPresetRecentUses.presetId, userDashboardRangePresets.id), eq(userDashboardPresetRecentUses.userId, ctx.user.id))).leftJoin(userDashboardPresetCategoryAssignments, and(eq(userDashboardPresetCategoryAssignments.presetId, userDashboardRangePresets.id), eq(userDashboardPresetCategoryAssignments.userId, ctx.user.id))).leftJoin(userDashboardPresetCategories, and(eq(userDashboardPresetCategories.id, userDashboardPresetCategoryAssignments.categoryId), eq(userDashboardPresetCategories.userId, ctx.user.id))).where(condition).orderBy(desc(userDashboardPresetPins.pinnedAt), asc(userDashboardPresetPins.sortOrder), orderBy, desc(userDashboardRangePresets.id));
    return presets.map((preset) => ({ ...preset, creatorName: preset.creatorName || "ไม่ระบุผู้สร้าง", isPinned: Boolean(preset.pinnedAt), usageCount: preset.usageCount ?? 0, isOwner: preset.userId === ctx.user.id }));
  }),

  listDashboardPresetCategories: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่ดูหมวดหมู่ Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    return db.select({ id: userDashboardPresetCategories.id, name: userDashboardPresetCategories.name, color: userDashboardPresetCategories.color, icon: userDashboardPresetCategories.icon, presetCount: sql<number>`count(${userDashboardPresetCategoryAssignments.id})`, createdAt: userDashboardPresetCategories.createdAt, updatedAt: userDashboardPresetCategories.updatedAt }).from(userDashboardPresetCategories).leftJoin(userDashboardPresetCategoryAssignments, and(eq(userDashboardPresetCategoryAssignments.categoryId, userDashboardPresetCategories.id), eq(userDashboardPresetCategoryAssignments.userId, ctx.user.id))).where(eq(userDashboardPresetCategories.userId, ctx.user.id)).groupBy(userDashboardPresetCategories.id, userDashboardPresetCategories.name, userDashboardPresetCategories.color, userDashboardPresetCategories.icon, userDashboardPresetCategories.createdAt, userDashboardPresetCategories.updatedAt).orderBy(asc(userDashboardPresetCategories.name), asc(userDashboardPresetCategories.id));
  }),

  createDashboardPresetCategory: protectedProcedure.input(z.object({ name: z.string().trim().min(1, "กรุณาระบุชื่อหมวดหมู่").max(80) }).merge(dashboardPresetCategoryAppearanceInput)).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่สร้างหมวดหมู่ Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const result = await db.insert(userDashboardPresetCategories).values({ userId: ctx.user.id, name: input.name, color: input.color, icon: input.icon });
    return { id: Number(result[0].insertId), name: input.name, color: input.color, icon: input.icon };
  }),

  updateDashboardPresetCategoryAppearance: protectedProcedure.input(z.object({ id: z.number().int().positive() }).merge(dashboardPresetCategoryAppearanceInput)).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขรูปแบบหมวดหมู่ Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.update(userDashboardPresetCategories).set({ color: input.color, icon: input.icon, updatedAt: new Date() }).where(and(eq(userDashboardPresetCategories.id, input.id), eq(userDashboardPresetCategories.userId, ctx.user.id)));
    return { success: true };
  }),

  renameDashboardPresetCategory: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1, "กรุณาระบุชื่อหมวดหมู่").max(80) })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนชื่อหมวดหมู่ Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.update(userDashboardPresetCategories).set({ name: input.name, updatedAt: new Date() }).where(and(eq(userDashboardPresetCategories.id, input.id), eq(userDashboardPresetCategories.userId, ctx.user.id)));
    return { success: true };
  }),

  deleteDashboardPresetCategory: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่ลบหมวดหมู่ Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.delete(userDashboardPresetCategoryAssignments).where(and(eq(userDashboardPresetCategoryAssignments.userId, ctx.user.id), eq(userDashboardPresetCategoryAssignments.categoryId, input.id)));
    await db.delete(userDashboardPresetCategories).where(and(eq(userDashboardPresetCategories.id, input.id), eq(userDashboardPresetCategories.userId, ctx.user.id)));
    return { success: true };
  }),

  setDashboardRangePresetCategory: protectedProcedure.input(z.object({ presetId: z.number().int().positive(), categoryId: z.number().int().positive().nullable() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่จัดหมวดหมู่ Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [preset] = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and(eq(userDashboardRangePresets.id, input.presetId), or(eq(userDashboardRangePresets.userId, ctx.user.id), eq(userDashboardRangePresets.isShared, true)))).limit(1);
    if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบ Preset ที่จัดหมวดหมู่ได้" });
    if (input.categoryId === null) {
      await db.delete(userDashboardPresetCategoryAssignments).where(and(eq(userDashboardPresetCategoryAssignments.userId, ctx.user.id), eq(userDashboardPresetCategoryAssignments.presetId, input.presetId)));
      return { success: true };
    }
    const [category] = await db.select({ id: userDashboardPresetCategories.id }).from(userDashboardPresetCategories).where(and(eq(userDashboardPresetCategories.id, input.categoryId), eq(userDashboardPresetCategories.userId, ctx.user.id))).limit(1);
    if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบหมวดหมู่ Preset" });
    await db.insert(userDashboardPresetCategoryAssignments).values({ userId: ctx.user.id, presetId: input.presetId, categoryId: input.categoryId }).onDuplicateKeyUpdate({ set: { categoryId: input.categoryId } });
    return { success: true };
  }),

  setDashboardRangePresetCategories: protectedProcedure.input(z.object({ presetIds: z.array(z.number().int().positive()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, "Preset ต้องไม่ซ้ำกัน"), categoryId: z.number().int().positive().nullable() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่จัดหมวดหมู่ Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const visiblePresets = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and(inArray(userDashboardRangePresets.id, input.presetIds), or(eq(userDashboardRangePresets.userId, ctx.user.id), eq(userDashboardRangePresets.isShared, true))));
    if (visiblePresets.length !== input.presetIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "พบ Preset ที่จัดหมวดหมู่ไม่ได้" });
    const existingAssignments = await db.select({ presetId: userDashboardPresetCategoryAssignments.presetId, categoryId: userDashboardPresetCategoryAssignments.categoryId }).from(userDashboardPresetCategoryAssignments).where(and(eq(userDashboardPresetCategoryAssignments.userId, ctx.user.id), inArray(userDashboardPresetCategoryAssignments.presetId, input.presetIds)));
    const currentCategories = new Map(existingAssignments.map((assignment) => [assignment.presetId, assignment.categoryId]));
    const previousCategoryIds = input.presetIds.map((presetId) => currentCategories.get(presetId) ?? null);
    const changed = previousCategoryIds.some((categoryId) => categoryId !== input.categoryId);
    if (input.categoryId === null) {
      await db.delete(userDashboardPresetCategoryAssignments).where(and(eq(userDashboardPresetCategoryAssignments.userId, ctx.user.id), inArray(userDashboardPresetCategoryAssignments.presetId, input.presetIds)));
    } else {
      const [category] = await db.select({ id: userDashboardPresetCategories.id }).from(userDashboardPresetCategories).where(and(eq(userDashboardPresetCategories.id, input.categoryId), eq(userDashboardPresetCategories.userId, ctx.user.id))).limit(1);
      if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบหมวดหมู่ Preset" });
      await db.insert(userDashboardPresetCategoryAssignments).values(input.presetIds.map((presetId) => ({ userId: ctx.user.id, presetId, categoryId: input.categoryId! }))).onDuplicateKeyUpdate({ set: { categoryId: input.categoryId } });
    }
    if (!changed) return { success: true, count: input.presetIds.length, historyId: null };
    const result = await db.insert(userDashboardPresetCategoryMoveHistory).values({ userId: ctx.user.id, presetIds: JSON.stringify(input.presetIds), previousCategoryIds: JSON.stringify(previousCategoryIds), destinationCategoryId: input.categoryId });
    return { success: true, count: input.presetIds.length, historyId: Number(result[0].insertId) };
  }),

  listDashboardPresetCategoryMoveHistory: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่ดูประวัติการย้าย Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const rows = await db.select({ id: userDashboardPresetCategoryMoveHistory.id, presetIds: userDashboardPresetCategoryMoveHistory.presetIds, destinationCategoryId: userDashboardPresetCategoryMoveHistory.destinationCategoryId, undoneAt: userDashboardPresetCategoryMoveHistory.undoneAt, createdAt: userDashboardPresetCategoryMoveHistory.createdAt }).from(userDashboardPresetCategoryMoveHistory).where(eq(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id)).orderBy(desc(userDashboardPresetCategoryMoveHistory.createdAt), desc(userDashboardPresetCategoryMoveHistory.id)).limit(10);
    return rows.flatMap((row) => {
      const presetIds = parsePresetMoveSnapshot(row.presetIds);
      return presetIds ? [{ id: row.id, presetCount: presetIds.length, destinationCategoryId: row.destinationCategoryId, undoneAt: row.undoneAt, createdAt: row.createdAt }] : [];
    });
  }),

  undoDashboardPresetCategoryMove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่ย้อนกลับการย้าย Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [latestMove] = await db.select({ id: userDashboardPresetCategoryMoveHistory.id, undoneAt: userDashboardPresetCategoryMoveHistory.undoneAt }).from(userDashboardPresetCategoryMoveHistory).where(eq(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id)).orderBy(desc(userDashboardPresetCategoryMoveHistory.createdAt), desc(userDashboardPresetCategoryMoveHistory.id)).limit(1);
    if (!latestMove || latestMove.id !== input.id || latestMove.undoneAt) throw new TRPCError({ code: "CONFLICT", message: "ย้อนกลับได้เฉพาะการย้าย Preset ล่าสุด" });
    const [history] = await db.select().from(userDashboardPresetCategoryMoveHistory).where(and(eq(userDashboardPresetCategoryMoveHistory.id, input.id), eq(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id), isNull(userDashboardPresetCategoryMoveHistory.undoneAt))).limit(1);
    if (!history) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบประวัติการย้าย Preset ที่ย้อนกลับได้" });
    const presetIds = parsePresetMoveSnapshot(history.presetIds);
    const previousCategoryIds = parsePresetMoveSnapshot(history.previousCategoryIds, true);
    if (!presetIds || !previousCategoryIds || presetIds.length !== previousCategoryIds.length || new Set(presetIds).size !== presetIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "ข้อมูลประวัติการย้าย Preset ไม่ถูกต้อง" });
    const visiblePresets = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and(inArray(userDashboardRangePresets.id, presetIds as number[]), or(eq(userDashboardRangePresets.userId, ctx.user.id), eq(userDashboardRangePresets.isShared, true))));
    if (visiblePresets.length !== presetIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "พบ Preset ที่ไม่สามารถย้อนกลับได้" });
    const categoryIds = Array.from(new Set(previousCategoryIds.filter((categoryId): categoryId is number => categoryId !== null)));
    if (categoryIds.length > 0) {
      const categories = await db.select({ id: userDashboardPresetCategories.id }).from(userDashboardPresetCategories).where(and(eq(userDashboardPresetCategories.userId, ctx.user.id), inArray(userDashboardPresetCategories.id, categoryIds)));
      if (categories.length !== categoryIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "พบโฟลเดอร์เดิมที่ไม่สามารถย้อนกลับได้" });
    }
    const assignments = (presetIds as number[]).map((presetId, index) => ({ presetId, categoryId: previousCategoryIds[index] }));
    const unassignedIds = assignments.filter((assignment) => assignment.categoryId === null).map((assignment) => assignment.presetId);
    const assignedRows = assignments.filter((assignment): assignment is { presetId: number; categoryId: number } => assignment.categoryId !== null).map((assignment) => ({ userId: ctx.user.id, presetId: assignment.presetId, categoryId: assignment.categoryId }));
    if (unassignedIds.length > 0) await db.delete(userDashboardPresetCategoryAssignments).where(and(eq(userDashboardPresetCategoryAssignments.userId, ctx.user.id), inArray(userDashboardPresetCategoryAssignments.presetId, unassignedIds)));
    if (assignedRows.length > 0) await db.insert(userDashboardPresetCategoryAssignments).values(assignedRows).onDuplicateKeyUpdate({ set: { categoryId: sql`values(${userDashboardPresetCategoryAssignments.categoryId})` } });
    await db.update(userDashboardPresetCategoryMoveHistory).set({ undoneAt: new Date() }).where(and(eq(userDashboardPresetCategoryMoveHistory.id, input.id), eq(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id), isNull(userDashboardPresetCategoryMoveHistory.undoneAt)));
    return { success: true, count: presetIds.length };
  }),

  redoDashboardPresetCategoryMove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่ทำซ้ำการย้าย Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [latestMove] = await db.select({ id: userDashboardPresetCategoryMoveHistory.id, undoneAt: userDashboardPresetCategoryMoveHistory.undoneAt }).from(userDashboardPresetCategoryMoveHistory).where(eq(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id)).orderBy(desc(userDashboardPresetCategoryMoveHistory.createdAt), desc(userDashboardPresetCategoryMoveHistory.id)).limit(1);
    if (!latestMove || latestMove.id !== input.id || !latestMove.undoneAt) throw new TRPCError({ code: "CONFLICT", message: "ทำซ้ำได้เฉพาะการย้าย Preset ล่าสุดที่ย้อนกลับไป" });
    const [history] = await db.select().from(userDashboardPresetCategoryMoveHistory).where(and(eq(userDashboardPresetCategoryMoveHistory.id, input.id), eq(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id), isNotNull(userDashboardPresetCategoryMoveHistory.undoneAt))).limit(1);
    if (!history) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบประวัติการย้าย Preset ที่ทำซ้ำได้" });
    const presetIds = parsePresetMoveSnapshot(history.presetIds);
    if (!presetIds || new Set(presetIds).size !== presetIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "ข้อมูลประวัติการย้าย Preset ไม่ถูกต้อง" });
    const visiblePresets = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and(inArray(userDashboardRangePresets.id, presetIds as number[]), or(eq(userDashboardRangePresets.userId, ctx.user.id), eq(userDashboardRangePresets.isShared, true))));
    if (visiblePresets.length !== presetIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "พบ Preset ที่ไม่สามารถทำซ้ำการย้ายได้" });
    if (history.destinationCategoryId === null) {
      await db.delete(userDashboardPresetCategoryAssignments).where(and(eq(userDashboardPresetCategoryAssignments.userId, ctx.user.id), inArray(userDashboardPresetCategoryAssignments.presetId, presetIds as number[])));
    } else {
      const [category] = await db.select({ id: userDashboardPresetCategories.id }).from(userDashboardPresetCategories).where(and(eq(userDashboardPresetCategories.id, history.destinationCategoryId), eq(userDashboardPresetCategories.userId, ctx.user.id))).limit(1);
      if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบโฟลเดอร์ปลายทางสำหรับทำซ้ำการย้าย" });
      await db.insert(userDashboardPresetCategoryAssignments).values((presetIds as number[]).map((presetId) => ({ userId: ctx.user.id, presetId, categoryId: history.destinationCategoryId! }))).onDuplicateKeyUpdate({ set: { categoryId: history.destinationCategoryId } });
    }
    await db.update(userDashboardPresetCategoryMoveHistory).set({ undoneAt: null }).where(and(eq(userDashboardPresetCategoryMoveHistory.id, input.id), eq(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id), isNotNull(userDashboardPresetCategoryMoveHistory.undoneAt)));
    return { success: true, count: presetIds.length };
  }),

  saveDashboardRangePreset: protectedProcedure.input(z.object({
    name: z.string().trim().min(1, "กรุณาตั้งชื่อ Preset").max(80),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isShared: z.boolean().default(false),
  }).refine((input) => input.startDate <= input.endDate, { message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น", path: ["endDate"] }).refine((input) => (Date.parse(`${input.endDate}T00:00:00.000Z`) - Date.parse(`${input.startDate}T00:00:00.000Z`)) / 86400000 <= 365, { message: "Custom Date Range ต้องไม่เกิน 366 วัน", path: ["endDate"] })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการ Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [existing] = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and(eq(userDashboardRangePresets.userId, ctx.user.id), eq(userDashboardRangePresets.name, input.name))).limit(1);
    if (existing) {
      await db.update(userDashboardRangePresets).set({ startDate: input.startDate, endDate: input.endDate, isShared: input.isShared, updatedAt: new Date() }).where(eq(userDashboardRangePresets.id, existing.id));
      return { id: existing.id, updated: true };
    }
    const result = await db.insert(userDashboardRangePresets).values({ userId: ctx.user.id, ...input });
    return { id: Number(result[0].insertId), updated: false };
  }),

  deleteDashboardRangePreset: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการ Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.delete(userDashboardRangePresets).where(and(eq(userDashboardRangePresets.id, input.id), eq(userDashboardRangePresets.userId, ctx.user.id)));
    return { success: true };
  }),

  setDashboardRangePresetSharing: protectedProcedure.input(z.object({ id: z.number().int().positive(), isShared: z.boolean() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่แชร์ Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.update(userDashboardRangePresets).set({ isShared: input.isShared, updatedAt: new Date() }).where(and(eq(userDashboardRangePresets.id, input.id), eq(userDashboardRangePresets.userId, ctx.user.id)));
    return { success: true };
  }),

  setDashboardRangePresetPin: protectedProcedure.input(z.object({ id: z.number().int().positive(), isPinned: z.boolean() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่ปักหมุด Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [preset] = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and(eq(userDashboardRangePresets.id, input.id), or(eq(userDashboardRangePresets.userId, ctx.user.id), eq(userDashboardRangePresets.isShared, true)))).limit(1);
    if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบ Preset ที่ปักหมุดได้" });
    if (input.isPinned) {
      const pinnedAt = new Date();
      await db.insert(userDashboardPresetPins).values({ userId: ctx.user.id, presetId: preset.id, pinnedAt }).onDuplicateKeyUpdate({ set: { pinnedAt } });
    } else {
      await db.delete(userDashboardPresetPins).where(and(eq(userDashboardPresetPins.userId, ctx.user.id), eq(userDashboardPresetPins.presetId, preset.id)));
    }
    return { success: true };
  }),

  reorderDashboardRangePresetPins: protectedProcedure.input(z.object({ presetIds: z.array(z.number().int().positive()).min(1).max(100) }).refine((input) => new Set(input.presetIds).size === input.presetIds.length, { message: "Preset ซ้ำในลำดับที่ส่งมา" })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่จัดลำดับหมุดได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const pinnedRows = await db.select({ presetId: userDashboardPresetPins.presetId }).from(userDashboardPresetPins).where(eq(userDashboardPresetPins.userId, ctx.user.id));
    const pinnedIds = new Set(pinnedRows.map((row) => row.presetId));
    if (pinnedIds.size !== input.presetIds.length || input.presetIds.some((id) => !pinnedIds.has(id))) throw new TRPCError({ code: "BAD_REQUEST", message: "ลำดับหมุดไม่ตรงกับ Preset ที่ปักหมุดอยู่" });
    await Promise.all(input.presetIds.map((presetId, sortOrder) => db.update(userDashboardPresetPins).set({ sortOrder }).where(and(eq(userDashboardPresetPins.userId, ctx.user.id), eq(userDashboardPresetPins.presetId, presetId)))));
    return { success: true };
  }),

  resetDashboardRangePresetPinOrder: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่รีเซ็ตลำดับหมุดได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const pinnedRows = await db.select({ presetId: userDashboardPresetPins.presetId }).from(userDashboardPresetPins).where(eq(userDashboardPresetPins.userId, ctx.user.id)).orderBy(desc(userDashboardPresetPins.pinnedAt), desc(userDashboardPresetPins.id));
    await Promise.all(pinnedRows.map((row, sortOrder) => db.update(userDashboardPresetPins).set({ sortOrder }).where(and(eq(userDashboardPresetPins.userId, ctx.user.id), eq(userDashboardPresetPins.presetId, row.presetId)))));
    return { success: true, count: pinnedRows.length };
  }),

  sortDashboardRangePresetPinsByUsage: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่จัดลำดับหมุดตามการใช้งานได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const pinnedRows = await db
      .select({ presetId: userDashboardPresetPins.presetId })
      .from(userDashboardPresetPins)
      .leftJoin(userDashboardPresetRecentUses, and(eq(userDashboardPresetRecentUses.userId, ctx.user.id), eq(userDashboardPresetRecentUses.presetId, userDashboardPresetPins.presetId)))
      .where(eq(userDashboardPresetPins.userId, ctx.user.id))
      .orderBy(desc(sql`COALESCE(${userDashboardPresetRecentUses.usageCount}, 0)`), desc(userDashboardPresetRecentUses.lastUsedAt), desc(userDashboardPresetPins.pinnedAt), desc(userDashboardPresetPins.id));
    await Promise.all(pinnedRows.map((row, sortOrder) => db.update(userDashboardPresetPins).set({ sortOrder }).where(and(eq(userDashboardPresetPins.userId, ctx.user.id), eq(userDashboardPresetPins.presetId, row.presetId)))));
    return { success: true, count: pinnedRows.length };
  }),

  clearDashboardRangePresetPins: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่ล้างหมุดได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.delete(userDashboardPresetPins).where(eq(userDashboardPresetPins.userId, ctx.user.id));
    return { success: true };
  }),

  copyDashboardRangePresetToPrivate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่คัดลอก Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [source] = await db.select({ id: userDashboardRangePresets.id, name: userDashboardRangePresets.name, startDate: userDashboardRangePresets.startDate, endDate: userDashboardRangePresets.endDate, isShared: userDashboardRangePresets.isShared }).from(userDashboardRangePresets).where(and(eq(userDashboardRangePresets.id, input.id), or(eq(userDashboardRangePresets.userId, ctx.user.id), eq(userDashboardRangePresets.isShared, true)))).limit(1);
    if (!source?.isShared) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบ Preset ของทีมที่คัดลอกได้" });

    const baseName = `${source.name} · สำเนา`.slice(0, 80);
    let copyName = baseName;
    for (let suffix = 2; suffix <= 99; suffix += 1) {
      const [existing] = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and(eq(userDashboardRangePresets.userId, ctx.user.id), eq(userDashboardRangePresets.name, copyName))).limit(1);
      if (!existing) break;
      copyName = `${baseName.slice(0, Math.max(1, 80 - String(suffix).length - 1))} ${suffix}`;
    }

    const result = await db.insert(userDashboardRangePresets).values({ userId: ctx.user.id, name: copyName, startDate: source.startDate, endDate: source.endDate, isShared: false });
    return { id: Number(result[0].insertId), name: copyName };
  }),

  markDashboardRangePresetUsed: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่ใช้ Preset ได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [preset] = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and(eq(userDashboardRangePresets.id, input.id), or(eq(userDashboardRangePresets.userId, ctx.user.id), eq(userDashboardRangePresets.isShared, true)))).limit(1);
    if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบ Preset ที่ใช้งานได้" });
    const lastUsedAt = new Date();
    await db.insert(userDashboardPresetRecentUses).values({ userId: ctx.user.id, presetId: preset.id, lastUsedAt, usageCount: 1 }).onDuplicateKeyUpdate({ set: { lastUsedAt, usageCount: sql`${userDashboardPresetRecentUses.usageCount} + 1` } });
    return { success: true };
  }),

  listRecentDashboardRangePresets: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(8).default(4) }).default({ limit: 4 })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่ดู Preset ล่าสุดได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const recentPresets = await db.select({
      id: userDashboardRangePresets.id,
      userId: userDashboardRangePresets.userId,
      name: userDashboardRangePresets.name,
      startDate: userDashboardRangePresets.startDate,
      endDate: userDashboardRangePresets.endDate,
      isShared: userDashboardRangePresets.isShared,
      updatedAt: userDashboardRangePresets.updatedAt,
      creatorName: users.name,
      lastUsedAt: userDashboardPresetRecentUses.lastUsedAt,
    }).from(userDashboardPresetRecentUses).innerJoin(userDashboardRangePresets, eq(userDashboardPresetRecentUses.presetId, userDashboardRangePresets.id)).innerJoin(users, eq(userDashboardRangePresets.userId, users.id)).where(and(eq(userDashboardPresetRecentUses.userId, ctx.user.id), or(eq(userDashboardRangePresets.userId, ctx.user.id), eq(userDashboardRangePresets.isShared, true)))).orderBy(desc(userDashboardPresetRecentUses.lastUsedAt), desc(userDashboardPresetRecentUses.id)).limit(input.limit);
    return recentPresets.map((preset) => ({ ...preset, creatorName: preset.creatorName || "ไม่ระบุผู้สร้าง", isOwner: preset.userId === ctx.user.id }));
  }),

  clearDashboardRangePresetHistory: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "เฉพาะผู้ดูแลระบบเท่านั้นที่ล้าง Preset ล่าสุดได้" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.delete(userDashboardPresetRecentUses).where(eq(userDashboardPresetRecentUses.userId, ctx.user.id));
    return { success: true };
  }),

  /**
   * ดู audit log ของ Notification Settings ทุกบัญชี (Admin only)
   * แสดงเฉพาะชื่อฟิลด์ที่เปลี่ยน ไม่เปิดเผย token หรือค่า settings
   */
  listNotificationPreferenceAuditLogs: protectedProcedure
    .input(z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      action: z.enum(["read", "updated", "reset", "line_connected", "line_disconnected", "pdf_exported"]).optional(),
      search: z.string().trim().min(1).max(160).optional(),
      sortBy: z.enum(["createdAt", "action"]).default("createdAt"),
      sortDirection: z.enum(["asc", "desc"]).default("desc"),
      limit: z.number().int().min(1).max(1000).default(500),
    }).refine((input) => !input.startDate || !input.endDate || input.startDate <= input.endDate, {
      message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น",
      path: ["endDate"],
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can view audit logs" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const conditions = [];
      if (input.startDate) conditions.push(gte(notificationPreferenceAuditLogs.createdAt, new Date(`${input.startDate}T00:00:00.000Z`)));
      if (input.endDate) {
        const exclusiveEnd = new Date(`${input.endDate}T00:00:00.000Z`);
        exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
        conditions.push(lt(notificationPreferenceAuditLogs.createdAt, exclusiveEnd));
      }
      if (input.action) conditions.push(eq(notificationPreferenceAuditLogs.action, input.action));
      if (input.search) {
        const needle = `%${input.search}%`;
        conditions.push(or(like(users.name, needle), like(users.email, needle)));
      }

      const sortColumn = input.sortBy === "action" ? notificationPreferenceAuditLogs.action : notificationPreferenceAuditLogs.createdAt;
      const order = input.sortDirection === "asc" ? asc : desc;
      return db.select({
        id: notificationPreferenceAuditLogs.id,
        userId: notificationPreferenceAuditLogs.userId,
        userName: users.name,
        userEmail: users.email,
        userRole: users.role,
        action: notificationPreferenceAuditLogs.action,
        changedFields: notificationPreferenceAuditLogs.changedFields,
        createdAt: notificationPreferenceAuditLogs.createdAt,
      })
        .from(notificationPreferenceAuditLogs)
        .innerJoin(users, eq(notificationPreferenceAuditLogs.userId, users.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(order(sortColumn), order(notificationPreferenceAuditLogs.id))
        .limit(input.limit);
    }),

  createAuditLogPdfExportReference: protectedProcedure.input(z.object({
    rowCount: z.number().int().min(0).max(1000),
    filterSummary: z.string().trim().max(1200).default(""),
    approvalRequestId: z.number().int().positive().optional(),
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can export audit logs" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canExportPdf) throw new TRPCError({ code: "FORBIDDEN", message: "PDF export is not permitted for this account" });
    const gate = await validateApprovedExportRequest({ userId: ctx.user.id, format: "pdf", rowCount: input.rowCount, filterSummary: input.filterSummary, approvalRequestId: input.approvalRequestId });
    if (!gate.allowed) throw new TRPCError({ code: "PRECONDITION_FAILED", message: gate.reason === "approval_required" ? "Approval is required before exporting this high-sensitivity report" : "Export approval is invalid or unavailable" });
    const referenceCode = `AUD-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const recorded = await recordNotificationPreferenceAudit(ctx.user.id, "pdf_exported", [`reference:${referenceCode}`]);
    if (!recorded) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not record PDF export reference" });
    return { referenceCode };
  }),

  getMyExportPermissions: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access export permissions" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    return permissions;
  }),

  recordAuditLogDownload: protectedProcedure.input(z.object({
    format: z.enum(["csv", "pdf"]),
    rowCount: z.number().int().min(0).max(1000),
    filterSummary: z.string().trim().max(1200).default(""),
    referenceCode: z.string().regex(/^AUD-\d{14}-[A-F0-9]{8}$/).optional(),
    approvalRequestId: z.number().int().positive().optional(),
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can record report downloads" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if ((input.format === "csv" && !permissions.canExportCsv) || (input.format === "pdf" && !permissions.canExportPdf)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Export is not permitted for this account" });
    }
    const recorded = await recordReportDownload({ userId: ctx.user.id, ...input });
    if (!recorded.allowed) throw new TRPCError({ code: "PRECONDITION_FAILED", message: recorded.reason === "approval_required" ? "Approval is required before exporting this high-sensitivity report" : "Export approval is invalid or unavailable" });
    return { success: true } as const;
  }),

  getExportSecurityPolicy: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access export policy" });
    const policy = await getExportSecurityPolicy();
    if (!policy) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export security policy is not available" });
    return policy;
  }),

  updateExportSecurityPolicy: protectedProcedure.input(z.object({
    highVolumeRowThreshold: z.number().int().min(1).max(1000),
    approvalRowThreshold: z.number().int().min(1).max(1000),
    retentionDays: z.number().int().min(30).max(3650),
    approvalExpiresHours: z.number().int().min(1).max(168),
    alertOwnerOnHighVolume: z.boolean(),
  }).refine(input => input.approvalRowThreshold >= input.highVolumeRowThreshold, {
    path: ["approvalRowThreshold"],
    message: "Approval threshold must be greater than or equal to the high-volume threshold",
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can manage export policy" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canManageExportPermissions) throw new TRPCError({ code: "FORBIDDEN", message: "Policy management is not permitted for this account" });
    return saveExportSecurityPolicy(ctx.user.id, input);
  }),

  requestHighSensitivityAuditLogExport: protectedProcedure.input(z.object({
    format: z.enum(["csv", "pdf"]),
    rowCount: z.number().int().min(1).max(1000),
    filterSummary: z.string().trim().max(1200).default(""),
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can request report export approval" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if ((input.format === "csv" && !permissions.canExportCsv) || (input.format === "pdf" && !permissions.canExportPdf)) throw new TRPCError({ code: "FORBIDDEN", message: "Export is not permitted for this account" });
    const policy = await getExportSecurityPolicy();
    if (!policy) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export security policy is not available" });
    if (input.rowCount < policy.approvalRowThreshold) throw new TRPCError({ code: "BAD_REQUEST", message: "This export does not require high-sensitivity approval" });
    return requestHighSensitivityExport({ userId: ctx.user.id, ...input });
  }),

  getMyExportApprovalRequests: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(50) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access export approval requests" });
    return getOwnExportApprovalRequests(ctx.user.id, input.limit);
  }),

  getPendingExportApprovalRequests: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can approve high-sensitivity exports" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canManageExportPermissions) throw new TRPCError({ code: "FORBIDDEN", message: "Approval authority is not permitted for this account" });
    return getPendingExportApprovalRequests(input.limit);
  }),

  decideExportApprovalRequest: protectedProcedure.input(z.object({
    requestId: z.number().int().positive(),
    approve: z.boolean(),
    reviewerNote: z.string().trim().max(500).optional(),
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can approve high-sensitivity exports" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canManageExportPermissions) throw new TRPCError({ code: "FORBIDDEN", message: "Approval authority is not permitted for this account" });
    const result = await decideExportApprovalRequest({ ...input, reviewerId: ctx.user.id });
    if (result.outcome === "self_approval") throw new TRPCError({ code: "FORBIDDEN", message: "Requesters cannot approve their own exports" });
    if (result.outcome === "not_found") throw new TRPCError({ code: "NOT_FOUND", message: "Approval request was not found" });
    if (result.outcome === "not_pending") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Approval request is no longer pending" });
    return { success: true, status: result.status } as const;
  }),

  getRecentExportSecurityEvents: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(50) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can view export security events" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canManageExportPermissions) throw new TRPCError({ code: "FORBIDDEN", message: "Security event access is not permitted for this account" });
    return getRecentExportSecurityEvents(input.limit);
  }),

  getGovernanceAnalytics: protectedProcedure.input(z.object({ days: z.number().int().min(7).max(90).default(30) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can view governance analytics" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canManageExportPermissions) throw new TRPCError({ code: "FORBIDDEN", message: "Governance analytics access is not permitted for this account" });
    const analytics = await getGovernanceAnalytics(input.days);
    if (!analytics) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Governance analytics are not available" });
    return analytics;
  }),

  runDownloadHistoryRetentionCleanup: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can run retention cleanup" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canManageExportPermissions) throw new TRPCError({ code: "FORBIDDEN", message: "Retention cleanup is not permitted for this account" });
    return runReportDownloadHistoryRetention(ctx.user.id);
  }),

  getMyReportDownloadHistory: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(50) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access download history" });
    return getReportDownloads(ctx.user.id, input.limit);
  }),

  verifyAuditLogPdfReference: protectedProcedure.input(z.object({ referenceCode: z.string().regex(/^AUD-\d{14}-[A-F0-9]{8}$/) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can verify report references" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canVerifyReferences) throw new TRPCError({ code: "FORBIDDEN", message: "Reference verification is not permitted for this account" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [record] = await db.select({ referenceCode: notificationPreferenceAuditLogs.changedFields, createdAt: notificationPreferenceAuditLogs.createdAt, exportedByName: users.name, exportedByEmail: users.email })
      .from(notificationPreferenceAuditLogs).innerJoin(users, eq(notificationPreferenceAuditLogs.userId, users.id))
      .where(and(eq(notificationPreferenceAuditLogs.action, "pdf_exported"), eq(notificationPreferenceAuditLogs.changedFields, `reference:${input.referenceCode}`))).limit(1);
    if (!record) return null;
    const [download] = await db.select({ downloadedAt: reportDownloadHistory.createdAt, rowCount: reportDownloadHistory.rowCount, filterSummary: reportDownloadHistory.filterSummary })
      .from(reportDownloadHistory).where(eq(reportDownloadHistory.referenceCode, input.referenceCode)).orderBy(desc(reportDownloadHistory.createdAt)).limit(1);
    return { referenceCode: input.referenceCode, exportedAt: record.createdAt, exportedByName: record.exportedByName, exportedByEmail: record.exportedByEmail, download };
  }),

  listAdminExportPermissions: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can manage export permissions" });
    const own = await getEffectiveExportPermissions(ctx.user.id);
    if (!own) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!own.canManageExportPermissions) throw new TRPCError({ code: "FORBIDDEN", message: "Permission management is not permitted for this account" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const rows = await db.select({ userId: users.id, name: users.name, email: users.email, canExportCsv: adminExportPermissions.canExportCsv, canExportPdf: adminExportPermissions.canExportPdf, canVerifyReferences: adminExportPermissions.canVerifyReferences, canViewTeamDownloadHistory: adminExportPermissions.canViewTeamDownloadHistory, canManageExportPermissions: adminExportPermissions.canManageExportPermissions })
      .from(users).leftJoin(adminExportPermissions, eq(users.id, adminExportPermissions.userId)).where(eq(users.role, "admin"));
    return rows.map((row) => ({ userId: row.userId, name: row.name, email: row.email, ...((row.canExportCsv === null || row.canExportCsv === undefined) ? { canExportCsv: true, canExportPdf: true, canVerifyReferences: true, canViewTeamDownloadHistory: true, canManageExportPermissions: true } : { canExportCsv: row.canExportCsv, canExportPdf: row.canExportPdf!, canVerifyReferences: row.canVerifyReferences!, canViewTeamDownloadHistory: row.canViewTeamDownloadHistory!, canManageExportPermissions: row.canManageExportPermissions! }) }));
  }),

  updateAdminExportPermissions: protectedProcedure.input(z.object({ userId: z.number().int().positive(), canExportCsv: z.boolean(), canExportPdf: z.boolean(), canVerifyReferences: z.boolean(), canViewTeamDownloadHistory: z.boolean(), canManageExportPermissions: z.boolean() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can manage export permissions" });
    const own = await getEffectiveExportPermissions(ctx.user.id);
    if (!own) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!own.canManageExportPermissions) throw new TRPCError({ code: "FORBIDDEN", message: "Permission management is not permitted for this account" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!target || target.role !== "admin") throw new TRPCError({ code: "BAD_REQUEST", message: "Export permissions can only be assigned to an admin account" });
    const permissions: ExportPermissionSet = { canExportCsv: input.canExportCsv, canExportPdf: input.canExportPdf, canVerifyReferences: input.canVerifyReferences, canViewTeamDownloadHistory: input.canViewTeamDownloadHistory, canManageExportPermissions: input.canManageExportPermissions };
    await saveExportPermissions(input.userId, permissions);
    return { success: true } as const;
  }),

  /**
   * ดึงรายชื่อผู้ใช้สำหรับแผงผู้ดูแลระบบ
   */
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can manage users" });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    return db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    }).from(users);
  }),

  /**
   * เปลี่ยนบทบาทผู้ใช้โดยผู้ดูแลระบบ
   */
  updateUserRole: protectedProcedure
    .input(z.object({ userId: z.number().int().positive(), role: z.enum(["borrower", "lender", "admin"]) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can manage users" });
      }
      if (input.userId === ctx.user.id && input.role !== "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่สามารถลดสิทธิ์บัญชีผู้ดูแลระบบปัจจุบันได้" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db.update(users).set({ role: input.role, updatedAt: new Date() }).where(eq(users.id, input.userId));
      return { success: true } as const;
    }),

  /**
   * ดึงข้อมูลสรุปของระบบ (Admin only)
   */
  getDashboardStats: protectedProcedure.query(async ({ ctx }) => {
    // ตรวจสอบว่าเป็น Admin
    if (ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only admins can access this endpoint",
      });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    // นับจำนวนผู้ใช้แต่ละประเภท
    const borrowers = await db
      .select()
      .from(users)
      .where(eq(users.role, "borrower"));
    const lenders = await db
      .select()
      .from(users)
      .where(eq(users.role, "lender"));
    const admins = await db
      .select()
      .from(users)
      .where(eq(users.role, "admin"));

    // นับจำนวนสัญญาตามสถานะ
    const allLoans = await db.select().from(loans);
    const closedLoans = allLoans.filter((l) => l.isClosed);
    const activeLoans = allLoans.filter((l) => !l.isClosed);

    // คำนวณเงินกู้รวม
    const totalPrincipal = allLoans.reduce((sum, loan) => {
      return sum + parseFloat(loan.principalAmount);
    }, 0);

    const totalPaid = allLoans.reduce((sum, loan) => {
      return sum + parseFloat(loan.totalPaid || "0");
    }, 0);

    const totalOutstanding = totalPrincipal - totalPaid;

    // คำนวณอัตราดอกเบี้ยเฉลี่ย
    const avgInterestRate =
      allLoans.length > 0
        ? allLoans.reduce((sum, loan) => sum + parseFloat(loan.interestRate), 0) /
          allLoans.length
        : 0;

    // นับคำขอกู้ตามสถานะ
    const allRequests = await db.select().from(loanRequests);
    const pendingRequests = allRequests.filter((r) => r.status === "pending");
    const approvedRequests = allRequests.filter((r) => r.status === "approved");
    const rejectedRequests = allRequests.filter((r) => r.status === "rejected");

    // นับการชำระเงิน
    const allPayments = await db.select().from(loanPayments);
    const verifiedPayments = allPayments.filter((p) => p.status === "verified");
    const pendingPayments = allPayments.filter((p) => p.status === "pending");

    return {
      users: {
        borrowers: borrowers.length,
        lenders: lenders.length,
        admins: admins.length,
        total: borrowers.length + lenders.length + admins.length,
      },
      loans: {
        total: allLoans.length,
        active: activeLoans.length,
        closed: closedLoans.length,
        totalPrincipal: Math.round(totalPrincipal * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        avgInterestRate: Math.round(avgInterestRate * 100) / 100,
      },
      requests: {
        total: allRequests.length,
        pending: pendingRequests.length,
        approved: approvedRequests.length,
        rejected: rejectedRequests.length,
      },
      payments: {
        total: allPayments.length,
        verified: verifiedPayments.length,
        pending: pendingPayments.length,
      },
    };
  }),

  getActivityHistory: protectedProcedure.input(z.object({
    limit: z.number().int().min(1).max(200).default(12),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น", path: ["endDate"] }).optional()).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access activity history" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [requests, payments, actors, allLoans] = await Promise.all([db.select().from(loanRequests), db.select().from(loanPayments), db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users), db.select({ id: loans.id, requestId: loans.requestId, lenderId: loans.lenderId }).from(loans)]);
    const actorById = new Map(actors.map((actor) => [actor.id, { name: actor.name || actor.email || "ไม่ระบุผู้ดำเนินการ", role: actor.role || "unknown" }]));
    const loanById = new Map(allLoans.map((loan) => [loan.id, loan]));
    const loanByRequestId = new Map(allLoans.map((loan) => [loan.requestId, loan]));
    const startDate = input?.startDate;
    const endDate = input?.endDate;
    return [
      ...requests.filter((request) => request.status !== "pending").map((request) => { const actor = actorById.get(request.approvedById || 0); const loan = loanByRequestId.get(request.id); const lender = actorById.get(loan?.lenderId || 0); return { id: `request-${request.id}`, status: request.status, loanId: loan?.id || null, title: request.status === "approved" ? "อนุมัติคำขอกู้" : "ปฏิเสธคำขอกู้", detail: `คำขอ #${request.id}`, actorName: actor?.name || "ไม่ระบุผู้ดำเนินการ", actorRole: actor?.role || "unknown", lenderId: loan?.lenderId || null, lenderName: lender?.name || "ไม่ระบุผู้ให้กู้", occurredAt: request.decidedAt || request.approvedAt || request.requestedAt }; }),
      ...payments.filter((payment) => payment.status !== "pending").map((payment) => { const actor = actorById.get(payment.verifiedById || 0); const loan = loanById.get(payment.loanId); const lender = actorById.get(loan?.lenderId || 0); return { id: `payment-${payment.id}`, status: payment.status, loanId: payment.loanId, title: payment.status === "verified" ? "ยืนยันการชำระเงิน" : "ปฏิเสธการชำระเงิน", detail: `รายการชำระ #${payment.id}`, actorName: actor?.name || "ไม่ระบุผู้ดำเนินการ", actorRole: actor?.role || "unknown", lenderId: loan?.lenderId || null, lenderName: lender?.name || "ไม่ระบุผู้ให้กู้", occurredAt: payment.verifiedAt || payment.paymentDate }; }),
    ].filter((activity) => {
      const activityDate = new Date(activity.occurredAt).toISOString().slice(0, 10);
      return (!startDate || activityDate >= startDate) && (!endDate || activityDate <= endDate);
    }).sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()).slice(0, input?.limit ?? 12);
  }),

  listActivityFilterPresets: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access activity filter presets" });
    return getActivityHistoryFilterPresets(ctx.user.id);
  }),

  saveActivityFilterPreset: protectedProcedure.input(z.object({
    name: z.string().trim().min(1).max(120), startDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/), eventType: z.string().max(160), actorName: z.string().max(255), actorRole: z.string().max(32), lenderId: z.number().int().positive().nullable(),
  }).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น", path: ["endDate"] })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can save activity filter presets" });
    const id = await saveActivityHistoryFilterPreset(ctx.user.id, input);
    return { id };
  }),

  deleteActivityFilterPreset: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can delete activity filter presets" });
    await deleteActivityHistoryFilterPreset(ctx.user.id, input.id);
    return { success: true } as const;
  }),

  /**
   * ดึงข้อมูลคำขอกู้ที่รอการอนุมัติ
   */
  getPendingRequests: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "lender") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only admins and lenders can access this endpoint",
      });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    const pendingRequests = await db
      .select()
      .from(loanRequests)
      .where(eq(loanRequests.status, "pending"));

    // เพิ่มข้อมูลผู้กู้
    const requestsWithBorrower = await Promise.all(
      pendingRequests.map(async (req) => {
        const borrower = await db
          .select()
          .from(users)
          .where(eq(users.id, req.borrowerId))
          .limit(1);

        return {
          ...req,
          borrowerName: borrower?.[0]?.name || "Unknown",
          borrowerEmail: borrower?.[0]?.email || "N/A",
        };
      })
    );

    return requestsWithBorrower;
  }),

  /**
   * ดึงข้อมูลการชำระเงินที่รอการตรวจสอบ
   */
  getPendingPaymentVerifications: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "lender") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only admins and lenders can access this endpoint",
      });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    const pendingPayments = await db
      .select()
      .from(loanPayments)
      .where(eq(loanPayments.status, "pending"));

    // เพิ่มข้อมูลสัญญาและผู้กู้
    const paymentsWithDetails = await Promise.all(
      pendingPayments.map(async (payment) => {
        const loan = await db
          .select()
          .from(loans)
          .where(eq(loans.id, payment.loanId))
          .limit(1);

        const borrower = await db
          .select()
          .from(users)
          .where(eq(users.id, loan?.[0]?.borrowerId || 0))
          .limit(1);

        return {
          ...payment,
          loanId: loan?.[0]?.id || 0,
          borrowerName: borrower?.[0]?.name || "Unknown",
          principalAmount: loan?.[0]?.principalAmount || "0",
        };
      })
    );

    return paymentsWithDetails;
  }),

  /**
   * ดึงข้อมูลกราฟ - เงินกู้ตามสถานะ
   */
  getLoanStatusChart: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only admins can access this endpoint",
      });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    const allLoans = await db.select().from(loans);

    const active = allLoans.filter((l) => !l.isClosed).length;
    const closed = allLoans.filter((l) => l.isClosed).length;

    return {
      labels: ["กำลังดำเนิน", "ปิดแล้ว"],
      data: [active, closed],
    };
  }),

  /**
   * ดึงข้อมูลกราฟ - ยอดคงค้างแยกตามสัญญา
   */
  getOutstandingChart: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access this endpoint" });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }

    const allLoans = await db.select().from(loans);
    const activeLoans = allLoans.filter((loan) => !loan.isClosed);
    return activeLoans.map((loan) => ({
      label: `สัญญา #${loan.id}`,
      value: Math.max(parseFloat(loan.principalAmount) - parseFloat(loan.totalPaid || "0"), 0),
    }));
  }),

  /**
   * ดึงข้อมูลกราฟ - การชำระเงินตามเดือน
   */
  getPaymentTrendChart: protectedProcedure.input(dashboardTrendInput).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only admins can access this endpoint",
      });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    const allPayments = await db.select().from(loanPayments);
    const range = input.startDate && input.endDate ? { startDate: input.startDate, endDate: input.endDate } : (input.days ?? 30) as DashboardTimeRange;
    return buildDailyPaymentTrend(allPayments, range);
  }),

  getDashboardKpiComparison: protectedProcedure.input(dashboardTrendInput).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access dashboard KPI comparison" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const range = input.startDate && input.endDate ? { startDate: input.startDate, endDate: input.endDate } : (input.days ?? 30) as DashboardTimeRange;
    const current = getDashboardRangeWindow(range);
    const previous = getDashboardComparisonWindow(range, input.comparisonMode as DashboardComparisonMode);
    const comparisonLabel = input.comparisonMode === "previous_month" ? "เทียบเดือนก่อน" : input.comparisonMode === "previous_quarter" ? "เทียบไตรมาสก่อน" : "เทียบช่วงก่อนหน้า";
    const inWindow = (value: Date, window: { start: Date; end: Date }) => value >= window.start && value < new Date(window.end.getTime() + 86400000);
    const [allUsers, allLoans, allPayments] = await Promise.all([db.select().from(users), db.select().from(loans), db.select().from(loanPayments)]);
    const count = <T extends { createdAt: Date }>(rows: T[], window: { start: Date; end: Date }) => rows.filter((row) => inWindow(new Date(row.createdAt), window)).length;
    const sum = (rows: typeof allPayments, window: { start: Date; end: Date }) => rows.filter((row) => row.status === "verified" && inWindow(new Date(row.paymentDate), window)).reduce((total, row) => total + parseFloat(row.amountPaid), 0);
    const principal = (rows: typeof allLoans, window: { start: Date; end: Date }) => rows.filter((row) => inWindow(new Date(row.createdAt), window)).reduce((total, row) => total + parseFloat(row.principalAmount), 0);
    return {
      users: { current: count(allUsers, current), previous: count(allUsers, previous), label: `ผู้ใช้ใหม่ · ${comparisonLabel}` },
      activeLoans: { current: count(allLoans, current), previous: count(allLoans, previous), label: `สัญญาใหม่ · ${comparisonLabel}` },
      principal: { current: Math.round(principal(allLoans, current) * 100) / 100, previous: Math.round(principal(allLoans, previous) * 100) / 100, label: `เงินต้นสัญญาใหม่ · ${comparisonLabel}` },
      paid: { current: Math.round(sum(allPayments, current) * 100) / 100, previous: Math.round(sum(allPayments, previous) * 100) / 100, label: `ยอดชำระที่ยืนยันแล้ว · ${comparisonLabel}` },
      outstanding: null,
      pendingPayments: null,
    };
  }),

  getDashboardKpiDetails: protectedProcedure.input(z.object({
    metric: z.enum(["users", "activeLoans", "principal", "paid", "outstanding", "pendingPayments"]),
    limit: z.number().int().min(1).max(100).default(50),
  })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access dashboard KPI details" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const limit = input.limit;
    if (input.metric === "users") {
      const rows = (await db.select().from(users).limit(limit)).map((user) => ({ id: `user-${user.id}`, title: user.name || user.email || `ผู้ใช้ #${user.id}`, meta: `${user.role} · สมัครเมื่อ ${new Date(user.createdAt).toLocaleDateString("th-TH")}`, amount: null, href: null }));
      return { title: "รายละเอียดผู้ใช้งาน", description: "บัญชีผู้ใช้งานที่ได้รับอนุญาตในระบบ", items: rows };
    }
    const allLoans = await db.select().from(loans);
    if (input.metric === "activeLoans" || input.metric === "principal" || input.metric === "outstanding") {
      const filtered = input.metric === "activeLoans" ? allLoans.filter((loan) => !loan.isClosed) : allLoans;
      const sorted = input.metric === "outstanding" ? [...filtered].sort((left, right) => (parseFloat(right.principalAmount) - parseFloat(right.totalPaid || "0")) - (parseFloat(left.principalAmount) - parseFloat(left.totalPaid || "0"))) : filtered;
      const items = sorted.slice(0, limit).map((loan) => {
        const principal = parseFloat(loan.principalAmount);
        const paid = parseFloat(loan.totalPaid || "0");
        const amount = input.metric === "principal" ? principal : input.metric === "outstanding" ? Math.max(principal - paid, 0) : principal;
        return { id: `loan-${loan.id}`, title: `สัญญา #${loan.id}`, meta: input.metric === "outstanding" ? `ชำระแล้ว ฿${paid.toLocaleString("th-TH", { maximumFractionDigits: 2 })}` : loan.isClosed ? "ปิดสัญญาแล้ว" : "กำลังดำเนินการ", amount, href: `/loan/${loan.id}` };
      });
      const text = input.metric === "activeLoans" ? "สัญญาที่กำลังดำเนินการ" : input.metric === "principal" ? "เงินต้นตามสัญญา" : "ยอดคงค้างตามสัญญา";
      return { title: text, description: "เลือกสัญญาเพื่อดูรายละเอียด", items };
    }
    const allPayments = await db.select().from(loanPayments);
    const payments = input.metric === "paid" ? allPayments.filter((payment) => payment.status === "verified") : allPayments.filter((payment) => payment.status === "pending");
    const items = payments.sort((left, right) => new Date(right.paymentDate).getTime() - new Date(left.paymentDate).getTime()).slice(0, limit).map((payment) => ({ id: `payment-${payment.id}`, title: `รายการชำระ #${payment.id} · สัญญา #${payment.loanId}`, meta: `${payment.status === "verified" ? "ยืนยันแล้ว" : "รอตรวจสอบ"} · ${new Date(payment.paymentDate).toLocaleDateString("th-TH")}`, amount: parseFloat(payment.amountPaid), href: `/loan/${payment.loanId}` }));
    return { title: input.metric === "paid" ? "รายการชำระที่ยืนยันแล้ว" : "รายการชำระที่รอตรวจสอบ", description: "แสดงเฉพาะรายการที่ได้รับอนุญาต", items };
  }),

  /**
   * ดึงข้อมูลสัดส่วนประเภทสินเชื่อ (รูปแบบผ่อนชำระ)
   */
  getLoanTypeDistribution: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access this endpoint" });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }

    return getLoanTypeDistribution(await db.select().from(loans));
  }),

  /**
   * ดึงข้อมูลสัดส่วนสถานะการชำระเงิน
   */
  getPaymentStatusDistribution: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access this endpoint" });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }

    return getPaymentStatusDistribution(await db.select().from(loanPayments));
  }),

  /**
   * ดึงรายละเอียดสัญญาสำหรับ drill-down รูปแบบการผ่อนชำระ
   */
  getLoanTypeDrilldown: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access this endpoint" });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }

    return db.select({
      id: loans.id,
      paymentType: loans.paymentType,
      principalAmount: loans.principalAmount,
      totalPaid: loans.totalPaid,
      isClosed: loans.isClosed,
      startDate: loans.startDate,
    }).from(loans);
  }),

  /**
   * ดึงรายละเอียดรายการชำระสำหรับ drill-down สถานะการชำระ
   */
  getPaymentStatusDrilldown: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can access this endpoint" });
    }

    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }

    return db.select({
      id: loanPayments.id,
      loanId: loanPayments.loanId,
      status: loanPayments.status,
      amountPaid: loanPayments.amountPaid,
      paymentMethod: loanPayments.paymentMethod,
      paymentDate: loanPayments.paymentDate,
    }).from(loanPayments);
  }),
});
