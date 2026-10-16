import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  X,
  CreditCard,
  Calendar,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  FileText,
  DollarSign,
  Phone,
  Mail,
  User,
  MapPin,
  ExternalLink,
  Printer,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DbSupplier } from '../../../lib/supabase/db';
import { authenticatedFetch } from '../../../lib/supabase/api';
import { getActiveExchangeRate, convertUSDtoVES, formatUSD, formatVES } from '../../../lib/currency';

interface SupplierDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: DbSupplier | null;
  onEditSupplier?: (supplier: DbSupplier) => void;
}

interface PayableItem {
  id: string;
  doc_number: string;
  concept: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  issue_date: string;
  due_date: string;
  status: 'Pendiente' | 'Parcial' | 'Vencida' | 'Pagada';
  description?: string;
  payments_history?: Array<{
    id: string;
    date: string;
    amount: number;
    amount_ves?: number;
    bank_name?: string;
    ref?: string;
  }>;
}

export function SupplierDetailModal({
  isOpen,
  onClose,
  supplier,
  onEditSupplier
}: SupplierDetailModalProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'compromisos' | 'historial' | 'contacto'>('compromisos');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [payables, setPayables] = useState<PayableItem[]>([]);
  const [expandedPayableId, setExpandedPayableId] = useState<string | null>(null);
  const [activeRate] = useState(() => getActiveExchangeRate());

  // Métricas calculadas
  const [salesTicketAverage, setSalesTicketAverage] = useState<{ usd: number; ves: number }>({ usd: 0, ves: 0 });
  const [dailySalesAverageUSD, setDailySalesAverageUSD] = useState<number>(0);

  // Escuchar tecla ESC para cerrar modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Cargar datos cuando el modal se abre
  useEffect(() => {
    if (!isOpen || !supplier) return;

    let isMounted = true;
    const loadSupplierData = async () => {
      setIsLoading(true);
      try {
        // 1. Cargar todas las cuentas por pagar
        let allPayables: any[] = [];
        try {
          const res = await authenticatedFetch('/api/accounts-payable');
          if (res.ok) {
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
              allPayables = json.data;
            }
          }
        } catch (e) {
          console.warn('Aviso cargando cuentas por pagar en modal:', e);
        }

        // Emparejar cuentas por pagar que pertenezcan a este proveedor
        const sId = supplier.id;
        const sName = (supplier.name || '').trim().toLowerCase();
        const sDoc = (supplier.doc_number || '').trim().toUpperCase().replace(/[\s.-]/g, '');

        const matchedRaw = allPayables.filter((p: any) => {
          const pSupId = p.supplier_id || p.suppliers?.id;
          if (sId && pSupId && pSupId === sId) return true;

          const pDoc = (p.supplier_doc || p.suppliers?.doc_number || '').trim().toUpperCase().replace(/[\s.-]/g, '');
          if (sDoc && pDoc && sDoc === pDoc) return true;

          const pName = (p.supplier_name || p.suppliers?.name || '').trim().toLowerCase();
          if (sName && pName && sName === pName) return true;

          return false;
        });

        const now = new Date();
        const mappedPayables: PayableItem[] = matchedRaw.map((item: any) => {
          const total = Number(item.total_usd ?? item.total_amount ?? 0);
          const history = (item.payable_payments || []).map((pay: any) => ({
            id: pay.id || 'p-' + Math.random(),
            date: pay.payment_date ? pay.payment_date.slice(0, 10) : (pay.date || ''),
            amount: Number(pay.amount_usd || pay.amount) || 0,
            amount_ves: Number(pay.amount_ves) || (Number(pay.amount_usd || pay.amount) || 0) * (Number(pay.exchange_rate) || activeRate),
            bank_name: pay.payment_method || pay.bank_name || 'Abono en cuenta',
            ref: pay.reference || pay.ref || 'REF'
          }));

          const paidFromHistory = history.reduce((sum: number, h: any) => sum + h.amount, 0);
          const balance = item.balance_usd != null && Number.isFinite(Number(item.balance_usd))
            ? Number(item.balance_usd)
            : Math.max(0, Math.round((total - paidFromHistory) * 100) / 100);
          const paid = Math.max(0, Math.round((total - balance) * 100) / 100);

          let computedStatus: PayableItem['status'] = 'Pendiente';
          const isOverdue = item.due_date && new Date(item.due_date) < now && balance > 0.01;

          if (balance <= 0.01 || item.status === 'PAGADO' || item.status === 'Pagada') {
            computedStatus = 'Pagada';
          } else if (isOverdue) {
            computedStatus = 'Vencida';
          } else if (paid > 0 && balance < total) {
            computedStatus = 'Parcial';
          } else {
            computedStatus = 'Pendiente';
          }

          return {
            id: item.id,
            doc_number: item.doc_number || 'FACT',
            concept: item.concept || item.description || 'Factura comercial',
            total_amount: total,
            paid_amount: paid,
            remaining_amount: balance,
            issue_date: item.issue_date || (item.created_at ? item.created_at.slice(0, 10) : ''),
            due_date: item.due_date || '',
            status: computedStatus,
            description: item.description || '',
            payments_history: history
          };
        });

        // 2. Cargar órdenes/ventas del sistema para calcular Ticket Promedio de Ventas
        try {
          const ordersRes = await authenticatedFetch('/api/orders');
          if (ordersRes.ok) {
            const ordersJson = await ordersRes.json();
            const ordersList = Array.isArray(ordersJson)
              ? ordersJson
              : (Array.isArray(ordersJson.data) ? ordersJson.data : []);

            if (ordersList.length > 0) {
              const totalOrdersUSD = ordersList.reduce(
                (sum: number, o: any) => sum + (Number(o.total_usd || o.totalUSD || o.total) || 0),
                0
              );
              const avgUSD = totalOrdersUSD / ordersList.length;
              const avgVES = convertUSDtoVES(avgUSD, activeRate);

              // Ventas diarias promedio (estimadas a partir del rango de órdenes o últimos 30 días)
              const dailyAvg = totalOrdersUSD / Math.max(1, Math.min(30, ordersList.length));

              if (isMounted) {
                setSalesTicketAverage({
                  usd: Math.round(avgUSD * 100) / 100,
                  ves: Math.round(avgVES * 100) / 100
                });
                setDailySalesAverageUSD(Math.round(dailyAvg * 100) / 100);
              }
            } else {
              if (isMounted) {
                setSalesTicketAverage({ usd: 45.0, ves: convertUSDtoVES(45.0, activeRate) });
                setDailySalesAverageUSD(150.0);
              }
            }
          }
        } catch (e) {
          console.warn('Aviso calculando ticket promedio de ventas:', e);
        }

        if (isMounted) {
          setPayables(mappedPayables);
        }
      } catch (err) {
        console.error('Error cargando información del proveedor en modal:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadSupplierData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, supplier, activeRate]);

  // Filtrar compromisos pendientes (deuda activa > 0)
  const pendingCommitments = useMemo(() => {
    return payables.filter((p) => p.remaining_amount > 0.01 && p.status !== 'Pagada');
  }, [payables]);

  // Historial de compromisos ya saldados
  const paidCommitments = useMemo(() => {
    return payables.filter((p) => p.remaining_amount <= 0.01 || p.status === 'Pagada');
  }, [payables]);

  // Cálculos de saldo deudor total
  const calculatedPendingDebtUSD = useMemo(() => {
    if (pendingCommitments.length > 0) {
      return pendingCommitments.reduce((sum, p) => sum + p.remaining_amount, 0);
    }
    // Si no hay facturas detalladas pero el proveedor tiene saldo en balance_usd
    return Number(supplier?.balance_usd) || 0;
  }, [pendingCommitments, supplier]);

  const calculatedPendingDebtVES = useMemo(() => {
    return convertUSDtoVES(calculatedPendingDebtUSD, activeRate);
  }, [calculatedPendingDebtUSD, activeRate]);

  // Ticket promedio por factura con este proveedor
  const supplierInvoiceTicketAverage = useMemo(() => {
    if (payables.length === 0) return { usd: 0, ves: 0 };
    const totalInvoices = payables.reduce((sum, p) => sum + p.total_amount, 0);
    const avgUSD = totalInvoices / payables.length;
    return {
      usd: Math.round(avgUSD * 100) / 100,
      ves: convertUSDtoVES(avgUSD, activeRate)
    };
  }, [payables, activeRate]);

  // Análisis de fechas de vencimiento y Tiempo Estimado de Pago
  const debtPaymentAnalysis = useMemo(() => {
    if (calculatedPendingDebtUSD <= 0.01) {
      return {
        status: 'Al día',
        statusTone: 'success' as const,
        daysText: '0 días',
        description: 'Cuenta al día. No tiene compromisos de pago pendientes con este proveedor.',
        earliestDueDate: null,
        daysRemaining: 0,
        isOverdue: false,
        estimatedPayoffDays: 0
      };
    }

    // Buscar fechas de vencimiento en las facturas pendientes
    const withDueDate = pendingCommitments.filter((p) => Boolean(p.due_date));
    let earliestDate: Date | null = null;
    let overdueCount = 0;

    withDueDate.forEach((p) => {
      const d = new Date(p.due_date);
      if (!isNaN(d.getTime())) {
        if (!earliestDate || d < earliestDate) {
          earliestDate = d;
        }
        if (d < new Date()) {
          overdueCount++;
        }
      }
    });

    const now = new Date();
    let daysRemaining = 0;
    let isOverdue = false;

    if (earliestDate) {
      const diffMs = (earliestDate as Date).getTime() - now.getTime();
      daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      isOverdue = daysRemaining < 0;
    } else {
      // Si no tienen fecha de vencimiento explícita, se toma un plazo comercial promedio de 15 días
      daysRemaining = 15;
    }

    // Estimación financiera por capacidad de rotación de ventas del comercio:
    // Días de venta necesarios para cubrir la deuda
    const dailyIncome = dailySalesAverageUSD > 0 ? dailySalesAverageUSD : (salesTicketAverage.usd * 3);
    const cashflowDays = dailyIncome > 0 ? Math.ceil(calculatedPendingDebtUSD / dailyIncome) : 7;

    if (isOverdue) {
      return {
        status: 'Compromiso Vencido',
        statusTone: 'danger' as const,
        daysText: `${Math.abs(daysRemaining)} días de atraso`,
        description: `⚠️ Atención: Existen ${overdueCount} compromiso(s) vencido(s). Requiere gestión o abono inmediato.`,
        earliestDueDate: earliestDate,
        daysRemaining,
        isOverdue: true,
        estimatedPayoffDays: Math.max(1, cashflowDays)
      };
    } else if (daysRemaining <= 5) {
      return {
        status: 'Por Vencer Pronto',
        statusTone: 'warning' as const,
        daysText: `${daysRemaining} días restantes`,
        description: `Fecha límite de pago próxima (${earliestDate ? (earliestDate as Date).toLocaleDateString('es-VE') : 'Pronto'}).`,
        earliestDueDate: earliestDate,
        daysRemaining,
        isOverdue: false,
        estimatedPayoffDays: Math.min(daysRemaining, Math.max(1, cashflowDays))
      };
    } else {
      return {
        status: 'En Plazo Comercial',
        statusTone: 'brand' as const,
        daysText: `${daysRemaining} días restantes`,
        description: `Plazo contractual vigente. Con el ritmo de ventas actual, se proyecta saldar en aprox. ${cashflowDays} días.`,
        earliestDueDate: earliestDate,
        daysRemaining,
        isOverdue: false,
        estimatedPayoffDays: cashflowDays
      };
    }
  }, [calculatedPendingDebtUSD, pendingCommitments, dailySalesAverageUSD, salesTicketAverage.usd]);

  // Imprimir estado de cuenta individual
  const handlePrintStatement = () => {
    if (!supplier) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rows = pendingCommitments.map((p) => `
      <tr>
        <td><b>${p.doc_number}</b></td>
        <td>${p.concept}</td>
        <td>${p.issue_date || '-'}</td>
        <td style="color: ${p.status === 'Vencida' ? '#dc2626' : '#0f172a'}; font-weight: 600;">${p.due_date || 'A convenir'}</td>
        <td style="text-align: right;">$ ${p.total_amount.toFixed(2)}</td>
        <td style="text-align: right; color: #16a34a;">$ ${p.paid_amount.toFixed(2)}</td>
        <td style="text-align: right; font-weight: bold; color: #dc2626;">
          $ ${p.remaining_amount.toFixed(2)}
          <br/><small style="color: #64748b;">${formatVES(convertUSDtoVES(p.remaining_amount, activeRate))}</small>
        </td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Estado de Cuenta — ${supplier.name}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #0f172a; }
          .head { border-bottom: 2px solid #7c3aed; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; }
          .title { font-size: 22px; font-weight: bold; color: #1e1b4b; }
          .supplier-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; }
          .kpi-row { display: flex; gap: 16px; margin-bottom: 24px; }
          .kpi-box { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #fff; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
          th { background: #f1f5f9; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="head">
          <div>
            <div class="title">FRENYER ERP — ESTADO DE CUENTA DE PROVEEDOR</div>
            <div style="color: #64748b; font-size: 13px;">Informe de compromisos y saldos pendientes</div>
          </div>
          <div style="text-align: right; font-size: 12px;">
            <div><b>Fecha:</b> ${new Date().toLocaleDateString('es-VE')}</div>
            <div><b>Tasa BCV Oficial:</b> ${activeRate.toFixed(2)} Bs/$</div>
          </div>
        </div>

        <div class="supplier-card">
          <div style="font-size: 18px; font-weight: bold;">${supplier.name}</div>
          <div style="font-size: 13px; color: #475569; margin-top: 4px;">
            <b>${supplier.doc_type || 'RIF'}:</b> ${supplier.doc_number} &bull; 
            <b>Código:</b> ${supplier.code || 'PRV'} &bull; 
            <b>Teléfono:</b> ${supplier.phone || '-'} &bull; 
            <b>Contacto:</b> ${supplier.contact_person || '-'}
          </div>
        </div>

        <div class="kpi-row">
          <div class="kpi-box">
            <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold;">Total Deuda Pendiente</div>
            <div style="font-size: 20px; font-weight: bold; color: #dc2626; margin-top: 4px;">$ ${calculatedPendingDebtUSD.toFixed(2)}</div>
            <div style="font-size: 12px; color: #64748b;">${formatVES(calculatedPendingDebtVES)}</div>
          </div>
          <div class="kpi-box">
            <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold;">Ticket Promedio de Ventas</div>
            <div style="font-size: 20px; font-weight: bold; color: #2563eb; margin-top: 4px;">$ ${salesTicketAverage.usd.toFixed(2)}</div>
            <div style="font-size: 12px; color: #64748b;">${formatVES(salesTicketAverage.ves)}</div>
          </div>
          <div class="kpi-box">
            <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold;">Tiempo Estimado de Pago</div>
            <div style="font-size: 20px; font-weight: bold; color: ${debtPaymentAnalysis.isOverdue ? '#dc2626' : '#16a34a'}; margin-top: 4px;">
              ${debtPaymentAnalysis.daysText}
            </div>
            <div style="font-size: 12px; color: #64748b;">${debtPaymentAnalysis.status}</div>
          </div>
        </div>

        <h3>Detalle de Compromisos Pendientes (${pendingCommitments.length})</h3>
        <table>
          <thead>
            <tr>
              <th>N° Factura</th>
              <th>Concepto</th>
              <th>Emisión</th>
              <th>Vencimiento</th>
              <th style="text-align: right;">Monto Total</th>
              <th style="text-align: right;">Abonado</th>
              <th style="text-align: right;">Saldo Deudor</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #64748b;">No existen facturas pendientes de pago.</td></tr>'}
          </tbody>
        </table>

        <div style="margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 8px;">
          Generado por Frenyer ERP &bull; Documento administrativo interno
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (!isOpen || !supplier) return null;

  return (
    <div
      className="modal-backdrop"
      style={{
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        style={{
          width: '100%',
          maxWidth: 920,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-lg, 16px)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--card, #ffffff)'
        }}
      >
        {/* Modal Header */}
        <div
          className="modal-head"
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#fafbfc'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                backgroundColor: 'rgba(124, 58, 237, 0.12)',
                color: 'var(--brand-500, #7c3aed)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Building2 size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)' }}>
                  {supplier.name}
                </h2>
                <Badge tone="brand">{supplier.code || 'PRV-0001'}</Badge>
                <Badge tone={supplier.status === 'Activo' ? 'success' : 'danger'}>
                  {supplier.status}
                </Badge>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: '0.85rem', color: 'var(--muted)' }}>
                <span><b>{supplier.doc_type || 'RIF'}:</b> {supplier.doc_number}</span>
                {supplier.category && <span>&bull; Rubro: <b>{supplier.category}</b></span>}
                {supplier.phone && <span>&bull; 📞 {supplier.phone}</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handlePrintStatement}
              className="btn btn-secondary"
              title="Imprimir / Exportar Estado de Cuenta"
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.82rem'
              }}
            >
              <Printer size={15} /> Imprimir Estado
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: 6,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {isLoading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)' }}>
              <div className="spin" style={{ display: 'inline-block', marginBottom: 12 }}>
                <Clock size={28} style={{ color: 'var(--brand-500)' }} />
              </div>
              <div>Cargando compromisos y métricas financieras del proveedor...</div>
            </div>
          ) : (
            <>
              {/* TOP 3 EXECUTIVE KPI CARDS */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 16
                }}
              >
                {/* 1. Compromisos Pendientes */}
                <div
                  style={{
                    backgroundColor: calculatedPendingDebtUSD > 0 ? '#fff5f5' : '#f0fdf4',
                    border: `1px solid ${calculatedPendingDebtUSD > 0 ? '#fecaca' : '#bbf7d0'}`,
                    borderRadius: 12,
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: calculatedPendingDebtUSD > 0 ? '#991b1b' : '#166534' }}>
                        Compromisos Pendientes
                      </span>
                      <CreditCard size={18} style={{ color: calculatedPendingDebtUSD > 0 ? '#ef4444' : '#16a34a' }} />
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 900, color: calculatedPendingDebtUSD > 0 ? '#dc2626' : '#15803d', lineHeight: 1.1 }}>
                      {formatUSD(calculatedPendingDebtUSD)}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 4 }}>
                      {formatVES(calculatedPendingDebtVES)}
                    </div>
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(0,0,0,0.06)', fontSize: '0.78rem', color: 'var(--text)' }}>
                    {pendingCommitments.length > 0 ? (
                      <span><b>{pendingCommitments.length}</b> factura(s) por pagar</span>
                    ) : (
                      <span style={{ color: '#15803d', fontWeight: 600 }}>Al día (0 compromisos pendientes)</span>
                    )}
                  </div>
                </div>

                {/* 2. Ticket Promedio de Ventas */}
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)' }}>
                        Ticket Promedio de Ventas
                      </span>
                      <TrendingUp size={18} style={{ color: 'var(--brand-500)' }} />
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#1e293b', lineHeight: 1.1 }}>
                      {formatUSD(salesTicketAverage.usd)}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 4 }}>
                      {formatVES(salesTicketAverage.ves)} (Tasa BCV)
                    </div>
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    {supplierInvoiceTicketAverage.usd > 0 ? (
                      <span>Promedio por factura proveedor: <b>{formatUSD(supplierInvoiceTicketAverage.usd)}</b></span>
                    ) : (
                      <span>Capacidad de facturación unitaria del comercio</span>
                    )}
                  </div>
                </div>

                {/* 3. Tiempo Estimado de Pago de Deuda */}
                <div
                  style={{
                    backgroundColor: debtPaymentAnalysis.isOverdue
                      ? '#fff1f2'
                      : (debtPaymentAnalysis.daysRemaining <= 5 && calculatedPendingDebtUSD > 0 ? '#fffbeb' : '#f5f3ff'),
                    border: `1px solid ${
                      debtPaymentAnalysis.isOverdue
                        ? '#fda4af'
                        : (debtPaymentAnalysis.daysRemaining <= 5 && calculatedPendingDebtUSD > 0 ? '#fde68a' : '#ddd6fe')
                    }`,
                    borderRadius: 12,
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          color: debtPaymentAnalysis.isOverdue
                            ? '#9f1239'
                            : (debtPaymentAnalysis.daysRemaining <= 5 && calculatedPendingDebtUSD > 0 ? '#92400e' : '#5b21b6')
                        }}
                      >
                        Tiempo Estimado de Pago
                      </span>
                      <Clock
                        size={18}
                        style={{
                          color: debtPaymentAnalysis.isOverdue
                            ? '#e11d48'
                            : (debtPaymentAnalysis.daysRemaining <= 5 && calculatedPendingDebtUSD > 0 ? '#d97706' : '#7c3aed')
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: '1.65rem',
                        fontWeight: 900,
                        color: debtPaymentAnalysis.isOverdue
                          ? '#be123c'
                          : (debtPaymentAnalysis.daysRemaining <= 5 && calculatedPendingDebtUSD > 0 ? '#b45309' : '#6d28d9'),
                        lineHeight: 1.1
                      }}
                    >
                      {debtPaymentAnalysis.daysText}
                    </div>
                    <div
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        marginTop: 4,
                        color: debtPaymentAnalysis.isOverdue
                          ? '#e11d48'
                          : (debtPaymentAnalysis.daysRemaining <= 5 && calculatedPendingDebtUSD > 0 ? '#d97706' : '#7c3aed')
                      }}
                    >
                      {debtPaymentAnalysis.status}
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: '1px solid rgba(0,0,0,0.06)',
                      fontSize: '0.78rem',
                      color: 'var(--muted)'
                    }}
                  >
                    {debtPaymentAnalysis.description}
                  </div>
                </div>
              </div>

              {/* TABS DE NAVEGACIÓN */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: 4,
                  marginTop: 4
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab('compromisos')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'compromisos' ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
                    color: activeTab === 'compromisos' ? 'var(--brand-500)' : 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <AlertTriangle size={15} /> Compromisos Pendientes ({pendingCommitments.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('historial')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'historial' ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
                    color: activeTab === 'historial' ? 'var(--brand-500)' : 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <CheckCircle2 size={15} /> Historial y Pagadas ({paidCommitments.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('contacto')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'contacto' ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
                    color: activeTab === 'contacto' ? 'var(--brand-500)' : 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Building2 size={15} /> Información Comercial
                </button>
              </div>

              {/* TAB 1: COMPROMISOS PENDIENTES */}
              {activeTab === 'compromisos' && (
                <div>
                  {pendingCommitments.length === 0 ? (
                    <div
                      style={{
                        padding: '36px 20px',
                        textAlign: 'center',
                        backgroundColor: '#f8fafc',
                        borderRadius: 12,
                        border: '1px dashed var(--border)'
                      }}
                    >
                      <CheckCircle2 size={40} style={{ color: '#16a34a', margin: '0 auto 12px auto' }} />
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>
                        ¡Sin compromisos pendientes!
                      </h4>
                      <p style={{ margin: '6px 0 0 0', fontSize: '0.88rem', color: 'var(--muted)' }}>
                        Este proveedor no tiene facturas por pagar activas en el módulo de Cuentas por Pagar.
                      </p>
                      {calculatedPendingDebtUSD > 0 && (
                        <div
                          style={{
                            marginTop: 14,
                            padding: '10px 14px',
                            backgroundColor: '#fffbeb',
                            borderRadius: 8,
                            display: 'inline-block',
                            fontSize: '0.85rem',
                            color: '#b45309',
                            border: '1px solid #fde68a'
                          }}
                        >
                          Saldo deudor registrado en ficha: <b>{formatUSD(calculatedPendingDebtUSD)}</b> ({formatVES(calculatedPendingDebtVES)})
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
                      <table className="table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Factura / Compromiso</th>
                            <th>Emisión & Vencimiento</th>
                            <th>Concepto</th>
                            <th className="num">Monto Total</th>
                            <th className="num">Abonado</th>
                            <th className="num">Saldo Pendiente</th>
                            <th style={{ textAlign: 'center' }}>Estado</th>
                            <th style={{ textAlign: 'center' }}>Detalle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingCommitments.map((p) => {
                            const isOverdue = p.status === 'Vencida';
                            const isExpanded = expandedPayableId === p.id;
                            const remainingVES = convertUSDtoVES(p.remaining_amount, activeRate);
                            const totalVES = convertUSDtoVES(p.total_amount, activeRate);

                            return (
                              <React.Fragment key={p.id}>
                                <tr>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <FileText size={16} style={{ color: 'var(--brand-500)' }} />
                                      <div>
                                        <b style={{ color: 'var(--text)' }}>{p.doc_number}</b>
                                      </div>
                                    </div>
                                  </td>

                                  <td>
                                    <div style={{ fontSize: '0.85rem' }}>
                                      <div><b>Emitida:</b> {p.issue_date || '-'}</div>
                                      <div style={{ color: isOverdue ? '#dc2626' : 'var(--muted)', fontWeight: isOverdue ? 700 : 500 }}>
                                        <b>Vence:</b> {p.due_date || 'A convenir'}
                                      </div>
                                    </div>
                                  </td>

                                  <td>
                                    <span style={{ fontSize: '0.85rem' }}>{p.concept}</span>
                                  </td>

                                  <td className="num">
                                    <b style={{ fontSize: '0.9rem' }}>{formatUSD(p.total_amount)}</b>
                                    <div className="muted small">{formatVES(totalVES)}</div>
                                  </td>

                                  <td className="num">
                                    <span style={{ color: '#16a34a', fontWeight: 600 }}>{formatUSD(p.paid_amount)}</span>
                                  </td>

                                  <td className="num">
                                    <b style={{ color: '#dc2626', fontSize: '0.95rem' }}>{formatUSD(p.remaining_amount)}</b>
                                    <div className="muted small">{formatVES(remainingVES)}</div>
                                  </td>

                                  <td style={{ textAlign: 'center' }}>
                                    <Badge tone={isOverdue ? 'danger' : p.status === 'Parcial' ? 'warning' : 'brand'}>
                                      {p.status}
                                    </Badge>
                                  </td>

                                  <td style={{ textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedPayableId(isExpanded ? null : p.id)}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid var(--border)',
                                        borderRadius: 6,
                                        padding: '4px 8px',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        fontSize: '0.78rem'
                                      }}
                                    >
                                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                      Abonos ({(p.payments_history || []).length})
                                    </button>
                                  </td>
                                </tr>

                                {/* HISTORIAL DE ABONOS DESPLEGABLE */}
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={8} style={{ backgroundColor: '#f8fafc', padding: '12px 20px' }}>
                                      <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>
                                        Historial de Abonos Registrados para {p.doc_number}:
                                      </div>
                                      {(!p.payments_history || p.payments_history.length === 0) ? (
                                        <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                                          No se han registrado abonos parciales todavía para esta factura.
                                        </div>
                                      ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                          {p.payments_history.map((pay, pIdx) => (
                                            <div
                                              key={pay.id || pIdx}
                                              style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                backgroundColor: '#fff',
                                                padding: '8px 12px',
                                                borderRadius: 6,
                                                border: '1px solid #e2e8f0',
                                                fontSize: '0.82rem'
                                              }}
                                            >
                                              <div>
                                                <b>{pay.date || '-'}</b> &bull; <span>{pay.bank_name || 'Abono'}</span>
                                                {pay.ref && <span style={{ color: 'var(--muted)', marginLeft: 8 }}>Ref: {pay.ref}</span>}
                                              </div>
                                              <div style={{ fontWeight: 800, color: '#16a34a' }}>
                                                + {formatUSD(pay.amount)}
                                                {pay.amount_ves && (
                                                  <span style={{ color: 'var(--muted)', fontWeight: 500, marginLeft: 8 }}>
                                                    ({formatVES(pay.amount_ves)})
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: HISTORIAL Y FACTURAS PAGADAS */}
              {activeTab === 'historial' && (
                <div>
                  {paidCommitments.length === 0 ? (
                    <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.88rem' }}>
                      Aún no hay facturas totalmente saldadas para este proveedor.
                    </div>
                  ) : (
                    <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
                      <table className="table" style={{ margin: 0 }}>
                        <thead>
                          <tr>
                            <th>Factura / N° Documento</th>
                            <th>Emisión</th>
                            <th>Concepto</th>
                            <th className="num">Monto Pagado Total</th>
                            <th style={{ textAlign: 'center' }}>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paidCommitments.map((p) => (
                            <tr key={p.id}>
                              <td>
                                <b>{p.doc_number}</b>
                              </td>
                              <td>{p.issue_date || '-'}</td>
                              <td>{p.concept}</td>
                              <td className="num">
                                <b style={{ color: '#16a34a' }}>{formatUSD(p.total_amount)}</b>
                                <div className="muted small">{formatVES(convertUSDtoVES(p.total_amount, activeRate))}</div>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <Badge tone="success">Pagada</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: INFORMACIÓN COMERCIAL & FISCAL */}
              {activeTab === 'contacto' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                  <Card>
                    <h4 style={{ margin: '0 0 14px 0', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Building2 size={16} className="brand" /> Datos Fiscales y Legales
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem' }}>
                      <div><b>Razón Social:</b> {supplier.name}</div>
                      <div><b>Tipo & N° Documento:</b> {supplier.doc_type || 'RIF'} {supplier.doc_number}</div>
                      <div><b>Código en Sistema:</b> {supplier.code || 'PRV-0001'}</div>
                      <div><b>Categoría / Rubro:</b> {supplier.category || 'General'}</div>
                      <div><b>Estado en Plataforma:</b> {supplier.status}</div>
                    </div>
                  </Card>

                  <Card>
                    <h4 style={{ margin: '0 0 14px 0', fontSize: '0.95rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Phone size={16} className="brand" /> Contacto y Localización
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem' }}>
                      <div><b>Persona de Contacto:</b> {supplier.contact_person || 'No asignada'}</div>
                      <div><b>Teléfono:</b> {supplier.phone || 'No registrado'}</div>
                      <div><b>Correo Electrónico:</b> {supplier.email || 'No registrado'}</div>
                      <div><b>Dirección Fiscal:</b> {supplier.address || 'No registrada'}</div>
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div
          className="modal-footer"
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#fafbfc'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                navigate('/finance/accounts-payable');
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
            >
              <ExternalLink size={14} /> Ir a Cuentas por Pagar
            </Button>
            {onEditSupplier && (
              <Button
                variant="secondary"
                onClick={() => {
                  onClose();
                  onEditSupplier(supplier);
                }}
                style={{ fontSize: '0.85rem' }}
              >
                Editar Ficha
              </Button>
            )}
          </div>

          <Button variant="primary" onClick={onClose} style={{ minWidth: 100 }}>
            Entendido
          </Button>
        </div>
      </div>
    </div>
  );
}
