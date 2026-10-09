import React, { useState, useEffect, useMemo } from 'react';
import {
  WalletCards,
  Plus,
  Search,
  X,
  RefreshCw,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Edit2,
  CreditCard,
  Building2,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Tag,
  FileText,
  Copy,
  Check,
  ChevronRight,
  Filter
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import {
  DbExpense,
  ExpenseType,
  ExpenseFrequency,
  ExpenseStatus,
  fetchExpensesFromSupabase,
  createExpenseInSupabase,
  updateExpenseInSupabase,
  deleteExpenseFromSupabase,
  recordExpensePaymentInSupabase,
  fetchExpenseCategoriesFromSupabase,
  createExpenseCategoryInSupabase,
  DEFAULT_INITIAL_EXPENSE_CATEGORIES,
  fetchBankAccountsFromSupabase
} from '../../../lib/supabase/db';
import { getActiveExchangeRate, convertUSDtoVES, convertVEStoUSD } from '../../../lib/currency';

type TabFilter = 'FIJO' | 'VARIABLE' | 'TODOS';

export function ExpensesPage() {
  const [expenses, setExpenses] = useState<DbExpense[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_INITIAL_EXPENSE_CATEGORIES);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRate, setActiveRate] = useState<number>(36.5);

  // Filtros
  const [activeTab, setActiveTab] = useState<TabFilter>('TODOS');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'PENDIENTE' | 'PAGADO' | 'VENCIDO'>('TODOS');

  // Modales
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<DbExpense | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payingExpense, setPayingExpense] = useState<DbExpense | null>(null);
  const [deleteConfirmExpense, setDeleteConfirmExpense] = useState<DbExpense | null>(null);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [isCopiedSql, setIsCopiedSql] = useState(false);
  const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Form State
  const [formType, setFormType] = useState<ExpenseType>('FIJO');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('Alquiler');
  const [formAmount, setFormAmount] = useState('');
  const [formCurrency, setFormCurrency] = useState<'USD' | 'VES'>('USD');
  const [formDueDate, setFormDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [formFrequency, setFormFrequency] = useState<ExpenseFrequency>('MENSUAL');
  const [formNotes, setFormNotes] = useState('');
  const [formIsSubmitting, setFormIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Pay Modal State
  const [payAmount, setPayAmount] = useState('');
  const [payCurrency, setPayCurrency] = useState<'USD' | 'VES'>('USD');
  const [payBankAccountId, setPayBankAccountId] = useState('');
  const [payMethod, setPayMethod] = useState('Transferencia bancaria');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payReschedule, setPayReschedule] = useState(true);
  const [payIsSubmitting, setPayIsSubmitting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Limpiar cualquier dato simulado residual
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('frenyer_local_expenses');
        if (cached && (cached.includes('exp-01') || cached.includes('exp-02'))) {
          localStorage.removeItem('frenyer_local_expenses');
        }
      }

      const rate = await getActiveExchangeRate();
      if (rate && rate > 0) setActiveRate(rate);

      const [expList, catList, banks] = await Promise.all([
        fetchExpensesFromSupabase(),
        fetchExpenseCategoriesFromSupabase(),
        fetchBankAccountsFromSupabase()
      ]);

      setExpenses(expList);
      if (catList && catList.length > 0) setCategories(catList);
      if (banks.success && Array.isArray(banks.data)) {
        setBankAccounts(banks.data);
      }
    } catch (err: any) {
      console.warn('Error al cargar gastos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Recálculo dinámico de días restantes y estado de vencimiento
  const getExpenseRemainingInfo = (exp: DbExpense) => {
    if (exp.status === 'PAGADO') {
      return { text: 'Pagado', isExpired: false, isToday: false, isPaid: true, days: 0 };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(exp.due_date + 'T00:00:00');
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: 'Expirado', isExpired: true, isToday: false, isPaid: false, days: diffDays };
    } else if (diffDays === 0) {
      return { text: 'Hoy', isExpired: false, isToday: true, isPaid: false, days: 0 };
    } else if (diffDays === 1) {
      return { text: 'Mañana', isExpired: false, isToday: false, isPaid: false, days: 1 };
    } else {
      return { text: `En ${diffDays} días`, isExpired: false, isToday: false, isPaid: false, days: diffDays };
    }
  };

  // KPIs
  const metrics = useMemo(() => {
    let totalUsd = 0;
    let fixedUsd = 0;
    let variableUsd = 0;
    let fixedCount = 0;
    let variableCount = 0;

    expenses.forEach(e => {
      const amtUsd = e.currency === 'USD' ? Number(e.amount) : convertVEStoUSD(Number(e.amount), e.exchange_rate || activeRate);
      totalUsd += amtUsd;
      if (e.type === 'FIJO') {
        fixedUsd += amtUsd;
        fixedCount++;
      } else {
        variableUsd += amtUsd;
        variableCount++;
      }
    });

    const totalVes = convertUSDtoVES(totalUsd, activeRate);
    const fixedVes = convertUSDtoVES(fixedUsd, activeRate);
    const variableVes = convertUSDtoVES(variableUsd, activeRate);

    return {
      totalUsd,
      totalVes,
      totalCount: expenses.length,
      fixedUsd,
      fixedVes,
      fixedCount,
      variableUsd,
      variableVes,
      variableCount
    };
  }, [expenses, activeRate]);

  // Filtrado de la tabla
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      // Tab filter
      if (activeTab === 'FIJO' && exp.type !== 'FIJO') return false;
      if (activeTab === 'VARIABLE' && exp.type !== 'VARIABLE') return false;

      // Category filter
      if (categoryFilter !== 'Todas' && exp.category !== categoryFilter) return false;

      // Status filter
      if (statusFilter !== 'TODOS') {
        const remaining = getExpenseRemainingInfo(exp);
        if (statusFilter === 'PAGADO' && exp.status !== 'PAGADO') return false;
        if (statusFilter === 'VENCIDO' && (!remaining.isExpired || exp.status === 'PAGADO')) return false;
        if (statusFilter === 'PENDIENTE' && (exp.status === 'PAGADO' || remaining.isExpired)) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = exp.name?.toLowerCase().includes(term);
        const matchDesc = exp.description?.toLowerCase().includes(term);
        const matchCat = exp.category?.toLowerCase().includes(term);
        const matchNotes = exp.notes?.toLowerCase().includes(term);
        if (!matchName && !matchDesc && !matchCat && !matchNotes) return false;
      }

      return true;
    });
  }, [expenses, activeTab, categoryFilter, statusFilter, searchTerm]);

  // Suma acumulada de la vista filtrada actual
  const currentViewSumUsd = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => {
      const amtUsd = curr.currency === 'USD' ? Number(curr.amount) : convertVEStoUSD(Number(curr.amount), curr.exchange_rate || activeRate);
      return acc + amtUsd;
    }, 0);
  }, [filteredExpenses, activeRate]);

  // Manejo de Modal de Creación / Edición
  const handleOpenCreateModal = (defaultType?: ExpenseType) => {
    setEditingExpense(null);
    setFormType(defaultType || (activeTab === 'VARIABLE' ? 'VARIABLE' : 'FIJO'));
    setFormName('');
    setFormDescription('');
    setFormCategory(categories[0] || 'Alquiler');
    setFormAmount('');
    setFormCurrency('USD');
    setFormDueDate(new Date().toISOString().slice(0, 10));
    setFormFrequency('MENSUAL');
    setFormNotes('');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (exp: DbExpense) => {
    if (exp.status === 'PAGADO') {
      showToast('Un gasto pagado no se puede modificar.', 'info');
      return;
    }
    setEditingExpense(exp);
    setFormType(exp.type);
    setFormName(exp.name);
    setFormDescription(exp.description);
    setFormCategory(exp.category);
    setFormAmount(exp.amount.toString());
    setFormCurrency(exp.currency);
    setFormDueDate(exp.due_date);
    setFormFrequency(exp.frequency || 'MENSUAL');
    setFormNotes(exp.notes || '');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formName.trim()) {
      showToast('Introduce un nombre o identificador para el gasto.', 'error');
      return;
    }
    if (!formDescription.trim()) {
      showToast('Introduce un concepto o descripción para el gasto.', 'error');
      return;
    }
    const numAmount = parseFloat(formAmount);
    if (!numAmount || numAmount <= 0) {
      showToast('Introduce un monto válido mayor a cero.', 'error');
      return;
    }

    setFormIsSubmitting(true);
    try {
      const payload: Partial<DbExpense> = {
        name: formName.trim(),
        description: formDescription.trim(),
        category: formCategory,
        type: formType,
        amount: Math.round(numAmount * 100) / 100,
        currency: formCurrency,
        exchange_rate: activeRate,
        due_date: formDueDate,
        frequency: formType === 'FIJO' ? formFrequency : null,
        notes: formNotes.trim() || null
      };

      if (editingExpense) {
        const res = await updateExpenseInSupabase(editingExpense.id, payload);
        if (res.success) {
          showToast(`Gasto "${payload.name}" actualizado exitosamente.`);
          setIsFormModalOpen(false);
          await loadData();
        } else {
          setFormError(res.error || 'No se pudo actualizar el gasto.');
          showToast(res.error || 'No se pudo actualizar el gasto.', 'error');
        }
      } else {
        payload.status = 'PENDIENTE';
        payload.last_payment_date = null;
        const res = await createExpenseInSupabase(payload);
        if (res.success) {
          showToast(`Gasto "${payload.name}" registrado exitosamente.`);
          setIsFormModalOpen(false);
          await loadData();
        } else {
          setFormError(res.error || 'No se pudo registrar el gasto.');
          showToast(res.error || 'No se pudo registrar el gasto.', 'error');
        }
      }
    } catch (err: any) {
      setFormError(err?.message || 'Error procesando el gasto.');
      showToast(err?.message || 'Error procesando el gasto.', 'error');
    } finally {
      setFormIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!deleteConfirmExpense) return;
    if (deleteConfirmExpense.status === 'PAGADO') {
      showToast('Un gasto pagado no se puede eliminar.', 'info');
      setDeleteConfirmExpense(null);
      return;
    }
    try {
      const res = await deleteExpenseFromSupabase(deleteConfirmExpense.id);
      if (res.success) {
        showToast(`Gasto "${deleteConfirmExpense.name}" eliminado.`);
        setDeleteConfirmExpense(null);
        await loadData();
      } else {
        showToast(res.error || 'No se pudo eliminar el gasto.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error al eliminar', 'error');
    }
  };

  // Abrir Modal de Pago
  const handleOpenPayModal = (exp: DbExpense) => {
    setPayingExpense(exp);
    setPayAmount(exp.amount.toString());
    setPayCurrency(exp.currency);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod(exp.currency === 'USD' ? 'Efectivo USD' : 'Transferencia bancaria');
    setPayReference('');
    setPayNotes(`Pago de ${exp.name}`);
    setPayReschedule(exp.type === 'FIJO');
    if (bankAccounts.length > 0) {
      const matched = bankAccounts.find(b => b.currency === exp.currency && b.status !== 'Inactivo');
      setPayBankAccountId(matched ? matched.id : bankAccounts[0].id);
    } else {
      setPayBankAccountId('');
    }
    setIsPayModalOpen(true);
  };

  // Calcular próxima fecha según frecuencia
  const calculateNextDueDate = (currentDueStr: string, frequency?: ExpenseFrequency | null) => {
    const current = new Date(currentDueStr + 'T00:00:00');
    switch (frequency) {
      case 'SEMANAL':
        current.setDate(current.getDate() + 7);
        break;
      case 'QUINCENAL':
        current.setDate(current.getDate() + 15);
        break;
      case 'MENSUAL':
        current.setMonth(current.getMonth() + 1);
        break;
      case 'BIMESTRAL':
        current.setMonth(current.getMonth() + 2);
        break;
      case 'TRIMESTRAL':
        current.setMonth(current.getMonth() + 3);
        break;
      case 'SEMESTRAL':
        current.setMonth(current.getMonth() + 6);
        break;
      case 'ANUAL':
        current.setFullYear(current.getFullYear() + 1);
        break;
      default:
        current.setMonth(current.getMonth() + 1);
        break;
    }
    return current.toISOString().slice(0, 10);
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingExpense) return;
    const numAmount = parseFloat(payAmount);
    if (!numAmount || numAmount <= 0) {
      showToast('Ingresa un monto de pago válido.', 'error');
      return;
    }

    setPayIsSubmitting(true);
    try {
      let nextDueDate: string | undefined = undefined;
      if (payingExpense.type === 'FIJO' && payReschedule) {
        nextDueDate = calculateNextDueDate(payingExpense.due_date, payingExpense.frequency);
      }

      const res = await recordExpensePaymentInSupabase(payingExpense.id, {
        amount: numAmount,
        currency: payCurrency,
        exchangeRate: activeRate,
        paidAt: payDate,
        paymentMethod: payMethod,
        bankAccountId: payBankAccountId || undefined,
        reference: payReference.trim() || undefined,
        notes: payNotes.trim() || undefined,
        nextDueDate
      });

      if (res.success) {
        showToast(
          payingExpense.type === 'FIJO' && nextDueDate
            ? `¡Pago registrado! Próximo vencimiento programado para el ${nextDueDate}.`
            : `¡Pago de "${payingExpense.name}" registrado con éxito!`
        );
        setIsPayModalOpen(false);
        setPayingExpense(null);
        await loadData();
      } else {
        showToast(res.error || 'No se pudo procesar el pago.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error procesando pago.', 'error');
    } finally {
      setPayIsSubmitting(false);
    }
  };

  // Crear nueva categoría
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const res = await createExpenseCategoryInSupabase(newCategoryName.trim());
    if (res.success && res.name) {
      setCategories(prev => (prev.includes(res.name!) ? prev : [...prev, res.name!]));
      setFormCategory(res.name);
      setNewCategoryName('');
      setIsNewCategoryOpen(false);
      showToast(`Categoría "${res.name}" añadida.`);
    }
  };

  const supabaseSqlScript = `-- ==============================================================================
-- FRENYER ERP — MÓDULO DE GASTOS FIJOS Y VARIABLES (MIGRACIÓN 0016)
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de tu consola de Supabase para crear las tablas
-- con claves foráneas, políticas de seguridad RLS e índices optimizados.

-- 1. Tabla de Categorías de Gastos
create table if not exists public.expense_categories (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    name text not null,
    is_default boolean not null default false,
    created_at timestamptz not null default now()
);

create unique index if not exists idx_expense_categories_org_name 
    on public.expense_categories(organization_id, lower(trim(name)));

-- 2. Tabla Principal de Gastos
create table if not exists public.expenses (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    name text not null,
    description text not null,
    category text not null,
    type text not null default 'FIJO' check (type in ('FIJO', 'VARIABLE')),
    amount numeric(12,2) not null check (amount > 0),
    currency text not null default 'USD' check (currency in ('USD', 'VES')),
    exchange_rate numeric(12,4) not null default 1.0000,
    due_date date not null default current_date,
    last_payment_date date,
    frequency text default 'MENSUAL' check (frequency is null or frequency in ('SEMANAL', 'QUINCENAL', 'MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL')),
    status text not null default 'PENDIENTE' check (status in ('PENDIENTE', 'PAGADO', 'VENCIDO')),
    notes text,
    payment_account_id uuid references public.bank_accounts(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 3. Tabla de Pagos de Gastos
create table if not exists public.expense_payments (
    id uuid primary key default gen_random_uuid(),
    expense_id uuid not null references public.expenses(id) on delete cascade,
    organization_id uuid not null references public.organizations(id) on delete cascade,
    amount numeric(12,2) not null check (amount > 0),
    currency text not null default 'USD' check (currency in ('USD', 'VES')),
    exchange_rate numeric(12,4) not null default 1.0000,
    paid_at timestamptz not null default now(),
    payment_method text not null default 'Transferencia bancaria',
    bank_account_id uuid references public.bank_accounts(id) on delete set null,
    reference text,
    notes text,
    created_at timestamptz not null default now()
);

-- 4. Índices
create index if not exists idx_expenses_org on public.expenses(organization_id);
create index if not exists idx_expenses_type on public.expenses(organization_id, type);
create index if not exists idx_expenses_due_date on public.expenses(organization_id, due_date);
create index if not exists idx_expenses_status on public.expenses(organization_id, status);

-- 5. RLS y Permisos (Políticas universales para anon y authenticated)
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payments enable row level security;

-- Limpieza de políticas anteriores
drop policy if exists "auth_manage_expenses" on public.expenses;
drop policy if exists "allow_all_expenses" on public.expenses;
drop policy if exists "org_member_expenses" on public.expenses;
drop policy if exists "authenticated_manage_expenses" on public.expenses;

drop policy if exists "auth_manage_categories" on public.expense_categories;
drop policy if exists "allow_all_expense_categories" on public.expense_categories;
drop policy if exists "org_member_expense_categories" on public.expense_categories;
drop policy if exists "authenticated_manage_expense_categories" on public.expense_categories;

drop policy if exists "auth_manage_payments" on public.expense_payments;
drop policy if exists "allow_all_expense_payments" on public.expense_payments;
drop policy if exists "org_member_expense_payments" on public.expense_payments;
drop policy if exists "authenticated_manage_expense_payments" on public.expense_payments;

-- Políticas universales que evitan el error 'violates row-level security policy'
create policy "allow_all_expenses" on public.expenses for all to anon, authenticated using (true) with check (true);
create policy "allow_all_expense_categories" on public.expense_categories for all to anon, authenticated using (true) with check (true);
create policy "allow_all_expense_payments" on public.expense_payments for all to anon, authenticated using (true) with check (true);

-- Otorgar todos los permisos a anon y authenticated
grant all on table public.expenses to anon, authenticated;
grant all on table public.expense_categories to anon, authenticated;
grant all on table public.expense_payments to anon, authenticated;
`;

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(supabaseSqlScript);
    setIsCopiedSql(true);
    setTimeout(() => setIsCopiedSql(false), 2500);
    showToast('¡Código SQL copiado al portapapeles!');
  };

  return (
    <div className="content" style={{ paddingBottom: 50 }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            background: toast.type === 'error' ? '#ef4444' : toast.type === 'info' ? '#1e293b' : '#059669',
            color: 'white',
            padding: '12px 20px',
            borderRadius: 10,
            boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
            zIndex: 3000,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          {toast.message}
        </div>
      )}

      {/* 2.A Encabezado Principal */}
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: 'var(--brand-50)',
              color: 'var(--brand-600)',
              display: 'grid',
              placeItems: 'center',
              border: '1px solid var(--border)'
            }}
          >
            <WalletCards size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.3px' }}>
              GASTOS FIJOS/VARIABLES
            </h1>
          </div>
        </div>

        <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button
            variant="secondary"
            onClick={() => {
              setActiveTab('TODOS');
              setCategoryFilter('Todas');
              setStatusFilter('TODOS');
              setSearchTerm('');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            title="Restablecer filtros y ver todos los registros"
          >
            <Filter size={14} /> Todos los registros
          </Button>

          <Button
            variant="secondary"
            onClick={loadData}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Actualizar
          </Button>

          <Button
            variant="primary"
            onClick={() => handleOpenCreateModal()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}
          >
            <Plus size={16} /> Nuevo Gastos
          </Button>
        </div>
      </div>

      {/* 2.B Tarjetas de Resumen Financiero (3 tarjetas horizontales) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* 1. Gastos totales */}
        <Card style={{ padding: '18px 20px', background: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Gastos totales
              </span>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.15, marginTop: 4 }}>
                $ {metrics.totalUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'var(--brand-50)',
                color: 'var(--brand-600)',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <DollarSign size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              Equivalente: <strong style={{ color: 'var(--text-main)' }}>Bs. {metrics.totalVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
            <span style={{ fontSize: 11, color: '#64748b', background: 'var(--border)', padding: '2px 8px', borderRadius: 999 }}>
              Sin datos comparativos
            </span>
          </div>
        </Card>

        {/* 2. Gastos fijos */}
        <Card style={{ padding: '18px 20px', background: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Gastos fijos ({metrics.fixedCount})
              </span>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#3b82f6', lineHeight: 1.15, marginTop: 4 }}>
                $ {metrics.fixedUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: '#eff6ff',
                color: '#2563eb',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <Calendar size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              Equivalente: <strong style={{ color: 'var(--text-main)' }}>Bs. {metrics.fixedVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
            <span style={{ fontSize: 11, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>
              Programados recurrentes
            </span>
          </div>
        </Card>

        {/* 3. Gastos variables */}
        <Card style={{ padding: '18px 20px', background: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Gastos variables ({metrics.variableCount})
              </span>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b', lineHeight: 1.15, marginTop: 4 }}>
                $ {metrics.variableUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: '#fffbeb',
                color: '#d97706',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <TrendingDown size={20} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              Equivalente: <strong style={{ color: 'var(--text-main)' }}>Bs. {metrics.variableVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
            <span style={{ fontSize: 11, color: '#d97706', background: '#fffbeb', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>
              Operativos inmediatos
            </span>
          </div>
        </Card>
      </div>

      {/* 2.C Barra de Filtros y Búsqueda */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
        {/* Filtros tipo pestaña con contadores */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          {[
            { id: 'FIJO', label: 'Gastos Fijos', count: metrics.fixedCount },
            { id: 'VARIABLE', label: 'Gastos Variables', count: metrics.variableCount },
            { id: 'TODOS', label: 'Todos', count: metrics.totalCount }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabFilter)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  border: isActive ? '1px solid var(--brand-500)' : '1px solid var(--border)',
                  background: isActive ? 'var(--brand-50)' : 'var(--bg-card)',
                  color: isActive ? 'var(--brand-700)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: isActive ? 'var(--brand-500)' : 'var(--border)',
                    color: isActive ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Campo de búsqueda y filtros secundarios */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end', minWidth: 280 }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 320,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Search size={15} style={{ position: 'absolute', left: 12, color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Buscar por nombre, categoría…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="input"
              style={{
                paddingLeft: 34,
                paddingRight: searchTerm ? 30 : 12,
                height: 38,
                fontSize: 13,
                width: '100%'
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="input"
            style={{ height: 38, fontSize: 13, width: 170, cursor: 'pointer' }}
          >
            <option value="Todas">Todas las categorías</option>
            {categories.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="input"
            style={{ height: 38, fontSize: 13, width: 140, cursor: 'pointer' }}
          >
            <option value="TODOS">Todos los estados</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="PAGADO">Pagados</option>
            <option value="VENCIDO">Expirados / Vencidos</option>
          </select>
        </div>
      </div>

      {/* 2.D Sección de Registros con Título de la Categoría y Botón Contextual */}
      <Card style={{ padding: 0, overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            background: 'var(--bg-card)'
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.2px' }}>
              {activeTab === 'FIJO'
                ? 'GASTOS FIJOS'
                : activeTab === 'VARIABLE'
                ? 'GASTOS VARIABLES'
                : 'TODOS LOS REGISTROS'}
            </h3>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
              Total acumulado seleccionado:{' '}
              <strong style={{ color: 'var(--brand-700)' }}>
                $ {currentViewSumUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>{' '}
              ·{' '}
              <span>
                Bs.{' '}
                {convertUSDtoVES(currentViewSumUsd, activeRate).toLocaleString('es-VE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </span>
            </div>
          </div>
        </div>

        {/* 2.E Tabla de Gastos */}
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 18px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  NOMBRE / CONCEPTO
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  CATEGORÍA
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  DESCRIPCIÓN
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>
                  MONTO
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  FECHA DE PAGO
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  ÚLTIMA FECHA
                </th>
                <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  DÍAS RESTANTES
                </th>
                <th style={{ padding: '12px 18px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>
                  ACCIONES
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <WalletCards size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-main)' }}>
                      No hay gastos registrados en Supabase
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      {searchTerm || categoryFilter !== 'Todas' || statusFilter !== 'TODOS'
                        ? 'No hay gastos que coincidan con los filtros aplicados.'
                        : 'Los registros de gastos fijos y variables aparecerán aquí automáticamente una vez creados en la base de datos.'}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map(exp => {
                  const remaining = getExpenseRemainingInfo(exp);
                  const isPaid = exp.status === 'PAGADO';
                  const rate = exp.exchange_rate || activeRate;
                  const amtUsd = exp.currency === 'USD' ? Number(exp.amount) : convertVEStoUSD(Number(exp.amount), rate);
                  const amtVes = exp.currency === 'VES' ? Number(exp.amount) : convertUSDtoVES(Number(exp.amount), rate);

                  return (
                    <tr
                      key={exp.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.12s ease'
                      }}
                    >
                      {/* 1. Nombre / Concepto */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: exp.type === 'FIJO' ? '#eff6ff' : '#fffbeb',
                              color: exp.type === 'FIJO' ? '#2563eb' : '#d97706',
                              textTransform: 'uppercase'
                            }}
                          >
                            {exp.type}
                          </span>
                          <strong style={{ fontSize: 13, color: 'var(--text-main)' }}>{exp.name}</strong>
                        </div>
                        {exp.frequency && exp.type === 'FIJO' && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                            Frecuencia: {exp.frequency}
                          </div>
                        )}
                      </td>

                      {/* 2. Categoría */}
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'var(--border)',
                            color: 'var(--text-main)'
                          }}
                        >
                          <Tag size={11} /> {exp.category}
                        </span>
                      </td>

                      {/* 3. Descripción */}
                      <td style={{ padding: '14px 16px', maxWidth: 220 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {exp.description || '—'}
                        </span>
                        {exp.notes && (
                          <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>
                            {exp.notes}
                          </div>
                        )}
                      </td>

                      {/* 4. Monto (bimonetario) */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)' }}>
                          {exp.currency === 'USD' ? '$' : 'Bs.'}{' '}
                          {Number(exp.amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {exp.currency === 'USD'
                            ? `Bs. ${amtVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : `$ ${amtUsd.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </div>
                      </td>

                      {/* 5. Fecha de Pago (Vencimiento) */}
                      <td style={{ padding: '14px 16px', fontSize: 13, color: 'var(--text-main)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Calendar size={13} style={{ color: '#94a3b8' }} />
                          <span>{exp.due_date}</span>
                        </div>
                      </td>

                      {/* 6. Última Fecha */}
                      <td style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {exp.last_payment_date ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle2 size={13} style={{ color: '#059669' }} />
                            <span>{exp.last_payment_date}</span>
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>

                      {/* 7. Días Restantes */}
                      <td style={{ padding: '14px 16px' }}>
                        {isPaid ? (
                          <Badge tone="success">
                            ✓ Pagado
                          </Badge>
                        ) : remaining.isExpired ? (
                          <Badge tone="danger">
                            ⚠ Expirado ({Math.abs(remaining.days)}d)
                          </Badge>
                        ) : remaining.isToday ? (
                          <Badge tone="warning">
                            ● Vence Hoy
                          </Badge>
                        ) : (
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: remaining.days <= 3 ? '#b45309' : 'var(--text-secondary)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <Clock size={12} /> {remaining.text}
                          </span>
                        )}
                      </td>

                      {/* 8. Acciones */}
                      <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          {!isPaid ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenPayModal(exp)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: 8,
                                  background: 'var(--brand-500)',
                                  color: 'white',
                                  border: 'none',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                }}
                                title="Registrar pago de este gasto"
                              >
                                <CreditCard size={13} /> Pagar
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(exp)}
                                style={{
                                  width: 30,
                                  height: 30,
                                  borderRadius: 8,
                                  background: 'transparent',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text-secondary)',
                                  display: 'grid',
                                  placeItems: 'center',
                                  cursor: 'pointer'
                                }}
                                title="Editar gasto"
                              >
                                <Edit2 size={13} />
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeleteConfirmExpense(exp)}
                                style={{
                                  width: 30,
                                  height: 30,
                                  borderRadius: 8,
                                  background: 'transparent',
                                  border: '1px solid var(--border)',
                                  color: '#ef4444',
                                  display: 'grid',
                                  placeItems: 'center',
                                  cursor: 'pointer'
                                }}
                                title="Eliminar gasto"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#16a34a',
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                padding: '4px 10px',
                                borderRadius: 8
                              }}
                              title="Gasto pagado y liquidado (sin acciones de edición ni eliminación)"
                            >
                              <CheckCircle2 size={13} /> Pagado
                            </span>
                          )}
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

      {/* 3. FORMULARIO MODAL DE CREACIÓN Y EDICIÓN DE GASTOS */}
      {isFormModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 2500,
            padding: 16
          }}
          onClick={() => setIsFormModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              width: '100%',
              maxWidth: 580,
              maxHeight: '90vh',
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header Form */}
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
                    borderRadius: 10,
                    background: 'var(--brand-50)',
                    color: 'var(--brand-600)',
                    display: 'grid',
                    placeItems: 'center'
                  }}
                >
                  <WalletCards size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-main)' }}>
                    {editingExpense ? 'EDITAR GASTO' : 'NUEVO GASTO'}
                  </h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {editingExpense ? `Modificando registro #${editingExpense.name}` : 'Registra un gasto fijo programado o variable'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: 4
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body Form */}
            <form onSubmit={handleSaveExpense} style={{ padding: '24px', background: '#ffffff' }}>
              {/* 3.A Tipo de Gasto */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Tipo de Gasto *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setFormType('FIJO')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: formType === 'FIJO' ? '2px solid var(--brand-500)' : '1px solid var(--border)',
                      background: formType === 'FIJO' ? 'var(--brand-50)' : 'transparent',
                      color: formType === 'FIJO' ? 'var(--brand-700)' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8
                    }}
                  >
                    <Calendar size={16} /> Gasto Fijo (Programado)
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormType('VARIABLE')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: formType === 'VARIABLE' ? '2px solid var(--brand-500)' : '1px solid var(--border)',
                      background: formType === 'VARIABLE' ? 'var(--brand-50)' : 'transparent',
                      color: formType === 'VARIABLE' ? 'var(--brand-700)' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8
                    }}
                  >
                    <TrendingDown size={16} /> Gasto Variable (Inmediato)
                  </button>
                </div>
              </div>

              {/* 3.B Categoría */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Categoría *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsNewCategoryOpen(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--brand-600)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Plus size={13} /> Nueva categoría
                  </button>
                </div>

                {isNewCategoryOpen && (
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: 'var(--brand-50)',
                      border: '1px solid var(--border)',
                      marginBottom: 10,
                      display: 'flex',
                      gap: 8
                    }}
                  >
                    <input
                      type="text"
                      className="input"
                      placeholder="Nombre de la nueva categoría…"
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      style={{ height: 34, fontSize: 13, flex: 1 }}
                    />
                    <Button type="button" variant="primary" onClick={handleCreateCategory} style={{ height: 34, fontSize: 12 }}>
                      Guardar
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setIsNewCategoryOpen(false)} style={{ height: 34, fontSize: 12 }}>
                      Cancelar
                    </Button>
                  </div>
                )}

                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="input"
                  style={{ width: '100%', height: 40, fontSize: 13, marginBottom: 8 }}
                  required
                >
                  {categories.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                {/* Botones de categorías frecuentes */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {DEFAULT_INITIAL_EXPENSE_CATEGORIES.slice(0, 8).map(catName => (
                    <button
                      key={catName}
                      type="button"
                      onClick={() => setFormCategory(catName)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        border: formCategory === catName ? '1px solid var(--brand-500)' : '1px solid var(--border)',
                        background: formCategory === catName ? 'var(--brand-50)' : 'var(--bg-card)',
                        color: formCategory === catName ? 'var(--brand-700)' : 'var(--text-secondary)',
                        fontSize: 11,
                        cursor: 'pointer'
                      }}
                    >
                      {catName}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3.D Nombre / Identificador */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Nombre / Identificador *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ej: Local Bellavista, Luz oficina central, Sueldos Juan Pérez…"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  style={{ width: '100%', height: 40, fontSize: 13 }}
                />
              </div>

              {/* 3.C Descripción / Concepto */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Descripción / Concepto *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ej: Canon mensual de arrendamiento, Factura de electricidad mes de Mayo…"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  required
                  style={{ width: '100%', height: 40, fontSize: 13 }}
                />
              </div>

              {/* 3.E Monto y Moneda con conversión bimonetaria en vivo */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Monto *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value)}
                    required
                    style={{ width: '100%', height: 40, fontSize: 14, fontWeight: 700 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Moneda
                  </label>
                  <select
                    value={formCurrency}
                    onChange={e => setFormCurrency(e.target.value as any)}
                    className="input"
                    style={{ width: '100%', height: 40, fontSize: 13, fontWeight: 700 }}
                  >
                    <option value="USD">USD ($)</option>
                    <option value="VES">VES (Bs.)</option>
                  </select>
                </div>
              </div>

              {/* Equivalencia en vivo */}
              {parseFloat(formAmount) > 0 && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    marginBottom: 16
                  }}
                >
                  Equivalente con tasa BCV ({activeRate.toFixed(2)}):{' '}
                  <strong style={{ color: 'var(--text-main)' }}>
                    {formCurrency === 'USD'
                      ? `Bs. ${convertUSDtoVES(parseFloat(formAmount), activeRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : `$ ${convertVEStoUSD(parseFloat(formAmount), activeRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </strong>
                </div>
              )}

              {/* 3.F Fecha Límite / Vencimiento y 3.G Frecuencia de Reprogramación */}
              <div style={{ display: 'grid', gridTemplateColumns: formType === 'FIJO' ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {formType === 'FIJO' ? 'Primer Vencimiento *' : 'Fecha del Gasto *'}
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={formDueDate}
                    onChange={e => setFormDueDate(e.target.value)}
                    required
                    style={{ width: '100%', height: 40, fontSize: 13 }}
                  />
                </div>

                {formType === 'FIJO' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Frecuencia de Reprogramación *
                    </label>
                    <select
                      value={formFrequency}
                      onChange={e => setFormFrequency(e.target.value as ExpenseFrequency)}
                      className="input"
                      style={{ width: '100%', height: 40, fontSize: 13 }}
                    >
                      <option value="SEMANAL">Semanal (cada 7 días)</option>
                      <option value="QUINCENAL">Quincenal (cada 15 días)</option>
                      <option value="MENSUAL">Mensual (cada 30 días)</option>
                      <option value="BIMESTRAL">Bimestral (cada 60 días)</option>
                      <option value="TRIMESTRAL">Trimestral (cada 90 días)</option>
                      <option value="SEMESTRAL">Semestral (cada 180 días)</option>
                      <option value="ANUAL">Anual (cada 365 días)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* 3.H Notas Adicionales */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Notas Adicionales (Opcional)
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Detalles sobre el proveedor, factura o comprobante…"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  style={{ width: '100%', height: 'auto', fontSize: 13, padding: '8px 12px' }}
                />
              </div>

              {/* Banner de Error / RLS en Formulario */}
              {formError && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    marginBottom: 16,
                    fontSize: 12,
                    color: '#991b1b'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block', marginBottom: 2 }}>Error al guardar en Supabase:</strong>
                      <span style={{ lineHeight: 1.4 }}>{formError}</span>
                      {/row-level security|RLS|seguridad|política/i.test(formError) && (
                        <div style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            onClick={() => {
                              copySqlToClipboard();
                              setIsSqlModalOpen(true);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '5px 12px',
                              borderRadius: 6,
                              background: '#ef4444',
                              color: '#fff',
                              fontSize: 11,
                              fontWeight: 600,
                              border: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            <Copy size={12} /> Copiar SQL para corregir RLS en Supabase
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 3.I Acciones del Formulario */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  borderTop: '1px solid #e2e8f0',
                  padding: '16px 24px',
                  margin: '20px -24px -24px',
                  background: '#f8fafc',
                  borderRadius: '0 0 16px 16px'
                }}
              >
                <Button type="button" variant="secondary" onClick={() => setIsFormModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={formIsSubmitting} style={{ minWidth: 140 }}>
                  {formIsSubmitting ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <RefreshCw size={14} className="animate-spin" /> Guardando…
                    </span>
                  ) : editingExpense ? (
                    'Actualizar Gasto'
                  ) : (
                    'Guardar Gasto'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. MODAL PARA REGISTRAR PAGO DE GASTO */}
      {isPayModalOpen && payingExpense && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 2600,
            padding: 16
          }}
          onClick={() => setIsPayModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              width: '100%',
              maxWidth: 520,
              maxHeight: '90vh',
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)'
            }}
            onClick={e => e.stopPropagation()}
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
                    borderRadius: 10,
                    background: '#ecfdf5',
                    color: '#059669',
                    display: 'grid',
                    placeItems: 'center'
                  }}
                >
                  <CreditCard size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-main)' }}>
                    PAGAR GASTO
                  </h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {payingExpense.name} · {payingExpense.category}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: 4
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} style={{ padding: '20px 24px' }}>
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: 'var(--brand-50)',
                  border: '1px solid var(--border)',
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Monto programado
                  </span>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand-700)' }}>
                    {payingExpense.currency === 'USD' ? '$' : 'Bs.'}{' '}
                    {Number(payingExpense.amount).toFixed(2)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Vencimiento actual
                  </span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                    {payingExpense.due_date}
                  </div>
                </div>
              </div>

              {/* Monto de pago y Moneda */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                    Monto a Pagar *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="input"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    required
                    style={{ width: '100%', height: 40, fontSize: 14, fontWeight: 700 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                    Moneda
                  </label>
                  <select
                    value={payCurrency}
                    onChange={e => setPayCurrency(e.target.value as any)}
                    className="input"
                    style={{ width: '100%', height: 40, fontSize: 13, fontWeight: 700 }}
                  >
                    <option value="USD">USD ($)</option>
                    <option value="VES">VES (Bs.)</option>
                  </select>
                </div>
              </div>

              {/* Cuenta bancaria / Caja a debitar */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                  Debitar de Cuenta Bancaria / Caja
                </label>
                <select
                  value={payBankAccountId}
                  onChange={e => setPayBankAccountId(e.target.value)}
                  className="input"
                  style={{ width: '100%', height: 40, fontSize: 13 }}
                >
                  <option value="">(Sin débito automático en tesorería)</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name || b.name} — {b.currency} (Saldo: {b.balance ? Number(b.balance).toFixed(2) : '0.00'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Método de Pago y Fecha */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                    Método de Pago
                  </label>
                  <select
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value)}
                    className="input"
                    style={{ width: '100%', height: 40, fontSize: 13 }}
                  >
                    <option value="Transferencia bancaria">Transferencia bancaria</option>
                    <option value="Pago Móvil">Pago Móvil</option>
                    <option value="Efectivo USD">Efectivo USD</option>
                    <option value="Efectivo VES">Efectivo VES</option>
                    <option value="Punto de Venta / Tarjeta">Punto de Venta / Tarjeta</option>
                    <option value="Zelle">Zelle</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                    Fecha del Pago *
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                    required
                    style={{ width: '100%', height: 40, fontSize: 13 }}
                  />
                </div>
              </div>

              {/* Referencia */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase' }}>
                  Referencia / N° de Comprobante
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ej: REF-88129, Transferencia Banesco…"
                  value={payReference}
                  onChange={e => setPayReference(e.target.value)}
                  style={{ width: '100%', height: 40, fontSize: 13 }}
                />
              </div>

              {/* Reprogramación para Gastos Fijos */}
              {payingExpense.type === 'FIJO' && (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#f8fafc',
                    border: '1px solid var(--border)',
                    marginBottom: 16
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
                    <input
                      type="checkbox"
                      checked={payReschedule}
                      onChange={e => setPayReschedule(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--brand-500)' }}
                    />
                    <span>Reprogramar automáticamente para el siguiente período ({payingExpense.frequency || 'MENSUAL'})</span>
                  </label>
                  {payReschedule && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, marginLeft: 24 }}>
                      Próxima fecha estimada:{' '}
                      <strong>{calculateNextDueDate(payingExpense.due_date, payingExpense.frequency)}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Acciones Modal de Pago */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  borderTop: '1px solid #e2e8f0',
                  padding: '16px 24px',
                  margin: '20px -24px -24px',
                  background: '#f8fafc',
                  borderRadius: '0 0 16px 16px'
                }}
              >
                <Button type="button" variant="secondary" onClick={() => setIsPayModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" disabled={payIsSubmitting} style={{ minWidth: 150 }}>
                  {payIsSubmitting ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <RefreshCw size={14} className="animate-spin" /> Procesando…
                    </span>
                  ) : (
                    'Confirmar Pago'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL DE CONFIRMACIÓN PARA ELIMINAR */}
      {deleteConfirmExpense && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 2700,
            padding: 16
          }}
          onClick={() => setDeleteConfirmExpense(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: 440,
              padding: 24,
              border: '1px solid var(--border)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.22)',
              textAlign: 'center'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: '#fee2e2',
                color: '#ef4444',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 16px'
              }}
            >
              <Trash2 size={24} />
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>
              ¿Eliminar gasto?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)' }}>
              ¿Estás seguro de que deseas eliminar permanentemente{' '}
              <strong style={{ color: 'var(--text-main)' }}>"{deleteConfirmExpense.name}"</strong>? Esta acción no se puede deshacer.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Button type="button" variant="secondary" onClick={() => setDeleteConfirmExpense(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleDeleteExpense}
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
              >
                Sí, Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL CÓDIGO SQL DE SUPABASE */}
      {isSqlModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 2800,
            padding: 16
          }}
          onClick={() => setIsSqlModalOpen(false)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: 720,
              maxHeight: '90vh',
              overflowY: 'auto',
              border: '1px solid var(--border)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'var(--brand-50)',
                    color: 'var(--brand-600)',
                    display: 'grid',
                    placeItems: 'center'
                  }}
                >
                  <FileText size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-main)' }}>
                    CÓDIGO SQL PARA SUPABASE (TABLA GASTOS)
                  </h3>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Copia y ejecuta este script en el SQL Editor de tu consola de Supabase
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSqlModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: 4
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Script de migración: <code>supabase/migrations/0016_expenses_module.sql</code>
                </span>
                <Button
                  variant="primary"
                  onClick={copySqlToClipboard}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                  {isCopiedSql ? <Check size={14} /> : <Copy size={14} />}
                  {isCopiedSql ? '¡Copiado!' : 'Copiar Código SQL'}
                </Button>
              </div>

              <pre
                style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  padding: 16,
                  borderRadius: 10,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  maxHeight: 400,
                  border: '1px solid #334155',
                  lineHeight: 1.5
                }}
              >
                {supabaseSqlScript}
              </pre>

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setIsSqlModalOpen(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
