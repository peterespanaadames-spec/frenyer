import { useState, useEffect } from 'react';
import {
  CircleDollarSign,
  Plus,
  Search,
  Download,
  Calendar,
  CheckCircle,
  Building,
  CreditCard,
  X,
  FileText,
  Clock,
  AlertTriangle,
  ChevronRight,
  DollarSign,
  Tag
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { formatUSD, formatVES, getActiveExchangeRate } from '../../../lib/currency';
import { supabase } from '../../../lib/supabase/client';
import { fetchSuppliersFromSupabase, createSupplierInSupabase, getActiveOrgId, DbSupplier } from '../../../lib/supabase/db';

interface PayableRecord {
  id: string;
  supplier_id?: string | null;
  supplier_name: string;
  doc_number: string;
  concept: string;
  origin: 'Manual' | 'Gasto' | 'Compra Interna';
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  issue_date: string;
  due_date: string;
  status: 'Pendiente' | 'Parcial' | 'Pagada' | 'Vencida';
  description?: string;
  payments_history?: { date: string; amount: number; bank_name: string; ref: string }[];
}

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  currency: string;
  balance: number;
  status: string;
}

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

function escapeHtml(value: string | number | undefined): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

function toCsvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function AccountsPayablePage() {
  const [payables, setPayables] = useState<PayableRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [suppliersList, setSuppliersList] = useState<DbSupplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('Todos');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('Todos');
  const [selectedPayable, setSelectedPayable] = useState<PayableRecord | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const activeRate = getActiveExchangeRate();

  // Modals
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  // Manual Payable Form State
  const [manualOrigin] = useState<'Manual' | 'Gasto' | 'Compra Interna'>('Manual');
  const [manualSupplier, setManualSupplier] = useState('');
  const [manualDoc, setManualDoc] = useState('');
  const [manualConcept, setManualConcept] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [manualInitial, setManualInitial] = useState('');
  const [manualIssueDate, setManualIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualDueDate, setManualDueDate] = useState('');

  // Quick Supplier Creation State inside AccountsPayable
  const [isQuickSupplierOpen, setIsQuickSupplierOpen] = useState(false);
  const [quickSupName, setQuickSupName] = useState('');
  const [quickSupDocType, setQuickSupDocType] = useState('RIF (J / G / V)');
  const [quickSupDocNumber, setQuickSupDocNumber] = useState('');
  const [quickSupPhone, setQuickSupPhone] = useState('');
  const [isSavingQuickSup, setIsSavingQuickSup] = useState(false);

  const handleSaveQuickSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSupName.trim() || !quickSupDocNumber.trim()) {
      showToast('Ingresa el Nombre y el RIF / Identificación del proveedor.', 'info');
      return;
    }
    setIsSavingQuickSup(true);
    try {
      const created = await createSupplierInSupabase({
        name: quickSupName.trim(),
        doc_type: quickSupDocType,
        doc_number: quickSupDocNumber.trim(),
        phone: quickSupPhone.trim(),
        status: 'Activo',
        category: 'General',
        balance_usd: 0
      });
      if (created) {
        showToast(`✅ Proveedor "${created.name}" creado exitosamente.`);
        setSuppliersList((current) => [
          created,
          ...current.filter((supplier) => supplier.id !== created.id)
        ]);
        setManualSupplier(created.id);
        setIsQuickSupplierOpen(false);
        setQuickSupName('');
        setQuickSupDocNumber('');
        setQuickSupPhone('');
      } else {
        showToast('No se pudo crear el proveedor. Inicie sesión y verifique su membresía de organización.', 'info');
      }
    } catch (err) {
      console.error('Error saving supplier:', err);
      showToast('Error al guardar el proveedor en Supabase.', 'info');
    } finally {
      setIsSavingQuickSup(false);
    }
  };

  // Payment Modal State
  const [payAmount, setPayAmount] = useState('');
  const [payBankId, setPayBankId] = useState('');
  const [payReference, setPayReference] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Load Data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      if (authError) {
        throw authError;
      }
      if (!authData.session) {
        setIsAuthenticated(false);
        setAuthMessage('');
        setSuppliersList([]);
        setBankAccounts([]);
        setPayables([]);
        return;
      }

      const organizationId = await getActiveOrgId();
      if (!organizationId) {
        setIsAuthenticated(false);
        setAuthMessage('El usuario inició sesión, pero no pertenece a ninguna organización autorizada.');
        setSuppliersList([]);
        setBankAccounts([]);
        setPayables([]);
        return;
      }

      setIsAuthenticated(true);
      setAuthMessage('');
      const [sups, bankResult, payableResult] = await Promise.all([
        fetchSuppliersFromSupabase(organizationId),
        supabase
          .from('bank_accounts')
          .select('id, bank_name, account_number, currency, balance, status')
          .eq('organization_id', organizationId)
          .eq('status', 'Activo')
          .order('bank_name', { ascending: true }),
        supabase
          .from('accounts_payable')
          .select(`
            *,
            payable_payments (
              id,
              amount_usd,
              payment_date,
              payment_method,
              reference
            )
          `)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
      ]);
      setSuppliersList(sups);

      const { data: banks, error: bankError } = bankResult;
      if (bankError) {
        throw new Error(`Error cargando cuentas bancarias: ${bankError.message}`);
      }
      setBankAccounts(banks || []);

      const { data, error } = payableResult;
      if (error) {
        console.error('Error loading accounts payable from Supabase:', error.message);
        showToast(`Error cargando cuentas por pagar: ${error.message}`, 'info');
        return;
      }

      if (data) {
        const suppliersById = new Map<string, DbSupplier>(
          sups.map((supplier) => [supplier.id, supplier] as const)
        );
        const mapped: PayableRecord[] = data.map((item: any) => {
          const total = Number(item.total_usd ?? item.total_amount ?? 0);
          const history = (item.payable_payments || []).map((p: any) => ({
            date: p.payment_date ? p.payment_date.slice(0, 10) : '',
            amount: Number(p.amount_usd) || 0,
            bank_name: p.payment_method || '',
            ref: p.reference || ''
          }));
          const paidFromHistory = history.reduce((sum: number, h: any) => sum + h.amount, 0);
          const balance = item.balance_usd != null && Number.isFinite(Number(item.balance_usd))
            ? Number(item.balance_usd)
            : Math.max(0, total - paidFromHistory);
          const paid = total - balance;
          const rawStatus = (item.status || '').toUpperCase();
          const st = balance <= 0 || rawStatus === 'PAGADO' || rawStatus === 'PAGADA' ? 'Pagada' : (balance < total && balance > 0) || rawStatus === 'PARCIAL' ? 'Parcial' : 'Pendiente';

          return {
            id: item.id,
            supplier_id: item.supplier_id || null,
            supplier_name: suppliersById.get(item.supplier_id)?.name || item.supplier_name || '',
            doc_number: item.doc_number || '',
            concept: item.concept || '',
            origin: item.origin || 'Manual',
            total_amount: total,
            paid_amount: paid,
            remaining_amount: balance,
            issue_date: item.created_at ? item.created_at.slice(0, 10) : '',
            due_date: item.due_date || '',
            status: st,
            description: item.description || '',
            payments_history: history
          };
        });
        setPayables(mapped);
      } else {
        setPayables([]);
      }
    } catch (err) {
      console.error('Error loading accounts payable:', err);
      showToast(
        `Error cargando datos de CxP: ${err instanceof Error ? err.message : 'Error de conexión.'}`,
        'info'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    setAuthMessage('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: signInEmail.trim(),
        password: signInPassword
      });
      if (error) {
        throw error;
      }
      setSignInPassword('');
      await loadData();
    } catch (err) {
      console.error('Supabase sign-in failed:', err);
      setAuthMessage(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Supabase sign-out failed:', error.message);
      showToast('No se pudo cerrar la sesión: ' + error.message, 'info');
      return;
    }
    setIsAuthenticated(false);
    setAuthMessage('');
    setPayables([]);
    setBankAccounts([]);
    setSuppliersList([]);
  };

  useEffect(() => {
    loadData();
  }, []);

  // KPIs Calculations
  const totalObligaciones = payables.reduce((acc, r) => acc + r.total_amount, 0);
  const totalPendiente = payables.reduce((acc, r) => acc + r.remaining_amount, 0);
  const totalVencido = payables
    .filter(r => r.status !== 'Pagada' && new Date(r.due_date) < new Date())
    .reduce((acc, r) => acc + r.remaining_amount, 0);
  const uniqueSuppliersWithBalance = new Set(
    payables.filter(r => r.remaining_amount > 0).map(r => r.supplier_name)
  ).size;

  // Filtered List
  const filteredPayables = payables.filter(r => {
    const matchesSearch =
      r.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.doc_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.concept.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSupplier = selectedSupplierFilter === 'Todos' || r.supplier_name === selectedSupplierFilter;
    const matchesStatus =
      selectedStatusFilter === 'Todos' ||
      r.status.toLowerCase() === selectedStatusFilter.toLowerCase();
    return matchesSearch && matchesSupplier && matchesStatus;
  });

  // Handle Save Manual / Expense / Purchase Payable
  const handleSaveManualPayable = async (e: React.FormEvent) => {
    e.preventDefault();
    const supplier = suppliersList.find((item) => item.id === manualSupplier);
    const totalAmt = Number(manualTotal);
    const initialAmt = manualInitial.trim() ? Number(manualInitial) : 0;
    if (!supplier || !manualDoc.trim() || !manualTotal.trim()) {
      showToast('Seleccione un proveedor y complete los campos obligatorios.', 'info');
      return;
    }
    if (!Number.isFinite(totalAmt) || totalAmt <= 0 ||
        !Number.isFinite(initialAmt) || initialAmt < 0 || initialAmt > totalAmt) {
      showToast('El monto total debe ser mayor a cero y el abono inicial no puede superar el total.', 'info');
      return;
    }
    if (!Number.isFinite(activeRate) || activeRate <= 0) {
      showToast('La tasa de cambio vigente no es válida.', 'info');
      return;
    }

    setIsSubmittingPayment(true); // Assuming I can reuse this state or create a new one to disable button

    try {
      const { error } = await supabase.rpc('create_payable_with_initial_payment', {
        p_supplier_id: supplier.id,
        p_doc_number: manualDoc.trim(),
        p_concept: manualConcept.trim() || `Obligación (${manualOrigin})`,
        p_origin: manualOrigin,
        p_total_usd: totalAmt,
        p_initial_usd: initialAmt,
        p_issue_date: manualIssueDate,
        p_due_date: manualDueDate || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
        p_description: manualDescription.trim() || `Registrado por ${manualOrigin}`,
        p_exchange_rate: activeRate
      });
      if (error) {
        throw new Error(error.message);
      }

      showToast(`Obligación con ${supplier.name} registrada con éxito.`);
      
      // Reset form ONLY on success
      setIsManualModalOpen(false);
      setManualSupplier('');
      setManualDoc('');
      setManualConcept('');
      setManualDescription('');
      setManualTotal('');
      setManualInitial('');
      setManualIssueDate(new Date().toISOString().slice(0, 10));
      setManualDueDate('');

      // Reload fresh data from Supabase
      await loadData();
    } catch (err: any) {
      console.error('Error saving payable:', err);
      showToast('Error al guardar la cuenta: ' + (err instanceof Error ? err.message : 'Error inesperado'), 'info');
    } finally {
        setIsSubmittingPayment(false);
    }
  };

  // Handle Process Payment / Abono to Supplier
  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayable || !payAmount || !payBankId) {
      showToast('Seleccione cuenta bancaria e ingrese el monto.', 'info');
      return;
    }

    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > selectedPayable.remaining_amount) {
      showToast('Monto de abono inválido o superior al saldo pendiente.', 'info');
      return;
    }
    if (!Number.isFinite(activeRate) || activeRate <= 0) {
      showToast('La tasa de cambio vigente no es válida.', 'info');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const targetBank = bankAccounts.find(b => b.id === payBankId);
      if (!targetBank) {
        throw new Error('La cuenta bancaria seleccionada ya no está disponible.');
      }
      if (targetBank.currency !== 'USD' && targetBank.currency !== 'VES') {
        throw new Error('La cuenta bancaria debe estar denominada en USD o VES.');
      }

      const bankName = `${targetBank.bank_name} (${targetBank.currency})`;
      const { error } = await supabase.rpc('record_payable_payment', {
        p_payable_id: selectedPayable.id,
        p_bank_account_id: payBankId,
        p_amount_usd: amt,
        p_exchange_rate: activeRate,
        p_payment_method: bankName,
        p_reference: payReference.trim() || 'PAGO-PROV'
      });
      if (error) {
        throw new Error(error.message);
      }

      showToast(`✅ Pago de $${amt.toFixed(2)} registrado y debitado de ${bankName}.`);
      setIsPayModalOpen(false);
      setPayAmount('');
      setPayReference('');
      setPayBankId('');

      // Reload fresh data from Supabase to sync history and status
      await loadData();
    } catch (err) {
      console.error('Error processing payable payment:', err);
      showToast('Error procesando pago: ' + (err instanceof Error ? err.message : 'Error de red'), 'info');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    setIsExportDropdownOpen(false);
    if (filteredPayables.length === 0) {
      showToast('No hay cuentas por pagar para exportar.', 'info');
      return;
    }
    const headers = [
      'Proveedor',
      'Documento',
      'Origen',
      'Concepto',
      'Monto Total (USD)',
      'Pagado (USD)',
      'Saldo Pendiente (USD)',
      'Fecha Emisión',
      'Fecha Vencimiento',
      'Estado'
    ].map(toCsvCell).join(',');
    const rows = filteredPayables.map((account) => [
      account.supplier_name,
      account.doc_number,
      account.origin,
      account.concept,
      account.total_amount,
      account.paid_amount,
      account.remaining_amount,
      account.issue_date,
      account.due_date,
      account.status
    ].map(toCsvCell).join(',')).join('\n');

    const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cuentas_por_pagar_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Reporte CSV compatible con Excel exportado con éxito.');
  };

  // Export PDF
  const handleExportPDF = () => {
    setIsExportDropdownOpen(false);
    if (filteredPayables.length === 0) {
      showToast('No hay cuentas por pagar para exportar.', 'info');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Permite las ventanas emergentes para generar el PDF.', 'info');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reporte de Cuentas por Pagar - Frenyer ERP</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1e293b; padding: 30px; margin: 0; }
          h2 { color: #7c3aed; margin-bottom: 5px; }
          p { color: #64748b; font-size: 13px; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
          th { background: #f1f5f9; color: #334155; font-weight: bold; }
          tr:nth-child(even) { background: #f8fafc; }
          .footer { margin-top: 30px; font-size: 11px; color: #94a3b8; text-align: right; }
        </style>
      </head>
      <body>
        <h2>Frenyer ERP - Reporte de Cuentas por Pagar (CxP)</h2>
        <p>Generado el: ${new Date().toLocaleString()} | Total de obligaciones: ${filteredPayables.length}</p>
        <table>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Documento</th>
              <th>Origen</th>
              <th>Concepto</th>
              <th>Total ($)</th>
              <th>Pagado ($)</th>
              <th>Saldo ($)</th>
              <th>Emisión</th>
              <th>Vencimiento</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${filteredPayables.map(acc => `
              <tr>
                <td>${escapeHtml(acc.supplier_name)}</td>
                <td>${escapeHtml(acc.doc_number)}</td>
                <td>${escapeHtml(acc.origin)}</td>
                <td>${escapeHtml(acc.concept)}</td>
                <td>$${acc.total_amount.toFixed(2)}</td>
                <td>$${acc.paid_amount.toFixed(2)}</td>
                <td>$${acc.remaining_amount.toFixed(2)}</td>
                <td>${escapeHtml(acc.issue_date)}</td>
                <td>${escapeHtml(acc.due_date)}</td>
                <td><strong>${escapeHtml(acc.status)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">
          Frenyer ERP Bimonetario · Sistema de Gestión Empresarial
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    showToast('Reporte PDF listo para impresión / descarga.');
  };

  const uniqueSupplierNames = Array.from(new Set(payables.map(a => a.supplier_name)));

  return (
    <div className="content" style={{ paddingBottom: 50 }}>
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
          fontWeight: 700
        }}>
          {toast.message}
        </div>
      )}

      {/* Page Header */}
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
            Cuentas por Pagar (CxP)
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            Control de obligaciones comerciales, facturas de proveedores, gastos y compras internas (Sincronizado con Bancos)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setIsManualModalOpen(true)}
            disabled={!isAuthenticated}
            style={{
              height: 40,
              padding: '0 16px',
              borderRadius: 10,
              background: '#7c3aed',
              color: '#fff',
              border: 'none',
              fontSize: 13,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: isAuthenticated ? 'pointer' : 'not-allowed',
              opacity: isAuthenticated ? 1 : 0.55,
              boxShadow: '0 4px 12px rgba(124,58,237,0.3)'
            }}
          >
            <Plus size={16} style={{ color: '#40E0D0' }} /> Registrar obligación
          </button>
          
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              style={{
                height: 40,
                padding: '0 16px',
                borderRadius: 10,
                background: '#fff',
                color: '#475569',
                border: '1px solid var(--border)',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer'
              }}
            >
              <Download size={16} /> Exportar reporte ▾
            </button>
            {isExportDropdownOpen && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: 45,
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 10,
                boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                zIndex: 100,
                width: 180,
                overflow: 'hidden'
              }}>
                <button
                  onClick={handleExportPDF}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    borderBottom: '1px solid #f1f5f9'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  <span style={{ color: '#ef4444' }}>📄</span> Exportar PDF
                </button>
                <button
                  onClick={handleExportCSV}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  <span style={{ color: '#10b981' }}>📊</span> Exportar CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isAuthenticated && !isLoading && (
        <div role="alert" style={{
          marginBottom: 20,
          padding: '14px 16px',
          borderRadius: 12,
          border: '1px solid #fcd34d',
          background: '#fffbeb',
          color: '#92400e',
          fontSize: 13,
          lineHeight: 1.5
        }}>
          <p style={{ margin: '0 0 12px' }}>
            {authMessage || 'Inicie sesión en Supabase con un usuario que pertenezca a la organización activa para consultar y registrar cuentas por pagar.'}
          </p>
          <form onSubmit={handleSignIn} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input
              type="email"
              autoComplete="username"
              required
              aria-label="Correo electrónico"
              placeholder="Correo electrónico"
              value={signInEmail}
              onChange={(e) => setSignInEmail(e.target.value)}
              style={{ minWidth: 190, height: 38, padding: '0 10px', borderRadius: 8, border: '1px solid #fcd34d' }}
            />
            <input
              type="password"
              autoComplete="current-password"
              required
              aria-label="Contraseña"
              placeholder="Contraseña"
              value={signInPassword}
              onChange={(e) => setSignInPassword(e.target.value)}
              style={{ minWidth: 170, height: 38, padding: '0 10px', borderRadius: 8, border: '1px solid #fcd34d' }}
            />
            <button
              type="submit"
              disabled={isSigningIn}
              style={{ height: 38, padding: '0 14px', border: 0, borderRadius: 8, background: '#7c3aed', color: '#fff', fontWeight: 700, cursor: isSigningIn ? 'wait' : 'pointer' }}
            >
              {isSigningIn ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
            {authMessage.includes('no pertenece') && (
              <button
                type="button"
                onClick={handleSignOut}
                style={{ height: 38, padding: '0 14px', border: '1px solid #fcd34d', borderRadius: 8, background: '#fff', color: '#92400e', fontWeight: 700, cursor: 'pointer' }}
              >
                Cerrar sesión
              </button>
            )}
          </form>
        </div>
      )}

      {/* 4 KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="kpi-label" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
            TOTAL OBLIGACIONES
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>
            {formatVES(totalObligaciones * activeRate)} · {formatUSD(totalObligaciones, '$ ')}
          </div>
          <span className="muted small" style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>
            Facturado por proveedores
          </span>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="kpi-label" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
            SALDO PENDIENTE
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>
            {formatVES(totalPendiente * activeRate)} · {formatUSD(totalPendiente, '$ ')}
          </div>
          <span className="muted small" style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>
            Por pagar actualmente
          </span>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="kpi-label" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
            SALDOS VENCIDOS
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#b91c1c', marginTop: 8 }}>
            {formatVES(totalVencido * activeRate)} · {formatUSD(totalVencido, '$ ')}
          </div>
          <span className="muted small" style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>
            En mora comercial
          </span>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="kpi-label" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
            PROVEEDORES CON SALDO
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed', marginTop: 8 }}>
            {uniqueSuppliersWithBalance}
          </div>
          <span className="muted small" style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>
            Acreedores activos
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Buscar por proveedor, documento o concepto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                height: 40,
                paddingLeft: 38,
                paddingRight: 12,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: '#f8fafc',
                fontSize: 13,
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Proveedor:</span>
            <select
              value={selectedSupplierFilter}
              onChange={(e) => setSelectedSupplierFilter(e.target.value)}
              style={{ height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13 }}
            >
              <option value="Todos">Todos los proveedores</option>
              {uniqueSupplierNames.map(sup => (
                <option key={sup} value={sup}>{sup}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Estado:</span>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              style={{ height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontSize: 13 }}
            >
              <option value="Todos">Todos los estados</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Parcial">Parcial</option>
              <option value="Pagada">Pagada</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)', color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
                <th style={{ padding: '14px 16px' }}>Proveedor / Acreedor</th>
                <th style={{ padding: '14px 16px' }}>Documento</th>
                <th style={{ padding: '14px 16px' }}>Origen</th>
                <th style={{ padding: '14px 16px' }}>Concepto</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Total ($)</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Pagado ($)</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Saldo Pendiente</th>
                <th style={{ padding: '14px 16px' }}>Vencimiento</th>
                <th style={{ padding: '14px 16px', textAlign: 'center' }}>Estado</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    Cargando cuentas por pagar...
                  </td>
                </tr>
              ) : filteredPayables.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    No se encontraron cuentas por pagar registradas.
                  </td>
                </tr>
              ) : (
                filteredPayables.map(item => {
                  const isOverdue = item.status !== 'Pagada' && new Date(item.due_date) < new Date();
                  const badgeTone =
                    item.status === 'Pagada'
                      ? 'success'
                      : item.status === 'Parcial'
                      ? 'brand'
                      : isOverdue
                      ? 'danger'
                      : 'warning';

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Building size={14} style={{ color: '#7c3aed' }} /> {item.supplier_name}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontWeight: 600, color: '#334155', background: '#f1f5f9', padding: '3px 8px', borderRadius: 6, fontSize: 11 }}>
                          {item.doc_number}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: 6 }}>
                          {item.origin}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#475569', maxWidth: 200 }} title={item.concept}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.concept}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                        {formatUSD(item.total_amount, '$ ')}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>
                        {formatUSD(item.paid_amount, '$ ')}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 800, color: item.remaining_amount > 0 ? '#b91c1c' : '#059669' }}>
                        {formatUSD(item.remaining_amount, '$ ')}
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
                          {formatVES(item.remaining_amount * activeRate)}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#64748b', fontSize: 12 }}>
                        {item.due_date}
                        {isOverdue && (
                          <span style={{ display: 'block', color: '#b91c1c', fontSize: 10, fontWeight: 700 }}>VENCIDA</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <Badge tone={badgeTone as any}>
                          {isOverdue && item.status !== 'Pagada' ? 'Vencida' : item.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {item.remaining_amount > 0 && (
                            <button
                              disabled={!isAuthenticated}
                              onClick={() => {
                                setSelectedPayable(item);
                                setPayAmount(item.remaining_amount.toString());
                                setIsPayModalOpen(true);
                              }}
                              style={{
                                height: 32,
                                padding: '0 10px',
                                borderRadius: 8,
                                background: '#7c3aed',
                                color: '#fff',
                                border: 'none',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: isAuthenticated ? 'pointer' : 'not-allowed',
                                opacity: isAuthenticated ? 1 : 0.55,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                              title="Pagar / Abonar obligación"
                            >
                              <DollarSign size={13} /> Pagar
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedPayable(item);
                              setIsDetailModalOpen(true);
                            }}
                            style={{
                              height: 32,
                              padding: '0 10px',
                              borderRadius: 8,
                              background: '#f1f5f9',
                              color: '#334155',
                              border: '1px solid var(--border)',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                            title="Ver detalles e historial"
                          >
                            Detalles
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual / Expense / Purchase Registration Modal */}
      {isManualModalOpen && (() => {
        const liveTotal = parseFloat(manualTotal) || 0;
        const liveInitial = parseFloat(manualInitial) || 0;
        const liveRemaining = Math.max(0, Math.round((liveTotal - liveInitial) * 100) / 100);
        const liveStatus = liveRemaining === 0 && liveTotal > 0 ? 'Pagada' : liveInitial > 0 ? 'Parcial' : 'Pendiente';

        return (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: 20
          }}>
            <div className="card" style={{
              width: '100%',
              maxWidth: 880,
              background: '#ffffff',
              padding: '24px 28px',
              position: 'relative',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              maxHeight: '92vh',
              overflowY: 'auto'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, borderBottom: '1px solid #f1f5f9', paddingBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    backgroundColor: 'rgba(124, 58, 237, 0.1)',
                    color: '#7c3aed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <FileText size={22} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      Registrar Cuenta por Pagar (CxP)
                    </h2>
                    <p style={{ fontSize: 12, color: '#64748b', margin: '2px 0 0' }}>
                      Registre una nueva obligación comercial vinculada a sus proveedores en USD y VES.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveManualPayable} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Fila 1: Proveedor, Factura y Concepto */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                        Proveedor / Acreedor *
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsQuickSupplierOpen(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#7c3aed',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3
                        }}
                      >
                        <Plus size={12} /> Nuevo Proveedor
                      </button>
                    </div>

                    <select
                      required
                      value={manualSupplier}
                      onChange={(e) => {
                        if (e.target.value === '__CREATE_NEW_SUPPLIER__') {
                          setIsQuickSupplierOpen(true);
                        } else {
                          setManualSupplier(e.target.value);
                        }
                      }}
                      style={{
                        width: '100%',
                        height: 42,
                        padding: '0 12px',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        fontSize: 13,
                        backgroundColor: '#ffffff',
                        color: 'var(--fg)'
                      }}
                    >
                      <option value="">-- Seleccionar Proveedor --</option>
                      {suppliersList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.doc_number ? `(${s.doc_number})` : ''}
                        </option>
                      ))}
                      <option value="__CREATE_NEW_SUPPLIER__" style={{ fontWeight: 700, color: '#7c3aed' }}>
                        + Crear nuevo proveedor...
                      </option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Nº Documento / Factura *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. FACT-0982 o COMP-102"
                      value={manualDoc}
                      onChange={(e) => setManualDoc(e.target.value)}
                      style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Concepto de la Obligación *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Factura por compra de insumos"
                      value={manualConcept}
                      onChange={(e) => setManualConcept(e.target.value)}
                      style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* Fila 2: Montos y Fechas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Monto Total (USD) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={manualTotal}
                      onChange={(e) => setManualTotal(e.target.value)}
                      style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Abono Inicial (USD) [Opcional]
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={manualInitial}
                      onChange={(e) => setManualInitial(e.target.value)}
                      style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Fecha de Emisión
                    </label>
                    <input
                      type="date"
                      value={manualIssueDate}
                      onChange={(e) => setManualIssueDate(e.target.value)}
                      style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Fecha de Vencimiento
                    </label>
                    <input
                      type="date"
                      value={manualDueDate}
                      onChange={(e) => setManualDueDate(e.target.value)}
                      style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}
                    />
                  </div>
                </div>

                {/* Banner Horizontal: Resumen Financiero en Vivo */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12
                }}>
                  <div>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', fontWeight: 600 }}>TOTAL OBLIGACIÓN</span>
                    <b style={{ fontSize: 14, color: '#0f172a' }}>{formatUSD(liveTotal, '$ ')}</b>
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>({formatVES(liveTotal * activeRate)})</span>
                  </div>

                  <div>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', fontWeight: 600 }}>ABONO INICIAL</span>
                    <b style={{ fontSize: 14, color: liveInitial > 0 ? '#059669' : '#64748b' }}>{formatUSD(liveInitial, '$ ')}</b>
                  </div>

                  <div>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', fontWeight: 600 }}>SALDO PENDIENTE RESULTANTE</span>
                    <b style={{ fontSize: 15, color: liveRemaining > 0 ? '#b91c1c' : '#059669' }}>
                      {formatUSD(liveRemaining, '$ ')}
                    </b>
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>({formatVES(liveRemaining * activeRate)})</span>
                  </div>

                  <div>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'block', fontWeight: 600, marginBottom: 2 }}>ESTADO</span>
                    <Badge tone={liveStatus === 'Pagada' ? 'success' : liveStatus === 'Parcial' ? 'brand' : 'warning'}>
                      {liveStatus}
                    </Badge>
                  </div>
                </div>

                {/* Fila 3: Observaciones */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Observaciones / Descripción Adicional
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Detalles adicionales de la cuenta por pagar, condiciones acordadas con el proveedor, etc..."
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, resize: 'none' }}
                  />
                </div>

                {/* Footer Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 4, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(false)}
                    style={{
                      height: 42,
                      padding: '0 20px',
                      borderRadius: 10,
                      background: '#f1f5f9',
                      color: '#475569',
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      height: 42,
                      padding: '0 26px',
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                      color: '#fff',
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)'
                    }}
                  >
                    <CheckCircle size={16} /> Guardar Obligación
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Modal: Crear Nuevo Proveedor Rápido */}
      {isQuickSupplierOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 4000,
            padding: 20
          }}
          onClick={() => setIsQuickSupplierOpen(false)}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 460,
              background: '#ffffff',
              padding: 24,
              position: 'relative',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsQuickSupplierOpen(false)}
              style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building size={20} style={{ color: '#7c3aed' }} /> Registrar Nuevo Proveedor
            </h3>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
              El proveedor se guardará directamente en Supabase y estará listo para asignarse a esta obligación.
            </p>

            <form onSubmit={handleSaveQuickSupplier} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                  Nombre / Razón Social *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Distribuidora Central, C.A."
                  value={quickSupName}
                  onChange={(e) => setQuickSupName(e.target.value)}
                  style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Tipo Doc.
                  </label>
                  <select
                    value={quickSupDocType}
                    onChange={(e) => setQuickSupDocType(e.target.value)}
                    style={{ width: '100%', height: 38, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, backgroundColor: '#fff' }}
                  >
                    <option value="RIF (J / G / V)">RIF</option>
                    <option value="Cédula (V / E)">Cédula</option>
                    <option value="Pasaporte">Pasaporte</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    RIF / Nº Identificación *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: J-12345678-0"
                    value={quickSupDocNumber}
                    onChange={(e) => setQuickSupDocNumber(e.target.value)}
                    style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                  Teléfono de Contacto
                </label>
                <input
                  type="text"
                  placeholder="Ej: 0414-1234567"
                  value={quickSupPhone}
                  onChange={(e) => setQuickSupPhone(e.target.value)}
                  style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setIsQuickSupplierOpen(false)}
                  style={{ height: 38, padding: '0 14px', borderRadius: 8, background: '#f1f5f9', color: '#475569', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickSup}
                  style={{ height: 38, padding: '0 18px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  {isSavingQuickSup ? 'Guardando...' : 'Guardar y Asignar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPayModalOpen && selectedPayable && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000,
          padding: 20
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 460, background: '#fff', padding: 24, position: 'relative', borderRadius: 16 }}>
            <button
              onClick={() => setIsPayModalOpen(false)}
              style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
            >
              <X size={20} />
            </button>

            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
              Pagar / Abonar a Proveedor
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
              <b>{selectedPayable.supplier_name}</b> · Doc: {selectedPayable.doc_number}
            </p>

            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, marginBottom: 16, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>SALDO PENDIENTE</span>
                <b style={{ color: '#b91c1c', fontSize: 16 }}>{formatUSD(selectedPayable.remaining_amount, '$ ')}</b>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>TASA BCV VIGENTE</span>
                <b style={{ color: '#0f172a', fontSize: 14 }}>{activeRate.toFixed(2)} VES/$</b>
              </div>
            </div>

            <form onSubmit={handleProcessPayment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                  Cuenta Bancaria Origen de Pago *
                </label>
                <select
                  required
                  value={payBankId}
                  onChange={(e) => setPayBankId(e.target.value)}
                  style={{ width: '100%', height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }}
                >
                  <option value="">Seleccione cuenta bancaria...</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} ({b.currency}) - Saldo: {b.balance.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                  Monto a Pagar (USD) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={selectedPayable.remaining_amount}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  style={{ width: '100%', height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                  Referencia de Transferencia / Pago
                </label>
                <input
                  type="text"
                  placeholder="Ej. REF-448291"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  style={{ width: '100%', height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  style={{ height: 40, padding: '0 16px', borderRadius: 10, background: '#f1f5f9', color: '#475569', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  style={{ height: 40, padding: '0 20px', borderRadius: 10, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {isSubmittingPayment ? 'Procesando...' : 'Confirmar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details & History Modal */}
      {isDetailModalOpen && selectedPayable && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000,
          padding: 20
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, background: '#fff', padding: 24, position: 'relative', borderRadius: 16 }}>
            <button
              onClick={() => setIsDetailModalOpen(false)}
              style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
            >
              <X size={20} />
            </button>

            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
              Detalle de Cuenta por Pagar
            </h2>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
              <b>{selectedPayable.supplier_name}</b> · Documento: {selectedPayable.doc_number}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, fontSize: 13 }}>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10 }}>
                <span style={{ color: '#64748b', fontSize: 11, display: 'block' }}>ORIGEN / CONCEPTO</span>
                <b>{selectedPayable.origin}</b> - {selectedPayable.concept}
              </div>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10 }}>
                <span style={{ color: '#64748b', fontSize: 11, display: 'block' }}>ESTADO ACTUAL</span>
                <b style={{ color: '#7c3aed' }}>{selectedPayable.status}</b>
              </div>
            </div>

            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: '0 0 8px' }}>
              Historial de Pagos y Abonos
            </h3>
            {(!selectedPayable.payments_history || selectedPayable.payments_history.length === 0) ? (
              <p style={{ fontSize: 12, color: '#94a3b8', background: '#f8fafc', padding: 16, borderRadius: 10, textAlign: 'center' }}>
                No hay abonos registrados para esta obligación.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto', marginBottom: 16 }}>
                {selectedPayable.payments_history.map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '10px 14px', borderRadius: 8, fontSize: 12 }}>
                    <div>
                      <b style={{ color: '#0f172a' }}>{formatUSD(p.amount, '$ ')}</b>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>{p.bank_name} · Ref: {p.ref}</span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>{p.date}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                style={{ height: 40, padding: '0 20px', borderRadius: 10, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
