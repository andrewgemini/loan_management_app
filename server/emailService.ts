import nodemailer from "nodemailer";

/**
 * Email Service สำหรับส่งอีเมลแจ้งเตือน
 * ใช้ SMTP server สำหรับส่งอีเมล
 */

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let transporter: nodemailer.Transporter | null = null;

/**
 * Initialize email transporter
 */
export function resetEmailService() {
  transporter = null;
}

export function initializeEmailService(config: EmailConfig) {
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.auth.user,
      pass: config.auth.pass,
    },
  });
}

/**
 * Send email
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
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
      text: options.text,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent to ${options.to}:`, result.messageId);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send email:", error);
    return false;
  }
}

/**
 * Email template สำหรับคำขอกู้ใหม่ (ส่งให้ Lender/Admin)
 */
export function getNewLoanRequestEmailTemplate(
  lenderName: string,
  borrowerName: string,
  loanAmount: string,
  interestRate: string,
  loanTermMonths: number,
  requestId: number,
  dashboardUrl: string
): string {
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
          <h1>📋 คำขอกู้ยืมเงินใหม่</h1>
        </div>
        
        <div class="content">
          <div class="greeting">
            <p>สวัสดี ${lenderName},</p>
            <p>มีคำขอกู้ยืมเงินใหม่เข้ามาในระบบ กรุณาตรวจสอบและอนุมัติ/ปฏิเสธตามความเหมาะสม</p>
          </div>
          
          <div class="loan-details">
            <h3>📊 รายละเอียดคำขอกู้</h3>
            <div class="detail-row">
              <span class="detail-label">ชื่อผู้กู้:</span>
              <span class="detail-value">${borrowerName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">จำนวนเงินที่ขอ:</span>
              <span class="detail-value">฿${loanAmount}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">อัตราดอกเบี้ยต่อปี:</span>
              <span class="detail-value">${interestRate}%</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">ระยะเวลาผ่อน:</span>
              <span class="detail-value">${loanTermMonths} เดือน</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">เลขที่คำขอ:</span>
              <span class="detail-value">#${requestId}</span>
            </div>
          </div>
          
          <div class="warning">
            ⚠️ <strong>หมายเหตุ:</strong> กรุณาตรวจสอบข้อมูลผู้กู้และเงื่อนไขการกู้อย่างรอบคอบก่อนอนุมัติ
          </div>
          
          <div style="text-align: center;">
            <a href="${dashboardUrl}" class="cta-button">ไปยัง Dashboard เพื่อตรวจสอบ</a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            หากคุณไม่ได้ทำการขอกู้นี้ กรุณาติดต่อผู้ดูแลระบบทันที
          </p>
        </div>
        
        <div class="footer">
          <p>© 2024 Loan Management System. All rights reserved.</p>
          <p>อีเมลนี้ถูกส่งโดยอัตโนมัติจากระบบ กรุณาไม่ตอบกลับ</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Email template สำหรับผู้กู้ (ยืนยันว่าคำขอถูกส่ง)
 */
export function getLoanRequestConfirmationEmailTemplate(
  borrowerName: string,
  loanAmount: string,
  interestRate: string,
  requestId: number
): string {
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
          <h1>✅ คำขอกู้ถูกส่งเรียบร้อย</h1>
        </div>
        
        <div class="content">
          <p>สวัสดี ${borrowerName},</p>
          
          <div class="success-message">
            <strong>✓ คำขอกู้ของคุณถูกส่งไปยังระบบเรียบร้อยแล้ว</strong>
            <p style="margin: 10px 0 0 0;">ผู้ให้กู้จะตรวจสอบและติดต่อกลับไปยังคุณในเร็วๆ นี้</p>
          </div>
          
          <div class="loan-details">
            <h3 style="margin-top: 0;">📋 รายละเอียดคำขอของคุณ</h3>
            <div class="detail-row">
              <span class="detail-label">เลขที่คำขอ:</span>
              <span class="detail-value">#${requestId}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">จำนวนเงินที่ขอ:</span>
              <span class="detail-value">฿${loanAmount}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">อัตราดอกเบี้ยต่อปี:</span>
              <span class="detail-value">${interestRate}%</span>
            </div>
          </div>
          
          <p style="color: #6b7280;">
            เราจะส่งอีเมลแจ้งให้คุณทราบเมื่อมีการอนุมัติหรือปฏิเสธคำขอของคุณ
          </p>
        </div>
        
        <div class="footer">
          <p>© 2024 Loan Management System. All rights reserved.</p>
          <p>อีเมลนี้ถูกส่งโดยอัตโนมัติจากระบบ กรุณาไม่ตอบกลับ</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Email template สำหรับการอนุมัติคำขอกู้
 */
export function getLoanApprovalEmailTemplate(
  borrowerName: string,
  loanAmount: string,
  interestRate: string,
  loanTermMonths: number,
  monthlyPayment: string,
  requestId: number
): string {
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
          <h1>🎉 คำขอกู้ของคุณได้รับการอนุมัติ!</h1>
        </div>
        
        <div class="content">
          <p>สวัสดี ${borrowerName},</p>
          
          <div class="approval-message">
            <strong>✓ ยินดีด้วย! คำขอกู้ของคุณได้รับการอนุมัติแล้ว</strong>
            <p style="margin: 10px 0 0 0;">เงินจะถูกโอนไปยังบัญชีของคุณในเร็วๆ นี้</p>
          </div>
          
          <div class="loan-details">
            <h3 style="margin-top: 0;">📊 รายละเอียดสัญญาเงินกู้</h3>
            <div class="detail-row">
              <span class="detail-label">เลขที่สัญญา:</span>
              <span class="detail-value">#${requestId}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">จำนวนเงิน:</span>
              <span class="detail-value">฿${loanAmount}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">อัตราดอกเบี้ย:</span>
              <span class="detail-value">${interestRate}% ต่อปี</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">ระยะเวลาผ่อน:</span>
              <span class="detail-value">${loanTermMonths} เดือน</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">ค่างวดรายเดือน:</span>
              <span class="detail-value">฿${monthlyPayment}</span>
            </div>
          </div>
          
          <p style="color: #6b7280;">
            โปรดเก็บอีเมลนี้ไว้เพื่ออ้างอิง คุณสามารถตรวจสอบรายละเอียดสัญญาและตารางผ่อนชำระในแอปพลิเคชันได้
          </p>
        </div>
        
        <div class="footer">
          <p>© 2024 Loan Management System. All rights reserved.</p>
          <p>อีเมลนี้ถูกส่งโดยอัตโนมัติจากระบบ กรุณาไม่ตอบกลับ</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Email template สำหรับแจ้งเตือนก่อนวันครบกำหนดชำระ
 */
export function getPaymentReminderEmailTemplate(
  borrowerName: string,
  amount: string,
  dueDate: string,
  paymentNumber: number,
  loanId: number
): string {
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
          <h1 style="margin:0;font-size:24px;">แจ้งเตือนกำหนดชำระเงิน</h1>
          <p style="margin:8px 0 0;">ใกล้ถึงวันครบกำหนดของคุณแล้ว</p>
        </div>
        <div style="padding:28px;">
          <p>สวัสดี ${borrowerName}</p>
          <p>โปรดเตรียมชำระเงินตามรายละเอียดด้านล่าง</p>
          <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:16px;border-radius:8px;line-height:1.9;">
            <strong>สัญญา #${loanId}</strong><br>
            งวดที่ ${paymentNumber}<br>
            จำนวนเงิน: <strong>฿${amount}</strong><br>
            ครบกำหนด: <strong>${dueDate}</strong>
          </div>
          <p style="color:#6b7280;font-size:13px;">หากชำระเงินแล้ว สามารถอัปโหลดสลิปผ่านหน้ารายละเอียดสัญญาได้</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
