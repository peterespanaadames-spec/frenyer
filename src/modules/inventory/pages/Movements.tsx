import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  History,
  RefreshCw,
  Plus,
  Search,
  Download,
  FileText,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  User,
  Building2,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Package,
  Boxes,
  HelpCircle,
  ChevronDown,
  FileSpreadsheet
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import {
  getActiveExchangeRate,
  formatUSD,
  formatVES,
  convertUSDtoVES
} from '../../../lib/currency';
import {
  fetchInventoryMovementsFromSupabase,
  recordInventoryAdjustmentInSupabase,
  fetchProductsFromSupabase,
  DbInventoryMovement,
  DbProduct
} from '../../../lib/supabase/db';

type SortField = 'created_at' | 'doc_number' | 'entity_name' | 'quantity' | 'total_usd';
type SortOrder = 'asc' | 'desc';

type MovementFilterType = 'TODOS' | 'ENTRADAS' | 'SALIDAS' | 'COMPRAS' | 'VENTAS' | 'AJUSTES';
type PeriodFilter = 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'THIS_MONTH' | 'LAST_MONTH';

export function MovementsPage() {
  const [movements, setMovements] = useState<DbInventoryMovement[]>([]);
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductSku, setSelectedProductSku] = useState<string>('ALL');
  const [movementTypeFilter, setMovementTypeFilter] = useState<MovementFilterType>('TODOS');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('ALL');

  // Ordenamiento
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Tasa BCV activa
  const [activeRate, setActiveRate] = useState<number>(() => getActiveExchangeRate());

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modales
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedMovementDetail, setSelectedMovementDetail] = useState<DbInventoryMovement | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Formulario de Ajuste de Stock
  const [adjustSku, setAdjustSku] = useState('');
  const [adjustType, setAdjustType] = useState<'ENTRADA' | 'SALIDA' | 'CORRECCION'>('ENTRADA');
  const [adjustQty, setAdjustQty] = useState<string>('1');
  const [adjustReason, setAdjustReason] = useState('Conteo físico de inventario');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustDocNumber, setAdjustDocNumber] = useState('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Carga inicial y listeners
  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedMovements, fetchedProducts] = await Promise.all([
        fetchInventoryMovementsFromSupabase(),
        fetchProductsFromSupabase()
      ]);
      setMovements(fetchedMovements || []);
      setProducts(fetchedProducts || []);
      setActiveRate(getActiveExchangeRate());
    } catch (err: any) {
      console.error('Error cargando movimientos de inventario:', err);
      setError(err?.message || 'No se pudieron consultar los movimientos de inventario.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleRateChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ rate: number }>;
      if (customEvent.detail?.rate) {
        setActiveRate(customEvent.detail.rate);
      }
    };
    window.addEventListener('frenyer:rate-changed', handleRateChange);
    return () => window.removeEventListener('frenyer:rate-changed', handleRateChange);
  }, []);

  // Cerrar menú de exportación al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
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

  // Autogenerar código de comprobante para nuevo ajuste al abrir el modal
  useEffect(() => {
    if (isAdjustModalOpen) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      setAdjustDocNumber(`AJU-${randomSuffix}`);
      if (products.length > 0 && !adjustSku) {
        setAdjustSku(products[0].sku);
      }
    }
  }, [isAdjustModalOpen, products, adjustSku]);

  // Producto seleccionado para ajuste
  const activeAdjustProduct = useMemo(() => {
    return products.find(p => p.sku === adjustSku) || null;
  }, [products, adjustSku]);

  // Cálculo de stock proyectado en el modal de ajuste
  const projectedStock = useMemo(() => {
    if (!activeAdjustProduct) return 0;
    const current = Number(activeAdjustProduct.stock) || 0;
    const qty = parseFloat(adjustQty) || 0;

    if (adjustType === 'ENTRADA') {
      return current + qty;
    } else if (adjustType === 'SALIDA') {
      return Math.max(0, current - qty);
    } else {
      return Math.max(0, qty);
    }
  }, [activeAdjustProduct, adjustType, adjustQty]);

  // Margen promedio comercial del catálogo
  const averageCatalogMargin = useMemo(() => {
    if (products.length === 0) return 0;
    let totalCost = 0;
    let totalPrice = 0;
    let validCount = 0;

    for (const p of products) {
      const c = Number(p.cost_usd) || 0;
      const pr = Number(p.price_usd) || 0;
      if (pr > 0) {
        totalCost += c;
        totalPrice += pr;
        validCount++;
      }
    }

    if (validCount === 0 || totalPrice === 0) return 0;
    const margin = ((totalPrice - totalCost) / totalPrice) * 100;
    return Math.max(0, Math.round(margin * 10) / 10);
  }, [products]);

  // Filtrado de movimientos por período
  const isDateInPeriod = (dateStr: string, period: PeriodFilter): boolean => {
    if (period === 'ALL') return true;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return true;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (period === 'TODAY') {
      const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      return target.getTime() === today.getTime();
    }

    if (period === 'LAST_7_DAYS') {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);
      return date >= sevenDaysAgo && date <= now;
    }

    if (period === 'LAST_30_DAYS') {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      return date >= thirtyDaysAgo && date <= now;
    }

    if (period === 'THIS_MONTH') {
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }

    if (period === 'LAST_MONTH') {
      const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      return date.getFullYear() === lastMonthYear && date.getMonth() === lastMonth;
    }

    return true;
  };

  // Movimientos filtrados
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      // 1. Filtro de producto
      if (selectedProductSku !== 'ALL' && m.sku !== selectedProductSku) {
        return false;
      }

      // 2. Filtro de período
      if (!isDateInPeriod(m.created_at, periodFilter)) {
        return false;
      }

      // 3. Filtro de tipo de movimiento
      if (movementTypeFilter !== 'TODOS') {
        const typeUpper = (m.movement_type || '').toUpperCase();
        if (movementTypeFilter === 'ENTRADAS') {
          if (m.quantity <= 0 && !typeUpper.includes('ENTRADA') && !typeUpper.includes('COMPRA')) return false;
        } else if (movementTypeFilter === 'SALIDAS') {
          if (m.quantity >= 0 && !typeUpper.includes('SALIDA') && !typeUpper.includes('VENTA')) return false;
        } else if (movementTypeFilter === 'COMPRAS') {
          if (!typeUpper.includes('COMPRA')) return false;
        } else if (movementTypeFilter === 'VENTAS') {
          if (!typeUpper.includes('VENTA')) return false;
        } else if (movementTypeFilter === 'AJUSTES') {
          if (!typeUpper.includes('AJUSTE')) return false;
        }
      }

      // 4. Búsqueda de texto general
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const doc = (m.doc_number || '').toLowerCase();
        const sku = (m.sku || '').toLowerCase();
        const pName = (m.product_name || '').toLowerCase();
        const entity = (m.entity_name || '').toLowerCase();
        const reason = (m.reason || '').toLowerCase();
        const notes = (m.notes || '').toLowerCase();

        const match =
          doc.includes(q) ||
          sku.includes(q) ||
          pName.includes(q) ||
          entity.includes(q) ||
          reason.includes(q) ||
          notes.includes(q);

        if (!match) return false;
      }

      return true;
    });
  }, [movements, selectedProductSku, periodFilter, movementTypeFilter, searchTerm]);

  // Indicadores de las 5 tarjetas calculados con base en los datos reales
  const metrics = useMemo(() => {
    // Tarjeta 1: Stock actual total del catálogo (o del producto filtrado)
    let stockTotalUnits = 0;
    if (selectedProductSku !== 'ALL') {
      const single = products.find(p => p.sku === selectedProductSku);
      stockTotalUnits = Number(single?.stock) || 0;
    } else {
      stockTotalUnits = products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0);
    }

    // Tarjetas 2 y 3: Total vendido y comprado en el conjunto filtrado
    let soldUnits = 0;
    let soldAmountVES = 0;

    let purchasedUnits = 0;
    let purchasedAmountVES = 0;

    let manualAdjustmentsCount = 0;

    for (const m of filteredMovements) {
      const typeUpper = (m.movement_type || '').toUpperCase();
      const qty = Number(m.quantity) || 0;
      const ves = Number(m.total_ves) || (Number(m.total_usd) * (Number(m.exchange_rate) || activeRate)) || 0;

      if (typeUpper.includes('VENTA') || (qty < 0 && !typeUpper.includes('AJUSTE'))) {
        soldUnits += Math.abs(qty);
        soldAmountVES += ves;
      } else if (typeUpper.includes('COMPRA') || (qty > 0 && !typeUpper.includes('AJUSTE'))) {
        purchasedUnits += Math.abs(qty);
        purchasedAmountVES += ves;
      }

      if (typeUpper.includes('AJUSTE')) {
        manualAdjustmentsCount++;
      }
    }

    return {
      stockTotalUnits,
      soldUnits,
      soldAmountVES,
      purchasedUnits,
      purchasedAmountVES,
      totalOperations: filteredMovements.length,
      manualAdjustmentsCount
    };
  }, [products, filteredMovements, selectedProductSku, activeRate]);

  // Ordenamiento de la tabla
  const sortedMovements = useMemo(() => {
    const list = [...filteredMovements];
    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'created_at') {
        valA = new Date(a.created_at).getTime() || 0;
        valB = new Date(b.created_at).getTime() || 0;
      } else if (sortField === 'quantity' || sortField === 'total_usd') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else {
        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredMovements, sortField, sortOrder]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(sortedMovements.length / pageSize));
  const paginatedMovements = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedMovements.slice(start, start + pageSize);
  }, [sortedMovements, currentPage, pageSize]);

  // Reseteo de página si los filtros cambian
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedProductSku, movementTypeFilter, periodFilter, pageSize]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Exportar a CSV
  const handleExportCSV = () => {
    if (filteredMovements.length === 0) {
      showToast('No hay movimientos en la vista para exportar.', 'info');
      return;
    }

    const headers = [
      'Fecha',
      'Hora',
      'Comprobante',
      'Tipo Movimiento',
      'SKU',
      'Producto',
      'Cliente/Proveedor',
      'Cantidad (Unidades)',
      'Precio/Costo USD',
      'Total USD',
      'Tasa BCV',
      'Total VES',
      'Motivo'
    ];

    const rows = filteredMovements.map(m => {
      const dt = new Date(m.created_at);
      const fecha = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('es-VE');
      const hora = isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
      const unitVal = m.unit_price_usd > 0 ? m.unit_price_usd : m.unit_cost_usd;

      return [
        `"${fecha}"`,
        `"${hora}"`,
        `"${m.doc_number || ''}"`,
        `"${m.movement_type || ''}"`,
        `"${m.sku || ''}"`,
        `"${(m.product_name || '').replace(/"/g, '""')}"`,
        `"${(m.entity_name || 'Sin asignar').replace(/"/g, '""')}"`,
        m.quantity,
        (Number(unitVal) || 0).toFixed(2),
        (Number(m.total_usd) || 0).toFixed(2),
        (Number(m.exchange_rate) || activeRate).toFixed(4),
        (Number(m.total_ves) || (Number(m.total_usd) * (Number(m.exchange_rate) || activeRate))).toFixed(2),
        `"${(m.reason || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `movimientos_inventario_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Movimientos exportados a CSV con éxito.');
  };

  // Exportar a Excel (.xlsx)
  const handleExportXLS = () => {
    setIsExportMenuOpen(false);
    if (filteredMovements.length === 0) {
      showToast('No hay movimientos en la vista para exportar.', 'info');
      return;
    }

    try {
      const exportData = filteredMovements.map(m => {
        const dt = new Date(m.created_at);
        const fecha = isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('es-VE');
        const hora = isNaN(dt.getTime()) ? '—' : dt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
        const unitVal = m.unit_price_usd > 0 ? m.unit_price_usd : m.unit_cost_usd;
        const rate = Number(m.exchange_rate) || activeRate;
        const totalUsd = Number(m.total_usd) || 0;
        const totalVes = Number(m.total_ves) || (totalUsd * rate);

        return {
          'Fecha': fecha,
          'Hora': hora,
          'Comprobante': m.doc_number || '—',
          'Tipo de Documento': m.doc_type || '—',
          'Tipo de Movimiento': m.movement_type || '—',
          'SKU': m.sku || '—',
          'Producto': m.product_name || '—',
          'Cliente / Proveedor': m.entity_name || 'Sin asignar',
          'Cantidad (Unidades)': m.quantity,
          'Precio / Costo USD': Number((Number(unitVal) || 0).toFixed(2)),
          'Total USD': Number(totalUsd.toFixed(2)),
          'Tasa BCV': Number(rate.toFixed(4)),
          'Total VES': Number(totalVes.toFixed(2)),
          'Motivo / Detalle': m.reason || '—'
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimientos');

      const fileName = `Reporte_Movimientos_Inventario_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      showToast('Reporte de movimientos exportado a Excel (XLSX) exitosamente.');
    } catch (err: any) {
      console.error('Error generando archivo XLS:', err);
      showToast('No se pudo generar el archivo Excel.', 'error');
    }
  };

  // Botón PDF / Imprimir
  const handlePrintPDF = () => {
    setIsExportMenuOpen(false);
    if (filteredMovements.length === 0) {
      showToast('No hay movimientos para imprimir.', 'info');
      return;
    }
    window.print();
  };

  // Enviar formulario de Ajuste Manual
  const handleSubmitAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustSku) {
      showToast('Debes seleccionar un producto del catálogo.', 'error');
      return;
    }

    const qty = parseFloat(adjustQty);
    if (isNaN(qty) || qty < 0 || (adjustType !== 'CORRECCION' && qty === 0)) {
      showToast('Indica una cantidad numérica válida.', 'error');
      return;
    }

    setIsSubmittingAdjust(true);
    try {
      const prod = products.find(p => p.sku === adjustSku);
      const res = await recordInventoryAdjustmentInSupabase({
        sku: adjustSku,
        adjustment_type: adjustType,
        quantity: qty,
        reason: adjustReason,
        notes: adjustNotes,
        doc_number: adjustDocNumber,
        unit_cost_usd: prod?.cost_usd || 0,
        unit_price_usd: prod?.price_usd || 0,
        exchange_rate: activeRate
      });

      if (res.success) {
        showToast('Ajuste de inventario registrado y stock actualizado con éxito.');
        setIsAdjustModalOpen(false);
        setAdjustNotes('');
        setAdjustQty('1');
        await loadData();
      } else {
        showToast(res.error || 'No se pudo registrar el ajuste.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error en el servidor al registrar el ajuste.', 'error');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Helper de formato de fecha y hora
  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { date: '—', time: '—' };
    return {
      date: d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
    };
  };

  // Helper para etiqueta de comprobante
  const getDocPrefix = (docType: string, docNumber: string) => {
    const dt = (docType || '').toUpperCase();
    if (dt.includes('FACTURA') || docNumber.startsWith('FAC')) return 'Factura';
    if (dt.includes('NOTA') || docNumber.startsWith('NOT')) return 'Nota';
    if (dt.includes('COMPRA') || docNumber.startsWith('CMP')) return 'Compra';
    if (dt.includes('AJUSTE') || docNumber.startsWith('AJU')) return 'Ajuste';
    return docType || 'Doc';
  };

  return (
    <div className="content" style={{ maxWidth: 1600, paddingBottom: 60 }}>
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            background: toast.type === 'error' ? 'var(--danger)' : toast.type === 'info' ? 'var(--brand-700)' : 'var(--success)',
            color: '#fff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            fontSize: 13,
            fontWeight: 500,
            maxWidth: 420
          }}
        >
          {toast.type === 'error' ? (
            <AlertCircle size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* 2. ENCABEZADO DE LA PANTALLA */}
      <div className="page-head" style={{ alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'var(--brand-50)',
              color: 'var(--brand-500)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--border)'
            }}
          >
            <History size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
              MOVIMIENTOS DE INVENTARIOS
            </h1>
          </div>
        </div>

        {/* Botones de acción alineados a la derecha */}
        <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button
            variant="secondary"
            onClick={loadData}
            disabled={isLoading}
            title="Volver a consultar los datos de la base de datos"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            <span>ACTUALIZAR</span>
          </Button>

          <Button
            variant="primary"
            onClick={() => setIsAdjustModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
          >
            <Plus size={16} />
            <span>AJUSTAR STOCK</span>
          </Button>
        </div>
      </div>

      {/* 3. TARJETAS DE INDICADORES (5 TARJETAS DE RESUMEN CON ALTURAS UNIFORMES) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 14,
          marginBottom: 20
        }}
      >
        {/* Tarjeta 1: Stock actual */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 18, minHeight: 110 }}>
          <div>
            <div className="kpi-label" style={{ fontWeight: 700, letterSpacing: '0.04em', fontSize: 11 }}>
              STOCK ACTUAL
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '6px 0 4px' }}>
              <span className="kpi-value" style={{ margin: 0, fontSize: 26, lineHeight: 1.1 }}>
                {isLoading ? '—' : metrics.stockTotalUnits.toLocaleString('es-VE')}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                UNIDADES
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Badge tone="success">DISPONIBLE</Badge>
            <span className="muted" style={{ fontSize: 11 }}>
              {selectedProductSku !== 'ALL' ? 'Producto activo' : `${products.length} ítems en catálogo`}
            </span>
          </div>
        </Card>

        {/* Tarjeta 2: Total vendido */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 18, minHeight: 110 }}>
          <div>
            <div className="kpi-label" style={{ fontWeight: 700, letterSpacing: '0.04em', fontSize: 11 }}>
              TOTAL VENDIDO
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '6px 0 4px' }}>
              <span className="kpi-value" style={{ margin: 0, fontSize: 26, lineHeight: 1.1, color: 'var(--danger)' }}>
                {isLoading ? '—' : metrics.soldUnits.toLocaleString('es-VE')}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                UNIDADES
              </span>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 500 }}>
            {isLoading ? '—' : formatVES(metrics.soldAmountVES)}
          </div>
        </Card>

        {/* Tarjeta 3: Total comprado */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 18, minHeight: 110 }}>
          <div>
            <div className="kpi-label" style={{ fontWeight: 700, letterSpacing: '0.04em', fontSize: 11 }}>
              TOTAL COMPRADO
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '6px 0 4px' }}>
              <span className="kpi-value" style={{ margin: 0, fontSize: 26, lineHeight: 1.1, color: 'var(--success)' }}>
                {isLoading ? '—' : metrics.purchasedUnits.toLocaleString('es-VE')}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                UNIDADES
              </span>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 500 }}>
            {isLoading ? '—' : formatVES(metrics.purchasedAmountVES)}
          </div>
        </Card>

        {/* Tarjeta 4: Margen y tasa BCV */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 18, minHeight: 110 }}>
          <div>
            <div className="kpi-label" style={{ fontWeight: 700, letterSpacing: '0.04em', fontSize: 11 }}>
              MARGEN &amp; BCV
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '6px 0 4px' }}>
              <span className="kpi-value" style={{ margin: 0, fontSize: 26, lineHeight: 1.1, color: 'var(--brand-700)' }}>
                {averageCatalogMargin.toFixed(1)}%
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                MARGEN MEDIO
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Badge tone="brand">Tasa BCV</Badge>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
              Bs. {activeRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </Card>

        {/* Tarjeta 5: Operaciones */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 18, minHeight: 110 }}>
          <div>
            <div className="kpi-label" style={{ fontWeight: 700, letterSpacing: '0.04em', fontSize: 11 }}>
              OPERACIONES
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '6px 0 4px' }}>
              <span className="kpi-value" style={{ margin: 0, fontSize: 26, lineHeight: 1.1 }}>
                {isLoading ? '—' : metrics.totalOperations.toLocaleString('es-VE')}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                REGISTROS
              </span>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {isLoading ? '—' : `${metrics.manualAdjustmentsCount} ajustes manuales`}
          </div>
        </Card>
      </div>

      {/* 4. BARRA DE BÚSQUEDA Y FILTROS */}
      <Card style={{ padding: 14, marginBottom: 18 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10
          }}
        >
          {/* A. Búsqueda general */}
          <div style={{ flex: '1 1 260px', minWidth: 240, position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted)',
                pointerEvents: 'none'
              }}
            />
            <input
              type="text"
              className="input"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por N° factura, producto, cliente, detalle..."
              style={{ paddingLeft: 36, height: 38, fontSize: 13 }}
            />
          </div>

          {/* B. Selector de productos */}
          <div style={{ minWidth: 190 }}>
            <select
              className="input"
              value={selectedProductSku}
              onChange={e => setSelectedProductSku(e.target.value)}
              style={{ height: 38, fontSize: 13 }}
            >
              <option value="ALL">Todos los Productos ({products.length})</option>
              {products.map(p => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} — {p.name} (Stock: {p.stock})
                </option>
              ))}
            </select>
          </div>

          {/* C. Selector de tipo de movimiento */}
          <div style={{ minWidth: 150 }}>
            <select
              className="input"
              value={movementTypeFilter}
              onChange={e => setMovementTypeFilter(e.target.value as MovementFilterType)}
              style={{ height: 38, fontSize: 13 }}
            >
              <option value="TODOS">Todos</option>
              <option value="ENTRADAS">Entradas de inventario</option>
              <option value="SALIDAS">Salidas de inventario</option>
              <option value="COMPRAS">Compras</option>
              <option value="VENTAS">Ventas</option>
              <option value="AJUSTES">Ajustes manuales</option>
            </select>
          </div>

          {/* D. Selector de período histórico */}
          <div style={{ minWidth: 150 }}>
            <select
              className="input"
              value={periodFilter}
              onChange={e => setPeriodFilter(e.target.value as PeriodFilter)}
              style={{ height: 38, fontSize: 13 }}
            >
              <option value="ALL">Todo el Historial</option>
              <option value="TODAY">Hoy</option>
              <option value="LAST_7_DAYS">Últimos 7 días</option>
              <option value="LAST_30_DAYS">Últimos 30 días</option>
              <option value="THIS_MONTH">Este mes</option>
              <option value="LAST_MONTH">Mes anterior</option>
            </select>
          </div>

          {/* Botón único de reporte: 'Exportar Reporte' con dropdown ('Exportar PDF' y 'Exportar XLS') */}
          <div ref={exportDropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
            <Button
              variant="secondary"
              onClick={() => setIsExportMenuOpen(prev => !prev)}
              title="Opciones de exportación de movimientos"
              style={{
                height: 38,
                padding: '0 14px',
                fontSize: 13,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: isExportMenuOpen ? 'var(--brand-50)' : undefined,
                borderColor: isExportMenuOpen ? 'var(--brand-300)' : undefined
              }}
            >
              <Download size={15} />
              <span>Exportar Reporte</span>
              <ChevronDown size={14} style={{ transition: 'transform 0.2s', transform: isExportMenuOpen ? 'rotate(180deg)' : 'none' }} />
            </Button>

            {isExportMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 50,
                  minWidth: 175,
                  background: 'var(--surface, #ffffff)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md, 10px)',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2
                }}
              >
                <button
                  type="button"
                  onClick={handlePrintPDF}
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
                    cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-50, #f5f3ff)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <FileText size={15} style={{ color: 'var(--danger, #ef4444)' }} />
                  <span>Exportar PDF</span>
                </button>

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
                    cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-50, #f5f3ff)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <FileSpreadsheet size={15} style={{ color: 'var(--success, #16a34a)' }} />
                  <span>Exportar XLS</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 5. TABLA DE MOVIMIENTOS & 6. COMPORTAMIENTO Y FUNCIONALIDAD */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {/* Mensaje de error si falla la consulta */}
        {error ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <AlertCircle size={32} style={{ color: 'var(--danger)', marginBottom: 8 }} />
            <h3 style={{ margin: '0 0 8px' }}>Error consultando movimientos</h3>
            <p className="muted" style={{ maxWidth: 460, margin: '0 auto 16px', fontSize: 13 }}>
              {error}
            </p>
            <Button variant="primary" onClick={loadData}>
              Reintentar consulta
            </Button>
          </div>
        ) : isLoading ? (
          <div style={{ padding: 50, textAlign: 'center' }}>
            <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--brand-500)', marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              Cargando movimientos reales desde Supabase...
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              Consultando kárdex de compras, ventas y ajustes de stock
            </p>
          </div>
        ) : sortedMovements.length === 0 ? (
          <EmptyState
            title="No se encontraron movimientos"
            description={
              searchTerm || selectedProductSku !== 'ALL' || movementTypeFilter !== 'TODOS' || periodFilter !== 'ALL'
                ? 'Ningún movimiento coincide con los filtros y la búsqueda aplicados. Prueba ajustando los criterios.'
                : 'Aún no hay movimientos registrados en la base de datos de inventarios. Puedes registrar un ajuste con el botón superior.'
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    {/* Columna 1: FECHA Y HORA */}
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none', width: '16%' }}
                      onClick={() => toggleSort('created_at')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>FECHA Y HORA</span>
                        {sortField === 'created_at' ? (
                          sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} className="muted" />
                        )}
                      </div>
                    </th>

                    {/* Columna 2: COMPROBANTE / REF */}
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none', width: '18%' }}
                      onClick={() => toggleSort('doc_number')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>COMPROBANTE / REF</span>
                        {sortField === 'doc_number' ? (
                          sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} className="muted" />
                        )}
                      </div>
                    </th>

                    {/* Columna 3: CLIENTE / PROVEEDOR */}
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none', width: '22%' }}
                      onClick={() => toggleSort('entity_name')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>CLIENTE / PROVEEDOR</span>
                        {sortField === 'entity_name' ? (
                          sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} className="muted" />
                        )}
                      </div>
                    </th>

                    {/* Columna 4: MOVIMIENTO */}
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none', width: '16%' }}
                      onClick={() => toggleSort('quantity')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>MOVIMIENTO</span>
                        {sortField === 'quantity' ? (
                          sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} className="muted" />
                        )}
                      </div>
                    </th>

                    {/* Columna 5: PRECIO/COSTO */}
                    <th style={{ width: '14%' }}>
                      <span>PRECIO / COSTO</span>
                    </th>

                    {/* Columna 6: MONTO TOTAL */}
                    <th
                      className="num"
                      style={{ cursor: 'pointer', userSelect: 'none', width: '14%' }}
                      onClick={() => toggleSort('total_usd')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <span>MONTO TOTAL</span>
                        {sortField === 'total_usd' ? (
                          sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} className="muted" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedMovements.map(mov => {
                    const { date, time } = formatDateTime(mov.created_at);
                    const qty = Number(mov.quantity) || 0;
                    const isPositive = qty > 0;
                    const isNegative = qty < 0;

                    // Valor unitario aplicable
                    const unitVal = mov.unit_price_usd > 0 ? mov.unit_price_usd : mov.unit_cost_usd;
                    const rateApplied = Number(mov.exchange_rate) || activeRate;
                    const totalUsd = Number(mov.total_usd) || (Math.abs(qty) * unitVal);
                    const totalVes = Number(mov.total_ves) || (totalUsd * rateApplied);

                    const entityName = mov.entity_name && mov.entity_name.trim() ? mov.entity_name : 'Sin asignar';
                    const prefix = getDocPrefix(mov.doc_type, mov.doc_number);

                    return (
                      <tr
                        key={mov.id}
                        style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                        onClick={() => setSelectedMovementDetail(mov)}
                        title="Haz clic para ver el detalle del movimiento"
                      >
                        {/* Columna 1: FECHA Y HORA */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Clock size={13} className="text-muted" style={{ flexShrink: 0 }} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                                {date}
                              </div>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {time}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Columna 2: COMPROBANTE / REF */}
                        <td>
                          <div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <Badge
                                tone={
                                  mov.doc_number.startsWith('FAC') || mov.doc_type === 'FACTURA'
                                    ? 'brand'
                                    : mov.doc_number.startsWith('CMP') || mov.doc_type === 'COMPRA'
                                    ? 'success'
                                    : 'warning'
                                }
                              >
                                {prefix} #{mov.doc_number}
                              </Badge>
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                color: 'var(--text)',
                                marginTop: 3,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: 220
                              }}
                              title={`${mov.sku} — ${mov.product_name}`}
                            >
                              <span style={{ fontWeight: 700, color: 'var(--muted)', marginRight: 4 }}>
                                {mov.sku}
                              </span>
                              {mov.product_name}
                            </div>
                          </div>
                        </td>

                        {/* Columna 3: CLIENTE / PROVEEDOR */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: '50%',
                                background: 'var(--canvas)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--muted)',
                                flexShrink: 0
                              }}
                            >
                              {mov.entity_type === 'PROVEEDOR' ? (
                                <Building2 size={13} />
                              ) : (
                                <User size={13} />
                              )}
                            </div>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: entityName === 'Sin asignar' ? 'var(--muted)' : 'var(--text)' }}>
                                {entityName}
                              </div>
                              {mov.reason && (
                                <div className="muted" style={{ fontSize: 11, textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                  {mov.reason}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Columna 4: MOVIMIENTO */}
                        <td>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Badge tone={isNegative ? 'danger' : isPositive ? 'success' : 'warning'}>
                              {isPositive ? `+${qty.toLocaleString('es-VE')}` : qty.toLocaleString('es-VE')} Unid.
                            </Badge>
                          </div>
                        </td>

                        {/* Columna 5: PRECIO/COSTO */}
                        <td>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                              {formatUSD(unitVal)}
                            </div>
                            <div className="muted" style={{ fontSize: 11 }}>
                              Ref: {formatVES(unitVal * rateApplied)}
                            </div>
                          </div>
                        </td>

                        {/* Columna 6: MONTO TOTAL */}
                        <td className="num">
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                              {formatUSD(totalUsd)}
                            </div>
                            <div className="muted" style={{ fontSize: 11, fontWeight: 500 }}>
                              {formatVES(totalVes)}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Barra de Paginación */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface)',
                flexWrap: 'wrap',
                gap: 12
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--muted)' }}>
                <span>
                  Mostrando {Math.min((currentPage - 1) * pageSize + 1, sortedMovements.length)} a{' '}
                  {Math.min(currentPage * pageSize, sortedMovements.length)} de{' '}
                  <b>{sortedMovements.length.toLocaleString('es-VE')}</b> movimientos
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Por página:</span>
                  <select
                    className="input"
                    value={pageSize}
                    onChange={e => setPageSize(Number(e.target.value))}
                    style={{ height: 28, padding: '0 6px', fontSize: 12, width: 70 }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {/* Botones de navegación de página */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Button
                  variant="secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                >
                  <ChevronLeft size={14} />
                  <span>Anterior</span>
                </Button>

                <span style={{ fontSize: 12, fontWeight: 600, padding: '0 8px', color: 'var(--text)' }}>
                  Página {currentPage} de {totalPages}
                </span>

                <Button
                  variant="secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                >
                  <span>Siguiente</span>
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* 7. MODAL DE AJUSTE MANUAL DE STOCK */}
      {isAdjustModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => !isSubmittingAdjust && setIsAdjustModalOpen(false)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 580,
              padding: 24,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 16px 40px rgba(0,0,0,0.18)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--brand-50)',
                    color: 'var(--brand-600)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Boxes size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>AJUSTAR STOCK MANUAL</h3>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Actualiza las existencias reales y registra la auditoría en Supabase
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn ghost"
                onClick={() => setIsAdjustModalOpen(false)}
                disabled={isSubmittingAdjust}
                style={{ padding: 6, height: 'auto' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitAdjust}>
              {/* Selección de Producto */}
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Producto a Ajustar *</label>
                <select
                  className="input"
                  value={adjustSku}
                  onChange={e => setAdjustSku(e.target.value)}
                  required
                >
                  <option value="">Selecciona un producto...</option>
                  {products.map(p => (
                    <option key={p.sku} value={p.sku}>
                      [{p.sku}] {p.name} — Stock disponible: {p.stock}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vista previa de stock actual del producto */}
              {activeAdjustProduct && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--canvas)',
                    border: '1px solid var(--border)',
                    marginBottom: 16,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 10,
                    textAlign: 'center'
                  }}
                >
                  <div>
                    <div className="muted" style={{ fontSize: 11 }}>STOCK ACTUAL</div>
                    <b style={{ fontSize: 16, color: 'var(--text)' }}>
                      {activeAdjustProduct.stock} uds.
                    </b>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11 }}>COSTO / PRECIO</div>
                    <b style={{ fontSize: 15, color: 'var(--brand-700)' }}>
                      {formatUSD(activeAdjustProduct.cost_usd || activeAdjustProduct.price_usd)}
                    </b>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11 }}>STOCK RESULTANTE</div>
                    <b
                      style={{
                        fontSize: 16,
                        color: projectedStock < activeAdjustProduct.stock ? 'var(--danger)' : 'var(--success)'
                      }}
                    >
                      {projectedStock} uds.
                    </b>
                  </div>
                </div>
              )}

              {/* Tipo de Ajuste */}
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Tipo de Ajuste *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setAdjustType('ENTRADA')}
                    style={{
                      height: 40,
                      background: adjustType === 'ENTRADA' ? 'var(--brand-500)' : 'var(--surface)',
                      color: adjustType === 'ENTRADA' ? '#fff' : 'var(--text)',
                      borderColor: adjustType === 'ENTRADA' ? 'var(--brand-500)' : 'var(--border)',
                      fontWeight: 600,
                      fontSize: 12
                    }}
                  >
                    + Entrada
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setAdjustType('SALIDA')}
                    style={{
                      height: 40,
                      background: adjustType === 'SALIDA' ? 'var(--danger)' : 'var(--surface)',
                      color: adjustType === 'SALIDA' ? '#fff' : 'var(--text)',
                      borderColor: adjustType === 'SALIDA' ? 'var(--danger)' : 'var(--border)',
                      fontWeight: 600,
                      fontSize: 12
                    }}
                  >
                    - Salida
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setAdjustType('CORRECCION')}
                    style={{
                      height: 40,
                      background: adjustType === 'CORRECCION' ? 'var(--brand-700)' : 'var(--surface)',
                      color: adjustType === 'CORRECCION' ? '#fff' : 'var(--text)',
                      borderColor: adjustType === 'CORRECCION' ? 'var(--brand-700)' : 'var(--border)',
                      fontWeight: 600,
                      fontSize: 12
                    }}
                  >
                    = Fijar Stock
                  </button>
                </div>
              </div>

              {/* Cantidad y N° Comprobante */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div className="field">
                  <label>
                    {adjustType === 'CORRECCION' ? 'Nuevo Stock Total *' : 'Cantidad a Ajustar *'}
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="input"
                    value={adjustQty}
                    onChange={e => setAdjustQty(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label>N° Comprobante / Ref</label>
                  <input
                    type="text"
                    className="input"
                    value={adjustDocNumber}
                    onChange={e => setAdjustDocNumber(e.target.value)}
                    placeholder="AJU-1001"
                  />
                </div>
              </div>

              {/* Motivo del Ajuste */}
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Motivo u Observación *</label>
                <select
                  className="input"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  required
                >
                  <option value="Conteo físico de inventario">Conteo físico de inventario</option>
                  <option value="Merma por vencimiento">Merma por vencimiento</option>
                  <option value="Daño o rotura en depósito">Daño o rotura en depósito</option>
                  <option value="Ingreso extraordinario sin factura">Ingreso extraordinario sin factura</option>
                  <option value="Donación o cortesía">Donación o cortesía</option>
                  <option value="Devolución de cliente">Devolución de cliente</option>
                  <option value="Corrección de descuadre">Corrección de descuadre</option>
                </select>
              </div>

              {/* Detalle o notas adicionales */}
              <div className="field" style={{ marginBottom: 20 }}>
                <label>Notas Adicionales (opcional)</label>
                <textarea
                  className="input"
                  style={{ height: 60, padding: 8, resize: 'none' }}
                  value={adjustNotes}
                  onChange={e => setAdjustNotes(e.target.value)}
                  placeholder="Observaciones de auditoría o justificación del ajuste..."
                />
              </div>

              {/* Botones de acción */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsAdjustModalOpen(false)}
                  disabled={isSubmittingAdjust}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmittingAdjust}
                  style={{ minWidth: 140 }}
                >
                  {isSubmittingAdjust ? 'Registrando...' : 'Confirmar Ajuste'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL DE DETALLE DEL MOVIMIENTO */}
      {selectedMovementDetail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => setSelectedMovementDetail(null)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 540,
              padding: 24,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 16px 40px rgba(0,0,0,0.18)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--brand-50)',
                    color: 'var(--brand-700)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Package size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>DETALLE DEL MOVIMIENTO</h3>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {getDocPrefix(selectedMovementDetail.doc_type, selectedMovementDetail.doc_number)} #{selectedMovementDetail.doc_number}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn ghost"
                onClick={() => setSelectedMovementDetail(null)}
                style={{ padding: 6, height: 'auto' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Datos Clave */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                padding: 14,
                borderRadius: 'var(--radius-md)',
                background: 'var(--canvas)',
                border: '1px solid var(--border)',
                marginBottom: 16
              }}
            >
              <div>
                <div className="muted" style={{ fontSize: 11 }}>FECHA Y HORA</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {formatDateTime(selectedMovementDetail.created_at).date} · {formatDateTime(selectedMovementDetail.created_at).time}
                </div>
              </div>

              <div>
                <div className="muted" style={{ fontSize: 11 }}>TIPO DE OPERACIÓN</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-700)' }}>
                  {selectedMovementDetail.movement_type}
                </div>
              </div>

              <div>
                <div className="muted" style={{ fontSize: 11 }}>SKU / CÓDIGO</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedMovementDetail.sku}</div>
              </div>

              <div>
                <div className="muted" style={{ fontSize: 11 }}>PRODUCTO</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {selectedMovementDetail.product_name}
                </div>
              </div>
            </div>

            {/* Impacto en Inventario */}
            <div
              style={{
                padding: 14,
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                marginBottom: 16
              }}
            >
              <div className="kpi-label" style={{ marginBottom: 8 }}>IMPACTO EN UNIDADES</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span className="muted" style={{ fontSize: 12 }}>Variación: </span>
                  <Badge
                    tone={
                      selectedMovementDetail.quantity < 0
                        ? 'danger'
                        : selectedMovementDetail.quantity > 0
                        ? 'success'
                        : 'warning'
                    }
                  >
                    {selectedMovementDetail.quantity > 0
                      ? `+${selectedMovementDetail.quantity}`
                      : selectedMovementDetail.quantity}{' '}
                    Unidades
                  </Badge>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>
                    {formatUSD(selectedMovementDetail.total_usd)}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {formatVES(selectedMovementDetail.total_ves)} (Tasa: {selectedMovementDetail.exchange_rate})
                  </div>
                </div>
              </div>
            </div>

            {/* Entidad y Motivo */}
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              <div>
                <b className="muted" style={{ fontSize: 11 }}>CLIENTE / PROVEEDOR:</b>
                <div style={{ fontWeight: 600 }}>{selectedMovementDetail.entity_name || 'Sin asignar'}</div>
              </div>

              {selectedMovementDetail.reason && (
                <div>
                  <b className="muted" style={{ fontSize: 11 }}>MOTIVO REGISTRADO:</b>
                  <div>{selectedMovementDetail.reason}</div>
                </div>
              )}

              {selectedMovementDetail.notes && (
                <div>
                  <b className="muted" style={{ fontSize: 11 }}>OBSERVACIONES:</b>
                  <div className="muted">{selectedMovementDetail.notes}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setSelectedMovementDetail(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
