import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  FileText,
  RefreshCw,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  ChevronLeft,
  ChevronRight,
  Eye,
  Copy,
  Check,
  X,
  User,
  Building2,
  Calendar,
  Plus,
  FileDown,
  ChevronDown
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import {
  getActiveExchangeRate,
  convertUSDtoVES,
  formatUSD
} from '../../../lib/currency';
import {
  fetchInventoryMovementsFromSupabase,
  fetchProductsFromSupabase,
  recordInventoryAdjustmentInSupabase,
  DbInventoryMovement,
  DbProduct
} from '../../../lib/supabase/db';

type PeriodFilter = 'HOY' | 'SEMANA' | 'MES' | 'HISTORICO';
type MovementTypeFilter = 'TODOS' | 'ENTRADAS' | 'SALIDAS' | 'AJUSTES' | 'COMPRAS' | 'VENTAS';

export function DailyInventoryReportPage() {
  const [movements, setMovements] = useState<DbInventoryMovement[]>([]);
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('HOY');
  const [movementTypeFilter, setMovementTypeFilter] = useState<MovementTypeFilter>('TODOS');
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [showCustomDateRange, setShowCustomDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);

  // Tasa BCV activa
  const [activeRate, setActiveRate] = useState<number>(() => getActiveExchangeRate());

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Inspección de fila
  const [selectedMovement, setSelectedMovement] = useState<DbInventoryMovement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal para nuevo ajuste/movimiento
  const [isNewMovementModalOpen, setIsNewMovementModalOpen] = useState(false);
  // Modal para Vista Previa e Impresión / PDF del Reporte
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [formSku, setFormSku] = useState('');
  const [formType, setFormType] = useState<'ENTRADA' | 'SALIDA' | 'CORRECCION'>('ENTRADA');
  const [formQty, setFormQty] = useState<number>(1);
  const [formUnitCostUSD, setFormUnitCostUSD] = useState<number>(10);
  const [formDocNumber, setFormDocNumber] = useState('');
  const [formWarehouse, setFormWarehouse] = useState('Almacén Principal');
  const [formReason, setFormReason] = useState('Ajuste de inventario físico');
  const [formNotes, setFormNotes] = useState('');

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const copyToClipboard = (text: string, id: string) => {
    if (!text || text === '—') return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast(`Referencia "${text}" copiada al portapapeles.`);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setLoadError(null);
    try {
      const [fetchedMovements, fetchedProducts] = await Promise.all([
        fetchInventoryMovementsFromSupabase(),
        fetchProductsFromSupabase()
      ]);
      setMovements(fetchedMovements || []);
      setProducts(fetchedProducts || []);
      setActiveRate(getActiveExchangeRate());

      if (fetchedProducts && fetchedProducts.length > 0 && !formSku) {
        setFormSku(fetchedProducts[0].sku);
        setFormUnitCostUSD(Number(fetchedProducts[0].cost_usd) || Number(fetchedProducts[0].price_usd) || 10);
      }
    } catch (err: any) {
      console.error('Error cargando reporte diario de inventario:', err);
      if (!silent) {
        setLoadError(err?.message || 'No se pudieron consultar los movimientos de inventario.');
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // Export Menu Dropdown State
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    loadData();
    const handleRateChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ rate: number }>;
      if (customEvent.detail?.rate) {
        setActiveRate(customEvent.detail.rate);
      }
    };
    window.addEventListener('frenyer:rate-changed', handleRateChange);
    return () => {
      window.removeEventListener('frenyer:rate-changed', handleRateChange);
    };
  }, []);

  // Filtrado de movimientos
  const filteredMovements = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();

    const currentDay = now.getDay();
    const diffToMonday = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    const mondayThisWeek = new Date(now.setDate(diffToMonday));
    mondayThisWeek.setHours(0, 0, 0, 0);

    return movements.filter((m) => {
      const mType = (m.movement_type || '').toUpperCase();
      const mDate = new Date(m.created_at || Date.now());

      if (showCustomDateRange && (startDate || endDate)) {
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (mDate < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (mDate > end) return false;
        }
      } else {
        if (periodFilter === 'HOY') {
          if (mDate.toDateString() !== todayStr) return false;
        } else if (periodFilter === 'SEMANA') {
          if (mDate < mondayThisWeek) return false;
        } else if (periodFilter === 'MES') {
          const currentDate = new Date();
          if (mDate.getMonth() !== currentDate.getMonth() || mDate.getFullYear() !== currentDate.getFullYear()) {
            return false;
          }
        }
      }

      if (movementTypeFilter === 'ENTRADAS' && mType !== 'ENTRADA' && mType !== 'COMPRA') return false;
      if (movementTypeFilter === 'SALIDAS' && mType !== 'SALIDA' && mType !== 'VENTA') return false;
      if (movementTypeFilter === 'AJUSTES' && mType !== 'AJUSTE' && mType !== 'CORRECCION') return false;
      if (movementTypeFilter === 'COMPRAS' && mType !== 'COMPRA') return false;
      if (movementTypeFilter === 'VENTAS' && mType !== 'VENTA') return false;

      if (selectedWarehouse !== 'ALL') {
        const whName = ((m as any).warehouseName || 'Almacén Principal').toLowerCase();
        if (!whName.includes(selectedWarehouse.toLowerCase())) return false;
      }

      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const docNum = (m.doc_number || '').toLowerCase();
        const prodName = (m.product_name || '').toLowerCase();
        const sku = (m.sku || '').toLowerCase();
        const responsable = ((m as any).responsable || '').toLowerCase();
        if (!docNum.includes(term) && !prodName.includes(term) && !sku.includes(term) && !responsable.includes(term)) {
          return false;
        }
      }

      return true;
    });
  }, [movements, periodFilter, movementTypeFilter, selectedWarehouse, searchTerm, showCustomDateRange, startDate, endDate]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filteredMovements.length / pageSize));
  const paginatedMovements = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMovements.slice(start, start + pageSize);
  }, [filteredMovements, currentPage, pageSize]);

  // Almacenes
  const availableWarehouses = useMemo(() => {
    const set = new Set<string>();
    movements.forEach((m) => {
      const wh = (m as any).warehouseName;
      if (wh && typeof wh === 'string') set.add(wh);
    });
    return Array.from(set);
  }, [movements]);

  // KPIs
  const kpis = useMemo(() => {
    let totalEntradasQty = 0;
    let totalEntradasUsd = 0;
    let totalSalidasQty = 0;
    let totalSalidasUsd = 0;
    let totalMovilizadoUsd = 0;

    filteredMovements.forEach((m) => {
      const qty = Number(m.quantity) || 0;
      const mType = (m.movement_type || '').toUpperCase();
      const unitCost = Number(m.unit_cost_usd) || Number(m.unit_price_usd) || 10;
      const itemTotalUsd = Math.abs(qty * unitCost);

      totalMovilizadoUsd += itemTotalUsd;

      if (mType === 'ENTRADA' || mType === 'COMPRA' || (mType === 'AJUSTE' && qty > 0)) {
        if (qty > 0) {
          totalEntradasQty += qty;
          totalEntradasUsd += itemTotalUsd;
        } else {
          totalSalidasQty += Math.abs(qty);
          totalSalidasUsd += itemTotalUsd;
        }
      } else if (mType === 'SALIDA' || mType === 'VENTA' || (mType === 'AJUSTE' && qty < 0)) {
        totalSalidasQty += Math.abs(qty);
        totalSalidasUsd += itemTotalUsd;
      }
    });

    const netQty = totalEntradasQty - totalSalidasQty;
    const netUsd = totalEntradasUsd - totalSalidasUsd;

    return {
      totalEntradasQty,
      totalEntradasUsd,
      totalEntradasVes: totalEntradasUsd * activeRate,
      totalSalidasQty,
      totalSalidasUsd,
      totalSalidasVes: totalSalidasUsd * activeRate,
      netQty,
      netUsd,
      netVes: netUsd * activeRate,
      totalMovilizadoUsd,
      totalMovilizadoVes: totalMovilizadoUsd * activeRate,
      count: filteredMovements.length
    };
  }, [filteredMovements, activeRate]);

  // Badge unificado Frenyer con punto indicador
  const renderMovementTypeBadge = (movType: string, qty: number) => {
    const t = (movType || '').toUpperCase();
    if (t.includes('AJUSTE') || t.includes('CORRECCION') || t.includes('NOTA')) {
      return (
        <Badge tone="warning">
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#e5a52b', marginRight: 4 }} />
          Ajuste
        </Badge>
      );
    }
    if (t.includes('COMPRA') || t === 'ENTRADA' || qty > 0) {
      return (
        <Badge tone="success">
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#28a879', marginRight: 4 }} />
          {t === 'COMPRA' ? 'Compra' : 'Entrada'}
        </Badge>
      );
    }
    return (
      <Badge tone="danger">
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#e36f6f', marginRight: 4 }} />
        {t === 'VENTA' ? 'Venta' : 'Salida'}
      </Badge>
    );
  };

  // Guardar nuevo ajuste
  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSku) {
      showToast('Seleccione un producto del catálogo.', 'error');
      return;
    }
    if (!formQty || formQty <= 0) {
      showToast('La cantidad debe ser mayor a 0.', 'error');
      return;
    }

    setIsSubmittingForm(true);
    try {
      const selectedProd = products.find((p) => p.sku === formSku);
      const generatedDocNumber = formDocNumber.trim() || `AJU-${Date.now().toString().slice(-6)}`;
      
      const payload = {
        sku: formSku,
        product_name: selectedProd?.name || 'Producto',
        adjustment_type: formType,
        quantity: formType === 'SALIDA' ? -Math.abs(formQty) : Math.abs(formQty),
        reason: formReason,
        notes: formNotes,
        doc_number: generatedDocNumber,
        unit_cost_usd: formUnitCostUSD,
        unit_price_usd: Number(selectedProd?.price_usd) || formUnitCostUSD,
        exchange_rate: activeRate
      };

      const result = await recordInventoryAdjustmentInSupabase(payload);
      if (result.success) {
        showToast(`Movimiento ${generatedDocNumber} registrado exitosamente.`, 'success');
        setIsNewMovementModalOpen(false);
        setFormNotes('');
        setFormDocNumber('');
        await loadData(true);
      } else {
        showToast(result.error || 'No se pudo guardar el movimiento.', 'error');
      }
    } catch (err: any) {
      console.error('Error registrando ajuste:', err);
      showToast(err?.message || 'Error al registrar el movimiento.', 'error');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Exportar Excel (.xlsx)
  const handleExportExcel = () => {
    setIsExportMenuOpen(false);
    try {
      if (filteredMovements.length === 0) {
        showToast('No hay datos para exportar en el periodo actual.', 'info');
        return;
      }
      const dataToExport = filteredMovements.map((m, index) => {
        const qty = Number(m.quantity) || 0;
        const unitCost = Number(m.unit_cost_usd) || Number(m.unit_price_usd) || 0;
        const totalUsd = Math.abs(qty * unitCost);
        const totalVes = totalUsd * activeRate;
        return {
          'N°': index + 1,
          'Fecha / Hora': new Date(m.created_at || Date.now()).toLocaleString('es-VE'),
          'Documento': m.doc_number || '—',
          'Tipo': m.movement_type || 'Movimiento',
          'SKU': m.sku || '—',
          'Producto': m.product_name || '—',
          'Cantidad': qty,
          'Costo USD': Number(unitCost.toFixed(2)),
          'Total USD': Number(totalUsd.toFixed(2)),
          'Tasa BCV': Number(activeRate.toFixed(2)),
          'Total VES': Number(totalVes.toFixed(2)),
          'Almacén': (m as any).warehouseName || 'Almacén Principal',
          'Responsable': (m as any).responsable || 'Sistema'
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Diario Inventario');
      const filename = `Reporte_Diario_${periodFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, filename);
      showToast('Reporte diario exportado a Excel exitosamente.');
    } catch (err: any) {
      console.error('Error exportando Excel:', err);
      showToast('No se pudo generar el archivo Excel.', 'error');
    }
  };

  // Exportar CSV (.csv)
  const handleExportCSV = () => {
    setIsExportMenuOpen(false);
    try {
      if (filteredMovements.length === 0) {
        showToast('No hay datos para exportar en el periodo actual.', 'info');
        return;
      }
      const headers = [
        'N°',
        'Fecha / Hora',
        'Documento',
        'Tipo',
        'SKU',
        'Producto',
        'Cantidad',
        'Costo USD',
        'Total USD',
        'Tasa BCV',
        'Total VES',
        'Almacén',
        'Responsable'
      ];
      const rows = filteredMovements.map((m, index) => {
        const qty = Number(m.quantity) || 0;
        const unitCost = Number(m.unit_cost_usd) || Number(m.unit_price_usd) || 0;
        const totalUsd = Math.abs(qty * unitCost);
        const totalVes = totalUsd * activeRate;
        return [
          index + 1,
          `"${new Date(m.created_at || Date.now()).toLocaleString('es-VE')}"`,
          `"${(m.doc_number || '—').replace(/"/g, '""')}"`,
          `"${(m.movement_type || 'Movimiento').replace(/"/g, '""')}"`,
          `"${(m.sku || '—').replace(/"/g, '""')}"`,
          `"${(m.product_name || '—').replace(/"/g, '""')}"`,
          qty,
          unitCost.toFixed(2),
          totalUsd.toFixed(2),
          activeRate.toFixed(2),
          totalVes.toFixed(2),
          `"${((m as any).warehouseName || 'Almacén Principal').replace(/"/g, '""')}"`,
          `"${((m as any).responsable || 'Sistema').replace(/"/g, '""')}"`
        ].join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Reporte_Diario_${periodFilter}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Reporte diario exportado a CSV exitosamente.');
    } catch (err: any) {
      console.error('Error exportando CSV:', err);
      showToast('No se pudo generar el archivo CSV.', 'error');
    }
  };

  // Generador de documento HTML formateado profesional para impresión y PDF
  const buildReportHTML = () => {
    const issueDate = new Date().toLocaleString('es-VE', { dateStyle: 'long', timeStyle: 'short' });
    const periodLabel = periodFilter === 'HOY' ? 'Hoy' : periodFilter === 'SEMANA' ? 'Esta Semana' : periodFilter === 'MES' ? 'Este Mes' : 'Histórico';
    
    const rowsHtml = filteredMovements.map((m, idx) => {
      const qty = Number(m.quantity) || 0;
      const unitCost = Number(m.unit_cost_usd) || Number(m.unit_price_usd) || 0;
      const totalUsd = Math.abs(qty * unitCost);
      const totalVes = totalUsd * activeRate;
      const dateStr = new Date(m.created_at || Date.now()).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
      const mType = (m.movement_type || '').toUpperCase();
      const badgeClass = (mType.includes('AJUSTE') || mType.includes('CORRECCION')) ? 'ajuste' : (mType.includes('COMPRA') || mType === 'ENTRADA' || qty > 0) ? 'entrada' : 'salida';
      const typeLabel = (mType.includes('AJUSTE') || mType.includes('CORRECCION')) ? 'Ajuste' : (mType.includes('COMPRA') || mType === 'ENTRADA' || qty > 0) ? 'Entrada' : 'Salida';

      return `
        <tr>
          <td style="text-align: center; color: #64748b;">${idx + 1}</td>
          <td style="white-space: nowrap; color: #475569;">${dateStr}</td>
          <td style="font-family: monospace; font-weight: 600;">${m.doc_number || '—'}</td>
          <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
          <td>
            <div style="font-weight: 600;">${m.product_name || 'Producto'}</div>
            <div style="color: #64748b; font-size: 9px; font-family: monospace;">SKU: ${m.sku || '—'}</div>
          </td>
          <td style="color: #475569;">${(m as any).warehouseName || 'Almacén Principal'}</td>
          <td class="num" style="font-weight: 700; color: ${qty > 0 ? '#166534' : '#991b1b'};">
            ${qty > 0 ? `+${qty}` : qty}
          </td>
          <td class="num" style="font-family: monospace;">$${unitCost.toFixed(2)}</td>
          <td class="num">
            <div style="font-weight: 700; font-family: monospace;">$${totalUsd.toFixed(2)}</div>
            <div style="color: #64748b; font-size: 9px;">≈ Bs. ${totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </td>
          <td style="color: #475569;">${(m as any).responsable || 'Sistema'}</td>
        </tr>
      `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte Diario de Inventario - Frenyer ERP</title>
  <style>
    @page { size: letter landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 20px;
      font-size: 11px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #8b78e8;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .brand h1 { margin: 0; font-size: 20px; color: #1e1b4b; }
    .brand span { color: #8b78e8; }
    .brand p { margin: 3px 0 0; color: #64748b; font-size: 11px; }
    .meta { text-align: right; font-size: 11px; color: #475569; }
    .meta b { color: #0f172a; }
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .kpi-card .title { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.05em; }
    .kpi-card .val { font-size: 16px; font-weight: 800; font-family: monospace; margin: 4px 0 2px; }
    .kpi-card .sub { font-size: 10px; color: #475569; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 9.5px;
      letter-spacing: 0.04em;
      padding: 8px 6px;
      border-bottom: 1px solid #cbd5e1;
      text-align: left;
    }
    th.num, td.num { text-align: right; }
    td {
      padding: 6px;
      border-bottom: 1px solid #e2e8f0;
      color: #1e293b;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 700;
    }
    .badge.entrada { background: #dcfce7; color: #166534; }
    .badge.salida { background: #fee2e2; color: #991b1b; }
    .badge.ajuste { background: #fef3c7; color: #92400e; }
    .footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      color: #94a3b8;
      font-size: 10px;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h1>FRENYER <span>ERP</span></h1>
      <p>Reporte Diario de Movimientos de Inventario y Kárdex Operativo</p>
    </div>
    <div class="meta">
      <div><b>Fecha de Emisión:</b> ${issueDate}</div>
      <div><b>Periodo:</b> ${periodLabel}</div>
      <div><b>Tasa Oficial BCV:</b> ${activeRate.toFixed(2)} VES/USD</div>
      <div><b>Total Registros:</b> ${filteredMovements.length} movimientos</div>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card">
      <div class="title">Total Entradas</div>
      <div class="val" style="color: #166534;">+${kpis.totalEntradasQty.toLocaleString()} uds</div>
      <div class="sub">$${kpis.totalEntradasUsd.toFixed(2)} · ≈ Bs. ${kpis.totalEntradasVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="kpi-card">
      <div class="title">Total Salidas / Ventas</div>
      <div class="val" style="color: #991b1b;">-${kpis.totalSalidasQty.toLocaleString()} uds</div>
      <div class="sub">$${kpis.totalSalidasUsd.toFixed(2)} · ≈ Bs. ${kpis.totalSalidasVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="kpi-card">
      <div class="title">Balance Neto Periodo</div>
      <div class="val" style="color: ${kpis.netQty >= 0 ? '#166534' : '#991b1b'};">
        ${kpis.netQty > 0 ? `+${kpis.netQty.toLocaleString()}` : kpis.netQty.toLocaleString()} uds
      </div>
      <div class="sub">$${kpis.netUsd.toFixed(2)} · ≈ Bs. ${kpis.netVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
    <div class="kpi-card">
      <div class="title">Volumen Movilizado</div>
      <div class="val">$${kpis.totalMovilizadoUsd.toFixed(2)}</div>
      <div class="sub">≈ Bs. ${kpis.totalMovilizadoVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 25px; text-align: center;">#</th>
        <th>Fecha / Hora</th>
        <th>Documento</th>
        <th>Tipo</th>
        <th>Producto / SKU</th>
        <th>Almacén</th>
        <th class="num">Cantidad</th>
        <th class="num">Costo Unit.</th>
        <th class="num">Total (USD / VES)</th>
        <th>Responsable</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="footer">
    <div>Frenyer ERP · Sistema Bimonetario de Gestión Empresarial</div>
    <div>Documento oficial generado para auditoría y control de existencias</div>
  </div>
</body>
</html>`;
  };

  // Disparador de impresión mediante iframe oculto (compatible con entornos iframe/sandbox)
  const printViaHiddenIframe = (htmlContent: string) => {
    try {
      const existing = document.getElementById('frenyer-print-frame');
      if (existing) existing.remove();

      const iframe = document.createElement('iframe');
      iframe.id = 'frenyer-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            window.print();
          }
        }, 300);
      } else {
        window.print();
      }
    } catch {
      window.print();
    }
  };

  const handlePrintPdf = () => {
    setIsExportMenuOpen(false);
    if (filteredMovements.length === 0) {
      showToast('No hay movimientos en el reporte para generar o imprimir.', 'info');
      return;
    }
    // Abre el modal de vista previa del reporte
    setIsPrintModalOpen(true);
    showToast('Generando reporte diario para impresión / PDF...', 'info');
    const html = buildReportHTML();
    // Intenta disparar la ventana nativa de impresión
    printViaHiddenIframe(html);
  };

  const handleDownloadReportHTML = () => {
    try {
      const html = buildReportHTML();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Reporte_Diario_${periodFilter}_${new Date().toISOString().slice(0, 10)}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Archivo de reporte descargado exitosamente. Ábralo en su navegador para imprimir o guardar como PDF.');
    } catch (err: any) {
      console.error('Error descargando reporte HTML:', err);
      showToast('No se pudo descargar el archivo del reporte.', 'error');
    }
  };

  return (
    <div className="content">
      {/* Toast Notificación */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 20,
          zIndex: 100,
          padding: '12px 18px',
          borderRadius: 'var(--radius-md)',
          background: toast.type === 'error' ? '#fff0f0' : toast.type === 'info' ? '#eef2ff' : '#e9f7f1',
          border: `1px solid ${toast.type === 'error' ? '#fca5a5' : toast.type === 'info' ? '#c7d2fe' : '#a7f3d0'}`,
          color: toast.type === 'error' ? '#991b1b' : toast.type === 'info' ? '#3730a3' : '#065f46',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 13,
          fontWeight: 600
        }}>
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Cabecera Estándar Frenyer */}
      <div className="page-head">
        <div>
          <h1>Reporte Diario de Inventario</h1>
          <p>
            Movimientos consolidados, rotación y valorización bimonetaria a tasa oficial BCV vigente ({activeRate.toFixed(2)} VES/USD).
          </p>
        </div>
        <div className="actions">
          <Button
            variant="primary"
            onClick={() => setIsNewMovementModalOpen(true)}
            title="Registrar nuevo movimiento de ajuste o entrada"
          >
            <Plus size={16} />
            <span>Registrar Movimiento</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => loadData()}
            disabled={isLoading}
            title="Sincronizar movimientos"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Sincronizar</span>
          </Button>

          {/* Botón y Menú Desplegable 'Exportar' idéntico a la imagen 1 */}
          <div ref={exportMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
            <Button
              variant="secondary"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
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
              <ChevronDown
                size={14}
                style={{
                  transform: isExportMenuOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease'
                }}
              />
            </Button>

            {isExportMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 9999,
                  minWidth: 205,
                  background: 'var(--surface, #ffffff)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md, 12px)',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3
                }}
              >
                <button
                  type="button"
                  onClick={handleExportExcel}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-50, #f5f3ff)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <FileSpreadsheet size={16} style={{ color: '#16a34a' }} />
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
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-50, #f5f3ff)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <FileText size={16} style={{ color: 'var(--brand-600, #7c3aed)' }} />
                  <span>Exportar CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintPdf}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text)',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-50, #f5f3ff)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Printer size={16} style={{ color: '#475569' }} />
                  <span>Imprimir / PDF</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {loadError && (
        <Card style={{ borderColor: 'var(--danger)', background: '#fff8f8', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--danger)' }}>
            <AlertCircle size={20} />
            <b>{loadError}</b>
          </div>
        </Card>
      )}

      {/* Rejilla de KPIs 100% Homogénea con el Dashboard */}
      <div className="grid grid-4">
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-label">Total Entradas</div>
            <div style={{ color: 'var(--success)' }}><ArrowDownRight size={18} /></div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>
            +{kpis.totalEntradasQty.toLocaleString()} <span className="small muted" style={{ fontWeight: 400 }}>uds</span>
          </div>
          <div className="muted small">
            <b>{formatUSD(kpis.totalEntradasUsd)}</b> · <span style={{ fontFamily: 'monospace' }}>≈ Bs. {kpis.totalEntradasVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-label">Total Salidas / Ventas</div>
            <div style={{ color: 'var(--danger)' }}><ArrowUpRight size={18} /></div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>
            -{kpis.totalSalidasQty.toLocaleString()} <span className="small muted" style={{ fontWeight: 400 }}>uds</span>
          </div>
          <div className="muted small">
            <b>{formatUSD(kpis.totalSalidasUsd)}</b> · <span style={{ fontFamily: 'monospace' }}>≈ Bs. {kpis.totalSalidasVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-label">Balance Neto Periodo</div>
            <div style={{ color: 'var(--brand-500)' }}><Package size={18} /></div>
          </div>
          <div className="kpi-value" style={{ color: kpis.netQty >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {kpis.netQty > 0 ? `+${kpis.netQty.toLocaleString()}` : kpis.netQty.toLocaleString()} <span className="small muted" style={{ fontWeight: 400 }}>uds</span>
          </div>
          <div className="muted small">
            <b>{formatUSD(kpis.netUsd)}</b> · <span style={{ fontFamily: 'monospace' }}>≈ Bs. {kpis.netVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="kpi-label">Transacciones Registradas</div>
            <div style={{ color: 'var(--text)' }}><Layers size={18} /></div>
          </div>
          <div className="kpi-value">
            {kpis.count.toLocaleString()} <span className="small muted" style={{ fontWeight: 400 }}>movs</span>
          </div>
          <div className="muted small">
            <b>{formatUSD(kpis.totalMovilizadoUsd)}</b> · <span style={{ fontFamily: 'monospace' }}>≈ Bs. {kpis.totalMovilizadoVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </Card>
      </div>

      {/* Barra de Filtros y Herramientas */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Búsqueda */}
          <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 240 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} />
            <input
              type="text"
              className="input"
              placeholder="Buscar por producto, SKU, documento o responsable..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{ paddingLeft: 38 }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{ position: 'absolute', right: 10, top: 10, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Selector de Periodo */}
          <div style={{ display: 'flex', gap: 4, background: '#f0f1f6', padding: 4, borderRadius: 'var(--radius-sm)' }}>
            {(['HOY', 'SEMANA', 'MES', 'HISTORICO'] as PeriodFilter[]).map((p) => {
              const labels: Record<PeriodFilter, string> = {
                HOY: 'Hoy',
                SEMANA: 'Esta Semana',
                MES: 'Este Mes',
                HISTORICO: 'Histórico'
              };
              const active = !showCustomDateRange && periodFilter === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setShowCustomDateRange(false);
                    setPeriodFilter(p);
                    setCurrentPage(1);
                  }}
                  style={{
                    border: 'none',
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                    borderRadius: 6,
                    background: active ? '#ffffff' : 'transparent',
                    color: active ? 'var(--text)' : 'var(--muted)',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  {labels[p]}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowCustomDateRange(!showCustomDateRange)}
              style={{
                border: 'none',
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: showCustomDateRange ? 700 : 500,
                borderRadius: 6,
                background: showCustomDateRange ? '#ffffff' : 'transparent',
                color: showCustomDateRange ? 'var(--brand-700)' : 'var(--muted)',
                boxShadow: showCustomDateRange ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer'
              }}
            >
              Rango
            </button>
          </div>

          {/* Filtros Dropdown */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="input"
              value={movementTypeFilter}
              onChange={(e) => {
                setMovementTypeFilter(e.target.value as MovementTypeFilter);
                setCurrentPage(1);
              }}
              style={{ height: 40, width: 'auto', minWidth: 140 }}
            >
              <option value="TODOS">Todos los tipos</option>
              <option value="ENTRADAS">Solo Entradas</option>
              <option value="SALIDAS">Solo Salidas</option>
              <option value="COMPRAS">Solo Compras</option>
              <option value="VENTAS">Solo Ventas</option>
              <option value="AJUSTES">Solo Ajustes</option>
            </select>

            <select
              className="input"
              value={selectedWarehouse}
              onChange={(e) => {
                setSelectedWarehouse(e.target.value);
                setCurrentPage(1);
              }}
              style={{ height: 40, width: 'auto', minWidth: 160 }}
            >
              <option value="ALL">Todos los Almacenes</option>
              {availableWarehouses.map((wh) => (
                <option key={wh} value={wh}>{wh}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Barra rango personalizado */}
        {showCustomDateRange && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span className="muted">Desde:</span>
              <input
                type="date"
                className="input"
                style={{ width: 'auto', height: 36 }}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span className="muted">Hasta:</span>
              <input
                type="date"
                className="input"
                style={{ width: 'auto', height: 36 }}
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            {(startDate || endDate) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                style={{ height: 36, fontSize: 12 }}
              >
                Limpiar fechas
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Tabla de Movimientos Estandarizada Frenyer */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Movimientos de Inventario</h3>
          <span className="muted small">Mostrando {filteredMovements.length} registro(s)</span>
        </div>

        {isLoading ? (
          <div className="empty">
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', color: 'var(--brand-500)' }} />
            <p>Cargando movimientos de inventario...</p>
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="empty">
            <FileText size={36} style={{ margin: '0 auto 10px', color: 'var(--muted)' }} />
            <p>No se encontraron movimientos registrados para los filtros seleccionados.</p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha / Hora</th>
                    <th>Documento</th>
                    <th>Tipo</th>
                    <th>Producto</th>
                    <th>Almacén</th>
                    <th className="num">Cantidad</th>
                    <th className="num">Costo Unit.</th>
                    <th className="num">Total (USD / VES)</th>
                    <th>Responsable</th>
                    <th style={{ textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMovements.map((m) => {
                    const qty = Number(m.quantity) || 0;
                    const unitCost = Number(m.unit_cost_usd) || Number(m.unit_price_usd) || 0;
                    const totalUsd = Math.abs(qty * unitCost);
                    const totalVes = totalUsd * activeRate;
                    const isCopied = copiedId === m.id;

                    return (
                      <tr key={m.id}>
                        <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {new Date(m.created_at || Date.now()).toLocaleString('es-VE', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{m.doc_number || '—'}</span>
                            {m.doc_number && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(m.doc_number, m.id)}
                                title="Copiar referencia"
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, color: isCopied ? 'var(--success)' : 'var(--muted)' }}
                              >
                                {isCopied ? <Check size={13} /> : <Copy size={13} />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td>{renderMovementTypeBadge(m.movement_type || '', qty)}</td>
                        <td>
                          <div>
                            <div style={{ fontWeight: 600 }}>{m.product_name || 'Producto sin nombre'}</div>
                            <div className="muted small" style={{ fontFamily: 'monospace' }}>SKU: {m.sku}</div>
                          </div>
                        </td>
                        <td className="muted small">
                          {(m as any).warehouseName || 'Almacén Principal'}
                        </td>
                        <td className="num" style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                          <span style={{ color: qty > 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {qty > 0 ? `+${qty}` : qty}
                          </span>
                        </td>
                        <td className="num" style={{ fontFamily: 'monospace' }}>
                          {formatUSD(unitCost)}
                        </td>
                        <td className="num">
                          <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{formatUSD(totalUsd)}</div>
                          <div className="muted small" style={{ fontFamily: 'monospace' }}>
                            ≈ Bs. {totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="muted small">
                          {(m as any).responsable || 'Sistema'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Button
                            variant="ghost"
                            onClick={() => setSelectedMovement(m)}
                            title="Ver detalles completos del movimiento"
                            style={{ height: 32, padding: '0 8px' }}
                          >
                            <Eye size={15} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <span className="muted small">
                  Página <b>{currentPage}</b> de <b>{totalPages}</b>
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    variant="secondary"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                  >
                    <ChevronLeft size={14} /> Anterior
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    style={{ height: 32, padding: '0 10px', fontSize: 12 }}
                  >
                    Siguiente <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Modal: Detalle de Movimiento */}
      {selectedMovement && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: 16
        }}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', maxWidth: 540, width: '100%', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={18} style={{ color: 'var(--brand-500)' }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Detalle de Movimiento</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMovement(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                <div>
                  <div className="muted small">Documento / Ref:</div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 14 }}>{selectedMovement.doc_number || '—'}</div>
                </div>
                <div>
                  <div className="muted small">Tipo:</div>
                  <div style={{ marginTop: 2 }}>{renderMovementTypeBadge(selectedMovement.movement_type || '', Number(selectedMovement.quantity) || 0)}</div>
                </div>
                <div>
                  <div className="muted small">Producto:</div>
                  <div style={{ fontWeight: 600 }}>{selectedMovement.product_name}</div>
                  <div className="muted small" style={{ fontFamily: 'monospace' }}>SKU: {selectedMovement.sku}</div>
                </div>
                <div>
                  <div className="muted small">Cantidad:</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: Number(selectedMovement.quantity) > 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {Number(selectedMovement.quantity) > 0 ? `+${selectedMovement.quantity}` : selectedMovement.quantity} uds
                  </div>
                </div>
                <div>
                  <div className="muted small">Valor USD:</div>
                  <div style={{ fontWeight: 700 }}>
                    {formatUSD(Math.abs(Number(selectedMovement.quantity) * (Number(selectedMovement.unit_cost_usd) || 10)))}
                  </div>
                </div>
                <div>
                  <div className="muted small">Valor VES (Tasa BCV {activeRate}):</div>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                    ≈ Bs. {(Math.abs(Number(selectedMovement.quantity) * (Number(selectedMovement.unit_cost_usd) || 10)) * activeRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="muted small">Almacén:</div>
                  <div>{(selectedMovement as any).warehouseName || 'Almacén Principal'}</div>
                </div>
                <div>
                  <div className="muted small">Responsable:</div>
                  <div>{(selectedMovement as any).responsable || 'Sistema'}</div>
                </div>
              </div>

              {selectedMovement.notes && (
                <div style={{ marginTop: 14, padding: 12, background: 'var(--canvas)', borderRadius: 'var(--radius-sm)' }}>
                  <div className="muted small">Observaciones / Notas:</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{selectedMovement.notes}</div>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#fafbfc' }}>
              <Button variant="secondary" onClick={() => setSelectedMovement(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Nuevo Ajuste o Movimiento */}
      {isNewMovementModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: 16
        }}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', maxWidth: 540, width: '100%', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Plus size={18} style={{ color: 'var(--brand-500)' }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Registrar Movimiento de Inventario</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewMovementModalOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveMovement} style={{ padding: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field">
                  <label>Producto del Catálogo</label>
                  <select
                    className="input"
                    value={formSku}
                    onChange={(e) => {
                      const sku = e.target.value;
                      setFormSku(sku);
                      const prod = products.find((p) => p.sku === sku);
                      if (prod) {
                        setFormUnitCostUSD(Number(prod.cost_usd) || Number(prod.price_usd) || 10);
                      }
                    }}
                    required
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.sku}>
                        {p.name} ({p.sku}) — Stock actual: {p.stock}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Tipo de Operación</label>
                    <select
                      className="input"
                      value={formType}
                      onChange={(e) => setFormType(e.target.value as any)}
                    >
                      <option value="ENTRADA">Entrada / Reposición</option>
                      <option value="SALIDA">Salida / Merma / Baja</option>
                      <option value="CORRECCION">Ajuste por Auditoría</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>Cantidad (Uds)</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="input"
                      value={formQty}
                      onChange={(e) => setFormQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      required
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Costo Unitario (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={formUnitCostUSD}
                      onChange={(e) => setFormUnitCostUSD(parseFloat(e.target.value) || 0)}
                      required
                    />
                  </div>

                  <div className="field">
                    <label>N° Documento / Ref.</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej. AJU-00124 (opcional)"
                      value={formDocNumber}
                      onChange={(e) => setFormDocNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Almacén Destino / Origen</label>
                  <input
                    type="text"
                    className="input"
                    value={formWarehouse}
                    onChange={(e) => setFormWarehouse(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Observación / Justificación</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ej. Descuadre de inventario físico"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                  />
                </div>

                <div style={{ padding: 12, background: 'var(--canvas)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="muted small">Valorización estimada:</span>
                  <div style={{ textAlign: 'right' }}>
                    <b>{formatUSD(formQty * formUnitCostUSD)}</b>
                    <span className="muted small" style={{ marginLeft: 6, fontFamily: 'monospace' }}>
                      ≈ Bs. {convertUSDtoVES(formQty * formUnitCostUSD, activeRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <Button type="button" variant="secondary" onClick={() => setIsNewMovementModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmittingForm}>
                  {isSubmittingForm ? 'Guardando...' : 'Confirmar Registro'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Vista Previa e Impresión / PDF del Reporte Diario */}
      {isPrintModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 'var(--radius-lg, 16px)',
            maxWidth: 1050,
            width: '100%',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--border)',
            overflow: 'hidden'
          }}>
            {/* Cabecera del Modal con Botones de Acción */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 24px',
              borderBottom: '1px solid var(--border)',
              background: '#fafbfc'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Printer size={18} style={{ color: 'var(--brand-500)' }} />
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    Vista Previa de Impresión / Reporte Diario
                  </h3>
                </div>
                <div className="muted small" style={{ marginTop: 2 }}>
                  Periodo: <b>{periodFilter === 'HOY' ? 'Hoy' : periodFilter === 'SEMANA' ? 'Esta Semana' : periodFilter === 'MES' ? 'Este Mes' : 'Histórico'}</b> · {filteredMovements.length} movimientos filtrados · Tasa BCV: <b>{activeRate.toFixed(2)} VES/USD</b>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                  variant="primary"
                  onClick={() => printViaHiddenIframe(buildReportHTML())}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title="Abrir cuadro de diálogo de impresión / Guardar como PDF"
                >
                  <Printer size={15} />
                  <span>Imprimir / Guardar PDF</span>
                </Button>

                <Button
                  variant="secondary"
                  onClick={handleDownloadReportHTML}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  title="Descargar documento HTML listo para abrir e imprimir en cualquier navegador"
                >
                  <FileDown size={15} />
                  <span>Descargar HTML</span>
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => setIsPrintModalOpen(false)}
                  style={{ padding: '6px 10px', height: 36 }}
                  title="Cerrar vista previa"
                >
                  <X size={18} />
                </Button>
              </div>
            </div>

            {/* Documento Renderizado en Pantalla (Hoja tamaño carta) */}
            <div style={{
              padding: '24px',
              overflowY: 'auto',
              background: 'var(--canvas, #f5f6fa)'
            }}>
              <div style={{
                background: '#ffffff',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md, 12px)',
                padding: '28px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                maxWidth: 950,
                margin: '0 auto'
              }}>
                {/* Membrete Documento */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  borderBottom: '2px solid var(--brand-500, #8b78e8)',
                  paddingBottom: 16,
                  marginBottom: 20
                }}>
                  <div>
                    <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#1e1b4b' }}>
                      FRENYER <span style={{ color: 'var(--brand-500, #8b78e8)' }}>ERP</span>
                    </h2>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                      Reporte Diario de Movimientos de Inventario y Kárdex Operativo
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                    <div><b>Fecha de Emisión:</b> {new Date().toLocaleString('es-VE')}</div>
                    <div><b>Tasa BCV Aplicada:</b> {activeRate.toFixed(2)} VES/USD</div>
                    <div><b>Almacén:</b> {selectedWarehouse === 'ALL' ? 'Todos los Almacenes' : selectedWarehouse}</div>
                  </div>
                </div>

                {/* Resumen Ejecutivo de Métricas */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 12,
                  marginBottom: 20
                }}>
                  <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '12px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)' }}>Total Entradas</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--success)', fontFamily: 'monospace', margin: '4px 0 2px' }}>
                      +{kpis.totalEntradasQty.toLocaleString()} uds
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {formatUSD(kpis.totalEntradasUsd)} · ≈ Bs. {kpis.totalEntradasVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '12px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)' }}>Total Salidas</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--danger)', fontFamily: 'monospace', margin: '4px 0 2px' }}>
                      -{kpis.totalSalidasQty.toLocaleString()} uds
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {formatUSD(kpis.totalSalidasUsd)} · ≈ Bs. {kpis.totalSalidasVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '12px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)' }}>Balance Neto</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: kpis.netQty >= 0 ? 'var(--success)' : 'var(--danger)', fontFamily: 'monospace', margin: '4px 0 2px' }}>
                      {kpis.netQty > 0 ? `+${kpis.netQty.toLocaleString()}` : kpis.netQty.toLocaleString()} uds
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {formatUSD(kpis.netUsd)} · ≈ Bs. {kpis.netVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '12px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)' }}>Volumen Movilizado</div>
                    <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', margin: '4px 0 2px' }}>
                      {formatUSD(kpis.totalMovilizadoUsd)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      ≈ Bs. {kpis.totalMovilizadoVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* Tabla de Movimientos del Documento */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ padding: '8px 6px', textAlign: 'center', width: 30, fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>#</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Fecha</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Doc / Ref</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Tipo</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Producto</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Almacén</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Cant.</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Costo USD</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Total (USD / VES)</th>
                        <th style={{ padding: '8px 6px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: '#475569' }}>Responsable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMovements.map((m, idx) => {
                        const qty = Number(m.quantity) || 0;
                        const unitCost = Number(m.unit_cost_usd) || Number(m.unit_price_usd) || 0;
                        const totalUsd = Math.abs(qty * unitCost);
                        const totalVes = totalUsd * activeRate;
                        const dateStr = new Date(m.created_at || Date.now()).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });

                        return (
                          <tr key={m.id || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '6px', textAlign: 'center', color: 'var(--muted)' }}>{idx + 1}</td>
                            <td style={{ padding: '6px', whiteSpace: 'nowrap', color: '#475569' }}>{dateStr}</td>
                            <td style={{ padding: '6px', fontFamily: 'monospace', fontWeight: 600 }}>{m.doc_number || '—'}</td>
                            <td style={{ padding: '6px' }}>{renderMovementTypeBadge(m.movement_type || '', qty)}</td>
                            <td style={{ padding: '6px' }}>
                              <div style={{ fontWeight: 600 }}>{m.product_name}</div>
                              <div className="muted small" style={{ fontFamily: 'monospace' }}>SKU: {m.sku}</div>
                            </td>
                            <td style={{ padding: '6px', color: '#475569' }}>{(m as any).warehouseName || 'Almacén Principal'}</td>
                            <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                              <span style={{ color: qty > 0 ? 'var(--success)' : 'var(--danger)' }}>
                                {qty > 0 ? `+${qty}` : qty}
                              </span>
                            </td>
                            <td style={{ padding: '6px', textAlign: 'right', fontFamily: 'monospace' }}>
                              {formatUSD(unitCost)}
                            </td>
                            <td style={{ padding: '6px', textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{formatUSD(totalUsd)}</div>
                              <div className="muted small" style={{ fontFamily: 'monospace' }}>
                                ≈ Bs. {totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </td>
                            <td style={{ padding: '6px', color: '#475569' }}>{(m as any).responsable || 'Sistema'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pie del documento impreso */}
                <div style={{
                  marginTop: 24,
                  paddingTop: 14,
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 11,
                  color: 'var(--muted)'
                }}>
                  <div>Frenyer ERP · Módulo de Control de Inventario y Auditoría</div>
                  <div>Documento oficial generado para registro de operaciones</div>
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div style={{
              padding: '12px 24px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#fafbfc'
            }}>
              <span className="muted small">
                Consejo: Si su navegador bloquea ventanas emergentes, use el botón <b>«Descargar HTML»</b> para abrir e imprimir el reporte directamente.
              </span>
              <Button variant="secondary" onClick={() => setIsPrintModalOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
