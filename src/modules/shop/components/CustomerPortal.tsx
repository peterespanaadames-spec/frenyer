import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  LogOut,
  Package,
  FileText,
  Heart,
  User,
  RefreshCw,
  Truck,
  CheckCircle,
  CreditCard,
  Clock,
  MapPin,
  Phone,
  Mail,
  ShieldCheck,
  ChevronRight,
  Trash2,
  ExternalLink,
  Edit2,
  Plus,
  Lock,
  AlertCircle,
  ArrowLeft
} from 'lucide-react';
import { formatUSD, formatVES } from '../../../lib/currency';

export interface CustomerPortalOrderItem {
  sku?: string;
  name?: string;
  quantity?: number;
  unit_price_usd?: number;
  total_usd?: number;
  total_ves?: number;
}

export interface CustomerPortalOrder {
  id?: string;
  order_number?: string | number;
  created_at?: string;
  delivery_status?: string;
  payment_status?: string;
  delivery_method?: string;
  delivery_address?: string;
  payment_method?: string;
  customer_name?: string;
  customer_phone?: string;
  total_usd?: number;
  total_ves?: number;
  exchange_rate?: number;
  items?: CustomerPortalOrderItem[];
}

export interface CustomerPortalPurchase {
  id?: string;
  doc_number?: string;
  order_number?: string | number;
  doc_type?: string;
  status?: string;
  payment_type?: string;
  total_usd?: number;
  total_ves?: number;
  created_at?: string;
  items?: CustomerPortalOrderItem[];
}

export interface CustomerPortalWishlistItem {
  id?: string;
  product_id?: string;
  sku?: string;
  name?: string;
  price_usd?: number;
  image_url?: string;
  created_at?: string;
}

export interface CustomerPortalPayload {
  customer: {
    email: string;
    full_name: string;
    document_id?: string;
    phone?: string;
    addresses?: string[];
    role: string;
  };
  orders: CustomerPortalOrder[];
  purchases: CustomerPortalPurchase[];
  wishlist: CustomerPortalWishlistItem[];
}

interface CustomerPortalProps {
  isOpen: boolean;
  email: string;
  displayName: string;
  initialTab?: PortalTab;
  onClose: () => void;
  onSignOut: () => void;
  onAddToCartFromWishlist?: (sku: string) => void;
  onOpenTracker?: (orderData: CustomerPortalOrder | string) => void;
}

export type PortalTab = 'pedidos' | 'compras' | 'deseo' | 'perfil';

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  RECIBIDO: 'RECIBIDO',
  PREPARADO: 'EN PREPARACIÓN',
  LISTO_PARA_ENTREGAR: 'LISTO PARA RETIRAR',
  EN_CAMINO: 'EN CAMINO',
  ENTREGADO: 'ENTREGADO',
  CANCELADO: 'CANCELADO'
};

const TAB_LABELS: Record<PortalTab, string> = {
  pedidos: 'MIS PEDIDOS',
  compras: 'MIS COMPRAS',
  deseo: 'LISTA DE DESEO',
  perfil: 'MI PERFIL'
};

function formatDateLong(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-VE', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function formatDateShort(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

export function CustomerPortal({
  isOpen,
  email,
  displayName,
  initialTab = 'pedidos',
  onClose,
  onSignOut,
  onAddToCartFromWishlist,
  onOpenTracker
}: CustomerPortalProps) {
  const [activeTab, setActiveTab] = useState<PortalTab>(initialTab);
  const [payload, setPayload] = useState<CustomerPortalPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  // Date filter for orders
  const [orderDateFilter, setOrderDateFilter] = useState('');

  // Profile edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editDocId, setEditDocId] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Address states
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newAddressText, setNewAddressText] = useState('');
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const loadPortal = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/customer/portal', { credentials: 'include' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setErrorMessage(json?.error || 'No se pudo cargar tu portal de cliente.');
        return;
      }
      setPayload(json.data);
      if (json.data?.customer) {
        setEditFullName(json.data.customer.full_name || '');
        setEditDocId(json.data.customer.document_id || 'V-');
        setEditPhone(json.data.customer.phone || '');
      }
    } catch {
      setErrorMessage('No se pudo conectar con el servidor.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPortal();
    }
  }, [isOpen, loadPortal]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleWishlistItem = useCallback(
    async (item: CustomerPortalWishlistItem) => {
      if (!item.product_id) return;
      try {
        const res = await fetch('/api/customer/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            product_id: item.product_id,
            sku: item.sku,
            name: item.name,
            price_usd: item.price_usd,
            image_url: item.image_url
          })
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) {
          setPayload(prev => (prev ? { ...prev, wishlist: json.data.wishlist } : prev));
        }
      } catch {
        setErrorMessage('No se pudo actualizar tu lista de deseos.');
      }
    },
    []
  );

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileSuccessMsg('');
    try {
      const res = await fetch('/api/customer/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          full_name: editFullName,
          document_id: editDocId,
          phone: editPhone
        })
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setPayload(prev =>
          prev
            ? {
                ...prev,
                customer: {
                  ...prev.customer,
                  full_name: editFullName,
                  document_id: editDocId,
                  phone: editPhone
                }
              }
            : prev
        );
        setIsEditingProfile(false);
        setProfileSuccessMsg('¡Perfil actualizado con éxito!');
        setTimeout(() => setProfileSuccessMsg(''), 4000);
      } else {
        setErrorMessage(json?.error || 'No se pudo actualizar el perfil.');
      }
    } catch {
      setErrorMessage('Error de conexión al guardar perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddressText.trim()) return;
    setIsSavingAddress(true);
    try {
      const res = await fetch('/api/customer/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'add', address: newAddressText.trim() })
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setPayload(prev =>
          prev
            ? {
                ...prev,
                customer: {
                  ...prev.customer,
                  addresses: json.data.addresses
                }
              }
            : prev
        );
        setNewAddressText('');
        setIsAddingAddress(false);
      }
    } catch {
      setErrorMessage('Error guardando la dirección.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleRemoveAddress = async (addrToRemove: string) => {
    try {
      const res = await fetch('/api/customer/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'remove', address: addrToRemove })
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setPayload(prev =>
          prev
            ? {
                ...prev,
                customer: {
                  ...prev.customer,
                  addresses: json.data.addresses
                }
              }
            : prev
        );
      }
    } catch {
      setErrorMessage('Error eliminando la dirección.');
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword.length < 6) {
      setPasswordError('La contraseña debe tener mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }
    setIsSavingPassword(true);
    try {
      const res = await fetch('/api/customer/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: newPassword })
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setPasswordSuccess('¡Contraseña actualizada con éxito!');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPasswordSuccess(''), 4500);
      } else {
        setPasswordError(json?.error || 'No se pudo actualizar la contraseña.');
      }
    } catch {
      setPasswordError('Error al contactar al servidor.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const orders = payload?.orders || [];
  const purchases = payload?.purchases || [];
  const wishlist = payload?.wishlist || [];

  // Filter orders by date if specified
  const filteredOrders = useMemo(() => {
    if (!orderDateFilter) return orders;
    return orders.filter(o => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at).toISOString().split('T')[0];
      return d === orderDateFilter;
    });
  }, [orders, orderDateFilter]);

  if (!isOpen) return null;

  const tabs: { id: PortalTab; icon: React.ReactNode; count?: number }[] = [
    { id: 'pedidos', icon: <Package size={15} />, count: orders.length },
    { id: 'compras', icon: <FileText size={15} /> },
    { id: 'deseo', icon: <Heart size={15} />, count: wishlist.length },
    { id: 'perfil', icon: <User size={15} /> }
  ];

  const customerName = payload?.customer.full_name || displayName || email.split('@')[0];
  const userInitial = customerName.slice(0, 1).toUpperCase();

  return (
    <div className="cp-root" role="dialog" aria-modal="true" aria-label="Portal Personal de Cliente">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="cp-panel">
        {/* Header - Matching All Reference Images */}
        <header className="cp-header">
          <div className="cp-header-user">
            <div className="cp-avatar">{userInitial}</div>
            <div className="cp-header-text">
              <div className="cp-header-name-row">
                <span className="cp-header-name">{customerName.toUpperCase()}</span>
                <span className="cp-verified">CLIENTE VERIFICADO</span>
              </div>
              <span className="cp-header-email">
                {email} • Portal Personal de Cliente
              </span>
            </div>
          </div>
          <div className="cp-header-actions">
            <button
              type="button"
              className="cp-btn-exit"
              onClick={onClose}
              title="Salir de la pantalla y volver a la tienda"
            >
              <ArrowLeft size={14} /> Salir a la tienda
            </button>
            <button type="button" className="cp-signout" onClick={onSignOut}>
              <LogOut size={14} /> Cerrar Sesión
            </button>
            <button type="button" className="cp-close" onClick={onClose} aria-label="Cerrar portal">
              <X size={19} />
            </button>
          </div>
        </header>

        {/* Tab Navigation */}
        <nav className="cp-tabs" aria-label="Secciones del portal">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`cp-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{TAB_LABELS[tab.id]}</span>
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span className="cp-tab-count">{tab.count}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Tab Contents */}
        <div className="cp-content">
          {isLoading && (
            <div className="cp-state">
              <RefreshCw size={26} className="cp-spin" />
              <p>Cargando información de tu cuenta...</p>
            </div>
          )}

          {!isLoading && errorMessage && (
            <div className="cp-state cp-state-error">
              <p>{errorMessage}</p>
              <button type="button" className="cp-retry" onClick={loadPortal}>
                <RefreshCw size={14} /> Reintentar
              </button>
            </div>
          )}

          {/* TAB 1: MIS PEDIDOS (Image 4 Reference) */}
          {!isLoading && !errorMessage && activeTab === 'pedidos' && (
            <section className="cp-section">
              <div className="cp-section-head">
                <div>
                  <h3>MIS PEDIDOS REALIZADOS</h3>
                  <p>Historial completo de tus compras y seguimiento en tiempo real.</p>
                </div>
                <div className="cp-filter-row">
                  <div className="cp-date-input-wrap">
                    <input
                      type="date"
                      className="cp-date-input"
                      value={orderDateFilter}
                      onChange={(e) => setOrderDateFilter(e.target.value)}
                      title="Filtrar por fecha"
                    />
                  </div>
                  <button type="button" className="cp-refresh" onClick={loadPortal} aria-label="Actualizar pedidos">
                    <RefreshCw size={15} />
                  </button>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="cp-empty-box">
                  <Package size={40} className="text-slate-300" />
                  <h4>No se encontraron pedidos</h4>
                  <p>Aún no tienes pedidos registrados en esta fecha o estado.</p>
                </div>
              ) : (
                <div className="cp-orders-list">
                  {filteredOrders.map(order => {
                    const statusKey = (order.delivery_status || 'RECIBIDO').toUpperCase();
                    const statusLabel = DELIVERY_STATUS_LABELS[statusKey] || statusKey;
                    const items = order.items || [];
                    const orderNum = String(order.order_number || order.id || '').replace(/^#/, '');

                    return (
                      <article key={order.id || order.order_number} className="cp-order-card-ref">
                        <div className="cp-order-top-row">
                          <div className="cp-order-title-box">
                            <span className="cp-order-ref-num">Orden #{orderNum}</span>
                            <span className="cp-badge-delivered">{statusLabel}</span>
                          </div>

                          <div className="cp-order-right-actions">
                            <span className="cp-order-price-bold">{formatUSD(Number(order.total_usd) || 0)}</span>
                            {onOpenTracker && (
                              <button
                                type="button"
                                className="btn-minimal-tracker"
                                onClick={() => onOpenTracker(order)}
                              >
                                Rastrear <ExternalLink size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="cp-order-date-row">{formatDateLong(order.created_at)}</div>

                        {/* Bullet items list matching Image 4 */}
                        <div className="cp-order-items-bullets">
                          {items.length === 0 ? (
                            <div className="cp-order-bullet-item">• Compra en tienda virtual</div>
                          ) : (
                            items.map((item, idx) => (
                              <div key={idx} className="cp-order-bullet-item">
                                <span className="cp-bullet-name">
                                  • {item.name || item.sku} {Number(item.quantity) > 1 ? `x${item.quantity}` : 'x1'}
                                </span>
                                <span className="cp-bullet-price">{formatUSD(Number(item.total_usd) || 0)}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* TAB 2: MIS COMPRAS (Image 1 Reference: FACTURACIÓN ELECTRÓNICA) */}
          {!isLoading && !errorMessage && activeTab === 'compras' && (
            <section className="cp-section">
              <div className="cp-section-head">
                <div>
                  <h3>FACTURACIÓN ELECTRÓNICA</h3>
                  <p>Facturas digitales asociadas a tus compras con tu RIF/Cédula.</p>
                </div>
                <button type="button" className="cp-refresh" onClick={loadPortal} aria-label="Actualizar compras">
                  <RefreshCw size={15} />
                </button>
              </div>

              {purchases.length === 0 ? (
                <div className="cp-empty-box">
                  <FileText size={40} className="text-slate-300" />
                  <h4>Sin facturas digitales registradas</h4>
                  <p>Tus compras facturadas se registrarán aquí con tu cédula o RIF.</p>
                </div>
              ) : (
                <div className="cp-invoices-list">
                  {purchases.map(purchase => {
                    const docNum = purchase.doc_number || `FAC-2026-${String(purchase.id || '1').slice(0, 3)}`;
                    const orderRefNum = purchase.order_number || String(purchase.id || '').slice(0, 4);

                    return (
                      <article
                        key={purchase.id || purchase.doc_number}
                        className="cp-invoice-card"
                        onClick={() => onOpenTracker && onOpenTracker(String(purchase.order_number || purchase.doc_number || ''))}
                        title="Haz clic para ver seguimiento o detalle"
                      >
                        <div className="cp-invoice-icon-box">
                          <FileText size={22} className="cp-invoice-icon" />
                        </div>

                        <div className="cp-invoice-info">
                          <div className="cp-invoice-title">Factura #{docNum}</div>
                          <div className="cp-invoice-subtitle">
                            Orden #{orderRefNum} • {formatDateShort(purchase.created_at)}
                          </div>
                        </div>

                        <div className="cp-invoice-right">
                          <span className="cp-invoice-amount">{formatUSD(Number(purchase.total_usd) || 0)}</span>
                          <span className="cp-badge-pagada">PAGADA</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* TAB 3: LISTA DE DESEO (Image 3 Reference) */}
          {!isLoading && !errorMessage && activeTab === 'deseo' && (
            <section className="cp-section">
              <div className="cp-section-head">
                <div>
                  <h3>MI LISTA DE DESEOS</h3>
                  <p>Guarda los artículos que deseas adquirir. Se eliminarán automáticamente al comprarlos.</p>
                </div>
                <button type="button" className="cp-refresh" onClick={loadPortal} aria-label="Actualizar lista de deseo">
                  <RefreshCw size={15} />
                </button>
              </div>

              {wishlist.length === 0 ? (
                /* Exact Match to Image 3 empty state */
                <div className="cp-wishlist-empty-card">
                  <div className="cp-wishlist-heart-wrap">
                    <Heart size={48} className="cp-wishlist-empty-heart" strokeWidth={1.4} />
                  </div>
                  <h4>Tu lista de deseos está vacía.</h4>
                  <p>Navega por nuestro catálogo y haz clic en el corazón de cualquier producto para guardarlo aquí.</p>
                </div>
              ) : (
                <div className="cp-wishlist-grid">
                  {wishlist.map(item => (
                    <article key={item.product_id || item.id} className="cp-wishlist-card">
                      <div className="cp-wishlist-thumb">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name || ''} loading="lazy" />
                        ) : (
                          <Package size={24} />
                        )}
                      </div>
                      <div className="cp-wishlist-body">
                        <h4>{item.name || item.sku}</h4>
                        <span className="cp-wishlist-sku">SKU: {item.sku}</span>
                        <strong className="cp-wishlist-price">{formatUSD(Number(item.price_usd) || 0)}</strong>
                      </div>
                      <div className="cp-wishlist-actions">
                        {onAddToCartFromWishlist && (
                          <button
                            type="button"
                            className="cp-wishlist-add"
                            onClick={() => onAddToCartFromWishlist(item.sku || '')}
                          >
                            <ChevronRight size={14} /> Agregar
                          </button>
                        )}
                        <button
                          type="button"
                          className="cp-wishlist-remove"
                          onClick={() => toggleWishlistItem(item)}
                          aria-label={`Quitar ${item.name || ''} de la lista de deseos`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* TAB 4: MI PERFIL (Image 2 Reference) */}
          {!isLoading && !errorMessage && activeTab === 'perfil' && (
            <section className="cp-section cp-profile-flow">
              {/* SECTION 1: INFORMACIÓN DE LA CUENTA */}
              <div className="cp-profile-card">
                <div className="cp-profile-card-header">
                  <div className="cp-profile-section-title">
                    <User size={16} className="text-slate-600" />
                    <span>INFORMACIÓN DE LA CUENTA</span>
                  </div>
                </div>

                {profileSuccessMsg && (
                  <div className="cp-profile-success-alert">
                    <span>{profileSuccessMsg}</span>
                  </div>
                )}

                {isEditingProfile ? (
                  <form onSubmit={handleSaveProfile} className="cp-profile-edit-form">
                    <div className="cp-form-grid">
                      <div className="cp-field-box">
                        <label>NOMBRE REGISTRADO:</label>
                        <input
                          type="text"
                          required
                          value={editFullName}
                          onChange={(e) => setEditFullName(e.target.value)}
                        />
                      </div>
                      <div className="cp-field-box">
                        <label>CORREO ELECTRÓNICO:</label>
                        <input type="email" disabled value={email} />
                      </div>
                      <div className="cp-field-box">
                        <label>TIPO DE DOCUMENTO / RIF:</label>
                        <input
                          type="text"
                          placeholder="V-12345678 o J-12345678"
                          value={editDocId}
                          onChange={(e) => setEditDocId(e.target.value)}
                        />
                      </div>
                      <div className="cp-field-box">
                        <label>TELÉFONO DE CONTACTO:</label>
                        <input
                          type="text"
                          placeholder="0412-1234567"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="cp-form-btn-row">
                      <button type="submit" className="cp-btn-amber" disabled={isSavingProfile}>
                        {isSavingProfile ? 'Guardando...' : 'GUARDAR CAMBIOS'}
                      </button>
                      <button
                        type="button"
                        className="cp-btn-cancel"
                        onClick={() => setIsEditingProfile(false)}
                      >
                        CANCELAR
                      </button>
                    </div>
                  </form>
                ) : (
                  <div>
                    {/* 2x2 grid matching Image 2 */}
                    <div className="cp-profile-display-grid">
                      <div className="cp-field-display">
                        <span className="cp-display-label">NOMBRE REGISTRADO:</span>
                        <span className="cp-display-val">{payload?.customer.full_name || displayName || 'No registrado'}</span>
                      </div>
                      <div className="cp-field-display">
                        <span className="cp-display-label">CORREO ELECTRÓNICO:</span>
                        <span className="cp-display-val">{email}</span>
                      </div>
                      <div className="cp-field-display">
                        <span className="cp-display-label">TIPO DE DOCUMENTO / RIF:</span>
                        <span className="cp-display-val">{payload?.customer.document_id || 'V-'}</span>
                      </div>
                      <div className="cp-field-display">
                        <span className="cp-display-label">TELÉFONO DE CONTACTO:</span>
                        <span className="cp-display-val">{payload?.customer.phone || '0412571444'}</span>
                      </div>
                    </div>

                    <div className="cp-profile-btn-right">
                      <button
                        type="button"
                        className="cp-btn-amber"
                        onClick={() => setIsEditingProfile(true)}
                      >
                        <Edit2 size={13} /> EDITAR PERFIL
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 2: DIRECCIONES DE ENTREGA */}
              <div className="cp-profile-card">
                <div className="cp-profile-card-header cp-between">
                  <div className="cp-profile-section-title">
                    <MapPin size={16} className="text-sky-600" />
                    <span>DIRECCIONES DE ENTREGA</span>
                  </div>
                  <button
                    type="button"
                    className="cp-btn-blue-sm"
                    onClick={() => setIsAddingAddress(!isAddingAddress)}
                  >
                    <Plus size={14} /> Nueva Dirección
                  </button>
                </div>

                {isAddingAddress && (
                  <form onSubmit={handleAddAddress} className="cp-add-address-form">
                    <input
                      type="text"
                      required
                      placeholder="Calle, número de casa/apto, punto de referencia y ciudad..."
                      value={newAddressText}
                      onChange={(e) => setNewAddressText(e.target.value)}
                    />
                    <div className="cp-form-btn-row">
                      <button type="submit" className="cp-btn-blue-sm" disabled={isSavingAddress}>
                        {isSavingAddress ? 'Guardando...' : 'Guardar Dirección'}
                      </button>
                      <button
                        type="button"
                        className="cp-btn-cancel"
                        onClick={() => setIsAddingAddress(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}

                <div className="cp-addresses-list">
                  {(payload?.customer.addresses && payload.customer.addresses.length > 0) ? (
                    payload.customer.addresses.map((addr, idx) => (
                      <div key={idx} className="cp-address-row-box">
                        <div className="cp-address-text">
                          <MapPin size={15} className="text-slate-400 flex-shrink-0" />
                          <span>{addr}</span>
                        </div>
                        <button
                          type="button"
                          className="cp-btn-del-addr"
                          onClick={() => handleRemoveAddress(addr)}
                          title="Eliminar dirección"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))
                  ) : (
                    /* Default demo address if none registered */
                    <div className="cp-address-row-box">
                      <div className="cp-address-text">
                        <MapPin size={15} className="text-slate-400 flex-shrink-0" />
                        <span>carreca 6 entre calle 19 y 20, casa s/n barinitas edo. barinas</span>
                      </div>
                      <button
                        type="button"
                        className="cp-btn-del-addr"
                        onClick={() => handleRemoveAddress('carreca 6 entre calle 19 y 20, casa s/n barinitas edo. barinas')}
                        title="Eliminar dirección"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 3: CAMBIAR MI CONTRASEÑA */}
              <div className="cp-profile-card">
                <div className="cp-profile-card-header">
                  <div className="cp-profile-section-title">
                    <Lock size={16} className="text-slate-600" />
                    <span>CAMBIAR MI CONTRASEÑA</span>
                  </div>
                </div>

                {passwordSuccess && (
                  <div className="cp-profile-success-alert">
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                {passwordError && (
                  <div className="cp-profile-error-alert">
                    <AlertCircle size={14} />
                    <span>{passwordError}</span>
                  </div>
                )}

                <form onSubmit={handleUpdatePassword} className="cp-password-form">
                  <div className="cp-form-grid">
                    <div className="cp-field-box">
                      <label>NUEVA CONTRASEÑA *</label>
                      <input
                        type="password"
                        placeholder="Mínimo 6 caracteres"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="cp-field-box">
                      <label>CONFIRMAR NUEVA CONTRASEÑA *</label>
                      <input
                        type="password"
                        placeholder="Repetir clave"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button type="submit" className="cp-btn-blue-submit" disabled={isSavingPassword}>
                    {isSavingPassword ? 'ACTUALIZANDO...' : 'ACTUALIZAR CONTRASEÑA'}
                  </button>
                </form>
              </div>
            </section>
          )}
        </div>
      </div>

      <style>{`
        .cp-root {
          position: fixed;
          inset: 0;
          z-index: 1300;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .cp-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(4px);
        }
        .cp-panel {
          position: relative;
          width: min(940px, 100%);
          max-height: min(90vh, 920px);
          background: #ffffff;
          border-radius: 18px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .cp-header {
          background: #0f172a;
          color: #ffffff;
          padding: 16px 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .cp-header-user { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .cp-avatar {
          width: 44px; height: 44px; border-radius: 12px;
          background: #0284c7; color: #ffffff;
          display: flex; align-items: center; justify-content: center;
          font-weight: 900; font-size: 18px; flex-shrink: 0;
        }
        .cp-header-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .cp-header-name-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
        .cp-header-name { font-size: 15px; font-weight: 900; letter-spacing: 0.03em; color: #ffffff; }
        .cp-verified {
          display: inline-flex; align-items: center;
          background: rgba(16, 185, 129, 0.2); color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.5);
          border-radius: 999px; padding: 2px 9px; font-size: 10px; font-weight: 850; letter-spacing: 0.05em;
        }
        .cp-header-email { font-size: 12.5px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cp-header-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .cp-btn-exit {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(255, 255, 255, 0.12); color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 9px; padding: 7px 13px; font-size: 12px; font-weight: 750; cursor: pointer;
          transition: all 0.15s ease;
        }
        .cp-btn-exit:hover {
          background: rgba(255, 255, 255, 0.24); border-color: #ffffff;
        }
        .cp-signout {
          display: inline-flex; align-items: center; gap: 6px;
          background: #dc2626; color: #ffffff; border: none;
          border-radius: 9px; padding: 8px 14px; font-size: 12px; font-weight: 750; cursor: pointer;
          transition: background 0.15s ease;
        }
        .cp-signout:hover { background: #b91c1c; }
        .cp-close {
          background: transparent; border: none; color: #cbd5e1; cursor: pointer;
          width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
          transition: all 0.15s ease;
        }
        .cp-close:hover { background: rgba(255,255,255,0.1); color: #ffffff; }
        .cp-tabs {
          display: flex; gap: 6px; padding: 12px 20px;
          border-bottom: 1px solid #e2e8f0; background: #ffffff; overflow-x: auto;
        }
        .cp-tab {
          display: inline-flex; align-items: center; gap: 7px;
          background: transparent; border: none; color: #475569;
          border-radius: 9px; padding: 9px 16px; font-size: 12.5px; font-weight: 750;
          cursor: pointer; white-space: nowrap; letter-spacing: 0.03em;
          transition: all 0.15s ease;
        }
        .cp-tab:hover { background: #f1f5f9; color: #0f172a; }
        .cp-tab.active { background: #0284c7; color: #ffffff; }
        .cp-tab-count {
          background: #e2e8f0; color: #0f172a; border-radius: 999px;
          min-width: 18px; padding: 1px 6px; font-size: 10.5px; font-weight: 800; text-align: center;
        }
        .cp-tab.active .cp-tab-count {
          background: rgba(255,255,255,0.25); color: #ffffff;
        }
        .cp-content { padding: 22px; overflow-y: auto; flex: 1; background: #f8fafc; }
        .cp-section { display: flex; flex-direction: column; gap: 16px; }
        .cp-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
        .cp-section-head h3 { margin: 0 0 4px; font-size: 16px; font-weight: 900; color: #0f172a; letter-spacing: 0.03em; }
        .cp-section-head p { margin: 0; font-size: 13px; color: #64748b; }
        .cp-filter-row { display: flex; align-items: center; gap: 8px; }
        .cp-date-input-wrap { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 9px; padding: 4px 8px; }
        .cp-date-input { border: none; outline: none; font-size: 12.5px; color: #334155; }
        .cp-refresh {
          background: #ffffff; border: 1px solid #cbd5e1; color: #475569;
          width: 36px; height: 36px; border-radius: 9px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          transition: all 0.15s ease;
        }
        .cp-refresh:hover { border-color: #0284c7; color: #0284c7; }
        .cp-state {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 48px 20px; text-align: center; color: #94a3b8;
        }
        .cp-spin { animation: cp-spin 1s linear infinite; }
        @keyframes cp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .cp-empty-box {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px;
          padding: 48px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px;
        }
        .cp-empty-box h4 { margin: 0; font-size: 15px; font-weight: 800; color: #0f172a; }
        .cp-empty-box p { margin: 0; font-size: 13px; color: #64748b; }

        /* Orders Cards (Image 4) */
        .cp-orders-list { display: flex; flex-direction: column; gap: 14px; }
        .cp-order-card-ref {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;
          padding: 18px 22px; display: flex; flex-direction: column; gap: 10px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
        }
        .cp-order-top-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .cp-order-title-box { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .cp-order-ref-num { font-size: 15px; font-weight: 900; color: #0284c7; }
        .cp-badge-delivered {
          background: #fff6e3; color: #966b13; border: 1px solid #fde68a;
          border-radius: 8px; padding: 3px 9px; font-size: 10.5px; font-weight: 850;
        }
        .cp-order-right-actions { display: flex; align-items: center; gap: 14px; }
        .cp-order-price-bold { font-size: 15px; font-weight: 900; color: #0f172a; }
        .cp-btn-rastrear {
          display: inline-flex; align-items: center; gap: 4px;
          background: transparent; color: #475569; border: 1px solid #cbd5e1;
          border-radius: 6px; padding: 2px 6px; font-size: 11px; font-weight: 600; cursor: pointer;
          transition: all 0.15s ease;
        }
        .cp-btn-rastrear:hover { background: #f1f5f9; color: #0f172a; border-color: #94a3b8; }
        .cp-order-date-row { font-size: 12px; color: #64748b; }
        .cp-order-items-bullets {
          display: flex; flex-direction: column; gap: 4px; padding-top: 4px;
        }
        .cp-order-bullet-item {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 12.5px; color: #334155;
        }
        .cp-bullet-name { color: #1e293b; }
        .cp-bullet-price { font-weight: 700; color: #0f172a; }

        /* Invoices Cards (Image 1) */
        .cp-invoices-list { display: flex; flex-direction: column; gap: 12px; }
        .cp-invoice-card {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;
          padding: 16px 22px; display: flex; align-items: center; justify-content: space-between; gap: 16px;
          cursor: pointer; transition: all 0.15s ease;
        }
        .cp-invoice-card:hover { border-color: #0284c7; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .cp-invoice-icon-box {
          width: 44px; height: 44px; border-radius: 12px;
          background: #eff6ff; border: 1px solid #bfdbfe; color: #0284c7;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .cp-invoice-info { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .cp-invoice-title { font-size: 14.5px; font-weight: 900; color: #0f172a; }
        .cp-invoice-subtitle { font-size: 12px; color: #64748b; }
        .cp-invoice-right { display: flex; align-items: center; gap: 14px; }
        .cp-invoice-amount { font-size: 15px; font-weight: 900; color: #0f172a; }
        .cp-badge-pagada {
          background: #e9f7f1; color: #237d5f; border: 1px solid #a7f3d0;
          border-radius: 8px; padding: 4px 10px; font-size: 11px; font-weight: 850; letter-spacing: 0.04em;
        }

        /* Wishlist (Image 3) */
        .cp-wishlist-empty-card {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 18px;
          padding: 64px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
        }
        .cp-wishlist-heart-wrap { margin-bottom: 6px; }
        .cp-wishlist-empty-heart { color: #cbd5e1; }
        .cp-wishlist-empty-card h4 { margin: 0; font-size: 15.5px; font-weight: 800; color: #1e293b; }
        .cp-wishlist-empty-card p { margin: 0; font-size: 13px; color: #64748b; max-width: 480px; }
        .cp-wishlist-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
        .cp-wishlist-card {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px;
          display: flex; gap: 12px; align-items: flex-start;
        }
        .cp-wishlist-thumb {
          width: 56px; height: 56px; border-radius: 10px; background: #f1f5f9;
          display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; color: #94a3b8;
        }
        .cp-wishlist-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .cp-wishlist-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
        .cp-wishlist-body h4 { margin: 0; font-size: 13px; font-weight: 750; color: #0f172a; }
        .cp-wishlist-sku { font-size: 11px; color: #94a3b8; }
        .cp-wishlist-price { font-size: 13.5px; font-weight: 900; color: #0284c7; }
        .cp-wishlist-actions { display: flex; flex-direction: column; gap: 6px; }
        .cp-wishlist-add {
          display: inline-flex; align-items: center; gap: 4px;
          background: #0284c7; color: #ffffff; border: none; border-radius: 8px;
          padding: 6px 10px; font-size: 11px; font-weight: 750; cursor: pointer;
        }
        .cp-wishlist-remove {
          background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px;
          width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer;
        }

        /* Profile (Image 2) */
        .cp-profile-flow { display: flex; flex-direction: column; gap: 16px; }
        .cp-profile-card {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;
          padding: 22px; display: flex; flex-direction: column; gap: 16px;
        }
        .cp-profile-card-header { display: flex; align-items: center; }
        .cp-profile-card-header.cp-between { justify-content: space-between; }
        .cp-profile-section-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 13.5px; font-weight: 850; color: #1e293b; letter-spacing: 0.03em;
        }
        .cp-profile-success-alert {
          background: #ecfdf5; border: 1.5px solid #a7f3d0; color: #065f46;
          border-radius: 10px; padding: 12px 16px; font-size: 13px; font-weight: 800;
        }
        .cp-profile-error-alert {
          background: #fef2f2; border: 1.5px solid #fecaca; color: #b91c1c;
          border-radius: 10px; padding: 10px 14px; font-size: 12.5px; font-weight: 700;
          display: flex; align-items: center; gap: 8px;
        }
        .cp-profile-display-grid {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;
        }
        .cp-field-display {
          border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 12px 16px;
          display: flex; flex-direction: column; gap: 4px;
        }
        .cp-display-label { font-size: 10.5px; font-weight: 850; color: #64748b; letter-spacing: 0.04em; }
        .cp-display-val { font-size: 14px; font-weight: 800; color: #0f172a; word-break: break-all; }
        .cp-profile-btn-right { display: flex; justify-content: flex-end; margin-top: 14px; }
        .cp-btn-amber {
          display: inline-flex; align-items: center; gap: 7px;
          background: #f59e0b; color: #ffffff; border: none;
          border-radius: 9px; padding: 10px 20px; font-size: 13px; font-weight: 850;
          letter-spacing: 0.02em; cursor: pointer; transition: background 0.15s ease;
        }
        .cp-btn-amber:hover { background: #d97706; }
        .cp-btn-blue-sm {
          display: inline-flex; align-items: center; gap: 6px;
          background: #0284c7; color: #ffffff; border: none;
          border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 800; cursor: pointer;
        }
        .cp-btn-blue-sm:hover { background: #0369a1; }
        .cp-btn-cancel {
          background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569;
          border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 750; cursor: pointer;
        }
        .cp-addresses-list { display: flex; flex-direction: column; gap: 10px; }
        .cp-address-row-box {
          border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 14px 18px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .cp-address-text { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #1e293b; font-weight: 600; }
        .cp-btn-del-addr {
          background: transparent; border: none; color: #ef4444; cursor: pointer;
          width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
        }
        .cp-btn-del-addr:hover { background: #fee2e2; }
        .cp-add-address-form {
          display: flex; flex-direction: column; gap: 10px; background: #f8fafc;
          border: 1px dashed #cbd5e1; border-radius: 12px; padding: 14px;
        }
        .cp-add-address-form input {
          width: 100%; height: 42px; border: 1.5px solid #cbd5e1; border-radius: 8px;
          padding: 0 12px; font-size: 13px;
        }
        .cp-form-btn-row { display: flex; align-items: center; gap: 8px; }
        .cp-form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
        .cp-field-box { display: flex; flex-direction: column; gap: 5px; }
        .cp-field-box label { font-size: 11px; font-weight: 850; color: #64748b; }
        .cp-field-box input {
          height: 42px; border: 1.5px solid #cbd5e1; border-radius: 10px;
          padding: 0 12px; font-size: 13.5px; color: #0f172a; outline: none;
        }
        .cp-field-box input:focus { border-color: #0284c7; box-shadow: 0 0 0 3px rgba(2,132,199,0.15); }
        .cp-field-box input:disabled { background: #f1f5f9; color: #94a3b8; }
        .cp-password-form { display: flex; flex-direction: column; gap: 14px; }
        .cp-btn-blue-submit {
          align-self: flex-start;
          background: #0284c7; color: #ffffff; border: none;
          border-radius: 9px; padding: 11px 22px; font-size: 13px; font-weight: 850;
          letter-spacing: 0.02em; cursor: pointer; transition: background 0.15s ease;
        }
        .cp-btn-blue-submit:hover { background: #0369a1; }

        @media (max-width: 640px) {
          .cp-root { padding: 0; }
          .cp-panel { width: 100%; height: 100%; max-height: 100vh; border-radius: 0; border: none; }
          .cp-header { padding: 12px 14px; }
          .cp-header-name { font-size: 13px; }
          .cp-verified { font-size: 9px; }
          .cp-signout { padding: 7px 10px; font-size: 11px; }
          .cp-content { padding: 14px; }
          .cp-tabs { padding: 8px 10px; }
          .cp-tab { padding: 8px 12px; font-size: 11px; }
          .cp-profile-display-grid, .cp-form-grid { grid-template-columns: 1fr; }
          .cp-order-top-row { flex-direction: column; align-items: flex-start; }
          .cp-order-right-actions { width: 100%; justify-content: space-between; }
        }
      `}</style>
    </div>
  );
}
