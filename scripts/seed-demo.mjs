import pg from "pg";
const { Client } = pg;

if (process.env.ALLOW_DEMO_SEED !== "true") {
  throw new Error("Refusing to seed data. Set ALLOW_DEMO_SEED=true only for a disposable development database.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO users ("openId", name, email, "loginMethod", role)
     VALUES ($1, $2, $3, 'demo', 'admin'), ($4, $5, $6, 'demo', 'lender'), ($7, $8, $9, 'demo', 'borrower')
     ON CONFLICT ("openId") DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role`,
    ["demo-admin", "Demo Admin", "demo-admin@example.invalid", "demo-lender", "Demo Lender", "demo-lender@example.invalid", "demo-borrower", "Demo Borrower", "demo-borrower@example.invalid"]
  );
  const { rows: borrowerRows } = await client.query('SELECT id FROM users WHERE "openId" = $1 LIMIT 1', ["demo-borrower"]);
  const { rows: lenderRows } = await client.query('SELECT id FROM users WHERE "openId" = $1 LIMIT 1', ["demo-lender"]);
  const borrower = borrowerRows[0]; const lender = lenderRows[0];
  if (!borrower?.id || !lender?.id) throw new Error("Demo users were not created");

  const { rows: requestRows } = await client.query(
    `INSERT INTO loan_requests (borrower_id, amount_requested, interest_rate, loan_term_months, interest_type, payment_type, status)
     VALUES ($1, 50000.00, 12.00, 6, 'simple', 'reducing', 'approved') RETURNING id`, [borrower.id]);
  const request = requestRows[0];

  const { rows: loanRows } = await client.query(
    `INSERT INTO loans (request_id, borrower_id, lender_id, principal_amount, interest_rate, loan_term_months, interest_type, payment_type, start_date, next_payment_date, total_paid, is_closed)
     VALUES ($1, $2, $3, 50000.00, 12.00, 6, 'simple', 'reducing', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 month', 0.00, false) RETURNING id`,
    [request.id, borrower.id, lender.id]);
  const loan = loanRows[0];

  const { rows: scheduleRows } = await client.query(
    `INSERT INTO amortization_schedules (loan_id, payment_number, due_date, starting_balance, principal_due, interest_due, total_payment_due, ending_balance, is_paid)
     VALUES ($1, 1, CURRENT_DATE + INTERVAL '1 month', 50000.00, 8333.33, 500.00, 8833.33, 41666.67, false),
            ($1, 2, CURRENT_DATE + INTERVAL '2 months', 41666.67, 8333.33, 416.67, 8750.00, 33333.34, false),
            ($1, 3, CURRENT_DATE + INTERVAL '3 months', 33333.34, 8333.34, 333.33, 8666.67, 25000.00, false)
     RETURNING id ORDER BY payment_number`, [loan.id]);
  const paidSchedule = scheduleRows[0];

  await client.query(
    `INSERT INTO loan_payments (loan_id, schedule_id, amount_paid, payment_method, status, verified_at)
     VALUES ($1, $2, 8833.33, 'promptpay', 'verified', NOW())`, [loan.id, paidSchedule.id]);
  await client.query("UPDATE amortization_schedules SET is_paid = true WHERE id = $1", [paidSchedule.id]);
  await client.query("UPDATE loans SET total_paid = 8833.33 WHERE id = $1", [loan.id]);

  await client.query("COMMIT");
  console.log("Demo users, one approved loan, three schedules, and one verified payment created.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
