const TOKEN = "loan-bootstrap-20260914-c678f02";
const statements = `
CREATE TYPE "public"."comparison_mode" AS ENUM('matching_period', 'previous_month', 'previous_quarter');
CREATE TYPE "public"."export_approval_status" AS ENUM('pending', 'approved', 'rejected', 'expired');
CREATE TYPE "public"."export_format" AS ENUM('csv', 'pdf');
CREATE TYPE "public"."interest_type" AS ENUM('simple', 'compound');
CREATE TYPE "public"."loan_request_status" AS ENUM('pending', 'approved', 'rejected');
CREATE TYPE "public"."notification_type" AS ENUM('payment_due', 'loan_status', 'payment_verified', 'loan_approved', 'loan_rejected', 'export_approval_pending');
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'verified', 'rejected');
CREATE TYPE "public"."payment_type" AS ENUM('fixed', 'reducing');
CREATE TYPE "public"."role" AS ENUM('admin', 'lender', 'borrower');
CREATE TYPE "public"."security_event_type" AS ENUM('high_volume_export', 'approval_requested', 'approval_approved', 'approval_rejected', 'retention_cleanup');
CREATE TYPE "public"."security_severity" AS ENUM('info', 'warning', 'high');
CREATE TABLE "activity_history_filter_presets" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"name" varchar(120) NOT NULL,"start_date" varchar(10) DEFAULT '' NOT NULL,"end_date" varchar(10) DEFAULT '' NOT NULL,"event_type" varchar(160) DEFAULT 'all' NOT NULL,"actor_name" varchar(255) DEFAULT 'all' NOT NULL,"actor_role" varchar(32) DEFAULT 'all' NOT NULL,"lender_id" integer,"created_at" timestamp DEFAULT now() NOT NULL,"updated_at" timestamp DEFAULT now() NOT NULL);
CREATE TABLE "admin_export_permissions" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"can_export_csv" boolean DEFAULT true NOT NULL,"can_export_pdf" boolean DEFAULT true NOT NULL,"can_verify_references" boolean DEFAULT true NOT NULL,"can_view_team_download_history" boolean DEFAULT false NOT NULL,"can_manage_export_permissions" boolean DEFAULT false NOT NULL,"created_at" timestamp DEFAULT now() NOT NULL,"updated_at" timestamp DEFAULT now() NOT NULL,CONSTRAINT "admin_export_permissions_user_id_unique" UNIQUE("user_id"));
CREATE TABLE "amortization_schedules" ("id" serial PRIMARY KEY NOT NULL,"loan_id" integer NOT NULL,"payment_number" integer NOT NULL,"due_date" date NOT NULL,"starting_balance" numeric(12, 2) NOT NULL,"principal_due" numeric(12, 2) NOT NULL,"interest_due" numeric(12, 2) NOT NULL,"total_payment_due" numeric(12, 2) NOT NULL,"ending_balance" numeric(12, 2) NOT NULL,"is_paid" boolean DEFAULT false);
CREATE TABLE "loan_payments" ("id" serial PRIMARY KEY NOT NULL,"loan_id" integer NOT NULL,"schedule_id" integer,"amount_paid" numeric(12, 2) NOT NULL,"payment_date" timestamp DEFAULT now() NOT NULL,"payment_method" varchar(50) NOT NULL,"slip_path" varchar(255),"verified_by_id" integer,"verified_at" timestamp,"status" "payment_status" DEFAULT 'pending' NOT NULL,"rejection_reason" text,"created_at" timestamp DEFAULT now() NOT NULL);
CREATE TABLE "loan_requests" ("id" serial PRIMARY KEY NOT NULL,"borrower_id" integer NOT NULL,"amount_requested" numeric(12, 2) NOT NULL,"interest_rate" numeric(5, 2) NOT NULL,"loan_term_months" integer NOT NULL,"interest_type" "interest_type" NOT NULL,"payment_type" "payment_type" NOT NULL,"status" "loan_request_status" DEFAULT 'pending' NOT NULL,"requested_at" timestamp DEFAULT now() NOT NULL,"approved_by_id" integer,"approved_at" timestamp,"decided_at" timestamp,"rejection_reason" text);
CREATE TABLE "loans" ("id" serial PRIMARY KEY NOT NULL,"request_id" integer NOT NULL,"borrower_id" integer NOT NULL,"lender_id" integer NOT NULL,"principal_amount" numeric(12, 2) NOT NULL,"interest_rate" numeric(5, 2) NOT NULL,"loan_term_months" integer NOT NULL,"interest_type" "interest_type" NOT NULL,"payment_type" "payment_type" NOT NULL,"start_date" date NOT NULL,"next_payment_date" date NOT NULL,"total_paid" numeric(12, 2) DEFAULT '0',"is_closed" boolean DEFAULT false,"created_at" timestamp DEFAULT now() NOT NULL,"updated_at" timestamp DEFAULT now() NOT NULL);
CREATE TABLE "notification_preference_audit_logs" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"action" varchar(32) NOT NULL,"changed_fields" text NOT NULL,"created_at" timestamp DEFAULT now() NOT NULL);
CREATE TABLE "notification_preferences" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"email_new_loan_request" boolean DEFAULT true NOT NULL,"email_loan_approval" boolean DEFAULT true NOT NULL,"email_loan_rejection" boolean DEFAULT true NOT NULL,"email_payment_reminder" boolean DEFAULT true NOT NULL,"email_payment_confirmation" boolean DEFAULT true NOT NULL,"line_new_loan_request" boolean DEFAULT true NOT NULL,"line_loan_approval" boolean DEFAULT true NOT NULL,"line_loan_rejection" boolean DEFAULT true NOT NULL,"line_payment_reminder" boolean DEFAULT true NOT NULL,"line_payment_confirmation" boolean DEFAULT true NOT NULL,"created_at" timestamp DEFAULT now() NOT NULL,"updated_at" timestamp DEFAULT now() NOT NULL,CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id"));
CREATE TABLE "notifications" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"type" "notification_type" NOT NULL,"message" text NOT NULL,"is_read" boolean DEFAULT false,"sent_via" varchar(50) NOT NULL,"created_at" timestamp DEFAULT now() NOT NULL);
CREATE TABLE "report_download_history" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"format" "export_format" NOT NULL,"reference_code" varchar(64),"approval_request_id" integer,"filter_summary" varchar(1200) DEFAULT '' NOT NULL,"row_count" integer NOT NULL,"created_at" timestamp DEFAULT now() NOT NULL);
CREATE TABLE "report_export_approval_requests" ("id" serial PRIMARY KEY NOT NULL,"requester_id" integer NOT NULL,"format" "export_format" NOT NULL,"row_count" integer NOT NULL,"filter_summary" varchar(1200) DEFAULT '' NOT NULL,"status" "export_approval_status" DEFAULT 'pending' NOT NULL,"reviewed_by_id" integer,"reviewer_note" varchar(500),"expires_at" timestamp NOT NULL,"created_at" timestamp DEFAULT now() NOT NULL,"reviewed_at" timestamp,"consumed_at" timestamp);
CREATE TABLE "report_export_security_events" ("id" serial PRIMARY KEY NOT NULL,"actor_id" integer NOT NULL,"approval_request_id" integer,"type" "security_event_type" NOT NULL,"severity" "security_severity" DEFAULT 'info' NOT NULL,"row_count" integer,"reference_code" varchar(64),"message" varchar(600) NOT NULL,"created_at" timestamp DEFAULT now() NOT NULL);
CREATE TABLE "report_export_security_policy" ("id" integer PRIMARY KEY NOT NULL,"high_volume_row_threshold" integer DEFAULT 500 NOT NULL,"approval_row_threshold" integer DEFAULT 750 NOT NULL,"retention_days" integer DEFAULT 365 NOT NULL,"approval_expires_hours" integer DEFAULT 24 NOT NULL,"alert_owner_on_high_volume" boolean DEFAULT true NOT NULL,"schedule_cron_task_uid" varchar(65),"updated_by_id" integer,"updated_at" timestamp DEFAULT now() NOT NULL);
CREATE TABLE "settings" ("key" varchar(100) PRIMARY KEY NOT NULL,"value" text NOT NULL,"description" varchar(255));
CREATE TABLE "user_dashboard_preferences" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"custom_range_start_date" varchar(10),"custom_range_end_date" varchar(10),"comparison_mode" "comparison_mode" DEFAULT 'matching_period' NOT NULL,"created_at" timestamp DEFAULT now() NOT NULL,"updated_at" timestamp DEFAULT now() NOT NULL,CONSTRAINT "user_dashboard_preferences_user_id_unique" UNIQUE("user_id"));
CREATE TABLE "user_dashboard_preset_categories" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"name" varchar(80) NOT NULL,"color" varchar(16) DEFAULT 'blue' NOT NULL,"icon" varchar(24) DEFAULT 'folder' NOT NULL,"created_at" timestamp DEFAULT now() NOT NULL,"updated_at" timestamp DEFAULT now() NOT NULL);
CREATE TABLE "user_dashboard_preset_category_assignments" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"preset_id" integer NOT NULL,"category_id" integer NOT NULL,"created_at" timestamp DEFAULT now() NOT NULL);
CREATE TABLE "user_dashboard_preset_category_move_history" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"preset_ids" text NOT NULL,"previous_category_ids" text NOT NULL,"destination_category_id" integer,"undone_at" timestamp,"created_at" timestamp DEFAULT now() NOT NULL);
CREATE TABLE "user_dashboard_preset_pins" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"preset_id" integer NOT NULL,"pinned_at" timestamp DEFAULT now() NOT NULL,"sort_order" integer DEFAULT 0 NOT NULL);
CREATE TABLE "user_dashboard_preset_recent_uses" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"preset_id" integer NOT NULL,"last_used_at" timestamp DEFAULT now() NOT NULL,"usage_count" integer DEFAULT 0 NOT NULL);
CREATE TABLE "user_dashboard_range_presets" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"name" varchar(80) NOT NULL,"start_date" varchar(10) NOT NULL,"end_date" varchar(10) NOT NULL,"is_shared" boolean DEFAULT false NOT NULL,"created_at" timestamp DEFAULT now() NOT NULL,"updated_at" timestamp DEFAULT now() NOT NULL);
CREATE TABLE "user_line_tokens" ("id" serial PRIMARY KEY NOT NULL,"user_id" integer NOT NULL,"line_token" varchar(255) NOT NULL,"created_at" timestamp DEFAULT now() NOT NULL,"updated_at" timestamp DEFAULT now() NOT NULL,CONSTRAINT "user_line_tokens_user_id_unique" UNIQUE("user_id"));
CREATE TABLE "users" ("id" serial PRIMARY KEY NOT NULL,"openId" varchar(64) NOT NULL,"name" text,"email" varchar(320),"avatar_url" varchar(2048),"loginMethod" varchar(64),"role" "role" DEFAULT 'borrower' NOT NULL,"createdAt" timestamp DEFAULT now() NOT NULL,"updatedAt" timestamp DEFAULT now() NOT NULL,"lastSignedIn" timestamp DEFAULT now() NOT NULL,CONSTRAINT "users_openId_unique" UNIQUE("openId"));
CREATE UNIQUE INDEX "user_dashboard_preset_categories_user_name_unique" ON "user_dashboard_preset_categories" USING btree ("user_id","name");
CREATE UNIQUE INDEX "user_dashboard_preset_category_assignments_user_preset_unique" ON "user_dashboard_preset_category_assignments" USING btree ("user_id","preset_id");
CREATE INDEX "user_dashboard_preset_category_assignments_user_category_index" ON "user_dashboard_preset_category_assignments" USING btree ("user_id","category_id");
CREATE INDEX "user_dashboard_preset_category_move_history_user_created_index" ON "user_dashboard_preset_category_move_history" USING btree ("user_id","created_at");
CREATE UNIQUE INDEX "user_dashboard_preset_pins_user_preset_unique" ON "user_dashboard_preset_pins" USING btree ("user_id","preset_id");
CREATE UNIQUE INDEX "user_dashboard_preset_recent_uses_user_preset_unique" ON "user_dashboard_preset_recent_uses" USING btree ("user_id","preset_id");
`.trim().split("\n");

export async function bootstrapDatabase(connectionString: string) {
  const runtimeConnectionString = connectionString
    .replace(/([?&])sslmode=[^&]*/i, "$1")
    .replace(/([?&])channel_binding=[^&]*/i, "$1")
    .replace(/[?&]$/, "");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: runtimeConnectionString, max: 1, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const statement of statements) await client.query(statement);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return statements.length;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" || req.query?.run !== "1") {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const connectionString = (process.env.POSTGRES_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL)?.trim();
  if (!connectionString) {
    res.status(503).json({ error: "database_unconfigured" });
    return;
  }
  try {
    const count = await bootstrapDatabase(connectionString);
    res.status(200).json({ success: true, statements: count });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    res.status(500).json({ error: e.code || "migration_failed", detail: String(e.message || "").slice(0, 240) });
  }
}
