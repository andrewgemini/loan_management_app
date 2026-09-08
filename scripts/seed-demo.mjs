import mysql from "mysql2/promise";

if (process.env.ALLOW_DEMO_SEED !== "true") {
  throw new Error("Refusing to seed data. Set ALLOW_DEMO_SEED=true only for a disposable development database.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  await connection.beginTransaction();

  await connection.execute(
    `INSERT INTO users (openId, name, email, loginMethod, role)
     VALUES (?, ?, ?, 'demo', 'admin'), (?, ?, ?, 'demo', 'lender'), (?, ?, ?, 'demo', 'borrower')
     ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), role = VALUES(role)`,
    [
      "demo-admin", "Demo Admin", "demo-admin@example.invalid",
      "demo-lender", "Demo Lender", "demo-lender@example.invalid",
      "demo-borrower", "Demo Borrower", "demo-borrower@example.invalid",
    ]
  );

  const [[borrower]] = await connection.query("SELECT id FROM users WHERE openId = 'demo-borrower' LIMIT 1");
  const [[lender]] = await connection.query("SELECT id FROM users WHERE openId = 'demo-lender' LIMIT 1");
  if (!borrower?.id || !lender?.id) throw new Error("Demo users were not created");

  await connection.execute(
    `INSERT INTO loan_requests (borrower_id, amount_requested, interest_rate, loan_term_months, interest_type, payment_type, status)
     VALUES (?, 50000.00, 12.00, 6, 'simple', 'reducing', 'approved')`,
    [borrower.id]
  );
  const [[request]] = await connection.query("SELECT id FROM loan_requests WHERE borrower_id = ? ORDER BY id DESC LIMIT 1", [borrower.id]);

  await connection.execute(
    `INSERT INTO loans (request_id, borrower_id, lender_id, principal_amount, interest_rate, loan_term_months, interest_type, payment_type, start_date, next_payment_date, total_paid, is_closed)
     VALUES (?, ?, ?, 50000.00, 12.00, 6, 'simple', 'reducing', CURRENT_DATE, DATE_ADD(CURRENT_DATE, INTERVAL 1 MONTH), 0.00, 0)`,
    [request.id, borrower.id, lender.id]
  );
  const [[loan]] = await connection.query("SELECT id FROM loans WHERE request_id = ? ORDER BY id DESC LIMIT 1", [request.id]);

  await connection.execute(
    `INSERT INTO amortization_schedules (loan_id, payment_number, due_date, starting_balance, principal_due, interest_due, total_payment_due, ending_balance, is_paid)
     VALUES (?, 1, DATE_ADD(CURRENT_DATE, INTERVAL 1 MONTH), 50000.00, 8333.33, 500.00, 8833.33, 41666.67, 0),
            (?, 2, DATE_ADD(CURRENT_DATE, INTERVAL 2 MONTH), 41666.67, 8333.33, 416.67, 8750.00, 33333.34, 0),
            (?, 3, DATE_ADD(CURRENT_DATE, INTERVAL 3 MONTH), 33333.34, 8333.34, 333.33, 8666.67, 25000.00, 0)`,
    [loan.id, loan.id, loan.id]
  );
  const [[paidSchedule]] = await connection.query("SELECT id FROM amortization_schedules WHERE loan_id = ? AND payment_number = 1 LIMIT 1", [loan.id]);
  await connection.execute(
    `INSERT INTO loan_payments (loan_id, schedule_id, amount_paid, payment_method, status, verified_at)
     VALUES (?, ?, 8833.33, 'promptpay', 'verified', NOW())`,
    [loan.id, paidSchedule.id]
  );
  await connection.execute("UPDATE amortization_schedules SET is_paid = 1 WHERE id = ?", [paidSchedule.id]);
  await connection.execute("UPDATE loans SET total_paid = 8833.33 WHERE id = ?", [loan.id]);

  await connection.commit();
  console.log("Demo users, one approved loan, three schedules, and one verified payment created.");
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
