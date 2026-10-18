import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  X,
  Printer,
  Edit2,
  Save,
  FileText,
  Phone,
  Mail,
  User,
  MapPin,
  Clock,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  CreditCard,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import {
  DbSupplier,
  createSupplierInSupabase,
  updateSupplierInSupabase
} from '../../../lib/supabase/db';
import { authenticatedFetch } from '../../../lib/supabase/api';
import { getActiveExchangeRate, convertUSDtoVES, formatUSD, formatVES } from '../../../lib/currency';

export interface SupplierDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: DbSupplier | null;
  isNew?: boolean;
  initialEditMode?: boolean;
  onSupplierSaved?: () => void;
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
}

export function SupplierDetailModal({
  isOpen,
  onClose,
  supplier,
  isNew = false,
  initialEditMode = false,
  onSupplierSaved
}: SupplierDetailModalProps) {
  // Tabs: 'movimientos' (Facturación, saldo pendiente, abonos y movimientos) vs 'ficha' (Ficha y formulario de edición)
  const [activeTab, setActiveTab] = useState<'movimientos' | 'ficha'>('movimientos');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [activeRate] = useState(() => getActiveExchangeRate());

  // Form Fields State
  const [nameInput, setNameInput] = useState('');
  const [docTypeInput, setDocTypeInput] = useState('RIF (J / G / V)');
  const [docNumberInput, setDocNumberInput] = useState('');
  const [contactInput, setContactInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('General');
  const [balanceInput, setBalanceInput] = useState('0');
  const [statusInput, setStatusInput] = useState<'Activo' | 'Inactivo'>('Activo');
  const [creditTermsInput, setCreditTermsInput] = useState('Contado');

  // Invoices & Payables State
  const [payables, setPayables] = useState<PayableItem[]>([]);
  const [isLoadingPayables, setIsLoadingPayables] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Sincronizar estado al abrir el modal o cambiar de proveedor
  useEffect(() => {
    if (!isOpen) return;

    if (isNew || !supplier) {
      setActiveTab('ficha');
      setNameInput('');
      setDocTypeInput('RIF (J / G / V)');
      setDocNumberInput('');
      setContactInput('');
      setPhoneInput('');
      setEmailInput('');
      setAddressInput('');
      setCategoryInput('General');
      setBalanceInput('0');
      setStatusInput('Activo');
      setCreditTermsInput('Contado');
      setPayables([]);
    } else {
      setActiveTab(initialEditMode ? 'ficha' : 'movimientos');
      setNameInput(supplier.name || '');
      setDocTypeInput(supplier.doc_type || 'RIF (J / G / V)');
      setDocNumberInput(supplier.doc_number || '');
      setContactInput(supplier.contact_person || '');
      setPhoneInput(supplier.phone || '');
      setEmailInput(supplier.email || '');
      setAddressInput(supplier.address || '');
      setCategoryInput(supplier.category || 'General');
      setBalanceInput(supplier.balance_usd ? supplier.balance_usd.toString() : '0');
      setStatusInput(supplier.status || 'Activo');
      setCreditTermsInput('Contado');
      loadSupplierPayables(supplier);
    }
  }, [isOpen, supplier, isNew, initialEditMode]);

  // Tecla ESC para cerrar
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Cargar facturas y cuentas por pagar de este proveedor
  const loadSupplierPayables = async (sup: DbSupplier) => {
    setIsLoadingPayables(true);
    try {
      const res = await authenticatedFetch('/api/accounts-payable');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const sId = sup.id;
          const sName = (sup.name || '').trim().toLowerCase();
          const sDoc = (sup.doc_number || '').trim().toUpperCase().replace(/[\s.-]/g, '');

          const matched = json.data.filter((p: any) => {
            const pSupId = p.supplier_id || p.suppliers?.id;
            if (sId && pSupId && pSupId === sId) return true;

            const pDoc = (p.supplier_doc || p.suppliers?.doc_number || '').trim().toUpperCase().replace(/[\s.-]/g, '');
            if (sDoc && pDoc && sDoc === pDoc) return true;

            const pName = (p.supplier_name || p.suppliers?.name || '').trim().toLowerCase();
            if (sName && pName && sName === pName) return true;

            return false;
          });

          const now = new Date();
          const items: PayableItem[] = matched.map((m: any) => {
            const total = Number(m.total_usd ?? m.total_amount ?? 0);
            const history = m.payable_payments || [];
            const paid = history.reduce((sum: number, h: any) => sum + (Number(h.amount_usd || h.amount) || 0), 0);
            const remaining = m.balance_usd != null ? Number(m.balance_usd) : Math.max(0, total - paid);
            const isOverdue = m.due_date && new Date(m.due_date) < now && remaining > 0.01;

            let st: PayableItem['status'] = 'Pendiente';
            if (remaining <= 0.01 || m.status === 'PAGADO' || m.status === 'Pagada') {
              st = 'Pagada';
            } else if (paid > 0) {
              st = 'Parcial';
            } else if (isOverdue) {
              st = 'Vencida';
            }

            return {
              id: m.id || String(Math.random()),
              doc_number: m.doc_number || m.invoice_number || 'S/N',
              concept: m.concept || m.description || 'Compra / Factura Proveedor',
              total_amount: total,
              paid_amount: paid,
              remaining_amount: remaining,
              issue_date: m.issue_date || m.created_at?.slice(0, 10) || '-',
              due_date: m.due_date ? m.due_date.slice(0, 10) : 'Contado',
              status: st
            };
          });

          setPayables(items);
        }
      }
    } catch (err) {
      console.warn('Aviso cargando movimientos de facturación:', err);
    } finally {
      setIsLoadingPayables(false);
    }
  };

  // Cálculos de saldo y métricas financieras
  const calculatedPendingDebtUSD = useMemo(() => {
    if (payables.length > 0) {
      const sum = payables.reduce((acc, p) => acc + p.remaining_amount, 0);
      return Math.round(sum * 100) / 100;
    }
    return supplier?.balance_usd || 0;
  }, [payables, supplier]);

  const calculatedPendingDebtVES = useMemo(() => {
    return convertUSDtoVES(calculatedPendingDebtUSD, activeRate);
  }, [calculatedPendingDebtUSD, activeRate]);

  const totalPaidUSD = useMemo(() => {
    return payables.reduce((acc, p) => acc + p.paid_amount, 0);
  }, [payables]);

  const overdueInvoicesCount = useMemo(() => {
    return payables.filter((p) => p.status === 'Vencida').length;
  }, [payables]);

  // Guardar (Crear o Editar Proveedor)
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!nameInput.trim()) {
      showToast('⚠️ Ingresa la Razón Social o Nombre del proveedor.');
      return;
    }
    if (!docNumberInput.trim()) {
      showToast('⚠️ Ingresa el RIF o Documento de identificación.');
      return;
    }

    setIsSaving(true);
    const payload = {
      name: nameInput.trim(),
      doc_type: docTypeInput,
      doc_number: docNumberInput.trim().toUpperCase(),
      contact_person: contactInput.trim(),
      phone: phoneInput.trim(),
      email: emailInput.trim().toLowerCase(),
      address: addressInput.trim(),
      category: categoryInput.trim() || 'General',
      balance_usd: parseFloat(balanceInput) || 0,
      status: statusInput
    };

    try {
      if (isNew || !supplier) {
        const created = await createSupplierInSupabase(payload);
        if (created) {
          showToast('✅ Proveedor registrado con éxito.');
          if (onSupplierSaved) onSupplierSaved();
          setTimeout(() => onClose(), 800);
        } else {
          showToast('❌ Error registrando proveedor.');
        }
      } else {
        const updated = await updateSupplierInSupabase(supplier.id, payload);
        if (updated) {
          showToast('✅ Proveedor actualizado correctamente.');
          if (onSupplierSaved) onSupplierSaved();
          // Regresar a la vista de facturación y movimientos con datos refrescados
          setActiveTab('movimientos');
        } else {
          showToast('❌ Error actualizando proveedor.');
        }
      }
    } catch (err: any) {
      showToast('❌ Error: ' + (err?.message || 'Fallo de conexión'));
    } finally {
      setIsSaving(false);
    }
  };

  // Imprimir ficha y estado de cuenta
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('⚠️ Habilita las ventanas emergentes para imprimir.');
      return;
    }

    const rowsHtml = payables.map((p) => `
      <tr>
        <td><b>${p.doc_number}</b></td>
        <td>${p.concept}</td>
        <td>${p.issue_date}</td>
        <td style="color: ${p.status === 'Vencida' ? '#dc2626' : '#1e293b'}; font-weight: 600;">${p.due_date}</td>
        <td style="text-align: right;">$ ${p.total_amount.toFixed(2)}</td>
        <td style="text-align: right; color: #16a34a;">$ ${p.paid_amount.toFixed(2)}</td>
        <td style="text-align: right; font-weight: bold; color: ${p.remaining_amount > 0 ? '#dc2626' : '#16a34a'};">
          $ ${p.remaining_amount.toFixed(2)}
        </td>
        <td style="text-align: center;"><span class="badge ${p.status.toLowerCase()}">${p.status}</span></td>
      </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ficha y Estado de Cuenta — ${nameInput || supplier?.name || 'Proveedor'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 25px; color: #0f172a; margin: 0; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7c3aed; padding-bottom: 14px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: 800; color: #1e1b4b; }
          .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; font-size: 13px; }
          .kpi-row { display: flex; gap: 14px; margin-bottom: 20px; }
          .kpi-card { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px; background: #ffffff; }
          .kpi-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .kpi-val { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12.5px; }
          th { background: #f1f5f9; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; font-weight: 700; color: #334155; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
          .badge { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
          .badge.pagada { background: #dcfce7; color: #15803d; }
          .badge.pendiente { background: #fef3c7; color: #b45309; }
          .badge.vencida { background: #fee2e2; color: #b91c1c; }
          .badge.parcial { background: #e0e7ff; color: #4338ca; }
          .footer { margin-top: 35px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">FRENYER ERP — FICHA Y ESTADO DE CUENTA DE PROVEEDOR</div>
            <div class="subtitle">Directorio de Proveedores y Control Financiero &bull; Emisión de Auditoría</div>
          </div>
          <div style="text-align: right; font-size: 12px; color: #475569;">
            <div><b>Fecha de Emisión:</b> ${new Date().toLocaleDateString('es-VE')}</div>
            <div><b>Tasa BCV Oficial:</b> ${activeRate.toFixed(2)} Bs/$</div>
          </div>
        </div>

        <div class="info-grid">
          <div><b>Razón Social:</b> ${nameInput || '-'}</div>
          <div><b>Documento / RIF:</b> ${docTypeInput}: ${docNumberInput || '-'}</div>
          <div><b>Persona de Contacto:</b> ${contactInput || 'No asignada'}</div>
          <div><b>Rubro / Categoría:</b> ${categoryInput || 'General'}</div>
          <div><b>Teléfono:</b> ${phoneInput || 'No registrado'}</div>
          <div><b>Correo Electrónico:</b> ${emailInput || 'No registrado'}</div>
          <div style="grid-column: 1 / -1;"><b>Dirección Fiscal:</b> ${addressInput || 'No registrada'}</div>
        </div>

        <div class="kpi-row">
          <div class="kpi-card">
            <div class="kpi-label">Saldo Deudor Pendiente</div>
            <div class="kpi-val" style="color: ${calculatedPendingDebtUSD > 0 ? '#dc2626' : '#16a34a'};">
              $ ${calculatedPendingDebtUSD.toFixed(2)}
            </div>
            <div style="font-size: 12px; color: #64748b;">${formatVES(calculatedPendingDebtVES)}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Total Facturas Asociadas</div>
            <div class="kpi-val" style="color: #2563eb;">${payables.length}</div>
            <div style="font-size: 12px; color: #64748b;">${overdueInvoicesCount} vencida(s)</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Total Abonado Histórico</div>
            <div class="kpi-val" style="color: #16a34a;">$ ${totalPaidUSD.toFixed(2)}</div>
            <div style="font-size: 12px; color: #64748b;">${formatVES(convertUSDtoVES(totalPaidUSD, activeRate))}</div>
          </div>
        </div>

        <h3 style="font-size: 14px; margin-bottom: 4px; color: #1e1b4b;">Movimientos y Facturas Registradas (${payables.length})</h3>
        <table>
          <thead>
            <tr>
              <th>N° Factura</th>
              <th>Concepto</th>
              <th>Emisión</th>
              <th>Vencimiento</th>
              <th style="text-align: right;">Total ($)</th>
              <th style="text-align: right;">Abonado ($)</th>
              <th style="text-align: right;">Saldo ($)</th>
              <th style="text-align: center;">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 18px; color: #64748b;">No existen facturas registradas para este proveedor.</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          <span>Generado automáticamente por Frenyer ERP &bull; Soporte administrativo</span>
          <span>Página 1 de 1</span>
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.18s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      {/* Toast Notification flotante dentro del modal */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            top: 24,
            right: 24,
            backgroundColor: '#1e293b',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            zIndex: 10001,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid #334155'
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Ventana Principal Centrada */}
      <div
        style={{
          width: '100%',
          maxWidth: '940px',
          maxHeight: '92vh',
          backgroundColor: '#ffffff',
          borderRadius: 'var(--radius-lg, 16px)',
          border: '1px solid var(--border)',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================================================================= */}
        {/* ENCABEZADO SUPERIOR: CIERRE, IMPRESIÓN Y ACCIÓN SEGÚN EL TAG */}
        {/* ================================================================= */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--border)',
            backgroundColor: '#fafbfc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap'
          }}
        >
          {/* Identidad del proveedor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 260 }}>
            <div
              style={{
                width: 44,
                height: 44,
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
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)' }}>
                  {isNew ? 'Registrar Nuevo Proveedor' : nameInput || 'Ficha de Proveedor'}
                </h2>
                {!isNew && (
                  <>
                    <Badge tone="brand">{supplier?.code || 'PRV'}</Badge>
                    <Badge tone={statusInput === 'Activo' ? 'success' : 'danger'}>
                      {statusInput}
                    </Badge>
                  </>
                )}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
                {!isNew && docNumberInput ? (
                  <span><b>{docTypeInput}:</b> {docNumberInput} &bull; {categoryInput}</span>
                ) : (
                  <span>Directorio Comercial &bull; Facturación y Finanzas</span>
                )}
              </div>
            </div>
          </div>

          {/* Acciones del encabezado */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Botón Imprimir (Arriba) */}
            {!isNew && (
              <Button
                variant="secondary"
                onClick={handlePrint}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
                title="Mandar a imprimir estado y ficha"
              >
                <Printer size={15} /> Imprimir
              </Button>
            )}

            {/* Alternar según la pestaña activa */}
            {activeTab === 'ficha' ? (
              <Button
                variant="primary"
                onClick={() => handleSave()}
                disabled={isSaving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
              >
                <Save size={15} /> {isSaving ? 'Guardando...' : isNew ? 'Registrar Proveedor' : 'Guardar Cambios'}
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => setActiveTab('ficha')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
                title="Ir a editar datos de la ficha"
              >
                <Edit2 size={15} /> Editar Ficha
              </Button>
            )}

            {/* Botón Cerrar (Arriba) */}
            <button
              onClick={onClose}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                color: '#475569',
                cursor: 'pointer',
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: '0.85rem',
                fontWeight: 600,
                transition: 'background 0.15s ease'
              }}
              title="Cerrar ventana"
            >
              <X size={16} /> Cerrar
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* NAVEGACIÓN POR TAGS: FACTURACIÓN/MOVIMIENTOS vs FICHA DE PROVEEDOR */}
        {/* ================================================================= */}
        {!isNew && (
          <div
            style={{
              display: 'flex',
              padding: '0 22px',
              borderBottom: '1px solid var(--border)',
              backgroundColor: '#ffffff',
              gap: 20
            }}
          >
            {/* TAG 1: Facturación y Movimientos (con tarjetas de saldo, emitidas y abonos) */}
            <button
              type="button"
              onClick={() => setActiveTab('movimientos')}
              style={{
                padding: '12px 6px',
                border: 'none',
                background: 'transparent',
                borderBottom: activeTab === 'movimientos' ? '2px solid var(--brand-500)' : '2px solid transparent',
                color: activeTab === 'movimientos' ? 'var(--brand-700)' : 'var(--muted)',
                fontWeight: activeTab === 'movimientos' ? 700 : 500,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s ease'
              }}
            >
              <FileText size={16} /> Facturación y Movimientos ({payables.length})
            </button>

            {/* TAG 2: Ficha y Edición de Proveedor (formulario de edición exclusivo) */}
            <button
              type="button"
              onClick={() => setActiveTab('ficha')}
              style={{
                padding: '12px 6px',
                border: 'none',
                background: 'transparent',
                borderBottom: activeTab === 'ficha' ? '2px solid var(--brand-500)' : '2px solid transparent',
                color: activeTab === 'ficha' ? 'var(--brand-700)' : 'var(--muted)',
                fontWeight: activeTab === 'ficha' ? 700 : 500,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s ease'
              }}
            >
              <User size={16} /> Ficha y Edición de Proveedor
            </button>
          </div>
        )}

        {/* ================================================================= */}
        {/* CUERPO PRINCIPAL DEL MODAL */}
        {/* ================================================================= */}
        <div style={{ padding: '22px', overflowY: 'auto', flex: 1 }}>
          
          {/* --------------------------------------------------------------- */}
          {/* TAG 1: FACTURACIÓN EN MOVIMIENTO + TARJETAS DE SALDO / ABONOS */}
          {/* --------------------------------------------------------------- */}
          {activeTab === 'movimientos' && !isNew && (
            <div>
              {/* Resumen rápido de datos clave del proveedor */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  marginBottom: 16,
                  gap: 12,
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: '0.85rem' }}>
                  <span><b>Contacto:</b> {contactInput || 'No asignada'}</span>
                  <span>&bull;</span>
                  <span><b>Teléfono:</b> {phoneInput || 'No registrado'}</span>
                  <span>&bull;</span>
                  <span><b>Correo:</b> {emailInput || 'No registrado'}</span>
                  <span>&bull;</span>
                  <span><b>Condición:</b> {creditTermsInput}</span>
                </div>

                <Button
                  variant="secondary"
                  onClick={() => setActiveTab('ficha')}
                  style={{ fontSize: '0.8rem', padding: '5px 10px', height: 32 }}
                >
                  <Edit2 size={13} /> Editar Ficha
                </Button>
              </div>

              {/* 3 TARJETAS FINANCIERAS INTEGRADAS: SALDO PENDIENTE, FACTURAS EMITIDAS, TOTAL EN ABONOS */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 14,
                  marginBottom: 20
                }}
              >
                {/* 1. Saldo Pendiente Total */}
                <div
                  style={{
                    padding: '14px 18px',
                    borderRadius: 12,
                    backgroundColor: calculatedPendingDebtUSD > 0 ? '#fef2f2' : '#f0fdf4',
                    border: `1px solid ${calculatedPendingDebtUSD > 0 ? '#fecaca' : '#bbf7d0'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 800, color: calculatedPendingDebtUSD > 0 ? '#991b1b' : '#166534' }}>
                      Saldo Pendiente Total
                    </span>
                    <CreditCard size={18} style={{ color: calculatedPendingDebtUSD > 0 ? '#ef4444' : '#16a34a' }} />
                  </div>
                  <div style={{ fontSize: '1.55rem', fontWeight: 900, color: calculatedPendingDebtUSD > 0 ? '#dc2626' : '#15803d', marginTop: 4 }}>
                    $ {calculatedPendingDebtUSD.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2 }}>
                    {formatVES(calculatedPendingDebtVES)}
                  </div>
                </div>

                {/* 2. Facturas Emitidas */}
                <div
                  style={{
                    padding: '14px 18px',
                    borderRadius: 12,
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--muted)' }}>
                      Facturas Emitidas
                    </span>
                    <FileText size={18} style={{ color: 'var(--brand-500)' }} />
                  </div>
                  <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#1e293b', marginTop: 4 }}>
                    {payables.length}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: overdueInvoicesCount > 0 ? '#dc2626' : '#16a34a', marginTop: 2 }}>
                    {overdueInvoicesCount > 0 ? `⚠️ ${overdueInvoicesCount} factura(s) con atraso` : 'Al día con plazos comerciales'}
                  </div>
                </div>

                {/* 3. Total en Abonos */}
                <div
                  style={{
                    padding: '14px 18px',
                    borderRadius: 12,
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--muted)' }}>
                      Total en Abonos
                    </span>
                    <TrendingUp size={18} style={{ color: '#10b981' }} />
                  </div>
                  <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#10b981', marginTop: 4 }}>
                    $ {totalPaidUSD.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2 }}>
                    {formatVES(convertUSDtoVES(totalPaidUSD, activeRate))}
                  </div>
                </div>
              </div>

              {/* SECCIÓN DE FACTURAS Y MOVIMIENTOS */}
              <div style={{ marginTop: 8 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                    flexWrap: 'wrap',
                    gap: 10
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text)' }}>
                      Movimientos de Facturas y Compromisos de Pago
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                      Compras y obligaciones registradas con este proveedor
                    </span>
                  </div>

                  <Button
                    variant="secondary"
                    onClick={handlePrint}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', height: 32 }}
                  >
                    <Printer size={13} /> Imprimir Estado
                  </Button>
                </div>

                {isLoadingPayables ? (
                  <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--muted)' }}>
                    <Clock size={24} className="spin" style={{ display: 'inline-block', marginBottom: 8 }} />
                    <div>Cargando historial de facturación...</div>
                  </div>
                ) : payables.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '36px 20px',
                      backgroundColor: '#f8fafc',
                      borderRadius: 12,
                      border: '1px dashed var(--border)'
                    }}
                  >
                    <FileText size={32} style={{ color: 'var(--muted)', margin: '0 auto 8px auto' }} />
                    <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>No hay facturas registradas</div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--muted)', maxWidth: 420, margin: '6px auto 0 auto' }}>
                      Cuando registres compras o compromisos en Cuentas por Pagar para este proveedor, sus movimientos y pagos se listarán automáticamente aquí.
                    </p>
                  </div>
                ) : (
                  <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>N° Documento</th>
                          <th>Concepto</th>
                          <th>Emisión</th>
                          <th>Vencimiento</th>
                          <th className="num">Total ($)</th>
                          <th className="num">Abonado ($)</th>
                          <th className="num">Saldo Pendiente</th>
                          <th style={{ textAlign: 'center' }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payables.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <b>{item.doc_number}</b>
                            </td>
                            <td>
                              <div style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.concept}
                              </div>
                            </td>
                            <td style={{ fontSize: '0.82rem' }}>{item.issue_date}</td>
                            <td
                              style={{
                                fontSize: '0.82rem',
                                color: item.status === 'Vencida' ? '#dc2626' : 'inherit',
                                fontWeight: item.status === 'Vencida' ? 700 : 400
                              }}
                            >
                              {item.due_date}
                            </td>
                            <td className="num">$ {item.total_amount.toFixed(2)}</td>
                            <td className="num" style={{ color: '#16a34a' }}>$ {item.paid_amount.toFixed(2)}</td>
                            <td className="num" style={{ fontWeight: 700, color: item.remaining_amount > 0 ? '#dc2626' : '#16a34a' }}>
                              $ {item.remaining_amount.toFixed(2)}
                              {item.remaining_amount > 0 && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 400 }}>
                                  {formatVES(convertUSDtoVES(item.remaining_amount, activeRate))}
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <Badge tone={item.status === 'Pagada' ? 'success' : item.status === 'Vencida' ? 'danger' : 'warning'}>
                                {item.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* TAG 2: FICHA Y EDICIÓN COMPLETA DEL PROVEEDOR (TAG EXCLUSIVO) */}
          {/* --------------------------------------------------------------- */}
          {(activeTab === 'ficha' || isNew) && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
                  {isNew ? 'Datos de Registro del Nuevo Proveedor' : 'Formulario de Edición de Ficha'}
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Modifica los datos fiscales, comerciales y de contacto. Los cambios se sincronizan en Supabase.
                </p>
              </div>

              <form onSubmit={handleSave}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 16
                  }}
                >
                  {/* Razón Social */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                      Razón Social / Nombre Comercial *
                    </label>
                    <input
                      className="input"
                      placeholder="Ej. Inversiones y Suministros C.A."
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      required
                    />
                  </div>

                  {/* Tipo de Documento */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                      Tipo de Identificación
                    </label>
                    <select
                      className="input"
                      value={docTypeInput}
                      onChange={(e) => setDocTypeInput(e.target.value)}
                    >
                      <option value="RIF (J / G / V)">RIF (J / G / V)</option>
                      <option value="Cédula (V / E)">Cédula (V / E)</option>
                      <option value="Pasaporte">Pasaporte</option>
                    </select>
                  </div>

                  {/* Número de Documento (RIF) */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                      Número de Documento / RIF *
                    </label>
                    <input
                      className="input"
                      placeholder="Ej. J-12345678-9"
                      value={docNumberInput}
                      onChange={(e) => setDocNumberInput(e.target.value)}
                      required
                    />
                  </div>

                  {/* Persona de Contacto */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                      Persona de Contacto Principal
                    </label>
                    <input
                      className="input"
                      placeholder="Ej. Lic. Roberto Gómez"
                      value={contactInput}
                      onChange={(e) => setContactInput(e.target.value)}
                    />
                  </div>

                  {/* Categoría / Rubro */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                      Categoría / Rubro Comercial
                    </label>
                    <input
                      className="input"
                      placeholder="Ej. Insumos de Oficina, Repuestos, Alimentos"
                      value={categoryInput}
                      onChange={(e) => setCategoryInput(e.target.value)}
                    />
                  </div>

                  {/* Teléfono */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                      Teléfono de Contacto
                    </label>
                    <input
                      className="input"
                      placeholder="Ej. 0414-1234567"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                    />
                  </div>

                  {/* Correo Electrónico */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                      Correo Electrónico Fiscal
                    </label>
                    <input
                      type="email"
                      className="input"
                      placeholder="ventas@proveedor.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                    />
                  </div>

                  {/* Dirección Fiscal */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                      Dirección Fiscal / Despacho
                    </label>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="Ubicación física o comercial del proveedor..."
                      value={addressInput}
                      onChange={(e) => setAddressInput(e.target.value)}
                      style={{ height: 'auto', padding: '10px 12px' }}
                    />
                  </div>

                  {/* Estado y Términos */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                      Estado en el Sistema
                    </label>
                    <select
                      className="input"
                      value={statusInput}
                      onChange={(e) => setStatusInput(e.target.value as any)}
                    >
                      <option value="Activo">Activo (Habilitado)</option>
                      <option value="Inactivo">Inactivo (Suspendido)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, marginBottom: 5 }}>
                      Términos de Pago Habituales
                    </label>
                    <select
                      className="input"
                      value={creditTermsInput}
                      onChange={(e) => setCreditTermsInput(e.target.value)}
                    >
                      <option value="Contado">Contado / Inmediato</option>
                      <option value="7 Días">Crédito a 7 Días</option>
                      <option value="15 Días">Crédito a 15 Días</option>
                      <option value="30 Días">Crédito a 30 Días</option>
                    </select>
                  </div>
                </div>

                {/* Botón de Guardado dentro del Formulario */}
                <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  {!isNew && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setActiveTab('movimientos')}
                      disabled={isSaving}
                    >
                      Volver a Movimientos
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSaving}
                    style={{ minWidth: 140 }}
                  >
                    <Save size={15} /> {isSaving ? 'Guardando...' : isNew ? 'Registrar Proveedor' : 'Guardar Cambios'}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* PIE DE PÁGINA INFERIOR: ACCIONES REPLICADAS ABAJO */}
        {/* ================================================================= */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--border)',
            backgroundColor: '#fafbfc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          {/* Lado izquierdo: Imprimir */}
          <div>
            {!isNew && (
              <Button
                variant="secondary"
                onClick={handlePrint}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
                title="Mandar a imprimir estado y ficha"
              >
                <Printer size={15} /> Imprimir Ficha / Estado
              </Button>
            )}
          </div>

          {/* Lado derecho: Acciones según la pestaña activa */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {activeTab === 'ficha' ? (
              <>
                {!isNew && (
                  <Button
                    variant="secondary"
                    onClick={() => setActiveTab('movimientos')}
                    disabled={isSaving}
                    style={{ fontSize: '0.85rem' }}
                  >
                    Ver Movimientos
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={() => handleSave()}
                  disabled={isSaving}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', minWidth: 120 }}
                >
                  <Save size={15} /> {isSaving ? 'Guardando...' : isNew ? 'Registrar Proveedor' : 'Guardar Cambios'}
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                onClick={() => setActiveTab('ficha')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
              >
                <Edit2 size={15} /> Editar Ficha
              </Button>
            )}

            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isSaving}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
            >
              <X size={15} /> Cerrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
