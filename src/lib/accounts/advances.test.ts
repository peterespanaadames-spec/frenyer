import { describe, expect, it } from 'vitest';
import {
  advanceBankAmount,
  advanceInvariantHolds,
  advanceToUsd,
  resolveAdvanceStatus,
  round2,
  summarizeAdvances,
  validateAdvanceApplication,
  validateAdvanceDraft,
  validateAdvanceRefund
} from './advances';

describe('redondeo y conversión bimonetaria', () => {
  it('redondea a dos decimales exactos', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(10.004)).toBe(10);
    expect(round2(Number.NaN)).toBe(0);
  });

  it('convierte un anticipo en bolívares a dólares canónicos', () => {
    expect(advanceToUsd(877.9, 'VES', 877.9)).toBe(1);
    expect(advanceToUsd(1000, 'VES', 400)).toBe(2.5);
    expect(advanceToUsd(100, 'USD', 877.9)).toBe(100);
  });

  it('acredita la cuenta en su propia moneda sin doble conversión', () => {
    // Anticipo en USD a cuenta VES
    expect(advanceBankAmount(100, 100, 'USD', 'VES', 400)).toBe(40000);
    // Anticipo en VES a cuenta VES: se acredita lo recibido
    expect(advanceBankAmount(25, 10000, 'VES', 'VES', 400)).toBe(10000);
    // Anticipo en VES a cuenta USD: se acredita el equivalente
    expect(advanceBankAmount(25, 10000, 'VES', 'USD', 400)).toBe(25);
  });
});

describe('validación del registro de anticipo', () => {
  const base = {
    customerId: 'c1',
    bankAccountId: 'b1',
    amountOriginal: 100,
    currency: 'USD' as const,
    rate: 400
  };

  it('acepta un borrador completo', () => {
    expect(validateAdvanceDraft(base).ok).toBe(true);
  });

  it('exige cliente y cuenta bancaria', () => {
    expect(validateAdvanceDraft({ ...base, customerId: null }).ok).toBe(false);
    expect(validateAdvanceDraft({ ...base, bankAccountId: '' }).ok).toBe(false);
  });

  it('bloquea montos no positivos y tasas inválidas en VES', () => {
    expect(validateAdvanceDraft({ ...base, amountOriginal: 0 }).ok).toBe(false);
    expect(validateAdvanceDraft({ ...base, currency: 'VES', rate: 0 }).ok).toBe(false);
  });
});

describe('invariantes de aplicación y devolución', () => {
  it('impide aplicar más que el saldo disponible del anticipo', () => {
    const result = validateAdvanceApplication({ amountUsd: 150, availableUsd: 100, receivableBalanceUsd: 500 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('saldo disponible');
  });

  it('impide aplicar más que el saldo pendiente de la cuenta por cobrar', () => {
    const result = validateAdvanceApplication({ amountUsd: 80, availableUsd: 100, receivableBalanceUsd: 50 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('cuenta por cobrar');
  });

  it('permite aplicar parcial y total dentro de los límites', () => {
    expect(validateAdvanceApplication({ amountUsd: 40, availableUsd: 100, receivableBalanceUsd: 500 }).ok).toBe(true);
    expect(validateAdvanceApplication({ amountUsd: 100, availableUsd: 100, receivableBalanceUsd: 100 }).ok).toBe(true);
  });

  it('impide devolver más que el saldo disponible o sin fondos en el banco', () => {
    expect(validateAdvanceRefund({ amountUsd: 120, availableUsd: 100, bankBalance: 9999, bankCurrency: 'USD', rate: 400 }).ok).toBe(false);
    expect(validateAdvanceRefund({ amountUsd: 100, availableUsd: 100, bankBalance: 50, bankCurrency: 'USD', rate: 400 }).ok).toBe(false);
    expect(validateAdvanceRefund({ amountUsd: 100, availableUsd: 100, bankBalance: 100, bankCurrency: 'USD', rate: 400 }).ok).toBe(true);
  });

  it('mantiene aplicado + devuelto <= total y saldo derivado', () => {
    expect(advanceInvariantHolds({ amount_usd: 100, applied_usd: 40, refunded_usd: 60, balance_usd: 0 })).toBe(true);
    expect(advanceInvariantHolds({ amount_usd: 100, applied_usd: 40, refunded_usd: 70, balance_usd: -10 })).toBe(false);
    expect(advanceInvariantHolds({ amount_usd: 100, applied_usd: 40, refunded_usd: 10, balance_usd: 50 })).toBe(true);
    expect(advanceInvariantHolds({ amount_usd: 100, applied_usd: 40, refunded_usd: 10, balance_usd: 49 })).toBe(false);
  });
});

describe('resumen y estado', () => {
  it('separa el saldo de anticipos del resto de la cartera', () => {
    const summary = summarizeAdvances([
      { amount_usd: 100, applied_usd: 40, refunded_usd: 0, balance_usd: 60, status: 'DISPONIBLE' },
      { amount_usd: 50, applied_usd: 50, refunded_usd: 0, balance_usd: 0, status: 'APLICADO' },
      { amount_usd: 30, applied_usd: 0, refunded_usd: 30, balance_usd: 0, status: 'DEVUELTO' },
      { amount_usd: 20, applied_usd: 0, refunded_usd: 20, balance_usd: 0, status: 'ANULADO' }
    ]);
    expect(summary.total_usd).toBe(200);
    expect(summary.available_usd).toBe(60);
    expect(summary.applied_usd).toBe(90);
    expect(summary.refunded_usd).toBe(50);
    expect(summary.count).toBe(4);
  });

  it('resuelve el estado visible a partir del saldo real', () => {
    expect(resolveAdvanceStatus({ applied_usd: 0, refunded_usd: 0, balance_usd: 100, status: 'DISPONIBLE' })).toBe('DISPONIBLE');
    expect(resolveAdvanceStatus({ applied_usd: 100, refunded_usd: 0, balance_usd: 0, status: 'DISPONIBLE' })).toBe('APLICADO');
    expect(resolveAdvanceStatus({ applied_usd: 0, refunded_usd: 100, balance_usd: 0, status: 'DISPONIBLE' })).toBe('DEVUELTO');
    expect(resolveAdvanceStatus({ applied_usd: 0, refunded_usd: 100, balance_usd: 0, status: 'ANULADO' })).toBe('ANULADO');
  });
});
