import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  RefreshCw,
  FileDown, 
  Search, 
  ChevronDown, 
  Printer, 
  FileText,
  FileSpreadsheet,
  ExternalLink
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { SaleDetailModal } from '../../../components/modals/SaleDetailModal';
import { supabase } from '../../../lib/supabase/client';
import { getActiveExchangeRate, formatUSD, formatVES } from '../../../lib/currency';

interface SaleItemRecord {
  sku: string;
  name: string;
  quantity: number;
  unit_price_usd: number;
  total_usd: number;
}

interface SalePaymentRecord {
  method: string;
  amount_usd: number;
}

interface SaleRecord {
  id: string;
  doc_type: string;
  doc_number: string;
  display_number: string;
  created_at: string;
  total_usd: number;
  status: string;
  customer_name: string;
  customer_doc?: string;
  payment_method: string;
  items?: SaleItemRecord[];
  payments?: SalePaymentRecord[];
}

export const SalesReportPage = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all' | 'custom'>('month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('TODOS');
  const [reportView, setReportView] = useState<'VENTAS' | 'PRODUCTOS' | 'METODOS_PAGO'>('VENTAS');
  const [isLoading, setIsLoading] = useState(true);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [exchangeRate, setExchangeRate] = useState(getActiveExchangeRate());
  
  // Modal state
  const [selectedMovementDetail, setSelectedMovementDetail] = useState<SaleRecord | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    if (isExportMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExportMenuOpen]);

  const fetchSalesReport = async () => {
    setIsLoading(true);
    try {
      // 1. Obtener tasa de cambio vigente
      const { data: ratesData } = await supabase
        .from('exchange_rates')
        .select('rate')
        .order('observed_at', { ascending: false })
        .limit(1);

      const currentRate = ratesData?.[0]?.rate || getActiveExchangeRate();
      setExchangeRate(currentRate);

      // 2. Obtener Clientes registrados para mapeo por customer_id
      const { data: customersData } = await supabase
        .from('customers')
        .select('id, name, doc_number, doc_type, phone');

      const customerMap = new Map((customersData || []).map((c: any) => [c.id, c]));

      // 3. Obtener Cuentas Bancarias para mapeo por bank_account_id
      const { data: bankAccountsData } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_number');

      const bankMap = new Map((bankAccountsData || []).map((b: any) => [b.id, b]));

      // 4. Obtener Pagos registrados en tabla 'payments'
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('sale_id, method, amount_usd, bank_account_id');

      const paymentsBySale = new Map<string, SalePaymentRecord[]>();
      (paymentsData || []).forEach((p: any) => {
        if (!p.sale_id) return;
        const bank = p.bank_account_id ? bankMap.get(p.bank_account_id) : null;
        let methodName = p.method || 'Efectivo';
        if (bank && bank.bank_name && !methodName.toLowerCase().includes(bank.bank_name.toLowerCase())) {
          methodName = `${bank.bank_name} (${methodName})`;
        }
        const existing = paymentsBySale.get(p.sale_id) || [];
        existing.push({
          method: methodName,
          amount_usd: Number(p.amount_usd) || 0
        });
        paymentsBySale.set(p.sale_id, existing);
      });

      // 4b. Obtener Artículos de venta registrados en 'sale_items'
      const { data: saleItemsData, error: itemsError } = await supabase
        .from('sale_items')
        .select('sale_id, sku, name, quantity, unit_price_usd, total_usd');

      if (itemsError) {
        console.warn('Aviso consultando sale_items:', itemsError.message);
      }

      const itemsBySale = new Map<string, SaleItemRecord[]>();
      (saleItemsData || []).forEach((item: any) => {
        if (!item.sale_id) return;
        const existing = itemsBySale.get(item.sale_id) || [];
        existing.push({
          sku: item.sku || 'S/N',
          name: item.name || 'Producto sin nombre',
          quantity: Number(item.quantity) || 1,
          unit_price_usd: Number(item.unit_price_usd) || 0,
          total_usd: Number(item.total_usd) || ((Number(item.quantity) || 1) * (Number(item.unit_price_usd) || 0))
        });
        itemsBySale.set(item.sale_id, existing);
      });

      // 5. Consultar transacciones de la tabla 'sales'
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false });

      if (salesError) {
        console.warn('Aviso consultando tabla sales:', salesError.message);
      }

      const unifiedRecords: SaleRecord[] = [];

      (salesData || []).forEach((s: any) => {
        const cust = s.customer_id ? customerMap.get(s.customer_id) : null;
        const customerName = cust?.name || s.customer_name || 'Consumidor Final';
        const customerDoc = cust?.doc_number || s.customer_doc || 'N/A';

        const rawDocType = (s.doc_type || 'FACTURA').toUpperCase();
        let displayNumber = s.doc_number || s.id.slice(0, 8);
        if (rawDocType === 'FACTURA') {
          displayNumber = displayNumber.startsWith('FACT-') ? displayNumber : `FACT-${displayNumber}`;
        } else if (rawDocType === 'NOTA') {
          displayNumber = displayNumber.startsWith('NE-') ? displayNumber : `NE-${displayNumber}`;
        } else if (rawDocType === 'PEDIDO' || rawDocType === 'PEDIDO_WEB') {
          displayNumber = displayNumber.startsWith('#') || displayNumber.startsWith('PED-') ? displayNumber : `#${displayNumber}`;
        }

        const salePayments = paymentsBySale.get(s.id) || [];
        const saleItems = itemsBySale.get(s.id) || [];
        const paymentDisplay = salePayments && salePayments.length > 0 
          ? Array.from(new Set(salePayments.map(p => p.method))).join(', ') 
          : (s.payment_type || 'Contado');

        unifiedRecords.push({
          id: s.id,
          doc_type: rawDocType,
          doc_number: s.doc_number || s.id.slice(0, 8),
          display_number: displayNumber,
          created_at: s.created_at,
          total_usd: Number(s.total_usd) || 0,
          status: s.status || 'COMPLETADA',
          customer_name: customerName,
          customer_doc: customerDoc,
          payment_method: paymentDisplay,
          items: saleItems,
          payments: salePayments.length > 0 ? salePayments : [{ method: s.payment_type || 'Contado', amount_usd: Number(s.total_usd) || 0 }]
        });
      });

      // 6. Consultar pedidos web desde /api/orders (para incluir pedidos web que aún no se hayan facturado en sales)
      try {
        const ordersRes = await fetch('/api/orders');
        if (ordersRes.ok) {
          const json = await ordersRes.json();
          if (json.success && Array.isArray(json.data)) {
            const existingSalesIds = new Set(unifiedRecords.map(r => r.id));
            const existingSalesNums = new Set(unifiedRecords.map(r => r.doc_number));

            json.data.forEach((o: any) => {
              const orderNum = o.order_number || o.id.slice(0, 8);
              if (existingSalesIds.has(o.id) || existingSalesNums.has(orderNum)) {
                return;
              }

              const displayNum = orderNum.startsWith('#') || orderNum.startsWith('PED-') ? orderNum : `#${orderNum}`;

              const oItems: SaleItemRecord[] = (o.items || []).map((it: any) => ({
                sku: it.sku || 'WEB',
                name: it.name || it.product_name || 'Producto Web',
                quantity: Number(it.quantity) || 1,
                unit_price_usd: Number(it.unit_price_usd || it.price) || 0,
                total_usd: Number(it.total_usd || it.total || (Number(it.quantity || 1) * Number(it.unit_price_usd || it.price || 0)))
              }));

              const oPayments: SalePaymentRecord[] = [{
                method: o.payment_method || 'Pago Móvil',
                amount_usd: Number(o.total_usd) || 0
              }];

              unifiedRecords.push({
                id: o.id,
                doc_type: 'PEDIDO_WEB',
                doc_number: orderNum,
                display_number: displayNum,
                created_at: o.created_at,
                total_usd: Number(o.total_usd) || 0,
                status: o.delivery_status || o.payment_status || 'ENTREGADO',
                customer_name: o.customer_name || 'Cliente Web',
                customer_doc: o.customer_doc || 'N/A',
                payment_method: o.payment_method || 'Pago Móvil',
                items: oItems,
                payments: oPayments
              });
            });
          }
        }
      } catch (orderErr) {
        console.warn('Aviso consultando /api/orders:', orderErr);
      }

      // Ordenar cronológicamente descendente
      unifiedRecords.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setSales(unifiedRecords);

    } catch (err) {
      console.error('Error fetching sales report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesReport();
  }, []);

  // Filtrado base por periodo / fechas y tipo de documento
  const now = new Date();
  const salesMatchingPeriodAndDoc = sales.filter(s => {
    const saleDate = new Date(s.created_at);

    // Búsqueda por rango de fechas (Desde, Hasta)
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate + 'T00:00:00');
        if (saleDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate + 'T23:59:59');
        if (saleDate > end) return false;
      }
    } else {
      if (period === 'today') {
        if (saleDate.toDateString() !== now.toDateString()) return false;
      } else if (period === 'week') {
        const diffTime = Math.abs(now.getTime() - saleDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 7) return false;
      } else if (period === 'month') {
        if (saleDate.getMonth() !== now.getMonth() || saleDate.getFullYear() !== now.getFullYear()) return false;
      }
    }

    if (docTypeFilter !== 'TODOS') {
      if (docTypeFilter === 'FACTURA' && s.doc_type !== 'FACTURA') return false;
      if (docTypeFilter === 'NOTA' && s.doc_type !== 'NOTA') return false;
      if (docTypeFilter === 'PEDIDO' && !['PEDIDO', 'PEDIDO_WEB'].includes(s.doc_type)) return false;
    }

    return true;
  });

  // Filtrado reactivo de ventas para vista "VENTAS"
  const filteredSales = salesMatchingPeriodAndDoc.filter(s => {
    if (searchQuery.trim() && reportView === 'VENTAS') {
      const q = searchQuery.toLowerCase();
      const matchDoc = s.display_number.toLowerCase().includes(q) || s.doc_number.toLowerCase().includes(q);
      const matchCustomer = s.customer_name.toLowerCase().includes(q);
      const matchDocNum = (s.customer_doc || '').toLowerCase().includes(q);
      const matchPayment = s.payment_method.toLowerCase().includes(q);
      const matchStatus = s.status.toLowerCase().includes(q);
      if (!matchDoc && !matchCustomer && !matchDocNum && !matchPayment && !matchStatus) return false;
    }
    return true;
  });

  // Cálculo de Productos Más Vendidos a partir del periodo filtrado
  const topProductsList = (() => {
    const map = new Map<string, {
      sku: string;
      name: string;
      totalQuantity: number;
      totalUsd: number;
      ordersCount: number;
    }>();

    salesMatchingPeriodAndDoc.forEach(s => {
      (s.items || []).forEach(it => {
        const key = (it.sku && it.sku !== 'S/N' && it.sku !== 'WEB') ? it.sku : it.name;
        const current = map.get(key) || {
          sku: it.sku || 'S/N',
          name: it.name || 'Producto sin nombre',
          totalQuantity: 0,
          totalUsd: 0,
          ordersCount: 0
        };
        current.totalQuantity += Number(it.quantity) || 1;
        current.totalUsd += Number(it.total_usd) || 0;
        current.ordersCount += 1;
        map.set(key, current);
      });
    });

    let list = Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);

    if (searchQuery.trim() && reportView === 'PRODUCTOS') {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }

    return list;
  })();

  // Cálculo de Métodos de Pago a partir del periodo filtrado
  const paymentMethodsList = (() => {
    const map = new Map<string, {
      method: string;
      transactionsCount: number;
      totalUsd: number;
    }>();

    salesMatchingPeriodAndDoc.forEach(s => {
      if (s.payments && s.payments.length > 0) {
        s.payments.forEach(p => {
          const key = p.method || 'Efectivo';
          const current = map.get(key) || {
            method: key,
            transactionsCount: 0,
            totalUsd: 0
          };
          current.transactionsCount += 1;
          current.totalUsd += Number(p.amount_usd) || 0;
          map.set(key, current);
        });
      } else {
        const key = s.payment_method || 'Contado';
        const current = map.get(key) || {
          method: key,
          transactionsCount: 0,
          totalUsd: 0
        };
        current.transactionsCount += 1;
        current.totalUsd += Number(s.total_usd) || 0;
        map.set(key, current);
      }
    });

    let list = Array.from(map.values()).sort((a, b) => b.totalUsd - a.totalUsd);

    if (searchQuery.trim() && reportView === 'METODOS_PAGO') {
      const q = searchQuery.toLowerCase();
      list = list.filter(m => m.method.toLowerCase().includes(q));
    }

    return list;
  })();

  const totalOrders = salesMatchingPeriodAndDoc.length;
  const totalIncome = salesMatchingPeriodAndDoc.reduce((sum, s) => sum + Number(s.total_usd || 0), 0);
  const estimatedProfit = totalIncome * 0.35;
  const averageTicket = totalOrders > 0 ? totalIncome / totalOrders : 0;

  // Exportar a Excel (.xlsx) adaptado a la vista activa
  const handleExportExcel = () => {
    if (reportView === 'PRODUCTOS') {
      if (topProductsList.length === 0) return;
      const rows = topProductsList.map((p, index) => ({
        'Ranking': `#${index + 1}`,
        'Producto': p.name,
        'SKU': p.sku,
        'Cantidad Vendida': p.totalQuantity,
        'Precio Promedio USD': (p.totalQuantity > 0 ? (p.totalUsd / p.totalQuantity).toFixed(2) : '0.00'),
        'Total USD': p.totalUsd.toFixed(2),
        'Total VES': (p.totalUsd * exchangeRate).toFixed(2),
        '% Participación': totalIncome > 0 ? `${((p.totalUsd / totalIncome) * 100).toFixed(1)}%` : '0%'
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos Más Vendidos');
      XLSX.writeFile(workbook, `Reporte_Productos_Mas_Vendidos_${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }

    if (reportView === 'METODOS_PAGO') {
      if (paymentMethodsList.length === 0) return;
      const rows = paymentMethodsList.map(m => ({
        'Método de Pago': m.method,
        'N° Transacciones': m.transactionsCount,
        'Total Recaudado USD': m.totalUsd.toFixed(2),
        'Total Recaudado VES': (m.totalUsd * exchangeRate).toFixed(2),
        'Ticket Promedio USD': (m.transactionsCount > 0 ? (m.totalUsd / m.transactionsCount).toFixed(2) : '0.00'),
        '% Participación': totalIncome > 0 ? `${((m.totalUsd / totalIncome) * 100).toFixed(1)}%` : '0%'
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Metodos de Pago');
      XLSX.writeFile(workbook, `Reporte_Metodos_Pago_${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }

    // Default: VENTAS
    if (filteredSales.length === 0) return;
    const rows = filteredSales.map(s => ({
      'Fecha': new Date(s.created_at).toLocaleDateString(),
      'N° Comprobante': s.display_number,
      'Tipo de Documento': s.doc_type,
      'Cliente': s.customer_name,
      'Identificación / RIF': s.customer_doc || 'N/A',
      'Métodos de Pago': s.payment_method,
      'Monto USD': Number(s.total_usd).toFixed(2),
      'Monto VES': (Number(s.total_usd) * exchangeRate).toFixed(2),
      'Estado': s.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte de Ventas');
    XLSX.writeFile(workbook, `Reporte_Ventas_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportXLS = () => {
    setIsExportMenuOpen(false);
    handleExportExcel();
  };

  // Exportar a CSV (.csv) adaptado a la vista activa
  const handleExportCSV = () => {
    setIsExportMenuOpen(false);

    if (reportView === 'PRODUCTOS') {
      if (topProductsList.length === 0) return;
      const headers = ['Ranking', 'Producto', 'SKU', 'Cantidad Vendida', 'Precio Promedio USD', 'Total USD', 'Total VES', '% Participación'];
      const rows = topProductsList.map((p, index) => [
        `"#${index + 1}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.sku.replace(/"/g, '""')}"`,
        p.totalQuantity,
        (p.totalQuantity > 0 ? (p.totalUsd / p.totalQuantity).toFixed(2) : '0.00'),
        p.totalUsd.toFixed(2),
        (p.totalUsd * exchangeRate).toFixed(2),
        totalIncome > 0 ? `"${((p.totalUsd / totalIncome) * 100).toFixed(1)}%"` : '"0%"'
      ].join(','));
      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Reporte_Productos_Mas_Vendidos_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (reportView === 'METODOS_PAGO') {
      if (paymentMethodsList.length === 0) return;
      const headers = ['Método de Pago', 'N° Transacciones', 'Total Recaudado USD', 'Total Recaudado VES', 'Ticket Promedio USD', '% Participación'];
      const rows = paymentMethodsList.map(m => [
        `"${m.method.replace(/"/g, '""')}"`,
        m.transactionsCount,
        m.totalUsd.toFixed(2),
        (m.totalUsd * exchangeRate).toFixed(2),
        (m.transactionsCount > 0 ? (m.totalUsd / m.transactionsCount).toFixed(2) : '0.00'),
        totalIncome > 0 ? `"${((m.totalUsd / totalIncome) * 100).toFixed(1)}%"` : '"0%"'
      ].join(','));
      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Reporte_Metodos_Pago_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (filteredSales.length === 0) return;

    const headers = [
      'Fecha',
      'N° Comprobante',
      'Tipo de Documento',
      'Cliente',
      'Identificación / RIF',
      'Métodos de Pago',
      'Monto USD',
      'Monto VES',
      'Estado'
    ];

    const rows = filteredSales.map(s => {
      const fecha = new Date(s.created_at).toLocaleDateString();
      return [
        `"${fecha}"`,
        `"${s.display_number || ''}"`,
        `"${s.doc_type || ''}"`,
        `"${(s.customer_name || '').replace(/"/g, '""')}"`,
        `"${(s.customer_doc || 'N/A').replace(/"/g, '""')}"`,
        `"${(s.payment_method || '').replace(/"/g, '""')}"`,
        Number(s.total_usd || 0).toFixed(2),
        (Number(s.total_usd || 0) * exchangeRate).toFixed(2),
        `"${s.status || ''}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Reporte_Ventas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    setIsExportMenuOpen(false);
    window.print();
  };

  const renderDocTypeBadge = (type: string) => {
    switch (type.toUpperCase()) {
      case 'FACTURA':
        return <Badge tone="success">📄 Factura</Badge>;
      case 'NOTA':
        return <Badge tone="warning">🚚 Nota Entrega</Badge>;
      case 'PEDIDO':
      case 'PEDIDO_WEB':
        return <Badge tone="brand">🌐 Pedido Web</Badge>;
      default:
        return <Badge tone="brand">{type}</Badge>;
    }
  };

  return (
    <div className="content">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1>Reporte de Ventas</h1>
        </div>
        <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button 
            variant="secondary" 
            onClick={fetchSalesReport}
            disabled={isLoading}
            title="Sincronizar comprobantes y ventas en tiempo real"
            style={{ height: 38, padding: '0 12px', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Sincronizar</span>
          </Button>
          
          {/* Dropdown Exportar con click interactivo y anclaje relativo */}
          <div ref={exportMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
            <Button 
              variant="secondary" 
              onClick={() => setIsExportMenuOpen(prev => !prev)}
              style={{
                height: 38,
                padding: '0 14px',
                fontSize: 13,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <FileDown size={15} />
              <span>Exportar</span>
              <ChevronDown size={14} style={{ transform: isExportMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </Button>

            {isExportMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 9999,
                  minWidth: 200,
                  background: 'var(--surface, #ffffff)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md, 10px)',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2
                }}
              >
                <button
                  type="button"
                  onClick={handleExportXLS}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-50, #f5f3ff)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <FileSpreadsheet size={15} style={{ color: '#16a34a' }} />
                  <span>Exportar Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportCSV}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-50, #f5f3ff)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <FileText size={15} style={{ color: 'var(--brand-600, #7c3aed)' }} />
                  <span>Exportar CSV (.csv)</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-50, #f5f3ff)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Printer size={15} style={{ color: 'var(--muted)' }} />
                  <span>Imprimir / PDF</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar / Filtros de Periodo con Búsqueda por Fechas */}
      <div className="toolbar flex-nowrap gap-2 items-center bg-white p-3 rounded-xl border border-border shadow-xs mb-6 overflow-x-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-muted mr-2">Periodo:</span>
        {[
          { id: 'today', label: 'Hoy' },
          { id: 'week', label: 'Esta Semana' },
          { id: 'month', label: 'Este Mes' },
          { id: 'all', label: 'Histórico' }
        ].map(p => (
          <Button
            key={p.id}
            variant={period === p.id && !startDate && !endDate ? 'primary' : 'secondary'}
            onClick={() => {
              setPeriod(p.id as any);
              setStartDate('');
              setEndDate('');
            }}
          >
            {p.label}
          </Button>
        ))}

        <div className="h-4 w-px bg-border mx-2 hidden sm:block"></div>

        {/* Búsqueda por fechas: Estilo unificado ERP (Desde [input] hasta [input]) */}
        <div className="flex items-end gap-2 flex-nowrap" style={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'nowrap' }}>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted whitespace-nowrap">Desde:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPeriod('custom');
              }}
              className="input text-xs"
              style={{ width: '130px', height: '36px', padding: '0 8px' }}
              title="Fecha inicial (Desde)"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted whitespace-nowrap">Hasta:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPeriod('custom');
              }}
              className="input text-xs"
              style={{ width: '130px', height: '36px', padding: '0 8px' }}
              title="Fecha final (Hasta)"
            />
          </div>

          {(startDate || endDate) && (
            <Button
              variant="ghost"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setPeriod('month');
              }}
              style={{ height: '34px', fontSize: '11px', padding: '0 8px', color: 'var(--muted)' }}
              title="Restablecer fechas"
            >
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-4 mb-6">
        <Card>
          <div className="kpi-label">Total Órdenes / Ventas</div>
          <div className="kpi-value">{isLoading ? '—' : totalOrders}</div>
          <div className="muted small">Transacciones comerciales validadas</div>
        </Card>
        <Card>
          <div className="kpi-label">Total Ingresos Facturados</div>
          <div className="kpi-value">{isLoading ? '—' : formatUSD(totalIncome)}</div>
          <div className="muted small">Equivalente: {formatVES(totalIncome * exchangeRate)}</div>
        </Card>
        <Card>
          <div className="kpi-label">Utilidad Estimada</div>
          <div className="kpi-value positive">{isLoading ? '—' : formatUSD(estimatedProfit)}</div>
          <div className="muted small">Margen comercial bruto</div>
        </Card>
        <Card>
          <div className="kpi-label">Ticket Promedio</div>
          <div className="kpi-value">{isLoading ? '—' : formatUSD(averageTicket)}</div>
          <div className="muted small">Equivalente: {formatVES(averageTicket * exchangeRate)}</div>
        </Card>
      </div>

      {/* Search Toolbar con texto 'Filtra por:' antes de metodos de pagos y desplegable de documentos */}
      <div className="toolbar mb-4 flex-wrap gap-3 items-center">
        <div className="search">
          <Search className="w-4 h-4" />
          <input
            type="text"
            placeholder={
              reportView === 'PRODUCTOS'
                ? "Buscar producto por nombre o SKU..."
                : reportView === 'METODOS_PAGO'
                  ? "Buscar método de pago..."
                  : "Buscar por N° comprobante, cliente, cédula/RIF o banco..."
            }
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input"
            style={{ width: '380px' }}
          />
        </div>

        {/* 1. Antes de métodos de pagos, colocamos el texto "Filtra por:" */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted whitespace-nowrap">Filtra por:</span>
          <select
            value={reportView}
            onChange={(e) => setReportView(e.target.value as any)}
            className="input text-xs font-semibold"
            style={{ width: 'auto', minWidth: '190px', height: '38px', padding: '0 10px' }}
          >
            <option value="VENTAS">Detalle de Ventas</option>
            <option value="PRODUCTOS">Productos + Vendidos</option>
            <option value="METODOS_PAGO">Metodos de Pagos</option>
          </select>
        </div>

        {/* Campo desplegable de documentos al lado */}
        <select
          value={docTypeFilter}
          onChange={(e) => setDocTypeFilter(e.target.value)}
          className="input text-xs font-semibold"
          style={{ width: 'auto', minWidth: '180px', height: '38px', padding: '0 10px' }}
        >
          <option value="TODOS">Todos los comprobantes</option>
          <option value="FACTURA">Facturas</option>
          <option value="NOTA">Notas de Entrega</option>
          <option value="PEDIDO">Pedidos Web</option>
        </select>
      </div>

      {/* Table / Vista según reportView */}
      <Card>
        {reportView === 'VENTAS' && (
          <>
            <div className="section-head">
              <h3>Detalle de Transacciones</h3>
              <span className="badge brand">{filteredSales.length} comprobantes</span>
            </div>
            {filteredSales.length === 0 ? (
              <div className="empty">No se encontraron ventas para los filtros seleccionados.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>N° Comprobante</th>
                      <th>Tipo</th>
                      <th>Cliente</th>
                      <th>Método / Cuenta de Pago</th>
                      <th className="num">Monto USD</th>
                      <th className="num">Monto VES</th>
                      <th>Estado</th>
                      <th className="num">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales.map((mov) => (
                      <tr key={mov.id}>
                        <td className="muted">{new Date(mov.created_at).toLocaleDateString()}</td>
                        <td className="font-bold">{mov.display_number}</td>
                        <td>{renderDocTypeBadge(mov.doc_type)}</td>
                        <td>
                          <div>
                            <div className="font-semibold">{mov.customer_name}</div>
                            {mov.customer_doc && mov.customer_doc !== 'N/A' && (
                              <div className="small muted">{mov.customer_doc}</div>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="badge" style={{ background: '#f0f1f6', color: '#5f6572' }}>
                            {mov.payment_method}
                          </span>
                        </td>
                        <td className="num font-bold">{formatUSD(Number(mov.total_usd))}</td>
                        <td className="num muted">{formatVES(Number(mov.total_usd) * exchangeRate)}</td>
                        <td>
                          <span className={`badge ${mov.status === 'COMPLETADA' || mov.status === 'ENTREGADO' || mov.status === 'PAGADO' ? 'success' : 'warning'}`}>
                            {mov.status}
                          </span>
                        </td>
                        <td className="num">
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn ghost"
                              title="Abrir formulario y ficha completa"
                              onClick={() => navigate(`/ventas-flash/reporte/${mov.id}`)}
                              style={{
                                width: 36,
                                height: 36,
                                padding: 0,
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: '#f5f3f7',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text)'
                              }}
                            >
                              <ExternalLink size={14} style={{ backgroundColor: '#f5f3f7' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {reportView === 'PRODUCTOS' && (
          <>
            <div className="section-head">
              <h3>Ranking de Productos Más Vendidos</h3>
              <span className="badge brand">{topProductsList.length} artículos</span>
            </div>
            {topProductsList.length === 0 ? (
              <div className="empty">No se registraron productos vendidos en el rango de fechas seleccionado.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>#</th>
                      <th>Producto / Descripción</th>
                      <th>SKU</th>
                      <th className="num">Unidades Vendidas</th>
                      <th className="num">Precio Prom. USD</th>
                      <th className="num">Total USD</th>
                      <th className="num">Total VES</th>
                      <th style={{ width: 160 }}>Participación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProductsList.map((prod, index) => {
                      const sharePercent = totalIncome > 0 ? (prod.totalUsd / totalIncome) * 100 : 0;
                      const avgPrice = prod.totalQuantity > 0 ? prod.totalUsd / prod.totalQuantity : 0;
                      return (
                        <tr key={prod.sku + '-' + prod.name + '-' + index}>
                          <td>
                            <span 
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                fontSize: 11,
                                fontWeight: 700,
                                background: index === 0 ? '#fef3c7' : index === 1 ? '#f3f4f6' : index === 2 ? '#ffedd5' : '#f8fafc',
                                color: index === 0 ? '#b45309' : index === 1 ? '#475569' : index === 2 ? '#c2410c' : '#64748b',
                                border: '1px solid var(--border)'
                              }}
                            >
                              {index + 1}
                            </span>
                          </td>
                          <td>
                            <div className="font-semibold">{prod.name}</div>
                          </td>
                          <td className="muted text-xs font-mono">{prod.sku}</td>
                          <td className="num font-bold">
                            <span className="badge brand" style={{ fontWeight: 700 }}>
                              {prod.totalQuantity} uds.
                            </span>
                          </td>
                          <td className="num muted">{formatUSD(avgPrice)}</td>
                          <td className="num font-bold">{formatUSD(prod.totalUsd)}</td>
                          <td className="num muted">{formatVES(prod.totalUsd * exchangeRate)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div 
                                style={{
                                  flex: 1,
                                  height: 6,
                                  borderRadius: 999,
                                  background: '#f1f5f9',
                                  overflow: 'hidden'
                                }}
                              >
                                <div 
                                  style={{
                                    height: '100%',
                                    borderRadius: 999,
                                    background: 'var(--brand-500, #8b5cf6)',
                                    width: `${Math.min(100, Math.max(0, sharePercent))}%`
                                  }}
                                />
                              </div>
                              <span className="text-xs font-medium text-muted" style={{ minWidth: 38, textAlign: 'right' }}>
                                {sharePercent.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {reportView === 'METODOS_PAGO' && (
          <>
            <div className="section-head">
              <h3>Distribución de Ventas por Métodos de Pago</h3>
              <span className="badge brand">{paymentMethodsList.length} métodos</span>
            </div>
            {paymentMethodsList.length === 0 ? (
              <div className="empty">No se registraron transacciones de pago en el rango seleccionado.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Método / Cuenta de Pago</th>
                      <th className="num">N° Transacciones</th>
                      <th className="num">Total Recaudado USD</th>
                      <th className="num">Total Recaudado VES</th>
                      <th className="num">Ticket Promedio USD</th>
                      <th style={{ width: 170 }}>% del Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentMethodsList.map((m, index) => {
                      const sharePercent = totalIncome > 0 ? (m.totalUsd / totalIncome) * 100 : 0;
                      const avgTicket = m.transactionsCount > 0 ? m.totalUsd / m.transactionsCount : 0;
                      return (
                        <tr key={m.method + '-' + index}>
                          <td>
                            <div className="font-semibold" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span 
                                style={{
                                  display: 'inline-block',
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  background: 'var(--brand-500, #8b5cf6)'
                                }}
                              />
                              {m.method}
                            </div>
                          </td>
                          <td className="num font-bold">
                            <span className="badge" style={{ background: '#f0f1f6', color: '#5f6572' }}>
                              {m.transactionsCount} ops
                            </span>
                          </td>
                          <td className="num font-bold">{formatUSD(m.totalUsd)}</td>
                          <td className="num muted">{formatVES(m.totalUsd * exchangeRate)}</td>
                          <td className="num muted">{formatUSD(avgTicket)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div 
                                style={{
                                  flex: 1,
                                  height: 6,
                                  borderRadius: 999,
                                  background: '#f1f5f9',
                                  overflow: 'hidden'
                                }}
                              >
                                <div 
                                  style={{
                                    height: '100%',
                                    borderRadius: 999,
                                    background: 'var(--brand-500, #8b5cf6)',
                                    width: `${Math.min(100, Math.max(0, sharePercent))}%`
                                  }}
                                />
                              </div>
                              <span className="text-xs font-medium text-muted" style={{ minWidth: 38, textAlign: 'right' }}>
                                {sharePercent.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Modal de Detalle */}
      <SaleDetailModal 
        isOpen={Boolean(selectedMovementDetail)} 
        onClose={() => setSelectedMovementDetail(null)} 
        saleId={selectedMovementDetail?.id || ''} 
      />
    </div>
  );
};
