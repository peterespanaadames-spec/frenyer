import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  EyeOff,
  UserPlus,
  LayoutDashboard,
  ShieldCheck,
  LogOut,
  UserCheck,
  ChevronDown,
  Heart
} from 'lucide-react';
import { supabase } from '../../../lib/supabase/client';
import { setSessionHandle, withSessionInit } from '../../../lib/supabase/api';
import { isInternalRole } from '../../../lib/auth/roles';
import {
  getActiveExchangeRate,
  convertUSDtoVES,
  formatUSD,
  formatVES
} from '../../../lib/currency';
import {
  DEFAULT_BUSINESS_PROFILE,
  applyBrandingToDocument,
  getBusinessProfile,
  withBusinessDefaults
} from '../../../lib/businessProfile';
import {
  fetchProductsFromSupabase,
  fetchPublicConfigFromApi,
  fetchPublicProductsFromSupabase,
  createOrderInApi,
  fetchOrdersFromApi
} from '../../../lib/supabase/db';
import {
  Currency,
  Product,
  CartItem,
  DeliveryMethod,
  PaymentMethod,
  PublicBusinessConfig
} from '../../../types/domain';
import { CustomerPortal, type PortalTab } from '../components/CustomerPortal';
import { lookupCedula, parseCedulaDoc, useCedulaAutofill } from '../../../lib/cedulaLookup';
import { OrderTrackerModal } from '../components/OrderTrackerModal';
import { Button } from '../../../components/ui/Button';

/** Logotipo dinámico de la tienda: muestra la imagen cargada por el negocio o un monograma limpio. */
function StoreBrandLogo({
  logo,
  businessName,
  size = 44,
  className = ''
}: {
  logo?: string | null;
  businessName: string;
  size?: number;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [logo]);

  const initials = (businessName || 'SF')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('') || 'SF';

  if (logo && !imgError) {
    return (
      <div
        className={`store-brand-logo-box ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(8, Math.round(size * 0.22)),
          border: '1px solid #e2e8f0',
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: 3,
          flexShrink: 0
        }}
      >
        <img
          src={logo}
          alt={businessName}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    );
  }

  return (
    <div
      className={`store-brand-logo-box ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(8, Math.round(size * 0.22)),
        background: '#0f172a',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: Math.max(12, Math.round(size * 0.36)),
        letterSpacing: '-0.02em',
        flexShrink: 0
      }}
    >
      {initials}
    </div>
  );
}

/**
 * La sesion vive en el servidor (cookie httpOnly): se consulta por HTTP.
 * El navegador nunca maneja la credencial de Supabase.
 */
async function fetchServerSession(): Promise<any | null> {
  try {
    const res = await fetch('/api/auth/session', withSessionInit());
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.data?.sessionId) {
      setSessionHandle(json.data.sessionId);
    }
    if (!json?.data?.user) return null;
    return {
      ...json.data.user,
      role: json.data.role || json.data.user?.user_metadata?.role
    };
  } catch {
    return null;
  }
}

export function ShopPage() {
  const navigate = useNavigate();
  const { slug: urlSlug } = useParams<{ slug?: string }>();
  const cartStorageKey = urlSlug ? `frenyer_shop_cart_${urlSlug}` : 'frenyer_shop_cart';

  // --- STATE: CATALOG & CONFIG ---
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [businessConfig, setBusinessConfig] = useState<PublicBusinessConfig>(() => {
    const baseProfile = urlSlug ? DEFAULT_BUSINESS_PROFILE : withBusinessDefaults(getBusinessProfile());
    return {
      slug: urlSlug || baseProfile.slug,
      businessName: baseProfile.businessName,
      rif: baseProfile.rif,
      phone: baseProfile.phone,
      email: baseProfile.email,
      address: baseProfile.address,
      slogan: baseProfile.slogan,
      logo: baseProfile.logo,
      favicon: baseProfile.favicon,
      whatsapp: baseProfile.whatsapp || baseProfile.phone,
      bcvRate: getActiveExchangeRate(),
      bcvRateDate: 'Actual',
      branches: [
        { id: 'suc-01', name: 'Sede Principal', address: baseProfile.address }
      ]
    };
  });

  // --- STATE: CURRENCY & RATE ---
  const [activeCurrency, setActiveCurrency] = useState<Currency>('USD');
  const [bcvRate, setBcvRate] = useState<number>(() => getActiveExchangeRate());

  // --- STATE: CATEGORY FILTERS ---
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Mobile drawer menu
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- STATE: CART (aislado por tienda/slug) ---
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(urlSlug ? `frenyer_shop_cart_${urlSlug}` : 'frenyer_shop_cart');
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
  const [isCustomerPortalOpen, setIsCustomerPortalOpen] = useState(false);
  const [customerPortalTab, setCustomerPortalTab] = useState<PortalTab>('pedidos');
  const [isOrderTrackerOpen, setIsOrderTrackerOpen] = useState(false);
  const [selectedTrackingOrder, setSelectedTrackingOrder] = useState<any>(null);
  const [isAuthRegisterMode, setIsAuthRegisterMode] = useState(false);
  const [authFullName, setAuthFullName] = useState('');
  const [authCompany, setAuthCompany] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authShowPassword, setAuthShowPassword] = useState(false);
  const [authShowConfirmPassword, setAuthShowConfirmPassword] = useState(false);
  const [authIsLoading, setAuthIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [trackerQuery, setTrackerQuery] = useState('');
  const [trackedOrders, setTrackedOrders] = useState<any[]>([]);
  const [isSearchingOrders, setIsSearchingOrders] = useState(false);

  // Menú desplegable multimoneda (solo móvil: botón compacto que expande opciones)
  const [isCurrencyMenuOpen, setIsCurrencyMenuOpen] = useState(false);

  // Sesión y Rol (Cliente vs Usuario Asociado)
  const [currentAuthUser, setCurrentAuthUser] = useState<any>(null);
  const [currentUserRole, setCurrentUserRole] = useState<'cliente' | 'asociado' | null>(() => {
    const r = localStorage.getItem('frenyer_user_role');
    if (r === 'cliente') return 'cliente';
    if (r && r !== 'cliente') return 'asociado';
    return null;
  });
  const [associatedUserData, setAssociatedUserData] = useState<any>(() => {
    try {
      const stored = localStorage.getItem('frenyer_active_user');
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  });
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [wishlistSkus, setWishlistSkus] = useState<string[]>([]);

  const isProductInWishlist = useCallback(
    (sku: string) => wishlistSkus.includes(sku),
    [wishlistSkus]
  );

  const refreshWishlist = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/portal', withSessionInit());
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && Array.isArray(json.data?.wishlist)) {
        setWishlistSkus(json.data.wishlist.map((item: any) => item.sku).filter(Boolean));
      }
    } catch {
      // Sin sesion activa no hay lista de deseo que sincronizar.
    }
  }, []);

  useEffect(() => {
    if (currentUserRole === 'cliente') {
      refreshWishlist();
    } else {
      setWishlistSkus([]);
    }
  }, [currentUserRole, refreshWishlist]);

  const toggleWishlistProduct = useCallback(
    async (product: Product) => {
      try {
        const res = await fetch(
          '/api/customer/wishlist',
          withSessionInit({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_id: product.id || product.sku,
              sku: product.sku,
              name: product.name,
              price_usd: product.priceUsd,
              image_url: product.image_url
            })
          })
        );
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success && Array.isArray(json.data?.wishlist)) {
          setWishlistSkus(json.data.wishlist.map((item: any) => item.sku).filter(Boolean));
          showToast(json.data.saved ? `${product.name} guardado en tu lista de deseo.` : `${product.name} quitado de tu lista de deseo.`);
        }
      } catch {
        showToast('No se pudo actualizar tu lista de deseo.', 'info');
      }
    },
    []
  );

  const handleVerifyUserRoleAndConfigure = async (user: any, isExplicitLogin = false) => {
    if (!user || !user.email) return;

    try {
      const res = await fetch('/api/users', withSessionInit());
      let associatedUsers: any[] = [];
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          associatedUsers = json.data;
        }
      }

      const cleanEmail = user.email.trim().toLowerCase();
      const matched = associatedUsers.find(
        (u: any) => u.email && u.email.trim().toLowerCase() === cleanEmail
      );

      const metadataRole = (user.user_metadata?.role || '').toLowerCase();

      // Regla simple: es CLIENTE por defecto. Solo es usuario interno quien
      // está registrado en la base de usuarios del ERP o trae un rol interno.
      const isCustomer = !matched && !isInternalRole(metadataRole);

      if (!isCustomer) {
        // --- ES USUARIO ASOCIADO / ADMINISTRATIVO DEL ERP ---
        if (matched && matched.active === false) {
          await fetch('/api/auth/logout', withSessionInit({ method: 'POST' }));
          setSessionHandle(null);
          localStorage.removeItem('frenyer_active_user');
          localStorage.removeItem('frenyer_user_role');
          localStorage.removeItem('frenyer_user_permissions');
          setCurrentAuthUser(null);
          setCurrentUserRole(null);
          setAssociatedUserData(null);
          throw new Error('Este usuario asociado se encuentra inactivo en el sistema. Contacta al Administrador.');
        }

        const effectiveRole = matched?.role || user.user_metadata?.role || 'Admin';
        const effectiveName = matched?.name || user.user_metadata?.full_name || user.email.split('@')[0] || 'Administrador';
        const names = effectiveName.trim().split(/\s+/);
        const initials = names.length >= 2 ? `${names[0][0]}${names[1][0]}`.toUpperCase() : names[0].slice(0, 2).toUpperCase();

        const activeConfig = {
          id: matched?.id || user.id,
          name: effectiveName,
          email: cleanEmail,
          role: effectiveRole,
          title: matched?.title || user.user_metadata?.title || 'Personal Asociado',
          active: true,
          initials,
          permissions: Array.isArray(matched?.permissions) && matched.permissions.length > 0
            ? matched.permissions
            : (String(effectiveRole).toLowerCase().includes('admin') || cleanEmail === 'fotocopiasfyp@gmail.com'
                ? ['ventas', 'inventario', 'finanzas', 'reportes', 'usuarios']
                : ['ventas', 'inventario', 'reportes']),
          created_at: matched?.created_at || new Date().toISOString()
        };

        localStorage.setItem('frenyer_active_user', JSON.stringify(activeConfig));
        localStorage.setItem('frenyer_user_permissions', JSON.stringify(activeConfig.permissions));
        localStorage.setItem('frenyer_user_role', activeConfig.role);
        window.dispatchEvent(new CustomEvent('frenyer:active-user-changed', { detail: activeConfig }));

        setCurrentUserRole('asociado');
        setAssociatedUserData(activeConfig);
        setCurrentAuthUser(user);

        // --- ACCESO AL PANEL ADMINISTRATIVO SI ES LOGIN EXPLÍCITO ---
        console.log('DEBUG: Is associated/admin, effectiveRole:', effectiveRole, 'isExplicitLogin:', isExplicitLogin);
        if (isExplicitLogin) {
          showToast(`¡Bienvenido(a), ${activeConfig.name}! Rol: ${activeConfig.role}. Accediendo al panel administrativo.`);
          setIsTrackerOpen(false);
          setTimeout(() => {
            navigate('/dashboard');
          }, 400);
        } else {
          // Regreso a la tienda sin aviso de bienvenida (el usuario ya está en sesión)
          setIsTrackerOpen(false);
        }

        return activeConfig;
      } else {
        // --- ES CLIENTE DE LA TIENDA E-COMMERCE ---
        localStorage.setItem('frenyer_user_role', 'cliente');
        localStorage.removeItem('frenyer_user_permissions');

        setCurrentUserRole('cliente');
        setAssociatedUserData(null);
        setCurrentAuthUser(user);

        if (isExplicitLogin) {
          showToast(`¡Bienvenido(a), ${user.user_metadata?.full_name || 'Cliente'}! Tu cuenta está lista para compras y pedidos.`);
          setIsTrackerOpen(false);
        }
        return null;
      }
    } catch (err: any) {
      console.error('Error verificando rol de usuario:', err);
      throw err;
    }
  };

  const handleSignOutUser = async (openLoginAfter = false) => {
    try {
      await fetch('/api/auth/logout', withSessionInit({ method: 'POST' }));
    } catch (err) {
      console.warn('Error en signOut:', err);
    } finally {
      setSessionHandle(null);
    }

    try {
      localStorage.removeItem('frenyer_active_user');
      localStorage.removeItem('frenyer_user_role');
      localStorage.removeItem('frenyer_user_permissions');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('auth-token') || key.startsWith('frenyer_'))) {
          localStorage.removeItem(key);
        }
      }
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('auth-token') || key.startsWith('frenyer_'))) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {}

    setCurrentAuthUser(null);
    setCurrentUserRole(null);
    setAssociatedUserData(null);
    setIsUserMenuOpen(false);
    window.dispatchEvent(new CustomEvent('frenyer:active-user-changed', { detail: null }));

    showToast('Sesión de usuario cerrada con éxito.');

    if (openLoginAfter) {
      setIsAuthRegisterMode(false);
      setIsTrackerOpen(true);
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      try {
        // La sesion se consulta al servidor: la cookie httpOnly no es legible desde JS.
        const res = await fetch('/api/auth/session', withSessionInit());
        if (!res.ok) {
          if (res.status === 401) setSessionHandle(null);
          setCurrentAuthUser(null);
          const storedRole = localStorage.getItem('frenyer_user_role');
          const storedUser = localStorage.getItem('frenyer_active_user');
          if (!storedRole && !storedUser) {
            setCurrentUserRole(null);
            setAssociatedUserData(null);
          }
          return;
        }

        const json = await res.json();
        if (json?.data?.sessionId) {
          setSessionHandle(json.data.sessionId);
        }
        const sessionUser = json?.data?.user;
        if (!sessionUser) {
          setCurrentAuthUser(null);
          return;
        }

        setCurrentAuthUser(sessionUser);
        await handleVerifyUserRoleAndConfigure(sessionUser, false);
      } catch (err) {
        console.warn('Error verificando sesión:', err);
      }
    };

    checkSession();

    const handleAuthChanged = () => {
      void checkSession();
    };
    window.addEventListener('frenyer:auth-changed', handleAuthChanged);

    return () => {
      window.removeEventListener('frenyer:auth-changed', handleAuthChanged);
    };
  }, []);

  // Checkout Form fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerDoc, setCustomerDoc] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('RETIRO');
  const [deliveryDomicilioEnabled, setDeliveryDomicilioEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('frenyer_delivery_methods');
      if (raw) return JSON.parse(raw)?.domicilio === true;
    } catch {}
    return false;
  });
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

  // Consulta automática por cédula al dejar el campo (los datos quedan editables).
  const [cedulaHint, setCedulaHint] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const lastCedulaLookupRef = useRef('');
  const applyCheckoutCedula = useCedulaAutofill(showToast);

  const handleCedulaBlur = useCallback(() => {
    const parsed = parseCedulaDoc(customerDoc);
    if (!parsed || parsed.normalized === lastCedulaLookupRef.current) return;
    lastCedulaLookupRef.current = parsed.normalized;
    (async () => {
      const outcome = await lookupCedula(parsed.normalized);
      if (outcome.ok) {
        applyCheckoutCedula(outcome.data, {
          setDoc: setCustomerDoc,
          setName: setCustomerName
        }, { name: customerName });
        const loc = [
          outcome.data.location.estado,
          outcome.data.location.municipio,
          outcome.data.location.parroquia
        ].filter((part) => part.trim().length > 0).join(' · ');
        setCedulaHint(loc ? { text: `Registro: ${loc}`, tone: 'ok' } : null);
      } else if (outcome.reason === 'not-configured') {
        setCedulaHint(null); // Función dormida: sin credenciales no molesta al cliente
      } else if (outcome.reason === 'unavailable') {
        setCedulaHint({ text: 'No pudimos consultar el registro ahora; completa los datos.', tone: 'warn' });
      } else {
        setCedulaHint({ text: 'No se encontró la cédula en el registro; completa los datos.', tone: 'warn' });
      }
    })();
  }, [customerDoc, customerName, applyCheckoutCedula]);

  // Sync cart to storage (aislado por slug y notifica al guardia global de salida)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(cartStorageKey, JSON.stringify(cart));
      window.dispatchEvent(new Event('frenyer:cart-changed'));
    }
  }, [cart, cartStorageKey]);

  // Recargar carrito si el usuario navega a otra tienda por slug
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(cartStorageKey);
      setCart(saved ? JSON.parse(saved) : []);
    } catch {
      setCart([]);
    }
  }, [cartStorageKey]);

  // Sincronizar título del navegador y favicon con la configuración de la tienda activa
  useEffect(() => {
    applyBrandingToDocument(
      { businessName: businessConfig.businessName, favicon: businessConfig.favicon },
      `${businessConfig.businessName} — Tienda Online`
    );
  }, [businessConfig.businessName, businessConfig.favicon]);

  // Escuchar cambios guardados desde Configuraciones -> Negocio para reflejo inmediato
  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const custom = event as CustomEvent<any>;
      const updated = custom?.detail;
      if (!updated) return;
      const sameOrg =
        !businessConfig.organizationId ||
        !updated.organizationId ||
        updated.organizationId === businessConfig.organizationId;
      if (!urlSlug || sameOrg) {
        setBusinessConfig(prev => ({
          ...prev,
          businessName: updated.businessName?.trim() || DEFAULT_BUSINESS_PROFILE.businessName,
          rif: updated.rif?.trim() || DEFAULT_BUSINESS_PROFILE.rif,
          email: updated.email?.trim() || DEFAULT_BUSINESS_PROFILE.email,
          address: updated.address?.trim() || DEFAULT_BUSINESS_PROFILE.address,
          phone: updated.phone?.trim() || DEFAULT_BUSINESS_PROFILE.phone,
          whatsapp: updated.whatsapp?.trim() || updated.phone?.trim() || DEFAULT_BUSINESS_PROFILE.whatsapp,
          slogan: updated.slogan?.trim() || prev.slogan || DEFAULT_BUSINESS_PROFILE.slogan,
          logo: 'logo' in updated ? updated.logo : prev.logo,
          favicon: 'favicon' in updated ? updated.favicon : prev.favicon
        }));
      }
    };
    window.addEventListener('frenyer:business-profile-updated', handleProfileUpdated);
    return () => window.removeEventListener('frenyer:business-profile-updated', handleProfileUpdated);
  }, [urlSlug, businessConfig.organizationId]);

  // Load catalog & bcv rate (Strictly from active tenant database without cross-tenant or legacy fallbacks)
  useEffect(() => {
    let alive = true;
    const initData = async () => {
      setIsLoading(true);
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000));
        const dataPromise = Promise.all([
          urlSlug ? fetchPublicProductsFromSupabase(urlSlug).catch(() => []) : fetchProductsFromSupabase().catch(() => []),
          urlSlug ? fetchPublicConfigFromApi(urlSlug).catch(() => null) : fetchPublicConfigFromApi().catch(() => null),
          fetch('/api/bcv/rates').then(r => r.json()).catch(() => null)
        ]);

        const [dbProds, cfg, bcvRes] = await Promise.race([dataPromise, timeoutPromise]) as any;
        if (!alive) return;

        let effectiveBcv = bcvRate;
        if (bcvRes) {
          const rateVal = Number(bcvRes.appliedRate) || Number(bcvRes.usdRate) || Number(bcvRes.currentRate);
          if (rateVal && rateVal > 0) {
            effectiveBcv = rateVal;
            setBcvRate(rateVal);
          }
        }

        if (cfg) {
          const resolvedAddress = cfg.address?.trim() || DEFAULT_BUSINESS_PROFILE.address;
          setBusinessConfig({
            organizationId: cfg.organizationId,
            slug: cfg.slug || urlSlug,
            businessName: cfg.businessName?.trim() || DEFAULT_BUSINESS_PROFILE.businessName,
            rif: cfg.rif?.trim() || DEFAULT_BUSINESS_PROFILE.rif,
            phone: cfg.phone?.trim() || DEFAULT_BUSINESS_PROFILE.phone,
            whatsapp: cfg.whatsapp?.trim() || cfg.phone?.trim() || DEFAULT_BUSINESS_PROFILE.whatsapp,
            email: cfg.email?.trim() || DEFAULT_BUSINESS_PROFILE.email,
            address: resolvedAddress,
            slogan: cfg.slogan?.trim() || DEFAULT_BUSINESS_PROFILE.slogan,
            logo: cfg.logo || null,
            favicon: cfg.favicon || null,
            bcvRate: Number(cfg.bcvRate) || effectiveBcv,
            bcvRateDate: cfg.bcvRateDate || 'Hoy',
            branches: Array.isArray(cfg.branches) && cfg.branches.length > 0
              ? cfg.branches
              : [{ id: 'suc-01', name: 'Sede Principal', address: resolvedAddress }]
          });
        }

        const rawList = Array.isArray(dbProds) ? dbProds : [];
        const mapped: Product[] = rawList.map((p: any) => ({
          id: p.id || p.sku,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category: p.category || 'General',
          brand: p.brand || '',
          description: p.description || 'Producto disponible para despacho inmediato.',
          priceUsd: Number(p.price_usd || p.priceUsd) || 0,
          costUsd: Number(p.cost_usd || p.costUsd) || 0,
          stock: Number(p.stock) || 0,
          minStock: Number(p.min_stock || p.minStock) || 0,
          status: (Number(p.stock) || 0) <= 0 ? 'Agotado' : 'Activo',
          image_url: p.image_url
        }));
        setProducts(mapped);
      } catch (err) {
        console.warn('Error cargando catálogo de la tienda:', err);
        if (alive) setProducts([]);
      } finally {
        if (alive) setIsLoading(false);
      }
    };

    void initData();
    return () => { alive = false; };
  }, [urlSlug]);

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

  // --- CATEGORÍAS DINÁMICAS DEL CATÁLOGO DEL TENANT ---
  const systemCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    });
    return Array.from(set).sort();
  }, [products]);

  const normalizeText = useCallback((str: string) => {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }, []);

  const intelligentMatch = useCallback((product: Product, query: string) => {
    const cleanQuery = normalizeText(query);
    if (!cleanQuery) return true;
    const tokens = cleanQuery.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;

    const searchableText = normalizeText(
      `${product.name} ${product.sku} ${product.category} ${product.brand} ${product.description || ''} ${product.barcode || ''}`
    );

    return tokens.every(token => searchableText.includes(token));
  }, [normalizeText]);

  // Predictive typing suggestions
  const predictiveSuggestions = useMemo(() => {
    const q = searchTerm.trim();
    if (!q || q.length < 1) return { products: [], categories: [], brands: [] };

    const matchedProducts = products
      .filter(p => intelligentMatch(p, q))
      .slice(0, 6);

    const matchedCategories = systemCategories
      .filter(cat => normalizeText(cat).includes(normalizeText(q)))
      .slice(0, 3);

    const matchedBrands = Array.from(new Set(products.map(p => p.brand).filter((b): b is string => Boolean(b))))
      .filter(b => normalizeText(b).includes(normalizeText(q)))
      .slice(0, 3);

    return {
      products: matchedProducts,
      categories: matchedCategories,
      brands: matchedBrands
    };
  }, [products, searchTerm, systemCategories, intelligentMatch, normalizeText]);

  // Filtered catalog with intelligent search
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // 1. System category chip filter
      if (selectedCategory !== 'ALL') {
        if ((p.category || '').trim() !== selectedCategory) return false;
      }

      // 2. Intelligent Search query
      if (searchTerm.trim()) {
        if (!intelligentMatch(p, searchTerm)) return false;
      }

      return true;
    });
  }, [products, selectedCategory, searchTerm, intelligentMatch]);

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
  const handleOpenWhatsApp = (customMessage?: string) => {
    const defaultMsg = `Hola ${businessConfig.businessName}, me gustaría solicitar información y realizar un pedido.`;
    const message = customMessage || defaultMsg;
    const cleanPhone = (businessConfig.whatsapp || businessConfig.phone || DEFAULT_BUSINESS_PROFILE.whatsapp).replace(/\D/g, '');
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
        store_slug: urlSlug || businessConfig.slug,
        organization_id: businessConfig.organizationId,
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
          overflow-x: clip;
        }
        .cr-store-root button {
          transition:
            background-color var(--button-motion-duration) ease-out,
            border-color var(--button-motion-duration) ease-out,
            color var(--button-motion-duration) ease-out,
            transform var(--button-press-duration) ease-out,
            scale var(--button-press-duration) ease-out,
            box-shadow var(--button-motion-duration) ease-out;
        }
        .cr-store-root .cr-banner-btn-tech,
        .cr-store-root .cr-banner-btn-moto,
        .cr-store-root .cr-card-action-btn {
          border-radius: var(--button-radius);
          padding: 7px 12px;
          font-size: 12px;
        }
        @media (prefers-reduced-motion: reduce) {
          .cr-store-root button {
            transition-duration: 0.01ms;
          }
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

        /* 1. Identidad Corporativa configurable */
        .cr-brand-group {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          user-select: none;
          min-width: 0;
        }
        .cr-brand-title {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: min(50vw, 380px);
        }
        @media (min-width: 640px) {
          .cr-brand-title {
            font-size: 19px;
          }
        }
        @media (min-width: 1024px) {
          .cr-brand-title {
            font-size: 21px;
          }
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
          min-width: 36px;
          min-height: 36px;
        }
        .cr-icon-btn:hover {
          background: #f1f5f9;
        }
        .cr-badge-count {
          position: absolute;
          top: -2px;
          right: -4px;
          background: #111827;
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
          background: #111827;
          color: #ffffff;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }

        /* 2. Storefront Hero (100% configurable por tenant) */
        .cr-hero-section {
          max-width: 1320px;
          margin: 16px auto 20px;
          padding: 0 16px;
          position: relative;
        }
        @media (min-width: 768px) {
          .cr-hero-section {
            margin: 24px auto 28px;
            padding: 0 28px;
          }
        }
        .store-hero-card {
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 55%, #f1f5f9 100%);
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 20px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          align-items: center;
        }
        @media (min-width: 900px) {
          .store-hero-card {
            grid-template-columns: 1.55fr 1fr;
            padding: 28px 34px;
            gap: 28px;
            border-radius: 24px;
          }
        }
        .store-hero-title {
          font-size: clamp(1.5rem, 3vw, 2.35rem);
          font-weight: 800;
          letter-spacing: -0.025em;
          color: #0f172a;
          margin: 0 0 8px;
          line-height: 1.15;
          text-wrap: balance;
        }
        .store-hero-slogan {
          font-size: 15px;
          color: #475569;
          margin: 0 0 14px;
          line-height: 1.5;
          max-width: 60ch;
        }
        .store-hero-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px 10px;
          font-size: 12.5px;
          color: #64748b;
          margin-bottom: 18px;
        }
        .store-hero-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
        }
        .store-hero-cta {
          background: #111827;
          color: #ffffff;
          border: none;
          border-radius: 10px;
          padding: 10px 20px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 40px;
          white-space: nowrap;
        }
        .store-hero-cta:hover {
          background: #1e293b;
        }
        .store-hero-secondary {
          background: #ffffff;
          color: #0f172a;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 10px 18px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 40px;
          white-space: nowrap;
        }
        .store-hero-secondary:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }
        .store-hero-summary {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        @media (max-width: 480px) {
          .store-hero-card {
            padding: 14px;
            gap: 14px;
            border-radius: 16px;
          }
          .store-hero-meta {
            word-break: break-word;
          }
          .store-hero-actions button {
            width: 100%;
            justify-content: center;
          }
          .store-hero-summary {
            padding: 14px;
          }
        }

        /* 3. Cabecera de catálogo y buscador */
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
          font-size: 19px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.015em;
          display: flex;
          align-items: baseline;
          gap: 10px;
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
          border-radius: var(--button-radius);
          height: auto;
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

        /* --- ADAPTACIÓN MÓVIL: tienda funcional en pantallas pequeñas --- */
        .cr-mobile-simple-search {
          display: none; /* el buscador del header (con sugerencias) reemplaza esta barra duplicada */
        }

        /* Multimoneda móvil: botón compacto que despliega las opciones */
        .cr-currency-mobile {
          display: none;
          position: relative;
        }
        .cr-currency-mobile-btn {
          display: flex;
          align-items: center;
          gap: 3px;
          border: 1px solid #e2e8f0;
          border-radius: 9999px;
          background: #f1f5f9;
          color: #1e3a8a;
          font-size: 11px;
          font-weight: 800;
          padding: 5px 9px;
          cursor: pointer;
        }
        .cr-currency-menu {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 118px;
        }
        .cr-currency-menu button {
          border: none;
          border-radius: 8px;
          background: transparent;
          color: #334155;
          font-size: 12px;
          font-weight: 700;
          padding: 8px 12px;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s ease;
        }
        .cr-currency-menu button:hover {
          background: #f1f5f9;
        }
        .cr-currency-menu button.active-currency-option {
          background: #eff6ff;
          color: #1e3a8a;
        }
        @media (max-width: 767px) {
          .cr-topbar-inner {
            padding: 10px 12px;
            gap: 8px;
          }
          .cr-brand-title {
            font-size: 15px;
          }
          /* El texto le la cabecera no cabe: en móvil queda el icono del camión */
          .cr-tracker-label,
          .cr-user-chip-name,
          .cr-user-chip-chevron {
            display: none;
          }
          .cr-currency-btn {
            padding: 3px 6px;
            font-size: 10px;
          }
          /* Multimoneda: el toggle doble no cabe; botón compacto + menú desplegable */
          .cr-currency-desktop {
            display: none;
          }
          .cr-currency-mobile {
            display: block;
          }
          /* Banners apilados: a 2 columnas el contenido queda ilegible en 360px */
          .cr-banners-grid {
            grid-template-columns: 1fr;
          }
          .cr-banner-tech,
          .cr-banner-moto {
            min-height: 170px;
          }
          .cr-card-content {
            padding: 10px;
          }
          .cr-store-root .cr-card-action-btn {
            font-size: 11px;
            padding: 6px 8px;
          }
          .cr-express-delivery-card {
            /* Móvil: el chat vive en la barra inferior; la tarjeta express se retira */
            display: none;
          }
          .cr-truck-icon-wrap {
            width: 36px;
            height: 36px;
            border-radius: 10px;
          }
          .cr-whatsapp-fab {
            /* Móvil: el chat vive en la barra inferior; el FAB se retira (escritorio lo conserva) */
            display: none;
          }
          /* Cintillo superior: usuario, rastreo y carrito se reubicaron en la barra inferior */
          .cr-header-user,
          .cr-header-tracker,
          .cr-header-cart {
            display: none;
          }
          /* Barra inferior: 5 botones repartidos en el ancho de la pantalla */
          .cr-mobile-bottom-bar {
            justify-content: stretch;
            gap: 0;
          }
          .cr-bottom-item {
            flex: 1;
            min-width: 0;
            padding: 0 2px;
          }
          /* Item de chat en verde WhatsApp */
          .cr-bottom-chat {
            color: #16a34a;
          }
          /* Con los banners apilados los puntos del carrusel pierden sentido */
          .cr-carousel-dots {
            display: none;
          }
          .cr-toast {
            left: 16px;
            right: 16px;
            top: 12px;
            max-width: calc(100vw - 32px);
          }
        }
        @media (min-width: 768px) {
          .cr-banners-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          className="cr-toast"
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
              setSelectedCategory('ALL');
              setSearchTerm('');
            }}
          >
            <StoreBrandLogo logo={businessConfig.logo} businessName={businessConfig.businessName} size={42} />
            <div className="cr-brand-title">
              {businessConfig.businessName}
            </div>
          </div>

          <div className="cr-header-actions">
            <div className="cr-currency-toggle cr-currency-desktop" title="Cambiar moneda">
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

            {/* Multimoneda móvil: botón compacto que despliega las opciones */}
            <div className="cr-currency-mobile">
              <button
                type="button"
                className="cr-currency-mobile-btn"
                onClick={() => setIsCurrencyMenuOpen(prev => !prev)}
                aria-label="Cambiar moneda"
                title="Cambiar moneda"
              >
                {activeCurrency === 'USD' ? 'USD' : 'VES'}
                <ChevronDown size={11} />
              </button>
              {isCurrencyMenuOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 1180 }}
                    onClick={() => setIsCurrencyMenuOpen(false)}
                  />
                  <div
                    className="cr-currency-menu"
                    style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 1190 }}
                  >
                    <button
                      type="button"
                      className={`${activeCurrency === 'USD' ? 'active-currency-option' : ''}`}
                      onClick={() => {
                        setActiveCurrency('USD');
                        setIsCurrencyMenuOpen(false);
                      }}
                    >
                      USD ($)
                    </button>
                    <button
                      type="button"
                      className={`${activeCurrency === 'VES' ? 'active-currency-option' : ''}`}
                      onClick={() => {
                        setActiveCurrency('VES');
                        setIsCurrencyMenuOpen(false);
                      }}
                    >
                      VES (Bs.)
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Botón directo de Seguimiento / Tracker */}
            <button
              type="button"
              onClick={() => {
                setSelectedTrackingOrder(null);
                setIsOrderTrackerOpen(true);
              }}
              className="btn-minimal-tracker cr-header-tracker"
              title="Seguimiento en tiempo real de tu pedido"
            >
              <Truck size={12} /> <span className="cr-tracker-label">Rastrear Pedido</span>
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={async () => {
                  const sessionUser = await fetchServerSession();
                  if (sessionUser || currentAuthUser || currentUserRole) {
                    setIsUserMenuOpen((prev) => !prev);
                  } else {
                    navigate('/login');
                  }
                }}
                className="cr-icon-btn cr-header-user"
                title={
                  currentUserRole === 'asociado'
                    ? `Usuario Asociado: ${associatedUserData?.name || 'Personal'} (${associatedUserData?.role || 'Admin'})`
                    : currentUserRole === 'cliente'
                      ? `Cliente: ${currentAuthUser?.user_metadata?.full_name || currentAuthUser?.email || 'Mi cuenta'}`
                      : 'Ingresar o Crear Cuenta'
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: currentUserRole ? '4px 10px 4px 4px' : '6px 12px',
                  borderRadius: 24,
                  border: currentUserRole === 'asociado' ? '1.5px solid #FDF06F' : currentUserRole === 'cliente' ? '1.5px solid #a7f3d0' : '1px solid #e2e8f0',
                  background: currentUserRole === 'asociado' ? 'var(--brand-accent)' : currentUserRole === 'cliente' ? '#f0fdf4' : '#ffffff',
                  color: currentUserRole === 'asociado' ? '#111827' : currentUserRole === 'cliente' ? '#065f46' : '#334155',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: currentUserRole === 'asociado' ? 'var(--brand-accent)' : currentUserRole === 'cliente' ? '#15803D' : '#f1f5f9',
                    color: currentUserRole === 'asociado' ? '#111827' : currentUserRole === 'cliente' ? '#ffffff' : '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 12.5,
                    flexShrink: 0
                  }}
                >
                  {currentUserRole ? (
                    (associatedUserData?.name || currentAuthUser?.user_metadata?.full_name || currentAuthUser?.email || 'U').slice(0, 2).toUpperCase()
                  ) : (
                    <User size={16} />
                  )}
                </div>
                <span
                  className="cr-user-chip-name"
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    maxWidth: 130,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {currentUserRole === 'asociado'
                    ? (associatedUserData?.name || 'Asociado').split(' ')[0]
                    : currentUserRole === 'cliente'
                      ? (currentAuthUser?.user_metadata?.full_name || (currentAuthUser?.email ? currentAuthUser.email.split('@')[0] : 'Mi Cuenta')).split(' ')[0]
                      : 'Ingresar'}
                </span>
                {currentUserRole ? (
                  <ChevronDown size={14} className="cr-user-chip-chevron" style={{ opacity: 0.7 }} />
                ) : null}
              </button>

              {/* Menú de Usuario / Opciones de Cuenta */}
              {isUserMenuOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 1190, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(2px)' }}
                    onClick={() => setIsUserMenuOpen(false)}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 10px)',
                      right: 0,
                      width: 'min(330px, calc(100vw - 32px))',
                      background: '#ffffff',
                      borderRadius: 18,
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 20px 45px rgba(0, 0, 0, 0.18)',
                      padding: 20,
                      zIndex: 1200,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      animation: 'fadeIn 0.15s ease'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Barra superior del menú */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#111827' }}>
                        Mi Cuenta
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsUserMenuOpen(false)}
                        style={{
                          background: '#f1f5f9',
                          border: 'none',
                          color: '#64748b',
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        title="Cerrar ventana"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    {/* Encabezado del usuario */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          background: currentUserRole === 'asociado' ? 'var(--brand-accent)' : '#ecfdf5',
                          color: currentUserRole === 'asociado' ? '#111827' : '#047857',
                          border: `2px solid ${currentUserRole === 'asociado' ? '#FDF06F' : '#a7f3d0'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: 16,
                          flexShrink: 0
                        }}
                      >
                        {(associatedUserData?.name || currentAuthUser?.user_metadata?.full_name || currentAuthUser?.email || 'U').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ overflow: 'hidden', flex: 1 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {associatedUserData?.name || currentAuthUser?.user_metadata?.full_name || (currentAuthUser?.email ? currentAuthUser.email.split('@')[0] : 'Usuario')}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {currentAuthUser?.email || associatedUserData?.email || 'Sin correo asociado'}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          {currentUserRole === 'asociado' ? (
                            <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--brand-accent)', color: '#111827', padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase' }}>
                              Usuario Asociado · {associatedUserData?.role || 'Admin'}
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, fontWeight: 700, background: '#ecfdf5', color: '#047857', padding: '2px 8px', borderRadius: 99 }}>
                              Cliente de la Tienda
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Acciones del menú según tipo de usuario */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {currentUserRole === 'asociado' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              const targetRole = associatedUserData?.role || 'gerente';
                              localStorage.setItem('frenyer_user_role', targetRole);
                              if (associatedUserData) {
                                localStorage.setItem('frenyer_active_user', JSON.stringify(associatedUserData));
                              }
                              navigate('/dashboard');
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '12px 14px',
                              borderRadius: 12,
                              border: '1.5px solid #FDF06F',
                              background: 'var(--brand-accent)',
                              color: '#111827',
                              fontSize: 13,
                              fontWeight: 800,
                              cursor: 'pointer',
                              textAlign: 'left',
                              boxShadow: '0 2px 8px rgba(161, 132, 0, 0.18)'
                            }}
                          >
                            <LayoutDashboard size={18} color="#111827" />
                            <span>Ir al Panel Administrativo ERP ({associatedUserData?.role || 'Admin'})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '10px 14px',
                              borderRadius: 10,
                              border: '1px solid #e2e8f0',
                              background: '#f8fafc',
                              color: '#334155',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              textAlign: 'left'
                            }}
                          >
                            <Store size={16} color="#475569" />
                            <span>Quedarse en la Tienda Online</span>
                          </button>
                        </>
                      ) : (
                        /* Menú de opciones de Cliente: Mis Pedidos, Mis Compras, Lista de Deseo, Mi Perfil */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              setCustomerPortalTab('pedidos');
                              setIsCustomerPortalOpen(true);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '10px 14px',
                              borderRadius: 10,
                              border: '1px solid #bae6fd',
                              background: '#f0f9ff',
                              color: '#0369a1',
                              fontSize: 13,
                              fontWeight: 750,
                              cursor: 'pointer',
                              textAlign: 'left'
                            }}
                          >
                            <Package size={17} color="#0284c7" />
                            <span>Mis Pedidos</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              setCustomerPortalTab('compras');
                              setIsCustomerPortalOpen(true);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '10px 14px',
                              borderRadius: 10,
                              border: '1px solid #e2e8f0',
                              background: '#ffffff',
                              color: '#1e293b',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              textAlign: 'left'
                            }}
                          >
                            <FileText size={17} color="#0284c7" />
                            <span>Mis Compras (Facturación)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              setCustomerPortalTab('deseo');
                              setIsCustomerPortalOpen(true);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '10px 14px',
                              borderRadius: 10,
                              border: '1px solid #e2e8f0',
                              background: '#ffffff',
                              color: '#1e293b',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              textAlign: 'left'
                            }}
                          >
                            <Heart size={17} color="#e11d48" />
                            <span>Lista de Deseos</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              setCustomerPortalTab('perfil');
                              setIsCustomerPortalOpen(true);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '10px 14px',
                              borderRadius: 10,
                              border: '1px solid #e2e8f0',
                              background: '#ffffff',
                              color: '#1e293b',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              textAlign: 'left'
                            }}
                          >
                            <User size={17} color="#15803D" />
                            <span>Mi Perfil</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              setSelectedTrackingOrder(null);
                              setIsOrderTrackerOpen(true);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '9px 14px',
                              borderRadius: 10,
                              border: '1px dashed #cbd5e1',
                              background: '#f8fafc',
                              color: '#475569',
                              fontSize: 12.5,
                              fontWeight: 650,
                              cursor: 'pointer',
                              textAlign: 'left'
                            }}
                          >
                            <Truck size={15} color="#0284c7" />
                            <span>Rastrear Pedido (Tracker)</span>
                          </button>
                        </div>
                      )}

                      {/* Opción para cambiar de cuenta o iniciar sesión */}
                      <button
                        type="button"
                        onClick={() => {
                          handleSignOutUser(true);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 14px',
                          borderRadius: 10,
                          border: '1px solid #e2e8f0',
                          background: '#f8fafc',
                          color: '#1e293b',
                          fontSize: 13,
                          fontWeight: 650,
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <UserCheck size={16} color="#2563eb" /> Cambiar cuenta / Iniciar con otro usuario
                      </button>
                    </div>

                    <div style={{ height: 1, background: '#f1f5f9' }} />

                    {/* Botón explícito y destacado de CERRAR USUARIO */}
                    <button
                      type="button"
                      onClick={() => handleSignOutUser(false)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '11px 16px',
                        borderRadius: 10,
                        border: '1.5px solid #fca5a5',
                        background: '#fef2f2',
                        color: '#dc2626',
                        fontSize: 13.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(220, 38, 38, 0.08)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <LogOut size={16} /> Cerrar usuario
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              className="cr-icon-btn cr-header-cart"
              onClick={() => setIsCartOpen(true)}
              aria-label="Abrir carrito"
            >
              <ShoppingCart size={22} />
              <span className="cr-badge-count">{totalCartUnits}</span>
            </button>
          </div>
        </div>

        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 16px 12px' }}>
          <div className="cr-desktop-search-wrap" style={{ position: 'relative', width: '100%', maxWidth: '100%' }}>
            <input
              type="text"
              className="cr-desktop-search-input"
              placeholder="Buscar productos por nombre, SKU o categoría..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{ border: 'none', background: 'transparent', padding: '0 6px', color: '#94a3b8', cursor: 'pointer' }}
                title="Limpiar búsqueda"
              >
                <X size={16} />
              </button>
            )}
            <button type="button" className="cr-desktop-search-btn" aria-label="Buscar">
              <Search size={18} />
            </button>

            {/* Predictive & Intelligent Search Dropdown */}
            {isSearchFocused && searchTerm.trim().length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: 0,
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 16,
                  boxShadow: '0 16px 36px rgba(0, 0, 0, 0.12)',
                  zIndex: 1300,
                  padding: 12,
                  maxHeight: 420,
                  overflowY: 'auto'
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', padding: '4px 8px 8px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Sugerencias Inteligentes ({predictiveSuggestions.products.length} resultados)</span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>Predictivo</span>
                </div>

                {/* Categories & Brands matching */}
                {(predictiveSuggestions.categories.length > 0 || predictiveSuggestions.brands.length > 0) && (
                  <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {predictiveSuggestions.categories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat);
                          setSearchTerm('');
                          setIsSearchFocused(false);
                        }}
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          padding: '4px 10px',
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: '#1e3a8a',
                          cursor: 'pointer'
                        }}
                      >
                        📁 {cat}
                      </button>
                    ))}
                    {predictiveSuggestions.brands.map(brand => (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => {
                          setSearchTerm(brand);
                          setIsSearchFocused(false);
                        }}
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          padding: '4px 10px',
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: '#b91c1c',
                          cursor: 'pointer'
                        }}
                      >
                        🏷️ {brand}
                      </button>
                    ))}
                  </div>
                )}

                {/* Products list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {predictiveSuggestions.products.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                      No se encontraron productos para "{searchTerm}".
                    </div>
                  ) : (
                    predictiveSuggestions.products.map(prod => {
                      const priceFormatted = activeCurrency === 'USD' ? formatUSD(prod.priceUsd) : formatVES(convertUSDtoVES(prod.priceUsd, bcvRate));
                      return (
                        <div
                          key={prod.id || prod.sku}
                          onClick={() => {
                            setQuickViewProduct(prod);
                            setIsSearchFocused(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '8px 10px',
                            borderRadius: 10,
                            cursor: 'pointer',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ width: 38, height: 38, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                            {prod.image_url ? (
                              <img src={prod.image_url} alt={prod.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <Package size={18} color="#64748b" />
                            )}
                          </div>
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {prod.name}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span>{prod.sku}</span>
                              <span>·</span>
                              <span style={{ color: '#1e3a8a', fontWeight: 600 }}>{prod.category}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e3a8a', whiteSpace: 'nowrap', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                            {priceFormatted}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 2. HERO CONFIGURABLE DEL NEGOCIO */}
      <section className="cr-hero-section">
        <div className="store-hero-card">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <StoreBrandLogo logo={businessConfig.logo} businessName={businessConfig.businessName} size={56} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                  Tienda Online Oficial · RIF {businessConfig.rif}
                </div>
                <h1 className="store-hero-title">{businessConfig.businessName}</h1>
              </div>
            </div>

            <p className="store-hero-slogan">
              {businessConfig.slogan || 'Catálogo digital bimonetario con precios actualizados y despacho directo.'}
            </p>

            <div className="store-hero-meta">
              <span>{businessConfig.address}</span>
              <span aria-hidden="true">·</span>
              <span>Tel: {businessConfig.phone}</span>
              <span aria-hidden="true">·</span>
              <span>{businessConfig.email}</span>
            </div>

            <div className="store-hero-actions">
              <button
                type="button"
                className="store-hero-cta"
                onClick={() => {
                  document.getElementById('shop-product-catalog')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                  });
                }}
              >
                <span>Explorar catálogo</span>
                <ArrowRight size={15} />
              </button>
              <button
                type="button"
                className="store-hero-secondary"
                onClick={() => handleOpenWhatsApp()}
              >
                <MessageCircle size={15} />
                <span>Atención por WhatsApp</span>
              </button>
            </div>
          </div>

          <div className="store-hero-summary">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Tasa de referencia BCV</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                Bs. {bcvRate.toFixed(2)} / USD
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Productos disponibles</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                {products.length}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Categorías activas</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                {systemCategories.length}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. ENCABEZADO DE CATÁLOGO Y BUSCADOR */}
      <div className="cr-desktop-subhead-row">
        <div className="cr-title-left">
          <span>Catálogo de productos</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
            {filteredProducts.length} artículos
          </span>
        </div>

        <div className="cr-desktop-search-wrap" style={{ position: 'relative' }}>
          <input
            type="text"
            className="cr-desktop-search-input"
            placeholder="Buscar productos por nombre, categoría o código..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{ border: 'none', background: 'transparent', padding: '0 6px', color: '#94a3b8', cursor: 'pointer' }}
              title="Limpiar búsqueda"
            >
              <X size={16} />
            </button>
          )}
          <button type="button" className="cr-desktop-search-btn" aria-label="Buscar">
            <Search size={18} />
          </button>

          {/* Predictive & Intelligent Search Dropdown */}
          {isSearchFocused && searchTerm.trim().length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 16,
                boxShadow: '0 16px 36px rgba(0, 0, 0, 0.12)',
                zIndex: 1300,
                padding: 12,
                maxHeight: 420,
                overflowY: 'auto'
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', padding: '4px 8px 8px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Sugerencias Inteligentes ({predictiveSuggestions.products.length} resultados)</span>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>Predictivo</span>
              </div>

              {/* Categories & Brands matching */}
              {(predictiveSuggestions.categories.length > 0 || predictiveSuggestions.brands.length > 0) && (
                <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {predictiveSuggestions.categories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat);
                        setSearchTerm('');
                        setIsSearchFocused(false);
                      }}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        padding: '4px 10px',
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: '#1e3a8a',
                        cursor: 'pointer'
                      }}
                    >
                      📁 {cat}
                    </button>
                  ))}
                  {predictiveSuggestions.brands.map(brand => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => {
                        setSearchTerm(brand);
                        setIsSearchFocused(false);
                      }}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        padding: '4px 10px',
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: '#b91c1c',
                        cursor: 'pointer'
                      }}
                    >
                      🏷️ {brand}
                    </button>
                  ))}
                </div>
              )}

              {/* Products list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {predictiveSuggestions.products.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                    No se encontraron productos para "{searchTerm}".
                  </div>
                ) : (
                  predictiveSuggestions.products.map(prod => {
                    const priceFormatted = activeCurrency === 'USD' ? formatUSD(prod.priceUsd) : formatVES(convertUSDtoVES(prod.priceUsd, bcvRate));
                    return (
                      <div
                        key={prod.id || prod.sku}
                        onClick={() => {
                          setQuickViewProduct(prod);
                          setIsSearchFocused(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '8px 10px',
                          borderRadius: 10,
                          cursor: 'pointer',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ width: 38, height: 38, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                          {prod.image_url ? (
                            <img src={prod.image_url} alt={prod.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <Package size={18} color="#64748b" />
                          )}
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {prod.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span>{prod.sku}</span>
                            <span>·</span>
                            <span style={{ color: '#1e3a8a', fontWeight: 600 }}>{prod.category}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#1e3a8a', whiteSpace: 'nowrap', fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>
                          {priceFormatted}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* 4. PASTILLAS DE FILTRO: CATEGORÍAS DINÁMICAS DEL NEGOCIO */}
      <div className="cr-chips-container">
        <div className="cr-mobile-heading-switcher">
          <h3 className="cr-mobile-heading-title" style={{ color: '#0f172a' }}>
            Catálogo de productos
          </h3>

          {/* Mobile categories scroll */}
          <div className="cr-mobile-categories-scroll">
            <button
              type="button"
              className={`cr-chip ${selectedCategory === 'ALL' ? 'active-blue' : ''}`}
              onClick={() => setSelectedCategory('ALL')}
            >
              Todas
            </button>
            {systemCategories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`cr-chip ${selectedCategory === cat ? 'active-blue' : ''}`}
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
              className={`cr-chip ${selectedCategory === 'ALL' ? 'active-blue' : ''}`}
              onClick={() => setSelectedCategory('ALL')}
            >
              Todas ({products.length})
            </button>
            {systemCategories.map(cat => (
              <button
                key={cat}
                type="button"
                className={`cr-chip ${selectedCategory === cat ? 'active-blue' : ''}`}
                onClick={() => setSelectedCategory(selectedCategory === cat ? 'ALL' : cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {(selectedCategory !== 'ALL' || searchTerm.trim() !== '') && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('ALL');
                setSearchTerm('');
              }}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Ver todo el catálogo
            </button>
          )}
        </div>
      </div>

      {/* 5. CATÁLOGO DE PRODUCTOS */}
      <main id="shop-product-catalog" className="cr-catalog-wrap">
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            Cargando catálogo de {businessConfig.businessName}...
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b', border: '1px dashed #e2e8f0', borderRadius: 16 }}>
            <Package size={44} style={{ color: '#cbd5e1', margin: '0 auto 12px' }} />
            <h3 style={{ margin: '0 0 6px', color: '#0f172a', fontSize: 16 }}>
              {products.length === 0
                ? `Aún no hay productos publicados en ${businessConfig.businessName}`
                : 'No hay productos que coincidan con tu búsqueda'}
            </h3>
            <p style={{ fontSize: 13, margin: 0 }}>
              {products.length === 0
                ? 'Agrega productos desde el módulo de Inventario para mostrarlos aquí en tiempo real.'
                : 'Prueba limpiando los filtros o seleccionando otra categoría.'}
            </p>
            {(selectedCategory !== 'ALL' || searchTerm.trim() !== '') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('ALL');
                  setSearchTerm('');
                }}
                style={{
                  marginTop: 16,
                  padding: '8px 20px',
                  borderRadius: 10,
                  background: '#111827',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Mostrar todo el inventario
              </button>
            )}
          </div>
        ) : (
          <div className="cr-product-grid">
            {filteredProducts.map(product => {
              const prices = formatPrice(product.priceUsd);

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
                          background: '#DC2626',
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

                    {currentUserRole === 'cliente' && (
                      <button
                        type="button"
                        onClick={async event => {
                          event.stopPropagation();
                          await toggleWishlistProduct(product);
                        }}
                        aria-label={`Guardar ${product.name} en la lista de deseo`}
                        title="Guardar en mi lista de deseo"
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: 'none',
                          background: 'rgba(255,255,255,0.92)',
                          color: '#e11d48',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          boxShadow: '0 2px 6px rgba(15,23,42,0.12)'
                        }}
                      >
                        <Heart size={15} fill={isProductInWishlist(product.sku) ? '#e11d48' : 'none'} />
                      </button>
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

                    <Button
                      type="button"
                      disabled={product.stock <= 0}
                      variant="primary"
                      className="cr-card-action-btn tech"
                      onClick={() => addToCart(product)}
                    >
                      <ShoppingCart size={13} />
                      <span>{product.stock > 0 ? 'Agregar al carrito' : 'Sin stock'}</span>
                    </Button>
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
        onClick={() => handleOpenWhatsApp(`Hola ${businessConfig.businessName}, me interesa el servicio de entrega local para un pedido.`)}
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
            setSelectedCategory('ALL');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Home size={20} />
          <span>Inicio</span>
        </button>

        <button
          type="button"
          className={`cr-bottom-item ${isUserMenuOpen ? 'active' : ''}`}
          onClick={async () => {
            const sessionUser = await fetchServerSession();
            if (sessionUser || currentAuthUser || currentUserRole) {
              setIsUserMenuOpen(true);
            } else {
              setIsAuthRegisterMode(false);
              setIsTrackerOpen(true);
            }
          }}
        >
          <User size={20} />
          <span>{currentUserRole ? 'Usuario' : 'Ingresar'}</span>
          {currentUserRole && (
            <span
              className="cr-bottom-badge"
              style={{
                background: currentUserRole === 'asociado' ? 'var(--brand-accent)' : '#15803D',
                width: 8,
                height: 8,
                minWidth: 8,
                padding: 0
              }}
            />
          )}
        </button>

        <button
          type="button"
          className="cr-bottom-item cr-bottom-tracker"
          onClick={() => {
            setSelectedTrackingOrder(null);
            setIsOrderTrackerOpen(true);
          }}
        >
          <Truck size={20} />
          <span>Rastrear</span>
        </button>

        <button
          type="button"
          className="cr-bottom-item cr-bottom-chat"
          onClick={() => handleOpenWhatsApp()}
        >
          <MessageCircle size={20} />
          <span>Chat</span>
        </button>

        <button
          type="button"
          className="cr-bottom-item"
          onClick={() => setIsCartOpen(true)}
        >
          <ShoppingCart size={20} />
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
                <StoreBrandLogo logo={businessConfig.logo} businessName={businessConfig.businessName} size={36} />
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                  {businessConfig.businessName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', minWidth: 32, minHeight: 32 }}
                aria-label="Cerrar menú"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', margin: '8px 0 4px' }}>
                Catálogo
              </div>
              <button
                type="button"
                onClick={() => {
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
                  background: selectedCategory === 'ALL' ? '#f1f5f9' : 'transparent',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Layers size={16} />
                <span>Todo el Catálogo</span>
              </button>

              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', margin: '18px 0 4px' }}>
                Categorías
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
                <ShoppingCart size={20} style={{ color: '#0f172a' }} />
                <h3 style={{ margin: 0, fontSize: 16 }}>Carrito · {businessConfig.businessName}</h3>
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
                              aria-label="Disminuir cantidad"
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
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
                              aria-label="Aumentar cantidad"
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
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
                      // La compra es publica: no se exige cuenta para comprar.
                      setIsCartOpen(false);
                      setCheckoutStep(1);
                      // Con sesion iniciada, el pedido se vincula a la cuenta del cliente.
                      if (currentUserRole === 'cliente' && currentAuthUser?.email) {
                        setCustomerEmail(currentAuthUser.email);
                      }
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
                  {businessConfig.businessName} · Pasarela Bimonetaria USD / VES
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
                      onBlur={handleCedulaBlur}
                    />
                    {cedulaHint && (
                      <p style={{ margin: '4px 0 0', fontSize: 11.5, fontWeight: 600, color: cedulaHint.tone === 'ok' ? '#15803D' : '#DC2626' }}>
                        {cedulaHint.text}
                      </p>
                    )}
                  </div>

                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 700 }}>Correo electrónico</label>
                    <input
                      type="email"
                      className="input"
                      placeholder="Ej. cliente@correo.com"
                      value={customerEmail}
                      onChange={e => setCustomerEmail(e.target.value)}
                      readOnly={currentUserRole === 'cliente'}
                      title={
                        currentUserRole === 'cliente'
                          ? 'Tu correo de cuenta se usa para vincular el pedido a tu portal'
                          : 'Opcional: te permite seguir tu pedido por correo'
                      }
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

                    {deliveryDomicilioEnabled && (
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
                    )}
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
                    Tu orden número <b>{completedOrder.order_number}</b> ha sido registrada en <b>{businessConfig.businessName}</b>.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const ord = completedOrder;
                        setIsCheckoutOpen(false);
                        setCompletedOrder(null);
                        setSelectedTrackingOrder(ord);
                        setIsOrderTrackerOpen(true);
                      }}
                      style={{
                        width: '100%',
                        height: 'auto',
                        padding: '12px',
                        borderRadius: 12,
                        background: '#0284c7',
                        color: '#fff',
                        border: 'none',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        fontSize: 14
                      }}
                    >
                      <Truck size={18} /> Rastrear este Pedido en Tiempo Real
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCheckoutOpen(false);
                        setCompletedOrder(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '11px',
                        borderRadius: 12,
                        background: '#f1f5f9',
                        color: '#334155',
                        border: '1px solid #cbd5e1',
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: 13
                      }}
                    >
                      Seguir comprando en la tienda
                    </button>
                  </div>
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
                  Código: <b>{quickViewProduct.sku}</b> · Marca: <b>{quickViewProduct.brand || businessConfig.businessName}</b>
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

            <Button
              type="button"
              disabled={quickViewProduct.stock <= 0}
              variant="primary"
              onClick={() => {
                addToCart(quickViewProduct);
                setQuickViewProduct(null);
              }}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 'var(--button-radius)',
                background: '#1e3a8a',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {quickViewProduct.stock > 0 ? 'Agregar al Carrito' : 'Producto Sin Stock'}
            </Button>
          </div>
        </div>
      )}

      {/* 12.B PORTAL DE CLIENTE (PEDIDOS, COMPRAS, LISTA DE DESEO Y PERFIL) */}
      <CustomerPortal
        isOpen={isCustomerPortalOpen}
        initialTab={customerPortalTab}
        email={currentAuthUser?.email || ''}
        displayName={
          currentAuthUser?.user_metadata?.full_name ||
          associatedUserData?.name ||
          currentAuthUser?.email ||
          ''
        }
        onClose={() => setIsCustomerPortalOpen(false)}
        onSignOut={() => {
          setIsCustomerPortalOpen(false);
          handleSignOutUser(false);
        }}
        onAddToCartFromWishlist={sku => {
          const product = products.find(item => item.sku === sku);
          if (product) {
            addToCart(product);
            setIsCustomerPortalOpen(false);
            setIsCartOpen(true);
          }
        }}
        onOpenTracker={orderData => {
          setSelectedTrackingOrder(orderData);
          setIsOrderTrackerOpen(true);
        }}
      />

      {/* 12.C TRACKER MODAL (SEGUIMIENTO DE PEDIDO EN TIEMPO REAL) */}
      <OrderTrackerModal
        isOpen={isOrderTrackerOpen}
        orderIdOrNumber={
          typeof selectedTrackingOrder === 'string'
            ? selectedTrackingOrder
            : selectedTrackingOrder?.order_number || selectedTrackingOrder?.id || ''
        }
        initialOrder={typeof selectedTrackingOrder === 'object' ? selectedTrackingOrder : null}
        businessProfile={businessConfig}
        onClose={() => {
          setIsOrderTrackerOpen(false);
          setSelectedTrackingOrder(null);
        }}
      />

      {/* 13. AUTH MODAL ("CREAR CUENTA") */}
      {isTrackerOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          /* Do NOT close on backdrop click to prevent losing entered data */
        >
          <div
            style={{
              position: 'relative',
              width: 'min(440px, 100%)',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: '#ffffff',
              borderRadius: 20,
              padding: '28px 24px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Botón de cierre explícito (X) */}
            <button
              type="button"
              onClick={() => {
                setIsTrackerOpen(false);
                setAuthError('');
              }}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: '#f1f5f9',
                border: 'none',
                color: '#64748b',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Cerrar ventana"
              aria-label="Cerrar modal"
            >
              <X size={18} />
            </button>

            <h2 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#172033', paddingRight: 36 }}>
              {isAuthRegisterMode ? 'Crear cuenta' : 'Iniciar sesión'}
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
              {isAuthRegisterMode
                ? 'Completa los datos de tu empresa o personales para registrarte.'
                : 'Ingresa a tu cuenta para continuar con tus pedidos y compras.'}
            </p>

            {/* Aviso y botón si hay sesión activa para cerrar el usuario de inmediato */}
            {(currentAuthUser || currentUserRole) && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 14,
                  padding: '12px 14px',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Sesión actualmente abierta:</div>
                  <div style={{ fontSize: 13, fontWeight: 750, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {associatedUserData?.name || currentAuthUser?.user_metadata?.full_name || (currentAuthUser?.email ? currentAuthUser.email.split('@')[0] : 'Usuario')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSignOutUser(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 12px',
                    borderRadius: 8,
                    background: '#fef2f2',
                    border: '1px solid #fca5a5',
                    color: '#dc2626',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                  title="Cerrar esta sesión para ingresar con otra cuenta"
                >
                  <LogOut size={14} /> Cerrar usuario
                </button>
              </div>
            )}
            
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setAuthError('');
                setAuthIsLoading(true);

                try {
                  if (isAuthRegisterMode) {
                    if (!authEmail.trim() || !authPassword) {
                      throw new Error('Por favor completa todos los campos requeridos.');
                    }
                    if (authPassword.length < 6) {
                      throw new Error('La contraseña debe tener al menos 6 caracteres.');
                    }
                    if (authPassword !== authConfirmPassword) {
                      throw new Error('Las contraseñas no coinciden.');
                    }

                    // El registro lo resuelve el servidor: el navegador no maneja claves.
                    const registerRes = await fetch(
                      '/api/auth/register',
                      withSessionInit({
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          email: authEmail.trim(),
                          password: authPassword,
                          fullName: authFullName.trim(),
                          companyName: authCompany.trim()
                        })
                      })
                    );
                    const registerJson = await registerRes.json().catch(() => null);

                    if (!registerRes.ok || !registerJson?.success) {
                      throw new Error(registerJson?.error || 'No se pudo crear la cuenta.');
                    }
                    if (registerJson?.data?.sessionId) {
                      setSessionHandle(registerJson.data.sessionId);
                    }

                    setAuthFullName('');
                    setAuthCompany('');
                    setAuthPassword('');
                    setAuthConfirmPassword('');

                    if (registerJson.requiresEmailConfirmation) {
                      showToast('¡Cuenta creada exitosamente! Revisa tu correo para confirmar tu cuenta.');
                      setIsAuthRegisterMode(false);
                    } else {
                      const sessionUser = await fetchServerSession();
                      if (sessionUser) {
                        await handleVerifyUserRoleAndConfigure(sessionUser, true);
                      }
                    }
                  } else {
                    if (!authEmail.trim() || !authPassword) {
                      throw new Error('Por favor ingresa tu correo y contraseña.');
                    }
                    const loginRes = await fetch(
                      '/api/auth/login',
                      withSessionInit({
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: authEmail.trim(), password: authPassword })
                      })
                    );
                    const loginJson = await loginRes.json().catch(() => null);

                    if (!loginRes.ok || !loginJson?.success) {
                      throw new Error(loginJson?.error || 'Credenciales inválidas');
                    }
                    if (loginJson?.data?.sessionId) {
                      setSessionHandle(loginJson.data.sessionId);
                    }

                    const sessionUser = await fetchServerSession();
                    if (sessionUser) {
                      await handleVerifyUserRoleAndConfigure(sessionUser, true);
                    }
                  }
                } catch (err: any) {
                  const msg = err?.message || '';
                  if (
                    msg.includes('Invalid login credentials') ||
                    msg.includes('credentials') ||
                    msg.includes('not found') ||
                    msg.includes('Invalid')
                  ) {
                    setAuthError('Usuario no registrado o credenciales inválidas');
                  } else {
                    setAuthError(msg || 'Error al procesar la solicitud.');
                  }
                } finally {
                  setAuthIsLoading(false);
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              {authError && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    fontSize: 12.5,
                    lineHeight: 1.4
                  }}
                >
                  {authError}
                </div>
              )}

              {isAuthRegisterMode && (
                <>
                  <div className="field">
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#172033' }}>Nombre completo *</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 4 }}>
                      <User size={18} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
                      <input
                        type="text"
                        className="input"
                        placeholder="Tu nombre completo"
                        value={authFullName}
                        onChange={(e) => setAuthFullName(e.target.value)}
                        style={{ paddingLeft: 40 }}
                        required
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#172033' }}>Nombre de la empresa</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 4 }}>
                      <Building size={18} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
                      <input
                        type="text"
                        className="input"
                        placeholder="Nombre de tu negocio o empresa"
                        value={authCompany}
                        onChange={(e) => setAuthCompany(e.target.value)}
                        style={{ paddingLeft: 40 }}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="field">
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#172033' }}>Correo electrónico *</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 4 }}>
                  <Mail size={18} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
                  <input
                    type="email"
                    className="input"
                    placeholder="correo@ejemplo.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    style={{ paddingLeft: 40 }}
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#172033' }}>Contraseña *</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 4 }}>
                  <LockKeyhole size={18} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
                  <input
                    type={authShowPassword ? 'text' : 'password'}
                    className="input"
                    placeholder="Mínimo 6 caracteres"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    style={{ paddingLeft: 40, paddingRight: 40 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setAuthShowPassword(!authShowPassword)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 4
                    }}
                    title={authShowPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    aria-label={authShowPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {authShowPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {isAuthRegisterMode && (
                <div className="field">
                  <label style={{ fontSize: 12.5, fontWeight: 700, color: '#172033' }}>Confirmar contraseña *</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginTop: 4 }}>
                    <LockKeyhole size={18} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
                    <input
                      type={authShowConfirmPassword ? 'text' : 'password'}
                      className="input"
                      placeholder="Repite tu contraseña"
                      value={authConfirmPassword}
                      onChange={(e) => setAuthConfirmPassword(e.target.value)}
                      style={{ paddingLeft: 40, paddingRight: 40 }}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setAuthShowConfirmPassword(!authShowConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: 10,
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 4
                      }}
                      title={authShowConfirmPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      aria-label={authShowConfirmPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {authShowConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={authIsLoading}
                style={{
                  width: '100%',
                  padding: 12,
                  marginTop: 6,
                  borderRadius: 10,
                  background: '#111827',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: authIsLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: authIsLoading ? 0.7 : 1,
                  transition: 'background 0.15s ease'
                }}
              >
                {isAuthRegisterMode ? (
                  <>
                    <UserPlus size={18} /> {authIsLoading ? 'Creando cuenta...' : 'Crear cuenta'}
                  </>
                ) : (
                  <>
                    <LogIn size={18} /> {authIsLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
                  </>
                )}
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setIsAuthRegisterMode(!isAuthRegisterMode);
                  setAuthError('');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: '6px 0',
                  textAlign: 'center'
                }}
              >
                {isAuthRegisterMode ? (
                  <>¿Ya tienes una cuenta? <span style={{ color: '#111827', fontWeight: 700 }}>Inicia sesión</span></>
                ) : (
                  <>¿No tienes una cuenta? <span style={{ color: '#111827', fontWeight: 700 }}>Regístrate aquí</span></>
                )}
              </button>
            </form>
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
          <div style={{ textAlign: 'left' }}>
            © {new Date().getFullYear()} <b>{businessConfig.businessName}</b> · RIF: {businessConfig.rif} · {businessConfig.address} · {businessConfig.email} · {businessConfig.phone}
          </div>
          <button
            type="button"
            onClick={() => {
              if (currentUserRole === 'cliente') {
                showToast('Acceso exclusivo para personal de la empresa. Tu cuenta es de Cliente (solo compras y solicitudes).', 'info');
                return;
              }
              navigate('/dashboard');
            }}
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
