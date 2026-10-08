import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  Truck,
  Plus,
  Search,
  RefreshCw,
  FileText,
  FileSpreadsheet,
  Edit2,
  Trash2,
  Phone,
  Mail,
  X,
  Building2,
  Printer,
  ArrowLeft,
  Save,
  DollarSign,
  ChevronDown,
  Download
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { getActiveExchangeRate, convertUSDtoVES, formatVES } from '../../../lib/currency';
import {
  fetchSuppliersFromSupabase,
  createSupplierInSupabase,
  updateSupplierInSupabase,
  deleteSupplierFromSupabase,
  getActiveOrgId,
  DbSupplier
} from '../../../lib/supabase/db';

export function SuppliersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [suppliers, setSuppliers] = useState<DbSupplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Activo' | 'Inactivo' | 'Con Deuda'>('Todos');
  const [activeRate] = useState(() => getActiveExchangeRate());
  const [toast, setToast] = useState<string | null>(null);

  // View Mode: 'list' (directorio) | 'form' (pantalla externa de formulario)
  const [viewMode, setViewMode] = useState<'list' | 'form'>(() => {
    return searchParams.get('action') === 'new' ? 'form' : 'list';
  });
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
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
  const [notesInput, setNotesInput] = useState('');

  // 3-Phase Registration State
  const [registrationPhase, setRegistrationPhase] = useState(1);

  // Delete Modal
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Export Modal & Dropdown
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Load Suppliers from Supabase
  const loadSuppliers = async () => {
    setIsLoading(true);
    try {
      const organizationId = await getActiveOrgId();
      const data = organizationId
        ? await fetchSuppliersFromSupabase(organizationId)
        : [];
      setSuppliers(data);
    } catch (err) {
      console.error('Error loading suppliers:', err);
      showToast('Error cargando proveedores de la organización.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  // Open Full-Screen Form for Creation
  const handleOpenNewForm = () => {
    setEditingId(null);
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
    setNotesInput('');
    setViewMode('form');
  };

  // Open Full-Screen Form for Edit
  const handleOpenEditForm = (s: DbSupplier) => {
    setEditingId(s.id);
    setNameInput(s.name || '');
    setDocTypeInput(s.doc_type || 'RIF (J / G / V)');
    setDocNumberInput(s.doc_number || '');
    setContactInput(s.contact_person || '');
    setPhoneInput(s.phone || '');
    setEmailInput(s.email || '');
    setAddressInput(s.address || '');
    setCategoryInput(s.category || 'General');
    setBalanceInput(s.balance_usd ? s.balance_usd.toString() : '0');
    setStatusInput(s.status || 'Activo');
    setCreditTermsInput('Contado');
    setNotesInput('');
    setViewMode('form');
  };

  const handleReturnToList = () => {
    setViewMode('list');
    if (searchParams.get('action')) {
      setSearchParams({});
    }
  };

  // Save / Update Supplier
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nameInput.trim()) {
      showToast('⚠️ Ingresa la Razón Social / Nombre del proveedor.');
      return;
    }
    if (!docNumberInput.trim()) {
      showToast('⚠️ Ingresa el RIF o número de documento del proveedor.');
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
      if (editingId) {
        const ok = await updateSupplierInSupabase(editingId, payload);
        if (ok) {
          showToast('✅ Proveedor actualizado correctamente.');
          await loadSuppliers();
          setRegistrationPhase(1); // Reset phase
          handleReturnToList();
        } else {
          showToast('❌ Error actualizando proveedor.');
        }
      } else {
        const created = await createSupplierInSupabase({
          ...payload,
          code: `PRV-${Math.floor(1000 + Math.random() * 9000)}`
        });
        if (created) {
          showToast('✅ Proveedor registrado con éxito.');
          await loadSuppliers();
          setRegistrationPhase(1); // Reset phase
          handleReturnToList();
        } else {
          showToast('❌ Error registrando proveedor.');
        }
      }
    } catch (err: any) {
      showToast('❌ Error guardando proveedor: ' + (err?.message || 'Error de red'));
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Supplier
  const handleDeleteSupplier = async () => {
    if (!deletingId) return;

    const ok = await deleteSupplierFromSupabase(deletingId);
    if (ok) {
      showToast('🗑️ Proveedor eliminado correctamente.');
      await loadSuppliers();
    } else {
      showToast('❌ Error al eliminar proveedor de Supabase.');
    }
    setDeletingId(null);
  };

  // Export to Excel
  const handleExportXLS = () => {
    const exportData = filteredSuppliers.map((s) => ({
      Código: s.code || 'N/A',
      Proveedor: s.name,
      Documento: `${s.doc_type} - ${s.doc_number}`,
      Contacto: s.contact_person || '-',
      Teléfono: s.phone || '-',
      Correo: s.email || '-',
      Categoría: s.category || 'General',
      'Balance Deuda ($)': s.balance_usd || 0,
      'Balance Deuda (Bs)': convertUSDtoVES(s.balance_usd || 0, activeRate),
      Estado: s.status,
      'Fecha Registro': s.created_at ? new Date(s.created_at).toLocaleDateString('es-VE') : '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Proveedores');
    XLSX.writeFile(workbook, `Reporte_Proveedores_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('📊 Reporte Excel descargado.');
    setIsExportModalOpen(false);
  };

  // Export PDF Report
  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('⚠️ No se pudo abrir la ventana de impresión.');
      return;
    }

    const rowsHtml = filteredSuppliers.map((s) => {
      const debtVES = convertUSDtoVES(s.balance_usd || 0, activeRate);
      return `
        <tr>
          <td><b>${s.code || 'PRV-GEN'}</b></td>
          <td><b>${s.name}</b></td>
          <td>${s.doc_type} - ${s.doc_number}</td>
          <td>${s.contact_person || '-'}</td>
          <td>${s.phone || '-'} / ${s.email || '-'}</td>
          <td>${s.category || 'General'}</td>
          <td style="text-align: right; color: ${(s.balance_usd || 0) > 0 ? '#dc2626' : '#16a34a'}; font-weight: bold;">
            $ ${(s.balance_usd || 0).toFixed(2)}
            <br/><small style="color: #64748b;">${formatVES(debtVES)}</small>
          </td>
          <td><span class="status-badge ${s.status === 'Activo' ? 'active' : 'inactive'}">${s.status}</span></td>
        </tr>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reporte de Proveedores — Frenyer ERP</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 25px; color: #0f172a; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #7c3aed; padding-bottom: 12px; margin-bottom: 20px; }
          .title { font-size: 22px; font-weight: bold; color: #1e1b4b; margin: 0; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .kpi-grid { display: flex; gap: 15px; margin-bottom: 20px; }
          .kpi-box { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 8px; }
          .kpi-title { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; }
          .kpi-val { font-size: 18px; font-weight: bold; color: #0f172a; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th { background: #f1f5f9; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; font-weight: bold; color: #334155; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
          .status-badge { padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
          .status-badge.active { background: #dcfce7; color: #15803d; }
          .status-badge.inactive { background: #fee2e2; color: #b91c1c; }
          .footer { margin-top: 30px; text-align: right; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">FRENYER ERP — REPORTE DE PROVEEDORES</div>
            <div class="subtitle">Directorio comercial y saldos de cuentas por pagar en Supabase</div>
          </div>
          <div style="text-align: right; font-size: 12px; color: #475569;">
            <div><b>Fecha:</b> ${new Date().toLocaleDateString('es-VE')}</div>
            <div><b>Tasa BCV Oficial:</b> ${activeRate.toFixed(2)} Bs/$</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-title">Proveedores Registrados</div>
            <div class="kpi-val">${totalCount}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Proveedores Activos</div>
            <div class="kpi-val" style="color: #16a34a;">${activeCount}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Con Deuda Activa</div>
            <div class="kpi-val" style="color: #d97706;">${debtSuppliersCount}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Total Deuda ($)</div>
            <div class="kpi-val" style="color: #dc2626;">$ ${totalDebtUSD.toFixed(2)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Proveedor</th>
              <th>Documento (RIF)</th>
              <th>Contacto</th>
              <th>Teléfono / Correo</th>
              <th>Categoría</th>
              <th style="text-align: right;">Deuda Pendiente</th>
              <th>Estatus</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="text-align:center;">No hay proveedores registrados.</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          Documento generado por Frenyer ERP &bull; ${new Date().toLocaleString('es-VE')}
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setIsExportModalOpen(false);
  };

  // Filter Logic
  const filteredSuppliers = suppliers.filter((s) => {
    const matchSearch =
      (s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.doc_number && s.doc_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.contact_person && s.contact_person.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.category && s.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.email && s.email.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchSearch) return false;

    if (statusFilter === 'Activo') return s.status === 'Activo';
    if (statusFilter === 'Inactivo') return s.status === 'Inactivo';
    if (statusFilter === 'Con Deuda') return (s.balance_usd || 0) > 0;

    return true;
  });

  // KPI Calculations
  const totalCount = suppliers.length;
  const activeCount = suppliers.filter((s) => s.status === 'Activo').length;
  const debtSuppliersCount = suppliers.filter((s) => (s.balance_usd || 0) > 0).length;
  const totalDebtUSD = suppliers.reduce((sum, s) => sum + (s.balance_usd || 0), 0);
  const totalDebtVES = convertUSDtoVES(totalDebtUSD, activeRate);

  // ---------------------------------------------------------------------------
  // PANTALLA DE FORMULARIO DEDICADO DE REGISTRO / EDICIÓN
  // ---------------------------------------------------------------------------
  if (viewMode === 'form') {
    return (
      <div className="content">
        {/* Toast Notification */}
        {toast && (
          <div
            style={{
              position: 'fixed',
              top: 20,
              right: 20,
              backgroundColor: '#1e293b',
              color: '#fff',
              padding: '12px 20px',
              borderRadius: 12,
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              zIndex: 9999,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: '1px solid #334155'
            }}
          >
            {toast}
          </div>
        )}

        {/* Top Navigation */}
        <div className="page-head" style={{ marginBottom: 20 }}>
          <div>
            <Button
              variant="secondary"
              onClick={handleReturnToList}
              style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ArrowLeft size={16} /> Volver al Directorio
            </Button>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Truck size={28} style={{ color: 'var(--brand-500)' }} />
              {editingId ? `Editar Proveedor: ${nameInput || 'Sin Nombre'}` : 'Registro de Nuevo Proveedor'}
            </h1>
            <p>Ingresa la información legal, fiscal, comercial y de contacto del proveedor.</p>
          </div>
        </div>

        {/* Form Sections */}
        <form onSubmit={handleSaveSupplier}>
          <div style={{ marginBottom: 20 }}>
            {/* Progress Indicator */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[1, 2, 3].map((p) => (
                <div
                  key={p}
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: p <= registrationPhase ? 'var(--brand-500)' : 'var(--border)'
                  }}
                />
              ))}
            </div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: 20 }}>
              Fase {registrationPhase}: {registrationPhase === 1 ? 'Identificación' : registrationPhase === 2 ? 'Contacto' : 'Finanzas'}
            </h2>
          </div>

          <div style={{ display: registrationPhase === 1 ? 'block' : 'none' }}>
            <Card className="spaced">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <Building2 size={20} style={{ color: 'var(--brand-500)' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>1. Identificación Legal y Fiscal</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="label">Razón Social / Nombre Comercial *</label>
                  <input
                    className="input"
                    placeholder="Ej. Distribuidora Central C.A."
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    required={registrationPhase === 1}
                  />
                </div>

                <div className="grid grid-2" style={{ gap: 12 }}>
                  <div>
                    <label className="label">Tipo Documento</label>
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

                  <div>
                    <label className="label">RIF / N° Identificación *</label>
                    <input
                      className="input"
                      placeholder="Ej. J-31234567-8"
                      value={docNumberInput}
                      onChange={(e) => setDocNumberInput(e.target.value)}
                      required={registrationPhase === 1}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Persona de Contacto Principal</label>
                  <input
                    className="input"
                    placeholder="Ej. Ing. Roberto Gómez"
                    value={contactInput}
                    onChange={(e) => setContactInput(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Categoría / Rubro Comercial</label>
                  <input
                    className="input"
                    placeholder="Ej. Alimentos, Insumos"
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                  />
                </div>
              </div>
            </Card>
          </div>

          <div style={{ display: registrationPhase === 2 ? 'block' : 'none' }}>
            <Card className="spaced">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <Phone size={20} style={{ color: 'var(--brand-500)' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>2. Ubicación y Contacto Directo</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="label">Teléfono Principal</label>
                  <input
                    className="input"
                    placeholder="Ej. 0414-555-1234"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Correo Electrónico Fiscal</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="Ej. ventas@proveedor.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Dirección Fiscal</label>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder="Dirección completa..."
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                  />
                </div>
              </div>
            </Card>
          </div>

          <div style={{ display: registrationPhase === 3 ? 'block' : 'none' }}>
            <Card className="spaced">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <DollarSign size={20} style={{ color: 'var(--brand-500)' }} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>3. Condiciones Financieras</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="label">Saldo Pendiente Inicial ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    value={balanceInput}
                    onChange={(e) => setBalanceInput(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Términos de Pago</label>
                  <select
                    className="input"
                    value={creditTermsInput}
                    onChange={(e) => setCreditTermsInput(e.target.value)}
                  >
                    <option value="Contado">Contado</option>
                    <option value="7 Días">Crédito 7 Días</option>
                    <option value="15 Días">Crédito 15 Días</option>
                    <option value="30 Días">Crédito 30 Días</option>
                  </select>
                </div>

                <div>
                  <label className="label">Estatus</label>
                  <select
                    className="input"
                    value={statusInput}
                    onChange={(e) => setStatusInput(e.target.value as any)}
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>

                <div>
                  <label className="label">Notas Internas</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Bottom Action Footer Bar */}
          <div
            style={{
              marginTop: 24,
              padding: '16px 24px',
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg, 16px)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
              gap: 12
            }}
          >
            <Button
              type="button"
              variant="secondary"
              onClick={handleReturnToList}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <div style={{ display: 'flex', gap: 12 }}>
              {registrationPhase > 1 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setRegistrationPhase(registrationPhase - 1)}
                  disabled={isSaving}
                >
                  Atrás
                </Button>
              )}
              {registrationPhase < 3 ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    if (registrationPhase === 1 && (!nameInput.trim() || !docNumberInput.trim())) {
                      showToast('⚠️ Completa los campos obligatorios de la Fase 1.');
                      return;
                    }
                    setRegistrationPhase(registrationPhase + 1);
                  }}
                >
                  Siguiente
                </Button>
              ) : (
                <Button type="submit" variant="primary" disabled={isSaving}>
                  <Save size={16} />
                  {isSaving ? 'Guardando...' : editingId ? 'Actualizar' : 'Guardar Proveedor'}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // PANTALLA PRINCIPAL: DIRECTORIO Y TABLA DE PROVEEDORES
  // ---------------------------------------------------------------------------
  return (
    <div className="content">
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            backgroundColor: '#1e293b',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            zIndex: 9999,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid #334155'
          }}
        >
          {toast}
        </div>
      )}

      {/* Page Header */}
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Truck size={28} style={{ color: 'var(--brand-500)' }} /> Directorio de Proveedores
          </h1>
          <p>Gestión completa de proveedores, registro en Supabase, cuentas por pagar y compras.</p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Dropdown Exportar Reporte */}
          <div style={{ position: 'relative' }}>
            <Button
              variant="secondary"
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Download size={16} />
              <span>Exportar Reporte</span>
              <ChevronDown
                size={14}
                style={{
                  opacity: 0.7,
                  transform: isExportDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s'
                }}
              />
            </Button>

            {isExportDropdownOpen && (
              <>
                {/* Backdrop to close dropdown on click outside */}
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 90 }}
                  onClick={() => setIsExportDropdownOpen(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    width: 220,
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                    zIndex: 100,
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <button
                    onClick={() => {
                      setIsExportDropdownOpen(false);
                      handleExportPDF();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: 'var(--fg)',
                      cursor: 'pointer',
                      fontSize: '0.88rem',
                      fontWeight: 500,
                      textAlign: 'left',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <FileText size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Exportar PDF</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Reporte para imprimir</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setIsExportDropdownOpen(false);
                      handleExportXLS();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: 'var(--fg)',
                      cursor: 'pointer',
                      fontSize: '0.88rem',
                      fontWeight: 500,
                      textAlign: 'left',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        color: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <FileSpreadsheet size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>Exportar XLS</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Hoja de cálculo Excel</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          <Button variant="primary" onClick={handleOpenNewForm}>
            <Plus size={16} /> Nuevo Proveedor
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <Card>
          <div className="kpi-label">Proveedores Registrados</div>
          <div className="kpi-value">{totalCount}</div>
          <div className="muted small">{activeCount} activos / {totalCount - activeCount} inactivos</div>
        </Card>

        <Card>
          <div className="kpi-label">Proveedores Activos</div>
          <div className="kpi-value" style={{ color: '#10b981' }}>{activeCount}</div>
          <div className="positive small">Listos para compras y facturación</div>
        </Card>

        <Card>
          <div className="kpi-label">Con Deuda Activa</div>
          <div className="kpi-value" style={{ color: '#f59e0b' }}>{debtSuppliersCount}</div>
          <div className="warning small">Pendiente por abonar/saldar</div>
        </Card>

        <Card>
          <div className="kpi-label">Total Deuda Acumulada</div>
          <div className="kpi-value" style={{ color: '#ef4444' }}>
            $ {totalDebtUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="muted small">
            {formatVES(totalDebtVES)} (Tasa BCV: {activeRate.toFixed(2)} Bs/$)
          </div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <div
          className="toolbar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 280 }}>
            <div className="search" style={{ flex: 1 }}>
              <Search size={16} />
              <input
                className="input"
                placeholder="Buscar por Razón Social, RIF, contacto o categoría..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select
              className="input"
              style={{ width: 160 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="Todos">Todos los estados</option>
              <option value="Activo">Solo Activos</option>
              <option value="Inactivo">Solo Inactivos</option>
              <option value="Con Deuda">Con Deuda Pendiente</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={loadSuppliers} disabled={isLoading}>
              <RefreshCw size={14} className={isLoading ? 'spin' : ''} /> Refrescar
            </Button>
          </div>
        </div>

        {/* Table View */}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código / Proveedor</th>
                <th>RIF / Documento</th>
                <th>Contacto Principal</th>
                <th>Categoría / Rubro</th>
                <th>Teléfono / Correo</th>
                <th className="num">Balance Pendiente</th>
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
                    Cargando proveedores desde Supabase...
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
                    No se encontraron proveedores que coincidan con la búsqueda. Haz clic en <b>"Nuevo Proveedor"</b> para registrar el primero.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((s) => {
                  const debtVES = convertUSDtoVES(s.balance_usd || 0, activeRate);
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              backgroundColor: 'rgba(124, 58, 237, 0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--brand-500)',
                              flexShrink: 0
                            }}
                          >
                            <Building2 size={18} />
                          </div>
                          <div>
                            <b>{s.name}</b>
                            <div className="muted small">{s.code || 'PRV-GEN'}</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <b>{s.doc_number}</b>
                        <div className="muted small">{s.doc_type}</div>
                      </td>

                      <td>
                        {s.contact_person ? (
                          <span>{s.contact_person}</span>
                        ) : (
                          <span className="muted italic">-</span>
                        )}
                      </td>

                      <td>
                        <Badge tone="brand">{s.category || 'General'}</Badge>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {s.phone && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
                              <Phone size={12} className="muted" /> {s.phone}
                            </span>
                          )}
                          {s.email && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: 'var(--muted)' }}>
                              <Mail size={12} /> {s.email}
                            </span>
                          )}
                          {!s.phone && !s.email && <span className="muted italic">-</span>}
                        </div>
                      </td>

                      <td className="num">
                        <b style={{ color: (s.balance_usd || 0) > 0 ? '#ef4444' : '#10b981' }}>
                          $ {(s.balance_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </b>
                        {(s.balance_usd || 0) > 0 && (
                          <div className="muted small">{formatVES(debtVES)}</div>
                        )}
                      </td>

                      <td>
                        <Badge tone={s.status === 'Activo' ? 'success' : 'danger'}>
                          {s.status}
                        </Badge>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                          <Button
                            variant="secondary"
                            title="Editar Proveedor"
                            onClick={() => handleOpenEditForm(s)}
                          >
                            <Edit2 size={14} />
                          </Button>

                          <Button
                            variant="secondary"
                            title="Eliminar Proveedor"
                            style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                            onClick={() => setDeletingId(s.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Delete Confirmation */}
      {deletingId && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3>Confirmar Eliminación</h3>
              <button className="modal-close" onClick={() => setDeletingId(null)}>
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: '16px 0', color: 'var(--muted)' }}>
              ¿Estás seguro de que deseas eliminar este proveedor? Esta acción eliminará su registro permanentemente de Supabase.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="secondary" onClick={() => setDeletingId(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}
                onClick={handleDeleteSupplier}
              >
                Sí, Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Export Report Options */}
      {isExportModalOpen && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-head">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Printer size={20} className="brand" /> Exportar Reporte de Proveedores
              </h3>
              <button className="modal-close" onClick={() => setIsExportModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--muted)', margin: '12px 0 20px 0' }}>
              Selecciona el formato en el que deseas exportar el informe consolidado de proveedores y cuentas por pagar:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                onClick={handleExportPDF}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 18px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--card)',
                  color: 'var(--fg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--brand-500)')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <FileText size={22} />
                </div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Exportar PDF</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Genera e imprime un reporte oficial con membrete corporativo.
                  </div>
                </div>
              </button>

              <button
                onClick={handleExportXLS}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 18px',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--card)',
                  color: 'var(--fg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--brand-500)')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>Exportar XLS (Excel)</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Descarga hoja de cálculo editable con todos los registros.
                  </div>
                </div>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <Button variant="secondary" onClick={() => setIsExportModalOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
