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
  CreditCard,
  Database,
  MapPin,
  Phone,
  Monitor,
  Copy
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { getActiveExchangeRate, setActiveExchangeRate, formatUSD, formatVES } from '../../../lib/currency';
import { authenticatedFetch } from '../../../lib/supabase/api';
import { isSupabaseConfigured, SUPABASE_URL } from '../../../lib/supabase/client';
import { SupabaseConnectionModal } from '../../../components/modals/SupabaseConnectionModal';
import { getBusinessProfile, saveBusinessProfile } from '../../../lib/businessProfile';
import {
  DbBranch,
  fetchBranchesFromSupabase,
  createBranchInSupabase,
  updateBranchInSupabase,
  deleteBranchFromSupabase
} from '../../../lib/supabase/db';

interface AssociatedUser {
  id: string | number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  title: string;
  initials: string;
  permissions?: string[];
  created_at?: string;
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
  const [activeTab, setActiveTab] = useState<'negocio' | 'almacen' | 'usuarios' | 'auditoria'>('negocio');
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);

  // --- SEDES Y ALMACENES (BRANCHES) STATE ---
  const [branches, setBranches] = useState<DbBranch[]>([]);
  const [isBranchesLoading, setIsBranchesLoading] = useState(false);
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<DbBranch | null>(null);

  // Form state
  const [branchCode, setBranchCode] = useState('SUC-01');
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('+58 412-5043857');
  const [branchStatus, setBranchStatus] = useState<'Habilitada' | 'Deshabilitada'>('Habilitada');
  const [isSavingBranch, setIsSavingBranch] = useState(false);
  const [isBranchSqlModalOpen, setIsBranchSqlModalOpen] = useState(false);
  const [isCopiedBranchSql, setIsCopiedBranchSql] = useState(false);

  // Delete branch modal
  const [branchToDelete, setBranchToDelete] = useState<DbBranch | null>(null);

  // Manage cash registers modal
  const [managingBranchCajas, setManagingBranchCajas] = useState<DbBranch | null>(null);
  const [newCajasCount, setNewCajasCount] = useState<number>(0);

  const loadBranches = async () => {
    setIsBranchesLoading(true);
    try {
      const data = await fetchBranchesFromSupabase();
      setBranches(data);
    } catch {
      // ignore
    } finally {
      setIsBranchesLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const handleOpenNewBranch = () => {
    setEditingBranch(null);
    const nextNum = branches.length + 1;
    setBranchCode(`SUC-${nextNum.toString().padStart(2, '0')}`);
    setBranchName('');
    setBranchAddress('');
    setBranchPhone('+58 412-5043857');
    setBranchStatus('Habilitada');
    setIsBranchModalOpen(true);
  };

  const handleOpenEditBranch = (b: DbBranch) => {
    setEditingBranch(b);
    setBranchCode(b.code);
    setBranchName(b.name);
    setBranchAddress(b.address || '');
    setBranchPhone(b.phone || '');
    setBranchStatus(b.status === 'Deshabilitada' ? 'Deshabilitada' : 'Habilitada');
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) {
      showNotification('Ingrese el nombre de la sede o almacén.', 'info');
      return;
    }

    setIsSavingBranch(true);
    try {
      if (editingBranch && editingBranch.id) {
        const res = await updateBranchInSupabase(editingBranch.id, {
          code: branchCode.trim(),
          name: branchName.trim(),
          address: branchAddress.trim(),
          phone: branchPhone.trim(),
          status: branchStatus,
          is_active: branchStatus === 'Habilitada'
        });
        if (res.success) {
          showNotification(`Sede "${branchName.trim()}" actualizada con éxito.`);
          await loadBranches();
          setIsBranchModalOpen(false);
        } else {
          showNotification(`Error: ${res.error || 'No se pudo actualizar'}`, 'info');
        }
      } else {
        const res = await createBranchInSupabase({
          code: branchCode.trim(),
          name: branchName.trim(),
          address: branchAddress.trim(),
          phone: branchPhone.trim(),
          status: branchStatus,
          is_active: branchStatus === 'Habilitada',
          cash_registers: 0
        });
        if (res.success) {
          showNotification(`Sede "${branchName.trim()}" guardada exitosamente.`);
          await loadBranches();
          setIsBranchModalOpen(false);
        } else {
          showNotification(`Error: ${res.error || 'No se pudo guardar'}`, 'info');
        }
      }
    } catch {
      showNotification('Error al procesar la operación.', 'info');
    } finally {
      setIsSavingBranch(false);
    }
  };

  const handleDeleteBranchConfirm = async () => {
    if (!branchToDelete || !branchToDelete.id) return;
    try {
      const res = await deleteBranchFromSupabase(branchToDelete.id);
      if (res.success) {
        showNotification(`Sede "${branchToDelete.name}" eliminada.`);
        await loadBranches();
      } else {
        showNotification(`Error: ${res.error || 'No se pudo eliminar'}`, 'info');
      }
    } catch {
      showNotification('Error eliminando la sede.', 'info');
    } finally {
      setBranchToDelete(null);
    }
  };

  const handleUpdateCajas = async () => {
    if (!managingBranchCajas || !managingBranchCajas.id) return;
    try {
      await updateBranchInSupabase(managingBranchCajas.id, {
        cash_registers: Math.max(0, newCajasCount)
      });
      showNotification(`Terminales de "${managingBranchCajas.name}" actualizados.`);
      await loadBranches();
    } catch {
      showNotification('Error al actualizar cajas.', 'info');
    } finally {
      setManagingBranchCajas(null);
    }
  };

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
  const initialProfile = getBusinessProfile();
  const [businessName, setBusinessName] = useState(initialProfile.businessName);
  const [rif, setRif] = useState(initialProfile.rif);
  const [email, setEmail] = useState(initialProfile.email);
  const [address, setAddress] = useState(initialProfile.address);
  const [phone, setPhone] = useState(initialProfile.phone);
  const [whatsapp, setWhatsapp] = useState(initialProfile.whatsapp);
  const [logo, setLogo] = useState<string | null>(initialProfile.logo);
  const [favicon, setFavicon] = useState<string | null>(initialProfile.favicon);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogo(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFavicon(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveBusiness = (e: React.FormEvent) => {
    e.preventDefault();
    saveBusinessProfile({
      businessName,
      rif,
      email,
      address,
      phone,
      whatsapp,
      logo,
      favicon
    });
    showNotification('Identidad y datos fiscales guardados y aplicados en facturas, notas, ecommerce y otros.');
  };

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

  // --- ASSOCIATED USERS & RBAC STATE ---
  const [users, setUsers] = useState<AssociatedUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | number | null>(null);

  // Add / Edit User Form State
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'Admin' | 'Manager' | 'Cashier' | 'Viewer'>('Cashier');
  const [newUserTitle, setNewUserTitle] = useState('Cajero Principal');
  const [newUserActive, setNewUserActive] = useState(true);
  const [newUserPermissions, setNewUserPermissions] = useState<string[]>(['ventas']);
  const [isSavingUser, setIsSavingUser] = useState(false);

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

  // --- ASSOCIATED USERS & RBAC FUNCTIONS ---
  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setUsers(json.data);
        }
      }
    } catch (err) {
      console.warn('Aviso cargando usuarios asociados:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = (role: 'Admin' | 'Manager' | 'Cashier' | 'Viewer') => {
    setNewUserRole(role);
    if (role === 'Admin') {
      setNewUserPermissions(['ventas', 'inventario', 'finanzas', 'reportes', 'usuarios']);
      if (!newUserName) setNewUserTitle('Administrador General');
    } else if (role === 'Manager') {
      setNewUserPermissions(['ventas', 'inventario', 'reportes']);
      if (!newUserName) setNewUserTitle('Gerente de Operaciones');
    } else if (role === 'Cashier') {
      setNewUserPermissions(['ventas']);
      if (!newUserName) setNewUserTitle('Cajero Principal');
    } else if (role === 'Viewer') {
      setNewUserPermissions(['reportes']);
      if (!newUserName) setNewUserTitle('Auditor de Gestión');
    }
  };

  const togglePermission = (permKey: string) => {
    setNewUserPermissions(prev =>
      prev.includes(permKey) ? prev.filter(p => p !== permKey) : [...prev, permKey]
    );
  };

  const toggleUserStatus = async (id: string | number) => {
    try {
      const res = await fetch(`/api/users/${id}/toggle-status`, { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setUsers(prev => prev.map(u => String(u.id) === String(id) ? { ...u, active: json.active } : u));
          showNotification(`Estado de usuario actualizado: ${json.active ? 'Activo' : 'Inactivo'}.`);
          return;
        }
      }
      throw new Error('No se pudo actualizar');
    } catch {
      showNotification('Error al alternar el estatus del usuario.', 'info');
    }
  };

  const handleDeleteUser = async (id: string | number) => {
    if (!window.confirm('¿Está seguro de que desea eliminar este usuario asociado?')) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setUsers(prev => prev.filter(u => String(u.id) !== String(id)));
        showNotification('Usuario eliminado exitosamente.');
      } else {
        throw new Error('Error al eliminar');
      }
    } catch {
      showNotification('No se pudo eliminar el usuario.', 'info');
    }
  };

  const handleOpenAddUser = () => {
    setEditingUserId(null);
    setNewUserName('');
    setNewUserEmail('');
    setNewUserRole('Cashier');
    setNewUserTitle('Cajero Principal');
    setNewUserActive(true);
    setNewUserPermissions(['ventas']);
    setIsAddUserModalOpen(true);
  };

  const handleOpenEditUser = (user: AssociatedUser) => {
    setEditingUserId(user.id);
    setNewUserName(user.name);
    setNewUserEmail(user.email);
    setNewUserRole((user.role as any) || 'Cashier');
    setNewUserTitle(user.title || '');
    setNewUserActive(user.active);
    setNewUserPermissions(user.permissions && user.permissions.length > 0 ? user.permissions : ['ventas']);
    setIsAddUserModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) {
      showNotification('Por favor ingrese el nombre y correo del usuario.', 'info');
      return;
    }

    setIsSavingUser(true);
    try {
      if (editingUserId) {
        // Actualizar usuario existente
        const res = await fetch(`/api/users/${editingUserId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newUserName.trim(),
            email: newUserEmail.trim(),
            role: newUserRole,
            title: newUserTitle.trim(),
            active: newUserActive,
            permissions: newUserPermissions
          })
        });
        const json = await res.json();
        if (json.success && json.data) {
          setUsers(prev => prev.map(u => String(u.id) === String(editingUserId) ? json.data : u));
          showNotification(`Usuario ${newUserName} actualizado correctamente.`);
          setIsAddUserModalOpen(false);
        } else {
          showNotification(json.error || 'Error al actualizar usuario.', 'info');
        }
      } else {
        // Crear nuevo usuario asociado
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newUserName.trim(),
            email: newUserEmail.trim(),
            role: newUserRole,
            title: newUserTitle.trim(),
            active: newUserActive,
            permissions: newUserPermissions
          })
        });
        const json = await res.json();
        if (json.success && json.data) {
          setUsers(prev => [json.data, ...prev]);
          showNotification(`Usuario ${newUserName} registrado exitosamente con rol ${newUserRole}.`);
          setIsAddUserModalOpen(false);
        } else {
          showNotification(json.error || 'Error al registrar usuario.', 'info');
        }
      }
    } catch {
      showNotification('Error de conexión al procesar el usuario.', 'info');
    } finally {
      setIsSavingUser(false);
    }
  };

  const filteredUsers = users.filter(
    u => (u.name || '').toLowerCase().includes(userSearch.toLowerCase()) || (u.email || '').toLowerCase().includes(userSearch.toLowerCase())
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
          onClick={() => {
            setActiveTab('almacen');
            loadBranches();
          }}
          className={`config-tab-btn ${activeTab === 'almacen' ? 'active' : ''}`}
        >
          Almacén
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
          
          {/* Section 1: Identidad y datos fiscales */}
          <Card>
            <form onSubmit={handleSaveBusiness}>
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
                  <div className="upload-slot" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="preview-box" style={{ width: 60, height: 60, border: '1px solid var(--border)', borderRadius: 8, display: 'grid', placeItems: 'center', overflow: 'hidden', background: '#fafbfc' }}>
                      {logo ? (
                        <img src={logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span className="muted" style={{ fontSize: 11 }}>Logo</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input
                        type="file"
                        accept="image/*"
                        id="logo-upload-input"
                        style={{ display: 'none' }}
                        onChange={handleLogoUpload}
                      />
                      <Button
                        type="button"
                        variant="primary"
                        style={{ background: '#fff', color: '#5f6572', borderColor: '#d1d5db', height: 34, fontSize: 11 }}
                        onClick={() => document.getElementById('logo-upload-input')?.click()}
                      >
                        <Upload size={12} /> {logo ? 'Cambiar imagen' : 'Subir imagen'}
                      </Button>
                      {logo && (
                        <button
                          type="button"
                          onClick={() => setLogo(null)}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: 0 }}
                        >
                          Quitar imagen
                        </button>
                      )}
                    </div>
                  </div>
                  <span className="muted small" style={{ fontSize: 11, marginTop: 4 }}>
                    Se usa en facturas, tickets y en la tienda. PNG o JPG.
                  </span>
                </div>

                {/* Favicon upload slot */}
                <div className="field">
                  <label>Favicon</label>
                  <div className="upload-slot" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="preview-box" style={{ width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 8, display: 'grid', placeItems: 'center', overflow: 'hidden', background: '#fafbfc' }}>
                      {favicon ? (
                        <img src={favicon} alt="Favicon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span className="muted" style={{ fontSize: 11 }}>64x64</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input
                        type="file"
                        accept="image/*"
                        id="favicon-upload-input"
                        style={{ display: 'none' }}
                        onChange={handleFaviconUpload}
                      />
                      <Button
                        type="button"
                        variant="primary"
                        style={{ background: '#fff', color: '#5f6572', borderColor: '#d1d5db', height: 34, fontSize: 11 }}
                        onClick={() => document.getElementById('favicon-upload-input')?.click()}
                      >
                        <Upload size={12} /> {favicon ? 'Cambiar ícono' : 'Subir ícono'}
                      </Button>
                      {favicon && (
                        <button
                          type="button"
                          onClick={() => setFavicon(null)}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: 0 }}
                        >
                          Quitar ícono
                        </button>
                      )}
                    </div>
                  </div>
                  <span className="muted small" style={{ fontSize: 11, marginTop: 4 }}>
                    Ícono de la pestaña del navegador. Cuadrado, 64x64 px.
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 20px' }}>
                  <Save size={16} /> Guardar
                </Button>
              </div>
            </form>
          </Card>

          {/* Section 2: Tasa de Cambio Diaria (Image 2) */}
          <div>
            {/* Dark Blue Active Rate Card */}
            <div className="rate-display-card" style={{ backgroundColor: '#7e22ce' }}>
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

      {/* Tab: Almacén y Sedes (Matching Image 2) */}
      {activeTab === 'almacen' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Header matching Image 2 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ color: '#0066f5', marginTop: 2 }}>
                <MapPin size={22} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                    SEDES Y TERMINALES (PUNTOS DE VENTA)
                  </h2>
                  <span
                    style={{
                      background: '#ecfdf5',
                      color: '#059669',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid #a7f3d0',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Database size={11} /> Supabase Real-Time
                  </span>
                </div>
                <p style={{ margin: '3px 0 0 0', color: '#64748b', fontSize: 13 }}>
                  Gestión y persistencia de sucursales físicas y almacenes en tiempo real en la tabla <code>branches</code>
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={loadBranches}
                disabled={isBranchesLoading}
                style={{
                  background: '#f8fafc',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
                title="Sincronizar sedes en tiempo real desde Supabase"
              >
                <RefreshCw size={14} className={isBranchesLoading ? 'animate-spin' : ''} /> Sincronizar
              </button>

              <button
                type="button"
                onClick={() => setIsBranchSqlModalOpen(true)}
                style={{
                  background: '#f8fafc',
                  color: '#0284c7',
                  border: '1px solid #bae6fd',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
                title="Ver script SQL de permisos RLS para la tabla branches en Supabase"
              >
                <Database size={14} /> Permisos SQL
              </button>

              <button
                onClick={handleOpenNewBranch}
                style={{
                  background: 'var(--brand-500)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                <Plus size={16} strokeWidth={2.5} /> Agregar Sede
              </button>
            </div>
          </div>

          {/* Cards Grid matching Image 2 */}
          {isBranchesLoading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px auto' }} />
              <span>Cargando sedes y almacenes...</span>
            </div>
          ) : branches.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                <MapPin size={36} style={{ color: '#94a3b8', margin: '0 auto 12px auto' }} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                  No hay sedes o almacenes registrados
                </h3>
                <p style={{ margin: '6px 0 16px 0', fontSize: 13, color: '#64748b' }}>
                  Comienza agregando tu primera sucursal física o almacén de inventario.
                </p>
                <button
                  onClick={handleOpenNewBranch}
                  style={{
                    background: 'var(--brand-500)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  + Agregar Sede
                </button>
              </div>
            </Card>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
                gap: 16
              }}
            >
              {branches.map((b) => (
                <div
                  key={b.id || b.code}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {/* Top: Code & Badge */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {b.code}
                      </span>
                      <span
                        style={{
                          background: b.status === 'Deshabilitada' ? '#f1f5f9' : '#e0f2fe',
                          color: b.status === 'Deshabilitada' ? '#64748b' : '#0284c7',
                          padding: '3px 10px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700
                        }}
                      >
                        {b.status || 'Habilitada'}
                      </span>
                    </div>

                    {/* Sede Name */}
                    <h3 style={{ margin: '2px 0 6px 0', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                      {b.name}
                    </h3>

                    {/* Address */}
                    {b.address && (
                      <p style={{ margin: '0 0 6px 0', fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                        {b.address}
                      </p>
                    )}

                    {/* Phone */}
                    {b.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                        <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center' }}>
                          <Phone size={13} fill="#ef4444" />
                        </span>
                        <span style={{ fontWeight: 500 }}>{b.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Divider and Footer */}
                  <div
                    style={{
                      borderTop: '1px solid #f1f5f9',
                      paddingTop: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    {/* Gestionar Cajas */}
                    <button
                      type="button"
                      onClick={() => {
                        setManagingBranchCajas(b);
                        setNewCajasCount(b.cash_registers || 0);
                      }}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                        padding: '6px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#0284c7',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer'
                      }}
                    >
                      <Monitor size={14} style={{ color: '#0284c7' }} />
                      Gestionar Cajas ({b.cash_registers || 0})
                    </button>

                    {/* Action icons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEditBranch(b)}
                        title="Editar Sede"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: 5,
                          borderRadius: 6,
                          display: 'grid',
                          placeItems: 'center'
                        }}
                      >
                        <Edit2 size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setBranchToDelete(b)}
                        title="Eliminar Sede"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: 5,
                          borderRadius: 6,
                          display: 'grid',
                          placeItems: 'center'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Modal Crear / Editar Sede (Image 1) */}
          {isBranchModalOpen && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(15,23,42,0.5)',
                backdropFilter: 'blur(4px)',
                display: 'grid',
                placeItems: 'center',
                zIndex: 1100,
                padding: 16
              }}
            >
              <div
                className="card"
                style={{
                  width: '100%',
                  maxWidth: 480,
                  padding: 0,
                  background: '#fff',
                  borderRadius: 12,
                  overflow: 'hidden',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                  border: '1px solid #e2e8f0'
                }}
              >
                {/* Header */}
                <div
                  style={{
                    padding: '18px 24px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#f8fafc'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: '#eff6ff',
                        color: '#0066f5',
                        display: 'grid',
                        placeItems: 'center'
                      }}
                    >
                      <MapPin size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                        {editingBranch ? 'Editar Sede o Almacén' : 'Nueva Sede'}
                      </h3>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        Complete la información de la sede física o almacén
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsBranchModalOpen(false)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      padding: 4
                    }}
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSaveBranch} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                        Código de la Sede
                      </label>
                      <input
                        className="input"
                        value={branchCode}
                        onChange={(e) => setBranchCode(e.target.value)}
                        placeholder="Ej. SUC-05"
                        style={{ fontWeight: 600 }}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                        Estado
                      </label>
                      <select
                        className="input"
                        value={branchStatus}
                        onChange={(e) => setBranchStatus(e.target.value as 'Habilitada' | 'Deshabilitada')}
                        style={{ fontWeight: 600 }}
                      >
                        <option value="Habilitada">Habilitada</option>
                        <option value="Deshabilitada">Deshabilitada</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Nombre de la Sede o Almacén *
                    </label>
                    <input
                      className="input"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      placeholder="Ej: Sede Principal, Almacén Central..."
                      autoFocus
                      required
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Dirección física
                    </label>
                    <input
                      className="input"
                      value={branchAddress}
                      onChange={(e) => setBranchAddress(e.target.value)}
                      placeholder="Ej: Carrera 7, Calle 20, Local 3..."
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Teléfono de contacto
                    </label>
                    <input
                      className="input"
                      value={branchPhone}
                      onChange={(e) => setBranchPhone(e.target.value)}
                      placeholder="Ej: 0412-5000101"
                    />
                  </div>

                  {/* Buttons */}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                    <button
                      type="button"
                      onClick={() => setIsBranchModalOpen(false)}
                      style={{
                        height: 38,
                        padding: '0 16px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#475569',
                        cursor: 'pointer'
                      }}
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      disabled={isSavingBranch}
                      style={{
                        height: 38,
                        padding: '0 20px',
                        borderRadius: 8,
                        border: 'none',
                        background: 'var(--brand-500)',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: isSavingBranch ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                      }}
                    >
                      {isSavingBranch ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" /> Guardando...
                        </>
                      ) : (
                        <>
                          <Check size={16} /> {editingBranch ? 'Actualizar Sede' : 'Guardar Sede'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Confirmar Eliminación de Sede */}
          {branchToDelete && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(15,23,42,0.5)',
                backdropFilter: 'blur(4px)',
                display: 'grid',
                placeItems: 'center',
                zIndex: 1100,
                padding: 16
              }}
            >
              <div
                className="card"
                style={{
                  width: '100%',
                  maxWidth: 420,
                  padding: 0,
                  background: '#fff',
                  borderRadius: 12,
                  overflow: 'hidden',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                }}
              >
                <div style={{ padding: '16px 20px', background: '#dc2626', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={18} />
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#fff' }}>
                      Eliminar Sede / Almacén
                    </h3>
                  </div>
                  <button
                    onClick={() => setBranchToDelete(null)}
                    style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div style={{ padding: 20 }}>
                  <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                    ¿Está seguro de que desea eliminar la sede <b>{branchToDelete.name}</b> ({branchToDelete.code})? Esta acción no se puede deshacer.
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                    <button
                      type="button"
                      onClick={() => setBranchToDelete(null)}
                      style={{ height: 36, padding: '0 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteBranchConfirm}
                      style={{ height: 36, padding: '0 16px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Sí, Eliminar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal Gestionar Cajas */}
          {managingBranchCajas && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(15,23,42,0.5)',
                backdropFilter: 'blur(4px)',
                display: 'grid',
                placeItems: 'center',
                zIndex: 1100,
                padding: 16
              }}
            >
              <div
                className="card"
                style={{
                  width: '100%',
                  maxWidth: 420,
                  padding: 0,
                  background: '#fff',
                  borderRadius: 12,
                  overflow: 'hidden',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                }}
              >
                <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Monitor size={18} style={{ color: '#0284c7' }} />
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                      Gestionar Cajas / Terminales POS
                    </h3>
                  </div>
                  <button
                    onClick={() => setManagingBranchCajas(null)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div style={{ padding: 20 }}>
                  <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748b' }}>
                    Defina la cantidad de cajas de cobro o terminales autorizados para <b>{managingBranchCajas.name}</b>:
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', margin: '16px 0' }}>
                    <button
                      type="button"
                      onClick={() => setNewCajasCount(Math.max(0, newCajasCount - 1))}
                      style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      className="input"
                      style={{ width: 100, textAlign: 'center', fontSize: 18, fontWeight: 800 }}
                      value={newCajasCount}
                      onChange={(e) => setNewCajasCount(Math.max(0, parseInt(e.target.value) || 0))}
                      min={0}
                    />
                    <button
                      type="button"
                      onClick={() => setNewCajasCount(newCajasCount + 1)}
                      style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                    <button
                      type="button"
                      onClick={() => setManagingBranchCajas(null)}
                      style={{ height: 36, padding: '0 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleUpdateCajas}
                      style={{ height: 36, padding: '0 16px', borderRadius: 6, background: '#0066f5', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Guardar Terminales
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal Permisos SQL Supabase (RLS para Sedes y Almacenes) */}
          {isBranchSqlModalOpen && (
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
              <div
                className="card"
                style={{
                  width: '100%',
                  maxWidth: 680,
                  maxHeight: '90vh',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: 0,
                  background: '#fff',
                  borderRadius: 14,
                  overflow: 'hidden',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                  border: '1px solid #e2e8f0'
                }}
              >
                <div
                  style={{
                    padding: '18px 24px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#f8fafc'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: '#eff6ff',
                        color: '#0066f5',
                        display: 'grid',
                        placeItems: 'center'
                      }}
                    >
                      <Database size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                        Permisos SQL de Sedes y Almacenes (Supabase RLS)
                      </h3>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        Script de base de datos para habilitar lectura y escritura en la tabla <code>public.branches</code>
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsBranchSqlModalOpen(false)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                    <b>Instrucciones:</b> Copia el siguiente código y ejecútalo en el <b>SQL Editor</b> de tu consola de Supabase. Este script asegura la tabla <code>branches</code>, hace opcional el <code>organization_id</code> y otorga permisos de lectura/escritura en tiempo real.
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const sqlScript = `-- ==============================================================================
-- FRENYER ERP — HABILITAR PERSISTENCIA DE SEDES EN SUPABASE (public.branches)
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de tu consola de Supabase:
-- https://knyqrwpaksawuxoqcayu.supabase.co

-- 1. Asegurar tabla y columnas de sedes y almacenes
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
    code TEXT NOT NULL DEFAULT 'SUC-01',
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'Habilitada',
    is_active BOOLEAN NOT NULL DEFAULT true,
    cash_registers INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Habilitada';
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS cash_registers INTEGER DEFAULT 0;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.branches ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.branches ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- 2. Habilitar y actualizar políticas de Row Level Security (RLS)
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_member_branches" ON public.branches;
DROP POLICY IF EXISTS "members read branches" ON public.branches;
DROP POLICY IF EXISTS "allow_all_branches" ON public.branches;
DROP POLICY IF EXISTS "authenticated_manage_branches" ON public.branches;
DROP POLICY IF EXISTS "authenticated_read_branches" ON public.branches;

CREATE POLICY "allow_all_branches"
    ON public.branches FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

GRANT ALL ON TABLE public.branches TO authenticated;
GRANT ALL ON TABLE public.branches TO anon;`;

                        navigator.clipboard.writeText(sqlScript);
                        setIsCopiedBranchSql(true);
                        setTimeout(() => setIsCopiedBranchSql(false), 2500);
                        showNotification('Script SQL copiado al portapapeles.');
                      }}
                      style={{
                        background: isCopiedBranchSql ? '#10b981' : 'var(--brand-500)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 16px',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer'
                      }}
                    >
                      {isCopiedBranchSql ? <Check size={14} /> : <Copy size={14} />}
                      {isCopiedBranchSql ? '¡Copiado!' : 'Copiar Código SQL'}
                    </button>
                  </div>

                  <pre
                    style={{
                      background: '#0f172a',
                      color: '#e2e8f0',
                      padding: 16,
                      borderRadius: 10,
                      fontSize: 11,
                      fontFamily: 'monospace',
                      lineHeight: 1.5,
                      overflowX: 'auto',
                      maxHeight: 260,
                      margin: 0
                    }}
                  >{`-- 1. Asegurar tabla y columnas de sedes y almacenes
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
    code TEXT NOT NULL DEFAULT 'SUC-01',
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'Habilitada',
    is_active BOOLEAN NOT NULL DEFAULT true,
    cash_registers INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.branches ALTER COLUMN organization_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- 2. Habilitar y actualizar políticas de Row Level Security (RLS)
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_member_branches" ON public.branches;
DROP POLICY IF EXISTS "members read branches" ON public.branches;
DROP POLICY IF EXISTS "allow_all_branches" ON public.branches;
DROP POLICY IF EXISTS "authenticated_manage_branches" ON public.branches;
DROP POLICY IF EXISTS "authenticated_read_branches" ON public.branches;

CREATE POLICY "allow_all_branches"
    ON public.branches FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

GRANT ALL ON TABLE public.branches TO authenticated;
GRANT ALL ON TABLE public.branches TO anon;`}</pre>
                </div>

                <div
                  style={{
                    padding: '12px 20px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#f8fafc'
                  }}
                >
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    Tras ejecutar el script, haz clic en "Sincronizar" en la pestaña de Almacén.
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsBranchSqlModalOpen(false)}
                    style={{
                      height: 34,
                      padding: '0 16px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}
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
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', background: '#7e22ce', borderColor: '#6b21a8' }}
                  onClick={handleOpenAddUser}
                >
                  <Plus size={15} /> Agregar Usuario
                </Button>
                
                <Button
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, background: '#fff', color: '#5f6572', borderColor: '#d1d5db', cursor: 'pointer' }}
                  onClick={fetchUsers}
                  disabled={isLoadingUsers}
                  title="Sincronizar lista de usuarios"
                >
                  <RefreshCw size={13} className={isLoadingUsers ? 'animate-spin' : ''} />
                  {isLoadingUsers ? 'Sincronizando...' : 'Sincronizar'}
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
              {isLoadingUsers ? 'Cargando usuarios asociados...' : 'No se encontraron usuarios asociados registrados con esos criterios.'}
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
              {filteredUsers.map((item) => {
                const roleColors: Record<string, { bg: string; border: string; text: string }> = {
                  Admin: { bg: '#faf5ff', border: '#e9d5ff', text: '#7e22ce' },
                  Manager: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
                  Cashier: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
                  Viewer: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569' }
                };
                const currentTone = roleColors[item.role] || roleColors.Viewer;
                const perms = item.permissions || ['ventas'];

                return (
                  <div
                    key={item.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      transition: 'border-color 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {/* User Profile Avatar */}
                        <div
                          className="avatar"
                          style={{
                            width: 44,
                            height: 44,
                            fontSize: 14,
                            fontWeight: 700,
                            background: '#f3e8ff',
                            color: '#7e22ce',
                            border: '1px solid #e9d5ff',
                            flexShrink: 0
                          }}
                        >
                          {item.initials}
                        </div>

                        {/* Roster detail */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <b style={{ textTransform: 'capitalize', fontSize: 14, color: 'var(--text)' }}>
                              {item.name}
                            </b>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 12,
                                background: currentTone.bg,
                                border: `1px solid ${currentTone.border}`,
                                color: currentTone.text
                              }}
                            >
                              {item.role}
                            </span>
                          </div>

                          <span className="muted small" style={{ fontSize: 11, color: '#64748b' }}>
                            {item.title || item.role}
                          </span>

                          <span className="muted small" style={{ fontSize: 11, color: '#9298a5' }}>
                            {item.email}
                          </span>
                        </div>
                      </div>

                      {/* Active switch inside card */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <div className="switch-container" onClick={() => toggleUserStatus(item.id)} title="Alternar estatus">
                          <div className={`switch-track ${item.active ? 'active' : ''}`} style={{ width: 30, height: 16 }}>
                            <div className="switch-thumb" style={{ width: 10, height: 10, top: 3, left: 3 }} />
                          </div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: item.active ? '#15803d' : '#94a3b8' }}>
                          {item.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </div>

                    {/* Permissions tags preview */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
                      {perms.includes('ventas') && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}>
                          Ventas/POS
                        </span>
                      )}
                      {perms.includes('inventario') && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}>
                          Inventario
                        </span>
                      )}
                      {perms.includes('finanzas') && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}>
                          Finanzas
                        </span>
                      )}
                      {perms.includes('reportes') && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569' }}>
                          Informes
                        </span>
                      )}
                      {perms.includes('usuarios') && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#faf5ff', border: '1px solid #e9d5ff', color: '#7e22ce' }}>
                          Usuarios
                        </span>
                      )}
                    </div>

                    {/* Actions bar at bottom */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid #f8fafc' }}>
                      <button
                        type="button"
                        style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          color: '#475569',
                          cursor: 'pointer',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        onClick={() => {
                          localStorage.setItem('frenyer_active_user', JSON.stringify(item));
                          window.dispatchEvent(new CustomEvent('frenyer:active-user-changed'));
                          showNotification(`Sesión activa cambiada a: ${item.name} (${item.role}). Los menús reflejarán sus permisos.`);
                        }}
                        title="Simular o activar sesión con este usuario para verificar sus permisos"
                      >
                        <Users size={12} /> Activar perfil
                      </button>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          title="Ver permisos asignados"
                          style={{ background: 'transparent', border: 'none', color: '#9298a5', cursor: 'pointer', padding: 6, borderRadius: 6 }}
                          onClick={() => showNotification(`Permisos de ${item.name}: ${perms.join(', ')}`, 'info')}
                        >
                          <Shield size={16} />
                        </button>
                        <button
                          title="Editar usuario"
                          style={{ background: 'transparent', border: 'none', color: '#7e22ce', cursor: 'pointer', padding: 6, borderRadius: 6 }}
                          onClick={() => handleOpenEditUser(item)}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          title="Eliminar asociado"
                          style={{ background: 'transparent', border: 'none', color: '#e36f6f', cursor: 'pointer', padding: 6, borderRadius: 6 }}
                          onClick={() => handleDeleteUser(item.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add / Edit User Modal Dialog (RBAC) */}
          {isAddUserModalOpen && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(4px)',
                display: 'grid',
                placeItems: 'center',
                zIndex: 1000,
                padding: 16
              }}
            >
              <div
                className="card"
                style={{
                  width: '100%',
                  maxWidth: 480,
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  padding: 24,
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                  background: '#ffffff'
                }}
              >
                <div style={{ marginBottom: 18, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                      {editingUserId ? 'Editar Usuario Asociado' : 'Agregar Usuario Asociado'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsAddUserModalOpen(false)}
                      style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <span className="muted small" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                    Configura las credenciales, rol y módulos accesibles en el sistema (RBAC).
                  </span>
                </div>

                <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Nombre Completo *</label>
                    <input
                      className="input"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="Ej: Carlos Pérez"
                      required
                    />
                  </div>

                  <div className="field">
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Correo Electrónico *</label>
                    <input
                      type="email"
                      className="input"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="usuario@empresa.com"
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="field">
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Rol en el Sistema *</label>
                      <select
                        className="input"
                        value={newUserRole}
                        onChange={(e) => handleRoleChange(e.target.value as any)}
                        style={{ fontWeight: 600 }}
                      >
                        <option value="Admin">Admin (Control Total)</option>
                        <option value="Manager">Manager (Gerente)</option>
                        <option value="Cashier">Cashier (Cajero / POS)</option>
                        <option value="Viewer">Viewer (Solo lectura)</option>
                      </select>
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Cargo / Puesto</label>
                      <input
                        className="input"
                        value={newUserTitle}
                        onChange={(e) => setNewUserTitle(e.target.value)}
                        placeholder="Ej: Cajero Principal"
                      />
                    </div>
                  </div>

                  {/* Permisos de Módulos (RBAC Granular) */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>
                        Permisos de Módulos
                      </span>
                      <span style={{ fontSize: 10, color: '#64748b' }}>
                        Selecciona los accesos permitidos
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      {[
                        { key: 'ventas', label: 'Acceso a Ventas/POS', desc: 'Punto de venta, pedidos y cotizaciones' },
                        { key: 'inventario', label: 'Acceso a Inventario', desc: 'Catálogo de productos, compras y movimientos' },
                        { key: 'finanzas', label: 'Acceso a Finanzas/Bancos', desc: 'Caja, cuentas bancarias, CxC, CxP y gastos' },
                        { key: 'reportes', label: 'Acceso a Informes de Gestión', desc: 'Salud de empresa y ganancias/pérdidas' },
                        { key: 'usuarios', label: 'Gestión de usuarios y permisos', desc: 'Configuración de asociados y parámetros' }
                      ].map((p) => {
                        const isChecked = newUserPermissions.includes(p.key);
                        return (
                          <label
                            key={p.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              cursor: 'pointer',
                              padding: '6px 8px',
                              borderRadius: 6,
                              background: isChecked ? '#f3e8ff' : '#ffffff',
                              border: isChecked ? '1px solid #d8b4fe' : '1px solid #e2e8f0',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => togglePermission(p.key)}
                              style={{ width: 16, height: 16, accentColor: '#7e22ce', cursor: 'pointer' }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: isChecked ? '#581c87' : '#334155' }}>
                                {p.label}
                              </span>
                              <span style={{ fontSize: 10, color: isChecked ? '#7e22ce' : '#64748b' }}>
                                {p.desc}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Switch Activo */}
                  <div className="field" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, margin: '4px 0' }}>
                    <div className="switch-container" onClick={() => setNewUserActive(!newUserActive)}>
                      <div className={`switch-track ${newUserActive ? 'active' : ''}`}>
                        <div className="switch-thumb" />
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                      Estatus de cuenta: <b>{newUserActive ? 'Activo' : 'Inactivo'}</b>
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                    <Button
                      type="button"
                      style={{ background: '#fff', color: '#5f6572', borderColor: '#d1d5db' }}
                      onClick={() => setIsAddUserModalOpen(false)}
                      disabled={isSavingUser}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isSavingUser}
                      style={{ background: '#7e22ce', borderColor: '#6b21a8' }}
                    >
                      {isSavingUser ? 'Guardando...' : (editingUserId ? 'Actualizar Usuario' : 'Guardar Usuario')}
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

      <SupabaseConnectionModal
        isOpen={isDbModalOpen}
        onClose={() => setIsDbModalOpen(false)}
        onConnected={() => loadRateHistory()}
      />
    </div>
  );
}
