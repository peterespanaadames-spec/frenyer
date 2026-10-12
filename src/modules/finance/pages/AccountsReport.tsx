import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  DollarSign, 
  Search, 
  Calendar, 
  CreditCard, 
  RefreshCcw, 
  FileDown, 
  Eye, 
  Printer, 
  Building 
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { supabase } from '../../../lib/supabase/client';
import { formatUSD, formatVES, getActiveExchangeRate } from '../../../lib/currency';

interface PaymentReportRow {
  id: string;
  created_at: string;
  sale_id: string;
  doc_number: string;
  doc_type: string;
  customer_name: string;
  method: string;
  bank_name: string;
  amount_usd: number;
  amount_ves: number;
}

export function AccountsReportPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentReportRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [bankFilter, setBankFilter] = useState('TODOS');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exchangeRate, setExchangeRate] = useState(getActiveExchangeRate());

  const loadData = async () => {
    setIsLoading(true);
    try {
      const activeRate = getActiveExchangeRate();
      setExchangeRate(activeRate);

      // 1. Obtener Cuentas Bancarias
      const { data: bankAccounts } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_number, currency');
      const bankMap = new Map((bankAccounts || []).map((b: any) => [b.id, b]));

      // 2. Obtener Clientes
      const { data: customers } = await supabase
        .from('customers')
        .select('id, name, doc_number');
      const customerMap = new Map((customers || []).map((c: any) => [c.id, c]));

      // 3. Obtener Ventas
      const { data: sales } = await supabase
        .from('sales')
        .select('id, doc_number, doc_type, customer_id, customer_name, total_usd, total_ves, exchange_rate, payment_type');
      const salesMap = new Map((sales || []).map((s: any) => [s.id, s]));

      // 4. Obtener Pagos de la tabla 'payments'
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });

      const rows: PaymentReportRow[] = [];

      (paymentsData || []).forEach((p: any) => {
        const sale = p.sale_id ? salesMap.get(p.sale_id) : null;
        const bank = p.bank_account_id ? bankMap.get(p.bank_account_id) : null;
        const cust = sale?.customer_id ? customerMap.get(sale.customer_id) : null;

        const customerName = cust?.name || sale?.customer_name || 'Consumidor Final';
        const docNumber = sale?.doc_number || (sale?.id ? sale.id.slice(0, 8) : p.id.slice(0, 8));
        const docType = sale?.doc_type || 'FACTURA';
        const bankName = bank?.bank_name || (p.method?.includes('Banesco') ? 'Banesco' : p.method?.includes('Venezuela') ? 'Banco de Venezuela' : 'Caja Principal');

        rows.push({
          id: p.id,
          created_at: p.created_at || new Date().toISOString(),
          sale_id: p.sale_id || p.id,
          doc_number: docNumber,
          doc_type: docType,
          customer_name: customerName,
          method: p.method || 'Efectivo',
          bank_name: bankName,
          amount_usd: Number(p.amount_usd) || 0,
          amount_ves: Number(p.amount_ves) || (Number(p.amount_usd || 0) * activeRate)
        });
      });

      // Si la tabla payments tiene pocos datos, respaldar con las ventas
      if (rows.length === 0 && sales && sales.length > 0) {
        sales.forEach((s: any) => {
          const cust = s.customer_id ? customerMap.get(s.customer_id) : null;
          rows.push({
            id: s.id,
            created_at: s.created_at || new Date().toISOString(),
            sale_id: s.id,
            doc_number: s.doc_number || s.id.slice(0, 8),
            doc_type: s.doc_type || 'FACTURA',
            customer_name: cust?.name || s.customer_name || 'Consumidor Final',
            method: s.payment_type || 'Contado',
            bank_name: 'Caja General',
            amount_usd: Number(s.total_usd) || 0,
            amount_ves: Number(s.total_ves) || (Number(s.total_usd || 0) * activeRate)
          });
        });
      }

      setPayments(rows);
    } catch (err) {
      console.error('Error cargando reporte de cuentas y pagos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtros
  const filteredPayments = payments.filter((p) => {
    const matchesSearch = 
      p.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.doc_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.method.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.bank_name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesBank = bankFilter === 'TODOS' || p.bank_name.toLowerCase().includes(bankFilter.toLowerCase());

    let matchesDate = true;
    const paymentDate = p.created_at ? p.created_at.split('T')[0] : '';
    if (startDate && paymentDate < startDate) matchesDate = false;
    if (endDate && paymentDate > endDate) matchesDate = false;

    return matchesSearch && matchesBank && matchesDate;
  });

  // KPIs
  const totalUSD = filteredPayments.reduce((acc, p) => acc + p.amount_usd, 0);
  const totalVES = filteredPayments.reduce((acc, p) => acc + p.amount_ves, 0);
  const totalDivisasCount = filteredPayments.filter(p => p.amount_usd > 0).length;
  const uniqueBanks = new Set(filteredPayments.map(p => p.bank_name)).size;

  const handleExportExcel = () => {
    const exportData = filteredPayments.map(p => ({
      'Fecha': new Date(p.created_at).toLocaleString(),
      'Comprobante': p.doc_number,
      'Tipo': p.doc_type,
      'Cliente': p.customer_name,
      'Método de Pago': p.method,
      'Banco / Destino': p.bank_name,
      'Monto (USD)': p.amount_usd,
      'Monto (VES)': p.amount_ves
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte de Pagos');
    XLSX.writeFile(wb, `Reporte_Pagos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="content">
      {/* 1. Encabezado de Página */}
      <div className="page-head flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1>Reporte de Cuentas y Pagos</h1>
          <p className="muted">
            Auditoría de recaudaciones, métodos de pago y conciliación con cuentas bancarias.
          </p>
        </div>
        <div className="actions flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={loadData}>
            <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
          <Button variant="secondary" onClick={handleExportExcel}>
            <FileDown className="w-4 h-4" /> Exportar Excel (.xlsx)
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Imprimir
          </Button>
        </div>
      </div>

      {/* 2. Rejilla de Métricas KPI */}
      <div className="grid grid-4 gap-4 mb-6">
        <Card>
          <div className="kpi-label">TOTAL RECAUDADO ($)</div>
          <div className="kpi-value text-text mt-1">{formatUSD(totalUSD)}</div>
          <span className="muted small">Monto consolidado en divisas</span>
        </Card>

        <Card>
          <div className="kpi-label">TOTAL LIQUIDADO (VES)</div>
          <div className="kpi-value text-text mt-1">
            Bs. {totalVES.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="muted small">Tasa BCV: {exchangeRate.toFixed(2)} Bs/$</span>
        </Card>

        <Card>
          <div className="kpi-label">TRANSACCIONES LIQUIDADAS</div>
          <div className="kpi-value text-text mt-1">{filteredPayments.length}</div>
          <span className="muted small">{totalDivisasCount} con componente en divisas</span>
        </Card>

        <Card>
          <div className="kpi-label">CANALES BANCARIOS ACTIVOS</div>
          <div className="kpi-value text-text mt-1">{uniqueBanks}</div>
          <span className="muted small">Banesco, Venezuela, Efectivo</span>
        </Card>
      </div>

      {/* 3. Filtros y Búsqueda */}
      <Card className="mb-6">
        <div className="flex flex-col xl:flex-row items-center justify-between gap-4">
          <div className="relative w-full xl:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Buscar por cliente, documento..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9 w-full text-xs"
            />
          </div>

          {/* Rango de Fechas (Desde / Hasta en la misma línea) */}
          <div className="flex items-end gap-2 flex-nowrap overflow-x-auto w-full xl:w-auto pb-1 xl:pb-0" style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'nowrap' }}>
            <div className="flex items-center gap-1.5 flex-nowrap">
              <span className="text-xs font-bold uppercase tracking-wider text-muted whitespace-nowrap">Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input text-xs"
                style={{ fontSize: '12px', width: '115px', height: '36px', padding: '0 8px' }}
                title="Fecha inicial (Desde)"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-nowrap">
              <span className="text-xs font-bold uppercase tracking-wider text-muted whitespace-nowrap">Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input text-xs"
                style={{ fontSize: '12px', width: '115px', height: '36px', padding: '0 8px' }}
                title="Fecha final (Hasta)"
              />
            </div>
            {(startDate || endDate) && (
              <Button
                variant="ghost"
                onClick={() => { setStartDate(''); setEndDate(''); }}
                style={{ height: '34px', fontSize: '11px', padding: '0 8px', color: 'var(--muted)' }}
              >
                Limpiar
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3 w-full xl:w-auto">
            <span className="text-xs text-muted font-semibold whitespace-nowrap">Banco:</span>
            <select
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
              className="input text-xs"
            >
              <option value="TODOS">Todos</option>
              <option value="Banesco">Banesco</option>
              <option value="Venezuela">Banco de Venezuela</option>
              <option value="Caja">Caja Efectivo</option>
            </select>
          </div>
        </div>
      </Card>

      {/* 4. Tabla de Transacciones y Pagos */}
      <Card>
        <div className="section-head mb-4">
          <h3>Detalle de Pagos y Liquidaciones</h3>
          <span className="badge brand">{filteredPayments.length} registros</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center muted small">Cargando pagos y transacciones...</div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-8 text-center muted small">No se encontraron pagos con los filtros seleccionados.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Comprobante</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Método de Pago</th>
                  <th>Banco / Destino</th>
                  <th className="num">Monto ($)</th>
                  <th className="num">Monto (VES)</th>
                  <th className="num">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="muted text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="font-bold text-xs">{p.doc_number}</td>
                    <td>
                      <Badge tone={p.doc_type.includes('FACT') ? 'success' : p.doc_type.includes('NOTA') ? 'warning' : 'brand'}>
                        {p.doc_type}
                      </Badge>
                    </td>
                    <td className="font-semibold text-xs">{p.customer_name}</td>
                    <td className="text-xs font-medium">{p.method}</td>
                    <td>
                      <span className="badge warning">{p.bank_name}</span>
                    </td>
                    <td className="num font-bold">{formatUSD(p.amount_usd)}</td>
                    <td className="num muted">
                      Bs. {p.amount_ves.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="num">
                      <Button
                        variant="primary"
                        onClick={() => navigate(`/ventas-flash/reporte/${p.sale_id}`)}
                      >
                        <Eye className="w-4 h-4" /> Detalle
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
