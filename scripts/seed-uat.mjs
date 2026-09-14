import pg from "pg";
const { Client } = pg;

if (process.env.ALLOW_UAT_SEED !== "true") {
  throw new Error("Refusing to seed UAT data. Set ALLOW_UAT_SEED=true only for an approved UAT database.");
}

const connectionString = process.env.UAT_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("UAT_DATABASE_URL or DATABASE_URL is required");

const runtimeConnectionString = connectionString
  .replace(/([?&])sslmode=[^&]*/i, "$1")
  .replace(/([?&])channel_binding=[^&]*/i, "$1")
  .replace(/[?&]$/, "");

const client = new Client({
  connectionString: runtimeConnectionString,
  ssl: { rejectUnauthorized: false },
});

const users = {
  admin: ["uat-admin", "UAT Admin", "uat-admin@example.invalid", "admin"],
  lender: ["uat-lender", "UAT Lender", "uat-lender@example.invalid", "lender"],
  borrower: ["uat-borrower", "UAT Borrower", "uat-borrower@example.invalid", "borrower"],
  borrower2: ["uat-borrower-2", "UAT Borrower 2", "uat-borrower-2@example.invalid", "borrower"],
};

await client.connect();
try {
  await client.query("BEGIN");

  const ids = {};
  for (const [key, [openId, name, email, role]] of Object.entries(users)) {
    const result = await client.query(
      `INSERT INTO users ("openId", name, email, "loginMethod", role)
       VALUES ($1, $2, $3, 'uat', $4)
       ON CONFLICT ("openId") DO UPDATE
       SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role, "loginMethod" = 'uat', "updatedAt" = NOW()
       RETURNING id`,
      [openId, name, email, role]
    );
    ids[key] = result.rows[0].id;
  }

  for (const userId of Object.values(ids)) {
    await client.query(
      `INSERT INTO notification_preferences (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
  }

  await client.query(
    `INSERT INTO notification_preferences (
       user_id, email_new_loan_request, email_loan_approval, email_loan_rejection,
       email_payment_reminder, email_payment_confirmation,
       line_new_loan_request, line_loan_approval, line_loan_rejection,
       line_payment_reminder, line_payment_confirmation
     ) VALUES ($1, true, true, true, true, true, true, true, true, true, true)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()`,
    [ids.borrower]
  );

  const requestRows = await client.query(
    `INSERT INTO loan_requests (borrower_id, amount_requested, interest_rate, loan_term_months, interest_type, payment_type, status, approved_by_id, approved_at, decided_at)
     VALUES
       ($1, 50000.00, 12.00, 6, 'simple', 'reducing', 'approved', $2, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
       ($1, 120000.00, 10.50, 12, 'simple', 'fixed', 'pending', NULL, NULL, NULL),
       ($3, 80000.00, 9.75, 12, 'compound', 'reducing', 'rejected', $2, NULL, NOW() - INTERVAL '5 days')
     RETURNING id, borrower_id, status
     ORDER BY id DESC
     LIMIT 3`,
    [ids.borrower, ids.lender, ids.borrower2]
  );

  const approvedRequest = requestRows.rows.find((row) => row.status === "approved");
  if (!approvedRequest) throw new Error("UAT approved request was not created");

  const existingLoan = await client.query(
    `SELECT id FROM loans WHERE request_id = $1 LIMIT 1`,
    [approvedRequest.id]
  );

  let loanId;
  if (existingLoan.rows[0]) {
    loanId = existingLoan.rows[0].id;
  } else {
    const loan = await client.query(
      `INSERT INTO loans (request_id, borrower_id, lender_id, principal_amount, interest_rate, loan_term_months, interest_type, payment_type, start_date, next_payment_date, total_paid, is_closed)
       VALUES ($1, $2, $3, 50000.00, 12.00, 6, 'simple', 'reducing', CURRENT_DATE - 30, CURRENT_DATE + 1, 8833.33, false)
       RETURNING id`,
      [approvedRequest.id, ids.borrower, ids.lender]
    );
    loanId = loan.rows[0].id;
  }

  const scheduleRows = await client.query(
    `SELECT id FROM amortization_schedules WHERE loan_id = $1 ORDER BY payment_number`,
    [loanId]
  );

  if (scheduleRows.rows.length === 0) {
    await client.query(
      `INSERT INTO amortization_schedules (loan_id, payment_number, due_date, starting_balance, principal_due, interest_due, total_payment_due, ending_balance, is_paid)
       VALUES
         ($1, 1, CURRENT_DATE - 1, 50000.00, 8333.33, 500.00, 8833.33, 41666.67, true),
         ($1, 2, CURRENT_DATE + 30, 41666.67, 8333.33, 416.67, 8750.00, 33333.34, false),
         ($1, 3, CURRENT_DATE + 60, 33333.34, 8333.34, 333.33, 8666.67, 25000.00, false)`,
      [loanId]
    );
  }

  const firstSchedule = await client.query(
    `SELECT id FROM amortization_schedules WHERE loan_id = $1 AND payment_number = 1 LIMIT 1`,
    [loanId]
  );

  if (firstSchedule.rows[0]) {
    await client.query(
      `INSERT INTO loan_payments (loan_id, schedule_id, amount_paid, payment_method, status, verified_by_id, verified_at)
       SELECT $1, $2, 8833.33, 'promptpay', 'verified', $3, NOW() - INTERVAL '2 days'
       WHERE NOT EXISTS (
         SELECT 1 FROM loan_payments WHERE loan_id = $1 AND schedule_id = $2
       )`,
      [loanId, firstSchedule.rows[0].id, ids.admin]
    );
  }

  await client.query(
    `INSERT INTO notifications (user_id, type, message, is_read, sent_via)
     SELECT * FROM (VALUES
       ($1, 'loan_approved'::notification_type, 'UAT: คำขอกู้ #1 ได้รับการอนุมัติ', false, 'in-app'),
       ($1, 'payment_due'::notification_type, 'UAT: มีรายการชำระเงินใกล้ครบกำหนด', false, 'in-app'),
       ($2, 'loan_status'::notification_type, 'UAT: มีคำขอกู้ใหม่รอตรวจสอบ', false, 'in-app')
     ) AS v(user_id, type, message, is_read, sent_via)
     WHERE NOT EXISTS (
       SELECT 1 FROM notifications n WHERE n.user_id = v.user_id AND n.message = v.message
     )`,
    [ids.borrower, ids.lender]
  );

  await client.query(
    `INSERT INTO notification_preference_audit_logs (user_id, action, changed_fields)
     SELECT $1, 'update', 'emailPaymentReminder,linePaymentReminder'
     WHERE NOT EXISTS (
       SELECT 1 FROM notification_preference_audit_logs
       WHERE user_id = $1 AND changed_fields = 'emailPaymentReminder,linePaymentReminder'
     )`,
    [ids.borrower]
  );

  await client.query("COMMIT");
  console.log("UAT seed complete: 4 users, 3 loan requests, 1 loan, schedules, payment, notifications, preferences, and audit data.");
  console.log("Login identities: uat-admin / uat-lender / uat-borrower / uat-borrower-2");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
