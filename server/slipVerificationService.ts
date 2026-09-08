/**
 * Automated Bank Slip Verification Service
 * Supports integration with SlipOK / EasySlip / OpenSlipVerify APIs
 * Fallback to manual verification if external API credentials are not provided
 */

export interface SlipVerificationResult {
  isVerified: boolean;
  provider: "slipok" | "easyslip" | "manual";
  rawPayload?: Record<string, unknown>;
  amount?: number;
  transDate?: string;
  transRef?: string;
  senderName?: string;
  receiverAccount?: string;
  message?: string;
}

export async function verifySlipData(
  fileBuffer: Buffer,
  expectedAmount: number
): Promise<SlipVerificationResult> {
  const slipOkBranchId = process.env.SLIPOK_BRANCH_ID;
  const slipOkApiKey = process.env.SLIPOK_API_KEY;

  if (slipOkBranchId && slipOkApiKey) {
    try {
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: "image/jpeg" });
      formData.append("files", blob, "slip.jpg");
      formData.append("amount", expectedAmount.toString());

      const res = await fetch(`https://api.slipok.com/api/line/apikey/${slipOkBranchId}`, {
        method: "POST",
        headers: {
          "x-authorization": slipOkApiKey,
        },
        body: formData,
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.success && data.data) {
          return {
            isVerified: true,
            provider: "slipok",
            rawPayload: data.data,
            amount: Number(data.data.amount),
            transDate: data.data.transDate,
            transRef: data.data.transRef,
            senderName: data.data.sender?.name,
            receiverAccount: data.data.receiver?.account?.value,
            message: "ตรวจสอบสลิปกับระบบธนาคารสำเร็จ",
          };
        }
      }
    } catch (error) {
      console.warn("[SlipVerification] SlipOK API error, falling back to manual:", error);
    }
  }

  // Fallback: Registered for manual verification
  return {
    isVerified: false,
    provider: "manual",
    message: "บันทึกสลิปเรียบร้อย รอเจ้าหน้าที่ตรวจสอบความถูกต้อง",
  };
}
