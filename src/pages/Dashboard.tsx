import { useEffect, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { formatUSD, getActiveExchangeRate } from '../lib/currency';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { authenticatedFetch } from '../lib/supabase/api';

interface Product {
  id: string;
  sku: string;
  name: string;
  stock: number;
  min_stock: number;
  cost_usd: number;
  price_usd: number;
}

interface TopProduct {
  name: string;
  totalQuantity: number;
}

interface DashboardSummary {
  salesUsd: number;
  monthlyProfit: number;
  receivableDueUsd: number;
  receivableDueCount: number;
  payableDueUsd: number;
  payableDueCount: number;
  stockUnits: number;
  lowStockProductsCount: number;
  topProducts: TopProduct[];
  lowStockProductsList: Product[];
}

const EMPTY_SUMMARY: DashboardSummary = {
  salesUsd: 0,
  monthlyProfit: 0,
  receivableDueUsd: 0,
  receivableDueCount: 0,
  payableDueUsd: 0,
  payableDueCount: 0,
  stockUnits: 0,
  lowStockProductsCount: 0,
  topProducts: [],
  lowStockProductsList: []
};

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
        const activeRate = getActiveExchangeRate();

        // 1. Consultar todos los datos requeridos (mismo esquema de Salud de Empresa)
        const [productsRes, salesRes, saleItemsRes, expensesRes, cxcRes, cxpRes] = await Promise.all([
          supabase.from('products').select('id, sku, name, stock, min_stock, cost_usd, price_usd'),
          supabase.from('sales').select('id, total_usd, created_at, status').eq('status', 'COMPLETADA'),
          supabase.from('sale_items').select('sale_id, sku, name, quantity, unit_price_usd, total_usd'),
          supabase.from('expenses').select('amount, currency, exchange_rate, created_at'),
          supabase.from('accounts_receivable').select('balance_usd, status'),
          supabase.from('accounts_payable').select('balance_usd, status')
        ]);

        const products = (productsRes.data || []) as Product[];
        const sales = salesRes.data || [];
        const saleItems = saleItemsRes.data || [];
        const expenses = expensesRes.data || [];

        // 2. Mapeo de costos de productos por SKU (idéntico a Salud de Empresa)
        const productCostMap = new Map<string, number>();
        const productMap = new Map<string, Product>();
        products.forEach((p) => {
          if (p.sku) productCostMap.set(p.sku, Number(p.cost_usd) || 0);
          if (p.id) productMap.set(p.id, p);
        });

        // 3. Mapeo de costos de venta a través de sale_items
        const costBySale = new Map<string, number>();
        saleItems.forEach((it: any) => {
          if (!it.sale_id) return;
          const unitCost = (it.sku ? productCostMap.get(it.sku) : 0) || 0;
          const itemTotalCost = unitCost * (Number(it.quantity) || 1);
          costBySale.set(it.sale_id, (costBySale.get(it.sale_id) || 0) + itemTotalCost);
        });

        // 4. Ingresos y Costos de Venta Reales
        let totalSalesUsd = 0;
        let totalCostUsd = 0;
        sales.forEach((s: any) => {
          const amount = Number(s.total_usd) || 0;
          const saleCost = costBySale.get(s.id) || (amount * 0.45);
          totalSalesUsd += amount;
          totalCostUsd += saleCost;
        });

        // 5. Gastos Operativos Reales (expenses)
        let totalExpensesUsd = 0;
        expenses.forEach((e: any) => {
          const amt = Number(e.amount) || 0;
          const rate = Number(e.exchange_rate) || activeRate || 1;
          const expenseUsd = e.currency === 'VES' && rate > 0 ? amt / rate : amt;
          totalExpensesUsd += expenseUsd;
        });

        // 6. Utilidad Neta (Fórmula de Salud de Empresa: Ingresos - Costos de Ventas - Gastos)
        const utilidadBruta = totalSalesUsd - totalCostUsd;
        const utilidadNeta = Math.round((utilidadBruta - totalExpensesUsd) * 100) / 100;

        // 7. Top 5 Productos Más Vendidos (agrupando por nombre real en sale_items)
        const productSales = new Map<string, number>();
        saleItems.forEach((it: any) => {
          const qty = Number(it.quantity) || 0;
          if (qty <= 0) return;
          const prodName = it.name || (it.sku ? productMap.get(it.sku)?.name : null) || it.sku || 'Producto';
          productSales.set(prodName, (productSales.get(prodName) || 0) + qty);
        });

        const topProducts: TopProduct[] = Array.from(productSales.entries())
          .map(([name, totalQuantity]) => ({ name, totalQuantity }))
          .sort((a, b) => b.totalQuantity - a.totalQuantity)
          .slice(0, 5);

        // 8. Productos con Bajo Stock (stock actual <= min_stock configurado)
        const lowStockProductsList = products
          .filter((p) => Number(p.stock) <= Number(p.min_stock))
          .sort((a, b) => Number(a.stock) - Number(b.stock))
          .slice(0, 5);

        // Helper: Evaluar si una cuenta vence en los próximos 21 días o corresponde al mes en curso
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const limit21Days = new Date(today.getTime() + 21 * 86400000);
        limit21Days.setHours(23, 59, 59, 999);
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        const isDueSoonOrThisMonth = (item: any): boolean => {
          const balance = Number(item.balance_usd ?? item.remaining_amount ?? 0);
          if (balance <= 0) return false;

          const st = String(item.status || '').toUpperCase();
          if (st === 'PAGADO' || st === 'PAGADA') return false;

          const rawDate = item.due_date || item.dueDate;
          if (!rawDate) {
            const created = item.created_at ? new Date(item.created_at) : null;
            if (created && !isNaN(created.getTime())) {
              return created.getFullYear() === currentYear && created.getMonth() === currentMonth;
            }
            return true;
          }

          const dueDate = new Date(rawDate);
          if (isNaN(dueDate.getTime())) return true;

          const isUpcoming21Days = dueDate >= today && dueDate <= limit21Days;
          const isThisMonth = dueDate.getFullYear() === currentYear && dueDate.getMonth() === currentMonth;

          return isUpcoming21Days || isThisMonth;
        };

        // 9. Cuentas por Cobrar Pendientes a Vencer (Próximas en 21 días o del mes)
        let receivableDue = 0;
        let receivableDueCount = 0;
        let allReceivables: any[] = [];

        try {
          const cxcApiRes = await authenticatedFetch('/api/accounts-receivable');
          if (cxcApiRes.ok) {
            const json = await cxcApiRes.json();
            if (json.success && Array.isArray(json.data) && json.data.length > 0) {
              allReceivables = json.data;
            }
          }
        } catch (e) {
          console.warn('Aviso consultando /api/accounts-receivable:', e);
        }

        if (allReceivables.length === 0 && cxcRes.data && cxcRes.data.length > 0) {
          allReceivables = cxcRes.data;
        }

        const filteredReceivables = allReceivables.filter(isDueSoonOrThisMonth);
        receivableDue = filteredReceivables.reduce(
          (acc: number, c: any) => acc + Math.max(0, Number(c.balance_usd ?? c.remaining_amount ?? 0)),
          0
        );
        receivableDueCount = filteredReceivables.length;

        // 10. Cuentas por Pagar Pendientes a Vencer (Próximas en 21 días o del mes)
        let payableDue = 0;
        let payableDueCount = 0;
        let allPayables: any[] = [];

        try {
          const cxpApiRes = await authenticatedFetch('/api/accounts-payable');
          if (cxpApiRes.ok) {
            const json = await cxpApiRes.json();
            if (json.success && Array.isArray(json.data) && json.data.length > 0) {
              allPayables = json.data;
            }
          }
        } catch (e) {
          console.warn('Aviso consultando /api/accounts-payable:', e);
        }

        if (allPayables.length === 0 && cxpRes.data && cxpRes.data.length > 0) {
          allPayables = cxpRes.data;
        }

        const filteredPayables = allPayables.filter(isDueSoonOrThisMonth);
        payableDue = filteredPayables.reduce(
          (acc: number, p: any) => acc + Math.max(0, Number(p.balance_usd ?? p.remaining_amount ?? 0)),
          0
        );
        payableDueCount = filteredPayables.length;

        setSummary({
          salesUsd: totalSalesUsd,
          monthlyProfit: utilidadNeta,
          receivableDueUsd: Math.round(receivableDue * 100) / 100,
          receivableDueCount,
          payableDueUsd: Math.round(payableDue * 100) / 100,
          payableDueCount,
          stockUnits: products.reduce((acc, p) => acc + Number(p.stock || 0), 0),
          lowStockProductsCount: products.filter((p) => Number(p.stock) <= Number(p.min_stock)).length,
          topProducts,
          lowStockProductsList
        });
      } catch (error) {
        setSummary(EMPTY_SUMMARY);
        setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los indicadores.');
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
          <p>Indicadores clave de tu organización.</p>
        </div>
      </div>

      {loadError ? (
        <EmptyState title="No se pudieron cargar los indicadores" description={loadError} />
      ) : (
        <>
          <div className="grid grid-4">
            <Card>
              <div className="kpi-label">Ventas (7 días)</div>
              <div className="kpi-value">{isLoading ? '—' : formatUSD(summary.salesUsd)}</div>
            </Card>
            <Card>
              <div className="kpi-label">Utilidad Mensual</div>
              <div className="kpi-value" style={{ color: summary.monthlyProfit >= 0 ? 'var(--brand-700, #7e22ce)' : 'var(--danger, #dc2626)' }}>
                {isLoading ? '—' : formatUSD(summary.monthlyProfit)}
              </div>
            </Card>
            <Card>
              <div className="kpi-label">Inventario (Unidades)</div>
              <div className="kpi-value">{isLoading ? '—' : summary.stockUnits.toLocaleString('es-VE')}</div>
            </Card>
            <Card>
              <div className="kpi-label">Productos bajo mínimo</div>
              <div className="kpi-value">{isLoading ? '—' : summary.lowStockProductsCount}</div>
            </Card>
          </div>

          <div className="grid grid-2" style={{ marginTop: 14 }}>
            <Card>
              <h3>Top 5 productos más vendidos</h3>
              {summary.topProducts.length === 0 && !isLoading ? (
                <p className="muted">No hay ventas registradas.</p>
              ) : (
                summary.topProducts.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 0',
                      borderBottom: i === summary.topProducts.length - 1 ? 'none' : '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      {p.name}
                    </span>
                    <b style={{ fontSize: 13, color: 'var(--text)' }}>
                      {p.totalQuantity} {p.totalQuantity === 1 ? 'ud.' : 'uds.'}
                    </b>
                  </div>
                ))
              )}
            </Card>

            <Card>
              <h3>Productos con bajo stock</h3>
              {summary.lowStockProductsList.length === 0 && !isLoading ? (
                <p className="muted">No hay productos bajo stock.</p>
              ) : (
                summary.lowStockProductsList.map((p, i) => (
                  <div
                    key={p.id}
                    style={{
                      padding: '10px 0',
                      borderBottom: i === summary.lowStockProductsList.length - 1 ? 'none' : '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      {p.name}
                    </span>
                    <Badge tone="warning">Stock: {p.stock}</Badge>
                  </div>
                ))
              )}
            </Card>
          </div>

          <div className="grid grid-2" style={{ marginTop: 14 }}>
            <Card>
              <h3>Cuentas por Cobrar a Vencer</h3>
              <div className="kpi-value">{isLoading ? '—' : formatUSD(summary.receivableDueUsd)}</div>
              <div className="muted small">
                {isLoading
                  ? 'Cargando pendientes...'
                  : summary.receivableDueCount === 0
                  ? 'Sin cobros en los próximos 21 días o del mes'
                  : `${summary.receivableDueCount} ${summary.receivableDueCount === 1 ? 'cuenta por cobrar' : 'cuentas por cobrar'} (próximos 21 días o del mes)`}
              </div>
            </Card>
            <Card>
              <h3>Cuentas por Pagar a Vencer</h3>
              <div className="kpi-value">{isLoading ? '—' : formatUSD(summary.payableDueUsd)}</div>
              <div className="muted small">
                {isLoading
                  ? 'Cargando obligaciones...'
                  : summary.payableDueCount === 0
                  ? 'Sin pagos en los próximos 21 días o del mes'
                  : `${summary.payableDueCount} ${summary.payableDueCount === 1 ? 'compromiso' : 'compromisos'} (próximos 21 días o del mes)`}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
