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
  User,
  DollarSign
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { formatUSD, formatVES, getActiveExchangeRate } from '../../../lib/currency';
import { supabase } from '../../../lib/supabase/client';
import { authenticatedFetch } from '../../../lib/supabase/api';

interface ReceivableRecord {
  id: string;
  customer_name: string;
  doc_number: string;
  concept: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  issue_date: string;
  due_date: string;
  status: 'Pendiente' | 'Parcial' | 'Pagada' | 'Vencida';
  type?: 'CxC' | 'CxP';
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

export function Accounts() {
  const [accounts, setAccounts] = useState<ReceivableRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientFilter, setSelectedClientFilter] = useState('Todos');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('Todos');
  const [selectedAccount, setSelectedAccount] = useState<ReceivableRecord | null>(null);

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
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  // Manual Account Form State
  const [manualType, setManualType] = useState<'CxC' | 'CxP'>('CxC');
  const [manualEntity, setManualEntity] = useState('');
  const [manualConcept, setManualConcept] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [manualInitial, setManualInitial] = useState('');
  const [manualIssueDate, setManualIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualDueDate, setManualDueDate] = useState('');

  // Payment Modal State
  const [payAmount, setPayAmount] = useState('');
  const [payBankId, setPayBankId] = useState('');
  const [payReference, setPayReference] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Load Data
  const loadData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch bank accounts
      const bankRes = await authenticatedFetch('/api/bank-accounts');
      if (bankRes.ok) {
        const json = await bankRes.json();
        if (json.success) setBankAccounts(json.data || []);
      }

      // 2. Fetch accounts receivable from Supabase with customer details and payments
      const { data, error } = await supabase
        .from('accounts_receivable')
        .select(`
          *,
          customers (
            name
          ),
          receivable_payments (
            id,
            amount_usd,
            payment_date,
            payment_method,
            reference
          )
        `)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped: ReceivableRecord[] = data.map((item: any) => {
          const total = Number(item.total_usd) || Number(item.total_amount) || 0;
          const history = (item.receivable_payments || []).map((p: any) => ({
            date: p.payment_date ? p.payment_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
            amount: Number(p.amount_usd) || 0,
            bank_name: p.payment_method || 'Banco',
            ref: p.reference || 'S/R'
          }));
          const paidFromHistory = history.reduce((sum: number, h: any) => sum + h.amount, 0);
          const balance = Number(item.balance_usd) !== undefined && !isNaN(Number(item.balance_usd)) 
            ? Number(item.balance_usd) 
            : Math.max(0, total - paidFromHistory);
          const paid = total - balance;
          const st = balance <= 0 || item.status === 'PAGADO' || item.status === 'Pagada' ? 'Pagada' : balance < total && balance > 0 ? 'Parcial' : 'Pendiente';

          return {
            id: item.id,
            customer_name: item.customers?.name || item.customer_name || 'Cliente General',
            doc_number: item.doc_number || 'FAC-0001',
            concept: item.concept || `Venta a crédito (${item.doc_number || 'Factura'})`,
            total_amount: total,
            paid_amount: paid,
            remaining_amount: balance,
            issue_date: item.created_at ? item.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
            due_date: item.due_date || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
            status: st,
            type: 'CxC',
            description: item.description || `Crédito asociado a documento ${item.doc_number}`,
            payments_history: history
          };
        });
        setAccounts(mapped);
      } else {
        // Fallback demo records if empty
        const defaultDemo: ReceivableRecord[] = [
          {
            id: '1',
            customer_name: 'Distribuciones Norte',
            doc_number: 'FAC-203',
            concept: 'Factura #203 - Suministros',
            total_amount: 1240.00,
            paid_amount: 0,
            remaining_amount: 1240.00,
            issue_date: '2026-10-04',
            due_date: '2026-10-10',
            status: 'Pendiente',
            type: 'CxC',
            description: 'Venta a crédito de suministros de ferretería.',
            payments_history: []
          },
          {
            id: '2',
            customer_name: 'Inversiones Delta',
            doc_number: 'FAC-198',
            concept: 'Factura #198 - Repuestos',
            total_amount: 820.00,
            paid_amount: 0,
            remaining_amount: 820.00,
            issue_date: '2026-10-01',
            due_date: '2026-10-08',
            status: 'Pendiente',
            type: 'CxC',
            description: 'Compra de repuestos para motor.',
            payments_history: []
          }
        ];
        setAccounts(defaultDemo);
      }
    } catch {
      showToast('Error cargando cuentas por cobrar.', 'info');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // KPIs Calculations
  const totalCartera = accounts.reduce((acc, r) => acc + r.total_amount, 0);
  const totalPendiente = accounts.reduce((acc, r) => acc + r.remaining_amount, 0);
  const now = new Date();
  const totalVencido = accounts
    .filter(r => r.status !== 'Pagada' && new Date(r.due_date) < now)
    .reduce((acc, r) => acc + r.remaining_amount, 0);
  const uniqueClients = new Set(accounts.filter(r => r.remaining_amount > 0).map(r => r.customer_name)).size;

  // Filtered Accounts
  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = 
      acc.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.doc_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.concept.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesClient = selectedClientFilter === 'Todos' || acc.customer_name === selectedClientFilter;
    const matchesStatus = selectedStatusFilter === 'Todos' || acc.status === selectedStatusFilter;

    return matchesSearch && matchesClient && matchesStatus;
  });

  // Handle Save Manual Account
  const handleSaveManualAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEntity.trim() || !manualTotal) {
      showToast('Complete la entidad y el monto total.', 'info');
      return;
    }

    const total = parseFloat(manualTotal) || 0;
    const initial = parseFloat(manualInitial) || 0;
    const remaining = Math.max(0, total - initial);

    const newRecord: ReceivableRecord = {
      id: 'acc_' + Date.now(),
      customer_name: manualEntity.trim(),
      doc_number: `DOC-${Math.floor(Math.random() * 9000 + 1000)}`,
      concept: manualConcept.trim() || 'Cuenta manual',
      total_amount: total,
      paid_amount: initial,
      remaining_amount: remaining,
      issue_date: manualIssueDate,
      due_date: manualDueDate || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
      status: remaining === 0 ? 'Pagada' : initial > 0 ? 'Parcial' : 'Pendiente',
      type: manualType,
      description: manualDescription.trim(),
      payments_history: initial > 0 ? [{ date: manualIssueDate, amount: initial, bank_name: 'Abono Inicial', ref: 'INI-01' }] : []
    };

    try {
      const { data: orgData } = await supabase.from('organizations').select('id').limit(1).single();
      const orgId = orgData?.id || '00000000-0000-0000-0000-000000000000';

      let customerId: string | null = null;
      const { data: existingCust } = await supabase
        .from('customers')
        .select('id')
        .eq('name', manualEntity.trim())
        .limit(1)
        .single();

      if (existingCust) {
        customerId = existingCust.id;
      } else {
        const { data: newCust } = await supabase
          .from('customers')
          .insert({
            organization_id: orgId,
            name: manualEntity.trim(),
            doc_number: 'V-' + Math.floor(Math.random() * 9000000 + 1000000),
            phone: '0414-0000000'
          })
          .select('id')
          .single();
        if (newCust) customerId = newCust.id;
      }

      if (customerId) {
        const { data: insertedRec } = await supabase
          .from('accounts_receivable')
          .insert({
            organization_id: orgId,
            customer_id: customerId,
            doc_number: newRecord.doc_number,
            total_usd: newRecord.total_amount,
            balance_usd: newRecord.remaining_amount,
            status: newRecord.status === 'Pagada' ? 'PAGADO' : newRecord.status === 'Parcial' ? 'PARCIAL' : 'PENDIENTE',
            due_date: newRecord.due_date
          })
          .select('id')
          .single();

        if (insertedRec) newRecord.id = insertedRec.id;
      }

      setAccounts(prev => [newRecord, ...prev]);
      showToast('Cuenta pendiente agregada con éxito.');
      setIsManualModalOpen(false);
      setManualEntity('');
      setManualConcept('');
      setManualDescription('');
      setManualTotal('');
      setManualInitial('');
      setManualDueDate('');
      loadData();
    } catch {
      showToast('Error al guardar la cuenta.', 'info');
    }
  };

  // Handle Register Payment (Linked to Bank Accounts)
  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Ingrese un monto de pago válido.', 'info');
      return;
    }
    if (amt > selectedAccount.remaining_amount) {
      showToast('El monto no puede superar el saldo pendiente.', 'info');
      return;
    }
    if (!payBankId) {
      showToast('Seleccione una cuenta bancaria receptora.', 'info');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const targetBank = bankAccounts.find(b => b.id === payBankId);
      const bankName = targetBank ? `${targetBank.bank_name} (${targetBank.currency})` : 'Banco del Sistema';

      // 1. Post bank movement deposit to update bank account balance in real time
      const movementPayload = {
        bank_account_id: payBankId,
        type: 'ENTRADA',
        concept: `Cobro de CxC - ${selectedAccount.customer_name} (${selectedAccount.doc_number})`,
        reference: payReference.trim() || 'COBRO-CXT',
        user_name: 'Gerente / Cobranzas',
        rate: activeRate,
        commission: 0,
        amount: targetBank?.currency === 'VES' ? amt * activeRate : amt
      };

      await authenticatedFetch('/api/bank-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(movementPayload)
      });

      // 2. Insert into receivable_payments in Supabase if real ID
      if (!selectedAccount.id.startsWith('acc_') && selectedAccount.id.length > 10) {
        await supabase.from('receivable_payments').insert({
          receivable_id: selectedAccount.id,
          bank_account_id: payBankId,
          amount_usd: amt,
          amount_ves: amt * activeRate,
          exchange_rate: activeRate,
          payment_method: bankName,
          reference: payReference.trim() || 'PAGO'
        });
      }

      // 3. Update account record in Supabase
      const newPaid = selectedAccount.paid_amount + amt;
      const newRemaining = Math.max(0, selectedAccount.total_amount - newPaid);
      const newStatus = newRemaining === 0 ? 'PAGADO' : 'PARCIAL';

      if (!selectedAccount.id.startsWith('acc_') && selectedAccount.id.length > 10) {
        await supabase
          .from('accounts_receivable')
          .update({
            balance_usd: newRemaining,
            status: newStatus
          })
          .eq('id', selectedAccount.id);
      }

      showToast(`Pago de $${amt.toFixed(2)} registrado e ingresado a ${bankName}.`);
      setIsPayModalOpen(false);
      setPayAmount('');
      setPayReference('');
      setPayBankId('');
      loadData();
    } catch (err) {
      console.error(err);
      showToast('Error procesando el pago.', 'info');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleExportXLS = () => {
    setIsExportDropdownOpen(false);
    if (filteredAccounts.length === 0) {
      showToast('No hay cuentas para exportar.', 'info');
      return;
    }
    const headers = 'Cliente,Documento,Concepto,Monto Total (USD),Pagado (USD),Saldo Pendiente (USD),Fecha Emisión,Fecha Vencimiento,Estado\n';
    const rows = filteredAccounts.map(acc => 
      `"${acc.customer_name}","${acc.doc_number}","${acc.concept}",${acc.total_amount},${acc.paid_amount},${acc.remaining_amount},"${acc.issue_date}","${acc.due_date}","${acc.status}"`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cuentas_por_cobrar_${new Date().toISOString().slice(0, 10)}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Reporte XLS exportado con éxito.');
  };

  const handleExportPDF = () => {
    setIsExportDropdownOpen(false);
    if (filteredAccounts.length === 0) {
      showToast('No hay cuentas para exportar.', 'info');
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
        <title>Reporte de Cuentas por Cobrar - Frenyer ERP</title>
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
        <h2>Frenyer ERP - Reporte de Cuentas por Cobrar</h2>
        <p>Generado el: ${new Date().toLocaleString()} | Total de registros: ${filteredAccounts.length}</p>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Documento</th>
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
            ${filteredAccounts.map(acc => `
              <tr>
                <td>${acc.customer_name}</td>
                <td>${acc.doc_number}</td>
                <td>${acc.concept}</td>
                <td>$${acc.total_amount.toFixed(2)}</td>
                <td>$${acc.paid_amount.toFixed(2)}</td>
                <td>$${acc.remaining_amount.toFixed(2)}</td>
                <td>${acc.issue_date}</td>
                <td>${acc.due_date}</td>
                <td><strong>${acc.status}</strong></td>
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

  const uniqueClientNames = Array.from(new Set(accounts.map(a => a.customer_name)));

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
            Cuentas por cobrar
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            Saldos, vencimientos e historial de pagos por cliente (Sincronizado en tiempo real con Facturas y Notas de Entrega)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setIsManualModalOpen(true)}
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
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(124,58,237,0.3)'
            }}
          >
            <Plus size={16} style={{ color: '#40E0D0' }} /> Cuenta manual
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
                  onClick={handleExportXLS}
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
                  <span style={{ color: '#10b981' }}>📊</span> Exportar XLS
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="kpi-label" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
            CARTERA TOTAL
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>
            {formatVES(totalCartera * activeRate)} · {formatUSD(totalCartera, '$ ')}
          </div>
          <span className="muted small" style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>
            Facturado a crédito
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
            Por cobrar actualmente
          </span>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="kpi-label" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
            SALDO VENCIDO
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#b91c1c', marginTop: 8 }}>
            {formatVES(totalVencido * activeRate)} · {formatUSD(totalVencido, '$ ')}
          </div>
          <span className="muted small" style={{ fontSize: 11, color: '#b91c1c', display: 'block', marginTop: 4 }}>
            Requiere seguimiento
          </span>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="kpi-label" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
            CLIENTES CON SALDO
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>
            {uniqueClients}
          </div>
          <span className="muted small" style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>
            Con cuentas abiertas
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)', flex: 1, minWidth: 260 }}>
          <Search size={16} style={{ color: '#94a3b8' }} />
          <input
            placeholder="Cliente, documento o factura..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, width: '100%' }}
          />
        </div>

        <select
          value={selectedClientFilter}
          onChange={(e) => setSelectedClientFilter(e.target.value)}
          style={{ height: 40, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '0 14px', fontSize: 13, fontWeight: 600, color: '#0f172a', outline: 'none', cursor: 'pointer', minWidth: 200 }}
        >
          <option value="Todos">Todos los clientes</option>
          {uniqueClientNames.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={selectedStatusFilter}
          onChange={(e) => setSelectedStatusFilter(e.target.value)}
          style={{ height: 40, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '0 14px', fontSize: 13, fontWeight: 600, color: '#0f172a', outline: 'none', cursor: 'pointer', minWidth: 180 }}
        >
          <option value="Todos">Todos los estados</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Parcial">Parcial</option>
          <option value="Pagada">Pagada</option>
          <option value="Vencida">Vencida</option>
        </select>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Left: Detailed Report Table */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
              Reporte detallado ({filteredAccounts.length})
            </h3>
          </div>

          {filteredAccounts.length === 0 ? (
            <div className="empty" style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No hay cuentas por cobrar para este filtro.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Documento / Cliente</th>
                    <th>Concepto</th>
                    <th>Vencimiento</th>
                    <th className="num">Pendiente</th>
                    <th style={{ textAlign: 'center' }}>Estado</th>
                    <th style={{ textAlign: 'right' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map(acc => {
                    const isSelected = selectedAccount?.id === acc.id;
                    const isOverdue = acc.status !== 'Pagada' && new Date(acc.due_date) < now;
                    return (
                      <tr 
                        key={acc.id} 
                        onClick={() => setSelectedAccount(acc)}
                        style={{ cursor: 'pointer', background: isSelected ? '#f5f3ff' : 'transparent' }}
                      >
                        <td>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{acc.customer_name}</div>
                          <span className="muted small" style={{ fontSize: 11, fontFamily: 'monospace' }}>{acc.doc_number}</span>
                        </td>
                        <td>
                          <div>{acc.concept}</div>
                          <span className="muted small" style={{ fontSize: 11, color: '#64748b' }}>Emisión: {acc.issue_date}</span>
                        </td>
                        <td>
                          <div style={{ color: isOverdue ? '#b91c1c' : '#0f172a', fontWeight: isOverdue ? 700 : 400 }}>
                            {acc.due_date}
                          </div>
                          {isOverdue && <span style={{ fontSize: 10, color: '#b91c1c', fontWeight: 700 }}>Vencida</span>}
                        </td>
                        <td className="num" style={{ fontWeight: 800, color: '#0f172a' }}>
                          {formatUSD(acc.remaining_amount, '$ ')}
                          <div style={{ fontSize: 10, fontWeight: 500, color: '#64748b' }}>{formatVES(acc.remaining_amount * activeRate)}</div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Badge tone={acc.status === 'Pagada' ? 'success' : acc.status === 'Parcial' ? 'warning' : isOverdue ? 'danger' : 'brand'}>
                            {isOverdue && acc.status !== 'Pagada' ? 'Vencida' : acc.status}
                          </Badge>
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          {acc.remaining_amount > 0 ? (
                            <button
                              onClick={() => {
                                setSelectedAccount(acc);
                                setPayAmount(acc.remaining_amount.toString());
                                setIsPayModalOpen(true);
                              }}
                              style={{
                                height: 32,
                                padding: '0 12px',
                                borderRadius: 8,
                                background: '#7c3aed',
                                color: '#fff',
                                border: 'none',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                boxShadow: '0 2px 6px rgba(124,58,237,0.3)'
                              }}
                            >
                              <DollarSign size={13} /> Pagar
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>
                              ✓ Cancelada
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Client History & Details Panel */}
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <Clock size={16} style={{ color: '#7c3aed' }} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
              Historial del cliente
            </h3>
          </div>

          {!selectedAccount ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <User size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <p style={{ fontSize: 13, margin: 0 }}>Seleccione una cuenta para consultar sus pagos y detalles.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Cliente</span>
                <h4 style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{selectedAccount.customer_name}</h4>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#7c3aed' }}>{selectedAccount.doc_number}</span>
              </div>

              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Total Facturado</span>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{formatUSD(selectedAccount.total_amount, '$ ')}</div>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Pendiente</span>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#b91c1c' }}>{formatUSD(selectedAccount.remaining_amount, '$ ')}</div>
                </div>
              </div>

              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Historial de abonos ({selectedAccount.payments_history?.length || 0})
                </span>

                {(!selectedAccount.payments_history || selectedAccount.payments_history.length === 0) ? (
                  <span className="muted small" style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                    No se han registrado pagos o abonos previos para este documento.
                  </span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                    {selectedAccount.payments_history.map((pay, idx) => (
                      <div key={idx} style={{ padding: '8px 10px', background: '#f5f3ff', borderRadius: 8, border: '1px solid #ede9fe', fontSize: 11, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{formatUSD(pay.amount, '$ ')}</div>
                          <span style={{ color: '#64748b' }}>{pay.bank_name} · Ref: {pay.ref}</span>
                        </div>
                        <span style={{ color: '#7c3aed', fontWeight: 600 }}>{pay.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedAccount.remaining_amount > 0 && (
                <button
                  onClick={() => {
                    setPayAmount(selectedAccount.remaining_amount.toString());
                    setIsPayModalOpen(true);
                  }}
                  style={{
                    height: 38,
                    width: '100%',
                    borderRadius: 8,
                    background: '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginTop: 8,
                    boxShadow: '0 4px 12px rgba(124,58,237,0.3)'
                  }}
                >
                  Registrar Cobro / Pagar Saldo
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Cuenta Manual */}
      {isManualModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 1200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 540, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', position: 'relative' }}>
            <button
              onClick={() => setIsManualModalOpen(false)}
              style={{ position: 'absolute', top: 20, right: 20, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f5f3ff', color: '#7c3aed', display: 'grid', placeItems: 'center' }}>
                <Plus size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                Agregar Cuenta Pendiente
              </h3>
            </div>

            <form onSubmit={handleSaveManualAccount} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Tipo de Cuenta:</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div
                    style={{ flex: 1, height: 38, borderRadius: 8, border: '2px solid #7c3aed', background: '#f5f3ff', color: '#7c3aed', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    Cuenta por Cobrar (CxC)
                  </div>
                </div>
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Asunto / Entidad Principal (Cliente / Acreedor):</label>
                <input
                  required
                  placeholder="Ej. Distribuciones Norte, Inversiones Delta..."
                  value={manualEntity}
                  onChange={(e) => setManualEntity(e.target.value)}
                  className="input"
                  style={{ height: 38, fontSize: 13 }}
                />
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Concepto / Sub-asunto (Ej. Factura #00001):</label>
                <input
                  required
                  placeholder="Ej. Factura #12345, Suministros..."
                  value={manualConcept}
                  onChange={(e) => setManualConcept(e.target.value)}
                  className="input"
                  style={{ height: 38, fontSize: 13 }}
                />
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Descripción detallada:</label>
                <textarea
                  placeholder="Notas u observaciones de la operación..."
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  className="input"
                  style={{ height: 64, fontSize: 13, padding: '8px 12px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Monto Total (USD):</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={manualTotal}
                    onChange={(e) => setManualTotal(e.target.value)}
                    className="input"
                    style={{ height: 38, fontSize: 13 }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Abono Inicial (Opcional):</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={manualInitial}
                    onChange={(e) => setManualInitial(e.target.value)}
                    className="input"
                    style={{ height: 38, fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Fecha de Emisión:</label>
                  <input
                    type="date"
                    value={manualIssueDate}
                    onChange={(e) => setManualIssueDate(e.target.value)}
                    className="input"
                    style={{ height: 38, fontSize: 13 }}
                  />
                </div>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Fecha de Vencimiento:</label>
                  <input
                    type="date"
                    value={manualDueDate}
                    onChange={(e) => setManualDueDate(e.target.value)}
                    className="input"
                    style={{ height: 38, fontSize: 13 }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  style={{ height: 38, padding: '0 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ height: 38, padding: '0 20px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  Guardar Cuenta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Registrar Pago / Pagar Asociado a Cuenta Bancaria */}
      {isPayModalOpen && selectedAccount && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 1200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', position: 'relative' }}>
            <button
              onClick={() => setIsPayModalOpen(false)}
              style={{ position: 'absolute', top: 20, right: 20, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ecfdf5', color: '#047857', display: 'grid', placeItems: 'center' }}>
                <DollarSign size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                  Registrar Cobro / Pago
                </h3>
                <span className="muted small" style={{ fontSize: 11, color: '#64748b' }}>
                  {selectedAccount.customer_name} · {selectedAccount.doc_number}
                </span>
              </div>
            </div>

            <form onSubmit={handleProcessPayment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Saldo Pendiente:</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#b91c1c' }}>{formatUSD(selectedAccount.remaining_amount, '$ ')}</span>
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Monto a Cobrar (USD):</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  max={selectedAccount.remaining_amount}
                  placeholder="0.00"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="input"
                  style={{ height: 38, fontSize: 13 }}
                />
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Cuenta Bancaria Receptora (Ingreso a Banco):</label>
                <select
                  required
                  value={payBankId}
                  onChange={(e) => setPayBankId(e.target.value)}
                  className="input"
                  style={{ height: 38, fontSize: 13, cursor: 'pointer' }}
                >
                  <option value="">Seleccione cuenta registrada...</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} — {b.currency} (Saldo: {b.currency === 'VES' ? formatVES(b.balance) : formatUSD(b.balance, '$ ')})
                    </option>
                  ))}
                </select>
                <span className="muted small" style={{ fontSize: 10, color: '#64748b' }}>
                  * Al procesar el cobro, el dinero ingresará automáticamente al saldo y movimientos de la cuenta bancaria seleccionada.
                </span>
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Referencia de Pago:</label>
                <input
                  placeholder="Ej. Transferencia 123456, Zelle, Pago Móvil..."
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  className="input"
                  style={{ height: 38, fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  style={{ height: 38, padding: '0 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  style={{ height: 38, padding: '0 20px', borderRadius: 8, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {isSubmittingPayment ? 'Procesando...' : 'Confirmar Cobro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
