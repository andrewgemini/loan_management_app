import axios from "axios";

/**
 * LINE Notify Service สำหรับส่งแจ้งเตือนผ่าน LINE
 * ใช้ LINE Notify API เพื่อส่งข้อความไปยังผู้ใช้
 */

const LINE_NOTIFY_API_URL = "https://notify-api.line.me/api/notify";

interface LineNotifyMessage {
  message: string;
  imageThumbnail?: string;
  imageFullsize?: string;
}

/**
 * ส่งข้อความผ่าน LINE Notify
 * @param accessToken LINE Notify access token ของผู้ใช้
 * @param message ข้อความที่ต้องการส่ง
 * @returns true ถ้าส่งสำเร็จ, false ถ้าล้มเหลว
 */
export async function sendLineNotify(
  accessToken: string,
  message: LineNotifyMessage
): Promise<boolean> {
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

    const response = await axios.post(LINE_NOTIFY_API_URL, formData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
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

/**
 * ส่งแจ้งเตือนคำขอกู้ใหม่ผ่าน LINE
 */
export async function sendNewLoanRequestLineNotification(
  accessToken: string,
  borrowerName: string,
  loanAmount: string,
  interestRate: string,
  loanTermMonths: number,
  requestId: number,
  dashboardUrl: string
): Promise<boolean> {
  const message = `
📋 คำขอกู้ยืมเงินใหม่

👤 ผู้กู้: ${borrowerName}
💰 จำนวนเงิน: ฿${loanAmount}
📊 อัตราดอกเบี้ย: ${interestRate}% ต่อปี
📅 ระยะเวลา: ${loanTermMonths} เดือน
🔢 เลขที่: #${requestId}

👉 ไปยัง Dashboard: ${dashboardUrl}
  `.trim();

  return sendLineNotify(accessToken, { message });
}

/**
 * ส่งแจ้งเตือนการอนุมัติคำขอกู้ผ่าน LINE
 */
export async function sendLoanApprovalLineNotification(
  accessToken: string,
  borrowerName: string,
  loanAmount: string,
  monthlyPayment: string,
  requestId: number
): Promise<boolean> {
  const message = `
✅ คำขอกู้ได้รับการอนุมัติแล้ว

👤 ผู้กู้: ${borrowerName}
💰 จำนวนเงิน: ฿${loanAmount}
📊 ค่างวดรายเดือน: ฿${monthlyPayment}
🔢 เลขที่สัญญา: #${requestId}

เงินจะถูกโอนไปยังบัญชีของผู้กู้ในเร็วๆ นี้
  `.trim();

  return sendLineNotify(accessToken, { message });
}

/**
 * ส่งแจ้งเตือนการปฏิเสธคำขอกู้ผ่าน LINE
 */
export async function sendLoanRejectionLineNotification(
  accessToken: string,
  borrowerName: string,
  requestId: number,
  rejectionReason?: string
): Promise<boolean> {
  const reasonText = rejectionReason ? `\n📝 เหตุผล: ${rejectionReason}` : "";

  const message = `
❌ คำขอกู้ถูกปฏิเสธ

👤 ผู้กู้: ${borrowerName}
🔢 เลขที่: #${requestId}${reasonText}

หากมีคำถามกรุณาติดต่อผู้ให้กู้หรือผู้ดูแลระบบ
  `.trim();

  return sendLineNotify(accessToken, { message });
}

/**
 * ส่งแจ้งเตือนการชำระเงินรอตรวจสอบผ่าน LINE
 */
export async function sendPaymentPendingLineNotification(
  accessToken: string,
  borrowerName: string,
  amountPaid: string,
  paymentDate: string,
  requestId: number
): Promise<boolean> {
  const message = `
⏳ การชำระเงินรอตรวจสอบ

👤 ผู้กู้: ${borrowerName}
💰 จำนวนเงิน: ฿${amountPaid}
📅 วันที่ชำระ: ${paymentDate}
🔢 เลขที่สัญญา: #${requestId}

ผู้ดูแลระบบจะตรวจสอบและยืนยันการชำระเงินในเร็วๆ นี้
  `.trim();

  return sendLineNotify(accessToken, { message });
}

/**
 * ตรวจสอบว่า LINE Notify token ถูกต้องหรือไม่
 */
export async function verifyLineNotifyToken(accessToken: string): Promise<boolean> {
  try {
    const response = await axios.get("https://notify-api.line.me/api/status", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.status === 200;
  } catch (error) {
    console.error("[LINE Notify] Token verification failed:", error);
    return false;
  }
}

/**
 * ยกเลิกการเชื่อมต่อ LINE Notify
 */
export async function revokeLineNotifyToken(accessToken: string): Promise<boolean> {
  try {
    const response = await axios.post(
      "https://notify-api.line.me/api/revoke",
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return response.status === 200;
  } catch (error) {
    console.error("[LINE Notify] Token revocation failed:", error);
    return false;
  }
}
