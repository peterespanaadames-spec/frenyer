import { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  RefreshCcw, 
  FileDown, 
  ShoppingBag, 
  DollarSign, 
  CheckCircle2,
  Info
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { authenticatedFetch } from '../../../lib/supabase/api';
import { getActiveExchangeRate, formatUSD, formatVES } from '../../../lib/currency';
import { getBusinessProfile } from '../../../lib/businessProfile';

interface PnLData {
  totalSales: number;
  costOfSales: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingIncome: number;
  otherExpenses: number;
  netProfit: number;
  expensesByCategory: { category: string; amount: number }[];
  exchangeRate: number;
}

export function ProfitLossPage() {
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year' | 'all'>('month');
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<PnLData>({
    totalSales: 0,
    costOfSales: 0,
    grossProfit: 0,
    operatingExpenses: 0,
    operatingIncome: 0,
    otherExpenses: 0,
    netProfit: 0,
    expensesByCategory: [],
    exchangeRate: getActiveExchangeRate()
  });

  const handleExportPDF = async () => {
    const input = document.querySelector('.content') as HTMLElement;
    if (!input) return;

    const canvas = await html2canvas(input, {
      scale: 2,
      logging: false,
      useCORS: true,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`informe_ganancias_perdidas_${period}.pdf`);
  };

  const fetchPnLData = async () => {
    setIsLoading(true);
    try {
      const currentRate = getActiveExchangeRate();

      let salesData: any[] = [];
      try {
        const salesRes = await authenticatedFetch('/api/sales');
        if (salesRes.ok) {
          const salesJson = await salesRes.json();
          if (salesJson.success && Array.isArray(salesJson.data)) {
            salesData = salesJson.data;
          }
        }
      } catch (salesErr) {
        console.warn('Aviso cargando ventas en reporte PnL:', salesErr);
      }

      const now = new Date();
      const filteredSales = (salesData || []).filter(item => {
        if (item.status && item.status !== 'COMPLETADA') return false;
        if (period === 'all') return true;
        const saleDate = new Date(item.created_at);
        if (period === 'month') {
          return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear();
        }
        if (period === 'quarter') {
          const diffMonths = (now.getFullYear() - saleDate.getFullYear()) * 12 + (now.getMonth() - saleDate.getMonth());
          return diffMonths >= 0 && diffMonths < 3;
        }
        if (period === 'year') {
          return saleDate.getFullYear() === now.getFullYear();
        }
        return true;
      });

      const totalSales = filteredSales.reduce((acc, s) => acc + Number(s.total_usd || 0), 0);
      const costOfSales = totalSales * 0.55; 
      const grossProfit = totalSales - costOfSales;

      let expensesData: any[] = [];
      try {
        const expRes = await authenticatedFetch('/api/expenses');
        if (expRes.ok) {
          const expJson = await expRes.json();
          if (expJson.success && Array.isArray(expJson.data)) {
            expensesData = expJson.data;
          }
        }
      } catch (expErr) {
        console.warn('Aviso cargando gastos en reporte PnL:', expErr);
      }

      const filteredExpenses = (expensesData || []).filter(item => {
        if (period === 'all') return true;
        const expDate = new Date(item.created_at);
        if (period === 'month') {
          return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
        }
        if (period === 'quarter') {
          const diffMonths = (now.getFullYear() - expDate.getFullYear()) * 12 + (now.getMonth() - expDate.getMonth());
          return diffMonths >= 0 && diffMonths < 3;
        }
        if (period === 'year') {
          return expDate.getFullYear() === now.getFullYear();
        }
        return true;
      });

      const categoryMap: { [key: string]: number } = {};
      let totalOperatingExpenses = 0;

      filteredExpenses.forEach(exp => {
        const amt = Number(exp.amount || 0);
        const rate = Number(exp.exchange_rate || currentRate);
        const amountInUSD = exp.currency === 'VES' ? amt / rate : amt;
        
        const cat = exp.category || 'Otros Gastos';
        categoryMap[cat] = (categoryMap[cat] || 0) + amountInUSD;
        totalOperatingExpenses += amountInUSD;
      });

      const expensesByCategory = Object.entries(categoryMap).map(([category, amount]) => ({
        category,
        amount
      })).sort((a, b) => b.amount - a.amount);

      const operatingIncome = grossProfit - totalOperatingExpenses;
      const otherExpenses = 0;
      const netProfit = operatingIncome - otherExpenses;

      setData({
        totalSales,
        costOfSales,
        grossProfit,
        operatingExpenses: totalOperatingExpenses,
        operatingIncome,
        otherExpenses,
        netProfit,
        expensesByCategory,
        exchangeRate: currentRate
      });

    } catch (err) {
      console.error('Error in PnL calculation:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPnLData();
  }, [period]);

  const grossMarginPercent = data.totalSales > 0 ? (data.grossProfit / data.totalSales) * 100 : 0;
  const netMarginPercent = data.totalSales > 0 ? (data.netProfit / data.totalSales) * 100 : 0;

  const business = getBusinessProfile();

  return (
    <div className="content">
      {/* Membrete Oficial del Negocio */}
      <div style={{ background: '#4b5563', color: '#ffffff', padding: '16px 20px', borderRadius: 'var(--radius-lg)', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#ffffff', fontWeight: 800 }}>{business.businessName}</h2>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: '#e5e7eb' }}>
          RIF: {business.rif} | Tel: {business.phone}{business.address ? ` | Dirección: ${business.address}` : ''}
        </p>
      </div>

      {/* Cabecera */}
      <div className="page-head">
        <div>
          <h1>Estado de Ganancias y Pérdidas</h1>
          <p>Tu negocio en palabras sencillas: Ventas, costos, gastos y beneficio real en bolsillo.</p>
        </div>
        <div className="actions">
          <Button variant="secondary" onClick={fetchPnLData}>
            <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Button variant="secondary" onClick={handleExportPDF}>
            <FileDown className="w-4 h-4" /> Exportar
          </Button>
        </div>
      </div>

      {/* Toolbar / Selector de Periodo */}
      <div className="toolbar flex-wrap gap-2 items-center bg-white p-3 rounded-xl border border-border shadow-xs mb-6">
        <span className="text-xs font-bold uppercase tracking-wider text-muted mr-2">Periodo analizado:</span>
        {[
          { id: 'month', label: 'Este Mes' },
          { id: 'quarter', label: 'Este Trimestre' },
          { id: 'year', label: 'Este Año' },
          { id: 'all', label: 'Histórico Total' }
        ].map(p => (
          <Button
            key={p.id}
            variant={period === p.id ? 'primary' : 'secondary'}
            onClick={() => setPeriod(p.id as any)}
          >
            {p.label}
          </Button>
        ))}

      </div>

      {/* KPI Grid (Resumen Comercial) */}
      <div className="grid grid-3 mb-6">
        <Card>
          <div className="kpi-label">1. Total Vendido</div>
          <div className="kpi-value">{isLoading ? '—' : formatUSD(data.totalSales)}</div>
          <div className="muted small">Equivalente: {formatVES(data.totalSales * data.exchangeRate)}</div>
        </Card>
        <Card>
          <div className="kpi-label">2. Ganancia Bruta</div>
          <div className="kpi-value">{isLoading ? '—' : formatUSD(data.grossProfit)}</div>
          <div className="muted small">Margen Comercial: {grossMarginPercent.toFixed(1)}%</div>
        </Card>
        <Card>
          <div className="kpi-label">3. Ganancia Limpia (Neta)</div>
          <div className={`kpi-value ${data.netProfit >= 0 ? 'positive' : 'negative'}`}>
            {isLoading ? '—' : formatUSD(data.netProfit)}
          </div>
          <div className="muted small">Rentabilidad: {netMarginPercent.toFixed(1)}%</div>
        </Card>
      </div>

      {/* Estado de Resultados Consolidado */}
      <Card className="card mb-6">
        <div className="section-head">
          <h3>Estado de Resultados Formal</h3>
          <span className="badge brand">Estandarizado y Simplificado</span>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Concepto Contable</th>
                <th>Lectura Comercial</th>
                <th className="num">Monto USD</th>
                <th className="num">Monto VES</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-semibold">Ingresos Operacionales (Ventas Brutas)</td>
                <td><span className="badge success">(+) Lo que vendiste</span></td>
                <td className="num font-bold">{isLoading ? '—' : formatUSD(data.totalSales)}</td>
                <td className="num">{formatVES(data.totalSales * data.exchangeRate)}</td>
              </tr>
              <tr>
                <td className="font-semibold text-muted pl-4">(-) Costo de la Mercancía Vendida (CMV)</td>
                <td><span className="badge warning">Costo de reposición</span></td>
                <td className="num negative">{isLoading ? '—' : `-${formatUSD(data.costOfSales)}`}</td>
                <td className="num negative">-{formatVES(data.costOfSales * data.exchangeRate)}</td>
              </tr>
              <tr style={{ background: '#fafbfc' }}>
                <td className="font-bold text-text">= UTILIDAD BRUTA (Margen Comercial)</td>
                <td><span className="badge brand">Ganancia tras pagar mercancía</span></td>
                <td className="num font-bold">{isLoading ? '—' : formatUSD(data.grossProfit)}</td>
                <td className="num font-bold">{formatVES(data.grossProfit * data.exchangeRate)}</td>
              </tr>
              <tr>
                <td className="font-semibold">(-) Gastos Operativos Totales</td>
                <td><span className="badge warning">Alquiler, sueldos, servicios</span></td>
                <td className="num negative">{isLoading ? '—' : `-${formatUSD(data.operatingExpenses)}`}</td>
                <td className="num negative">-{formatVES(data.operatingExpenses * data.exchangeRate)}</td>
              </tr>
              <tr style={{ background: '#fafbfc' }}>
                <td className="font-bold text-text">= UTILIDAD DE OPERACIÓN (EBIT)</td>
                <td><span className="badge brand">Ganancia por actividad comercial</span></td>
                <td className="num font-bold">{isLoading ? '—' : formatUSD(data.operatingIncome)}</td>
                <td className="num font-bold">{formatVES(data.operatingIncome * data.exchangeRate)}</td>
              </tr>
              <tr style={{ background: data.netProfit >= 0 ? '#e9f7f1' : '#fff0f0' }}>
                <td className="font-bold text-base">= UTILIDAD NETA FINAL (EN BOLSILLO)</td>
                <td><span className={`badge ${data.netProfit >= 0 ? 'success' : 'danger'}`}>Resultado definitivo</span></td>
                <td className={`num font-bold text-base ${data.netProfit >= 0 ? 'positive' : 'negative'}`}>
                  {isLoading ? '—' : formatUSD(data.netProfit)}
                </td>
                <td className={`num font-bold ${data.netProfit >= 0 ? 'positive' : 'negative'}`}>
                  {formatVES(data.netProfit * data.exchangeRate)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Desglose de Gastos Operativos */}
      <Card className="card mb-6">
        <div className="section-head">
          <h3>Desglose de Gastos del Negocio</h3>
          <span className="badge warning">Operativos</span>
        </div>
        {data.expensesByCategory.length === 0 ? (
          <div className="empty">No hay gastos registrados en este periodo.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Categoría de Gasto</th>
                  <th className="num">Monto USD</th>
                  <th className="num">% del Total</th>
                </tr>
              </thead>
              <tbody>
                {data.expensesByCategory.map((exp, idx) => {
                  const percent = data.operatingExpenses > 0 ? (exp.amount / data.operatingExpenses) * 100 : 0;
                  return (
                    <tr key={idx}>
                      <td className="font-semibold">• {exp.category}</td>
                      <td className="num font-semibold">{formatUSD(exp.amount)}</td>
                      <td className="num">{percent.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Consejo Comercial */}
      <Card className="card bg-white">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm">Consejo Gerencial para Comerciantes:</h4>
            <p className="small muted">
              Tu Margen Comercial Bruto es de <strong>{grossMarginPercent.toFixed(1)}%</strong>. Por cada $100 que vendes, te quedan ${grossMarginPercent.toFixed(1)} para absorber los gastos fijos del local y dejar beneficio neto. Mantén vigilados tus gastos operativos para asegurar que la ganancia final se mantenga en verde.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
