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
  Trash2
} from 'lucide-react';
import { formatUSD, formatVES } from '../../../lib/currency';

interface CustomerPortalOrderItem {
  sku?: string;
  name?: string;
  quantity?: number;
  unit_price_usd?: number;
  total_usd?: number;
  total_ves?: number;
}

interface CustomerPortalOrder {
  id?: string;
  order_number?: string;
  created_at?: string;
  delivery_status?: string;
  payment_status?: string;
  delivery_method?: string;
  delivery_address?: string;
  total_usd?: number;
  total_ves?: number;
  exchange_rate?: number;
  items?: CustomerPortalOrderItem[];
}

interface CustomerPortalPurchase {
  id?: string;
  doc_number?: string;
  doc_type?: string;
  status?: string;
  payment_type?: string;
  total_usd?: number;
  total_ves?: number;
  created_at?: string;
  items?: CustomerPortalOrderItem[];
}

interface CustomerPortalWishlistItem {
  id?: string;
  product_id?: string;
  sku?: string;
  name?: string;
  price_usd?: number;
  image_url?: string;
  created_at?: string;
}

interface CustomerPortalPayload {
  customer: {
    email: string;
    full_name: string;
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
  onClose: () => void;
  onSignOut: () => void;
  onAddToCartFromWishlist?: (sku: string) => void;
}

type PortalTab = 'pedidos' | 'compras' | 'deseo' | 'perfil';

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  RECIBIDO: 'Recibido',
  PREPARADO: 'En preparación',
  LISTO_PARA_ENTREGAR: 'Listo para entregar',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado'
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Pago pendiente',
  PAGADO: 'Pagado',
  REEMBOLSADO: 'Reembolsado'
};

const TAB_LABELS: Record<PortalTab, string> = {
  pedidos: 'Mis Pedidos',
  compras: 'Mis Compras',
  deseo: 'Lista de Deseo',
  perfil: 'Mi Perfil'
};

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function deliveryStatusTone(status?: string): string {
  if (status === 'ENTREGADO') return 'success';
  if (status === 'CANCELADO') return 'danger';
  if (status === 'EN_CAMINO' || status === 'LISTO_PARA_ENTREGAR') return 'info';
  return 'warning';
}

export function CustomerPortal({
  isOpen,
  email,
  displayName,
  onClose,
  onSignOut,
  onAddToCartFromWishlist
}: CustomerPortalProps) {
  const [activeTab, setActiveTab] = useState<PortalTab>('pedidos');
  const [payload, setPayload] = useState<CustomerPortalPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

  const orders = payload?.orders || [];
  const purchases = payload?.purchases || [];
  const wishlist = payload?.wishlist || [];

  const totalPurchasedUsd = useMemo(
    () => purchases.reduce((acc, purchase) => acc + (Number(purchase.total_usd) || 0), 0),
    [purchases]
  );

  if (!isOpen) return null;

  const tabs: { id: PortalTab; icon: React.ReactNode; count?: number }[] = [
    { id: 'pedidos', icon: <Package size={15} />, count: orders.length },
    { id: 'compras', icon: <FileText size={15} /> },
    { id: 'deseo', icon: <Heart size={15} />, count: wishlist.length },
    { id: 'perfil', icon: <User size={15} /> }
  ];

  return (
    <div className="cp-root" role="dialog" aria-modal="true" aria-label="Portal de cliente">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="cp-panel">
        <header className="cp-header">
          <div className="cp-header-user">
            <div className="cp-avatar">{(displayName || email || 'C').slice(0, 1).toUpperCase()}</div>
            <div className="cp-header-text">
              <div className="cp-header-name-row">
                <span className="cp-header-name">{(displayName || email).toUpperCase()}</span>
                <span className="cp-verified">
                  <ShieldCheck size={11} /> CLIENTE VERIFICADO
                </span>
              </div>
              <span className="cp-header-email">{email}</span>
            </div>
          </div>
          <div className="cp-header-actions">
            <button type="button" className="cp-signout" onClick={onSignOut}>
              <LogOut size={14} /> Cerrar Sesión
            </button>
            <button type="button" className="cp-close" onClick={onClose} aria-label="Cerrar portal">
              <X size={18} />
            </button>
          </div>
        </header>

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
              {typeof tab.count === 'number' && tab.count > 0 && <span className="cp-tab-count">{tab.count}</span>}
            </button>
          ))}
        </nav>

        <div className="cp-content">
          {isLoading && (
            <div className="cp-state">
              <RefreshCw size={26} className="cp-spin" />
              <p>Cargando tu portal de cliente...</p>
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

          {!isLoading && !errorMessage && activeTab === 'pedidos' && (
            <section className="cp-section">
              <div className="cp-section-head">
                <div>
                  <h3>MIS PEDIDOS REALIZADOS</h3>
                  <p>Historial completo de tus compras y seguimiento en tiempo real.</p>
                </div>
                <button type="button" className="cp-refresh" onClick={loadPortal} aria-label="Actualizar pedidos">
                  <RefreshCw size={15} />
                </button>
              </div>

              {orders.length === 0 ? (
                <div className="cp-empty">
                  <Package size={34} />
                  <p>Aun no tienes pedidos realizados.</p>
                </div>
              ) : (
                <div className="cp-list">
                  {orders.map(order => (
                    <article key={order.id || order.order_number} className="cp-order-card">
                      <div className="cp-order-head">
                        <div className="cp-order-id">
                          <span className="cp-order-number">Orden #{order.order_number}</span>
                          <span className={`cp-badge cp-badge-${deliveryStatusTone(order.delivery_status)}`}>
                            {DELIVERY_STATUS_LABELS[order.delivery_status || ''] || order.delivery_status || 'Recibido'}
                          </span>
                        </div>
                        <div className="cp-order-total">
                          <strong>{formatUSD(Number(order.total_usd) || 0)}</strong>
                          {Number(order.total_ves) > 0 && (
                            <span>{formatVES(Number(order.total_ves) || 0)}</span>
                          )}
                        </div>
                      </div>

                      <div className="cp-order-meta">
                        <span>
                          <Clock size={12} /> {formatDate(order.created_at)}
                        </span>
                        <span>
                          <Truck size={12} />{' '}
                          {order.delivery_method === 'DOMICILIO' ? 'Delivery' : 'Retiro en tienda'}
                        </span>
                        <span>
                          <CreditCard size={12} />{' '}
                          {PAYMENT_STATUS_LABELS[order.payment_status || ''] || order.payment_status || 'Pago pendiente'}
                        </span>
                      </div>

                      {order.delivery_address && (
                        <div className="cp-order-address">
                          <MapPin size={12} /> {order.delivery_address}
                        </div>
                      )}

                      <ul className="cp-order-items">
                        {(order.items || []).map((item, index) => (
                          <li key={`${item.sku || 'item'}-${index}`}>
                            <span className="cp-item-name">
                              {item.name || item.sku}
                              {Number(item.quantity) > 1 ? ` x${Number(item.quantity)}` : ''}
                            </span>
                            <span className="cp-item-price">{formatUSD(Number(item.total_usd) || 0)}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {!isLoading && !errorMessage && activeTab === 'compras' && (
            <section className="cp-section">
              <div className="cp-section-head">
                <div>
                  <h3>MIS COMPRAS</h3>
                  <p>Facturas registradas a tu nombre en el sistema de ventas.</p>
                </div>
                <button type="button" className="cp-refresh" onClick={loadPortal} aria-label="Actualizar compras">
                  <RefreshCw size={15} />
                </button>
              </div>

              {purchases.length === 0 ? (
                <div className="cp-empty">
                  <FileText size={34} />
                  <p>No hay compras registradas a tu nombre.</p>
                </div>
              ) : (
                <>
                  <div className="cp-summary">
                    <div className="cp-summary-item">
                      <span>Documentos</span>
                      <strong>{purchases.length}</strong>
                    </div>
                    <div className="cp-summary-item">
                      <span>Total comprado</span>
                      <strong>{formatUSD(totalPurchasedUsd)}</strong>
                    </div>
                  </div>
                  <div className="cp-list">
                    {purchases.map(purchase => (
                      <article key={purchase.id || purchase.doc_number} className="cp-order-card">
                        <div className="cp-order-head">
                          <div className="cp-order-id">
                            <span className="cp-order-number">Factura {purchase.doc_number}</span>
                            <span className="cp-badge cp-badge-brand">{purchase.doc_type || 'FACTURA'}</span>
                          </div>
                          <div className="cp-order-total">
                            <strong>{formatUSD(Number(purchase.total_usd) || 0)}</strong>
                            {Number(purchase.total_ves) > 0 && (
                              <span>{formatVES(Number(purchase.total_ves) || 0)}</span>
                            )}
                          </div>
                        </div>
                        <div className="cp-order-meta">
                          <span>
                            <Clock size={12} /> {formatDate(purchase.created_at)}
                          </span>
                          <span>
                            <CheckCircle size={12} /> {purchase.status || 'COMPLETADA'}
                          </span>
                          <span>
                            <CreditCard size={12} /> {purchase.payment_type || 'CONTADO'}
                          </span>
                        </div>
                        <ul className="cp-order-items">
                          {(purchase.items || []).map((item, index) => (
                            <li key={`${item.sku || 'item'}-${index}`}>
                              <span className="cp-item-name">
                                {item.name || item.sku}
                                {Number(item.quantity) > 1 ? ` x${Number(item.quantity)}` : ''}
                              </span>
                              <span className="cp-item-price">{formatUSD(Number(item.total_usd) || 0)}</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {!isLoading && !errorMessage && activeTab === 'deseo' && (
            <section className="cp-section">
              <div className="cp-section-head">
                <div>
                  <h3>LISTA DE DESEO</h3>
                  <p>Productos que guardaste para comprar mas tarde.</p>
                </div>
                <button type="button" className="cp-refresh" onClick={loadPortal} aria-label="Actualizar lista de deseo">
                  <RefreshCw size={15} />
                </button>
              </div>

              {wishlist.length === 0 ? (
                <div className="cp-empty">
                  <Heart size={34} />
                  <p>Tu lista de deseo esta vacia.</p>
                </div>
              ) : (
                <div className="cp-wishlist">
                  {wishlist.map(item => (
                    <article key={item.product_id || item.id} className="cp-wishlist-card">
                      <div className="cp-wishlist-thumb">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name || ''} loading="lazy" />
                        ) : (
                          <Package size={22} />
                        )}
                      </div>
                      <div className="cp-wishlist-body">
                        <h4>{item.name || item.sku}</h4>
                        <span className="cp-wishlist-sku">{item.sku}</span>
                        <strong>{formatUSD(Number(item.price_usd) || 0)}</strong>
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
                          aria-label={`Quitar ${item.name || ''} de la lista de deseo`}
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

          {!isLoading && !errorMessage && activeTab === 'perfil' && (
            <section className="cp-section">
              <div className="cp-section-head">
                <div>
                  <h3>MI PERFIL</h3>
                  <p>Informacion de la cuenta con la que ingresas a la tienda.</p>
                </div>
              </div>

              <div className="cp-profile-grid">
                <div className="cp-profile-item">
                  <span className="cp-profile-label">
                    <User size={13} /> Nombre
                  </span>
                  <strong>{payload?.customer.full_name || displayName || email}</strong>
                </div>
                <div className="cp-profile-item">
                  <span className="cp-profile-label">
                    <Mail size={13} /> Correo
                  </span>
                  <strong>{email}</strong>
                </div>
                <div className="cp-profile-item">
                  <span className="cp-profile-label">
                    <ShieldCheck size={13} /> Tipo de cuenta
                  </span>
                  <strong>{payload?.customer.role === 'cliente' ? 'Cliente verificado' : payload?.customer.role || 'Cliente'}</strong>
                </div>
                <div className="cp-profile-item">
                  <span className="cp-profile-label">
                    <Package size={13} /> Pedidos realizados
                  </span>
                  <strong>{orders.length}</strong>
                </div>
                <div className="cp-profile-item">
                  <span className="cp-profile-label">
                    <FileText size={13} /> Facturas a tu nombre
                  </span>
                  <strong>{purchases.length}</strong>
                </div>
                <div className="cp-profile-item">
                  <span className="cp-profile-label">
                    <Heart size={13} /> Productos en tu lista
                  </span>
                  <strong>{wishlist.length}</strong>
                </div>
              </div>

              <div className="cp-profile-note">
                <Phone size={13} />
                <span>
                  Para actualizar tus datos de contacto o recuperar una clave, comunicate con la atencion al
                  cliente de la tienda.
                </span>
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
          padding: 20px;
        }
        .cp-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(3px);
        }
        .cp-panel {
          position: relative;
          width: min(920px, 100%);
          max-height: min(88vh, 900px);
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
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .cp-header-user { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .cp-avatar {
          width: 38px; height: 38px; border-radius: 10px;
          background: #1e3a8a; color: #ffffff;
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 16px; flex-shrink: 0;
        }
        .cp-header-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .cp-header-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .cp-header-name { font-size: 14px; font-weight: 800; letter-spacing: 0.02em; }
        .cp-verified {
          display: inline-flex; align-items: center; gap: 4px;
          background: rgba(16, 185, 129, 0.16); color: #6ee7b7;
          border: 1px solid rgba(16, 185, 129, 0.4);
          border-radius: 999px; padding: 2px 8px; font-size: 10px; font-weight: 800; letter-spacing: 0.04em;
        }
        .cp-header-email { font-size: 12px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cp-header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .cp-signout {
          display: inline-flex; align-items: center; gap: 6px;
          background: #dc2626; color: #ffffff; border: none;
          border-radius: 9px; padding: 8px 12px; font-size: 12px; font-weight: 700; cursor: pointer;
        }
        .cp-signout:hover { background: #b91c1c; }
        .cp-close {
          background: transparent; border: none; color: #cbd5e1; cursor: pointer;
          width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
        }
        .cp-close:hover { background: rgba(255,255,255,0.1); color: #ffffff; }
        .cp-tabs {
          display: flex; gap: 4px; padding: 10px 16px;
          border-bottom: 1px solid #e2e8f0; background: #f8fafc; overflow-x: auto;
        }
        .cp-tab {
          display: inline-flex; align-items: center; gap: 7px;
          background: transparent; border: 1px solid transparent; color: #475569;
          border-radius: 9px; padding: 9px 14px; font-size: 12.5px; font-weight: 700;
          cursor: pointer; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.03em;
        }
        .cp-tab:hover { background: #e2e8f0; color: #0f172a; }
        .cp-tab.active { background: #0f172a; color: #ffffff; }
        .cp-tab-count {
          background: #dc2626; color: #ffffff; border-radius: 999px;
          min-width: 18px; padding: 1px 6px; font-size: 10px; font-weight: 800; text-align: center;
        }
        .cp-content { padding: 20px; overflow-y: auto; flex: 1; background: #f8fafc; }
        .cp-section { display: flex; flex-direction: column; gap: 14px; }
        .cp-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .cp-section-head h3 { margin: 0 0 4px; font-size: 15px; font-weight: 800; color: #0f172a; letter-spacing: 0.02em; }
        .cp-section-head p { margin: 0; font-size: 12.5px; color: #64748b; }
        .cp-refresh {
          background: #ffffff; border: 1px solid #e2e8f0; color: #475569;
          width: 34px; height: 34px; border-radius: 9px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .cp-refresh:hover { border-color: #1e3a8a; color: #1e3a8a; }
        .cp-state, .cp-empty {
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          padding: 42px 20px; text-align: center; color: #94a3b8;
        }
        .cp-state p, .cp-empty p { margin: 0; font-size: 13px; color: #64748b; }
        .cp-state-error p { color: #b91c1c; font-weight: 600; }
        .cp-retry {
          display: inline-flex; align-items: center; gap: 6px;
          background: #1e3a8a; color: #ffffff; border: none; border-radius: 9px;
          padding: 8px 14px; font-size: 12.5px; font-weight: 700; cursor: pointer;
        }
        .cp-spin { animation: cp-spin 1s linear infinite; }
        @keyframes cp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .cp-list { display: flex; flex-direction: column; gap: 12px; }
        .cp-order-card {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px;
          padding: 16px; display: flex; flex-direction: column; gap: 10px;
        }
        .cp-order-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .cp-order-id { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .cp-order-number { font-size: 13.5px; font-weight: 800; color: #1e3a8a; }
        .cp-order-total { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .cp-order-total strong { font-size: 15px; font-weight: 800; color: #0f172a; }
        .cp-order-total span { font-size: 11.5px; color: #64748b; }
        .cp-badge {
          display: inline-flex; align-items: center; border-radius: 999px;
          padding: 3px 9px; font-size: 10.5px; font-weight: 800; letter-spacing: 0.03em;
        }
        .cp-badge-success { background: #e9f7f1; color: #237d5f; }
        .cp-badge-warning { background: #fff6e3; color: #966b13; }
        .cp-badge-danger { background: #fff0f0; color: #a94d4d; }
        .cp-badge-info { background: #e6f6fb; color: #1f7d94; }
        .cp-badge-brand { background: #eef2ff; color: #3730a3; }
        .cp-order-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 11.5px; color: #64748b; }
        .cp-order-meta span { display: inline-flex; align-items: center; gap: 5px; }
        .cp-order-address {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11.5px; color: #475569; background: #f8fafc;
          border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; align-self: flex-start;
        }
        .cp-order-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .cp-order-items li { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12.5px; }
        .cp-item-name { color: #334155; }
        .cp-item-price { color: #0f172a; font-weight: 700; white-space: nowrap; }
        .cp-summary { display: flex; gap: 12px; flex-wrap: wrap; }
        .cp-summary-item {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;
          padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; min-width: 160px;
        }
        .cp-summary-item span { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
        .cp-summary-item strong { font-size: 17px; font-weight: 800; color: #0f172a; }
        .cp-wishlist { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
        .cp-wishlist-card {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px;
          display: flex; gap: 12px; align-items: flex-start;
        }
        .cp-wishlist-thumb {
          width: 52px; height: 52px; border-radius: 10px; background: #f1f5f9;
          display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; color: #94a3b8;
        }
        .cp-wishlist-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .cp-wishlist-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
        .cp-wishlist-body h4 { margin: 0; font-size: 13px; font-weight: 700; color: #0f172a; }
        .cp-wishlist-sku { font-size: 11px; color: #94a3b8; }
        .cp-wishlist-body strong { font-size: 13px; font-weight: 800; color: #1e3a8a; }
        .cp-wishlist-actions { display: flex; flex-direction: column; gap: 6px; }
        .cp-wishlist-add {
          display: inline-flex; align-items: center; gap: 4px;
          background: #1e3a8a; color: #ffffff; border: none; border-radius: 8px;
          padding: 6px 9px; font-size: 11px; font-weight: 700; cursor: pointer;
        }
        .cp-wishlist-remove {
          background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px;
          width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .cp-profile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
        .cp-profile-item {
          background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;
          padding: 14px 16px; display: flex; flex-direction: column; gap: 6px;
        }
        .cp-profile-label { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
        .cp-profile-item strong { font-size: 14px; font-weight: 700; color: #0f172a; word-break: break-word; }
        .cp-profile-note {
          display: flex; align-items: flex-start; gap: 8px;
          background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 12px;
          padding: 12px 14px; font-size: 12px; color: #64748b;
        }
        @media (max-width: 640px) {
          .cp-root { padding: 0; }
          .cp-panel { width: 100%; max-height: 100vh; height: 100%; border-radius: 0; border: none; }
          .cp-header { padding: 14px; }
          .cp-header-name { font-size: 12.5px; }
          .cp-verified { font-size: 9px; }
          .cp-signout { padding: 7px 9px; font-size: 11px; }
          .cp-content { padding: 14px; }
          .cp-tabs { padding: 8px 10px; }
          .cp-tab { padding: 8px 10px; font-size: 11px; }
        }
      `}</style>
    </div>
  );
}
