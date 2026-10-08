import { useState, useEffect } from 'react';
import {
  Building,
  Save,
  RefreshCw,
  Globe,
  Users,
  Plus,
  Search,
  Trash2,
  Edit2,
  Shield,
  Upload,
  TrendingUp,
  Coins,
  CheckCircle,
  HelpCircle,
  FolderArchive,
  Check,
  AlertTriangle,
  X,
  CreditCard
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { getActiveExchangeRate, setActiveExchangeRate, formatUSD, formatVES } from '../../../lib/currency';
import { authenticatedFetch } from '../../../lib/supabase/api';

interface AssociatedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  title: string;
  initials: string;
}

interface RateRecord {
  id: string;
  date: string;
  source: string;
  rate: string;
}

interface BankAccountRecord {
  id: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  currency: string;
  balance: number;
  status: string;
  created_at?: string;
}

export function ConfigPage() {
  const [activeTab, setActiveTab] = useState<'negocio' | 'usuarios' | 'auditoria'>('negocio');

  // --- BANK ACCOUNTS AUDIT STATE ---
  const [auditFolder, setAuditFolder] = useState<'activas' | 'inactivas'>('activas');
  const [auditAccounts, setAuditAccounts] = useState<BankAccountRecord[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditConfirmModal, setAuditConfirmModal] = useState<{
    isOpen: boolean;
    account: BankAccountRecord | null;
    action: 'inactivar' | 'reactivar' | 'eliminar_permanente';
  }>({
    isOpen: false,
    account: null,
    action: 'inactivar'
  });

  const loadAuditAccounts = async () => {
    setIsAuditLoading(true);
    try {
      const ts = Date.now();
      const res = await authenticatedFetch(`/api/bank-accounts?t=${ts}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setAuditAccounts(json.data || []);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsAuditLoading(false);
    }
  };

  const handleExecuteAuditAction = async () => {
    if (!auditConfirmModal.account) return;
    const { id, bank_name } = auditConfirmModal.account;
    const action = auditConfirmModal.action;

    try {
      if (action === 'inactivar') {
        const res = await authenticatedFetch(`/api/bank-accounts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Inactivo' })
        });
        const json = await res.json();
        if (json.success) {
          showNotification(`Cuenta "${bank_name}" movida a inactivas.`);
          await loadAuditAccounts();
        }
      } else if (action === 'reactivar') {
        const res = await authenticatedFetch(`/api/bank-accounts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Activo' })
        });
        const json = await res.json();
        if (json.success) {
          showNotification(`Cuenta "${bank_name}" reactivada con éxito.`);
          await loadAuditAccounts();
        }
      } else if (action === 'eliminar_permanente') {
        const res = await authenticatedFetch(`/api/bank-accounts/${id}?permanent=true`, {
          method: 'DELETE'
        });
        const json = await res.json();
        if (json.success) {
          showNotification(`Cuenta "${bank_name}" eliminada definitivamente.`);
          await loadAuditAccounts();
        }
      }
    } catch {
      showNotification('Error al procesar la operación.', 'info');
    } finally {
      setAuditConfirmModal({ isOpen: false, account: null, action: 'inactivar' });
    }
  };

  // --- BUSINESS INFO STATE ---
  const [businessName, setBusinessName] = useState('Frenyer, C.A.');
  const [rif, setRif] = useState('J-123456789');
  const [email, setEmail] = useState('contacto@frenyer.com');
  const [address, setAddress] = useState('Av. Francisco de Miranda, Centro Financiero, Caracas');
  const [phone, setPhone] = useState('+58 212 555 1212');
  const [whatsapp, setWhatsapp] = useState('+584120000000');
  const [logo, setLogo] = useState<string | null>(null);
  const [favicon, setFavicon] = useState<string | null>(null);

  // --- RATE MANAGEMENT STATE ---
  const [currentRate, setCurrentRate] = useState(() => {
    const rate = getActiveExchangeRate();
    return rate.toFixed(2).replace('.', ',');
  });
  const [rateInput, setRateInput] = useState(() => getActiveExchangeRate().toString());
  const [rateSource, setRateSource] = useState(() => localStorage.getItem('frenyer_bcv_rate_source') || 'BCV Oficial');
  const [rateDate, setRateDate] = useState(() => localStorage.getItem('frenyer_bcv_rate_date') || new Date().toISOString().split('T')[0]);
  const [autoUpdateBcv, setAutoUpdateBcv] = useState(() => {
    const pref = localStorage.getItem('frenyer_auto_update_bcv');
    return pref !== null ? pref === 'true' : true;
  });
  const [rateHistory, setRateHistory] = useState<RateRecord[]>([]);
  const [isConsultingBcv, setIsConsultingBcv] = useState(false);
  const [isFutureRateActive, setIsFutureRateActive] = useState(false);

  // Load real rate history on mount
  const loadRateHistory = async () => {
    try {
      const res = await authenticatedFetch('/api/exchange-rates/history');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const mapped: RateRecord[] = json.data.map((r: any) => ({
            id: r.id ? `TAS-${r.id.slice(0, 4)}` : `TAS-${Date.now().toString().slice(-4)}`,
            date: r.observed_at ? new Date(r.observed_at).toLocaleDateString('es-VE') : 'Hoy',
            source: r.source === 'MANUAL' ? 'Manual / Interna' : r.is_future_rate ? 'BCV (Tasa Futura)' : 'BCV Oficial',
            rate: `Bs. ${Number(r.rate).toFixed(4)}`
          }));
          setRateHistory(mapped);
          return;
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadRateHistory();
  }, []);

  const handleToggleAutoUpdate = (active: boolean) => {
    setAutoUpdateBcv(active);
    localStorage.setItem('frenyer_auto_update_bcv', active ? 'true' : 'false');
    showNotification(`Verificación automática ${active ? 'activada' : 'desactivada'}.`);
  };

  // --- SYSTEM PARAMETERS STATE ---
  const [mainCurrency, setMainCurrency] = useState('VES');
  const [stockAlert, setStockAlert] = useState(5);
  const [ticketFooter, setTicketFooter] = useState('¡Gracias por su compra!');

  // --- ASSOCIATED USERS STATE ---
  const users: AssociatedUser[] = [];
  const [userSearch, setUserSearch] = useState('');
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);

  // Add User Form State
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('PROPIETARIO');
  const [newUserTitle, setNewUserTitle] = useState('Gerente');
  const [newUserActive, setNewUserActive] = useState(true);

  // Alert/Notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  const showNotification = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleConsultBcv = async () => {
    setIsConsultingBcv(true);
    try {
      const res = await fetch('/api/bcv/rates?refresh=true');
      if (res.ok) {
        const data = await res.json();
        // Si existe tasa futura, esa es la que se graba; de lo contrario se queda con la actual
        const chosenRate = data.isFutureApplied && data.futureRate
          ? data.futureRate
          : (data.appliedRate || data.usdRate);
        if (!Number.isFinite(chosenRate) || chosenRate <= 0) {
          showNotification('El servicio BCV no devolvió una tasa válida.', 'info');
          return;
        }

        setRateInput(chosenRate.toString());
        setActiveExchangeRate(chosenRate);
        setCurrentRate(chosenRate.toFixed(2).replace('.', ','));
        setRateSource(data.isFutureApplied ? 'BCV Oficial (Tasa Futura)' : 'BCV Oficial');
        setIsFutureRateActive(Boolean(data.isFutureApplied));
        if (data.valueDate) setRateDate(data.valueDate);

        localStorage.setItem('frenyer_bcv_is_future', data.isFutureApplied ? 'true' : 'false');
        localStorage.setItem('frenyer_bcv_rate_source', data.source);
        if (data.valueDate) localStorage.setItem('frenyer_bcv_rate_date', data.valueDate);

        await loadRateHistory();
        showNotification(
          data.isFutureApplied
            ? `Tasa futura detectada y grabada: Bs. ${chosenRate.toFixed(4)} (Fecha valor: ${data.valueDate})`
            : `Consulta realizada con éxito. Tasa oficial BCV: Bs. ${chosenRate.toFixed(4)}`
        );
      } else {
        showNotification('No se pudo consultar el portal BCV en este momento.', 'info');
      }
    } catch {
      showNotification('Error de conexión al consultar el portal BCV.', 'info');
    } finally {
      setIsConsultingBcv(false);
    }
  };

  const handleSaveRate = async () => {
    const numericRate = parseFloat(rateInput);
    if (!isNaN(numericRate) && numericRate > 0) {
      try {
        const res = await authenticatedFetch('/api/bcv/rates/manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rate: numericRate,
            valueDate: rateDate,
            userRole: 'admin',
            notes: `Registro desde panel de Configuración (${rateSource})`
          })
        });

        if (!res.ok) {
          throw new Error('No se pudo guardar la tasa en Supabase.');
        }
        const data = await res.json();
        const effective = Number(data.certifiedRate?.usdRate);
        if (!Number.isFinite(effective) || effective <= 0) {
          throw new Error('Supabase no devolvió una tasa certificada válida.');
        }
        setActiveExchangeRate(effective);
        setCurrentRate(effective.toFixed(2).replace('.', ','));
        localStorage.setItem('frenyer_bcv_rate', effective.toString());
        localStorage.setItem('frenyer_bcv_rate_date', rateDate);
        localStorage.setItem('frenyer_bcv_rate_source', 'MANUAL');

        window.dispatchEvent(new CustomEvent('frenyer:rate-changed', {
          detail: { rate: effective, isFutureRate: false, source: 'MANUAL' }
        }));

        await loadRateHistory();
        showNotification(`Nueva tasa de cambio guardada en base de datos: Bs. ${effective.toFixed(4)}`);
      } catch (error) {
        showNotification(
          error instanceof Error ? error.message : 'Error al guardar la tasa en Supabase.',
          'info'
        );
      }
    }
  };

  // Associated Users actions
  const toggleUserStatus = (id: number) => {
    void id;
    showNotification('La gestión de usuarios debe habilitarse desde Supabase.', 'info');
  };

  const handleDeleteUser = (id: number) => {
    void id;
    showNotification('La gestión de usuarios debe habilitarse desde Supabase.', 'info');
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddUserModalOpen(false);
    showNotification('La gestión de usuarios debe habilitarse desde Supabase.', 'info');
  };

  const filteredUsers = users.filter(
    u => u.name.includes(userSearch.toLowerCase()) || u.email.includes(userSearch.toLowerCase())
  );

  return (
    <div className="content">
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            background: notification.type === 'success' ? '#237d5f' : '#8b78e8',
            color: 'white',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <CheckCircle size={16} />
          {notification.message}
        </div>
      )}

      {/* Page Header exactly as Image 1 */}
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h1 style={{ fontWeight: 700, fontSize: 24, color: 'var(--text)' }}>
            Configuración de la empresa
          </h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
            Administración general de negocio, perfil personal y usuarios asociados
          </p>
        </div>

        {/* Tasa USD Display on top-right header */}
        <div
          style={{
            background: '#e9fcf4',
            border: '1px solid #b2f1d5',
            borderRadius: 999,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            color: '#136041',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span style={{ color: '#237d5f' }}>$ Tasa USD:</span>
          <b>Bs. {currentRate}</b>
          <span style={{ cursor: 'pointer', fontSize: 11 }}>✏</span>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="config-tabs">
        <button
          onClick={() => setActiveTab('negocio')}
          className={`config-tab-btn ${activeTab === 'negocio' ? 'active' : ''}`}
        >
          Negocio
        </button>
        <button
          onClick={() => setActiveTab('usuarios')}
          className={`config-tab-btn ${activeTab === 'usuarios' ? 'active' : ''}`}
        >
          Usuarios asociados
        </button>
        <button
          onClick={() => {
            setActiveTab('auditoria');
            loadAuditAccounts();
          }}
          className={`config-tab-btn ${activeTab === 'auditoria' ? 'active' : ''}`}
        >
          Auditoría
        </button>
      </div>

      {activeTab === 'negocio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Section 1: Identidad y datos fiscales (Image 1) */}
          <Card>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                Identidad y datos fiscales
              </h3>
              <span className="muted small">
                Se usan en facturas, tickets y en la tienda pública
              </span>
            </div>

            <div className="form-grid">
              <div className="field full">
                <label>Nombre del negocio</label>
                <input
                  className="input"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Nombre de la empresa"
                />
              </div>

              <div className="field">
                <label>RIF</label>
                <input
                  className="input"
                  value={rif}
                  onChange={(e) => setRif(e.target.value)}
                  placeholder="Ej: J-123456789"
                />
              </div>

              <div className="field">
                <label>Correo</label>
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="empresa@correo.com"
                />
              </div>

              <div className="field full">
                <label>Dirección fiscal</label>
                <textarea
                  className="input"
                  style={{ height: 80, padding: 12, resize: 'vertical' }}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ubicación comercial"
                />
              </div>

              <div className="field">
                <label>Teléfono</label>
                <input
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Código de área y número"
                />
              </div>

              <div className="field">
                <label>WhatsApp</label>
                <input
                  className="input"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="Ej: +58412..."
                />
              </div>

              {/* Logo upload slot */}
              <div className="field">
                <label>Logo</label>
                <div className="upload-slot">
                  <div className="preview-box">
                    {logo ? (
                      <img src={logo} alt="Logo" />
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>Logo</span>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    style={{ background: '#fff', color: '#5f6572', borderColor: '#d1d5db', height: 34, fontSize: 11 }}
                    onClick={() => {
                      const dummyUrl = 'https://picsum.photos/120/120';
                      setLogo(logo ? null : dummyUrl);
                    }}
                  >
                    <Upload size={12} /> {logo ? 'Quitar' : 'Subir'}
                  </Button>
                </div>
                <span className="muted small" style={{ fontSize: 11, marginTop: 4 }}>
                  Se usa en facturas, tickets y en la tienda. PNG o JPG.
                </span>
              </div>

              {/* Favicon upload slot */}
              <div className="field">
                <label>Favicon</label>
                <div className="upload-slot">
                  <div className="preview-box">
                    {favicon ? (
                      <img src={favicon} alt="Favicon" />
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>64x64</span>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    style={{ background: '#fff', color: '#5f6572', borderColor: '#d1d5db', height: 34, fontSize: 11 }}
                    onClick={() => {
                      const dummyUrl = 'https://picsum.photos/64/64';
                      setFavicon(favicon ? null : dummyUrl);
                    }}
                  >
                    <Upload size={12} /> {favicon ? 'Quitar' : 'Subir'}
                  </Button>
                </div>
                <span className="muted small" style={{ fontSize: 11, marginTop: 4 }}>
                  Ícono de la pestaña del navegador. Cuadrado, 64x64 px.
                </span>
              </div>
            </div>
          </Card>

          {/* Section 2: Tasa de Cambio Diaria (Image 2) */}
          <div>
            {/* Dark Blue Active Rate Card */}
            <div className="rate-display-card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="rate-badge active">
                    <TrendingUp size={11} /> Tasa Activa en Ventas
                  </span>
                  <span className="rate-badge">
                    {rateSource}
                  </span>
                  {isFutureRateActive && (
                    <span
                      style={{
                        background: '#fef3c7',
                        color: '#92400e',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '1px 8px',
                        borderRadius: 4
                      }}
                    >
                      TASA FUTURA APLICADA
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  Bs. {currentRate} <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.8 }}>/1USD</span>
                </div>
                <span className="muted" style={{ fontSize: 11, color: '#94a3b8' }}>
                  🕒 Vigencia: {rateDate} • Origen: {rateSource}
                </span>
              </div>
              
              <Button
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  borderColor: 'rgba(255,255,255,0.3)',
                  color: 'white',
                  fontSize: 12
                }}
                disabled={isConsultingBcv}
                onClick={handleConsultBcv}
              >
                <RefreshCw size={14} className={isConsultingBcv ? 'animate-spin' : ''} /> {isConsultingBcv ? 'Consultando BCV...' : 'Consultar BCV Oficial'}
              </Button>
            </div>

            {/* Daily Exchange Rate update form */}
            <Card>
              <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Coins size={18} className="muted" style={{ color: 'var(--brand-500)' }} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                  Actualizar Tasa de Cambio Diaria
                </h3>
              </div>
              <span className="muted small" style={{ display: 'block', marginBottom: 16 }}>
                Esta tasa se almacena en la base de datos y se utiliza automáticamente para convertir precios de USD a VES en las ventas.
              </span>

              <div className="form-grid">
                <div className="field">
                  <label>Tasa (Bs. por 1 USD) *</label>
                  <input
                    className="input"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Origen / Fuente</label>
                  <select
                    className="input"
                    value={rateSource}
                    onChange={(e) => setRateSource(e.target.value)}
                  >
                    <option value="Tasa Manual / Interna">Tasa Manual / Interna</option>
                    <option value="BCV Oficial">BCV Oficial</option>
                    <option value="Tasa de Mercado">Tasa de Mercado (Paralelo)</option>
                  </select>
                </div>

                <div className="field">
                  <label>Fecha de Vigencia</label>
                  <input
                    type="date"
                    className="input"
                    value={rateDate}
                    onChange={(e) => setRateDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, flexWrap: 'wrap', gap: 12 }}>
                <span className="muted small" style={{ color: '#237d5f', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ✔ Los cálculos de ventas usarán la tasa guardada inmediatamente.
                </span>
                <Button variant="primary" onClick={handleSaveRate}>
                  <Save size={15} /> Guardar en Base de Datos
                </Button>
              </div>
            </Card>

            {/* Historical logs of exchange rates */}
            <Card className="spaced">
              <span className="muted small" style={{ textTransform: 'uppercase', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', display: 'block', marginBottom: 12 }}>
                ⏳ HISTORIAL DE TASAS REGISTRADAS
              </span>
              
              {rateHistory.length === 0 ? (
                <div className="empty" style={{ padding: '24px 0', fontSize: 12 }}>
                  No hay historial previo registrado.
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>ID Registro</th>
                        <th>Fecha Vigencia</th>
                        <th>Origen / Fuente</th>
                        <th className="num">Tasa Registrada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rateHistory.map((item) => (
                        <tr key={item.id}>
                          <td><b>{item.id}</b></td>
                          <td>{item.date}</td>
                          <td>{item.source}</td>
                          <td className="num" style={{ fontWeight: 700, color: 'var(--brand-700)' }}>
                            {item.rate}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Auto update toggle card */}
            <Card className="spaced">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>
                    Actualización automática de Tasa BCV
                  </h3>
                  <span className="muted small">
                    Comprueba periódicamente el sitio del BCV y aplica ajustes automáticos si la tasa oficial se incrementa.
                  </span>
                </div>

                {/* Switched toggle */}
                <div className="switch-container" onClick={() => handleToggleAutoUpdate(!autoUpdateBcv)}>
                  <div className={`switch-track ${autoUpdateBcv ? 'active' : ''}`}>
                    <div className="switch-thumb" />
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Section 3: Parámetros del sistema (Image 3) */}
          <Card>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                Parámetros del sistema
              </h3>
              <span className="muted small">
                Moneda, alertas de inventario y plantilla de ticket
              </span>
            </div>

            <div className="form-grid">
              <div className="field">
                <label>Moneda principal</label>
                <select
                  className="input"
                  value={mainCurrency}
                  onChange={(e) => setMainCurrency(e.target.value)}
                >
                  <option value="VES">Bolívares (VES)</option>
                  <option value="USD">Dólar (USD)</option>
                </select>
              </div>

              <div className="field">
                <label>Alerta de stock global</label>
                <input
                  type="number"
                  className="input"
                  value={stockAlert}
                  onChange={(e) => setStockAlert(parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="field full">
                <label>Mensaje al pie del ticket</label>
                <textarea
                  className="input"
                  style={{ height: 80, padding: 12, resize: 'vertical' }}
                  value={ticketFooter}
                  onChange={(e) => setTicketFooter(e.target.value)}
                />
              </div>
            </div>
          </Card>

        </div>
      )}

      {/* Tab 2: Usuarios asociados (Image 4) */}
      {activeTab === 'usuarios' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Action Toolbar */}
          <Card>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 280 }}>
                <Button
                  variant="primary"
                  disabled
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em' }}
                >
                  <Plus size={15} /> GESTIÓN EN SUPABASE
                </Button>
                
                <Button
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, background: '#fff', color: '#5f6572', borderColor: '#d1d5db' }}
                  disabled
                >
                  <RefreshCw size={13} /> Sin sincronización
                </Button>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="search" style={{ width: 260, marginBottom: 0 }}>
                  <Search size={14} />
                  <input
                    className="input"
                    style={{ height: 36, fontSize: 12 }}
                    placeholder="Buscar usuario asociado o correo..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                </div>

                <Badge tone="brand">
                  Total usuarios asociados: {users.length}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Associated Users Roster List */}
          {filteredUsers.length === 0 ? (
            <Card className="empty">
              No se encontraron usuarios asociados registrados con esos criterios.
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
              {filteredUsers.map((item) => (
                <div key={item.id} className="associated-user-card">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {/* User Profile Avatar */}
                    <div
                      className="avatar"
                      style={{
                        width: 44,
                        height: 44,
                        fontSize: 14,
                        fontWeight: 700,
                        background: '#e0ebff',
                        color: 'var(--brand-700)',
                        border: '1px solid #c2dbff'
                      }}
                    >
                      {item.initials}
                    </div>

                    {/* Roster detail */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <b style={{ textTransform: 'capitalize', fontSize: 14, color: 'var(--text)' }}>
                          {item.name}
                        </b>
                        <Badge tone="brand">
                          {item.role}
                        </Badge>
                      </div>

                      {/* Active switch inside card (as in Image 4) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
                        <div className="switch-container" onClick={() => toggleUserStatus(item.id)}>
                          <div className={`switch-track ${item.active ? 'active' : ''}`} style={{ width: 30, height: 16 }}>
                            <div className="switch-thumb" style={{ width: 10, height: 10, top: 3, left: 3 }} />
                          </div>
                        </div>
                        <span className="muted small" style={{ fontSize: 11 }}>
                          {item.active ? 'Activo' : 'Inactivo'} • {item.title}
                        </span>
                      </div>

                      <span className="muted small" style={{ fontSize: 11, color: '#9298a5' }}>
                        {item.email}
                      </span>
                    </div>
                  </div>

                  {/* Actions column on right side */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      title="Permisos y seguridad"
                      style={{ background: 'transparent', border: 'none', color: '#9298a5', cursor: 'pointer', padding: 6 }}
                      onClick={() => showNotification(`Permisos de ${item.name} actualizados de forma segura.`, 'info')}
                    >
                      <Shield size={16} />
                    </button>
                    <button
                      title="Editar usuario"
                      style={{ background: 'transparent', border: 'none', color: '#9298a5', cursor: 'pointer', padding: 6 }}
                      onClick={() => {
                        setNewUserName(item.name);
                        setNewUserEmail(item.email);
                        setNewUserRole(item.role);
                        setNewUserTitle(item.title);
                        setNewUserActive(item.active);
                        setIsAddUserModalOpen(true);
                      }}
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      title="Eliminar asociado"
                      style={{ background: 'transparent', border: 'none', color: '#e36f6f', cursor: 'pointer', padding: 6 }}
                      onClick={() => handleDeleteUser(item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add User Modal Dialog */}
          {isAddUserModalOpen && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(3px)',
                display: 'grid',
                placeItems: 'center',
                zIndex: 1000,
                padding: 16
              }}
            >
              <div className="card" style={{ width: '100%', maxWidth: 440, padding: 24, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    Agregar Usuario Asociado
                  </h3>
                  <span className="muted small">
                    Registra personal, gerentes o administradores asociados al negocio.
                  </span>
                </div>

                <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="field">
                    <label>Nombre Completo *</label>
                    <input
                      className="input"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="Nombre completo"
                      required
                    />
                  </div>

                  <div className="field">
                    <label>Correo Electrónico *</label>
                    <input
                      type="email"
                      className="input"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="ejemplo@correo.com"
                      required
                    />
                  </div>

                  <div className="field">
                    <label>Rol Empresarial</label>
                    <select
                      className="input"
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                    >
                      <option value="PROPIETARIO">Propietario</option>
                      <option value="GERENTE">Gerente</option>
                      <option value="ADMINISTRADOR">Administrador</option>
                      <option value="CAJERO">Cajero / POS</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>Cargo / Cargo público</label>
                    <input
                      className="input"
                      value={newUserTitle}
                      onChange={(e) => setNewUserTitle(e.target.value)}
                      placeholder="Ej: Gerente, Supervisor, etc."
                    />
                  </div>

                  <div className="field" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
                    <div className="switch-container" onClick={() => setNewUserActive(!newUserActive)}>
                      <div className={`switch-track ${newUserActive ? 'active' : ''}`}>
                        <div className="switch-thumb" />
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Estatus de cuenta Activo</span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                    <Button
                      type="button"
                      style={{ background: '#fff', color: '#5f6572', borderColor: '#d1d5db' }}
                      onClick={() => setIsAddUserModalOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" variant="primary">
                      Agregar Asociado
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Auditoría (Auditoría y Control de Cuentas Bancarias) */}
      {activeTab === 'auditoria' && (() => {
        const activeList = auditAccounts.filter(a => a.status !== 'Inactivo' && a.status !== 'Papelera');
        const inactiveList = auditAccounts.filter(a => a.status === 'Inactivo' || a.status === 'Papelera');
        const displayedList = (auditFolder === 'activas' ? activeList : inactiveList).filter(a => {
          if (!auditSearch.trim()) return true;
          const q = auditSearch.toLowerCase();
          return a.bank_name.toLowerCase().includes(q) || a.account_number.toLowerCase().includes(q) || a.currency.toLowerCase().includes(q);
        });

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Card */}
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building size={18} style={{ color: '#7c3aed' }} /> Auditoría de Cuentas Bancarias
                  </h3>
                  <span className="muted small" style={{ fontSize: 12 }}>
                    Supervisión y control del estado operativo de cuentas activas e inactivas.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Selector Cuentas Activas / Inactivas */}
                  <button
                    onClick={() => setAuditFolder('activas')}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 8,
                      border: '1px solid #7c3aed',
                      background: auditFolder === 'activas' ? '#7c3aed' : '#fff',
                      color: auditFolder === 'activas' ? '#fff' : '#7c3aed',
                      fontSize: 12,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      boxShadow: auditFolder === 'activas' ? '0 2px 8px rgba(124,58,237,0.3)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Building size={15} />
                    <span>Cuentas activas ({activeList.length})</span>
                  </button>

                  <button
                    onClick={() => setAuditFolder('inactivas')}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 8,
                      border: '1px solid #7c3aed',
                      background: auditFolder === 'inactivas' ? '#7c3aed' : '#fff',
                      color: auditFolder === 'inactivas' ? '#fff' : '#7c3aed',
                      fontSize: 12,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      boxShadow: auditFolder === 'inactivas' ? '0 2px 8px rgba(124,58,237,0.3)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FolderArchive size={15} />
                    <span>Cuentas inactivas ({inactiveList.length})</span>
                  </button>

                  <button
                    onClick={loadAuditAccounts}
                    style={{
                      height: 36,
                      padding: '0 14px',
                      borderRadius: 8,
                      border: '1px solid #7c3aed',
                      background: '#fff',
                      color: '#7c3aed',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={13} className={isAuditLoading ? 'animate-spin' : ''} />
                    <span>Sincronizar</span>
                  </button>
                </div>
              </div>
            </Card>

            {/* Search toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', width: 280 }}>
                <Search size={14} style={{ color: '#94a3b8' }} />
                <input
                  placeholder={`Buscar en ${auditFolder === 'activas' ? 'activas' : 'inactivas'}...`}
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, width: '100%' }}
                />
                {auditSearch && (
                  <button onClick={() => setAuditSearch('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#94a3b8' }}>
                    <X size={12} />
                  </button>
                )}
              </div>

              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                Mostrando <b>{displayedList.length}</b> {auditFolder === 'activas' ? 'cuentas activas' : 'cuentas inactivas'}
              </span>
            </div>

            {/* List / Table of Accounts */}
            {displayedList.length === 0 ? (
              <Card>
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                  {auditFolder === 'activas' ? (
                    <Building size={36} strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.5 }} />
                  ) : (
                    <FolderArchive size={36} strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.5 }} />
                  )}
                  <p style={{ margin: 0, fontWeight: 700, color: '#334155' }}>
                    {auditFolder === 'activas' ? 'No hay cuentas activas registradas.' : 'No hay cuentas inactivas.'}
                  </p>
                </div>
              </Card>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrap" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#0a2540', color: '#fff' }}>
                        <th style={{ color: '#fff', fontSize: 11 }}>BANCO / NOMBRE</th>
                        <th style={{ color: '#fff', fontSize: 11 }}>NÚMERO DE CUENTA</th>
                        <th style={{ color: '#fff', fontSize: 11 }}>TIPO</th>
                        <th style={{ color: '#fff', fontSize: 11 }}>MONEDA</th>
                        <th style={{ color: '#fff', fontSize: 11, textAlign: 'right' }}>SALDO</th>
                        <th style={{ color: '#fff', fontSize: 11, textAlign: 'center' }}>ESTADO</th>
                        <th style={{ color: '#fff', fontSize: 11, textAlign: 'right' }}>ACCIONES DE AUDITORÍA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedList.map(acc => {
                        const isVES = acc.currency === 'VES';
                        const isInactive = acc.status === 'Inactivo' || acc.status === 'Papelera';
                        return (
                          <tr key={acc.id}>
                            <td>
                              <div style={{ fontWeight: 800, color: '#0f172a' }}>{acc.bank_name}</div>
                            </td>
                            <td>
                              <span className="muted small" style={{ fontFamily: 'monospace', fontSize: 12 }}>{acc.account_number}</span>
                            </td>
                            <td>{acc.account_type}</td>
                            <td>
                              <Badge tone="brand">{acc.currency}</Badge>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                              {isVES ? formatVES(acc.balance) : formatUSD(acc.balance, '$ ')}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 800,
                                  background: isInactive ? '#f1f5f9' : '#ecfdf5',
                                  color: isInactive ? '#64748b' : '#047857',
                                  border: isInactive ? '1px solid #cbd5e1' : '1px solid #a7f3d0'
                                }}
                              >
                                {isInactive ? 'Inactiva' : 'Activa'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {isInactive ? (
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                  <button
                                    onClick={() => setAuditConfirmModal({ isOpen: true, account: acc, action: 'reactivar' })}
                                    style={{
                                      background: '#7c3aed',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: 6,
                                      padding: '5px 12px',
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }}
                                  >
                                    <Check size={12} /> Reactivar
                                  </button>

                                  <button
                                    onClick={() => setAuditConfirmModal({ isOpen: true, account: acc, action: 'eliminar_permanente' })}
                                    style={{
                                      background: '#fff',
                                      color: '#b91c1c',
                                      border: '1px solid #fecaca',
                                      borderRadius: 6,
                                      padding: '5px 10px',
                                      fontSize: 11,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }}
                                  >
                                    <Trash2 size={12} /> Eliminar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setAuditConfirmModal({ isOpen: true, account: acc, action: 'inactivar' })}
                                  style={{
                                    background: '#fff',
                                    color: '#64748b',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 6,
                                    padding: '5px 12px',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  Inactivar
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal de confirmación de Auditoría */}
            {auditConfirmModal.isOpen && auditConfirmModal.account && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(15,23,42,0.6)',
                  backdropFilter: 'blur(4px)',
                  display: 'grid',
                  placeItems: 'center',
                  zIndex: 1200,
                  padding: 16
                }}
              >
                <div className="card" style={{ width: '100%', maxWidth: 440, padding: 0, background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
                  <div
                    style={{
                      padding: '16px 20px',
                      background: auditConfirmModal.action === 'eliminar_permanente' ? '#dc2626' : '#7c3aed',
                      color: '#fff',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={18} style={{ color: '#fff' }} />
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', color: 'white' }}>
                        {auditConfirmModal.action === 'inactivar' && 'Inactivar Cuenta'}
                        {auditConfirmModal.action === 'reactivar' && 'Reactivar Cuenta'}
                        {auditConfirmModal.action === 'eliminar_permanente' && 'Eliminar Definitivamente'}
                      </h3>
                    </div>
                    <button
                      onClick={() => setAuditConfirmModal({ isOpen: false, account: null, action: 'inactivar' })}
                      style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                        {auditConfirmModal.account.bank_name}
                      </h4>
                      <span className="muted small" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                        {auditConfirmModal.account.currency} • {auditConfirmModal.account.account_number}
                      </span>
                    </div>

                    <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                      {auditConfirmModal.action === 'inactivar' &&
                        '¿Deseas inactivar esta cuenta? Se ocultará del módulo de operaciones de finanzas y ventas.'}
                      {auditConfirmModal.action === 'reactivar' &&
                        '¿Deseas reactivar esta cuenta para que vuelva a estar disponible en operaciones?'}
                      {auditConfirmModal.action === 'eliminar_permanente' &&
                        '¿Estás seguro de eliminar permanentemente esta cuenta de Supabase? Esta operación es irreversible.'}
                    </p>

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                      <button
                        type="button"
                        onClick={() => setAuditConfirmModal({ isOpen: false, account: null, action: 'inactivar' })}
                        style={{ height: 36, padding: '0 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>

                      <button
                        type="button"
                        onClick={handleExecuteAuditAction}
                        style={{
                          height: 36,
                          padding: '0 16px',
                          borderRadius: 6,
                          background: auditConfirmModal.action === 'eliminar_permanente' ? '#dc2626' : '#7c3aed',
                          color: '#fff',
                          border: 'none',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {auditConfirmModal.action === 'inactivar' && 'Sí, Inactivar'}
                        {auditConfirmModal.action === 'reactivar' && 'Sí, Reactivar'}
                        {auditConfirmModal.action === 'eliminar_permanente' && 'Sí, Eliminar de Supabase'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
