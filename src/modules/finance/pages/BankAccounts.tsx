import React, { useState, useEffect } from 'react';
import { 
  Building, 
  Plus, 
  RefreshCw, 
  ArrowLeftRight, 
  MinusCircle, 
  PlusCircle, 
  Edit3, 
  Trash2, 
  Search, 
  X, 
  Check, 
  Shield, 
  Download, 
  AlertTriangle,
  FileText,
  CreditCard,
  ArrowLeft,
  FolderArchive
} from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { getActiveExchangeRate, convertUSDtoVES, formatUSD, formatVES } from '../../../lib/currency';
import {
  fetchBankAccountsFromSupabase,
  createBankAccountInSupabase,
  updateBankAccountInSupabase,
  deleteBankAccountInSupabase
} from '../../../lib/supabase/db';

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  currency: string;
  balance: number;
  status: string; // 'Activo' | 'Inactivo'
  created_at?: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  currency: string;
  type: string;
  bank_account_id: string | null;
  code?: string;
}

interface BankMovement {
  id: string;
  bank_account_id: string;
  type: 'ENTRADA' | 'SALIDA';
  concept: string;
  reference: string;
  user_name: string;
  rate: number;
  commission: number;
  commission_type: 'Fija' | 'Porcentual';
  amount: number;
  created_at: string;
}

export function BankAccountsPage() {
  // Active User Role state (Cuentas activas/inactivas selector solo visible para Gerente General)
  const [userRole, setUserRole] = useState<'Gerente General' | 'Cajero'>('Gerente General');

  // Active view: 'cuentas' (Cuentas activas) or 'inactivas' (Cuentas inactivas)
  const [activeFolder, setActiveFolder] = useState<'cuentas' | 'inactivas'>('cuentas');

  // Core data states
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [movements, setBankMovements] = useState<BankMovement[]>([]);
  const [activeRate, setActiveRate] = useState(() => getActiveExchangeRate());

  // Navigation states
  const [selectedAccountForMovements, setSelectedAccountForMovements] = useState<BankAccount | null>(null);
  const [movementsTab, setMovementsTab] = useState<'Todos' | 'EsteMes' | 'Personalizado'>('Todos');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [movementSearch, setMovementSearch] = useState('');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [selectedClassification, setSelectedClassification] = useState<string>('Todas');
  const [accountSearch, setAccountSearch] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  // Modals state
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [isPaymentMethodsModalOpen, setIsPaymentMethodsModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isEditAccountModalOpen, setIsEditAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    account: BankAccount | null;
    isPermanent: boolean;
  }>({
    isOpen: false,
    account: null,
    isPermanent: false
  });

  // Form states - New Account
  const [newAccName, setNewAccountName] = useState('');
  const [newAccBank, setNewAccountBank] = useState('');
  const [newAccNum, setNewAccountNumber] = useState('');
  const [newAccType, setNewAccountType] = useState('Corriente');
  const [newAccCurrency, setNewAccountCurrency] = useState('VES');
  const [newAccInitialBalance, setNewAccountInitialBalance] = useState('');

  // Form states - New Payment Method
  const [newPmName, setNewPmName] = useState('');
  const [newPmCurrency, setNewPmCurrency] = useState('VES');
  const [newPmType, setNewPmType] = useState('Pago Móvil');
  const [newPmAccountId, setNewPmAccountId] = useState('');

  // Form states - Transfer between accounts
  const [tfSourceId, setTfSourceId] = useState('');
  const [tfTargetId, setTfTargetId] = useState('');
  const [tfAmount, setTfAmount] = useState('');
  const [tfRate, setTfRate] = useState(activeRate.toString());
  const [tfCommission, setTfCommission] = useState('0');
  const [tfCommissionType, setTfCommissionType] = useState<'Fija' | 'Porcentual'>('Fija');
  const [tfReference, setTfReference] = useState('');
  const [tfNotes, setTfNotes] = useState('');

  // Form states - Withdraw
  const [wdSourceId, setWdSourceId] = useState('');
  const [wdAmount, setWdAmount] = useState('');
  const [wdReference, setWdReference] = useState('');
  const [wdNotes, setWdNotes] = useState('');

  // Form states - Deposit
  const [dpTargetId, setDpTargetId] = useState('');
  const [dpAmount, setDpAmount] = useState('');
  const [dpReference, setDpReference] = useState('');
  const [dpNotes, setDpNotes] = useState('');

  // Form states - Edit Account
  const [editAccName, setEditAccName] = useState('');
  const [editAccBank, setEditAccBank] = useState('');
  const [editAccNum, setEditAccNum] = useState('');
  const [editAccType, setEditAccType] = useState('Corriente');
  const [editAccStatus, setEditAccStatus] = useState('Activo');

  // Trigger Toast
  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load all data from API / Supabase
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const ts = Date.now();
      const [accRes, pmRes, movRes] = await Promise.all([
        fetch(`/api/bank-accounts?t=${ts}`),
        fetch(`/api/payment-methods?t=${ts}`),
        fetch(`/api/bank-movements?t=${ts}`)
      ]);

      if (accRes.ok && pmRes.ok && movRes.ok) {
        const accs = await accRes.json();
        const pms = await pmRes.json();
        const movs = await movRes.json();

        setAccounts(accs.data || []);
        setPaymentMethods(pms.data || []);
        setBankMovements(movs.data || []);
      } else {
        const direct = await fetchBankAccountsFromSupabase();
        if (direct.success) {
          setAccounts(direct.data);
        }
      }
    } catch {
      const direct = await fetchBankAccountsFromSupabase();
      if (direct.success) {
        setAccounts(direct.data);
      } else {
        showToast('Error de comunicación con el servidor.', 'info');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();

    const handleRate = () => {
      setActiveRate(getActiveExchangeRate());
      setTfRate(getActiveExchangeRate().toString());
    };
    window.addEventListener('frenyer:rate-changed', handleRate);
    return () => window.removeEventListener('frenyer:rate-changed', handleRate);
  }, []);

  // Save new Bank Account
  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim() || !newAccBank.trim()) {
      showToast('Por favor, complete los campos obligatorios.', 'info');
      return;
    }

    const payload = {
      bank_name: newAccName.trim(),
      account_number: newAccNum.trim() || '—',
      account_type: newAccType,
      currency: newAccCurrency,
      balance: parseFloat(newAccInitialBalance) || 0,
      status: 'Activo'
    };

    try {
      const res = await fetch('/api/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast('Cuenta bancaria registrada con éxito.');
        setIsNewAccountModalOpen(false);
        setNewAccountName('');
        setNewAccountBank('');
        setNewAccountNumber('');
        setNewAccountInitialBalance('');
        await loadAllData();
      } else {
        const direct = await createBankAccountInSupabase(payload);
        if (direct.success) {
          showToast('Cuenta bancaria registrada con éxito.');
          setIsNewAccountModalOpen(false);
          setNewAccountName('');
          setNewAccountBank('');
          setNewAccountNumber('');
          setNewAccountInitialBalance('');
          await loadAllData();
        } else {
          showToast(json.error || direct.error || 'No se pudo guardar la cuenta.', 'info');
        }
      }
    } catch {
      const direct = await createBankAccountInSupabase(payload);
      if (direct.success) {
        showToast('Cuenta bancaria registrada con éxito.');
        setIsNewAccountModalOpen(false);
        setNewAccountName('');
        setNewAccountBank('');
        setNewAccountNumber('');
        setNewAccountInitialBalance('');
        await loadAllData();
      } else {
        showToast('Error al conectar con el servidor.', 'info');
      }
    }
  };

  // Edit Account
  const handleOpenEditAccount = (acc: BankAccount) => {
    setEditingAccount(acc);
    setEditAccName(acc.bank_name);
    setEditAccBank(acc.bank_name);
    setEditAccNum(acc.account_number);
    setEditAccType(acc.account_type);
    setEditAccStatus(acc.status);
    setIsEditAccountModalOpen(true);
  };

  const handleUpdateBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;

    const updates = {
      bank_name: editAccName.trim(),
      account_number: editAccNum.trim(),
      account_type: editAccType,
      status: editAccStatus
    };

    try {
      const res = await fetch(`/api/bank-accounts/${editingAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const json = await res.json();
      if (json.success) {
        showToast('Cuenta actualizada exitosamente.');
        setIsEditAccountModalOpen(false);
        setEditingAccount(null);
        await loadAllData();
        if (selectedAccountForMovements && selectedAccountForMovements.id === editingAccount.id) {
          setSelectedAccountForMovements(prev => prev ? { ...prev, ...updates } : null);
        }
      } else {
        const direct = await updateBankAccountInSupabase(editingAccount.id, updates);
        if (direct.success) {
          showToast('Cuenta actualizada exitosamente.');
          setIsEditAccountModalOpen(false);
          setEditingAccount(null);
          await loadAllData();
        } else {
          showToast(json.error || direct.error || 'Error al actualizar cuenta.', 'info');
        }
      }
    } catch {
      const direct = await updateBankAccountInSupabase(editingAccount.id, updates);
      if (direct.success) {
        showToast('Cuenta actualizada exitosamente.');
        setIsEditAccountModalOpen(false);
        setEditingAccount(null);
        await loadAllData();
      } else {
        showToast('Error al conectar con el servidor.', 'info');
      }
    }
  };

  // Inactivate (Soft delete)
  const handleDeleteBankAccount = (acc: BankAccount) => {
    setDeleteModalState({
      isOpen: true,
      account: acc,
      isPermanent: false
    });
  };

  // Permanent Delete
  const handlePurgeBankAccount = (acc: BankAccount) => {
    setDeleteModalState({
      isOpen: true,
      account: acc,
      isPermanent: true
    });
  };

  // Confirm delete or inactivate
  const confirmDeleteAccount = async (isPermanent: boolean) => {
    if (!deleteModalState.account) return;
    const { id, bank_name } = deleteModalState.account;

    try {
      const endpoint = `/api/bank-accounts/${id}${isPermanent ? '?permanent=true' : ''}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      const json = await res.json();

      if (json.success) {
        if (isPermanent) {
          setAccounts(prev => prev.filter(a => a.id !== id));
        } else {
          setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'Inactivo' } : a));
        }

        if (selectedAccountForMovements && selectedAccountForMovements.id === id) {
          setSelectedAccountForMovements(null);
        }

        setDeleteModalState({ isOpen: false, account: null, isPermanent: false });
        setIsEditAccountModalOpen(false);
        showToast(
          isPermanent
            ? `Cuenta "${bank_name}" eliminada definitivamente.`
            : `Cuenta "${bank_name}" movida a Cuentas Inactivas.`
        );
        loadAllData();
      } else {
        const direct = await deleteBankAccountInSupabase(id, isPermanent);
        if (direct.success) {
          if (isPermanent) {
            setAccounts(prev => prev.filter(a => a.id !== id));
          } else {
            setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'Inactivo' } : a));
          }
          if (selectedAccountForMovements && selectedAccountForMovements.id === id) {
            setSelectedAccountForMovements(null);
          }
          setDeleteModalState({ isOpen: false, account: null, isPermanent: false });
          setIsEditAccountModalOpen(false);
          showToast(
            isPermanent
              ? `Cuenta "${bank_name}" eliminada definitivamente.`
              : `Cuenta "${bank_name}" movida a Cuentas Inactivas.`
          );
          loadAllData();
        } else {
          showToast(json.error || direct.error || 'No se pudo procesar la solicitud.', 'info');
        }
      }
    } catch {
      showToast('Error de red al procesar eliminación.', 'info');
    }
  };

  // Restore inactive account
  const handleRestoreBankAccount = async (id: string) => {
    try {
      const res = await fetch(`/api/bank-accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Activo' })
      });
      const json = await res.json();
      if (json.success) {
        setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'Activo' } : a));
        if (selectedAccountForMovements && selectedAccountForMovements.id === id) {
          setSelectedAccountForMovements(prev => prev ? { ...prev, status: 'Activo' } : null);
        }
        showToast('Cuenta reactivada con éxito.');
        loadAllData();
      } else {
        const direct = await updateBankAccountInSupabase(id, { status: 'Activo' });
        if (direct.success) {
          setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'Activo' } : a));
          showToast('Cuenta reactivada con éxito.');
          loadAllData();
        }
      }
    } catch {
      showToast('Error de red al restaurar cuenta.', 'info');
    }
  };

  // Save new Payment Method
  const handleSavePaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPmName.trim()) {
      showToast('Ingrese el nombre del método de pago.', 'info');
      return;
    }

    const payload = {
      name: newPmName.trim(),
      currency: newPmCurrency,
      type: newPmType,
      bank_account_id: newPmAccountId || null
    };

    try {
      const res = await fetch('/api/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast('Método de pago registrado exitosamente.');
        setNewPmName('');
        setNewPmAccountId('');
        loadAllData();
      } else {
        showToast(json.error || 'Error al guardar método de pago.', 'info');
      }
    } catch {
      showToast('Error de conexión.', 'info');
    }
  };

  // Delete Payment Method
  const handleDeletePaymentMethod = async (id: string) => {
    try {
      const res = await fetch(`/api/payment-methods/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setPaymentMethods(prev => prev.filter(pm => pm.id !== id));
        showToast('Método de pago eliminado.');
      } else {
        showToast(json.error || 'Error al eliminar método.', 'info');
      }
    } catch {
      showToast('Error de red.', 'info');
    }
  };

  // Save Movement (Entrada / Salida)
  const handleSaveMovement = async (
    type: 'ENTRADA' | 'SALIDA',
    accountId: string,
    amountStr: string,
    ref: string,
    notes: string
  ) => {
    if (!accountId) {
      showToast('Seleccione una cuenta bancaria.', 'info');
      return false;
    }

    const amt = parseFloat(amountStr);
    if (isNaN(amt) || amt <= 0) {
      showToast('Ingrese un monto numérico válido mayor a 0.', 'info');
      return false;
    }

    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return false;

    const payload = {
      bank_account_id: accountId,
      type,
      concept: notes.trim() || (type === 'ENTRADA' ? 'Ingreso de saldo manual' : 'Retiro de saldo manual'),
      reference: ref.trim() || (type === 'ENTRADA' ? 'Depósito' : 'Retiro'),
      user_name: userRole === 'Gerente General' ? 'Gerente General' : 'Cajero',
      rate: activeRate,
      commission: 0,
      amount: amt
    };

    try {
      const res = await fetch('/api/bank-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast(type === 'ENTRADA' ? 'Ingreso procesado con éxito.' : 'Retiro procesado con éxito.');
        loadAllData();
        return true;
      } else {
        showToast(json.error || 'Error al procesar movimiento.', 'info');
        return false;
      }
    } catch {
      showToast('Error de conexión.', 'info');
      return false;
    }
  };

  // Save Transfer between accounts
  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tfSourceId || !tfTargetId || tfSourceId === tfTargetId) {
      showToast('Selecciona cuentas de origen y destino diferentes.', 'info');
      return;
    }

    const amt = parseFloat(tfAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Ingresa un monto de transferencia válido.', 'info');
      return;
    }

    const srcAccount = accounts.find(a => a.id === tfSourceId);
    const tgtAccount = accounts.find(a => a.id === tfTargetId);
    if (!srcAccount || !tgtAccount) return;

    const rate = parseFloat(tfRate) || activeRate;
    const comm = parseFloat(tfCommission) || 0;

    let calculatedCommissionAmount = comm;
    if (tfCommissionType === 'Porcentual') {
      calculatedCommissionAmount = (amt * comm) / 100;
    }

    let depositAmount = amt;
    if (srcAccount.currency !== tgtAccount.currency) {
      if (srcAccount.currency === 'VES' && tgtAccount.currency === 'USD') {
        depositAmount = amt / rate;
      } else if (srcAccount.currency === 'USD' && tgtAccount.currency === 'VES') {
        depositAmount = amt * rate;
      }
    }

    const sourcePayload = {
      bank_account_id: tfSourceId,
      type: 'SALIDA' as const,
      concept: tfNotes.trim() || `Transferencia enviada a ${tgtAccount.bank_name}`,
      reference: tfReference.trim() || 'Transferencia',
      user_name: userRole === 'Gerente General' ? 'Gerente General' : 'Cajero',
      rate,
      commission: calculatedCommissionAmount,
      amount: amt
    };

    const targetPayload = {
      bank_account_id: tfTargetId,
      type: 'ENTRADA' as const,
      concept: tfNotes.trim() || `Transferencia recibida de ${srcAccount.bank_name}`,
      reference: tfReference.trim() || 'Transferencia',
      user_name: userRole === 'Gerente General' ? 'Gerente General' : 'Cajero',
      rate,
      commission: 0,
      amount: depositAmount
    };

    try {
      const res1 = await fetch('/api/bank-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sourcePayload)
      });
      const json1 = await res1.json();

      if (!json1.success) {
        showToast(json1.error || 'Error al debitar de origen.', 'info');
        return;
      }

      const res2 = await fetch('/api/bank-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetPayload)
      });
      const json2 = await res2.json();

      if (json2.success) {
        showToast('Transferencia realizada con éxito.');
        setIsTransferModalOpen(false);
        setTfAmount('');
        setTfReference('');
        setTfNotes('');
        setTfCommission('0');
        loadAllData();
      } else {
        showToast(json2.error || 'Error al depositar en destino.', 'info');
      }
    } catch {
      showToast('Error de red al procesar transferencia.', 'info');
    }
  };

  // Filtered Accounts
  const normalAccounts = accounts.filter(a => a.status !== 'Inactivo' && a.status !== 'Papelera');
  const inactiveAccounts = accounts.filter(a => a.status === 'Inactivo' || a.status === 'Papelera');

  // Classification filter counts
  const countAll = normalAccounts.length;
  const countVES = normalAccounts.filter(a => a.currency === 'VES').length;
  const countUSD = normalAccounts.filter(a => a.currency === 'USD').length;
  const countEfectivo = normalAccounts.filter(a => 
    a.account_type === 'Efectivo' || 
    a.bank_name.toLowerCase().includes('efectivo') || 
    a.bank_name.toLowerCase().includes('caja')
  ).length;
  const countBancos = normalAccounts.filter(a => 
    !(a.account_type === 'Efectivo' || 
      a.bank_name.toLowerCase().includes('efectivo') || 
      a.bank_name.toLowerCase().includes('caja'))
  ).length;
  const countEUR = normalAccounts.filter(a => a.currency === 'EUR').length;
  const countCOP = normalAccounts.filter(a => a.currency === 'COP').length;

  const getFilteredAccounts = () => {
    let list = normalAccounts;
    if (selectedClassification === 'Bolívares (VES)' || selectedClassification === 'VES') {
      list = list.filter(a => a.currency === 'VES');
    } else if (selectedClassification === 'Dólares (USD)' || selectedClassification === 'USD') {
      list = list.filter(a => a.currency === 'USD');
    } else if (selectedClassification === 'Efectivo') {
      list = list.filter(a => 
        a.account_type === 'Efectivo' || 
        a.bank_name.toLowerCase().includes('efectivo') || 
        a.bank_name.toLowerCase().includes('caja')
      );
    } else if (selectedClassification === 'Bancos') {
      list = list.filter(a => 
        !(a.account_type === 'Efectivo' || 
          a.bank_name.toLowerCase().includes('efectivo') || 
          a.bank_name.toLowerCase().includes('caja'))
      );
    } else if (selectedClassification === 'EUR') {
      list = list.filter(a => a.currency === 'EUR');
    } else if (selectedClassification === 'COP') {
      list = list.filter(a => a.currency === 'COP');
    }

    if (accountSearch.trim()) {
      const q = accountSearch.toLowerCase();
      list = list.filter(a => 
        a.bank_name.toLowerCase().includes(q) || 
        a.account_number.toLowerCase().includes(q) ||
        a.currency.toLowerCase().includes(q)
      );
    }

    return list;
  };

  const filteredVisibleAccounts = getFilteredAccounts();

  // Filter movements for the movements screen
  const getFilteredMovements = () => {
    if (!selectedAccountForMovements) return [];
    let list = movements.filter(m => m.bank_account_id === selectedAccountForMovements.id);

    if (movementSearch.trim()) {
      const q = movementSearch.toLowerCase();
      list = list.filter(m => 
        m.concept.toLowerCase().includes(q) || 
        m.reference.toLowerCase().includes(q) ||
        m.user_name.toLowerCase().includes(q)
      );
    }

    if (movementsTab === 'EsteMes') {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      list = list.filter(m => new Date(m.created_at) >= firstDay);
    } else if (movementsTab === 'Personalizado') {
      if (startDate) {
        list = list.filter(m => new Date(m.created_at) >= new Date(startDate));
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        list = list.filter(m => new Date(m.created_at) <= end);
      }
    }

    return list;
  };

  const filteredMovementsList = getFilteredMovements();

  // Classification pill categories
  const classificationTabs = [
    { name: 'Todas', label: 'Todas las cuentas', count: countAll },
    { name: 'Bolívares (VES)', label: 'Bolívares (VES)', count: countVES },
    { name: 'Dólares (USD)', label: 'Dólares (USD)', count: countUSD },
    { name: 'Efectivo', label: 'Efectivo / Caja', count: countEfectivo },
    { name: 'Bancos', label: 'Bancos', count: countBancos },
    ...(countEUR > 0 ? [{ name: 'EUR', label: 'EUR', count: countEUR }] : []),
    ...(countCOP > 0 ? [{ name: 'COP', label: 'COP', count: countCOP }] : [])
  ];

  return (
    <div className="content" style={{ paddingBottom: 40 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 20,
          background: toast.type === 'success' ? '#7c3aed' : '#0284c7',
          color: '#fff',
          padding: '10px 18px',
          borderRadius: 10,
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          zIndex: 2000,
          fontSize: 13,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <Check size={16} /> {toast.message}
        </div>
      )}

      {/* Screen 1: MAIN BANK ACCOUNTS INTERFACE */}
      {!selectedAccountForMovements ? (
        <>
          {/* Header - Clean & Minimal */}
          <div className="page-head" style={{ marginBottom: 16 }}>
            <div>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 900, textTransform: 'uppercase', color: '#0f172a', letterSpacing: '0.02em', margin: 0 }}>
                <Building size={24} style={{ color: '#7c3aed' }} /> CUENTAS BANCARIAS
              </h1>
            </div>
            
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={loadAllData}
                style={{ height: 38, padding: '0 14px', borderRadius: 8, border: '1px solid #7c3aed', background: '#fff', color: '#7c3aed', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                <span>Sincronizar</span>
              </button>

              <button
                onClick={() => setIsPaymentMethodsModalOpen(true)}
                style={{ height: 38, padding: '0 14px', borderRadius: 8, border: '1px solid #7c3aed', background: '#fff', color: '#7c3aed', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <CreditCard size={15} /> Métodos de pago
              </button>

              <button
                onClick={() => setIsNewAccountModalOpen(true)}
                style={{ height: 38, padding: '0 16px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', boxShadow: '0 2px 8px rgba(124,58,237,0.35)' }}
              >
                <Plus size={15} /> Nueva cuenta
              </button>
            </div>
          </div>

          {/* Operations Action Bar & Search */}
              <div className="card" style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setIsTransferModalOpen(true)}
                    style={{ height: 44, padding: '0 20px', borderRadius: 10, background: '#7c3aed', border: 'none', fontSize: 13, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 4px 12px rgba(124,58,237,0.3)' }}
                  >
                    <ArrowLeftRight size={16} /> Transferir entre cuentas
                  </button>

                  <button
                    onClick={() => setIsDepositModalOpen(true)}
                    style={{ height: 44, padding: '0 20px', borderRadius: 10, background: '#fff', border: '2px solid #7c3aed', fontSize: 13, fontWeight: 800, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 2px 8px rgba(124,58,237,0.15)' }}
                  >
                    <PlusCircle size={16} /> Ingresar saldo
                  </button>

                  <button
                    onClick={() => setIsWithdrawModalOpen(true)}
                    style={{ height: 44, padding: '0 20px', borderRadius: 10, background: '#fff', border: '2px solid #7c3aed', fontSize: 13, fontWeight: 800, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 2px 8px rgba(124,58,237,0.15)' }}
                  >
                    <MinusCircle size={16} /> Retirar saldo
                  </button>
                </div>

                {/* Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', width: 250 }}>
                  <Search size={14} style={{ color: '#94a3b8' }} />
                  <input
                    placeholder="Buscar cuenta..."
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, width: '100%' }}
                  />
                  {accountSearch && (
                    <button onClick={() => setAccountSearch('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#94a3b8' }}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Barra Selectora / Filtro para Clasificar Cuentas */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Clasificar:</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {classificationTabs.map(tab => {
                      const isActive = selectedClassification === tab.name;
                      return (
                        <button
                          key={tab.name}
                          onClick={() => setSelectedClassification(tab.name)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 20,
                            border: '1px solid',
                            borderColor: '#7c3aed',
                            background: isActive ? '#7c3aed' : '#fff',
                            color: isActive ? '#fff' : '#7c3aed',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            boxShadow: isActive ? '0 2px 6px rgba(124,58,237,0.25)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span>{tab.label}</span>
                          <span style={{
                            background: isActive ? 'rgba(255,255,255,0.3)' : '#f1f5f9',
                            color: isActive ? '#fff' : '#7c3aed',
                            borderRadius: '50%',
                            minWidth: 16,
                            height: 16,
                            padding: '0 4px',
                            fontSize: 9,
                            display: 'grid',
                            placeItems: 'center',
                            fontWeight: 800
                          }}>{tab.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                  Mostrando <b>{filteredVisibleAccounts.length}</b> de {normalAccounts.length} cuentas
                </span>
              </div>

              {/* Grid of Bank Accounts */}
              {filteredVisibleAccounts.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px solid var(--border)' }}>
                  <Building size={32} strokeWidth={1.5} style={{ color: '#94a3b8', marginBottom: 10 }} />
                  <p style={{ margin: 0, fontWeight: 700, color: '#334155' }}>No hay cuentas registradas con este filtro.</p>
                  <button
                    onClick={() => { setSelectedClassification('Todas'); setAccountSearch(''); }}
                    style={{ background: 'transparent', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 12, fontWeight: 700, marginTop: 8 }}
                  >
                    Ver todas las cuentas
                  </button>
                </div>
              ) : (
                <div className="grid grid-3" style={{ gap: 14 }}>
                  {filteredVisibleAccounts.map(acc => {
                    const linkedPms = paymentMethods.filter(pm => pm.bank_account_id === acc.id);
                    const isVES = acc.currency === 'VES';
                    
                    return (
                      <div key={acc.id} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 180 }}>
                        <div>
                          {/* Top Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f5f3ff', color: '#7c3aed', display: 'grid', placeItems: 'center' }}>
                                <Building size={16} />
                              </div>
                              <div>
                                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{acc.bank_name}</h3>
                                <span className="muted small" style={{ fontSize: 11 }}>{acc.account_number}</span>
                              </div>
                            </div>
                            <Badge tone="brand">{acc.currency}</Badge>
                          </div>

                          {/* Balance section */}
                          <div style={{ margin: '14px 0' }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>
                              {isVES ? formatVES(acc.balance) : formatUSD(acc.balance, '$ ')}
                            </div>
                            {isVES && (
                              <div className="muted small" style={{ fontSize: 11, marginTop: 2 }}>
                                Ref: {formatUSD(acc.balance / activeRate, '$')}
                              </div>
                            )}
                          </div>

                          {/* Linked Payment Methods */}
                          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, marginTop: 10 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>
                              MÉTODOS ASOCIADOS ({linkedPms.length})
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {linkedPms.length === 0 ? (
                                <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>Ninguno fijado</span>
                              ) : (
                                linkedPms.map(pm => (
                                  <span
                                    key={pm.id}
                                    style={{
                                      background: '#f5f3ff',
                                      color: '#6d28d9',
                                      border: '1px solid #ddd6fe',
                                      borderRadius: 4,
                                      padding: '2px 6px',
                                      fontSize: 9,
                                      fontWeight: 700
                                    }}
                                  >
                                    {pm.name}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Bottom Action bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                          <button
                            onClick={() => setSelectedAccountForMovements(acc)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#7c3aed',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            Ver movimientos ↗
                          </button>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              onClick={() => handleOpenEditAccount(acc)}
                              title="Editar cuenta"
                              style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
                            >
                              <Edit3 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
        </>
      ) : (
        /* Screen 2: MOVEMENTS DETAILS SCREEN */
        <>
          {/* Back Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button
              onClick={() => setSelectedAccountForMovements(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#7c3aed',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <ArrowLeft size={16} /> Volver a cuentas
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              {selectedAccountForMovements.status === 'Inactivo' || selectedAccountForMovements.status === 'Papelera' ? (
                <>
                  <button
                    onClick={() => handleRestoreBankAccount(selectedAccountForMovements.id)}
                    style={{ height: 34, padding: '0 12px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  >
                    <Check size={13} /> Reactivar cuenta
                  </button>

                  <button
                    onClick={() => handlePurgeBankAccount(selectedAccountForMovements)}
                    style={{ height: 34, padding: '0 12px', borderRadius: 8, background: '#ef4444', color: 'white', border: 'none', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  >
                    <Trash2 size={13} /> Eliminar definitiva
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleOpenEditAccount(selectedAccountForMovements)}
                    style={{ height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid #7c3aed', background: '#fff', fontSize: 11, fontWeight: 700, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  >
                    <Edit3 size={13} /> Editar cuenta
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Account Detail Header */}
          <div className="card" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f5f3ff', color: '#7c3aed', display: 'grid', placeItems: 'center' }}>
                <Building size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{selectedAccountForMovements.bank_name}</h2>
                  <Badge tone="brand">{selectedAccountForMovements.currency}</Badge>
                </div>
                <span className="muted small" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                  {selectedAccountForMovements.account_number} · {selectedAccountForMovements.account_type}
                </span>
                
                {/* Fixed Methods list */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <span className="muted small" style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.04em' }}>MÉTODOS FIJADOS:</span>
                  {paymentMethods.filter(pm => pm.bank_account_id === selectedAccountForMovements.id).map(pm => (
                    <span key={pm.id} style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 700, color: '#6d28d9' }}>
                      {pm.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Current Balance Indicator */}
            <div style={{ textAlign: 'right' }}>
              <span className="muted small" style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8' }}>Saldo Actual</span>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                {selectedAccountForMovements.currency === 'VES' 
                  ? formatVES(selectedAccountForMovements.balance) 
                  : formatUSD(selectedAccountForMovements.balance, '$ ')}
              </div>
              {selectedAccountForMovements.currency === 'VES' && (
                <div className="muted small" style={{ fontSize: 11, marginTop: 4 }}>
                  Ref: {formatUSD(selectedAccountForMovements.balance / activeRate, '$')}
                </div>
              )}
            </div>
          </div>

          {/* Table Toolbar / Controls */}
          <div className="card" style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'Todos', label: `Todos (${filteredMovementsList.length})` },
                { id: 'EsteMes', label: 'Este Mes' },
                { id: 'Personalizado', label: 'Personalizado' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setMovementsTab(tab.id as any)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid #7c3aed',
                    background: movementsTab === tab.id ? '#7c3aed' : '#fff',
                    color: movementsTab === tab.id ? '#fff' : '#7c3aed',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Date pickers if custom */}
            {movementsTab === 'Personalizado' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="date"
                  className="input"
                  style={{ height: 32, fontSize: 11, padding: '0 6px', width: 120 }}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>hasta</span>
                <input
                  type="date"
                  className="input"
                  style={{ height: 32, fontSize: 11, padding: '0 6px', width: 120 }}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            )}

            {/* Search Input inside Movements */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', minWidth: 220 }}>
              <Search size={14} style={{ color: '#94a3b8' }} />
              <input
                style={{ border: 'none', outline: 'none', padding: '6px 0', fontSize: 11, width: '100%' }}
                placeholder="Buscar movimiento..."
                value={movementSearch}
                onChange={(e) => setMovementSearch(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={loadAllData}
                style={{ height: 32, padding: '0 12px', borderRadius: 6, border: '1px solid #7c3aed', background: '#fff', color: '#7c3aed', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Sincronizar
              </button>

              <button
                style={{ height: 32, padding: '0 12px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, cursor: 'pointer' }}
                onClick={() => window.print()}
              >
                <Download size={12} /> Exportar
              </button>
            </div>
          </div>

          {/* Movements Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#0a2540', color: '#fff' }}>
                    <th style={{ color: '#fff', fontSize: 11 }}>CUENTA</th>
                    <th style={{ color: '#fff', fontSize: 11 }}>FECHA</th>
                    <th style={{ color: '#fff', fontSize: 11 }}>USUARIO</th>
                    <th style={{ color: '#fff', fontSize: 11 }}>TIPO</th>
                    <th style={{ color: '#fff', fontSize: 11 }}>DETALLE / REFERENCIA</th>
                    <th style={{ color: '#fff', fontSize: 11, textAlign: 'center' }}>TASA</th>
                    <th style={{ color: '#fff', fontSize: 11, textAlign: 'right' }}>COMISIÓN</th>
                    <th style={{ color: '#fff', fontSize: 11, textAlign: 'right' }}>MONTO</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovementsList.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                        <FileText size={28} strokeWidth={1.5} style={{ marginBottom: 6 }} />
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 12 }}>No hay movimientos registrados para esta cuenta.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredMovementsList.map(mov => {
                      const isVES = selectedAccountForMovements.currency === 'VES';
                      return (
                        <tr key={mov.id}>
                          <td><b>{selectedAccountForMovements.bank_name}</b></td>
                          <td>{new Date(mov.created_at).toLocaleString('es-VE', { hour12: true })}</td>
                          <td>{mov.user_name}</td>
                          <td>
                            <Badge tone={mov.type === 'ENTRADA' ? 'success' : 'danger'}>
                              {mov.type}
                            </Badge>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: '#334155' }}>{mov.concept}</div>
                            <span className="muted small" style={{ fontSize: 10 }}>Ref: {mov.reference}</span>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: '#64748b' }}>
                            {mov.rate ? `${mov.rate.toFixed(2)} Bs/$` : '—'}
                          </td>
                          <td style={{ textAlign: 'right', color: '#64748b' }}>
                            {mov.commission > 0 
                              ? (isVES ? formatVES(mov.commission) : formatUSD(mov.commission)) 
                              : 'Bs 0,00'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: mov.type === 'ENTRADA' ? '#10b981' : '#ef4444' }}>
                            {mov.type === 'ENTRADA' ? '+' : '-'}
                            {isVES ? formatVES(mov.amount) : formatUSD(mov.amount)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ============================================================================== */}
      {/* MODALS */}
      {/* ============================================================================== */}

      {/* MODAL: REGISTRAR NUEVA CUENTA */}
      {isNewAccountModalOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 460, padding: 0, background: '#fff', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: '#7c3aed', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building size={18} style={{ color: '#fff' }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', color: 'white' }}>Registrar Nueva Cuenta</h3>
              </div>
              <button onClick={() => setIsNewAccountModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveBankAccount} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>NOMBRE DE LA CUENTA *</label>
                <input className="input" placeholder="Ej: Banesco Corriente, Efectivo Caja" value={newAccName} onChange={(e) => setNewAccountName(e.target.value)} required />
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>BANCO / ENTIDAD DE ORIGEN *</label>
                <input className="input" placeholder="Ej: Banesco Banco Universal, Dinero Físico" value={newAccBank} onChange={(e) => setNewAccountBank(e.target.value)} required />
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>NÚMERO DE CUENTA / IDENTIFICADOR</label>
                <input className="input" placeholder="Ej: 0134-****-**-********" value={newAccNum} onChange={(e) => setNewAccountNumber(e.target.value)} />
              </div>

              <div className="grid grid-2" style={{ gap: 10 }}>
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>MONEDA</label>
                  <select className="input" value={newAccCurrency} onChange={(e) => setNewAccountCurrency(e.target.value)}>
                    <option value="VES">VES (Bolívares)</option>
                    <option value="USD">USD (Dólares)</option>
                    <option value="EUR">EUR (Euros)</option>
                    <option value="COP">COP (Pesos Colombianos)</option>
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>TIPO DE CUENTA</label>
                  <select className="input" value={newAccType} onChange={(e) => setNewAccountType(e.target.value)}>
                    <option value="Corriente">Corriente</option>
                    <option value="Ahorro">Ahorro</option>
                    <option value="Custodia">Custodia</option>
                    <option value="Efectivo">Efectivo / Caja</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>SALDO INICIAL</label>
                <input type="number" step="0.01" className="input" placeholder="0.00" value={newAccInitialBalance} onChange={(e) => setNewAccountInitialBalance(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button type="button" onClick={() => setIsNewAccountModalOpen(false)} style={{ height: 36, padding: '0 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ height: 36, padding: '0 16px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Guardar cuenta</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MÉTODOS DE PAGO DEL SISTEMA */}
      {isPaymentMethodsModalOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, padding: 0, background: '#fff', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CreditCard size={18} style={{ color: '#7c3aed' }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', color: '#0f172a' }}>Métodos de Pago del Sistema</h3>
              </div>
              <button onClick={() => setIsPaymentMethodsModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {/* Registration Form */}
            <form onSubmit={handleSavePaymentMethod} style={{ padding: 18, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', display: 'block' }}>Registrar Nuevo Método de Pago:</span>
              
              <div className="field">
                <label style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>NOMBRE DEL MÉTODO *</label>
                <input className="input" style={{ height: 34, fontSize: 12 }} placeholder="Ej: Pago móvil Banesco, Zelle, Transferencia" value={newPmName} onChange={(e) => setNewPmName(e.target.value)} required />
              </div>

              <div className="grid grid-3" style={{ gap: 8 }}>
                <div className="field">
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>MONEDA</label>
                  <select className="input" style={{ height: 34, fontSize: 11 }} value={newPmCurrency} onChange={(e) => setNewPmCurrency(e.target.value)}>
                    <option value="VES">VES (Bolívares)</option>
                    <option value="USD">USD (Dólares)</option>
                    <option value="EUR">EUR (Euros)</option>
                    <option value="COP">COP (Pesos Colombianos)</option>
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>TIPO</label>
                  <select className="input" style={{ height: 34, fontSize: 11 }} value={newPmType} onChange={(e) => setNewPmType(e.target.value)}>
                    <option value="Pago Móvil">Pago Móvil</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Efectivo">Efectivo</option>
                    <option value="Punto de Venta">Punto de Venta</option>
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#475569' }}>FIJAR A CUENTA</label>
                  <select className="input" style={{ height: 34, fontSize: 11 }} value={newPmAccountId} onChange={(e) => setNewPmAccountId(e.target.value)}>
                    <option value="">-- Sin fijar aún --</option>
                    {normalAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.bank_name} ({a.currency})</option>
                    ))}
                  </select>
                </div>
              </div>

              <button type="submit" style={{ height: 34, padding: '0 14px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, marginTop: 4, cursor: 'pointer' }}>+ Registrar método</button>
            </form>

            {/* List of registered methods */}
            <div style={{ maxHeight: 200, overflowY: 'auto', padding: 18 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Métodos Registrados ({paymentMethods.length})</span>
              {paymentMethods.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic', textAlign: 'center', padding: 20 }}>No hay métodos de pago registrados.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {paymentMethods.map(pm => {
                    const acc = normalAccounts.find(a => a.id === pm.bank_account_id);
                    return (
                      <div key={pm.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#f8fafc' }}>
                        <div>
                          <b style={{ fontSize: 12, color: '#0f172a' }}>{pm.name}</b>
                          <div className="muted small" style={{ fontSize: 10 }}>{pm.currency} • {pm.type} {acc ? `• Fijado a: ${acc.bank_name}` : ''}</div>
                        </div>

                        <button
                          onClick={() => handleDeletePaymentMethod(pm.id)}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: '#fafbfc' }}>
              <button onClick={() => setIsPaymentMethodsModalOpen(false)} style={{ height: 34, padding: '0 16px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TRANSFERENCIA ENTRE CUENTAS */}
      {isTransferModalOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 460, padding: 0, background: '#fff', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: '#7c3aed', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ArrowLeftRight size={18} style={{ color: '#fff' }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', color: 'white' }}>Transferencia entre cuentas</h3>
              </div>
              <button onClick={() => setIsTransferModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveTransfer} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>CUENTA DE ORIGEN *</label>
                <select className="input" value={tfSourceId} onChange={(e) => setTfSourceId(e.target.value)} required>
                  <option value="">Seleccione...</option>
                  {normalAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.bank_name} ({a.currency}) - Saldo: {a.currency === 'VES' ? formatVES(a.balance) : formatUSD(a.balance, '$')}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>CUENTA DE DESTINO *</label>
                <select className="input" value={tfTargetId} onChange={(e) => setTfTargetId(e.target.value)} required>
                  <option value="">Seleccione...</option>
                  {normalAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.bank_name} ({a.currency}) - Saldo: {a.currency === 'VES' ? formatVES(a.balance) : formatUSD(a.balance, '$')}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>MONTO A TRANSFERIR *</label>
                <input type="number" step="0.01" className="input" placeholder="0.00" value={tfAmount} onChange={(e) => setTfAmount(e.target.value)} required />
              </div>

              <div className="grid grid-2" style={{ gap: 10 }}>
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>TASA OFICIAL *</label>
                  <input type="number" step="0.0001" className="input" value={tfRate} onChange={(e) => setTfRate(e.target.value)} required />
                </div>

                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>COMISIÓN</label>
                  <input type="number" step="0.01" className="input" placeholder="0" value={tfCommission} onChange={(e) => setTfCommission(e.target.value)} />
                </div>
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>REFERENCIA</label>
                <input className="input" placeholder="Ej: Ref 492042" value={tfReference} onChange={(e) => setTfReference(e.target.value)} />
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>CONCEPTO / NOTAS</label>
                <textarea className="input" style={{ minHeight: 50, padding: 8 }} placeholder="Nota de la transferencia" value={tfNotes} onChange={(e) => setTfNotes(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button type="button" onClick={() => setIsTransferModalOpen(false)} style={{ height: 36, padding: '0 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ height: 36, padding: '0 16px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Confirmar transferencia</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RETIRAR SALDO */}
      {isWithdrawModalOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 0, background: '#fff', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: '#7c3aed', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MinusCircle size={18} style={{ color: '#fff' }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', color: 'white' }}>Retirar Saldo</h3>
              </div>
              <button onClick={() => setIsWithdrawModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const ok = await handleSaveMovement('SALIDA', wdSourceId, wdAmount, wdReference, wdNotes);
              if (ok) {
                setIsWithdrawModalOpen(false);
                setWdAmount('');
                setWdReference('');
                setWdNotes('');
              }
            }} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>CUENTA DE ORIGEN *</label>
                <select className="input" value={wdSourceId} onChange={(e) => setWdSourceId(e.target.value)} required>
                  <option value="">Seleccione...</option>
                  {normalAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.bank_name} ({a.currency}) - Saldo: {a.currency === 'VES' ? formatVES(a.balance) : formatUSD(a.balance, '$')}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>MONTO A RETIRAR *</label>
                <input type="number" step="0.01" className="input" placeholder="0.00" value={wdAmount} onChange={(e) => setWdAmount(e.target.value)} required />
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>REFERENCIA</label>
                <input className="input" placeholder="Ej: Pago a proveedores" value={wdReference} onChange={(e) => setWdReference(e.target.value)} />
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>CONCEPTO / NOTAS</label>
                <textarea className="input" style={{ minHeight: 50, padding: 8 }} placeholder="Concepto del retiro" value={wdNotes} onChange={(e) => setWdNotes(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button type="button" onClick={() => setIsWithdrawModalOpen(false)} style={{ height: 36, padding: '0 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ height: 36, padding: '0 18px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Confirmar retiro</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: INGRESAR SALDO */}
      {isDepositModalOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 0, background: '#fff', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: '#7c3aed', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PlusCircle size={18} style={{ color: '#fff' }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', color: 'white' }}>Ingresar Saldo</h3>
              </div>
              <button onClick={() => setIsDepositModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const ok = await handleSaveMovement('ENTRADA', dpTargetId, dpAmount, dpReference, dpNotes);
              if (ok) {
                setIsDepositModalOpen(false);
                setDpAmount('');
                setDpReference('');
                setDpNotes('');
              }
            }} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>CUENTA DE DESTINO *</label>
                <select className="input" value={dpTargetId} onChange={(e) => setDpTargetId(e.target.value)} required>
                  <option value="">Seleccione...</option>
                  {normalAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.bank_name} ({a.currency}) - Saldo: {a.currency === 'VES' ? formatVES(a.balance) : formatUSD(a.balance, '$')}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>MONTO A INGRESAR *</label>
                <input type="number" step="0.01" className="input" placeholder="0.00" value={dpAmount} onChange={(e) => setDpAmount(e.target.value)} required />
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>REFERENCIA</label>
                <input className="input" placeholder="Ej: Depósito #0294" value={dpReference} onChange={(e) => setDpReference(e.target.value)} />
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>CONCEPTO / NOTAS</label>
                <textarea className="input" style={{ minHeight: 50, padding: 8 }} placeholder="Concepto del ingreso" value={dpNotes} onChange={(e) => setDpNotes(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button type="button" onClick={() => setIsDepositModalOpen(false)} style={{ height: 36, padding: '0 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ height: 36, padding: '0 18px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Confirmar ingreso</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR CUENTA */}
      {isEditAccountModalOpen && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 440, padding: 0, background: '#fff', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: '#7c3aed', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Edit3 size={18} style={{ color: '#fff' }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', color: 'white' }}>Editar Cuenta</h3>
              </div>
              <button onClick={() => { setIsEditAccountModalOpen(false); setEditingAccount(null); }} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleUpdateBankAccount} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>NOMBRE DE LA CUENTA *</label>
                <input className="input" value={editAccName} onChange={(e) => setEditAccName(e.target.value)} required />
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>BANCO / ENTIDAD DE ORIGEN *</label>
                <input className="input" value={editAccBank} onChange={(e) => setEditAccBank(e.target.value)} required />
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>NÚMERO DE CUENTA / IDENTIFICADOR</label>
                <input className="input" value={editAccNum} onChange={(e) => setEditAccNum(e.target.value)} />
              </div>

              <div className="grid grid-2" style={{ gap: 10 }}>
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>TIPO DE CUENTA</label>
                  <select className="input" value={editAccType} onChange={(e) => setEditAccType(e.target.value)}>
                    <option value="Corriente">Corriente</option>
                    <option value="Ahorro">Ahorro</option>
                    <option value="Custodia">Custodia</option>
                    <option value="Efectivo">Efectivo / Caja</option>
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>ESTADO</label>
                  <select className="input" value={editAccStatus} onChange={(e) => setEditAccStatus(e.target.value)}>
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button
                  type="button"
                  onClick={() => {
                    if (editingAccount) {
                      setDeleteModalState({ isOpen: true, account: editingAccount, isPermanent: false });
                    }
                  }}
                  style={{ height: 36, padding: '0 12px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Trash2 size={14} /> Inactivar cuenta
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => { setIsEditAccountModalOpen(false); setEditingAccount(null); }} style={{ height: 36, padding: '0 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                  <button type="submit" style={{ height: 36, padding: '0 16px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Actualizar cuenta</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMACIÓN DE INACTIVAR / ELIMINAR CUENTA */}
      {deleteModalState.isOpen && deleteModalState.account && (
        <div className="modal-backdrop" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 1300, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 440, padding: 0, background: '#fff', borderRadius: 12, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', background: deleteModalState.isPermanent ? '#dc2626' : '#7c3aed', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trash2 size={18} style={{ color: '#fff' }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, textTransform: 'uppercase', color: 'white' }}>
                  {deleteModalState.isPermanent ? 'Eliminar Definitivamente' : 'Inactivar Cuenta'}
                </h3>
              </div>
              <button onClick={() => setDeleteModalState({ isOpen: false, account: null, isPermanent: false })} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: deleteModalState.isPermanent ? '#fee2e2' : '#f5f3ff', color: deleteModalState.isPermanent ? '#dc2626' : '#7c3aed', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                    {deleteModalState.account.bank_name}
                  </h4>
                  <span className="muted small" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                    {deleteModalState.account.currency} • {deleteModalState.account.account_number}
                  </span>
                </div>
              </div>

              <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                {deleteModalState.isPermanent
                  ? '¿Estás seguro de eliminar esta cuenta permanentemente de la base de datos? Esta acción no se puede deshacer.'
                  : '¿Deseas inactivar esta cuenta? Se moverá a Cuentas Inactivas y no se mostrará en los métodos de cobro.'}
              </p>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setDeleteModalState({ isOpen: false, account: null, isPermanent: false })}
                  style={{ height: 36, padding: '0 14px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>

                {!deleteModalState.isPermanent && (
                  <button
                    type="button"
                    onClick={() => confirmDeleteAccount(true)}
                    style={{ height: 36, padding: '0 12px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Eliminar Definitivo
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => confirmDeleteAccount(deleteModalState.isPermanent)}
                  style={{
                    height: 36,
                    padding: '0 16px',
                    borderRadius: 6,
                    background: deleteModalState.isPermanent ? '#dc2626' : '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {deleteModalState.isPermanent ? 'Sí, Eliminar' : 'Sí, Inactivar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
