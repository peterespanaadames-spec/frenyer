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
  ChevronDown,
  FileSpreadsheet,
  Eye,
  Printer,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  SlidersHorizontal,
  HelpCircle,
  Sparkles,
  Tag
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import {
  getActiveExchangeRate,
  formatUSD,
  formatVES
} from '../../../lib/currency';
import { createWorksheetWithBusinessHeader, getReportHeaderHtml, getReportFooterHtml } from '../../../lib/reportUtils';
import { getBusinessProfile } from '../../../lib/businessProfile';
import {
  fetchInventoryMovementsFromSupabase,
  recordInventoryAdjustmentInSupabase,
  fetchProductsFromSupabase,
  DbInventoryMovement,
  DbProduct
} from '../../../lib/supabase/db';
import { supabase } from '../../../lib/supabase/client';

type SortField = 'created_at' | 'doc_number' | 'product_name' | 'quantity' | 'total_usd' | 'balance_stock';
type SortOrder = 'asc' | 'desc';

type MovementFilterType = 'TODOS' | 'ENTRADAS' | 'SALIDAS' | 'COMPRAS' | 'VENTAS' | 'AJUSTES';
type PeriodFilter = 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'LAST_MONTH';

export function MovementsPage() {
  const [movements, setMovements] = useState<DbInventoryMovement[]>([]);
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros de control
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [movementTypeFilter, setMovementTypeFilter] = useState<MovementFilterType>('TODOS');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('ALL');
  const [selectedProductSku, setSelectedProductSku] = useState<string>('ALL');

  // Ordenamiento
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Tasa de cambio BCV
  const [activeRate, setActiveRate] = useState<number>(() => getActiveExchangeRate());

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modales
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedMovementDetail, setSelectedMovementDetail] = useState<any | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Búsqueda Predictiva de Productos
  const [isPredictiveOpen, setIsPredictiveOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

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

  // Carga inicial y datos en tiempo real
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
      console.error('Error cargando movimientos de inventario:', err);
      if (!silent) {
        setError(err?.message || 'No se pudieron consultar los movimientos de inventario.');
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listener para tasa de cambio
    const handleRateChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ rate: number }>;
      if (customEvent.detail?.rate) {
        setActiveRate(customEvent.detail.rate);
      }
    };
    window.addEventListener('frenyer:rate-changed', handleRateChange);

    // Suscripción en tiempo real a Supabase si está disponible
    let channel: any = null;
    try {
      channel = supabase
        .channel('frenyer_movements_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
          loadData(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, () => {
          loadData(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
          loadData(true);
        })
        .subscribe();
    } catch {
      // Ignorar si realtime no está habilitado
    }

    return () => {
      window.removeEventListener('frenyer:rate-changed', handleRateChange);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Cerrar menús al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(target)) {
        setIsExportMenuOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setIsPredictiveOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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

  // Helper de filtrado por fecha
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

  // Reconstrucción matemática del saldo histórico de stock por producto
  const movementsWithCalculatedBalance = useMemo(() => {
    // Mapa de stock actual de cada producto según catálogo
    const currentStockMap: Record<string, number> = {};
    for (const p of products) {
      currentStockMap[p.sku] = Number(p.stock) || 0;
    }

    // Agrupar movimientos por SKU ordenados cronológicamente descendente
    const movementsBySku: Record<string, DbInventoryMovement[]> = {};
    for (const m of movements) {
      if (!movementsBySku[m.sku]) {
        movementsBySku[m.sku] = [];
      }
      movementsBySku[m.sku].push(m);
    }

    // Calcular el stock resultante paso a paso hacia atrás
    const balanceMap = new Map<string, number>();

    for (const sku in movementsBySku) {
      const list = movementsBySku[sku];
      // Ordenar por fecha descendente (más reciente primero)
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      let runningStock = currentStockMap[sku] !== undefined ? currentStockMap[sku] : 0;

      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (item.new_stock != null && item.new_stock > 0) {
          balanceMap.set(item.id, Number(item.new_stock));
          runningStock = item.previous_stock != null ? Number(item.previous_stock) : (Number(item.new_stock) - Number(item.quantity));
        } else {
          balanceMap.set(item.id, Math.max(0, runningStock));
          // El stock anterior a esta transacción
          runningStock = Math.max(0, runningStock - Number(item.quantity));
        }
      }
    }

    return movements.map(m => {
      const calculatedBalance = balanceMap.has(m.id)
        ? balanceMap.get(m.id)!
        : Number(m.new_stock ?? currentStockMap[m.sku] ?? 0);

      // Determinar almacén
      const warehouseName = m.branch_id ? 'Sucursal 1' : 'Almacén Principal';

      // Determinar usuario / responsable
      let responsable = 'Sistema (POS)';
      if (m.doc_type === 'AJUSTE') {
        responsable = 'Administrador';
      } else if (m.movement_type === 'VENTA') {
        responsable = m.entity_name ? `Cajero (${m.entity_name})` : 'Cajero POS';
      } else if (m.movement_type === 'COMPRA') {
        responsable = m.entity_name ? `Compras (${m.entity_name})` : 'Encargado Compras';
      }

      return {
        ...m,
        calculatedBalance,
        warehouseName,
        responsable
      };
    });
  }, [movements, products]);

  // Movimientos filtrados con lógica exhaustiva y precisa de tipos
  const filteredMovements = useMemo(() => {
    return movementsWithCalculatedBalance.filter(m => {
      // 1. Filtro de almacén
      if (selectedWarehouse !== 'ALL') {
        if (selectedWarehouse === 'PRINCIPAL' && m.branch_id) return false;
      }

      // 2. Filtro de producto
      if (selectedProductSku !== 'ALL' && m.sku !== selectedProductSku) {
        return false;
      }

      // 3. Filtro de período
      if (!isDateInPeriod(m.created_at, periodFilter)) {
        return false;
      }

      // 4. Filtro de tipo de movimiento
      if (movementTypeFilter !== 'TODOS') {
        const typeUpper = (m.movement_type || '').toUpperCase();
        const docTypeUpper = (m.doc_type || '').toUpperCase();
        const docNumberUpper = (m.doc_number || '').toUpperCase();
        const reasonUpper = (m.reason || '').toUpperCase();

        if (movementTypeFilter === 'ENTRADAS') {
          const isEntrada =
            m.quantity > 0 ||
            typeUpper.includes('ENTRADA') ||
            typeUpper.includes('COMPRA') ||
            docTypeUpper.includes('COMPRA');
          if (!isEntrada) return false;
        } else if (movementTypeFilter === 'SALIDAS') {
          const isSalida =
            m.quantity < 0 ||
            typeUpper.includes('SALIDA') ||
            typeUpper.includes('VENTA') ||
            docTypeUpper.includes('FACTURA') ||
            docTypeUpper.includes('NOTA') ||
            docTypeUpper.includes('COTIZACION') ||
            docTypeUpper.includes('VENTA');
          if (!isSalida) return false;
        } else if (movementTypeFilter === 'COMPRAS') {
          const isCompra =
            typeUpper.includes('COMPRA') ||
            docTypeUpper.includes('COMPRA') ||
            docNumberUpper.startsWith('COM') ||
            docNumberUpper.startsWith('CMP');
          if (!isCompra) return false;
        } else if (movementTypeFilter === 'VENTAS') {
          const isVenta =
            typeUpper.includes('VENTA') ||
            docTypeUpper.includes('FACTURA') ||
            docTypeUpper.includes('NOTA') ||
            docTypeUpper.includes('COTIZACION') ||
            docTypeUpper.includes('VENTA');
          if (!isVenta) return false;
        } else if (movementTypeFilter === 'AJUSTES') {
          const isAjuste =
            typeUpper.includes('AJUSTE') ||
            docTypeUpper.includes('AJUSTE') ||
            typeUpper.includes('ADJUST') ||
            docTypeUpper.includes('ADJUST') ||
            docNumberUpper.startsWith('AJU') ||
            reasonUpper.includes('AJUSTE');
          if (!isAjuste) return false;
        }
      }

      // 5. Búsqueda de texto general
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const doc = (m.doc_number || '').toLowerCase();
        const sku = (m.sku || '').toLowerCase();
        const pName = (m.product_name || '').toLowerCase();
        const entity = (m.entity_name || '').toLowerCase();
        const resp = (m.responsable || '').toLowerCase();
        const reason = (m.reason || '').toLowerCase();
        const movType = (m.movement_type || '').toLowerCase();
        const docType = (m.doc_type || '').toLowerCase();
        const notes = (m.notes || '').toLowerCase();
        const wh = (m.warehouseName || '').toLowerCase();

        const match =
          doc.includes(q) ||
          sku.includes(q) ||
          pName.includes(q) ||
          entity.includes(q) ||
          resp.includes(q) ||
          reason.includes(q) ||
          movType.includes(q) ||
          docType.includes(q) ||
          notes.includes(q) ||
          wh.includes(q);

        if (!match) return false;
      }

      return true;
    });
  }, [movementsWithCalculatedBalance, selectedWarehouse, selectedProductSku, periodFilter, movementTypeFilter, searchTerm]);

  // Contadores por tipo de movimiento para informar al usuario en los selectores
  const typeCounts = useMemo(() => {
    let entradas = 0;
    let salidas = 0;
    let ventas = 0;
    let compras = 0;
    let ajustes = 0;

    for (const m of movementsWithCalculatedBalance) {
      const typeUpper = (m.movement_type || '').toUpperCase();
      const docTypeUpper = (m.doc_type || '').toUpperCase();
      const docNumberUpper = (m.doc_number || '').toUpperCase();
      const reasonUpper = (m.reason || '').toUpperCase();

      if (m.quantity > 0 || typeUpper.includes('ENTRADA') || typeUpper.includes('COMPRA') || docTypeUpper.includes('COMPRA')) {
        entradas++;
      }
      if (m.quantity < 0 || typeUpper.includes('SALIDA') || typeUpper.includes('VENTA') || docTypeUpper.includes('FACTURA') || docTypeUpper.includes('NOTA')) {
        salidas++;
      }
      if (typeUpper.includes('VENTA') || docTypeUpper.includes('FACTURA') || docTypeUpper.includes('NOTA') || docTypeUpper.includes('COTIZACION') || docTypeUpper.includes('VENTA')) {
        ventas++;
      }
      if (typeUpper.includes('COMPRA') || docTypeUpper.includes('COMPRA') || docNumberUpper.startsWith('COM') || docNumberUpper.startsWith('CMP')) {
        compras++;
      }
      if (typeUpper.includes('AJUSTE') || docTypeUpper.includes('AJUSTE') || typeUpper.includes('ADJUST') || docNumberUpper.startsWith('AJU') || reasonUpper.includes('AJUSTE')) {
        ajustes++;
      }
    }

    return {
      total: movementsWithCalculatedBalance.length,
      entradas,
      salidas,
      ventas,
      compras,
      ajustes
    };
  }, [movementsWithCalculatedBalance]);

  // Métricas del período según la propuesta: Entradas, Salidas, Neto y Valoración
  const periodSummary = useMemo(() => {
    let entradasUnits = 0;
    let salidasUnits = 0;
    let totalEntradasUSD = 0;
    let totalSalidasUSD = 0;

    for (const m of filteredMovements) {
      const qty = Number(m.quantity) || 0;
      const typeUpper = (m.movement_type || '').toUpperCase();
      const docTypeUpper = (m.doc_type || '').toUpperCase();
      const valUsd = Number(m.total_usd) || 0;

      if (qty > 0 || typeUpper.includes('ENTRADA') || typeUpper.includes('COMPRA') || docTypeUpper.includes('COMPRA')) {
        entradasUnits += Math.abs(qty);
        totalEntradasUSD += valUsd;
      } else if (qty < 0 || typeUpper.includes('SALIDA') || typeUpper.includes('VENTA') || docTypeUpper.includes('FACTURA') || docTypeUpper.includes('NOTA')) {
        salidasUnits += Math.abs(qty);
        totalSalidasUSD += valUsd;
      }
    }

    const netoUnits = entradasUnits - salidasUnits;
    const netoUSD = totalEntradasUSD - totalSalidasUSD;
    const netoVES = netoUSD * activeRate;

    return {
      entradasUnits,
      salidasUnits,
      netoUnits,
      totalEntradasUSD,
      totalSalidasUSD,
      netoUSD,
      netoVES,
      totalRegistros: filteredMovements.length
    };
  }, [filteredMovements, activeRate]);

  // Ordenamiento de la tabla
  const sortedMovements = useMemo(() => {
    const list = [...filteredMovements];
    list.sort((a, b) => {
      let valA: any = a[sortField as keyof typeof a];
      let valB: any = b[sortField as keyof typeof b];

      if (sortField === 'created_at') {
        valA = new Date(a.created_at).getTime() || 0;
        valB = new Date(b.created_at).getTime() || 0;
      } else if (sortField === 'quantity' || sortField === 'total_usd') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else if (sortField === 'balance_stock') {
        valA = Number(a.calculatedBalance) || 0;
        valB = Number(b.calculatedBalance) || 0;
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
  }, [searchTerm, selectedWarehouse, selectedProductSku, movementTypeFilter, periodFilter, pageSize]);

  // Mapa de cantidad de movimientos por SKU para enriquecer la búsqueda predictiva
  const productMovementsCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of movements) {
      if (m.sku) {
        map[m.sku] = (map[m.sku] || 0) + 1;
      }
    }
    return map;
  }, [movements]);

  // Lista de productos para la búsqueda predictiva en tiempo real
  const predictiveProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) {
      // Si el buscador está vacío pero se abre la búsqueda predictiva, mostrar productos ordenados por actividad
      return [...products]
        .sort((a, b) => (productMovementsCount[b.sku] || 0) - (productMovementsCount[a.sku] || 0))
        .slice(0, 8);
    }
    return products
      .filter(p => {
        const name = (p.name || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        const barcode = (p.barcode || '').toLowerCase();
        const cat = (p.category || '').toLowerCase();
        return name.includes(q) || sku.includes(q) || barcode.includes(q) || cat.includes(q);
      })
      .slice(0, 10);
  }, [products, searchTerm, productMovementsCount]);

  // Producto activo seleccionado (si hay filtro por SKU)
  const activeSelectedProduct = useMemo(() => {
    if (selectedProductSku === 'ALL') return null;
    return products.find(p => p.sku === selectedProductSku) || null;
  }, [products, selectedProductSku]);

  // Seleccionar producto desde el menú predictivo
  const handleSelectPredictiveProduct = (product: DbProduct) => {
    setSelectedProductSku(product.sku);
    setSearchTerm('');
    setIsPredictiveOpen(false);
    showToast(`Mostrando movimientos de "${product.name}" (${product.sku})`, 'info');
  };

  // Quitar filtro específico de producto
  const handleClearProductFilter = () => {
    setSelectedProductSku('ALL');
    setSearchTerm('');
    setIsPredictiveOpen(false);
  };

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
    setIsExportMenuOpen(false);
    if (filteredMovements.length === 0) {
      showToast('No hay movimientos en la vista para exportar.', 'info');
      return;
    }

    const headers = [
      'Fecha',
      'Hora',
      'Referencia / Comprobante',
      'SKU',
      'Producto',
      'Tipo de Movimiento',
      'Cantidad',
      'Stock Resultante',
      'Costo / Precio USD',
      'Total USD',
      'Tasa BCV',
      'Total VES',
      'Usuario / Responsable',
      'Almacén',
      'Motivo'
    ];

    const rows = filteredMovements.map(m => {
      const dt = new Date(m.created_at);
      const fecha = isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('es-VE');
      const hora = isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const unitVal = m.unit_price_usd > 0 ? m.unit_price_usd : m.unit_cost_usd;
      const rate = Number(m.exchange_rate) || activeRate;

      return [
        `"${fecha}"`,
        `"${hora}"`,
        `"${m.doc_number || ''}"`,
        `"${m.sku || ''}"`,
        `"${(m.product_name || '').replace(/"/g, '""')}"`,
        `"${m.movement_type || ''}"`,
        m.quantity,
        m.calculatedBalance,
        (Number(unitVal) || 0).toFixed(2),
        (Number(m.total_usd) || 0).toFixed(2),
        rate.toFixed(4),
        (Number(m.total_ves) || (Number(m.total_usd) * rate)).toFixed(2),
        `"${(m.responsable || 'Sistema').replace(/"/g, '""')}"`,
        `"${m.warehouseName || 'Almacén Principal'}"`,
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
        const hora = isNaN(dt.getTime()) ? '—' : dt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const unitVal = m.unit_price_usd > 0 ? m.unit_price_usd : m.unit_cost_usd;
        const rate = Number(m.exchange_rate) || activeRate;
        const totalUsd = Number(m.total_usd) || 0;
        const totalVes = Number(m.total_ves) || (totalUsd * rate);

        return {
          'Fecha': fecha,
          'Hora': hora,
          'Referencia': m.doc_number || '—',
          'SKU': m.sku || '—',
          'Producto': m.product_name || '—',
          'Tipo Movimiento': m.movement_type || '—',
          'Cantidad': m.quantity,
          'Stock Resultante': m.calculatedBalance,
          'Valor Unitario USD': Number((Number(unitVal) || 0).toFixed(2)),
          'Total USD': Number(totalUsd.toFixed(2)),
          'Tasa BCV': Number(rate.toFixed(4)),
          'Total VES': Number(totalVes.toFixed(2)),
          'Usuario / Responsable': m.responsable || 'Sistema',
          'Almacén / Sucursal': m.warehouseName || 'Almacén Principal',
          'Motivo': m.reason || '—'
        };
      });

      const worksheet = createWorksheetWithBusinessHeader('Kardex de Movimientos de Inventario', exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Kardex Movimientos');

      const fileName = `Kardex_Movimientos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      showToast('Reporte de movimientos exportado a Excel (XLSX) exitosamente.');
    } catch (err: any) {
      console.error('Error generando archivo XLS:', err);
      showToast('No se pudo generar el archivo Excel.', 'error');
    }
  };

  // Imprimir vista / PDF
  const handlePrint = () => {
    setIsExportMenuOpen(false);
    if (filteredMovements.length === 0) {
      showToast('No hay movimientos para imprimir.', 'info');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Permite las ventanas emergentes para generar el reporte.', 'error');
      return;
    }

    const business = getBusinessProfile();
    const rowsHtml = filteredMovements.map((m, index) => {
      const dt = new Date(m.created_at);
      const fecha = isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('es-VE');
      const hora = isNaN(dt.getTime()) ? '—' : dt.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
      const unitVal = m.unit_price_usd > 0 ? m.unit_price_usd : m.unit_cost_usd;
      const rate = Number(m.exchange_rate) || activeRate;
      const totalUsd = Number(m.total_usd) || 0;
      const totalVes = Number(m.total_ves) || (totalUsd * rate);

      return `
        <tr>
          <td style="text-align: center;">${index + 1}</td>
          <td>${fecha} ${hora}</td>
          <td><b>${m.doc_number || '—'}</b></td>
          <td>${m.movement_type || '—'}</td>
          <td>${m.sku || '—'}</td>
          <td>${m.product_name || '—'}</td>
          <td style="text-align: center; font-weight: bold;">${m.quantity}</td>
          <td style="text-align: right;">$${Number(unitVal || 0).toFixed(2)}</td>
          <td style="text-align: right; font-weight: bold;">$${totalUsd.toFixed(2)}</td>
          <td style="text-align: right;">Bs. ${totalVes.toFixed(2)}</td>
          <td>${m.warehouseName || 'Almacén Principal'}</td>
          <td>${m.responsable || 'Sistema'}</td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kárdex de Movimientos de Inventario - ${business.businessName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #000000; padding: 25px; margin: 0; background: #ffffff; }
          .header-banner { background-color: #4b5563; color: #ffffff; padding: 16px; border-radius: 6px; margin-bottom: 20px; }
          .header-banner h2 { color: #ffffff; margin: 0 0 4px; font-size: 18px; font-weight: bold; }
          .header-banner p { color: #e5e7eb; font-size: 12px; margin: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
          th { background: #4b5563; color: #ffffff; font-weight: bold; border: 1px solid #cbd5e1; padding: 9px 8px; text-align: left; }
          td { color: #000000; border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; background-color: #ffffff; }
          tr:nth-child(even) td { background-color: #f8fafc; }
          .footer { margin-top: 30px; font-size: 11px; color: #6b7280; text-align: right; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; }
          }
        </style>
      </head>
      <body>
        ${getReportHeaderHtml('Kárdex de Movimientos de Inventario', `Generado el: ${new Date().toLocaleString()} | Total Registros: ${filteredMovements.length} | Tasa BCV: ${activeRate.toFixed(2)} Bs/USD`)}
        <table>
          <thead>
            <tr>
              <th style="text-align: center; width: 30px;">#</th>
              <th>Fecha / Hora</th>
              <th>Documento</th>
              <th>Tipo</th>
              <th>SKU</th>
              <th>Producto</th>
              <th style="text-align: center;">Cantidad</th>
              <th style="text-align: right;">Costo U.</th>
              <th style="text-align: right;">Total USD</th>
              <th style="text-align: right;">Total VES</th>
              <th>Almacén</th>
              <th>Responsable</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        ${getReportFooterHtml()}
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
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
        if (res.data) {
          setMovements(prev => [res.data!, ...prev.filter(m => m.id !== res.data!.id)]);
        }
        await loadData(true);
      } else {
        showToast(res.error || 'No se pudo registrar el ajuste.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error al registrar el ajuste.', 'error');
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
      time: d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
  };

  // Helper para clasificar badges de tipo de movimiento con estilo
  const renderMovementTypeBadge = (movType: string, qty: number, docType?: string) => {
    const t = (movType || '').toUpperCase();
    const dt = (docType || '').toUpperCase();

    if (t.includes('AJUSTE') || dt.includes('AJUSTE') || t.includes('ADJUST') || dt.includes('ADJUST')) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 8px',
            borderRadius: 6,
            background: 'rgba(234, 179, 8, 0.15)',
            color: '#a16207',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.02em'
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#eab308' }} />
          Ajuste
        </span>
      );
    }

    if (t.includes('COMPRA') || t === 'ENTRADA' || dt.includes('COMPRA') || qty > 0) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 8px',
            borderRadius: 6,
            background: 'rgba(22, 163, 74, 0.12)',
            color: '#15803d',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.02em'
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
          Entrada
        </span>
      );
    }

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 8px',
          borderRadius: 6,
          background: 'rgba(239, 68, 68, 0.12)',
          color: '#b91c1c',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.02em'
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
        Salida
      </span>
    );
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

      {/* 1. ENCABEZADO PRINCIPAL (Acorde al mockup propuesto) */}
      <div
        className="page-head"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
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
            <h1 style={{ fontSize: 21, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              📦 Movimientos de Inventario
            </h1>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
              Kárdex auditado en tiempo real con compras, ventas y ajustes de stock
            </p>
          </div>
        </div>

        {/* Acciones del encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button
            variant="secondary"
            onClick={() => loadData(false)}
            disabled={isLoading}
            title="Recargar datos directamente desde Supabase"
            style={{ height: 38, padding: '0 12px', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Sincronizar</span>
          </Button>

          {/* Menú de exportación */}
          <div ref={exportDropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
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
              <Download size={15} />
              <span>Exportar</span>
              <ChevronDown size={14} style={{ transform: isExportMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </Button>

            {isExportMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 50,
                  minWidth: 185,
                  background: 'var(--surface, #ffffff)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md, 10px)',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12)',
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
                  <FileText size={15} style={{ color: 'var(--brand-600)' }} />
                  <span>Exportar CSV</span>
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

          {/* Botón Registrar Ajuste */}
          <Button
            variant="primary"
            onClick={() => setIsAdjustModalOpen(true)}
            style={{ height: 38, padding: '0 16px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} />
            <span>Registrar Ajuste</span>
          </Button>
        </div>
      </div>

      {/* 2. BARRA DE FILTROS Y CONTROL CON BÚSQUEDA PREDICTIVA */}
      <Card style={{ padding: 12, marginBottom: 14 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 10,
            alignItems: 'center'
          }}
        >
          {/* Búsqueda Automática con Búsqueda Predictiva de Productos */}
          <div ref={searchContainerRef} style={{ position: 'relative', minWidth: 260, gridColumn: 'span 2' }}>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                width: '100%'
              }}
            >
              {/* Botón / Icono de búsqueda con indicador de búsqueda automática en vivo */}
              <button
                type="button"
                onClick={() => setIsPredictiveOpen(prev => !prev)}
                title="Búsqueda predictiva de productos (automática)"
                style={{
                  position: 'absolute',
                  left: 6,
                  zIndex: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: 'none',
                  background: isPredictiveOpen ? 'var(--brand-100, #ede9fe)' : 'transparent',
                  color: isPredictiveOpen ? 'var(--brand-600, #7c3aed)' : 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600
                }}
              >
                <Search size={15} style={{ color: 'var(--brand-500)' }} />
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#16a34a',
                    boxShadow: '0 0 0 2px rgba(22, 163, 74, 0.2)'
                  }}
                  title="Búsqueda en tiempo real activa"
                />
              </button>

              <input
                type="text"
                className="input"
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setIsPredictiveOpen(true);
                  if (selectedProductSku !== 'ALL') {
                    setSelectedProductSku('ALL');
                  }
                }}
                onFocus={() => setIsPredictiveOpen(true)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setIsPredictiveOpen(false);
                  } else if (e.key === 'Enter' && predictiveProducts.length > 0) {
                    handleSelectPredictiveProduct(predictiveProducts[0]);
                  }
                }}
                placeholder="🔍 Buscar SKU, Producto, Ref, Usuario..."
                style={{
                  paddingLeft: 46,
                  paddingRight: (searchTerm || selectedProductSku !== 'ALL') ? 115 : 90,
                  height: 38,
                  fontSize: 13,
                  width: '100%',
                  borderColor: isPredictiveOpen ? 'var(--brand-500)' : undefined,
                  boxShadow: isPredictiveOpen ? '0 0 0 3px rgba(124, 58, 237, 0.12)' : undefined
                }}
              />

              {/* Botón derecho de control predictivo y limpieza */}
              <div
                style={{
                  position: 'absolute',
                  right: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  zIndex: 2
                }}
              >
                {/* Botón limpiar */}
                {(searchTerm || selectedProductSku !== 'ALL') && (
                  <button
                    type="button"
                    onClick={handleClearProductFilter}
                    title="Limpiar búsqueda y filtros de producto"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'rgba(0,0,0,0.06)',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    <X size={12} />
                  </button>
                )}

                {/* Botón interactivo para desplegar productos predictivos */}
                <button
                  type="button"
                  onClick={() => setIsPredictiveOpen(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: isPredictiveOpen ? 'var(--brand-500)' : 'var(--surface)',
                    color: isPredictiveOpen ? '#fff' : 'var(--brand-600)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Ver catálogo predictivo de productos"
                >
                  <Sparkles size={12} />
                  <span>Productos</span>
                  <ChevronDown
                    size={12}
                    style={{
                      transform: isPredictiveOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.15s'
                    }}
                  />
                </button>
              </div>
            </div>

            {/* Menú Flotante de Búsqueda Predictiva */}
            {isPredictiveOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  zIndex: 70,
                  background: 'var(--surface, #ffffff)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg, 12px)',
                  boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.16)',
                  overflow: 'hidden'
                }}
              >
                {/* Cabecera del panel predictivo */}
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'var(--brand-50, #f5f3ff)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={13} style={{ color: 'var(--brand-600)' }} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand-700)' }}>
                      PRODUCTOS DISPONIBLES ({predictiveProducts.length})
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#15803d',
                      background: 'rgba(22, 163, 74, 0.1)',
                      padding: '1px 6px',
                      borderRadius: 4
                    }}
                  >
                    Búsqueda Automática
                  </span>
                </div>

                {/* Lista de productos interactivos */}
                <div style={{ maxHeight: 290, overflowY: 'auto' }}>
                  {predictiveProducts.length > 0 ? (
                    predictiveProducts.map(p => {
                      const count = productMovementsCount[p.sku] || 0;
                      const isSelected = selectedProductSku === p.sku;
                      const stockVal = Number(p.stock) || 0;
                      const priceVal = Number(p.price_usd ?? 0);

                      return (
                        <div
                          key={p.sku}
                          onClick={() => handleSelectPredictiveProduct(p)}
                          style={{
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            borderBottom: '1px solid rgba(0,0,0,0.04)',
                            background: isSelected ? 'var(--brand-50, #f5f3ff)' : 'transparent',
                            transition: 'background 0.12s ease'
                          }}
                          onMouseEnter={e => {
                            if (!isSelected) e.currentTarget.style.background = 'var(--brand-50, #f5f3ff)';
                          }}
                          onMouseLeave={e => {
                            if (!isSelected) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          {/* Info producto */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 8,
                                background: isSelected ? 'var(--brand-500)' : 'var(--brand-50)',
                                color: isSelected ? '#fff' : 'var(--brand-600)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                border: '1px solid var(--border)'
                              }}
                            >
                              <Package size={17} />
                            </div>

                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                                  {p.name}
                                </span>
                                <span
                                  style={{
                                    fontFamily: 'monospace',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: '#f1f5f9',
                                    color: '#475569',
                                    padding: '1px 5px',
                                    borderRadius: 4
                                  }}
                                >
                                  {p.sku}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, fontSize: 11, color: 'var(--muted)' }}>
                                <span>Precio: <strong style={{ color: 'var(--text)' }}>${priceVal.toFixed(2)}</strong></span>
                                <span>•</span>
                                <span style={{ color: 'var(--brand-600)', fontWeight: 600 }}>
                                  📦 {count} {count === 1 ? 'movimiento' : 'movimientos'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Stock y acción */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0, marginLeft: 10 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: stockVal > 0 ? 'rgba(22, 163, 74, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: stockVal > 0 ? '#15803d' : '#b91c1c'
                              }}
                            >
                              Stock: {stockVal} uds
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--brand-600)', fontWeight: 600 }}>
                              {isSelected ? '✓ Seleccionado' : 'Filtrar kárdex →'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                      <Package size={24} style={{ margin: '0 auto 6px', opacity: 0.35 }} />
                      <div>No hay productos que coincidan exactamente con &quot;<strong>{searchTerm}</strong>&quot;</div>
                      <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text)' }}>
                        El kárdex se está filtrando automáticamente por comprobantes, usuarios o notas.
                      </div>
                    </div>
                  )}
                </div>

                {/* Pie del menú predictivo */}
                <div
                  style={{
                    padding: '7px 12px',
                    background: '#fafafa',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: 'var(--muted)'
                  }}
                >
                  <span>Tip: Clic en cualquier producto para auditar sus movimientos</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProductSku('ALL');
                      setIsPredictiveOpen(false);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--brand-600)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: 11
                    }}
                  >
                    Ver todo el inventario
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Selector de Almacén */}
          <div>
            <select
              className="input"
              value={selectedWarehouse}
              onChange={e => setSelectedWarehouse(e.target.value)}
              style={{ height: 38, fontSize: 13, width: '100%' }}
            >
              <option value="ALL">Almacén: Todos</option>
              <option value="PRINCIPAL">Almacén: Principal</option>
            </select>
          </div>

          {/* Selector de Tipo de Movimiento */}
          <div>
            <select
              className="input"
              value={movementTypeFilter}
              onChange={e => setMovementTypeFilter(e.target.value as MovementFilterType)}
              style={{ height: 38, fontSize: 13, width: '100%' }}
            >
              <option value="TODOS">Tipo: Todos ({typeCounts.total})</option>
              <option value="ENTRADAS">🟢 Entradas ({typeCounts.entradas})</option>
              <option value="SALIDAS">🔴 Salidas ({typeCounts.salidas})</option>
              <option value="VENTAS">Ventas POS ({typeCounts.ventas})</option>
              <option value="COMPRAS">Compras Proveedores ({typeCounts.compras})</option>
              <option value="AJUSTES">🟡 Ajustes de Stock ({typeCounts.ajustes})</option>
            </select>
          </div>

          {/* Selector de Período de Tiempo */}
          <div>
            <select
              className="input"
              value={periodFilter}
              onChange={e => setPeriodFilter(e.target.value as PeriodFilter)}
              style={{ height: 38, fontSize: 13, width: '100%' }}
            >
              <option value="ALL">📅 Historial Completo</option>
              <option value="TODAY">📅 Hoy</option>
              <option value="LAST_7_DAYS">📅 Últimos 7 días</option>
              <option value="THIS_MONTH">📅 Este mes</option>
              <option value="LAST_MONTH">📅 Mes anterior</option>
            </select>
          </div>

          {/* Filtro específico por SKU de Producto */}
          <div>
            <select
              className="input"
              value={selectedProductSku}
              onChange={e => {
                setSelectedProductSku(e.target.value);
                if (e.target.value !== 'ALL') {
                  setSearchTerm('');
                }
              }}
              style={{ height: 38, fontSize: 13, width: '100%' }}
            >
              <option value="ALL">Producto: Todos ({products.length})</option>
              {products.map(p => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} — {p.name} (Stock: {p.stock})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Banner de producto activo filtrado */}
        {activeSelectedProduct && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 14px',
              background: 'var(--brand-50, #f5f3ff)',
              border: '1px solid var(--brand-200, #ddd6fe)',
              borderRadius: 'var(--radius-md, 10px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={16} style={{ color: 'var(--brand-600)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-900, #4c1d95)' }}>
                Filtrando kárdex por producto:
              </span>
              <strong style={{ fontSize: 13, color: 'var(--text)' }}>
                {activeSelectedProduct.name}
              </strong>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  background: '#fff',
                  border: '1px solid var(--border)',
                  padding: '1px 6px',
                  borderRadius: 4
                }}
              >
                {activeSelectedProduct.sku}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#15803d',
                  background: 'rgba(22, 163, 74, 0.14)',
                  padding: '2px 8px',
                  borderRadius: 6
                }}
              >
                Stock físico: {Number(activeSelectedProduct.stock) || 0} unids
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                ({productMovementsCount[activeSelectedProduct.sku] || 0} movimientos registrados)
              </span>
            </div>

            <button
              type="button"
              onClick={handleClearProductFilter}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text)',
                cursor: 'pointer'
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--brand-500)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <X size={13} style={{ color: 'var(--danger)' }} />
              <span>Quitar filtro de producto</span>
            </button>
          </div>
        )}
      </Card>

      {/* 3. RESUMEN DEL PERÍODO (KPIs Consolidados del mockup propuesto) */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg, 14px)',
          padding: '12px 18px',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              📊 Resumen del período:
            </span>
          </div>

          {/* Entradas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Entradas:</span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: '#15803d',
                background: 'rgba(22, 163, 74, 0.12)',
                padding: '2px 8px',
                borderRadius: 6
              }}
            >
              +{periodSummary.entradasUnits.toLocaleString('es-VE')} unids
            </span>
          </div>

          <span style={{ color: 'var(--border)' }}>|</span>

          {/* Salidas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Salidas:</span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: '#b91c1c',
                background: 'rgba(239, 68, 68, 0.12)',
                padding: '2px 8px',
                borderRadius: 6
              }}
            >
              -{periodSummary.salidasUnits.toLocaleString('es-VE')} unids
            </span>
          </div>

          <span style={{ color: 'var(--border)' }}>|</span>

          {/* Neto */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Neto:</span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: periodSummary.netoUnits >= 0 ? 'var(--brand-700)' : 'var(--danger)',
                background: 'var(--canvas)',
                border: '1px solid var(--border)',
                padding: '2px 8px',
                borderRadius: 6
              }}
            >
              {periodSummary.netoUnits >= 0 ? `+${periodSummary.netoUnits.toLocaleString('es-VE')}` : periodSummary.netoUnits.toLocaleString('es-VE')} unids
            </span>
          </div>
        </div>

        {/* Valoración e información complementaria */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12 }}>
          <div>
            <span className="muted">Impacto Financiero: </span>
            <b style={{ color: 'var(--text)' }}>{formatUSD(periodSummary.netoUSD)}</b>
            <span className="muted" style={{ marginLeft: 4, fontSize: 11 }}>
              ({formatVES(periodSummary.netoVES)})
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
            <span className="muted">Tasa BCV:</span>
            <b style={{ color: 'var(--brand-700)' }}>Bs. {activeRate.toFixed(2)}</b>
          </div>
        </div>
      </div>

      {/* 4. TABLA DE MOVIMIENTOS PROFESIONAL */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {error ? (
          <div style={{ padding: 36, textAlign: 'center' }}>
            <AlertCircle size={32} style={{ color: 'var(--danger)', marginBottom: 8 }} />
            <h3 style={{ margin: '0 0 8px' }}>Error consultando movimientos</h3>
            <p className="muted" style={{ maxWidth: 460, margin: '0 auto 16px', fontSize: 13 }}>
              {error}
            </p>
            <Button variant="primary" onClick={() => loadData(false)}>
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
                ? 'Ningún movimiento coincide con los filtros aplicados. Prueba modificando los criterios de búsqueda.'
                : 'Aún no hay movimientos registrados. Puedes registrar un nuevo ajuste con el botón superior.'
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table" style={{ margin: 0, width: '100%' }}>
                <thead>
                  <tr>
                    {/* Fecha y Hora */}
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none', width: '14%' }}
                      onClick={() => toggleSort('created_at')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>Fecha / Hora</span>
                        {sortField === 'created_at' ? (
                          sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} className="muted" />
                        )}
                      </div>
                    </th>

                    {/* Referencia / ID */}
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none', width: '12%' }}
                      onClick={() => toggleSort('doc_number')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>Referencia</span>
                        {sortField === 'doc_number' ? (
                          sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} className="muted" />
                        )}
                      </div>
                    </th>

                    {/* Producto (SKU) */}
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none', width: '22%' }}
                      onClick={() => toggleSort('product_name')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>Producto (SKU)</span>
                        {sortField === 'product_name' ? (
                          sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} className="muted" />
                        )}
                      </div>
                    </th>

                    {/* Tipo */}
                    <th style={{ width: '10%' }}>
                      <span>Tipo</span>
                    </th>

                    {/* Cantidad */}
                    <th
                      className="num"
                      style={{ cursor: 'pointer', userSelect: 'none', width: '9%' }}
                      onClick={() => toggleSort('quantity')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <span>Cant.</span>
                        {sortField === 'quantity' ? (
                          sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} className="muted" />
                        )}
                      </div>
                    </th>

                    {/* Stock Resultante (Saldo) */}
                    <th
                      className="num"
                      style={{ cursor: 'pointer', userSelect: 'none', width: '9%' }}
                      onClick={() => toggleSort('balance_stock')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <span>Stock</span>
                        {sortField === 'balance_stock' ? (
                          sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} className="muted" />
                        )}
                      </div>
                    </th>

                    {/* Costos y Valores */}
                    <th
                      className="num"
                      style={{ cursor: 'pointer', userSelect: 'none', width: '12%' }}
                      onClick={() => toggleSort('total_usd')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <span>Valoración</span>
                        {sortField === 'total_usd' ? (
                          sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} className="muted" />
                        )}
                      </div>
                    </th>

                    {/* Usuario / Responsable */}
                    <th style={{ width: '12%' }}>
                      <span>Usuario</span>
                    </th>

                    {/* Acciones */}
                    <th style={{ width: '6%', textAlign: 'center' }}>
                      <span>Acción</span>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paginatedMovements.map((mov, index) => {
                    const { date, time } = formatDateTime(mov.created_at);
                    const qty = Number(mov.quantity) || 0;
                    const isPositive = qty > 0;
                    const isNegative = qty < 0;

                    const unitVal = mov.unit_price_usd > 0 ? mov.unit_price_usd : mov.unit_cost_usd;
                    const rateApplied = Number(mov.exchange_rate) || activeRate;
                    const totalUsd = Number(mov.total_usd) || (Math.abs(qty) * unitVal);
                    const totalVes = Number(mov.total_ves) || (totalUsd * rateApplied);

                    // Formatear referencia
                    const docClean = mov.doc_number || 'S/N';

                    return (
                      <tr
                        key={`${mov.id}-${index}`}
                        style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                        onClick={() => setSelectedMovementDetail(mov)}
                      >
                        {/* Fecha y Hora */}
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

                        {/* Referencia */}
                        <td>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              fontSize: 12,
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: 'var(--canvas)',
                              border: '1px solid var(--border)',
                              color: 'var(--text)'
                            }}
                          >
                            {docClean}
                          </span>
                        </td>

                        {/* Producto (SKU) */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                background: 'var(--brand-50)',
                                color: 'var(--brand-700)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}
                            >
                              <Package size={14} />
                            </div>
                            <div style={{ minWidth: 0, overflow: 'hidden' }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: 'var(--text)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}
                              >
                                {mov.product_name}
                              </div>
                              <div className="muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                                ({mov.sku})
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Tipo */}
                        <td>
                          {renderMovementTypeBadge(mov.movement_type, qty, mov.doc_type)}
                        </td>

                        {/* Cantidad */}
                        <td className="num">
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: isPositive ? '#16a34a' : isNegative ? '#dc2626' : 'var(--text)'
                            }}
                          >
                            {isPositive ? `+${qty}` : `${qty}`}
                          </span>
                        </td>

                        {/* Stock Resultante (Saldo) */}
                        <td className="num">
                          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                            {mov.calculatedBalance.toLocaleString('es-VE')}
                          </span>
                        </td>

                        {/* Costos y Valores */}
                        <td className="num">
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                              {formatUSD(totalUsd)}
                            </div>
                            <div className="muted" style={{ fontSize: 11 }}>
                              {formatVES(totalVes)}
                            </div>
                          </div>
                        </td>

                        {/* Usuario / Responsable */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <User size={13} className="text-muted" style={{ flexShrink: 0 }} />
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 500,
                                color: 'var(--text)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: 130
                              }}
                            >
                              {mov.responsable}
                            </div>
                          </div>
                        </td>

                        {/* Acciones */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn ghost"
                            title="Ver auditoría y detalles"
                            style={{ padding: 6, height: 'auto', color: 'var(--brand-700)' }}
                            onClick={e => {
                              e.stopPropagation();
                              setSelectedMovementDetail(mov);
                            }}
                          >
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 5. BARRA DE PAGINACIÓN */}
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
                  <b>{sortedMovements.length.toLocaleString('es-VE')}</b> registros
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

      {/* 6. MODAL REORGANIZADO Y MEJORADO: REGISTRAR AJUSTE DE STOCK */}
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
              maxWidth: 540,
              padding: 24,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 16px 40px rgba(0,0,0,0.2)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Cabecera del modal */}
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
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>REGISTRAR AJUSTE DE INVENTARIO</h3>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Ajuste físico de stock con impacto en tiempo real en Supabase
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
                <label style={{ fontSize: 13, fontWeight: 600 }}>Producto a Ajustar *</label>
                <select
                  className="input"
                  value={adjustSku}
                  onChange={e => setAdjustSku(e.target.value)}
                  required
                  style={{ height: 40 }}
                >
                  <option value="">Selecciona un producto del catálogo...</option>
                  {products.map(p => (
                    <option key={p.sku} value={p.sku}>
                      [{p.sku}] {p.name} — Stock actual: {p.stock}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selector de Tipo de Ajuste */}
              <div className="field" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Tipo de Ajuste *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setAdjustType('ENTRADA')}
                    style={{
                      height: 40,
                      background: adjustType === 'ENTRADA' ? '#16a34a' : 'var(--surface)',
                      color: adjustType === 'ENTRADA' ? '#fff' : 'var(--text)',
                      borderColor: adjustType === 'ENTRADA' ? '#16a34a' : 'var(--border)',
                      fontWeight: 700,
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
                      background: adjustType === 'SALIDA' ? '#dc2626' : 'var(--surface)',
                      color: adjustType === 'SALIDA' ? '#fff' : 'var(--text)',
                      borderColor: adjustType === 'SALIDA' ? '#dc2626' : 'var(--border)',
                      fontWeight: 700,
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
                      fontWeight: 700,
                      fontSize: 12
                    }}
                  >
                    = Fijar Stock
                  </button>
                </div>
              </div>

              {/* Panel de Vista Previa del Stock y Dinámica de Unidades */}
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
                    gap: 8,
                    textAlign: 'center'
                  }}
                >
                  <div>
                    <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>STOCK ACTUAL</div>
                    <b style={{ fontSize: 16, color: 'var(--text)' }}>
                      {activeAdjustProduct.stock} uds.
                    </b>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>VARIACIÓN</div>
                    <b
                      style={{
                        fontSize: 16,
                        color:
                          adjustType === 'ENTRADA'
                            ? '#16a34a'
                            : adjustType === 'SALIDA'
                            ? '#dc2626'
                            : 'var(--brand-700)'
                      }}
                    >
                      {adjustType === 'ENTRADA' ? `+${adjustQty}` : adjustType === 'SALIDA' ? `-${adjustQty}` : `=${adjustQty}`}
                    </b>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>STOCK FINAL</div>
                    <b
                      style={{
                        fontSize: 16,
                        color: projectedStock < Number(activeAdjustProduct.stock) ? '#dc2626' : '#16a34a'
                      }}
                    >
                      {projectedStock} uds.
                    </b>
                  </div>
                </div>
              )}

              {/* Cantidad y Referencia */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div className="field">
                  <label style={{ fontSize: 13, fontWeight: 600 }}>
                    {adjustType === 'CORRECCION' ? 'Nuevo Stock Físico *' : 'Cantidad a Afectar *'}
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="input"
                    value={adjustQty}
                    onChange={e => setAdjustQty(e.target.value)}
                    required
                    style={{ height: 38 }}
                  />
                </div>

                <div className="field">
                  <label style={{ fontSize: 13, fontWeight: 600 }}>N° Referencia / Código</label>
                  <input
                    type="text"
                    className="input"
                    value={adjustDocNumber}
                    onChange={e => setAdjustDocNumber(e.target.value)}
                    placeholder="AJU-1001"
                    style={{ height: 38 }}
                  />
                </div>
              </div>

              {/* Motivo del Ajuste */}
              <div className="field" style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Motivo u Observación *</label>
                <select
                  className="input"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  required
                  style={{ height: 38 }}
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

              {/* Notas opcionales */}
              <div className="field" style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Notas de Auditoría (opcional)</label>
                <textarea
                  className="input"
                  style={{ height: 55, padding: 8, resize: 'none' }}
                  value={adjustNotes}
                  onChange={e => setAdjustNotes(e.target.value)}
                  placeholder="Detalles adicionales del movimiento..."
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

      {/* 7. MODAL DE DETALLE DEL MOVIMIENTO (AUDITORÍA COMPLETA) */}
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
              boxShadow: '0 16px 40px rgba(0,0,0,0.2)'
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
                    Referencia #{selectedMovementDetail.doc_number || 'S/N'}
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
                <div style={{ marginTop: 2 }}>
                  {renderMovementTypeBadge(selectedMovementDetail.movement_type, selectedMovementDetail.quantity, selectedMovementDetail.doc_type)}
                </div>
              </div>

              <div>
                <div className="muted" style={{ fontSize: 11 }}>PRODUCTO / SKU</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {selectedMovementDetail.product_name}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  SKU: {selectedMovementDetail.sku}
                </div>
              </div>

              <div>
                <div className="muted" style={{ fontSize: 11 }}>RESPONSABLE / ALMACÉN</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {selectedMovementDetail.responsable}
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {selectedMovementDetail.warehouseName}
                </div>
              </div>
            </div>

            {/* Impacto en Unidades y Stock */}
            <div
              style={{
                padding: 14,
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                marginBottom: 16,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12
              }}
            >
              <div>
                <div className="muted" style={{ fontSize: 11 }}>VARIACIÓN DE UNIDADES</div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: selectedMovementDetail.quantity > 0 ? '#16a34a' : '#dc2626'
                  }}
                >
                  {selectedMovementDetail.quantity > 0 ? `+${selectedMovementDetail.quantity}` : selectedMovementDetail.quantity} unids.
                </div>
              </div>

              <div>
                <div className="muted" style={{ fontSize: 11 }}>STOCK RESULTANTE (SALDO)</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>
                  {selectedMovementDetail.calculatedBalance} unids.
                </div>
              </div>
            </div>

            {/* Valoración Financiera Bimonetaria */}
            <div
              style={{
                padding: 14,
                borderRadius: 'var(--radius-md)',
                background: 'var(--canvas)',
                border: '1px solid var(--border)',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div className="muted" style={{ fontSize: 11 }}>VALOR TOTAL (USD)</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
                  {formatUSD(selectedMovementDetail.total_usd)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="muted" style={{ fontSize: 11 }}>VALOR TOTAL (VES)</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand-700)' }}>
                  {formatVES(selectedMovementDetail.total_ves || (selectedMovementDetail.total_usd * (selectedMovementDetail.exchange_rate || activeRate)))}
                </div>
              </div>
            </div>

            {/* Motivo u Observaciones */}
            <div style={{ fontSize: 13, marginBottom: 20 }}>
              <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>MOTIVO REGISTRADO</div>
              <div style={{ fontWeight: 500, marginTop: 2 }}>
                {selectedMovementDetail.reason || 'Sin observación'}
              </div>
              {selectedMovementDetail.notes && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Notas: {selectedMovementDetail.notes}
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
