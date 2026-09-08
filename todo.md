# Loan Management App TODO

## Phase 1: Database & Schema
- [x] วิเคราะห์ความต้องการและออกแบบโครงสร้างฐานข้อมูล
- [x] สร้างตาราง users (ระบบสมาชิก)
- [x] สร้างตาราง loan_requests (คำขอกู้)
- [x] สร้างตาราง loans (สัญญาเงินกู้)
- [x] สร้างตาราง amortization_schedule (ตารางผ่อนชำระ)
- [x] สร้างตาราง loan_payments (ประวัติการชำระเงิน)
- [x] สร้างตาราง notifications (แจ้งเตือน)
- [x] สร้างตาราง settings (การตั้งค่าระบบ)
- [x] สร้างตาราง notification_preferences (ตั้งค่าแจ้งเตือนส่วนบุคคล)

## Phase 2: Backend Core & tRPC Routers
- [x] สร้าง tRPC routers สำหรับผู้ใช้, คำขอกู้, สัญญา, และการชำระเงิน
- [x] สร้างระบบ auth และ role-based procedure guards (Admin, Lender, Borrower)
- [x] สร้างระบบอัปโหลดสลิปและการจัดเก็บผ่าน S3 storage helpers

## Phase 3: Interest Calculation & Amortization
- [x] สร้างฟังก์ชันคำนวณ Simple Interest และ Compound Interest
- [x] สร้างฟังก์ชันตารางผ่อนชำระทั้งแบบ Fixed Payment และ Reducing Balance
- [x] สร้าง API สำหรับเรียกดูตารางผ่อนชำระและคำนวณค่างวดอัตโนมัติ

## Phase 4: Payment & Notification Systems
- [x] สร้างระบบอัปโหลดสลิปพร้อม PromptPay QR Code
- [x] สร้างระบบแจ้งเตือนผ่าน Email (Nodemailer) และ LINE Notify API
- [x] สร้าง callback Scheduled Reminders สำหรับงวดใกล้ครบกำหนดผ่าน Heartbeat
- [x] จัดทำคู่มือและคำแนะนำสำหรับการตั้งค่า Heartbeat และ Publish บน Production ใน Management UI

## Phase 5: Frontend UX/UI & Admin Dashboard
- [x] พัฒนาหน้า Dashboard สำหรับผู้กู้และผู้ให้กู้ด้วยธีมสีเขียวหรูหรา (Tailwind CSS + Glassmorphism)
- [x] พัฒนาหน้าสร้างคำขอกู้และหน้าดูรายละเอียดสัญญา พร้อมปุ่ม Export CSV (ระบุช่วงวันที่ได้)
- [x] พัฒนาหน้า Admin Dashboard พร้อมกราฟสรุปภาพรวม ตารางคำขอ และการตรวจสอบการชำระเงิน
- [x] พัฒนาหน้าตั้งค่าการแจ้งเตือน (NotificationSettings) ควบคุมช่องทาง Email และ LINE แยกอิสระ

## Phase 6: Testing & Quality Assurance
- [x] เขียนและรัน unit/integration tests ครอบคลุมการคำนวณดอกเบี้ย, CSV export, Email/LINE services, security middleware, OAuth session sync, และ router mutations (approve/reject, payment upload/verify)
- [x] ตรวจสอบ TypeScript check ผ่านสมบูรณ์และรัน production build สำเร็จ

## Feature Enhancements (Filter, Sort & Loading Animation)
- [x] สร้าง skill ทักษะ loan-management-system และส่งมอบผ่าน skill-creator
- [x] เพิ่มฟังก์ชันการกรองและจัดเรียงข้อมูลในตารางประวัติการผ่อนชำระ
- [x] เพิ่ม Loading Animation (Skeleton / Spinners) ในหน้า Admin Dashboard ระหว่างดึงข้อมูลกราฟและสถิติ
- [x] รัน build และ integration tests ยืนยันความถูกต้อง
- [x] ขยาย filter/sort ให้ครอบคลุมรายการประวัติการชำระเงินจริงใน PaymentPage
- [x] รัน pnpm build หลังการเปลี่ยนแปลงล่าสุด
- [x] ยืนยันผล validate ของ reusable skill และบันทึก task setup ในเอกสาร skill

## Export & Pie Chart Enhancements
- [x] เพิ่มปุ่ม Export CSV สำหรับตารางประวัติการผ่อนชำระและประวัติการชำระเงิน
- [x] เพิ่มปุ่ม Export PDF สำหรับตารางประวัติการผ่อนชำระและประวัติการชำระเงิน
- [x] เพิ่ม API/ข้อมูลสรุปสำหรับกราฟวงกลมประเภทสินเชื่อและสถานะการชำระเงิน
- [x] เพิ่มกราฟวงกลมในหน้า Admin Dashboard พร้อม loading และ empty states
- [x] อัปเดต reusable skill และเพิ่ม test/check/build สำหรับฟีเจอร์ใหม่
- [x] ติดตั้ง storage proxy สำหรับโหลดฟอนต์ไทยที่ฝังใน PDF export

## Date Range, Drill-down & Totals Enhancements
- [x] เพิ่มตัวกรองช่วงวันที่สำหรับ Export CSV/PDF ของตารางผ่อนชำระและประวัติการชำระเงิน
- [x] เพิ่ม drill-down เมื่อคลิก Pie Chart เพื่อแสดงรายละเอียดของหมวดข้อมูลที่เลือก
- [x] เพิ่มแถวสรุปยอดรวมในตารางผ่อนชำระ โดยอัปเดตตามข้อมูลที่ผ่านตัวกรอง
- [x] อัปเดต reusable skill และเพิ่ม test/check/build สำหรับฟีเจอร์ใหม่
- [x] เพิ่ม test logic สำหรับช่วงวันที่และยอดรวมของตารางผ่อนชำระ
- [x] เพิ่ม test logic สำหรับช่วงวันที่ของรายงานประวัติการชำระเงิน
- [x] เพิ่ม test render สำหรับ Dialog drill-down ของ Pie Chart
- [x] เพิ่ม test ชุดข้อมูล export ของ PaymentPage ที่ใช้ paymentDate และช่วงวันที่จริง
- [x] เพิ่ม test render ของ Dialog ที่เปิดจาก Pie Chart selection พร้อมรายละเอียดหมวดที่เลือก

## Drill-down Export, Date Presets & Contract Links
- [x] เพิ่มปุ่ม Export CSV สำหรับรายละเอียดที่เลือกใน Pie Chart drill-down
- [x] เพิ่มลิงก์จากรายการ drill-down ไปยังหน้ารายละเอียดสัญญา
- [x] เพิ่ม preset ช่วงวันที่แบบด่วนและแบบบันทึกไว้สำหรับ CSV/PDF reports
- [x] อัปเดต reusable skill สำหรับ Drill-down export, date presets และ contract links พร้อม validate

## Blue Professional Glassmorphism UI & Delivery Package
- [x] แก้ test ที่ค้างจาก mock lucide icons ก่อนปรับ UI
- [x] ปรับ global design system เป็น Blue Professional Glassmorphism พร้อม Dark/Light Mode
- [x] เพิ่ม Fullscreen Toggle, Sidebar Collapse, Breadcrumb และ Avatar/Profile Menu
- [x] เพิ่ม Confirm Dialog สำหรับ Sign out และคง column sorting ในตารางประวัติการผ่อนชำระ/การชำระเงิน
- [x] เปลี่ยน Pie Charts ของ Admin Dashboard ไปใช้ Chart.js พร้อม responsive cards
- [x] ตรวจสอบ mobile หลังปรับ Blue Glassmorphism และ Chart.js พร้อม screenshot ตัวอย่าง
- [x] จัดทำ Project Structure, Database Schema/SQL Import และ ZIP deploy package
- [x] อัปเดต reusable skill สำหรับ Blue Glassmorphism UI และรัน check/test/build รอบสุดท้าย

## Workflow Confirmation, Drill-down PDF & User Profile
- [x] เพิ่ม Confirm Dialog สำหรับอนุมัติ ปฏิเสธ และยืนยันการชำระเงิน
- [x] เพิ่มปุ่ม Export PDF สำหรับข้อมูล Pie Chart drill-down
- [x] สร้างหน้าโปรไฟล์ผู้ใช้สำหรับข้อมูลบัญชีและการตั้งค่าการแสดงผล
- [x] อัปเดต reusable skill และเพิ่ม test/check/build สำหรับฟีเจอร์ใหม่
- [x] เพิ่ม Confirm Dialog ให้ปฏิเสธการชำระเงินและครอบคลุม action การชำระทั้งหมด
- [x] เพิ่ม error handling สำหรับ PDF Drill-down export
- [x] เพิ่มทางไปยังการจัดการบัญชี OAuth จากหน้า Profile โดยใช้ runtime portal URL และ fallback toast

## Activity History, Avatar & Drill-down Search
- [x] ปรับ Activity History ให้ใช้เวลาตัดสินใจและผู้ดำเนินการที่เชื่อถือได้
- [x] เพิ่ม Search Bar ใน Drill-down Dialog และกรองเฉพาะรายการในหมวดที่เลือก
- [x] เพิ่มอัปโหลด/เปลี่ยน Avatar ผ่าน managed storage พร้อม validation และ persistence ระดับบัญชี
- [x] เพิ่ม test เฉพาะ Activity History, Drill-down search, Avatar/Profile และ Homepage แล้วรัน check/test/build
- [x] รีเฟรช Activity History และ Avatar cache หลัง mutation พร้อมเพิ่ม render tests ของ UI

## Homepage Repair
- [x] แทนที่หน้า Example Page ด้วยหน้าเริ่มต้น Loan Management ที่ใช้งานได้จริง
- [x] ตรวจสอบหน้าเริ่มต้นบน desktop และ mobile พร้อม check/test/build

## Activity History Page & Avatar Reset
- [x] สร้างหน้า Activity History สำหรับ Admin พร้อมตัวกรองวันเริ่มต้นและวันสิ้นสุด
- [x] เพิ่ม API ที่ตรวจสิทธิ์ Admin และกรอง Activity History แบบ inclusive ตามช่วงวันที่
- [x] เพิ่มปุ่มลบ Avatar เพื่อคืนค่า fallback เริ่มต้น พร้อมอัปเดต account persistence และ UI cache
- [x] เพิ่ม test สำหรับตัวกรองวันที่ การลบ Avatar และหน้า Activity History แล้วรัน check/test/build
- [x] อัปเดต reusable skill และ validate ผ่าน skill-creator

## Activity History Export, Filters & Avatar Toast
- [x] เพิ่มตัวกรอง Activity History ตามประเภทเหตุการณ์และชื่อผู้ดำเนินการ
- [x] เพิ่มปุ่มส่งออก Activity History ที่ผ่านตัวกรองเป็น CSV และ PDF
- [x] ยืนยันและปรับ Toast notification สำหรับการลบ Avatar ทั้งผลสำเร็จและข้อผิดพลาด
- [x] เพิ่ม test และ responsive QA สำหรับตัวกรอง export และ Avatar Toast
- [x] อัปเดต reusable skill และ validate ผ่าน skill-creator
- [x] เพิ่ม interaction test ยืนยัน CSV/PDF ใช้ Activity History ที่ผ่านตัวกรองจริง
- [x] เพิ่ม test ยืนยัน Avatar remove success/error flow เรียก Toast ที่คาดหวัง

## Saved Activity Filters, Role Filter & Daily Chart
- [x] เพิ่มชุดตัวกรอง Activity History ที่บันทึกและนำกลับมาใช้ได้ในเบราว์เซอร์
- [x] เพิ่มตัวกรองตามบทบาทของผู้ดำเนินการโดยอ้างอิงข้อมูลผู้ใช้ที่ได้รับอนุญาต
- [x] เพิ่มข้อมูลสรุปและกราฟจำนวนกิจกรรมรายวันในหน้า Activity History
- [x] เพิ่ม test สำหรับ preset, role filtering และ daily activity chart พร้อม responsive QA
- [x] อัปเดต reusable skill และ validate ผ่าน skill-creator

## Daily Drill-down, Lender Filter & Account Saved Filters
- [x] เพิ่ม drill-down เมื่อคลิกกราฟกิจกรรมรายวันเพื่อดูรายการของวันนั้น
- [x] เพิ่มตัวกรองตามผู้ให้กู้หรือสาขาจากข้อมูลระบบที่มีจริง
- [x] ย้ายชุดตัวกรอง Activity History ไปบันทึกผูกกับบัญชีผู้ใช้และเรียกใช้ข้ามอุปกรณ์
- [x] เพิ่ม schema/migration, API authorization และ tests สำหรับ saved filters ระดับบัญชี
- [x] เพิ่ม test และ responsive QA สำหรับ daily drill-down กับตัวกรองใหม่
- [x] อัปเดต reusable skill และ validate ผ่าน skill-creator
- [x] ตรวจทาน final report ให้แนบ checkpoint เป็นหลัก และแนบ skill เฉพาะเมื่อผู้ใช้ร้องขอ reusable skill โดยตรง

## Full Menu & Functionality Audit Recovery
- [x] กู้คืน route fallbacks สำหรับหน้า Home, Create Loan, Dashboard, Loan Detail และ Payment
- [x] เสริม role และ ownership guards ของ Email/LINE notification โดยยึดข้อมูล request จริงจากฐานข้อมูล
- [x] เพิ่ม regression tests สำหรับ notification ownership และหน้า access/error fallback
- [x] ตรวจ role matrix ของ Loan Router สำหรับ request, contract, payment, report และ profile flows
- [x] ตรวจ responsive desktop, tablet และ mobile ของทุกเส้นทางหลัก รวม Loan Detail และ Payment
- [x] รัน check, test, build และอัปเดต reusable skill ด้วย audit checklist ก่อน checkpoint

## Notification Settings Performance, Audit & Resilience
- [x] ตรวจ dependency graph และจุดโหลด PDF/Chart เพื่อออกแบบ code-splitting ที่ไม่กระทบ workflow export และ analytics
- [x] เพิ่ม schema/migration และ backend audit log สำหรับการอ่านและแก้ไข Notification Settings โดยผูกกับบัญชีผู้ใช้งาน
- [x] เพิ่ม protected APIs และ tests สำหรับ audit log การตั้งค่าการแจ้งเตือน
- [x] ทำ lazy loading สำหรับ PDF exports และ Chart.js พร้อมตรวจ initial bundle
- [x] เพิ่ม loading animation, retry path และ error state ที่เข้าถึงได้ใน Notification Settings
- [x] อัปเดต reusable loan-management-system skill ด้วยแนวทาง performance, audit log และ resilient settings UI
- [x] รัน check, full tests, build และ responsive QA ก่อน checkpoint

## Admin Audit Logs, Virtualization & Chart Prefetch
- [x] ตรวจ schema, router, navigation และ chart chunks ที่มีอยู่เพื่อออกแบบ Admin Audit Logs อย่างปลอดภัย
- [x] เพิ่ม protected Admin API สำหรับ Audit Logs พร้อมตัวกรองวันที่/ประเภทและการเรียงลำดับแบบมี limit
- [x] สร้างหน้า Admin Audit Logs พร้อม filter, sort, loading/empty/error/unauthorized states
- [x] ทำ virtualized list สำหรับ Audit Logs ที่ยาว พร้อมทดสอบ row window และการเลื่อน
- [x] เพิ่ม prefetch route/component Chart เมื่อ pointer/focus ที่เมนู Admin โดยไม่กระทบผู้ใช้คีย์บอร์ด
- [x] เพิ่ม tests, responsive QA, build และอัปเดต reusable skill ก่อน checkpoint

## Audit Log Export, Search & Details
- [x] ตรวจ Admin Audit Logs API และ utilities เพื่อรองรับ search, CSV export และรายละเอียดโดยไม่เปิดเผยข้อมูลลับ
- [x] ขยาย protected Admin API ให้ค้นหาจากชื่อหรืออีเมลโดยใช้ผลลัพธ์เดียวกับ filters/sort
- [x] เพิ่ม CSV export ที่ใช้ Audit Logs หลังกรอง/ค้นหา/เรียงลำดับ พร้อม UTF-8 BOM และ header ที่อ่านได้
- [x] เพิ่ม search control, export feedback และ Detail Modal/row action ในหน้า Admin Audit Logs
- [x] เพิ่ม tests สำหรับ authorization, search, CSV payload และ detail interaction รวม responsive QA
- [x] อัปเดต reusable skill และรัน check, full tests, build ก่อน checkpoint

## Audit Log Debounce, Highlight, PDF & Date Range
- [x] ตรวจ search/export/date controls เดิมและเลือก utility ที่ใช้ซ้ำได้โดยไม่สร้างข้อมูลซ้ำ
- [x] เพิ่ม debounce และ highlight คำค้นหาใน Audit Log rows/รายละเอียดโดยคง server-side search ที่ปลอดภัย
- [x] เพิ่ม date range picker ที่ preset ช่วงเวลาและ sync กับ query/export filters เดิม
- [x] เพิ่ม PDF export จากผล Audit Logs หลังกรอง/ค้นหา/เรียงลำดับ พร้อม Thai font และ metadata ที่ปลอดภัย
- [x] เพิ่ม tests สำหรับ debounce, highlight, date range และ PDF export พร้อม responsive QA
- [x] อัปเดต reusable skill และรัน check, full tests, build ก่อน checkpoint

## Audit Log Presets, Filter Chips & Verified PDF
- [x] ตรวจ Date Range Picker, filter state และ PDF export เดิมเพื่อขยายโดยใช้ผลลัพธ์เดียวกัน
- [x] เพิ่ม preset วันนี้ สัปดาห์นี้ และเดือนนี้ใน Date Range Picker โดยคง inclusive server filtering
- [x] เพิ่ม Active Filter Chips สำหรับช่วงวันที่ ประเภท คำค้นหา และการเรียงลำดับ พร้อมลบรายเงื่อนไขได้
- [x] เพิ่ม Reference Code และลายน้ำใน PDF Audit Logs โดยไม่เปิดเผยข้อมูลลับ
- [x] เพิ่ม tests สำหรับ presets, chips, PDF metadata/watermark และ responsive QA
- [x] อัปเดต reusable skill และรัน check, full tests, build ก่อน checkpoint

## Report Verification, Export Permissions & Download History
- [x] ตรวจ schema audit exports และบทบาทปัจจุบันเพื่อออกแบบ reference lookup และ permission policy อย่างปลอดภัย
- [x] เพิ่ม protected APIs สำหรับค้นหา Reference Code, บันทึก download history และตรวจสิทธิ์ export ต่อบัญชี
- [x] เพิ่มการจัดการสิทธิ์ export แบบละเอียดสำหรับผู้ดูแล โดยไม่ให้ role อื่นเข้าถึงข้อมูลละเอียดอ่อน
- [x] สร้างหน้า/ส่วนตรวจสอบ Reference Code และประวัติการดาวน์โหลดเฉพาะผู้ดูแลแต่ละคน
- [x] เพิ่ม tests สำหรับ role permissions, reference lookup, history scope และ responsive QA
- [x] อัปเดต reusable skill และรัน check, full tests, build ก่อน checkpoint

## Export Security Alerts, Retention & Approval Workflow
- [x] ตรวจ report governance, notification channel และ Heartbeat capability เพื่อกำหนด alert/retention workflow ที่ปลอดภัย
- [x] เพิ่ม schema และ policy สำหรับ threshold export, อายุเก็บ history และคำขออนุมัติข้อมูลระดับสูง
- [x] เพิ่ม server-side anomaly alert, approval request/decision และ permission gates ที่ตรวจสอบซ้ำทุก action
- [x] เพิ่ม retention cleanup ที่ idempotent พร้อม scheduled handler และขั้นตอนเปิดใช้งานหลังเผยแพร่
- [x] สร้างหน้า policy/approval queue พร้อม loading, empty, error, unauthorized states
- [x] เพิ่ม tests สำหรับ threshold, approval, retention, role scope และ responsive QA
- [x] อัปเดต reusable skill และรัน check, full tests, build ก่อน checkpoint

## Governance Analytics & Approval In-App Notifications
- [x] ตรวจข้อมูล security event, download history และ notification model เพื่อกำหนด aggregate ที่ปลอดภัย
- [x] เพิ่ม protected analytics API สำหรับแนวโน้ม export และสถิติ security event จากข้อมูลจริง
- [x] สร้าง in-app notification สำหรับผู้มีสิทธิ์อนุมัติเมื่อมีคำขอ export ระดับสูง โดยไม่แจ้งผู้ขอเอง
- [x] เพิ่มกราฟ governance และสถานะแจ้งเตือนในหน้า Report Governance แบบ responsive
- [x] เพิ่ม tests สำหรับ analytics, recipient scope, read state และ UI loading/empty/error
- [x] อัปเดต reusable skill, รัน QA และบันทึก checkpoint
- [x] เปิด retention cleanup รายวันหลังผู้ใช้เผยแพร่ระบบและยืนยัน deployment

## Professional Dashboard Analytics Refresh
- [x] ตรวจ Dashboard, aggregate APIs, chart components และภาพอ้างอิงเพื่อกำหนด dashboard layout จากข้อมูลจริง
- [x] เพิ่ม KPI summary และกราฟแนวโน้ม/สัดส่วน/ความคืบหน้าจากข้อมูล loan และ payment ที่ได้รับอนุญาต
- [x] ปรับ Admin Dashboard เป็น responsive professional planning layout โดยไม่สร้างข้อมูลตัวอย่าง
- [x] เพิ่ม tests สำหรับ analytics contracts, chart states และ QA desktop/tablet/mobile
- [x] อัปเดต reusable skill, รัน check/test/build และบันทึก checkpoint
- [x] เปิด retention cleanup รายวันหลัง checkpoint นี้ถูกเผยแพร่

## Dashboard Time Filters, Drill-down & Chart Export
- [x] ตรวจ query analytics, chart components และ export utilities เพื่อกำหนด time filter และ data scope ที่ปลอดภัย
- [x] เพิ่มตัวกรองช่วงเวลา 7 วัน, 30 วัน และ 90 วันสำหรับแนวโน้ม Dashboard
- [x] เพิ่ม KPI cards ที่เปิด modal รายละเอียดรายการสัญญาหรือการชำระที่เกี่ยวข้องจากข้อมูลจริง
- [x] เพิ่ม tooltip ที่เข้าถึงได้และปุ่ม export กราฟเป็น PDF หรือ PNG โดยไม่ส่งออกข้อมูลนอกขอบเขตสิทธิ์
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Custom Range, KPI CSV & Trend Indicators
- [x] ตรวจ contracts analytics และข้อมูลช่วงก่อนหน้าเพื่อกำหนด custom range และ comparison ที่ตรวจสอบได้
- [x] เพิ่ม Custom Date Range พร้อม validation และ daily trend ที่เติมวันไม่มีข้อมูลจากข้อมูลจริง
- [x] เพิ่ม CSV export สำหรับรายละเอียด KPI Modal โดยใช้เฉพาะรายการที่ได้รับอนุญาตและกำลังแสดง
- [x] เพิ่มลูกศร สี และเปอร์เซ็นต์เปรียบเทียบ KPI กับช่วงก่อนหน้าที่มีระยะเวลาเท่ากัน
- [x] เพิ่ม tests, responsive QA, อัปเดต reusable skill และบันทึก checkpoint

## Dashboard Account Preferences, Comparison Mode & Loading Feedback
- [x] ตรวจ schema/preferences และ dashboard query contracts เพื่อออกแบบค่าเริ่มต้น Custom Range ต่อบัญชีอย่างปลอดภัย
- [x] เพิ่ม schema, migration และ protected API สำหรับบันทึก/อ่าน Custom Date Range default รายบัญชี
- [x] เพิ่ม comparison dropdown สำหรับช่วงก่อนหน้าที่เท่ากัน เดือนก่อน หรือไตรมาสก่อน โดยคำนวณ server-side
- [x] เพิ่ม skeleton/loading/disabled feedback สำหรับ Custom Date Range refresh และ KPI CSV export
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Reset, Named Presets & KPI Transitions
- [x] ตรวจ schema preferences, named preset patterns และ KPI rendering ก่อนออกแบบ reset/preset/animation workflow
- [x] เพิ่ม schema, migration และ owner-scoped APIs สำหรับ Custom Date Range presets ที่ตั้งชื่อและจัดการได้หลายชุด
- [x] เพิ่มปุ่มรีเซ็ตค่าเริ่มต้น Dashboard ที่ล้างเฉพาะ preferences ของบัญชีที่ใช้งาน
- [x] เพิ่ม preset controls และ KPI number transition ที่เคารพ reduced-motion preference
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Search, Sharing & Feedback
- [x] ตรวจ schema, authorization และ preset controls เพื่อกำหนด search/sort/share behavior ที่ปลอดภัย
- [x] เพิ่ม schema, migration และ protected APIs สำหรับแชร์ preset ให้ทีม Admin และควบคุมสิทธิ์แก้ไข
- [x] เพิ่มการค้นหาและจัดเรียง preset จากข้อมูลที่บัญชีมีสิทธิ์มองเห็น
- [x] เพิ่ม UI แชร์/ยกเลิกแชร์ และ Toast feedback ที่ชัดเจนสำหรับบันทึก ลบ รีเซ็ต และแชร์ preset
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Scope Filter & Metadata
- [x] ตรวจ contract และข้อมูลผู้สร้างที่อนุญาตให้แสดงสำหรับ Preset ส่วนตัว/ทีม
- [x] เพิ่ม server-side scope filter และข้อมูลชื่อผู้สร้าง/เวลาแก้ไขล่าสุดใน preset API
- [x] เพิ่ม UI filter ส่วนตัว/ของทีม และแสดง metadata ที่ responsive/accessibility-friendly
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Copy, Creator Filter & Recent Use
- [x] ตรวจ schema/contracts เพื่อออกแบบการคัดลอก Preset ทีมและ recent-use tracking ที่ owner-scoped
- [x] เพิ่ม protected APIs สำหรับ copy ทีมเป็นส่วนตัว, creator filter และบันทึก/อ่าน Preset ที่ใช้ล่าสุด
- [x] เพิ่ม UI คัดลอก, ค้นหาตามผู้สร้าง และรายการ Preset ล่าสุดแบบ responsive
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Pins, Copy Confirmation & Recent Clear
- [x] ตรวจ schema/contracts เพื่อกำหนด pin และการล้าง recent history ที่ผูกเฉพาะบัญชี
- [x] เพิ่ม protected APIs สำหรับ pin/unpin และ clear recent history แบบ owner-scoped
- [x] เพิ่ม UI ปักหมุด, Confirmation Dialog ก่อนคัดลอก และปุ่มล้างประวัติล่าสุดแบบ responsive
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Pin Ordering, Bulk Unpin & Usage Stats
- [x] ตรวจ schema/contracts เพื่อออกแบบลำดับหมุดและสถิติการใช้ต่อบัญชีอย่างปลอดภัย
- [x] เพิ่ม protected APIs สำหรับ reorder pins, unpin ทั้งหมด และสถิติความถี่การใช้ Preset
- [x] เพิ่ม UI drag-and-drop, Confirmation Dialog สำหรับ unpin ทั้งหมด และ usage statistics แบบ responsive
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Pin Ordering Undo
- [x] ตรวจ contract เพื่อกำหนดการคืนลำดับหมุดเฉพาะบัญชีอย่างปลอดภัย
- [x] เพิ่ม API และ state สำหรับคืนลำดับ Preset ที่ปักหมุดก่อนหน้าการจัดเรียง
- [x] เพิ่มปุ่ม Undo, pending state และ feedback แบบ responsive
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Multi-Step Undo & Default Ordering
- [x] ตรวจ contract เพื่อกำหนด multi-step Undo และ reset ลำดับหมุดเฉพาะบัญชีอย่างปลอดภัย
- [x] เพิ่ม protected API สำหรับรีเซ็ตลำดับหมุดเป็นค่าเริ่มต้น
- [x] เพิ่ม UI ประวัติ Undo หลายขั้น ปุ่ม reset ordering และ Toast feedback
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Redo, Usage Ordering & Pinned Search
- [x] ตรวจ contract สำหรับ Redo หลายขั้น การเรียงหมุดตาม usage และ pinned search ที่ปลอดภัย
- [x] เพิ่ม protected API สำหรับเรียง Preset หมุดตามความถี่การใช้ของบัญชี
- [x] เพิ่ม UI Redo หลายขั้น จัดเรียงตาม usage และค้นหา Preset ที่ปักหมุดแบบ responsive
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Creator Filter & Categories
- [x] ตรวจ contract และออกแบบหมวดหมู่ Preset แบบต่อบัญชีโดยไม่แก้ข้อมูล Preset ต้นทาง
- [x] เพิ่ม schema, migration และ protected APIs สำหรับหมวดหมู่/การจัด Preset พร้อม creator filter
- [x] เพิ่ม UI ตัวกรองผู้สร้างและโฟลเดอร์หมวดหมู่ Preset ที่ปักหมุดแบบ responsive
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Folder Appearance & Bulk Move
- [x] ตรวจ schema, contracts และ UI ปัจจุบันเพื่อกำหนดสี/ไอคอนแบบ allowlist และ bulk move ที่ owner-scoped
- [x] เพิ่ม schema, migration และ protected APIs สำหรับ metadata โฟลเดอร์และย้าย Preset หลายรายการ
- [x] เพิ่ม UI เลือกสี/ไอคอนโฟลเดอร์ และเลือก Preset หลายรายการเพื่อย้ายแบบ responsive
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Folder Rename, Counts & Drag Move
- [x] ตรวจ contract โฟลเดอร์และ DnD เพื่อกำหนด rename, assignment counts และ bulk drag move ที่ owner-scoped
- [x] เพิ่ม protected API สำหรับเปลี่ยนชื่อโฟลเดอร์และดึงตัวนับ Preset ต่อโฟลเดอร์
- [x] เพิ่ม UI rename, count badges และ drop targets สำหรับลาก Preset หลายรายการเข้าโฟลเดอร์
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Folder Selection, Sorting & Move Confirmation
- [x] ตรวจ workflow selection, folder count sorting และ bulk move เพื่อกำหนด confirmation safeguards
- [x] เพิ่ม UI ล้าง selection และเรียงโฟลเดอร์ตามจำนวน Preset แบบมากไปน้อย/น้อยไปมาก
- [x] เพิ่ม Confirmation Dialog สำหรับยืนยันการย้าย Preset หลายรายการก่อนส่ง bulk mutation
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Folder Filters, Move History & Undo
- [x] ตรวจ schema และ workflow การจัดโฟลเดอร์เพื่อกำหนดประวัติการย้ายและ Undo แบบ owner-scoped
- [x] เพิ่ม schema, migration และ protected APIs สำหรับประวัติการย้าย Preset และ Undo ล่าสุด
- [x] เพิ่ม UI ตัวกรองโฟลเดอร์ว่าง ค้นหาตามชื่อ ประวัติการย้าย และปุ่ม Undo แบบ responsive
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## Dashboard Preset Folder Appearance Filters, Move Redo & CSV
- [x] ตรวจ contract ตัวกรองสี/ไอคอน ประวัติการย้าย และ CSV export เพื่อกำหนด Redo แบบ owner-scoped
- [x] เพิ่ม protected APIs สำหรับ Redo การย้ายล่าสุดและ CSV metadata ของประวัติการย้าย
- [x] เพิ่ม UI ตัวกรองสี/ไอคอน ปุ่ม Redo และ CSV export แบบ responsive
- [x] เพิ่ม tests, responsive QA, reusable skill validation และ checkpoint

## System UAT & Thai User Guide
- [x] กำหนด test matrix UAT ตามบทบาท Borrower, Lender และ Admin ครอบคลุม flows หลัก
- [x] ดำเนินการ UAT ผ่าน automated regression, route/access review และ responsive smoke checks
- [x] บันทึกผล UAT และแก้ไข regression หรือ usability issue ที่พบ
- [x] จัดทำคู่มือการใช้งานภาษาไทยตามบทบาทและตรวจทานความครบถ้วน
- [x] รัน final validation, บันทึก checkpoint และส่งมอบผล UAT กับคู่มือ
