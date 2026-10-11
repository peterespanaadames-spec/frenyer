import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  ClipboardList,
  Search,
  RefreshCw,
  Download,
  Plus,
  ShoppingCart,
  CheckCircle,
  Clock,
  Truck,
  Store,
  DollarSign,
  AlertTriangle,
  FileText,
  Eye,
  Filter,
  X,
  Volume2,
  VolumeX,
  Kanban,
  Table as TableIcon,
  ChevronRight,
  ArrowRight,
  Package,
  Calendar,
  RotateCcw,
  Check,
  Building,
  User,
  CreditCard,
  Printer
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import {
  getActiveExchangeRate,
  convertUSDtoVES,
  formatUSD,
  formatVES
} from '../../../lib/currency';
import {
  fetchOrdersFromApi,
  createOrderInApi,
  updateOrderDeliveryStatusInApi,
  updateOrderPaymentStatusInApi,
  fetchProductsFromSupabase,
  fetchCustomersFromSupabase
} from '../../../lib/supabase/db';
import {
  DbOrder,
  DeliveryStatus,
  PaymentStatus,
  DeliveryMethod,
  PaymentMethod
} from '../../../types/domain';

// Sound effect synthesizer via Web Audio API (graceful, no external mp3 needed)
function playNotificationChime() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    osc2.frequency.setValueAtTime(880, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.2); // D6

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.4);
    osc2.stop(ctx.currentTime + 0.4);
  } catch {
    // ignore if browser blocks auto-audio
  }
}

export function OrdersPage() {
  const navigate = useNavigate();

  // --- ORDERS STATE ---
  const [orders, setOrders] = useState<DbOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(() => getActiveExchangeRate());

  // --- FILTERS STATE (SECCIÓN 8.3) ---
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>('TODOS');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('TODOS');
  const [deliveryMethodFilter, setDeliveryMethodFilter] = useState<string>('TODOS');
  const [dateFilter, setDateFilter] = useState<string>('TODOS'); // 'TODOS', 'HOY', '7_DIAS', '30_DIAS'
  const [customDate, setCustomDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('frenyer_order_sound') !== 'false';
  });

  // --- MODAL: ORDER DETAILS (SECCIÓN 8.7) ---
  const [selectedOrder, setSelectedOrder] = useState<DbOrder | null>(null);

  // --- MODAL: CREATE MANUAL ORDER ---
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [availableCustomers, setAvailableCustomers] = useState<any[]>([]);
  const [newOrderCustomer, setNewOrderCustomer] = useState('');
  const [newOrderPhone, setNewOrderPhone] = useState('');
  const [newOrderMethod, setNewOrderMethod] = useState<DeliveryMethod>('RETIRO');
  const [newOrderAddress, setNewOrderAddress] = useState('');
  const [newOrderPayment, setNewOrderPayment] = useState<PaymentMethod>('PAGO_MOVIL');
  const [newOrderItems, setNewOrderItems] = useState<Array<{ sku: string; name: string; quantity: number; unit_price_usd: number }>>([]);
  const [selectedProductSku, setSelectedProductSku] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Track previous order count to detect incoming new orders for real-time sound
  const previousOrdersCountRef = useRef<number>(0);

  // Load orders function
  const loadOrders = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const data = await fetchOrdersFromApi();
      if (Array.isArray(data)) {
        // Detect new order arrival
        if (
          previousOrdersCountRef.current > 0 &&
          data.length > previousOrdersCountRef.current
        ) {
          if (soundEnabled) {
            playNotificationChime();
          }
          const diff = data.length - previousOrdersCountRef.current;
          showToast(`¡${diff} nuevo(s) pedido(s) recibido(s)!`);
        }
        previousOrdersCountRef.current = data.length;
        setOrders(data);
      }
    } catch (err) {
      console.warn('Error cargando pedidos:', err);
    } finally {
      if (!silent) {
        setIsRefreshing(false);
        setIsLoading(false);
      }
    }
  };

  // Initial load
  useEffect(() => {
    loadOrders();
    const rate = getActiveExchangeRate();
    setExchangeRate(rate);

    // Load products and customers for the manual order modal
    void fetchProductsFromSupabase().then(res => setAvailableProducts(res || []));
    void fetchCustomersFromSupabase().then(res => setAvailableCustomers(res || []));
  }, []);

  // Real-time polling every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadOrders(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [soundEnabled]);

  const toggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    localStorage.setItem('frenyer_order_sound', String(nextVal));
    showToast(nextVal ? 'Notificaciones de sonido activadas' : 'Sonido silenciado', 'info');
  };

  // --- KPI CALCULATIONS (SECCIÓN 8.2) ---
  const kpis = useMemo(() => {
    const totalOrders = orders.length;

    const pendingOrders = orders.filter(o =>
      ['RECIBIDO', 'PREPARADO', 'LISTO_PARA_ENTREGAR', 'EN_CAMINO'].includes(o.delivery_status) ||
      o.payment_status === 'PENDIENTE'
    ).length;

    const completedOrders = orders.filter(o =>
      o.delivery_status === 'ENTREGADO' && o.payment_status === 'PAGADO'
    ).length;

    // Facturación activa: pedidos completados o pagados (excluye cancelados o reembolsados)
    const activeBillingUSD = orders
      .filter(o => o.delivery_status !== 'CANCELADO' && o.payment_status !== 'REEMBOLSADO')
      .reduce((acc, o) => acc + (Number(o.total_usd) || 0), 0);

    const activeBillingVES = convertUSDtoVES(activeBillingUSD, exchangeRate);

    return {
      total: totalOrders,
      pending: pendingOrders,
      completed: completedOrders,
      billingUSD: Math.round(activeBillingUSD * 100) / 100,
      billingVES: activeBillingVES
    };
  }, [orders, exchangeRate]);

  // --- FILTERED ORDERS ---
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // Búsqueda general
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchNum = o.order_number?.toLowerCase().includes(query);
        const matchCustomer = o.customer_name?.toLowerCase().includes(query);
        const matchPhone = o.customer_phone?.toLowerCase().includes(query);
        const matchDoc = o.customer_doc?.toLowerCase().includes(query);
        const matchRef = o.payment_reference?.toLowerCase().includes(query);
        if (!matchNum && !matchCustomer && !matchPhone && !matchDoc && !matchRef) {
          return false;
        }
      }

      // Estado de entrega
      if (deliveryStatusFilter !== 'TODOS' && o.delivery_status !== deliveryStatusFilter) {
        return false;
      }

      // Estado del pago
      if (paymentStatusFilter !== 'TODOS' && o.payment_status !== paymentStatusFilter) {
        return false;
      }

      // Método de entrega
      if (deliveryMethodFilter !== 'TODOS' && o.delivery_method !== deliveryMethodFilter) {
        return false;
      }

      // Filtro por fecha
      if (customDate) {
        const orderDateStr = new Date(o.created_at).toISOString().split('T')[0];
        if (orderDateStr !== customDate) return false;
      } else if (dateFilter !== 'TODOS') {
        const orderTime = new Date(o.created_at).getTime();
        const now = Date.now();
        if (dateFilter === 'HOY') {
          const today = new Date().toISOString().split('T')[0];
          const orderDate = new Date(o.created_at).toISOString().split('T')[0];
          if (orderDate !== today) return false;
        } else if (dateFilter === '7_DIAS') {
          if (now - orderTime > 7 * 24 * 60 * 60 * 1000) return false;
        } else if (dateFilter === '30_DIAS') {
          if (now - orderTime > 30 * 24 * 60 * 60 * 1000) return false;
        }
      }

      return true;
    });
  }, [orders, searchTerm, deliveryStatusFilter, paymentStatusFilter, deliveryMethodFilter, dateFilter, customDate]);

  const clearFilters = () => {
    setSearchTerm('');
    setDeliveryStatusFilter('TODOS');
    setPaymentStatusFilter('TODOS');
    setDeliveryMethodFilter('TODOS');
    setDateFilter('TODOS');
    setCustomDate('');
  };

  // --- ACTIONS: UPDATE STATUS (SECCIÓN 8.5 & 8.6) ---
  const handleUpdateDeliveryStatus = async (orderId: string, nextStatus: DeliveryStatus) => {
    const res = await updateOrderDeliveryStatusInApi(orderId, nextStatus, 'Administrador');
    if (res.success && res.data) {
      setOrders(prev => prev.map(o => (o.id === orderId ? res.data : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(res.data);
      }
      showToast(`Estado de entrega actualizado a "${nextStatus}"`);
    } else {
      showToast(res.error || 'No se pudo actualizar el estado.', 'info');
    }
  };

  const handleUpdatePaymentStatus = async (orderId: string, nextStatus: PaymentStatus) => {
    const res = await updateOrderPaymentStatusInApi(orderId, nextStatus, 'Administrador');
    if (res.success && res.data) {
      setOrders(prev => prev.map(o => (o.id === orderId ? res.data : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(res.data);
      }
      showToast(`Estado de pago actualizado a "${nextStatus}"`);
    } else {
      showToast(res.error || 'No se pudo actualizar el pago.', 'info');
    }
  };

  // --- ACTION: EXPORT TO EXCEL (SECCIÓN 11) ---
  const handleExportExcel = () => {
    try {
      const dataToExport = filteredOrders.map(o => ({
        'N.º Pedido': o.order_number,
        'Fecha': new Date(o.created_at).toLocaleString('es-VE'),
        'Cliente': o.customer_name,
        'Teléfono': o.customer_phone || '—',
        'Cédula/RIF': o.customer_doc || '—',
        'Método de Entrega': o.delivery_method === 'DOMICILIO' ? 'Entrega a Domicilio' : 'Retiro en Tienda',
        'Dirección / Sede': o.delivery_address || '—',
        'Método de Pago': o.payment_method,
        'Referencia de Pago': o.payment_reference || '—',
        'Estado de Entrega': o.delivery_status,
        'Estado del Pago': o.payment_status,
        'Moneda': o.currency,
        'Total USD': Number(o.total_usd) || 0,
        'Total VES': Number(o.total_ves) || 0,
        'Tasa BCV': Number(o.exchange_rate) || 0,
        'Fecha Finalización': o.completed_at ? new Date(o.completed_at).toLocaleString('es-VE') : '—'
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');

      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `Frenyer_Control_Pedidos_${dateStr}.xlsx`);
      showToast('Archivo Excel generado y descargado exitosamente.');
    } catch (err: any) {
      showToast(err?.message || 'Error exportando a Excel.', 'info');
    }
  };

  // --- ACTION: CREATE MANUAL ORDER ---
  const handleAddItemToNewOrder = () => {
    if (!selectedProductSku) return;
    const prod = availableProducts.find(p => p.sku === selectedProductSku);
    if (!prod) return;

    setNewOrderItems(prev => {
      const existing = prev.find(i => i.sku === prod.sku);
      if (existing) {
        return prev.map(i => (i.sku === prod.sku ? { ...i, quantity: i.quantity + selectedQty } : i));
      }
      return [
        ...prev,
        {
          sku: prod.sku,
          name: prod.name,
          quantity: selectedQty,
          unit_price_usd: Number(prod.price_usd) || 0
        }
      ];
    });
    setSelectedProductSku('');
    setSelectedQty(1);
  };

  const handleSaveNewOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderCustomer.trim()) {
      showToast('Ingrese el nombre del cliente.', 'info');
      return;
    }
    if (newOrderItems.length === 0) {
      showToast('Debe agregar al menos un producto al pedido.', 'info');
      return;
    }

    setIsSubmittingNew(true);
    try {
      const res = await createOrderInApi({
        customer_name: newOrderCustomer.trim(),
        customer_phone: newOrderPhone.trim(),
        delivery_method: newOrderMethod,
        delivery_address: newOrderMethod === 'DOMICILIO' ? newOrderAddress.trim() : 'Retiro en Sede Principal',
        payment_method: newOrderPayment,
        payment_status: 'PENDIENTE',
        exchange_rate: exchangeRate,
        items: newOrderItems
      });

      if (res.success && res.data) {
        showToast(`Pedido ${res.data.order_number} creado con éxito.`);
        await loadOrders(false);
        setIsCreateModalOpen(false);
        setNewOrderCustomer('');
        setNewOrderPhone('');
        setNewOrderItems([]);
      } else {
        showToast(res.error || 'Error creando pedido.', 'info');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error en el servidor.', 'info');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Helper colors/tones for badges
  const getDeliveryStatusTone = (status: DeliveryStatus): 'brand' | 'success' | 'warning' | 'danger' => {
    switch (status) {
      case 'RECIBIDO': return 'brand';
      case 'PREPARADO': return 'warning';
      case 'LISTO_PARA_ENTREGAR': return 'warning';
      case 'EN_CAMINO': return 'brand';
      case 'ENTREGADO': return 'success';
      case 'CANCELADO': return 'danger';
      default: return 'brand';
    }
  };

  const getPaymentStatusTone = (status: PaymentStatus): 'brand' | 'success' | 'warning' | 'danger' => {
    switch (status) {
      case 'PAGADO': return 'success';
      case 'PENDIENTE': return 'warning';
      case 'REEMBOLSADO': return 'danger';
      default: return 'warning';
    }
  };

  return (
    <div className="content">
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            background: toast.type === 'info' ? 'var(--text)' : 'var(--success)',
            color: 'var(--surface)',
            padding: '12px 20px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            zIndex: 1200,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <CheckCircle size={18} />
          {toast.message}
        </div>
      )}

      {/* 8.1. ENCABEZADO (REFERENCIA 2) */}
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div>
          <h1 style={{ letterSpacing: '-0.02em' }}>CONTROL DE PEDIDOS</h1>
          <p>Supervisa, despacha y concilia las órdenes de compra en tiempo real.</p>
        </div>

        <div className="actions">
          {/* Botón POS */}
          <button
            type="button"
            className="btn"
            onClick={() => navigate('/ventas-flash/ventas')}
            title="Ir al Punto de Venta POS"
          >
            <ShoppingCart size={16} />
            <span>POS</span>
          </button>

          {/* Botón Pedidos Facturados */}
          <button
            type="button"
            className={`btn ${paymentStatusFilter === 'PAGADO' ? 'primary' : ''}`}
            onClick={() => {
              if (paymentStatusFilter === 'PAGADO') {
                setPaymentStatusFilter('TODOS');
              } else {
                setPaymentStatusFilter('PAGADO');
                showToast('Filtrando por pedidos con pago confirmado');
              }
            }}
          >
            <CheckCircle size={16} />
            <span>Pedidos facturados</span>
          </button>

          {/* Botón Actualizar */}
          <button
            type="button"
            className="btn"
            onClick={() => loadOrders(false)}
            disabled={isRefreshing}
            title="Sincronizar pedidos en tiempo real"
          >
            <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
            <span>Actualizar</span>
          </button>

          {/* Botón Exportar Excel */}
          <button
            type="button"
            className="btn"
            onClick={handleExportExcel}
            title="Exportar pedidos actuales a hoja de cálculo Excel"
          >
            <Download size={16} />
            <span>Exportar Excel</span>
          </button>

          {/* Botón Nuevo Pedido */}
          <Button
            variant="primary"
            onClick={() => setIsCreateModalOpen(true)}
            style={{ gap: 6 }}
          >
            <Plus size={16} />
            <span>Nuevo pedido</span>
          </Button>
        </div>
      </div>

      {/* 8.2. TARJETAS KPI (REFERENCIA 2) */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        {/* Total Pedidos */}
        <Card>
          <div className="kpi-label">Total pedidos</div>
          <div className="kpi-value">{kpis.total}</div>
          <div className="muted" style={{ fontSize: 12 }}>Órdenes registradas en el sistema</div>
        </Card>

        {/* Pendientes */}
        <Card>
          <div className="kpi-label">Pendientes</div>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>
            {kpis.pending}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>En preparación o pago por verificar</div>
        </Card>

        {/* Completados */}
        <Card>
          <div className="kpi-label">Completados</div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>
            {kpis.completed}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Despachados y cobrados exitosamente</div>
        </Card>

        {/* Facturación Activa */}
        <Card>
          <div className="kpi-label">Facturación activa</div>
          <div className="kpi-value" style={{ color: 'var(--brand-700)', fontSize: 21 }}>
            {formatUSD(kpis.billingUSD)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            ≈ {formatVES(kpis.billingVES)} (BCV)
          </div>
        </Card>
      </div>

      {/* 8.3. BARRA DE FILTROS (REFERENCIA 2) */}
      <Card style={{ padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Controls group */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', flex: 1 }}>
            {/* Buscador */}
            <div style={{ position: 'relative', width: 240 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--muted)' }} />
              <input
                type="text"
                className="input"
                placeholder="Buscar pedido, cliente..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 32, height: 38, fontSize: 12.5 }}
              />
            </div>

            {/* Estado de Entrega */}
            <select
              className="input"
              value={deliveryStatusFilter}
              onChange={e => setDeliveryStatusFilter(e.target.value)}
              style={{ width: 170, height: 38, fontSize: 12.5 }}
            >
              <option value="TODOS">Entrega: Todos</option>
              <option value="RECIBIDO">Recibido</option>
              <option value="PREPARADO">Preparado</option>
              <option value="LISTO_PARA_ENTREGAR">Listo para entregar</option>
              <option value="EN_CAMINO">En camino</option>
              <option value="ENTREGADO">Entregado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>

            {/* Estado del Pago */}
            <select
              className="input"
              value={paymentStatusFilter}
              onChange={e => setPaymentStatusFilter(e.target.value)}
              style={{ width: 160, height: 38, fontSize: 12.5 }}
            >
              <option value="TODOS">Pago: Todos</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="PAGADO">Pagado</option>
              <option value="REEMBOLSADO">Reembolsado</option>
            </select>

            {/* Método de Entrega */}
            <select
              className="input"
              value={deliveryMethodFilter}
              onChange={e => setDeliveryMethodFilter(e.target.value)}
              style={{ width: 160, height: 38, fontSize: 12.5 }}
            >
              <option value="TODOS">Método: Todos</option>
              <option value="RETIRO">Retiro en Tienda</option>
              <option value="DOMICILIO">Entrega a Domicilio</option>
            </select>

            {/* Filtro Fecha */}
            <select
              className="input"
              value={dateFilter}
              onChange={e => {
                setDateFilter(e.target.value);
                setCustomDate('');
              }}
              style={{ width: 140, height: 38, fontSize: 12.5 }}
            >
              <option value="TODOS">Fecha: Todas</option>
              <option value="HOY">Hoy</option>
              <option value="7_DIAS">Últimos 7 días</option>
              <option value="30_DIAS">Últimos 30 días</option>
            </select>

            {/* Fecha específica */}
            <input
              type="date"
              className="input"
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
              style={{ width: 145, height: 38, fontSize: 12.5 }}
              title="Filtrar por fecha específica"
            />

            {(searchTerm || deliveryStatusFilter !== 'TODOS' || paymentStatusFilter !== 'TODOS' || deliveryMethodFilter !== 'TODOS' || dateFilter !== 'TODOS' || customDate) && (
              <button
                type="button"
                onClick={clearFilters}
                className="btn ghost"
                style={{ height: 38, padding: '0 8px', fontSize: 12, color: 'var(--brand-700)' }}
              >
                <RotateCcw size={14} />
                <span>Limpiar</span>
              </button>
            )}
          </div>

          {/* Right Toolbar Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Notification Sound Toggle */}
            <button
              type="button"
              className="btn"
              onClick={toggleSound}
              title={soundEnabled ? 'Silenciar alerta de nuevos pedidos' : 'Activar sonido de nuevos pedidos'}
              style={{ height: 38, padding: '0 10px' }}
            >
              {soundEnabled ? (
                <Volume2 size={16} style={{ color: 'var(--brand-500)' }} />
              ) : (
                <VolumeX size={16} style={{ color: 'var(--muted)' }} />
              )}
            </button>

            {/* View Mode Toggle: Table / Kanban */}
            <div style={{ display: 'flex', background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 2 }}>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                style={{
                  padding: '6px 10px',
                  border: 'none',
                  borderRadius: 4,
                  background: viewMode === 'table' ? 'var(--surface)' : 'transparent',
                  color: viewMode === 'table' ? 'var(--brand-700)' : 'var(--muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontWeight: 600,
                  fontSize: 12,
                  boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                <TableIcon size={14} />
                <span>Tabla</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                style={{
                  padding: '6px 10px',
                  border: 'none',
                  borderRadius: 4,
                  background: viewMode === 'kanban' ? 'var(--surface)' : 'transparent',
                  color: viewMode === 'kanban' ? 'var(--brand-700)' : 'var(--muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontWeight: 600,
                  fontSize: 12,
                  boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                <Kanban size={14} />
                <span>Kanban</span>
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
              {filteredOrders.length} {filteredOrders.length === 1 ? 'resultado' : 'resultados'}
            </div>
          </div>
        </div>
      </Card>

      {/* 8.4. VISTA DE TABLA (REFERENCIA 2) */}
      {viewMode === 'table' ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Pedido N.º</th>
                  <th>Cliente / Contacto</th>
                  <th>Método de entrega</th>
                  <th>Método de pago</th>
                  <th className="num">Total (moneda)</th>
                  <th>Tiempo / Inicio</th>
                  <th style={{ width: 170 }}>Estado de la entrega</th>
                  <th style={{ width: 140 }}>Estado del pago</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Detalles</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
                      Cargando órdenes del sistema...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 0 }}>
                      <EmptyState
                        title="No hay pedidos para mostrar"
                        description="Prueba cambiando los filtros seleccionados o realiza un pedido desde la tienda online."
                      />
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(order => {
                    const orderDate = new Date(order.created_at);
                    const formattedDate = orderDate.toLocaleDateString('es-VE');
                    const formattedTime = orderDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });

                    return (
                      <tr key={order.id}>
                        {/* 1. Pedido N.º */}
                        <td>
                          <b style={{ color: 'var(--brand-700)', fontSize: 13 }}>{order.order_number}</b>
                          {order.branch_name && (
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{order.branch_name}</div>
                          )}
                        </td>

                        {/* 2. Cliente / Contacto */}
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{order.customer_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {order.customer_phone || order.customer_email || 'Sin contacto'}
                          </div>
                        </td>

                        {/* 3. Método de Entrega */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                            {order.delivery_method === 'DOMICILIO' ? (
                              <>
                                <Truck size={14} style={{ color: 'var(--brand-600)' }} />
                                <span>Domicilio</span>
                              </>
                            ) : (
                              <>
                                <Store size={14} style={{ color: 'var(--success)' }} />
                                <span>Retiro en Tienda</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* 4. Método de Pago */}
                        <td>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>
                            {order.payment_method.replace('_', ' ')}
                          </div>
                          {order.payment_reference && (
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                              Ref: {order.payment_reference}
                            </div>
                          )}
                        </td>

                        {/* 5. Total (Moneda) */}
                        <td className="num">
                          <b style={{ fontSize: 14 }}>{formatUSD(order.total_usd)}</b>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {formatVES(order.total_ves)}
                          </div>
                        </td>

                        {/* 6. Tiempo / Inicio */}
                        <td>
                          <div style={{ fontSize: 12 }}>{formattedDate}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{formattedTime}</div>
                        </td>

                        {/* 7. Estado de la Entrega (Selector de Transiciones) */}
                        <td>
                          <select
                            className="input"
                            value={order.delivery_status}
                            disabled={order.delivery_status === 'CANCELADO'}
                            onChange={e => handleUpdateDeliveryStatus(order.id, e.target.value as DeliveryStatus)}
                            style={{
                              height: 32,
                              padding: '0 8px',
                              fontSize: 11.5,
                              fontWeight: 700,
                              borderRadius: 6,
                              borderColor: 'var(--border)'
                            }}
                          >
                            <option value="RECIBIDO">Recibido</option>
                            <option value="PREPARADO">Preparado</option>
                            <option value="LISTO_PARA_ENTREGAR">Listo para entregar</option>
                            <option value="EN_CAMINO">En camino</option>
                            <option value="ENTREGADO">Entregado</option>
                            <option value="CANCELADO">Cancelado</option>
                          </select>
                        </td>

                        {/* 8. Estado del Pago */}
                        <td>
                          <select
                            className="input"
                            value={order.payment_status}
                            onChange={e => handleUpdatePaymentStatus(order.id, e.target.value as PaymentStatus)}
                            style={{
                              height: 32,
                              padding: '0 8px',
                              fontSize: 11.5,
                              fontWeight: 700,
                              borderRadius: 6,
                              borderColor: 'var(--border)'
                            }}
                          >
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="PAGADO">Pagado</option>
                            <option value="REEMBOLSADO">Reembolsado</option>
                          </select>
                        </td>

                        {/* 9. Botón Detalles */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => setSelectedOrder(order)}
                            style={{
                              height: 32,
                              padding: '0 10px',
                              fontSize: 11.5,
                              fontWeight: 700,
                              background: 'var(--brand-50)',
                              color: 'var(--brand-700)',
                              border: '1px solid var(--brand-100)'
                            }}
                          >
                            DETALLES
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* 9. VISTA KANBAN (REFERENCIA 2) */
        <div className="kanban-board">
          {(
            [
              { key: 'RECIBIDO', label: 'Recibido', tone: 'brand' },
              { key: 'PREPARADO', label: 'Preparado', tone: 'warning' },
              { key: 'LISTO_PARA_ENTREGAR', label: 'Listo para entregar', tone: 'warning' },
              { key: 'EN_CAMINO', label: 'En camino', tone: 'brand' },
              { key: 'ENTREGADO', label: 'Entregado', tone: 'success' },
              { key: 'CANCELADO', label: 'Cancelado', tone: 'danger' }
            ] as const
          ).map(col => {
            const colOrders = filteredOrders.filter(o => o.delivery_status === col.key);

            return (
              <div key={col.key} className="kanban-col">
                <div className="kanban-col-head">
                  <div className="kanban-col-title">
                    <span>{col.label}</span>
                    <Badge tone={col.tone}>{colOrders.length}</Badge>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto' }}>
                  {colOrders.length === 0 ? (
                    <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                      Sin pedidos en este estado
                    </div>
                  ) : (
                    colOrders.map(order => (
                      <div key={order.id} className="kanban-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <b style={{ color: 'var(--brand-700)', fontSize: 13 }}>{order.order_number}</b>
                          <Badge tone={getPaymentStatusTone(order.payment_status)}>
                            {order.payment_status}
                          </Badge>
                        </div>

                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{order.customer_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {new Date(order.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })} · {order.delivery_method === 'DOMICILIO' ? 'Delivery' : 'Retiro'}
                          </div>
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--text)', background: 'var(--canvas)', padding: '6px 8px', borderRadius: 4 }}>
                          {order.items?.length || 0} producto(s) · {order.items?.[0]?.name ? `${order.items[0].name.slice(0, 24)}...` : 'Artículos'}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                          <div>
                            <b style={{ fontSize: 13 }}>{formatUSD(order.total_usd)}</b>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{formatVES(order.total_ves)}</div>
                          </div>

                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => setSelectedOrder(order)}
                              style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                            >
                              Detalle
                            </button>

                            {col.key === 'RECIBIDO' && (
                              <button
                                type="button"
                                className="btn primary"
                                onClick={() => handleUpdateDeliveryStatus(order.id, 'PREPARADO')}
                                style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                              >
                                Preparar
                              </button>
                            )}
                            {col.key === 'PREPARADO' && (
                              <button
                                type="button"
                                className="btn primary"
                                onClick={() => handleUpdateDeliveryStatus(order.id, 'LISTO_PARA_ENTREGAR')}
                                style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                              >
                                Listo
                              </button>
                            )}
                            {col.key === 'LISTO_PARA_ENTREGAR' && (
                              <button
                                type="button"
                                className="btn primary"
                                onClick={() => handleUpdateDeliveryStatus(order.id, order.delivery_method === 'DOMICILIO' ? 'EN_CAMINO' : 'ENTREGADO')}
                                style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                              >
                                Despachar
                              </button>
                            )}
                            {col.key === 'EN_CAMINO' && (
                              <button
                                type="button"
                                className="btn primary"
                                onClick={() => handleUpdateDeliveryStatus(order.id, 'ENTREGADO')}
                                style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                              >
                                Entregar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 8.7. MODAL DE DETALLE DEL PEDIDO */}
      {selectedOrder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => setSelectedOrder(null)}
        >
          <div
            style={{
              width: 'min(780px, 100%)',
              maxHeight: '90vh',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              overflow: 'hidden'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--sidebar)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <ClipboardList size={22} style={{ color: 'var(--brand-500)' }} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>Detalle del Pedido #{selectedOrder.order_number}</h3>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    Creado el {new Date(selectedOrder.created_at).toLocaleString('es-VE')}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge tone={getDeliveryStatusTone(selectedOrder.delivery_status)}>
                  {selectedOrder.delivery_status}
                </Badge>
                <Badge tone={getPaymentStatusTone(selectedOrder.payment_status)}>
                  {selectedOrder.payment_status}
                </Badge>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)', marginLeft: 8 }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Información del Cliente & Entrega */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {/* Datos del Cliente */}
                <div style={{ background: 'var(--canvas)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <User size={15} style={{ color: 'var(--brand-600)' }} />
                    <span>Información del Cliente</span>
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    <div><b>Nombre:</b> {selectedOrder.customer_name}</div>
                    <div><b>Teléfono:</b> {selectedOrder.customer_phone || 'No registrado'}</div>
                    <div><b>Cédula/RIF:</b> {selectedOrder.customer_doc || 'No registrado'}</div>
                    <div><b>Email:</b> {selectedOrder.customer_email || 'No registrado'}</div>
                  </div>
                </div>

                {/* Logística de Entrega */}
                <div style={{ background: 'var(--canvas)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Truck size={15} style={{ color: 'var(--brand-600)' }} />
                    <span>Datos de Entrega</span>
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    <div><b>Método:</b> {selectedOrder.delivery_method === 'DOMICILIO' ? 'Entrega a Domicilio' : 'Retiro en Tienda'}</div>
                    <div><b>Dirección:</b> {selectedOrder.delivery_address || 'Sede Principal'}</div>
                    {selectedOrder.delivery_instructions && (
                      <div><b>Instrucciones:</b> {selectedOrder.delivery_instructions}</div>
                    )}
                    {selectedOrder.completed_at && (
                      <div style={{ color: 'var(--success)', fontWeight: 600 }}>
                        Entregado: {new Date(selectedOrder.completed_at).toLocaleString('es-VE')}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Productos Solicitados */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Package size={16} style={{ color: 'var(--brand-600)' }} />
                  <span>Productos del Pedido</span>
                </div>
                <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <table className="table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Producto</th>
                        <th className="num">Cantidad</th>
                        <th className="num">P. Unitario USD</th>
                        <th className="num">Subtotal USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedOrder.items || []).map((it, idx) => (
                        <tr key={idx}>
                          <td><span className="muted">{it.sku}</span></td>
                          <td><b>{it.name}</b></td>
                          <td className="num">{it.quantity}</td>
                          <td className="num">{formatUSD(it.unit_price_usd)}</td>
                          <td className="num"><b>{formatUSD(it.total_usd)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--sidebar)' }}>
                        <td colSpan={3}><b>Totales bimonetarios:</b></td>
                        <td className="num" colSpan={2}>
                          <div style={{ fontSize: 15, fontWeight: 800 }}>{formatUSD(selectedOrder.total_usd)}</div>
                          <div style={{ fontSize: 12, color: 'var(--brand-700)', fontWeight: 700 }}>
                            {formatVES(selectedOrder.total_ves)} (Tasa: Bs. {Number(selectedOrder.exchange_rate).toFixed(2)})
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Información de Pago y Auditoría */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                {/* Pago */}
                <div style={{ background: 'var(--canvas)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CreditCard size={15} style={{ color: 'var(--brand-600)' }} />
                    <span>Datos Financieros</span>
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                    <div><b>Método:</b> {selectedOrder.payment_method.replace('_', ' ')}</div>
                    <div><b>Estado:</b> <Badge tone={getPaymentStatusTone(selectedOrder.payment_status)}>{selectedOrder.payment_status}</Badge></div>
                    {selectedOrder.payment_reference && (
                      <div><b>Referencia:</b> <code>{selectedOrder.payment_reference}</code></div>
                    )}
                    <div><b>Moneda base:</b> {selectedOrder.currency}</div>
                  </div>
                </div>

                {/* Historial de Actividad (Auditoría) */}
                <div style={{ background: 'var(--canvas)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={15} style={{ color: 'var(--brand-600)' }} />
                    <span>Historial de Actividad</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
                    {(selectedOrder.activity_history || []).map((log, lIdx) => (
                      <div key={lIdx} style={{ fontSize: 11, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                        <div style={{ fontWeight: 600 }}>{log.description}</div>
                        <div className="muted">{new Date(log.timestamp).toLocaleString('es-VE')} · {log.user}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border)',
                background: 'var(--sidebar)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10
              }}
            >
              {/* Cambios rápidos de estado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Cambiar estado:</span>
                <select
                  className="input"
                  value={selectedOrder.delivery_status}
                  disabled={selectedOrder.delivery_status === 'CANCELADO'}
                  onChange={e => handleUpdateDeliveryStatus(selectedOrder.id, e.target.value as DeliveryStatus)}
                  style={{ height: 34, fontSize: 12 }}
                >
                  <option value="RECIBIDO">Recibido</option>
                  <option value="PREPARADO">Preparado</option>
                  <option value="LISTO_PARA_ENTREGAR">Listo para entregar</option>
                  <option value="EN_CAMINO">En camino</option>
                  <option value="ENTREGADO">Entregado</option>
                  <option value="CANCELADO">Cancelado</option>
                </select>

                <select
                  className="input"
                  value={selectedOrder.payment_status}
                  onChange={e => handleUpdatePaymentStatus(selectedOrder.id, e.target.value as PaymentStatus)}
                  style={{ height: 34, fontSize: 12 }}
                >
                  <option value="PENDIENTE">Pago: Pendiente</option>
                  <option value="PAGADO">Pago: Pagado</option>
                  <option value="REEMBOLSADO">Pago: Reembolsado</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.print()}
                  style={{ gap: 6 }}
                >
                  <Printer size={15} />
                  <span>Imprimir</span>
                </button>
                <Button variant="secondary" onClick={() => setSelectedOrder(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NUEVO PEDIDO MANUAL */}
      {isCreateModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            style={{
              width: 'min(640px, 100%)',
              maxHeight: '90vh',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              overflow: 'hidden'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>Crear Nuevo Pedido Administrativo</h3>
              <button type="button" onClick={() => setIsCreateModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveNewOrder} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-grid">
                  <div className="field">
                    <label>Nombre del Cliente *</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej. Pedro Pérez"
                      value={newOrderCustomer}
                      onChange={e => setNewOrderCustomer(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Teléfono</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej. 0412-1112233"
                      value={newOrderPhone}
                      onChange={e => setNewOrderPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label>Método de Entrega</label>
                    <select className="input" value={newOrderMethod} onChange={e => setNewOrderMethod(e.target.value as DeliveryMethod)}>
                      <option value="RETIRO">Retiro en Tienda</option>
                      <option value="DOMICILIO">Entrega a Domicilio</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Método de Pago</label>
                    <select className="input" value={newOrderPayment} onChange={e => setNewOrderPayment(e.target.value as PaymentMethod)}>
                      <option value="PAGO_MOVIL">Pago Móvil</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="EFECTIVO_USD">Efectivo USD</option>
                      <option value="ZELLE">Zelle</option>
                    </select>
                  </div>
                </div>

                {newOrderMethod === 'DOMICILIO' && (
                  <div className="field">
                    <label>Dirección de Entrega</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Dirección exacta..."
                      value={newOrderAddress}
                      onChange={e => setNewOrderAddress(e.target.value)}
                    />
                  </div>
                )}

                {/* Agregar productos */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>Agregar Ítems al Pedido</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      className="input"
                      value={selectedProductSku}
                      onChange={e => setSelectedProductSku(e.target.value)}
                      style={{ flex: 1 }}
                    >
                      <option value="">Seleccione un producto...</option>
                      {availableProducts.map(p => (
                        <option key={p.sku} value={p.sku}>
                          {p.name} ({p.sku}) — ${Number(p.price_usd).toFixed(2)} [Stock: {p.stock}]
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      className="input"
                      min={1}
                      value={selectedQty}
                      onChange={e => setSelectedQty(Math.max(1, parseInt(e.target.value) || 1))}
                      style={{ width: 70 }}
                    />
                    <button type="button" className="btn" onClick={handleAddItemToNewOrder}>
                      <Plus size={16} />
                      <span>Agregar</span>
                    </button>
                  </div>

                  {newOrderItems.length > 0 && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {newOrderItems.map(it => (
                        <div key={it.sku} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--canvas)', padding: 8, borderRadius: 6, fontSize: 12 }}>
                          <span><b>{it.quantity}x</b> {it.name}</span>
                          <b>${(it.quantity * it.unit_price_usd).toFixed(2)}</b>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--sidebar)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn" onClick={() => setIsCreateModalOpen(false)}>Cancelar</button>
                <Button variant="primary" type="submit" disabled={isSubmittingNew}>
                  {isSubmittingNew ? 'Guardando...' : 'Crear Pedido'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
