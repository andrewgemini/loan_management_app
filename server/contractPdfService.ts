/**
 * Digital Loan Agreement (e-Contract) Generator
 * สร้างหนังสือสัญญากู้ยืมเงินอิเล็กทรอนิกส์ตามประมวลกฎหมายแพ่งและพาณิชย์
 */

export interface ContractData {
  contractId: number;
  contractNumber: string;
  contractDate: string;
  lenderName: string;
  lenderCitizenId?: string;
  borrowerName: string;
  borrowerCitizenId?: string;
  principalAmount: number;
  interestRate: number;
  interestType: "simple" | "compound";
  paymentType: "fixed" | "reducing";
  loanTermMonths: number;
  monthlyInstallment: number;
  consentTimestamp: string;
  consentIpAddress: string;
}

export function generateContractMarkdown(data: ContractData): string {
  return `
# หนังสือสัญญากู้ยืมเงินอิเล็กทรอนิกส์ (e-Contract)
**สัญญาเลขที่:** ${data.contractNumber}  
**ทำขึ้นเมื่อวันที่:** ${data.contractDate}

---

สัญญากู้ยืมเงินฉบับนี้ทำขึ้นระหว่าง:
**ผู้ให้กู้:** ${data.lenderName}
และ
**ผู้กู้:** ${data.borrowerName}

คู่สัญญาทั้งสองฝ่ายตกลงทำสัญญาเงินกู้โดยมีข้อความและเงื่อนไขดังต่อไปนี้:

### ข้อ 1. จำนวนเงินกู้และการส่งมอบเงินกู้
ผู้กู้ตกลงกู้ยืมเงินและผู้ให้กู้ตกลงให้กู้ยืมเงินเป็นจำนวน **${data.principalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท** ซึ่งผู้กู้ได้รับเงินกู้ยืมจำนวนดังกล่าวไว้ครบถ้วนถูกต้องแล้วในวันที่ทำสัญญานี้ผ่านช่องทางการโอนเงินทางบัญชีธนาคาร

### ข้อ 2. ดอกเบี้ยและการคำนวณ
ผู้กู้ตกลงยินยอมชำระดอกเบี้ยให้แก่ผู้ให้กู้ในอัตราร้อยละ **${data.interestRate}% ต่อปี** โดยคำนวณดอกเบี้ยแบบ **${data.interestType === "simple" ? "ดอกเบี้ยคงที่ (Simple Interest)" : "ดอกเบี้ยทบต้น (Compound Interest)"}** และใช้วิธีการชำระแบบ **${data.paymentType === "fixed" ? "ค่างวดคงที่ (Fixed Payment)" : "ลดต้นลดดอก (Reducing Balance)"}**

### ข้อ 3. กำหนดเวลาและการชำระหนี้คืน
ผู้กู้สัญญาว่าจะชำระคืนเงินต้นพร้อมดอกเบี้ยเป็นงวดรายเดือน รวมทั้งสิ้น **${data.loanTermMonths} งวด** งวดละประมาณ **${data.monthlyInstallment.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท** ภายในวันครบกำหนดของแต่ละงวดตามตารางการผ่อนชำระที่แนบท้ายสัญญานี้

### ข้อ 4. การผิดนัดชำระหนี้และเบี้ยปรับ
หากผู้กู้ผิดนัดชำระหนี้งวดใดงวดหนึ่ง ผู้ให้กู้มีสิทธิคิดดอกเบี้ยผิดนัดชำระหนี้ตามอัตราที่กฎหมายและธนาคารแห่งประเทศไทยกำหนด และผู้ให้กู้มีสิทธิบอกเลิกสัญญาและเรียกให้ผู้กู้ชำระหนี้เงินต้นพร้อมดอกเบี้ยที่ค้างชำระทั้งหมดคืนได้ทันที

### ข้อ 5. การยอมรับสัญญาและหลักฐานทางอิเล็กทรอนิกส์
สัญญานี้ทำขึ้นโดยระบบอิเล็กทรอนิกส์ คู่สัญญาทั้งสองฝ่ายได้อ่านและเข้าใจข้อความโดยละเอียดแล้ว ยอมรับว่าการกดยืนยันสัญญาและการพิสูจน์ตัวตนผ่านระบบถือเป็นการลงลายมือชื่อทางอิเล็กทรอนิกส์ที่มีผลผูกพันตามพระราชบัญญัติว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544

---
**บันทึกการยอมรับสัญญาทางดิจิทัล (Digital Consent Audit):**
- วันเวลาที่ทำรายการ: ${data.consentTimestamp}
- หมายเลขไอพี (IP Address): ${data.consentIpAddress}
- รหัสอ้างอิงสัญญา (Verification Hash): CONTRACT-AUTH-${data.contractId}-${Date.now()}
`;
}
