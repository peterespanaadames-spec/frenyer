import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  RefreshCw,
  ClipboardList,
  Clock,
  Store,
  CheckCircle2,
  Check,
  MapPin,
  CreditCard,
  MessageCircle,
  Bell,
  Search,
  Truck,
  ExternalLink
} from 'lucide-react';
import { formatUSD, formatVES } from '../../../lib/currency';
import { getBusinessProfile } from '../../../lib/businessProfile';

export interface TrackerOrderData {
  id?: string;
  order_number?: string | number;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  customer_doc?: string;
  delivery_status?: 'RECIBIDO' | 'PREPARADO' | 'LISTO_PARA_ENTREGAR' | 'EN_CAMINO' | 'ENTREGADO' | 'CANCELADO' | string;
  payment_status?: 'PENDIENTE' | 'PAGADO' | 'REEMBOLSADO' | string;
  delivery_method?: 'RETIRO' | 'DOMICILIO' | string;
  delivery_address?: string;
  payment_method?: string;
  total_usd?: number;
  total_ves?: number;
  exchange_rate?: number;
  created_at?: string;
  items?: Array<{
    sku?: string;
    name?: string;
    quantity?: number;
    unit_price_usd?: number;
    total_usd?: number;
  }>;
}

interface OrderTrackerModalProps {
  isOpen: boolean;
  orderIdOrNumber?: string;
  initialOrder?: TrackerOrderData | null;
  onClose: () => void;
}

const STEP_DEFINITIONS = [
  {
    key: 'RECIBIDO',
    title: 'RECIBIDO',
    subtitle: 'Pedido ingresado en tienda',
    icon: ClipboardList
  },
  {
    key: 'PREPARADO',
    title: 'EN PREPARACIÓN',
    subtitle: 'Preparando y empaquetando',
    icon: Clock
  },
  {
    key: 'LISTO_PARA_ENTREGAR',
    title: 'LISTO PARA RETIRAR',
    subtitle: 'Pasa a buscar tu pedido',
    icon: Store
  },
  {
    key: 'ENTREGADO',
    title: 'ENTREGADO',
    subtitle: '¡Gracias por tu compra!',
    icon: Check
  }
];

export function OrderTrackerModal({
  isOpen,
  orderIdOrNumber,
  initialOrder,
  onClose
}: OrderTrackerModalProps) {
  const [order, setOrder] = useState<TrackerOrderData | null>(initialOrder || null);
  const [searchQuery, setSearchQuery] = useState(orderIdOrNumber || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notificationsActive, setNotificationsActive] = useState(false);
  const [notificationToast, setNotificationToast] = useState('');

  const fetchOrder = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/orders/track/${encodeURIComponent(query.trim())}`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && json?.data) {
        setOrder(json.data);
      } else {
        setErrorMessage(json?.error || `No se encontró ningún pedido con el número "${query}".`);
      }
    } catch {
      setErrorMessage('No se pudo consultar el servidor. Verifica tu conexión.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (initialOrder) {
        setOrder(initialOrder);
        setSearchQuery(String(initialOrder.order_number || initialOrder.id || ''));
      } else if (orderIdOrNumber) {
        setSearchQuery(orderIdOrNumber);
        fetchOrder(orderIdOrNumber);
      }
    } else {
      setErrorMessage('');
      setNotificationToast('');
    }
  }, [isOpen, initialOrder, orderIdOrNumber, fetchOrder]);

  const handleActivateAlerts = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setNotificationsActive(true);
          setNotificationToast('¡Alertas activadas! Recibirás avisos en tu pantalla cuando cambie el estatus.');
          setTimeout(() => setNotificationToast(''), 4500);
          return;
        }
      } catch {
        // Fallback below
      }
    }
    setNotificationsActive(true);
    setNotificationToast('¡Alertas en pantalla activadas para este pedido!');
    setTimeout(() => setNotificationToast(''), 4500);
  };

  if (!isOpen) return null;

  const currentStatus = (order?.delivery_status || 'RECIBIDO').toUpperCase();
  const paymentStatus = (order?.payment_status || 'PENDIENTE').toUpperCase();

  // Status index for 4-step stepper
  let activeStepIndex = 0;
  if (currentStatus === 'PREPARADO' || currentStatus === 'EN_PREPARACION') {
    activeStepIndex = 1;
  } else if (currentStatus === 'LISTO_PARA_ENTREGAR' || currentStatus === 'LISTO' || currentStatus === 'EN_CAMINO') {
    activeStepIndex = 2;
  } else if (currentStatus === 'ENTREGADO') {
    activeStepIndex = 3;
  }

  const formattedOrderNumber = String(order?.order_number || order?.id || searchQuery || '0000000')
    .replace(/\D/g, '')
    .padStart(7, '0');

  const business = getBusinessProfile();
  const whatsappPhone = (business.phone || '584120000000').replace(/\D/g, '');
  const whatsappMessage = encodeURIComponent(
    `Hola, quisiera consultar el estatus de mi pedido #${formattedOrderNumber} a nombre de ${order?.customer_name || 'Cliente'}.`
  );
  const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${whatsappMessage}`;

  const statusLabel =
    currentStatus === 'ENTREGADO'
      ? 'Entregado'
      : currentStatus === 'LISTO_PARA_ENTREGAR'
      ? 'Listo para retirar'
      : currentStatus === 'PREPARADO'
      ? 'En preparación'
      : currentStatus === 'EN_CAMINO'
      ? 'En camino con repartidor'
      : currentStatus === 'CANCELADO'
      ? 'Cancelado'
      : 'Recibido en tienda';

  const isDelivery = order?.delivery_method === 'DOMICILIO';
  const deliveryLabel = isDelivery ? 'Delivery a Domicilio' : 'Retiro en Tienda';

  const paymentMethodLabel =
    order?.payment_method === 'PAGO_MOVIL'
      ? 'Pagomóvil'
      : order?.payment_method === 'DIVISAS_EFECTIVO'
      ? 'Divisas en Efectivo'
      : order?.payment_method === 'BS_EFECTIVO'
      ? 'Efectivo Bolívares'
      : order?.payment_method === 'TRANSFERENCIA'
      ? 'Transferencia Bancaria'
      : order?.payment_method || 'Pagomóvil';

  return (
    <div className="tracker-root" role="dialog" aria-modal="true" aria-label="Seguimiento de pedido">
      <div className="tracker-backdrop" onClick={onClose} />

      <div className="tracker-panel">
        {/* Top Header */}
        <header className="tracker-header">
          <div className="tracker-header-title">
            <span className="tracker-dot" />
            <h2>SEGUIMIENTO DE PEDIDO</h2>
          </div>
          <div className="tracker-header-actions">
            <button
              type="button"
              className="tracker-icon-btn"
              onClick={() => fetchOrder(searchQuery)}
              title="Actualizar estatus"
              aria-label="Actualizar estatus"
            >
              <RefreshCw size={17} className={isLoading ? 'tracker-spin' : ''} />
            </button>
            <button
              type="button"
              className="tracker-icon-btn"
              onClick={onClose}
              title="Cerrar ventana"
              aria-label="Cerrar modal"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Content body */}
        <div className="tracker-body">
          {/* Search bar if no order selected or user wants to lookup another */}
          <form
            className="tracker-search-bar"
            onSubmit={(e) => {
              e.preventDefault();
              fetchOrder(searchQuery);
            }}
          >
            <Search size={16} className="tracker-search-icon" />
            <input
              type="text"
              className="tracker-search-input"
              placeholder="Ingresa número de orden (#54 o #0000054)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="tracker-search-btn" disabled={isLoading}>
              Buscar
            </button>
          </form>

          {errorMessage && (
            <div className="tracker-error-alert">
              <span>{errorMessage}</span>
            </div>
          )}

          {notificationToast && (
            <div className="tracker-success-toast">
              <span>{notificationToast}</span>
            </div>
          )}

          {order && (
            <div className="tracker-content-flow">
              {/* Box 1: NÚMERO DE PEDIDO & ESTADO DE PAGO */}
              <div className="tracker-card tracker-info-row">
                <div className="tracker-order-meta-col">
                  <span className="tracker-meta-label">NÚMERO DE PEDIDO</span>
                  <div className="tracker-order-number">#{formattedOrderNumber}</div>
                  <div className="tracker-customer-name">
                    Cliente: <strong>{order.customer_name || 'Cliente registrado'}</strong>
                  </div>
                </div>

                <div className="tracker-payment-meta-col">
                  <span className="tracker-meta-label">ESTADO DE PAGO</span>
                  <span
                    className={`tracker-pay-badge ${
                      paymentStatus === 'PAGADO' ? 'paid' : paymentStatus === 'REEMBOLSADO' ? 'refunded' : 'pending'
                    }`}
                  >
                    <span className="tracker-badge-dot" />
                    {paymentStatus === 'PAGADO' ? 'PAGADO' : paymentStatus === 'REEMBOLSADO' ? 'REEMBOLSADO' : 'PENDIENTE'}
                  </span>
                </div>
              </div>

              {/* Box 2: ESTATUS ACTUAL BANNER */}
              <div className="tracker-status-box">
                <span className="tracker-status-label">ESTATUS ACTUAL</span>
                <div className="tracker-status-value">{statusLabel}</div>
              </div>

              {/* Box 3: PUSH NOTIFICATIONS BANNER */}
              <div className="tracker-push-box">
                <div className="tracker-push-icon-circle">
                  <span className="tracker-push-dot" />
                  <Bell size={18} className="tracker-bell-icon" />
                </div>
                <div className="tracker-push-text">
                  <strong>🔔 NOTIFICACIONES PUSH EN ESTA PANTALLA</strong>
                  <p>
                    Recibe alertas instantáneas en tu dispositivo al cambiar el estado de tu pedido en tiempo real,
                    totalmente gratis.
                  </p>
                  <button
                    type="button"
                    className={`tracker-push-btn ${notificationsActive ? 'active' : ''}`}
                    onClick={handleActivateAlerts}
                  >
                    {notificationsActive ? '✓ ALERTAS ACTIVADAS EN ESTE DISPOSITIVO' : 'ACTIVAR ALERTAS EN MI CELULAR'}
                  </button>
                </div>
              </div>

              {/* Stepper Timeline (Image 5 exact match) */}
              <div className="tracker-stepper-wrap">
                <div className="tracker-stepper">
                  {STEP_DEFINITIONS.map((step, idx) => {
                    const isDone = idx < activeStepIndex;
                    const isCurrent = idx === activeStepIndex;
                    const StepIcon = step.icon;

                    return (
                      <div
                        key={step.key}
                        className={`tracker-step-item ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
                      >
                        <div className="tracker-step-icon-wrapper">
                          <div className={`tracker-step-icon-circle ${isDone || isCurrent ? 'highlight' : ''}`}>
                            <StepIcon size={19} />
                          </div>
                        </div>

                        <div className="tracker-step-labels">
                          <span className="tracker-step-title">{step.title}</span>
                          <span className="tracker-step-desc">{step.subtitle}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Box 4: RESUMEN DE ENTREGA Y PAGO */}
              <div className="tracker-card tracker-summary-card">
                <h4 className="tracker-summary-title">Resumen de entrega y pago</h4>

                <div className="tracker-summary-row">
                  <span className="tracker-summary-label">
                    <MapPin size={15} className="tracker-summary-icon text-rose-500" /> Método de Entrega:
                  </span>
                  <strong className="tracker-summary-val">{deliveryLabel}</strong>
                </div>

                {isDelivery && order.delivery_address && (
                  <div className="tracker-summary-address">
                    <span>Dirección:</span> {order.delivery_address}
                  </div>
                )}

                <div className="tracker-summary-row">
                  <span className="tracker-summary-label">
                    <CreditCard size={15} className="tracker-summary-icon text-cyan-600" /> Método de Pago:
                  </span>
                  <strong className="tracker-summary-val">{paymentMethodLabel}</strong>
                </div>

                <div className="tracker-divider" />

                <div className="tracker-total-row">
                  <span className="tracker-total-label">Monto Total:</span>
                  <div className="tracker-total-val-box">
                    <span className="tracker-total-usd">{formatUSD(Number(order.total_usd) || 0)}</span>
                    {Number(order.total_ves) > 0 && (
                      <span className="tracker-total-ves">{formatVES(Number(order.total_ves) || 0)}</span>
                    )}
                  </div>
                </div>

                {/* Optional items list preview */}
                {Array.isArray(order.items) && order.items.length > 0 && (
                  <div className="tracker-items-preview">
                    <span className="tracker-items-title">Artículos en la orden ({order.items.length}):</span>
                    <ul className="tracker-items-list">
                      {order.items.map((item, i) => (
                        <li key={i}>
                          <span>
                            • {item.name || item.sku} {Number(item.quantity) > 1 ? `x${item.quantity}` : ''}
                          </span>
                          <strong>{formatUSD(Number(item.total_usd) || 0)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="tracker-footer">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="tracker-btn-whatsapp"
          >
            <MessageCircle size={18} />
            <span>PREGUNTAR POR WHATSAPP</span>
          </a>

          <button type="button" className="tracker-btn-close" onClick={onClose}>
            CERRAR
          </button>
        </footer>
      </div>

      <style>{`
        .tracker-root {
          position: fixed;
          inset: 0;
          z-index: 1400;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .tracker-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(4px);
        }
        .tracker-panel {
          position: relative;
          width: min(580px, 100%);
          max-height: min(92vh, 880px);
          background: #ffffff;
          border-radius: 18px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.28);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .tracker-header {
          background: #0f172a;
          color: #ffffff;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #1e293b;
        }
        .tracker-header-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .tracker-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #f59e0b;
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.7);
        }
        .tracker-header-title h2 {
          margin: 0;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #ffffff;
        }
        .tracker-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .tracker-icon-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .tracker-icon-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
        }
        .tracker-spin {
          animation: tracker-spin 1s linear infinite;
        }
        @keyframes tracker-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .tracker-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .tracker-search-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          padding: 6px 10px;
        }
        .tracker-search-icon {
          color: #94a3b8;
          margin-left: 4px;
        }
        .tracker-search-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 13.5px;
          color: #0f172a;
          background: transparent;
        }
        .tracker-search-btn {
          background: #0284c7;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 7px 14px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .tracker-search-btn:hover {
          background: #0369a1;
        }
        .tracker-error-alert {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 600;
        }
        .tracker-success-toast {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #047857;
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 700;
          text-align: center;
        }
        .tracker-content-flow {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .tracker-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .tracker-info-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }
        .tracker-meta-label {
          display: block;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          font-weight: 800;
          margin-bottom: 4px;
        }
        .tracker-order-number {
          font-size: 24px;
          font-weight: 900;
          color: #0f172a;
          letter-spacing: -0.02em;
          line-height: 1.1;
        }
        .tracker-customer-name {
          margin-top: 6px;
          font-size: 13px;
          color: #475569;
        }
        .tracker-customer-name strong {
          color: #0284c7;
        }
        .tracker-payment-meta-col {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }
        .tracker-pay-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 8px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
        }
        .tracker-pay-badge.paid {
          background: #e9f7f1;
          color: #237d5f;
          border: 1px solid #a7f3d0;
        }
        .tracker-pay-badge.pending {
          background: #fff6e3;
          color: #966b13;
          border: 1px solid #fde68a;
        }
        .tracker-pay-badge.refunded {
          background: #fff0f0;
          color: #a94d4d;
          border: 1px solid #fca5a5;
        }
        .tracker-badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
        .tracker-status-box {
          background: #ecfdf5;
          border: 1.5px solid #a7f3d0;
          border-radius: 12px;
          padding: 14px 18px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tracker-status-label {
          font-size: 10.5px;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #059669;
          text-transform: uppercase;
        }
        .tracker-status-value {
          font-size: 20px;
          font-weight: 900;
          color: #065f46;
          text-transform: capitalize;
        }
        .tracker-push-box {
          background: #fffdf0;
          border: 1.5px solid #fef08a;
          border-radius: 14px;
          padding: 16px;
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }
        .tracker-push-icon-circle {
          position: relative;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #fef9c3;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .tracker-push-dot {
          position: absolute;
          top: -2px;
          left: -2px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #f59e0b;
        }
        .tracker-bell-icon {
          color: #d97706;
        }
        .tracker-push-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tracker-push-text strong {
          font-size: 12.5px;
          font-weight: 850;
          color: #854d0e;
          letter-spacing: 0.02em;
        }
        .tracker-push-text p {
          margin: 0;
          font-size: 11.5px;
          line-height: 1.45;
          color: #a16207;
        }
        .tracker-push-btn {
          align-self: flex-start;
          margin-top: 4px;
          background: #0e7490;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .tracker-push-btn:hover {
          background: #155e75;
        }
        .tracker-push-btn.active {
          background: #047857;
        }
        .tracker-stepper-wrap {
          padding: 10px 0;
          overflow-x: auto;
        }
        .tracker-stepper {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          min-width: 480px;
          position: relative;
        }
        .tracker-step-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          position: relative;
        }
        .tracker-step-icon-wrapper {
          position: relative;
          z-index: 2;
          margin-bottom: 8px;
        }
        .tracker-step-icon-circle {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #f1f5f9;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .tracker-step-icon-circle.highlight {
          background: #f59e0b;
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);
        }
        .tracker-step-item.current .tracker-step-icon-circle {
          box-shadow: 0 0 0 4px #ffffff, 0 0 0 7px #f59e0b;
        }
        .tracker-step-labels {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .tracker-step-title {
          font-size: 11px;
          font-weight: 850;
          color: #334155;
          letter-spacing: 0.02em;
        }
        .tracker-step-item.current .tracker-step-title,
        .tracker-step-item.done .tracker-step-title {
          color: #0f172a;
        }
        .tracker-step-desc {
          font-size: 10px;
          color: #64748b;
          line-height: 1.3;
        }
        .tracker-summary-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .tracker-summary-title {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
        }
        .tracker-summary-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
        }
        .tracker-summary-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #475569;
        }
        .tracker-summary-val {
          color: #0f172a;
          font-weight: 700;
        }
        .tracker-summary-address {
          font-size: 12px;
          color: #475569;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 8px 10px;
        }
        .tracker-summary-address span {
          font-weight: 700;
          color: #1e293b;
        }
        .tracker-divider {
          height: 1px;
          background: #e2e8f0;
          margin: 4px 0;
        }
        .tracker-total-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .tracker-total-label {
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
        }
        .tracker-total-val-box {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }
        .tracker-total-usd {
          font-size: 18px;
          font-weight: 900;
          color: #0f172a;
        }
        .tracker-total-ves {
          font-size: 12px;
          color: #64748b;
        }
        .tracker-items-preview {
          margin-top: 6px;
          padding-top: 8px;
          border-top: 1px dashed #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tracker-items-title {
          font-size: 11.5px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .tracker-items-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .tracker-items-list li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: #334155;
        }
        .tracker-items-list strong {
          color: #0f172a;
        }
        .tracker-footer {
          padding: 14px 20px;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .tracker-btn-whatsapp {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #059669;
          color: #ffffff;
          text-decoration: none;
          border-radius: 9px;
          padding: 10px 18px;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.02em;
          transition: all 0.15s ease;
        }
        .tracker-btn-whatsapp:hover {
          background: #047857;
        }
        .tracker-btn-close {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          color: #334155;
          border-radius: 9px;
          padding: 10px 18px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .tracker-btn-close:hover {
          background: #e2e8f0;
          color: #0f172a;
        }
        @media (max-width: 640px) {
          .tracker-panel {
            width: 100%;
            height: 100%;
            max-height: 100vh;
            border-radius: 0;
            border: none;
          }
          .tracker-footer {
            flex-direction: column;
          }
          .tracker-btn-whatsapp, .tracker-btn-close {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
