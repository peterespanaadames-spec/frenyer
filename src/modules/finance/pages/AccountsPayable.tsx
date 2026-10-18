import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Download,
  Calendar,
  Building,
  CreditCard,
  X,
  FileText,
  Clock,
  AlertTriangle,
  User,
  DollarSign,
  Phone,
  Mail,
  Truck,
  Check,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  Percent,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { formatUSD, formatVES, getActiveExchangeRate } from '../../../lib/currency';
import { getReportHeaderHtml, getReportFooterHtml } from '../../../lib/reportUtils';
import { getBusinessProfile } from '../../../lib/businessProfile';
import {
  fetchSuppliersFromSupabase,
  createSupplierInSupabase,
  getActiveOrgId,
  DbSupplier
} from '../../../lib/supabase/db';
import { authenticatedFetch } from '../../../lib/supabase/api';

export interface PayablePayment {
  id: string;
  payable_id?: string;
  bank_account_id?: string | null;
  amount_usd: number;
  amount_ves?: number;
  exchange_rate?: number;
  payment_method: string;
  reference?: string;
  payment_date: string;
}

export interface PayableRecord {
  id: string;
  supplier_id?: string | null;
  supplier_name: string;
  supplier_doc?: string;
  supplier_phone?: string;
  supplier_email?: string;
  supplier_contact?: string;
  doc_number: string;
  concept: string;
  origin: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  issue_date: string;
  due_date: string;
  status: 'Pendiente' | 'Parcial' | 'Pagada' | 'Vencida';
  description?: string;
  payments_history: {
    id?: string;
    date: string;
    amount: number;
    amount_ves?: number;
    bank_name: string;
    ref: string;
  }[];
}

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  currency: 'USD' | 'VES';
  balance: number;
  account_type?: string;
}

interface Supplier {
  id: string;
  name: string;
  doc_number?: string;
  phone?: string;
  email?: string;
  contact_person?: string;
}

// Datos de ejemplo representativos para simular entorno bimonetario activo
const MOCK_PAYABLES: PayableRecord[] = [
  {
    id: 'mock-cxp-001',
    supplier_id: 'sup-001',
    supplier_name: 'Distribuidora Polar C.A.',
    supplier_doc: 'J-00041372-9',
    supplier_phone: '+58 414-2345678',
    supplier_email: 'ventas@polarcorp.ve',
    supplier_contact: 'Carlos Mendoza (Gerente Comercial)',
    doc_number: 'FACT-009841',
    concept: 'Despacho de insumos y materia prima lote #44',
    origin: 'Compra Interna',
    total_amount: 1450.00,
    paid_amount: 600.00,
    remaining_amount: 850.00,
    issue_date: new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10),
    status: 'Parcial',
    description: 'Compra de inventario mensual programada a 30 días de plazo comercial.',
    payments_history: [
      {
        id: 'pay-m-1',
        date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
        amount: 600.00,
        amount_ves: 526740.00,
        bank_name: 'Transferencia Banesco Panamá ($)',
        ref: 'TRF-90218'
      }
    ]
  },
  {
    id: 'mock-cxp-002',
    supplier_id: 'sup-002',
    supplier_name: 'Automotriz Los Andes C.A.',
    supplier_doc: 'J-30491823-1',
    supplier_phone: '+58 424-9876543',
    supplier_email: 'cobranzas@losandesauto.com',
    supplier_contact: 'María Gómez (Administración)',
    doc_number: 'FACT-77210',
    concept: 'Lote de filtros de aceite y bujías NGK láser',
    origin: 'Compra Interna',
    total_amount: 980.00,
    paid_amount: 0,
    remaining_amount: 980.00,
    issue_date: new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10),
    due_date: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10),
    status: 'Vencida',
    description: 'Factura con fecha de pago vencida hace 3 días.',
    payments_history: []
  },
  {
    id: 'mock-cxp-003',
    supplier_id: 'sup-003',
    supplier_name: 'Repuestos y Servicios El Ávila S.R.L.',
    supplier_doc: 'J-40192837-5',
    supplier_phone: '+58 412-5551234',
    supplier_email: 'contacto@elavilarepuestos.com',
    supplier_contact: 'Roberto Silva (Asesor)',
    doc_number: 'FACT-44512',
    concept: 'Pastillas de freno cerámicas y discos delanteros',
    origin: 'Compra Interna',
    total_amount: 1820.00,
    paid_amount: 1820.00,
    remaining_amount: 0.00,
    issue_date: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10),
    due_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    status: 'Pagada',
    description: 'Totalmente amortizada.',
    payments_history: [
      {
        id: 'pay-m-2',
        date: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10),
        amount: 1000.00,
        amount_ves: 877900.00,
        bank_name: 'Banco Mercantil - Pago Móvil',
        ref: 'PM-448102'
      },
      {
        id: 'pay-m-3',
        date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
        amount: 820.00,
        amount_ves: 719878.00,
        bank_name: 'Efectivo Dólares ($)',
        ref: 'EFEC-09'
      }
    ]
  },
  {
    id: 'mock-cxp-004',
    supplier_id: 'sup-004',
    supplier_name: 'Ferretería Industrial Carabobo',
    supplier_doc: 'J-29384756-0',
    supplier_phone: '+58 416-1122334',
    supplier_email: 'ventas@ferreindustrial.ve',
    supplier_contact: 'Ana Pereira (Ventas Corporativas)',
    doc_number: 'FACT-11093',
    concept: 'Lubricantes sintéticos 20W-50 en tambores',
    origin: 'Compra Interna',
    total_amount: 2200.00,
    paid_amount: 500.00,
    remaining_amount: 1700.00,
    issue_date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10),
    status: 'Parcial',
    description: 'Compra a crédito acordada con abono anticipado.',
    payments_history: [
      {
        id: 'pay-m-4',
        date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
        amount: 500.00,
        amount_ves: 438950.00,
        bank_name: 'Zelle Corporativo',
        ref: 'ZLL-99210'
      }
    ]
  }
];

export function AccountsPayable() {
  const [payables, setPayables] = useState<PayableRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & selection
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('Todos');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('Todos');
  const [selectedPayable, setSelectedPayable] = useState<PayableRecord | null>(null);

  // Exchange rate
  const activeRate = getActiveExchangeRate();

  // Modals
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Form State: Nueva Factura de Proveedor
  const [formSupplierMode, setFormSupplierMode] = useState<'existing' | 'new'>('existing');
  const [formSupplierId, setFormSupplierId] = useState('');
  const [formSupplierName, setFormSupplierName] = useState('');
  const [formSupplierDoc, setFormSupplierDoc] = useState('');
  const [formSupplierPhone, setFormSupplierPhone] = useState('');
  const [formSupplierEmail, setFormSupplierEmail] = useState('');
  const [formSupplierContact, setFormSupplierContact] = useState('');
  const [formSupplierAddress, setFormSupplierAddress] = useState('');
  const [formSaveSupplierToDb, setFormSaveSupplierToDb] = useState(true);
  const [formDocNumber, setFormDocNumber] = useState('');
  const [formConcept, setFormConcept] = useState('');
  const [formIssueDate, setFormIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [formDueDate, setFormDueDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  );
  const [formTotalUsd, setFormTotalUsd] = useState('');
  const [formHasInitialPayment, setFormHasInitialPayment] = useState(false);
  const [formInitialPaymentUsd, setFormInitialPaymentUsd] = useState('');
  const [formInitialPaymentMethod, setFormInitialPaymentMethod] = useState('Transferencia Bancaria');
  const [formInitialBankId, setFormInitialBankId] = useState('');
  const [formInitialReference, setFormInitialReference] = useState('');
  const [isSubmittingInvoice, setIsSubmittingInvoice] = useState(false);

  // Form State: Registrar Abono a Proveedor
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Transferencia Bancaria');
  const [payBankId, setPayBankId] = useState('');
  const [payReference, setPayReference] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [isRefreshingSuppliers, setIsRefreshingSuppliers] = useState(false);

  // Recarga unificada de proveedores desde Supabase, API y almacenamiento local
  const reloadSuppliers = async () => {
    setIsRefreshingSuppliers(true);
    try {
      const orgId = await getActiveOrgId();
      const sups = await fetchSuppliersFromSupabase(orgId || undefined);
      if (Array.isArray(sups) && sups.length > 0) {
        setSuppliersList(sups as Supplier[]);
        return sups;
      }
      // Respaldo secundario mediante proxy
      const supRes = await authenticatedFetch('/api/suppliers');
      if (supRes.ok) {
        const json = await supRes.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          setSuppliersList(json.data);
          return json.data;
        }
      }
    } catch (e) {
      console.warn('Aviso cargando proveedores:', e);
    } finally {
      setIsRefreshingSuppliers(false);
    }
    return [];
  };

  // Carga de datos
  const loadData = async () => {
    setIsLoading(true);
    try {
      // 1. Cuentas bancarias
      try {
        const bankRes = await authenticatedFetch('/api/bank-accounts');
        if (bankRes.ok) {
          const json = await bankRes.json();
          if (json.success && Array.isArray(json.data)) {
            setBankAccounts(json.data);
            if (json.data.length > 0 && !formInitialBankId) {
              setFormInitialBankId(json.data[0].id);
              setPayBankId(json.data[0].id);
            }
          }
        }
      } catch (e) {
        console.warn('Aviso cargando cuentas bancarias:', e);
      }

      // 2. Proveedores registrados (desde Supabase, servidor y almacenamiento local)
      await reloadSuppliers();

      // 3. Cuentas por pagar
      const res = await authenticatedFetch('/api/accounts-payable');
      let data: any[] = [];
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          data = json.data;
        }
      }

      if (data.length > 0) {
        const now = new Date();
        const mapped: PayableRecord[] = data.map((item: any) => {
          const total = Number(item.total_usd ?? item.total_amount ?? 0);
          const history = (item.payable_payments || []).map((p: any) => ({
            id: p.id,
            date: p.payment_date ? p.payment_date.slice(0, 10) : '',
            amount: Number(p.amount_usd) || 0,
            amount_ves: Number(p.amount_ves) || (Number(p.amount_usd) || 0) * (Number(p.exchange_rate) || activeRate),
            bank_name: p.payment_method || 'Abono en cuenta',
            ref: p.reference || 'REF'
          }));

          const paidFromHistory = history.reduce((sum: number, h: any) => sum + h.amount, 0);
          const balance = item.balance_usd != null && Number.isFinite(Number(item.balance_usd))
            ? Number(item.balance_usd)
            : Math.max(0, Math.round((total - paidFromHistory) * 100) / 100);
          const paid = Math.max(0, Math.round((total - balance) * 100) / 100);

          if (history.length === 0 && paid > 0.01) {
            history.push({
              id: 'init-p',
              date: item.updated_at ? item.updated_at.slice(0, 10) : (item.created_at ? item.created_at.slice(0, 10) : ''),
              amount: paid,
              amount_ves: paid * activeRate,
              bank_name: 'Abono registrado',
              ref: 'ABONO'
            });
          }

          let computedStatus: PayableRecord['status'] = 'Pendiente';
          const isOverdue = item.due_date && new Date(item.due_date) < now && balance > 0;

          if (balance <= 0 || item.status === 'PAGADO' || item.status === 'Pagada') {
            computedStatus = 'Pagada';
          } else if (isOverdue) {
            computedStatus = 'Vencida';
          } else if (paid > 0 && balance < total) {
            computedStatus = 'Parcial';
          } else {
            computedStatus = 'Pendiente';
          }

          const supInfo = item.suppliers || {};

          return {
            id: item.id,
            supplier_id: item.supplier_id || supInfo.id || null,
            supplier_name: item.supplier_name || supInfo.name || 'Proveedor sin nombre',
            supplier_doc: item.supplier_doc || supInfo.doc_number || '',
            supplier_phone: item.supplier_phone || supInfo.phone || '',
            supplier_email: item.supplier_email || supInfo.email || '',
            supplier_contact: item.supplier_contact || supInfo.contact_person || '',
            doc_number: item.doc_number || 'FACT',
            concept: item.concept || 'Factura de compra o compromiso comercial',
            origin: item.origin || 'Compra Interna',
            total_amount: total,
            paid_amount: paid,
            remaining_amount: balance,
            issue_date: item.issue_date || (item.created_at ? item.created_at.slice(0, 10) : ''),
            due_date: item.due_date || '',
            status: computedStatus,
            description: item.description || '',
            payments_history: history
          };
        });

        setPayables(mapped);
        if (mapped.length > 0 && !selectedPayable) {
          setSelectedPayable(mapped[0]);
        }
      } else {
        // En ausencia de registros previos en Supabase, inicializar con mock data representativo
        setPayables(MOCK_PAYABLES);
        if (!selectedPayable) {
          setSelectedPayable(MOCK_PAYABLES[0]);
        }
      }
    } catch (err: any) {
      console.warn('Aviso cargando cuentas por pagar:', err);
      setPayables(MOCK_PAYABLES);
      if (!selectedPayable) {
        setSelectedPayable(MOCK_PAYABLES[0]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Mantener actualizado el elemento seleccionado tras cambios
  useEffect(() => {
    if (selectedPayable && payables.length > 0) {
      const match = payables.find((p) => p.id === selectedPayable.id);
      if (match) {
        setSelectedPayable(match);
      }
    }
  }, [payables]);

  // Lista única de proveedores para el selector de filtro (combina facturas y catálogo de proveedores)
  const uniqueSupplierNames = useMemo(() => {
    const set = new Set<string>();
    payables.forEach((p) => {
      if (p.supplier_name) set.add(p.supplier_name);
    });
    suppliersList.forEach((s) => {
      if (s.name) set.add(s.name);
    });
    return Array.from(set).sort();
  }, [payables, suppliersList]);

  // Filtrado de cuentas por pagar
  const filteredPayables = useMemo(() => {
    return payables.filter((p) => {
      const query = searchTerm.toLowerCase().trim();
      const matchSearch =
        !query ||
        p.supplier_name.toLowerCase().includes(query) ||
        p.doc_number.toLowerCase().includes(query) ||
        p.concept.toLowerCase().includes(query);

      const matchSupplier =
        selectedSupplierFilter === 'Todos' || p.supplier_name === selectedSupplierFilter;

      const matchStatus =
        selectedStatusFilter === 'Todos' || p.status === selectedStatusFilter;

      return matchSearch && matchSupplier && matchStatus;
    });
  }, [payables, searchTerm, selectedSupplierFilter, selectedStatusFilter]);

  // Agrupación y consolidación por Proveedor
  const groupedSuppliers = useMemo(() => {
    const map = new Map<string, {
      supplierName: string;
      supplierDoc?: string;
      supplierPhone?: string;
      payables: PayableRecord[];
      totalAmount: number;
      totalPending: number;
      pendingCount: number;
      status: PayableRecord['status'];
    }>();

    filteredPayables.forEach((pay) => {
      const name = pay.supplier_name || 'Proveedor sin nombre';
      if (!map.has(name)) {
        map.set(name, {
          supplierName: name,
          supplierDoc: pay.supplier_doc,
          supplierPhone: pay.supplier_phone,
          payables: [],
          totalAmount: 0,
          totalPending: 0,
          pendingCount: 0,
          status: 'Pagada'
        });
      }
      const group = map.get(name)!;
      group.payables.push(pay);
      group.totalAmount += pay.total_amount;
      group.totalPending += pay.remaining_amount;
      if (pay.remaining_amount > 0.01) {
        group.pendingCount++;
      }
    });

    const result = Array.from(map.values()).map(group => {
      let status: PayableRecord['status'] = 'Pagada';
      const hasOverdue = group.payables.some(p => p.status === 'Vencida');
      const hasPending = group.totalPending > 0.01;
      const hasPartial = group.payables.some(p => p.status === 'Parcial' || (p.paid_amount > 0 && p.remaining_amount > 0));

      if (hasOverdue) status = 'Vencida';
      else if (hasPending && hasPartial) status = 'Parcial';
      else if (hasPending) status = 'Pendiente';
      else status = 'Pagada';

      return {
        ...group,
        status
      };
    });

    return result.sort((a, b) => {
      if (a.totalPending > 0.01 && b.totalPending <= 0.01) return -1;
      if (a.totalPending <= 0.01 && b.totalPending > 0.01) return 1;
      return a.supplierName.localeCompare(b.supplierName);
    });
  }, [filteredPayables]);

  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());

  const toggleSupplierAccordion = (supplierName: string) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(supplierName)) {
        next.delete(supplierName);
      } else {
        next.add(supplierName);
      }
      return next;
    });
  };

  // Cálculos de métricas globales (KPIs)
  const totalCartera = useMemo(() => {
    return payables.reduce((acc, curr) => acc + curr.total_amount, 0);
  }, [payables]);

  const totalPendiente = useMemo(() => {
    return payables.reduce((acc, curr) => acc + curr.remaining_amount, 0);
  }, [payables]);

  const totalVencido = useMemo(() => {
    const now = new Date();
    return payables
      .filter((p) => p.status === 'Vencida' || (p.remaining_amount > 0 && p.due_date && new Date(p.due_date) < now))
      .reduce((acc, curr) => acc + curr.remaining_amount, 0);
  }, [payables]);

  const uniqueSuppliersWithBalance = useMemo(() => {
    const set = new Set<string>();
    payables.forEach((p) => {
      if (p.remaining_amount > 0 && p.supplier_name) {
        set.add(p.supplier_name);
      }
    });
    return set.size;
  }, [payables]);

  // Registro de nueva factura de compra / cuenta por pagar
  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseFloat(formTotalUsd);
    if (isNaN(total) || total <= 0) {
      showToast('Ingrese un monto total válido en USD.', 'error');
      return;
    }

    let supplierName = formSupplierName.trim();
    let supplierDoc = formSupplierDoc.trim();
    let supplierPhone = formSupplierPhone.trim();
    let supplierEmail = formSupplierEmail.trim();
    let supplierContact = formSupplierContact.trim();
    let supplierAddress = formSupplierAddress.trim();
    let supplierId = formSupplierId;

    if (formSupplierMode === 'existing') {
      const found = suppliersList.find((s) => s.id === formSupplierId);
      if (found) {
        supplierName = found.name;
        supplierDoc = found.doc_number || '';
        supplierPhone = found.phone || '';
        supplierEmail = found.email || '';
        supplierContact = found.contact_person || '';
        supplierId = found.id;
      } else if (!supplierName) {
        showToast('Seleccione un proveedor de la lista o cámbielo a nuevo.', 'error');
        return;
      }
    } else {
      if (!supplierName) {
        showToast('Ingrese el nombre de la empresa o proveedor.', 'error');
        return;
      }
    }

    const docNo = formDocNumber.trim() || `FACT-${Date.now().toString().slice(-5)}`;
    const initialAmt = formHasInitialPayment ? parseFloat(formInitialPaymentUsd) || 0 : 0;

    if (formHasInitialPayment && (initialAmt <= 0 || initialAmt > total)) {
      showToast('El abono inicial debe ser mayor a cero y no puede superar el total.', 'error');
      return;
    }

    setIsSubmittingInvoice(true);
    try {
      // Si se crea un nuevo proveedor y está marcada la opción de guardarlo en la tabla de proveedores
      let isNewSupplierSaved = false;
      if (formSupplierMode === 'new' && formSaveSupplierToDb) {
        try {
          const newSupPayload = {
            name: supplierName,
            doc_type: supplierDoc.startsWith('J-') || supplierDoc.startsWith('J')
              ? 'RIF Jurídico'
              : supplierDoc.startsWith('G-') || supplierDoc.startsWith('G')
              ? 'RIF Gubernamental'
              : 'RIF (J / G / V)',
            doc_number: supplierDoc.toUpperCase(),
            phone: supplierPhone,
            email: supplierEmail,
            contact_person: supplierContact,
            address: supplierAddress,
            category: 'Proveedor de Bienes y Servicios',
            balance_usd: 0,
            status: 'Activo' as const
          };

          const savedSupplier = await createSupplierInSupabase(newSupPayload);
          if (savedSupplier) {
            supplierId = savedSupplier.id;
            isNewSupplierSaved = true;
            // Actualizar la lista en memoria para que esté disponible inmediatamente en el selector y filtros
            setSuppliersList((prev) => [savedSupplier as Supplier, ...prev.filter((s) => s.id !== savedSupplier.id)]);
          }
        } catch (supErr) {
          console.warn('Aviso guardando nuevo proveedor previo a factura:', supErr);
        }
      }

      const payload = {
        supplier_id: supplierId || null,
        supplier_name: supplierName,
        supplier_doc: supplierDoc,
        supplier_phone: supplierPhone,
        supplier_email: supplierEmail,
        supplier_contact: supplierContact,
        supplier_address: supplierAddress,
        create_new_supplier: isNewSupplierSaved ? false : (formSupplierMode === 'new' && formSaveSupplierToDb),
        save_supplier: isNewSupplierSaved ? false : formSaveSupplierToDb,
        doc_number: docNo,
        concept: formConcept.trim() || 'Compra de insumos o servicios',
        origin: 'Compra Interna',
        total_usd: total,
        initial_usd: initialAmt,
        exchange_rate: activeRate,
        due_date: formDueDate || null,
        issue_date: formIssueDate || new Date().toISOString().slice(0, 10),
        bank_account_id: formInitialBankId || null,
        initial_payment_method: formInitialPaymentMethod,
        initial_reference: formInitialReference.trim() || 'ABONO-INICIAL',
        description: `Registrado desde el módulo de Cuentas por Pagar`
      };

      const res = await authenticatedFetch('/api/accounts-payable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || 'Error al guardar la factura');
      }

      if (isNewSupplierSaved || (formSupplierMode === 'new' && formSaveSupplierToDb)) {
        showToast(`Proveedor "${supplierName}" guardado en la tabla de proveedores y factura vinculada exitosamente.`, 'success');
      } else {
        showToast(`Factura vinculada al proveedor "${supplierName}" registrada exitosamente.`, 'success');
      }

      setIsInvoiceModalOpen(false);

      // Limpiar formulario
      setFormDocNumber('');
      setFormConcept('');
      setFormTotalUsd('');
      setFormHasInitialPayment(false);
      setFormInitialPaymentUsd('');
      setFormInitialReference('');
      setFormSupplierName('');
      setFormSupplierDoc('');
      setFormSupplierPhone('');
      setFormSupplierEmail('');
      setFormSupplierContact('');
      setFormSupplierAddress('');
      setFormSupplierId('');

      // Recargar lista
      await loadData();
    } catch (err: any) {
      console.error('Error registrando factura de proveedor:', err);
      showToast(err.message || 'Error registrando la factura', 'error');
    } finally {
      setIsSubmittingInvoice(false);
    }
  };

  // Registro de abono / pago a proveedor
  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayable) return;

    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('El monto a abonar debe ser mayor a 0.', 'error');
      return;
    }

    if (amt > selectedPayable.remaining_amount + 0.001) {
      showToast(`El monto no puede superar el saldo pendiente ($ ${selectedPayable.remaining_amount.toFixed(2)}).`, 'error');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const payload = {
        amount_usd: amt,
        amount_ves: Math.round(amt * activeRate * 100) / 100,
        exchange_rate: activeRate,
        bank_account_id: payBankId || null,
        payment_method: payMethod,
        reference: payReference.trim() || `PAGO-${Date.now().toString().slice(-6)}`
      };

      const res = await authenticatedFetch(`/api/accounts-payable/${selectedPayable.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || 'No se pudo procesar el pago al proveedor');
      }

      showToast(`Abono de $ ${amt.toFixed(2)} registrado correctamente.`, 'success');
      setIsPayModalOpen(false);
      setPayAmount('');
      setPayReference('');

      await loadData();
    } catch (err: any) {
      console.error('Error al registrar abono:', err);
      showToast(err.message || 'Error registrando pago', 'error');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Exportar reporte a PDF
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

    const business = getBusinessProfile();
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reporte de Cuentas por Pagar - ${business.businessName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #ffffff; color: #111827; }
          .header-banner { background-color: #4b5563; color: #ffffff; padding: 16px; border-radius: 6px; margin-bottom: 20px; }
          .header-banner h2 { color: #ffffff; margin: 0 0 4px; font-size: 18px; }
          .header-banner p { color: #e5e7eb; font-size: 12px; margin: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
          th { background-color: #4b5563; color: #ffffff; font-weight: bold; border: 1px solid #d1d5db; padding: 10px; text-align: left; }
          td { background-color: #ffffff; color: #111827; border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
          tr:nth-child(even) td { background-color: #f9fafb; }
          .footer { margin-top: 20px; font-size: 10px; color: #6b7280; text-align: right; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${getReportHeaderHtml('Reporte Consolidado de Cuentas por Pagar', `Generado el: ${new Date().toLocaleString()} | Proveedores: ${groupedSuppliers.length} | Documentos: ${filteredPayables.length}`)}
        <table>
          <thead>
            <tr>
              <th>Documento</th>
              <th>Proveedor</th>
              <th>RIF/Doc</th>
              <th>Concepto</th>
              <th>Emisión</th>
              <th>Vencimiento</th>
              <th>Total ($)</th>
              <th>Abonado ($)</th>
              <th>Pendiente ($)</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${filteredPayables.map(p => `
              <tr>
                <td>${p.doc_number}</td>
                <td>${p.supplier_name}</td>
                <td>${p.supplier_doc || ''}</td>
                <td>${p.concept}</td>
                <td>${p.issue_date}</td>
                <td>${p.due_date}</td>
                <td>$${p.total_amount.toFixed(2)}</td>
                <td>$${p.paid_amount.toFixed(2)}</td>
                <td>$${p.remaining_amount.toFixed(2)}</td>
                <td>${p.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${getReportFooterHtml()}
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

  // Exportar reporte a XLS
  const handleExportXLS = () => {
    setIsExportDropdownOpen(false);
    if (filteredPayables.length === 0) {
      showToast('No hay cuentas por pagar para exportar.', 'info');
      return;
    }
    const htmlTable = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; }
          .header-banner { background-color: #4b5563; color: #ffffff; padding: 12px; margin-bottom: 15px; }
          table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; }
          th { background-color: #4b5563; color: #ffffff; font-weight: bold; border: 1px solid #d1d5db; padding: 10px; text-align: left; }
          td { background-color: #ffffff; color: #111827; border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
          tr:nth-child(even) td { background-color: #f9fafb; }
        </style>
      </head>
      <body>
        ${getReportHeaderHtml('Reporte Consolidado de Cuentas por Pagar')}
        <table>
          <thead>
            <tr>
              <th>Documento</th>
              <th>Proveedor</th>
              <th>RIF/Doc</th>
              <th>Concepto</th>
              <th>Origen</th>
              <th>Fecha Emisión</th>
              <th>Fecha Vencimiento</th>
              <th>Total USD</th>
              <th>Abonado USD</th>
              <th>Saldo Pendiente USD</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${filteredPayables.map(p => `
              <tr>
                <td>${p.doc_number}</td>
                <td>${p.supplier_name}</td>
                <td>${p.supplier_doc || ''}</td>
                <td>${p.concept}</td>
                <td>${p.origin}</td>
                <td>${p.issue_date}</td>
                <td>${p.due_date}</td>
                <td>$${p.total_amount.toFixed(2)}</td>
                <td>$${p.paid_amount.toFixed(2)}</td>
                <td>$${p.remaining_amount.toFixed(2)}</td>
                <td>${p.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
    const blob = new Blob([htmlTable], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cuentas_por_pagar_${new Date().toISOString().slice(0, 10)}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Archivo Excel (.xls) generado con éxito.');
  };

  const now = new Date();

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 60 }}>
      {/* Toast Notifier */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            background: toast.type === 'error' ? '#ef4444' : toast.type === 'info' ? '#3b82f6' : '#10b981',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 12,
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            fontWeight: 700
          }}
        >
          {toast.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0' }}>
            Cuentas por pagar
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => {
              reloadSuppliers();
              setIsInvoiceModalOpen(true);
            }}
            style={{
              height: 40,
              padding: '0 18px',
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
            <Plus size={16} style={{ color: '#40E0D0' }} /> Registro Factura
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

      {/* 4 KPI Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <div
            className="kpi-label"
            style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}
          >
            CARTERA TOTAL
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>
            {formatVES(totalCartera * activeRate)} · {formatUSD(totalCartera, '$ ')}
          </div>
          <span className="muted small" style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>
            Compromisos facturados por proveedores
          </span>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div
            className="kpi-label"
            style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}
          >
            SALDO PENDIENTE
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>
            {formatVES(totalPendiente * activeRate)} · {formatUSD(totalPendiente, '$ ')}
          </div>
          <span className="muted small" style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>
            Por liquidar a proveedores
          </span>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div
            className="kpi-label"
            style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}
          >
            SALDO VENCIDO
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#b91c1c', marginTop: 8 }}>
            {formatVES(totalVencido * activeRate)} · {formatUSD(totalVencido, '$ ')}
          </div>
          <span className="muted small" style={{ fontSize: 11, color: '#b91c1c', display: 'block', marginTop: 4 }}>
            Facturas con vencimiento expirado
          </span>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div
            className="kpi-label"
            style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}
          >
            PROVEEDORES CON SALDO
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 8 }}>
            {uniqueSuppliersWithBalance}
          </div>
          <span className="muted small" style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>
            Con cuentas por pagar activas
          </span>
        </div>
      </div>

      {/* Control Filter Bar */}
      <div
        className="card"
        style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}
      >
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
            minWidth: 260
          }}
        >
          <Search size={16} style={{ color: '#94a3b8' }} />
          <input
            placeholder="Buscar proveedor, documento o concepto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, width: '100%' }}
          />
        </div>

        <select
          value={selectedSupplierFilter}
          onChange={(e) => setSelectedSupplierFilter(e.target.value)}
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
            minWidth: 210
          }}
        >
          <option value="Todos">Todos los proveedores</option>
          {uniqueSupplierNames.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
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
            minWidth: 170
          }}
        >
          <option value="Todos">Todos los estados</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Parcial">Parcial</option>
          <option value="Pagada">Pagada</option>
          <option value="Vencida">Vencida</option>
        </select>
      </div>

      {/* Main Content Grid: Left Table, Right Side Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Left: Detailed Report Table */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
              Reporte detallado ({filteredPayables.length})
            </h3>
          </div>

          {groupedSuppliers.length === 0 ? (
            <div className="empty" style={{ padding: '48px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No se encontraron cuentas por pagar que coincidan con los filtros aplicados.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {groupedSuppliers.map((sup) => {
                const isExpanded = expandedSuppliers.has(sup.supplierName);
                const now = new Date();

                return (
                  <div
                    key={sup.supplierName}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      overflow: 'hidden',
                      background: '#fff'
                    }}
                  >
                    {/* Supplier Header Row */}
                    <div
                      style={{
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: isExpanded ? '#faf5ff' : '#fff',
                        borderBottom: isExpanded ? '1px solid #ede9fe' : 'none'
                      }}
                    >
                      <div
                        onClick={() => {
                          if (sup.payables.length > 0) {
                            setSelectedPayable(sup.payables[0]);
                          }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                        title="Toca para ver transacción en el panel lateral"
                      >
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
                          <Truck size={18} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                              {sup.supplierName}
                            </span>
                            {sup.supplierDoc && (
                              <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>
                                ({sup.supplierDoc})
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                              {sup.payables.length} {sup.payables.length === 1 ? 'documento' : 'documentos'}
                            </span>
                            <span style={{ fontSize: 11, color: '#cbd5e1' }}>•</span>
                            {sup.pendingCount > 0 ? (
                              <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700 }}>
                                {sup.pendingCount} pendiente{sup.pendingCount > 1 ? 's' : ''}
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
                          <div style={{ fontSize: 14, fontWeight: 800, color: sup.totalPending > 0 ? '#0f172a' : '#059669' }}>
                            Saldo: {formatUSD(sup.totalPending, '$ ')}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {formatVES(sup.totalPending * activeRate)}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Badge
                            tone={
                              sup.status === 'Pagada'
                                ? 'success'
                                : sup.status === 'Parcial'
                                ? 'warning'
                                : sup.status === 'Vencida'
                                ? 'danger'
                                : 'brand'
                            }
                          >
                            {sup.status}
                          </Badge>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSupplierAccordion(sup.supplierName);
                            }}
                            aria-label={isExpanded ? 'Contraer documentos del proveedor' : 'Desplegar documentos del proveedor'}
                            title={isExpanded ? 'Clic en la flecha para contraer' : 'Clic en la flecha para desplegar'}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 10px',
                              borderRadius: 8,
                              background: isExpanded ? '#ede9fe' : '#f1f5f9',
                              color: isExpanded ? '#7c3aed' : '#475569',
                              border: '1px solid',
                              borderColor: isExpanded ? '#c4b5fd' : '#cbd5e1',
                              cursor: 'pointer',
                              fontSize: 12,
                              fontWeight: 700,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span style={{ fontSize: 11 }}>{isExpanded ? 'Ocultar' : 'Desplegar'}</span>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Payables of this Supplier */}
                    {isExpanded && (
                      <div style={{ background: '#f8fafc', padding: '12px 16px', borderTop: '1px solid #ede9fe' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Facturas y documentos de {sup.supplierName}:
                          </span>
                          <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>
                            Toca un documento para inspeccionar su historial de pagos ➔
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {sup.payables.map((pay) => {
                            const isSelected = selectedPayable?.id === pay.id;

                            return (
                              <div
                                key={pay.id}
                                onClick={() => setSelectedPayable(pay)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '12px 14px',
                                  borderRadius: 10,
                                  background: isSelected ? '#f5f3ff' : '#fff',
                                  border: isSelected ? '2px solid #7c3aed' : '1px solid var(--border)',
                                  cursor: 'pointer',
                                  boxShadow: isSelected ? '0 4px 12px rgba(124,58,237,0.12)' : 'none',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 800, color: '#7c3aed', background: '#f3e8ff', padding: '2px 6px', borderRadius: 4 }}>
                                      {pay.doc_number}
                                    </span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                                      {pay.concept}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 11, color: '#64748b' }}>
                                    <span>Vence: <b>{pay.due_date || 'Sin fecha'}</b></span>
                                    <span>•</span>
                                    <span>Total: <b>{formatUSD(pay.total_amount)}</b></span>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: pay.remaining_amount > 0 ? '#b91c1c' : '#059669' }}>
                                      Pendiente: {formatUSD(pay.remaining_amount, '$ ')}
                                    </div>
                                    <span style={{ fontSize: 10, color: '#64748b' }}>
                                      {formatVES(pay.remaining_amount * activeRate)}
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span
                                      style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        borderRadius: 6,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        background:
                                          pay.status === 'Pagada'
                                            ? '#dcfce7'
                                            : pay.status === 'Vencida'
                                            ? '#fee2e2'
                                            : pay.status === 'Parcial'
                                            ? '#dbeafe'
                                            : '#fef3c7',
                                        color:
                                          pay.status === 'Pagada'
                                            ? '#166534'
                                            : pay.status === 'Vencida'
                                            ? '#991b1b'
                                            : pay.status === 'Parcial'
                                            ? '#1e40af'
                                            : '#92400e'
                                      }}
                                    >
                                      {pay.status.toUpperCase()}
                                    </span>

                                    {pay.remaining_amount > 0 ? (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedPayable(pay);
                                          setPayAmount(pay.remaining_amount.toString());
                                          setIsPayModalOpen(true);
                                        }}
                                        style={{
                                          height: 28,
                                          padding: '0 10px',
                                          borderRadius: 6,
                                          background: '#7c3aed',
                                          color: '#fff',
                                          border: 'none',
                                          fontSize: 11,
                                          fontWeight: 700,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Abonar
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>
                                        ✓ Cancelada
                                      </span>
                                    )}
                                  </div>
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
          )}
        </div>

        {/* Right: Supplier History & Details Panel */}
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
              borderBottom: '1px solid var(--border)',
              paddingBottom: 10
            }}
          >
            <Clock size={16} style={{ color: '#7c3aed' }} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
              Historial del proveedor
            </h3>
          </div>

          {!selectedPayable ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <Truck size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <p style={{ fontSize: 13, margin: 0 }}>
                Haga clic sobre una factura para consultar sus amortizaciones y datos de contacto.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Proveedor Info */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                      PROVEEDOR
                    </span>
                    <h4 style={{ margin: '2px 0 0', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                      {selectedPayable.supplier_name}
                    </h4>
                  </div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 800,
                      background: '#f1f5f9',
                      color: '#475569'
                    }}
                  >
                    {selectedPayable.origin}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#7c3aed', fontWeight: 700 }}>
                    Doc: {selectedPayable.doc_number}
                  </span>
                  {selectedPayable.supplier_doc && (
                    <span style={{ fontSize: 11, color: '#64748b', background: '#f8fafc', padding: '1px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                      RIF: {selectedPayable.supplier_doc}
                    </span>
                  )}
                </div>

                {/* Contact Data */}
                {(selectedPayable.supplier_phone || selectedPayable.supplier_email || selectedPayable.supplier_contact) && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11 }}>
                    {selectedPayable.supplier_contact && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#334155', fontWeight: 600 }}>
                        <User size={12} style={{ color: '#7c3aed' }} /> {selectedPayable.supplier_contact}
                      </div>
                    )}
                    {selectedPayable.supplier_phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', marginTop: 3 }}>
                        <Phone size={12} /> {selectedPayable.supplier_phone}
                      </div>
                    )}
                    {selectedPayable.supplier_email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', marginTop: 3 }}>
                        <Mail size={12} /> {selectedPayable.supplier_email}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3 Summary Boxes: Facturado, Abonado, Pendiente */}
              <div
                style={{
                  background: '#f8fafc',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8
                }}
              >
                <div>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Total Factura</span>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                    {formatUSD(selectedPayable.total_amount, '$ ')}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Abonado</span>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#059669' }}>
                    {formatUSD(selectedPayable.paid_amount, '$ ')}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Pendiente</span>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#b91c1c' }}>
                    {formatUSD(selectedPayable.remaining_amount, '$ ')}
                  </div>
                </div>
              </div>

              {/* Historial de amortizaciones */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Amortizaciones / Pagos ({selectedPayable.payments_history?.length || 0})
                  </span>
                </div>

                {!selectedPayable.payments_history || selectedPayable.payments_history.length === 0 ? (
                  <span className="muted small" style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', display: 'block', padding: '12px 0' }}>
                    No se han registrado pagos o amortizaciones previas para esta factura.
                  </span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {selectedPayable.payments_history.map((pay, idx) => (
                      <div
                        key={pay.id || idx}
                        style={{
                          padding: '8px 10px',
                          background: '#f5f3ff',
                          borderRadius: 8,
                          border: '1px solid #ede9fe',
                          fontSize: 11,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>
                            {formatUSD(pay.amount, '$ ')}
                            {pay.amount_ves && (
                              <span style={{ fontSize: 10, fontWeight: 500, color: '#64748b', marginLeft: 6 }}>
                                ({formatVES(pay.amount_ves)})
                              </span>
                            )}
                          </div>
                          <span style={{ color: '#64748b', fontSize: 10 }}>
                            {pay.bank_name} {pay.ref ? `· Ref: ${pay.ref}` : ''}
                          </span>
                        </div>
                        <span style={{ color: '#7c3aed', fontWeight: 700, fontSize: 10 }}>{pay.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botón de acción para abonar a la cuenta */}
              {selectedPayable.remaining_amount > 0 ? (
                <button
                  onClick={() => {
                    setPayAmount(selectedPayable.remaining_amount.toString());
                    setIsPayModalOpen(true);
                  }}
                  style={{
                    height: 40,
                    width: '100%',
                    borderRadius: 10,
                    background: '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginTop: 6,
                    boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  <DollarSign size={16} /> Registrar Pago / Abonar Saldo
                </button>
              ) : (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#dcfce7',
                    color: '#166534',
                    fontWeight: 700,
                    fontSize: 12,
                    textAlign: 'center',
                    marginTop: 6
                  }}
                >
                  ✓ Esta factura se encuentra totalmente liquidada
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Registrar Factura de Proveedor */}
      {isInvoiceModalOpen && (
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
              maxWidth: 580,
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <button
              onClick={() => setIsInvoiceModalOpen(false)}
              style={{
                position: 'absolute',
                top: 20,
                right: 20,
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: '#f5f3ff',
                  color: '#7c3aed',
                  display: 'grid',
                  placeItems: 'center'
                }}
              >
                <Plus size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                  Registrar factura de proveedor
                </h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Crea un compromiso comercial con amortizaciones en dólares y bolívares.
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveInvoice} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Selector de modo de proveedor */}
              <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setFormSupplierMode('existing');
                      reloadSuppliers();
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      border: formSupplierMode === 'existing' ? '2px solid #7c3aed' : '1px solid var(--border)',
                      background: formSupplierMode === 'existing' ? '#f5f3ff' : '#fff',
                      color: formSupplierMode === 'existing' ? '#7c3aed' : '#475569',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <Building size={14} /> Seleccionar de Proveedores ({suppliersList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormSupplierMode('new')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      border: formSupplierMode === 'new' ? '2px solid #7c3aed' : '1px solid var(--border)',
                      background: formSupplierMode === 'new' ? '#f5f3ff' : '#fff',
                      color: formSupplierMode === 'new' ? '#7c3aed' : '#475569',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <Plus size={14} /> Nuevo Proveedor
                  </button>
                </div>

                {formSupplierMode === 'existing' ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                        PROVEEDOR VINCULADO (TABLA DE PROVEEDORES) *
                      </label>
                      <button
                        type="button"
                        onClick={() => reloadSuppliers()}
                        disabled={isRefreshingSuppliers}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#7c3aed',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        {isRefreshingSuppliers ? 'Sincronizando...' : '🔄 Sincronizar proveedores'}
                      </button>
                    </div>
                    <select
                      value={formSupplierId}
                      onChange={(e) => {
                        const supId = e.target.value;
                        setFormSupplierId(supId);
                        const s = suppliersList.find((sup) => sup.id === supId);
                        if (s) {
                          setFormSupplierName(s.name);
                          setFormSupplierDoc(s.doc_number || '');
                          setFormSupplierPhone(s.phone || '');
                          setFormSupplierEmail(s.email || '');
                          setFormSupplierContact(s.contact_person || '');
                          setFormSupplierAddress((s as any).address || '');
                        } else {
                          setFormSupplierName('');
                          setFormSupplierDoc('');
                          setFormSupplierPhone('');
                          setFormSupplierEmail('');
                          setFormSupplierContact('');
                          setFormSupplierAddress('');
                        }
                      }}
                      required
                      style={{
                        width: '100%',
                        height: 40,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        padding: '0 12px',
                        fontSize: 13,
                        background: '#fff'
                      }}
                    >
                      <option value="">
                        {suppliersList.length > 0
                          ? `Seleccione un proveedor de la tabla (${suppliersList.length} registrados)...`
                          : 'Cargando proveedores de la base de datos...'}
                      </option>
                      {suppliersList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.doc_number ? `(${s.doc_number})` : ''} {s.phone ? `· ${s.phone}` : ''}
                        </option>
                      ))}
                    </select>

                    {/* Ficha de datos vinculados del proveedor seleccionado */}
                    {formSupplierId && formSupplierName && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: '10px 12px',
                          background: '#f8fafc',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          fontSize: 12
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 800, color: '#0f172a' }}>{formSupplierName}</span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: '#dcfce7',
                              color: '#166534'
                            }}
                          >
                            ✓ Vinculado a tabla de proveedores
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', color: '#64748b', fontSize: 11 }}>
                          {formSupplierDoc && <span><strong>RIF:</strong> {formSupplierDoc}</span>}
                          {formSupplierPhone && <span><strong>Tel:</strong> {formSupplierPhone}</span>}
                          {formSupplierEmail && <span><strong>Correo:</strong> {formSupplierEmail}</span>}
                          {formSupplierContact && <span><strong>Contacto:</strong> {formSupplierContact}</span>}
                        </div>
                      </div>
                    )}

                    {suppliersList.length === 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: '12px',
                          background: '#fffbeb',
                          borderRadius: 8,
                          border: '1px solid #fef3c7',
                          fontSize: 12,
                          color: '#92400e'
                        }}
                      >
                        <div style={{ marginBottom: 6, fontWeight: 600 }}>
                          No se encontraron proveedores en la memoria de la sesión activa.
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => reloadSuppliers()}
                            style={{
                              padding: '6px 12px',
                              background: '#fef08a',
                              border: '1px solid #fde047',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#854d0e',
                              cursor: 'pointer'
                            }}
                          >
                            🔄 Sincronizar tabla de proveedores
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormSupplierMode('new')}
                            style={{
                              padding: '6px 12px',
                              background: '#7c3aed',
                              border: 'none',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#fff',
                              cursor: 'pointer'
                            }}
                          >
                            Nuevo Proveedor
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div
                    style={{
                      padding: '10px 12px',
                      background: '#f5f3ff',
                      borderRadius: 8,
                      border: '1px solid #ede9fe',
                      fontSize: 12,
                      color: '#6d28d9',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <Building size={16} />
                    <span>
                      <strong>Registro de Proveedor:</strong> Los datos se guardarán automáticamente en la tabla oficial de proveedores (<code>suppliers</code>) y se vincularán a esta factura de compra.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                        NOMBRE DEL PROVEEDOR / RAZÓN SOCIAL *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Distribuidora Los Andes C.A."
                        value={formSupplierName}
                        onChange={(e) => setFormSupplierName(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          height: 40,
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          padding: '0 12px',
                          fontSize: 13
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                        RIF / CÉDULA / DOC. FISCAL *
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. J-12345678-9"
                        value={formSupplierDoc}
                        onChange={(e) => setFormSupplierDoc(e.target.value)}
                        style={{
                          width: '100%',
                          height: 40,
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          padding: '0 12px',
                          fontSize: 13
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                        TELÉFONO DE CONTACTO
                      </label>
                      <input
                        type="tel"
                        placeholder="Ej. +58 414-1234567"
                        value={formSupplierPhone}
                        onChange={(e) => setFormSupplierPhone(e.target.value)}
                        style={{
                          width: '100%',
                          height: 40,
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          padding: '0 12px',
                          fontSize: 13
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                        CORREO ELECTRÓNICO
                      </label>
                      <input
                        type="email"
                        placeholder="Ej. ventas@proveedor.com"
                        value={formSupplierEmail}
                        onChange={(e) => setFormSupplierEmail(e.target.value)}
                        style={{
                          width: '100%',
                          height: 40,
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          padding: '0 12px',
                          fontSize: 13
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                        PERSONA DE CONTACTO
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Lic. José Pérez"
                        value={formSupplierContact}
                        onChange={(e) => setFormSupplierContact(e.target.value)}
                        style={{
                          width: '100%',
                          height: 40,
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          padding: '0 12px',
                          fontSize: 13
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                        DIRECCIÓN O UBICACIÓN
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Zona Industrial, Valencia"
                        value={formSupplierAddress}
                        onChange={(e) => setFormSupplierAddress(e.target.value)}
                        style={{
                          width: '100%',
                          height: 40,
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          padding: '0 12px',
                          fontSize: 13
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <input
                      type="checkbox"
                      id="saveSupCheck"
                      checked={formSaveSupplierToDb}
                      onChange={(e) => setFormSaveSupplierToDb(e.target.checked)}
                      style={{ accentColor: '#7c3aed', width: 16, height: 16 }}
                    />
                    <label htmlFor="saveSupCheck" style={{ fontSize: 12, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                      Guardar automáticamente este proveedor en la tabla general de proveedores (<code>suppliers</code>)
                    </label>
                  </div>
                </div>
              )}

              {/* Documento y Concepto */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                    N° FACTURA / CONTROL *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. FACT-0082"
                    value={formDocNumber}
                    onChange={(e) => setFormDocNumber(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: 40,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      padding: '0 12px',
                      fontSize: 13,
                      fontFamily: 'monospace'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                    CONCEPTO / DESCRIPCIÓN *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Adquisición de repuestos y filtros"
                    value={formConcept}
                    onChange={(e) => setFormConcept(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: 40,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      padding: '0 12px',
                      fontSize: 13
                    }}
                  />
                </div>
              </div>

              {/* Fechas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                    FECHA DE EMISIÓN
                  </label>
                  <input
                    type="date"
                    value={formIssueDate}
                    onChange={(e) => setFormIssueDate(e.target.value)}
                    style={{
                      width: '100%',
                      height: 40,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      padding: '0 12px',
                      fontSize: 13
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                    FECHA DE VENCIMIENTO
                  </label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    style={{
                      width: '100%',
                      height: 40,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      padding: '0 12px',
                      fontSize: 13
                    }}
                  />
                </div>
              </div>

              {/* Monto Total */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                  TOTAL FACTURA (USD) *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formTotalUsd}
                    onChange={(e) => setFormTotalUsd(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: 40,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      padding: '0 12px',
                      fontSize: 14,
                      fontWeight: 800
                    }}
                  />
                </div>
                {formTotalUsd && !isNaN(parseFloat(formTotalUsd)) && (
                  <span style={{ fontSize: 12, color: '#64748b', display: 'block', marginTop: 4 }}>
                    Equivalente en bolívares:{' '}
                    <strong style={{ color: '#0f172a' }}>
                      {formatVES(parseFloat(formTotalUsd) * activeRate)}
                    </strong>{' '}
                    (Tasa: {activeRate.toFixed(2)} Bs/$)
                  </span>
                )}
              </div>

              {/* Opción de Abono Inicial */}
              <div
                style={{
                  background: '#f8fafc',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  marginTop: 4
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                  <input
                    type="checkbox"
                    checked={formHasInitialPayment}
                    onChange={(e) => setFormHasInitialPayment(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#7c3aed' }}
                  />
                  Registrar abono inicial con esta factura
                </label>

                {formHasInitialPayment && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                          MONTO ABONADO (USD) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formInitialPaymentUsd}
                          onChange={(e) => setFormInitialPaymentUsd(e.target.value)}
                          style={{
                            width: '100%',
                            height: 36,
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            padding: '0 10px',
                            fontSize: 12,
                            fontWeight: 700
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                          MÉTODO DE PAGO
                        </label>
                        <select
                          value={formInitialPaymentMethod}
                          onChange={(e) => setFormInitialPaymentMethod(e.target.value)}
                          style={{
                            width: '100%',
                            height: 36,
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            padding: '0 10px',
                            fontSize: 12,
                            background: '#fff'
                          }}
                        >
                          <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                          <option value="Pago Móvil">Pago Móvil</option>
                          <option value="Efectivo Dólares ($)">Efectivo Dólares ($)</option>
                          <option value="Efectivo Bolívares (Bs)">Efectivo Bolívares (Bs)</option>
                          <option value="Zelle">Zelle</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                          CUENTA BANCARIA / CAJA (EGRESO)
                        </label>
                        <select
                          value={formInitialBankId}
                          onChange={(e) => setFormInitialBankId(e.target.value)}
                          style={{
                            width: '100%',
                            height: 36,
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            padding: '0 10px',
                            fontSize: 11,
                            background: '#fff'
                          }}
                        >
                          <option value="">Sin vincular a banco</option>
                          {bankAccounts.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.bank_name} ({b.currency}) — Saldo: {b.currency === 'USD' ? `$ ${b.balance}` : `Bs. ${b.balance}`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                          REFERENCIA DE PAGO
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. REF-44810"
                          value={formInitialReference}
                          onChange={(e) => setFormInitialReference(e.target.value)}
                          style={{
                            width: '100%',
                            height: 36,
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            padding: '0 10px',
                            fontSize: 12
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Botón Guardar */}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 8,
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
                  disabled={isSubmittingInvoice}
                  style={{
                    flex: 2,
                    height: 40,
                    borderRadius: 8,
                    background: '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isSubmittingInvoice ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
                    opacity: isSubmittingInvoice ? 0.7 : 1
                  }}
                >
                  {isSubmittingInvoice ? 'Guardando...' : 'Guardar factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Registrar Abono a Proveedor */}
      {isPayModalOpen && selectedPayable && (
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
              maxWidth: 480,
              background: '#fff',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              position: 'relative'
            }}
          >
            <button
              onClick={() => setIsPayModalOpen(false)}
              style={{
                position: 'absolute',
                top: 20,
                right: 20,
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: '#f5f3ff',
                  color: '#7c3aed',
                  display: 'grid',
                  placeItems: 'center'
                }}
              >
                <DollarSign size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                  Registrar abono a proveedor
                </h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {selectedPayable.supplier_name} — Doc: {selectedPayable.doc_number}
                </span>
              </div>
            </div>

            {/* Resumen de saldo pendiente */}
            <div
              style={{
                background: '#f8fafc',
                padding: '12px 16px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Saldo pendiente actual:</span>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#b91c1c' }}>
                  {formatUSD(selectedPayable.remaining_amount, '$ ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>En Bolívares (BCV):</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                  {formatVES(selectedPayable.remaining_amount * activeRate)}
                </div>
              </div>
            </div>

            <form onSubmit={handleProcessPayment} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Monto y botones rápidos */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>
                    MONTO A ABONAR (USD) *
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setPayAmount(selectedPayable.remaining_amount.toString())}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        background: '#f5f3ff',
                        color: '#7c3aed',
                        border: '1px solid #ddd6fe',
                        cursor: 'pointer'
                      }}
                    >
                      100%
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayAmount((selectedPayable.remaining_amount * 0.5).toFixed(2))}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        background: '#f8fafc',
                        color: '#475569',
                        border: '1px solid var(--border)',
                        cursor: 'pointer'
                      }}
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayAmount((selectedPayable.remaining_amount * 0.25).toFixed(2))}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        background: '#f8fafc',
                        color: '#475569',
                        border: '1px solid var(--border)',
                        cursor: 'pointer'
                      }}
                    >
                      25%
                    </button>
                  </div>
                </div>

                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    height: 42,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    padding: '0 12px',
                    fontSize: 15,
                    fontWeight: 800
                  }}
                />
                {payAmount && !isNaN(parseFloat(payAmount)) && (
                  <span style={{ fontSize: 12, color: '#64748b', display: 'block', marginTop: 4 }}>
                    Equivalente en bolívares:{' '}
                    <strong style={{ color: '#0f172a' }}>
                      {formatVES(parseFloat(payAmount) * activeRate)}
                    </strong>
                  </span>
                )}
              </div>

              {/* Cuenta Bancaria de Egreso */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                  CUENTA BANCARIA / CAJA (EGRESO)
                </label>
                <select
                  value={payBankId}
                  onChange={(e) => setPayBankId(e.target.value)}
                  style={{
                    width: '100%',
                    height: 40,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    padding: '0 12px',
                    fontSize: 12,
                    background: '#fff'
                  }}
                >
                  <option value="">Sin vincular a banco específico</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name} ({b.currency}) — Saldo:{' '}
                      {b.currency === 'USD' ? `$ ${b.balance}` : `Bs. ${b.balance}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Método de Pago y Referencia */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                    MÉTODO DE PAGO
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    style={{
                      width: '100%',
                      height: 40,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      padding: '0 12px',
                      fontSize: 12,
                      background: '#fff'
                    }}
                  >
                    <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                    <option value="Pago Móvil">Pago Móvil</option>
                    <option value="Efectivo Dólares ($)">Efectivo Dólares ($)</option>
                    <option value="Efectivo Bolívares (Bs)">Efectivo Bolívares (Bs)</option>
                    <option value="Zelle">Zelle</option>
                    <option value="Punto de Venta">Punto de Venta</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                    REFERENCIA
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. REF-9012"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    style={{
                      width: '100%',
                      height: 40,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      padding: '0 12px',
                      fontSize: 12
                    }}
                  />
                </div>
              </div>

              {/* Botón Guardar */}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 8,
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
                  disabled={isSubmittingPayment}
                  style={{
                    flex: 2,
                    height: 40,
                    borderRadius: 8,
                    background: '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isSubmittingPayment ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
                    opacity: isSubmittingPayment ? 0.7 : 1
                  }}
                >
                  {isSubmittingPayment ? 'Procesando...' : 'Confirmar y pagar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AccountsPayable;
