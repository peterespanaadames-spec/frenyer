import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  History,
  Plus,
  RotateCcw,
  Undo2,
  X
} from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { MobileSearchBar } from '../../../components/mobile/MobileSearchBar';
import { MobileEmptyState } from '../../../components/mobile/MobileEmptyState';
import { MobileFilterSheet, MobileFilterTrigger } from '../../../components/mobile/MobileFilterSheet';
import { authenticatedFetch } from '../../../lib/supabase/api';
import { formatUSD, formatVES } from '../../../lib/currency';
import {
  advanceBankAmount,
  advanceStatusLabel,
  advanceToUsd,
  resolveAdvanceStatus,
  round2,
  summarizeAdvances,
  validateAdvanceApplication,
  validateAdvanceDraft,
  validateAdvanceRefund,
  type AdvanceCurrency,
  type AdvanceStatus
} from '../../../lib/accounts/advances';

export interface AdvanceCustomerOption {
  id?: string;
  name: string;
  doc_number?: string;
  phone?: string;
}

export interface AdvanceBankAccountOption {
  id: string;
  bank_name: string;
  account_number?: string;
  currency: string;
  balance: number;
  status: string;
}

export interface AdvanceReceivableOption {
  id: string;
  doc_number: string;
  concept: string;
  customer_id?: string;
  customer_name: string;
  remaining_amount: number;
  due_date?: string;
}

interface AdvanceRow {
  id: string;
  advance_number: string;
  customer_id: string;
  customer_name: string;
  received_at: string;
  currency: AdvanceCurrency;
  amount_original: number;
  exchange_rate: number;
  amount_usd: number;
  applied_usd: number;
  refunded_usd: number;
  balance_usd: number;
  status: AdvanceStatus;
  bank_account_id: string | null;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  customers?: { id: string; name: string; doc_number?: string };
}

interface AdvanceMovementRow {
  id: string;
  type: 'ANTICIPO' | 'APLICACION' | 'DEVOLUCION' | 'ANULACION';
  amount_usd: number;
  amount_original: number | null;
  exchange_rate: number;
  reference: string | null;
  notes: string | null;
  created_at: string;
  bank_account_id: string | null;
  accounts_receivable?: { doc_number?: string; concept?: string } | null;
}

interface CustomerAdvancesPanelProps {
  bankAccounts: AdvanceBankAccountOption[];
  customers: AdvanceCustomerOption[];
  receivables: AdvanceReceivableOption[];
  activeRate: number;
  onChanged?: () => void;
}

type ModalKind = 'create' | 'apply' | 'refund' | 'void' | null;

const STATUS_TONE: Record<AdvanceStatus, 'success' | 'warning' | 'danger' | 'brand' | 'dark'> = {
  DISPONIBLE: 'success',
  APLICADO: 'brand',
  DEVUELTO: 'warning',
  ANULADO: 'danger'
};

const MOVEMENT_LABEL: Record<AdvanceMovementRow['type'], string> = {
  ANTICIPO: 'Anticipo recibido',
  APLICACION: 'Aplicado a cuenta por cobrar',
  DEVOLUCION: 'Devuelto al cliente',
  ANULACION: 'Anulación con devolución'
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CustomerAdvancesPanel({
  bankAccounts,
  customers,
  receivables,
  activeRate,
  onChanged
}: CustomerAdvancesPanelProps) {
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | AdvanceStatus>('Todos');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [selectedAdvance, setSelectedAdvance] = useState<AdvanceRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movements, setMovements] = useState<Record<string, AdvanceMovementRow[]>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Formulario: nuevo anticipo
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newDate, setNewDate] = useState(todayIso());
  const [newAmount, setNewAmount] = useState('');
  const [newCurrency, setNewCurrency] = useState<AdvanceCurrency>('USD');
  const [newRate, setNewRate] = useState(String(activeRate || 1));
  const [newBankId, setNewBankId] = useState('');
  const [newMethod, setNewMethod] = useState('');
  const [newReference, setNewReference] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Formulario: aplicar / devolver
  const [actionReceivableId, setActionReceivableId] = useState('');
  const [actionAmount, setActionAmount] = useState('');
  const [actionBankId, setActionBankId] = useState('');
  const [actionRate, setActionRate] = useState(String(activeRate || 1));
  const [actionReference, setActionReference] = useState('');
  const [actionNotes, setActionNotes] = useState('');

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3800);
  };

  const activeBankAccounts = useMemo(
    () => bankAccounts.filter((b) => b.status === 'Activo'),
    [bankAccounts]
  );

  const customerOptions = useMemo(
    () =>
      customers
        .filter((c) => !!c.id && !!c.name)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [customers]
  );

  const loadAdvances = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await authenticatedFetch('/api/customer-advances');
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 || json?.code === 'MIGRATION_PENDING') {
        setMigrationPending(true);
        setAdvances([]);
        return;
      }
      setMigrationPending(false);
      if (!json?.success) {
        setLoadError(json?.error || 'No se pudieron cargar los anticipos.');
        return;
      }
      const rows: AdvanceRow[] = (json.data || []).map((row: AdvanceRow) => ({
        ...row,
        customer_name: row.customers?.name || row.customer_name || 'Cliente',
        status: resolveAdvanceStatus({
          applied_usd: Number(row.applied_usd) || 0,
          refunded_usd: Number(row.refunded_usd) || 0,
          balance_usd: Number(row.balance_usd) || 0,
          status: row.status
        })
      }));
      setAdvances(rows);
    } catch {
      setLoadError('Error de conexión al cargar los anticipos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdvances();
  }, []);

  const summary = useMemo(() => summarizeAdvances(advances), [advances]);

  const filteredAdvances = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return advances.filter((row) => {
      const matchesSearch =
        q === '' ||
        row.customer_name.toLowerCase().includes(q) ||
        row.advance_number.toLowerCase().includes(q) ||
        (row.reference || '').toLowerCase().includes(q) ||
        (row.customers?.doc_number || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'Todos' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [advances, searchTerm, statusFilter]);

  const openCreate = () => {
    setNewCustomerId('');
    setNewDate(todayIso());
    setNewAmount('');
    setNewCurrency('USD');
    setNewRate(String(activeRate || 1));
    setNewBankId(activeBankAccounts[0]?.id || '');
    setNewMethod('');
    setNewReference('');
    setNewNotes('');
    setModal('create');
  };

  const openApply = (advance: AdvanceRow) => {
    setSelectedAdvance(advance);
    const options = receivablesForAdvance(advance);
    setActionReceivableId(options[0]?.id || '');
    setActionAmount('');
    setActionReference('');
    setActionNotes('');
    setModal('apply');
  };

  const openRefund = (advance: AdvanceRow) => {
    setSelectedAdvance(advance);
    setActionAmount(String(round2(advance.balance_usd)));
    setActionBankId(advance.bank_account_id || activeBankAccounts[0]?.id || '');
    setActionRate(String(advance.exchange_rate || activeRate || 1));
    setActionReference('');
    setActionNotes('');
    setModal('refund');
  };

  const openVoid = (advance: AdvanceRow) => {
    setSelectedAdvance(advance);
    setActionBankId(advance.bank_account_id || activeBankAccounts[0]?.id || '');
    setActionRate(String(advance.exchange_rate || activeRate || 1));
    setActionReference('');
    setActionNotes('Anulación de anticipo sin uso');
    setModal('void');
  };

  const closeModal = () => {
    setModal(null);
    setSelectedAdvance(null);
  };

  const receivablesForAdvance = (advance: AdvanceRow): AdvanceReceivableOption[] =>
    receivables
      .filter((r) => r.remaining_amount > 0.005)
      .filter((r) => (advance.customer_id ? r.customer_id === advance.customer_id : r.customer_name === advance.customer_name))
      .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

  const afterMutation = async (message: string) => {
    showToast(message);
    closeModal();
    setMovements({});
    setExpandedId(null);
    await loadAdvances();
    onChanged?.();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(newAmount);
    const rate = Number(newRate) > 0 ? Number(newRate) : 1;
    const check = validateAdvanceDraft({
      customerId: newCustomerId,
      bankAccountId: newBankId,
      amountOriginal: amount,
      currency: newCurrency,
      rate
    });
    if (!check.ok) {
      showToast(check.error || 'Revisa los datos del anticipo.', 'info');
      return;
    }

    setIsSaving(true);
    try {
      const res = await authenticatedFetch('/api/customer-advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: newCustomerId,
          bank_account_id: newBankId,
          amount_original: round2(amount),
          currency: newCurrency,
          exchange_rate: rate,
          received_at: newDate || todayIso(),
          payment_method: newMethod.trim() || null,
          reference: newReference.trim() || null,
          notes: newNotes.trim() || null
        })
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 || json?.code === 'MIGRATION_PENDING') {
        setMigrationPending(true);
        closeModal();
        return;
      }
      if (!json?.success) throw new Error(json?.error || 'No se pudo registrar el anticipo.');
      await afterMutation('Anticipo registrado. El ingreso ya está en la cuenta bancaria.');
    } catch (err: any) {
      showToast(err?.message || 'Error registrando el anticipo.', 'info');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdvance) return;
    const amount = Number(actionAmount);
    const target = receivablesForAdvance(selectedAdvance).find((r) => r.id === actionReceivableId);
    if (!target) {
      showToast('Selecciona una cuenta por cobrar del mismo cliente.', 'info');
      return;
    }
    const check = validateAdvanceApplication({
      amountUsd: amount,
      availableUsd: selectedAdvance.balance_usd,
      receivableBalanceUsd: target.remaining_amount
    });
    if (!check.ok) {
      showToast(check.error || 'Revisa el monto a aplicar.', 'info');
      return;
    }

    setIsSaving(true);
    try {
      const res = await authenticatedFetch(`/api/customer-advances/${selectedAdvance.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivable_id: target.id,
          amount_usd: round2(amount),
          reference: actionReference.trim() || null,
          notes: actionNotes.trim() || null
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!json?.success) throw new Error(json?.error || 'No se pudo aplicar el anticipo.');
      await afterMutation('Anticipo aplicado a la cuenta por cobrar. No se generó un nuevo ingreso bancario.');
    } catch (err: any) {
      showToast(err?.message || 'Error aplicando el anticipo.', 'info');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdvance) return;
    const amount = Number(actionAmount);
    const bank = activeBankAccounts.find((b) => b.id === actionBankId);
    if (!bank) {
      showToast('Selecciona la cuenta bancaria de la devolución.', 'info');
      return;
    }
    const check = validateAdvanceRefund({
      amountUsd: amount,
      availableUsd: selectedAdvance.balance_usd,
      bankBalance: Number(bank.balance) || 0,
      bankCurrency: bank.currency === 'VES' ? 'VES' : 'USD',
      rate: Number(actionRate) > 0 ? Number(actionRate) : 1
    });
    if (!check.ok) {
      showToast(check.error || 'Revisa el monto a devolver.', 'info');
      return;
    }

    setIsSaving(true);
    try {
      const res = await authenticatedFetch(`/api/customer-advances/${selectedAdvance.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_account_id: actionBankId,
          amount_usd: round2(amount),
          exchange_rate: Number(actionRate) > 0 ? Number(actionRate) : null,
          reference: actionReference.trim() || null,
          notes: actionNotes.trim() || null
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!json?.success) throw new Error(json?.error || 'No se pudo devolver el anticipo.');
      await afterMutation('Devolución registrada. El egreso ya está en la cuenta bancaria.');
    } catch (err: any) {
      showToast(err?.message || 'Error devolviendo el anticipo.', 'info');
    } finally {
      setIsSaving(false);
    }
  };

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdvance) return;
    if (selectedAdvance.applied_usd > 0.005) {
      showToast('El anticipo tiene aplicaciones registradas: no se puede anular.', 'info');
      return;
    }
    setIsSaving(true);
    try {
      const res = await authenticatedFetch(`/api/customer-advances/${selectedAdvance.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_account_id: actionBankId || selectedAdvance.bank_account_id,
          exchange_rate: Number(actionRate) > 0 ? Number(actionRate) : null,
          reference: actionReference.trim() || null,
          notes: actionNotes.trim() || 'Anulación de anticipo sin uso'
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!json?.success) throw new Error(json?.error || 'No se pudo anular el anticipo.');
      await afterMutation('Anticipo anulado y dinero devuelto a la cuenta bancaria.');
    } catch (err: any) {
      showToast(err?.message || 'Error anulando el anticipo.', 'info');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleHistory = async (advance: AdvanceRow) => {
    if (expandedId === advance.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(advance.id);
    if (movements[advance.id]) return;
    try {
      const res = await authenticatedFetch(`/api/customer-advances/${advance.id}/movements`);
      const json = await res.json().catch(() => ({}));
      if (json?.success) {
        setMovements((prev) => ({ ...prev, [advance.id]: json.data || [] }));
      }
    } catch {
      // El historial es informativo: si falla, la ficha sigue operativa.
    }
  };

  const bankLabel = (id?: string | null) => {
    const bank = bankAccounts.find((b) => b.id === id);
    return bank ? `${bank.bank_name} (${bank.currency})` : '—';
  };

  const createPreviewUsd = advanceToUsd(Number(newAmount) || 0, newCurrency, Number(newRate) || 1);
  const selectedBank = activeBankAccounts.find((b) => b.id === newBankId);
  const createBankPreview = selectedBank
    ? advanceBankAmount(
        createPreviewUsd,
        Number(newAmount) || 0,
        newCurrency,
        selectedBank.currency === 'VES' ? 'VES' : 'USD',
        Number(newRate) || 1
      )
    : 0;

  const applyTarget = selectedAdvance
    ? receivablesForAdvance(selectedAdvance).find((r) => r.id === actionReceivableId)
    : undefined;

  const refundBank = activeBankAccounts.find((b) => b.id === actionBankId);
  const refundBankPreview = advanceBankAmount(
    Number(actionAmount) || 0,
    Number(actionAmount) || 0,
    'USD',
    refundBank?.currency === 'VES' ? 'VES' : 'USD',
    Number(actionRate) || 1
  );

  return (
    <div className="adv-root">
      {toast && (
        <div className="adv-toast" data-type={toast.type}>
          {toast.message}
        </div>
      )}

      {/* KPIs: los anticipos viven separados de la cartera por cobrar */}
      <div className="adv-kpis">
        <div className="card adv-kpi">
          <span className="kpi-label">ANTICIPOS A FAVOR</span>
          <div className="adv-kpi-value">{formatUSD(summary.available_usd, '$ ')}</div>
          <span className="adv-kpi-hint">{formatVES(summary.available_usd * activeRate)} disponibles</span>
        </div>
        <div className="card adv-kpi">
          <span className="kpi-label">RECIBIDO</span>
          <div className="adv-kpi-value">{formatUSD(summary.total_usd, '$ ')}</div>
          <span className="adv-kpi-hint">{summary.count} anticipo{summary.count === 1 ? '' : 's'} registrado{summary.count === 1 ? '' : 's'}</span>
        </div>
        <div className="card adv-kpi">
          <span className="kpi-label">APLICADO A CxC</span>
          <div className="adv-kpi-value">{formatUSD(summary.applied_usd, '$ ')}</div>
          <span className="adv-kpi-hint">Cruzado sin nuevo ingreso bancario</span>
        </div>
        <div className="card adv-kpi">
          <span className="kpi-label">DEVUELTO</span>
          <div className="adv-kpi-value">{formatUSD(summary.refunded_usd, '$ ')}</div>
          <span className="adv-kpi-hint">Salidas registradas en banco</span>
        </div>
      </div>

      {/* Barra de herramientas */}
      <div className="card adv-toolbar">
        <div className="adv-toolbar-search">
          <MobileSearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar cliente, folio o referencia..."
          />
        </div>
        <div className="adv-toolbar-actions">
          <MobileFilterTrigger
            onClick={() => setIsFilterOpen(true)}
            activeCount={statusFilter !== 'Todos' ? 1 : 0}
          />
          <MobileFilterSheet open={isFilterOpen} onClose={() => setIsFilterOpen(false)}>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'Todos' | AdvanceStatus)}
              style={{ height: 38, fontSize: 12, width: '100%', fontWeight: 600 }}
            >
              <option value="Todos">Todos los estados</option>
              <option value="DISPONIBLE">Disponible</option>
              <option value="APLICADO">Aplicado</option>
              <option value="DEVUELTO">Devuelto</option>
              <option value="ANULADO">Anulado</option>
            </select>
          </MobileFilterSheet>
          <button type="button" className="btn primary adv-new-btn" onClick={openCreate}>
            <Plus size={16} /> Nuevo anticipo
          </button>
        </div>
      </div>

      {migrationPending && (
        <div className="card adv-notice">
          <strong>Falta un paso en la base de datos.</strong>
          <p>
            Ejecuta la migración <code>0033_customer_advances.sql</code> en el SQL Editor de Supabase
            para habilitar los anticipos. El resto del sistema sigue funcionando igual.
          </p>
        </div>
      )}

      {!migrationPending && loadError && (
        <div className="card adv-notice adv-notice--error">
          <strong>No se pudieron cargar los anticipos.</strong>
          <p>{loadError}</p>
          <button type="button" className="btn secondary" onClick={loadAdvances}>
            Reintentar
          </button>
        </div>
      )}

      {!migrationPending && !loadError && isLoading && (
        <div className="card adv-empty">Cargando anticipos…</div>
      )}

      {!migrationPending && !loadError && !isLoading && filteredAdvances.length === 0 && (
        <div className="card">
          <MobileEmptyState
            title={
              advances.length === 0
                ? 'Aún no hay anticipos registrados.'
                : 'No hay anticipos con los filtros seleccionados.'
            }
          />
        </div>
      )}

      {!migrationPending && !loadError && !isLoading && filteredAdvances.length > 0 && (
        <div className="card adv-list-card">
          <div className="adv-table-wrap">
            <table className="adv-table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Aplicado</th>
                  <th>Devuelto</th>
                  <th>Disponible</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdvances.map((advance) => {
                  const isExpanded = expandedId === advance.id;
                  const canApply = advance.balance_usd > 0.005 && advance.status !== 'ANULADO';
                  return (
                    <AdvanceRowGroup
                      key={advance.id}
                      advance={advance}
                      isExpanded={isExpanded}
                      canApply={canApply}
                      history={movements[advance.id]}
                      activeRate={activeRate}
                      bankLabel={bankLabel}
                      onToggleHistory={() => toggleHistory(advance)}
                      onApply={() => openApply(advance)}
                      onRefund={() => openRefund(advance)}
                      onVoid={() => openVoid(advance)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Nuevo anticipo */}
      {modal === 'create' && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-container card adv-modal">
            <div className="adv-modal-head">
              <div className="adv-modal-title">
                <span className="adv-modal-icon"><Banknote size={18} /></span>
                <h3>Registrar anticipo</h3>
              </div>
              <button type="button" className="adv-close" onClick={closeModal} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="adv-form">
              <div className="field">
                <label>Cliente</label>
                <select
                  className="input"
                  required
                  value={newCustomerId}
                  onChange={(e) => setNewCustomerId(e.target.value)}
                >
                  <option value="">Selecciona un cliente registrado</option>
                  {customerOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.doc_number ? ` · ${c.doc_number}` : ''}
                    </option>
                  ))}
                </select>
                <small className="adv-help">Todo anticipo debe pertenecer a un cliente registrado.</small>
              </div>

              <div className="adv-grid-2">
                <div className="field">
                  <label>Fecha de recepción</label>
                  <input
                    className="input"
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Moneda recibida</label>
                  <div className="adv-segmented">
                    <button
                      type="button"
                      className={newCurrency === 'USD' ? 'is-active' : ''}
                      onClick={() => setNewCurrency('USD')}
                    >
                      USD
                    </button>
                    <button
                      type="button"
                      className={newCurrency === 'VES' ? 'is-active' : ''}
                      onClick={() => setNewCurrency('VES')}
                    >
                      Bs.
                    </button>
                  </div>
                </div>
              </div>

              <div className="adv-grid-2">
                <div className="field">
                  <label>Monto recibido ({newCurrency === 'VES' ? 'Bs.' : 'USD'})</label>
                  <input
                    className="input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Tasa de cambio (Bs./USD)</label>
                  <input
                    className="input"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    required
                    value={newRate}
                    onChange={(e) => setNewRate(e.target.value)}
                  />
                  <small className="adv-help">Se guarda para auditoría del anticipo.</small>
                </div>
              </div>

              <div className="field">
                <label>Cuenta bancaria de destino</label>
                <select
                  className="input"
                  required
                  value={newBankId}
                  onChange={(e) => setNewBankId(e.target.value)}
                >
                  <option value="">Selecciona la cuenta</option>
                  {activeBankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} · {b.currency} · saldo {b.balance.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="adv-grid-2">
                <div className="field">
                  <label>Método de pago</label>
                  <input
                    className="input"
                    placeholder="Transferencia, Pago Móvil, Efectivo…"
                    value={newMethod}
                    onChange={(e) => setNewMethod(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Referencia</label>
                  <input
                    className="input"
                    placeholder="Número de referencia"
                    value={newReference}
                    onChange={(e) => setNewReference(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label>Observación</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Nota interna del anticipo"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </div>

              <div className="adv-preview">
                <div>
                  <span>Saldo a favor en USD</span>
                  <strong>{formatUSD(createPreviewUsd, '$ ')}</strong>
                </div>
                <div>
                  <span>Ingreso en la cuenta</span>
                  <strong>{selectedBank?.currency === 'VES' ? formatVES(createBankPreview) : formatUSD(createBankPreview, '$ ')}</strong>
                </div>
              </div>

              <div className="adv-form-actions">
                <button type="button" className="btn secondary" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={isSaving}>
                  {isSaving ? 'Guardando…' : 'Registrar anticipo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Aplicar anticipo */}
      {modal === 'apply' && selectedAdvance && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-container card adv-modal">
            <div className="adv-modal-head">
              <div className="adv-modal-title">
                <span className="adv-modal-icon"><CreditCard size={18} /></span>
                <h3>Aplicar anticipo a cuenta por cobrar</h3>
              </div>
              <button type="button" className="adv-close" onClick={closeModal} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="adv-context">
              <div>
                <span>Cliente</span>
                <strong>{selectedAdvance.customer_name}</strong>
              </div>
              <div>
                <span>Folio</span>
                <strong>{selectedAdvance.advance_number}</strong>
              </div>
              <div>
                <span>Disponible</span>
                <strong>{formatUSD(selectedAdvance.balance_usd, '$ ')}</strong>
              </div>
            </div>

            <form onSubmit={handleApply} className="adv-form">
              <div className="field">
                <label>Cuenta por cobrar del cliente</label>
                <select
                  className="input"
                  required
                  value={actionReceivableId}
                  onChange={(e) => setActionReceivableId(e.target.value)}
                >
                  <option value="">Selecciona la cuenta</option>
                  {receivablesForAdvance(selectedAdvance).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.doc_number || 'CxC'} · {r.concept} · saldo {r.remaining_amount.toFixed(2)}
                    </option>
                  ))}
                </select>
                {receivablesForAdvance(selectedAdvance).length === 0 && (
                  <small className="adv-help adv-help--warn">
                    Este cliente no tiene cuentas por cobrar con saldo pendiente.
                  </small>
                )}
              </div>

              <div className="field">
                <label>Monto a aplicar (USD)</label>
                <input
                  className="input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={actionAmount}
                  onChange={(e) => setActionAmount(e.target.value)}
                />
                <small className="adv-help">
                  Máximo aplicable: {formatUSD(Math.min(selectedAdvance.balance_usd, applyTarget?.remaining_amount ?? selectedAdvance.balance_usd), '$ ')}
                </small>
              </div>

              <div className="field">
                <label>Referencia</label>
                <input
                  className="input"
                  placeholder="Referencia del cruce (opcional)"
                  value={actionReference}
                  onChange={(e) => setActionReference(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Observación</label>
                <textarea
                  className="input"
                  rows={2}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                />
              </div>

              <div className="adv-preview">
                <div>
                  <span>Saldo del anticipo después</span>
                  <strong>{formatUSD(Math.max(0, selectedAdvance.balance_usd - (Number(actionAmount) || 0)), '$ ')}</strong>
                </div>
                <div>
                  <span>Saldo de la cuenta después</span>
                  <strong>
                    {formatUSD(
                      Math.max(0, (applyTarget?.remaining_amount ?? 0) - (Number(actionAmount) || 0)),
                      '$ '
                    )}
                  </strong>
                </div>
              </div>

              <div className="adv-form-actions">
                <button type="button" className="btn secondary" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={isSaving}>
                  {isSaving ? 'Aplicando…' : 'Aplicar anticipo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Devolver anticipo */}
      {modal === 'refund' && selectedAdvance && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-container card adv-modal">
            <div className="adv-modal-head">
              <div className="adv-modal-title">
                <span className="adv-modal-icon adv-modal-icon--warn"><Undo2 size={18} /></span>
                <h3>Devolver anticipo</h3>
              </div>
              <button type="button" className="adv-close" onClick={closeModal} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="adv-context">
              <div>
                <span>Cliente</span>
                <strong>{selectedAdvance.customer_name}</strong>
              </div>
              <div>
                <span>Folio</span>
                <strong>{selectedAdvance.advance_number}</strong>
              </div>
              <div>
                <span>Disponible</span>
                <strong>{formatUSD(selectedAdvance.balance_usd, '$ ')}</strong>
              </div>
            </div>

            <form onSubmit={handleRefund} className="adv-form">
              <div className="field">
                <label>Cuenta bancaria de salida</label>
                <select
                  className="input"
                  required
                  value={actionBankId}
                  onChange={(e) => setActionBankId(e.target.value)}
                >
                  <option value="">Selecciona la cuenta</option>
                  {activeBankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} · {b.currency} · saldo {b.balance.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="adv-grid-2">
                <div className="field">
                  <label>Monto a devolver (USD)</label>
                  <input
                    className="input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={actionAmount}
                    onChange={(e) => setActionAmount(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Tasa de la devolución</label>
                  <input
                    className="input"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={actionRate}
                    onChange={(e) => setActionRate(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label>Referencia</label>
                <input
                  className="input"
                  placeholder="Referencia de la salida"
                  value={actionReference}
                  onChange={(e) => setActionReference(e.target.value)}
                />
              </div>

              <div className="field">
                <label>Observación</label>
                <textarea
                  className="input"
                  rows={2}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                />
              </div>

              <div className="adv-preview adv-preview--warn">
                <div>
                  <span>Saldo del anticipo después</span>
                  <strong>{formatUSD(Math.max(0, selectedAdvance.balance_usd - (Number(actionAmount) || 0)), '$ ')}</strong>
                </div>
                <div>
                  <span>Salida de la cuenta</span>
                  <strong>{refundBank?.currency === 'VES' ? formatVES(refundBankPreview) : formatUSD(refundBankPreview, '$ ')}</strong>
                </div>
              </div>

              <div className="adv-form-actions">
                <button type="button" className="btn secondary" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={isSaving}>
                  {isSaving ? 'Devolviendo…' : 'Registrar devolución'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Anular anticipo sin uso */}
      {modal === 'void' && selectedAdvance && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-container card adv-modal">
            <div className="adv-modal-head">
              <div className="adv-modal-title">
                <span className="adv-modal-icon adv-modal-icon--danger"><RotateCcw size={18} /></span>
                <h3>Anular anticipo</h3>
              </div>
              <button type="button" className="adv-close" onClick={closeModal} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <p className="adv-void-text">
              Se devolverá <strong>{formatUSD(selectedAdvance.balance_usd, '$ ')}</strong> a la cuenta
              bancaria y el anticipo quedará como <strong>ANULADO</strong>. No se borra: la
              trazabilidad se conserva.
            </p>

            <form onSubmit={handleVoid} className="adv-form">
              <div className="field">
                <label>Cuenta bancaria de la devolución</label>
                <select
                  className="input"
                  required
                  value={actionBankId}
                  onChange={(e) => setActionBankId(e.target.value)}
                >
                  <option value="">Selecciona la cuenta</option>
                  {activeBankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} · {b.currency} · saldo {b.balance.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Motivo</label>
                <input
                  className="input"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                />
              </div>

              <div className="adv-form-actions">
                <button type="button" className="btn secondary" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn danger" disabled={isSaving}>
                  {isSaving ? 'Anulando…' : 'Anular y devolver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AdvanceRowGroup({
  advance,
  isExpanded,
  canApply,
  history,
  activeRate,
  bankLabel,
  onToggleHistory,
  onApply,
  onRefund,
  onVoid
}: {
  advance: AdvanceRow;
  isExpanded: boolean;
  canApply: boolean;
  history?: AdvanceMovementRow[];
  activeRate: number;
  bankLabel: (id?: string | null) => string;
  onToggleHistory: () => void;
  onApply: () => void;
  onRefund: () => void;
  onVoid: () => void;
}) {
  return (
    <>
      <tr className={isExpanded ? 'adv-row is-expanded' : 'adv-row'}>
        <td className="adv-col-folio" data-label="Folio">
          <span className="adv-folio">{advance.advance_number}</span>
        </td>
        <td className="adv-col-customer" data-label="Cliente">
          <span className="adv-customer-name">{advance.customer_name}</span>
          <span className="adv-customer-doc">{advance.customers?.doc_number || ''}</span>
        </td>
        <td className="adv-col-date" data-label="Fecha">
          {advance.received_at || advance.created_at.slice(0, 10)}
        </td>
        <td className="adv-col-num" data-label="Total">
          {formatUSD(advance.amount_usd, '$ ')}
          <span className="adv-sub">
            {advance.currency === 'VES'
              ? formatVES(advance.amount_original)
              : `Bs. ${formatVES(advance.amount_usd * activeRate).replace('Bs. ', '')}`}
          </span>
        </td>
        <td className="adv-col-num" data-label="Aplicado">{formatUSD(advance.applied_usd, '$ ')}</td>
        <td className="adv-col-num" data-label="Devuelto">{formatUSD(advance.refunded_usd, '$ ')}</td>
        <td className="adv-col-num adv-col-available" data-label="Disponible">
          {formatUSD(advance.balance_usd, '$ ')}
        </td>
        <td className="adv-col-status" data-label="Estado">
          <Badge tone={STATUS_TONE[advance.status]}>{advanceStatusLabel(advance.status)}</Badge>
        </td>
        <td className="adv-col-actions">
          <div className="adv-actions">
            <button
              type="button"
              className="btn secondary adv-action"
              onClick={onApply}
              disabled={!canApply}
              title="Aplicar a una cuenta por cobrar"
            >
              Aplicar
            </button>
            <button
              type="button"
              className="btn secondary adv-action"
              onClick={onRefund}
              disabled={!canApply}
              title="Devolver saldo disponible"
            >
              Devolver
            </button>
            <button
              type="button"
              className="btn ghost adv-action adv-action--icon"
              onClick={onToggleHistory}
              title="Ver historial"
              aria-label="Ver historial"
            >
              {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {advance.applied_usd <= 0.005 && advance.balance_usd > 0.005 && (
              <button
                type="button"
                className="btn ghost adv-action adv-action--danger"
                onClick={onVoid}
                title="Anular anticipo sin uso"
              >
                Anular
              </button>
            )}
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="adv-history-row">
          <td colSpan={9}>
            <div className="adv-history">
              <div className="adv-history-head">
                <History size={14} /> Historial del anticipo
                <span className="adv-history-bank">Origen: {bankLabel(advance.bank_account_id)}</span>
              </div>
              {!history ? (
                <div className="adv-history-empty">Cargando historial…</div>
              ) : history.length === 0 ? (
                <div className="adv-history-empty">Sin movimientos registrados.</div>
              ) : (
                <ul className="adv-history-list">
                  {history.map((mov) => (
                    <li key={mov.id}>
                      <span className={`adv-dot adv-dot--${mov.type.toLowerCase()}`} />
                      <div className="adv-history-main">
                        <strong>{MOVEMENT_LABEL[mov.type]}</strong>
                        <span className="adv-history-meta">
                          {new Date(mov.created_at).toLocaleString('es-VE')}
                          {mov.accounts_receivable?.doc_number ? ` · Doc ${mov.accounts_receivable.doc_number}` : ''}
                          {mov.bank_account_id ? ` · ${bankLabel(mov.bank_account_id)}` : ''}
                        </span>
                        {(mov.reference || mov.notes) && (
                          <span className="adv-history-note">
                            {[mov.reference, mov.notes].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                      <div className="adv-history-amount">
                        {formatUSD(mov.amount_usd, '$ ')}
                        {mov.type === 'DEVOLUCION' || mov.type === 'ANULACION' ? (
                          <CheckCircle2 size={13} />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
