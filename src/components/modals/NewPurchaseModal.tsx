import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Search,
  ShoppingCart,
  Truck,
  Building2,
  Calendar,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  FileText,
  Package,
  Trash2,
  DollarSign,
  Receipt,
  Check,
  RefreshCw
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  fetchSuppliersFromSupabase,
  createSupplierInSupabase,
  fetchProductsFromSupabase,
  createProductInSupabase,
  fetchBankAccountsFromSupabase,
  createPurchaseInSupabase,
  type DbSupplier,
  type DbProduct
} from '../../lib/supabase/db';
import { getActiveExchangeRate, convertUSDtoVES, formatUSD, formatVES } from '../../lib/currency';

interface BasketItem {
  productId?: string;
  sku: string;
  name: string;
  category?: string;
  quantity: number;
  unitCostUSD: number;
  currentStock: number;
}

interface NewPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewPurchaseModal({ isOpen, onClose, onSuccess }: NewPurchaseModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const activeRate = getActiveExchangeRate();

  // Data loaded from Supabase
  const [suppliers, setSuppliers] = useState<DbSupplier[]>([]);
  const [products, setProducts] = useState<DbProduct[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Step 1: Proveedor y Factura
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierRif, setSupplierRif] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [warehouse, setWarehouse] = useState('Tienda Bella Vista (SP-01)');
  const [notes, setNotes] = useState('');
  const [updateCosts, setUpdateCosts] = useState(true);

  // Step 2: Catálogo y Cesta
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('TODOS');
  const [basket, setBasket] = useState<BasketItem[]>([]);

  // Step 3: Método de Pago
  const [paymentType, setPaymentType] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [paymentInstrument, setPaymentInstrument] = useState('Transferencia bancaria');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [operationDetail, setOperationDetail] = useState('');
  const [creditDays, setCreditDays] = useState(30);
  const [creditDueDate, setCreditDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  // Sub-modal: Nuevo Proveedor
  const [isNewSupplierModalOpen, setIsNewSupplierModalOpen] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupRif, setNewSupRif] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupEmail, setNewSupEmail] = useState('');
  const [newSupAddress, setNewSupAddress] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  // Sub-modal: Nuevo Producto
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('General');
  const [newProdCost, setNewProdCost] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdStock, setNewProdStock] = useState('0');
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  // Cargar datos reales al abrir
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setErrorMessage('');
      setIsLoadingData(true);
      Promise.all([
        fetchSuppliersFromSupabase(),
        fetchProductsFromSupabase(),
        fetchBankAccountsFromSupabase()
      ]).then(([sups, prods, banks]) => {
        setSuppliers(sups || []);
        setProducts(prods || []);
        if (banks?.success && Array.isArray(banks.data)) {
          setBankAccounts(banks.data);
          const firstActive = banks.data.find((b: any) => b.status !== 'Inactivo') || banks.data[0];
          if (firstActive) {
            setSelectedBankId(firstActive.id);
            setPaymentInstrument(firstActive.currency === 'USD' ? 'Efectivo USD' : 'Transferencia bancaria');
          }
        }
        setIsLoadingData(false);
      }).catch(err => {
        console.warn('Error cargando datos para compra:', err);
        setIsLoadingData(false);
      });
    }
  }, [isOpen]);

  // Sincronizar datos del proveedor seleccionado
  useEffect(() => {
    if (selectedSupplierId) {
      const sup = suppliers.find(s => s.id === selectedSupplierId);
      if (sup) {
        setSupplierName(sup.name || '');
        setSupplierRif(sup.doc_number || '');
      }
    }
  }, [selectedSupplierId, suppliers]);

  // Actualizar fecha de vencimiento al cambiar días de crédito
  const handleSelectCreditDays = (days: number) => {
    setCreditDays(days);
    const d = new Date(invoiceDate || Date.now());
    d.setDate(d.getDate() + days);
    setCreditDueDate(d.toISOString().slice(0, 10));
  };

  // Cálculos de la cesta
  const totalItemsCount = useMemo(() => {
    return basket.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  }, [basket]);

  const totalUSD = useMemo(() => {
    const raw = basket.reduce((acc, it) => acc + ((Number(it.quantity) || 0) * (Number(it.unitCostUSD) || 0)), 0);
    return Math.round(raw * 100) / 100;
  }, [basket]);

  const totalVES = useMemo(() => {
    return Math.round(totalUSD * activeRate * 100) / 100;
  }, [totalUSD, activeRate]);

  // Categorías de productos
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category.toUpperCase());
    });
    return ['TODOS', ...Array.from(set)];
  }, [products]);

  // Productos filtrados para el catálogo
  const filteredProducts = useMemo(() => {
    const term = catalogSearch.trim().toLowerCase();
    return products.filter(p => {
      const matchSearch = !term ||
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.toLowerCase().includes(term));
      const matchCat = selectedCategory === 'TODOS' ||
        (p.category && p.category.toUpperCase() === selectedCategory);
      return matchSearch && matchCat;
    });
  }, [products, catalogSearch, selectedCategory]);

  // Manejo de la cesta
  const addToBasket = (prod: DbProduct) => {
    setBasket(prev => {
      const existing = prev.find(it => it.sku === prod.sku);
      if (existing) {
        return prev.map(it => it.sku === prod.sku ? { ...it, quantity: it.quantity + 1 } : it);
      }
      return [...prev, {
        productId: prod.id,
        sku: prod.sku,
        name: prod.name,
        category: prod.category,
        quantity: 1,
        unitCostUSD: Number(prod.cost_usd) || 0,
        currentStock: Number(prod.stock) || 0
      }];
    });
  };

  const updateItemQty = (sku: string, delta: number) => {
    setBasket(prev => prev.map(it => {
      if (it.sku !== sku) return it;
      const next = Math.max(1, it.quantity + delta);
      return { ...it, quantity: next };
    }));
  };

  const updateItemCost = (sku: string, costStr: string) => {
    const cost = parseFloat(costStr);
    setBasket(prev => prev.map(it => {
      if (it.sku !== sku) return it;
      return { ...it, unitCostUSD: Number.isFinite(cost) && cost >= 0 ? cost : 0 };
    }));
  };

  const removeItem = (sku: string) => {
    setBasket(prev => prev.filter(it => it.sku !== sku));
  };

  // Guardar nuevo proveedor
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupName.trim() || !newSupRif.trim()) return;
    setIsSavingSupplier(true);
    try {
      const created = await createSupplierInSupabase({
        name: newSupName.trim(),
        doc_type: 'RIF (J / G / V)',
        doc_number: newSupRif.trim().toUpperCase(),
        phone: newSupPhone.trim(),
        email: newSupEmail.trim(),
        address: newSupAddress.trim(),
        category: 'General',
        balance_usd: 0,
        status: 'Activo'
      });

      if (created) {
        setSuppliers(prev => [created, ...prev]);
        setSelectedSupplierId(created.id);
        setSupplierName(created.name);
        setSupplierRif(created.doc_number);
        setIsNewSupplierModalOpen(false);
        setNewSupName('');
        setNewSupRif('');
        setNewSupPhone('');
        setNewSupEmail('');
        setNewSupAddress('');
      } else {
        setErrorMessage('No se pudo registrar el proveedor en Supabase. Verifique los datos o la conexión.');
      }
    } catch (err: any) {
      console.error('Error registrando proveedor:', err);
      setErrorMessage(err?.message || 'Error registrando proveedor.');
    } finally {
      setIsSavingSupplier(false);
    }
  };

  // Guardar nuevo producto
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || !newProdSku.trim()) return;
    setIsSavingProduct(true);
    try {
      const costVal = parseFloat(newProdCost) || 0;
      const priceVal = parseFloat(newProdPrice) || costVal * 1.3;
      const stockVal = parseFloat(newProdStock) || 0;

      const created = await createProductInSupabase({
        sku: newProdSku.trim().toUpperCase(),
        name: newProdName.trim(),
        category: newProdCategory.trim() || 'General',
        cost_usd: costVal,
        price_usd: priceVal,
        stock: stockVal,
        min_stock: 5,
        unit: 'UND',
        status: 'Activo'
      });

      if (created?.success && created.data) {
        setProducts(prev => [created.data!, ...prev]);
        addToBasket(created.data!);
        setIsNewProductModalOpen(false);
        setNewProdName('');
        setNewProdSku('');
        setNewProdCost('');
        setNewProdPrice('');
        setNewProdStock('0');
      }
    } catch (err) {
      console.error('Error creando producto:', err);
    } finally {
      setIsSavingProduct(false);
    }
  };

  // Validaciones antes de avanzar de paso
  const handleNextStep = () => {
    setErrorMessage('');
    if (step === 1) {
      if (!selectedSupplierId && !supplierName.trim()) {
        setErrorMessage('Por favor selecciona o ingresa los datos del proveedor.');
        return;
      }
      if (!invoiceNumber.trim()) {
        setErrorMessage('El número de factura o control es obligatorio.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (basket.length === 0) {
        setErrorMessage('Debes agregar al menos un producto a la cesta de compra.');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (paymentType === 'CONTADO' && !selectedBankId && bankAccounts.length > 0) {
        setErrorMessage('Selecciona la cuenta bancaria o caja registrada para el débito.');
        return;
      }
      setStep(4);
    }
  };

  // Confirmar y guardar compra definitiva
  const handleConfirmPurchase = async () => {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const selectedBank = bankAccounts.find(b => b.id === selectedBankId);

      const result = await createPurchaseInSupabase({
        supplierId: selectedSupplierId || undefined,
        supplierName: supplierName.trim(),
        supplierDoc: supplierRif.trim(),
        invoiceNumber: invoiceNumber.trim(),
        purchaseDate: invoiceDate,
        warehouse,
        paymentType,
        exchangeRate: activeRate,
        notes: notes.trim(),
        updateCosts,
        items: basket.map(it => ({
          productId: it.productId,
          sku: it.sku,
          name: it.name,
          quantity: it.quantity,
          unitCostUSD: it.unitCostUSD
        })),
        bankAccountId: paymentType === 'CONTADO' ? selectedBankId : undefined,
        bankAccountName: selectedBank?.bank_name,
        paymentMethod: paymentType === 'CONTADO' ? paymentInstrument : undefined,
        paymentReference: paymentType === 'CONTADO' ? paymentRef : undefined,
        dueDate: paymentType === 'CREDITO' ? creditDueDate : undefined
      });

      if (!result.success) {
        setErrorMessage(result.error || 'No se pudo guardar la compra.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error registrando la compra.');
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedBank = bankAccounts.find(b => b.id === selectedBankId);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      zIndex: 1300,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        width: 'min(1150px, 98vw)',
        maxHeight: '94vh',
        background: '#fff',
        borderRadius: 20,
        boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid rgba(226, 232, 240, 0.8)'
      }}>
        {/* HEADER AZUL SUPERIOR (Imagen 1, 2, 3, 4) */}
        <div style={{
          background: 'linear-gradient(135deg, #094783 0%, #0d5ea6 100%)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: '#06b6d4',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 4px 12px rgba(6, 182, 212, 0.35)'
            }}>
              <ShoppingCart size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px' }}>
                  REGISTRO DE COMPRA NUEVA
                </h2>
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '3px 9px',
                  borderRadius: 20,
                  background: 'rgba(6, 182, 212, 0.25)',
                  border: '1px solid rgba(6, 182, 212, 0.5)',
                  color: '#67e8f9',
                  letterSpacing: '0.5px'
                }}>
                  PASO {step} DE 4
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255, 255, 255, 0.85)' }}>
                {step === 1 && '1. Datos del Proveedor y Factura de Compra'}
                {step === 2 && '2. Catálogo de Productos y Cesta de Compra'}
                {step === 3 && '3. Método de Pago (Cuentas Bancarias y Cuentas por Pagar)'}
                {step === 4 && '4. Resumen y Confirmación del Ingreso'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.95)',
              border: 'none',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              color: '#1e293b',
              transition: 'all 0.15s ease'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* STEPPER BAR (Pasos 1 a 4) */}
        <div style={{
          background: '#f8fafc',
          borderBottom: '1px solid var(--border)',
          padding: '12px 24px',
          display: 'flex',
          gap: 10,
          overflowX: 'auto'
        }}>
          {[
            { num: 1, label: '1. Proveedor y Factura' },
            { num: 2, label: `2. Catálogo y Cesta ${basket.length > 0 ? `(${basket.length})` : ''}` },
            { num: 3, label: '3. Método de Pago' },
            { num: 4, label: '4. Resumen' }
          ].map(s => {
            const isCurrent = step === s.num;
            const isPast = step > s.num;
            return (
              <div
                key={s.num}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 16px',
                  borderRadius: 30,
                  background: isCurrent ? '#fff' : isPast ? '#f1f5f9' : '#fff',
                  border: isCurrent ? '1.5px solid #06b6d4' : '1px solid #e2e8f0',
                  color: isCurrent ? '#0e7490' : isPast ? '#0f172a' : '#94a3b8',
                  fontWeight: isCurrent || isPast ? 700 : 500,
                  fontSize: 12.5,
                  boxShadow: isCurrent ? '0 2px 8px rgba(6, 182, 212, 0.15)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                <span style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                  fontWeight: 800,
                  background: isCurrent ? '#06b6d4' : isPast ? '#0f172a' : '#e2e8f0',
                  color: '#fff'
                }}>
                  {isPast ? '✓' : s.num}
                </span>
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* CONTENEDOR PRINCIPAL CON SCROLL */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {errorMessage && (
            <div style={{
              background: '#fee2e2',
              color: '#b91c1c',
              border: '1px solid #fca5a5',
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16
            }}>
              <AlertTriangle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PASO 1: INFORMACIÓN DEL PROVEEDOR Y COMPROBANTE (Imagen 1)                */}
          {/* ========================================================================= */}
          {step === 1 && (
            <Card style={{ padding: 24, border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: '#e0f2fe', color: '#0284c7', display: 'grid', placeItems: 'center' }}>
                  <Truck size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                  1. INFORMACIÓN DEL PROVEEDOR Y COMPROBANTE
                </h3>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
                {/* PROVEEDOR COMERCIAL */}
                <div className="field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                      PROVEEDOR COMERCIAL *
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsNewSupplierModalOpen(true)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#0284c7',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <Plus size={13} /> NUEVO PROVEEDOR
                    </button>
                  </div>
                  <select
                    className="input"
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    style={{ height: 42, fontSize: 13, fontWeight: 600 }}
                  >
                    <option value="">Seleccione o busque un proveedor...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        [{s.code || 'PROV'}] {s.name} ({s.doc_number || 'S/D'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* N° DE FACTURA O CONTROL */}
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    N° DE FACTURA O CONTROL *
                  </label>
                  <input
                    className="input"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Ej. Factura 20, 00123054, FAC-1020"
                    style={{ height: 42, fontSize: 13, fontWeight: 600 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                {/* RAZÓN SOCIAL */}
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    RAZÓN SOCIAL DEL PROVEEDOR *
                  </label>
                  <input
                    className="input"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Nombre legal del proveedor"
                    style={{ height: 42, fontSize: 13 }}
                  />
                </div>

                {/* RIF / CÉDULA */}
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    RIF / CÉDULA DEL PROVEEDOR *
                  </label>
                  <input
                    className="input"
                    value={supplierRif}
                    onChange={(e) => setSupplierRif(e.target.value)}
                    placeholder="Ej. J-41563298-8"
                    style={{ height: 42, fontSize: 13 }}
                  />
                </div>

                {/* FECHA DE FACTURA */}
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    FECHA DE FACTURA *
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    style={{ height: 42, fontSize: 13 }}
                  />
                </div>
              </div>

              {/* SEDE / ALMACÉN DE ENTRADA */}
              <div className="field" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  SEDE / ALMACÉN DE ENTRADA *
                </label>
                <select
                  className="input"
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  style={{ height: 42, fontSize: 13 }}
                >
                  <option value="Tienda Bella Vista (SP-01)">Tienda Bella Vista (SP-01)</option>
                  <option value="Almacén Principal">Almacén Principal</option>
                  <option value="Sucursal Centro">Sucursal Centro</option>
                </select>
              </div>

              {/* NOTAS U OBSERVACIONES */}
              <div className="field" style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  NOTAS U OBSERVACIONES DEL PEDIDO
                </label>
                <textarea
                  className="input"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalles de recepción, entrega, condiciones particulares..."
                  style={{ height: 'auto', padding: '10px 12px', fontSize: 13 }}
                />
              </div>

              {/* CHECKBOX: ACTUALIZAR COSTO UNITARIO AUTOMÁTICO */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 12 }}>
                <input
                  type="checkbox"
                  checked={updateCosts}
                  onChange={(e) => setUpdateCosts(e.target.checked)}
                  style={{ width: 17, height: 17, accentColor: '#0284c7' }}
                />
                <span>Actualizar automáticamente el costo unitario de los productos en catálogo según los valores de esta compra.</span>
              </label>
            </Card>
          )}

          {/* ========================================================================= */}
          {/* PASO 2: CATÁLOGO Y CESTA (Imagen 2)                                      */}
          {/* ========================================================================= */}
          {step === 2 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20 }}>
              {/* COLUMNA IZQUIERDA: CATÁLOGO */}
              <Card style={{ padding: 18, borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                    <Package size={18} style={{ color: '#0284c7' }} />
                    <span>CATÁLOGO DE PRODUCTOS</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsNewProductModalOpen(true)}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: 10,
                      padding: '6px 12px',
                      color: '#0f172a',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Plus size={14} /> Crear Producto
                  </button>
                </div>

                {/* BUSCADOR */}
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                  <input
                    className="input"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Buscar por nombre, SKU o código de barras..."
                    style={{ paddingLeft: 36, height: 40, fontSize: 13 }}
                  />
                </div>

                {/* PILLS CATEGORÍAS */}
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 14 }}>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 20,
                        border: selectedCategory === cat ? '1px solid #0f172a' : '1px solid #e2e8f0',
                        background: selectedCategory === cat ? '#0f172a' : '#fff',
                        color: selectedCategory === cat ? '#fff' : '#475569',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {cat} {cat === 'TODOS' ? `(${products.length})` : ''}
                    </button>
                  ))}
                </div>

                {/* GRID DE PRODUCTOS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
                  {filteredProducts.map(p => (
                    <div
                      key={p.sku}
                      onClick={() => addToBasket(p)}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '12px 14px',
                        background: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f1f5f9', display: 'grid', placeItems: 'center', color: '#64748b' }}>
                            <Package size={18} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              SKU: {p.sku} · Stock: <b>{p.stock || 0}</b>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#0f172a' }}>
                          Costo: ${Number(p.cost_usd || 0).toFixed(2)}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#0284c7' }}>
                          + Agregar
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* COLUMNA DERECHA: CESTA DE COMPRA */}
              <Card style={{ padding: 18, borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>
                  <ShoppingCart size={18} style={{ color: '#0284c7' }} />
                  <span>CESTA DE COMPRA ({basket.length})</span>
                </div>

                {basket.length === 0 ? (
                  <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                    <div>
                      <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#f8fafc', border: '1px dashed #cbd5e1', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
                        <ShoppingCart size={28} />
                      </div>
                      <b style={{ fontSize: 14, color: '#475569' }}>La cesta de compra está vacía</b>
                      <p style={{ fontSize: 12, margin: '6px 0 0', lineHeight: 1.4 }}>
                        Haz click en los productos del catálogo a la izquierda para agregarlos e ingresar cantidades y costos.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {basket.map(it => (
                      <div key={it.sku} style={{ border: '1px solid #f1f5f9', borderRadius: 10, padding: 10, background: '#fafbfc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div>
                            <b style={{ fontSize: 13, color: '#0f172a' }}>{it.name}</b>
                            <div style={{ fontSize: 11, color: '#64748b' }}>SKU: {it.sku}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(it.sku)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: '#64748b' }}>Cant:</span>
                            <button
                              type="button"
                              onClick={() => updateItemQty(it.sku, -1)}
                              style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff' }}
                            >-</button>
                            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{it.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateItemQty(it.sku, 1)}
                              style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff' }}
                            >+</button>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: '#64748b' }}>Costo $:</span>
                            <input
                              type="number"
                              step="0.01"
                              className="input"
                              value={it.unitCostUSD}
                              onChange={(e) => updateItemCost(it.sku, e.target.value)}
                              style={{ width: 75, height: 28, padding: '0 6px', fontSize: 12, textAlign: 'right' }}
                            />
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                            ${(it.quantity * it.unitCostUSD).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* TOTAL BANNER CESTA */}
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 12, marginTop: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                        TOTAL CESTA ({totalItemsCount} UDS.)
                      </span>
                      <div style={{ fontSize: 24, fontWeight: 900, color: '#0284c7' }}>
                        ${totalUSD.toFixed(2)} USD
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 11, color: '#64748b' }}>Tasa BCV: {activeRate.toFixed(2)}</span>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        Bs. {totalVES.toLocaleString('es-VE')}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PASO 3: MÉTODO DE PAGO Y VINCULACIÓN BANCARIA / CXP (Imagen 3)            */}
          {/* ========================================================================= */}
          {step === 3 && (
            <Card style={{ padding: 24, borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: '#e0f2fe', color: '#0284c7', display: 'grid', placeItems: 'center' }}>
                    <CreditCard size={18} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                    3. MÉTODO DE PAGO Y VINCULACIÓN BANCARIA / CXP
                  </h3>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                  TOTAL A LIQUIDAR <span style={{ color: '#0284c7' }}>${totalUSD.toFixed(2)} USD</span>
                </div>
              </div>

              {/* SELECTOR CONTADO / CRÉDITO */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                {/* TARJETA CONTADO */}
                <div
                  onClick={() => setPaymentType('CONTADO')}
                  style={{
                    border: paymentType === 'CONTADO' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                    background: paymentType === 'CONTADO' ? '#f0f9ff' : '#fff',
                    borderRadius: 14,
                    padding: 18,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#dcfce7', color: '#16a34a', display: 'grid', placeItems: 'center' }}>
                    <Receipt size={22} />
                  </div>
                  <div>
                    <b style={{ fontSize: 14, color: '#0f172a' }}>PAGO DE CONTADO / TESORERÍA</b>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                      Debita de inmediato el saldo de una cuenta bancaria o caja chica del sistema.
                    </p>
                  </div>
                </div>

                {/* TARJETA CRÉDITO */}
                <div
                  onClick={() => setPaymentType('CREDITO')}
                  style={{
                    border: paymentType === 'CREDITO' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                    background: paymentType === 'CREDITO' ? '#f0f9ff' : '#fff',
                    borderRadius: 14,
                    padding: 18,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fef3c7', color: '#d97706', display: 'grid', placeItems: 'center' }}>
                    <Clock size={22} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: 14, color: '#0f172a' }}>CRÉDITO / CUENTAS POR PAGAR (CXP)</b>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: '#e0f2fe', color: '#0284c7' }}>
                        VINCULAR
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                      Genera una Cuenta por Pagar (CXP) con calendario de cuotas y seguimiento de saldo pendiente.
                    </p>
                  </div>
                </div>
              </div>

              {/* DETALLES CONTADO */}
              {paymentType === 'CONTADO' && (
                <Card style={{ padding: 18, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>
                    <Building2 size={16} style={{ color: '#0284c7' }} />
                    <span>SELECCIÓN DE CUENTA BANCARIA / ORIGEN DEL PAGO</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 14 }}>
                    <div className="field">
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        CUENTA BANCARIA / CAJA REGISTRADA *
                      </label>
                      <select
                        className="input"
                        value={selectedBankId}
                        onChange={(e) => setSelectedBankId(e.target.value)}
                        style={{ height: 42, fontSize: 13, fontWeight: 600 }}
                      >
                        {bankAccounts.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.bank_name} ({b.currency}) - Saldo: {b.currency === 'USD' ? `$${Number(b.balance || 0).toFixed(2)} USD` : `Bs. ${Number(b.balance || 0).toLocaleString('es-VE')}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        INSTRUMENTO DE PAGO *
                      </label>
                      <select
                        className="input"
                        value={paymentInstrument}
                        onChange={(e) => setPaymentInstrument(e.target.value)}
                        style={{ height: 42, fontSize: 13 }}
                      >
                        <option value="Transferencia bancaria">Transferencia bancaria</option>
                        <option value="Pago Móvil">Pago Móvil</option>
                        <option value="Efectivo USD">Efectivo USD</option>
                        <option value="Efectivo VES">Efectivo VES</option>
                        <option value="Zelle">Zelle</option>
                        <option value="Punto de Venta">Punto de Venta</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
                    <div className="field">
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        N° DE REFERENCIA / COMPROBANTE
                      </label>
                      <input
                        className="input"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                        placeholder="Ej: REF-441829"
                        style={{ height: 42, fontSize: 13 }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        FECHA DEL MOVIMIENTO
                      </label>
                      <input
                        type="date"
                        className="input"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        style={{ height: 42, fontSize: 13 }}
                      />
                    </div>

                    <div className="field">
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        DETALLE DE LA OPERACIÓN
                      </label>
                      <input
                        className="input"
                        value={operationDetail}
                        onChange={(e) => setOperationDetail(e.target.value)}
                        placeholder="Ej: Pago directo a proveedor"
                        style={{ height: 42, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#0369a1', background: '#e0f2fe', padding: '10px 14px', borderRadius: 8 }}>
                    <CheckCircle2 size={16} />
                    <span>Se registrará automáticamente el egreso por <b>${totalUSD.toFixed(2)} USD</b> en el módulo de Cuentas Bancarias y Caja.</span>
                  </div>
                </Card>
              )}

              {/* DETALLES CRÉDITO */}
              {paymentType === 'CREDITO' && (
                <Card style={{ padding: 18, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>
                    <Clock size={16} style={{ color: '#d97706' }} />
                    <span>CONDICIONES DE CRÉDITO Y CUENTA POR PAGAR (CXP)</span>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 8 }}>
                      PLAZO DE CRÉDITO ACORDADO:
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[7, 15, 30, 45, 60].map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleSelectCreditDays(d)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            border: creditDays === d ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                            background: creditDays === d ? '#0284c7' : '#fff',
                            color: creditDays === d ? '#fff' : '#0f172a',
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: 'pointer'
                          }}
                        >
                          {d} días
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 14 }}>
                    <div className="field">
                      <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        FECHA DE VENCIMIENTO DE LA OBLIGACIÓN *
                      </label>
                      <input
                        type="date"
                        className="input"
                        value={creditDueDate}
                        onChange={(e) => setCreditDueDate(e.target.value)}
                        style={{ height: 42, fontSize: 13, fontWeight: 600 }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: '#b45309', background: '#fef3c7', padding: '10px 14px', borderRadius: 8 }}>
                    <CheckCircle2 size={16} />
                    <span>Se creará automáticamente la cuenta por pagar por <b>${totalUSD.toFixed(2)} USD</b> a favor de <b>{supplierName || 'Proveedor'}</b> con vencimiento el {creditDueDate}.</span>
                  </div>
                </Card>
              )}
            </Card>
          )}

          {/* ========================================================================= */}
          {/* PASO 4: RESUMEN Y CONFIRMACIÓN DE LA COMPRA (Imagen 4)                     */}
          {/* ========================================================================= */}
          {step === 4 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: '#e0f2fe', color: '#0284c7', display: 'grid', placeItems: 'center' }}>
                  <FileText size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                  4. RESUMEN Y CONFIRMACIÓN DE LA COMPRA
                </h3>
              </div>

              {/* 2 TARJETAS SUPERIORES */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
                {/* TARJETA PROVEEDOR Y COMPROBANTE */}
                <Card style={{ padding: 18, borderRadius: 14, background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                    <Truck size={14} style={{ color: '#0284c7' }} />
                    <span>PROVEEDOR Y COMPROBANTE</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                    {supplierName || 'Proveedor General'}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                    RIF: {supplierRif || 'S/D'}
                  </div>
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Factura N°:</span>
                      <b style={{ color: '#0f172a' }}>{invoiceNumber}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Fecha de Factura:</span>
                      <b style={{ color: '#0f172a' }}>{invoiceDate}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Almacén de Entrada:</span>
                      <b style={{ color: '#0f172a' }}>{warehouse}</b>
                    </div>
                  </div>
                </Card>

                {/* TARJETA CONDICIONES DE PAGO */}
                <Card style={{ padding: 18, borderRadius: 14, background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                    <CreditCard size={14} style={{ color: '#0284c7' }} />
                    <span>CONDICIONES DE PAGO</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                      {paymentType === 'CONTADO' ? 'Pago de Contado' : `Crédito a ${creditDays} días`}
                    </div>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: paymentType === 'CONTADO' ? '#dcfce7' : '#fef3c7',
                      color: paymentType === 'CONTADO' ? '#16a34a' : '#d97706'
                    }}>
                      {paymentType === 'CONTADO' ? paymentInstrument.toUpperCase() : 'CXP'}
                    </span>
                  </div>
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {paymentType === 'CONTADO' ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Cuenta de Débito:</span>
                          <b style={{ color: '#0f172a' }}>{selectedBank?.bank_name || 'Caja Chica'}</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Referencia:</span>
                          <b style={{ color: '#0f172a' }}>{paymentRef || 'S/R'}</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Movimiento:</span>
                          <b style={{ color: '#16a34a' }}>Liquidado de inmediato</b>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Vence el:</span>
                          <b style={{ color: '#0f172a' }}>{creditDueDate}</b>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Estado:</span>
                          <b style={{ color: '#d97706' }}>Pendiente en Cuentas por Pagar</b>
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              </div>

              {/* TABLA DETALLE DE PRODUCTOS */}
              <Card style={{ padding: 0, borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: 20 }}>
                <div style={{ padding: '12px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ fontSize: 13, color: '#0f172a' }}>DETALLE DE PRODUCTOS A INCORPORAR ({basket.length})</b>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{totalItemsCount} UNIDADES TOTALES</span>
                </div>
                <div className="table-wrap">
                  <table className="table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>PRODUCTO</th>
                        <th style={{ textAlign: 'center' }}>CANT. COMPRADA</th>
                        <th style={{ textAlign: 'right' }}>COSTO UNIT.</th>
                        <th style={{ textAlign: 'right' }}>SUBTOTAL</th>
                        <th style={{ textAlign: 'center' }}>INCREMENTO STOCK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {basket.map(it => (
                        <tr key={it.sku}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>SKU: {it.sku}</div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 800, color: '#0284c7' }}>
                            +{it.quantity}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            ${it.unitCostUSD.toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            ${(it.quantity * it.unitCostUSD).toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 800,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: '#e0f2fe',
                              color: '#0369a1'
                            }}>
                              {it.currentStock} → {it.currentStock + it.quantity}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* BANNER TOTAL FACTURA (Degradado azul) */}
              <div style={{
                background: 'linear-gradient(135deg, #094783 0%, #0369a1 100%)',
                borderRadius: 16,
                padding: '20px 24px',
                color: '#fff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 8px 24px rgba(3, 105, 161, 0.25)'
              }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.6px', color: 'rgba(255, 255, 255, 0.8)' }}>
                    TOTAL FACTURA DE COMPRA
                  </span>
                  <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1.1, marginTop: 4 }}>
                    ${totalUSD.toFixed(2)} USD
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.85)' }}>
                    Tasa Oficial BCV: Bs. {activeRate.toFixed(2)} / USD
                  </span>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#67e8f9', marginTop: 4 }}>
                    Bs. {totalVES.toLocaleString('es-VE')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACCIONES INFERIORES */}
        <div style={{
          background: '#fff',
          borderTop: '1px solid var(--border)',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((step - 1) as any)}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 10,
                padding: '10px 18px',
                color: '#334155',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <ArrowLeft size={16} />
              {step === 4 ? 'Modificar Datos' : `Paso ${step - 1}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={handleNextStep}
              style={{
                background: '#0f172a',
                border: 'none',
                borderRadius: 10,
                padding: '11px 22px',
                color: '#fff',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.2)'
              }}
            >
              {step === 1 && 'CONTINUAR AL CATÁLOGO DE PRODUCTOS'}
              {step === 2 && 'CONTINUAR CON MÉTODO DE PAGO'}
              {step === 3 && 'CONTINUAR AL RESUMEN FINAL'}
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirmPurchase}
              disabled={isSubmitting}
              style={{
                background: '#094783',
                border: 'none',
                borderRadius: 10,
                padding: '12px 26px',
                color: '#fff',
                fontSize: 13.5,
                fontWeight: 800,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 16px rgba(9, 71, 131, 0.35)',
                opacity: isSubmitting ? 0.7 : 1
              }}
            >
              {isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
              <span>CONFIRMAR Y GUARDAR COMPRA</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-MODAL: NUEVO PROVEEDOR                                                */}
      {/* ========================================================================= */}
      {isNewSupplierModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.7)',
          zIndex: 1400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            width: 'min(460px, 95vw)',
            background: '#fff',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Truck size={18} style={{ color: '#0284c7' }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Registrar Nuevo Proveedor</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewSupplierModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700 }}>Razón Social / Nombre *</label>
                <input
                  className="input"
                  required
                  value={newSupName}
                  onChange={(e) => setNewSupName(e.target.value)}
                  placeholder="Ej. Distribuidora Los Andes C.A."
                />
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700 }}>RIF o Documento Fiscal *</label>
                <input
                  className="input"
                  required
                  value={newSupRif}
                  onChange={(e) => setNewSupRif(e.target.value)}
                  placeholder="Ej. J-12345678-9"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Teléfono</label>
                  <input
                    className="input"
                    value={newSupPhone}
                    onChange={(e) => setNewSupPhone(e.target.value)}
                    placeholder="0414-1234567"
                  />
                </div>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Correo</label>
                  <input
                    className="input"
                    type="email"
                    value={newSupEmail}
                    onChange={(e) => setNewSupEmail(e.target.value)}
                    placeholder="proveedor@gmail.com"
                  />
                </div>
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700 }}>Dirección</label>
                <input
                  className="input"
                  value={newSupAddress}
                  onChange={(e) => setNewSupAddress(e.target.value)}
                  placeholder="Ciudad o zona comercial"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <Button variant="secondary" type="button" onClick={() => setIsNewSupplierModalOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="primary" type="submit" disabled={isSavingSupplier}>
                  {isSavingSupplier ? 'Guardando...' : 'Guardar y Seleccionar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-MODAL: NUEVO PRODUCTO                                                 */}
      {/* ========================================================================= */}
      {isNewProductModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.7)',
          zIndex: 1400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            width: 'min(460px, 95vw)',
            background: '#fff',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={18} style={{ color: '#0284c7' }} />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Crear Nuevo Producto</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewProductModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 700 }}>Nombre del Producto *</label>
                <input
                  className="input"
                  required
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="Ej. Cuaderno Espiral Carta"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Código SKU *</label>
                  <input
                    className="input"
                    required
                    value={newProdSku}
                    onChange={(e) => setNewProdSku(e.target.value)}
                    placeholder="PRD-00129"
                  />
                </div>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Categoría</label>
                  <input
                    className="input"
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    placeholder="Escolar, Oficina..."
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Costo Compra ($ USD) *</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    required
                    value={newProdCost}
                    onChange={(e) => setNewProdCost(e.target.value)}
                    placeholder="1.50"
                  />
                </div>
                <div className="field">
                  <label style={{ fontSize: 12, fontWeight: 700 }}>Precio Venta ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    placeholder="2.20"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <Button variant="secondary" type="button" onClick={() => setIsNewProductModalOpen(false)}>
                  Cancelar
                </Button>
                <Button variant="primary" type="submit" disabled={isSavingProduct}>
                  {isSavingProduct ? 'Creando...' : 'Crear y Añadir a Cesta'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
