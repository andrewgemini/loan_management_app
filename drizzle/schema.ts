import { decimal, integer, pgEnum, pgTable, text, timestamp, varchar, boolean, date, uniqueIndex, index, serial } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const roleEnum = pgEnum("role", ["admin", "lender", "borrower"]);
export const interestTypeEnum = pgEnum("interest_type", ["simple", "compound"]);
export const paymentTypeEnum = pgEnum("payment_type", ["fixed", "reducing"]);
export const loanRequestStatusEnum = pgEnum("loan_request_status", ["pending", "approved", "rejected"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "verified", "rejected"]);
export const notificationTypeEnum = pgEnum("notification_type", ["payment_due", "loan_status", "payment_verified", "loan_approved", "loan_rejected", "export_approval_pending"]);
export const comparisonModeEnum = pgEnum("comparison_mode", ["matching_period", "previous_month", "previous_quarter"]);
export const exportFormatEnum = pgEnum("export_format", ["csv", "pdf"]);
export const exportApprovalStatusEnum = pgEnum("export_approval_status", ["pending", "approved", "rejected", "expired"]);
export const securityEventTypeEnum = pgEnum("security_event_type", ["high_volume_export", "approval_requested", "approval_approved", "approval_rejected", "retention_cleanup"]);
export const securitySeverityEnum = pgEnum("security_severity", ["info", "warning", "high"]);

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ===== Loan Request Tables =====

/**
 * คำขอกู้ยืมเงิน
 */
export const loanRequests = pgTable("loan_requests", {
  id: serial("id").primaryKey(),
  borrowerId: integer("borrower_id").notNull(),
  amountRequested: decimal("amount_requested", { precision: 12, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(), // อัตราดอกเบี้ยต่อปี (%)
  loanTermMonths: integer("loan_term_months").notNull(), // ระยะเวลาผ่อน (เดือน)
  interestType: interestTypeEnum("interest_type").notNull(), // ประเภทดอกเบี้ย
  paymentType: paymentTypeEnum("payment_type").notNull(), // ประเภทการผ่อนชำระ
  status: loanRequestStatusEnum("status").default("pending").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  approvedById: integer("approved_by_id"), // ผู้ที่อนุมัติ (Lender/Admin)
  approvedAt: timestamp("approved_at"),
  decidedAt: timestamp("decided_at"),
  rejectionReason: text("rejection_reason"), // เหตุผลในการปฏิเสธ
});

export type LoanRequest = typeof loanRequests.$inferSelect;
export type InsertLoanRequest = typeof loanRequests.$inferInsert;

/**
 * สัญญาเงินกู้ที่อนุมัติแล้ว
 */
export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  borrowerId: integer("borrower_id").notNull(),
  lenderId: integer("lender_id").notNull(), // ผู้ให้กู้
  principalAmount: decimal("principal_amount", { precision: 12, scale: 2 }).notNull(), // ยอดเงินต้น
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(),
  loanTermMonths: integer("loan_term_months").notNull(),
  interestType: interestTypeEnum("interest_type").notNull(),
  paymentType: paymentTypeEnum("payment_type").notNull(),
  startDate: date("start_date", { mode: "date" }).notNull(),
  nextPaymentDate: date("next_payment_date", { mode: "date" }).notNull(),
  totalPaid: decimal("total_paid", { precision: 12, scale: 2 }).default("0"),
  isClosed: boolean("is_closed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Loan = typeof loans.$inferSelect;
export type InsertLoan = typeof loans.$inferInsert;

/**
 * ตารางผ่อนชำระ (Amortization Schedule)
 */
export const amortizationSchedules = pgTable("amortization_schedules", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull(),
  paymentNumber: integer("payment_number").notNull(), // งวดที่
  dueDate: date("due_date", { mode: "date" }).notNull(),
  startingBalance: decimal("starting_balance", { precision: 12, scale: 2 }).notNull(),
  principalDue: decimal("principal_due", { precision: 12, scale: 2 }).notNull(),
  interestDue: decimal("interest_due", { precision: 12, scale: 2 }).notNull(),
  totalPaymentDue: decimal("total_payment_due", { precision: 12, scale: 2 }).notNull(),
  endingBalance: decimal("ending_balance", { precision: 12, scale: 2 }).notNull(),
  isPaid: boolean("is_paid").default(false),
});

export type AmortizationSchedule = typeof amortizationSchedules.$inferSelect;
export type InsertAmortizationSchedule = typeof amortizationSchedules.$inferInsert;

/**
 * ประวัติการชำระเงิน
 */
export const loanPayments = pgTable("loan_payments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").notNull(),
  scheduleId: integer("schedule_id"), // งวดที่ชำระ
  amountPaid: decimal("amount_paid", { precision: 12, scale: 2 }).notNull(),
  paymentDate: timestamp("payment_date").defaultNow().notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(), // PromptPay, Bank Transfer, Slip Upload
  slipPath: varchar("slip_path", { length: 255 }), // Path ของไฟล์สลิป
  verifiedById: integer("verified_by_id"), // ผู้ที่ตรวจสอบ (Admin)
  verifiedAt: timestamp("verified_at"),
  status: paymentStatusEnum("status").default("pending").notNull(),
  rejectionReason: text("rejection_reason"), // เหตุผลในการปฏิเสธ
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LoanPayment = typeof loanPayments.$inferSelect;
export type InsertLoanPayment = typeof loanPayments.$inferInsert;

/**
 * ระบบแจ้งเตือน
 */
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: notificationTypeEnum("type").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  sentVia: varchar("sent_via", { length: 50 }).notNull(), // in-app, email, line
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * ระบบแจ้งเตือนสำหรับ Line Notify
 */
export const userLineTokens = pgTable("user_line_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  lineToken: varchar("line_token", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserLineToken = typeof userLineTokens.$inferSelect;
export type InsertUserLineToken = typeof userLineTokens.$inferInsert;

/**
 * การตั้งค่าตั้งค่าการแจ้งเตือนของผู้ใช้
 */
export const notificationPreferences = pgTable("notification_preferences", {
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
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferences.$inferInsert;

/** ค่าเริ่มต้น Dashboard ต่อบัญชี เก็บเฉพาะวันและโหมดเปรียบเทียบ ไม่เก็บข้อมูลรายงาน */
export const userDashboardPreferences = pgTable("user_dashboard_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  customRangeStartDate: varchar("custom_range_start_date", { length: 10 }),
  customRangeEndDate: varchar("custom_range_end_date", { length: 10 }),
  comparisonMode: comparisonModeEnum("comparison_mode").notNull().default("matching_period"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserDashboardPreference = typeof userDashboardPreferences.$inferSelect;
export type InsertUserDashboardPreference = typeof userDashboardPreferences.$inferInsert;

/** ชุด Custom Date Range ที่ผู้ใช้ตั้งชื่อและเรียกใช้ซ้ำได้ใน Dashboard */
export const userDashboardRangePresets = pgTable("user_dashboard_range_presets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  startDate: varchar("start_date", { length: 10 }).notNull(),
  endDate: varchar("end_date", { length: 10 }).notNull(),
  isShared: boolean("is_shared").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserDashboardRangePreset = typeof userDashboardRangePresets.$inferSelect;
export type InsertUserDashboardRangePreset = typeof userDashboardRangePresets.$inferInsert;

/** Preset ที่แต่ละ Admin เปิดใช้ล่าสุด; เก็บต่อบัญชีโดยไม่เปลี่ยนเจ้าของหรือ metadata ของ Preset ต้นทาง */
export const userDashboardPresetRecentUses = pgTable("user_dashboard_preset_recent_uses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  presetId: integer("preset_id").notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  usageCount: integer("usage_count").notNull().default(0),
}, (table) => ({
  userPresetUnique: uniqueIndex("user_dashboard_preset_recent_uses_user_preset_unique").on(table.userId, table.presetId),
}));

export type UserDashboardPresetRecentUse = typeof userDashboardPresetRecentUses.$inferSelect;
export type InsertUserDashboardPresetRecentUse = typeof userDashboardPresetRecentUses.$inferInsert;

/** Preset ที่แต่ละ Admin ปักหมุด; เป็นความต้องการเฉพาะบัญชีและไม่กระทบ Preset ต้นทางหรือทีม */
export const userDashboardPresetPins = pgTable("user_dashboard_preset_pins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  presetId: integer("preset_id").notNull(),
  pinnedAt: timestamp("pinned_at").defaultNow().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => ({
  userPresetUnique: uniqueIndex("user_dashboard_preset_pins_user_preset_unique").on(table.userId, table.presetId),
}));

export type UserDashboardPresetPin = typeof userDashboardPresetPins.$inferSelect;
export type InsertUserDashboardPresetPin = typeof userDashboardPresetPins.$inferInsert;

/** หมวดหมู่ Preset ที่ตั้งชื่อโดย Admin แต่ละบัญชี แยกจาก Preset ต้นทางและข้อมูลทีม */
export const userDashboardPresetCategories = pgTable("user_dashboard_preset_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  color: varchar("color", { length: 16 }).notNull().default("blue"),
  icon: varchar("icon", { length: 24 }).notNull().default("folder"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userCategoryUnique: uniqueIndex("user_dashboard_preset_categories_user_name_unique").on(table.userId, table.name),
}));

export type UserDashboardPresetCategory = typeof userDashboardPresetCategories.$inferSelect;
export type InsertUserDashboardPresetCategory = typeof userDashboardPresetCategories.$inferInsert;

/** การจัด Preset เข้า 1 หมวดหมู่ต่อบัญชี เพื่อให้ Preset ทีมยังคงต้นฉบับเดิม */
export const userDashboardPresetCategoryAssignments = pgTable("user_dashboard_preset_category_assignments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  presetId: integer("preset_id").notNull(),
  categoryId: integer("category_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userPresetUnique: uniqueIndex("user_dashboard_preset_category_assignments_user_preset_unique").on(table.userId, table.presetId),
  userCategoryIndex: index("user_dashboard_preset_category_assignments_user_category_index").on(table.userId, table.categoryId),
}));

export type UserDashboardPresetCategoryAssignment = typeof userDashboardPresetCategoryAssignments.$inferSelect;
export type InsertUserDashboardPresetCategoryAssignment = typeof userDashboardPresetCategoryAssignments.$inferInsert;

/** ประวัติการย้าย Preset ระหว่างโฟลเดอร์ของแต่ละบัญชี เก็บ snapshot ก่อนย้ายเพื่อ Undo ล่าสุด */
export const userDashboardPresetCategoryMoveHistory = pgTable("user_dashboard_preset_category_move_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  presetIds: text("preset_ids").notNull(),
  previousCategoryIds: text("previous_category_ids").notNull(),
  destinationCategoryId: integer("destination_category_id"),
  undoneAt: timestamp("undone_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userCreatedIndex: index("user_dashboard_preset_category_move_history_user_created_index").on(table.userId, table.createdAt),
}));

export type UserDashboardPresetCategoryMoveHistory = typeof userDashboardPresetCategoryMoveHistory.$inferSelect;
export type InsertUserDashboardPresetCategoryMoveHistory = typeof userDashboardPresetCategoryMoveHistory.$inferInsert;

/**
 * Audit trail for viewing and changing a user's notification preferences.
 * Store only event metadata and field names; do not retain notification tokens or preference values.
 */
export const notificationPreferenceAuditLogs = pgTable("notification_preference_audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  action: varchar("action", { length: 32 }).notNull(),
  changedFields: text("changed_fields").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type NotificationPreferenceAuditLog = typeof notificationPreferenceAuditLogs.$inferSelect;
export type InsertNotificationPreferenceAuditLog = typeof notificationPreferenceAuditLogs.$inferInsert;

/** สิทธิ์ส่งออกรายงานแบบละเอียดต่อบัญชีผู้ดูแลระบบ */
export const adminExportPermissions = pgTable("admin_export_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  canExportCsv: boolean("can_export_csv").default(true).notNull(),
  canExportPdf: boolean("can_export_pdf").default(true).notNull(),
  canVerifyReferences: boolean("can_verify_references").default(true).notNull(),
  canViewTeamDownloadHistory: boolean("can_view_team_download_history").default(false).notNull(),
  canManageExportPermissions: boolean("can_manage_export_permissions").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AdminExportPermission = typeof adminExportPermissions.$inferSelect;

/** บันทึก metadata การดาวน์โหลดรายงาน ไม่เก็บรายงานหรือข้อมูลในรายงาน */
export const reportDownloadHistory = pgTable("report_download_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  format: exportFormatEnum("format").notNull(),
  referenceCode: varchar("reference_code", { length: 64 }),
  approvalRequestId: integer("approval_request_id"),
  filterSummary: varchar("filter_summary", { length: 1200 }).notNull().default(""),
  rowCount: integer("row_count").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ReportDownloadHistory = typeof reportDownloadHistory.$inferSelect;

/** นโยบาย singleton สำหรับความปลอดภัยของการส่งออกรายงาน */
export const reportExportSecurityPolicy = pgTable("report_export_security_policy", {
  id: integer("id").primaryKey(),
  highVolumeRowThreshold: integer("high_volume_row_threshold").notNull().default(500),
  approvalRowThreshold: integer("approval_row_threshold").notNull().default(750),
  retentionDays: integer("retention_days").notNull().default(365),
  approvalExpiresHours: integer("approval_expires_hours").notNull().default(24),
  alertOwnerOnHighVolume: boolean("alert_owner_on_high_volume").notNull().default(true),
  scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
  updatedById: integer("updated_by_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ReportExportSecurityPolicy = typeof reportExportSecurityPolicy.$inferSelect;

/** คำขออนุมัติการส่งออกข้อมูลระดับสูง เก็บเฉพาะ metadata ของผลลัพธ์ */
export const reportExportApprovalRequests = pgTable("report_export_approval_requests", {
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
  consumedAt: timestamp("consumed_at"),
});

export type ReportExportApprovalRequest = typeof reportExportApprovalRequests.$inferSelect;

/** เหตุการณ์ความปลอดภัยของการส่งออกสำหรับการตรวจสอบและการแจ้งเตือน */
export const reportExportSecurityEvents = pgTable("report_export_security_events", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").notNull(),
  approvalRequestId: integer("approval_request_id"),
  type: securityEventTypeEnum("type").notNull(),
  severity: securitySeverityEnum("severity").notNull().default("info"),
  rowCount: integer("row_count"),
  referenceCode: varchar("reference_code", { length: 64 }),
  message: varchar("message", { length: 600 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ReportExportSecurityEvent = typeof reportExportSecurityEvents.$inferSelect;

/**
 * ชุดตัวกรอง Activity History ที่บันทึกต่อบัญชีผู้ใช้
 * เก็บเฉพาะเงื่อนไขรายงาน ไม่เก็บข้อมูลกิจกรรมหรือข้อมูลการชำระเงิน
 */
export const activityHistoryFilterPresets = pgTable("activity_history_filter_presets", {
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
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ActivityHistoryFilterPreset = typeof activityHistoryFilterPresets.$inferSelect;
export type InsertActivityHistoryFilterPreset = typeof activityHistoryFilterPresets.$inferInsert;

/**
 * การตั้งค่าระบบ
 */
export const settings = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  description: varchar("description", { length: 255 }),
});

export type Setting = typeof settings.$inferSelect;
export type InsertSetting = typeof settings.$inferInsert;
