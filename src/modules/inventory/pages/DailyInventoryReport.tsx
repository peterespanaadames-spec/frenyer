import React, { useState, useEffect, useMemo } from 'react';
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
  ChevronRight
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import {
  getActiveExchangeRate,
  formatUSD,
  formatVES
} from '../../../lib/currency';
import {
  fetchInventoryMovementsFromSupabase,
  fetchProductsFromSupabase,
  DbInventoryMovement,
  DbProduct
} from '../../../lib/supabase/db';

type PeriodFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';
type MovementTypeFilter = 'TODOS' | 'ENTRADAS' | 'SALIDAS' | 'AJUSTES' | 'COMPRAS' | 'VENTAS';

export function DailyInventoryReportPage() {
  const [movements, setMovements] = useState<DbInventoryMovement[]>([]);
  const [_products, setProducts] = useState<DbProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('ALL');
  const [movementTypeFilter, setMovementTypeFilter] = useState<MovementTypeFilter>('TODOS');
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);

  // Active BCV rate
  const [activeRate, setActiveRate] = useState<number>(() => getActiveExchangeRate());

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
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
      console.error('Error cargando reporte diario de inventario:', err);
      if (!silent) {
        setError(err?.message || 'No se pudieron consultar los movimientos de inventario.');
      }
    } finally {
      if (!silent) setIsLoading(false);
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
    return () => {
      window.removeEventListener('frenyer:rate-changed', handleRateChange);
    };
  }, []);

  // Filter and compute movements
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const mType = (m.movement_type || '').toUpperCase();
      const mDate = new Date(m.created_at || Date.now());
      const now = new Date();

      // Period filter
      if (periodFilter === 'TODAY') {
        if (mDate.toDateString() !== now.toDateString()) return false;
      } else if (periodFilter === 'WEEK') {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        if (mDate < weekAgo) return false;
      } else if (periodFilter === 'MONTH') {
        if (mDate.getMonth() !== now.getMonth() || mDate.getFullYear() !== now.getFullYear()) return false;
      }

      // Movement Type filter
      if (movementTypeFilter === 'ENTRADAS' && mType !== 'ENTRADA' && mType !== 'COMPRA') return false;
      if (movementTypeFilter === 'SALIDAS' && mType !== 'SALIDA' && mType !== 'VENTA') return false;
      if (movementTypeFilter === 'AJUSTES' && mType !== 'AJUSTE' && mType !== 'CORRECCION') return false;
      if (movementTypeFilter === 'COMPRAS' && mType !== 'COMPRA') return false;
      if (movementTypeFilter === 'VENTAS' && mType !== 'VENTA') return false;

      // Warehouse filter
      if (selectedWarehouse !== 'ALL') {
        const whName = ((m as any).warehouseName || 'Almacén Principal').toLowerCase();
        if (!whName.includes(selectedWarehouse.toLowerCase())) return false;
      }

      // Search term filter
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
  }, [movements, periodFilter, movementTypeFilter, selectedWarehouse, searchTerm]);

  // Pagination slice
  const totalPages = Math.ceil(filteredMovements.length / pageSize) || 1;
  const paginatedMovements = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMovements.slice(start, start + pageSize);
  }, [filteredMovements, currentPage, pageSize]);

  // KPIs
  const kpis = useMemo(() => {
    let totalEntradasQty = 0;
    let totalEntradasUsd = 0;
    let totalSalidasQty = 0;
    let totalSalidasUsd = 0;

    filteredMovements.forEach((m) => {
      const qty = Number(m.quantity) || 0;
      const mType = (m.movement_type || '').toUpperCase();
      const unitCost = Number(m.unit_cost_usd) || Number(m.unit_price_usd) || 10;
      const totalUsd = qty * unitCost;

      if (mType === 'ENTRADA' || mType === 'COMPRA' || (mType === 'AJUSTE' && qty > 0)) {
        if (qty > 0) {
          totalEntradasQty += qty;
          totalEntradasUsd += Math.abs(totalUsd);
        } else {
          totalSalidasQty += Math.abs(qty);
          totalSalidasUsd += Math.abs(totalUsd);
        }
      } else if (mType === 'SALIDA' || mType === 'VENTA' || (mType === 'AJUSTE' && qty < 0)) {
        totalSalidasQty += Math.abs(qty);
        totalSalidasUsd += Math.abs(totalUsd);
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
      count: filteredMovements.length
    };
  }, [filteredMovements, activeRate]);

  // Render badge matching Frenyer standard
  const renderMovementTypeBadge = (movType: string, qty: number) => {
    const t = (movType || '').toUpperCase();
    if (t.includes('AJUSTE') || t.includes('CORRECCION')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-700 text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Ajuste
        </span>
      );
    }
    if (t.includes('COMPRA') || t === 'ENTRADA' || qty > 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-700 text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Entrada
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-700 text-xs font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Salida
      </span>
    );
  };

  // Excel Export
  const handleExportExcel = () => {
    try {
      if (filteredMovements.length === 0) {
        showToast('No hay datos para exportar en el reporte.', 'info');
        return;
      }
      const dataToExport = filteredMovements.map((m, index) => {
        const qty = Number(m.quantity) || 0;
        const unitCost = Number(m.unit_cost_usd) || Number(m.unit_price_usd) || 0;
        const totalUsd = Math.abs(qty * unitCost);
        const totalVes = totalUsd * activeRate;
        return {
          'N°': index + 1,
          'Fecha / Hora': new Date(m.created_at || Date.now()).toLocaleString(),
          'Documento / Ref': m.doc_number || '—',
          'Tipo de Movimiento': m.movement_type || 'Movimiento',
          'SKU': m.sku || '—',
          'Producto': m.product_name || '—',
          'Cantidad': qty,
          'Costo Unit. USD': Number(unitCost.toFixed(2)),
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
      const filename = `Reporte_Diario_Inventario_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, filename);
      showToast('Reporte diario exportado a Excel exitosamente.');
    } catch (err: any) {
      console.error('Error exportando Excel:', err);
      showToast('No se pudo generar el archivo Excel.', 'error');
    }
  };

  // PDF / Print Export
  const handlePrintPdf = () => {
    if (filteredMovements.length === 0) {
      showToast('No hay movimientos en el reporte para imprimir.', 'info');
      return;
    }
    window.print();
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1600px] mx-auto text-slate-900">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3 transition-all animate-bounce ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
          toast.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
            <span>Inventarios</span>
            <span>/</span>
            <span className="text-violet-600 font-semibold">Reporte diario</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FileText className="text-violet-600" size={28} />
            Reporte Diario de Inventario
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Control consolidado de entradas, salidas y valorización bimonetaria (Tasa BCV: {activeRate.toFixed(2)} VES/USD).
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="secondary"
            onClick={() => loadData()}
            disabled={isLoading}
            className="flex items-center gap-2 border-slate-200 hover:bg-slate-50 text-xs py-2 px-3"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            Actualizar
          </Button>
          <Button
            variant="secondary"
            onClick={handleExportExcel}
            className="flex items-center gap-2 border-slate-200 hover:bg-slate-50 text-emerald-700 bg-emerald-50/50 text-xs py-2 px-3"
          >
            <FileSpreadsheet size={16} />
            Exportar Excel
          </Button>
          <Button
            variant="primary"
            onClick={handlePrintPdf}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-sm text-xs py-2 px-3"
          >
            <Printer size={16} />
            Exportar PDF / Imprimir
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border border-slate-200/80 shadow-sm bg-white rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Entradas</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownRight size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              +{kpis.totalEntradasQty.toLocaleString()} <span className="text-xs font-normal text-slate-500">unids</span>
            </div>
            <div className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-2">
              <span>{formatUSD(kpis.totalEntradasUsd)}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">{formatVES(kpis.totalEntradasVes)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-slate-200/80 shadow-sm bg-white rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Salidas / Ventas</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              -{kpis.totalSalidasQty.toLocaleString()} <span className="text-xs font-normal text-slate-500">unids</span>
            </div>
            <div className="text-xs text-rose-600 font-medium mt-1 flex items-center gap-2">
              <span>{formatUSD(kpis.totalSalidasUsd)}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">{formatVES(kpis.totalSalidasVes)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-slate-200/80 shadow-sm bg-white rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Balance Neto Periodo</span>
            <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <Package size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-bold font-mono tabular-nums ${kpis.netQty >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {kpis.netQty > 0 ? `+${kpis.netQty.toLocaleString()}` : kpis.netQty.toLocaleString()} <span className="text-xs font-normal text-slate-500">unids</span>
            </div>
            <div className="text-xs text-slate-600 font-medium mt-1 flex items-center gap-2">
              <span>{formatUSD(kpis.netUsd)}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">{formatVES(kpis.netVes)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-5 border border-slate-200/80 shadow-sm bg-white rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Transacciones</span>
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Layers size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {kpis.count.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              Movimientos registrados en filtro
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4 border border-slate-200/80 shadow-sm bg-white rounded-2xl">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap flex-1">
            {/* Search Input */}
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Buscar por producto, SKU, documento o responsable..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>

            {/* Period Filter */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => { setPeriodFilter('ALL'); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${periodFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Todos
              </button>
              <button
                onClick={() => { setPeriodFilter('TODAY'); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${periodFilter === 'TODAY' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Hoy
              </button>
              <button
                onClick={() => { setPeriodFilter('WEEK'); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${periodFilter === 'WEEK' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Últimos 7 días
              </button>
              <button
                onClick={() => { setPeriodFilter('MONTH'); setCurrentPage(1); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${periodFilter === 'MONTH' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Este mes
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Movement Type Filter */}
            <select
              value={movementTypeFilter}
              onChange={(e) => { setMovementTypeFilter(e.target.value as MovementTypeFilter); setCurrentPage(1); }}
              className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            >
              <option value="TODOS">Todos los tipos</option>
              <option value="ENTRADAS">Entradas / Compras</option>
              <option value="SALIDAS">Salidas / Ventas</option>
              <option value="AJUSTES">Ajustes / Correcciones</option>
              <option value="COMPRAS">Compras</option>
              <option value="VENTAS">Ventas</option>
            </select>

            {/* Warehouse Filter */}
            <select
              value={selectedWarehouse}
              onChange={(e) => { setSelectedWarehouse(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
            >
              <option value="ALL">Todos los Almacenes</option>
              <option value="Principal">Almacén Principal</option>
              <option value="Secundario">Almacén Secundario</option>
              <option value="Caracas">Depósito Caracas</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Main Table Card */}
      <Card className="border border-slate-200/80 shadow-sm bg-white rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Fecha / Hora</th>
                <th className="py-3 px-4">Referencia</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Producto (SKU)</th>
                <th className="py-3 px-4 text-right">Cant.</th>
                <th className="py-3 px-4 text-right">Costo Unit.</th>
                <th className="py-3 px-4 text-right">Total USD</th>
                <th className="py-3 px-4 text-right">Total VES</th>
                <th className="py-3 px-4">Almacén</th>
                <th className="py-3 px-4">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="animate-spin inline-block mr-2" size={20} />
                    Cargando movimientos de inventario...
                  </td>
                </tr>
              ) : paginatedMovements.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                        <FileText size={24} />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900">No se encontraron movimientos</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        No hay registros que coincidan con los filtros de fecha o búsqueda seleccionados.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedMovements.map((m) => {
                  const qty = Number(m.quantity) || 0;
                  const unitCost = Number(m.unit_cost_usd) || Number(m.unit_price_usd) || 0;
                  const totalUsd = Math.abs(qty * unitCost);
                  const totalVes = totalUsd * activeRate;
                  const mType = (m.movement_type || 'MOVIMIENTO').toUpperCase();

                  return (
                    <tr key={m.id || Math.random()} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 text-xs font-mono text-slate-600 whitespace-nowrap">
                        {new Date(m.created_at || Date.now()).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-1 rounded bg-slate-100 text-xs font-mono font-medium text-slate-700 border border-slate-200">
                          {m.doc_number || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderMovementTypeBadge(mType, qty)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{m.product_name || 'Producto sin nombre'}</div>
                        <div className="text-xs font-mono text-slate-500">({m.sku || 'S/N'})</div>
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${qty >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {qty > 0 ? `+${qty}` : qty}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {formatUSD(unitCost)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {formatUSD(totalUsd)}
                        <div className="text-[11px] font-normal text-slate-500">{formatVES(totalVes)}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                        {formatVES(totalVes)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {(m as any).warehouseName || 'Almacén Principal'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {(m as any).responsable || 'Sistema'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/50">
          <div className="text-xs text-slate-500">
            Mostrando <span className="font-semibold text-slate-800">{paginatedMovements.length}</span> de <span className="font-semibold text-slate-800">{filteredMovements.length}</span> movimientos (Página {currentPage} de {totalPages})
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="border-slate-200 text-xs py-1.5 px-3"
            >
              <ChevronLeft size={16} />
              Anterior
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="border-slate-200 text-xs py-1.5 px-3"
            >
              Siguiente
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
