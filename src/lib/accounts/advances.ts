// Reglas contables puras del módulo de Anticipos de Clientes.
// Se mantienen fuera de React y del servidor para poder probarlas aisladas.

export type AdvanceCurrency = 'USD' | 'VES';
export type AdvanceStatus = 'DISPONIBLE' | 'APLICADO' | 'DEVUELTO' | 'ANULADO';

export interface AdvanceLike {
  amount_usd: number;
  applied_usd: number;
  refunded_usd: number;
  balance_usd: number;
  status: AdvanceStatus;
}

/** Redondeo monetario obligatorio del ERP: dos decimales exactos. */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Convierte lo recibido a la moneda canónica del módulo (USD). */
export function advanceToUsd(amountOriginal: number, currency: AdvanceCurrency, rate: number): number {
  const amount = round2(amountOriginal);
  if (amount <= 0) return 0;
  if (currency === 'USD') return amount;
  const safeRate = Number(rate) > 0 ? Number(rate) : 1;
  return round2(amount / safeRate);
}

/**
 * Monto que entra o sale de la cuenta bancaria, en la moneda de esa cuenta.
 * Si la cuenta y el anticipo comparten moneda no se convierte (evita deriva).
 */
export function advanceBankAmount(
  amountUsd: number,
  amountOriginal: number,
  currency: AdvanceCurrency,
  bankCurrency: AdvanceCurrency,
  rate: number
): number {
  const safeRate = Number(rate) > 0 ? Number(rate) : 1;
  if (bankCurrency === currency) return round2(amountOriginal);
  if (bankCurrency === 'VES') return round2(amountUsd * safeRate);
  return round2(amountUsd);
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export function validateAdvanceDraft(input: {
  customerId?: string | null;
  bankAccountId?: string | null;
  amountOriginal: number;
  currency: AdvanceCurrency;
  rate: number;
}): ValidationResult {
  if (!input.customerId) return { ok: false, error: 'Selecciona el cliente del anticipo.' };
  if (!input.bankAccountId) return { ok: false, error: 'Selecciona la cuenta bancaria de destino.' };
  if (!Number.isFinite(input.amountOriginal) || round2(input.amountOriginal) <= 0) {
    return { ok: false, error: 'El monto del anticipo debe ser mayor a cero.' };
  }
  if (input.currency === 'VES' && (!Number.isFinite(input.rate) || input.rate <= 0)) {
    return { ok: false, error: 'La tasa de cambio debe ser mayor a cero.' };
  }
  if (advanceToUsd(input.amountOriginal, input.currency, input.rate) <= 0) {
    return { ok: false, error: 'El monto en dólares del anticipo es inválido.' };
  }
  return { ok: true };
}

export function validateAdvanceApplication(input: {
  amountUsd: number;
  availableUsd: number;
  receivableBalanceUsd: number;
}): ValidationResult {
  const amount = round2(input.amountUsd);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'El monto a aplicar debe ser mayor a cero.' };
  }
  if (amount > round2(input.availableUsd) + 0.005) {
    return { ok: false, error: 'El monto supera el saldo disponible del anticipo.' };
  }
  if (amount > round2(input.receivableBalanceUsd) + 0.005) {
    return { ok: false, error: 'El monto supera el saldo pendiente de la cuenta por cobrar.' };
  }
  return { ok: true };
}

export function validateAdvanceRefund(input: {
  amountUsd: number;
  availableUsd: number;
  bankBalance: number;
  bankCurrency: AdvanceCurrency;
  rate: number;
}): ValidationResult {
  const amount = round2(input.amountUsd);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'El monto a devolver debe ser mayor a cero.' };
  }
  if (amount > round2(input.availableUsd) + 0.005) {
    return { ok: false, error: 'El monto supera el saldo disponible del anticipo.' };
  }
  const bankAmount = advanceBankAmount(amount, amount, 'USD', input.bankCurrency, input.rate);
  if (round2(input.bankBalance) < bankAmount) {
    return { ok: false, error: 'La cuenta bancaria no tiene saldo suficiente para la devolución.' };
  }
  return { ok: true };
}

/** Invariante contable: aplicado + devuelto nunca supera el total. */
export function advanceInvariantHolds(advance: Pick<AdvanceLike, 'amount_usd' | 'applied_usd' | 'refunded_usd' | 'balance_usd'>): boolean {
  const total = round2(advance.amount_usd);
  const used = round2(advance.applied_usd + advance.refunded_usd);
  const expectedBalance = round2(total - used);
  return (
    total >= 0 &&
    advance.applied_usd >= -0.005 &&
    advance.refunded_usd >= -0.005 &&
    used <= total + 0.005 &&
    Math.abs(round2(advance.balance_usd) - expectedBalance) <= 0.005
  );
}

export interface AdvanceSummary {
  total_usd: number;
  available_usd: number;
  applied_usd: number;
  refunded_usd: number;
  count: number;
}

export function summarizeAdvances(rows: AdvanceLike[]): AdvanceSummary {
  const summary: AdvanceSummary = {
    total_usd: 0,
    available_usd: 0,
    applied_usd: 0,
    refunded_usd: 0,
    count: rows.length
  };
  for (const row of rows) {
    summary.total_usd = round2(summary.total_usd + (Number(row.amount_usd) || 0));
    summary.applied_usd = round2(summary.applied_usd + (Number(row.applied_usd) || 0));
    summary.refunded_usd = round2(summary.refunded_usd + (Number(row.refunded_usd) || 0));
    if (row.status !== 'ANULADO') {
      summary.available_usd = round2(summary.available_usd + (Number(row.balance_usd) || 0));
    }
  }
  return summary;
}

/** Estado que debe mostrar la UI según el saldo y el uso real del anticipo. */
export function resolveAdvanceStatus(row: Pick<AdvanceLike, 'applied_usd' | 'refunded_usd' | 'balance_usd' | 'status'>): AdvanceStatus {
  if (row.status === 'ANULADO') return 'ANULADO';
  if (round2(row.balance_usd) > 0.005) return 'DISPONIBLE';
  if (round2(row.applied_usd) > 0.005) return 'APLICADO';
  return 'DEVUELTO';
}

export function advanceStatusLabel(status: AdvanceStatus): string {
  switch (status) {
    case 'DISPONIBLE':
      return 'Disponible';
    case 'APLICADO':
      return 'Aplicado';
    case 'DEVUELTO':
      return 'Devuelto';
    case 'ANULADO':
      return 'Anulado';
    default:
      return 'Disponible';
  }
}
