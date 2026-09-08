/**
 * Interest Calculation & Amortization Schedule Functions
 * รองรับการคำนวณ Simple Interest และ Compound Interest
 */

export interface LoanParams {
  principal: number;
  annualRate: number; // อัตราดอกเบี้ยต่อปี (%)
  months: number;
  interestType: "simple" | "compound";
  paymentType: "fixed" | "reducing";
}

export interface PaymentScheduleItem {
  paymentNumber: number;
  dueDate: Date;
  startingBalance: number;
  principal: number;
  interest: number;
  totalPayment: number;
  endingBalance: number;
}

/**
 * คำนวณดอกเบี้ยแบบ Simple Interest
 * สูตร: Interest = Principal × Rate × Time
 */
export function calculateSimpleInterest(principal: number, annualRate: number, months: number): number {
  const monthlyRate = annualRate / 100 / 12;
  return principal * monthlyRate * months;
}

/**
 * คำนวณดอกเบี้ยแบบ Compound Interest
 * สูตร: A = P(1 + r/n)^(nt)
 */
export function calculateCompoundInterest(principal: number, annualRate: number, months: number): number {
  const monthlyRate = annualRate / 100 / 12;
  const compoundAmount = principal * Math.pow(1 + monthlyRate, months);
  return compoundAmount - principal;
}

/**
 * คำนวณยอดชำระรวม (Principal + Interest)
 */
export function calculateTotalPayment(principal: number, interest: number): number {
  return principal + interest;
}

/**
 * คำนวณค่างวดต่อเดือนแบบ Fixed Payment
 * ใช้สูตร: M = P × [r(1+r)^n] / [(1+r)^n - 1]
 * โดย r = monthly rate, n = number of payments
 */
export function calculateFixedMonthlyPayment(principal: number, annualRate: number, months: number): number {
  const monthlyRate = annualRate / 100 / 12;
  
  if (monthlyRate === 0) {
    return principal / months;
  }
  
  const numerator = monthlyRate * Math.pow(1 + monthlyRate, months);
  const denominator = Math.pow(1 + monthlyRate, months) - 1;
  
  return principal * (numerator / denominator);
}

/**
 * สร้างตารางผ่อนชำระแบบ Fixed Payment
 * ยอดชำระคงที่ทุกเดือน
 */
export function generateFixedPaymentSchedule(params: LoanParams, startDate: Date): PaymentScheduleItem[] {
  const schedule: PaymentScheduleItem[] = [];
  const monthlyPayment = calculateFixedMonthlyPayment(params.principal, params.annualRate, params.months);
  const monthlyRate = params.annualRate / 100 / 12;
  
  let balance = params.principal;
  let currentDate = new Date(startDate);
  
  for (let i = 1; i <= params.months; i++) {
    const interestPayment = balance * monthlyRate;
    const principalPayment = monthlyPayment - interestPayment;
    const newBalance = Math.max(0, balance - principalPayment);
    
    // สำหรับงวดสุดท้าย ให้ชำระเต็มจำนวนคงค้าง
    const finalPayment = i === params.months 
      ? balance + interestPayment 
      : monthlyPayment;
    
    schedule.push({
      paymentNumber: i,
      dueDate: new Date(currentDate),
      startingBalance: balance,
      principal: i === params.months ? balance : principalPayment,
      interest: interestPayment,
      totalPayment: finalPayment,
      endingBalance: newBalance,
    });
    
    balance = newBalance;
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  return schedule;
}

/**
 * สร้างตารางผ่อนชำระแบบ Reducing Balance
 * เงินต้นชำระคงที่ ดอกเบี้ยลดลงทุกเดือน
 */
export function generateReducingBalanceSchedule(params: LoanParams, startDate: Date): PaymentScheduleItem[] {
  const schedule: PaymentScheduleItem[] = [];
  const principalPerMonth = params.principal / params.months;
  const monthlyRate = params.annualRate / 100 / 12;
  
  let balance = params.principal;
  let currentDate = new Date(startDate);
  
  for (let i = 1; i <= params.months; i++) {
    const interestPayment = balance * monthlyRate;
    const principalPayment = principalPerMonth;
    const totalPayment = principalPayment + interestPayment;
    const newBalance = Math.max(0, balance - principalPayment);
    
    schedule.push({
      paymentNumber: i,
      dueDate: new Date(currentDate),
      startingBalance: balance,
      principal: principalPayment,
      interest: interestPayment,
      totalPayment: totalPayment,
      endingBalance: newBalance,
    });
    
    balance = newBalance;
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  return schedule;
}

/**
 * สร้างตารางผ่อนชำระตามประเภท
 */
export function generateAmortizationSchedule(params: LoanParams, startDate: Date): PaymentScheduleItem[] {
  if (params.paymentType === "fixed") {
    return generateFixedPaymentSchedule(params, startDate);
  } else {
    return generateReducingBalanceSchedule(params, startDate);
  }
}

/**
 * คำนวณสรุปข้อมูลเงินกู้
 */
export function calculateLoanSummary(params: LoanParams) {
  const schedule = generateAmortizationSchedule(params, new Date());
  
  const totalInterest = schedule.reduce((sum, item) => sum + item.interest, 0);
  const totalPayment = params.principal + totalInterest;
  const monthlyPayment = params.paymentType === "fixed" 
    ? calculateFixedMonthlyPayment(params.principal, params.annualRate, params.months)
    : schedule[0]?.totalPayment || 0;
  
  return {
    principal: params.principal,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPayment: Math.round(totalPayment * 100) / 100,
    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
    schedule,
  };
}

/**
 * คำนวณยอดคงค้างในปัจจุบัน
 */
export function calculateOutstandingBalance(schedule: PaymentScheduleItem[], paidUpToPaymentNumber: number): number {
  if (paidUpToPaymentNumber >= schedule.length) {
    return 0;
  }
  
  if (paidUpToPaymentNumber < 1) {
    return schedule[0]?.startingBalance || 0;
  }
  
  return schedule[paidUpToPaymentNumber]?.startingBalance || 0;
}

/**
 * คำนวณจำนวนเงินที่ชำระแล้ว
 */
export function calculateTotalPaid(schedule: PaymentScheduleItem[], paidUpToPaymentNumber: number): number {
  let totalPaid = 0;
  
  for (let i = 0; i < Math.min(paidUpToPaymentNumber, schedule.length); i++) {
    totalPaid += schedule[i].totalPayment;
  }
  
  return Math.round(totalPaid * 100) / 100;
}

/**
 * ตรวจสอบว่างวดใดครบกำหนดชำระแล้ว
 */
export function getOverduePayments(schedule: PaymentScheduleItem[], currentDate: Date): PaymentScheduleItem[] {
  return schedule.filter(item => item.dueDate < currentDate && !item.totalPayment);
}

/**
 * ดึงข้อมูลงวดถัดไป
 */
export function getNextPaymentDue(schedule: PaymentScheduleItem[], currentDate: Date): PaymentScheduleItem | null {
  const unpaid = schedule.filter(item => item.dueDate >= currentDate);
  return unpaid.length > 0 ? unpaid[0] : null;
}

// ============================================================================
// Enhanced Financial Calculation Utilities (Partial, Overpayment & Penalties)
// ============================================================================

export interface PartialPaymentResult {
  paidInterest: number;
  paidPrincipal: number;
  remainingInterest: number;
  remainingPrincipal: number;
  isFullyPaid: boolean;
}

/**
 * คำนวณการชำระเงินไม่เต็มจำนวน (Partial Payment)
 * กฎมาตรฐานการเงิน: นำเงินไปตัดดอกเบี้ยค้างจ่ายก่อน แล้วนำส่วนที่เหลือไปตัดเงินต้น
 */
export function calculatePartialPayment(
  amountPaid: number,
  interestDue: number,
  principalDue: number
): PartialPaymentResult {
  const roundedPaid = Math.round(amountPaid * 100) / 100;
  const roundedInterest = Math.round(interestDue * 100) / 100;
  const roundedPrincipal = Math.round(principalDue * 100) / 100;
  const totalDue = roundedInterest + roundedPrincipal;

  if (roundedPaid >= totalDue) {
    return {
      paidInterest: roundedInterest,
      paidPrincipal: roundedPrincipal,
      remainingInterest: 0,
      remainingPrincipal: 0,
      isFullyPaid: true,
    };
  }

  let paidInterest = 0;
  let paidPrincipal = 0;

  if (roundedPaid <= roundedInterest) {
    paidInterest = roundedPaid;
  } else {
    paidInterest = roundedInterest;
    paidPrincipal = Math.min(roundedPaid - roundedInterest, roundedPrincipal);
  }

  const remainingInterest = Math.round((roundedInterest - paidInterest) * 100) / 100;
  const remainingPrincipal = Math.round((roundedPrincipal - paidPrincipal) * 100) / 100;

  return {
    paidInterest: Math.round(paidInterest * 100) / 100,
    paidPrincipal: Math.round(paidPrincipal * 100) / 100,
    remainingInterest,
    remainingPrincipal,
    isFullyPaid: remainingInterest === 0 && remainingPrincipal === 0,
  };
}

export interface OverpaymentResult {
  paidInstallment: number;
  excessToPrincipal: number;
  newEndingBalance: number;
}

/**
 * คำนวณการชำระเกินงวด / โปะเงินต้น (Overpayment & Early Payoff)
 * เงินส่วนเกินค่างวดจะถูกนำไปตัดลดเงินต้นคงค้างทันที
 */
export function calculateOverpayment(
  amountPaid: number,
  totalDue: number,
  endingBalance: number
): OverpaymentResult {
  const roundedPaid = Math.round(amountPaid * 100) / 100;
  const roundedTotalDue = Math.round(totalDue * 100) / 100;
  const roundedEndingBalance = Math.round(endingBalance * 100) / 100;

  if (roundedPaid <= roundedTotalDue) {
    return {
      paidInstallment: roundedPaid,
      excessToPrincipal: 0,
      newEndingBalance: roundedEndingBalance,
    };
  }

  const excess = Math.round((roundedPaid - roundedTotalDue) * 100) / 100;
  const newEnding = Math.max(0, Math.round((roundedEndingBalance - excess) * 100) / 100);

  return {
    paidInstallment: roundedTotalDue,
    excessToPrincipal: excess,
    newEndingBalance: newEnding,
  };
}

/**
 * คำนวณเบี้ยปรับชำระล่าช้า (Late Payment Penalty) ตามเกณฑ์ ธปท.
 * ดอกเบี้ยผิดนัดชำระ = (เงินต้นค้างชำระ × อัตราดอกเบี้ยผิดนัดชำระ × จำนวนวันล่วงพ้นกำหนด) / 365
 * อัตราดอกเบี้ยผิดนัดชำระ = อัตราดอกเบี้ยตามสัญญา + ไม่เกิน 3% ต่อปี
 */
export function calculateLatePaymentPenalty(
  principalDue: number,
  contractRate: number,
  daysOverdue: number,
  penaltySpread: number = 3.0
): number {
  if (daysOverdue <= 0 || principalDue <= 0) return 0;
  const effectivePenaltyRate = (contractRate + penaltySpread) / 100;
  const penalty = (principalDue * effectivePenaltyRate * daysOverdue) / 365;
  return Math.round(penalty * 100) / 100;
}
