import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ShoppingCart,
  SlidersHorizontal,
  X,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  Clock,
  Truck,
  Store,
  CreditCard,
  Banknote,
  DollarSign,
  ArrowRight,
  Package,
  Layers,
  Sparkles,
  Phone,
  MapPin,
  FileText,
  ChevronRight,
  AlertCircle,
  Eye,
  Check,
  Building,
  RotateCcw
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import {
  getActiveExchangeRate,
  convertUSDtoVES,
  convertVEStoUSD,
  formatUSD,
  formatVES,
  getDualPrice
} from '../../../lib/currency';
import { getBusinessProfile } from '../../../lib/businessProfile';
import {
  fetchProductsFromSupabase,
  fetchPublicConfigFromApi,
  createOrderInApi,
  fetchOrdersFromApi,
  DbProduct
} from '../../../lib/supabase/db';
import {
  Currency,
  Product,
  CartItem,
  DeliveryMethod,
  PaymentMethod,
  PublicBusinessConfig
} from '../../../types/domain';

export function ShopPage() {
  const navigate = useNavigate();

  // --- STATE: CATALOG & CONFIG ---
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [businessConfig, setBusinessConfig] = useState<PublicBusinessConfig>(() => {
    const profile = getBusinessProfile();
    return {
      businessName: profile.businessName,
      rif: profile.rif,
      phone: profile.phone,
      email: profile.email,
      address: profile.address,
      slogan: profile.slogan || 'Todo a tu mano',
      logo: profile.logo,
      favicon: profile.favicon,
      bcvRate: getActiveExchangeRate(),
      bcvRateDate: 'Actual',
      branches: [
        { id: 'suc-01', name: 'Sede Principal - Despacho Central', address: profile.address }
      ]
    };
  });

  useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      const profile = e.detail;
      if (profile) {
        setBusinessConfig(prev => ({
          ...prev,
          businessName: profile.businessName,
          rif: profile.rif,
          phone: profile.phone,
          email: profile.email,
          address: profile.address,
          logo: profile.logo,
          favicon: profile.favicon
        }));
      }
    };
    window.addEventListener('frenyer:business-profile-updated', handleProfileUpdate);
    return () => window.removeEventListener('frenyer:business-profile-updated', handleProfileUpdate);
  }, []);

  // --- STATE: BIMONETARY CURRENCY & RATE ---
  const [activeCurrency, setActiveCurrency] = useState<Currency>('USD');
  const [bcvRate, setBcvRate] = useState<number>(() => getActiveExchangeRate());
  const [rateDate, setRateDate] = useState<string>('Hoy');

  // --- STATE: SEARCH & FILTERS ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedBrand, setSelectedBrand] = useState<string>('Todas');
  const [onlyInStock, setOnlyInStock] = useState<boolean>(false);
  const [minPriceInput, setMinPriceInput] = useState<string>('');
  const [maxPriceInput, setMaxPriceInput] = useState<string>('');
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // --- STATE: SHOPPING CART ---
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('frenyer_shop_cart');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  // --- STATE: PRODUCT QUICK VIEW MODAL ---
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  // --- STATE: CHECKOUT MODAL & WIZARD ---
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3 | 4>(1);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);

  // Checkout Form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerDoc, setCustomerDoc] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('RETIRO');
  const [selectedBranchId, setSelectedBranchId] = useState('suc-01');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PAGO_MOVIL');
  const [paymentReference, setPaymentReference] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  // --- STATE: ORDER TRACKER ("MIS PEDIDOS") ---
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [trackerQuery, setTrackerQuery] = useState('');
  const [trackedOrders, setTrackedOrders] = useState<any[]>([]);
  const [isSearchingOrders, setIsSearchingOrders] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Sync cart to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('frenyer_shop_cart', JSON.stringify(cart));
    }
  }, [cart]);

  // Load catalog & public config on mount
  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      try {
        const [dbProds, cfg, bcvRes] = await Promise.all([
          fetchProductsFromSupabase(),
          fetchPublicConfigFromApi(),
          fetch('/api/bcv/rates').then(r => r.json()).catch(() => null)
        ]);

        if (bcvRes) {
          const rateVal = Number(bcvRes.appliedRate) || Number(bcvRes.usdRate) || Number(bcvRes.currentRate);
          if (rateVal && rateVal > 0) {
            setBcvRate(rateVal);
          }
          if (bcvRes.valueDate) {
            setRateDate(bcvRes.valueDate);
          }
        }

        if (cfg) {
          setBusinessConfig(prev => ({
            ...prev,
            ...cfg,
            bcvRate: cfg.bcvRate || bcvRate
          }));
        }

        const mapped: Product[] = (dbProds || []).map((p: DbProduct) => ({
          id: p.id || p.sku,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category: p.category || 'General',
          brand: (p as any).brand || businessConfig.businessName,
          description: (p as any).description || 'Producto disponible para despacho y facturación inmediata.',
          priceUsd: Number(p.price_usd) || 0,
          costUsd: Number(p.cost_usd) || 0,
          stock: Number(p.stock) || 0,
          minStock: Number(p.min_stock) || 0,
          status: (Number(p.stock) || 0) <= 0 ? 'Agotado' : (Number(p.stock) || 0) <= (Number(p.min_stock) || 3) ? 'Bajo stock' : 'Activo',
          image_url: p.image_url
        }));

        setProducts(mapped);
      } catch (err) {
        console.warn('Error cargando catálogo de tienda:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initData();
  }, []);

  // --- GLOBAL SHORTCUT: Ctrl + A + S SEQUENCE TO ADMIN DASHBOARD ---
  // Must work as a key sequence (not strictly simultaneous chord)
  // Ignored inside inputs, textareas, contenteditable elements
  useEffect(() => {
    const keyHistory: string[] = [];
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or editable element
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        (activeEl && activeEl.getAttribute('contenteditable') === 'true');

      if (isInput) {
        return;
      }

      const now = Date.now();
      // Reset sequence if more than 2 seconds elapsed between keystrokes
      if (now - lastKeyTime > 2000) {
        keyHistory.length = 0;
      }
      lastKeyTime = now;

      const keyName = e.key.toLowerCase();
      keyHistory.push(keyName);
      if (keyHistory.length > 5) {
        keyHistory.shift();
      }

      // Check if sequence contains 'control' followed by 'a' and 's'
      // Or if Ctrl is held down while 'a' and 's' are pressed in sequence
      const isCtrlActive = e.ctrlKey || keyHistory.includes('control');
      const lastTwo = keyHistory.slice(-2);
      const isSequenceAS = lastTwo[0] === 'a' && lastTwo[1] === 's';

      if (isCtrlActive && isSequenceAS) {
        e.preventDefault();
        keyHistory.length = 0;
        // Immediate redirection to admin control of orders
        navigate('/ventas-flash/pedidos');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Dynamic Categories and Brands
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.brand) set.add(p.brand);
    });
    return Array.from(set).sort();
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Global Search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(query);
        const matchSku = p.sku.toLowerCase().includes(query);
        const matchBarcode = p.barcode ? p.barcode.toLowerCase().includes(query) : false;
        const matchCategory = p.category ? p.category.toLowerCase().includes(query) : false;
        const matchBrand = p.brand ? p.brand.toLowerCase().includes(query) : false;
        const matchDesc = p.description ? p.description.toLowerCase().includes(query) : false;
        if (!matchName && !matchSku && !matchBarcode && !matchCategory && !matchBrand && !matchDesc) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'Todas' && p.category !== selectedCategory) {
        return false;
      }

      // Brand filter
      if (selectedBrand !== 'Todas' && p.brand !== selectedBrand) {
        return false;
      }

      // Stock filter
      if (onlyInStock && p.stock <= 0) {
        return false;
      }

      // Price range filter (compared in selected currency)
      const currentPriceInActiveCurrency =
        activeCurrency === 'USD' ? p.priceUsd : convertUSDtoVES(p.priceUsd, bcvRate);

      const minVal = parseFloat(minPriceInput);
      if (!isNaN(minVal) && minVal > 0 && currentPriceInActiveCurrency < minVal) {
        return false;
      }

      const maxVal = parseFloat(maxPriceInput);
      if (!isNaN(maxVal) && maxVal > 0 && currentPriceInActiveCurrency > maxVal) {
        return false;
      }

      return true;
    });
  }, [products, searchTerm, selectedCategory, selectedBrand, onlyInStock, minPriceInput, maxPriceInput, activeCurrency, bcvRate]);

  // Cart Counts & Totals
  const totalCartUnits = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity, 0);
  }, [cart]);

  const totalCartUSD = useMemo(() => {
    const raw = cart.reduce((acc, item) => acc + item.product.priceUsd * item.quantity, 0);
    return Math.round(raw * 100) / 100;
  }, [cart]);

  const totalCartVES = useMemo(() => {
    return convertUSDtoVES(totalCartUSD, bcvRate);
  }, [totalCartUSD, bcvRate]);

  // Cart Actions
  const addToCart = (product: Product, quantityToAdd = 1) => {
    if (product.stock <= 0) {
      showToast('Este producto no tiene existencias disponibles.', 'info');
      return;
    }

    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.product.sku === product.sku);
      if (existingIdx >= 0) {
        const currentQty = prev[existingIdx].quantity;
        const nextQty = Math.min(product.stock, currentQty + quantityToAdd);
        if (nextQty === currentQty) {
          showToast(`Límite de stock alcanzado (${product.stock} unidades).`, 'info');
          return prev;
        }
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], quantity: nextQty };
        showToast(`Cantidad actualizada: ${product.name}`);
        return updated;
      } else {
        const initialQty = Math.min(product.stock, quantityToAdd);
        showToast(`Agregado al carrito: ${product.name}`);
        return [...prev, { product, quantity: initialQty }];
      }
    });
  };

  const updateCartQuantity = (sku: string, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.product.sku === sku) {
            const nextQty = item.quantity + delta;
            if (nextQty <= 0) return null;
            if (nextQty > item.product.stock) {
              showToast(`Límite de inventario: ${item.product.stock} unidades.`, 'info');
              return item;
            }
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (sku: string) => {
    setCart(prev => prev.filter(item => item.product.sku !== sku));
    showToast('Producto eliminado del carrito.');
  };

  const clearCart = () => {
    setCart([]);
    showToast('Carrito vaciado.');
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('Todas');
    setSelectedBrand('Todas');
    setOnlyInStock(false);
    setMinPriceInput('');
    setMaxPriceInput('');
  };

  // Checkout submission
  const handleConfirmOrder = async () => {
    if (!customerName.trim()) {
      showToast('Por favor ingrese su nombre y apellido.', 'info');
      setCheckoutStep(1);
      return;
    }
    if (!customerPhone.trim()) {
      showToast('Por favor ingrese un número de teléfono de contacto.', 'info');
      setCheckoutStep(1);
      return;
    }
    if (deliveryMethod === 'DOMICILIO' && !deliveryAddress.trim()) {
      showToast('Por favor ingrese la dirección completa de entrega.', 'info');
      setCheckoutStep(2);
      return;
    }

    setIsSubmittingOrder(true);

    try {
      const selectedBranch = businessConfig.branches.find(b => b.id === selectedBranchId);
      const branchName = selectedBranch ? selectedBranch.name : 'Sede Principal';

      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_email: customerEmail.trim() || undefined,
        customer_doc: customerDoc.trim() || undefined,
        delivery_method: deliveryMethod,
        delivery_address: deliveryMethod === 'DOMICILIO' ? deliveryAddress.trim() : `Retiro en ${branchName}`,
        delivery_instructions: deliveryInstructions.trim() || undefined,
        payment_method: paymentMethod,
        payment_status: paymentMethod === 'EFECTIVO_USD' ? 'PENDIENTE' : paymentReference.trim() ? 'PAGADO' : 'PENDIENTE',
        payment_reference: paymentReference.trim() || null,
        currency: activeCurrency,
        exchange_rate: bcvRate,
        branch_id: selectedBranchId,
        branch_name: branchName,
        notes: orderNotes.trim() || undefined,
        items: cart.map(item => ({
          product_id: item.product.id,
          sku: item.product.sku,
          name: item.product.name,
          quantity: item.quantity,
          unit_price_usd: item.product.priceUsd
        }))
      };

      const result = await createOrderInApi(payload);

      if (result.success && result.data) {
        setCompletedOrder(result.data);
        setCheckoutStep(4);
        clearCart();
        showToast(`¡Pedido ${result.data.order_number} confirmado exitosamente!`);
      } else {
        showToast(result.error || 'No se pudo procesar el pedido. Intente nuevamente.', 'info');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error de comunicación con el servidor.', 'info');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Order Tracker lookup
  const handleSearchTrackedOrders = async () => {
    if (!trackerQuery.trim()) return;
    setIsSearchingOrders(true);
    try {
      const allOrders = await fetchOrdersFromApi();
      const q = trackerQuery.toLowerCase().trim();
      const matched = allOrders.filter((o: any) => {
        const matchNum = o.order_number?.toLowerCase().includes(q);
        const matchPhone = o.customer_phone?.toLowerCase().includes(q);
        const matchDoc = o.customer_doc?.toLowerCase().includes(q);
        const matchName = o.customer_name?.toLowerCase().includes(q);
        return matchNum || matchPhone || matchDoc || matchName;
      });
      setTrackedOrders(matched);
    } catch {
      setTrackedOrders([]);
    } finally {
      setIsSearchingOrders(false);
    }
  };

  // Format currency helpers for active view
  const formatPrice = (usdAmount: number) => {
    if (activeCurrency === 'VES') {
      const ves = convertUSDtoVES(usdAmount, bcvRate);
      return {
        main: formatVES(ves),
        sub: formatUSD(usdAmount)
      };
    }
    const ves = convertUSDtoVES(usdAmount, bcvRate);
    return {
      main: formatUSD(usdAmount),
      sub: formatVES(ves)
    };
  };

  return (
    <div className="store-page">
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

      {/* 1. ENCABEZADO COMERCIAL (REFERENCIA 1) */}
      <header className="store-header-wrap">
        <div className="store-header-top">
          {/* A. Identidad del Negocio */}
          <div className="store-brand" onClick={() => clearFilters()} style={{ cursor: 'pointer' }}>
            <div className="store-brand-logo" style={{ overflow: 'hidden' }}>
              {businessConfig.logo ? (
                <img src={businessConfig.logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                businessConfig.businessName.charAt(0)
              )}
            </div>
            <div className="store-brand-info">
              <div className="store-brand-name">
                {businessConfig.businessName}
                <span>.</span>
              </div>
              <div className="store-brand-slogan">{businessConfig.slogan}</div>
              <div className="store-brand-branch">
                <Store size={10} />
                <span>Sede Principal</span>
              </div>
            </div>
          </div>

          {/* B. Buscador Global */}
          <div className="store-search-wrap">
            <Search size={18} className="store-search-icon" />
            <input
              type="text"
              className="store-search-input"
              placeholder="Buscar por nombre, código de barra o categoría..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: 12,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--muted)',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* C/D/E/F. Acciones de Encabezado */}
          <div className="store-header-actions">
            {/* D. Información Tasa BCV */}
            <div
              className="store-rate-badge"
              title={`Tasa oficial certificada del Banco Central de Venezuela (Fecha: ${rateDate})`}
            >
              <DollarSign size={14} style={{ color: 'var(--brand-500)' }} />
              <span>BCV: <b>Bs. {bcvRate.toFixed(2)}</b></span>
            </div>

            {/* E. Selector de Moneda */}
            <div className="store-currency-switch" title="Cambiar moneda de visualización">
              <button
                type="button"
                className={`store-currency-btn ${activeCurrency === 'USD' ? 'active' : ''}`}
                onClick={() => setActiveCurrency('USD')}
              >
                USD ($)
              </button>
              <button
                type="button"
                className={`store-currency-btn ${activeCurrency === 'VES' ? 'active' : ''}`}
                onClick={() => setActiveCurrency('VES')}
              >
                VES (Bs.)
              </button>
            </div>

            {/* Rastreador de Pedidos */}
            <button
              type="button"
              className="btn"
              onClick={() => setIsTrackerOpen(true)}
              title="Consultar estado de mis compras"
              style={{ height: 42, padding: '0 12px', fontSize: 12.5 }}
            >
              <FileText size={16} />
              <span>Mis Pedidos</span>
            </button>

            {/* F. Acceso al Carrito */}
            <button
              type="button"
              className="store-cart-trigger"
              onClick={() => setIsCartOpen(true)}
              aria-label="Abrir carrito de compras"
            >
              <ShoppingCart size={18} />
              <span>Carrito</span>
              {totalCartUnits > 0 && (
                <span className="store-cart-badge">{totalCartUnits}</span>
              )}
            </button>
          </div>
        </div>

        {/* C. Navegación por Categorías Comerciales (Sub-barra horizontal) */}
        <div className="store-category-bar">
          <div className="store-category-list">
            <button
              type="button"
              className={`store-category-chip ${selectedCategory === 'Todas' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('Todas')}
            >
              Todas las categorías
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`store-category-chip ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* 2. CATÁLOGO PRINCIPAL Y FILTROS LATERALES */}
      <div className="store-body">
        {/* Mobile Filter Toggle */}
        <div style={{ display: 'none' }} className="mobile-filter-bar">
          <button
            type="button"
            className="btn"
            onClick={() => setIsMobileFiltersOpen(true)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <SlidersHorizontal size={16} />
            <span>Filtros y Categorías</span>
          </button>
        </div>

        {/* 2.1. Panel Lateral de Filtros (Referencia 1) */}
        <aside className={`store-filters-sidebar ${isMobileFiltersOpen ? 'mobile-open' : ''}`}>
          {isMobileFiltersOpen && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Filtros</h3>
              <button type="button" onClick={() => setIsMobileFiltersOpen(false)} style={{ border: 'none', background: 'transparent' }}>
                <X size={20} />
              </button>
            </div>
          )}

          {/* Categoría */}
          <div className="store-filter-card">
            <div className="store-filter-title">
              <span>Categoría</span>
              <Layers size={14} style={{ color: 'var(--muted)' }} />
            </div>
            <div className="store-filter-options">
              <div
                className={`store-filter-label ${selectedCategory === 'Todas' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('Todas')}
              >
                <span>Todas</span>
                <span style={{ fontSize: 11 }}>({products.length})</span>
              </div>
              {categories.map(cat => {
                const count = products.filter(p => p.category === cat).length;
                return (
                  <div
                    key={cat}
                    className={`store-filter-label ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    <span>{cat}</span>
                    <span style={{ fontSize: 11 }}>({count})</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Marca / Fabricante */}
          {brands.length > 0 && (
            <div className="store-filter-card">
              <div className="store-filter-title">
                <span>Marca / Fabricante</span>
                <Package size={14} style={{ color: 'var(--muted)' }} />
              </div>
              <div className="store-filter-options">
                <div
                  className={`store-filter-label ${selectedBrand === 'Todas' ? 'active' : ''}`}
                  onClick={() => setSelectedBrand('Todas')}
                >
                  <span>Todas</span>
                  <span style={{ fontSize: 11 }}>({products.length})</span>
                </div>
                {brands.map(b => {
                  const count = products.filter(p => p.brand === b).length;
                  return (
                    <div
                      key={b}
                      className={`store-filter-label ${selectedBrand === b ? 'active' : ''}`}
                      onClick={() => setSelectedBrand(b)}
                    >
                      <span>{b}</span>
                      <span style={{ fontSize: 11 }}>({count})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Rango de Precios */}
          <div className="store-filter-card">
            <div className="store-filter-title">
              <span>Rango de Precio ({activeCurrency})</span>
              <DollarSign size={14} style={{ color: 'var(--muted)' }} />
            </div>
            <div className="store-price-inputs">
              <div className="field">
                <label style={{ fontSize: 11 }}>Mínimo</label>
                <input
                  type="number"
                  className="input"
                  placeholder="0.00"
                  value={minPriceInput}
                  onChange={e => setMinPriceInput(e.target.value)}
                  style={{ height: 36, fontSize: 12 }}
                />
              </div>
              <div className="field">
                <label style={{ fontSize: 11 }}>Máximo</label>
                <input
                  type="number"
                  className="input"
                  placeholder="Max"
                  value={maxPriceInput}
                  onChange={e => setMaxPriceInput(e.target.value)}
                  style={{ height: 36, fontSize: 12 }}
                />
              </div>
            </div>
          </div>

          {/* Disponibilidad */}
          <div className="store-filter-card">
            <div className="store-filter-title">
              <span>Disponibilidad</span>
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                cursor: 'pointer',
                color: varText()
              }}
            >
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={e => setOnlyInStock(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--brand-500)' }}
              />
              <span>Solo productos en stock</span>
            </label>
          </div>

          {/* Botón Limpiar Filtros */}
          <button
            type="button"
            className="btn"
            onClick={clearFilters}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <RotateCcw size={14} />
            <span>Limpiar todos los filtros</span>
          </button>
        </aside>

        {/* 2.2. Resultados del Catálogo (Grid de Productos) */}
        <main className="store-main-catalog">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 18
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Mostrando <b>{filteredProducts.length}</b> productos disponibles
              {selectedCategory !== 'Todas' && ` en "${selectedCategory}"`}
            </div>

            {(searchTerm || selectedCategory !== 'Todas' || selectedBrand !== 'Todas' || onlyInStock || minPriceInput || maxPriceInput) && (
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--brand-700)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <X size={14} />
                Quitar filtros
              </button>
            )}
          </div>

          {isLoading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
              Cargando catálogo bimonetario...
            </div>
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              title="No se encontraron productos"
              description="Intente modificar los términos de búsqueda o los filtros de categoría y precio."
            />
          ) : (
            <div className="store-catalog-grid">
              {filteredProducts.map(product => {
                const prices = formatPrice(product.priceUsd);
                const isOutOfStock = product.stock <= 0;

                return (
                  <div key={product.sku} className="store-product-card">
                    {/* Thumbnail */}
                    <div className="store-product-thumb">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} loading="lazy" />
                      ) : (
                        <Package size={48} style={{ color: 'var(--border)' }} />
                      )}
                      <div style={{ position: 'absolute', top: 10, left: 10 }}>
                        <Badge tone={isOutOfStock ? 'danger' : product.stock <= 3 ? 'warning' : 'success'}>
                          {isOutOfStock ? 'Agotado' : `${product.stock} en stock`}
                        </Badge>
                      </div>
                      <button
                        type="button"
                        onClick={() => setQuickViewProduct(product)}
                        title="Vista rápida del producto"
                        style={{
                          position: 'absolute',
                          top: 10,
                          right: 10,
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: 'rgba(255,255,255,0.9)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: 'var(--text)'
                        }}
                      >
                        <Eye size={15} />
                      </button>
                    </div>

                    {/* Body */}
                    <div className="store-product-body">
                      <div className="store-product-meta">
                        <span style={{ color: 'var(--brand-700)', fontWeight: 600 }}>{product.category}</span>
                        <span className="muted">{product.sku}</span>
                      </div>

                      <h4 className="store-product-title" title={product.name}>
                        {product.name}
                      </h4>

                      <p className="store-product-desc" title={product.description}>
                        {product.description}
                      </p>

                      <div className="store-product-prices">
                        <div className="store-price-main">{prices.main}</div>
                        <div className="store-price-sub">≈ {prices.sub} (BCV)</div>
                      </div>

                      <Button
                        variant={isOutOfStock ? 'secondary' : 'primary'}
                        disabled={isOutOfStock}
                        onClick={() => addToCart(product)}
                        style={{
                          width: '100%',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <ShoppingCart size={15} />
                        <span>{isOutOfStock ? 'Sin stock' : 'Agregar al carrito'}</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* 3. CARRITO DE COMPRAS FLOTANTE (DRAWER) */}
      {isCartOpen && (
        <>
          <div className="cart-drawer-backdrop" onClick={() => setIsCartOpen(false)} />
          <div className="cart-drawer">
            <div className="cart-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShoppingCart size={20} style={{ color: 'var(--brand-500)' }} />
                <h3 style={{ margin: 0, fontSize: 16 }}>Carrito de compras</h3>
                <Badge tone="brand">{totalCartUnits} {totalCartUnits === 1 ? 'ítem' : 'ítems'}</Badge>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="cart-drawer-items">
              {cart.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                  <ShoppingCart size={40} style={{ color: 'var(--border)', margin: '0 auto 12px' }} />
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Tu carrito está vacío</div>
                  <div style={{ fontSize: 12 }}>Agrega productos del catálogo para iniciar tu pedido.</div>
                </div>
              ) : (
                cart.map(item => {
                  const itemTotalUSD = item.product.priceUsd * item.quantity;
                  const itemPriceFormatted = formatPrice(itemTotalUSD);

                  return (
                    <div key={item.product.sku} className="cart-item-row">
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--canvas)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        {item.product.image_url ? (
                          <img src={item.product.image_url} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                        ) : (
                          <Package size={24} style={{ color: 'var(--muted)' }} />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.product.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
                          SKU: {item.product.sku} · Unit: {activeCurrency === 'USD' ? formatUSD(item.product.priceUsd) : formatVES(convertUSDtoVES(item.product.priceUsd, bcvRate))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.product.sku, -1)}
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                background: 'var(--canvas)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                              }}
                            >
                              <Minus size={12} />
                            </button>
                            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.product.sku, 1)}
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 4,
                                border: '1px solid var(--border)',
                                background: 'var(--canvas)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                              }}
                            >
                              <Plus size={12} />
                            </button>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, fontWeight: 800 }}>{itemPriceFormatted.main}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{itemPriceFormatted.sub}</div>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.sku)}
                        title="Eliminar producto"
                        style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {cart.length > 0 && (
              <div className="cart-drawer-footer">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span className="muted">Total en USD:</span>
                  <b>{formatUSD(totalCartUSD)}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 15 }}>
                  <span style={{ fontWeight: 700 }}>Total en Bolívares (BCV):</span>
                  <b style={{ color: 'var(--brand-700)' }}>{formatVES(totalCartVES)}</b>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={clearCart}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    Vaciar
                  </button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setIsCartOpen(false);
                      setCheckoutStep(1);
                      setIsCheckoutOpen(true);
                    }}
                    style={{ flex: 2, justifyContent: 'center', gap: 8 }}
                  >
                    <span>Procesar compra</span>
                    <ArrowRight size={16} />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* 4. MODAL DE PROCESO DE COMPRA (CHECKOUT INTEGRADO) */}
      {isCheckoutOpen && (
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
        >
          <div
            style={{
              width: 'min(640px, 100%)',
              maxHeight: '90vh',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>Confirmación de Pedido</h3>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {businessConfig.businessName} · Pasarela comercial bimonetaria
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Stepper Header (steps 1 to 4) */}
            {checkoutStep < 4 && (
              <div
                style={{
                  display: 'flex',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--sidebar)'
                }}
              >
                {[
                  { step: 1, label: '1. Cliente' },
                  { step: 2, label: '2. Entrega' },
                  { step: 3, label: '3. Pago' }
                ].map(s => (
                  <div
                    key={s.step}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '10px 4px',
                      fontSize: 12,
                      fontWeight: 700,
                      color: checkoutStep === s.step ? 'var(--brand-700)' : 'var(--muted)',
                      borderBottom: checkoutStep === s.step ? '2px solid var(--brand-500)' : 'none',
                      background: checkoutStep === s.step ? 'var(--surface)' : 'transparent'
                    }}
                  >
                    {s.label}
                  </div>
                ))}
              </div>
            )}

            {/* Modal Content */}
            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              {/* PASO 1: DATOS DEL CLIENTE */}
              {checkoutStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Puedes comprar como invitado ingresando tus datos para la factura y contacto.
                  </div>

                  <div className="form-grid">
                    <div className="field">
                      <label>Nombre y Apellido *</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Ej. Juan Pérez"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="field">
                      <label>Teléfono móvil (WhatsApp) *</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Ej. 0412-1234567"
                        value={customerPhone}
                        onChange={e => setCustomerPhone(e.target.value)}
                        required
                      />
                    </div>

                    <div className="field">
                      <label>Cédula o RIF</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Ej. V-18234567"
                        value={customerDoc}
                        onChange={e => setCustomerDoc(e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label>Correo Electrónico (opcional)</label>
                      <input
                        type="email"
                        className="input"
                        placeholder="ejemplo@correo.com"
                        value={customerEmail}
                        onChange={e => setCustomerEmail(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 2: MÉTODO DE ENTREGA */}
              {checkoutStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div
                      onClick={() => setDeliveryMethod('RETIRO')}
                      style={{
                        padding: 16,
                        border: deliveryMethod === 'RETIRO' ? '2px solid var(--brand-500)' : '1px solid var(--border)',
                        background: deliveryMethod === 'RETIRO' ? 'var(--brand-50)' : 'var(--surface)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Store size={18} style={{ color: 'var(--brand-700)' }} />
                        <b style={{ fontSize: 14 }}>Retiro en Tienda</b>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Retira sin costo en cualquiera de nuestras sucursales.
                      </div>
                    </div>

                    <div
                      onClick={() => setDeliveryMethod('DOMICILIO')}
                      style={{
                        padding: 16,
                        border: deliveryMethod === 'DOMICILIO' ? '2px solid var(--brand-500)' : '1px solid var(--border)',
                        background: deliveryMethod === 'DOMICILIO' ? 'var(--brand-50)' : 'var(--surface)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Truck size={18} style={{ color: 'var(--brand-700)' }} />
                        <b style={{ fontSize: 14 }}>Entrega a Domicilio</b>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Despacho a tu casa o empresa por delivery o encomienda.
                      </div>
                    </div>
                  </div>

                  {deliveryMethod === 'RETIRO' ? (
                    <div className="field">
                      <label>Selecciona la Sucursal de Retiro</label>
                      <select
                        className="input"
                        value={selectedBranchId}
                        onChange={e => setSelectedBranchId(e.target.value)}
                      >
                        {businessConfig.branches.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name} — {b.address}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="field">
                        <label>Dirección exacta de entrega *</label>
                        <textarea
                          className="input"
                          style={{ height: 70, padding: 10 }}
                          placeholder="Calle, edificio/casa, número, piso, punto de referencia..."
                          value={deliveryAddress}
                          onChange={e => setDeliveryAddress(e.target.value)}
                          required
                        />
                      </div>
                      <div className="field">
                        <label>Instrucciones especiales para el despachador</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="Ej. Dejar en garita de vigilancia o llamar al llegar"
                          value={deliveryInstructions}
                          onChange={e => setDeliveryInstructions(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PASO 3: MÉTODO DE PAGO Y RESUMEN */}
              {checkoutStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div className="field">
                    <label>Selecciona Método de Pago</label>
                    <select
                      className="input"
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                    >
                      <option value="PAGO_MOVIL">Pago Móvil (Bolívares)</option>
                      <option value="TRANSFERENCIA">Transferencia Bancaria Nacional (VES)</option>
                      <option value="EFECTIVO_USD">Efectivo USD (Contra Entrega / Retiro)</option>
                      <option value="ZELLE">Zelle (USD)</option>
                    </select>
                  </div>

                  {/* Payment Details Box */}
                  <div
                    style={{
                      padding: 16,
                      background: 'var(--canvas)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                      fontSize: 12.5,
                      lineHeight: 1.6
                    }}
                  >
                    {paymentMethod === 'PAGO_MOVIL' && (
                      <div>
                        <b>Datos para Pago Móvil:</b><br />
                        Banco: <b>Banesco (0134)</b> o <b>Banco de Venezuela (0102)</b><br />
                        Teléfono: <b>0412-5551212</b><br />
                        RIF: <b>{businessConfig.rif}</b> ({businessConfig.businessName})<br />
                        Monto exacto: <b style={{ color: 'var(--brand-700)' }}>{formatVES(totalCartVES)}</b>
                      </div>
                    )}
                    {paymentMethod === 'TRANSFERENCIA' && (
                      <div>
                        <b>Cuenta Corriente Banesco:</b> 0134-0000-0000-0000-0000<br />
                        Titular: <b>{businessConfig.businessName}</b> · RIF: <b>{businessConfig.rif}</b><br />
                        Monto: <b>{formatVES(totalCartVES)}</b>
                      </div>
                    )}
                    {paymentMethod === 'EFECTIVO_USD' && (
                      <div>
                        <b>Pago en Efectivo USD:</b><br />
                        Total a pagar: <b>{formatUSD(totalCartUSD)}</b> en billetes sin roturas ni deterioro al momento de retirar o recibir el despacho.
                      </div>
                    )}
                    {paymentMethod === 'ZELLE' && (
                      <div>
                        <b>Zelle Email:</b> pagos@frenyer.com<br />
                        Titular: <b>{businessConfig.businessName}</b><br />
                        Total: <b>{formatUSD(totalCartUSD)}</b>
                      </div>
                    )}
                  </div>

                  {paymentMethod !== 'EFECTIVO_USD' && (
                    <div className="field">
                      <label>Número de referencia o confirmación (opcional en este paso)</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Ej. 123456"
                        value={paymentReference}
                        onChange={e => setPaymentReference(e.target.value)}
                      />
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        Si aún no has pagado, el pedido quedará en estado <b>Pendiente</b> hasta verificar el comprobante.
                      </span>
                    </div>
                  )}

                  {/* Summary Box */}
                  <div
                    style={{
                      borderTop: '1px solid var(--border)',
                      paddingTop: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>Ítems ({totalCartUnits}):</span>
                      <b>{formatUSD(totalCartUSD)}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>Tasa BCV aplicada:</span>
                      <span>Bs. {bcvRate.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, marginTop: 4 }}>
                      <span style={{ fontWeight: 800 }}>Total Definitivo:</span>
                      <b style={{ color: 'var(--brand-700)' }}>{formatVES(totalCartVES)} / {formatUSD(totalCartUSD)}</b>
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 4: ÉXITO / CONFIRMACIÓN DEL PEDIDO */}
              {checkoutStep === 4 && completedOrder && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: 'var(--brand-50)',
                      color: 'var(--brand-600)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px'
                    }}
                  >
                    <CheckCircle size={36} />
                  </div>

                  <h3 style={{ margin: '0 0 6px', fontSize: 22 }}>¡Pedido Recibido con Éxito!</h3>
                  <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>
                    Tu orden ha sido registrada en el sistema y ya está en cola de despacho.
                  </div>

                  <div
                    style={{
                      background: 'var(--canvas)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: 16,
                      textAlign: 'left',
                      marginBottom: 20,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      fontSize: 13
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">Número de Pedido:</span>
                      <b style={{ color: 'var(--brand-700)', fontSize: 15 }}>{completedOrder.order_number}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">Cliente:</span>
                      <b>{completedOrder.customer_name}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">Método de entrega:</span>
                      <b>{completedOrder.delivery_method === 'DOMICILIO' ? 'Entrega a Domicilio' : 'Retiro en Tienda'}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">Estado de Pago:</span>
                      <Badge tone={completedOrder.payment_status === 'PAGADO' ? 'success' : 'warning'}>
                        {completedOrder.payment_status}
                      </Badge>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                      <span style={{ fontWeight: 700 }}>Total Confirmado:</span>
                      <b style={{ color: 'var(--brand-700)' }}>{formatVES(completedOrder.total_ves)} ({formatUSD(completedOrder.total_usd)})</b>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    onClick={() => {
                      setIsCheckoutOpen(false);
                      setCompletedOrder(null);
                    }}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Volver a la tienda
                  </Button>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            {checkoutStep < 4 && (
              <div
                style={{
                  padding: '16px 24px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--sidebar)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                {checkoutStep > 1 ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setCheckoutStep(prev => (prev - 1) as any)}
                  >
                    Atrás
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setIsCheckoutOpen(false)}
                  >
                    Cancelar
                  </button>
                )}

                {checkoutStep < 3 ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (checkoutStep === 1) {
                        if (!customerName.trim() || !customerPhone.trim()) {
                          showToast('Nombre y teléfono son obligatorios.', 'info');
                          return;
                        }
                      }
                      if (checkoutStep === 2) {
                        if (deliveryMethod === 'DOMICILIO' && !deliveryAddress.trim()) {
                          showToast('Ingrese la dirección de entrega.', 'info');
                          return;
                        }
                      }
                      setCheckoutStep(prev => (prev + 1) as any);
                    }}
                    style={{ gap: 6 }}
                  >
                    <span>Siguiente</span>
                    <ChevronRight size={16} />
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={isSubmittingOrder}
                    onClick={handleConfirmOrder}
                    style={{ gap: 8 }}
                  >
                    <Check size={16} />
                    <span>{isSubmittingOrder ? 'Procesando...' : 'Confirmar Pedido'}</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. MODAL DE VISTA RÁPIDA DE PRODUCTO */}
      {quickViewProduct && (
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
          onClick={() => setQuickViewProduct(null)}
        >
          <div
            style={{
              width: 'min(540px, 100%)',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              padding: 24,
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
              position: 'relative'
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setQuickViewProduct(null)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--muted)'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--canvas)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                {quickViewProduct.image_url ? (
                  <img src={quickViewProduct.image_url} alt={quickViewProduct.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                ) : (
                  <Package size={48} style={{ color: 'var(--muted)' }} />
                )}
              </div>

              <div>
                <Badge tone={quickViewProduct.stock > 0 ? 'success' : 'danger'}>
                  {quickViewProduct.stock > 0 ? `${quickViewProduct.stock} disponibles` : 'Agotado'}
                </Badge>
                <h3 style={{ margin: '8px 0 4px', fontSize: 17 }}>{quickViewProduct.name}</h3>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Código: <b>{quickViewProduct.sku}</b> · Marca: <b>{quickViewProduct.brand || 'Frenyer'}</b>
                </div>
              </div>
            </div>

            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 16 }}>
              {quickViewProduct.description}
            </p>

            <div
              style={{
                background: 'var(--canvas)',
                padding: 14,
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 18
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Precio unitario</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>
                  {formatPrice(quickViewProduct.priceUsd).main}
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                ≈ {formatPrice(quickViewProduct.priceUsd).sub} (BCV)
              </div>
            </div>

            <Button
              variant="primary"
              disabled={quickViewProduct.stock <= 0}
              onClick={() => {
                addToCart(quickViewProduct);
                setQuickViewProduct(null);
              }}
              style={{ width: '100%', justifyContent: 'center', gap: 8 }}
            >
              <ShoppingCart size={16} />
              <span>{quickViewProduct.stock > 0 ? 'Agregar al carrito' : 'Producto sin stock'}</span>
            </Button>
          </div>
        </div>
      )}

      {/* 6. MODAL DE RASTREO DE COMPRAS ("MIS PEDIDOS") */}
      {isTrackerOpen && (
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
          onClick={() => setIsTrackerOpen(false)}
        >
          <div
            style={{
              width: 'min(580px, 100%)',
              maxHeight: '85vh',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              padding: 24,
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={20} style={{ color: 'var(--brand-500)' }} />
                <h3 style={{ margin: 0, fontSize: 17 }}>Rastrear mis Compras</h3>
              </div>
              <button type="button" onClick={() => setIsTrackerOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                type="text"
                className="input"
                placeholder="Número de pedido (ej. PED-0001) o teléfono..."
                value={trackerQuery}
                onChange={e => setTrackerQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchTrackedOrders()}
              />
              <Button variant="primary" onClick={handleSearchTrackedOrders} disabled={isSearchingOrders}>
                Buscar
              </Button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isSearchingOrders ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Consultando...</div>
              ) : trackedOrders.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  Ingresa tu número de orden o número telefónico para consultar el estatus en vivo.
                </div>
              ) : (
                trackedOrders.map((ord: any) => (
                  <div
                    key={ord.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: 14,
                      background: 'var(--canvas)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <b style={{ color: 'var(--brand-700)' }}>{ord.order_number}</b>
                      <Badge tone={ord.delivery_status === 'ENTREGADO' ? 'success' : ord.delivery_status === 'CANCELADO' ? 'danger' : 'warning'}>
                        {ord.delivery_status}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                      Fecha: {new Date(ord.created_at).toLocaleString('es-VE')} · Método: {ord.delivery_method}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      Total: {formatVES(ord.total_ves)} ({formatUSD(ord.total_usd)})
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* FOOTER PÚBLICO (Incluye acceso administrativo para dispositivos táctiles) */}
      <footer
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
          padding: '24px 24px',
          marginTop: 'auto'
        }}
      >
        <div
          style={{
            maxWidth: 1500,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            fontSize: 12,
            color: 'var(--muted)'
          }}
        >
          <div>
            © {new Date().getFullYear()} <b>{businessConfig.businessName}</b> — RIF: {businessConfig.rif} · Todos los derechos reservados.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span>Tasa BCV Oficial: Bs. {bcvRate.toFixed(2)}</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            {/* Enlace táctil/accesible al panel administrativo */}
            <button
              type="button"
              onClick={() => navigate('/ventas-flash/pedidos')}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--brand-700)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Acceso Administrativo
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function varText() {
  return 'var(--text)';
}
