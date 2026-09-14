// server/_core/app.ts
import "dotenv/config";
import express2 from "express";
import path2 from "path";
import fs2 from "fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/oauth.ts
import express from "express";

// server/db.ts
import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// drizzle/schema.ts
import { decimal, integer, pgEnum, pgTable, text, timestamp, varchar, boolean, date, uniqueIndex, index, serial } from "drizzle-orm/pg-core";
var roleEnum = pgEnum("role", ["admin", "lender", "borrower"]);
var interestTypeEnum = pgEnum("interest_type", ["simple", "compound"]);
var paymentTypeEnum = pgEnum("payment_type", ["fixed", "reducing"]);
var loanRequestStatusEnum = pgEnum("loan_request_status", ["pending", "approved", "rejected"]);
var paymentStatusEnum = pgEnum("payment_status", ["pending", "verified", "rejected"]);
var notificationTypeEnum = pgEnum("notification_type", ["payment_due", "loan_status", "payment_verified", "loan_approved", "loan_rejected", "export_approval_pending"]);
var comparisonModeEnum = pgEnum("comparison_mode", ["matching_period", "previous_month", "previous_quarter"]);
var exportFormatEnum = pgEnum("export_format", ["csv", "pdf"]);
var exportApprovalStatusEnum = pgEnum("export_approval_status", ["pending", "approved", "rejected", "expired"]);
var securityEventTypeEnum = pgEnum("security_event_type", ["high_volume_export", "approval_requested", "approval_approved", "approval_rejected", "retention_cleanup"]);
var securitySeverityEnum = pgEnum("security_severity", ["info", "warning", "high"]);
var users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  avatarUrl: varchar("avatar_url", { length: 2048 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  // role: admin (ผู้ดูแลระบบ), lender (ผู้ให้กู้), borrower (ผู้กู้)
  role: roleEnum("role").default("borrower").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var loanRequests = pgTable("loan_requests", {
  id: serial("id").primaryKey(),
  borrowerId: integer("borrower_id").notNull(),
  amountRequested: decimal("amount_requested", { precision: 12, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(),
  // อัตราดอกเบี้ยต่อปี (%)
  loanTermMonths: integer("loan_term_months").notNull(),
  // ระยะเวลาผ่อน (เดือน)
  interestType: interestTypeEnum("interest_type").notNull(),
  // ประเภทดอกเบี้ย
  paymentType: paymentTypeEnum("payment_type").notNull(),
  // ประเภทการผ่อนชำระ
  status: loanRequestStatusEnum("status").default("pending").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  approvedById: integer("approved_by_id"),
  // ผู้ที่อนุมัติ (Lender/Admin)
  approvedAt: timestamp("approved_at"),
  decidedAt: timestamp("decided_at"),
  rejectionReason: text("rejection_reason")
  // เหตุผลในการปฏิเสธ
});
var loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  borrowerId: integer("borrower_id").notNull(),
  lenderId: integer("lender_id").notNull(),
  // ผู้ให้กู้
  principalAmount: decimal("principal_amount", { precision: 12, scale: 2 }).notNull(),
  // ยอดเงินต้น
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(),
  loanTermMonths: integer("loan_term_months").notNull(),
  interestType: interestTypeEnum("interest_type").notNull(),
  paymentType: paymentTypeEnum("payment_type").notNull(),
  startDate: date("start_date", { mode: "date" }).notNull(),
  nextPaymentDate: date("next_payment_date", { mode: "date" }).notNull(),
  totalPaid: decimal("total_paid", { precision: 12, scale: 2 }).default("0"),
  isClosed: boolean("is_closed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var amortizationSchedules = pgTable("amortization_schedules", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull(),
  paymentNumber: integer("payment_number").notNull(),
  // งวดที่
  dueDate: date("due_date", { mode: "date" }).notNull(),
  startingBalance: decimal("starting_balance", { precision: 12, scale: 2 }).notNull(),
  principalDue: decimal("principal_due", { precision: 12, scale: 2 }).notNull(),
  interestDue: decimal("interest_due", { precision: 12, scale: 2 }).notNull(),
  totalPaymentDue: decimal("total_payment_due", { precision: 12, scale: 2 }).notNull(),
  endingBalance: decimal("ending_balance", { precision: 12, scale: 2 }).notNull(),
  isPaid: boolean("is_paid").default(false)
});
var loanPayments = pgTable("loan_payments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull(),
  scheduleId: integer("schedule_id"),
  // งวดที่ชำระ
  amountPaid: decimal("amount_paid", { precision: 12, scale: 2 }).notNull(),
  paymentDate: timestamp("payment_date").defaultNow().notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
  // PromptPay, Bank Transfer, Slip Upload
  slipPath: varchar("slip_path", { length: 255 }),
  // Path ของไฟล์สลิป
  verifiedById: integer("verified_by_id"),
  // ผู้ที่ตรวจสอบ (Admin)
  verifiedAt: timestamp("verified_at"),
  status: paymentStatusEnum("status").default("pending").notNull(),
  rejectionReason: text("rejection_reason"),
  // เหตุผลในการปฏิเสธ
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: notificationTypeEnum("type").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  sentVia: varchar("sent_via", { length: 50 }).notNull(),
  // in-app, email, line
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var userLineTokens = pgTable("user_line_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  lineToken: varchar("line_token", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var notificationPreferences = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  emailNewLoanRequest: boolean("email_new_loan_request").default(true).notNull(),
  emailLoanApproval: boolean("email_loan_approval").default(true).notNull(),
  emailLoanRejection: boolean("email_loan_rejection").default(true).notNull(),
  emailPaymentReminder: boolean("email_payment_reminder").default(true).notNull(),
  emailPaymentConfirmation: boolean("email_payment_confirmation").default(true).notNull(),
  lineNewLoanRequest: boolean("line_new_loan_request").default(true).notNull(),
  lineLoanApproval: boolean("line_loan_approval").default(true).notNull(),
  lineLoanRejection: boolean("line_loan_rejection").default(true).notNull(),
  linePaymentReminder: boolean("line_payment_reminder").default(true).notNull(),
  linePaymentConfirmation: boolean("line_payment_confirmation").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var userDashboardPreferences = pgTable("user_dashboard_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  customRangeStartDate: varchar("custom_range_start_date", { length: 10 }),
  customRangeEndDate: varchar("custom_range_end_date", { length: 10 }),
  comparisonMode: comparisonModeEnum("comparison_mode").notNull().default("matching_period"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var userDashboardRangePresets = pgTable("user_dashboard_range_presets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  startDate: varchar("start_date", { length: 10 }).notNull(),
  endDate: varchar("end_date", { length: 10 }).notNull(),
  isShared: boolean("is_shared").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var userDashboardPresetRecentUses = pgTable("user_dashboard_preset_recent_uses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  presetId: integer("preset_id").notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  usageCount: integer("usage_count").notNull().default(0)
}, (table) => ({
  userPresetUnique: uniqueIndex("user_dashboard_preset_recent_uses_user_preset_unique").on(table.userId, table.presetId)
}));
var userDashboardPresetPins = pgTable("user_dashboard_preset_pins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  presetId: integer("preset_id").notNull(),
  pinnedAt: timestamp("pinned_at").defaultNow().notNull(),
  sortOrder: integer("sort_order").notNull().default(0)
}, (table) => ({
  userPresetUnique: uniqueIndex("user_dashboard_preset_pins_user_preset_unique").on(table.userId, table.presetId)
}));
var userDashboardPresetCategories = pgTable("user_dashboard_preset_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  color: varchar("color", { length: 16 }).notNull().default("blue"),
  icon: varchar("icon", { length: 24 }).notNull().default("folder"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  userCategoryUnique: uniqueIndex("user_dashboard_preset_categories_user_name_unique").on(table.userId, table.name)
}));
var userDashboardPresetCategoryAssignments = pgTable("user_dashboard_preset_category_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  presetId: integer("preset_id").notNull(),
  categoryId: integer("category_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  userPresetUnique: uniqueIndex("user_dashboard_preset_category_assignments_user_preset_unique").on(table.userId, table.presetId),
  userCategoryIndex: index("user_dashboard_preset_category_assignments_user_category_index").on(table.userId, table.categoryId)
}));
var userDashboardPresetCategoryMoveHistory = pgTable("user_dashboard_preset_category_move_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  presetIds: text("preset_ids").notNull(),
  previousCategoryIds: text("previous_category_ids").notNull(),
  destinationCategoryId: integer("destination_category_id"),
  undoneAt: timestamp("undone_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  userCreatedIndex: index("user_dashboard_preset_category_move_history_user_created_index").on(table.userId, table.createdAt)
}));
var notificationPreferenceAuditLogs = pgTable("notification_preference_audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  action: varchar("action", { length: 32 }).notNull(),
  changedFields: text("changed_fields").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var adminExportPermissions = pgTable("admin_export_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  canExportCsv: boolean("can_export_csv").default(true).notNull(),
  canExportPdf: boolean("can_export_pdf").default(true).notNull(),
  canVerifyReferences: boolean("can_verify_references").default(true).notNull(),
  canViewTeamDownloadHistory: boolean("can_view_team_download_history").default(false).notNull(),
  canManageExportPermissions: boolean("can_manage_export_permissions").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var reportDownloadHistory = pgTable("report_download_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  format: exportFormatEnum("format").notNull(),
  referenceCode: varchar("reference_code", { length: 64 }),
  approvalRequestId: integer("approval_request_id"),
  filterSummary: varchar("filter_summary", { length: 1200 }).notNull().default(""),
  rowCount: integer("row_count").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var reportExportSecurityPolicy = pgTable("report_export_security_policy", {
  id: integer("id").primaryKey(),
  highVolumeRowThreshold: integer("high_volume_row_threshold").notNull().default(500),
  approvalRowThreshold: integer("approval_row_threshold").notNull().default(750),
  retentionDays: integer("retention_days").notNull().default(365),
  approvalExpiresHours: integer("approval_expires_hours").notNull().default(24),
  alertOwnerOnHighVolume: boolean("alert_owner_on_high_volume").notNull().default(true),
  scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
  updatedById: integer("updated_by_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var reportExportApprovalRequests = pgTable("report_export_approval_requests", {
  id: serial("id").primaryKey(),
  requesterId: integer("requester_id").notNull(),
  format: exportFormatEnum("format").notNull(),
  rowCount: integer("row_count").notNull(),
  filterSummary: varchar("filter_summary", { length: 1200 }).notNull().default(""),
  status: exportApprovalStatusEnum("status").notNull().default("pending"),
  reviewedById: integer("reviewed_by_id"),
  reviewerNote: varchar("reviewer_note", { length: 500 }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  consumedAt: timestamp("consumed_at")
});
var reportExportSecurityEvents = pgTable("report_export_security_events", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").notNull(),
  approvalRequestId: integer("approval_request_id"),
  type: securityEventTypeEnum("type").notNull(),
  severity: securitySeverityEnum("severity").notNull().default("info"),
  rowCount: integer("row_count"),
  referenceCode: varchar("reference_code", { length: 64 }),
  message: varchar("message", { length: 600 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var activityHistoryFilterPresets = pgTable("activity_history_filter_presets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  startDate: varchar("start_date", { length: 10 }).notNull().default(""),
  endDate: varchar("end_date", { length: 10 }).notNull().default(""),
  eventType: varchar("event_type", { length: 160 }).notNull().default("all"),
  actorName: varchar("actor_name", { length: 255 }).notNull().default("all"),
  actorRole: varchar("actor_role", { length: 32 }).notNull().default("all"),
  lenderId: integer("lender_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var settings = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  description: varchar("description", { length: 255 })
});

// server/_core/env.ts
var databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? "";
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? (databaseUrl ? `db:${databaseUrl}` : ""),
  databaseUrl,
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
var _pool = null;
async function getDb() {
  if (_db) return _db;
  const connectionString = (process.env.POSTGRES_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL)?.trim();
  if (!connectionString) {
    throw new Error("PostgreSQL connection URL is not configured");
  }
  try {
    _pool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 1e4,
      idleTimeoutMillis: 3e4,
      ssl: { rejectUnauthorized: false }
    });
    _db = drizzle(_pool);
    return _db;
  } catch (error) {
    _pool = null;
    _db = null;
    console.error("[Database] Failed to initialize PostgreSQL:", error);
    throw new Error("Database initialization failed", { cause: error });
  }
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function updateUserAvatarUrl(userId, avatarUrl) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ avatarUrl, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, userId));
}
async function clearUserAvatarUrl(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ avatarUrl: null, updatedAt: /* @__PURE__ */ new Date() }).where(eq(users.id, userId));
}
async function getActivityHistoryFilterPresets(userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(activityHistoryFilterPresets).where(eq(activityHistoryFilterPresets.userId, userId)).orderBy(desc(activityHistoryFilterPresets.updatedAt));
}
async function saveActivityHistoryFilterPreset(userId, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select({ id: activityHistoryFilterPresets.id }).from(activityHistoryFilterPresets).where(and(eq(activityHistoryFilterPresets.userId, userId), eq(activityHistoryFilterPresets.name, data.name))).limit(1);
  if (existing[0]) {
    await db.update(activityHistoryFilterPresets).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(activityHistoryFilterPresets.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(activityHistoryFilterPresets).values({ userId, ...data }).returning({ id: activityHistoryFilterPresets.id });
  return result[0]?.id ?? 0;
}
async function deleteActivityHistoryFilterPreset(userId, id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(activityHistoryFilterPresets).where(and(eq(activityHistoryFilterPresets.id, id), eq(activityHistoryFilterPresets.userId, userId)));
}
async function createLoanRequest(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(loanRequests).values(data);
  return result;
}
async function getLoanRequestById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(loanRequests).where(eq(loanRequests.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getLoanRequestsByBorrower(borrowerId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loanRequests).where(eq(loanRequests.borrowerId, borrowerId)).orderBy(desc(loanRequests.requestedAt));
}
async function getPendingLoanRequests() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loanRequests).where(eq(loanRequests.status, "pending")).orderBy(desc(loanRequests.requestedAt));
}
async function approveLoanRequest(requestId, approvedById) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const request = await getLoanRequestById(requestId);
  if (!request) throw new Error("Loan request not found");
  const decidedAt = /* @__PURE__ */ new Date();
  await db.update(loanRequests).set({ status: "approved", approvedById, approvedAt: decidedAt, decidedAt }).where(eq(loanRequests.id, requestId));
  return request;
}
async function rejectLoanRequest(requestId, approvedById, reason) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const decidedAt = /* @__PURE__ */ new Date();
  await db.update(loanRequests).set({ status: "rejected", approvedById, approvedAt: decidedAt, decidedAt, rejectionReason: reason }).where(eq(loanRequests.id, requestId));
}
async function createLoan(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(loans).values(data).returning({ id: loans.id });
  return { insertId: result[0]?.id ?? 0 };
}
async function getLoanById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(loans).where(eq(loans.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getLoansByBorrower(borrowerId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loans).where(eq(loans.borrowerId, borrowerId)).orderBy(desc(loans.createdAt));
}
async function getLoansByLender(lenderId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loans).where(eq(loans.lenderId, lenderId)).orderBy(desc(loans.createdAt));
}
async function createAmortizationSchedules(schedules) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(amortizationSchedules).values(schedules);
}
async function getAmortizationSchedule(loanId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(amortizationSchedules).where(eq(amortizationSchedules.loanId, loanId)).orderBy(amortizationSchedules.paymentNumber);
}
async function createLoanPayment(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(loanPayments).values(data);
}
async function getLoanPayments(loanId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loanPayments).where(eq(loanPayments.loanId, loanId)).orderBy(desc(loanPayments.paymentDate));
}
async function getPendingPaymentVerifications() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(loanPayments).where(eq(loanPayments.status, "pending")).orderBy(desc(loanPayments.createdAt));
}
async function verifyPayment(paymentId, verifiedById) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(loanPayments).set({ status: "verified", verifiedById, verifiedAt: /* @__PURE__ */ new Date() }).where(eq(loanPayments.id, paymentId));
}
async function rejectPayment(paymentId, verifiedById, reason) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(loanPayments).set({ status: "rejected", verifiedById, verifiedAt: /* @__PURE__ */ new Date(), rejectionReason: reason }).where(eq(loanPayments.id, paymentId));
}
async function getPaymentById(paymentId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db.select().from(loanPayments).where(eq(loanPayments.id, paymentId)).limit(1);
  return results[0] ?? null;
}
async function createNotification(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(notifications).values(data);
}
async function getUserNotifications(userId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
}
async function markNotificationAsRead(notificationId, userId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}
async function getAdminStats() {
  const db = await getDb();
  if (!db) return null;
  const totalUsers = await db.select({ count: sql`COUNT(*)` }).from(users);
  const totalLoans = await db.select({ count: sql`COUNT(*)` }).from(loans);
  const totalBorrowers = await db.select({ count: sql`COUNT(*)` }).from(users).where(eq(users.role, "borrower"));
  const totalLenders = await db.select({ count: sql`COUNT(*)` }).from(users).where(eq(users.role, "lender"));
  return {
    totalUsers: Number(totalUsers[0]?.count || 0),
    totalLoans: Number(totalLoans[0]?.count || 0),
    totalBorrowers: Number(totalBorrowers[0]?.count || 0),
    totalLenders: Number(totalLenders[0]?.count || 0)
  };
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";

// server/authSession.ts
function isValidSessionIdentity(value) {
  if (!value || typeof value !== "object") return false;
  const candidate = value;
  return [candidate.openId, candidate.appId, candidate.name].every(
    (field) => typeof field === "string" && field.length > 0
  );
}
function isCronSessionIdentity(openId) {
  return openId.startsWith("cron_");
}

// server/_core/sdk.ts
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "borrower",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const identity = payload;
      if (!isValidSessionIdentity(identity)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return identity;
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (isCronSessionIdentity(session.openId)) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        if (!userInfo.taskUid) throw ForbiddenError("Cron session missing task_uid");
        return buildCronUser(userInfo);
      } catch (error) {
        if (error instanceof Error && error.message.includes("task_uid")) throw error;
        throw ForbiddenError("Failed to authenticate scheduled task");
      }
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || ""
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS
      });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed:", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
  app.post("/api/auth/dev-login", express.json(), async (req, res) => {
    try {
      const { role = "borrower", openId, name, email } = req.body || {};
      const demoUsers = {
        admin: { openId: "demo-admin", name: "Demo Admin", email: "demo-admin@example.invalid", role: "admin" },
        lender: { openId: "demo-lender", name: "Demo Lender", email: "demo-lender@example.invalid", role: "lender" },
        borrower: { openId: "demo-borrower", name: "Demo Borrower", email: "demo-borrower@example.invalid", role: "borrower" }
      };
      const selected = openId && role ? { openId, name: name || openId, email: email || null, role } : demoUsers[role] || demoUsers.borrower;
      await upsertUser({
        openId: selected.openId,
        name: selected.name || null,
        email: selected.email ?? null,
        loginMethod: "local",
        role: selected.role,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(selected.openId, {
        name: selected.name || ""
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS
      });
      const user = await getUserByOpenId(selected.openId);
      res.json({ success: true, user });
    } catch (error) {
      console.error("[Auth] Dev login failed:", error);
      res.status(500).json({ error: "Failed to perform local login" });
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers/loanRouter.ts
import { z as z3 } from "zod";

// server/loanCalculations.ts
function calculateFixedMonthlyPayment(principal, annualRate, months) {
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) {
    return principal / months;
  }
  const numerator = monthlyRate * Math.pow(1 + monthlyRate, months);
  const denominator = Math.pow(1 + monthlyRate, months) - 1;
  return principal * (numerator / denominator);
}
function generateFixedPaymentSchedule(params, startDate) {
  const schedule = [];
  const monthlyPayment = calculateFixedMonthlyPayment(params.principal, params.annualRate, params.months);
  const monthlyRate = params.annualRate / 100 / 12;
  let balance = params.principal;
  let currentDate = new Date(startDate);
  for (let i = 1; i <= params.months; i++) {
    const interestPayment = balance * monthlyRate;
    const principalPayment = monthlyPayment - interestPayment;
    const newBalance = Math.max(0, balance - principalPayment);
    const finalPayment = i === params.months ? balance + interestPayment : monthlyPayment;
    schedule.push({
      paymentNumber: i,
      dueDate: new Date(currentDate),
      startingBalance: balance,
      principal: i === params.months ? balance : principalPayment,
      interest: interestPayment,
      totalPayment: finalPayment,
      endingBalance: newBalance
    });
    balance = newBalance;
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  return schedule;
}
function generateReducingBalanceSchedule(params, startDate) {
  const schedule = [];
  const principalPerMonth = params.principal / params.months;
  const monthlyRate = params.annualRate / 100 / 12;
  let balance = params.principal;
  let currentDate = new Date(startDate);
  for (let i = 1; i <= params.months; i++) {
    const interestPayment = balance * monthlyRate;
    const principalPayment = principalPerMonth;
    const totalPayment = principalPayment + interestPayment;
    const newBalance = Math.max(0, balance - principalPayment);
    schedule.push({
      paymentNumber: i,
      dueDate: new Date(currentDate),
      startingBalance: balance,
      principal: principalPayment,
      interest: interestPayment,
      totalPayment,
      endingBalance: newBalance
    });
    balance = newBalance;
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  return schedule;
}
function generateAmortizationSchedule(params, startDate) {
  if (params.paymentType === "fixed") {
    return generateFixedPaymentSchedule(params, startDate);
  } else {
    return generateReducingBalanceSchedule(params, startDate);
  }
}
function calculateLoanSummary(params) {
  const schedule = generateAmortizationSchedule(params, /* @__PURE__ */ new Date());
  const totalInterest = schedule.reduce((sum, item) => sum + item.interest, 0);
  const totalPayment = params.principal + totalInterest;
  const monthlyPayment = params.paymentType === "fixed" ? calculateFixedMonthlyPayment(params.principal, params.annualRate, params.months) : schedule[0]?.totalPayment || 0;
  return {
    principal: params.principal,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPayment: Math.round(totalPayment * 100) / 100,
    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
    schedule
  };
}

// server/storage.ts
import fs from "fs";
import path from "path";
function getStorageConfig() {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}
function buildUploadUrl(baseUrl, relKey) {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}
function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function toFormData(data, contentType, fileName) {
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}
function buildAuthHeaders(apiKey) {
  return { Authorization: `Bearer ${apiKey}` };
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const config = getStorageConfig();
  const key = normalizeKey(relKey);
  if (config) {
    const { baseUrl, apiKey } = config;
    const uploadUrl = buildUploadUrl(baseUrl, key);
    const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: buildAuthHeaders(apiKey),
      body: formData
    });
    if (!response.ok) {
      const message = await response.text().catch(() => response.statusText);
      throw new Error(
        `Storage upload failed (${response.status} ${response.statusText}): ${message}`
      );
    }
    const url = (await response.json()).url;
    return { key, url };
  }
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  const filePath = path.resolve(uploadsDir, key);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const buffer = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  await fs.promises.writeFile(filePath, buffer);
  return { key, url: `/uploads/${key}` };
}

// server/routers/loanRouter.ts
import generatePromptPayPayload from "promptpay-qr";

// server/loanContracts.ts
import { z as z2 } from "zod";
var createLoanRequestInputSchema = z2.object({
  amountRequested: z2.number().positive("\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E15\u0E49\u0E2D\u0E07\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0"),
  interestRate: z2.number().min(0).max(100, "\u0E2D\u0E31\u0E15\u0E23\u0E32\u0E14\u0E2D\u0E01\u0E40\u0E1A\u0E35\u0E49\u0E22\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E22\u0E39\u0E48\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07 0-100%"),
  loanTermMonths: z2.number().int().min(1, "\u0E23\u0E30\u0E22\u0E30\u0E40\u0E27\u0E25\u0E32\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E19\u0E49\u0E2D\u0E22 1 \u0E40\u0E14\u0E37\u0E2D\u0E19"),
  interestType: z2.enum(["simple", "compound"]),
  paymentType: z2.enum(["fixed", "reducing"])
});
var approveRequestInputSchema = z2.object({ requestId: z2.number().int().positive() });
var rejectRequestInputSchema = z2.object({
  requestId: z2.number().int().positive(),
  reason: z2.string().trim().min(1, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E40\u0E2B\u0E15\u0E38\u0E1C\u0E25")
});
var uploadPaymentSlipInputSchema = z2.object({
  loanId: z2.number().int().positive(),
  scheduleId: z2.number().int().positive().optional(),
  amountPaid: z2.number().positive("\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E15\u0E49\u0E2D\u0E07\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0"),
  paymentMethod: z2.enum(["promptpay", "bank_transfer", "cash"]),
  fileName: z2.string().trim().min(1).max(160),
  mimeType: z2.enum(["image/jpeg", "image/png", "application/pdf"]),
  base64: z2.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, "\u0E44\u0E1F\u0E25\u0E4C\u0E2A\u0E25\u0E34\u0E1B\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07")
});
var verifyPaymentInputSchema = z2.object({ paymentId: z2.number().int().positive() });
var rejectPaymentInputSchema = z2.object({
  paymentId: z2.number().int().positive(),
  reason: z2.string().trim().min(1, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E40\u0E2B\u0E15\u0E38\u0E1C\u0E25")
});
function canCreateLoanRequest(role) {
  return role === "borrower";
}
function canManageLoan(role) {
  return role === "admin" || role === "lender";
}

// server/routers/loanRouter.ts
var loanRouter = router({
  // ===== Loan Request Procedures =====
  /**
   * ผู้กู้สร้างคำขอกู้ยืมเงิน
   */
  createRequest: protectedProcedure.input(createLoanRequestInputSchema).mutation(async ({ ctx, input }) => {
    if (!canCreateLoanRequest(ctx.user.role)) {
      throw new Error("\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49");
    }
    const result = await createLoanRequest({
      borrowerId: ctx.user.id,
      amountRequested: input.amountRequested.toString(),
      interestRate: input.interestRate.toString(),
      loanTermMonths: input.loanTermMonths,
      interestType: input.interestType,
      paymentType: input.paymentType
    });
    return result;
  }),
  /**
   * ดูคำขอกู้ของตัวเอง (ผู้กู้)
   */
  getMyRequests: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "borrower") {
      return [];
    }
    return await getLoanRequestsByBorrower(ctx.user.id);
  }),
  /**
   * ดูคำขอกู้เฉพาะรายการ
   */
  getRequest: protectedProcedure.input(z3.object({ id: z3.number() })).query(async ({ ctx, input }) => {
    const request = await getLoanRequestById(input.id);
    if (!request) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49");
    if (ctx.user.role === "borrower" && request.borrowerId !== ctx.user.id) {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07\u0E04\u0E33\u0E02\u0E2D\u0E19\u0E35\u0E49");
    }
    return request;
  }),
  /**
   * ดูคำขอกู้ที่รอการอนุมัติ (Admin/Lender)
   */
  getPendingRequests: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "lender") {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07");
    }
    return await getPendingLoanRequests();
  }),
  /**
   * อนุมัติคำขอกู้ (Admin/Lender)
   */
  approveRequest: protectedProcedure.input(approveRequestInputSchema).mutation(async ({ ctx, input }) => {
    if (!canManageLoan(ctx.user.role)) {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E04\u0E33\u0E02\u0E2D");
    }
    const request = await getLoanRequestById(input.requestId);
    if (!request) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49");
    const loanParams = {
      principal: parseFloat(request.amountRequested),
      annualRate: parseFloat(request.interestRate),
      months: request.loanTermMonths,
      interestType: request.interestType,
      paymentType: request.paymentType
    };
    const summary = calculateLoanSummary(loanParams);
    const startDate = /* @__PURE__ */ new Date();
    const nextPaymentDate = new Date(startDate);
    nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
    const loanResult = await createLoan({
      requestId: input.requestId,
      borrowerId: request.borrowerId,
      lenderId: ctx.user.id,
      principalAmount: request.amountRequested,
      interestRate: request.interestRate,
      loanTermMonths: request.loanTermMonths,
      interestType: request.interestType,
      paymentType: request.paymentType,
      startDate,
      nextPaymentDate
    });
    const loanId = loanResult.insertId || 0;
    const scheduleData = summary.schedule.map((item) => ({
      loanId,
      paymentNumber: item.paymentNumber,
      dueDate: item.dueDate,
      startingBalance: item.startingBalance.toString(),
      principalDue: item.principal.toString(),
      interestDue: item.interest.toString(),
      totalPaymentDue: item.totalPayment.toString(),
      endingBalance: item.endingBalance.toString()
    }));
    await createAmortizationSchedules(scheduleData);
    await approveLoanRequest(input.requestId, ctx.user.id);
    await createNotification({
      userId: request.borrowerId,
      type: "loan_approved",
      message: `\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E41\u0E25\u0E49\u0E27 \u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19 ${request.amountRequested} \u0E1A\u0E32\u0E17`,
      sentVia: "in-app"
    });
    return { success: true, loanId };
  }),
  /**
   * ปฏิเสธคำขอกู้ (Admin/Lender)
   */
  rejectRequest: protectedProcedure.input(rejectRequestInputSchema).mutation(async ({ ctx, input }) => {
    if (!canManageLoan(ctx.user.role)) {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E04\u0E33\u0E02\u0E2D");
    }
    const request = await getLoanRequestById(input.requestId);
    if (!request) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49");
    await rejectLoanRequest(input.requestId, ctx.user.id, input.reason);
    await createNotification({
      userId: request.borrowerId,
      type: "loan_rejected",
      message: `\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18 \u0E40\u0E2B\u0E15\u0E38\u0E1C\u0E25: ${input.reason}`,
      sentVia: "in-app"
    });
    return { success: true };
  }),
  // ===== Loan Procedures =====
  /**
   * ดูสัญญาเงินกู้ของตัวเอง
   */
  getMyLoans: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === "borrower") {
      return await getLoansByBorrower(ctx.user.id);
    } else if (ctx.user.role === "lender") {
      return await getLoansByLender(ctx.user.id);
    }
    return [];
  }),
  /**
   * ดูรายละเอียดสัญญาเงินกู้
   */
  getLoan: protectedProcedure.input(z3.object({ id: z3.number() })).query(async ({ ctx, input }) => {
    const loan = await getLoanById(input.id);
    if (!loan) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E40\u0E07\u0E34\u0E19\u0E01\u0E39\u0E49");
    if (ctx.user.id !== loan.borrowerId && ctx.user.id !== loan.lenderId && ctx.user.role !== "admin") {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07");
    }
    return loan;
  }),
  /**
   * ดูตารางผ่อนชำระ
   */
  getAmortizationSchedule: protectedProcedure.input(z3.object({ loanId: z3.number() })).query(async ({ ctx, input }) => {
    const loan = await getLoanById(input.loanId);
    if (!loan) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E40\u0E07\u0E34\u0E19\u0E01\u0E39\u0E49");
    if (ctx.user.id !== loan.borrowerId && ctx.user.id !== loan.lenderId && ctx.user.role !== "admin") {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07");
    }
    return await getAmortizationSchedule(input.loanId);
  }),
  // ===== Payment Procedures =====
  /**
   * สร้าง payload สำหรับ QR พร้อมเพย์ของจำนวนเงินที่ระบุ
   */
  generatePromptPayPayload: protectedProcedure.input(
    z3.object({
      promptPayId: z3.string().regex(/^[0-9]{10,13}$/, "PromptPay ID \u0E15\u0E49\u0E2D\u0E07\u0E40\u0E1B\u0E47\u0E19\u0E40\u0E1A\u0E2D\u0E23\u0E4C\u0E42\u0E17\u0E23\u0E2B\u0E23\u0E37\u0E2D\u0E40\u0E25\u0E02\u0E1A\u0E31\u0E15\u0E23\u0E1B\u0E23\u0E30\u0E0A\u0E32\u0E0A\u0E19"),
      amount: z3.number().positive("\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E15\u0E49\u0E2D\u0E07\u0E21\u0E32\u0E01\u0E01\u0E27\u0E48\u0E32 0")
    })
  ).query(({ input }) => ({
    payload: generatePromptPayPayload(input.promptPayId, { amount: input.amount }),
    amount: input.amount
  })),
  /**
   * อัปโหลดสลิปไปยัง storage และบันทึกการชำระเงินในรายการเดียว
   */
  uploadPaymentSlip: protectedProcedure.input(uploadPaymentSlipInputSchema).mutation(async ({ ctx, input }) => {
    const loan = await getLoanById(input.loanId);
    if (!loan) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E40\u0E07\u0E34\u0E19\u0E01\u0E39\u0E49");
    if (ctx.user.id !== loan.borrowerId) {
      throw new Error("\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2D\u0E31\u0E1B\u0E42\u0E2B\u0E25\u0E14\u0E2A\u0E25\u0E34\u0E1B");
    }
    const fileBuffer = Buffer.from(input.base64, "base64");
    if (fileBuffer.length === 0 || fileBuffer.length > 5 * 1024 * 1024) {
      throw new Error("\u0E02\u0E19\u0E32\u0E14\u0E44\u0E1F\u0E25\u0E4C\u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E40\u0E01\u0E34\u0E19 5 MB");
    }
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `payment-slips/${ctx.user.id}/${input.loanId}-${Date.now()}-${safeName}`;
    const uploaded = await storagePut(storageKey, fileBuffer, input.mimeType);
    const result = await createLoanPayment({
      loanId: input.loanId,
      scheduleId: input.scheduleId,
      amountPaid: input.amountPaid.toString(),
      paymentMethod: input.paymentMethod,
      slipPath: uploaded.url
    });
    await createNotification({
      userId: loan.lenderId,
      type: "payment_verified",
      message: `\u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49\u0E2D\u0E31\u0E1B\u0E42\u0E2B\u0E25\u0E14\u0E2A\u0E25\u0E34\u0E1B\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19 ${input.amountPaid} \u0E1A\u0E32\u0E17 \u0E23\u0E2D\u0E01\u0E32\u0E23\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A`,
      sentVia: "in-app"
    });
    return { success: true, storageKey: uploaded.key, slipUrl: uploaded.url, result };
  }),
  /**
   * บันทึกการชำระเงิน (upload สลิป)
   */
  recordPayment: protectedProcedure.input(
    z3.object({
      loanId: z3.number(),
      amountPaid: z3.number().positive(),
      paymentMethod: z3.string(),
      slipPath: z3.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const loan = await getLoanById(input.loanId);
    if (!loan) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E40\u0E07\u0E34\u0E19\u0E01\u0E39\u0E49");
    if (ctx.user.id !== loan.borrowerId) {
      throw new Error("\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19");
    }
    const result = await createLoanPayment({
      loanId: input.loanId,
      amountPaid: input.amountPaid.toString(),
      paymentMethod: input.paymentMethod,
      slipPath: input.slipPath
    });
    await createNotification({
      userId: loan.lenderId,
      type: "payment_verified",
      message: `\u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49\u0E44\u0E14\u0E49\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19 ${input.amountPaid} \u0E1A\u0E32\u0E17 \u0E23\u0E2D\u0E01\u0E32\u0E23\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A`,
      sentVia: "in-app"
    });
    return result;
  }),
  /**
   * ดูประวัติการชำระเงิน
   */
  getPayments: protectedProcedure.input(z3.object({ loanId: z3.number() })).query(async ({ ctx, input }) => {
    const loan = await getLoanById(input.loanId);
    if (!loan) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E40\u0E07\u0E34\u0E19\u0E01\u0E39\u0E49");
    if (ctx.user.id !== loan.borrowerId && ctx.user.id !== loan.lenderId && ctx.user.role !== "admin") {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07");
    }
    return await getLoanPayments(input.loanId);
  }),
  /**
   * ดูการชำระเงินที่รอการตรวจสอบ (Admin/Lender)
   */
  getPendingPayments: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "lender") {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07");
    }
    const payments = await getPendingPaymentVerifications();
    if (ctx.user.role === "admin") return payments;
    const scopedPayments = await Promise.all(payments.map(async (payment) => {
      const loan = await getLoanById(payment.loanId);
      return loan?.lenderId === ctx.user.id ? payment : null;
    }));
    return scopedPayments.filter((payment) => payment !== null);
  }),
  /**
   * ตรวจสอบการชำระเงิน (Admin/Lender)
   */
  verifyPayment: protectedProcedure.input(verifyPaymentInputSchema).mutation(async ({ ctx, input }) => {
    if (!canManageLoan(ctx.user.role)) {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19");
    }
    const payment = await getPaymentById(input.paymentId);
    if (!payment) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19");
    const paymentLoan = await getLoanById(payment.loanId);
    if (!paymentLoan || ctx.user.role === "lender" && paymentLoan.lenderId !== ctx.user.id) {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E19\u0E35\u0E49");
    }
    await verifyPayment(input.paymentId, ctx.user.id);
    return { success: true };
  }),
  /**
   * ปฏิเสธการชำระเงิน (Admin/Lender)
   */
  rejectPayment: protectedProcedure.input(rejectPaymentInputSchema).mutation(async ({ ctx, input }) => {
    if (!canManageLoan(ctx.user.role)) {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19");
    }
    const payment = await getPaymentById(input.paymentId);
    if (!payment) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19");
    const paymentLoan = await getLoanById(payment.loanId);
    if (!paymentLoan || ctx.user.role === "lender" && paymentLoan.lenderId !== ctx.user.id) {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E19\u0E35\u0E49");
    }
    await rejectPayment(input.paymentId, ctx.user.id, input.reason);
    return { success: true };
  }),
  // ===== Notification Procedures =====
  /**
   * ดูการแจ้งเตือนของตัวเอง
   */
  getNotifications: protectedProcedure.query(async ({ ctx }) => {
    return await getUserNotifications(ctx.user.id);
  }),
  /**
   * ทำเครื่องหมายการแจ้งเตือนว่าอ่านแล้ว
   */
  markAsRead: protectedProcedure.input(z3.object({ notificationId: z3.number() })).mutation(async ({ ctx, input }) => {
    await markNotificationAsRead(input.notificationId, ctx.user.id);
    return { success: true };
  }),
  // ===== Admin Dashboard Procedures =====
  /**
   * ดูสถิติแดชบอร์ด Admin
   */
  getAdminDashboard: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E40\u0E02\u0E49\u0E32\u0E16\u0E36\u0E07");
    }
    return await getAdminStats();
  })
});

// server/routers/exportRouter.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z4 } from "zod";
import { eq as eq2 } from "drizzle-orm";

// server/csvExport.ts
function toDateKey(value) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}
function filterAmortizationScheduleByDateRange(schedule, dateRange) {
  if (!dateRange?.startDate && !dateRange?.endDate) {
    return schedule;
  }
  return schedule.filter((row) => {
    const dueDateKey = toDateKey(row.dueDate);
    return (!dateRange.startDate || dueDateKey >= dateRange.startDate) && (!dateRange.endDate || dueDateKey <= dateRange.endDate);
  });
}
function generateAmortizationCSV(loanInfo, schedule, dateRange) {
  const lines = [];
  lines.push("\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E40\u0E07\u0E34\u0E19\u0E01\u0E39\u0E49\u0E22\u0E37\u0E21 - \u0E15\u0E32\u0E23\u0E32\u0E07\u0E1C\u0E48\u0E2D\u0E19\u0E0A\u0E33\u0E23\u0E30");
  lines.push("Loan Agreement - Amortization Schedule");
  lines.push("");
  lines.push(`\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E2A\u0E31\u0E0D\u0E0D\u0E32 (Loan ID),${escapeCSV(loanInfo.loanId)}`);
  lines.push(`\u0E0A\u0E37\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49 (Borrower Name),${escapeCSV(loanInfo.borrowerName)}`);
  lines.push(`\u0E40\u0E07\u0E34\u0E19\u0E15\u0E49\u0E19 (Principal Amount),${escapeCSV(loanInfo.principalAmount)}`);
  lines.push(`\u0E2D\u0E31\u0E15\u0E23\u0E32\u0E14\u0E2D\u0E01\u0E40\u0E1A\u0E35\u0E49\u0E22 (Interest Rate),${escapeCSV(`${loanInfo.interestRate}%`)}`);
  lines.push(`\u0E23\u0E30\u0E22\u0E30\u0E40\u0E27\u0E25\u0E32\u0E1C\u0E48\u0E2D\u0E19 (Loan Term),${escapeCSV(`${loanInfo.loanTermMonths} \u0E40\u0E14\u0E37\u0E2D\u0E19`)}`);
  lines.push(`\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19 (Start Date),${escapeCSV(loanInfo.startDate)}`);
  lines.push(`\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14 (End Date),${escapeCSV(loanInfo.endDate)}`);
  lines.push(`\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E14\u0E2D\u0E01\u0E40\u0E1A\u0E35\u0E49\u0E22 (Interest Type),${escapeCSV(loanInfo.interestType)}`);
  lines.push(`\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17\u0E01\u0E32\u0E23\u0E1C\u0E48\u0E2D\u0E19 (Payment Type),${escapeCSV(loanInfo.paymentType)}`);
  if (dateRange?.startDate || dateRange?.endDate) {
    const rangeLabel = `${dateRange.startDate || "\u0E44\u0E21\u0E48\u0E08\u0E33\u0E01\u0E31\u0E14"} \u0E16\u0E36\u0E07 ${dateRange.endDate || "\u0E44\u0E21\u0E48\u0E08\u0E33\u0E01\u0E31\u0E14"}`;
    lines.push(`\u0E0A\u0E48\u0E27\u0E07\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 Export (Export Date Range),${escapeCSV(rangeLabel)}`);
  }
  lines.push("");
  const headers = [
    "\u0E07\u0E27\u0E14\u0E17\u0E35\u0E48",
    "\u0E27\u0E31\u0E19\u0E04\u0E23\u0E1A\u0E01\u0E33\u0E2B\u0E19\u0E14",
    "\u0E22\u0E2D\u0E14\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E15\u0E49\u0E19",
    "\u0E0A\u0E33\u0E23\u0E30\u0E15\u0E49\u0E19",
    "\u0E0A\u0E33\u0E23\u0E30\u0E14\u0E2D\u0E01",
    "\u0E23\u0E27\u0E21\u0E0A\u0E33\u0E23\u0E30",
    "\u0E22\u0E2D\u0E14\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D\u0E2A\u0E34\u0E49\u0E19"
  ];
  lines.push(headers.map((h) => escapeCSV(h)).join(","));
  schedule.forEach((row) => {
    const values = [
      row.paymentNumber,
      row.dueDate,
      row.startingBalance,
      row.principalDue,
      row.interestDue,
      row.totalPayment,
      row.endingBalance
    ];
    lines.push(values.map((v) => escapeCSV(v)).join(","));
  });
  return lines.join("\n");
}
function escapeCSV(value) {
  if (value === null || value === void 0) {
    return "";
  }
  const stringValue = String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}
function generateCSVFilename(loanId, dateRange) {
  const now = /* @__PURE__ */ new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "");
  const rangePart = dateRange?.startDate || dateRange?.endDate ? `_${dateRange.startDate || "start"}_to_${dateRange.endDate || "end"}` : "";
  return `amortization_schedule_${loanId}${rangePart}_${dateStr}_${timeStr}.csv`;
}

// server/routers/exportRouter.ts
var dateOnlyInput = z4.string().regex(/^\d{4}-\d{2}-\d{2}$/, "\u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E2D\u0E22\u0E39\u0E48\u0E43\u0E19\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A YYYY-MM-DD").optional();
var amortizationExportInput = z4.object({
  loanId: z4.number().int().positive(),
  startDate: dateOnlyInput,
  endDate: dateOnlyInput
}).superRefine((value, refinementContext) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    refinementContext.addIssue({
      code: z4.ZodIssueCode.custom,
      path: ["endDate"],
      message: "\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14\u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E19\u0E49\u0E2D\u0E22\u0E01\u0E27\u0E48\u0E32\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19"
    });
  }
});
var exportRouter = router({
  /**
   * Export amortization schedule as CSV
   * ผู้ใช้สามารถ export ตารางผ่อนชำระของสัญญาเงินกู้ของตนเองได้
   */
  amortizationScheduleCSV: protectedProcedure.input(amortizationExportInput).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError3({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available"
      });
    }
    const loan = await db.select().from(loans).where(eq2(loans.id, input.loanId)).limit(1);
    if (!loan || loan.length === 0) {
      throw new TRPCError3({
        code: "NOT_FOUND",
        message: "Loan not found"
      });
    }
    const loanRecord = loan[0];
    if (ctx.user.role === "borrower" && loanRecord.borrowerId !== ctx.user.id) {
      throw new TRPCError3({
        code: "FORBIDDEN",
        message: "You do not have permission to export this loan"
      });
    }
    const borrower = await db.select().from(users).where(eq2(users.id, loanRecord.borrowerId)).limit(1);
    const borrowerName = borrower?.[0]?.name || "Unknown";
    const schedule = await db.select().from(amortizationSchedules).where(eq2(amortizationSchedules.loanId, input.loanId)).orderBy(amortizationSchedules.paymentNumber);
    if (!schedule || schedule.length === 0) {
      throw new TRPCError3({
        code: "NOT_FOUND",
        message: "Amortization schedule not found"
      });
    }
    const filteredSchedule = filterAmortizationScheduleByDateRange(schedule, {
      startDate: input.startDate,
      endDate: input.endDate
    });
    const formattedSchedule = filteredSchedule.map((row) => ({
      paymentNumber: row.paymentNumber,
      dueDate: new Date(row.dueDate).toLocaleDateString("th-TH"),
      startingBalance: parseFloat(row.startingBalance).toLocaleString("th-TH", {
        maximumFractionDigits: 2
      }),
      principalDue: parseFloat(row.principalDue).toLocaleString("th-TH", {
        maximumFractionDigits: 2
      }),
      interestDue: parseFloat(row.interestDue).toLocaleString("th-TH", {
        maximumFractionDigits: 2
      }),
      totalPayment: parseFloat(row.totalPaymentDue).toLocaleString("th-TH", {
        maximumFractionDigits: 2
      }),
      endingBalance: parseFloat(row.endingBalance).toLocaleString("th-TH", {
        maximumFractionDigits: 2
      })
    }));
    const csvContent = generateAmortizationCSV(
      {
        loanId: loanRecord.id,
        borrowerName,
        principalAmount: parseFloat(loanRecord.principalAmount).toLocaleString(
          "th-TH",
          { maximumFractionDigits: 2 }
        ),
        interestRate: loanRecord.interestRate,
        loanTermMonths: loanRecord.loanTermMonths,
        startDate: new Date(loanRecord.startDate).toLocaleDateString("th-TH"),
        endDate: new Date(
          new Date(loanRecord.startDate).getTime() + loanRecord.loanTermMonths * 30 * 24 * 60 * 60 * 1e3
        ).toLocaleDateString("th-TH"),
        interestType: loanRecord.interestType,
        paymentType: loanRecord.paymentType
      },
      formattedSchedule,
      {
        startDate: input.startDate,
        endDate: input.endDate
      }
    );
    const filename = generateCSVFilename(loanRecord.id, {
      startDate: input.startDate,
      endDate: input.endDate
    });
    return {
      success: true,
      filename,
      csvContent,
      contentType: "text/csv;charset=utf-8;",
      rowCount: filteredSchedule.length,
      dateRange: {
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null
      }
    };
  }),
  /**
   * Export multiple loans data as CSV (for admin/lender)
   * ผู้ให้กู้และแอดมินสามารถ export ข้อมูลหลายสัญญาได้
   */
  multipleLoansCSV: protectedProcedure.input(
    z4.object({
      loanIds: z4.array(z4.number())
    })
  ).query(async ({ ctx, input }) => {
    if (ctx.user.role === "borrower") {
      throw new TRPCError3({
        code: "FORBIDDEN",
        message: "Only lenders and admins can export multiple loans"
      });
    }
    const db = await getDb();
    if (!db) {
      throw new TRPCError3({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available"
      });
    }
    const lines = [];
    lines.push("\u0E2A\u0E23\u0E38\u0E1B\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E40\u0E07\u0E34\u0E19\u0E01\u0E39\u0E49");
    lines.push("Loan Summary Report");
    lines.push("");
    lines.push(
      [
        "\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E2A\u0E31\u0E0D\u0E0D\u0E32",
        "\u0E0A\u0E37\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49",
        "\u0E40\u0E07\u0E34\u0E19\u0E15\u0E49\u0E19",
        "\u0E2D\u0E31\u0E15\u0E23\u0E32\u0E14\u0E2D\u0E01\u0E40\u0E1A\u0E35\u0E49\u0E22",
        "\u0E23\u0E30\u0E22\u0E30\u0E40\u0E27\u0E25\u0E32",
        "\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19",
        "\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14",
        "\u0E22\u0E2D\u0E14\u0E0A\u0E33\u0E23\u0E30\u0E41\u0E25\u0E49\u0E27",
        "\u0E22\u0E2D\u0E14\u0E04\u0E07\u0E04\u0E49\u0E32\u0E07",
        "\u0E2A\u0E16\u0E32\u0E19\u0E30"
      ].join(",")
    );
    for (const loanId of input.loanIds) {
      const loan = await db.select().from(loans).where(eq2(loans.id, loanId)).limit(1);
      if (loan && loan.length > 0) {
        const loanRecord = loan[0];
        const borrower = await db.select().from(users).where(eq2(users.id, loanRecord.borrowerId)).limit(1);
        const borrowerName = borrower?.[0]?.name || "Unknown";
        const principal = parseFloat(loanRecord.principalAmount);
        const paid = parseFloat(loanRecord.totalPaid || "0");
        const outstanding = principal - paid;
        const values = [
          loanRecord.id.toString(),
          borrowerName,
          principal.toFixed(2),
          loanRecord.interestRate,
          loanRecord.loanTermMonths.toString(),
          new Date(loanRecord.startDate).toLocaleDateString("th-TH"),
          new Date(
            new Date(loanRecord.startDate).getTime() + loanRecord.loanTermMonths * 30 * 24 * 60 * 60 * 1e3
          ).toLocaleDateString("th-TH"),
          paid.toFixed(2),
          outstanding.toFixed(2),
          loanRecord.isClosed ? "\u0E1B\u0E34\u0E14\u0E41\u0E25\u0E49\u0E27" : "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19"
        ];
        lines.push(values.join(","));
      }
    }
    const csvContent = lines.join("\n");
    const now = /* @__PURE__ */ new Date();
    const dateStr = now.toISOString().split("T")[0];
    const filename = `loans_summary_${dateStr}.csv`;
    return {
      success: true,
      filename,
      csvContent,
      contentType: "text/csv;charset=utf-8;"
    };
  })
});

// server/routers/adminRouter.ts
import { TRPCError as TRPCError4 } from "@trpc/server";
import { z as z5 } from "zod";
import { asc, desc as desc4, eq as eq5, and as and3, gte as gte2, inArray, isNotNull, isNull as isNull2, like, lt as lt2, or, sql as sql3 } from "drizzle-orm";

// server/adminAnalytics.ts
function getLoanTypeDistribution(rows) {
  return [
    { name: "\u0E1C\u0E48\u0E2D\u0E19\u0E04\u0E07\u0E17\u0E35\u0E48", value: rows.filter((row) => row.paymentType === "fixed").length },
    { name: "\u0E25\u0E14\u0E15\u0E49\u0E19\u0E25\u0E14\u0E14\u0E2D\u0E01", value: rows.filter((row) => row.paymentType === "reducing").length }
  ];
}
function getPaymentStatusDistribution(rows) {
  return [
    { name: "\u0E23\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A", value: rows.filter((row) => row.status === "pending").length },
    { name: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E41\u0E25\u0E49\u0E27", value: rows.filter((row) => row.status === "verified").length },
    { name: "\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18", value: rows.filter((row) => row.status === "rejected").length }
  ];
}

// server/dashboardTimeUtils.ts
function startOfUtcDay(value) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
function dayKey(value) {
  return value.toISOString().slice(0, 10);
}
function getDashboardTimeWindow(days, now = /* @__PURE__ */ new Date()) {
  const end = startOfUtcDay(now);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start, end };
}
function getDashboardCustomWindow(range) {
  return {
    start: /* @__PURE__ */ new Date(`${range.startDate}T00:00:00.000Z`),
    end: /* @__PURE__ */ new Date(`${range.endDate}T00:00:00.000Z`)
  };
}
function getDashboardRangeWindow(range, now = /* @__PURE__ */ new Date()) {
  return typeof range === "number" ? getDashboardTimeWindow(range, now) : getDashboardCustomWindow(range);
}
function getPreviousDashboardWindow(range, now = /* @__PURE__ */ new Date()) {
  const current = getDashboardRangeWindow(range, now);
  const days = Math.round((current.end.getTime() - current.start.getTime()) / 864e5) + 1;
  const end = new Date(current.start);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start, end };
}
function getDashboardComparisonWindow(range, mode, now = /* @__PURE__ */ new Date()) {
  if (mode === "matching_period") return getPreviousDashboardWindow(range, now);
  const { end: anchor } = getDashboardRangeWindow(range, now);
  if (mode === "previous_month") {
    const end2 = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 0));
    const start2 = new Date(Date.UTC(end2.getUTCFullYear(), end2.getUTCMonth(), 1));
    return { start: start2, end: end2 };
  }
  const currentQuarterStart = Math.floor(anchor.getUTCMonth() / 3) * 3;
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), currentQuarterStart, 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), Math.floor(end.getUTCMonth() / 3) * 3, 1));
  return { start, end };
}
function buildDailyPaymentTrend(payments, range, now = /* @__PURE__ */ new Date()) {
  const { start, end } = typeof range === "number" ? getDashboardTimeWindow(range, now) : getDashboardCustomWindow(range);
  const totals = /* @__PURE__ */ new Map();
  const cursor = new Date(start);
  while (cursor <= end) {
    totals.set(dayKey(cursor), 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const payment of payments) {
    const occurredAt = new Date(payment.paymentDate);
    if (Number.isNaN(occurredAt.getTime())) continue;
    const key = dayKey(occurredAt);
    if (!totals.has(key)) continue;
    totals.set(key, (totals.get(key) ?? 0) + Number(payment.amountPaid || 0));
  }
  const labels = Array.from(totals.keys());
  return { labels, data: labels.map((label) => Math.round((totals.get(label) ?? 0) * 100) / 100) };
}

// server/notificationPreferencesDb.ts
import { desc as desc2, eq as eq3 } from "drizzle-orm";
async function recordNotificationPreferenceAudit(userId, action, changedFields = []) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(notificationPreferenceAuditLogs).values({
    userId,
    action,
    changedFields: changedFields.join(",")
  });
  return true;
}
async function getNotificationPreferenceAuditLogs(userId, limit = 8) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notificationPreferenceAuditLogs).where(eq3(notificationPreferenceAuditLogs.userId, userId)).orderBy(desc2(notificationPreferenceAuditLogs.createdAt)).limit(limit);
}
async function getNotificationPreferences(userId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(notificationPreferences).where(eq3(notificationPreferences.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function createDefaultNotificationPreferences(userId) {
  const db = await getDb();
  if (!db) return void 0;
  try {
    const result = await db.insert(notificationPreferences).values({
      userId,
      emailNewLoanRequest: true,
      emailLoanApproval: true,
      emailLoanRejection: true,
      emailPaymentReminder: true,
      emailPaymentConfirmation: true,
      lineNewLoanRequest: true,
      lineLoanApproval: true,
      lineLoanRejection: true,
      linePaymentReminder: true,
      linePaymentConfirmation: true
    });
    return await getNotificationPreferences(userId);
  } catch (error) {
    console.error("[NotificationPreferences] Failed to create default preferences:", error);
    return void 0;
  }
}
async function updateNotificationPreferences(userId, updates) {
  const db = await getDb();
  if (!db) return void 0;
  try {
    let prefs = await getNotificationPreferences(userId);
    if (!prefs) {
      prefs = await createDefaultNotificationPreferences(userId);
      if (!prefs) return void 0;
    }
    await db.update(notificationPreferences).set(updates).where(eq3(notificationPreferences.userId, userId));
    return await getNotificationPreferences(userId);
  } catch (error) {
    console.error("[NotificationPreferences] Failed to update preferences:", error);
    return void 0;
  }
}
async function shouldSendEmailNewLoanRequest(userId) {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.emailNewLoanRequest ?? true;
  }
  return prefs.emailNewLoanRequest;
}
async function shouldSendEmailLoanApproval(userId) {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.emailLoanApproval ?? true;
  }
  return prefs.emailLoanApproval;
}
async function shouldSendEmailLoanRejection(userId) {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.emailLoanRejection ?? true;
  }
  return prefs.emailLoanRejection;
}
async function shouldSendEmailPaymentReminder(userId) {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.emailPaymentReminder ?? true;
  }
  return prefs.emailPaymentReminder;
}
async function shouldSendLineNewLoanRequest(userId) {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.lineNewLoanRequest ?? true;
  }
  return prefs.lineNewLoanRequest;
}
async function shouldSendLineLoanApproval(userId) {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.lineLoanApproval ?? true;
  }
  return prefs.lineLoanApproval;
}
async function shouldSendLineLoanRejection(userId) {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.lineLoanRejection ?? true;
  }
  return prefs.lineLoanRejection;
}
async function shouldSendLinePaymentReminder(userId) {
  const prefs = await getNotificationPreferences(userId);
  if (!prefs) {
    const newPrefs = await createDefaultNotificationPreferences(userId);
    return newPrefs?.linePaymentReminder ?? true;
  }
  return prefs.linePaymentReminder;
}

// server/routers/adminRouter.ts
import { randomUUID } from "crypto";

// server/reportGovernanceDb.ts
import { and as and2, desc as desc3, eq as eq4, gt, gte, isNull, lt, ne, sql as sql2 } from "drizzle-orm";
var POLICY_ID = 1;
var legacyAdminDefaults = {
  canExportCsv: true,
  canExportPdf: true,
  canVerifyReferences: true,
  canViewTeamDownloadHistory: true,
  canManageExportPermissions: true
};
function selectApprovalNotificationRecipients(rows, requesterId) {
  return rows.filter((row) => row.userId !== requesterId && (row.canManageExportPermissions ?? true)).map((row) => row.userId);
}
function mergeGovernanceDailyTrend(exports, events) {
  const daily = /* @__PURE__ */ new Map();
  for (const row of exports) daily.set(row.date, { date: row.date, exportCount: Number(row.exportCount), exportedRows: Number(row.exportedRows), securityEventCount: 0, highSeverityCount: 0 });
  for (const row of events) {
    const current = daily.get(row.date) ?? { date: row.date, exportCount: 0, exportedRows: 0, securityEventCount: 0, highSeverityCount: 0 };
    current.securityEventCount = Number(row.eventCount);
    current.highSeverityCount = Number(row.highSeverityCount);
    daily.set(row.date, current);
  }
  return Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date));
}
var defaultExportSecurityPolicy = {
  highVolumeRowThreshold: 500,
  approvalRowThreshold: 750,
  retentionDays: 365,
  approvalExpiresHours: 24,
  alertOwnerOnHighVolume: true,
  updatedAt: null
};
function toPolicy(row) {
  return {
    highVolumeRowThreshold: row.highVolumeRowThreshold,
    approvalRowThreshold: row.approvalRowThreshold,
    retentionDays: row.retentionDays,
    approvalExpiresHours: row.approvalExpiresHours,
    alertOwnerOnHighVolume: row.alertOwnerOnHighVolume,
    updatedAt: row.updatedAt
  };
}
async function getEffectiveExportPermissions(userId) {
  const db = await getDb();
  if (!db) return null;
  const [record] = await db.select().from(adminExportPermissions).where(eq4(adminExportPermissions.userId, userId)).limit(1);
  return record ? {
    canExportCsv: record.canExportCsv,
    canExportPdf: record.canExportPdf,
    canVerifyReferences: record.canVerifyReferences,
    canViewTeamDownloadHistory: record.canViewTeamDownloadHistory,
    canManageExportPermissions: record.canManageExportPermissions
  } : legacyAdminDefaults;
}
async function saveExportPermissions(userId, permissions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db.select({ id: adminExportPermissions.id }).from(adminExportPermissions).where(eq4(adminExportPermissions.userId, userId)).limit(1);
  if (existing) {
    await db.update(adminExportPermissions).set({ ...permissions, updatedAt: /* @__PURE__ */ new Date() }).where(eq4(adminExportPermissions.id, existing.id));
  } else {
    await db.insert(adminExportPermissions).values({ userId, ...permissions });
  }
}
async function getExportSecurityPolicy() {
  const db = await getDb();
  if (!db) return null;
  const [policy] = await db.select().from(reportExportSecurityPolicy).where(eq4(reportExportSecurityPolicy.id, POLICY_ID)).limit(1);
  return policy ? toPolicy(policy) : defaultExportSecurityPolicy;
}
async function saveExportSecurityPolicy(userId, policy) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const values = { ...policy, id: POLICY_ID, updatedById: userId, updatedAt: /* @__PURE__ */ new Date() };
  const [existing] = await db.select({ id: reportExportSecurityPolicy.id }).from(reportExportSecurityPolicy).where(eq4(reportExportSecurityPolicy.id, POLICY_ID)).limit(1);
  if (existing) {
    await db.update(reportExportSecurityPolicy).set(values).where(eq4(reportExportSecurityPolicy.id, POLICY_ID));
  } else {
    await db.insert(reportExportSecurityPolicy).values(values);
  }
  return { ...policy, updatedAt: values.updatedAt };
}
async function createSecurityEvent(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(reportExportSecurityEvents).values({
    actorId: input.actorId,
    approvalRequestId: input.approvalRequestId ?? null,
    type: input.type,
    severity: input.severity,
    rowCount: input.rowCount ?? null,
    referenceCode: input.referenceCode ?? null,
    message: input.message
  });
}
async function requestHighSensitivityExport(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const policy = await getExportSecurityPolicy();
  if (!policy) throw new Error("Export security policy is not available");
  const expiresAt = new Date(Date.now() + policy.approvalExpiresHours * 60 * 60 * 1e3);
  const [existing] = await db.select({ id: reportExportApprovalRequests.id, expiresAt: reportExportApprovalRequests.expiresAt }).from(reportExportApprovalRequests).where(and2(
    eq4(reportExportApprovalRequests.requesterId, input.userId),
    eq4(reportExportApprovalRequests.format, input.format),
    eq4(reportExportApprovalRequests.rowCount, input.rowCount),
    eq4(reportExportApprovalRequests.filterSummary, input.filterSummary),
    eq4(reportExportApprovalRequests.status, "pending"),
    gt(reportExportApprovalRequests.expiresAt, /* @__PURE__ */ new Date())
  )).limit(1);
  if (existing) return { requestId: existing.id, expiresAt: existing.expiresAt, reused: true, notifiedApproverCount: 0 };
  const result = await db.insert(reportExportApprovalRequests).values({
    requesterId: input.userId,
    format: input.format,
    rowCount: input.rowCount,
    filterSummary: input.filterSummary,
    expiresAt
  }).returning({ id: reportExportApprovalRequests.id });
  const requestId = result[0]?.id ?? 0;
  await createSecurityEvent({
    actorId: input.userId,
    approvalRequestId: requestId,
    type: "approval_requested",
    severity: "warning",
    rowCount: input.rowCount,
    message: `High-sensitivity ${input.format.toUpperCase()} export requested (${input.rowCount} rows).`
  });
  const approvalCandidates = await db.select({ userId: users.id, canManageExportPermissions: adminExportPermissions.canManageExportPermissions }).from(users).leftJoin(adminExportPermissions, eq4(users.id, adminExportPermissions.userId)).where(eq4(users.role, "admin"));
  const recipientIds = selectApprovalNotificationRecipients(approvalCandidates, input.userId);
  const notificationMessage = `\u0E21\u0E35\u0E04\u0E33\u0E02\u0E2D\u0E2A\u0E48\u0E07\u0E2D\u0E2D\u0E01 ${input.format.toUpperCase()} \u0E23\u0E30\u0E14\u0E31\u0E1A\u0E2A\u0E39\u0E07 #${requestId} \u0E08\u0E33\u0E19\u0E27\u0E19 ${input.rowCount.toLocaleString("th-TH")} \u0E41\u0E16\u0E27 \u0E23\u0E2D\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E43\u0E19 Report Governance`;
  const deliveries = await Promise.allSettled(recipientIds.map((userId) => createNotification({ userId, type: "export_approval_pending", message: notificationMessage, sentVia: "in-app" })));
  return { requestId, expiresAt, reused: false, notifiedApproverCount: deliveries.filter((delivery) => delivery.status === "fulfilled").length };
}
async function getOwnExportApprovalRequests(userId, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  await db.update(reportExportApprovalRequests).set({ status: "expired" }).where(and2(eq4(reportExportApprovalRequests.requesterId, userId), eq4(reportExportApprovalRequests.status, "pending"), lt(reportExportApprovalRequests.expiresAt, /* @__PURE__ */ new Date())));
  return db.select().from(reportExportApprovalRequests).where(eq4(reportExportApprovalRequests.requesterId, userId)).orderBy(desc3(reportExportApprovalRequests.createdAt)).limit(limit);
}
async function getPendingExportApprovalRequests(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  await db.update(reportExportApprovalRequests).set({ status: "expired" }).where(and2(eq4(reportExportApprovalRequests.status, "pending"), lt(reportExportApprovalRequests.expiresAt, /* @__PURE__ */ new Date())));
  return db.select().from(reportExportApprovalRequests).where(and2(eq4(reportExportApprovalRequests.status, "pending"), gt(reportExportApprovalRequests.expiresAt, /* @__PURE__ */ new Date()))).orderBy(desc3(reportExportApprovalRequests.createdAt)).limit(limit);
}
async function decideExportApprovalRequest(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [request] = await db.select().from(reportExportApprovalRequests).where(eq4(reportExportApprovalRequests.id, input.requestId)).limit(1);
  if (!request) return { outcome: "not_found" };
  if (request.requesterId === input.reviewerId) return { outcome: "self_approval" };
  if (request.status !== "pending" || request.expiresAt <= /* @__PURE__ */ new Date()) {
    if (request.status === "pending") {
      await db.update(reportExportApprovalRequests).set({ status: "expired" }).where(eq4(reportExportApprovalRequests.id, request.id));
    }
    return { outcome: "not_pending" };
  }
  const status = input.approve ? "approved" : "rejected";
  await db.update(reportExportApprovalRequests).set({ status, reviewedById: input.reviewerId, reviewerNote: input.reviewerNote ?? null, reviewedAt: /* @__PURE__ */ new Date() }).where(eq4(reportExportApprovalRequests.id, request.id));
  await createSecurityEvent({
    actorId: input.reviewerId,
    approvalRequestId: request.id,
    type: input.approve ? "approval_approved" : "approval_rejected",
    severity: input.approve ? "info" : "warning",
    rowCount: request.rowCount,
    message: `High-sensitivity ${request.format.toUpperCase()} export ${input.approve ? "approved" : "rejected"}.`
  });
  return { outcome: "decided", status };
}
async function validateApprovedExportRequest(input) {
  const policy = await getExportSecurityPolicy();
  if (!policy) return { allowed: false, reason: "policy_unavailable" };
  if (input.rowCount < policy.approvalRowThreshold) return { allowed: true, policy, approvalRequestId: null };
  if (!input.approvalRequestId) return { allowed: false, reason: "approval_required", policy };
  const db = await getDb();
  if (!db) return { allowed: false, reason: "policy_unavailable" };
  const [request] = await db.select().from(reportExportApprovalRequests).where(eq4(reportExportApprovalRequests.id, input.approvalRequestId)).limit(1);
  if (!request || request.requesterId !== input.userId || request.status !== "approved" || request.consumedAt !== null || request.expiresAt <= /* @__PURE__ */ new Date() || request.format !== input.format || request.rowCount !== input.rowCount || request.filterSummary !== input.filterSummary) {
    return { allowed: false, reason: "approval_invalid", policy };
  }
  return { allowed: true, policy, approvalRequestId: request.id };
}
async function recordReportDownload(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const gate = await validateApprovedExportRequest(input);
  if (!gate.allowed) return gate;
  if (gate.approvalRequestId) {
    const consumption = await db.update(reportExportApprovalRequests).set({ consumedAt: /* @__PURE__ */ new Date() }).where(and2(eq4(reportExportApprovalRequests.id, gate.approvalRequestId), eq4(reportExportApprovalRequests.status, "approved"), isNull(reportExportApprovalRequests.consumedAt)));
    if (Number(consumption?.affectedRows ?? 0) !== 1) {
      return { allowed: false, reason: "approval_invalid", policy: gate.policy };
    }
  }
  await db.insert(reportDownloadHistory).values({
    userId: input.userId,
    format: input.format,
    rowCount: input.rowCount,
    filterSummary: input.filterSummary,
    referenceCode: input.referenceCode || null,
    approvalRequestId: gate.approvalRequestId
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
      message: `Large ${input.format.toUpperCase()} export recorded (${input.rowCount} rows).`
    });
    if (gate.policy.alertOwnerOnHighVolume) {
      await notifyOwner({
        title: "\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E04\u0E27\u0E32\u0E21\u0E1B\u0E25\u0E2D\u0E14\u0E20\u0E31\u0E22: \u0E21\u0E35\u0E01\u0E32\u0E23\u0E2A\u0E48\u0E07\u0E2D\u0E2D\u0E01\u0E23\u0E32\u0E22\u0E07\u0E32\u0E19\u0E1B\u0E23\u0E34\u0E21\u0E32\u0E13\u0E2A\u0E39\u0E07",
        content: `\u0E21\u0E35\u0E01\u0E32\u0E23\u0E2A\u0E48\u0E07\u0E2D\u0E2D\u0E01 Audit Logs \u0E08\u0E33\u0E19\u0E27\u0E19 ${input.rowCount} \u0E41\u0E16\u0E27\u0E43\u0E19\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A ${input.format.toUpperCase()} \u0E23\u0E30\u0E1A\u0E1A\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E40\u0E2B\u0E15\u0E38\u0E01\u0E32\u0E23\u0E13\u0E4C\u0E44\u0E27\u0E49\u0E41\u0E25\u0E49\u0E27 \u0E42\u0E1B\u0E23\u0E14\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A Report Governance.`
      }).catch(() => false);
    }
  }
  return { allowed: true, policy: gate.policy, approvalRequestId: gate.approvalRequestId };
}
async function getReportDownloads(userId, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reportDownloadHistory).where(eq4(reportDownloadHistory.userId, userId)).orderBy(desc3(reportDownloadHistory.createdAt)).limit(limit);
}
async function getRecentExportSecurityEvents(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reportExportSecurityEvents).orderBy(desc3(reportExportSecurityEvents.createdAt)).limit(limit);
}
async function getGovernanceAnalytics(days = 30) {
  const db = await getDb();
  if (!db) return null;
  const safeDays = Math.max(7, Math.min(days, 90));
  const from = /* @__PURE__ */ new Date();
  from.setUTCDate(from.getUTCDate() - (safeDays - 1));
  from.setUTCHours(0, 0, 0, 0);
  const exportDate = sql2`DATE(${reportDownloadHistory.createdAt})`;
  const eventDate = sql2`DATE(${reportExportSecurityEvents.createdAt})`;
  const [exports, events, severityRows] = await Promise.all([
    db.select({ date: exportDate, exportCount: sql2`COUNT(*)`, exportedRows: sql2`COALESCE(SUM(${reportDownloadHistory.rowCount}), 0)` }).from(reportDownloadHistory).where(gte(reportDownloadHistory.createdAt, from)).groupBy(exportDate).orderBy(exportDate),
    db.select({ date: eventDate, eventCount: sql2`COUNT(*)`, highSeverityCount: sql2`COALESCE(SUM(CASE WHEN ${reportExportSecurityEvents.severity} = 'high' THEN 1 ELSE 0 END), 0)` }).from(reportExportSecurityEvents).where(gte(reportExportSecurityEvents.createdAt, from)).groupBy(eventDate).orderBy(eventDate),
    db.select({ severity: reportExportSecurityEvents.severity, count: sql2`COUNT(*)` }).from(reportExportSecurityEvents).where(gte(reportExportSecurityEvents.createdAt, from)).groupBy(reportExportSecurityEvents.severity)
  ]);
  const severity = { info: 0, warning: 0, high: 0 };
  for (const row of severityRows) severity[row.severity] = Number(row.count);
  return { days: safeDays, from, daily: mergeGovernanceDailyTrend(exports, events), severity };
}
async function isRegisteredReportDownloadRetentionTask(taskUid) {
  const db = await getDb();
  if (!db) return false;
  const [policy] = await db.select({ scheduleCronTaskUid: reportExportSecurityPolicy.scheduleCronTaskUid }).from(reportExportSecurityPolicy).where(eq4(reportExportSecurityPolicy.id, POLICY_ID)).limit(1);
  return policy?.scheduleCronTaskUid === taskUid;
}
async function runReportDownloadHistoryRetention(actorId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const policy = await getExportSecurityPolicy();
  if (!policy) throw new Error("Export security policy is not available");
  const cutoff = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1e3);
  const historyResult = await db.delete(reportDownloadHistory).where(lt(reportDownloadHistory.createdAt, cutoff));
  const eventsResult = await db.delete(reportExportSecurityEvents).where(lt(reportExportSecurityEvents.createdAt, cutoff));
  const requestsResult = await db.delete(reportExportApprovalRequests).where(and2(lt(reportExportApprovalRequests.createdAt, cutoff), ne(reportExportApprovalRequests.status, "pending")));
  const deletedHistory = Number(historyResult?.affectedRows ?? 0);
  const deletedEvents = Number(eventsResult?.affectedRows ?? 0);
  const deletedRequests = Number(requestsResult?.affectedRows ?? 0);
  const deleted = deletedHistory + deletedEvents + deletedRequests;
  if (deleted > 0) {
    await createSecurityEvent({
      actorId,
      type: "retention_cleanup",
      severity: "info",
      message: `Retention cleanup removed ${deletedHistory} download histories, ${deletedEvents} security events, and ${deletedRequests} closed approval requests.`
    });
  }
  return { cutoff, deletedHistory, deletedEvents, deletedRequests };
}

// server/routers/adminRouter.ts
var dashboardTrendInput = z5.object({
  days: z5.union([z5.literal(7), z5.literal(30), z5.literal(90)]).optional(),
  startDate: z5.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z5.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  comparisonMode: z5.enum(["matching_period", "previous_month", "previous_quarter"]).default("matching_period")
}).refine((value) => Boolean(value.startDate) === Boolean(value.endDate), { message: "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E41\u0E25\u0E30\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14\u0E43\u0E2B\u0E49\u0E04\u0E23\u0E1A", path: ["endDate"] }).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: "\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14\u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E01\u0E48\u0E2D\u0E19\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19", path: ["endDate"] }).refine((value) => !value.startDate || !value.endDate || (Date.parse(`${value.endDate}T00:00:00.000Z`) - Date.parse(`${value.startDate}T00:00:00.000Z`)) / 864e5 <= 365, { message: "Custom Date Range \u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E40\u0E01\u0E34\u0E19 366 \u0E27\u0E31\u0E19", path: ["endDate"] }).default({ days: 30, comparisonMode: "matching_period" });
var dashboardPresetCategoryAppearanceInput = z5.object({
  color: z5.enum(["blue", "violet", "teal", "amber", "rose"]),
  icon: z5.enum(["folder", "briefcase", "flag", "star", "bookmark"])
});
function parsePresetMoveSnapshot(value, nullable = false) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((item) => item !== null && (!Number.isInteger(item) || item <= 0) || !nullable && item === null)) return null;
    return parsed;
  } catch {
    return null;
  }
}
var adminRouter = router({
  getDashboardPreferences: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [preference] = await db.select().from(userDashboardPreferences).where(eq5(userDashboardPreferences.userId, ctx.user.id)).limit(1);
    return preference ?? { customRangeStartDate: null, customRangeEndDate: null, comparisonMode: "matching_period" };
  }),
  saveDashboardPreferences: protectedProcedure.input(dashboardTrendInput.refine((value) => Boolean(value.startDate && value.endDate), { message: "\u0E15\u0E49\u0E2D\u0E07\u0E21\u0E35 Custom Date Range \u0E01\u0E48\u0E2D\u0E19\u0E1A\u0E31\u0E19\u0E17\u0E36\u0E01\u0E40\u0E1B\u0E47\u0E19\u0E04\u0E48\u0E32\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19", path: ["startDate"] })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.insert(userDashboardPreferences).values({ userId: ctx.user.id, customRangeStartDate: input.startDate, customRangeEndDate: input.endDate, comparisonMode: input.comparisonMode }).onConflictDoUpdate({ target: userDashboardPreferences.userId, set: { customRangeStartDate: input.startDate, customRangeEndDate: input.endDate, comparisonMode: input.comparisonMode } });
    return { success: true };
  }),
  resetDashboardPreferences: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.delete(userDashboardPreferences).where(eq5(userDashboardPreferences.userId, ctx.user.id));
    return { success: true };
  }),
  listDashboardRangePresets: protectedProcedure.input(z5.object({
    search: z5.string().trim().max(80).optional(),
    creatorSearch: z5.string().trim().max(80).optional(),
    sort: z5.enum(["updated_desc", "name_asc", "name_desc"]).default("updated_desc"),
    scope: z5.enum(["all", "private", "team"]).default("all")
  }).default({ sort: "updated_desc", scope: "all" })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E14\u0E39 Preset \u0E02\u0E2D\u0E07\u0E17\u0E35\u0E21\u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const ownPrivate = and3(eq5(userDashboardRangePresets.userId, ctx.user.id), eq5(userDashboardRangePresets.isShared, false));
    const teamShared = eq5(userDashboardRangePresets.isShared, true);
    const visibility = input.scope === "private" ? ownPrivate : input.scope === "team" ? teamShared : or(ownPrivate, teamShared);
    const conditions = [visibility];
    if (input.search) conditions.push(like(userDashboardRangePresets.name, `%${input.search}%`));
    if (input.creatorSearch) conditions.push(like(users.name, `%${input.creatorSearch}%`));
    const condition = and3(...conditions);
    const orderBy = input.sort === "name_asc" ? asc(userDashboardRangePresets.name) : input.sort === "name_desc" ? desc4(userDashboardRangePresets.name) : desc4(userDashboardRangePresets.updatedAt);
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
      categoryIcon: userDashboardPresetCategories.icon
    }).from(userDashboardRangePresets).innerJoin(users, eq5(userDashboardRangePresets.userId, users.id)).leftJoin(userDashboardPresetPins, and3(eq5(userDashboardPresetPins.presetId, userDashboardRangePresets.id), eq5(userDashboardPresetPins.userId, ctx.user.id))).leftJoin(userDashboardPresetRecentUses, and3(eq5(userDashboardPresetRecentUses.presetId, userDashboardRangePresets.id), eq5(userDashboardPresetRecentUses.userId, ctx.user.id))).leftJoin(userDashboardPresetCategoryAssignments, and3(eq5(userDashboardPresetCategoryAssignments.presetId, userDashboardRangePresets.id), eq5(userDashboardPresetCategoryAssignments.userId, ctx.user.id))).leftJoin(userDashboardPresetCategories, and3(eq5(userDashboardPresetCategories.id, userDashboardPresetCategoryAssignments.categoryId), eq5(userDashboardPresetCategories.userId, ctx.user.id))).where(condition).orderBy(desc4(userDashboardPresetPins.pinnedAt), asc(userDashboardPresetPins.sortOrder), orderBy, desc4(userDashboardRangePresets.id));
    return presets.map((preset) => ({ ...preset, creatorName: preset.creatorName || "\u0E44\u0E21\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E1C\u0E39\u0E49\u0E2A\u0E23\u0E49\u0E32\u0E07", isPinned: Boolean(preset.pinnedAt), usageCount: preset.usageCount ?? 0, isOwner: preset.userId === ctx.user.id }));
  }),
  listDashboardPresetCategories: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E14\u0E39\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    return db.select({ id: userDashboardPresetCategories.id, name: userDashboardPresetCategories.name, color: userDashboardPresetCategories.color, icon: userDashboardPresetCategories.icon, presetCount: sql3`count(${userDashboardPresetCategoryAssignments.id})`, createdAt: userDashboardPresetCategories.createdAt, updatedAt: userDashboardPresetCategories.updatedAt }).from(userDashboardPresetCategories).leftJoin(userDashboardPresetCategoryAssignments, and3(eq5(userDashboardPresetCategoryAssignments.categoryId, userDashboardPresetCategories.id), eq5(userDashboardPresetCategoryAssignments.userId, ctx.user.id))).where(eq5(userDashboardPresetCategories.userId, ctx.user.id)).groupBy(userDashboardPresetCategories.id, userDashboardPresetCategories.name, userDashboardPresetCategories.color, userDashboardPresetCategories.icon, userDashboardPresetCategories.createdAt, userDashboardPresetCategories.updatedAt).orderBy(asc(userDashboardPresetCategories.name), asc(userDashboardPresetCategories.id));
  }),
  createDashboardPresetCategory: protectedProcedure.input(z5.object({ name: z5.string().trim().min(1, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E0A\u0E37\u0E48\u0E2D\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48").max(80) }).merge(dashboardPresetCategoryAppearanceInput)).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E2A\u0E23\u0E49\u0E32\u0E07\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const result = await db.insert(userDashboardPresetCategories).values({ userId: ctx.user.id, name: input.name, color: input.color, icon: input.icon }).returning({ id: userDashboardPresetCategories.id });
    return { id: result[0]?.id ?? 0, name: input.name, color: input.color, icon: input.icon };
  }),
  updateDashboardPresetCategoryAppearance: protectedProcedure.input(z5.object({ id: z5.number().int().positive() }).merge(dashboardPresetCategoryAppearanceInput)).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E41\u0E01\u0E49\u0E44\u0E02\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.update(userDashboardPresetCategories).set({ color: input.color, icon: input.icon, updatedAt: /* @__PURE__ */ new Date() }).where(and3(eq5(userDashboardPresetCategories.id, input.id), eq5(userDashboardPresetCategories.userId, ctx.user.id)));
    return { success: true };
  }),
  renameDashboardPresetCategory: protectedProcedure.input(z5.object({ id: z5.number().int().positive(), name: z5.string().trim().min(1, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E23\u0E30\u0E1A\u0E38\u0E0A\u0E37\u0E48\u0E2D\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48").max(80) })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E0A\u0E37\u0E48\u0E2D\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.update(userDashboardPresetCategories).set({ name: input.name, updatedAt: /* @__PURE__ */ new Date() }).where(and3(eq5(userDashboardPresetCategories.id, input.id), eq5(userDashboardPresetCategories.userId, ctx.user.id)));
    return { success: true };
  }),
  deleteDashboardPresetCategory: protectedProcedure.input(z5.object({ id: z5.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E25\u0E1A\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.delete(userDashboardPresetCategoryAssignments).where(and3(eq5(userDashboardPresetCategoryAssignments.userId, ctx.user.id), eq5(userDashboardPresetCategoryAssignments.categoryId, input.id)));
    await db.delete(userDashboardPresetCategories).where(and3(eq5(userDashboardPresetCategories.id, input.id), eq5(userDashboardPresetCategories.userId, ctx.user.id)));
    return { success: true };
  }),
  setDashboardRangePresetCategory: protectedProcedure.input(z5.object({ presetId: z5.number().int().positive(), categoryId: z5.number().int().positive().nullable() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E08\u0E31\u0E14\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [preset] = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and3(eq5(userDashboardRangePresets.id, input.presetId), or(eq5(userDashboardRangePresets.userId, ctx.user.id), eq5(userDashboardRangePresets.isShared, true)))).limit(1);
    if (!preset) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E44\u0E21\u0E48\u0E1E\u0E1A Preset \u0E17\u0E35\u0E48\u0E08\u0E31\u0E14\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48\u0E44\u0E14\u0E49" });
    if (input.categoryId === null) {
      await db.delete(userDashboardPresetCategoryAssignments).where(and3(eq5(userDashboardPresetCategoryAssignments.userId, ctx.user.id), eq5(userDashboardPresetCategoryAssignments.presetId, input.presetId)));
      return { success: true };
    }
    const [category] = await db.select({ id: userDashboardPresetCategories.id }).from(userDashboardPresetCategories).where(and3(eq5(userDashboardPresetCategories.id, input.categoryId), eq5(userDashboardPresetCategories.userId, ctx.user.id))).limit(1);
    if (!category) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48 Preset" });
    await db.insert(userDashboardPresetCategoryAssignments).values({ userId: ctx.user.id, presetId: input.presetId, categoryId: input.categoryId }).onConflictDoUpdate({ target: [userDashboardPresetCategoryAssignments.userId, userDashboardPresetCategoryAssignments.presetId], set: { categoryId: input.categoryId } });
    return { success: true };
  }),
  setDashboardRangePresetCategories: protectedProcedure.input(z5.object({ presetIds: z5.array(z5.number().int().positive()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, "Preset \u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E0B\u0E49\u0E33\u0E01\u0E31\u0E19"), categoryId: z5.number().int().positive().nullable() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E08\u0E31\u0E14\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const visiblePresets = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and3(inArray(userDashboardRangePresets.id, input.presetIds), or(eq5(userDashboardRangePresets.userId, ctx.user.id), eq5(userDashboardRangePresets.isShared, true))));
    if (visiblePresets.length !== input.presetIds.length) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E1E\u0E1A Preset \u0E17\u0E35\u0E48\u0E08\u0E31\u0E14\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49" });
    const existingAssignments = await db.select({ presetId: userDashboardPresetCategoryAssignments.presetId, categoryId: userDashboardPresetCategoryAssignments.categoryId }).from(userDashboardPresetCategoryAssignments).where(and3(eq5(userDashboardPresetCategoryAssignments.userId, ctx.user.id), inArray(userDashboardPresetCategoryAssignments.presetId, input.presetIds)));
    const currentCategories = new Map(existingAssignments.map((assignment) => [assignment.presetId, assignment.categoryId]));
    const previousCategoryIds = input.presetIds.map((presetId) => currentCategories.get(presetId) ?? null);
    const changed = previousCategoryIds.some((categoryId) => categoryId !== input.categoryId);
    if (input.categoryId === null) {
      await db.delete(userDashboardPresetCategoryAssignments).where(and3(eq5(userDashboardPresetCategoryAssignments.userId, ctx.user.id), inArray(userDashboardPresetCategoryAssignments.presetId, input.presetIds)));
    } else {
      const [category] = await db.select({ id: userDashboardPresetCategories.id }).from(userDashboardPresetCategories).where(and3(eq5(userDashboardPresetCategories.id, input.categoryId), eq5(userDashboardPresetCategories.userId, ctx.user.id))).limit(1);
      if (!category) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2B\u0E21\u0E27\u0E14\u0E2B\u0E21\u0E39\u0E48 Preset" });
      await db.insert(userDashboardPresetCategoryAssignments).values(input.presetIds.map((presetId) => ({ userId: ctx.user.id, presetId, categoryId: input.categoryId }))).onConflictDoUpdate({ target: [userDashboardPresetCategoryAssignments.userId, userDashboardPresetCategoryAssignments.presetId], set: { categoryId: input.categoryId } });
    }
    if (!changed) return { success: true, count: input.presetIds.length, historyId: null };
    const result = await db.insert(userDashboardPresetCategoryMoveHistory).values({ userId: ctx.user.id, presetIds: JSON.stringify(input.presetIds), previousCategoryIds: JSON.stringify(previousCategoryIds), destinationCategoryId: input.categoryId }).returning({ id: userDashboardPresetCategoryMoveHistory.id });
    return { success: true, count: input.presetIds.length, historyId: result[0]?.id ?? 0 };
  }),
  listDashboardPresetCategoryMoveHistory: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E14\u0E39\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E22\u0E49\u0E32\u0E22 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const rows = await db.select({ id: userDashboardPresetCategoryMoveHistory.id, presetIds: userDashboardPresetCategoryMoveHistory.presetIds, destinationCategoryId: userDashboardPresetCategoryMoveHistory.destinationCategoryId, undoneAt: userDashboardPresetCategoryMoveHistory.undoneAt, createdAt: userDashboardPresetCategoryMoveHistory.createdAt }).from(userDashboardPresetCategoryMoveHistory).where(eq5(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id)).orderBy(desc4(userDashboardPresetCategoryMoveHistory.createdAt), desc4(userDashboardPresetCategoryMoveHistory.id)).limit(10);
    return rows.flatMap((row) => {
      const presetIds = parsePresetMoveSnapshot(row.presetIds);
      return presetIds ? [{ id: row.id, presetCount: presetIds.length, destinationCategoryId: row.destinationCategoryId, undoneAt: row.undoneAt, createdAt: row.createdAt }] : [];
    });
  }),
  undoDashboardPresetCategoryMove: protectedProcedure.input(z5.object({ id: z5.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E22\u0E49\u0E2D\u0E19\u0E01\u0E25\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E22\u0E49\u0E32\u0E22 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [latestMove] = await db.select({ id: userDashboardPresetCategoryMoveHistory.id, undoneAt: userDashboardPresetCategoryMoveHistory.undoneAt }).from(userDashboardPresetCategoryMoveHistory).where(eq5(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id)).orderBy(desc4(userDashboardPresetCategoryMoveHistory.createdAt), desc4(userDashboardPresetCategoryMoveHistory.id)).limit(1);
    if (!latestMove || latestMove.id !== input.id || latestMove.undoneAt) throw new TRPCError4({ code: "CONFLICT", message: "\u0E22\u0E49\u0E2D\u0E19\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E14\u0E49\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E01\u0E32\u0E23\u0E22\u0E49\u0E32\u0E22 Preset \u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14" });
    const [history] = await db.select().from(userDashboardPresetCategoryMoveHistory).where(and3(eq5(userDashboardPresetCategoryMoveHistory.id, input.id), eq5(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id), isNull2(userDashboardPresetCategoryMoveHistory.undoneAt))).limit(1);
    if (!history) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E22\u0E49\u0E32\u0E22 Preset \u0E17\u0E35\u0E48\u0E22\u0E49\u0E2D\u0E19\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E14\u0E49" });
    const presetIds = parsePresetMoveSnapshot(history.presetIds);
    const previousCategoryIds = parsePresetMoveSnapshot(history.previousCategoryIds, true);
    if (!presetIds || !previousCategoryIds || presetIds.length !== previousCategoryIds.length || new Set(presetIds).size !== presetIds.length) throw new TRPCError4({ code: "BAD_REQUEST", message: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E22\u0E49\u0E32\u0E22 Preset \u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" });
    const visiblePresets = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and3(inArray(userDashboardRangePresets.id, presetIds), or(eq5(userDashboardRangePresets.userId, ctx.user.id), eq5(userDashboardRangePresets.isShared, true))));
    if (visiblePresets.length !== presetIds.length) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E1E\u0E1A Preset \u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E22\u0E49\u0E2D\u0E19\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E14\u0E49" });
    const categoryIds = Array.from(new Set(previousCategoryIds.filter((categoryId) => categoryId !== null)));
    if (categoryIds.length > 0) {
      const categories = await db.select({ id: userDashboardPresetCategories.id }).from(userDashboardPresetCategories).where(and3(eq5(userDashboardPresetCategories.userId, ctx.user.id), inArray(userDashboardPresetCategories.id, categoryIds)));
      if (categories.length !== categoryIds.length) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E1E\u0E1A\u0E42\u0E1F\u0E25\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E40\u0E14\u0E34\u0E21\u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E22\u0E49\u0E2D\u0E19\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E14\u0E49" });
    }
    const assignments = presetIds.map((presetId, index2) => ({ presetId, categoryId: previousCategoryIds[index2] }));
    const unassignedIds = assignments.filter((assignment) => assignment.categoryId === null).map((assignment) => assignment.presetId);
    const assignedRows = assignments.filter((assignment) => assignment.categoryId !== null).map((assignment) => ({ userId: ctx.user.id, presetId: assignment.presetId, categoryId: assignment.categoryId }));
    if (unassignedIds.length > 0) await db.delete(userDashboardPresetCategoryAssignments).where(and3(eq5(userDashboardPresetCategoryAssignments.userId, ctx.user.id), inArray(userDashboardPresetCategoryAssignments.presetId, unassignedIds)));
    if (assignedRows.length > 0) await db.insert(userDashboardPresetCategoryAssignments).values(assignedRows).onConflictDoUpdate({ target: [userDashboardPresetCategoryAssignments.userId, userDashboardPresetCategoryAssignments.presetId], set: { categoryId: sql3`excluded.category_id` } });
    await db.update(userDashboardPresetCategoryMoveHistory).set({ undoneAt: /* @__PURE__ */ new Date() }).where(and3(eq5(userDashboardPresetCategoryMoveHistory.id, input.id), eq5(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id), isNull2(userDashboardPresetCategoryMoveHistory.undoneAt)));
    return { success: true, count: presetIds.length };
  }),
  redoDashboardPresetCategoryMove: protectedProcedure.input(z5.object({ id: z5.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E17\u0E33\u0E0B\u0E49\u0E33\u0E01\u0E32\u0E23\u0E22\u0E49\u0E32\u0E22 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [latestMove] = await db.select({ id: userDashboardPresetCategoryMoveHistory.id, undoneAt: userDashboardPresetCategoryMoveHistory.undoneAt }).from(userDashboardPresetCategoryMoveHistory).where(eq5(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id)).orderBy(desc4(userDashboardPresetCategoryMoveHistory.createdAt), desc4(userDashboardPresetCategoryMoveHistory.id)).limit(1);
    if (!latestMove || latestMove.id !== input.id || !latestMove.undoneAt) throw new TRPCError4({ code: "CONFLICT", message: "\u0E17\u0E33\u0E0B\u0E49\u0E33\u0E44\u0E14\u0E49\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E01\u0E32\u0E23\u0E22\u0E49\u0E32\u0E22 Preset \u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14\u0E17\u0E35\u0E48\u0E22\u0E49\u0E2D\u0E19\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E1B" });
    const [history] = await db.select().from(userDashboardPresetCategoryMoveHistory).where(and3(eq5(userDashboardPresetCategoryMoveHistory.id, input.id), eq5(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id), isNotNull(userDashboardPresetCategoryMoveHistory.undoneAt))).limit(1);
    if (!history) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E22\u0E49\u0E32\u0E22 Preset \u0E17\u0E35\u0E48\u0E17\u0E33\u0E0B\u0E49\u0E33\u0E44\u0E14\u0E49" });
    const presetIds = parsePresetMoveSnapshot(history.presetIds);
    if (!presetIds || new Set(presetIds).size !== presetIds.length) throw new TRPCError4({ code: "BAD_REQUEST", message: "\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1B\u0E23\u0E30\u0E27\u0E31\u0E15\u0E34\u0E01\u0E32\u0E23\u0E22\u0E49\u0E32\u0E22 Preset \u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" });
    const visiblePresets = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and3(inArray(userDashboardRangePresets.id, presetIds), or(eq5(userDashboardRangePresets.userId, ctx.user.id), eq5(userDashboardRangePresets.isShared, true))));
    if (visiblePresets.length !== presetIds.length) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E1E\u0E1A Preset \u0E17\u0E35\u0E48\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E17\u0E33\u0E0B\u0E49\u0E33\u0E01\u0E32\u0E23\u0E22\u0E49\u0E32\u0E22\u0E44\u0E14\u0E49" });
    if (history.destinationCategoryId === null) {
      await db.delete(userDashboardPresetCategoryAssignments).where(and3(eq5(userDashboardPresetCategoryAssignments.userId, ctx.user.id), inArray(userDashboardPresetCategoryAssignments.presetId, presetIds)));
    } else {
      const [category] = await db.select({ id: userDashboardPresetCategories.id }).from(userDashboardPresetCategories).where(and3(eq5(userDashboardPresetCategories.id, history.destinationCategoryId), eq5(userDashboardPresetCategories.userId, ctx.user.id))).limit(1);
      if (!category) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E42\u0E1F\u0E25\u0E40\u0E14\u0E2D\u0E23\u0E4C\u0E1B\u0E25\u0E32\u0E22\u0E17\u0E32\u0E07\u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E17\u0E33\u0E0B\u0E49\u0E33\u0E01\u0E32\u0E23\u0E22\u0E49\u0E32\u0E22" });
      await db.insert(userDashboardPresetCategoryAssignments).values(presetIds.map((presetId) => ({ userId: ctx.user.id, presetId, categoryId: history.destinationCategoryId }))).onConflictDoUpdate({ target: [userDashboardPresetCategoryAssignments.userId, userDashboardPresetCategoryAssignments.presetId], set: { categoryId: history.destinationCategoryId } });
    }
    await db.update(userDashboardPresetCategoryMoveHistory).set({ undoneAt: null }).where(and3(eq5(userDashboardPresetCategoryMoveHistory.id, input.id), eq5(userDashboardPresetCategoryMoveHistory.userId, ctx.user.id), isNotNull(userDashboardPresetCategoryMoveHistory.undoneAt)));
    return { success: true, count: presetIds.length };
  }),
  saveDashboardRangePreset: protectedProcedure.input(z5.object({
    name: z5.string().trim().min(1, "\u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E31\u0E49\u0E07\u0E0A\u0E37\u0E48\u0E2D Preset").max(80),
    startDate: z5.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z5.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isShared: z5.boolean().default(false)
  }).refine((input) => input.startDate <= input.endDate, { message: "\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14\u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E01\u0E48\u0E2D\u0E19\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19", path: ["endDate"] }).refine((input) => (Date.parse(`${input.endDate}T00:00:00.000Z`) - Date.parse(`${input.startDate}T00:00:00.000Z`)) / 864e5 <= 365, { message: "Custom Date Range \u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E40\u0E01\u0E34\u0E19 366 \u0E27\u0E31\u0E19", path: ["endDate"] })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [existing] = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and3(eq5(userDashboardRangePresets.userId, ctx.user.id), eq5(userDashboardRangePresets.name, input.name))).limit(1);
    if (existing) {
      await db.update(userDashboardRangePresets).set({ startDate: input.startDate, endDate: input.endDate, isShared: input.isShared, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(userDashboardRangePresets.id, existing.id));
      return { id: existing.id, updated: true };
    }
    const result = await db.insert(userDashboardRangePresets).values({ userId: ctx.user.id, ...input }).returning({ id: userDashboardRangePresets.id });
    return { id: result[0]?.id ?? 0, updated: false };
  }),
  deleteDashboardRangePreset: protectedProcedure.input(z5.object({ id: z5.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E08\u0E31\u0E14\u0E01\u0E32\u0E23 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.delete(userDashboardRangePresets).where(and3(eq5(userDashboardRangePresets.id, input.id), eq5(userDashboardRangePresets.userId, ctx.user.id)));
    return { success: true };
  }),
  setDashboardRangePresetSharing: protectedProcedure.input(z5.object({ id: z5.number().int().positive(), isShared: z5.boolean() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E41\u0E0A\u0E23\u0E4C Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.update(userDashboardRangePresets).set({ isShared: input.isShared, updatedAt: /* @__PURE__ */ new Date() }).where(and3(eq5(userDashboardRangePresets.id, input.id), eq5(userDashboardRangePresets.userId, ctx.user.id)));
    return { success: true };
  }),
  setDashboardRangePresetPin: protectedProcedure.input(z5.object({ id: z5.number().int().positive(), isPinned: z5.boolean() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E1B\u0E31\u0E01\u0E2B\u0E21\u0E38\u0E14 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [preset] = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and3(eq5(userDashboardRangePresets.id, input.id), or(eq5(userDashboardRangePresets.userId, ctx.user.id), eq5(userDashboardRangePresets.isShared, true)))).limit(1);
    if (!preset) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E44\u0E21\u0E48\u0E1E\u0E1A Preset \u0E17\u0E35\u0E48\u0E1B\u0E31\u0E01\u0E2B\u0E21\u0E38\u0E14\u0E44\u0E14\u0E49" });
    if (input.isPinned) {
      const pinnedAt = /* @__PURE__ */ new Date();
      await db.insert(userDashboardPresetPins).values({ userId: ctx.user.id, presetId: preset.id, pinnedAt }).onConflictDoUpdate({ target: [userDashboardPresetPins.userId, userDashboardPresetPins.presetId], set: { pinnedAt } });
    } else {
      await db.delete(userDashboardPresetPins).where(and3(eq5(userDashboardPresetPins.userId, ctx.user.id), eq5(userDashboardPresetPins.presetId, preset.id)));
    }
    return { success: true };
  }),
  reorderDashboardRangePresetPins: protectedProcedure.input(z5.object({ presetIds: z5.array(z5.number().int().positive()).min(1).max(100) }).refine((input) => new Set(input.presetIds).size === input.presetIds.length, { message: "Preset \u0E0B\u0E49\u0E33\u0E43\u0E19\u0E25\u0E33\u0E14\u0E31\u0E1A\u0E17\u0E35\u0E48\u0E2A\u0E48\u0E07\u0E21\u0E32" })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E08\u0E31\u0E14\u0E25\u0E33\u0E14\u0E31\u0E1A\u0E2B\u0E21\u0E38\u0E14\u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const pinnedRows = await db.select({ presetId: userDashboardPresetPins.presetId }).from(userDashboardPresetPins).where(eq5(userDashboardPresetPins.userId, ctx.user.id));
    const pinnedIds = new Set(pinnedRows.map((row) => row.presetId));
    if (pinnedIds.size !== input.presetIds.length || input.presetIds.some((id) => !pinnedIds.has(id))) throw new TRPCError4({ code: "BAD_REQUEST", message: "\u0E25\u0E33\u0E14\u0E31\u0E1A\u0E2B\u0E21\u0E38\u0E14\u0E44\u0E21\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E1A Preset \u0E17\u0E35\u0E48\u0E1B\u0E31\u0E01\u0E2B\u0E21\u0E38\u0E14\u0E2D\u0E22\u0E39\u0E48" });
    await Promise.all(input.presetIds.map((presetId, sortOrder) => db.update(userDashboardPresetPins).set({ sortOrder }).where(and3(eq5(userDashboardPresetPins.userId, ctx.user.id), eq5(userDashboardPresetPins.presetId, presetId)))));
    return { success: true };
  }),
  resetDashboardRangePresetPinOrder: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E23\u0E35\u0E40\u0E0B\u0E47\u0E15\u0E25\u0E33\u0E14\u0E31\u0E1A\u0E2B\u0E21\u0E38\u0E14\u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const pinnedRows = await db.select({ presetId: userDashboardPresetPins.presetId }).from(userDashboardPresetPins).where(eq5(userDashboardPresetPins.userId, ctx.user.id)).orderBy(desc4(userDashboardPresetPins.pinnedAt), desc4(userDashboardPresetPins.id));
    await Promise.all(pinnedRows.map((row, sortOrder) => db.update(userDashboardPresetPins).set({ sortOrder }).where(and3(eq5(userDashboardPresetPins.userId, ctx.user.id), eq5(userDashboardPresetPins.presetId, row.presetId)))));
    return { success: true, count: pinnedRows.length };
  }),
  sortDashboardRangePresetPinsByUsage: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E08\u0E31\u0E14\u0E25\u0E33\u0E14\u0E31\u0E1A\u0E2B\u0E21\u0E38\u0E14\u0E15\u0E32\u0E21\u0E01\u0E32\u0E23\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const pinnedRows = await db.select({ presetId: userDashboardPresetPins.presetId }).from(userDashboardPresetPins).leftJoin(userDashboardPresetRecentUses, and3(eq5(userDashboardPresetRecentUses.userId, ctx.user.id), eq5(userDashboardPresetRecentUses.presetId, userDashboardPresetPins.presetId))).where(eq5(userDashboardPresetPins.userId, ctx.user.id)).orderBy(desc4(sql3`COALESCE(${userDashboardPresetRecentUses.usageCount}, 0)`), desc4(userDashboardPresetRecentUses.lastUsedAt), desc4(userDashboardPresetPins.pinnedAt), desc4(userDashboardPresetPins.id));
    await Promise.all(pinnedRows.map((row, sortOrder) => db.update(userDashboardPresetPins).set({ sortOrder }).where(and3(eq5(userDashboardPresetPins.userId, ctx.user.id), eq5(userDashboardPresetPins.presetId, row.presetId)))));
    return { success: true, count: pinnedRows.length };
  }),
  clearDashboardRangePresetPins: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E25\u0E49\u0E32\u0E07\u0E2B\u0E21\u0E38\u0E14\u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.delete(userDashboardPresetPins).where(eq5(userDashboardPresetPins.userId, ctx.user.id));
    return { success: true };
  }),
  copyDashboardRangePresetToPrivate: protectedProcedure.input(z5.object({ id: z5.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [source] = await db.select({ id: userDashboardRangePresets.id, name: userDashboardRangePresets.name, startDate: userDashboardRangePresets.startDate, endDate: userDashboardRangePresets.endDate, isShared: userDashboardRangePresets.isShared }).from(userDashboardRangePresets).where(and3(eq5(userDashboardRangePresets.id, input.id), or(eq5(userDashboardRangePresets.userId, ctx.user.id), eq5(userDashboardRangePresets.isShared, true)))).limit(1);
    if (!source?.isShared) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E44\u0E21\u0E48\u0E1E\u0E1A Preset \u0E02\u0E2D\u0E07\u0E17\u0E35\u0E21\u0E17\u0E35\u0E48\u0E04\u0E31\u0E14\u0E25\u0E2D\u0E01\u0E44\u0E14\u0E49" });
    const baseName = `${source.name} \xB7 \u0E2A\u0E33\u0E40\u0E19\u0E32`.slice(0, 80);
    let copyName = baseName;
    for (let suffix = 2; suffix <= 99; suffix += 1) {
      const [existing] = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and3(eq5(userDashboardRangePresets.userId, ctx.user.id), eq5(userDashboardRangePresets.name, copyName))).limit(1);
      if (!existing) break;
      copyName = `${baseName.slice(0, Math.max(1, 80 - String(suffix).length - 1))} ${suffix}`;
    }
    const result = await db.insert(userDashboardRangePresets).values({ userId: ctx.user.id, name: copyName, startDate: source.startDate, endDate: source.endDate, isShared: false }).returning({ id: userDashboardRangePresets.id });
    return { id: result[0]?.id ?? 0, name: copyName };
  }),
  markDashboardRangePresetUsed: protectedProcedure.input(z5.object({ id: z5.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E43\u0E0A\u0E49 Preset \u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [preset] = await db.select({ id: userDashboardRangePresets.id }).from(userDashboardRangePresets).where(and3(eq5(userDashboardRangePresets.id, input.id), or(eq5(userDashboardRangePresets.userId, ctx.user.id), eq5(userDashboardRangePresets.isShared, true)))).limit(1);
    if (!preset) throw new TRPCError4({ code: "NOT_FOUND", message: "\u0E44\u0E21\u0E48\u0E1E\u0E1A Preset \u0E17\u0E35\u0E48\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E44\u0E14\u0E49" });
    const lastUsedAt = /* @__PURE__ */ new Date();
    await db.insert(userDashboardPresetRecentUses).values({ userId: ctx.user.id, presetId: preset.id, lastUsedAt, usageCount: 1 }).onConflictDoUpdate({ target: [userDashboardPresetRecentUses.userId, userDashboardPresetRecentUses.presetId], set: { lastUsedAt, usageCount: sql3`${userDashboardPresetRecentUses.usageCount} + 1` } });
    return { success: true };
  }),
  listRecentDashboardRangePresets: protectedProcedure.input(z5.object({ limit: z5.number().int().min(1).max(8).default(4) }).default({ limit: 4 })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E14\u0E39 Preset \u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14\u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const recentPresets = await db.select({
      id: userDashboardRangePresets.id,
      userId: userDashboardRangePresets.userId,
      name: userDashboardRangePresets.name,
      startDate: userDashboardRangePresets.startDate,
      endDate: userDashboardRangePresets.endDate,
      isShared: userDashboardRangePresets.isShared,
      updatedAt: userDashboardRangePresets.updatedAt,
      creatorName: users.name,
      lastUsedAt: userDashboardPresetRecentUses.lastUsedAt
    }).from(userDashboardPresetRecentUses).innerJoin(userDashboardRangePresets, eq5(userDashboardPresetRecentUses.presetId, userDashboardRangePresets.id)).innerJoin(users, eq5(userDashboardRangePresets.userId, users.id)).where(and3(eq5(userDashboardPresetRecentUses.userId, ctx.user.id), or(eq5(userDashboardRangePresets.userId, ctx.user.id), eq5(userDashboardRangePresets.isShared, true)))).orderBy(desc4(userDashboardPresetRecentUses.lastUsedAt), desc4(userDashboardPresetRecentUses.id)).limit(input.limit);
    return recentPresets.map((preset) => ({ ...preset, creatorName: preset.creatorName || "\u0E44\u0E21\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E1C\u0E39\u0E49\u0E2A\u0E23\u0E49\u0E32\u0E07", isOwner: preset.userId === ctx.user.id }));
  }),
  clearDashboardRangePresetHistory: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E17\u0E48\u0E32\u0E19\u0E31\u0E49\u0E19\u0E17\u0E35\u0E48\u0E25\u0E49\u0E32\u0E07 Preset \u0E25\u0E48\u0E32\u0E2A\u0E38\u0E14\u0E44\u0E14\u0E49" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.delete(userDashboardPresetRecentUses).where(eq5(userDashboardPresetRecentUses.userId, ctx.user.id));
    return { success: true };
  }),
  /**
   * ดู audit log ของ Notification Settings ทุกบัญชี (Admin only)
   * แสดงเฉพาะชื่อฟิลด์ที่เปลี่ยน ไม่เปิดเผย token หรือค่า settings
   */
  listNotificationPreferenceAuditLogs: protectedProcedure.input(z5.object({
    startDate: z5.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z5.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    action: z5.enum(["read", "updated", "reset", "line_connected", "line_disconnected", "pdf_exported"]).optional(),
    search: z5.string().trim().min(1).max(160).optional(),
    sortBy: z5.enum(["createdAt", "action"]).default("createdAt"),
    sortDirection: z5.enum(["asc", "desc"]).default("desc"),
    limit: z5.number().int().min(1).max(1e3).default(500)
  }).refine((input) => !input.startDate || !input.endDate || input.startDate <= input.endDate, {
    message: "\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14\u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E01\u0E48\u0E2D\u0E19\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19",
    path: ["endDate"]
  })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can view audit logs" });
    }
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const conditions = [];
    if (input.startDate) conditions.push(gte2(notificationPreferenceAuditLogs.createdAt, /* @__PURE__ */ new Date(`${input.startDate}T00:00:00.000Z`)));
    if (input.endDate) {
      const exclusiveEnd = /* @__PURE__ */ new Date(`${input.endDate}T00:00:00.000Z`);
      exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
      conditions.push(lt2(notificationPreferenceAuditLogs.createdAt, exclusiveEnd));
    }
    if (input.action) conditions.push(eq5(notificationPreferenceAuditLogs.action, input.action));
    if (input.search) {
      const needle = `%${input.search}%`;
      conditions.push(or(like(users.name, needle), like(users.email, needle)));
    }
    const sortColumn = input.sortBy === "action" ? notificationPreferenceAuditLogs.action : notificationPreferenceAuditLogs.createdAt;
    const order = input.sortDirection === "asc" ? asc : desc4;
    return db.select({
      id: notificationPreferenceAuditLogs.id,
      userId: notificationPreferenceAuditLogs.userId,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role,
      action: notificationPreferenceAuditLogs.action,
      changedFields: notificationPreferenceAuditLogs.changedFields,
      createdAt: notificationPreferenceAuditLogs.createdAt
    }).from(notificationPreferenceAuditLogs).innerJoin(users, eq5(notificationPreferenceAuditLogs.userId, users.id)).where(conditions.length ? and3(...conditions) : void 0).orderBy(order(sortColumn), order(notificationPreferenceAuditLogs.id)).limit(input.limit);
  }),
  createAuditLogPdfExportReference: protectedProcedure.input(z5.object({
    rowCount: z5.number().int().min(0).max(1e3),
    filterSummary: z5.string().trim().max(1200).default(""),
    approvalRequestId: z5.number().int().positive().optional()
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can export audit logs" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canExportPdf) throw new TRPCError4({ code: "FORBIDDEN", message: "PDF export is not permitted for this account" });
    const gate = await validateApprovedExportRequest({ userId: ctx.user.id, format: "pdf", rowCount: input.rowCount, filterSummary: input.filterSummary, approvalRequestId: input.approvalRequestId });
    if (!gate.allowed) throw new TRPCError4({ code: "PRECONDITION_FAILED", message: gate.reason === "approval_required" ? "Approval is required before exporting this high-sensitivity report" : "Export approval is invalid or unavailable" });
    const referenceCode = `AUD-${(/* @__PURE__ */ new Date()).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const recorded = await recordNotificationPreferenceAudit(ctx.user.id, "pdf_exported", [`reference:${referenceCode}`]);
    if (!recorded) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Could not record PDF export reference" });
    return { referenceCode };
  }),
  getMyExportPermissions: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access export permissions" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    return permissions;
  }),
  recordAuditLogDownload: protectedProcedure.input(z5.object({
    format: z5.enum(["csv", "pdf"]),
    rowCount: z5.number().int().min(0).max(1e3),
    filterSummary: z5.string().trim().max(1200).default(""),
    referenceCode: z5.string().regex(/^AUD-\d{14}-[A-F0-9]{8}$/).optional(),
    approvalRequestId: z5.number().int().positive().optional()
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can record report downloads" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (input.format === "csv" && !permissions.canExportCsv || input.format === "pdf" && !permissions.canExportPdf) {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Export is not permitted for this account" });
    }
    const recorded = await recordReportDownload({ userId: ctx.user.id, ...input });
    if (!recorded.allowed) throw new TRPCError4({ code: "PRECONDITION_FAILED", message: recorded.reason === "approval_required" ? "Approval is required before exporting this high-sensitivity report" : "Export approval is invalid or unavailable" });
    return { success: true };
  }),
  getExportSecurityPolicy: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access export policy" });
    const policy = await getExportSecurityPolicy();
    if (!policy) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export security policy is not available" });
    return policy;
  }),
  updateExportSecurityPolicy: protectedProcedure.input(z5.object({
    highVolumeRowThreshold: z5.number().int().min(1).max(1e3),
    approvalRowThreshold: z5.number().int().min(1).max(1e3),
    retentionDays: z5.number().int().min(30).max(3650),
    approvalExpiresHours: z5.number().int().min(1).max(168),
    alertOwnerOnHighVolume: z5.boolean()
  }).refine((input) => input.approvalRowThreshold >= input.highVolumeRowThreshold, {
    path: ["approvalRowThreshold"],
    message: "Approval threshold must be greater than or equal to the high-volume threshold"
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can manage export policy" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canManageExportPermissions) throw new TRPCError4({ code: "FORBIDDEN", message: "Policy management is not permitted for this account" });
    return saveExportSecurityPolicy(ctx.user.id, input);
  }),
  requestHighSensitivityAuditLogExport: protectedProcedure.input(z5.object({
    format: z5.enum(["csv", "pdf"]),
    rowCount: z5.number().int().min(1).max(1e3),
    filterSummary: z5.string().trim().max(1200).default("")
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can request report export approval" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (input.format === "csv" && !permissions.canExportCsv || input.format === "pdf" && !permissions.canExportPdf) throw new TRPCError4({ code: "FORBIDDEN", message: "Export is not permitted for this account" });
    const policy = await getExportSecurityPolicy();
    if (!policy) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export security policy is not available" });
    if (input.rowCount < policy.approvalRowThreshold) throw new TRPCError4({ code: "BAD_REQUEST", message: "This export does not require high-sensitivity approval" });
    return requestHighSensitivityExport({ userId: ctx.user.id, ...input });
  }),
  getMyExportApprovalRequests: protectedProcedure.input(z5.object({ limit: z5.number().int().min(1).max(200).default(50) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access export approval requests" });
    return getOwnExportApprovalRequests(ctx.user.id, input.limit);
  }),
  getPendingExportApprovalRequests: protectedProcedure.input(z5.object({ limit: z5.number().int().min(1).max(200).default(100) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can approve high-sensitivity exports" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canManageExportPermissions) throw new TRPCError4({ code: "FORBIDDEN", message: "Approval authority is not permitted for this account" });
    return getPendingExportApprovalRequests(input.limit);
  }),
  decideExportApprovalRequest: protectedProcedure.input(z5.object({
    requestId: z5.number().int().positive(),
    approve: z5.boolean(),
    reviewerNote: z5.string().trim().max(500).optional()
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can approve high-sensitivity exports" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canManageExportPermissions) throw new TRPCError4({ code: "FORBIDDEN", message: "Approval authority is not permitted for this account" });
    const result = await decideExportApprovalRequest({ ...input, reviewerId: ctx.user.id });
    if (result.outcome === "self_approval") throw new TRPCError4({ code: "FORBIDDEN", message: "Requesters cannot approve their own exports" });
    if (result.outcome === "not_found") throw new TRPCError4({ code: "NOT_FOUND", message: "Approval request was not found" });
    if (result.outcome === "not_pending") throw new TRPCError4({ code: "PRECONDITION_FAILED", message: "Approval request is no longer pending" });
    return { success: true, status: result.status };
  }),
  getRecentExportSecurityEvents: protectedProcedure.input(z5.object({ limit: z5.number().int().min(1).max(200).default(50) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can view export security events" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canManageExportPermissions) throw new TRPCError4({ code: "FORBIDDEN", message: "Security event access is not permitted for this account" });
    return getRecentExportSecurityEvents(input.limit);
  }),
  getGovernanceAnalytics: protectedProcedure.input(z5.object({ days: z5.number().int().min(7).max(90).default(30) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can view governance analytics" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canManageExportPermissions) throw new TRPCError4({ code: "FORBIDDEN", message: "Governance analytics access is not permitted for this account" });
    const analytics = await getGovernanceAnalytics(input.days);
    if (!analytics) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Governance analytics are not available" });
    return analytics;
  }),
  runDownloadHistoryRetentionCleanup: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can run retention cleanup" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canManageExportPermissions) throw new TRPCError4({ code: "FORBIDDEN", message: "Retention cleanup is not permitted for this account" });
    return runReportDownloadHistoryRetention(ctx.user.id);
  }),
  getMyReportDownloadHistory: protectedProcedure.input(z5.object({ limit: z5.number().int().min(1).max(200).default(50) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access download history" });
    return getReportDownloads(ctx.user.id, input.limit);
  }),
  verifyAuditLogPdfReference: protectedProcedure.input(z5.object({ referenceCode: z5.string().regex(/^AUD-\d{14}-[A-F0-9]{8}$/) })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can verify report references" });
    const permissions = await getEffectiveExportPermissions(ctx.user.id);
    if (!permissions) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!permissions.canVerifyReferences) throw new TRPCError4({ code: "FORBIDDEN", message: "Reference verification is not permitted for this account" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [record] = await db.select({ referenceCode: notificationPreferenceAuditLogs.changedFields, createdAt: notificationPreferenceAuditLogs.createdAt, exportedByName: users.name, exportedByEmail: users.email }).from(notificationPreferenceAuditLogs).innerJoin(users, eq5(notificationPreferenceAuditLogs.userId, users.id)).where(and3(eq5(notificationPreferenceAuditLogs.action, "pdf_exported"), eq5(notificationPreferenceAuditLogs.changedFields, `reference:${input.referenceCode}`))).limit(1);
    if (!record) return null;
    const [download] = await db.select({ downloadedAt: reportDownloadHistory.createdAt, rowCount: reportDownloadHistory.rowCount, filterSummary: reportDownloadHistory.filterSummary }).from(reportDownloadHistory).where(eq5(reportDownloadHistory.referenceCode, input.referenceCode)).orderBy(desc4(reportDownloadHistory.createdAt)).limit(1);
    return { referenceCode: input.referenceCode, exportedAt: record.createdAt, exportedByName: record.exportedByName, exportedByEmail: record.exportedByEmail, download };
  }),
  listAdminExportPermissions: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can manage export permissions" });
    const own = await getEffectiveExportPermissions(ctx.user.id);
    if (!own) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!own.canManageExportPermissions) throw new TRPCError4({ code: "FORBIDDEN", message: "Permission management is not permitted for this account" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const rows = await db.select({ userId: users.id, name: users.name, email: users.email, canExportCsv: adminExportPermissions.canExportCsv, canExportPdf: adminExportPermissions.canExportPdf, canVerifyReferences: adminExportPermissions.canVerifyReferences, canViewTeamDownloadHistory: adminExportPermissions.canViewTeamDownloadHistory, canManageExportPermissions: adminExportPermissions.canManageExportPermissions }).from(users).leftJoin(adminExportPermissions, eq5(users.id, adminExportPermissions.userId)).where(eq5(users.role, "admin"));
    return rows.map((row) => ({ userId: row.userId, name: row.name, email: row.email, ...row.canExportCsv === null || row.canExportCsv === void 0 ? { canExportCsv: true, canExportPdf: true, canVerifyReferences: true, canViewTeamDownloadHistory: true, canManageExportPermissions: true } : { canExportCsv: row.canExportCsv, canExportPdf: row.canExportPdf, canVerifyReferences: row.canVerifyReferences, canViewTeamDownloadHistory: row.canViewTeamDownloadHistory, canManageExportPermissions: row.canManageExportPermissions } }));
  }),
  updateAdminExportPermissions: protectedProcedure.input(z5.object({ userId: z5.number().int().positive(), canExportCsv: z5.boolean(), canExportPdf: z5.boolean(), canVerifyReferences: z5.boolean(), canViewTeamDownloadHistory: z5.boolean(), canManageExportPermissions: z5.boolean() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can manage export permissions" });
    const own = await getEffectiveExportPermissions(ctx.user.id);
    if (!own) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Export permission store is not available" });
    if (!own.canManageExportPermissions) throw new TRPCError4({ code: "FORBIDDEN", message: "Permission management is not permitted for this account" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [target] = await db.select({ role: users.role }).from(users).where(eq5(users.id, input.userId)).limit(1);
    if (!target || target.role !== "admin") throw new TRPCError4({ code: "BAD_REQUEST", message: "Export permissions can only be assigned to an admin account" });
    const permissions = { canExportCsv: input.canExportCsv, canExportPdf: input.canExportPdf, canVerifyReferences: input.canVerifyReferences, canViewTeamDownloadHistory: input.canViewTeamDownloadHistory, canManageExportPermissions: input.canManageExportPermissions };
    await saveExportPermissions(input.userId, permissions);
    return { success: true };
  }),
  /**
   * ดึงรายชื่อผู้ใช้สำหรับแผงผู้ดูแลระบบ
   */
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can manage users" });
    }
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    return db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn
    }).from(users);
  }),
  /**
   * เปลี่ยนบทบาทผู้ใช้โดยผู้ดูแลระบบ
   */
  updateUserRole: protectedProcedure.input(z5.object({ userId: z5.number().int().positive(), role: z5.enum(["borrower", "lender", "admin"]) })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can manage users" });
    }
    if (input.userId === ctx.user.id && input.role !== "admin") {
      throw new TRPCError4({ code: "BAD_REQUEST", message: "\u0E44\u0E21\u0E48\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E25\u0E14\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E1B\u0E31\u0E08\u0E08\u0E38\u0E1A\u0E31\u0E19\u0E44\u0E14\u0E49" });
    }
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await db.update(users).set({ role: input.role, updatedAt: /* @__PURE__ */ new Date() }).where(eq5(users.id, input.userId));
    return { success: true };
  }),
  /**
   * ดึงข้อมูลสรุปของระบบ (Admin only)
   */
  getDashboardStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError4({
        code: "FORBIDDEN",
        message: "Only admins can access this endpoint"
      });
    }
    const db = await getDb();
    if (!db) {
      throw new TRPCError4({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available"
      });
    }
    const borrowers = await db.select().from(users).where(eq5(users.role, "borrower"));
    const lenders = await db.select().from(users).where(eq5(users.role, "lender"));
    const admins = await db.select().from(users).where(eq5(users.role, "admin"));
    const allLoans = await db.select().from(loans);
    const closedLoans = allLoans.filter((l) => l.isClosed);
    const activeLoans = allLoans.filter((l) => !l.isClosed);
    const totalPrincipal = allLoans.reduce((sum, loan) => {
      return sum + parseFloat(loan.principalAmount);
    }, 0);
    const totalPaid = allLoans.reduce((sum, loan) => {
      return sum + parseFloat(loan.totalPaid || "0");
    }, 0);
    const totalOutstanding = totalPrincipal - totalPaid;
    const avgInterestRate = allLoans.length > 0 ? allLoans.reduce((sum, loan) => sum + parseFloat(loan.interestRate), 0) / allLoans.length : 0;
    const allRequests = await db.select().from(loanRequests);
    const pendingRequests = allRequests.filter((r) => r.status === "pending");
    const approvedRequests = allRequests.filter((r) => r.status === "approved");
    const rejectedRequests = allRequests.filter((r) => r.status === "rejected");
    const allPayments = await db.select().from(loanPayments);
    const verifiedPayments = allPayments.filter((p) => p.status === "verified");
    const pendingPayments = allPayments.filter((p) => p.status === "pending");
    return {
      users: {
        borrowers: borrowers.length,
        lenders: lenders.length,
        admins: admins.length,
        total: borrowers.length + lenders.length + admins.length
      },
      loans: {
        total: allLoans.length,
        active: activeLoans.length,
        closed: closedLoans.length,
        totalPrincipal: Math.round(totalPrincipal * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        avgInterestRate: Math.round(avgInterestRate * 100) / 100
      },
      requests: {
        total: allRequests.length,
        pending: pendingRequests.length,
        approved: approvedRequests.length,
        rejected: rejectedRequests.length
      },
      payments: {
        total: allPayments.length,
        verified: verifiedPayments.length,
        pending: pendingPayments.length
      }
    };
  }),
  getActivityHistory: protectedProcedure.input(z5.object({
    limit: z5.number().int().min(1).max(200).default(12),
    startDate: z5.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z5.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  }).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: "\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14\u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E01\u0E48\u0E2D\u0E19\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19", path: ["endDate"] }).optional()).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access activity history" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [requests, payments, actors, allLoans] = await Promise.all([db.select().from(loanRequests), db.select().from(loanPayments), db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users), db.select({ id: loans.id, requestId: loans.requestId, lenderId: loans.lenderId }).from(loans)]);
    const actorById = new Map(actors.map((actor) => [actor.id, { name: actor.name || actor.email || "\u0E44\u0E21\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E1C\u0E39\u0E49\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23", role: actor.role || "unknown" }]));
    const loanById = new Map(allLoans.map((loan) => [loan.id, loan]));
    const loanByRequestId = new Map(allLoans.map((loan) => [loan.requestId, loan]));
    const startDate = input?.startDate;
    const endDate = input?.endDate;
    return [
      ...requests.filter((request) => request.status !== "pending").map((request) => {
        const actor = actorById.get(request.approvedById || 0);
        const loan = loanByRequestId.get(request.id);
        const lender = actorById.get(loan?.lenderId || 0);
        return { id: `request-${request.id}`, status: request.status, loanId: loan?.id || null, title: request.status === "approved" ? "\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49" : "\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49", detail: `\u0E04\u0E33\u0E02\u0E2D #${request.id}`, actorName: actor?.name || "\u0E44\u0E21\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E1C\u0E39\u0E49\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23", actorRole: actor?.role || "unknown", lenderId: loan?.lenderId || null, lenderName: lender?.name || "\u0E44\u0E21\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E1C\u0E39\u0E49\u0E43\u0E2B\u0E49\u0E01\u0E39\u0E49", occurredAt: request.decidedAt || request.approvedAt || request.requestedAt };
      }),
      ...payments.filter((payment) => payment.status !== "pending").map((payment) => {
        const actor = actorById.get(payment.verifiedById || 0);
        const loan = loanById.get(payment.loanId);
        const lender = actorById.get(loan?.lenderId || 0);
        return { id: `payment-${payment.id}`, status: payment.status, loanId: payment.loanId, title: payment.status === "verified" ? "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19" : "\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19", detail: `\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30 #${payment.id}`, actorName: actor?.name || "\u0E44\u0E21\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E1C\u0E39\u0E49\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23", actorRole: actor?.role || "unknown", lenderId: loan?.lenderId || null, lenderName: lender?.name || "\u0E44\u0E21\u0E48\u0E23\u0E30\u0E1A\u0E38\u0E1C\u0E39\u0E49\u0E43\u0E2B\u0E49\u0E01\u0E39\u0E49", occurredAt: payment.verifiedAt || payment.paymentDate };
      })
    ].filter((activity) => {
      const activityDate = new Date(activity.occurredAt).toISOString().slice(0, 10);
      return (!startDate || activityDate >= startDate) && (!endDate || activityDate <= endDate);
    }).sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()).slice(0, input?.limit ?? 12);
  }),
  listActivityFilterPresets: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access activity filter presets" });
    return getActivityHistoryFilterPresets(ctx.user.id);
  }),
  saveActivityFilterPreset: protectedProcedure.input(z5.object({
    name: z5.string().trim().min(1).max(120),
    startDate: z5.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
    endDate: z5.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
    eventType: z5.string().max(160),
    actorName: z5.string().max(255),
    actorRole: z5.string().max(32),
    lenderId: z5.number().int().positive().nullable()
  }).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: "\u0E27\u0E31\u0E19\u0E2A\u0E34\u0E49\u0E19\u0E2A\u0E38\u0E14\u0E15\u0E49\u0E2D\u0E07\u0E44\u0E21\u0E48\u0E01\u0E48\u0E2D\u0E19\u0E27\u0E31\u0E19\u0E40\u0E23\u0E34\u0E48\u0E21\u0E15\u0E49\u0E19", path: ["endDate"] })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can save activity filter presets" });
    const id = await saveActivityHistoryFilterPreset(ctx.user.id, input);
    return { id };
  }),
  deleteActivityFilterPreset: protectedProcedure.input(z5.object({ id: z5.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can delete activity filter presets" });
    await deleteActivityHistoryFilterPreset(ctx.user.id, input.id);
    return { success: true };
  }),
  /**
   * ดึงข้อมูลคำขอกู้ที่รอการอนุมัติ
   */
  getPendingRequests: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "lender") {
      throw new TRPCError4({
        code: "FORBIDDEN",
        message: "Only admins and lenders can access this endpoint"
      });
    }
    const db = await getDb();
    if (!db) {
      throw new TRPCError4({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available"
      });
    }
    const pendingRequests = await db.select().from(loanRequests).where(eq5(loanRequests.status, "pending"));
    const requestsWithBorrower = await Promise.all(
      pendingRequests.map(async (req) => {
        const borrower = await db.select().from(users).where(eq5(users.id, req.borrowerId)).limit(1);
        return {
          ...req,
          borrowerName: borrower?.[0]?.name || "Unknown",
          borrowerEmail: borrower?.[0]?.email || "N/A"
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
      throw new TRPCError4({
        code: "FORBIDDEN",
        message: "Only admins and lenders can access this endpoint"
      });
    }
    const db = await getDb();
    if (!db) {
      throw new TRPCError4({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available"
      });
    }
    const pendingPayments = await db.select().from(loanPayments).where(eq5(loanPayments.status, "pending"));
    const paymentsWithDetails = await Promise.all(
      pendingPayments.map(async (payment) => {
        const loan = await db.select().from(loans).where(eq5(loans.id, payment.loanId)).limit(1);
        const borrower = await db.select().from(users).where(eq5(users.id, loan?.[0]?.borrowerId || 0)).limit(1);
        return {
          ...payment,
          loanId: loan?.[0]?.id || 0,
          borrowerName: borrower?.[0]?.name || "Unknown",
          principalAmount: loan?.[0]?.principalAmount || "0"
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
      throw new TRPCError4({
        code: "FORBIDDEN",
        message: "Only admins can access this endpoint"
      });
    }
    const db = await getDb();
    if (!db) {
      throw new TRPCError4({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available"
      });
    }
    const allLoans = await db.select().from(loans);
    const active = allLoans.filter((l) => !l.isClosed).length;
    const closed = allLoans.filter((l) => l.isClosed).length;
    return {
      labels: ["\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19", "\u0E1B\u0E34\u0E14\u0E41\u0E25\u0E49\u0E27"],
      data: [active, closed]
    };
  }),
  /**
   * ดึงข้อมูลกราฟ - ยอดคงค้างแยกตามสัญญา
   */
  getOutstandingChart: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access this endpoint" });
    }
    const db = await getDb();
    if (!db) {
      throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    const allLoans = await db.select().from(loans);
    const activeLoans = allLoans.filter((loan) => !loan.isClosed);
    return activeLoans.map((loan) => ({
      label: `\u0E2A\u0E31\u0E0D\u0E0D\u0E32 #${loan.id}`,
      value: Math.max(parseFloat(loan.principalAmount) - parseFloat(loan.totalPaid || "0"), 0)
    }));
  }),
  /**
   * ดึงข้อมูลกราฟ - การชำระเงินตามเดือน
   */
  getPaymentTrendChart: protectedProcedure.input(dashboardTrendInput).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError4({
        code: "FORBIDDEN",
        message: "Only admins can access this endpoint"
      });
    }
    const db = await getDb();
    if (!db) {
      throw new TRPCError4({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available"
      });
    }
    const allPayments = await db.select().from(loanPayments);
    const range = input.startDate && input.endDate ? { startDate: input.startDate, endDate: input.endDate } : input.days ?? 30;
    return buildDailyPaymentTrend(allPayments, range);
  }),
  getDashboardKpiComparison: protectedProcedure.input(dashboardTrendInput).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access dashboard KPI comparison" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const range = input.startDate && input.endDate ? { startDate: input.startDate, endDate: input.endDate } : input.days ?? 30;
    const current = getDashboardRangeWindow(range);
    const previous = getDashboardComparisonWindow(range, input.comparisonMode);
    const comparisonLabel = input.comparisonMode === "previous_month" ? "\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E40\u0E14\u0E37\u0E2D\u0E19\u0E01\u0E48\u0E2D\u0E19" : input.comparisonMode === "previous_quarter" ? "\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E44\u0E15\u0E23\u0E21\u0E32\u0E2A\u0E01\u0E48\u0E2D\u0E19" : "\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E0A\u0E48\u0E27\u0E07\u0E01\u0E48\u0E2D\u0E19\u0E2B\u0E19\u0E49\u0E32";
    const inWindow = (value, window) => value >= window.start && value < new Date(window.end.getTime() + 864e5);
    const [allUsers, allLoans, allPayments] = await Promise.all([db.select().from(users), db.select().from(loans), db.select().from(loanPayments)]);
    const count = (rows, window) => rows.filter((row) => inWindow(new Date(row.createdAt), window)).length;
    const sum = (rows, window) => rows.filter((row) => row.status === "verified" && inWindow(new Date(row.paymentDate), window)).reduce((total, row) => total + parseFloat(row.amountPaid), 0);
    const principal = (rows, window) => rows.filter((row) => inWindow(new Date(row.createdAt), window)).reduce((total, row) => total + parseFloat(row.principalAmount), 0);
    return {
      users: { current: count(allUsers, current), previous: count(allUsers, previous), label: `\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E43\u0E2B\u0E21\u0E48 \xB7 ${comparisonLabel}` },
      activeLoans: { current: count(allLoans, current), previous: count(allLoans, previous), label: `\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E43\u0E2B\u0E21\u0E48 \xB7 ${comparisonLabel}` },
      principal: { current: Math.round(principal(allLoans, current) * 100) / 100, previous: Math.round(principal(allLoans, previous) * 100) / 100, label: `\u0E40\u0E07\u0E34\u0E19\u0E15\u0E49\u0E19\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E43\u0E2B\u0E21\u0E48 \xB7 ${comparisonLabel}` },
      paid: { current: Math.round(sum(allPayments, current) * 100) / 100, previous: Math.round(sum(allPayments, previous) * 100) / 100, label: `\u0E22\u0E2D\u0E14\u0E0A\u0E33\u0E23\u0E30\u0E17\u0E35\u0E48\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E41\u0E25\u0E49\u0E27 \xB7 ${comparisonLabel}` },
      outstanding: null,
      pendingPayments: null
    };
  }),
  getDashboardKpiDetails: protectedProcedure.input(z5.object({
    metric: z5.enum(["users", "activeLoans", "principal", "paid", "outstanding", "pendingPayments"]),
    limit: z5.number().int().min(1).max(100).default(50)
  })).query(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access dashboard KPI details" });
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const limit = input.limit;
    if (input.metric === "users") {
      const rows = (await db.select().from(users).limit(limit)).map((user) => ({ id: `user-${user.id}`, title: user.name || user.email || `\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49 #${user.id}`, meta: `${user.role} \xB7 \u0E2A\u0E21\u0E31\u0E04\u0E23\u0E40\u0E21\u0E37\u0E48\u0E2D ${new Date(user.createdAt).toLocaleDateString("th-TH")}`, amount: null, href: null }));
      return { title: "\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19", description: "\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E1C\u0E39\u0E49\u0E43\u0E0A\u0E49\u0E07\u0E32\u0E19\u0E17\u0E35\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A", items: rows };
    }
    const allLoans = await db.select().from(loans);
    if (input.metric === "activeLoans" || input.metric === "principal" || input.metric === "outstanding") {
      const filtered = input.metric === "activeLoans" ? allLoans.filter((loan) => !loan.isClosed) : allLoans;
      const sorted = input.metric === "outstanding" ? [...filtered].sort((left, right) => parseFloat(right.principalAmount) - parseFloat(right.totalPaid || "0") - (parseFloat(left.principalAmount) - parseFloat(left.totalPaid || "0"))) : filtered;
      const items2 = sorted.slice(0, limit).map((loan) => {
        const principal = parseFloat(loan.principalAmount);
        const paid = parseFloat(loan.totalPaid || "0");
        const amount = input.metric === "principal" ? principal : input.metric === "outstanding" ? Math.max(principal - paid, 0) : principal;
        return { id: `loan-${loan.id}`, title: `\u0E2A\u0E31\u0E0D\u0E0D\u0E32 #${loan.id}`, meta: input.metric === "outstanding" ? `\u0E0A\u0E33\u0E23\u0E30\u0E41\u0E25\u0E49\u0E27 \u0E3F${paid.toLocaleString("th-TH", { maximumFractionDigits: 2 })}` : loan.isClosed ? "\u0E1B\u0E34\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E41\u0E25\u0E49\u0E27" : "\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23", amount, href: `/loan/${loan.id}` };
      });
      const text2 = input.metric === "activeLoans" ? "\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E17\u0E35\u0E48\u0E01\u0E33\u0E25\u0E31\u0E07\u0E14\u0E33\u0E40\u0E19\u0E34\u0E19\u0E01\u0E32\u0E23" : input.metric === "principal" ? "\u0E40\u0E07\u0E34\u0E19\u0E15\u0E49\u0E19\u0E15\u0E32\u0E21\u0E2A\u0E31\u0E0D\u0E0D\u0E32" : "\u0E22\u0E2D\u0E14\u0E04\u0E07\u0E04\u0E49\u0E32\u0E07\u0E15\u0E32\u0E21\u0E2A\u0E31\u0E0D\u0E0D\u0E32";
      return { title: text2, description: "\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E14\u0E39\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14", items: items2 };
    }
    const allPayments = await db.select().from(loanPayments);
    const payments = input.metric === "paid" ? allPayments.filter((payment) => payment.status === "verified") : allPayments.filter((payment) => payment.status === "pending");
    const items = payments.sort((left, right) => new Date(right.paymentDate).getTime() - new Date(left.paymentDate).getTime()).slice(0, limit).map((payment) => ({ id: `payment-${payment.id}`, title: `\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30 #${payment.id} \xB7 \u0E2A\u0E31\u0E0D\u0E0D\u0E32 #${payment.loanId}`, meta: `${payment.status === "verified" ? "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E41\u0E25\u0E49\u0E27" : "\u0E23\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A"} \xB7 ${new Date(payment.paymentDate).toLocaleDateString("th-TH")}`, amount: parseFloat(payment.amountPaid), href: `/loan/${payment.loanId}` }));
    return { title: input.metric === "paid" ? "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E17\u0E35\u0E48\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E41\u0E25\u0E49\u0E27" : "\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E17\u0E35\u0E48\u0E23\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A", description: "\u0E41\u0E2A\u0E14\u0E07\u0E40\u0E09\u0E1E\u0E32\u0E30\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E17\u0E35\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E2D\u0E19\u0E38\u0E0D\u0E32\u0E15", items };
  }),
  /**
   * ดึงข้อมูลสัดส่วนประเภทสินเชื่อ (รูปแบบผ่อนชำระ)
   */
  getLoanTypeDistribution: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access this endpoint" });
    }
    const db = await getDb();
    if (!db) {
      throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    return getLoanTypeDistribution(await db.select().from(loans));
  }),
  /**
   * ดึงข้อมูลสัดส่วนสถานะการชำระเงิน
   */
  getPaymentStatusDistribution: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access this endpoint" });
    }
    const db = await getDb();
    if (!db) {
      throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    return getPaymentStatusDistribution(await db.select().from(loanPayments));
  }),
  /**
   * ดึงรายละเอียดสัญญาสำหรับ drill-down รูปแบบการผ่อนชำระ
   */
  getLoanTypeDrilldown: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access this endpoint" });
    }
    const db = await getDb();
    if (!db) {
      throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    return db.select({
      id: loans.id,
      paymentType: loans.paymentType,
      principalAmount: loans.principalAmount,
      totalPaid: loans.totalPaid,
      isClosed: loans.isClosed,
      startDate: loans.startDate
    }).from(loans);
  }),
  /**
   * ดึงรายละเอียดรายการชำระสำหรับ drill-down สถานะการชำระ
   */
  getPaymentStatusDrilldown: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError4({ code: "FORBIDDEN", message: "Only admins can access this endpoint" });
    }
    const db = await getDb();
    if (!db) {
      throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }
    return db.select({
      id: loanPayments.id,
      loanId: loanPayments.loanId,
      status: loanPayments.status,
      amountPaid: loanPayments.amountPaid,
      paymentMethod: loanPayments.paymentMethod,
      paymentDate: loanPayments.paymentDate
    }).from(loanPayments);
  })
});

// server/routers/notificationRouter.ts
import { z as z6 } from "zod";
import { eq as eq6 } from "drizzle-orm";

// server/emailService.ts
import nodemailer from "nodemailer";
var transporter = null;
function initializeEmailService(config) {
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.auth.user,
      pass: config.auth.pass
    }
  });
}
async function sendEmail(options) {
  try {
    if (!transporter) {
      console.warn("[Email] Transporter not initialized");
      return false;
    }
    const mailOptions = {
      from: process.env.EMAIL_FROM || "noreply@loansystem.com",
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    };
    const result = await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent to ${options.to}:`, result.messageId);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send email:", error);
    return false;
  }
}
function getNewLoanRequestEmailTemplate(lenderName, borrowerName, loanAmount, interestRate, loanTermMonths, requestId, dashboardUrl) {
  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #f5f5f5;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          padding: 20px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .loan-details {
          background-color: #f0fdf4;
          border-left: 4px solid #10b981;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .loan-details h3 {
          margin-top: 0;
          color: #059669;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #374151;
        }
        .detail-value {
          color: #059669;
          font-weight: 500;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 6px;
          margin: 20px 0;
          font-weight: 600;
          text-align: center;
        }
        .cta-button:hover {
          opacity: 0.9;
        }
        .footer {
          background-color: #f9fafb;
          padding: 15px;
          border-radius: 0 0 8px 8px;
          font-size: 12px;
          color: #6b7280;
          text-align: center;
        }
        .warning {
          background-color: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
          color: #92400e;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>\u{1F4CB} \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E22\u0E37\u0E21\u0E40\u0E07\u0E34\u0E19\u0E43\u0E2B\u0E21\u0E48</h1>
        </div>
        
        <div class="content">
          <div class="greeting">
            <p>\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35 ${lenderName},</p>
            <p>\u0E21\u0E35\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E22\u0E37\u0E21\u0E40\u0E07\u0E34\u0E19\u0E43\u0E2B\u0E21\u0E48\u0E40\u0E02\u0E49\u0E32\u0E21\u0E32\u0E43\u0E19\u0E23\u0E30\u0E1A\u0E1A \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E41\u0E25\u0E30\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34/\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E15\u0E32\u0E21\u0E04\u0E27\u0E32\u0E21\u0E40\u0E2B\u0E21\u0E32\u0E30\u0E2A\u0E21</p>
          </div>
          
          <div class="loan-details">
            <h3>\u{1F4CA} \u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49</h3>
            <div class="detail-row">
              <span class="detail-label">\u0E0A\u0E37\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49:</span>
              <span class="detail-value">${borrowerName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E35\u0E48\u0E02\u0E2D:</span>
              <span class="detail-value">\u0E3F${loanAmount}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">\u0E2D\u0E31\u0E15\u0E23\u0E32\u0E14\u0E2D\u0E01\u0E40\u0E1A\u0E35\u0E49\u0E22\u0E15\u0E48\u0E2D\u0E1B\u0E35:</span>
              <span class="detail-value">${interestRate}%</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">\u0E23\u0E30\u0E22\u0E30\u0E40\u0E27\u0E25\u0E32\u0E1C\u0E48\u0E2D\u0E19:</span>
              <span class="detail-value">${loanTermMonths} \u0E40\u0E14\u0E37\u0E2D\u0E19</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E04\u0E33\u0E02\u0E2D:</span>
              <span class="detail-value">#${requestId}</span>
            </div>
          </div>
          
          <div class="warning">
            \u26A0\uFE0F <strong>\u0E2B\u0E21\u0E32\u0E22\u0E40\u0E2B\u0E15\u0E38:</strong> \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49\u0E41\u0E25\u0E30\u0E40\u0E07\u0E37\u0E48\u0E2D\u0E19\u0E44\u0E02\u0E01\u0E32\u0E23\u0E01\u0E39\u0E49\u0E2D\u0E22\u0E48\u0E32\u0E07\u0E23\u0E2D\u0E1A\u0E04\u0E2D\u0E1A\u0E01\u0E48\u0E2D\u0E19\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34
          </div>
          
          <div style="text-align: center;">
            <a href="${dashboardUrl}" class="cta-button">\u0E44\u0E1B\u0E22\u0E31\u0E07 Dashboard \u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            \u0E2B\u0E32\u0E01\u0E04\u0E38\u0E13\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E17\u0E33\u0E01\u0E32\u0E23\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E19\u0E35\u0E49 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E34\u0E14\u0E15\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E17\u0E31\u0E19\u0E17\u0E35
          </p>
        </div>
        
        <div class="footer">
          <p>\xA9 2024 Loan Management System. All rights reserved.</p>
          <p>\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E19\u0E35\u0E49\u0E16\u0E39\u0E01\u0E2A\u0E48\u0E07\u0E42\u0E14\u0E22\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E08\u0E32\u0E01\u0E23\u0E30\u0E1A\u0E1A \u0E01\u0E23\u0E38\u0E13\u0E32\u0E44\u0E21\u0E48\u0E15\u0E2D\u0E1A\u0E01\u0E25\u0E31\u0E1A</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
function getLoanRequestConfirmationEmailTemplate(borrowerName, loanAmount, interestRate, requestId) {
  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #f5f5f5;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          padding: 20px;
        }
        .success-message {
          background-color: #d1fae5;
          border-left: 4px solid #10b981;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
          color: #065f46;
        }
        .loan-details {
          background-color: #eff6ff;
          border-left: 4px solid #3b82f6;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #374151;
        }
        .detail-value {
          color: #1d4ed8;
          font-weight: 500;
        }
        .footer {
          background-color: #f9fafb;
          padding: 15px;
          border-radius: 0 0 8px 8px;
          font-size: 12px;
          color: #6b7280;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>\u2705 \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E16\u0E39\u0E01\u0E2A\u0E48\u0E07\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22</h1>
        </div>
        
        <div class="content">
          <p>\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35 ${borrowerName},</p>
          
          <div class="success-message">
            <strong>\u2713 \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E16\u0E39\u0E01\u0E2A\u0E48\u0E07\u0E44\u0E1B\u0E22\u0E31\u0E07\u0E23\u0E30\u0E1A\u0E1A\u0E40\u0E23\u0E35\u0E22\u0E1A\u0E23\u0E49\u0E2D\u0E22\u0E41\u0E25\u0E49\u0E27</strong>
            <p style="margin: 10px 0 0 0;">\u0E1C\u0E39\u0E49\u0E43\u0E2B\u0E49\u0E01\u0E39\u0E49\u0E08\u0E30\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E41\u0E25\u0E30\u0E15\u0E34\u0E14\u0E15\u0E48\u0E2D\u0E01\u0E25\u0E31\u0E1A\u0E44\u0E1B\u0E22\u0E31\u0E07\u0E04\u0E38\u0E13\u0E43\u0E19\u0E40\u0E23\u0E47\u0E27\u0E46 \u0E19\u0E35\u0E49</p>
          </div>
          
          <div class="loan-details">
            <h3 style="margin-top: 0;">\u{1F4CB} \u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E04\u0E33\u0E02\u0E2D\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13</h3>
            <div class="detail-row">
              <span class="detail-label">\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E04\u0E33\u0E02\u0E2D:</span>
              <span class="detail-value">#${requestId}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19\u0E17\u0E35\u0E48\u0E02\u0E2D:</span>
              <span class="detail-value">\u0E3F${loanAmount}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">\u0E2D\u0E31\u0E15\u0E23\u0E32\u0E14\u0E2D\u0E01\u0E40\u0E1A\u0E35\u0E49\u0E22\u0E15\u0E48\u0E2D\u0E1B\u0E35:</span>
              <span class="detail-value">${interestRate}%</span>
            </div>
          </div>
          
          <p style="color: #6b7280;">
            \u0E40\u0E23\u0E32\u0E08\u0E30\u0E2A\u0E48\u0E07\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E41\u0E08\u0E49\u0E07\u0E43\u0E2B\u0E49\u0E04\u0E38\u0E13\u0E17\u0E23\u0E32\u0E1A\u0E40\u0E21\u0E37\u0E48\u0E2D\u0E21\u0E35\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E2B\u0E23\u0E37\u0E2D\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18\u0E04\u0E33\u0E02\u0E2D\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13
          </p>
        </div>
        
        <div class="footer">
          <p>\xA9 2024 Loan Management System. All rights reserved.</p>
          <p>\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E19\u0E35\u0E49\u0E16\u0E39\u0E01\u0E2A\u0E48\u0E07\u0E42\u0E14\u0E22\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E08\u0E32\u0E01\u0E23\u0E30\u0E1A\u0E1A \u0E01\u0E23\u0E38\u0E13\u0E32\u0E44\u0E21\u0E48\u0E15\u0E2D\u0E1A\u0E01\u0E25\u0E31\u0E1A</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
function getLoanApprovalEmailTemplate(borrowerName, loanAmount, interestRate, loanTermMonths, monthlyPayment, requestId) {
  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #f5f5f5;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          padding: 20px;
        }
        .approval-message {
          background-color: #d1fae5;
          border-left: 4px solid #10b981;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
          color: #065f46;
        }
        .loan-details {
          background-color: #f0fdf4;
          border-left: 4px solid #10b981;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .detail-row:last-child {
          border-bottom: none;
        }
        .detail-label {
          font-weight: 600;
          color: #374151;
        }
        .detail-value {
          color: #059669;
          font-weight: 500;
        }
        .footer {
          background-color: #f9fafb;
          padding: 15px;
          border-radius: 0 0 8px 8px;
          font-size: 12px;
          color: #6b7280;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>\u{1F389} \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34!</h1>
        </div>
        
        <div class="content">
          <p>\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35 ${borrowerName},</p>
          
          <div class="approval-message">
            <strong>\u2713 \u0E22\u0E34\u0E19\u0E14\u0E35\u0E14\u0E49\u0E27\u0E22! \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E41\u0E25\u0E49\u0E27</strong>
            <p style="margin: 10px 0 0 0;">\u0E40\u0E07\u0E34\u0E19\u0E08\u0E30\u0E16\u0E39\u0E01\u0E42\u0E2D\u0E19\u0E44\u0E1B\u0E22\u0E31\u0E07\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E43\u0E19\u0E40\u0E23\u0E47\u0E27\u0E46 \u0E19\u0E35\u0E49</p>
          </div>
          
          <div class="loan-details">
            <h3 style="margin-top: 0;">\u{1F4CA} \u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E40\u0E07\u0E34\u0E19\u0E01\u0E39\u0E49</h3>
            <div class="detail-row">
              <span class="detail-label">\u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E2A\u0E31\u0E0D\u0E0D\u0E32:</span>
              <span class="detail-value">#${requestId}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">\u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19:</span>
              <span class="detail-value">\u0E3F${loanAmount}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">\u0E2D\u0E31\u0E15\u0E23\u0E32\u0E14\u0E2D\u0E01\u0E40\u0E1A\u0E35\u0E49\u0E22:</span>
              <span class="detail-value">${interestRate}% \u0E15\u0E48\u0E2D\u0E1B\u0E35</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">\u0E23\u0E30\u0E22\u0E30\u0E40\u0E27\u0E25\u0E32\u0E1C\u0E48\u0E2D\u0E19:</span>
              <span class="detail-value">${loanTermMonths} \u0E40\u0E14\u0E37\u0E2D\u0E19</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">\u0E04\u0E48\u0E32\u0E07\u0E27\u0E14\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19:</span>
              <span class="detail-value">\u0E3F${monthlyPayment}</span>
            </div>
          </div>
          
          <p style="color: #6b7280;">
            \u0E42\u0E1B\u0E23\u0E14\u0E40\u0E01\u0E47\u0E1A\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E19\u0E35\u0E49\u0E44\u0E27\u0E49\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E2D\u0E49\u0E32\u0E07\u0E2D\u0E34\u0E07 \u0E04\u0E38\u0E13\u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E41\u0E25\u0E30\u0E15\u0E32\u0E23\u0E32\u0E07\u0E1C\u0E48\u0E2D\u0E19\u0E0A\u0E33\u0E23\u0E30\u0E43\u0E19\u0E41\u0E2D\u0E1B\u0E1E\u0E25\u0E34\u0E40\u0E04\u0E0A\u0E31\u0E19\u0E44\u0E14\u0E49
          </p>
        </div>
        
        <div class="footer">
          <p>\xA9 2024 Loan Management System. All rights reserved.</p>
          <p>\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E19\u0E35\u0E49\u0E16\u0E39\u0E01\u0E2A\u0E48\u0E07\u0E42\u0E14\u0E22\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E08\u0E32\u0E01\u0E23\u0E30\u0E1A\u0E1A \u0E01\u0E23\u0E38\u0E13\u0E32\u0E44\u0E21\u0E48\u0E15\u0E2D\u0E1A\u0E01\u0E25\u0E31\u0E1A</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
function getPaymentReminderEmailTemplate(borrowerName, amount, dueDate, paymentNumber, loanId) {
  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;background:#f0fdf4;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(6,78,59,.12);">
        <div style="background:linear-gradient(135deg,#059669,#047857);padding:28px;color:#fff;text-align:center;">
          <h1 style="margin:0;font-size:24px;">\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19</h1>
          <p style="margin:8px 0 0;">\u0E43\u0E01\u0E25\u0E49\u0E16\u0E36\u0E07\u0E27\u0E31\u0E19\u0E04\u0E23\u0E1A\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E41\u0E25\u0E49\u0E27</p>
        </div>
        <div style="padding:28px;">
          <p>\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35 ${borrowerName}</p>
          <p>\u0E42\u0E1B\u0E23\u0E14\u0E40\u0E15\u0E23\u0E35\u0E22\u0E21\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E15\u0E32\u0E21\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E14\u0E49\u0E32\u0E19\u0E25\u0E48\u0E32\u0E07</p>
          <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:16px;border-radius:8px;line-height:1.9;">
            <strong>\u0E2A\u0E31\u0E0D\u0E0D\u0E32 #${loanId}</strong><br>
            \u0E07\u0E27\u0E14\u0E17\u0E35\u0E48 ${paymentNumber}<br>
            \u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19: <strong>\u0E3F${amount}</strong><br>
            \u0E04\u0E23\u0E1A\u0E01\u0E33\u0E2B\u0E19\u0E14: <strong>${dueDate}</strong>
          </div>
          <p style="color:#6b7280;font-size:13px;">\u0E2B\u0E32\u0E01\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E41\u0E25\u0E49\u0E27 \u0E2A\u0E32\u0E21\u0E32\u0E23\u0E16\u0E2D\u0E31\u0E1B\u0E42\u0E2B\u0E25\u0E14\u0E2A\u0E25\u0E34\u0E1B\u0E1C\u0E48\u0E32\u0E19\u0E2B\u0E19\u0E49\u0E32\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14\u0E2A\u0E31\u0E0D\u0E0D\u0E32\u0E44\u0E14\u0E49</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// server/routers/notificationRouter.ts
var notificationRouter = router({
  /**
   * ส่งอีเมลแจ้งเตือนเมื่อมีคำขอกู้ใหม่ (ส่งให้ Lender/Admin)
   * เรียกใช้จาก createRequest procedure
   */
  sendNewLoanRequestNotification: protectedProcedure.input(
    z6.object({
      requestId: z6.number().int().positive()
    })
  ).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "borrower" && ctx.user.role !== "admin") {
      throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49");
    }
    const db = await getDb();
    if (!db) {
      console.warn("[Notification] Database not available");
      return { success: false };
    }
    try {
      const request = await db.select({ borrowerId: loanRequests.borrowerId, amountRequested: loanRequests.amountRequested, interestRate: loanRequests.interestRate, loanTermMonths: loanRequests.loanTermMonths }).from(loanRequests).where(eq6(loanRequests.id, input.requestId)).limit(1);
      if (!request[0]) throw new Error("\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49");
      if (ctx.user.role === "borrower" && request[0].borrowerId !== ctx.user.id) {
        throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E04\u0E33\u0E02\u0E2D\u0E19\u0E35\u0E49");
      }
      const borrower = await db.select().from(users).where(eq6(users.id, request[0].borrowerId)).limit(1);
      if (!borrower || borrower.length === 0) {
        throw new Error("Borrower not found");
      }
      const borrowerName = borrower[0].name || "Unknown";
      const lenders = await db.select().from(users).where(eq6(users.role, "lender"));
      const admins = await db.select().from(users).where(eq6(users.role, "admin"));
      const recipients = [...lenders, ...admins];
      const dashboardUrl = `${process.env.VITE_APP_FRONTEND_URL || "http://localhost:3000"}/admin`;
      for (const recipient of recipients) {
        if (!recipient.email) continue;
        if (!await shouldSendEmailNewLoanRequest(recipient.id)) continue;
        const emailTemplate = getNewLoanRequestEmailTemplate(
          recipient.name || "Lender",
          borrowerName,
          request[0].amountRequested,
          request[0].interestRate,
          request[0].loanTermMonths,
          input.requestId,
          dashboardUrl
        );
        await sendEmail({
          to: recipient.email,
          subject: `[\u0E43\u0E2B\u0E21\u0E48] \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E22\u0E37\u0E21\u0E40\u0E07\u0E34\u0E19\u0E08\u0E32\u0E01 ${borrowerName} - #${input.requestId}`,
          html: emailTemplate
        });
      }
      if (borrower[0].email && await shouldSendEmailNewLoanRequest(request[0].borrowerId)) {
        const confirmationTemplate = getLoanRequestConfirmationEmailTemplate(
          borrowerName,
          request[0].amountRequested,
          request[0].interestRate,
          input.requestId
        );
        await sendEmail({
          to: borrower[0].email,
          subject: "\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E01\u0E32\u0E23\u0E2A\u0E48\u0E07\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E22\u0E37\u0E21\u0E40\u0E07\u0E34\u0E19",
          html: confirmationTemplate
        });
      }
      console.log(
        `[Notification] Sent new loan request notification for request #${input.requestId}`
      );
      return { success: true };
    } catch (error) {
      console.error("[Notification] Failed to send notification:", error);
      if (error instanceof Error && (error.message === "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49" || error.message === "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E04\u0E33\u0E02\u0E2D\u0E19\u0E35\u0E49")) {
        throw error;
      }
      return { success: false };
    }
  }),
  /**
   * ส่งอีเมลแจ้งเตือนเมื่อคำขอกู้ได้รับการอนุมัติ
   */
  sendLoanApprovalNotification: protectedProcedure.input(
    z6.object({
      requestId: z6.number(),
      borrowerId: z6.number(),
      loanAmount: z6.string(),
      interestRate: z6.string(),
      loanTermMonths: z6.number(),
      monthlyPayment: z6.string()
    })
  ).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "lender") throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34");
    const db = await getDb();
    if (!db) {
      console.warn("[Notification] Database not available");
      return { success: false };
    }
    try {
      const borrower = await db.select().from(users).where(eq6(users.id, input.borrowerId)).limit(1);
      if (!borrower || borrower.length === 0 || !borrower[0].email) {
        throw new Error("Borrower not found or no email");
      }
      const borrowerName = borrower[0].name || "Unknown";
      if (!await shouldSendEmailLoanApproval(input.borrowerId)) {
        return { success: true, skipped: true };
      }
      const approvalTemplate = getLoanApprovalEmailTemplate(
        borrowerName,
        input.loanAmount,
        input.interestRate,
        input.loanTermMonths,
        input.monthlyPayment,
        input.requestId
      );
      await sendEmail({
        to: borrower[0].email,
        subject: "\u{1F389} \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E41\u0E25\u0E49\u0E27",
        html: approvalTemplate
      });
      console.log(
        `[Notification] Sent loan approval notification for request #${input.requestId}`
      );
      return { success: true };
    } catch (error) {
      console.error("[Notification] Failed to send approval notification:", error);
      return { success: false };
    }
  }),
  /**
   * ส่งอีเมลแจ้งเตือนเมื่อคำขอกู้ถูกปฏิเสธ
   */
  sendLoanRejectionNotification: protectedProcedure.input(
    z6.object({
      requestId: z6.number(),
      borrowerId: z6.number(),
      rejectionReason: z6.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "lender") throw new Error("\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18");
    const db = await getDb();
    if (!db) {
      console.warn("[Notification] Database not available");
      return { success: false };
    }
    try {
      const borrower = await db.select().from(users).where(eq6(users.id, input.borrowerId)).limit(1);
      if (!borrower || borrower.length === 0 || !borrower[0].email) {
        throw new Error("Borrower not found or no email");
      }
      const borrowerName = borrower[0].name || "Unknown";
      if (!await shouldSendEmailLoanRejection(input.borrowerId)) {
        return { success: true, skipped: true };
      }
      const rejectionTemplate = `
          <!DOCTYPE html>
          <html lang="th">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f5f5f5;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .header {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                color: white;
                padding: 20px;
                border-radius: 8px 8px 0 0;
                text-align: center;
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
              }
              .content {
                padding: 20px;
              }
              .message {
                background-color: #fee2e2;
                border-left: 4px solid #ef4444;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
                color: #7f1d1d;
              }
              .reason {
                background-color: #fef2f2;
                border-left: 4px solid #f87171;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
              }
              .footer {
                background-color: #f9fafb;
                padding: 15px;
                border-radius: 0 0 8px 8px;
                font-size: 12px;
                color: #6b7280;
                text-align: center;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>\u274C \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18</h1>
              </div>
              
              <div class="content">
                <p>\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35 ${borrowerName},</p>
                
                <div class="message">
                  <strong>\u0E40\u0E2A\u0E35\u0E22\u0E43\u0E08\u0E17\u0E35\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E41\u0E08\u0E49\u0E07\u0E43\u0E2B\u0E49\u0E17\u0E23\u0E32\u0E1A\u0E27\u0E48\u0E32 \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34</strong>
                </div>
                
                ${input.rejectionReason ? `
                  <div class="reason">
                    <h3 style="margin-top: 0;">\u0E40\u0E2B\u0E15\u0E38\u0E1C\u0E25\u0E43\u0E19\u0E01\u0E32\u0E23\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18:</h3>
                    <p>${input.rejectionReason}</p>
                  </div>
                ` : ""}
                
                <p style="color: #6b7280;">
                  \u0E2B\u0E32\u0E01\u0E04\u0E38\u0E13\u0E21\u0E35\u0E04\u0E33\u0E16\u0E32\u0E21\u0E2B\u0E23\u0E37\u0E2D\u0E15\u0E49\u0E2D\u0E07\u0E01\u0E32\u0E23\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21 \u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E34\u0E14\u0E15\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E43\u0E2B\u0E49\u0E01\u0E39\u0E49\u0E2B\u0E23\u0E37\u0E2D\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A
                </p>
              </div>
              
              <div class="footer">
                <p>\xA9 2024 Loan Management System. All rights reserved.</p>
                <p>\u0E2D\u0E35\u0E40\u0E21\u0E25\u0E19\u0E35\u0E49\u0E16\u0E39\u0E01\u0E2A\u0E48\u0E07\u0E42\u0E14\u0E22\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34\u0E08\u0E32\u0E01\u0E23\u0E30\u0E1A\u0E1A \u0E01\u0E23\u0E38\u0E13\u0E32\u0E44\u0E21\u0E48\u0E15\u0E2D\u0E1A\u0E01\u0E25\u0E31\u0E1A</p>
              </div>
            </div>
          </body>
          </html>
        `;
      await sendEmail({
        to: borrower[0].email,
        subject: "\u274C \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E02\u0E2D\u0E07\u0E04\u0E38\u0E13\u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18",
        html: rejectionTemplate
      });
      console.log(
        `[Notification] Sent loan rejection notification for request #${input.requestId}`
      );
      return { success: true };
    } catch (error) {
      console.error("[Notification] Failed to send rejection notification:", error);
      return { success: false };
    }
  })
});

// server/routers/lineNotifyRouter.ts
import { TRPCError as TRPCError5 } from "@trpc/server";
import { z as z7 } from "zod";
import { eq as eq7, inArray as inArray2 } from "drizzle-orm";

// server/lineNotifyService.ts
import axios2 from "axios";
var LINE_NOTIFY_API_URL = "https://notify-api.line.me/api/notify";
async function sendLineNotify(accessToken, message) {
  try {
    if (!accessToken) {
      console.warn("[LINE Notify] No access token provided");
      return false;
    }
    const formData = new URLSearchParams();
    formData.append("message", message.message);
    if (message.imageThumbnail) {
      formData.append("imageThumbnail", message.imageThumbnail);
    }
    if (message.imageFullsize) {
      formData.append("imageFullsize", message.imageFullsize);
    }
    const response = await axios2.post(LINE_NOTIFY_API_URL, formData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    if (response.status === 200) {
      console.log("[LINE Notify] Message sent successfully");
      return true;
    }
    return false;
  } catch (error) {
    console.error("[LINE Notify] Failed to send message:", error);
    return false;
  }
}
async function sendNewLoanRequestLineNotification(accessToken, borrowerName, loanAmount, interestRate, loanTermMonths, requestId, dashboardUrl) {
  const message = `
\u{1F4CB} \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E22\u0E37\u0E21\u0E40\u0E07\u0E34\u0E19\u0E43\u0E2B\u0E21\u0E48

\u{1F464} \u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49: ${borrowerName}
\u{1F4B0} \u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19: \u0E3F${loanAmount}
\u{1F4CA} \u0E2D\u0E31\u0E15\u0E23\u0E32\u0E14\u0E2D\u0E01\u0E40\u0E1A\u0E35\u0E49\u0E22: ${interestRate}% \u0E15\u0E48\u0E2D\u0E1B\u0E35
\u{1F4C5} \u0E23\u0E30\u0E22\u0E30\u0E40\u0E27\u0E25\u0E32: ${loanTermMonths} \u0E40\u0E14\u0E37\u0E2D\u0E19
\u{1F522} \u0E40\u0E25\u0E02\u0E17\u0E35\u0E48: #${requestId}

\u{1F449} \u0E44\u0E1B\u0E22\u0E31\u0E07 Dashboard: ${dashboardUrl}
  `.trim();
  return sendLineNotify(accessToken, { message });
}
async function sendLoanApprovalLineNotification(accessToken, borrowerName, loanAmount, monthlyPayment, requestId) {
  const message = `
\u2705 \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E01\u0E32\u0E23\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34\u0E41\u0E25\u0E49\u0E27

\u{1F464} \u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49: ${borrowerName}
\u{1F4B0} \u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19: \u0E3F${loanAmount}
\u{1F4CA} \u0E04\u0E48\u0E32\u0E07\u0E27\u0E14\u0E23\u0E32\u0E22\u0E40\u0E14\u0E37\u0E2D\u0E19: \u0E3F${monthlyPayment}
\u{1F522} \u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E2A\u0E31\u0E0D\u0E0D\u0E32: #${requestId}

\u0E40\u0E07\u0E34\u0E19\u0E08\u0E30\u0E16\u0E39\u0E01\u0E42\u0E2D\u0E19\u0E44\u0E1B\u0E22\u0E31\u0E07\u0E1A\u0E31\u0E0D\u0E0A\u0E35\u0E02\u0E2D\u0E07\u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49\u0E43\u0E19\u0E40\u0E23\u0E47\u0E27\u0E46 \u0E19\u0E35\u0E49
  `.trim();
  return sendLineNotify(accessToken, { message });
}
async function sendLoanRejectionLineNotification(accessToken, borrowerName, requestId, rejectionReason) {
  const reasonText = rejectionReason ? `
\u{1F4DD} \u0E40\u0E2B\u0E15\u0E38\u0E1C\u0E25: ${rejectionReason}` : "";
  const message = `
\u274C \u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49\u0E16\u0E39\u0E01\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18

\u{1F464} \u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49: ${borrowerName}
\u{1F522} \u0E40\u0E25\u0E02\u0E17\u0E35\u0E48: #${requestId}${reasonText}

\u0E2B\u0E32\u0E01\u0E21\u0E35\u0E04\u0E33\u0E16\u0E32\u0E21\u0E01\u0E23\u0E38\u0E13\u0E32\u0E15\u0E34\u0E14\u0E15\u0E48\u0E2D\u0E1C\u0E39\u0E49\u0E43\u0E2B\u0E49\u0E01\u0E39\u0E49\u0E2B\u0E23\u0E37\u0E2D\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A
  `.trim();
  return sendLineNotify(accessToken, { message });
}
async function sendPaymentPendingLineNotification(accessToken, borrowerName, amountPaid, paymentDate, requestId) {
  const message = `
\u23F3 \u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E23\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A

\u{1F464} \u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49: ${borrowerName}
\u{1F4B0} \u0E08\u0E33\u0E19\u0E27\u0E19\u0E40\u0E07\u0E34\u0E19: \u0E3F${amountPaid}
\u{1F4C5} \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48\u0E0A\u0E33\u0E23\u0E30: ${paymentDate}
\u{1F522} \u0E40\u0E25\u0E02\u0E17\u0E35\u0E48\u0E2A\u0E31\u0E0D\u0E0D\u0E32: #${requestId}

\u0E1C\u0E39\u0E49\u0E14\u0E39\u0E41\u0E25\u0E23\u0E30\u0E1A\u0E1A\u0E08\u0E30\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A\u0E41\u0E25\u0E30\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19\u0E43\u0E19\u0E40\u0E23\u0E47\u0E27\u0E46 \u0E19\u0E35\u0E49
  `.trim();
  return sendLineNotify(accessToken, { message });
}
async function verifyLineNotifyToken(accessToken) {
  try {
    const response = await axios2.get("https://notify-api.line.me/api/status", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    return response.status === 200;
  } catch (error) {
    console.error("[LINE Notify] Token verification failed:", error);
    return false;
  }
}
async function revokeLineNotifyToken(accessToken) {
  try {
    const response = await axios2.post(
      "https://notify-api.line.me/api/revoke",
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    return response.status === 200;
  } catch (error) {
    console.error("[LINE Notify] Token revocation failed:", error);
    return false;
  }
}

// server/routers/lineNotifyRouter.ts
var lineNotifyRouter = router({
  /**
   * เชื่อมต่อ LINE Notify Token
   */
  connectLineNotify: protectedProcedure.input(
    z7.object({
      accessToken: z7.string().min(1, "Access token is required")
    })
  ).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError5({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available"
      });
    }
    try {
      const isValid = await verifyLineNotifyToken(input.accessToken);
      if (!isValid) {
        throw new TRPCError5({
          code: "BAD_REQUEST",
          message: "Invalid LINE Notify token"
        });
      }
      await db.delete(userLineTokens).where(eq7(userLineTokens.userId, ctx.user.id));
      await db.insert(userLineTokens).values({
        userId: ctx.user.id,
        lineToken: input.accessToken
      });
      await recordNotificationPreferenceAudit(ctx.user.id, "line_connected", ["lineNotify"]);
      return { success: true, message: "LINE Notify connected successfully" };
    } catch (error) {
      console.error("[LINE Notify] Connection failed:", error);
      if (error instanceof TRPCError5) {
        throw error;
      }
      throw new TRPCError5({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to connect LINE Notify"
      });
    }
  }),
  /**
   * ดูสถานะการเชื่อมต่อ LINE Notify
   */
  getLineNotifyStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      return { connected: false };
    }
    try {
      const token = await db.select().from(userLineTokens).where(eq7(userLineTokens.userId, ctx.user.id)).limit(1);
      if (!token || token.length === 0) {
        return { connected: false };
      }
      const isValid = await verifyLineNotifyToken(token[0].lineToken);
      return {
        connected: isValid,
        connectedAt: token[0].createdAt
      };
    } catch (error) {
      console.error("[LINE Notify] Status check failed:", error);
      return { connected: false };
    }
  }),
  /**
   * ยกเลิกการเชื่อมต่อ LINE Notify
   */
  disconnectLineNotify: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError5({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available"
      });
    }
    try {
      const token = await db.select().from(userLineTokens).where(eq7(userLineTokens.userId, ctx.user.id)).limit(1);
      if (token && token.length > 0) {
        await revokeLineNotifyToken(token[0].lineToken);
        await db.delete(userLineTokens).where(eq7(userLineTokens.userId, ctx.user.id));
        await recordNotificationPreferenceAudit(ctx.user.id, "line_disconnected", ["lineNotify"]);
      }
      return { success: true, message: "LINE Notify disconnected successfully" };
    } catch (error) {
      console.error("[LINE Notify] Disconnection failed:", error);
      throw new TRPCError5({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to disconnect LINE Notify"
      });
    }
  }),
  /**
   * ส่งข้อความทดสอบ
   */
  sendTestMessage: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError5({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available"
      });
    }
    try {
      const token = await db.select().from(userLineTokens).where(eq7(userLineTokens.userId, ctx.user.id)).limit(1);
      if (!token || token.length === 0) {
        throw new TRPCError5({
          code: "BAD_REQUEST",
          message: "LINE Notify not connected"
        });
      }
      const success = await sendLineNotify(token[0].lineToken, {
        message: "\u{1F9EA} \u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E17\u0E14\u0E2A\u0E2D\u0E1A\u0E08\u0E32\u0E01\u0E23\u0E30\u0E1A\u0E1A\u0E01\u0E39\u0E49\u0E22\u0E37\u0E21\u0E40\u0E07\u0E34\u0E19\n\n\u0E2B\u0E32\u0E01\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E19\u0E35\u0E49 \u0E41\u0E2A\u0E14\u0E07\u0E27\u0E48\u0E32\u0E01\u0E32\u0E23\u0E40\u0E0A\u0E37\u0E48\u0E2D\u0E21\u0E15\u0E48\u0E2D\u0E2A\u0E33\u0E40\u0E23\u0E47\u0E08\u0E41\u0E25\u0E49\u0E27"
      });
      if (!success) {
        throw new TRPCError5({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send test message"
        });
      }
      return { success: true, message: "Test message sent successfully" };
    } catch (error) {
      console.error("[LINE Notify] Test message failed:", error);
      if (error instanceof TRPCError5) {
        throw error;
      }
      throw new TRPCError5({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to send test message"
      });
    }
  }),
  /**
   * ส่งแจ้งเตือนคำขอกู้ใหม่ไปยัง Admin/Lender ที่เชื่อมต่อ LINE
   * (เรียกใช้จาก notification procedure)
   */
  sendNewLoanRequestNotification: protectedProcedure.input(
    z7.object({
      requestId: z7.number().int().positive()
    })
  ).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "borrower" && ctx.user.role !== "admin") {
      throw new TRPCError5({ code: "FORBIDDEN", message: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49" });
    }
    const db = await getDb();
    if (!db) {
      console.warn("[LINE Notify] Database not available");
      return { success: false };
    }
    const requestRows = await db.select({
      borrowerId: loanRequests.borrowerId,
      amountRequested: loanRequests.amountRequested,
      interestRate: loanRequests.interestRate,
      loanTermMonths: loanRequests.loanTermMonths
    }).from(loanRequests).where(eq7(loanRequests.id, input.requestId)).limit(1);
    const request = requestRows[0];
    if (!request) throw new TRPCError5({ code: "NOT_FOUND", message: "\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E04\u0E33\u0E02\u0E2D\u0E01\u0E39\u0E49" });
    if (ctx.user.role === "borrower" && request.borrowerId !== ctx.user.id) {
      throw new TRPCError5({ code: "FORBIDDEN", message: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E04\u0E33\u0E02\u0E2D\u0E19\u0E35\u0E49" });
    }
    const borrowerRows = await db.select({ name: users.name }).from(users).where(eq7(users.id, request.borrowerId)).limit(1);
    const borrowerName = borrowerRows[0]?.name || "\u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49";
    try {
      const adminsAndLenders = await db.select().from(users).where(inArray2(users.role, ["admin", "lender"]));
      for (const user of adminsAndLenders) {
        const token = await db.select().from(userLineTokens).where(eq7(userLineTokens.userId, user.id)).limit(1);
        if (token && token.length > 0 && await shouldSendLineNewLoanRequest(user.id)) {
          await sendNewLoanRequestLineNotification(
            token[0].lineToken,
            borrowerName,
            request.amountRequested,
            request.interestRate,
            request.loanTermMonths,
            input.requestId,
            "/admin"
          );
        }
      }
      return { success: true };
    } catch (error) {
      console.error("[LINE Notify] Failed to send notification:", error);
      return { success: false };
    }
  }),
  /**
   * ส่งแจ้งเตือนการอนุมัติให้ผู้กู้
   */
  sendLoanApprovalNotification: protectedProcedure.input(
    z7.object({
      borrowerId: z7.number(),
      borrowerName: z7.string(),
      loanAmount: z7.string(),
      monthlyPayment: z7.string(),
      requestId: z7.number()
    })
  ).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "lender") throw new TRPCError5({ code: "FORBIDDEN", message: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34" });
    const db = await getDb();
    if (!db) {
      console.warn("[LINE Notify] Database not available");
      return { success: false };
    }
    try {
      if (!await shouldSendLineLoanApproval(input.borrowerId)) {
        return { success: true, skipped: true };
      }
      const token = await db.select().from(userLineTokens).where(eq7(userLineTokens.userId, input.borrowerId)).limit(1);
      if (token && token.length > 0) {
        await sendLoanApprovalLineNotification(
          token[0].lineToken,
          input.borrowerName,
          input.loanAmount,
          input.monthlyPayment,
          input.requestId
        );
      }
      return { success: true };
    } catch (error) {
      console.error("[LINE Notify] Failed to send approval notification:", error);
      return { success: false };
    }
  }),
  /**
   * ส่งแจ้งเตือนการปฏิเสธให้ผู้กู้
   */
  sendLoanRejectionNotification: protectedProcedure.input(
    z7.object({
      borrowerId: z7.number(),
      borrowerName: z7.string(),
      requestId: z7.number(),
      rejectionReason: z7.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "lender") throw new TRPCError5({ code: "FORBIDDEN", message: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E1B\u0E0F\u0E34\u0E40\u0E2A\u0E18" });
    const db = await getDb();
    if (!db) {
      console.warn("[LINE Notify] Database not available");
      return { success: false };
    }
    try {
      if (!await shouldSendLineLoanRejection(input.borrowerId)) {
        return { success: true, skipped: true };
      }
      const token = await db.select().from(userLineTokens).where(eq7(userLineTokens.userId, input.borrowerId)).limit(1);
      if (token && token.length > 0) {
        await sendLoanRejectionLineNotification(
          token[0].lineToken,
          input.borrowerName,
          input.requestId,
          input.rejectionReason
        );
      }
      return { success: true };
    } catch (error) {
      console.error("[LINE Notify] Failed to send rejection notification:", error);
      return { success: false };
    }
  }),
  /**
   * ส่งแจ้งเตือนการชำระเงินรอตรวจสอบ
   */
  sendPaymentPendingNotification: protectedProcedure.input(
    z7.object({
      borrowerId: z7.number(),
      borrowerName: z7.string(),
      amountPaid: z7.string(),
      paymentDate: z7.string(),
      requestId: z7.number()
    })
  ).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "lender") throw new TRPCError5({ code: "FORBIDDEN", message: "\u0E44\u0E21\u0E48\u0E21\u0E35\u0E2A\u0E34\u0E17\u0E18\u0E34\u0E4C\u0E2A\u0E48\u0E07\u0E01\u0E32\u0E23\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E01\u0E32\u0E23\u0E0A\u0E33\u0E23\u0E30\u0E40\u0E07\u0E34\u0E19" });
    const db = await getDb();
    if (!db) {
      console.warn("[LINE Notify] Database not available");
      return { success: false };
    }
    try {
      if (!await shouldSendLinePaymentReminder(input.borrowerId)) {
        return { success: true, skipped: true };
      }
      const token = await db.select().from(userLineTokens).where(eq7(userLineTokens.userId, input.borrowerId)).limit(1);
      if (token && token.length > 0) {
        await sendPaymentPendingLineNotification(
          token[0].lineToken,
          input.borrowerName,
          input.amountPaid,
          input.paymentDate,
          input.requestId
        );
      }
      return { success: true };
    } catch (error) {
      console.error("[LINE Notify] Failed to send payment notification:", error);
      return { success: false };
    }
  })
});

// server/routers/notificationPreferencesRouter.ts
import { TRPCError as TRPCError6 } from "@trpc/server";
import { z as z8 } from "zod";
var notificationPreferencesRouter = router({
  /**
   * ดึงการตั้งค่าการแจ้งเตือนของผู้ใช้ปัจจุบัน
   */
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    try {
      let prefs = await getNotificationPreferences(ctx.user.id);
      if (!prefs) {
        prefs = await createDefaultNotificationPreferences(ctx.user.id);
      }
      await recordNotificationPreferenceAudit(ctx.user.id, "read");
      return prefs;
    } catch (error) {
      console.error("[NotificationPreferences] Failed to get preferences:", error);
      throw new TRPCError6({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get notification preferences"
      });
    }
  }),
  /**
   * อัปเดตการตั้งค่าการแจ้งเตือน
   */
  updatePreferences: protectedProcedure.input(
    z8.object({
      emailNewLoanRequest: z8.boolean().optional(),
      emailLoanApproval: z8.boolean().optional(),
      emailLoanRejection: z8.boolean().optional(),
      emailPaymentReminder: z8.boolean().optional(),
      emailPaymentConfirmation: z8.boolean().optional(),
      lineNewLoanRequest: z8.boolean().optional(),
      lineLoanApproval: z8.boolean().optional(),
      lineLoanRejection: z8.boolean().optional(),
      linePaymentReminder: z8.boolean().optional(),
      linePaymentConfirmation: z8.boolean().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    try {
      const updated = await updateNotificationPreferences(ctx.user.id, input);
      if (!updated) {
        throw new TRPCError6({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update notification preferences"
        });
      }
      await recordNotificationPreferenceAudit(ctx.user.id, "updated", Object.keys(input));
      return updated;
    } catch (error) {
      console.error("[NotificationPreferences] Failed to update preferences:", error);
      if (error instanceof TRPCError6) {
        throw error;
      }
      throw new TRPCError6({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update notification preferences"
      });
    }
  }),
  /**
   * อัปเดตการตั้งค่าอีเมล
   */
  updateEmailPreferences: protectedProcedure.input(
    z8.object({
      emailNewLoanRequest: z8.boolean().optional(),
      emailLoanApproval: z8.boolean().optional(),
      emailLoanRejection: z8.boolean().optional(),
      emailPaymentReminder: z8.boolean().optional(),
      emailPaymentConfirmation: z8.boolean().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    try {
      const updated = await updateNotificationPreferences(ctx.user.id, input);
      if (!updated) {
        throw new TRPCError6({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update email preferences"
        });
      }
      await recordNotificationPreferenceAudit(ctx.user.id, "updated", Object.keys(input));
      return updated;
    } catch (error) {
      console.error("[NotificationPreferences] Failed to update email preferences:", error);
      if (error instanceof TRPCError6) {
        throw error;
      }
      throw new TRPCError6({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update email preferences"
      });
    }
  }),
  /**
   * อัปเดตการตั้งค่า LINE
   */
  updateLinePreferences: protectedProcedure.input(
    z8.object({
      lineNewLoanRequest: z8.boolean().optional(),
      lineLoanApproval: z8.boolean().optional(),
      lineLoanRejection: z8.boolean().optional(),
      linePaymentReminder: z8.boolean().optional(),
      linePaymentConfirmation: z8.boolean().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    try {
      const updated = await updateNotificationPreferences(ctx.user.id, input);
      if (!updated) {
        throw new TRPCError6({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update LINE preferences"
        });
      }
      await recordNotificationPreferenceAudit(ctx.user.id, "updated", Object.keys(input));
      return updated;
    } catch (error) {
      console.error("[NotificationPreferences] Failed to update LINE preferences:", error);
      if (error instanceof TRPCError6) {
        throw error;
      }
      throw new TRPCError6({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update LINE preferences"
      });
    }
  }),
  /**
   * รีเซ็ตการตั้งค่าการแจ้งเตือนเป็นค่าเริ่มต้น
   */
  resetToDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const updated = await updateNotificationPreferences(ctx.user.id, {
        emailNewLoanRequest: true,
        emailLoanApproval: true,
        emailLoanRejection: true,
        emailPaymentReminder: true,
        emailPaymentConfirmation: true,
        lineNewLoanRequest: true,
        lineLoanApproval: true,
        lineLoanRejection: true,
        linePaymentReminder: true,
        linePaymentConfirmation: true
      });
      if (!updated) {
        throw new TRPCError6({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to reset preferences"
        });
      }
      await recordNotificationPreferenceAudit(ctx.user.id, "reset", [
        "emailNewLoanRequest",
        "emailLoanApproval",
        "emailLoanRejection",
        "emailPaymentReminder",
        "emailPaymentConfirmation",
        "lineNewLoanRequest",
        "lineLoanApproval",
        "lineLoanRejection",
        "linePaymentReminder",
        "linePaymentConfirmation"
      ]);
      return updated;
    } catch (error) {
      console.error("[NotificationPreferences] Failed to reset preferences:", error);
      if (error instanceof TRPCError6) {
        throw error;
      }
      throw new TRPCError6({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to reset preferences"
      });
    }
  }),
  /** แสดง audit trail เฉพาะบัญชีที่ล็อกอิน */
  getAuditLogs: protectedProcedure.input(z8.object({ limit: z8.number().int().min(1).max(20).default(8) }).optional()).query(async ({ ctx, input }) => {
    return getNotificationPreferenceAuditLogs(ctx.user.id, input?.limit ?? 8);
  })
});

// server/routers/profileRouter.ts
import { z as z9 } from "zod";
import { eq as eq8 } from "drizzle-orm";
var avatarInput = z9.object({
  dataUrl: z9.string().max(3e6),
  mimeType: z9.enum(["image/png", "image/jpeg", "image/webp"])
});
var profileRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [profile] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, avatarUrl: users.avatarUrl }).from(users).where(eq8(users.id, ctx.user.id)).limit(1);
    return profile;
  }),
  uploadAvatar: protectedProcedure.input(avatarInput).mutation(async ({ ctx, input }) => {
    const expectedPrefix = `data:${input.mimeType};base64,`;
    if (!input.dataUrl.startsWith(expectedPrefix)) throw new Error("\u0E0A\u0E19\u0E34\u0E14\u0E44\u0E1F\u0E25\u0E4C\u0E23\u0E39\u0E1B\u0E42\u0E1B\u0E23\u0E44\u0E1F\u0E25\u0E4C\u0E44\u0E21\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E1A\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E17\u0E35\u0E48\u0E2A\u0E48\u0E07\u0E21\u0E32");
    const encoded = input.dataUrl.slice(expectedPrefix.length);
    if (!encoded) throw new Error("\u0E23\u0E39\u0E1B\u0E42\u0E1B\u0E23\u0E44\u0E1F\u0E25\u0E4C\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) throw new Error("\u0E23\u0E39\u0E1B\u0E42\u0E1B\u0E23\u0E44\u0E1F\u0E25\u0E4C\u0E15\u0E49\u0E2D\u0E07\u0E21\u0E35\u0E02\u0E19\u0E32\u0E14\u0E44\u0E21\u0E48\u0E40\u0E01\u0E34\u0E19 2 MB");
    const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
    const uploaded = await storagePut(`avatars/${ctx.user.id}/avatar-${Date.now()}.${extension}`, bytes, input.mimeType);
    await updateUserAvatarUrl(ctx.user.id, uploaded.url);
    return { avatarUrl: uploaded.url };
  }),
  removeAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    await clearUserAvatarUrl(ctx.user.id);
    return { avatarUrl: null };
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  loan: loanRouter,
  export: exportRouter,
  admin: adminRouter,
  notification: notificationRouter,
  lineNotify: lineNotifyRouter,
  notificationPreferences: notificationPreferencesRouter,
  profile: profileRouter
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/securityMiddleware.ts
var windowMs = 6e4;
var maxRequestsPerWindow = 120;
var buckets = /* @__PURE__ */ new Map();
function getClientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}
function isSameOrigin(req) {
  const origin = req.get("origin");
  if (!origin) return true;
  try {
    const allowedHost = req.get("x-forwarded-host") || req.get("host");
    return Boolean(allowedHost && new URL(origin).host === allowedHost);
  } catch {
    return false;
  }
}
function apiSecurityMiddleware(req, res, next) {
  const key = getClientKey(req);
  const now = Date.now();
  const bucket = buckets.get(key);
  const activeBucket = !bucket || bucket.resetAt <= now ? { count: 0, resetAt: now + windowMs } : bucket;
  activeBucket.count += 1;
  buckets.set(key, activeBucket);
  if (activeBucket.count > maxRequestsPerWindow) {
    res.setHeader("Retry-After", Math.ceil((activeBucket.resetAt - now) / 1e3));
    return res.status(429).json({ error: "\u0E04\u0E33\u0E02\u0E2D\u0E21\u0E32\u0E01\u0E40\u0E01\u0E34\u0E19\u0E44\u0E1B \u0E01\u0E23\u0E38\u0E13\u0E32\u0E25\u0E2D\u0E07\u0E43\u0E2B\u0E21\u0E48\u0E20\u0E32\u0E22\u0E2B\u0E25\u0E31\u0E07" });
  }
  if (req.method !== "GET" && req.method !== "HEAD" && !isSameOrigin(req)) {
    return res.status(403).json({ error: "\u0E04\u0E33\u0E02\u0E2D\u0E02\u0E49\u0E32\u0E21\u0E41\u0E2B\u0E25\u0E48\u0E07\u0E17\u0E35\u0E48\u0E21\u0E32\u0E44\u0E21\u0E48\u0E16\u0E39\u0E01\u0E15\u0E49\u0E2D\u0E07" });
  }
  return next();
}

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params["0"];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResponse = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResponse.ok) {
        const body = await forgeResponse.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResponse.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResponse.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (error) {
      console.error("[StorageProxy] failed:", error);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/scheduledReminder.ts
import { and as and4, eq as eq9, gte as gte3, like as like2, lte } from "drizzle-orm";
function toDateOnly(date2) {
  return date2.toISOString().slice(0, 10);
}
function addDays(date2, days) {
  const result = new Date(date2);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
async function sendUpcomingPaymentReminders(req, res) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only" });
    }
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "database-unavailable" });
    const startDate = toDateOnly(/* @__PURE__ */ new Date());
    const endDate = toDateOnly(addDays(/* @__PURE__ */ new Date(), 3));
    const schedules = await db.select().from(amortizationSchedules).where(
      and4(
        eq9(amortizationSchedules.isPaid, false),
        gte3(amortizationSchedules.dueDate, /* @__PURE__ */ new Date(`${startDate}T00:00:00.000Z`)),
        lte(amortizationSchedules.dueDate, /* @__PURE__ */ new Date(`${endDate}T00:00:00.000Z`))
      )
    );
    let sent = 0;
    let skipped = 0;
    for (const schedule of schedules) {
      const loanRows = await db.select().from(loans).where(eq9(loans.id, schedule.loanId)).limit(1);
      const loan = loanRows[0];
      if (!loan) {
        skipped += 1;
        continue;
      }
      const borrowerRows = await db.select().from(users).where(eq9(users.id, loan.borrowerId)).limit(1);
      const borrower = borrowerRows[0];
      if (!borrower) {
        skipped += 1;
        continue;
      }
      const dueDate = String(schedule.dueDate);
      const notificationMessage = `\u0E43\u0E01\u0E25\u0E49\u0E16\u0E36\u0E07\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E0A\u0E33\u0E23\u0E30\u0E2A\u0E31\u0E0D\u0E0D\u0E32 #${loan.id} \u0E07\u0E27\u0E14\u0E17\u0E35\u0E48 ${schedule.paymentNumber} \u0E27\u0E31\u0E19\u0E17\u0E35\u0E48 ${dueDate}`;
      const existing = await db.select({ id: notifications.id }).from(notifications).where(
        and4(
          eq9(notifications.userId, borrower.id),
          eq9(notifications.type, "payment_due"),
          like2(notifications.message, notificationMessage)
        )
      ).limit(1);
      if (existing.length > 0) {
        skipped += 1;
        continue;
      }
      await db.insert(notifications).values({
        userId: borrower.id,
        type: "payment_due",
        message: notificationMessage,
        sentVia: "in-app"
      });
      if (borrower.email && await shouldSendEmailPaymentReminder(borrower.id)) {
        const email = getPaymentReminderEmailTemplate(
          borrower.name || "\u0E1C\u0E39\u0E49\u0E01\u0E39\u0E49",
          schedule.totalPaymentDue,
          dueDate,
          schedule.paymentNumber,
          loan.id
        );
        await sendEmail({
          to: borrower.email,
          subject: `\u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E0A\u0E33\u0E23\u0E30\u0E2A\u0E31\u0E0D\u0E0D\u0E32 #${loan.id}`,
          html: email,
          text: notificationMessage
        });
      }
      if (await shouldSendLinePaymentReminder(borrower.id)) {
        const tokenRows = await db.select().from(userLineTokens).where(eq9(userLineTokens.userId, borrower.id)).limit(1);
        const token = tokenRows[0]?.lineToken;
        if (token) {
          await sendLineNotify(token, {
            message: `\u23F0 \u0E41\u0E08\u0E49\u0E07\u0E40\u0E15\u0E37\u0E2D\u0E19\u0E01\u0E33\u0E2B\u0E19\u0E14\u0E0A\u0E33\u0E23\u0E30

\u0E2A\u0E31\u0E0D\u0E0D\u0E32: #${loan.id}
\u0E07\u0E27\u0E14\u0E17\u0E35\u0E48: ${schedule.paymentNumber}
\u0E08\u0E33\u0E19\u0E27\u0E19: \u0E3F${schedule.totalPaymentDue}
\u0E04\u0E23\u0E1A\u0E01\u0E33\u0E2B\u0E19\u0E14: ${dueDate}`
          });
        }
      }
      sent += 1;
    }
    return res.json({ ok: true, taskUid: user.taskUid ?? null, startDate, endDate, sent, skipped });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown-error";
    return res.status(500).json({
      error: message,
      stack: error instanceof Error ? error.stack : void 0,
      context: { url: req.originalUrl, taskUid: req.headers["x-task-uid"] ?? null },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
}

// server/reportRetentionCleanup.ts
async function runReportDownloadRetentionCleanup(req, res) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    if (!await isRegisteredReportDownloadRetentionTask(user.taskUid)) {
      return res.json({ ok: true, skipped: "orphan-or-unregistered-task" });
    }
    const result = await runReportDownloadHistoryRetention(0);
    return res.json({ ok: true, taskUid: user.taskUid ?? null, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown-error";
    return res.status(500).json({
      error: message,
      context: { url: req.originalUrl, taskUid: req.headers["x-task-uid"] ?? null },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
}

// server/_core/app.ts
function createApiApp() {
  const app = express2();
  const uploadsDir = process.env.VERCEL ? path2.join("/tmp", "loan-management-uploads") : path2.resolve(process.cwd(), "uploads");
  if (!fs2.existsSync(uploadsDir)) fs2.mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express2.static(uploadsDir));
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  app.use("/api", apiSecurityMiddleware);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  app.post("/api/scheduled/payment-reminders", sendUpcomingPaymentReminders);
  app.post("/api/scheduled/report-download-retention", runReportDownloadRetentionCleanup);
  return app;
}
function configureEmailService() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log("[Email] SMTP is not configured; email delivery is disabled");
    return;
  }
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  initializeEmailService({
    host: smtpHost,
    port: Number.isFinite(smtpPort) ? smtpPort : 587,
    secure: process.env.SMTP_SECURE === "true" || smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    from: process.env.EMAIL_FROM || smtpUser
  });
  console.log("[Email] SMTP service initialized");
}
export {
  configureEmailService,
  createApiApp
};
