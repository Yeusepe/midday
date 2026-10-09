export type RecurrencePayment = {
  teamId: string;
  name: string;
  merchantName: string | null;
  amount: number;
  currency: string;
  date: string;
};

export type RecurrenceRule = RecurrencePayment & {
  recurring: boolean;
  frequency: string | null;
};

function normalize(value: string | null): string {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

/** Deliberately exact identity matching: fuzzy vendor search is too broad for billing rules. */
export function matchesRecurrenceRule(
  payment: RecurrencePayment,
  rule: RecurrenceRule,
): boolean {
  if (
    payment.teamId !== rule.teamId ||
    normalize(payment.currency) !== normalize(rule.currency)
  )
    return false;
  if (
    !Number.isFinite(payment.amount) ||
    !Number.isFinite(rule.amount) ||
    rule.amount === 0
  )
    return false;
  if (Math.sign(payment.amount) !== Math.sign(rule.amount)) return false;
  if (
    Math.abs(payment.amount - rule.amount) >
    Math.max(0.01, Math.abs(rule.amount) * 0.05)
  )
    return false;

  const merchant = normalize(payment.merchantName);
  const ruleMerchant = normalize(rule.merchantName);
  if (merchant && ruleMerchant) {
    if (merchant !== ruleMerchant) return false;
  } else {
    const names = [normalize(payment.name), merchant].filter(Boolean);
    if (
      ![normalize(rule.name), ruleMerchant].some(
        (name) => name && names.includes(name),
      )
    )
      return false;
  }

  // An explicit opt-out blocks the matching payment pattern regardless of date.
  if (!rule.recurring || rule.frequency === "irregular") return true;
  const date = new Date(`${payment.date}T00:00:00Z`);
  const anchor = new Date(`${rule.date}T00:00:00Z`);
  if (!Number.isFinite(+date) || !Number.isFinite(+anchor)) return false;
  const days = Math.abs(+date - +anchor) / 86_400_000;
  if (rule.frequency === "weekly" || rule.frequency === "biweekly") {
    const period = rule.frequency === "weekly" ? 7 : 14;
    const remainder = days % period;
    return Math.min(remainder, period - remainder) <= 1;
  }
  if (rule.frequency === "monthly" || rule.frequency === "annually") {
    // Calendar arithmetic handles short months, month-end billing, and leap years.
    for (const offset of [-1, 0, 1]) {
      const year =
        date.getUTCFullYear() + (rule.frequency === "annually" ? offset : 0);
      const month =
        rule.frequency === "annually"
          ? anchor.getUTCMonth()
          : date.getUTCMonth() + offset;
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const expected = Date.UTC(
        year,
        month,
        Math.min(anchor.getUTCDate(), lastDay),
      );
      if (Math.abs(+date - expected) / 86_400_000 <= 3) return true;
    }
  }
  // Unknown and semi-monthly schedules need more information than one anchor.
  return false;
}
