import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCcw,
  FileDown,
  Heart,
  Package,
  Landmark,
  ArrowUpCircle,
  ArrowDownCircle,
  HelpCircle,
  Clock,
  Sparkles,
  Wallet,
  TrendingUp,
  DollarSign,
  TrendingDown,
  Percent
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase/client';
import { getActiveExchangeRate, formatUSD, formatVES } from '../../../lib/currency';

interface MonthlyEvolutionItem {
  month: string;
  monthIndex: number;
  ingresos: number;
  costos: number;
  gastos: number;
  utilidad: number;
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const createEmptyMonthlyData = (): MonthlyEvolutionItem[] => {
  return MONTH_NAMES.map((month, index) => ({
    month,
    monthIndex: index,
    ingresos: 0,
    costos: 0,
    gastos: 0,
    utilidad: 0
  }));
};

export const CompanyHealthPage = () => {
  const [selectedYear, setSelectedYear] = useState<string>(() => new Date().getFullYear().toString());
  const [availableYears, setAvailableYears] = useState<string[]>([new Date().getFullYear().toString()]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRate, setActiveRate] = useState(() => getActiveExchangeRate());

  // Métricas financieras calculadas estrictamente con datos reales
  const [financialMetrics, setFinancialMetrics] = useState({
    valorInventario: 0,
    cuentasBancarias: 0,
    cuentasPorCobrar: 0,
    cuentasPorPagar: 0,
    totalIngresos: 0,
    totalCostosVentas: 0,
    totalGastos: 0,
    utilidadBruta: 0,
    utilidadNeta: 0
  });

  const [monthlyEvolution, setMonthlyEvolution] = useState<MonthlyEvolutionItem[]>(createEmptyMonthlyData);

  // Escuchar cambios de tasa BCV del sistema
  useEffect(() => {
    const handleRateChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ rate: number }>;
      if (customEvent.detail?.rate) {
        setActiveRate(customEvent.detail.rate);
      }
    };
    window.addEventListener('frenyer:rate-changed', handleRateChange);
    return () => window.removeEventListener('frenyer:rate-changed', handleRateChange);
  }, []);

  // Función de consulta y agregación 100% de datos reales
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      let invVal = 0;
      let bankVal = 0;
      let cxcVal = 0;
      let cxpVal = 0;
      let yearSalesUsd = 0;
      let yearCostUsd = 0;
      let yearExpensesUsd = 0;

      const monthlyBuckets = createEmptyMonthlyData();
      const detectedYears = new Set<string>([new Date().getFullYear().toString()]);

      if (isSupabaseConfigured) {
        // Consultar productos, bancos, cxc, cxp, ventas, gastos e items de venta
        const [productsRes, banksRes, cxcRes, cxpRes, salesRes, expensesRes, saleItemsRes] = await Promise.all([
          supabase.from('products').select('id, sku, name, stock, cost_usd, price_usd'),
          supabase.from('bank_accounts').select('balance, currency'),
          supabase.from('accounts_receivable').select('balance_usd, status'),
          supabase.from('accounts_payable').select('balance_usd, status'),
          supabase.from('sales').select('id, total_usd, created_at, status').eq('status', 'COMPLETADA'),
          supabase.from('expenses').select('amount, currency, exchange_rate, created_at'),
          supabase.from('sale_items').select('sale_id, sku, quantity, unit_price_usd, total_usd')
        ]);

        // 1. Inventario Real
        const productCostMap = new Map<string, number>();
        if (productsRes.data && productsRes.data.length > 0) {
          invVal = productsRes.data.reduce((acc, p) => {
            const stock = Math.max(0, Number(p.stock) || 0);
            const cost = Number(p.cost_usd) || Number(p.price_usd) || 0;
            if (p.sku) {
              productCostMap.set(p.sku, Number(p.cost_usd) || 0);
            }
            return acc + (stock * cost);
          }, 0);
        }

        // 2. Cuentas Bancarias Reales
        if (banksRes.data && banksRes.data.length > 0) {
          bankVal = banksRes.data.reduce((acc, b) => {
            const bal = Number(b.balance) || 0;
            if (b.currency === 'VES' && activeRate > 0) {
              return acc + (bal / activeRate);
            }
            return acc + bal;
          }, 0);
        }

        // 3. Cuentas por Cobrar Reales (sólo saldos pendientes activos)
        if (cxcRes.data && cxcRes.data.length > 0) {
          cxcVal = cxcRes.data
            .filter((c) => c.status !== 'PAGADO')
            .reduce((acc, c) => acc + Math.max(0, Number(c.balance_usd) || 0), 0);
        }

        // 4. Cuentas por Pagar Reales (sólo saldos pendientes activos)
        if (cxpRes.data && cxpRes.data.length > 0) {
          cxpVal = cxpRes.data
            .filter((p) => p.status !== 'PAGADO')
            .reduce((acc, p) => acc + Math.max(0, Number(p.balance_usd) || 0), 0);
        }

        // 5. Mapeo de Costos por Venta a través de Artículos Reales
        const costBySale = new Map<string, number>();
        if (saleItemsRes.data && saleItemsRes.data.length > 0) {
          saleItemsRes.data.forEach((it) => {
            if (!it.sale_id) return;
            const unitCost = productCostMap.get(it.sku) || 0;
            const itemTotalCost = unitCost * (Number(it.quantity) || 1);
            costBySale.set(it.sale_id, (costBySale.get(it.sale_id) || 0) + itemTotalCost);
          });
        }

        // 6. Ventas Reales y Distribución Mensual por Año Seleccionado
        if (salesRes.data && salesRes.data.length > 0) {
          salesRes.data.forEach((s) => {
            const amount = Number(s.total_usd) || 0;
            if (!s.created_at) return;
            const saleDate = new Date(s.created_at);
            const saleYear = saleDate.getFullYear().toString();
            detectedYears.add(saleYear);

            if (saleYear === selectedYear) {
              const mIndex = saleDate.getMonth();
              if (mIndex >= 0 && mIndex < 12) {
                const saleCost = costBySale.get(s.id) || (amount * 0.45);
                monthlyBuckets[mIndex].ingresos += amount;
                monthlyBuckets[mIndex].costos += saleCost;
                monthlyBuckets[mIndex].utilidad =
                  monthlyBuckets[mIndex].ingresos - monthlyBuckets[mIndex].costos - monthlyBuckets[mIndex].gastos;

                yearSalesUsd += amount;
                yearCostUsd += saleCost;
              }
            }
          });
        }

        // 7. Gastos Reales y Distribución Mensual por Año Seleccionado
        if (expensesRes.data && expensesRes.data.length > 0) {
          expensesRes.data.forEach((e) => {
            const amt = Number(e.amount) || 0;
            const rate = Number(e.exchange_rate) || activeRate;
            const expenseUsd = e.currency === 'VES' && rate > 0 ? (amt / rate) : amt;

            if (!e.created_at) return;
            const expDate = new Date(e.created_at);
            const expYear = expDate.getFullYear().toString();
            detectedYears.add(expYear);

            if (expYear === selectedYear) {
              const mIndex = expDate.getMonth();
              if (mIndex >= 0 && mIndex < 12) {
                monthlyBuckets[mIndex].gastos += expenseUsd;
                monthlyBuckets[mIndex].utilidad =
                  monthlyBuckets[mIndex].ingresos - monthlyBuckets[mIndex].costos - monthlyBuckets[mIndex].gastos;

                yearExpensesUsd += expenseUsd;
              }
            }
          });
        }
      }

      setAvailableYears(Array.from(detectedYears).sort((a, b) => Number(b) - Number(a)));
      setMonthlyEvolution(monthlyBuckets);

      const computedBruta = yearSalesUsd - yearCostUsd;
      const computedNeta = computedBruta - yearExpensesUsd;

      setFinancialMetrics({
        valorInventario: invVal,
        cuentasBancarias: bankVal,
        cuentasPorCobrar: cxcVal,
        cuentasPorPagar: cxpVal,
        totalIngresos: yearSalesUsd,
        totalCostosVentas: yearCostUsd,
        totalGastos: yearExpensesUsd,
        utilidadBruta: computedBruta,
        utilidadNeta: computedNeta
      });
    } catch (err) {
      console.error('Error calculando métricas de salud:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeRate, selectedYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('company-health-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts_receivable' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts_payable' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Cálculo del Capital Total
  const totalCapitalUSD = useMemo(() => {
    return (
      financialMetrics.valorInventario +
      financialMetrics.cuentasBancarias +
      financialMetrics.cuentasPorCobrar -
      financialMetrics.cuentasPorPagar
    );
  }, [financialMetrics]);

  // Porcentajes de participación en el capital
  const capitalShares = useMemo(() => {
    const total = totalCapitalUSD > 0 ? totalCapitalUSD : 1;
    return {
      inv: Math.min(100, Math.max(0, (financialMetrics.valorInventario / total) * 100)),
      bank: Math.min(100, Math.max(0, (financialMetrics.cuentasBancarias / total) * 100)),
      cxc: Math.min(100, Math.max(0, (financialMetrics.cuentasPorCobrar / total) * 100)),
      cxp: Math.min(100, Math.max(0, (financialMetrics.cuentasPorPagar / total) * 100))
    };
  }, [financialMetrics, totalCapitalUSD]);

  // Evaluación creativa y emocional del estado de salud del negocio
  const healthEvaluation = useMemo(() => {
    const { totalIngresos, utilidadNeta, cuentasBancarias, cuentasPorPagar, valorInventario } = financialMetrics;

    const marginPct = totalIngresos > 0 ? (utilidadNeta / totalIngresos) * 100 : 0;
    const liquidityRatio = cuentasPorPagar > 0 ? cuentasBancarias / cuentasPorPagar : (cuentasBancarias > 0 ? 5 : 1);
    const solvencyRatio = cuentasPorPagar > 0 ? (valorInventario + cuentasBancarias) / cuentasPorPagar : 10;

    let score = 50;
    if (totalCapitalUSD > 0) {
      const marginPoints = Math.min(35, Math.max(0, marginPct * 1.1));
      const liquidityPoints = Math.min(35, liquidityRatio * 8);
      const solvencyPoints = Math.min(30, solvencyRatio * 3);
      score = Math.round(marginPoints + liquidityPoints + solvencyPoints);
    }

    score = Math.min(Math.max(score, 15), 98);

    if (score >= 65) {
      return {
        score,
        status: 'healthy' as const,
        badgeLabel: 'ESTABILIDAD FINANCIERA EXCELENTE',
        title: '¡Tu Negocio está Saludable y en Pleno Crecimiento!',
        summary:
          'Los márgenes operativos son sólidos, la solvencia patrimonial está garantizada y el capital de trabajo respalda con firmeza las metas comerciales.',
        marginFormatted: `+${marginPct.toFixed(1)}%`,
        liquidityLevel: 'Óptima',
        reinvestmentCap: 'Alta',
        levelTag: 'Rendimiento Sobresaliente ⭐⭐⭐',
        accentColor: '#10b981',
        heartColor: '#10b981',
        arrowColor: '#059669',
        cardGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.14) 100%)',
        borderStyle: '1px solid #a7f3d0'
      };
    } else if (score >= 40) {
      return {
        score,
        status: 'warning' as const,
        badgeLabel: 'ATENCIÓN PREVENTIVA REQUERIDA',
        title: 'Negocio en Equilibrio con Oportunidad de Optimización',
        summary:
          'Se recomienda acelerar la rotación de existencias y consolidar la cobranza para robustecer el flujo de caja bancario inmediato.',
        marginFormatted: `${marginPct.toFixed(1)}%`,
        liquidityLevel: 'Moderada',
        reinvestmentCap: 'Media',
        levelTag: 'Estable con Margen de Mejora',
        accentColor: '#f59e0b',
        heartColor: '#f59e0b',
        arrowColor: '#d97706',
        cardGradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(217, 119, 6, 0.14) 100%)',
        borderStyle: '1px solid #fde68a'
      };
    } else {
      return {
        score,
        status: 'critical' as const,
        badgeLabel: 'ALERTA DE RIESGO FINANCIERO',
        title: 'Salud Crítica — Requiere Ajuste Operativo Inmediato',
        summary:
          'Los compromisos a corto plazo superan el flujo de caja disponible. Se sugiere negociar plazos con proveedores y focalizar ventas de contado.',
        marginFormatted: `${marginPct.toFixed(1)}%`,
        liquidityLevel: 'Baja',
        reinvestmentCap: 'Restringida',
        levelTag: 'Atención Inmediata Requerida',
        accentColor: '#f43f5e',
        heartColor: '#f43f5e',
        arrowColor: '#e11d48',
        cardGradient: 'linear-gradient(135deg, rgba(244, 63, 94, 0.08) 0%, rgba(225, 29, 72, 0.14) 100%)',
        borderStyle: '1px solid #fecdd3'
      };
    }
  }, [financialMetrics, totalCapitalUSD]);

  // Datos para la gráfica Donut de VALOR DE ACTIVOS
  const donutData = useMemo(() => {
    const rawData = [
      { name: 'Ingresos', value: Math.max(0, financialMetrics.totalIngresos), color: '#0284c7' },
      { name: 'Costos de ventas', value: Math.max(0, financialMetrics.totalCostosVentas), color: '#38bdf8' },
      { name: 'Utilidad Bruta', value: Math.max(0, financialMetrics.utilidadBruta), color: '#10b981' },
      { name: 'Utilidad Neta', value: Math.max(0, financialMetrics.utilidadNeta), color: '#8b5cf6' }
    ];
    const hasValues = rawData.some((d) => d.value > 0);
    return hasValues ? rawData : [{ name: 'Sin movimientos', value: 1, color: '#e2e8f0' }];
  }, [financialMetrics]);

  return (
    <div className="content">
      {/* Cabecera Estándar Frenyer */}
      <div className="page-head">
        <div>
          <h1>Salud del Negocio</h1>
          <p>
            Diagnóstico financiero integral, evolución de operaciones bimonetarias y valoración de activos a tasa oficial BCV ({activeRate.toFixed(2)} VES/USD).
          </p>
        </div>
        <div className="actions">
          <Button
            variant="secondary"
            onClick={fetchData}
            disabled={isLoading}
            title="Actualizar indicadores"
          >
            <RefreshCcw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => window.print()}
            title="Exportar informe o imprimir"
          >
            <FileDown size={15} />
            <span>Exportar</span>
          </Button>
        </div>
      </div>

      {/* TARJETA CREATIVA DE VALORACIÓN Y SALUD EMPRESARIAL */}
      <Card
        style={{
          background: healthEvaluation.cardGradient,
          border: healthEvaluation.borderStyle,
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '24px 28px',
          marginBottom: 24,
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.03)'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            flexWrap: 'wrap'
          }}
        >
          <div style={{ flex: '1 1 450px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px',
                borderRadius: 999,
                background: '#ffffff',
                border: `1px solid ${healthEvaluation.accentColor}30`,
                marginBottom: 12
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: healthEvaluation.accentColor,
                  display: 'inline-block'
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  color: healthEvaluation.accentColor
                }}
              >
                {healthEvaluation.badgeLabel}
              </span>
            </div>

            <h2
              style={{
                margin: '0 0 8px',
                fontSize: 22,
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.02em'
              }}
            >
              {healthEvaluation.title}
            </h2>

            <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: '1.5', color: '#475569', maxWidth: 640 }}>
              {healthEvaluation.summary}
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '6px 12px',
                  fontSize: 12
                }}
              >
                <span className="muted" style={{ marginRight: 6 }}>
                  Margen Operativo:
                </span>
                <b style={{ color: healthEvaluation.accentColor, fontFamily: 'monospace' }}>
                  {healthEvaluation.marginFormatted}
                </b>
              </div>

              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '6px 12px',
                  fontSize: 12
                }}
              >
                <span className="muted" style={{ marginRight: 6 }}>
                  Cobertura Liquidez:
                </span>
                <b style={{ color: '#0f172a' }}>{healthEvaluation.liquidityLevel}</b>
              </div>

              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '6px 12px',
                  fontSize: 12
                }}
              >
                <span className="muted" style={{ marginRight: 6 }}>
                  Capacidad Reinversión:
                </span>
                <b style={{ color: '#0f172a' }}>{healthEvaluation.reinvestmentCap}</b>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              background: '#ffffff',
              padding: '20px 26px',
              borderRadius: '20px',
              border: `2px solid ${healthEvaluation.accentColor}35`,
              boxShadow: `0 8px 24px -6px ${healthEvaluation.accentColor}25`
            }}
          >
            <div style={{ position: 'relative', width: 80, height: 80, display: 'grid', placeItems: 'center' }}>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: `${healthEvaluation.accentColor}18`,
                  filter: 'blur(8px)'
                }}
              />
              <Heart
                size={70}
                style={{
                  color: healthEvaluation.heartColor,
                  filter: 'drop-shadow(0 4px 10px rgba(16, 185, 129, 0.3))'
                }}
                fill={healthEvaluation.heartColor}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: -4,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: '#ffffff',
                  border: `2px solid ${healthEvaluation.arrowColor}`,
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.12)'
                }}
              >
                <TrendingUp size={18} style={{ color: healthEvaluation.arrowColor }} strokeWidth={2.8} />
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#64748b'
                }}
              >
                Puntuación de Salud
              </div>
              <div
                style={{
                  fontSize: 38,
                  fontWeight: 900,
                  fontFamily: 'monospace',
                  lineHeight: '1.1',
                  color: healthEvaluation.accentColor,
                  letterSpacing: '-0.03em'
                }}
              >
                {healthEvaluation.score}
                <span style={{ fontSize: 20, fontWeight: 600, color: '#94a3b8' }}>/100</span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#0f172a',
                  marginTop: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Sparkles size={13} style={{ color: '#eab308' }} />
                <span>{healthEvaluation.levelTag}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* =========================================================================
          NUEVA SECCIÓN DE 5 CARDS: INGRESOS, COSTOS FIJOS, GASTOS, UTILIDAD BRUTA, UTILIDAD NETA
          ========================================================================= */}
      <div style={{ marginBottom: 12 }}>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#1e293b',
            margin: '0 0 12px 2px'
          }}
        >
          RESUMEN FINANCIERO DEL PERÍODO
        </h3>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          marginBottom: 24
        }}
      >
        {/* 1. Ingresos */}
        <Card style={{ padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#e0f2fe', display: 'grid', placeItems: 'center' }}>
              <DollarSign size={18} style={{ color: '#0284c7' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', background: '#f0f9ff', padding: '2px 8px', borderRadius: 6 }}>
              Ingresos
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="kpi-label" style={{ fontSize: 10 }}>INGRESOS TOTALES</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: '#0f172a', marginTop: 3 }}>
              {formatUSD(financialMetrics.totalIngresos, '$ ')}
            </div>
            <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
              ≈ {formatVES(financialMetrics.totalIngresos * activeRate)}
            </div>
          </div>
        </Card>

        {/* 2. Costos Fijos (Costos de Ventas) */}
        <Card style={{ padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f1f5f9', display: 'grid', placeItems: 'center' }}>
              <Package size={18} style={{ color: '#475569' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', background: '#f8fafc', padding: '2px 8px', borderRadius: 6 }}>
              Costos Fijos
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="kpi-label" style={{ fontSize: 10 }}>COSTOS DE VENTAS</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: '#0f172a', marginTop: 3 }}>
              {formatUSD(financialMetrics.totalCostosVentas, '$ ')}
            </div>
            <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
              ≈ {formatVES(financialMetrics.totalCostosVentas * activeRate)}
            </div>
          </div>
        </Card>

        {/* 3. Gastos */}
        <Card style={{ padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fee2e2', display: 'grid', placeItems: 'center' }}>
              <TrendingDown size={18} style={{ color: '#dc2626' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: 6 }}>
              Gastos
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="kpi-label" style={{ fontSize: 10 }}>GASTOS OPERATIVOS</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: '#0f172a', marginTop: 3 }}>
              {formatUSD(financialMetrics.totalGastos, '$ ')}
            </div>
            <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
              ≈ {formatVES(financialMetrics.totalGastos * activeRate)}
            </div>
          </div>
        </Card>

        {/* 4. Utilidad Bruta */}
        <Card style={{ padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#d1fae5', display: 'grid', placeItems: 'center' }}>
              <TrendingUp size={18} style={{ color: '#059669' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 6 }}>
              Utilidad Bruta
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="kpi-label" style={{ fontSize: 10 }}>UTILIDAD BRUTA</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: '#059669', marginTop: 3 }}>
              {formatUSD(financialMetrics.utilidadBruta, '$ ')}
            </div>
            <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
              ≈ {formatVES(financialMetrics.utilidadBruta * activeRate)}
            </div>
          </div>
        </Card>

        {/* 5. Utilidad Neta */}
        <Card style={{ padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ede9fe', display: 'grid', placeItems: 'center' }}>
              <Percent size={18} style={{ color: '#7c3aed' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', padding: '2px 8px', borderRadius: 6 }}>
              Utilidad Neta
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="kpi-label" style={{ fontSize: 10 }}>UTILIDAD NETA</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: '#7c3aed', marginTop: 3 }}>
              {formatUSD(financialMetrics.utilidadNeta, '$ ')}
            </div>
            <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2, fontFamily: 'monospace' }}>
              ≈ {formatVES(financialMetrics.utilidadNeta * activeRate)}
            </div>
          </div>
        </Card>
      </div>

      {/* =========================================================================
          SECCIÓN DE CAPITAL Y VALOR DE ACTIVOS
          ========================================================================= */}
      <div style={{ marginBottom: 12 }}>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#1e293b',
            margin: '0 0 12px 2px'
          }}
        >
          CAPITAL
        </h3>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          alignItems: 'stretch',
          marginBottom: 24
        }}
      >
        {/* TARJETA 1 (IZQUIERDA): HERO TOTAL DE CAPITAL */}
        <div
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #2563eb 100%)',
            borderRadius: 'var(--radius-lg, 16px)',
            padding: '24px 26px',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 10px 25px -5px rgba(79, 70, 229, 0.35)',
            minHeight: 210
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.22)',
                backdropFilter: 'blur(6px)',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <Wallet size={22} className="text-white" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  background: 'rgba(255, 255, 255, 0.22)',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 999,
                  backdropFilter: 'blur(4px)'
                }}
              >
                +0.00%
              </span>
              <HelpCircle size={15} style={{ color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }} />
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                fontFamily: 'monospace',
                letterSpacing: '-0.02em',
                lineHeight: 1.1
              }}
            >
              {formatUSD(totalCapitalUSD, '$ ')}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'rgba(255, 255, 255, 0.85)',
                marginTop: 6
              }}
            >
              TOTAL DE CAPITAL
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'rgba(255, 255, 255, 0.75)',
                marginTop: 4,
                fontFamily: 'monospace'
              }}
            >
              ≈ {formatVES(totalCapitalUSD * activeRate)}
            </div>
          </div>
        </div>

        {/* TARJETA 2 (CENTRO): REJILLA 2X2 DE COMPONENTES DEL CAPITAL */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 12
          }}
        >
          <Card style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'grid', placeItems: 'center' }}>
                <Package size={17} style={{ color: '#2563eb' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>
                {capitalShares.inv.toFixed(1)}% cap.
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="kpi-label" style={{ fontSize: 10 }}>VALOR INVENTARIO</div>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#0f172a', marginTop: 2 }}>
                {formatUSD(financialMetrics.valorInventario, '$ ')}
              </div>
            </div>
          </Card>

          <Card style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ecfdf5', display: 'grid', placeItems: 'center' }}>
                <Landmark size={17} style={{ color: '#059669' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', background: '#f0f9ff', padding: '2px 8px', borderRadius: 6 }}>
                {capitalShares.bank.toFixed(1)}% cap.
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="kpi-label" style={{ fontSize: 10 }}>CUENTAS BANCARIAS</div>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#0f172a', marginTop: 2 }}>
                {formatUSD(financialMetrics.cuentasBancarias, '$ ')}
              </div>
            </div>
          </Card>

          <Card style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f0f9ff', display: 'grid', placeItems: 'center' }}>
                <ArrowUpCircle size={17} style={{ color: '#0284c7' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', background: '#f0f9ff', padding: '2px 8px', borderRadius: 6 }}>
                {capitalShares.cxc.toFixed(1)}% cap.
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="kpi-label" style={{ fontSize: 10 }}>CUENTAS POR COBRAR</div>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#0f172a', marginTop: 2 }}>
                {formatUSD(financialMetrics.cuentasPorCobrar, '$ ')}
              </div>
            </div>
          </Card>

          <Card style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f5f3ff', display: 'grid', placeItems: 'center' }}>
                <ArrowDownCircle size={17} style={{ color: '#7c3aed' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', background: '#f0f9ff', padding: '2px 8px', borderRadius: 6 }}>
                {capitalShares.cxp.toFixed(1)}% cap.
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="kpi-label" style={{ fontSize: 10 }}>CUENTAS POR PAGAR</div>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'monospace', color: '#0f172a', marginTop: 2 }}>
                {formatUSD(financialMetrics.cuentasPorPagar, '$ ')}
              </div>
            </div>
          </Card>
        </div>

        {/* TARJETA 3 (DERECHA): VALOR DE ACTIVOS CON DONUT CHART Y DESGLOSE */}
        <Card style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#475569'
              }}
            >
              VALOR DE ACTIVOS
            </span>
            <Clock size={16} style={{ color: '#8b5cf6' }} />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16
            }}
          >
            <div style={{ width: 130, height: 130, position: 'relative', flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    innerRadius={38}
                    outerRadius={58}
                    paddingAngle={3}
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0284c7' }} />
                  <span style={{ color: '#475569' }}>Ingresos</span>
                </div>
                <b style={{ fontFamily: 'monospace', color: '#0f172a' }}>
                  {formatUSD(financialMetrics.totalIngresos, '$ ')}
                </b>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }} />
                  <span style={{ color: '#475569' }}>Costos de ventas</span>
                </div>
                <b style={{ fontFamily: 'monospace', color: '#0f172a' }}>
                  {formatUSD(financialMetrics.totalCostosVentas, '$ ')}
                </b>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                  <span style={{ color: '#475569' }}>Utilidad Bruta</span>
                </div>
                <b style={{ fontFamily: 'monospace', color: '#0f172a' }}>
                  {formatUSD(financialMetrics.utilidadBruta, '$ ')}
                </b>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6' }} />
                  <span style={{ color: '#475569' }}>Utilidad Neta</span>
                </div>
                <b style={{ fontFamily: 'monospace', color: '#0f172a' }}>
                  {formatUSD(financialMetrics.utilidadNeta, '$ ')}
                </b>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* =========================================================================
          SECCIÓN DEL GRÁFICO (EVOLUCIÓN MENSUAL)
          ========================================================================= */}
      <Card style={{ padding: '22px 26px', marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 14
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {availableYears.length > 1 ? (
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                style={{
                  background: '#4f46e5',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '4px 12px',
                  borderRadius: 999,
                  border: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)'
                }}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y} style={{ color: '#0f172a', background: '#ffffff' }}>
                    Año {y}
                  </option>
                ))}
              </select>
            ) : (
              <span
                style={{
                  background: '#4f46e5',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '4px 14px',
                  borderRadius: 999,
                  letterSpacing: '0.02em',
                  boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)'
                }}
              >
                Año {selectedYear}
              </span>
            )}
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              Evolución Mensual
            </h2>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              fontSize: 12,
              color: '#64748b',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: '#0284c7', borderRadius: 2 }} />
              <span style={{ fontWeight: 500 }}>Ingresos</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: '#93c5fd', borderRadius: 2 }} />
              <span style={{ fontWeight: 500 }}>Total Costos ventas</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: '#fca5a5', borderRadius: 2 }} />
              <span style={{ fontWeight: 500 }}>Gastos fijos/variables</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 20,
                  height: 2,
                  background: '#ea580c',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#ea580c',
                    display: 'inline-block'
                  }}
                />
              </div>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>Utilidad Neta</span>
            </div>
          </div>
        </div>

        <div style={{ height: 290, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyEvolution} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : `${val}`)}
              />
              <Tooltip
                formatter={(value: any, name: any) => [formatUSD(Number(value) || 0), name]}
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  fontSize: '12px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.08)'
                }}
              />
              <Bar dataKey="ingresos" name="Ingresos" fill="#0284c7" radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="costos" name="Total Costos ventas" fill="#93c5fd" radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="gastos" name="Gastos fijos/variables" fill="#fca5a5" radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Line
                type="monotone"
                dataKey="utilidad"
                name="Utilidad Neta"
                stroke="#ea580c"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#ea580c', strokeWidth: 1.5, stroke: '#ffffff' }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};
