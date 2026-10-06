// Bimonetary currency management for Frenyer ERP

export const DEFAULT_EXCHANGE_RATE = 871.37;
const RATE_STORAGE_KEY = 'frenyer_active_exchange_rate';

export function getActiveExchangeRate(): number {
  if (typeof window === 'undefined') return DEFAULT_EXCHANGE_RATE;
  const stored = localStorage.getItem(RATE_STORAGE_KEY);
  if (stored) {
    const parsed = parseFloat(stored);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_EXCHANGE_RATE;
}

export function setActiveExchangeRate(rate: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RATE_STORAGE_KEY, rate.toString());
  window.dispatchEvent(new CustomEvent('frenyer:rate-changed', { detail: { rate } }));
}

/**
 * Converts a base USD amount to Venezuelan Bolívares (VES) using the current rate
 */
export function convertUSDtoVES(amountUSD: number, customRate?: number): number {
  const rate = customRate !== undefined ? customRate : getActiveExchangeRate();
  // Strictly round to 2 decimal places to avoid cent discrepancies in accounting
  return Math.round((amountUSD * rate) * 100) / 100;
}

/**
 * Converts a VES payment amount back to USD using the current rate
 */
export function convertVEStoUSD(amountVES: number, customRate?: number): number {
  const rate = customRate !== undefined ? customRate : getActiveExchangeRate();
  if (rate <= 0) return 0;
  return Math.round((amountVES / rate) * 100) / 100;
}

/**
 * Formats a USD amount as standard currency string ($ 10.00 / USD 10.00)
 */
export function formatUSD(amount: number, prefix: string = 'USD '): string {
  return `${prefix}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formats a Bolívares (VES) amount as standard currency string (Bs. 8.713,70)
 */
export function formatVES(amount: number, prefix: string = 'Bs. '): string {
  return `${prefix}${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formats a product USD price into a dual-currency pair (USD and calculated VES)
 */
export function getDualPrice(amountUSD: number, customRate?: number) {
  const rate = customRate !== undefined ? customRate : getActiveExchangeRate();
  const amountVES = convertUSDtoVES(amountUSD, rate);
  return {
    usd: formatUSD(amountUSD),
    ves: formatVES(amountVES),
    rawUSD: amountUSD,
    rawVES: amountVES,
    rate
  };
}

/**
 * Regla CPP (Costo Promedio Ponderado para compras de inventario)
 * CPP_Nuevo = ((Stock_Actual * Costo_Anterior) + (Cantidad_Comprada * Costo_Compra)) / (Stock_Actual + Cantidad_Comprada)
 */
export function calculateWeightedAverageCost(
  currentStock: number,
  currentCostUSD: number,
  purchasedQty: number,
  purchaseCostUSD: number
): number {
  const totalStock = currentStock + purchasedQty;
  if (totalStock <= 0) return purchaseCostUSD || currentCostUSD || 0;
  const totalValue = (currentStock * currentCostUSD) + (purchasedQty * purchaseCostUSD);
  return Math.round((totalValue / totalStock) * 100) / 100;
}

/**
 * Regla de la Tasa Futura y Selección de Tasa BCV:
 * "en el momento de buscar el valor de la tasa, si existe una tasa futura es la que grabaras, de lo contrario te quedas con la tasa actual."
 */
export function determineEffectiveRate(currentRate: number, futureRate?: number | null): {
  effectiveRate: number;
  isFutureApplied: boolean;
  futureRateHigher: boolean;
} {
  if (futureRate !== null && futureRate !== undefined && futureRate > 0) {
    return {
      effectiveRate: futureRate,
      isFutureApplied: true,
      futureRateHigher: futureRate > currentRate
    };
  }
  return {
    effectiveRate: currentRate,
    isFutureApplied: false,
    futureRateHigher: false
  };
}

export function isFutureRateTime(referenceDate: Date = new Date()): boolean {
  // Caracas is UTC-4
  const utcHours = referenceDate.getUTCHours();
  const caracasHour = (utcHours - 4 + 24) % 24;
  return caracasHour >= 16;
}

export function isFutureExchangeRate(): boolean {
  if (typeof window === 'undefined') return isFutureRateTime();
  const stored = localStorage.getItem('frenyer_bcv_is_future');
  if (stored !== null) return stored === 'true';
  return isFutureRateTime();
}

/**
 * Regla CxC: Amortización de deuda en USD liquidada en Bolívares a la tasa del día del abono
 */
export function calculateDebtPayment(
  originalDebtUSD: number,
  paymentVES: number,
  rateAtPaymentDay: number
): { remainingDebtUSD: number; amortizedUSD: number; paymentVES: number } {
  const amortizedUSD = convertVEStoUSD(paymentVES, rateAtPaymentDay);
  const remainingDebtUSD = Math.max(0, Math.round((originalDebtUSD - amortizedUSD) * 100) / 100);
  return {
    remainingDebtUSD,
    amortizedUSD,
    paymentVES
  };
}

/**
 * Regla de Clasificación Heurística de Gastos
 */
export function classifyExpenseConcept(concept: string): string {
  const normalized = concept.toLowerCase().trim();
  if (/nomina|sueldo|salario|quincena|pago personal|empleado/.test(normalized)) {
    return 'Nómina y Sueldos';
  }
  if (/luz|corpoelec|agua|hidrocapital|cantv|internet|aseo|servicio/.test(normalized)) {
    return 'Servicios Públicos';
  }
  if (/alquiler|arrendamiento|canon|local/.test(normalized)) {
    return 'Alquileres';
  }
  if (/seniat|impuesto|patente|alcaldia|timbre|tasa fiscal/.test(normalized)) {
    return 'Tributos e Impuestos';
  }
  if (/flete|transporte|envio|delivery|acarreo|encomienda/.test(normalized)) {
    return 'Fletes y Envíos';
  }
  if (/mantenimiento|reparacion|pintura|repuesto/.test(normalized)) {
    return 'Mantenimiento y Reparaciones';
  }
  return 'Gastos Generales';
}

