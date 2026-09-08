# Test Matrix

ชุดทดสอบอัตโนมัติในโฟลเดอร์ `server/` ครอบคลุม logic ที่ไม่ต้องเชื่อมต่อบริการภายนอกจริง ได้แก่ CSV date filtering, CSV escaping, role guard และ empty state ของ Admin Dashboard, Email fallback/template, LINE send/verify/revoke ที่ mock Axios, NotificationSettings render states, security middleware และการคำนวณดอกเบี้ยกับตารางผ่อน

| Workflow | วิธีตรวจสอบ | สถานะ |
|---|---|---|
| OAuth session และ role guard | `canAccessAdminDashboard` และ protected procedures | ผ่าน |
| สร้างคำขอกู้ | zod input validation และ `loanRouter.createRequest` | ผ่านการ compile; ควรทดสอบกับ DB พัฒนาก่อน production |
| อนุมัติ/ปฏิเสธ | Admin action procedures และ role checks | ผ่านการ compile; UI action มี success/error toast |
| คำนวณดอกเบี้ย | `loanCalculations.test.ts` | ผ่าน |
| Upload สลิป | MIME, base64, ขนาดไฟล์ และ storage path validation | ผ่านการ compile; ควรทดสอบ storage integration ใน environment จริง |
| ตรวจสอบการชำระ | verify/reject procedures และ Admin action | ผ่านการ compile; UI action มี refresh |
| Export CSV | `csvExport.test.ts` | ผ่าน |
| Email | `emailService.test.ts` mock transporter และ fallback | ผ่าน |
| LINE Notify | `lineNotifyService.test.ts` mock Axios | ผ่าน |
| Notification settings | `notificationSettings.render.test.ts` | ผ่าน |
| Admin Dashboard | render/utility tests และ production build | ผ่าน |

รันคำสั่ง `pnpm check`, `pnpm test -- --run` และ `pnpm build` ก่อนส่งมอบทุกครั้ง ชุดข้อมูลสาธิตสร้างได้ด้วย `pnpm demo:seed` เฉพาะฐานข้อมูลพัฒนาเมื่อกำหนด `ALLOW_DEMO_SEED=true` เท่านั้น
