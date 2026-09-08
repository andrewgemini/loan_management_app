/**
 * LINE Messaging API Service
 * Upgraded from LINE Notify to LINE Messaging API (Flex Messages)
 */

export interface LoanReminderPayload {
  borrowerName: string;
  contractNumber: string;
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
  paymentUrl: string;
}

export async function sendLineFlexReminder(
  lineUserId: string,
  payload: LoanReminderPayload
): Promise<boolean> {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    console.log("[LINE] Channel access token not configured");
    return false;
  }

  const flexMessage = {
    to: lineUserId,
    messages: [
      {
        type: "flex",
        altText: `แจ้งเตือนกำหนดชำระค่างวดที่ ${payload.installmentNumber} จำนวน ${payload.amountDue.toLocaleString()} บาท`,
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "แจ้งเตือนชำระค่างวด",
                weight: "bold",
                color: "#1DB446",
                size: "sm",
              },
              {
                type: "text",
                text: `สัญญาเลขที่: ${payload.contractNumber}`,
                weight: "bold",
                size: "lg",
                margin: "md",
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "ผู้กู้", size: "sm", color: "#aaaaaa" },
                  { type: "text", text: payload.borrowerName, size: "sm", align: "end", weight: "bold" },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "งวดที่", size: "sm", color: "#aaaaaa" },
                  { type: "text", text: `${payload.installmentNumber}`, size: "sm", align: "end" },
                ],
                margin: "sm",
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "วันครบกำหนด", size: "sm", color: "#aaaaaa" },
                  { type: "text", text: payload.dueDate, size: "sm", align: "end", color: "#ff5555" },
                ],
                margin: "sm",
              },
              { type: "separator", margin: "lg" },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  { type: "text", text: "ยอดที่ต้องชำระ", size: "md", weight: "bold" },
                  {
                    type: "text",
                    text: `${payload.amountDue.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`,
                    size: "md",
                    align: "end",
                    weight: "bold",
                    color: "#0066cc",
                  },
                ],
                margin: "md",
              },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#0066cc",
                action: {
                  type: "uri",
                  label: "ชำระเงินผ่าน PromptPay",
                  uri: payload.paymentUrl,
                },
              },
            ],
          },
        },
      },
    ],
  };

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify(flexMessage),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[LINE] Failed to send push message:", errText);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[LINE] Push message error:", err);
    return false;
  }
}
