import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ShoppingCart,
  Menu,
  X,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  Truck,
  Store,
  CreditCard,
  DollarSign,
  ArrowRight,
  Package,
  Layers,
  Phone,
  FileText,
  ChevronRight,
  ChevronLeft,
  Star,
  MessageCircle,
  Home,
  User,
  Building,
  Mail,
  LockKeyhole,
  LogIn,
  Eye,
  EyeOff
} from 'lucide-react';
import { supabase } from '../../../lib/supabase/client';
import {
  getActiveExchangeRate,
  convertUSDtoVES,
  formatUSD,
  formatVES
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

// --- LOGO SVG COMPONENT (Exact Match to CompuRepuestos CR Logo) ---
function CompuRepuestosLogo({ className = '', size = 44 }: { className?: string; size?: number }) {
  return (
    <div className={`compu-logo-container ${className}`} style={{ width: size, height: size, flexShrink: 0 }}>
      <svg
        viewBox="0 0 160 160"
        width="100%"
        height="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="blueGearGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="redSwooshGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>
          <linearGradient id="pencilGrad1" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="pencilGrad2" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
          <linearGradient id="pencilGrad3" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>

        {/* Outer Circular Swooshes */}
        <circle cx="75" cy="85" r="54" stroke="url(#blueGearGrad)" strokeWidth="11" strokeDasharray="14 10" />
        <path
          d="M 60 145 C 105 148, 142 120, 142 80 C 142 45, 120 25, 100 20"
          stroke="url(#redSwooshGrad)"
          strokeWidth="11"
          strokeLinecap="round"
        />

        {/* Decorative Tools / Pencils / Brushes at top */}
        <g transform="translate(10, 0)">
          <rect x="70" y="10" width="7" height="28" rx="2" fill="url(#pencilGrad1)" transform="rotate(-20 70 20)" />
          <polygon points="70,10 77,10 73.5,4" fill="#fbbf24" transform="rotate(-20 70 20)" />
          <rect x="85" y="8" width="7" height="30" rx="2" fill="url(#pencilGrad2)" transform="rotate(5 85 20)" />
          <polygon points="85,8 92,8 88.5,2" fill="#38bdf8" transform="rotate(5 85 20)" />
          <rect x="98" y="14" width="7" height="26" rx="2" fill="url(#pencilGrad3)" transform="rotate(25 98 20)" />
          <polygon points="98,14 105,14 101.5,8" fill="#34d399" transform="rotate(25 98 20)" />
        </g>

        {/* Central Gear teeth */}
        <path
          d="M 40 70 L 32 68 L 30 75 L 38 78 Z M 38 95 L 30 98 L 32 105 L 40 103 Z M 52 118 L 47 124 L 53 129 L 58 123 Z"
          fill="#1e3a8a"
        />

        {/* Central "CR" Monogram */}
        <path
          d="M 72 62 C 60 62, 51 71, 51 84 C 51 97, 60 106, 73 106 C 80 106, 85 103, 88 98 L 78 92 C 76 95, 74 96, 72 96 C 65 96, 61 91, 61 84 C 61 77, 65 72, 72 72 C 75 72, 77 74, 79 76 L 88 70 C 84 65, 79 62, 72 62 Z"
          fill="#1e3a8a"
        />
        <path
          d="M 85 63 L 103 63 C 111 63, 117 68, 117 76 C 117 82, 112 87, 106 88 L 118 106 L 106 106 L 96 90 L 94 90 L 94 106 L 85 106 Z M 94 72 L 94 82 L 102 82 C 106 82, 108 80, 108 77 C 108 74, 106 72, 102 72 Z"
          fill="#dc2626"
        />
      </svg>
    </div>
  );
}

export function ShopPage() {
  const navigate = useNavigate();

  // --- STATE: CATALOG & CONFIG ---
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [businessConfig, setBusinessConfig] = useState<PublicBusinessConfig>(() => {
    const profile = getBusinessProfile();
    return {
      businessName: 'CompuRepuestos Flores Inversiones',
      rif: profile.rif || 'J-40192837-1',
      phone: profile.phone || '0412-5551212',
      email: profile.email || 'ventas@compurepuestos.com',
      address: profile.address || 'Av. Principal Comercial, Local 14',
      slogan: 'Materiales, Copias y Repuestos de Motos',
      logo: profile.logo,
      favicon: profile.favicon,
      bcvRate: getActiveExchangeRate(),
      bcvRateDate: 'Actual',
      branches: [
        { id: 'suc-01', name: 'Sede Principal - Despacho Central', address: profile.address || 'Av. Principal' }
      ]
    };
  });

  // --- STATE: CURRENCY & RATE ---
  const [activeCurrency, setActiveCurrency] = useState<Currency>('USD');
  const [bcvRate, setBcvRate] = useState<number>(() => getActiveExchangeRate());

  // --- STATE: DIVISION & CATEGORY FILTERS ---
  const [activeDivision, setActiveDivision] = useState<'ALL' | 'MATERIALES' | 'MOTOS'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Mobile drawer menu
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- STATE: CART ---
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

  // --- STATE: MODALS ---
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3 | 4>(1);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [isAuthRegisterMode, setIsAuthRegisterMode] = useState(false);
  const [trackerQuery, setTrackerQuery] = useState('');
  const [trackedOrders, setTrackedOrders] = useState<any[]>([]);
  const [isSearchingOrders, setIsSearchingOrders] = useState(false);

  // Checkout Form fields
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

  // Toast
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Sync cart to storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('frenyer_shop_cart', JSON.stringify(cart));
    }
  }, [cart]);

  // Load catalog & bcv rate (Strictly from system database without hardcoded fallbacks)
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
        }

        if (cfg) {
          setBusinessConfig(prev => ({
            ...prev,
            ...cfg,
            businessName: 'CompuRepuestos Flores Inversiones',
            bcvRate: cfg.bcvRate || bcvRate
          }));
        }

        if (dbProds && dbProds.length > 0) {
          const mapped: Product[] = dbProds.map((p: DbProduct) => ({
            id: p.id || p.sku,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            category: p.category || 'General',
            brand: (p as any).brand || 'CompuRepuestos',
            description: (p as any).description || 'Producto disponible para despacho y facturación inmediata.',
            priceUsd: Number(p.price_usd) || 0,
            costUsd: Number(p.cost_usd) || 0,
            stock: Number(p.stock) || 0,
            minStock: Number(p.min_stock) || 0,
            status: (Number(p.stock) || 0) <= 0 ? 'Agotado' : 'Activo',
            image_url: p.image_url
          }));
          setProducts(mapped);
        } else {
          setProducts([]);
        }
      } catch (err) {
        console.warn('Error cargando catálogo del sistema:', err);
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    initData();
  }, []);

  // --- SHORTCUT: Ctrl + A + S TO ADMIN ---
  useEffect(() => {
    const keyHistory: string[] = [];
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        (activeEl && activeEl.getAttribute('contenteditable') === 'true');

      if (isInput) return;

      const now = Date.now();
      if (now - lastKeyTime > 2000) keyHistory.length = 0;
      lastKeyTime = now;

      keyHistory.push(e.key.toLowerCase());
      if (keyHistory.length > 5) keyHistory.shift();

      const isCtrlActive = e.ctrlKey || keyHistory.includes('control');
      const lastTwo = keyHistory.slice(-2);
      if (isCtrlActive && lastTwo[0] === 'a' && lastTwo[1] === 's') {
        e.preventDefault();
        keyHistory.length = 0;
        navigate('/ventas-flash/pedidos');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // --- CATEGORÍAS 100% GRABADAS EN EL SISTEMA (BASE DE DATOS) ---
  const systemCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    });
    return Array.from(set).sort();
  }, [products]);

  const materialCategories = useMemo(() => {
    return systemCategories.filter(cat => {
      const c = cat.toLowerCase();
      return (
        c.includes('material') ||
        c.includes('copia') ||
        c.includes('impresión') ||
        c.includes('impresion') ||
        c.includes('oficina') ||
        c.includes('librería') ||
        c.includes('libreria') ||
        c.includes('papelería') ||
        c.includes('papeleria') ||
        c.includes('papel') ||
        c.includes('tecno') ||
        c.includes('station')
      );
    });
  }, [systemCategories]);

  const motoCategories = useMemo(() => {
    return systemCategories.filter(cat => {
      const c = cat.toLowerCase();
      return (
        c.includes('moto') ||
        c.includes('repuesto') ||
        c.includes('techo') ||
        c.includes('amortiguador') ||
        c.includes('freno') ||
        c.includes('motor') ||
        c.includes('batería') ||
        c.includes('bateria')
      );
    });
  }, [systemCategories]);

  // Filtered catalog
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const catLower = (p.category || '').toLowerCase();
      const nameLower = p.name.toLowerCase();
      const descLower = (p.description || '').toLowerCase();
      const brandLower = (p.brand || '').toLowerCase();

      const isMaterial =
        catLower.includes('material') ||
        catLower.includes('copia') ||
        catLower.includes('impresión') ||
        catLower.includes('impresion') ||
        catLower.includes('oficina') ||
        catLower.includes('librería') ||
        catLower.includes('libreria') ||
        catLower.includes('papelería') ||
        catLower.includes('papeleria') ||
        catLower.includes('papel') ||
        catLower.includes('tecno') ||
        catLower.includes('station') ||
        brandLower.includes('futuro') ||
        brandLower.includes('flores') ||
        nameLower.includes('copia') ||
        nameLower.includes('impresión') ||
        nameLower.includes('impresion') ||
        nameLower.includes('papel') ||
        nameLower.includes('resma') ||
        nameLower.includes('librería') ||
        nameLower.includes('libreria') ||
        nameLower.includes('papelería') ||
        nameLower.includes('papeleria') ||
        nameLower.includes('oficina');

      const isMoto =
        catLower.includes('moto') ||
        catLower.includes('repuesto') ||
        catLower.includes('techo') ||
        catLower.includes('amortiguador') ||
        catLower.includes('bater') ||
        catLower.includes('freno') ||
        catLower.includes('motor') ||
        brandLower.includes('acelera') ||
        nameLower.includes('cilindro') ||
        nameLower.includes('amortiguador') ||
        nameLower.includes('techo') ||
        nameLower.includes('rin') ||
        nameLower.includes('pistón') ||
        nameLower.includes('moto');

      // 1. Division filter
      if (activeDivision === 'MATERIALES' && !isMaterial) return false;
      if (activeDivision === 'MOTOS' && !isMoto) return false;

      // 2. System category chip filter
      if (selectedCategory !== 'ALL') {
        if (p.category !== selectedCategory) return false;
      }

      // 3. Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchName = nameLower.includes(q);
        const matchSku = p.sku.toLowerCase().includes(q);
        const matchCat = catLower.includes(q);
        const matchDesc = descLower.includes(q);
        if (!matchName && !matchSku && !matchCat && !matchDesc) return false;
      }

      return true;
    });
  }, [products, activeDivision, selectedCategory, searchTerm]);

  // Cart operations
  const totalCartUnits = useMemo(() => cart.reduce((acc, item) => acc + item.quantity, 0), [cart]);

  const totalCartUSD = useMemo(() => {
    const raw = cart.reduce((acc, item) => acc + item.product.priceUsd * item.quantity, 0);
    return Math.round(raw * 100) / 100;
  }, [cart]);

  const totalCartVES = useMemo(() => convertUSDtoVES(totalCartUSD, bcvRate), [totalCartUSD, bcvRate]);

  const addToCart = (product: Product, quantityToAdd = 1) => {
    if (product.stock <= 0) {
      showToast('Este producto no tiene existencias disponibles.', 'info');
      return;
    }

    setCart(prev => {
      const idx = prev.findIndex(item => item.product.sku === product.sku);
      if (idx >= 0) {
        const currentQty = prev[idx].quantity;
        const nextQty = Math.min(product.stock, currentQty + quantityToAdd);
        if (nextQty === currentQty) {
          showToast(`Límite de stock alcanzado (${product.stock} unids).`, 'info');
          return prev;
        }
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: nextQty };
        showToast(`Agregado al carrito: ${product.name}`);
        return updated;
      } else {
        const initialQty = Math.min(product.stock, quantityToAdd);
        showToast(`Agregado al carrito: ${product.name}`);
        return [...prev, { product, quantity: initialQty }];
      }
    });
  };

  const updateCartQuantity = (sku: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.product.sku === sku) {
            const nextQty = item.quantity + delta;
            if (nextQty <= 0) return null;
            if (nextQty > item.product.stock) {
              showToast(`Límite de inventario: ${item.product.stock} unids.`, 'info');
              return item;
            }
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (sku: string) => {
    setCart(prev => prev.filter(item => item.product.sku !== sku));
    showToast('Producto eliminado del carrito.');
  };

  const clearCart = () => {
    setCart([]);
    showToast('Carrito vaciado.');
  };

  const formatPrice = (usdAmount: number) => {
    const ves = convertUSDtoVES(usdAmount, bcvRate);
    if (activeCurrency === 'VES') {
      return { main: formatVES(ves), sub: formatUSD(usdAmount) };
    }
    return { main: formatUSD(usdAmount), sub: formatVES(ves) };
  };

  // Open WhatsApp with prefilled message
  const handleOpenWhatsApp = (message = 'Hola CompuRepuestos Flores Inversiones, me gustaría solicitar información y realizar un pedido.') => {
    const cleanPhone = (businessConfig.phone || '04125551212').replace(/\D/g, '');
    const phoneWithCode = cleanPhone.startsWith('58') ? cleanPhone : `58${cleanPhone.replace(/^0/, '')}`;
    const url = `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Order confirmation
  const handleConfirmOrder = async () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      showToast('Por favor ingrese su nombre y teléfono.', 'info');
      setCheckoutStep(1);
      return;
    }
    if (deliveryMethod === 'DOMICILIO' && !deliveryAddress.trim()) {
      showToast('Por favor ingrese la dirección de entrega.', 'info');
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
      showToast(err?.message || 'Error de comunicación.', 'info');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Tracker
  const handleSearchTrackedOrders = async () => {
    if (!trackerQuery.trim()) return;
    setIsSearchingOrders(true);
    try {
      const allOrders = await fetchOrdersFromApi();
      const q = trackerQuery.toLowerCase().trim();
      const matched = allOrders.filter((o: any) => {
        return (
          o.order_number?.toLowerCase().includes(q) ||
          o.customer_phone?.toLowerCase().includes(q) ||
          o.customer_doc?.toLowerCase().includes(q) ||
          o.customer_name?.toLowerCase().includes(q)
        );
      });
      setTrackedOrders(matched);
    } catch {
      setTrackedOrders([]);
    } finally {
      setIsSearchingOrders(false);
    }
  };

  return (
    <div className="cr-store-root">
      {/* SCOPED STYLING */}
      <style>{`
        .cr-store-root {
          min-height: 100vh;
          background: #ffffff;
          color: #1e293b;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          position: relative;
          padding-bottom: 74px;
        }
        @media (min-width: 768px) {
          .cr-store-root {
            padding-bottom: 0;
          }
        }

        /* Top Header */
        .cr-topbar {
          background: #ffffff;
          border-bottom: 1px solid #f1f5f9;
          position: sticky;
          top: 0;
          z-index: 50;
          box-shadow: 0 1px 4px rgba(0,0,0,0.03);
        }
        .cr-topbar-inner {
          max-width: 1320px;
          margin: 0 auto;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        @media (min-width: 768px) {
          .cr-topbar-inner {
            padding: 16px 28px;
          }
        }

        /* 1. Identidad Corporativa exact colors */
        .cr-brand-group {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          user-select: none;
        }
        .cr-brand-title {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: -0.02em;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          line-height: 1.15;
          gap: 2px 5px;
        }
        @media (min-width: 640px) {
          .cr-brand-title {
            font-size: 21px;
          }
        }
        @media (min-width: 1024px) {
          .cr-brand-title {
            font-size: 26px;
          }
        }
        .cr-title-compu {
          color: #1e3a8a; /* Azul marino */
        }
        .cr-title-repuestos {
          color: #b91c1c; /* Rojo carmesí */
        }
        .cr-brand-divider {
          color: #cbd5e1;
          font-weight: 300;
          margin: 0 2px;
        }
        .cr-title-flores {
          color: #1e3a8a; /* Azul marino */
        }
        .cr-title-inversiones {
          color: #b91c1c; /* Rojo carmesí */
        }

        /* Header Right Actions */
        .cr-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .cr-icon-btn {
          background: transparent;
          border: none;
          color: #334155;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          position: relative;
          padding: 6px;
          border-radius: 50%;
          transition: background 0.15s ease;
        }
        .cr-icon-btn:hover {
          background: #f1f5f9;
        }
        .cr-badge-count {
          position: absolute;
          top: -2px;
          right: -4px;
          background: #dc2626;
          color: #ffffff;
          font-size: 11px;
          font-weight: 700;
          min-width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
          border: 2px solid #ffffff;
        }

        /* Mobile Top Search Bar */
        .cr-mobile-search-row {
          padding: 8px 16px 12px;
          background: #ffffff;
          border-bottom: 1px solid #f1f5f9;
        }
        @media (min-width: 768px) {
          .cr-mobile-search-row {
            display: none;
          }
        }

        .cr-mobile-search-box {
          display: flex;
          align-items: center;
          border: 1px solid #e2e8f0;
          border-radius: 9999px;
          padding: 2px 2px 2px 14px;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .cr-mobile-search-input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          font-size: 13.5px;
          color: #0f172a;
        }
        .cr-mobile-search-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: #dc2626;
          color: #ffffff;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }

        /* 2. Banners Promocionales Duales */
        .cr-hero-section {
          max-width: 1320px;
          margin: 16px auto 20px;
          padding: 0 16px;
          position: relative;
        }
        @media (min-width: 768px) {
          .cr-hero-section {
            margin: 24px auto 32px;
            padding: 0 28px;
          }
        }

        .cr-banners-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (min-width: 768px) {
          .cr-banners-grid {
            gap: 22px;
          }
        }

        /* Banner 1: Flores Inversiones CompuFuturo (Laptops ocupando el contenedor) */
        .cr-banner-tech {
          background: linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%);
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          overflow: hidden;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 4px 20px rgba(0,0,0,0.04);
          position: relative;
          min-height: 220px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        @media (min-width: 768px) {
          .cr-banner-tech {
            padding: 24px 28px;
            min-height: 320px;
            border-radius: 24px;
          }
        }
        .cr-banner-tech:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(30, 58, 138, 0.08);
        }

        /* Banner 2: Acelera Motor Partes (Fondo oscuro con moto de alto rendimiento generada) */
        .cr-banner-moto {
          background: radial-gradient(circle at 70% 30%, #1e1e24 0%, #0d0d11 100%);
          border: 1px solid #27272a;
          border-radius: 18px;
          overflow: hidden;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          position: relative;
          min-height: 220px;
          color: #ffffff;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        @media (min-width: 768px) {
          .cr-banner-moto {
            padding: 24px 28px;
            min-height: 320px;
            border-radius: 24px;
          }
        }
        .cr-banner-moto:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(220, 38, 38, 0.15);
        }

        .cr-banner-tagline {
          font-size: 11px;
          text-transform: uppercase;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #475569;
          margin-bottom: 2px;
          text-align: center;
        }
        @media (min-width: 768px) {
          .cr-banner-tagline {
            font-size: 13px;
          }
        }

        .cr-banner-tech-title {
          font-size: 18px;
          font-weight: 800;
          color: #1e3a8a;
          text-align: center;
          margin: 0 0 8px;
          letter-spacing: -0.02em;
        }
        @media (min-width: 768px) {
          .cr-banner-tech-title {
            font-size: 26px;
            margin-bottom: 12px;
          }
        }

        .cr-banner-moto-title-group {
          text-align: center;
          margin-bottom: 8px;
        }
        .cr-banner-moto-brand {
          font-size: 18px;
          font-style: italic;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: 0.05em;
          margin: 0;
          text-transform: uppercase;
        }
        @media (min-width: 768px) {
          .cr-banner-moto-brand {
            font-size: 26px;
          }
        }
        .cr-banner-moto-sub {
          font-size: 11px;
          font-weight: 800;
          color: #ef4444;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin: 0;
        }
        @media (min-width: 768px) {
          .cr-banner-moto-sub {
            font-size: 13px;
          }
        }

        /* Banner Images filling the container */
        .cr-banner-image-wrap {
          flex: 1;
          width: 100%;
          min-height: 110px;
          max-height: 170px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 6px 0 12px;
          position: relative;
          overflow: hidden;
          border-radius: 12px;
        }
        @media (min-width: 768px) {
          .cr-banner-image-wrap {
            min-height: 150px;
            max-height: 200px;
            margin: 8px 0 16px;
          }
        }
        .cr-banner-image-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 12px;
          transition: transform 0.3s ease;
        }
        .cr-banner-tech:hover .cr-banner-image-wrap img,
        .cr-banner-moto:hover .cr-banner-image-wrap img {
          transform: scale(1.04);
        }

        /* Botón de pastilla azul «Copias y Materiales» */
        .cr-banner-btn-tech {
          background: #1e3a8a;
          color: #ffffff;
          border: none;
          border-radius: 9999px;
          padding: 8px 18px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          align-self: center;
          transition: all 0.15s ease;
          box-shadow: 0 4px 12px rgba(30, 58, 138, 0.25);
          white-space: nowrap;
        }
        @media (min-width: 768px) {
          .cr-banner-btn-tech {
            padding: 10px 26px;
            font-size: 14px;
          }
        }
        .cr-banner-btn-tech:hover {
          background: #172554;
          transform: translateY(-1px);
        }

        /* Botón de pastilla rojo «Comprar Repuestos» */
        .cr-banner-btn-moto {
          background: #dc2626;
          color: #ffffff;
          border: none;
          border-radius: 9999px;
          padding: 8px 18px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          align-self: center;
          transition: all 0.15s ease;
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.35);
          white-space: nowrap;
        }
        @media (min-width: 768px) {
          .cr-banner-btn-moto {
            padding: 10px 26px;
            font-size: 14px;
          }
        }
        .cr-banner-btn-moto:hover {
          background: #b91c1c;
          transform: translateY(-1px);
        }

        /* Carousel Navigation Buttons & Dots */
        .cr-carousel-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          color: #334155;
          display: none;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          z-index: 10;
          transition: all 0.15s ease;
        }
        @media (min-width: 1024px) {
          .cr-carousel-arrow {
            display: flex;
          }
        }
        .cr-carousel-arrow:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        .cr-carousel-arrow.left {
          left: 4px;
        }
        .cr-carousel-arrow.right {
          right: 4px;
        }

        .cr-carousel-dots {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 10px;
        }
        .cr-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #cbd5e1;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .cr-dot.active {
          width: 8px;
          height: 8px;
          background: #1e3a8a;
        }

        /* 3. Título izquierdo renombrado a "Materiales y Copias" */
        .cr-desktop-subhead-row {
          display: none;
        }
        @media (min-width: 768px) {
          .cr-desktop-subhead-row {
            max-width: 1320px;
            margin: 0 auto 16px;
            padding: 0 28px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
          }
        }
        .cr-title-left {
          font-size: 20px;
          font-weight: 800;
          color: #1e3a8a;
          text-transform: uppercase;
          letter-spacing: -0.01em;
          flex: 1;
        }
        .cr-title-right {
          font-size: 20px;
          font-weight: 800;
          color: #b91c1c;
          text-transform: uppercase;
          letter-spacing: -0.01em;
          flex: 1;
          text-align: right;
        }
        .cr-desktop-search-wrap {
          flex: 1.2;
          max-width: 440px;
          display: flex;
          align-items: center;
          border: 1px solid #cbd5e1;
          border-radius: 9999px;
          padding: 3px 3px 3px 18px;
          background: #ffffff;
        }
        .cr-desktop-search-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 14px;
          color: #0f172a;
          background: transparent;
        }
        .cr-desktop-search-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: #1e3a8a;
          color: #ffffff;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .cr-desktop-search-btn:hover {
          background: #172554;
        }

        /* 4. Pastillas de Filtro estrictamente del sistema */
        .cr-chips-container {
          max-width: 1320px;
          margin: 0 auto 20px;
          padding: 0 16px;
        }
        @media (min-width: 768px) {
          .cr-chips-container {
            padding: 0 28px;
            margin-bottom: 24px;
          }
        }

        .cr-mobile-heading-switcher {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 14px;
        }
        @media (min-width: 768px) {
          .cr-mobile-heading-switcher {
            display: none;
          }
        }

        .cr-mobile-heading-title {
          font-size: 18px;
          font-weight: 800;
          text-transform: uppercase;
          text-align: center;
          margin: 0;
          letter-spacing: -0.02em;
        }

        .cr-mobile-toggle-group {
          display: flex;
          gap: 8px;
          justify-content: center;
        }
        .cr-mobile-tab-btn {
          flex: 1;
          max-width: 180px;
          padding: 8px 12px;
          border-radius: 9999px;
          font-size: 12.5px;
          font-weight: 700;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #475569;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: center;
        }
        .cr-mobile-tab-btn.active-tech {
          background: #1e3a8a;
          color: #ffffff;
          border-color: #1e3a8a;
        }
        .cr-mobile-tab-btn.active-moto {
          background: #dc2626;
          color: #ffffff;
          border-color: #dc2626;
        }

        .cr-mobile-categories-scroll {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding: 4px 0 8px;
          scrollbar-width: none;
        }
        @media (min-width: 768px) {
          .cr-mobile-categories-scroll {
            display: none;
          }
        }
        .cr-mobile-categories-scroll::-webkit-scrollbar {
          display: none;
        }

        .cr-desktop-chips-row {
          display: none;
        }
        @media (min-width: 768px) {
          .cr-desktop-chips-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            overflow-x: auto;
            padding-bottom: 4px;
          }
        }
        .cr-chip-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .cr-chip {
          padding: 6px 14px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 600;
          background: #f1f5f9;
          color: #475569;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .cr-chip:hover {
          background: #e2e8f0;
          color: #0f172a;
        }
        .cr-chip.active-blue {
          background: #1e3a8a;
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(30, 58, 138, 0.25);
        }
        .cr-chip.active-red {
          background: #dc2626;
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(220, 38, 38, 0.25);
        }

        /* 5. Catálogo de Productos */
        .cr-catalog-wrap {
          max-width: 1320px;
          margin: 0 auto;
          padding: 0 16px 40px;
        }
        @media (min-width: 768px) {
          .cr-catalog-wrap {
            padding: 0 28px 50px;
          }
        }

        .cr-product-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }
        @media (min-width: 640px) {
          .cr-product-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
          }
        }
        @media (min-width: 1024px) {
          .cr-product-grid {
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
          }
        }
        @media (min-width: 1280px) {
          .cr-product-grid {
            grid-template-columns: repeat(6, 1fr);
            gap: 16px;
          }
        }

        /* Product Card */
        .cr-product-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 2px 6px rgba(0,0,0,0.03);
          transition: all 0.2s ease;
          position: relative;
        }
        .cr-product-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
          border-color: #cbd5e1;
        }

        .cr-card-image-box {
          height: 130px;
          background: #f8fafc;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
          position: relative;
          overflow: hidden;
        }
        @media (min-width: 768px) {
          .cr-card-image-box {
            height: 150px;
          }
        }
        .cr-card-image-box img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          transition: transform 0.2s ease;
        }
        .cr-product-card:hover .cr-card-image-box img {
          transform: scale(1.05);
        }

        .cr-card-content {
          padding: 12px;
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        .cr-card-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 4px;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          min-height: 35px;
        }
        .cr-card-stars {
          display: flex;
          align-items: center;
          gap: 2px;
          margin-bottom: 6px;
          color: #eab308;
        }
        .cr-card-price-row {
          margin-top: auto;
          margin-bottom: 10px;
        }
        .cr-card-price-main {
          font-size: 15px;
          font-weight: 800;
          color: #0f172a;
        }
        .cr-card-price-sub {
          font-size: 11px;
          color: #64748b;
        }

        .cr-card-action-btn {
          width: 100%;
          border: none;
          border-radius: 9999px;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.15s ease;
        }
        .cr-card-action-btn.tech {
          background: #1e3a8a;
          color: #ffffff;
        }
        .cr-card-action-btn.tech:hover {
          background: #172554;
        }
        .cr-card-action-btn.moto {
          background: #dc2626;
          color: #ffffff;
        }
        .cr-card-action-btn.moto:hover {
          background: #b91c1c;
        }

        .cr-express-delivery-card {
          position: fixed;
          bottom: 84px;
          left: 18px;
          z-index: 45;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 12px 16px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.12);
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          animation: floatSlow 3s ease-in-out infinite alternate;
        }
        @media (min-width: 768px) {
          .cr-express-delivery-card {
            bottom: 24px;
            left: 24px;
          }
        }
        @keyframes floatSlow {
          0% { transform: translateY(0); }
          100% { transform: translateY(-4px); }
        }
        .cr-express-delivery-card:hover {
          box-shadow: 0 14px 35px rgba(0,0,0,0.18);
        }

        .cr-truck-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: #fef2f2;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #dc2626;
          flex-shrink: 0;
        }

        .cr-whatsapp-fab {
          position: fixed;
          bottom: 84px;
          right: 18px;
          z-index: 45;
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: #25d366;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 18px rgba(37, 211, 102, 0.45);
          cursor: pointer;
          border: none;
          transition: all 0.2s ease;
        }
        @media (min-width: 768px) {
          .cr-whatsapp-fab {
            bottom: 24px;
            right: 24px;
            width: 56px;
            height: 56px;
          }
        }
        .cr-whatsapp-fab:hover {
          transform: scale(1.08);
          background: #20ba59;
          box-shadow: 0 6px 24px rgba(37, 211, 102, 0.55);
        }

        .cr-mobile-bottom-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 62px;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-around;
          box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
        }
        @media (min-width: 768px) {
          .cr-mobile-bottom-bar {
            display: none;
          }
        }

        .cr-bottom-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          position: relative;
          flex: 1;
          height: 100%;
        }
        .cr-bottom-item.active {
          color: #1e3a8a;
        }
        .cr-bottom-badge {
          position: absolute;
          top: 6px;
          right: 28%;
          background: #dc2626;
          color: #ffffff;
          font-size: 9px;
          font-weight: 800;
          min-width: 15px;
          height: 15px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 2px;
        }

        .cr-drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(4px);
          z-index: 1000;
        }
        .cr-cart-drawer {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: min(440px, 100vw);
          background: #ffffff;
          box-shadow: -8px 0 32px rgba(0, 0, 0, 0.15);
          z-index: 1001;
          display: flex;
          flex-direction: column;
        }

        .cr-currency-toggle {
          display: flex;
          border: 1px solid #e2e8f0;
          border-radius: 9999px;
          background: #f1f5f9;
          padding: 2px;
        }
        .cr-currency-btn {
          border: none;
          background: transparent;
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          padding: 3px 8px;
          border-radius: 9999px;
          cursor: pointer;
        }
        .cr-currency-btn.active {
          background: #ffffff;
          color: #1e3a8a;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
      `}</style>

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            background: toast.type === 'info' ? '#0f172a' : '#166534',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 12,
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

      {/* 1. TOPBAR & IDENTIDAD CORPORATIVA */}
      <header className="cr-topbar">
        <div className="cr-topbar-inner">
          <button
            type="button"
            className="cr-icon-btn"
            style={{ display: 'flex' }}
            onClick={() => setIsMobileMenuOpen(prev => !prev)}
            aria-label="Menú de categorías"
          >
            <Menu size={22} />
          </button>

          <div
            className="cr-brand-group"
            onClick={() => {
              setActiveDivision('ALL');
              setSelectedCategory('ALL');
              setSearchTerm('');
            }}
          >
            <CompuRepuestosLogo size={44} />
            <div className="cr-brand-title">
              <span className="cr-title-compu">Compu</span>
              <span className="cr-title-repuestos">Repuestos</span>
              <span className="cr-brand-divider">·</span>
              <span className="cr-title-flores">Flores</span>
              <span className="cr-title-inversiones">Inversiones</span>
            </div>
          </div>

          <div className="cr-header-actions">
            <div className="cr-currency-toggle" title="Cambiar moneda">
              <button
                type="button"
                className={`cr-currency-btn ${activeCurrency === 'USD' ? 'active' : ''}`}
                onClick={() => setActiveCurrency('USD')}
              >
                USD ($)
              </button>
              <button
                type="button"
                className={`cr-currency-btn ${activeCurrency === 'VES' ? 'active' : ''}`}
                onClick={() => setActiveCurrency('VES')}
              >
                VES (Bs.)
              </button>
            </div>

            <button
              type="button"
              className="cr-icon-btn"
              onClick={async () => {
                // Check if user is logged in (use Supabase client)
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                  await supabase.auth.signOut();
                  showToast('Sesión cerrada correctamente.');
                } else {
                  setIsTrackerOpen(true); // Open login/tracker modal
                }
              }}
              title="Mi cuenta / Cerrar sesión"
            >
              <User size={22} />
            </button>

            <button
              type="button"
              className="cr-icon-btn"
              onClick={() => setIsCartOpen(true)}
              aria-label="Abrir carrito"
            >
              <ShoppingCart size={22} />
              <span className="cr-badge-count">{totalCartUnits}</span>
            </button>
          </div>
        </div>

        <div className="cr-mobile-search-row">
          <div className="cr-mobile-search-box">
            <input
              type="text"
              className="cr-mobile-search-input"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{ border: 'none', background: 'transparent', padding: '0 6px', color: '#94a3b8' }}
              >
                <X size={16} />
              </button>
            )}
            <button
              type="button"
              className="cr-mobile-search-btn"
              onClick={() => {}}
              aria-label="Buscar"
            >
              <Search size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. BANNERS PROMOCIONALES DUALES */}
      <section className="cr-hero-section">
        <button
          type="button"
          className="cr-carousel-arrow left"
          onClick={() => {
            setActiveDivision(prev => (prev === 'ALL' ? 'MOTOS' : prev === 'MOTOS' ? 'MATERIALES' : 'ALL'));
          }}
          aria-label="Banner anterior"
        >
          <ChevronLeft size={20} />
        </button>

        <button
          type="button"
          className="cr-carousel-arrow right"
          onClick={() => {
            setActiveDivision(prev => (prev === 'ALL' ? 'MATERIALES' : prev === 'MATERIALES' ? 'MOTOS' : 'ALL'));
          }}
          aria-label="Banner siguiente"
        >
          <ChevronRight size={20} />
        </button>

        <div className="cr-banners-grid">
          {/* BANNER 1: Flores Inversiones CompuFuturo (Laptops ocupando el contenedor) */}
          <div
            className="cr-banner-tech"
            onClick={() => {
              setActiveDivision('MATERIALES');
              setSelectedCategory('ALL');
            }}
          >
            <div>
              <div className="cr-banner-tagline">Flores Inversiones</div>
              <h2 className="cr-banner-tech-title">CompuFuturo</h2>
            </div>

            <div className="cr-banner-image-wrap">
              <img
                src="/src/assets/images/compufuturo_banner_1792208865686.jpg"
                alt="Flores Inversiones CompuFuturo"
                loading="lazy"
              />
            </div>

            <button
              type="button"
              className="cr-banner-btn-tech"
              onClick={e => {
                e.stopPropagation();
                setActiveDivision('MATERIALES');
                setSelectedCategory('ALL');
              }}
            >
              Copias y Materiales
            </button>
          </div>

          {/* BANNER 2: Acelera Motor Partes (Fondo oscuro con moto de alto rendimiento generada) */}
          <div
            className="cr-banner-moto"
            onClick={() => {
              setActiveDivision('MOTOS');
              setSelectedCategory('ALL');
            }}
          >
            <div className="cr-banner-moto-title-group">
              <h2 className="cr-banner-moto-brand">Acelera</h2>
              <div className="cr-banner-moto-sub">Motor Partes</div>
            </div>

            <div className="cr-banner-image-wrap">
              <img
                src="/src/assets/images/acelera_moto_banner_1792208844530.jpg"
                alt="Acelera Motor Partes Alta Rendimiento"
                loading="lazy"
              />
            </div>

            <button
              type="button"
              className="cr-banner-btn-moto"
              onClick={e => {
                e.stopPropagation();
                setActiveDivision('MOTOS');
                setSelectedCategory('ALL');
              }}
            >
              Comprar Repuestos
            </button>
          </div>
        </div>

        <div className="cr-carousel-dots">
          <span
            className={`cr-dot ${activeDivision === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveDivision('ALL')}
          />
          <span
            className={`cr-dot ${activeDivision === 'MATERIALES' ? 'active' : ''}`}
            onClick={() => setActiveDivision('MATERIALES')}
          />
          <span
            className={`cr-dot ${activeDivision === 'MOTOS' ? 'active' : ''}`}
            onClick={() => setActiveDivision('MOTOS')}
          />
        </div>
      </section>

      {/* 3. TÍTULO IZQUIERDO RENOMBRADO A "Materiales y Copias" Y TÍTULO DERECHO */}
      <div className="cr-desktop-subhead-row">
        <div className="cr-title-left">Materiales y Copias</div>

        <div className="cr-desktop-search-wrap">
          <input
            type="text"
            className="cr-desktop-search-input"
            placeholder="Buscar..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{ border: 'none', background: 'transparent', padding: '0 6px', color: '#94a3b8' }}
            >
              <X size={16} />
            </button>
          )}
          <button type="button" className="cr-desktop-search-btn" aria-label="Buscar">
            <Search size={18} />
          </button>
        </div>

        <div className="cr-title-right">Repuestos de Motos</div>
      </div>

      {/* 4. PASTILLAS DE FILTRO: CATEGORÍAS ESTRICTAMENTE DEL SISTEMA */}
      <div className="cr-chips-container">
        <div className="cr-mobile-heading-switcher">
          <h3
            className="cr-mobile-heading-title"
            style={{ color: activeDivision === 'MOTOS' ? '#b91c1c' : '#1e3a8a' }}
          >
            {activeDivision === 'MOTOS'
              ? 'Repuestos de Motos'
              : activeDivision === 'MATERIALES'
              ? 'Materiales y Copias'
              : 'Materiales & Repuestos'}
          </h3>

          <div className="cr-mobile-toggle-group">
            <button
              type="button"
              className={`cr-mobile-tab-btn ${activeDivision === 'MATERIALES' ? 'active-tech' : ''}`}
              onClick={() => {
                setActiveDivision(activeDivision === 'MATERIALES' ? 'ALL' : 'MATERIALES');
                setSelectedCategory('ALL');
              }}
            >
              Materiales y Copias
            </button>
            <button
              type="button"
              className={`cr-mobile-tab-btn ${activeDivision === 'MOTOS' ? 'active-moto' : ''}`}
              onClick={() => {
                setActiveDivision(activeDivision === 'MOTOS' ? 'ALL' : 'MOTOS');
                setSelectedCategory('ALL');
              }}
            >
              Repuestos de Motos
            </button>
          </div>

          {/* Mobile categories scroll */}
          <div className="cr-mobile-categories-scroll">
            <button
              type="button"
              className={`cr-chip ${selectedCategory === 'ALL' ? (activeDivision === 'MOTOS' ? 'active-red' : 'active-blue') : ''}`}
              onClick={() => setSelectedCategory('ALL')}
            >
              Todas
            </button>
            {systemCategories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`cr-chip ${selectedCategory === cat ? (motoCategories.includes(cat) ? 'active-red' : 'active-blue') : ''}`}
                onClick={() => setSelectedCategory(selectedCategory === cat ? 'ALL' : cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Chips (System Categories Recorded in DB) */}
        <div className="cr-desktop-chips-row">
          <div className="cr-chip-group">
            <button
              type="button"
              className={`cr-chip ${activeDivision === 'MATERIALES' && selectedCategory === 'ALL' ? 'active-blue' : ''}`}
              onClick={() => {
                setActiveDivision('MATERIALES');
                setSelectedCategory('ALL');
              }}
            >
              Todas (Materiales)
            </button>
            {materialCategories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`cr-chip ${selectedCategory === cat ? 'active-blue' : ''}`}
                onClick={() => {
                  setActiveDivision('MATERIALES');
                  setSelectedCategory(selectedCategory === cat ? 'ALL' : cat);
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {(activeDivision !== 'ALL' || selectedCategory !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setActiveDivision('ALL');
                setSelectedCategory('ALL');
                setSearchTerm('');
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Ver Todo el Catálogo
            </button>
          )}

          <div className="cr-chip-group">
            <button
              type="button"
              className={`cr-chip ${activeDivision === 'MOTOS' && selectedCategory === 'ALL' ? 'active-red' : ''}`}
              onClick={() => {
                setActiveDivision('MOTOS');
                setSelectedCategory('ALL');
              }}
            >
              Todas (Motos)
            </button>
            {motoCategories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`cr-chip ${selectedCategory === cat ? 'active-red' : ''}`}
                onClick={() => {
                  setActiveDivision('MOTOS');
                  setSelectedCategory(selectedCategory === cat ? 'ALL' : cat);
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 5. CATÁLOGO DE PRODUCTOS (5 estrellas, precios bimonetarios, bordes redondeados) */}
      <main className="cr-catalog-wrap">
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            Cargando catálogo CompuRepuestos Flores Inversiones...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <Package size={48} style={{ color: '#cbd5e1', margin: '0 auto 12px' }} />
            <h3 style={{ margin: '0 0 6px', color: '#0f172a' }}>No hay productos en esta categoría del sistema</h3>
            <p style={{ fontSize: 13, margin: 0 }}>Agregue productos en el módulo de Inventario para visualizarlos aquí en tiempo real.</p>
            <button
              type="button"
              onClick={() => {
                setActiveDivision('ALL');
                setSelectedCategory('ALL');
                setSearchTerm('');
              }}
              style={{
                marginTop: 16,
                padding: '8px 20px',
                borderRadius: 9999,
                background: '#1e3a8a',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Mostrar todo el inventario
            </button>
          </div>
        ) : (
          <div className="cr-product-grid">
            {filteredProducts.map(product => {
              const prices = formatPrice(product.priceUsd);
              const isMaterial =
                (product.category || '').toLowerCase().includes('material') ||
                (product.category || '').toLowerCase().includes('copia') ||
                (product.category || '').toLowerCase().includes('papel') ||
                (product.category || '').toLowerCase().includes('oficina') ||
                (product.brand || '').toLowerCase().includes('futuro') ||
                (product.brand || '').toLowerCase().includes('flores');

              return (
                <div key={product.sku} className="cr-product-card">
                  <div
                    className="cr-card-image-box"
                    onClick={() => setQuickViewProduct(product)}
                    style={{ cursor: 'pointer' }}
                  >
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} loading="lazy" />
                    ) : (
                      <Package size={40} style={{ color: '#cbd5e1' }} />
                    )}

                    {product.stock <= 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                          background: '#ef4444',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4
                        }}
                      >
                        Agotado
                      </span>
                    )}
                  </div>

                  <div className="cr-card-content">
                    <h4 className="cr-card-title" title={product.name}>
                      {product.name}
                    </h4>

                    {/* 5-star ratings */}
                    <div className="cr-card-stars">
                      <Star size={11} fill="#eab308" strokeWidth={0} />
                      <Star size={11} fill="#eab308" strokeWidth={0} />
                      <Star size={11} fill="#eab308" strokeWidth={0} />
                      <Star size={11} fill="#eab308" strokeWidth={0} />
                      <Star size={11} fill="#eab308" strokeWidth={0} />
                    </div>

                    {/* Bimonetary pricing */}
                    <div className="cr-card-price-row">
                      <div className="cr-card-price-main">{prices.main}</div>
                      <div className="cr-card-price-sub">≈ {prices.sub} (BCV)</div>
                    </div>

                    <button
                      type="button"
                      disabled={product.stock <= 0}
                      className={`cr-card-action-btn ${isMaterial ? 'tech' : 'moto'}`}
                      onClick={() => addToCart(product)}
                    >
                      <ShoppingCart size={13} />
                      <span>{isMaterial ? 'Copias y Materiales' : 'Comprar Repuestos'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 6. CALLOUT: SERVICIOS EXPRESOS ENTREGA LOCAL */}
      <div
        className="cr-express-delivery-card"
        onClick={() => handleOpenWhatsApp('Hola CompuRepuestos Flores Inversiones, me interesa el servicio de entrega local para un pedido.')}
        title="Consultar servicio de despacho local inmediato"
      >
        <div className="cr-truck-icon-wrap">
          <Truck size={24} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
            Servicios Expresos
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Entrega local</div>
        </div>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#25d366',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 4
          }}
        >
          <MessageCircle size={14} />
        </div>
      </div>

      {/* 7. FLOATING WHATSAPP BUTTON */}
      <button
        type="button"
        className="cr-whatsapp-fab"
        onClick={() => handleOpenWhatsApp()}
        aria-label="Atención al cliente por WhatsApp"
        title="Contactar por WhatsApp"
      >
        <MessageCircle size={28} />
      </button>

      {/* 8. MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="cr-mobile-bottom-bar">
        <button
          type="button"
          className="cr-bottom-item active"
          onClick={() => {
            setActiveDivision('ALL');
            setSelectedCategory('ALL');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Home size={20} />
          <span>Inicio</span>
        </button>

        <button
          type="button"
          className="cr-bottom-item"
          onClick={() => handleOpenWhatsApp('Hola, quisiera comunicarme con atención al cliente.')}
        >
          <Phone size={20} />
          <span>Llamar</span>
          <span className="cr-bottom-badge">0</span>
        </button>

        <button
          type="button"
          className="cr-bottom-item"
          onClick={() => handleOpenWhatsApp()}
        >
          <MessageCircle size={20} />
          <span>WhatsApp</span>
          <span className="cr-bottom-badge">0</span>
        </button>

        <button
          type="button"
          className="cr-bottom-item"
          onClick={() => setIsTrackerOpen(true)}
        >
          <FileText size={20} />
          <span>Pedidos</span>
          <span className="cr-bottom-badge">0</span>
        </button>

        <button
          type="button"
          className="cr-bottom-item"
          onClick={() => setIsCartOpen(true)}
        >
          <CreditCard size={20} />
          <span>Carrito</span>
          {totalCartUnits > 0 && <span className="cr-bottom-badge">{totalCartUnits}</span>}
        </button>
      </nav>

      {/* 9. MOBILE DRAWER MENU */}
      {isMobileMenuOpen && (
        <>
          <div className="cr-drawer-backdrop" onClick={() => setIsMobileMenuOpen(false)} />
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: 'min(300px, 80vw)',
              background: '#ffffff',
              zIndex: 1050,
              boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              padding: 20
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div className="cr-brand-group">
                <CompuRepuestosLogo size={36} />
                <div style={{ fontSize: 15, fontWeight: 800 }}>
                  <span className="cr-title-compu">Compu</span>
                  <span className="cr-title-repuestos">Repuestos</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', margin: '8px 0 4px' }}>
                Divisiones
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveDivision('ALL');
                  setSelectedCategory('ALL');
                  setIsMobileMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: activeDivision === 'ALL' ? '#f1f5f9' : 'transparent',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Layers size={16} />
                <span>Todo el Catálogo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveDivision('MATERIALES');
                  setSelectedCategory('ALL');
                  setIsMobileMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: activeDivision === 'MATERIALES' ? '#eff6ff' : 'transparent',
                  color: '#1e3a8a',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Package size={16} />
                <span>Materiales y Copias</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveDivision('MOTOS');
                  setSelectedCategory('ALL');
                  setIsMobileMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: activeDivision === 'MOTOS' ? '#fef2f2' : 'transparent',
                  color: '#dc2626',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Truck size={16} />
                <span>Repuestos de Motos</span>
              </button>

              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', margin: '18px 0 4px' }}>
                Categorías del Sistema
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {systemCategories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat);
                      setIsMobileMenuOpen(false);
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: selectedCategory === cat ? '#f1f5f9' : 'transparent',
                      textAlign: 'left',
                      fontSize: 12.5,
                      color: selectedCategory === cat ? '#1e3a8a' : '#475569',
                      fontWeight: selectedCategory === cat ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  navigate('/ventas-flash/pedidos');
                  setIsMobileMenuOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'transparent',
                  color: '#64748b',
                  fontSize: 12,
                  cursor: 'pointer',
                  marginTop: 'auto'
                }}
              >
                <Building size={14} />
                <span>Acceso Administrativo</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* 10. CART DRAWER */}
      {isCartOpen && (
        <>
          <div className="cr-drawer-backdrop" onClick={() => setIsCartOpen(false)} />
          <div className="cr-cart-drawer">
            <div
              style={{
                padding: '18px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShoppingCart size={20} style={{ color: '#1e3a8a' }} />
                <h3 style={{ margin: 0, fontSize: 16 }}>Carrito CompuRepuestos</h3>
                <span
                  style={{
                    background: '#eff6ff',
                    color: '#1e3a8a',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 700
                  }}
                >
                  {totalCartUnits} ítems
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cart.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                  <ShoppingCart size={40} style={{ color: '#cbd5e1', margin: '0 auto 12px' }} />
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Tu carrito está vacío</div>
                  <div style={{ fontSize: 12 }}>Agrega artículos del catálogo para comenzar.</div>
                </div>
              ) : (
                cart.map(item => {
                  const itemTotalUSD = item.product.priceUsd * item.quantity;
                  const itemPriceFormatted = formatPrice(itemTotalUSD);

                  return (
                    <div
                      key={item.product.sku}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: 12,
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        background: '#ffffff'
                      }}
                    >
                      <div
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: 8,
                          background: '#f8fafc',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          overflow: 'hidden'
                        }}
                      >
                        {item.product.image_url ? (
                          <img
                            src={item.product.image_url}
                            alt={item.product.name}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                        ) : (
                          <Package size={22} style={{ color: '#cbd5e1' }} />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#0f172a',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {item.product.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                          SKU: {item.product.sku}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.product.sku, -1)}
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 4,
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
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
                                width: 24,
                                height: 24,
                                borderRadius: 4,
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
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
                            <div style={{ fontSize: 10, color: '#64748b' }}>{itemPriceFormatted.sub}</div>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.sku)}
                        style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {cart.length > 0 && (
              <div style={{ padding: 20, borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>Total USD:</span>
                  <b>{formatUSD(totalCartUSD)}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 15 }}>
                  <span style={{ fontWeight: 700 }}>Total en Bolívares (BCV):</span>
                  <b style={{ color: '#1e3a8a' }}>{formatVES(totalCartVES)}</b>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={clearCart}
                    style={{
                      flex: 1,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      borderRadius: 10,
                      padding: 10,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Vaciar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session) {
                        showToast('Debes iniciar sesión para finalizar la compra.');
                        setIsCartOpen(false);
                        setIsTrackerOpen(true); // Reutilizar modal de seguimiento/login
                        return;
                      }
                      setIsCartOpen(false);
                      setCheckoutStep(1);
                      setIsCheckoutOpen(true);
                    }}
                    style={{
                      flex: 2,
                      border: 'none',
                      background: '#1e3a8a',
                      color: '#fff',
                      borderRadius: 10,
                      padding: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: 'pointer'
                    }}
                  >
                    <span>Procesar Compra</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* 11. CHECKOUT MODAL */}
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
              width: 'min(600px, 100%)',
              maxHeight: '90vh',
              background: '#ffffff',
              borderRadius: 20,
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>Confirmación de Pedido</h3>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  CompuRepuestos Flores Inversiones · Pasarela Bimonetaria USD / VES
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {checkoutStep < 4 && (
              <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
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
                      color: checkoutStep === s.step ? '#1e3a8a' : '#94a3b8',
                      borderBottom: checkoutStep === s.step ? '2px solid #1e3a8a' : 'none',
                      background: checkoutStep === s.step ? '#ffffff' : 'transparent'
                    }}
                  >
                    {s.label}
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              {checkoutStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Nombre y Apellido *</label>
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
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Teléfono móvil (WhatsApp) *</label>
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
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Cédula o RIF</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej. V-18234567"
                      value={customerDoc}
                      onChange={e => setCustomerDoc(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {checkoutStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div
                      onClick={() => setDeliveryMethod('RETIRO')}
                      style={{
                        padding: 16,
                        border: deliveryMethod === 'RETIRO' ? '2px solid #1e3a8a' : '1px solid #e2e8f0',
                        background: deliveryMethod === 'RETIRO' ? '#eff6ff' : '#ffffff',
                        borderRadius: 12,
                        cursor: 'pointer'
                      }}
                    >
                      <b style={{ fontSize: 13 }}>Retiro en Tienda</b>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                        Retira en sede central sin costo.
                      </div>
                    </div>

                    <div
                      onClick={() => setDeliveryMethod('DOMICILIO')}
                      style={{
                        padding: 16,
                        border: deliveryMethod === 'DOMICILIO' ? '2px solid #1e3a8a' : '1px solid #e2e8f0',
                        background: deliveryMethod === 'DOMICILIO' ? '#eff6ff' : '#ffffff',
                        borderRadius: 12,
                        cursor: 'pointer'
                      }}
                    >
                      <b style={{ fontSize: 13 }}>Entrega a Domicilio</b>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                        Despacho local express a tu puerta.
                      </div>
                    </div>
                  </div>

                  {deliveryMethod === 'DOMICILIO' && (
                    <div className="field">
                      <label style={{ fontSize: 12, fontWeight: 700 }}>Dirección exacta de entrega *</label>
                      <textarea
                        className="input"
                        style={{ height: 70, padding: 10 }}
                        placeholder="Calle, edificio/casa, punto de referencia..."
                        value={deliveryAddress}
                        onChange={e => setDeliveryAddress(e.target.value)}
                        required
                      />
                    </div>
                  )}
                </div>
              )}

              {checkoutStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Método de Pago</label>
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

                  <div
                    style={{
                      background: '#f8fafc',
                      padding: 14,
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      fontSize: 12.5,
                      lineHeight: 1.6
                    }}
                  >
                    <b>Datos para el pago:</b><br />
                    Monto total: <b style={{ color: '#1e3a8a' }}>{formatVES(totalCartVES)} / {formatUSD(totalCartUSD)}</b><br />
                    Tasa BCV del día: <b>Bs. {bcvRate.toFixed(2)}</b>
                  </div>

                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Número de Referencia (opcional)</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Ej. 123456"
                      value={paymentReference}
                      onChange={e => setPaymentReference(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {checkoutStep === 4 && completedOrder && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      background: '#eff6ff',
                      color: '#1e3a8a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px'
                    }}
                  >
                    <CheckCircle size={36} />
                  </div>
                  <h3 style={{ margin: '0 0 6px', fontSize: 20 }}>¡Pedido Recibido con Éxito!</h3>
                  <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                    Tu orden número <b>{completedOrder.order_number}</b> ha sido registrada en CompuRepuestos Flores Inversiones.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCheckoutOpen(false);
                      setCompletedOrder(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: 12,
                      background: '#1e3a8a',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Volver a la tienda
                  </button>
                </div>
              )}
            </div>

            {checkoutStep < 4 && (
              <div
                style={{
                  padding: '16px 24px',
                  borderTop: '1px solid #e2e8f0',
                  background: '#f8fafc',
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
                  <button
                    type="button"
                    onClick={() => {
                      if (checkoutStep === 1 && (!customerName.trim() || !customerPhone.trim())) {
                        showToast('Nombre y teléfono son obligatorios.', 'info');
                        return;
                      }
                      if (checkoutStep === 2 && deliveryMethod === 'DOMICILIO' && !deliveryAddress.trim()) {
                        showToast('Ingrese la dirección de entrega.', 'info');
                        return;
                      }
                      setCheckoutStep(prev => (prev + 1) as any);
                    }}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 10,
                      background: '#1e3a8a',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Siguiente
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSubmittingOrder}
                    onClick={handleConfirmOrder}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 10,
                      background: '#1e3a8a',
                      color: '#ffffff',
                      border: 'none',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {isSubmittingOrder ? 'Procesando...' : 'Confirmar Pedido'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 12. QUICK VIEW MODAL */}
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
              width: 'min(500px, 100%)',
              background: '#ffffff',
              borderRadius: 20,
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
                color: '#94a3b8'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div
                style={{
                  width: 110,
                  height: 110,
                  borderRadius: 12,
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                {quickViewProduct.image_url ? (
                  <img
                    src={quickViewProduct.image_url}
                    alt={quickViewProduct.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <Package size={40} style={{ color: '#cbd5e1' }} />
                )}
              </div>

              <div>
                <span
                  style={{
                    background: quickViewProduct.stock > 0 ? '#eff6ff' : '#fef2f2',
                    color: quickViewProduct.stock > 0 ? '#1e3a8a' : '#dc2626',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 9999
                  }}
                >
                  {quickViewProduct.stock > 0 ? `${quickViewProduct.stock} disponibles` : 'Sin stock'}
                </span>
                <h3 style={{ margin: '6px 0 4px', fontSize: 16 }}>{quickViewProduct.name}</h3>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Código: <b>{quickViewProduct.sku}</b> · Marca: <b>{quickViewProduct.brand || 'CompuRepuestos Flores Inversiones'}</b>
                </div>
              </div>
            </div>

            <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginBottom: 16 }}>
              {quickViewProduct.description}
            </p>

            <div
              style={{
                background: '#f8fafc',
                padding: 14,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: '#64748b' }}>Precio</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>
                  {formatPrice(quickViewProduct.priceUsd).main}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                ≈ {formatPrice(quickViewProduct.priceUsd).sub} (BCV)
              </div>
            </div>

            <button
              type="button"
              disabled={quickViewProduct.stock <= 0}
              onClick={() => {
                addToCart(quickViewProduct);
                setQuickViewProduct(null);
              }}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 9999,
                background: '#1e3a8a',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {quickViewProduct.stock > 0 ? 'Agregar al Carrito' : 'Producto Sin Stock'}
            </button>
          </div>
        </div>
      )}

      {/* 13. AUTH MODAL ("CREAR CUENTA") */}
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
              width: 'min(400px, 100%)',
              background: '#ffffff',
              borderRadius: 20,
              padding: 32,
              boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 id="auth-modal-title" style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, color: '#172033' }}>
              Iniciar sesión
            </h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748b' }}>
              Ingresa a tu espacio de gestión empresarial.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Registration Fields - Now hidden by default */}
              <div id="register_fields" style={{ display: 'none', flexDirection: 'column', gap: 16 }}>
                <div className="field">
                  <label style={{ fontSize: 13, fontWeight: 650, color: '#172033' }}>Nombre completo</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 4 }}>
                    <User size={18} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
                    <input type="text" className="input" placeholder="Tu nombre" id="auth_full_name" style={{ paddingLeft: 40 }} />
                  </div>
                </div>
                <div className="field">
                  <label style={{ fontSize: 13, fontWeight: 650, color: '#172033' }}>Nombre de la empresa</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 4 }}>
                    <Building size={18} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
                    <input type="text" className="input" placeholder="Mi empresa" id="auth_company" style={{ paddingLeft: 40 }} />
                  </div>
                </div>
              </div>

              <div className="field">
                <label style={{ fontSize: 13, fontWeight: 650, color: '#172033' }}>Correo electrónico</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 4 }}>
                  <Mail size={18} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
                  <input type="email" className="input" placeholder="correo@ejemplo.com" id="auth_email" style={{ paddingLeft: 40 }} />
                </div>
              </div>
              
              <div className="field">
                <label style={{ fontSize: 13, fontWeight: 650, color: '#172033' }}>Contraseña</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 4 }}>
                  <LockKeyhole size={18} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
                  <input type="password" className="input" placeholder="Mínimo 8 caracteres" id="auth_password" style={{ paddingLeft: 40 }} />
                  <Eye size={18} style={{ position: 'absolute', right: 12, color: '#94a3b8', cursor: 'pointer' }} />
                </div>
              </div>

              {/* Confirm Password Field - Hidden by default */}
              <div id="confirm_password_field" style={{ display: 'none', flexDirection: 'column', gap: 16 }}>
                <div className="field">
                  <label style={{ fontSize: 13, fontWeight: 650, color: '#172033' }}>Confirmar contraseña</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 4 }}>
                    <LockKeyhole size={18} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
                    <input type="password" className="input" placeholder="Repite la contraseña" id="auth_confirm_password" style={{ paddingLeft: 40 }} />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  const regFields = document.getElementById('register_fields')!;
                  const isRegistering = regFields.style.display === 'flex';
                  
                  const email = (document.getElementById('auth_email') as HTMLInputElement).value;
                  const password = (document.getElementById('auth_password') as HTMLInputElement).value;
                  
                  if (!isRegistering) {
                    // Login
                    const { error } = await supabase.auth.signInWithPassword({ email, password });
                    if (error) showToast(error.message, 'info');
                    else {
                      showToast('Sesión iniciada.');
                      setIsTrackerOpen(false);
                    }
                  } else {
                    // Register
                    const full_name = (document.getElementById('auth_full_name') as HTMLInputElement).value;
                    const confirmPassword = (document.getElementById('auth_confirm_password') as HTMLInputElement).value;
                    
                    if (password !== confirmPassword) {
                      showToast('Las contraseñas no coinciden.', 'info');
                      return;
                    }

                    fetch('/api/auth/customer/register', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email, password, full_name })
                    }).then(r => r.json()).then(data => {
                      if (data.success) {
                        showToast('Cuenta creada. Inicia sesión.');
                        // Toggle back to login
                        regFields.style.display = 'none';
                        document.getElementById('confirm_password_field')!.style.display = 'none';
                        document.getElementById('auth-modal-title')!.innerText = 'Iniciar sesión';
                      } else {
                        showToast(data.error, 'info');
                      }
                    });
                  }
                }}
                style={{ width: '100%', padding: 12, borderRadius: 10, background: '#4c1d95', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <LogIn size={18} /> Iniciar sesión
              </button>
              
              <button
                type="button"
                onClick={() => {
                  const regFields = document.getElementById('register_fields')!;
                  const confirmFields = document.getElementById('confirm_password_field')!;
                  const title = document.getElementById('auth-modal-title')!;
                  const btn = document.querySelector('button[type="button"][style*="background: #4c1d95"]') as HTMLButtonElement;
                  
                  if (regFields.style.display === 'none') {
                    regFields.style.display = 'flex';
                    confirmFields.style.display = 'flex';
                    title.innerText = 'Crear cuenta';
                    btn.innerText = 'Crear cuenta';
                  } else {
                    regFields.style.display = 'none';
                    confirmFields.style.display = 'none';
                    title.innerText = 'Iniciar sesión';
                    btn.innerText = 'Iniciar sesión';
                  }
                }}
                style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer' }}
              >
                {document.getElementById('register_fields')?.style.display === 'flex' ? (
                  <>¿Ya tienes una cuenta? <span style={{ color: '#4c1d95', fontWeight: 600 }}>Inicia sesión</span></>
                ) : (
                  <>¿No tienes una cuenta? <span style={{ color: '#4c1d95', fontWeight: 600 }}>Regístrate aquí</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer
        style={{
          borderTop: '1px solid #f1f5f9',
          background: '#ffffff',
          padding: '20px 24px',
          textAlign: 'center',
          fontSize: 12,
          color: '#94a3b8'
        }}
      >
        <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            © {new Date().getFullYear()} <b>CompuRepuestos · Flores Inversiones</b> · Materiales, Copias y Repuestos de Motos
          </div>
          <button
            type="button"
            onClick={() => navigate('/ventas-flash/pedidos')}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#1e3a8a',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Acceso Administrativo
          </button>
        </div>
      </footer>
    </div>
  );
}
