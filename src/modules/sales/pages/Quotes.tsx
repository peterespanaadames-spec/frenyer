import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  FileText,
  Plus,
  X,
  Trash2,
  ArrowLeft,
  User,
  UserPlus,
  ShoppingCart,
  CheckCircle,
  AlertTriangle,
  Clock,
  Ban,
  Receipt,
  Eye,
  RefreshCw,
  Calendar,
  Percent,
  Printer,
  Download,
  Code,
  Copy,
  Check,
  Edit,
  Share2,
  Phone,
  Hash,
  Wallet,
  CreditCard,
  Building2,
  DollarSign,
  CheckCircle2
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { getActiveExchangeRate, setActiveExchangeRate, convertUSDtoVES, formatUSD, formatVES } from '../../../lib/currency';
import {
  printQuoteDocument,
  downloadQuoteFile,
  type QuoteDocumentData
} from '../utils/quoteDocument';
import {
  fetchProductsFromSupabase,
  fetchCustomersFromSupabase,
  createCustomerInSupabase,
  fetchQuotesFromSupabase,
  createQuoteInSupabase,
  updateQuoteInSupabase,
  deleteQuoteFromSupabase,
  convertQuoteToInvoiceInSupabase,
  rejectQuoteInSupabase,
  fetchBankAccountsFromSupabase,
  getNextInvoiceCorrelative,
  type ConvertQuoteOptions,
  type DbQuote
} from '../../../lib/supabase/db';

interface PosProduct {
  sku: string;
  name: string;
  category: string;
  priceUSD: number;
  stock: number;
}

interface QuoteDraftItem {
  sku: string;
  name: string;
  quantity: number;
  unitPriceUSD: number;
  stock: number;
}

interface CustomerOption {
  id: string;
  name: string;
  docNumber: string;
}

type StatusFilter = 'Todas' | 'Creada' | 'Facturada' | 'Expirada' | 'Rechazada';

export function QuotesPage() {
  const [quotes, setQuotes] = useState<DbQuote[]>([]);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [activeRate, setActiveRate] = useState(() => getActiveExchangeRate());
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [customerFilter, setCustomerFilter] = useState('Todos');
  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Todas');

  // Create modal (full-screen overlay)
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draftCustomerId, setDraftCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [validityDays, setValidityDays] = useState(7);
  const [notes, setNotes] = useState('');
  const [draftItems, setDraftItems] = useState<QuoteDraftItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [isTaxSubject, setIsTaxSubject] = useState(false);
  const [isIgtfApplied, setIsIgtfApplied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // "+ Nuevo Cliente" sub-modal
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerDocType, setNewCustomerDocType] = useState('Natural (V / E)');
  const [newCustomerDocNumber, setNewCustomerDocNumber] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // View detail modal
  const [viewQuote, setViewQuote] = useState<DbQuote | null>(null);

  // Convert confirm modal
  const [convertQuote, setConvertQuote] = useState<DbQuote | null>(null);
  const [convertNextCorrelative, setConvertNextCorrelative] = useState('');
  const [isCheckingCorrelative, setIsCheckingCorrelative] = useState(false);
  const [convertPaymentType, setConvertPaymentType] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [convertBankAccounts, setConvertBankAccounts] = useState<any[]>([]);
  const [convertSelectedBankId, setConvertSelectedBankId] = useState('');
  const [convertPaymentMethod, setConvertPaymentMethod] = useState('Transferencia bancaria');
  const [convertReference, setConvertReference] = useState('');
  const [convertDueDateDays, setConvertDueDateDays] = useState(15);
  const [convertCustomDueDate, setConvertCustomDueDate] = useState('');
  const [convertCreditNotes, setConvertCreditNotes] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<{
    invoiceDocNumber?: string;
    totalUsd?: number;
    totalVes?: number;
    paymentType?: string;
    bankAccountName?: string;
    paymentMethod?: string;
    dueDate?: string;
    removedItems?: Array<{ sku: string; name: string; quantity: number; available: number; reason: string }>;
  } | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Archivo y Documento de Cotización
  const [autoGenerateFile, setAutoGenerateFile] = useState(true);
  const [lastCreatedQuoteDoc, setLastCreatedQuoteDoc] = useState<QuoteDocumentData | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  // Edición de cotización
  const [editingQuote, setEditingQuote] = useState<DbQuote | null>(null);

  // Modal de confirmación para eliminar cotización
  const [deleteConfirmQuote, setDeleteConfirmQuote] = useState<DbQuote | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Modal para compartir cotización
  const [shareQuote, setShareQuote] = useState<DbQuote | null>(null);
  const [isCopiedShare, setIsCopiedShare] = useState(false);

  // Modal para código SQL de Supabase (opcional / conservado)
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [isCopiedSql, setIsCopiedSql] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    const ts = Date.now();
    const [dbQuotes, dbProds, dbCusts, bcvRes] = await Promise.all([
      fetchQuotesFromSupabase(),
      fetchProductsFromSupabase(),
      fetchCustomersFromSupabase(),
      fetch(`/api/bcv/rates?t=${ts}`).then(r => r.json()).catch(() => null)
    ]);

    if (bcvRes) {
      const rateVal = Number(bcvRes.appliedRate) || Number(bcvRes.usdRate) || Number(bcvRes.currentRate);
      if (rateVal && rateVal > 0) {
        setActiveRate(rateVal);
        setActiveExchangeRate(rateVal);
      }
    }

    setQuotes(dbQuotes);
    setProducts((dbProds || []).map(p => ({
      sku: p.sku,
      name: p.name,
      category: p.category || 'General',
      priceUSD: Number(p.price_usd) || 0,
      stock: Number(p.stock) || 0
    })));
    setCustomers((dbCusts || []).map(c => ({
      id: c.id,
      name: c.name,
      docNumber: c.doc_number
    })));
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Derived status: Creada, Facturada, Rechazada, Expirada (creada + vencida)
  const getQuoteStatus = (q: DbQuote): 'Creada' | 'Facturada' | 'Expirada' | 'Rechazada' | 'Pagada' => {
    if (q.quote_status === 'Facturada') return 'Facturada';
    if (q.quote_status === 'Pagada') return 'Pagada';
    if (q.quote_status === 'Rechazada') return 'Rechazada';
    if (q.expires_at && new Date(q.expires_at) < new Date()) return 'Expirada';
    return 'Creada';
  };

  const isRestricted = (status: string) => status === 'Facturada' || status === 'Pagada';


  const getCustomerPhone = (q: DbQuote): string | null => {
    const phone = q.customer?.phone || (q as any).customers?.phone;
    if (phone && phone.trim()) return phone.trim();
    return null;
  };

  const getCustomerDoc = (q: DbQuote): string => {
    const doc = q.customer?.doc_number || (q as any).customers?.doc_number;
    const docType = q.customer?.doc_type || (q as any).customers?.doc_type || 'CI/RIF';
    if (doc) return `${docType}: ${doc}`;
    return 'Cliente comercial';
  };

  const getConceptPreview = (q: DbQuote): string => {
    if (q.notes && q.notes.trim()) {
      return q.notes.trim();
    }
    const rawItems = q.sale_items || q.items || [];
    if (rawItems.length === 0) {
      return 'Cotización general';
    }
    const names = rawItems.map((it: any) => it.name).filter(Boolean);
    if (names.length === 1) {
      return names[0];
    }
    return `${rawItems.length} ítems (${names.slice(0, 2).join(', ')}${names.length > 2 ? '...' : ''})`;
  };

  // Indicadores y métricas ejecutivas
  const metrics = useMemo(() => {
    const total = quotes.length;
    const totalUsd = quotes.reduce((acc, q) => acc + (Number(q.total_usd) || 0), 0);

    const pendientes = quotes.filter(q => getQuoteStatus(q) === 'Creada');
    const pendientesUsd = pendientes.reduce((acc, q) => acc + (Number(q.total_usd) || 0), 0);

    const facturadas = quotes.filter(q => getQuoteStatus(q) === 'Facturada');
    const facturadasUsd = facturadas.reduce((acc, q) => acc + (Number(q.total_usd) || 0), 0);

    const expiradas = quotes.filter(q => getQuoteStatus(q) === 'Expirada');
    const expiradasUsd = expiradas.reduce((acc, q) => acc + (Number(q.total_usd) || 0), 0);

    const rechazadas = quotes.filter(q => getQuoteStatus(q) === 'Rechazada');
    const rechazadasUsd = rechazadas.reduce((acc, q) => acc + (Number(q.total_usd) || 0), 0);

    return {
      total,
      totalUsd,
      pendientesCount: pendientes.length,
      pendientesUsd,
      facturadasCount: facturadas.length,
      facturadasUsd,
      expiradasCount: expiradas.length,
      expiradasUsd,
      rechazadasCount: rechazadas.length,
      rechazadasUsd
    };
  }, [quotes]);

  const categories = ['Todas', ...Array.from(new Set(products.map(p => p.category)))];

  // Filtered quotes
  const filteredQuotes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const productTerm = productFilter.trim().toLowerCase();
    return quotes.filter(q => {
      const status = getQuoteStatus(q);
      const customerName = (q.customer?.name || (q as any).customers?.name || '').toLowerCase();
      const customerPhone = (getCustomerPhone(q) || '').toLowerCase();
      const customerDoc = getCustomerDoc(q).toLowerCase();
      const notesText = (q.notes || '').toLowerCase();

      const matchesSearch = !term
        || q.doc_number.toLowerCase().includes(term)
        || customerName.includes(term)
        || customerPhone.includes(term)
        || customerDoc.includes(term)
        || notesText.includes(term);

      const matchesCustomer = customerFilter === 'Todos' || (q.customer?.name || (q as any).customers?.name || '') === customerFilter;
      const matchesStatus = statusFilter === 'Todas' || status === statusFilter;
      const matchesProduct = !productTerm
        || (q.items || []).some(it =>
            it.name.toLowerCase().includes(productTerm)
            || it.sku.toLowerCase().includes(productTerm));
      return matchesSearch && matchesCustomer && matchesStatus && matchesProduct;
    });
  }, [quotes, searchTerm, customerFilter, productFilter, statusFilter]);

  // Catalog for the create modal
  const filteredProducts = products.filter(p => {
    const matchesSearch = !catalogSearch.trim()
      || p.sku.toLowerCase().includes(catalogSearch.toLowerCase())
      || p.name.toLowerCase().includes(catalogSearch.toLowerCase());
    const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredCustomers = customers.filter(c =>
    !customerSearch.trim()
    || c.name.toLowerCase().includes(customerSearch.toLowerCase())
    || c.docNumber.toLowerCase().includes(customerSearch.toLowerCase())
  );

  // Draft calculations (strictly USD)
  const rawSubtotalUSD = draftItems.reduce((sum, it) => sum + it.unitPriceUSD * it.quantity, 0);
  const discountAmountUSD = rawSubtotalUSD * (discountPercent / 100);
  const taxableBaseUSD = Math.max(0, rawSubtotalUSD - discountAmountUSD);
  const taxAmountUSD = isTaxSubject ? taxableBaseUSD * 0.16 : 0;
  const igtfAmountUSD = isIgtfApplied ? taxableBaseUSD * 0.03 : 0;
  const totalUSD = Math.round((taxableBaseUSD + taxAmountUSD + igtfAmountUSD) * 100) / 100;
  const totalVES = convertUSDtoVES(totalUSD, activeRate);

  // Cart operations
  const addProductToDraft = (product: PosProduct) => {
    if (product.stock <= 0) {
      showToast(`"${product.name}" no tiene stock disponible.`, 'info');
      return;
    }
    setDraftItems(prev => {
      const existing = prev.find(it => it.sku === product.sku);
      if (existing) {
        if (existing.quantity >= product.stock) {
          showToast(`Stock máximo alcanzado para "${product.name}" (${product.stock} unidades).`, 'info');
          return prev;
        }
        return prev.map(it => it.sku === product.sku ? { ...it, quantity: it.quantity + 1 } : it);
      }
      return [...prev, {
        sku: product.sku,
        name: product.name,
        quantity: 1,
        unitPriceUSD: product.priceUSD,
        stock: product.stock
      }];
    });
  };

  const updateDraftQuantity = (sku: string, delta: number) => {
    setDraftItems(prev =>
      prev.map(it => {
        if (it.sku !== sku) return it;
        const next = it.quantity + delta;
        if (next < 0) return it;
        if (next > it.stock) {
          showToast(`Stock máximo disponible para "${it.name}": ${it.stock} unidades.`, 'info');
          return it;
        }
        return { ...it, quantity: next };
      }).filter(it => it.quantity > 0)
    );
  };

  const updateDraftPrice = (sku: string, value: string) => {
    const price = parseFloat(value);
    setDraftItems(prev => prev.map(it =>
      it.sku === sku ? { ...it, unitPriceUSD: Number.isFinite(price) && price >= 0 ? price : it.unitPriceUSD } : it
    ));
  };

  const removeDraftItem = (sku: string) => {
    setDraftItems(prev => prev.filter(it => it.sku !== sku));
  };

  const resetDraft = () => {
    setEditingQuote(null);
    setDraftCustomerId('');
    setCustomerSearch('');
    setIsCustomerDropdownOpen(false);
    setValidityDays(7);
    setNotes('');
    setDraftItems([]);
    setCatalogSearch('');
    setSelectedCategory('Todas');
    setDiscountPercent(0);
    setIsTaxSubject(false);
    setIsIgtfApplied(false);
    setConvertResult(null);
  };

  const openCreateModal = () => {
    resetDraft();
    if (customers.length > 0) {
      setDraftCustomerId(customers[0].id);
      setCustomerSearch(customers[0].name);
    }
    setIsCreateOpen(true);
  };

  const handleOpenEditModal = (q: DbQuote) => {
    resetDraft();
    setEditingQuote(q);
    setDraftCustomerId(q.customer_id || '');
    const cust = customers.find(c => c.id === q.customer_id);
    setCustomerSearch(q.customer?.name || cust?.name || '');
    setNotes(q.notes || '');

    if (q.expires_at) {
      const diffMs = new Date(q.expires_at).getTime() - new Date(q.created_at || Date.now()).getTime();
      const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (days > 0) setValidityDays(days);
    }

    const rawItems = q.sale_items || q.items || [];
    const loadedItems: QuoteDraftItem[] = rawItems.map((it: any) => {
      const prod = products.find(p => p.sku === it.sku);
      return {
        sku: it.sku || `ITEM-${Math.random().toString(36).substring(7)}`,
        name: it.name || 'Producto',
        quantity: Number(it.quantity) || 1,
        unitPriceUSD: Number(it.unit_price_usd) || 0,
        stock: prod ? prod.stock : 999
      };
    });
    setDraftItems(loadedItems);
    setIsCreateOpen(true);
  };

  const handleDeleteQuote = async () => {
    if (!deleteConfirmQuote) return;
    setIsDeleting(true);
    try {
      const res = await deleteQuoteFromSupabase(deleteConfirmQuote.id);
      if (res.success) {
        showToast(`Cotización COT-${deleteConfirmQuote.doc_number} eliminada del histórico.`);
        setDeleteConfirmQuote(null);
        await loadData();
      } else {
        showToast(res.error || 'No se pudo eliminar la cotización.', 'info');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error eliminando cotización', 'info');
    } finally {
      setIsDeleting(false);
    }
  };

  const getShareText = (q: DbQuote) => {
    const docData = getQuoteDocumentData(q);
    const dateFormatted = docData.createdAt ? new Date(docData.createdAt).toLocaleDateString('es-VE') : '';
    const itemsText = docData.items.map(it => `• ${it.name} x${it.quantity} = $${(it.totalUSD).toFixed(2)}`).join('\n');
    return `*COTIZACIÓN FRENYER* — COT-${docData.docNumber}
Cliente: ${docData.customerName}
Fecha: ${dateFormatted}
Tasa de cambio: Bs. ${docData.exchangeRate.toLocaleString('es-VE')} / USD

*DETALLE DE PRODUCTOS:*
${itemsText}

*Subtotal:* $${docData.subtotalUSD.toFixed(2)}
*TOTAL USD:* $${docData.totalUSD.toFixed(2)}
*TOTAL VES:* Bs. ${docData.totalVES.toLocaleString('es-VE')}

_Válida por ${docData.validityDays || 7} días. Cotizado con Frenyer ERP._`;
  };

  const handleShareWhatsApp = (q: DbQuote) => {
    const text = getShareText(q);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleCopyShareText = (q: DbQuote) => {
    const text = getShareText(q);
    navigator.clipboard.writeText(text);
    setIsCopiedShare(true);
    showToast('Resumen de cotización copiado al portapapeles');
    setTimeout(() => setIsCopiedShare(false), 2500);
  };

  const handleSaveNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newCustomerDocNumber.trim()) {
      showToast('Por favor ingresa el nombre y la cédula o RIF.', 'info');
      return;
    }
    setIsSavingCustomer(true);
    try {
      const nextNum = customers.length + 1;
      const created = await createCustomerInSupabase({
        code: `CLI-${nextNum.toString().padStart(4, '0')}`,
        name: newCustomerName.trim(),
        doc_type: newCustomerDocType,
        doc_number: newCustomerDocNumber.trim(),
        phone: newCustomerPhone.trim(),
        email: newCustomerEmail.trim(),
        credit_limit: 0,
        address: newCustomerAddress.trim(),
        status: 'Activo',
        orders_count: 0,
        total_spent_usd: 0,
        last_order_date: new Date().toISOString()
      });
      if (created) {
        const option: CustomerOption = { id: created.id, name: created.name, docNumber: created.doc_number };
        setCustomers(prev => [option, ...prev]);
        setDraftCustomerId(created.id);
        setCustomerSearch(created.name);
        setIsNewCustomerOpen(false);
        showToast(`Cliente ${created.name} registrado y seleccionado.`);
      } else {
        showToast('Error al registrar cliente.', 'info');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error de conexión', 'info');
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // Conversión de cotización a objeto de documento imprimible/descargable
  const getQuoteDocumentData = (q: DbQuote): QuoteDocumentData => {
    const cust = customers.find(c => c.id === q.customer_id);
    const rawItems = q.sale_items || q.items || [];
    const items = rawItems.map((it: any) => ({
      sku: it.sku || '',
      name: it.name || 'Producto',
      quantity: Number(it.quantity) || 1,
      unitPriceUSD: Number(it.unit_price_usd) || 0,
      totalUSD: Number(it.total_usd) || 0,
      totalVES: Number(it.total_ves) || (Number(it.total_usd || 0) * (Number(q.exchange_rate) || activeRate))
    }));

    return {
      docNumber: q.doc_number || '0001',
      createdAt: q.created_at || new Date().toISOString(),
      expiresAt: q.expires_at,
      customerName: q.customer?.name || cust?.name || 'Cliente General',
      customerDoc: cust?.docNumber || '',
      exchangeRate: Number(q.exchange_rate) || activeRate,
      notes: q.notes,
      status: getQuoteStatus(q),
      items: items.length > 0 ? items : [{
        name: 'Ítems de cotización',
        quantity: 1,
        unitPriceUSD: Number(q.total_usd) || 0,
        totalUSD: Number(q.total_usd) || 0,
        totalVES: Number(q.total_ves) || convertUSDtoVES(Number(q.total_usd) || 0, Number(q.exchange_rate) || activeRate)
      }],
      subtotalUSD: Number(q.subtotal_usd) || Number(q.total_usd) || 0,
      totalUSD: Number(q.total_usd) || 0,
      totalVES: Number(q.total_ves) || convertUSDtoVES(Number(q.total_usd) || 0, Number(q.exchange_rate) || activeRate)
    };
  };

  const handlePrintQuote = (q: DbQuote) => {
    const docData = getQuoteDocumentData(q);
    printQuoteDocument(docData);
  };

  const handleDownloadQuote = (q: DbQuote) => {
    const docData = getQuoteDocumentData(q);
    downloadQuoteFile(docData);
    showToast(`Archivo de cotización COT-${docData.docNumber} descargado.`);
  };

  const handleCotizar = async () => {
    let effectiveCustomerId = draftCustomerId;
    if (!effectiveCustomerId && customers.length > 0) {
      effectiveCustomerId = customers[0].id;
      setDraftCustomerId(customers[0].id);
    }

    if (draftItems.length === 0) {
      showToast('Agrega al menos un producto a la cotización.', 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      const currentRateSource = localStorage.getItem('frenyer_bcv_rate_source') || 'BCV_DIRECT';
      const isFutureRateActive = localStorage.getItem('frenyer_bcv_is_future') === 'true';
      const rateValueDate = localStorage.getItem('frenyer_bcv_rate_date') || new Date().toISOString().split('T')[0];

      const selectedCust = customers.find(c => c.id === effectiveCustomerId);

      if (editingQuote) {
        // MODIFICACIÓN DE COTIZACIÓN EXISTENTE
        const result = await updateQuoteInSupabase(editingQuote.id, {
          customerId: effectiveCustomerId,
          validityDays,
          notes,
          items: draftItems.map(it => ({
            sku: it.sku,
            name: it.name,
            quantity: it.quantity,
            unit_price_usd: it.unitPriceUSD
          })),
          exchangeRate: activeRate
        });

        if (!result.success) {
          showToast(result.error || 'No se pudo actualizar la cotización.', 'info');
          return;
        }

        const docData: QuoteDocumentData = {
          docNumber: editingQuote.doc_number,
          createdAt: editingQuote.created_at || new Date().toISOString(),
          validityDays,
          customerName: selectedCust?.name || editingQuote.customer?.name || 'Cliente',
          customerDoc: selectedCust?.docNumber || '',
          exchangeRate: activeRate,
          rateSource: currentRateSource,
          notes,
          items: draftItems.map(it => ({
            sku: it.sku,
            name: it.name,
            quantity: it.quantity,
            unitPriceUSD: it.unitPriceUSD,
            totalUSD: Math.round(it.quantity * it.unitPriceUSD * 100) / 100,
            totalVES: convertUSDtoVES(it.quantity * it.unitPriceUSD, activeRate)
          })),
          subtotalUSD: rawSubtotalUSD,
          discountUSD: discountAmountUSD,
          taxUSD: taxAmountUSD,
          igtfUSD: igtfAmountUSD,
          totalUSD: totalUSD,
          totalVES: totalVES,
          status: 'Creada'
        };

        setLastCreatedQuoteDoc(docData);
        setIsSuccessModalOpen(true);

        if (autoGenerateFile) {
          printQuoteDocument(docData);
        }

        showToast(`Cotización COT-${editingQuote.doc_number} modificada con éxito.`);
        setIsCreateOpen(false);
        resetDraft();
        await loadData();
        return;
      }

      // NUEVA COTIZACIÓN
      const result = await createQuoteInSupabase({
        customerId: effectiveCustomerId,
        validityDays,
        notes,
        items: draftItems.map(it => ({
          sku: it.sku,
          name: it.name,
          quantity: it.quantity,
          unit_price_usd: it.unitPriceUSD
        })),
        exchangeRate: activeRate,
        rateSource: currentRateSource,
        isFutureRate: isFutureRateActive,
        rateValueDate
      });

      if (!result.success) {
        showToast(result.error || 'No se pudo guardar la cotización.', 'info');
        return;
      }

      const docNumber = result.docNumber || '0001';

      // Construir documento de cotización
      const docData: QuoteDocumentData = {
        docNumber,
        createdAt: new Date().toISOString(),
        validityDays,
        customerName: selectedCust?.name || 'Cliente',
        customerDoc: selectedCust?.docNumber || '',
        customerPhone: newCustomerPhone,
        customerEmail: newCustomerEmail,
        customerAddress: newCustomerAddress,
        exchangeRate: activeRate,
        rateSource: currentRateSource,
        notes,
        items: draftItems.map(it => ({
          sku: it.sku,
          name: it.name,
          quantity: it.quantity,
          unitPriceUSD: it.unitPriceUSD,
          totalUSD: Math.round(it.quantity * it.unitPriceUSD * 100) / 100,
          totalVES: convertUSDtoVES(it.quantity * it.unitPriceUSD, activeRate)
        })),
        subtotalUSD: rawSubtotalUSD,
        discountUSD: discountAmountUSD,
        taxUSD: taxAmountUSD,
        igtfUSD: igtfAmountUSD,
        totalUSD: totalUSD,
        totalVES: totalVES,
        status: 'Creada'
      };

      setLastCreatedQuoteDoc(docData);
      // Lleva automáticamente al modal "¿Cotización guardada y generada?"
      setIsSuccessModalOpen(true);

      // Si está activa la opción de autogenerar archivo, abrir diálogo de impresión/PDF o descargar
      if (autoGenerateFile) {
        printQuoteDocument(docData);
      }

      showToast(`¡Cotización COT-${docNumber} guardada en base de datos!`);
      setIsCreateOpen(false);
      resetDraft();
      await loadData();
    } catch (err: any) {
      showToast(err?.message || 'Error al procesar la cotización.', 'info');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openConvertModal = async (quote: DbQuote) => {
    setConvertQuote(quote);
    setConvertPaymentType(quote.payment_type === 'CREDITO' ? 'CREDITO' : 'CONTADO');
    setConvertResult(null);
    setConvertReference('');
    setConvertCreditNotes('');
    setConvertDueDateDays(15);
    const defaultDue = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    setConvertCustomDueDate(defaultDue);
    setIsCheckingCorrelative(true);

    try {
      // 1. Obtener cuentas bancarias de Supabase para vincular el pago de contado
      const bankRes = await fetchBankAccountsFromSupabase();
      if (bankRes.success && Array.isArray(bankRes.data) && bankRes.data.length > 0) {
        setConvertBankAccounts(bankRes.data);
        const firstActive = bankRes.data.find((b: any) => b.status !== 'Inactivo') || bankRes.data[0];
        setConvertSelectedBankId(firstActive.id);
        if (firstActive.currency === 'USD') {
          setConvertPaymentMethod('Efectivo USD');
        } else {
          setConvertPaymentMethod('Transferencia bancaria');
        }
      }

      // 2. Chequear el número o correlativo consecutivo que lleva el sistema
      const nextNum = await getNextInvoiceCorrelative();
      setConvertNextCorrelative(nextNum);
    } catch (e) {
      console.warn('Aviso cargando datos para facturación:', e);
    } finally {
      setIsCheckingCorrelative(false);
    }
  };

  const handleConvertToInvoice = async () => {
    if (!convertQuote) return;
    setIsConverting(true);
    try {
      const result = await convertQuoteToInvoiceInSupabase({
        quoteId: convertQuote.id,
        paymentType: convertPaymentType,
        customDocNumber: convertNextCorrelative.trim(),
        bankAccountId: convertPaymentType === 'CONTADO' ? convertSelectedBankId : undefined,
        paymentMethod: convertPaymentType === 'CONTADO' ? convertPaymentMethod : undefined,
        paymentReference: convertPaymentType === 'CONTADO' ? convertReference.trim() : undefined,
        dueDate: convertPaymentType === 'CREDITO' ? convertCustomDueDate : undefined,
        creditNotes: convertPaymentType === 'CREDITO' ? convertCreditNotes.trim() : undefined
      });

      if (!result.success) {
        showToast(result.error || 'No se pudo convertir la cotización a factura.', 'info');
        return;
      }

      setConvertResult({
        invoiceDocNumber: result.invoiceDocNumber,
        totalUsd: result.totalUsd,
        totalVes: result.totalVes,
        paymentType: result.paymentType,
        bankAccountName: result.bankAccountName,
        paymentMethod: result.paymentMethod,
        dueDate: result.dueDate,
        removedItems: result.removedItems || []
      });

      showToast(`Factura ${result.invoiceDocNumber} generada y registrada en el sistema.`);
      await loadData();
    } catch (err: any) {
      showToast(err?.message || 'Error al convertir la cotización a factura.', 'info');
    } finally {
      setIsConverting(false);
    }
  };

  const handleReject = async (quote: DbQuote) => {
    try {
      const result = await rejectQuoteInSupabase(quote.id);
      if (!result.success) {
        showToast(result.error || 'No se pudo cancelar la cotización.', 'info');
        return;
      }
      showToast(`Cotización ${quote.doc_number} cancelada.`);
      await loadData();
    } catch (err: any) {
      showToast(err?.message || 'Error al cancelar la cotización.', 'info');
    }
  };

  const statusTone = (status: string): 'brand' | 'success' | 'warning' | 'danger' => {
    switch (status) {
      case 'Facturada': return 'success';
      case 'Expirada': return 'danger';
      case 'Rechazada': return 'danger';
      case 'Creada': return 'warning';
      default: return 'brand';
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === 'Creada') return 'Pendiente';
    if (status === 'Facturada') return 'Facturada';
    if (status === 'Expirada') return 'Vencida';
    if (status === 'Rechazada') return 'Rechazada';
    return status;
  };

  const uniqueCustomerNames = Array.from(new Set(quotes.map(q => q.customer?.name || (q as any).customers?.name || ''))).filter(Boolean);

  return (
    <div className="content" style={{ paddingBottom: 40 }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            background: toast.type === 'info' ? '#1e293b' : '#059669',
            color: 'white',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 2200,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <CheckCircle size={16} />
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="page-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--brand-50)', color: 'var(--brand-600)', display: 'grid', placeItems: 'center' }}>
              <FileText size={22} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px' }}>Cotizaciones</h1>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                Histórico general de presupuestos, vigencias comerciales y facturación directa.
              </p>
            </div>
          </div>
        </div>
        <div className="actions">
          <Button
            variant="secondary"
            onClick={() => loadData()}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Actualizar
          </Button>
          <Button
            variant="primary"
            onClick={openCreateModal}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={15} /> Nueva cotización
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 20 }}>
        {/* Total Cotizaciones */}
        <Card style={{ padding: '16px 18px', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Total Cotizaciones
              </span>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', lineHeight: 1.1, marginTop: 4 }}>
                {metrics.total}
              </div>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ede9fe', color: '#6d28d9', display: 'grid', placeItems: 'center' }}>
              <FileText size={18} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>{formatUSD(metrics.totalUsd, '$ ')}</span>
            <span style={{ margin: '0 4px' }}>·</span>
            <span>{formatVES(convertUSDtoVES(metrics.totalUsd, activeRate))}</span>
          </div>
        </Card>

        {/* Pendientes / Vigentes */}
        <Card style={{ padding: '16px 18px', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Vigentes / Pendientes
              </span>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#b45309', lineHeight: 1.1, marginTop: 4 }}>
                {metrics.pendientesCount}
              </div>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fef3c7', color: '#b45309', display: 'grid', placeItems: 'center' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
            <span style={{ color: '#b45309', fontWeight: 700 }}>{formatUSD(metrics.pendientesUsd, '$ ')}</span>
            <span style={{ margin: '0 4px' }}>·</span>
            <span>Por facturar</span>
          </div>
        </Card>

        {/* Facturadas / Aprobadas */}
        <Card style={{ padding: '16px 18px', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Facturadas (Cerradas)
              </span>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#047857', lineHeight: 1.1, marginTop: 4 }}>
                {metrics.facturadasCount}
              </div>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#d1fae5', color: '#047857', display: 'grid', placeItems: 'center' }}>
              <Receipt size={18} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
            <span style={{ color: '#047857', fontWeight: 700 }}>{formatUSD(metrics.facturadasUsd, '$ ')}</span>
            <span style={{ margin: '0 4px' }}>·</span>
            <span>Convertidas a venta</span>
          </div>
        </Card>

        {/* Vencidas / Expiradas */}
        <Card style={{ padding: '16px 18px', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Vencidas / Expiradas
              </span>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#b91c1c', lineHeight: 1.1, marginTop: 4 }}>
                {metrics.expiradasCount + metrics.rechazadasCount}
              </div>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fee2e2', color: '#b91c1c', display: 'grid', placeItems: 'center' }}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
            <span style={{ color: '#b91c1c', fontWeight: 700 }}>{formatUSD(metrics.expiradasUsd + metrics.rechazadasUsd, '$ ')}</span>
            <span style={{ margin: '0 4px' }}>·</span>
            <span>Fuera de vigencia</span>
          </div>
        </Card>
      </div>

      {/* Status Segmented Tabs */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }}>
        {[
          { id: 'Todas', label: 'Todas las cotizaciones', count: metrics.total },
          { id: 'Creada', label: 'Pendientes / Vigentes', count: metrics.pendientesCount },
          { id: 'Facturada', label: 'Facturadas', count: metrics.facturadasCount },
          { id: 'Expirada', label: 'Vencidas', count: metrics.expiradasCount },
          { id: 'Rechazada', label: 'Rechazadas', count: metrics.rechazadasCount },
        ].map(tab => {
          const isActive = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as StatusFilter)}
              style={{
                padding: '7px 14px',
                borderRadius: 10,
                border: isActive ? '1px solid var(--brand-500)' : '1px solid var(--border)',
                background: isActive ? 'var(--brand-50)' : '#fff',
                color: isActive ? 'var(--brand-700)' : '#475569',
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
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: isActive ? 'var(--brand-500)' : '#f1f5f9',
                  color: isActive ? '#fff' : '#64748b'
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter Controls Bar */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '6px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
          <Search size={16} style={{ color: '#94a3b8' }} />
          <input
            className="input"
            style={{ border: 'none', boxShadow: 'none', padding: 0, height: 'auto', fontSize: 13, background: 'transparent', width: '100%' }}
            placeholder="Buscar por folio, cliente, teléfono, notas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
              <X size={14} />
            </button>
          )}
        </div>

        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="input"
          style={{ height: 38, fontSize: 13, fontWeight: 600, cursor: 'pointer', minWidth: 180 }}
        >
          <option value="Todos">Todos los clientes</option>
          {uniqueCustomerNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', minWidth: 200 }}>
          <ShoppingCart size={15} style={{ color: '#94a3b8' }} />
          <input
            className="input"
            style={{ border: 'none', boxShadow: 'none', padding: 0, height: 38, fontSize: 13, background: 'transparent', width: '100%' }}
            placeholder="Filtrar por producto o SKU..."
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
          />
          {productFilter && (
            <button onClick={() => setProductFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
              <X size={14} />
            </button>
          )}
        </div>

        {(searchTerm || customerFilter !== 'Todos' || productFilter || statusFilter !== 'Todas') && (
          <Button
            variant="secondary"
            onClick={() => {
              setSearchTerm('');
              setCustomerFilter('Todos');
              setProductFilter('');
              setStatusFilter('Todas');
            }}
            style={{ height: 38, fontSize: 12, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <X size={13} /> Limpiar
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="table-wrap" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px', color: 'var(--brand-500)' }} />
            <div>Cargando cotizaciones...</div>
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div style={{ padding: 36 }}>
            <EmptyState
              title="No se encontraron cotizaciones"
              description="No hay cotizaciones que coincidan con los filtros aplicados o aún no has creado ninguna cotización."
            />
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <Button variant="primary" onClick={openCreateModal} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} /> Crear nueva cotización
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ fontSize: 13, minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Folio</th>
                  <th style={{ width: 145 }}>Fechas</th>
                  <th>Cliente</th>
                  <th>Concepto / Detalle</th>
                  <th style={{ textAlign: 'right', width: 160 }}>Monto Total</th>
                  <th style={{ textAlign: 'center', width: 120 }}>Estado</th>
                  <th style={{ textAlign: 'right', width: 230 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map(q => {
                  const status = getQuoteStatus(q);
                  const isExpired = status === 'Expirada';
                  const rawItems = q.sale_items || q.items || [];
                  const phone = getCustomerPhone(q);

                  return (
                    <tr key={q.id}>
                      {/* 1. FOLIO */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', display: 'grid', placeItems: 'center', color: '#475569', flexShrink: 0 }}>
                            <FileText size={15} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px' }}>
                              {q.doc_number}
                            </div>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: q.payment_type === 'CREDITO' ? '#fef3c7' : '#f1f5f9',
                              color: q.payment_type === 'CREDITO' ? '#92400e' : '#64748b',
                              textTransform: 'uppercase'
                            }}>
                              {q.payment_type || 'CONTADO'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. FECHAS */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#334155', fontWeight: 600, fontSize: 12 }}>
                            <Calendar size={13} style={{ color: '#94a3b8' }} />
                            {q.created_at ? new Date(q.created_at).toLocaleDateString('es-VE') : '—'}
                          </div>
                          {q.expires_at && (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: 11,
                              fontWeight: 600,
                              color: isExpired ? '#dc2626' : '#64748b'
                            }}>
                              <Clock size={12} style={{ color: isExpired ? '#ef4444' : '#94a3b8' }} />
                              <span>Vence: {new Date(q.expires_at).toLocaleDateString('es-VE')}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 3. CLIENTE */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>
                            {q.customer?.name || (q as any).customers?.name || 'Cliente general'}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {getCustomerDoc(q)}
                          </div>
                          {phone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#475569', marginTop: 1 }}>
                              <Phone size={11} style={{ color: 'var(--brand-500)' }} />
                              <span>{phone}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 4. CONCEPTO / DETALLE */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 260 }}>
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={getConceptPreview(q)}>
                            {getConceptPreview(q)}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            {rawItems.length} {rawItems.length === 1 ? 'ítem presupuestado' : 'ítems presupuestados'}
                          </div>
                        </div>
                      </td>

                      {/* 5. MONTO TOTAL */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
                          {formatUSD(Number(q.total_usd) || 0, '$ ')}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginTop: 1 }}>
                          {formatVES(convertUSDtoVES(Number(q.total_usd) || 0, Number(q.exchange_rate) || activeRate))}
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>
                          Tasa: Bs. {Number(q.exchange_rate || activeRate).toFixed(2)}
                        </div>
                      </td>

                      {/* 6. ESTADO */}
                      <td style={{ textAlign: 'center' }}>
                        <Badge tone={statusTone(status)}>{getStatusLabel(status)}</Badge>
                      </td>

                      {/* 7. ACCIONES */}
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                          {/* 1. VER DETALLE */}
                          <button
                            onClick={() => setViewQuote(q)}
                            title="Ver detalle completo"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              border: '1px solid #e2e8f0',
                              background: '#fff',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#475569'
                            }}
                          >
                            <Eye size={14} />
                          </button>

                          {/* 2. FACTURAR */}
                          <button
                            onClick={() => openConvertModal(q)}
                            title={status === 'Facturada' ? 'Ya convertida a factura' : 'Facturar cotización'}
                            disabled={status === 'Facturada'}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              border: '1px solid #d1fae5',
                              background: status === 'Facturada' ? '#f8fafc' : '#ecfdf5',
                              cursor: status === 'Facturada' ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: status === 'Facturada' ? '#94a3b8' : '#059669',
                              opacity: status === 'Facturada' ? 0.6 : 1
                            }}
                          >
                            <Receipt size={14} />
                          </button>

                          {/* 3. IMPRIMIR */}
                          <button
                            onClick={() => handlePrintQuote(q)}
                            title="Imprimir / PDF"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              border: '1px solid #ede9fe',
                              background: '#fff',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#7c3aed'
                            }}
                          >
                            <Printer size={14} />
                          </button>

                          {/* 4. COMPARTIR */}
                          <button
                            onClick={() => setShareQuote(q)}
                            title="Compartir cotización"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              border: '1px solid #e0f2fe',
                              background: '#fff',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#0284c7'
                            }}
                          >
                            <Share2 size={14} />
                          </button>

                          {/* 5. MODIFICAR */}
                          <button
                            onClick={() => {
                              if (!isRestricted(getQuoteStatus(q))) {
                                handleOpenEditModal(q);
                              }
                            }}
                            title={isRestricted(getQuoteStatus(q)) ? 'No se puede modificar una cotización facturada o pagada' : 'Modificar cotización'}
                            disabled={isRestricted(getQuoteStatus(q))}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              border: '1px solid #e0e7ff',
                              background: '#fff',
                              cursor: isRestricted(getQuoteStatus(q)) ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: isRestricted(getQuoteStatus(q)) ? '#94a3b8' : '#4f46e5',
                              opacity: isRestricted(getQuoteStatus(q)) ? 0.6 : 1
                            }}
                          >
                            <Edit size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ================= CREATE MODAL (full-screen overlay) ================= */}
      {isCreateOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1300, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--canvas)', overflow: 'hidden' }}>
            {/* Modal header */}
            <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--brand-500)', color: '#fff', display: 'grid', placeItems: 'center' }}>
                  <FileText size={18} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                    {editingQuote ? `Modificar cotización COT-${editingQuote.doc_number}` : 'Nueva cotización'}
                  </h2>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Documento expresado en USD ($)</span>
                </div>
              </div>
              <button
                onClick={() => { setIsCreateOpen(false); resetDraft(); }}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 6 }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 400px', gap: 20, alignItems: 'start', maxWidth: 1500, margin: '0 auto', width: '100%' }}>
              {/* LEFT: Customer + product board */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Customer selector */}
                <Card style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#1e293b', fontWeight: 700, fontSize: 13 }}>
                    <User size={15} /> Cliente
                  </div>
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="input"
                        placeholder="Buscar cliente por nombre o documento..."
                        value={customerSearch}
                        onFocus={() => setIsCustomerDropdownOpen(true)}
                        onChange={(e) => { setCustomerSearch(e.target.value); setIsCustomerDropdownOpen(true); }}
                        style={{ flex: 1, height: 40 }}
                      />
                      <Button
                        variant="secondary"
                        onClick={() => setIsNewCustomerOpen(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                      >
                        <UserPlus size={14} /> + Nuevo Cliente
                      </Button>
                    </div>
                    {isCustomerDropdownOpen && customerSearch.trim() && (
                      <div style={{ position: 'absolute', top: 44, left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
                        {filteredCustomers.length === 0 ? (
                          <div style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                            Sin resultados. Registra un nuevo cliente.
                          </div>
                        ) : (
                          filteredCustomers.map(c => (
                            <button
                              key={c.id}
                              onClick={() => { setDraftCustomerId(c.id); setCustomerSearch(c.name); setIsCustomerDropdownOpen(false); }}
                              style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8 }}
                            >
                              <span style={{ fontWeight: 600, color: '#1e293b' }}>{c.name}</span>
                              <span style={{ color: '#94a3b8', fontSize: 11 }}>{c.docNumber}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {draftCustomerId && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--brand-50)', borderRadius: 8, fontSize: 12, color: 'var(--brand-700)', fontWeight: 600 }}>
                      Cliente seleccionado: {customers.find(c => c.id === draftCustomerId)?.name}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                        <Calendar size={12} style={{ marginRight: 4 }} /> Vigencia (días)
                      </label>
                      <input
                        type="number"
                        min={1}
                        className="input"
                        value={validityDays}
                        onChange={(e) => setValidityDays(parseInt(e.target.value) || 7)}
                        style={{ height: 38 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                        <Percent size={12} style={{ marginRight: 4 }} /> Descuento (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="input"
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                        style={{ height: 38 }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>Notas / observaciones</label>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="Condiciones de pago, validez, entrega..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: '#64748b' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={isTaxSubject} onChange={(e) => setIsTaxSubject(e.target.checked)} />
                      Sujeto a IVA (16%)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={isIgtfApplied} onChange={(e) => setIsIgtfApplied(e.target.checked)} />
                      Aplica IGTF (3%)
                    </label>
                  </div>
                </Card>

                {/* Product board */}
                <Card style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#1e293b', fontWeight: 700, fontSize: 13 }}>
                    <ShoppingCart size={15} /> Tablero de productos
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)' }}>
                      <Search size={15} style={{ color: '#94a3b8' }} />
                      <input
                        className="input"
                        placeholder="Buscar por SKU o nombre..."
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        style={{ border: 'none', boxShadow: 'none', padding: 0, height: 36, fontSize: 13, background: 'transparent' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        style={{
                          padding: '5px 12px', borderRadius: 20, border: selectedCategory === cat ? '1px solid var(--brand-500)' : '1px solid var(--border)',
                          background: selectedCategory === cat ? 'var(--brand-500)' : '#fff',
                          color: selectedCategory === cat ? '#fff' : 'var(--text)',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                    {filteredProducts.map(p => (
                      <button
                        key={p.sku}
                        onClick={() => addProductToDraft(p)}
                        disabled={p.stock <= 0}
                        style={{
                          border: '1px solid var(--border)', borderRadius: 11, background: '#fff', padding: 11,
                          display: 'flex', flexDirection: 'column', gap: 6, cursor: p.stock <= 0 ? 'not-allowed' : 'pointer',
                          textAlign: 'left', opacity: p.stock <= 0 ? 0.55 : 1, transition: 'all 0.12s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>{p.sku}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700,
                            color: p.stock <= 0 ? '#dc2626' : p.stock <= 5 ? '#d97706' : '#059669',
                            background: p.stock <= 0 ? '#fee2e2' : p.stock <= 5 ? '#fef3c7' : '#ecfdf5',
                            padding: '2px 6px', borderRadius: 6
                          }}>
                            {p.stock <= 0 ? 'SIN STOCK' : `${p.stock} disp.`}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', lineHeight: 1.3 }}>{p.name}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>${p.priceUSD.toFixed(2)}</div>
                      </button>
                    ))}
                    {filteredProducts.length === 0 && (
                      <div style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                        Sin productos para este filtro.
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* RIGHT: Detail table */}
              <div style={{ position: 'sticky', top: 16 }}>
                <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                    <b style={{ fontSize: 13, color: '#1e293b' }}>Detalle de la cotización ({draftItems.length})</b>
                    {draftItems.length > 0 && (
                      <button onClick={() => setDraftItems([])} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        Limpiar
                      </button>
                    )}
                  </div>

                  {draftItems.length === 0 ? (
                    <div style={{ padding: '28px 0', textAlign: 'center', color: '#94a3b8' }}>
                      <ShoppingCart size={30} strokeWidth={1.5} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                      <div style={{ fontSize: 12 }}>Selecciona productos del tablero<br />para cotizarlos.</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto' }}>
                      {draftItems.map(it => (
                        <div key={it.sku} style={{ border: '1px solid #f1f5f9', borderRadius: 9, padding: '10px 12px', background: '#fafbfc', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{it.name}</div>
                              <span style={{ fontSize: 10, color: '#94a3b8' }}>{it.sku}</span>
                            </div>
                            <button onClick={() => removeDraftItem(it.sku)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 7, background: '#fff' }}>
                              <button onClick={() => updateDraftQuantity(it.sku, -1)} style={{ width: 26, height: 26, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>-</button>
                              <span style={{ fontSize: 12, fontWeight: 700, minWidth: 22, textAlign: 'center' }}>{it.quantity}</span>
                              <button onClick={() => updateDraftQuantity(it.sku, 1)} style={{ width: 26, height: 26, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#64748b' }}>+</button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                              <span style={{ fontSize: 11, color: '#64748b' }}>$</span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={it.unitPriceUSD}
                                onChange={(e) => updateDraftPrice(it.sku, e.target.value)}
                                style={{ width: '100%', height: 30, border: '1px solid var(--border)', borderRadius: 7, padding: '0 8px', fontSize: 12, fontWeight: 600 }}
                              />
                            </div>
                            <div style={{ textAlign: 'right', minWidth: 72 }}>
                              <b style={{ fontSize: 12, color: '#0f172a' }}>${(it.unitPriceUSD * it.quantity).toFixed(2)}</b>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {draftItems.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                        <span>Subtotal</span>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatUSD(rawSubtotalUSD, '$ ')}</span>
                      </div>
                      {discountAmountUSD > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                          <span>Descuento ({discountPercent}%)</span>
                          <span style={{ fontWeight: 600, color: '#dc2626' }}>-{formatUSD(discountAmountUSD, '$ ')}</span>
                        </div>
                      )}
                      {taxAmountUSD > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                          <span>IVA (16%)</span>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatUSD(taxAmountUSD, '$ ')}</span>
                        </div>
                      )}
                      {igtfAmountUSD > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                          <span>IGTF (3%)</span>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{formatUSD(igtfAmountUSD, '$ ')}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px dashed var(--border)', paddingTop: 8, marginTop: 4 }}>
                        <span style={{ fontWeight: 800, color: '#1e293b' }}>TOTAL</span>
                        <div style={{ textAlign: 'right' }}>
                          <b style={{ fontSize: 18, color: 'var(--brand-700)', display: 'block' }}>{formatUSD(totalUSD, '$ ')}</b>
                          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{formatVES(totalVES)}</span>
                        </div>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569', cursor: 'pointer', margin: '8px 0 2px' }}>
                        <input
                          type="checkbox"
                          checked={autoGenerateFile}
                          onChange={(e) => setAutoGenerateFile(e.target.checked)}
                        />
                        <span>Generar e imprimir/descargar documento de cotización al guardar</span>
                      </label>
                      <Button
                        variant="primary"
                        onClick={handleCotizar}
                        disabled={isSubmitting}
                        style={{ width: '100%', height: 44, fontSize: 14, fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 6 }}
                      >
                        <FileText size={16} /> {isSubmitting ? 'Guardando en Supabase...' : 'Cotizar'}
                      </Button>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </div>

          {/* "+ Nuevo Cliente" inline sub-modal */}
          {isNewCustomerOpen && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', zIndex: 1400, padding: 16 }}>
              <Card style={{ width: '100%', maxWidth: 480, padding: 24, position: 'relative' }}>
                <button onClick={() => setIsNewCustomerOpen(false)} style={{ position: 'absolute', top: 18, right: 18, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--brand-50)', color: 'var(--brand-600)', display: 'grid', placeItems: 'center' }}>
                    <UserPlus size={19} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Nuevo cliente</h3>
                </div>
                <form onSubmit={handleSaveNewCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 5 }}>Nombre completo</label>
                    <input className="input" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} placeholder="Ej. Juan Pérez" style={{ height: 38 }} required />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 5 }}>Tipo de documento</label>
                      <select className="input" value={newCustomerDocType} onChange={(e) => setNewCustomerDocType(e.target.value)} style={{ height: 38 }}>
                        <option>Natural (V / E)</option>
                        <option>Jurídico (J)</option>
                        <option>RIF (V / E / J / G / P)</option>
                        <option>Pasaporte</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 5 }}>Cédula / RIF</label>
                      <input className="input" value={newCustomerDocNumber} onChange={(e) => setNewCustomerDocNumber(e.target.value)} placeholder="V-12.345.678" style={{ height: 38 }} required />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 5 }}>Teléfono</label>
                      <input className="input" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} placeholder="+58 414-0000000" style={{ height: 38 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 5 }}>Correo</label>
                      <input className="input" type="email" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} placeholder="cliente@correo.com" style={{ height: 38 }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 5 }}>Dirección</label>
                    <input className="input" value={newCustomerAddress} onChange={(e) => setNewCustomerAddress(e.target.value)} placeholder="Dirección de facturación" style={{ height: 38 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                    <Button variant="secondary" onClick={() => setIsNewCustomerOpen(false)}>Cancelar</Button>
                    <Button variant="primary" type="submit" disabled={isSavingCustomer} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <UserPlus size={14} /> {isSavingCustomer ? 'Guardando...' : 'Registrar cliente'}
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ================= VIEW DETAIL MODAL ================= */}
      {viewQuote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', zIndex: 1400, padding: 16 }}>
          <Card style={{ width: '100%', maxWidth: 640, padding: 24, position: 'relative', maxHeight: '85vh', overflowY: 'auto' }}>
            <button onClick={() => setViewQuote(null)} style={{ position: 'absolute', top: 18, right: 18, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
              <X size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--brand-50)', color: 'var(--brand-600)', display: 'grid', placeItems: 'center' }}>
                <FileText size={19} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Cotización {viewQuote.doc_number}</h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {viewQuote.created_at ? new Date(viewQuote.created_at).toLocaleDateString('es-VE') : '—'}
                  {viewQuote.expires_at ? ` · Vence: ${new Date(viewQuote.expires_at).toLocaleDateString('es-VE')}` : ''}
                </span>
              </div>
              <Badge tone={statusTone(getQuoteStatus(viewQuote))}>{getQuoteStatus(viewQuote)}</Badge>
            </div>

            <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid var(--border)', padding: 12, margin: '14px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Cliente</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{viewQuote.customer?.name || '—'}</div>
              </div>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tasa aplicada</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Bs. {Number(viewQuote.exchange_rate || 0).toLocaleString('es-VE')} / USD</div>
              </div>
            </div>

            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: 'center' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>Precio unit.</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(viewQuote.items || []).map(it => (
                  <tr key={it.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{it.name}</div>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>{it.sku}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{Number(it.quantity)}</td>
                    <td style={{ textAlign: 'right' }}>{formatUSD(Number(it.unit_price_usd) || 0, '$ ')}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatUSD(Number(it.total_usd) || 0, '$ ')}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, color: '#64748b' }}>TOTAL (USD)</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{formatUSD(Number(viewQuote.total_usd) || 0, '$ ')}</td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 500, color: '#64748b' }}>Equivalente (VES)</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#64748b' }}>{formatVES(convertUSDtoVES(Number(viewQuote.total_usd) || 0, Number(viewQuote.exchange_rate) || activeRate))}</td>
                </tr>
              </tfoot>
            </table>

            {viewQuote.notes && (
              <div style={{ marginTop: 12, padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, color: '#64748b' }}>
                <b>Notas:</b> {viewQuote.notes}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <Button
                variant="secondary"
                onClick={() => handleDownloadQuote(viewQuote)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={14} /> Descargar archivo
              </Button>
              <Button
                variant="secondary"
                onClick={() => handlePrintQuote(viewQuote)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Printer size={14} /> Imprimir / PDF
              </Button>
              {viewQuote.quote_status !== 'Facturada' && (
                <Button
                  variant="primary"
                  onClick={() => {
                    const q = viewQuote;
                    setViewQuote(null);
                    openConvertModal(q);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#059669', borderColor: '#059669' }}
                >
                  <Receipt size={14} /> Facturar cotización
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ================= SUCCESS & FILE GENERATION MODAL ================= */}
      {isSuccessModalOpen && lastCreatedQuoteDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1500, padding: 16 }}>
          <Card style={{ width: '100%', maxWidth: 500, padding: 24, position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <button
              onClick={() => setIsSuccessModalOpen(false)}
              style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ecfdf5', color: '#059669', display: 'grid', placeItems: 'center', border: '1px solid #a7f3d0' }}>
                <CheckCircle size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                  ¿Cotización guardada y generada?
                </h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Folio COT-{lastCreatedQuoteDoc.docNumber} · Guardada con éxito en la base de datos
                </span>
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#64748b' }}>Cliente:</span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{lastCreatedQuoteDoc.customerName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#64748b' }}>Total a Pagar:</span>
                <span style={{ fontWeight: 800, color: 'var(--brand-700)' }}>{formatUSD(lastCreatedQuoteDoc.totalUSD, '$ ')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Equivalente (BCV):</span>
                <span style={{ fontWeight: 600, color: '#475569' }}>{formatVES(lastCreatedQuoteDoc.totalVES)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button
                variant="primary"
                onClick={() => printQuoteDocument(lastCreatedQuoteDoc)}
                style={{ width: '100%', height: 40, fontSize: 13, fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
              >
                <Printer size={15} /> Imprimir / Guardar como PDF
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  downloadQuoteFile(lastCreatedQuoteDoc);
                  showToast('Archivo descargado con éxito.');
                }}
                style={{ width: '100%', height: 40, fontSize: 13, fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
              >
                <Download size={15} /> Descargar archivo (.html)
              </Button>
              <Button
                variant="ghost"
                onClick={() => setIsSuccessModalOpen(false)}
                style={{ width: '100%', height: 36, fontSize: 13, color: '#475569', fontWeight: 600 }}
              >
                Ver cotización en el histórico
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ================= MODAL COMPARTIR COTIZACIÓN ================= */}
      {shareQuote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1550, padding: 16 }}>
          <Card style={{ width: '100%', maxWidth: 480, padding: 24, position: 'relative' }}>
            <button
              onClick={() => setShareQuote(null)}
              style={{ position: 'absolute', top: 18, right: 18, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#e0f2fe', color: '#0284c7', display: 'grid', placeItems: 'center' }}>
                <Share2 size={19} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Compartir Cotización</h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>COT-{shareQuote.doc_number} · {shareQuote.customer?.name}</span>
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 11, maxHeight: 180, overflowY: 'auto' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#334155', lineHeight: 1.5 }}>
                {getShareText(shareQuote)}
              </pre>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button
                variant="primary"
                onClick={() => handleShareWhatsApp(shareQuote)}
                style={{ width: '100%', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#16a34a', borderColor: '#16a34a' }}
              >
                Compartir por WhatsApp
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleCopyShareText(shareQuote)}
                style={{ width: '100%', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {isCopiedShare ? <Check size={14} /> : <Copy size={14} />}
                {isCopiedShare ? '¡Copiado al portapapeles!' : 'Copiar resumen para enviar'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  handleDownloadQuote(shareQuote);
                  setShareQuote(null);
                }}
                style={{ width: '100%', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Download size={14} /> Descargar archivo de cotización
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ================= MODAL ELIMINAR COTIZACIÓN ================= */}
      {deleteConfirmQuote && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1550, padding: 16 }}>
          <Card style={{ width: '100%', maxWidth: 440, padding: 24, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fee2e2', color: '#dc2626', display: 'grid', placeItems: 'center' }}>
                <Trash2 size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Eliminar Cotización</h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>Acción de eliminación permanente</span>
              </div>
            </div>

            <p style={{ fontSize: 13, color: '#475569', margin: '0 0 16px', lineHeight: 1.5 }}>
              ¿Estás seguro de que deseas eliminar la cotización <b>COT-{deleteConfirmQuote.doc_number}</b> del cliente <b>{deleteConfirmQuote.customer?.name || 'Cliente'}</b> por un monto de <b>${Number(deleteConfirmQuote.total_usd || 0).toFixed(2)}</b>? Se removerá del histórico de cotizaciones.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setDeleteConfirmQuote(null)} disabled={isDeleting}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleDeleteQuote}
                disabled={isDeleting}
                style={{ background: '#dc2626', borderColor: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Trash2 size={14} /> {isDeleting ? 'Eliminando...' : 'Sí, eliminar cotización'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ================= SUPABASE SQL SCRIPT MODAL ================= */}
      {isSqlModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1600, padding: 16 }}>
          <Card style={{ width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafbfc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: '#f5f3ff', color: '#7c3aed', display: 'grid', placeItems: 'center', border: '1px solid #ddd6fe' }}>
                  <Code size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                    Código SQL para Supabase (Cotizaciones)
                  </h3>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    Tablas, columnas y permisos para la base de datos de Frenyer
                  </span>
                </div>
              </div>
              <button onClick={() => setIsSqlModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                <b>Instrucciones:</b> Copia el siguiente código y ejecútalo en el <b>SQL Editor</b> de tu consola de Supabase. Este script asegura las tablas <code>sales</code>, <code>sale_items</code>, agrega las columnas de ciclo de vida de cotizaciones y habilita los permisos correspondientes.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="primary"
                  onClick={() => {
                    const sqlScript = `-- ==============================================================================
-- FRENYER ERP — MÓDULO DE COTIZACIONES Y VENTAS FLASH PARA SUPABASE
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de tu consola de Supabase
-- ==============================================================================

-- 1. Tabla principal de ventas / cotizaciones (sales)
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
    branch_id UUID,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    user_id UUID,
    doc_type TEXT NOT NULL DEFAULT 'COTIZACION',
    doc_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETADA',
    payment_type TEXT DEFAULT 'CONTADO',
    exchange_rate NUMERIC(18, 4) NOT NULL DEFAULT 1,
    rate_source TEXT DEFAULT 'BCV',
    is_future_rate BOOLEAN DEFAULT FALSE,
    rate_value_date TIMESTAMPTZ DEFAULT now(),
    subtotal_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
    discount_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
    tax_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
    igtf_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_ves NUMERIC(18, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Columnas del ciclo de vida de cotizaciones
ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS quote_status TEXT DEFAULT 'Creada',
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS converted_to_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;

-- 3. Tabla de ítems de cotización / venta (sale_items)
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID,
    sku TEXT,
    name TEXT NOT NULL,
    quantity NUMERIC(18, 4) NOT NULL DEFAULT 1,
    unit_price_usd NUMERIC(18, 4) NOT NULL DEFAULT 0,
    total_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_ves NUMERIC(18, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Índices para acelerar consultas
CREATE INDEX IF NOT EXISTS idx_sales_doc_type ON public.sales(doc_type);
CREATE INDEX IF NOT EXISTS idx_sales_quote_status ON public.sales(quote_status);
CREATE INDEX IF NOT EXISTS idx_sales_expires_at ON public.sales(expires_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);

-- 5. Habilitar seguridad RLS y permisos
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_sales" ON public.sales;
CREATE POLICY "allow_all_sales" ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_sale_items" ON public.sale_items;
CREATE POLICY "allow_all_sale_items" ON public.sale_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.sales TO anon, authenticated;
GRANT ALL ON TABLE public.sale_items TO anon, authenticated;`;

                    navigator.clipboard.writeText(sqlScript);
                    setIsCopiedSql(true);
                    showToast('Código SQL copiado al portapapeles');
                    setTimeout(() => setIsCopiedSql(false), 2500);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, fontSize: 12 }}
                >
                  {isCopiedSql ? <Check size={14} /> : <Copy size={14} />}
                  {isCopiedSql ? '¡Copiado!' : 'Copiar código SQL'}
                </Button>
              </div>

              <pre
                style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  padding: 14,
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  maxHeight: 280,
                  lineHeight: 1.5,
                  margin: 0
                }}
              >
{`-- 1. Tabla de ventas / cotizaciones
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
    branch_id UUID,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    doc_type TEXT NOT NULL DEFAULT 'COTIZACION',
    doc_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETADA',
    payment_type TEXT DEFAULT 'CONTADO',
    exchange_rate NUMERIC(18, 4) NOT NULL DEFAULT 1,
    subtotal_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_ves NUMERIC(18, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Columnas de cotizaciones
ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS quote_status TEXT DEFAULT 'Creada',
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS converted_to_sale_id UUID;

-- 3. Tabla de ítems
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    sku TEXT,
    name TEXT NOT NULL,
    quantity NUMERIC(18, 4) NOT NULL DEFAULT 1,
    unit_price_usd NUMERIC(18, 4) NOT NULL DEFAULT 0,
    total_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_ves NUMERIC(18, 2) NOT NULL DEFAULT 0
);

-- 4. Permisos
GRANT ALL ON TABLE public.sales TO anon, authenticated;
GRANT ALL ON TABLE public.sale_items TO anon, authenticated;`}
              </pre>
            </div>
          </Card>
        </div>
      )}

      {/* ================= CONVERT MODAL ================= */}
      {convertQuote && !convertResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1400, padding: 16 }}>
          <Card style={{ width: '100%', maxWidth: 580, padding: 24, position: 'relative', maxHeight: '92vh', overflowY: 'auto' }}>
            <button
              onClick={() => setConvertQuote(null)}
              style={{ position: 'absolute', top: 18, right: 18, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
              title="Cerrar"
            >
              <X size={20} />
            </button>

            {/* Cabecera */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: '#ecfdf5', color: '#059669', display: 'grid', placeItems: 'center', border: '1px solid #a7f3d0' }}>
                <Receipt size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                  Convertir Cotización a Factura
                </h3>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  Cotización <b>COT-{convertQuote.doc_number}</b> · {convertQuote.customer?.name || 'Cliente general'}
                </span>
              </div>
            </div>

            {/* Resumen comercial de la cotización */}
            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total a Facturar</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--brand-700)' }}>
                  {formatUSD(Number(convertQuote.total_usd) || 0, '$ ')}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Equivalente VES</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                  {formatVES(convertUSDtoVES(Number(convertQuote.total_usd) || 0, Number(convertQuote.exchange_rate) || activeRate))}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tasa Cambio</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>
                  Bs. {Number(convertQuote.exchange_rate || activeRate).toLocaleString('es-VE')} / $
                </div>
              </div>
            </div>

            {/* 1. Chequeo y definición del Correlativo de Factura del Sistema */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                  <Hash size={14} color="#6366f1" /> Número / Correlativo de Factura en el Sistema
                </label>
                {isCheckingCorrelative ? (
                  <Badge tone="warning">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <RefreshCw size={11} className="animate-spin" /> Verificando...
                    </span>
                  </Badge>
                ) : (
                  <Badge tone="success">
                    ✓ Secuencia verificada
                  </Badge>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="text"
                  className="input"
                  value={convertNextCorrelative}
                  onChange={(e) => setConvertNextCorrelative(e.target.value)}
                  placeholder="Ej: 0012"
                  style={{ height: 40, fontWeight: 700, fontSize: 15, letterSpacing: '0.05em', color: '#0f172a' }}
                />
              </div>
              <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 4 }}>
                Correlativo consecutivo de ventas asignado a la nueva factura oficial en base de datos.
              </span>
            </div>

            {/* 2. Método de Pago y Destino Financiero */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Wallet size={14} color="#6366f1" /> Destino Financiero y Método de Pago
              </label>

              {/* Selector de Contado / Crédito */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <button
                  type="button"
                  onClick={() => setConvertPaymentType('CONTADO')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: convertPaymentType === 'CONTADO' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    background: convertPaymentType === 'CONTADO' ? '#eef2ff' : '#f8fafc',
                    color: convertPaymentType === 'CONTADO' ? '#4338ca' : '#475569',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <DollarSign size={16} /> Contado (Inmediato)
                </button>
                <button
                  type="button"
                  onClick={() => setConvertPaymentType('CREDITO')}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: convertPaymentType === 'CREDITO' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    background: convertPaymentType === 'CREDITO' ? '#eef2ff' : '#f8fafc',
                    color: convertPaymentType === 'CREDITO' ? '#4338ca' : '#475569',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Calendar size={16} /> Crédito (CxC)
                </button>
              </div>

              {/* Si es CONTADO: Cuenta bancaria y forma de pago */}
              {convertPaymentType === 'CONTADO' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <Building2 size={13} color="#6366f1" /> Cuenta Bancaria / Caja Receptora (Tesorería)
                    </label>
                    <select
                      className="input"
                      value={convertSelectedBankId}
                      onChange={(e) => {
                        const newId = e.target.value;
                        setConvertSelectedBankId(newId);
                        const acc = convertBankAccounts.find(a => a.id === newId);
                        if (acc) {
                          if (acc.currency === 'USD') setConvertPaymentMethod('Efectivo USD');
                          else setConvertPaymentMethod('Transferencia bancaria');
                        }
                      }}
                      style={{ height: 40 }}
                    >
                      {convertBankAccounts.length === 0 ? (
                        <option value="">Caja Principal (Efectivo)</option>
                      ) : (
                        convertBankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.bank_name} ({b.currency}) · Saldo: {b.currency === 'USD' ? '$ ' : 'Bs. '}{Number(b.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} {b.account_number ? `· Cta: ${b.account_number}` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                        Método de Cobro
                      </label>
                      <select
                        className="input"
                        value={convertPaymentMethod}
                        onChange={(e) => setConvertPaymentMethod(e.target.value)}
                        style={{ height: 40 }}
                      >
                        <option value="Transferencia bancaria">Transferencia bancaria</option>
                        <option value="Pago Móvil">Pago Móvil</option>
                        <option value="Punto de Venta / Débito">Punto de Venta / Débito</option>
                        <option value="Efectivo USD">Efectivo USD</option>
                        <option value="Efectivo Bolívares">Efectivo Bolívares</option>
                        <option value="Zelle">Zelle</option>
                        <option value="Depósito en taquilla">Depósito en taquilla</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                        Nº Comprobante / Ref. (Opcional)
                      </label>
                      <input
                        type="text"
                        className="input"
                        value={convertReference}
                        onChange={(e) => setConvertReference(e.target.value)}
                        placeholder="Ej: Ref. 048291"
                        style={{ height: 40 }}
                      />
                    </div>
                  </div>

                  {/* Detalle del abono a registrar */}
                  {(() => {
                    const acc = convertBankAccounts.find(a => a.id === convertSelectedBankId);
                    const isVes = acc?.currency === 'VES';
                    const depositAmountStr = isVes
                      ? formatVES(convertUSDtoVES(Number(convertQuote.total_usd) || 0, Number(convertQuote.exchange_rate) || activeRate))
                      : formatUSD(Number(convertQuote.total_usd) || 0, '$ ');

                    return (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, padding: 10, fontSize: 12, color: '#166534', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <CheckCircle2 size={16} color="#16a34a" style={{ flexShrink: 0 }} />
                        <span>
                          Se registrará el pago y se abonarán <b>{depositAmountStr}</b> en la cuenta <b>{acc?.bank_name || 'Finanzas'}</b>, actualizando su saldo en Tesorería.
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Si es CRÉDITO: Cuentas por cobrar */}
              {convertPaymentType === 'CREDITO' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: 10, fontSize: 12, color: '#92400e', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Calendar size={16} color="#d97706" style={{ flexShrink: 0 }} />
                    <span>
                      Se generará automáticamente una <b>Cuenta por Cobrar (CxC)</b> por <b>{formatUSD(Number(convertQuote.total_usd) || 0, '$ ')}</b> en el módulo de Cuentas por Cobrar.
                    </span>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                      Plazo de Vencimiento de la Cuenta por Cobrar
                    </label>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {[7, 15, 30, 45].map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => {
                            setConvertDueDateDays(days);
                            const nextDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
                            setConvertCustomDueDate(nextDate);
                          }}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            border: convertDueDateDays === days ? '1px solid #6366f1' : '1px solid #cbd5e1',
                            background: convertDueDateDays === days ? '#eef2ff' : '#f8fafc',
                            color: convertDueDateDays === days ? '#4338ca' : '#475569',
                            cursor: 'pointer'
                          }}
                        >
                          {days} días
                        </button>
                      ))}
                    </div>

                    <input
                      type="date"
                      className="input"
                      value={convertCustomDueDate}
                      onChange={(e) => {
                        setConvertCustomDueDate(e.target.value);
                        setConvertDueDateDays(0);
                      }}
                      style={{ height: 40 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                      Notas o Términos de Crédito (Opcional)
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={convertCreditNotes}
                      onChange={(e) => setConvertCreditNotes(e.target.value)}
                      placeholder="Ej: Pago acordado en 2 cuotas quincenales."
                      style={{ height: 40 }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Aviso de verificación de inventario */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, padding: 10, fontSize: 12, color: '#64748b', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={15} color="#eab308" style={{ flexShrink: 0 }} />
              <span>
                El sistema verificará el stock real de los productos y descontará automáticamente las cantidades del catálogo.
              </span>
            </div>

            {/* Botones de acción */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <Button variant="secondary" onClick={() => setConvertQuote(null)} disabled={isConverting}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleConvertToInvoice}
                disabled={isConverting || isCheckingCorrelative || !convertNextCorrelative.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#059669', borderColor: '#059669' }}
              >
                <Receipt size={15} />
                {isConverting ? 'Facturando y registrando...' : 'Convertir y Facturar'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ================= CONVERT RESULT MODAL ================= */}
      {convertQuote && convertResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 1400, padding: 16 }}>
          <Card style={{ width: '100%', maxWidth: 540, padding: 24, position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <button
              onClick={() => { setConvertQuote(null); setConvertResult(null); }}
              style={{ position: 'absolute', top: 18, right: 18, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
              title="Cerrar"
            >
              <X size={20} />
            </button>

            {/* Cabecera éxito */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ecfdf5', color: '#059669', display: 'grid', placeItems: 'center', border: '1px solid #a7f3d0' }}>
                <CheckCircle size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                  Factura {convertResult.invoiceDocNumber} Generada con Éxito
                </h3>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  Cotización COT-{convertQuote.doc_number} actualizada a estado <b>FACTURADA</b>
                </span>
              </div>
            </div>

            {/* Desglose de registros efectuados */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#64748b' }}>Número de Factura:</span>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>FACT-{convertResult.invoiceDocNumber}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#64748b' }}>Total Facturado (USD):</span>
                <span style={{ fontWeight: 800, color: 'var(--brand-700)' }}>{formatUSD(convertResult.totalUsd || 0, '$ ')}</span>
              </div>
              {convertResult.totalVes != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748b' }}>Equivalente (VES):</span>
                  <span style={{ fontWeight: 700, color: '#334155' }}>{formatVES(convertResult.totalVes)}</span>
                </div>
              )}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 4, fontSize: 12 }}>
                {convertResult.paymentType === 'CONTADO' ? (
                  <div style={{ color: '#166534', background: '#f0fdf4', padding: '8px 10px', borderRadius: 8, border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={15} color="#16a34a" />
                    <span>
                      <b>Pago de Contado:</b> Registrado en <b>{convertResult.bankAccountName || 'Cuenta Bancaria'}</b> ({convertResult.paymentMethod || 'Contado'}). Saldo de tesorería actualizado.
                    </span>
                  </div>
                ) : (
                  <div style={{ color: '#92400e', background: '#fffbeb', padding: '8px 10px', borderRadius: 8, border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={15} color="#d97706" />
                    <span>
                      <b>Cuenta por Cobrar (CxC):</b> Registrada a crédito con vencimiento el <b>{convertResult.dueDate || '15 días'}</b> en estado PENDIENTE.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Aviso si hubo ítems removidos por falta de stock */}
            {convertResult.removedItems && convertResult.removedItems.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 8 }}>
                  <AlertTriangle size={15} /> Ítems removidos por falta de inventario
                </div>
                {convertResult.removedItems.map((it, idx) => (
                  <div key={idx} style={{ fontSize: 12, color: '#7f1d1d', padding: '6px 0', borderTop: idx > 0 ? '1px solid #fecaca' : 'none' }}>
                    <b>{it.name}</b> ({it.sku}) — requeridos: {Number(it.quantity)}, disponibles: {Number(it.available)}. ({it.reason})
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                onClick={() => { setConvertQuote(null); setConvertResult(null); }}
                style={{ minWidth: 120 }}
              >
                Aceptar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
