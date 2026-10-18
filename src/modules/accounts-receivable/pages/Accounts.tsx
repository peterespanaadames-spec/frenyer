import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Download,
  Calendar,
  CheckCircle,
  CheckCircle2,
  Building,
  CreditCard,
  X,
  FileText,
  Clock,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  User,
  DollarSign,
  Layers,
  Receipt,
  ArrowRight,
  Filter
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
  customer_doc?: string;
  customer_phone?: string;
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
  items?: {
    id?: string;
    sku: string;
    name: string;
    quantity: number;
    unit_price_usd: number;
    total_usd: number;
    total_ves?: number;
  }[];
}

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  currency: string;
  balance: number;
  status: string;
}

interface ClientGroup {
  clientName: string;
  customerDoc: string;
  orders: ReceivableRecord[];
  totalInvoiced: number;
  totalPaid: number;
  totalPending: number;
  pendingCount: number;
  paidCount: number;
  hasOverdue: boolean;
  status: 'Pagada' | 'Parcial' | 'Pendiente' | 'Vencida';
}

export function Accounts() {
  const [accounts, setAccounts] = useState<ReceivableRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClientFilter, setSelectedClientFilter] = useState('Todos');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('Todos');
  const [selectedAccount, setSelectedAccount] = useState<ReceivableRecord | null>(null);

  // Grouped vs Flat view toggle
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

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
  const [manualEntity, setManualEntity] = useState('');
  const [manualDocNumber, setManualDocNumber] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [manualDueDate, setManualDueDate] = useState('');

  // Payment Modal State
  const [payAmount, setPayAmount] = useState('');
  const [payBankId, setPayBankId] = useState('');
  const [payReference, setPayReference] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Helper to extract clean order identifier
  const getOrderBadgeText = (doc: string, concept: string) => {
    const raw = `${doc} ${concept}`;
    const match = raw.match(/orden\s*#?\s*(\d+)/i) || doc.match(/(\d+)/);
    if (match && match[1]) {
      return `Orden #${parseInt(match[1], 10)}`;
    }
    if (doc.startsWith('ORD-')) {
      const num = doc.replace('ORD-', '').replace(/^0+/, '');
      return `Orden #${num || '1'}`;
    }
    return doc || 'Doc';
  };

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

      // 2. Fetch accounts receivable via proxy
      const res = await authenticatedFetch('/api/accounts-receivable');
      let data: any[] = [];
      if (res.ok) {
        const json = await res.json();
        if (json.success) data = json.data || [];
      }

      const mapped: ReceivableRecord[] = (data || []).map((item: any) => {
        const total = Number(item.total_usd ?? item.total_amount ?? 0);
        const history = (item.receivable_payments || []).map((p: any) => ({
          date: p.payment_date ? p.payment_date.slice(0, 10) : '',
          amount: Number(p.amount_usd) || 0,
          bank_name: p.payment_method || '',
          ref: p.reference || ''
        }));
        const paidFromHistory = history.reduce((sum: number, h: any) => sum + h.amount, 0);
        const balance = item.balance_usd != null && Number.isFinite(Number(item.balance_usd))
          ? Number(item.balance_usd)
          : Math.max(0, total - paidFromHistory);
        const paid = Math.max(0, Math.round((total - balance) * 100) / 100);

        if (history.length === 0 && paid > 0.01) {
          history.push({
            date: item.updated_at ? item.updated_at.slice(0, 10) : (item.created_at ? item.created_at.slice(0, 10) : ''),
            amount: paid,
            bank_name: 'Abono registrado',
            ref: 'ABONO'
          });
        }

        const isOverdue = item.due_date && new Date(item.due_date) < new Date();
        const st = balance <= 0 || item.status === 'PAGADO' || item.status === 'Pagada'
          ? 'Pagada'
          : isOverdue
          ? 'Vencida'
          : balance < total && balance > 0
          ? 'Parcial'
          : 'Pendiente';

        const rawCustName = item.customers?.name || item.customer_name || 'Cliente sin nombre';
        const formattedName = rawCustName
          .split(' ')
          .filter(Boolean)
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');

        // Mapear los artículos reales de la orden provenientes de sale_items en Supabase
        const saleItems = (item.sales?.sale_items || []).map((si: any) => ({
          id: si.id,
          sku: si.sku || 'PROD',
          name: si.name || 'Artículo',
          quantity: Number(si.quantity) || 1,
          unit_price_usd: Number(si.unit_price_usd) || 0,
          total_usd: Number(si.total_usd) || 0,
          total_ves: Number(si.total_ves) || 0
        }));

        return {
          id: item.id,
          customer_name: formattedName,
          customer_doc: item.customer_doc || item.customers?.doc_number || item.customers?.document_number || '',
          customer_phone: item.customer_phone || item.customers?.phone || '',
          doc_number: item.doc_number || '',
          concept: item.concept || 'Cuenta por cobrar',
          total_amount: total,
          paid_amount: paid,
          remaining_amount: balance,
          issue_date: item.created_at ? item.created_at.slice(0, 10) : '',
          due_date: item.due_date || '',
          status: st,
          type: 'CxC',
          description: item.description || '',
          payments_history: history,
          items: saleItems
        };
      });

      setAccounts(mapped);

      // Auto-expandir todos los clientes reales encontrados en Supabase
      const allClientNames = Array.from(new Set(mapped.map(m => m.customer_name)));
      setExpandedClients(new Set(allClientNames));

      setSelectedAccount(prev => {
        if (!prev) {
          return mapped[0] || null;
        }
        const found = mapped.find(m => m.id === prev.id || (m.doc_number && m.doc_number === prev.doc_number));
        return found || mapped[0] || null;
      });
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
    .filter(r => r.status !== 'Pagada' && r.due_date && new Date(r.due_date) < now)
    .reduce((acc, r) => acc + r.remaining_amount, 0);
  const uniqueClients = new Set(accounts.filter(r => r.remaining_amount > 0).map(r => r.customer_name)).size;

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        acc.customer_name.toLowerCase().includes(q) ||
        acc.doc_number.toLowerCase().includes(q) ||
        acc.concept.toLowerCase().includes(q);

      const matchesClient = selectedClientFilter === 'Todos' || acc.customer_name === selectedClientFilter;
      const matchesStatus = selectedStatusFilter === 'Todos' || acc.status === selectedStatusFilter;

      return matchesSearch && matchesClient && matchesStatus;
    });
  }, [accounts, searchTerm, selectedClientFilter, selectedStatusFilter]);

  // Grouped by Client
  const groupedClients = useMemo(() => {
    const map = new Map<string, ReceivableRecord[]>();

    for (const acc of filteredAccounts) {
      const name = acc.customer_name?.trim() || 'Cliente sin nombre';
      if (!map.has(name)) {
        map.set(name, []);
      }
      map.get(name)!.push(acc);
    }

    const result: ClientGroup[] = [];
    const nowDate = new Date();

    map.forEach((orders, clientName) => {
      const totalInvoiced = orders.reduce((sum, o) => sum + o.total_amount, 0);
      const totalPaid = orders.reduce((sum, o) => sum + o.paid_amount, 0);
      const totalPending = orders.reduce((sum, o) => sum + o.remaining_amount, 0);
      const pendingCount = orders.filter(o => o.remaining_amount > 0.01).length;
      const paidCount = orders.filter(o => o.remaining_amount <= 0.01).length;
      const hasOverdue = orders.some(o => o.status !== 'Pagada' && o.due_date && new Date(o.due_date) < nowDate);
      const customerDoc = orders[0]?.customer_doc || '';

      let status: 'Pagada' | 'Parcial' | 'Pendiente' | 'Vencida' = 'Pendiente';
      if (totalPending <= 0.01) {
        status = 'Pagada';
      } else if (hasOverdue) {
        status = 'Vencida';
      } else if (totalPaid > 0.01) {
        status = 'Parcial';
      } else {
        status = 'Pendiente';
      }

      result.push({
        clientName,
        customerDoc,
        orders,
        totalInvoiced: Math.round(totalInvoiced * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalPending: Math.round(totalPending * 100) / 100,
        pendingCount,
        paidCount,
        hasOverdue,
        status
      });
    });

    // Ordenar: Clientes con saldo pendiente primero, luego por nombre
    return result.sort((a, b) => {
      if (a.totalPending > 0.01 && b.totalPending <= 0.01) return -1;
      if (a.totalPending <= 0.01 && b.totalPending > 0.01) return 1;
      return a.clientName.localeCompare(b.clientName);
    });
  }, [filteredAccounts]);

  // Auto-expand on search
  useEffect(() => {
    if (searchTerm.trim().length > 1) {
      setExpandedClients(new Set(groupedClients.map(g => g.clientName)));
    }
  }, [searchTerm, groupedClients]);

  // Toggle client accordion
  const toggleClientAccordion = (clientName: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientName)) {
        next.delete(clientName);
      } else {
        next.add(clientName);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedClients(new Set(groupedClients.map(g => g.clientName)));
  };

  const collapseAll = () => {
    setExpandedClients(new Set());
  };

  // Handle Save Manual Account
  const handleSaveManualAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = Number(manualTotal);
    if (!manualEntity.trim() || !manualDocNumber.trim() || !Number.isFinite(total) || total <= 0) {
      showToast('Selecciona un cliente registrado, indica el documento y un monto mayor a cero.', 'info');
      return;
    }

    try {
      const dueDate = manualDueDate || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
      const res = await authenticatedFetch('/api/accounts-receivable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: manualEntity.trim(),
          doc_number: manualDocNumber.trim(),
          total_usd: total,
          balance_usd: total,
          status: 'PENDIENTE',
          due_date: dueDate,
          concept: 'Cuenta manual / Orden a crédito'
        })
      });

      if (!res.ok) throw new Error('Error al guardar la cuenta en servidor.');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error al guardar la cuenta.');

      showToast('Cuenta por cobrar registrada exitosamente.');
      setIsManualModalOpen(false);
      setManualEntity('');
      setManualDocNumber('');
      setManualTotal('');
      setManualDueDate('');
      await loadData();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Error al guardar la cuenta.',
        'info'
      );
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
    if (amt > selectedAccount.remaining_amount + 0.01) {
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

      try {
        const movRes = await authenticatedFetch('/api/bank-movements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(movementPayload)
        });
        let createdMov = null;
        if (movRes.ok) {
          const movJson = await movRes.json();
          if (movJson.success) {
            if (typeof movJson.new_balance === 'number') {
              setBankAccounts(prev => prev.map(b => b.id === payBankId ? { ...b, balance: movJson.new_balance } : b));
            }
            if (movJson.data) createdMov = movJson.data;
          }
        }
        if (!createdMov) {
          createdMov = {
            id: 'mov-' + Date.now(),
            bank_account_id: payBankId,
            type: 'ENTRADA',
            concept: `Cobro de CxC - ${selectedAccount.customer_name} (${selectedAccount.doc_number})`,
            reference: payReference.trim() || 'COBRO-CXT',
            user_name: 'Gerente / Cobranzas',
            rate: activeRate,
            commission: 0,
            commission_type: 'Fija',
            amount: targetBank?.currency === 'VES' ? amt * activeRate : amt,
            created_at: new Date().toISOString()
          };
        }
        if (typeof window !== 'undefined') {
          try {
            const local = JSON.parse(localStorage.getItem('frenyer_local_bank_movements') || '[]');
            local.unshift(createdMov);
            localStorage.setItem('frenyer_local_bank_movements', JSON.stringify(local));
          } catch {}
        }
        window.dispatchEvent(new CustomEvent('frenyer:bank-updated'));
      } catch (movErr) {
        console.warn('Aviso registrando movimiento bancario:', movErr);
      }

      // 2. Post payment via backend proxy endpoint
      const payPayload = {
        amount_usd: amt,
        amount_ves: targetBank?.currency === 'VES' ? amt * activeRate : amt,
        exchange_rate: activeRate,
        bank_account_id: payBankId,
        payment_method: bankName,
        reference: payReference.trim() || 'COBRO-CXT'
      };

      try {
        await authenticatedFetch(`/api/accounts-receivable/${selectedAccount.id}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payPayload)
        });
      } catch (payApiErr) {
        console.warn('Aviso registrando pago en proxy de servidor:', payApiErr);
      }

      // 3. Fallback directo a Supabase
      if (!selectedAccount.id.startsWith('acc_') && selectedAccount.id.length > 10) {
        try {
          await supabase.from('receivable_payments').insert({
            receivable_id: selectedAccount.id,
            bank_account_id: payBankId,
            amount_usd: amt,
            amount_ves: amt * activeRate,
            exchange_rate: activeRate,
            payment_method: bankName,
            reference: payReference.trim() || 'COBRO-CXT'
          });
        } catch {}
      }

      // 4. Update local selectedAccount state immediately
      const newPaid = Math.round((selectedAccount.paid_amount + amt) * 100) / 100;
      const newRemaining = Math.max(0, Math.round((selectedAccount.total_amount - newPaid) * 100) / 100);
      const newStatus = newRemaining <= 0.01 ? 'Pagada' : 'Parcial';
      const newPaymentItem = {
        date: new Date().toISOString().slice(0, 10),
        amount: amt,
        bank_name: bankName,
        ref: payReference.trim() || 'COBRO-CXT'
      };

      const updatedHistory = [newPaymentItem, ...(selectedAccount.payments_history || [])];
      setSelectedAccount({
        ...selectedAccount,
        paid_amount: newPaid,
        remaining_amount: newRemaining,
        status: newStatus,
        payments_history: updatedHistory
      });

      if (!selectedAccount.id.startsWith('acc_') && selectedAccount.id.length > 10) {
        try {
          await supabase
            .from('accounts_receivable')
            .update({
              balance_usd: newRemaining,
              status: newRemaining <= 0.01 ? 'PAGADO' : 'PARCIAL'
            })
            .eq('id', selectedAccount.id);
        } catch {}
      }

      showToast(`Pago de $${amt.toFixed(2)} registrado e ingresado a ${bankName}.`);
      setIsPayModalOpen(false);
      setPayAmount('');
      setPayReference('');
      setPayBankId('');
      await loadData();
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
    const headers = 'Cliente,Orden / Documento,Concepto,Monto Total (USD),Pagado (USD),Saldo Pendiente (USD),Fecha Emisión,Fecha Vencimiento,Estado\n';
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
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 30px; margin: 0; }
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
        <h2>Frenyer ERP - Resumen Consolidado de Cuentas por Cobrar</h2>
        <p>Generado el: ${new Date().toLocaleString()} | Total de clientes: ${groupedClients.length} | Órdenes: ${filteredAccounts.length}</p>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Orden / Doc</th>
              <th>Concepto</th>
              <th>Total ($)</th>
              <th>Pagado ($)</th>
              <th>Saldo ($)</th>
              <th>Vencimiento</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${filteredAccounts.map(acc => `
              <tr>
                <td><strong>${acc.customer_name}</strong></td>
                <td>${acc.doc_number}</td>
                <td>${acc.concept}</td>
                <td>$${acc.total_amount.toFixed(2)}</td>
                <td>$${acc.paid_amount.toFixed(2)}</td>
                <td>$${acc.remaining_amount.toFixed(2)}</td>
                <td>${acc.due_date || 'N/A'}</td>
                <td>${acc.status}</td>
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
        <div
          style={{
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
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Page Header */}
      <div
        className="page-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
            Cuentas por cobrar
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            Resumen consolidado por cliente, desglose de órdenes y trazabilidad exacta de cancelación en Supabase.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
              <div
                style={{
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
                }}
              >
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
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
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
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ color: '#10b981' }}>📊</span> Exportar XLS
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
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

      {/* Filter and View Mode Bar */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 280, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#f8fafc',
              padding: '6px 14px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              flex: 1,
              minWidth: 240
            }}
          >
            <Search size={16} style={{ color: '#94a3b8' }} />
            <input
              placeholder="Buscar cliente, cédula/RIF, documento u orden..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, width: '100%' }}
            />
          </div>

          <select
            value={selectedClientFilter}
            onChange={(e) => setSelectedClientFilter(e.target.value)}
            style={{
              height: 40,
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: 600,
              color: '#0f172a',
              outline: 'none',
              cursor: 'pointer',
              minWidth: 180
            }}
          >
            <option value="Todos">Todos los clientes</option>
            {uniqueClientNames.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            style={{
              height: 40,
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '0 14px',
              fontSize: 13,
              fontWeight: 600,
              color: '#0f172a',
              outline: 'none',
              cursor: 'pointer',
              minWidth: 160
            }}
          >
            <option value="Todos">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Parcial">Parcial</option>
            <option value="Pagada">Pagada</option>
            <option value="Vencida">Vencida</option>
          </select>
        </div>

        {/* View Mode Switcher and Controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
            <button
              onClick={() => setViewMode('grouped')}
              style={{
                height: 32,
                padding: '0 12px',
                borderRadius: 8,
                border: 'none',
                background: viewMode === 'grouped' ? '#7c3aed' : 'transparent',
                color: viewMode === 'grouped' ? '#fff' : '#64748b',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease'
              }}
            >
              <Layers size={14} /> Resumen por cliente
            </button>
            <button
              onClick={() => setViewMode('flat')}
              style={{
                height: 32,
                padding: '0 12px',
                borderRadius: 8,
                border: 'none',
                background: viewMode === 'flat' ? '#7c3aed' : 'transparent',
                color: viewMode === 'flat' ? '#fff' : '#64748b',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease'
              }}
            >
              <FileText size={14} /> Todas las órdenes
            </button>
          </div>

          {viewMode === 'grouped' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={expandAll}
                style={{
                  height: 34,
                  padding: '0 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: '#fff',
                  color: '#475569',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Expandir
              </button>
              <button
                onClick={collapseAll}
                style={{
                  height: 34,
                  padding: '0 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: '#fff',
                  color: '#475569',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Colapsar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Grid: Left Drill-down, Right Cancelation History */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.85fr) minmax(320px, 1.15fr)', gap: 20, alignItems: 'start' }}>
        
        {/* Left Side: Summary and Drill-down */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {viewMode === 'grouped' ? (
                    <>
                      <User size={18} style={{ color: '#7c3aed' }} />
                      Resumen detallado por cliente ({groupedClients.length} clientes · {filteredAccounts.length} órdenes)
                    </>
                  ) : (
                    <>
                      <Receipt size={18} style={{ color: '#7c3aed' }} />
                      Listado general de órdenes ({filteredAccounts.length})
                    </>
                  )}
                </h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {viewMode === 'grouped'
                    ? 'Haz clic en cualquier cliente para desplegar sus órdenes específicas; toca una orden para inspeccionar cómo se canceló.'
                    : 'Listado plano de todas las órdenes por cobrar registradas.'}
                </span>
              </div>
            </div>

            {/* EMPTY STATE */}
            {filteredAccounts.length === 0 ? (
              <div className="empty" style={{ padding: '60px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No se encontraron cuentas por cobrar con los filtros seleccionados.
              </div>
            ) : viewMode === 'grouped' ? (
              /* VIEW 1: DRILL-DOWN ACCORDION GROUPED BY CLIENT */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {groupedClients.map((client) => {
                  const isExpanded = expandedClients.has(client.clientName);
                  const isClientSelected = selectedAccount?.customer_name === client.clientName;

                  return (
                    <div
                      key={client.clientName}
                      style={{
                        border: isClientSelected ? '1.5px solid #7c3aed' : '1px solid var(--border)',
                        borderRadius: 14,
                        background: '#fff',
                        boxShadow: isClientSelected ? '0 4px 14px rgba(124,58,237,0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                        overflow: 'hidden',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {/* Client Header Row */}
                      <div
                        onClick={() => toggleClientAccordion(client.clientName)}
                        style={{
                          padding: '14px 18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          background: isExpanded ? '#faf5ff' : '#fff',
                          borderBottom: isExpanded ? '1px solid #ede9fe' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {/* Client Avatar / Initial */}
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 10,
                              background: isExpanded ? '#7c3aed' : '#f1f5f9',
                              color: isExpanded ? '#fff' : '#475569',
                              display: 'grid',
                              placeItems: 'center',
                              fontWeight: 800,
                              fontSize: 14,
                              flexShrink: 0
                            }}
                          >
                            {client.clientName.slice(0, 2).toUpperCase()}
                          </div>

                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                                {client.clientName}
                              </span>
                              {client.customerDoc && (
                                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>
                                  ({client.customerDoc})
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                                {client.orders.length} {client.orders.length === 1 ? 'orden' : 'órdenes'}
                              </span>
                              <span style={{ fontSize: 11, color: '#cbd5e1' }}>•</span>
                              {client.pendingCount > 0 ? (
                                <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700 }}>
                                  {client.pendingCount} pendiente{client.pendingCount > 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>
                                  Todas canceladas (al día)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Financial Totals & Accordion Chevron */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: client.totalPending > 0 ? '#0f172a' : '#059669' }}>
                              Saldo: {formatUSD(client.totalPending, '$ ')}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {formatVES(client.totalPending * activeRate)}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Badge
                              tone={
                                client.status === 'Pagada'
                                  ? 'success'
                                  : client.status === 'Parcial'
                                  ? 'warning'
                                  : client.status === 'Vencida'
                                  ? 'danger'
                                  : 'brand'
                              }
                            >
                              {client.status}
                            </Badge>

                            <button
                              type="button"
                              aria-label="Alternar despliegue de órdenes"
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                background: isExpanded ? '#ede9fe' : '#f1f5f9',
                                color: isExpanded ? '#7c3aed' : '#64748b',
                                border: 'none',
                                display: 'grid',
                                placeItems: 'center',
                                cursor: 'pointer'
                              }}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Orders of this Client */}
                      {isExpanded && (
                        <div style={{ background: '#f8fafc', padding: '12px 16px', borderTop: '1px solid #ede9fe' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Órdenes y documentos de {client.clientName}:
                            </span>
                            <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                              Toca una orden para ver su historial tal cual se canceló ➔
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {client.orders.map((order) => {
                              const isOrderSelected = selectedAccount?.id === order.id;
                              const isOverdue = order.status !== 'Pagada' && order.due_date && new Date(order.due_date) < now;
                              const badgeText = getOrderBadgeText(order.doc_number, order.concept);

                              return (
                                <div
                                  key={order.id}
                                  onClick={() => setSelectedAccount(order)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px 14px',
                                    borderRadius: 10,
                                    background: isOrderSelected ? '#f5f3ff' : '#fff',
                                    border: isOrderSelected ? '2px solid #7c3aed' : '1px solid var(--border)',
                                    cursor: 'pointer',
                                    boxShadow: isOrderSelected ? '0 4px 12px rgba(124,58,237,0.12)' : 'none',
                                    transition: 'all 0.15s ease'
                                  }}
                                >
                                  {/* Left: Order badge, Document and Concept */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div
                                      style={{
                                        padding: '5px 10px',
                                        borderRadius: 8,
                                        background: isOrderSelected ? '#7c3aed' : '#ede9fe',
                                        color: isOrderSelected ? '#fff' : '#6d28d9',
                                        fontWeight: 800,
                                        fontSize: 12,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5
                                      }}
                                    >
                                      <Receipt size={13} />
                                      {badgeText}
                                    </div>

                                    <div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                                          {order.concept}
                                        </span>
                                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>
                                          Doc: {order.doc_number}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                        <span>Emisión: {order.issue_date || 'N/A'}</span>
                                        <span>•</span>
                                        <span style={{ color: isOverdue ? '#b91c1c' : '#64748b', fontWeight: isOverdue ? 700 : 400 }}>
                                          Vencimiento: {order.due_date || 'N/A'} {isOverdue ? '(Vencida)' : ''}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right: Amounts, Status, and Select Button */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: 13, fontWeight: 800, color: order.remaining_amount > 0 ? '#b91c1c' : '#059669' }}>
                                        {order.remaining_amount > 0 ? `Resta: ${formatUSD(order.remaining_amount, '$ ')}` : 'Cancelada'}
                                      </div>
                                      <div style={{ fontSize: 11, color: '#64748b' }}>
                                        Total: {formatUSD(order.total_amount, '$ ')}
                                      </div>
                                    </div>

                                    <Badge
                                      tone={
                                        order.status === 'Pagada'
                                          ? 'success'
                                          : order.status === 'Parcial'
                                          ? 'warning'
                                          : isOverdue
                                          ? 'danger'
                                          : 'brand'
                                      }
                                    >
                                      {isOverdue && order.status !== 'Pagada' ? 'Vencida' : order.status}
                                    </Badge>

                                    {order.remaining_amount > 0 ? (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedAccount(order);
                                          setPayAmount(order.remaining_amount.toString());
                                          setIsPayModalOpen(true);
                                        }}
                                        style={{
                                          height: 30,
                                          padding: '0 10px',
                                          borderRadius: 6,
                                          background: '#7c3aed',
                                          color: '#fff',
                                          border: 'none',
                                          fontSize: 11,
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 4
                                        }}
                                      >
                                        <DollarSign size={12} /> Pagar
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <CheckCircle2 size={14} /> Solvente
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => setSelectedAccount(order)}
                                      style={{
                                        height: 30,
                                        padding: '0 10px',
                                        borderRadius: 6,
                                        background: isOrderSelected ? '#7c3aed' : '#fff',
                                        color: isOrderSelected ? '#fff' : '#64748b',
                                        border: isOrderSelected ? 'none' : '1px solid var(--border)',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4
                                      }}
                                    >
                                      Historial <ArrowRight size={12} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* VIEW 2: FLAT TABLE OF ALL ORDERS */
              <div className="table-wrap">
                <table className="table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Cliente / Documento</th>
                      <th>Concepto</th>
                      <th>Vencimiento</th>
                      <th className="num">Pendiente</th>
                      <th style={{ textAlign: 'center' }}>Estado</th>
                      <th style={{ textAlign: 'right' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map((acc) => {
                      const isSelected = selectedAccount?.id === acc.id;
                      const isOverdue = acc.status !== 'Pagada' && acc.due_date && new Date(acc.due_date) < now;
                      const badgeText = getOrderBadgeText(acc.doc_number, acc.concept);

                      return (
                        <tr
                          key={acc.id}
                          onClick={() => setSelectedAccount(acc)}
                          style={{
                            cursor: 'pointer',
                            background: isSelected ? '#f5f3ff' : 'transparent'
                          }}
                        >
                          <td>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{acc.customer_name}</div>
                            <span className="muted small" style={{ fontSize: 11, fontFamily: 'monospace', color: '#7c3aed' }}>
                              {badgeText} · {acc.doc_number}
                            </span>
                          </td>
                          <td>
                            <div>{acc.concept}</div>
                            <span className="muted small" style={{ fontSize: 11, color: '#64748b' }}>
                              Emisión: {acc.issue_date}
                            </span>
                          </td>
                          <td>
                            <div style={{ color: isOverdue ? '#b91c1c' : '#0f172a', fontWeight: isOverdue ? 700 : 400 }}>
                              {acc.due_date || 'N/A'}
                            </div>
                            {isOverdue && <span style={{ fontSize: 10, color: '#b91c1c', fontWeight: 700 }}>Vencida</span>}
                          </td>
                          <td className="num" style={{ fontWeight: 800, color: '#0f172a' }}>
                            {formatUSD(acc.remaining_amount, '$ ')}
                            <div style={{ fontSize: 10, fontWeight: 500, color: '#64748b' }}>
                              {formatVES(acc.remaining_amount * activeRate)}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Badge
                              tone={
                                acc.status === 'Pagada'
                                  ? 'success'
                                  : acc.status === 'Parcial'
                                  ? 'warning'
                                  : isOverdue
                                  ? 'danger'
                                  : 'brand'
                              }
                            >
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
        </div>

        {/* Right Side: Exact Cancelation History and Order Details Panel */}
        <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', position: 'sticky', top: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
              borderBottom: '1px solid var(--border)',
              paddingBottom: 12
            }}
          >
            <Clock size={18} style={{ color: '#7c3aed' }} />
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                Historial tal cual se canceló
              </h3>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                Auditoría detallada de pagos, abonos y bancos
              </span>
            </div>
          </div>

          {!selectedAccount ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <User size={40} style={{ margin: '0 auto 12px', opacity: 0.35 }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: '#475569', margin: '0 0 6px' }}>
                Ninguna orden seleccionada
              </p>
              <p style={{ fontSize: 12, margin: 0, color: '#94a3b8' }}>
                Toca cualquier cliente en la lista y selecciona una de sus órdenes para ver sus artículos facturados y su historial de liquidación.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Active Order Card */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 14
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#7c3aed', letterSpacing: '0.04em' }}>
                      {getOrderBadgeText(selectedAccount.doc_number, selectedAccount.concept)}
                    </span>
                    <h4 style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                      {selectedAccount.customer_name}
                    </h4>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      {selectedAccount.concept} · Doc #{selectedAccount.doc_number}
                    </span>
                  </div>

                  <Badge
                    tone={
                      selectedAccount.status === 'Pagada'
                        ? 'success'
                        : selectedAccount.status === 'Parcial'
                        ? 'warning'
                        : selectedAccount.status === 'Vencida'
                        ? 'danger'
                        : 'brand'
                    }
                  >
                    {selectedAccount.status}
                  </Badge>
                </div>

                {/* 3 Metric Badges */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                    marginTop: 12,
                    background: '#fff',
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <div>
                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Total Orden</span>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                      {formatUSD(selectedAccount.total_amount, '$ ')}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>Abonado</span>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#059669' }}>
                      {formatUSD(selectedAccount.paid_amount, '$ ')}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 10, color: selectedAccount.remaining_amount > 0 ? '#b91c1c' : '#059669', fontWeight: 600 }}>
                      Saldo Restante
                    </span>
                    <div style={{ fontSize: 13, fontWeight: 800, color: selectedAccount.remaining_amount > 0 ? '#b91c1c' : '#059669' }}>
                      {formatUSD(selectedAccount.remaining_amount, '$ ')}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginTop: 10, padding: '0 4px' }}>
                  <span>Emisión: <strong>{selectedAccount.issue_date || 'N/A'}</strong></span>
                  <span>Vence: <strong>{selectedAccount.due_date || 'N/A'}</strong></span>
                </div>
              </div>

              {/* Artículos reales de la orden en Supabase */}
              {selectedAccount.items && selectedAccount.items.length > 0 && (
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: '12px 14px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileText size={13} style={{ color: '#7c3aed' }} /> Artículos Facturados ({selectedAccount.items.length})
                    </span>
                    <span style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>Supabase</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedAccount.items.map((it, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: 12,
                          padding: '4px 0',
                          borderBottom: idx < selectedAccount.items!.length - 1 ? '1px dashed #f1f5f9' : 'none'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.name}</div>
                          <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace' }}>
                            SKU: {it.sku} · {it.quantity} un. × {formatUSD(it.unit_price_usd, '$ ')}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                          {formatUSD(it.total_usd, '$ ')}
                          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>
                            {formatVES(it.total_usd * activeRate)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Exact Payment / Cancellation History */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Historial de pagos ({selectedAccount.payments_history?.length || 0})
                  </span>
                  {selectedAccount.remaining_amount <= 0.01 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={13} /> 100% Cancelada
                    </span>
                  )}
                </div>

                {(!selectedAccount.payments_history || selectedAccount.payments_history.length === 0) ? (
                  <div
                    style={{
                      padding: '24px 14px',
                      background: '#f8fafc',
                      borderRadius: 10,
                      border: '1px dashed #cbd5e1',
                      textAlign: 'center'
                    }}
                  >
                    <Clock size={20} style={{ margin: '0 auto 6px', color: '#94a3b8' }} />
                    <span style={{ fontSize: 12, color: '#64748b', display: 'block', fontWeight: 600 }}>
                      No se han registrado pagos para esta orden.
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      La totalidad de la orden se encuentra pendiente de cobro.
                    </span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                    {selectedAccount.payments_history.map((pay, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '10px 12px',
                          background: '#fff',
                          borderRadius: 10,
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 6,
                                background: '#ecfdf5',
                                color: '#059669',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: 10,
                                fontWeight: 800
                              }}
                            >
                              #{idx + 1}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                              {formatUSD(pay.amount, '$ ')}
                            </span>
                            <span style={{ fontSize: 11, color: '#64748b' }}>
                              ({formatVES(pay.amount * activeRate)})
                            </span>
                          </div>

                          <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>
                            {pay.date}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Building size={12} style={{ color: '#94a3b8' }} />
                            {pay.bank_name || 'Caja / Banco receptor'}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
                            Ref: {pay.ref || 'S/R'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Banner / Action Button */}
              {selectedAccount.remaining_amount <= 0.01 ? (
                <div
                  style={{
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <CheckCircle size={22} style={{ color: '#059669', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#065f46' }}>
                      Orden completamente liquidada
                    </div>
                    <div style={{ fontSize: 11, color: '#047857' }}>
                      No existe saldo pendiente por cobrar para este documento.
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setPayAmount(selectedAccount.remaining_amount.toString());
                    setIsPayModalOpen(true);
                  }}
                  style={{
                    height: 42,
                    width: '100%',
                    borderRadius: 10,
                    background: '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(124,58,237,0.35)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <DollarSign size={16} /> Registrar Cobro / Abonar a esta Orden
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Cuenta Manual */}
      {isManualModalOpen && (
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
            zIndex: 1200,
            padding: 16
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 540,
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              position: 'relative'
            }}
          >
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
                    style={{
                      flex: 1,
                      height: 38,
                      borderRadius: 8,
                      border: '2px solid #7c3aed',
                      background: '#f5f3ff',
                      color: '#7c3aed',
                      fontWeight: 700,
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    Cuenta por Cobrar (CxC)
                  </div>
                </div>
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Cliente registrado:</label>
                <input
                  required
                  placeholder="Nombre o razón social del cliente"
                  value={manualEntity}
                  onChange={(e) => setManualEntity(e.target.value)}
                  className="input"
                  style={{ height: 38, fontSize: 13 }}
                />
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Número de documento u orden:</label>
                <input
                  required
                  placeholder="Ej. ORD-0018 o FACT-102"
                  value={manualDocNumber}
                  onChange={(e) => setManualDocNumber(e.target.value)}
                  className="input"
                  style={{ height: 38, fontSize: 13 }}
                />
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Monto Total (USD):</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={manualTotal}
                  onChange={(e) => setManualTotal(e.target.value)}
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
            zIndex: 1200,
            padding: 16
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              position: 'relative'
            }}
          >
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
                  Registrar Cobro / Abono
                </h3>
                <span className="muted small" style={{ fontSize: 11, color: '#64748b' }}>
                  {selectedAccount.customer_name} · {getOrderBadgeText(selectedAccount.doc_number, selectedAccount.concept)} ({selectedAccount.doc_number})
                </span>
              </div>
            </div>

            <form onSubmit={handleProcessPayment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Saldo Pendiente:</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#b91c1c' }}>
                  {formatUSD(selectedAccount.remaining_amount, '$ ')} ({formatVES(selectedAccount.remaining_amount * activeRate)})
                </span>
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
                  style={{
                    height: 38,
                    padding: '0 20px',
                    borderRadius: 8,
                    background: '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
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
