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
  Phone,
  Mail,
  User,
  X,
  Building2,
  Printer,
  ChevronDown,
  Download,
  Eye
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { getActiveExchangeRate, convertUSDtoVES, formatVES } from '../../../lib/currency';
import { getBusinessProfile } from '../../../lib/businessProfile';
import { createWorksheetWithBusinessHeader } from '../../../lib/reportUtils';
import {
  fetchSuppliersFromSupabase,
  updateSupplierInSupabase,
  getActiveOrgId,
  DbSupplier
} from '../../../lib/supabase/db';
import { SupplierDetailModal } from '../components/SupplierDetailModal';

export function SuppliersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [suppliers, setSuppliers] = useState<DbSupplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Activo' | 'Inactivo' | 'Con Deuda'>('Todos');
  const [activeRate] = useState(() => getActiveExchangeRate());
  const [toast, setToast] = useState<string | null>(null);

  // Modal Unificado y Centrado para Nuevo Proveedor, Ficha, Edición y Movimientos
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    supplier: DbSupplier | null;
    isNew: boolean;
    initialEditMode: boolean;
  }>(() => ({
    isOpen: searchParams.get('action') === 'new',
    supplier: null,
    isNew: searchParams.get('action') === 'new',
    initialEditMode: searchParams.get('action') === 'new'
  }));

  // Export Modal & Dropdown
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Cargar proveedores desde Supabase
  const loadSuppliers = async () => {
    setIsLoading(true);
    try {
      const organizationId = await getActiveOrgId();
      const data = await fetchSuppliersFromSupabase(organizationId || undefined);
      setSuppliers(data || []);
    } catch (err) {
      console.error('Error loading suppliers:', err);
      showToast('Error cargando proveedores.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  // Abrir Modal Centrado para Crear Nuevo Proveedor
  const handleOpenNewForm = () => {
    setModalState({
      isOpen: true,
      supplier: null,
      isNew: true,
      initialEditMode: true
    });
  };

  // Abrir Modal Centrado para Ver Ficha y Movimientos
  const handleOpenDetail = (s: DbSupplier) => {
    setModalState({
      isOpen: true,
      supplier: s,
      isNew: false,
      initialEditMode: false
    });
  };

  // Abrir Modal Centrado para Editar Proveedor
  const handleOpenEdit = (s: DbSupplier) => {
    setModalState({
      isOpen: true,
      supplier: s,
      isNew: false,
      initialEditMode: true
    });
  };

  // Alternar Estado de Proveedor (Activo / Inactivo)
  const handleToggleStatus = async (s: DbSupplier) => {
    const newStatus = s.status === 'Activo' ? 'Inactivo' : 'Activo';
    const ok = await updateSupplierInSupabase(s.id, { ...s, status: newStatus });
    if (ok) {
      showToast(`✅ Proveedor ${newStatus === 'Activo' ? 'activado' : 'desactivado'}.`);
      await loadSuppliers();
    } else {
      showToast('❌ Error actualizando estado.');
    }
  };

  // Exportar a Excel (XLS)
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

    const worksheet = createWorksheetWithBusinessHeader('Reporte General de Proveedores', exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Proveedores');
    XLSX.writeFile(workbook, `Reporte_Proveedores_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('📊 Reporte Excel descargado.');
    setIsExportModalOpen(false);
  };

  // Exportar a PDF / Impresión oficial
  const handleExportPDF = () => {
    const business = getBusinessProfile();
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
        <title>Reporte de Proveedores — ${business.businessName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 25px; color: #0f172a; margin: 0; }
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
            <div class="title">${business.businessName.toUpperCase()} — REPORTE DE PROVEEDORES</div>
            <div class="subtitle">RIF: ${business.rif} &bull; Tel: ${business.phone}${business.address ? ` &bull; Dirección: ${business.address}` : ''}</div>
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
          Documento emitido por ${business.businessName} &bull; RIF: ${business.rif} &bull; ${new Date().toLocaleString('es-VE')}
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

  // Filtrado de proveedores
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

  // Métricas de Cabecera
  const totalCount = suppliers.length;
  const activeCount = suppliers.filter((s) => s.status === 'Activo').length;
  const debtSuppliersCount = suppliers.filter((s) => (s.balance_usd || 0) > 0).length;
  const totalDebtUSD = suppliers.reduce((sum, s) => sum + (s.balance_usd || 0), 0);
  const totalDebtVES = convertUSDtoVES(totalDebtUSD, activeRate);

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

      {/* Page Header Principal */}
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Truck size={28} style={{ color: 'var(--brand-500)' }} /> Directorio de Proveedores
          </h1>
          <p>Directorio unificado de proveedores, cuentas por pagar, facturas y auditoría de compras.</p>
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
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Reporte oficial para imprimir</div>
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

          {/* Botón Nuevo Proveedor: Abre el modal centrado inmediatamente */}
          <Button variant="primary" onClick={handleOpenNewForm}>
            <Plus size={16} /> Nuevo Proveedor
          </Button>
        </div>
      </div>

      {/* KPI Cards Ejecutivas */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <Card>
          <div className="kpi-label">Proveedores Registrados</div>
          <div className="kpi-value">{totalCount}</div>
          <div className="muted small">{activeCount} activos / {totalCount - activeCount} inactivos</div>
        </Card>

        <Card>
          <div className="kpi-label">Proveedores Activos</div>
          <div className="kpi-value" style={{ color: '#10b981' }}>{activeCount}</div>
          <div className="positive small">Habilitados para compras y facturación</div>
        </Card>

        <Card>
          <div className="kpi-label">Con Deuda Activa</div>
          <div className="kpi-value" style={{ color: '#f59e0b' }}>{debtSuppliersCount}</div>
          <div className="warning small">Facturas pendientes por abonar</div>
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
                    Cargando directorio de proveedores desde Supabase...
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
                    <tr
                      key={s.id}
                      onClick={() => handleOpenDetail(s)}
                      style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}
                      title="Haz clic para ver la ficha completa, movimientos de facturas y opciones de impresión"
                      className="hover:bg-slate-50"
                    >
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
                            <b style={{ color: 'var(--text)' }}>{s.name}</b>
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
                        <div
                          style={{ display: 'flex', justifyContent: 'center', gap: 6 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="secondary"
                            title="Ver ficha completa y movimientos de facturas"
                            onClick={() => handleOpenDetail(s)}
                          >
                            <Eye size={14} />
                          </Button>

                          <Button
                            variant="secondary"
                            title="Editar Proveedor"
                            onClick={() => handleOpenEdit(s)}
                          >
                            <Edit2 size={14} />
                          </Button>

                          <Button
                            variant="secondary"
                            title={s.status === 'Activo' ? 'Desactivar' : 'Activar'}
                            onClick={() => handleToggleStatus(s)}
                            style={{ 
                              width: 44, 
                              height: 40, 
                              borderRadius: 6, 
                              border: '1px solid var(--border)', 
                              padding: 0,
                              color: s.status === 'Activo' ? '#ef4444' : '#10b981' 
                            }}
                          >
                             <User size={18} />
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

      {/* Modal Unificado y Centrado: Ficha de Proveedor, Movimientos de Facturas y Formulario */}
      <SupplierDetailModal
        isOpen={modalState.isOpen}
        onClose={() => {
          setModalState({ isOpen: false, supplier: null, isNew: false, initialEditMode: false });
          if (searchParams.get('action')) setSearchParams({});
        }}
        supplier={modalState.supplier}
        isNew={modalState.isNew}
        initialEditMode={modalState.initialEditMode}
        onSupplierSaved={loadSuppliers}
      />
    </div>
  );
}
