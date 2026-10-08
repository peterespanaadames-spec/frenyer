import { useEffect, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { formatUSD } from '../lib/currency';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';

interface DashboardSale {
  id: string;
  doc_number: string;
  created_at: string;
  total_usd: number;
  status: string;
}

interface DashboardSummary {
  salesUsd: number;
  receivableUsd: number;
  stockUnits: number;
  lowStockProducts: number;
  sales: DashboardSale[];
  weeklySales: { day: string; total: number }[];
}

const EMPTY_SUMMARY: DashboardSummary = {
  salesUsd: 0,
  receivableUsd: 0,
  stockUnits: 0,
  lowStockProducts: 0,
  sales: [],
  weeklySales: []
};

function getWeekStart(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  return start;
}

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function Dashboard() {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const loadSummary = async () => {
      setIsLoading(true);
      setLoadError('');

      if (!isSupabaseConfigured) {
        setSummary(EMPTY_SUMMARY);
        setIsLoading(false);
        return;
      }

      try {
        const start = getWeekStart();
        const end = new Date();
        const [salesResult, receivablesResult, productsResult] = await Promise.all([
          supabase
            .from('sales')
            .select('id, doc_number, created_at, total_usd, status')
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString())
            .order('created_at', { ascending: false }),
          supabase
            .from('accounts_receivable')
            .select('balance_usd')
            .neq('status', 'PAGADO'),
          supabase
            .from('products')
            .select('stock, min_stock')
        ]);

        if (salesResult.error) throw salesResult.error;
        if (receivablesResult.error) throw receivablesResult.error;
        if (productsResult.error) throw productsResult.error;

        const sales = (salesResult.data || []) as DashboardSale[];
        const products = productsResult.data || [];
        const weeklySales = Array.from({ length: 7 }, (_, index) => {
          const day = new Date(start);
          day.setDate(start.getDate() + index);
          return {
            day: day.toLocaleDateString('es-VE', { weekday: 'short' }),
            date: getDateKey(day),
            total: 0
          };
        });
        const salesByDate = new Map(weeklySales.map((day) => [day.date, day]));

        for (const sale of sales) {
          const saleDateValue = new Date(sale.created_at);
          if (Number.isNaN(saleDateValue.getTime())) continue;
          const saleDate = getDateKey(saleDateValue);
          const day = salesByDate.get(saleDate);
          if (day) day.total += Number(sale.total_usd) || 0;
        }

        setSummary({
          salesUsd: sales.reduce((total, sale) => total + (Number(sale.total_usd) || 0), 0),
          receivableUsd: (receivablesResult.data || []).reduce(
            (total, record) => total + (Number(record.balance_usd) || 0),
            0
          ),
          stockUnits: products.reduce((total, product) => total + (Number(product.stock) || 0), 0),
          lowStockProducts: products.filter(
            (product) => Number(product.stock) <= Number(product.min_stock)
          ).length,
          sales,
          weeklySales: weeklySales.map(({ day, total }) => ({ day, total }))
        });
      } catch (error) {
        setSummary(EMPTY_SUMMARY);
        setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los indicadores desde Supabase.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadSummary();

    const handleReconfig = () => {
      void loadSummary();
    };
    window.addEventListener('frenyer:supabase-configured', handleReconfig);
    return () => window.removeEventListener('frenyer:supabase-configured', handleReconfig);
  }, []);

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Resumen operativo</h1>
          <p>Indicadores reales de los últimos siete días y de tu organización.</p>
        </div>
      </div>

      {loadError ? (
        <EmptyState title="No se pudieron cargar los indicadores" description={loadError} />
      ) : (
        <>
          <div className="grid grid-4">
            <Card>
              <div className="kpi-label">Ventas (últimos 7 días)</div>
              <div className="kpi-value">{isLoading ? '—' : formatUSD(summary.salesUsd)}</div>
              <div className="muted small">{isLoading ? 'Cargando datos...' : `${summary.sales.length} documentos`}</div>
            </Card>
            <Card>
              <div className="kpi-label">Cuentas por cobrar</div>
              <div className="kpi-value">{isLoading ? '—' : formatUSD(summary.receivableUsd)}</div>
              <div className="muted small">Saldo pendiente registrado</div>
            </Card>
            <Card>
              <div className="kpi-label">Inventario</div>
              <div className="kpi-value">{isLoading ? '—' : `${summary.stockUnits.toLocaleString('es-VE')} uds.`}</div>
              <div className="muted small">Unidades disponibles registradas</div>
            </Card>
            <Card>
              <div className="kpi-label">Productos bajo mínimo</div>
              <div className="kpi-value">{isLoading ? '—' : summary.lowStockProducts}</div>
              <div className="muted small">Según el mínimo configurado por producto</div>
            </Card>
          </div>

          <div className="grid grid-2" style={{ marginTop: 14 }}>
            <Card>
              <h3>Ventas de los últimos siete días</h3>
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={summary.weeklySales}>
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => formatUSD(Number(value))} />
                    <Area type="monotone" dataKey="total" stroke="#8b78e8" fill="#e9e2ff" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <h3>Ventas recientes</h3>
              {summary.sales.length === 0 && !isLoading ? (
                <p className="muted">No hay ventas registradas en este período.</p>
              ) : (
                summary.sales.slice(0, 5).map((sale) => (
                  <div
                    key={sale.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 8,
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border)'
                    }}
                  >
                    <div>
                      <b style={{ fontSize: 13 }}>{sale.doc_number}</b>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {Number.isNaN(new Date(sale.created_at).getTime())
                          ? '—'
                          : new Date(sale.created_at).toLocaleString('es-VE')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <b style={{ fontSize: 13 }}>{formatUSD(Number(sale.total_usd) || 0)}</b>
                      <div>
                        <Badge tone={sale.status === 'COMPLETADA' ? 'success' : 'warning'}>
                          {sale.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
