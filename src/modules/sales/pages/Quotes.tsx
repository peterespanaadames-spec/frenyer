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
  Percent
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { getActiveExchangeRate, setActiveExchangeRate, convertUSDtoVES, formatUSD, formatVES } from '../../../lib/currency';
import {
  fetchProductsFromSupabase,
  fetchCustomersFromSupabase,
  createCustomerInSupabase,
  fetchQuotesFromSupabase,
  createQuoteInSupabase,
  convertQuoteToInvoiceInSupabase,
  rejectQuoteInSupabase,
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
  const [convertPaymentType, setConvertPaymentType] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [isConverting, setIsConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<{
    invoiceDocNumber?: string;
    totalUsd?: number;
    removedItems?: Array<{ sku: string; name: string; quantity: number; available: number; reason: string }>;
  } | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

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
  const getQuoteStatus = (q: DbQuote): 'Creada' | 'Facturada' | 'Expirada' | 'Rechazada' => {
    if (q.quote_status === 'Facturada') return 'Facturada';
    if (q.quote_status === 'Rechazada') return 'Rechazada';
    if (q.expires_at && new Date(q.expires_at) < new Date()) return 'Expirada';
    return 'Creada';
  };

  const categories = ['Todas', ...Array.from(new Set(products.map(p => p.category)))];

  // Filtered quotes
  const filteredQuotes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const productTerm = productFilter.trim().toLowerCase();
    return quotes.filter(q => {
      const status = getQuoteStatus(q);
      const customerName = (q.customer?.name || '').toLowerCase();
      const matchesSearch = !term
        || q.doc_number.toLowerCase().includes(term)
        || customerName.includes(term);
      const matchesCustomer = customerFilter === 'Todos' || (q.customer?.name || '') === customerFilter;
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
    setIsCreateOpen(true);
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

  const handleCotizar = async () => {
    if (!draftCustomerId) {
      showToast('Selecciona un cliente para la cotización.', 'info');
      return;
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

      const result = await createQuoteInSupabase({
        customerId: draftCustomerId,
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

      showToast('Cotización creada exitosamente.');
      setIsCreateOpen(false);
      resetDraft();
      await loadData();
    } catch (err: any) {
      showToast(err?.message || 'Error al crear la cotización.', 'info');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openConvertModal = (quote: DbQuote) => {
    setConvertQuote(quote);
    setConvertPaymentType(quote.payment_type === 'CREDITO' ? 'CREDITO' : 'CONTADO');
    setConvertResult(null);
  };

  const handleConvertToInvoice = async () => {
    if (!convertQuote) return;
    setIsConverting(true);
    try {
      const result = await convertQuoteToInvoiceInSupabase(convertQuote.id, convertPaymentType);
      if (!result.success) {
        showToast(result.error || 'No se pudo convertir la cotización.', 'info');
        return;
      }
      setConvertResult({
        invoiceDocNumber: result.invoiceDocNumber,
        totalUsd: result.totalUsd,
        removedItems: result.removedItems || []
      });
      showToast(`Factura ${result.invoiceDocNumber} generada desde la cotización.`);
      await loadData();
    } catch (err: any) {
      showToast(err?.message || 'Error al convertir la cotización.', 'info');
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
      case 'Rechazada': return 'warning';
      default: return 'brand';
    }
  };

  const uniqueCustomerNames = Array.from(new Set(quotes.map(q => q.customer?.name || ''))).filter(Boolean);

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
          <h1>Presupuesto</h1>
          <p>Cotizaciones y presupuestos de venta para tus clientes.</p>
        </div>
        <div className="actions">
          <Button
            variant="secondary"
            onClick={() => loadData()}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            disabled={isLoading}
          >
            <RefreshCw size={14} /> Actualizar
          </Button>
          <Button
            variant="primary"
            onClick={openCreateModal}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} /> Crear una cotización
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '6px 14px', borderRadius: 10, border: '1px solid var(--border)' }}>
          <Search size={16} style={{ color: '#94a3b8' }} />
          <input
            className="input"
            style={{ border: 'none', boxShadow: 'none', padding: 0, height: 'auto', fontSize: 13, background: 'transparent' }}
            placeholder="Buscar por folio o cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', minWidth: 200 }}>
          <ShoppingCart size={15} style={{ color: '#94a3b8' }} />
          <input
            className="input"
            style={{ border: 'none', boxShadow: 'none', padding: 0, height: 38, fontSize: 13, background: 'transparent' }}
            placeholder="Buscar por producto (nombre o SKU)..."
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="input"
          style={{ height: 38, fontSize: 13, fontWeight: 600, cursor: 'pointer', minWidth: 160 }}
        >
          <option value="Todas">Todos los estados</option>
          <option value="Creada">Creada (Pendiente/Activa)</option>
          <option value="Facturada">Facturada (Aprobada y procesada)</option>
          <option value="Expirada">Expirada / Vencida</option>
          <option value="Rechazada">Rechazada (Cancelada)</option>
        </select>
      </div>

      {/* Table */}
      <Card className="table-wrap" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Cargando cotizaciones...
          </div>
        ) : filteredQuotes.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            No hay cotizaciones para este filtro.
          </div>
        ) : (
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th style={{ textAlign: 'right' }}>Total ($)</th>
                <th style={{ textAlign: 'center' }}>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.map(q => {
                const status = getQuoteStatus(q);
                return (
                  <tr key={q.id}>
                    <td style={{ fontWeight: 700, color: '#0f172a' }}>{q.doc_number}</td>
                    <td style={{ color: '#64748b' }}>
                      {q.created_at ? new Date(q.created_at).toLocaleDateString('es-VE') : '—'}
                    </td>
                    <td style={{ color: '#1e293b' }}>{q.customer?.name || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {formatUSD(Number(q.total_usd) || 0, '$ ')}
                      <div style={{ fontSize: 10, fontWeight: 500, color: '#64748b' }}>
                        {formatVES(convertUSDtoVES(Number(q.total_usd) || 0, activeRate))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Badge tone={statusTone(status)}>{status}</Badge>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          onClick={() => setViewQuote(q)}
                          title="Ver"
                          style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
                        >
                          <Eye size={14} />
                        </button>
                        {status === 'Creada' && (
                          <button
                            onClick={() => openConvertModal(q)}
                            title="Convertir a Factura"
                            style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}
                          >
                            <Receipt size={14} />
                          </button>
                        )}
                        {status === 'Creada' && (
                          <button
                            onClick={() => handleReject(q)}
                            title="Cancelar"
                            style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}
                          >
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Nueva cotización</h2>
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
                      <Button
                        variant="primary"
                        onClick={handleCotizar}
                        disabled={isSubmitting}
                        style={{ width: '100%', height: 42, fontSize: 14, fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 6 }}
                      >
                        <FileText size={16} /> {isSubmitting ? 'Guardando...' : 'Cotizar'}
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
          </Card>
        </div>
      )}

      {/* ================= CONVERT MODAL ================= */}
      {convertQuote && !convertResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', zIndex: 1400, padding: 16 }}>
          <Card style={{ width: '100%', maxWidth: 480, padding: 24, position: 'relative' }}>
            <button onClick={() => setConvertQuote(null)} style={{ position: 'absolute', top: 18, right: 18, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
              <X size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ecfdf5', color: '#059669', display: 'grid', placeItems: 'center' }}>
                <Receipt size={19} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Convertir a Factura</h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>Cotización {convertQuote.doc_number} · {convertQuote.customer?.name}</span>
              </div>
            </div>

            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: 10, fontSize: 12, color: '#92400e', margin: '12px 0', display: 'flex', gap: 8 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Se verificará el stock real de cada producto. Los ítems sin existencia serán removidos de la factura y se te informará.</span>
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 5 }}>Tipo de pago de la factura</label>
            <select
              className="input"
              value={convertPaymentType}
              onChange={(e) => setConvertPaymentType(e.target.value as 'CONTADO' | 'CREDITO')}
              style={{ height: 40, marginBottom: 14 }}
            >
              <option value="CONTADO">Contado</option>
              <option value="CREDITO">Crédito (genera cuenta por cobrar)</option>
            </select>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setConvertQuote(null)}>Volver</Button>
              <Button
                variant="primary"
                onClick={handleConvertToInvoice}
                disabled={isConverting}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Receipt size={14} /> {isConverting ? 'Convirtiendo...' : 'Convertir y facturar'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ================= CONVERT RESULT MODAL ================= */}
      {convertQuote && convertResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'grid', placeItems: 'center', zIndex: 1400, padding: 16 }}>
          <Card style={{ width: '100%', maxWidth: 560, padding: 24, position: 'relative' }}>
            <button onClick={() => { setConvertQuote(null); setConvertResult(null); }} style={{ position: 'absolute', top: 18, right: 18, background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
              <X size={20} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ecfdf5', color: '#059669', display: 'grid', placeItems: 'center' }}>
                <CheckCircle size={19} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Factura {convertResult.invoiceDocNumber} generada</h3>
                <span style={{ fontSize: 12, color: '#64748b' }}>Total facturado: {formatUSD(convertResult.totalUsd || 0, '$ ')}</span>
              </div>
            </div>

            {convertResult.removedItems && convertResult.removedItems.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: 12, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 8 }}>
                  <AlertTriangle size={15} /> Ítems removidos por falta de stock
                </div>
                {convertResult.removedItems.map((it, idx) => (
                  <div key={idx} style={{ fontSize: 12, color: '#7f1d1d', padding: '6px 0', borderTop: idx > 0 ? '1px solid #fecaca' : 'none' }}>
                    <b>{it.name}</b> ({it.sku}) — solicitados {Number(it.quantity)}, disponibles {Number(it.available)}.{' '}
                    <i>{it.reason}.</i> El producto ya no cuenta con stock disponible y fue removido de la carga.
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={() => { setConvertQuote(null); setConvertResult(null); }}>Aceptar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
