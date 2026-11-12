export interface CostInputs {
  price: number;
  downPercent: number;
  /** Annual interest rate, percent. */
  interestPercent: number;
  termYears: number;
  /** Title, survey, lender and recording fees as a share of price. */
  closingPercent: number;
  /** Value the taxing units apply their rates to. */
  taxableValue: number;
  /** Combined rate, dollars per $100 of taxable value. */
  taxRate: number;
  /** Insurance, association dues, upkeep and anything else, per year. */
  otherAnnual: number;
}

export interface CostEstimate {
  downPayment: number;
  loanAmount: number;
  monthlyPayment: number;
  closingCosts: number;
  cashToClose: number;
  annualTax: number;
  /** Loan payment plus a month's share of taxes and other costs. */
  monthlyCarry: number;
  totalInterest: number;
  /** Cash to close plus twelve months of carrying costs. */
  firstYearCash: number;
}

const clamp = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);

/** Fixed-rate amortized payment. A zero rate degrades to straight-line. */
export function monthlyPayment(principal: number, annualPercent: number, years: number): number {
  const n = Math.round(years * 12);
  if (principal <= 0 || n <= 0) return 0;
  const r = annualPercent / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - (1 + r) ** -n);
}

export function estimateCosts(input: CostInputs): CostEstimate {
  const price = clamp(input.price, 0, 1e12);
  const downPayment = price * (clamp(input.downPercent, 0, 100) / 100);
  const loanAmount = price - downPayment;
  const term = clamp(input.termYears, 0, 50);
  const payment = monthlyPayment(loanAmount, clamp(input.interestPercent, 0, 40), term);
  const closingCosts = price * (clamp(input.closingPercent, 0, 25) / 100);
  const annualTax = (clamp(input.taxableValue, 0, 1e12) * clamp(input.taxRate, 0, 20)) / 100;
  const otherAnnual = clamp(input.otherAnnual, 0, 1e9);
  const monthlyCarry = payment + (annualTax + otherAnnual) / 12;
  const cashToClose = downPayment + closingCosts;
  return {
    downPayment,
    loanAmount,
    monthlyPayment: payment,
    closingCosts,
    cashToClose,
    annualTax,
    monthlyCarry,
    totalInterest: Math.max(0, payment * Math.round(term * 12) - loanAmount),
    firstYearCash: cashToClose + monthlyCarry * 12,
  };
}
