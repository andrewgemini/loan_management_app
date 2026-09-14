import { and, desc, eq, gt, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { createNotification, getDb } from "./db";
import {
  adminExportPermissions,
  reportDownloadHistory,
  reportExportApprovalRequests,
  reportExportSecurityEvents,
  reportExportSecurityPolicy,
  users,
} from "../drizzle/schema";
import { notifyOwner } from "./_core/notification";

export type ExportPermissionSet = {
  canExportCsv: boolean;
  canExportPdf: boolean;
  canVerifyReferences: boolean;
  canViewTeamDownloadHistory: boolean;
  canManageExportPermissions: boolean;
};

export type ExportSecurityPolicy = {
  highVolumeRowThreshold: number;
  approvalRowThreshold: number;
  retentionDays: number;
  approvalExpiresHours: number;
  alertOwnerOnHighVolume: boolean;
  updatedAt: Date | null;
};

export type ExportApprovalInput = {
  userId: number;
  format: "csv" | "pdf";
  rowCount: number;
  filterSummary: string;
};

type ApprovalRecipient = { userId: number; canManageExportPermissions: boolean | null };
type DailyExportAggregate = { date: string; exportCount: number | string; exportedRows: number | string };
type DailyEventAggregate = { date: string; eventCount: number | string; highSeverityCount: number | string };

const POLICY_ID = 1;

const legacyAdminDefaults: ExportPermissionSet = {
  canExportCsv: true,
  canExportPdf: true,
  canVerifyReferences: true,
  canViewTeamDownloadHistory: true,
  canManageExportPermissions: true,
};

/** Keep requester out of the approval inbox and preserve the documented legacy-admin default. */
export function selectApprovalNotificationRecipients(rows: ApprovalRecipient[], requesterId: number) {
  return rows
    .filter((row) => row.userId !== requesterId && (row.canManageExportPermissions ?? true))
    .map((row) => row.userId);
}

/** Merge database aggregates into a stable, ascending daily chart contract. */
export function mergeGovernanceDailyTrend(exports: DailyExportAggregate[], events: DailyEventAggregate[]) {
  const daily = new Map<string, { date: string; exportCount: number; exportedRows: number; securityEventCount: number; highSeverityCount: number }>();
  for (const row of exports) daily.set(row.date, { date: row.date, exportCount: Number(row.exportCount), exportedRows: Number(row.exportedRows), securityEventCount: 0, highSeverityCount: 0 });
  for (const row of events) {
    const current = daily.get(row.date) ?? { date: row.date, exportCount: 0, exportedRows: 0, securityEventCount: 0, highSeverityCount: 0 };
    current.securityEventCount = Number(row.eventCount);
    current.highSeverityCount = Number(row.highSeverityCount);
    daily.set(row.date, current);
  }
  return Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export const defaultExportSecurityPolicy: ExportSecurityPolicy = {
  highVolumeRowThreshold: 500,
  approvalRowThreshold: 750,
  retentionDays: 365,
  approvalExpiresHours: 24,
  alertOwnerOnHighVolume: true,
  updatedAt: null,
};

function toPolicy(row: typeof reportExportSecurityPolicy.$inferSelect): ExportSecurityPolicy {
  return {
    highVolumeRowThreshold: row.highVolumeRowThreshold,
    approvalRowThreshold: row.approvalRowThreshold,
    retentionDays: row.retentionDays,
    approvalExpiresHours: row.approvalExpiresHours,
    alertOwnerOnHighVolume: row.alertOwnerOnHighVolume,
    updatedAt: row.updatedAt,
  };
}

export async function getEffectiveExportPermissions(userId: number): Promise<ExportPermissionSet | null> {
  const db = await getDb();
  if (!db) return null;
  const [record] = await db.select().from(adminExportPermissions).where(eq(adminExportPermissions.userId, userId)).limit(1);
  return record ? {
    canExportCsv: record.canExportCsv,
    canExportPdf: record.canExportPdf,
    canVerifyReferences: record.canVerifyReferences,
    canViewTeamDownloadHistory: record.canViewTeamDownloadHistory,
    canManageExportPermissions: record.canManageExportPermissions,
  } : legacyAdminDefaults;
}

export async function saveExportPermissions(userId: number, permissions: ExportPermissionSet) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db.select({ id: adminExportPermissions.id }).from(adminExportPermissions).where(eq(adminExportPermissions.userId, userId)).limit(1);
  if (existing) {
    await db.update(adminExportPermissions).set({ ...permissions, updatedAt: new Date() }).where(eq(adminExportPermissions.id, existing.id));
  } else {
    await db.insert(adminExportPermissions).values({ userId, ...permissions });
  }
}

/** Returns null when storage is unavailable so callers deny security-sensitive exports. */
export async function getExportSecurityPolicy(): Promise<ExportSecurityPolicy | null> {
  const db = await getDb();
  if (!db) return null;
  const [policy] = await db.select().from(reportExportSecurityPolicy).where(eq(reportExportSecurityPolicy.id, POLICY_ID)).limit(1);
  return policy ? toPolicy(policy) : defaultExportSecurityPolicy;
}

export async function saveExportSecurityPolicy(userId: number, policy: Omit<ExportSecurityPolicy, "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const values = { ...policy, id: POLICY_ID, updatedById: userId, updatedAt: new Date() };
  const [existing] = await db.select({ id: reportExportSecurityPolicy.id }).from(reportExportSecurityPolicy).where(eq(reportExportSecurityPolicy.id, POLICY_ID)).limit(1);
  if (existing) {
    await db.update(reportExportSecurityPolicy).set(values).where(eq(reportExportSecurityPolicy.id, POLICY_ID));
  } else {
    await db.insert(reportExportSecurityPolicy).values(values);
  }
  return { ...policy, updatedAt: values.updatedAt };
}

export async function createSecurityEvent(input: {
  actorId: number;
  approvalRequestId?: number | null;
  type: "high_volume_export" | "approval_requested" | "approval_approved" | "approval_rejected" | "retention_cleanup";
  severity: "info" | "warning" | "high";
  rowCount?: number | null;
  referenceCode?: string | null;
  message: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(reportExportSecurityEvents).values({
    actorId: input.actorId,
    approvalRequestId: input.approvalRequestId ?? null,
    type: input.type,
    severity: input.severity,
    rowCount: input.rowCount ?? null,
    referenceCode: input.referenceCode ?? null,
    message: input.message,
  });
}

export async function requestHighSensitivityExport(input: ExportApprovalInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const policy = await getExportSecurityPolicy();
  if (!policy) throw new Error("Export security policy is not available");
  const expiresAt = new Date(Date.now() + policy.approvalExpiresHours * 60 * 60 * 1000);
  const [existing] = await db.select({ id: reportExportApprovalRequests.id, expiresAt: reportExportApprovalRequests.expiresAt })
    .from(reportExportApprovalRequests)
    .where(and(
      eq(reportExportApprovalRequests.requesterId, input.userId),
      eq(reportExportApprovalRequests.format, input.format),
      eq(reportExportApprovalRequests.rowCount, input.rowCount),
      eq(reportExportApprovalRequests.filterSummary, input.filterSummary),
      eq(reportExportApprovalRequests.status, "pending"),
      gt(reportExportApprovalRequests.expiresAt, new Date()),
    ))
    .limit(1);
  if (existing) return { requestId: existing.id, expiresAt: existing.expiresAt, reused: true, notifiedApproverCount: 0 };
  const result = await db.insert(reportExportApprovalRequests).values({
    requesterId: input.userId,
    format: input.format,
    rowCount: input.rowCount,
    filterSummary: input.filterSummary,
    expiresAt,
  }).returning({ id: reportExportApprovalRequests.id });
  const requestId = result[0]?.id ?? 0;
  await createSecurityEvent({
    actorId: input.userId,
    approvalRequestId: requestId,
    type: "approval_requested",
    severity: "warning",
    rowCount: input.rowCount,
    message: `High-sensitivity ${input.format.toUpperCase()} export requested (${input.rowCount} rows).`,
  });
  const approvalCandidates = await db.select({ userId: users.id, canManageExportPermissions: adminExportPermissions.canManageExportPermissions })
    .from(users)
    .leftJoin(adminExportPermissions, eq(users.id, adminExportPermissions.userId))
    .where(eq(users.role, "admin"));
  const recipientIds = selectApprovalNotificationRecipients(approvalCandidates, input.userId);
  const notificationMessage = `มีคำขอส่งออก ${input.format.toUpperCase()} ระดับสูง #${requestId} จำนวน ${input.rowCount.toLocaleString("th-TH")} แถว รออนุมัติใน Report Governance`;
  const deliveries = await Promise.allSettled(recipientIds.map((userId) => createNotification({ userId, type: "export_approval_pending", message: notificationMessage, sentVia: "in-app" })));
  return { requestId, expiresAt, reused: false, notifiedApproverCount: deliveries.filter((delivery) => delivery.status === "fulfilled").length };
}

export async function getOwnExportApprovalRequests(userId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  await db.update(reportExportApprovalRequests)
    .set({ status: "expired" })
    .where(and(eq(reportExportApprovalRequests.requesterId, userId), eq(reportExportApprovalRequests.status, "pending"), lt(reportExportApprovalRequests.expiresAt, new Date())));
  return db.select().from(reportExportApprovalRequests)
    .where(eq(reportExportApprovalRequests.requesterId, userId))
    .orderBy(desc(reportExportApprovalRequests.createdAt))
    .limit(limit);
}

export async function getPendingExportApprovalRequests(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  await db.update(reportExportApprovalRequests)
    .set({ status: "expired" })
    .where(and(eq(reportExportApprovalRequests.status, "pending"), lt(reportExportApprovalRequests.expiresAt, new Date())));
  return db.select().from(reportExportApprovalRequests)
    .where(and(eq(reportExportApprovalRequests.status, "pending"), gt(reportExportApprovalRequests.expiresAt, new Date())))
    .orderBy(desc(reportExportApprovalRequests.createdAt))
    .limit(limit);
}

export async function decideExportApprovalRequest(input: { requestId: number; reviewerId: number; approve: boolean; reviewerNote?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [request] = await db.select().from(reportExportApprovalRequests).where(eq(reportExportApprovalRequests.id, input.requestId)).limit(1);
  if (!request) return { outcome: "not_found" as const };
  if (request.requesterId === input.reviewerId) return { outcome: "self_approval" as const };
  if (request.status !== "pending" || request.expiresAt <= new Date()) {
    if (request.status === "pending") {
      await db.update(reportExportApprovalRequests).set({ status: "expired" }).where(eq(reportExportApprovalRequests.id, request.id));
    }
    return { outcome: "not_pending" as const };
  }
  const status = input.approve ? "approved" : "rejected";
  await db.update(reportExportApprovalRequests).set({ status, reviewedById: input.reviewerId, reviewerNote: input.reviewerNote ?? null, reviewedAt: new Date() }).where(eq(reportExportApprovalRequests.id, request.id));
  await createSecurityEvent({
    actorId: input.reviewerId,
    approvalRequestId: request.id,
    type: input.approve ? "approval_approved" : "approval_rejected",
    severity: input.approve ? "info" : "warning",
    rowCount: request.rowCount,
    message: `High-sensitivity ${request.format.toUpperCase()} export ${input.approve ? "approved" : "rejected"}.`,
  });
  return { outcome: "decided" as const, status };
}

export async function validateApprovedExportRequest(input: ExportApprovalInput & { approvalRequestId?: number }) {
  const policy = await getExportSecurityPolicy();
  if (!policy) return { allowed: false as const, reason: "policy_unavailable" as const };
  if (input.rowCount < policy.approvalRowThreshold) return { allowed: true as const, policy, approvalRequestId: null };
  if (!input.approvalRequestId) return { allowed: false as const, reason: "approval_required" as const, policy };
  const db = await getDb();
  if (!db) return { allowed: false as const, reason: "policy_unavailable" as const };
  const [request] = await db.select().from(reportExportApprovalRequests).where(eq(reportExportApprovalRequests.id, input.approvalRequestId)).limit(1);
  if (!request || request.requesterId !== input.userId || request.status !== "approved" || request.consumedAt !== null || request.expiresAt <= new Date() || request.format !== input.format || request.rowCount !== input.rowCount || request.filterSummary !== input.filterSummary) {
    return { allowed: false as const, reason: "approval_invalid" as const, policy };
  }
  return { allowed: true as const, policy, approvalRequestId: request.id };
}

export async function recordReportDownload(input: ExportApprovalInput & { referenceCode?: string; approvalRequestId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const gate = await validateApprovedExportRequest(input);
  if (!gate.allowed) return gate;
  if (gate.approvalRequestId) {
    const consumption = await db.update(reportExportApprovalRequests)
      .set({ consumedAt: new Date() })
      .where(and(eq(reportExportApprovalRequests.id, gate.approvalRequestId), eq(reportExportApprovalRequests.status, "approved"), isNull(reportExportApprovalRequests.consumedAt)));
    if (Number((consumption as unknown as { affectedRows?: number })?.affectedRows ?? 0) !== 1) {
      return { allowed: false as const, reason: "approval_invalid" as const, policy: gate.policy };
    }
  }
  await db.insert(reportDownloadHistory).values({
    userId: input.userId,
    format: input.format,
    rowCount: input.rowCount,
    filterSummary: input.filterSummary,
    referenceCode: input.referenceCode || null,
    approvalRequestId: gate.approvalRequestId,
  });
  if (input.rowCount >= gate.policy.highVolumeRowThreshold) {
    const severity = input.rowCount >= gate.policy.approvalRowThreshold ? "high" : "warning";
    await createSecurityEvent({
      actorId: input.userId,
      approvalRequestId: gate.approvalRequestId,
      type: "high_volume_export",
      severity,
      rowCount: input.rowCount,
      referenceCode: input.referenceCode ?? null,
      message: `Large ${input.format.toUpperCase()} export recorded (${input.rowCount} rows).`,
    });
    if (gate.policy.alertOwnerOnHighVolume) {
      await notifyOwner({
        title: "แจ้งเตือนความปลอดภัย: มีการส่งออกรายงานปริมาณสูง",
        content: `มีการส่งออก Audit Logs จำนวน ${input.rowCount} แถวในรูปแบบ ${input.format.toUpperCase()} ระบบบันทึกเหตุการณ์ไว้แล้ว โปรดตรวจสอบ Report Governance.`,
      }).catch(() => false);
    }
  }
  return { allowed: true as const, policy: gate.policy, approvalRequestId: gate.approvalRequestId };
}

export async function getReportDownloads(userId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reportDownloadHistory).where(eq(reportDownloadHistory.userId, userId)).orderBy(desc(reportDownloadHistory.createdAt)).limit(limit);
}

export async function getRecentExportSecurityEvents(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reportExportSecurityEvents).orderBy(desc(reportExportSecurityEvents.createdAt)).limit(limit);
}

export async function getGovernanceAnalytics(days = 30) {
  const db = await getDb();
  if (!db) return null;
  const safeDays = Math.max(7, Math.min(days, 90));
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (safeDays - 1));
  from.setUTCHours(0, 0, 0, 0);
  const exportDate = sql<string>`DATE(${reportDownloadHistory.createdAt})`;
  const eventDate = sql<string>`DATE(${reportExportSecurityEvents.createdAt})`;
  const [exports, events, severityRows] = await Promise.all([
    db.select({ date: exportDate, exportCount: sql<number>`COUNT(*)`, exportedRows: sql<number>`COALESCE(SUM(${reportDownloadHistory.rowCount}), 0)` })
      .from(reportDownloadHistory).where(gte(reportDownloadHistory.createdAt, from)).groupBy(exportDate).orderBy(exportDate),
    db.select({ date: eventDate, eventCount: sql<number>`COUNT(*)`, highSeverityCount: sql<number>`COALESCE(SUM(CASE WHEN ${reportExportSecurityEvents.severity} = 'high' THEN 1 ELSE 0 END), 0)` })
      .from(reportExportSecurityEvents).where(gte(reportExportSecurityEvents.createdAt, from)).groupBy(eventDate).orderBy(eventDate),
    db.select({ severity: reportExportSecurityEvents.severity, count: sql<number>`COUNT(*)` })
      .from(reportExportSecurityEvents).where(gte(reportExportSecurityEvents.createdAt, from)).groupBy(reportExportSecurityEvents.severity),
  ]);
  const severity = { info: 0, warning: 0, high: 0 };
  for (const row of severityRows) severity[row.severity] = Number(row.count);
  return { days: safeDays, from, daily: mergeGovernanceDailyTrend(exports, events), severity };
}

export async function isRegisteredReportDownloadRetentionTask(taskUid: string) {
  const db = await getDb();
  if (!db) return false;
  const [policy] = await db.select({ scheduleCronTaskUid: reportExportSecurityPolicy.scheduleCronTaskUid })
    .from(reportExportSecurityPolicy)
    .where(eq(reportExportSecurityPolicy.id, POLICY_ID))
    .limit(1);
  return policy?.scheduleCronTaskUid === taskUid;
}

export async function runReportDownloadHistoryRetention(actorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const policy = await getExportSecurityPolicy();
  if (!policy) throw new Error("Export security policy is not available");
  const cutoff = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);
  const historyResult = await db.delete(reportDownloadHistory).where(lt(reportDownloadHistory.createdAt, cutoff));
  const eventsResult = await db.delete(reportExportSecurityEvents).where(lt(reportExportSecurityEvents.createdAt, cutoff));
  const requestsResult = await db.delete(reportExportApprovalRequests).where(and(lt(reportExportApprovalRequests.createdAt, cutoff), ne(reportExportApprovalRequests.status, "pending")));
  const deletedHistory = Number((historyResult as unknown as { affectedRows?: number })?.affectedRows ?? 0);
  const deletedEvents = Number((eventsResult as unknown as { affectedRows?: number })?.affectedRows ?? 0);
  const deletedRequests = Number((requestsResult as unknown as { affectedRows?: number })?.affectedRows ?? 0);
  const deleted = deletedHistory + deletedEvents + deletedRequests;
  if (deleted > 0) {
    await createSecurityEvent({
      actorId,
      type: "retention_cleanup",
      severity: "info",
      message: `Retention cleanup removed ${deletedHistory} download histories, ${deletedEvents} security events, and ${deletedRequests} closed approval requests.`,
    });
  }
  return { cutoff, deletedHistory, deletedEvents, deletedRequests };
}
