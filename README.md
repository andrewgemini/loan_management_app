
## Loan Management System Addendum

ระบบนี้เป็นแอปจัดการเงินกู้ที่ใช้ Manus OAuth, React, tRPC, Drizzle ORM และ MySQL/TiDB โดยแยกบทบาทเป็น `borrower`, `lender` และ `admin` การคำนวณดอกเบี้ยและตารางผ่อนทำบนเซิร์ฟเวอร์ก่อนบันทึก เพื่อให้ผลรวมในหน้าเว็บและไฟล์ CSV ใช้ข้อมูลชุดเดียวกัน

### เส้นทางหลัก

| เส้นทาง | การใช้งาน |
|---|---|
| `/` | หน้าเริ่มต้นและทางเข้าสู่ระบบ |
| `/dashboard` | Dashboard ตามบทบาทผู้ใช้ |
| `/loan/create` | สร้างคำขอกู้ |
| `/loan/:id` | รายละเอียดสัญญา ตารางผ่อน กราฟลดหนี้ และ Export CSV |
| `/payment/:loanId` | PromptPay QR และอัปโหลดสลิป |
| `/settings/notifications` | เปิด/ปิด Email และ LINE ตามเหตุการณ์ |
| `/admin` | Dashboard ผู้ดูแลระบบ การจัดการคำขอ การชำระเงิน และผู้ใช้ |

### ค่าคอนฟิกภายนอก

การส่งอีเมลต้องกำหนด `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` และ `SMTP_FROM` ใน environment ของเซิร์ฟเวอร์ ส่วน LINE token จัดเก็บผ่านหน้า settings ของผู้ใช้และไม่ควรใส่ไว้ใน source code

### Scheduled payment reminder

มี endpoint `POST /api/scheduled/payment-reminders` สำหรับ Heartbeat ซึ่งแจ้งเตือนงวดที่ยังไม่ชำระภายในสามวันข้างหน้าและป้องกันการส่งซ้ำ การสร้าง schedule จริงต้องทำหลัง Publish production ตามคู่มือใน `docs/admin-guide.md`

### Demo data

คำสั่ง `pnpm demo:seed` ใช้ได้เฉพาะฐานข้อมูลพัฒนาที่กำหนด `DATABASE_URL` และควรใช้กับฐานข้อมูลทิ้งได้เท่านั้น สคริปต์มี guard `ALLOW_DEMO_SEED=true` และไม่ถูกเรียกโดยอัตโนมัติ ห้ามใช้กับฐานข้อมูล production

### เอกสารเพิ่มเติม

อ่าน [คู่มือผู้ใช้](docs/user-guide.md), [คู่มือผู้ดูแลระบบ](docs/admin-guide.md) และ [เอกสารตรวจสอบ CSV Export](docs/csvExport-source-review.md) สำหรับรายละเอียด workflow และสัญญาข้อมูล
