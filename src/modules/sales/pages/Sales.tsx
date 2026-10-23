import { useState, useEffect } from 'react';
import {
  Search,
  ShoppingCart,
  Plus,
  Trash2,
  X,
  CreditCard,
  CheckCircle,
  Clock,
  Printer,
  ArrowLeft,
  Banknote,
  Building,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  Percent,
  Check,
  Tag,
  AlertCircle,
  UserPlus,
  Users,
  RefreshCw
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { getActiveExchangeRate, setActiveExchangeRate, convertUSDtoVES, formatUSD, formatVES } from '../../../lib/currency';
import {
  fetchProductsFromSupabase,
  fetchCustomersFromSupabase,
  createCustomerInSupabase,
  recordSaleInSupabase,
  fetchBankAccountsFromSupabase,
  createProductInSupabase
} from '../../../lib/supabase/db';
import { supabase } from '../../../lib/supabase/client';
import { authenticatedFetch } from '../../../lib/supabase/api';
import { getBusinessProfile } from '../../../lib/businessProfile';

interface CartItem {
  id: string;
  sku: string;
  name: string;
  priceUSD: number;
  quantity: number;
  image?: string;
  stock: number;
}

interface PosProduct {
  sku: string;
  name: string;
  category: string;
  priceUSD: number;
  stock: number;
  image?: string;
}

interface ParkedInvoice {
  id: string;
  clientName: string;
  clientRif: string;
  clientPhone?: string;
  clientAddress?: string;
  items: CartItem[];
  totalUSD: number;
  createdAt: string;
}

interface Customer {
  id?: string;
  rif: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface PaymentEntry {
  id: string;
  method: string;
  amountUSD: number;
  amountVES: number;
  bank_account_id?: string;
}

async function getNextDocumentNumber(type: 'FACTURA' | 'NOTA'): Promise<string> {
  const res = await authenticatedFetch(`/api/sales/last-doc-number?type=${type}`);
  const json = await res.json();

  if (!json.success) {
    throw new Error(json.error || 'No se pudo consultar el correlativo en Supabase.');
  }

  const lastNumber = json.data?.doc_number;
  if (!lastNumber) {
    return '0001';
  }

  const digits = String(lastNumber).match(/\d+/);
  if (!digits) {
    throw new Error('No se pudo determinar el siguiente correlativo de ventas.');
  }

  return String(Number(digits[0]) + 1).padStart(4, '0');
}

export function Sales() {
  const [catalog, setCatalog] = useState<PosProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [activeRate, setActiveRate] = useState(() => getActiveExchangeRate());
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'info' } | null>(null);

  // Parked Invoices
  const [parkedInvoices, setParkedInvoices] = useState<ParkedInvoice[]>([]);
  const [isParkedModalOpen, setIsParkedModalOpen] = useState(false);

  // Modal: Alerta de Producto sin Stock
  const [stockAlertModal, setStockAlertModal] = useState<{
    isOpen: boolean;
    productName: string;
    sku?: string;
    availableStock: number;
    message?: string;
  }>({
    isOpen: false,
    productName: '',
    sku: '',
    availableStock: 0,
    message: ''
  });

  // Free item creation modal
  const [isFreeItemOpen, setIsFreeItemOpen] = useState(false);
  const [freeItemName, setFreeItemName] = useState('Venta Libre / Ítem Abierto');
  const [freeItemPriceUSD, setFreeItemPriceUSD] = useState('');
  const [freeItemQuantity, setFreeItemQuantity] = useState('1');

  // Checkout Stepper State (null if in POS grid, 1 | 2 | 3 when checking out)
  const [checkoutStep, setCheckoutStep] = useState<number | null>(null);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  // Step 1: Customer Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dbAccounts, setDbAccounts] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [clientRif, setClientRif] = useState('');
  const [clientName, setClientName] = useState('Consumidor final');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');

  // Modal: Nuevo Cliente en Ventas Flash
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerDocType, setNewCustomerDocType] = useState('Natural (V / E)');
  const [newCustomerDocNumber, setNewCustomerDocNumber] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerCreditLimit, setNewCustomerCreditLimit] = useState('0');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  const handleOpenNewCustomerModal = () => {
    setNewCustomerName('');
    setNewCustomerDocType('Natural (V / E)');
    setNewCustomerDocNumber('');
    setNewCustomerPhone('');
    setNewCustomerEmail('');
    setNewCustomerCreditLimit('0');
    setNewCustomerAddress('');
    setIsNewCustomerModalOpen(true);
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
        credit_limit: parseFloat(newCustomerCreditLimit) || 0,
        address: newCustomerAddress.trim(),
        status: 'Activo',
        orders_count: 0,
        total_spent_usd: 0,
        last_order_date: new Date().toISOString()
      });

      if (created) {
        const newCust: Customer = {
          id: created.id,
          rif: created.doc_number,
          name: created.name,
          phone: created.phone,
          email: created.email,
          address: created.address
        };
        setCustomers((prev) => [newCust, ...prev]);

        // Auto-select newly created customer for the current active sale
        setClientRif(created.doc_number);
        setClientName(created.name);
        if (created.phone) setClientPhone(created.phone);
        if (created.email) setClientEmail(created.email);
        if (created.address) setClientAddress(created.address);

        showToast(`Cliente ${created.name} registrado y seleccionado.`);
        setIsNewCustomerModalOpen(false);
      } else {
        showToast('Error al registrar cliente.', 'info');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error de conexión', 'info');
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // Step 2: Payment Methods & Toggles
  const [paymentType, setPaymentType] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [isTaxSubject, setIsTaxSubject] = useState(false);
  const [isIgtfApplied, setIsIgtfApplied] = useState(false);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [currentPaymentMethod, setCurrentPaymentMethod] = useState('');
  const [currentPaymentAmountUSD, setCurrentPaymentAmountUSD] = useState('');
  const [currentPaymentAmountVES, setCurrentPaymentAmountVES] = useState('');

  // Abono inicial de capital para Cuentas por Cobrar (Crédito)
  const [hasInitialCapitalDownPayment, setHasInitialCapitalDownPayment] = useState(false);
  const [initialCapitalBankId, setInitialCapitalBankId] = useState('');
  const [initialCapitalAmountUSD, setInitialCapitalAmountUSD] = useState('');
  const [initialCapitalAmountVES, setInitialCapitalAmountVES] = useState('');
  const [initialCapitalReference, setInitialCapitalReference] = useState('');

  // Step 3: Document Type & Emission
  const [documentType, setDocumentType] = useState<'FACTURA' | 'NOTA' | 'ESPERA'>('FACTURA');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [observations, setObservations] = useState('');

  // Print view state
  const [printDocument, setPrintDocument] = useState<{
    docType: 'FACTURA' | 'NOTA';
    correlative: string;
    date: string;
    client: { name: string; rif: string; address?: string; phone?: string };
    items: CartItem[];
    subtotalUSD: number;
    subtotalVES: number;
    totalUSD: number;
    totalVES: number;
    rate: number;
    paymentMethod: string;
  } | null>(null);

  // Fetch real products, customers, bank accounts, BCV rate, and next correlative from Supabase
  const loadSupabaseData = async () => {
    const ts = Date.now();
    const [dbProds, dbCusts, accountsRes, bcvRes] = await Promise.all([
      fetchProductsFromSupabase(),
      fetchCustomersFromSupabase(),
      authenticatedFetch(`/api/bank-accounts?t=${ts}`).then(async (r) => { 
        const json = await r.json(); 
        console.log('accountsRes:', json); 
        return json; 
      }).catch(async (e) => { 
        console.error('accountsRes error:', e); 
        return await fetchBankAccountsFromSupabase(); 
      }),
      fetch(`/api/bcv/rates?t=${ts}`).then(r => r.json()).catch(() => null)
    ]);

    if (bcvRes) {
      const rateVal = Number(bcvRes.appliedRate) || Number(bcvRes.usdRate) || Number(bcvRes.currentRate);
      if (rateVal && rateVal > 0) {
        setActiveRate(rateVal);
        setActiveExchangeRate(rateVal);
      }
    }

    setCatalog((dbProds || []).map(p => ({
        sku: p.sku,
        name: p.name,
        category: p.category || 'General',
        priceUSD: Number(p.price_usd) || 0,
        stock: Number(p.stock) || 0,
        image: p.image_url
      })));

    setCustomers((dbCusts || []).map(c => ({
        id: c.id,
        rif: c.doc_number,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address
      })));

    // Filter to only display Active accounts in Checkout Form Payment dropdowns
    let rawAccounts = accountsRes?.data || [];
    if (!rawAccounts || rawAccounts.length === 0) {
      const direct = await fetchBankAccountsFromSupabase();
      if (direct.success) {
        rawAccounts = direct.data;
      }
    }
    const activeAccs = (rawAccounts || []).filter((a: any) => a.status === 'Activo' || a.status === 'Habilitada' || !a.status);
    setDbAccounts(activeAccs);
    if (activeAccs.length > 0) {
      setInitialCapitalBankId(prev => prev || activeAccs[0].id);
      setCurrentPaymentMethod(prev => prev || activeAccs[0].id);
    }

    try {
      setInvoiceNumber(
        documentType === 'ESPERA' ? '' : await getNextDocumentNumber(documentType)
      );
    } catch (error) {
      setInvoiceNumber('');
      showToast(
        error instanceof Error ? error.message : 'No se pudo consultar el correlativo en Supabase.',
        'info'
      );
    }
  };

  const updateCorrelativeForDocType = async (type: 'FACTURA' | 'NOTA') => {
    try {
      setInvoiceNumber(await getNextDocumentNumber(type));
    } catch (error) {
      setInvoiceNumber('');
      showToast(
        error instanceof Error ? error.message : 'No se pudo consultar el correlativo en Supabase.',
        'info'
      );
    }
  };

  // Listen to rate changes and load real data from Supabase
  useEffect(() => {
    const handleRate = (e: Event) => {
      const customEvent = e as CustomEvent<{ rate: number }>;
      if (customEvent.detail?.rate) {
        setActiveRate(customEvent.detail.rate);
      }
    };
    window.addEventListener('frenyer:rate-changed', handleRate);

    loadSupabaseData();

    return () => window.removeEventListener('frenyer:rate-changed', handleRate);
  }, []);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Categories list
  const categories = ['Todas', ...Array.from(new Set(catalog.map(p => p.category)))];

  // Cart operations
  const addToCart = (product: PosProduct) => {
    if (product.stock <= 0) {
      setStockAlertModal({
        isOpen: true,
        productName: product.name,
        sku: product.sku,
        availableStock: product.stock,
        message: `El producto "${product.name}" (SKU: ${product.sku}) no cuenta con stock disponible en inventario. No es posible agregarlo ni venderlo.`
      });
      showToast(`⚠️ Producto sin stock: ${product.name}`, 'info');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.sku === product.sku);
      if (existing) {
        if (existing.quantity >= product.stock) {
          setStockAlertModal({
            isOpen: true,
            productName: product.name,
            sku: product.sku,
            availableStock: product.stock,
            message: `Alcanzaste el límite de stock disponible (${product.stock} unidades) para "${product.name}".`
          });
          showToast(`⚠️ Stock máximo alcanzado para ${product.name}`, 'info');
          return prev;
        }
        return prev.map(item =>
          item.sku === product.sku ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          id: product.sku,
          sku: product.sku,
          name: product.name,
          priceUSD: product.priceUSD,
          quantity: 1,
          stock: product.stock
        }
      ];
    });
  };

  const updateQuantity = (sku: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.sku === sku) {
            const currentQty = Number(item.quantity) || 1;
            const newQty = currentQty + delta;
            if (newQty > item.stock) {
              setStockAlertModal({
                isOpen: true,
                productName: item.name,
                sku: item.sku,
                availableStock: item.stock,
                message: `No se pueden agregar más unidades de "${item.name}". El stock máximo disponible en inventario es de ${item.stock} unidades.`
              });
              showToast(`⚠️ Stock insuficiente para ${item.name} (Disponible: ${item.stock})`, 'info');
              return item;
            }
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter(item => (Number(item.quantity) || 0) > 0)
    );
  };

  const setManualQuantity = (sku: string, rawVal: string) => {
    setCart(prev =>
      prev.map(item => {
        if (item.sku === sku) {
          if (rawVal === '') {
            return { ...item, quantity: '' as any };
          }
          const parsed = parseInt(rawVal, 10);
          if (isNaN(parsed)) {
            return item;
          }
          if (parsed <= 0) {
            return { ...item, quantity: 1 };
          }
          if (parsed > item.stock) {
            setStockAlertModal({
              isOpen: true,
              productName: item.name,
              sku: item.sku,
              availableStock: item.stock,
              message: `No se pueden colocar ${parsed} unidades de "${item.name}". El stock máximo disponible en inventario es de ${item.stock} unidades.`
            });
            showToast(`⚠️ Stock máximo alcanzado (${item.stock}) para ${item.name}`, 'info');
            return { ...item, quantity: item.stock };
          }
          return { ...item, quantity: parsed };
        }
        return item;
      })
    );
  };

  const handleQuantityBlur = (sku: string) => {
    setCart(prev =>
      prev.map(item => {
        if (item.sku === sku) {
          const qty = Number(item.quantity);
          if (!qty || isNaN(qty) || qty < 1) {
            return { ...item, quantity: 1 };
          }
          if (qty > item.stock) {
            return { ...item, quantity: item.stock };
          }
          return { ...item, quantity: Math.floor(qty) };
        }
        return item;
      })
    );
  };

  const removeFromCart = (sku: string) => {
    setCart(prev => prev.filter(item => item.sku !== sku));
  };

  const clearCart = () => {
    setCart([]);
  };

  // Add free item
  const handleAddFreeItem = (e: React.FormEvent) => {
    e.preventDefault();
    const price = parseFloat(freeItemPriceUSD);
    if (isNaN(price) || price <= 0) return;
    const qty = Math.max(1, parseInt(freeItemQuantity) || 1);

    const sku = `VL-${Date.now().toString().slice(-4)}`;
    const cleanName = freeItemName.trim() || 'Venta Libre';
    setCart(prev => [
      ...prev,
      {
        id: sku,
        sku,
        name: cleanName,
        priceUSD: price,
        quantity: qty,
        stock: 9999
      }
    ]);
    setIsFreeItemOpen(false);
    setFreeItemPriceUSD('');
    setFreeItemQuantity('1');
    showToast(`Ítem de venta libre agregado (${qty}x ${cleanName}).`);

    // Asegurar que el ítem de venta libre exista en el catálogo de Supabase si se factura
    createProductInSupabase({
      sku,
      name: cleanName,
      category: 'Venta Libre',
      cost_usd: 0,
      price_usd: price,
      stock: 9999,
      min_stock: 0,
      unit: 'unidad',
      status: 'Activo'
    }).catch(() => {});
  };

  // Subtotal calculations
  const rawSubtotalUSD = cart.reduce((sum, item) => sum + item.priceUSD * (Number(item.quantity) || 0), 0);
  const discountAmountUSD = rawSubtotalUSD * (discountPercent / 100);
  const taxableBaseUSD = Math.max(0, rawSubtotalUSD - discountAmountUSD);
  const taxAmountUSD = isTaxSubject ? taxableBaseUSD * 0.16 : 0;
  const igtfAmountUSD = isIgtfApplied ? taxableBaseUSD * 0.03 : 0;
  const grandTotalUSD = Math.round((taxableBaseUSD + taxAmountUSD + igtfAmountUSD) * 100) / 100;
  const grandTotalVES = convertUSDtoVES(grandTotalUSD, activeRate);

  // Initialize payment entry when entering step 2
  const startCheckout = () => {
    if (cart.length === 0) {
      showToast('El carrito está vacío. Agrega productos primero.', 'info');
      return;
    }

    // Normalize and validate that no item in cart exceeds available stock or is out of stock
    for (const item of cart) {
      const q = Math.max(1, Number(item.quantity) || 1);
      if (item.stock <= 0 || q > item.stock) {
        setStockAlertModal({
          isOpen: true,
          productName: item.name,
          sku: item.sku,
          availableStock: item.stock,
          message: `El producto "${item.name}" no cuenta con stock suficiente disponible (Solicitados: ${q}, Disponibles en inventario: ${item.stock}). Por favor ajusta el carrito antes de continuar.`
        });
        showToast(`⚠️ Producto sin stock suficiente: ${item.name}`, 'info');
        return;
      }
    }

    const defaultAccount = dbAccounts.length > 0 ? dbAccounts[0] : {
      id: 'ACC-CASH-DEFAULT',
      bank_name: 'Efectivo / Caja Mostrador',
      currency: 'USD'
    };

    setCurrentPaymentMethod(defaultAccount.id);
    const isUSDAccount = defaultAccount.currency === 'USD';
    setIsIgtfApplied(isUSDAccount);

    const calcTaxUSD = isTaxSubject ? taxableBaseUSD * 0.16 : 0;
    const calcIgtfUSD = isUSDAccount ? taxableBaseUSD * 0.03 : 0;
    const calcTotalUSD = Math.round((taxableBaseUSD + calcTaxUSD + calcIgtfUSD) * 100) / 100;
    const calcTotalVES = convertUSDtoVES(calcTotalUSD, activeRate);

    // Multi-abonos system: initialize payments as empty list of confirmed abonos
    setPayments([]);

    if (defaultAccount.currency === 'VES') {
      setCurrentPaymentAmountVES(calcTotalVES.toFixed(2));
      setCurrentPaymentAmountUSD(calcTotalUSD.toFixed(2));
    } else {
      setCurrentPaymentAmountUSD(calcTotalUSD.toFixed(2));
      setCurrentPaymentAmountVES(calcTotalVES.toFixed(2));
    }

    setCheckoutStep(1);
  };

  // Auto-recalculate payment amount when tax or IGTF toggles change
  const updatePaymentAmountsForTaxes = (newTaxSubject: boolean, newIgtfApplied: boolean, accOverride?: typeof dbAccounts[0]) => {
    const newTaxAmountUSD = newTaxSubject ? taxableBaseUSD * 0.16 : 0;
    const newIgtfAmountUSD = newIgtfApplied ? taxableBaseUSD * 0.03 : 0;
    const newGrandTotalUSD = Math.round((taxableBaseUSD + newTaxAmountUSD + newIgtfAmountUSD) * 100) / 100;

    const acc = accOverride || dbAccounts.find(a => a.id === currentPaymentMethod) || dbAccounts[0] || {
      id: 'ACC-CASH-DEFAULT',
      bank_name: 'Efectivo / Caja Mostrador',
      currency: 'USD'
    };
    const isVES = acc.currency === 'VES';

    // Calculate remaining difference after previously confirmed abonos
    const currentPaid = Math.round(payments.reduce((sum, p) => sum + p.amountUSD, 0) * 100) / 100;
    const newRemainingUSD = Math.max(0, Math.round((newGrandTotalUSD - currentPaid) * 100) / 100);
    const newRemainingVES = convertUSDtoVES(newRemainingUSD, activeRate);

    if (isVES) {
      setCurrentPaymentAmountVES(newRemainingVES.toFixed(2));
      setCurrentPaymentAmountUSD(newRemainingUSD.toFixed(2));
    } else {
      setCurrentPaymentAmountUSD(newRemainingUSD.toFixed(2));
      setCurrentPaymentAmountVES(newRemainingVES.toFixed(2));
    }
  };

  // Add multiple payment entry (Abonar a cuenta)
  const handleAddPayment = () => {
    const acc = dbAccounts.find(a => a.id === currentPaymentMethod) || {
      id: 'ACC-CASH-DEFAULT',
      bank_name: 'Efectivo / Caja Mostrador',
      currency: 'USD'
    };

    const isVES = acc.currency === 'VES';
    let amountUSD = 0;
    let amountVES = 0;

    if (isVES) {
      amountVES = parseFloat(currentPaymentAmountVES) || 0;
      if (amountVES <= 0 && parseFloat(currentPaymentAmountUSD) > 0) {
        amountVES = convertUSDtoVES(parseFloat(currentPaymentAmountUSD), activeRate);
      }
      if (isNaN(amountVES) || amountVES <= 0) {
        showToast('Ingrese un monto válido en Bolívares a abonar.', 'info');
        return;
      }
      amountUSD = Math.round((amountVES / activeRate) * 100) / 100;
      amountVES = Math.round(amountVES * 100) / 100;
    } else {
      amountUSD = parseFloat(currentPaymentAmountUSD) || 0;
      if (amountUSD <= 0 && parseFloat(currentPaymentAmountVES) > 0) {
        amountUSD = Math.round((parseFloat(currentPaymentAmountVES) / activeRate) * 100) / 100;
      }
      if (isNaN(amountUSD) || amountUSD <= 0) {
        showToast('Ingrese un monto válido en Dólares a abonar.', 'info');
        return;
      }
      amountUSD = Math.round(amountUSD * 100) / 100;
      amountVES = convertUSDtoVES(amountUSD, activeRate);
    }

    const currentTotalPaid = Math.round(payments.reduce((sum, p) => sum + p.amountUSD, 0) * 100) / 100;
    const currRemaining = Math.max(0, Math.round((grandTotalUSD - currentTotalPaid) * 100) / 100);

    if (currRemaining <= 0.001) {
      showToast('El monto total de la venta ya ha sido completado.', 'info');
      return;
    }

    // Limit to remaining difference if it exceeds it
    if (amountUSD > currRemaining + 0.05) {
      amountUSD = currRemaining;
      amountVES = isVES ? convertUSDtoVES(amountUSD, activeRate) : convertUSDtoVES(amountUSD, activeRate);
    }

    const newPayment: PaymentEntry = {
      id: `ABONO-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      method: `${acc.bank_name} (${acc.currency})`,
      amountUSD,
      amountVES,
      bank_account_id: acc.id
    };

    const nextPayments = [...payments, newPayment];
    setPayments(nextPayments);

    const newTotalPaid = Math.round((currentTotalPaid + amountUSD) * 100) / 100;
    const newRemainingUSD = Math.max(0, Math.round((grandTotalUSD - newTotalPaid) * 100) / 100);

    if (newRemainingUSD <= 0.01) {
      setCurrentPaymentAmountUSD('0.00');
      setCurrentPaymentAmountVES('0.00');
      showToast(`¡Abono de ${formatUSD(amountUSD)} registrado! Total cubierto al 100%.`);
    } else {
      // Calculate and prefill difference for the current/selected account
      const currentAcc = dbAccounts.find(a => a.id === currentPaymentMethod) || acc;
      if (currentAcc.currency === 'VES') {
        const nextVES = convertUSDtoVES(newRemainingUSD, activeRate);
        setCurrentPaymentAmountVES(nextVES.toFixed(2));
        setCurrentPaymentAmountUSD(newRemainingUSD.toFixed(2));
      } else {
        setCurrentPaymentAmountUSD(newRemainingUSD.toFixed(2));
        const nextVES = convertUSDtoVES(newRemainingUSD, activeRate);
        setCurrentPaymentAmountVES(nextVES.toFixed(2));
      }
      showToast(`Abono registrado (${formatUSD(amountUSD)}). Restante por distribuir: ${formatUSD(newRemainingUSD)}.`);
    }
  };

  const removePayment = (id: string) => {
    const nextPayments = payments.filter(p => p.id !== id);
    setPayments(nextPayments);

    const newTotalPaid = Math.round(nextPayments.reduce((sum, p) => sum + p.amountUSD, 0) * 100) / 100;
    const newRemainingUSD = Math.max(0, Math.round((grandTotalUSD - newTotalPaid) * 100) / 100);

    const acc = dbAccounts.find(a => a.id === currentPaymentMethod);
    if (acc?.currency === 'VES') {
      const nextVES = convertUSDtoVES(newRemainingUSD, activeRate);
      setCurrentPaymentAmountVES(nextVES.toFixed(2));
      setCurrentPaymentAmountUSD(newRemainingUSD.toFixed(2));
    } else {
      setCurrentPaymentAmountUSD(newRemainingUSD.toFixed(2));
      const nextVES = convertUSDtoVES(newRemainingUSD, activeRate);
      setCurrentPaymentAmountVES(nextVES.toFixed(2));
    }
    showToast('Abono eliminado. Saldo restante recalculado.');
  };

  const totalPaidUSD = Math.round(payments.reduce((sum, p) => sum + p.amountUSD, 0) * 100) / 100;
  const remainingUSD = Math.max(0, Math.round((grandTotalUSD - totalPaidUSD) * 100) / 100);

  // Park the invoice (Factura en espera)
  const handleParkInvoice = () => {
    if (cart.length === 0) return;

    const parked: ParkedInvoice = {
      id: `ESP-${Date.now().toString().slice(-4)}`,
      clientName,
      clientRif,
      clientPhone,
      clientAddress,
      items: [...cart],
      totalUSD: grandTotalUSD,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setParkedInvoices([parked, ...parkedInvoices]);
    setCart([]);
    setCheckoutStep(null);
    showToast(`Pedido de ${parked.clientName} colocado en espera (#${parked.id}).`);
  };

  // Restore parked invoice
  const handleRestoreParkedInvoice = (parked: ParkedInvoice) => {
    setCart(parked.items);
    setClientName(parked.clientName);
    setClientRif(parked.clientRif);
    if (parked.clientPhone) setClientPhone(parked.clientPhone);
    if (parked.clientAddress) setClientAddress(parked.clientAddress);
    setParkedInvoices(parkedInvoices.filter(p => p.id !== parked.id));
    setIsParkedModalOpen(false);
    showToast(`Pedido de ${parked.clientName} recuperado.`);
  };

  // Finalize Sale & Emit to Supabase
  const handleFinalizeSale = async () => {
    if (isSubmittingSale) return;
    setIsSubmittingSale(true);
    try {
      if (documentType === 'ESPERA') {
        handleParkInvoice();
        return;
      }

      // Double check stock for all cart items before proceeding
      for (const item of cart) {
        if (item.stock <= 0 || item.quantity > item.stock) {
          setStockAlertModal({
            isOpen: true,
            productName: item.name,
            sku: item.sku,
            availableStock: item.stock,
            message: `Atención: El producto "${item.name}" no tiene suficiente stock disponible (${item.quantity} solicitados, ${item.stock} disponibles). No se puede procesar la venta sin inventario.`
          });
          showToast(`⚠️ Venta cancelada: Producto sin stock (${item.name})`, 'info');
          setCheckoutStep(null);
          return;
        }
      }

      // Validation for credit sales (Accounts Receivable CxC)
      if (paymentType === 'CREDITO') {
        if (!clientName.trim() || clientName === 'Consumidor final') {
          showToast('Para ventas a crédito, debe ingresar un nombre de cliente real (no Consumidor Final).', 'info');
          setCheckoutStep(1); // Go back to Step 1 (Paso 1)
          return;
        }
        const cleanRif = clientRif.trim();
        if (!cleanRif) {
          showToast('Para ventas a crédito, se requiere una Cédula o RIF válido.', 'info');
          setCheckoutStep(1);
          return;
        }
        if (!clientPhone.trim()) {
          showToast('Se requiere un número de teléfono de contacto para registrar el crédito.', 'info');
          setCheckoutStep(1);
          return;
        }
        if (!clientAddress.trim()) {
          showToast('Se requiere una dirección física para respaldar el crédito.', 'info');
          setCheckoutStep(1);
          return;
        }
      }

      const docCorrelative = invoiceNumber.trim();
      if (!docCorrelative) {
        showToast('No se pudo obtener el correlativo de la venta desde Supabase.', 'info');
        return;
      }

      // Get the customer ID matching the clientRif
      const matchedCustomer = customers.find(c => c.rif === clientRif);
      const customerId = matchedCustomer?.id || undefined;

      // 1. Record Sale in Supabase live database
      const saleItemsPayload = cart.map(item => {
        const q = Math.max(1, Number(item.quantity) || 1);
        return {
          sku: item.sku,
          name: item.name,
          quantity: q,
          unit_price_usd: item.priceUSD,
          total_usd: item.priceUSD * q,
          total_ves: convertUSDtoVES(item.priceUSD * q, activeRate),
          sale_id: ''
        };
      });

      // Build paymentsPayload: for CONTADO use multi-abonos; for CREDITO use initial capital down payment if activated
      let paymentsPayload: Array<{
        method: string;
        amount_usd: number;
        amount_ves: number;
        exchange_rate: number;
        bank_account_id?: string | null;
        reference?: string | null;
      }> = [];

      let creditInitialAbonoUSD = 0;
      let creditInitialAbonoVES = 0;
      let targetBankForCredit: any = null;

      if (paymentType === 'CONTADO') {
        paymentsPayload = payments.map(p => ({
          method: p.method,
          amount_usd: p.amountUSD,
          amount_ves: p.amountVES,
          exchange_rate: activeRate,
          bank_account_id: p.bank_account_id || null,
          reference: docCorrelative
        }));
      } else if (paymentType === 'CREDITO' && hasInitialCapitalDownPayment) {
        targetBankForCredit = dbAccounts.find(a => a.id === (initialCapitalBankId || dbAccounts[0]?.id));
        const numUSD = parseFloat(initialCapitalAmountUSD) || 0;
        const numVES = parseFloat(initialCapitalAmountVES) || convertUSDtoVES(numUSD, activeRate);

        if (numUSD > grandTotalUSD + 0.01) {
          showToast(`El abono de capital ($${numUSD.toFixed(2)}) no puede exceder el total de la venta ($${grandTotalUSD.toFixed(2)}).`, 'info');
          return;
        }

        if (numUSD > 0) {
          creditInitialAbonoUSD = numUSD;
          creditInitialAbonoVES = numVES;
          paymentsPayload = [{
            method: targetBankForCredit ? `${targetBankForCredit.bank_name} (${targetBankForCredit.currency})` : 'Abono Inicial de Capital',
            amount_usd: numUSD,
            amount_ves: numVES,
            exchange_rate: activeRate,
            bank_account_id: targetBankForCredit?.id || null,
            reference: initialCapitalReference.trim() || docCorrelative
          }];
        }
      }

      const currentRateSource = localStorage.getItem('frenyer_bcv_rate_source') || 'BCV_DIRECT';
      const isFutureRateActive = localStorage.getItem('frenyer_bcv_is_future') === 'true';
      const rateValueDate = localStorage.getItem('frenyer_bcv_rate_date') || new Date().toISOString().split('T')[0];

      const saleResult = await recordSaleInSupabase(
        {
          customer_id: customerId,
          doc_type: documentType,
          doc_number: docCorrelative,
          status: 'COMPLETADA',
          payment_type: paymentType,
          exchange_rate: activeRate,
          is_future_rate: isFutureRateActive,
          rate_source: currentRateSource,
          rate_value_date: rateValueDate,
          subtotal_usd: rawSubtotalUSD,
          discount_usd: discountAmountUSD,
          tax_usd: taxAmountUSD,
          igtf_usd: igtfAmountUSD,
          total_usd: grandTotalUSD,
          total_ves: grandTotalVES,
          notes: observations
        },
        saleItemsPayload,
        paymentsPayload
      );

      if (!saleResult.success) {
        showToast(saleResult.error || 'No se pudo registrar la venta en Supabase.', 'info');
        return;
      }

      // 2. Adjust Bank Accounts and log Bank Movements for payments (CONTADO or CREDITO initial capital abono)
      const bankMovementErrors: string[] = [];
      if (paymentsPayload.length > 0) {
        for (const p of paymentsPayload) {
          let bankId = p.bank_account_id;
          // Si no tiene bank_account_id o es un placeholder genérico, resolver a la cuenta de efectivo o primera cuenta activa
          if (!bankId || bankId === 'ACC-CASH-DEFAULT') {
            const cashAcc = dbAccounts.find(a => a.account_type === 'Efectivo' || a.currency === 'USD' || a.bank_name.toLowerCase().includes('efectivo') || a.bank_name.toLowerCase().includes('caja')) || dbAccounts[0];
            if (cashAcc) bankId = cashAcc.id;
          }

          if (bankId) {
            const acc = dbAccounts.find(a => a.id === bankId);
            // If VES account, take original VES amount, else take USD amount
            const originalAmount = acc && acc.currency === 'VES' ? p.amount_ves : p.amount_usd;
            const concept = paymentType === 'CREDITO'
              ? `Abono de Capital inicial - Venta a Crédito ${docCorrelative} (${clientName})`
              : `Abono de Venta POS - ${docCorrelative} (${clientName})`;
            const movementRef = p.reference || docCorrelative;

            try {
              const response = await authenticatedFetch('/api/bank-movements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  bank_account_id: bankId,
                  type: 'ENTRADA',
                  concept,
                  reference: movementRef,
                  user_name: 'Cajero POS',
                  rate: activeRate,
                  commission: 0,
                  amount: originalAmount
                })
              });
              const result = await response.json();
              let createdMov = null;
              if (!response.ok || !result.success) {
                bankMovementErrors.push(result.error || 'No se pudo registrar un movimiento bancario.');
              } else {
                if (result.new_balance != null) {
                  setDbAccounts(prev => prev.map(a => a.id === bankId ? { ...a, balance: result.new_balance } : a));
                }
                if (result.data) createdMov = result.data;
              }
              if (!createdMov) {
                createdMov = {
                  id: 'mov-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                  bank_account_id: bankId,
                  type: 'ENTRADA',
                  concept,
                  reference: movementRef,
                  user_name: 'Cajero POS',
                  rate: activeRate,
                  commission: 0,
                  commission_type: 'Fija',
                  amount: originalAmount,
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
            } catch (error) {
              bankMovementErrors.push(error instanceof Error ? error.message : 'Error de conexión con movimientos bancarios.');
            }
          }
        }
        window.dispatchEvent(new CustomEvent('frenyer:bank-updated'));
      }

      // 2. Deduct inventory stocks locally in state
      setCatalog(prev =>
        prev.map(prod => {
          const cartItem = cart.find(ci => ci.sku === prod.sku);
          if (cartItem) {
            return { ...prod, stock: Math.max(0, prod.stock - cartItem.quantity) };
          }
          return prod;
        })
      );

      // 3. Set Print Document view
      const remainingCredUSD = Math.max(0, Math.round((grandTotalUSD - creditInitialAbonoUSD) * 100) / 100);
      const paymentMethodLabel = paymentType === 'CREDITO'
        ? (creditInitialAbonoUSD > 0
            ? `Crédito (CxC) con Abono Inicial de Capital: $${creditInitialAbonoUSD.toFixed(2)} (${targetBankForCredit?.bank_name || 'Cuenta Bancaria'}) · Saldo Restante CxC: $${remainingCredUSD.toFixed(2)}`
            : 'Cuenta por Cobrar (Crédito)')
        : payments.map(p => `${p.method} [$${p.amountUSD.toFixed(2)} / Bs.${p.amountVES.toFixed(2)}]`).join(' | ');

      setPrintDocument({
        docType: documentType,
        correlative: docCorrelative,
        date: new Date().toLocaleDateString('es-VE'),
        client: {
          name: clientName,
          rif: clientRif,
          address: clientAddress,
          phone: clientPhone
        },
        items: [...cart],
        subtotalUSD: rawSubtotalUSD,
        subtotalVES: convertUSDtoVES(rawSubtotalUSD, activeRate),
        totalUSD: grandTotalUSD,
        totalVES: grandTotalVES,
        rate: activeRate,
        paymentMethod: paymentMethodLabel
      });

      // Reset cart and checkout
      setCart([]);
      setCheckoutStep(null);
      setHasInitialCapitalDownPayment(false);
      setInitialCapitalAmountUSD('');
      setInitialCapitalAmountVES('');
      setInitialCapitalReference('');
      showToast(
        bankMovementErrors.length > 0
          ? `La venta se registró, pero falló un movimiento bancario: ${bankMovementErrors[0]}`
          : `${documentType === 'FACTURA' ? 'Factura' : 'Nota'} ${docCorrelative} emitida exitosamente.`,
        bankMovementErrors.length > 0 ? 'info' : undefined
      );

      // Reload database data (updates stocks, bank balances, and next invoice number in real time)
      await loadSupabaseData();
    } finally {
      setIsSubmittingSale(false);
    }
  };

  // Filtered Catalog
  const filteredProducts = catalog.filter(p => {
    const matchesSearch =
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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
            zIndex: 1100,
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

      {/* VIEW A: POS GRID & CART (when not in checkout stepper) */}
      {checkoutStep === null && (
        <>
          {/* Top Bar Header */}
          <div className="page-head" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'var(--brand-500)',
                  color: 'white',
                  display: 'grid',
                  placeItems: 'center'
                }}
              >
                <ShoppingCart size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                    VENTA FLASH
                  </h1>
                  <span
                    style={{
                      background: '#ecfdf5',
                      color: '#059669',
                      border: '1px solid #a7f3d0',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12
                    }}
                  >
                    CAJA ABIERTA (#77138)
                  </span>
                </div>
                <span className="muted small" style={{ fontSize: 12 }}>
                  Tasa del momento: <b>Bs. {activeRate.toFixed(2).replace('.', ',')} / 1 USD</b>
                </span>
              </div>
            </div>

            <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Facturas en espera button */}
              <Button
                style={{
                  background: '#fff',
                  color: 'var(--text)',
                  borderColor: 'var(--border)',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                onClick={() => setIsParkedModalOpen(true)}
              >
                <Clock size={14} style={{ color: 'var(--brand-500)' }} />
                FACTURAS EN ESPERA
                <span
                  style={{
                    background: 'var(--brand-500)',
                    color: 'white',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px'
                  }}
                >
                  {parkedInvoices.length}
                </span>
              </Button>

              <Button
                variant="primary"
                onClick={() => setIsFreeItemOpen(true)}
                style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Tag size={14} /> + Venta Libre
              </Button>
            </div>
          </div>

          {/* Main Layout Grid: Products on Left, Cart on Right */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }}>
            
            {/* LEFT COLUMN: Search, Categories & Product Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              {/* Search Bar */}
              <div className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Search size={18} style={{ color: '#94a3b8' }} />
                  <input
                    className="input"
                    style={{ border: 'none', boxShadow: 'none', padding: 0, height: 'auto', fontSize: 14 }}
                    placeholder="Buscar producto por SKU, Nombre o escanear Código de Barras..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* Category Pills */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      border: selectedCategory === cat ? '1px solid var(--brand-500)' : '1px solid var(--border)',
                      background: selectedCategory === cat ? 'var(--brand-500)' : '#fff',
                      color: selectedCategory === cat ? '#fff' : 'var(--text)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Product Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 12
                }}
              >
                {/* Venta Libre Quick Card */}
                <div
                  onClick={() => setIsFreeItemOpen(true)}
                  style={{
                    border: '1px dashed var(--brand-500)',
                    borderRadius: 12,
                    background: '#f8faff',
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 140,
                    cursor: 'pointer',
                    textAlign: 'center',
                    gap: 8,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ background: 'var(--brand-50)', color: 'var(--brand-700)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>
                    LIBRE
                  </span>
                  <Tag size={24} style={{ color: 'var(--brand-500)' }} />
                  <b style={{ fontSize: 12, color: 'var(--text)' }}>Venta Libre / Ítem Abierto</b>
                  <span className="muted small" style={{ fontSize: 11 }}>Precio al momento</span>
                </div>

                {filteredProducts.map(product => {
                  const priceVES = convertUSDtoVES(product.priceUSD, activeRate);
                  return (
                    <div
                      key={product.sku}
                      onClick={() => addToCart(product)}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        background: '#fff',
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: 140,
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <span className="muted small" style={{ fontSize: 10, fontWeight: 700 }}>
                            {product.sku}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: product.stock <= 0 ? '#dc2626' : product.stock <= 5 ? '#d97706' : '#059669',
                              background: product.stock <= 0 ? '#fee2e2' : product.stock <= 5 ? '#fef3c7' : '#ecfdf5',
                              padding: '2px 6px',
                              borderRadius: 6
                            }}
                          >
                            {product.stock <= 0 ? 'SIN STOCK' : `${product.stock} disp.`}
                          </span>
                        </div>

                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', lineHeight: 1.3, marginBottom: 8 }}>
                          {product.name}
                        </div>
                      </div>

                      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <b style={{ fontSize: 14, color: '#0f172a' }}>
                          Bs. {priceVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </b>
                        <span className="muted small" style={{ fontSize: 11 }}>
                          ${product.priceUSD.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT COLUMN: Cart Panel */}
            <div
              className="card"
              style={{
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                position: 'sticky',
                top: 16
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <b style={{ fontSize: 13, textTransform: 'uppercase', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShoppingCart size={15} /> Productos en la venta ({cart.length})
                </b>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Limpiar
                  </button>
                )}
              </div>

              {/* Client Bar in Cart */}
              <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                  <User size={15} style={{ color: 'var(--brand-600)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 12, color: '#1e293b', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {clientName}
                    </b>
                    <span className="muted small" style={{ fontSize: 10 }}>{clientRif}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenNewCustomerModal}
                  title="Registrar o asignar nuevo cliente"
                  style={{ background: 'transparent', border: 'none', color: 'var(--brand-600)', cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                >
                  <UserPlus size={13} /> + Nuevo
                </button>
              </div>

              {/* Items List */}
              <div style={{ minHeight: 220, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cart.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: '#94a3b8', textAlign: 'center', gap: 8 }}>
                    <ShoppingCart size={32} strokeWidth={1.5} />
                    <span style={{ fontSize: 12 }}>La venta está vacía.<br />Haz clic en los productos para agregarlos.</span>
                  </div>
                ) : (
                  cart.map(item => {
                    const itemQty = Number(item.quantity) || 0;
                    const itemTotalVES = convertUSDtoVES(item.priceUSD * itemQty, activeRate);
                    return (
                      <div
                        key={item.sku}
                        style={{
                          border: '1px solid #f1f5f9',
                          borderRadius: 8,
                          padding: '10px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: '#fafbfc'
                        }}
                      >
                        <div style={{ flex: 1, paddingRight: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                            {item.name}
                          </div>
                          <span className="muted small" style={{ fontSize: 10 }}>
                            ${item.priceUSD.toFixed(2)} c/u
                          </span>
                        </div>

                        {/* Stepper & Price */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 6, background: '#fff', overflow: 'hidden' }}>
                            <button
                              type="button"
                              title="Disminuir cantidad (-1)"
                              onClick={() => updateQuantity(item.sku, -1)}
                              style={{ width: 24, height: 26, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              max={item.stock}
                              value={item.quantity === ('' as any) ? '' : item.quantity}
                              onChange={(e) => setManualQuantity(item.sku, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              onBlur={() => handleQuantityBlur(item.sku)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              style={{
                                width: 44,
                                height: 26,
                                textAlign: 'center',
                                border: 'none',
                                borderLeft: '1px solid var(--border)',
                                borderRight: '1px solid var(--border)',
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#0f172a',
                                background: '#fff',
                                outline: 'none',
                                padding: 0
                              }}
                              title={`Stock disponible: ${item.stock}. Puedes escribir la cantidad deseada.`}
                            />
                            <button
                              type="button"
                              title="Aumentar cantidad (+1)"
                              onClick={() => updateQuantity(item.sku, 1)}
                              style={{ width: 24, height: 26, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              +
                            </button>
                          </div>

                          <div style={{ textAlign: 'right', minWidth: 65 }}>
                            <b style={{ fontSize: 12, color: '#0f172a', display: 'block' }}>
                              Bs. {itemTotalVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </b>
                            <span className="muted small" style={{ fontSize: 10 }}>
                              ${(item.priceUSD * itemQty).toFixed(2)}
                            </span>
                          </div>

                          <button
                            onClick={() => removeFromCart(item.sku)}
                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Cart Footer Summary */}
              {cart.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>MONTO PARCIAL:</span>
                    <div style={{ textAlign: 'right' }}>
                      <b style={{ fontSize: 18, color: 'var(--brand-700)', display: 'block' }}>
                        Bs. {grandTotalVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </b>
                      <span className="muted small" style={{ fontSize: 12, fontWeight: 700 }}>
                        {formatUSD(grandTotalUSD)}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    onClick={startCheckout}
                    style={{ width: '100%', height: 42, fontSize: 14, fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
                  >
                    <CreditCard size={16} /> COBRAR &gt;
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* VIEW B: 3-STEP CHECKOUT (Paso 1, Paso 2, Paso 3) */}
      {checkoutStep !== null && (
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          
          {/* Checkout Header Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <button
              onClick={() => {
                if (checkoutStep === 1) setCheckoutStep(null);
                else setCheckoutStep(checkoutStep - 1);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#475569',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={16} /> Volver a ventas directa
            </button>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8' }}>
              MÓDULO DE COBRANZA
            </span>
          </div>

          {/* Stepper Progress Indicator */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: checkoutStep >= 1 ? 'var(--brand-500)' : '#e2e8f0',
                  color: 'white',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {checkoutStep > 1 ? <Check size={14} /> : '1'}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: checkoutStep >= 1 ? 'var(--text)' : '#94a3b8' }}>
                Datos del Cliente
              </span>
            </div>

            <div style={{ width: 40, height: 2, background: checkoutStep >= 2 ? 'var(--brand-500)' : '#e2e8f0' }} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: checkoutStep >= 2 ? 'var(--brand-500)' : '#e2e8f0',
                  color: 'white',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {checkoutStep > 2 ? <Check size={14} /> : '2'}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: checkoutStep >= 2 ? 'var(--text)' : '#94a3b8' }}>
                Métodos de Pago
              </span>
            </div>

            <div style={{ width: 40, height: 2, background: checkoutStep >= 3 ? 'var(--brand-500)' : '#e2e8f0' }} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: checkoutStep >= 3 ? 'var(--brand-500)' : '#e2e8f0',
                  color: 'white',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                3
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: checkoutStep >= 3 ? 'var(--text)' : '#94a3b8' }}>
                Resumen y Emisión
              </span>
            </div>
          </div>

          {/* STEP 1: Datos del Cliente */}
          {checkoutStep === 1 && (
            <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Quick Customer Search Bar & Action Button */}
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={16} style={{ color: 'var(--brand-600)' }} /> Buscar cliente registrado
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                  <input
                    className="input"
                    placeholder="Buscar por Cédula, RIF, Nombre o Teléfono..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Suggestions Dropdown */}
              {isCustomerDropdownOpen && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: '#f8fafc', padding: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', padding: '2px 6px', textTransform: 'uppercase' }}>
                    Clientes registrados (haz clic para seleccionar):
                  </div>
                  {customers
                    .filter(c => customerSearch.trim() === '' || c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.rif.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone && c.phone.includes(customerSearch)))
                    .map((c, index) => (
                      <div
                        key={c.id || c.rif || index}
                        onClick={() => {
                          setClientRif(c.rif);
                          setClientName(c.name);
                          if (c.phone) setClientPhone(c.phone);
                          if (c.email) setClientEmail(c.email);
                          if (c.address) setClientAddress(c.address);
                          setCustomerSearch('');
                          setIsCustomerDropdownOpen(false);
                          showToast(`Cliente seleccionado: ${c.name}`);
                        }}
                        style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: '#fff', display: 'flex', justifyContent: 'space-between', fontSize: 12, border: '1px solid #f1f5f9' }}
                      >
                        <b>{c.name}</b>
                        <span className="muted small">{c.rif}</span>
                      </div>
                    ))}
                </div>
              )}

              {/* Customer Form Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Datos del Cliente para la Venta
                </span>
                <Button
                  onClick={handleOpenNewCustomerModal}
                  style={{ height: 26, fontSize: 11, background: 'var(--brand-500)', color: '#fff', borderColor: 'var(--brand-600)', padding: '0 12px' }}
                >
                  + Nuevo Cliente
                </Button>
              </div>

              {/* Customer Form Fields */}
              <div className="form-grid">
                <div className="field">
                  <label>Cédula / RIF *</label>
                  <input
                    className="input"
                    value={clientRif}
                    onChange={(e) => setClientRif(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label>Nombre / Razón Social *</label>
                  <input
                    className="input"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label>Teléfono (Opcional)</label>
                  <input
                    className="input"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="04125556677"
                  />
                </div>
                <div className="field">
                  <label>Correo Electrónico (Opcional)</label>
                  <input
                    className="input"
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="cliente@correo.com"
                  />
                </div>
              </div>

              <div className="field">
                <label>Dirección Fiscal (Opcional)</label>
                <input
                  className="input"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="Dirección del cliente"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <Button
                  variant="primary"
                  onClick={() => setCheckoutStep(2)}
                  style={{ fontWeight: 700, padding: '10px 24px' }}
                >
                  Confirmar Datos &gt;
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Métodos de Pago & Bimonetariedad */}
          {checkoutStep === 2 && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
              
              {/* Summary Left Box */}
              <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <b style={{ fontSize: 12, textTransform: 'uppercase', color: '#64748b' }}>
                  Resumen de la Venta
                </b>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Subtotal:</span>
                    <b>{formatUSD(rawSubtotalUSD)} <span className="muted small">({formatVES(convertUSDtoVES(rawSubtotalUSD, activeRate))})</span></b>
                  </div>
                  {discountPercent > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669' }}>
                      <span>Descuento ({discountPercent}%):</span>
                      <b>-{formatUSD(discountAmountUSD)}</b>
                    </div>
                  )}
                  {isTaxSubject && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">IVA (16%):</span>
                      <b>{formatUSD(taxAmountUSD)}</b>
                    </div>
                  )}
                  {isIgtfApplied && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">IGTF (3%):</span>
                      <b>{formatUSD(igtfAmountUSD)}</b>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <b style={{ fontSize: 14 }}>Total a pagar:</b>
                  <div style={{ textAlign: 'right' }}>
                    <b style={{ fontSize: 18, color: 'var(--brand-700)', display: 'block' }}>
                      {formatUSD(grandTotalUSD)}
                    </b>
                    <span className="muted small" style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
                      {formatVES(grandTotalVES)}
                    </span>
                  </div>
                </div>

                {/* Calculation Toggles */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
                    <span>Sujeto a IVA (16%)</span>
                    <input
                      type="checkbox"
                      checked={isTaxSubject}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsTaxSubject(checked);
                        updatePaymentAmountsForTaxes(checked, isIgtfApplied);
                      }}
                    />
                  </label>

                  {(() => {
                    const selectedAcc = dbAccounts.find(a => a.id === currentPaymentMethod);
                    const isUSDAccount = !selectedAcc || selectedAcc.currency === 'USD';

                    if (!isUSDAccount) {
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#94a3b8' }}>
                          <span>Aplicar IGTF (3%)</span>
                          <span style={{ fontStyle: 'italic', fontSize: 10, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>No aplica en pagos Bs.</span>
                        </div>
                      );
                    }

                    return (
                      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
                        <span>Aplicar IGTF (3%)</span>
                        <input
                          type="checkbox"
                          checked={isIgtfApplied}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setIsIgtfApplied(checked);
                            updatePaymentAmountsForTaxes(isTaxSubject, checked);
                          }}
                        />
                      </label>
                    );
                  })()}
                </div>
              </div>

              {/* Payments Configuration Right Box */}
              <div className="card" style={{ width: '600px', maxWidth: '100%', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* Contado vs Crédito Buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    onClick={() => setPaymentType('CONTADO')}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: paymentType === 'CONTADO' ? '2px solid var(--brand-500)' : '1px solid var(--border)',
                      background: paymentType === 'CONTADO' ? '#f0fdf4' : '#fff',
                      color: paymentType === 'CONTADO' ? '#166534' : '#475569',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    $ AL CONTADO
                  </button>
                  <button
                    onClick={() => setPaymentType('CREDITO')}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: paymentType === 'CREDITO' ? '2px solid var(--brand-500)' : '1px solid var(--border)',
                      background: paymentType === 'CREDITO' ? '#eef2ff' : '#fff',
                      color: paymentType === 'CREDITO' ? 'var(--brand-700)' : '#475569',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    📄 CRÉDITO (CxC)
                  </button>
                </div>

                {paymentType === 'CONTADO' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    
                    {/* Add Payment Method Line */}
                    <div style={{ border: '1px solid var(--border)', padding: 14, borderRadius: 8, background: '#fafbfc', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className="form-grid">
                        <div className="field">
                          <label>Cuenta Bancaria / Forma de Pago *</label>
                          {dbAccounts.length === 0 ? (
                            <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', padding: '10px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
                              ⚠️ No hay cuentas bancarias activas registradas en Supabase. Registre una en "Cuentas Bancarias".
                            </div>
                          ) : (
                            <select
                              className="input"
                              value={currentPaymentMethod}
                              onChange={(e) => {
                                const newId = e.target.value;
                                setCurrentPaymentMethod(newId);
                                const acc = dbAccounts.find(a => a.id === newId);
                                if (acc) {
                                  const isUSDAccount = acc.currency === 'USD';
                                  setIsIgtfApplied(isUSDAccount);
                                  // CRITICAL: Preserve all existing abonos in payments!
                                  // Calculate remaining difference for the selected account
                                  const currentPaid = Math.round(payments.reduce((sum, p) => sum + p.amountUSD, 0) * 100) / 100;
                                  const calcTax = isTaxSubject ? taxableBaseUSD * 0.16 : 0;
                                  const calcIgtf = isUSDAccount ? taxableBaseUSD * 0.03 : 0;
                                  const updatedGrandTotal = Math.round((taxableBaseUSD + calcTax + calcIgtf) * 100) / 100;
                                  const diffUSD = Math.max(0, Math.round((updatedGrandTotal - currentPaid) * 100) / 100);
                                  const diffVES = convertUSDtoVES(diffUSD, activeRate);

                                  if (acc.currency === 'VES') {
                                    setCurrentPaymentAmountVES(diffVES.toFixed(2));
                                    setCurrentPaymentAmountUSD(diffUSD.toFixed(2));
                                  } else {
                                    setCurrentPaymentAmountUSD(diffUSD.toFixed(2));
                                    setCurrentPaymentAmountVES(diffVES.toFixed(2));
                                  }
                                }
                              }}
                            >
                              {dbAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.bank_name} ({acc.currency}) - Saldo: {acc.currency === 'VES' ? formatVES(acc.balance) : formatUSD(acc.balance, '$ ')}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Currency-dependent input field */}
                        {(() => {
                          const currentAcc = dbAccounts.find(a => a.id === currentPaymentMethod);
                          const isVES = currentAcc?.currency === 'VES';
                          return isVES ? (
                            <div className="field">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label>Monto a transferir en Bolívares (Bs. VES) *</label>
                                {remainingUSD > 0.01 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const remVES = convertUSDtoVES(remainingUSD, activeRate);
                                      setCurrentPaymentAmountVES(remVES.toFixed(2));
                                      setCurrentPaymentAmountUSD(remainingUSD.toFixed(2));
                                    }}
                                    style={{ background: 'none', border: 'none', color: 'var(--brand-700)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                                  >
                                    Llenar restante (Bs. {convertUSDtoVES(remainingUSD, activeRate).toFixed(2)})
                                  </button>
                                )}
                              </div>
                              <input
                                className="input"
                                type="number"
                                step="0.01"
                                value={currentPaymentAmountVES}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCurrentPaymentAmountVES(val);
                                  const num = parseFloat(val) || 0;
                                  const calculatedUSD = Math.round((num / activeRate) * 100) / 100;
                                  setCurrentPaymentAmountUSD(calculatedUSD.toFixed(2));
                                }}
                                placeholder={convertUSDtoVES(remainingUSD, activeRate).toFixed(2)}
                              />
                            </div>
                          ) : (
                            <div className="field">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label>Monto a pagar en Dólares ($ USD) *</label>
                                {remainingUSD > 0.01 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCurrentPaymentAmountUSD(remainingUSD.toFixed(2));
                                      setCurrentPaymentAmountVES(convertUSDtoVES(remainingUSD, activeRate).toFixed(2));
                                    }}
                                    style={{ background: 'none', border: 'none', color: 'var(--brand-700)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                                  >
                                    Llenar restante ($ {remainingUSD.toFixed(2)})
                                  </button>
                                )}
                              </div>
                              <input
                                className="input"
                                type="number"
                                step="0.01"
                                value={currentPaymentAmountUSD}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCurrentPaymentAmountUSD(val);
                                  const num = parseFloat(val) || 0;
                                  const calculatedVES = convertUSDtoVES(num, activeRate);
                                  setCurrentPaymentAmountVES(calculatedVES.toFixed(2));
                                }}
                                placeholder={remainingUSD.toString()}
                              />
                            </div>
                          );
                        })()}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {(() => {
                          const currentAcc = dbAccounts.find(a => a.id === currentPaymentMethod);
                          const isVES = currentAcc?.currency === 'VES';
                          return (
                            <span className="muted small">
                              {isVES ? (
                                <>Equivale a: <b>{formatUSD(parseFloat(currentPaymentAmountUSD) || 0, '$')}</b> (Tasa oficial BCV: Bs. {activeRate.toFixed(2)})</>
                              ) : (
                                <>Equivale a: <b>{formatVES(convertUSDtoVES(parseFloat(currentPaymentAmountUSD) || 0, activeRate))}</b></>
                              )}
                            </span>
                          );
                        })()}
                        <Button
                          onClick={handleAddPayment}
                          style={{ background: '#fff', fontSize: 11, fontWeight: 700 }}
                        >
                          + Abonar a cuenta
                        </Button>
                      </div>
                    </div>

                    {/* Recorded Payments List (Multi-abonos) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {payments.length === 0 ? (
                        <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, padding: '12px 14px', fontSize: 11, color: '#64748b', textAlign: 'center' }}>
                          💡 <b>Sistema Multi-Abonos:</b> Ingrese el monto y presione <b>+ Abonar a cuenta</b> para registrar un pago. Puede dividir el total en diferentes cuentas bancarias (USD / VES) hasta completarlo.
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                            <span>Abonos Registrados ({payments.length})</span>
                            <span style={{ color: '#059669' }}>Total Abonado: {formatUSD(totalPaidUSD)}</span>
                          </div>
                          {payments.map((p, idx) => (
                            <div
                              key={p.id}
                              style={{
                                border: '1px solid #e2e8f0',
                                borderRadius: 6,
                                padding: '8px 12px',
                                background: '#fff',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: 12
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ background: '#f1f5f9', color: '#475569', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>
                                  #{idx + 1}
                                </span>
                                <div>
                                  <b>{p.method}</b>
                                  <span className="muted small" style={{ display: 'block' }}>
                                    Abono: {p.method.includes('VES') ? formatVES(p.amountVES) : formatUSD(p.amountUSD, '$')}
                                  </span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ textAlign: 'right' }}>
                                  <b>{formatUSD(p.amountUSD)}</b>
                                  <span className="muted small" style={{ display: 'block', fontSize: 10 }}>
                                    {formatVES(p.amountVES)}
                                  </span>
                                </div>
                                <button
                                  onClick={() => removePayment(p.id)}
                                  style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                                  title="Eliminar este abono"
                                >
                                  <X size={15} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>

                    {/* Distribution Badge */}
                    <div
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        background: remainingUSD <= 0.01 ? '#ecfdf5' : '#fffbeb',
                        border: remainingUSD <= 0.01 ? '1px solid #a7f3d0' : '1px solid #fde68a',
                        color: remainingUSD <= 0.01 ? '#065f46' : '#92400e',
                        fontSize: 12,
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {remainingUSD <= 0.01 ? (
                          <>
                            <CheckCircle size={16} /> ¡Monto total distribuido perfectamente! ({formatUSD(totalPaidUSD)} de {formatUSD(grandTotalUSD)})
                          </>
                        ) : (
                          <>
                            <AlertCircle size={16} /> Restante por distribuir: {formatUSD(remainingUSD)} ({formatVES(convertUSDtoVES(remainingUSD, activeRate))})
                          </>
                        )}
                      </div>
                      {remainingUSD > 0.01 && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309' }}>
                          Abonado: {formatUSD(totalPaidUSD)} / {formatUSD(grandTotalUSD)}
                        </span>
                      )}
                    </div>

                  </div>
                ) : (
                  /* CRÉDITO (CxC) SECTION */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(() => {
                      const isCustomerValid = 
                        Boolean(clientName && clientName.trim() !== '' && clientName.trim() !== 'Consumidor final') &&
                        Boolean(clientRif && clientRif.trim() !== '') &&
                        Boolean(clientPhone && clientPhone.trim() !== '') &&
                        Boolean(clientAddress && clientAddress.trim() !== '');

                      return isCustomerValid ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* 1. Resumen del Cliente Deudor */}
                          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <b style={{ fontSize: 13, color: '#1e293b' }}>Autorización de Cuenta por Cobrar (CxC)</b>
                              <Badge tone="brand">Crédito Comercial</Badge>
                            </div>
                            <div style={{ fontSize: 12, color: '#334155', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                              <div>
                                <span className="muted small" style={{ display: 'block' }}>Cliente Deudor:</span>
                                <b>{clientName}</b>
                              </div>
                              <div>
                                <span className="muted small" style={{ display: 'block' }}>Cédula / RIF:</span>
                                <b>{clientRif}</b>
                              </div>
                              <div>
                                <span className="muted small" style={{ display: 'block' }}>Teléfono:</span>
                                <span>{clientPhone}</span>
                              </div>
                              <div>
                                <span className="muted small" style={{ display: 'block' }}>Dirección:</span>
                                <span>{clientAddress}</span>
                              </div>
                            </div>
                          </div>

                          {/* 2. Sección: ¿El cliente desea abonar algo de capital inicial? */}
                          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input
                                  type="checkbox"
                                  checked={hasInitialCapitalDownPayment}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setHasInitialCapitalDownPayment(checked);
                                    if (checked) {
                                      if (!initialCapitalBankId && dbAccounts.length > 0) {
                                        setInitialCapitalBankId(dbAccounts[0].id);
                                      }
                                    } else {
                                      setInitialCapitalAmountUSD('');
                                      setInitialCapitalAmountVES('');
                                      setInitialCapitalReference('');
                                    }
                                  }}
                                  style={{ width: 18, height: 18, accentColor: 'var(--brand-600)', cursor: 'pointer' }}
                                />
                                <div>
                                  <b style={{ fontSize: 13, color: '#0f172a' }}>¿El cliente desea abonar algo de capital inicial?</b>
                                  <span className="muted small" style={{ display: 'block', fontSize: 11, color: '#64748b' }}>
                                    El abono se cargará directamente a una cuenta bancaria existente y el saldo restante quedará en Cuenta por Cobrar.
                                  </span>
                                </div>
                              </div>
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: hasInitialCapitalDownPayment ? '#ecfdf5' : '#f1f5f9',
                                color: hasInitialCapitalDownPayment ? '#047857' : '#64748b',
                                border: hasInitialCapitalDownPayment ? '1px solid #a7f3d0' : '1px solid #e2e8f0'
                              }}>
                                {hasInitialCapitalDownPayment ? 'Abono Activado' : 'Sin Abono Inicial'}
                              </span>
                            </label>

                            {hasInitialCapitalDownPayment && (
                              <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {/* Selector de Cuenta Bancaria Existente */}
                                <div className="field">
                                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                                    Cuenta Bancaria de Destino (donde ingresa el capital abonado) *
                                  </label>
                                  {dbAccounts.length === 0 ? (
                                    <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', padding: '8px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                                      ⚠️ No hay cuentas bancarias activas registradas. Vaya a "Cuentas Bancarias" para registrar una.
                                    </div>
                                  ) : (
                                    <select
                                      className="input"
                                      value={initialCapitalBankId || (dbAccounts[0]?.id || '')}
                                      onChange={(e) => {
                                        const newId = e.target.value;
                                        setInitialCapitalBankId(newId);
                                        const acc = dbAccounts.find(a => a.id === newId);
                                        if (acc) {
                                          const curUSD = parseFloat(initialCapitalAmountUSD) || 0;
                                          if (curUSD > 0) {
                                            if (acc.currency === 'VES') {
                                              setInitialCapitalAmountVES(convertUSDtoVES(curUSD, activeRate).toFixed(2));
                                            } else {
                                              setInitialCapitalAmountUSD(curUSD.toFixed(2));
                                            }
                                          }
                                        }
                                      }}
                                    >
                                      {dbAccounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>
                                          {acc.bank_name} ({acc.currency}) — Saldo actual: {acc.currency === 'VES' ? formatVES(acc.balance) : formatUSD(acc.balance, '$ ')}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>

                                {/* Monto a Abonar (Bimonetario según la moneda de la cuenta bancaria seleccionada) */}
                                {(() => {
                                  const curAcc = dbAccounts.find(a => a.id === (initialCapitalBankId || dbAccounts[0]?.id));
                                  const isVES = curAcc?.currency === 'VES';
                                  const numUSD = parseFloat(initialCapitalAmountUSD) || 0;
                                  const isExceeding = numUSD > grandTotalUSD + 0.01;

                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                      <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        {isVES ? (
                                          <>
                                            <div className="field">
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <label style={{ fontSize: 12, fontWeight: 700 }}>Monto a Abonar en Bolívares (Bs. VES) *</label>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const maxVES = convertUSDtoVES(grandTotalUSD, activeRate);
                                                    setInitialCapitalAmountVES(maxVES.toFixed(2));
                                                    setInitialCapitalAmountUSD(grandTotalUSD.toFixed(2));
                                                  }}
                                                  style={{ background: 'none', border: 'none', color: 'var(--brand-700)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                                                >
                                                  Total (Bs. {convertUSDtoVES(grandTotalUSD, activeRate).toFixed(2)})
                                                </button>
                                              </div>
                                              <input
                                                className="input"
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={initialCapitalAmountVES}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  setInitialCapitalAmountVES(val);
                                                  const n = parseFloat(val) || 0;
                                                  const calcUSD = Math.round((n / activeRate) * 100) / 100;
                                                  setInitialCapitalAmountUSD(calcUSD.toFixed(2));
                                                }}
                                              />
                                              <span className="muted small" style={{ fontSize: 11, marginTop: 2 }}>
                                                Equivale a: <b>${numUSD.toFixed(2)} USD</b> (Tasa oficial BCV: Bs. {activeRate.toFixed(2)})
                                              </span>
                                            </div>

                                            <div className="field">
                                              <label style={{ fontSize: 12, fontWeight: 700 }}>Equivalente en Dólares ($ USD)</label>
                                              <input
                                                className="input"
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={initialCapitalAmountUSD}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  setInitialCapitalAmountUSD(val);
                                                  const n = parseFloat(val) || 0;
                                                  const calcVES = convertUSDtoVES(n, activeRate);
                                                  setInitialCapitalAmountVES(calcVES.toFixed(2));
                                                }}
                                              />
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <div className="field">
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <label style={{ fontSize: 12, fontWeight: 700 }}>Monto a Abonar en Dólares ($ USD) *</label>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setInitialCapitalAmountUSD(grandTotalUSD.toFixed(2));
                                                    setInitialCapitalAmountVES(convertUSDtoVES(grandTotalUSD, activeRate).toFixed(2));
                                                  }}
                                                  style={{ background: 'none', border: 'none', color: 'var(--brand-700)', fontSize: 11, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                                                >
                                                  Total (${grandTotalUSD.toFixed(2)})
                                                </button>
                                              </div>
                                              <input
                                                className="input"
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={initialCapitalAmountUSD}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  setInitialCapitalAmountUSD(val);
                                                  const n = parseFloat(val) || 0;
                                                  const calcVES = convertUSDtoVES(n, activeRate);
                                                  setInitialCapitalAmountVES(calcVES.toFixed(2));
                                                }}
                                              />
                                              <span className="muted small" style={{ fontSize: 11, marginTop: 2 }}>
                                                Equivale a: <b>Bs. {convertUSDtoVES(numUSD, activeRate).toFixed(2)}</b>
                                              </span>
                                            </div>

                                            <div className="field">
                                              <label style={{ fontSize: 12, fontWeight: 700 }}>Equivalente en Bolívares (Bs. VES)</label>
                                              <input
                                                className="input"
                                                type="number"
                                                step="0.01"
                                                placeholder="0.00"
                                                value={initialCapitalAmountVES}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  setInitialCapitalAmountVES(val);
                                                  const n = parseFloat(val) || 0;
                                                  const calcUSD = Math.round((n / activeRate) * 100) / 100;
                                                  setInitialCapitalAmountUSD(calcUSD.toFixed(2));
                                                }}
                                              />
                                            </div>
                                          </>
                                        )}
                                      </div>

                                      {/* Atajos rápidos de porcentaje */}
                                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Atajos de abono:</span>
                                        {[0.25, 0.5, 0.75].map(pct => {
                                          const amt = Math.round(grandTotalUSD * pct * 100) / 100;
                                          return (
                                            <button
                                              key={pct}
                                              type="button"
                                              onClick={() => {
                                                setInitialCapitalAmountUSD(amt.toFixed(2));
                                                setInitialCapitalAmountVES(convertUSDtoVES(amt, activeRate).toFixed(2));
                                              }}
                                              style={{
                                                background: '#f1f5f9',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: 4,
                                                padding: '2px 8px',
                                                fontSize: 11,
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                color: '#334155'
                                              }}
                                            >
                                              {pct * 100}% (${amt.toFixed(2)})
                                            </button>
                                          );
                                        })}
                                      </div>

                                      {/* Referencia bancaria opcional */}
                                      <div className="field">
                                        <label style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                                          Referencia Bancaria / N° de Operación (Opcional)
                                        </label>
                                        <input
                                          className="input"
                                          placeholder="Ej: 054129 o REF-ABONO"
                                          value={initialCapitalReference}
                                          onChange={(e) => setInitialCapitalReference(e.target.value)}
                                        />
                                      </div>

                                      {/* Advertencia si supera el total */}
                                      {isExceeding && (
                                        <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', padding: '8px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                                          ⚠️ El abono (${numUSD.toFixed(2)}) no puede exceder el total a pagar de la venta (${grandTotalUSD.toFixed(2)}).
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>

                          {/* 3. Resumen del Crédito y Abono */}
                          {(() => {
                            const abonoUSD = hasInitialCapitalDownPayment ? (parseFloat(initialCapitalAmountUSD) || 0) : 0;
                            const abonoVES = convertUSDtoVES(abonoUSD, activeRate);
                            const remUSD = Math.max(0, Math.round((grandTotalUSD - abonoUSD) * 100) / 100);
                            const remVES = convertUSDtoVES(remUSD, activeRate);
                            const targetBank = dbAccounts.find(a => a.id === (initialCapitalBankId || dbAccounts[0]?.id));

                            return (
                              <div style={{ fontSize: 12, color: '#1e293b', background: hasInitialCapitalDownPayment && abonoUSD > 0 ? '#f0fdf4' : '#eef2ff', padding: 12, borderRadius: 6, border: hasInitialCapitalDownPayment && abonoUSD > 0 ? '1px solid #bbf7d0' : '1px solid #c7d2fe', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 600, color: '#475569' }}>Total de la Venta:</span>
                                  <b>{formatUSD(grandTotalUSD)} <span className="muted small">({formatVES(grandTotalVES)})</span></b>
                                </div>
                                {hasInitialCapitalDownPayment && abonoUSD > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#059669' }}>
                                    <span>Abono de Capital inicial a cargar en {targetBank ? `${targetBank.bank_name} (${targetBank.currency})` : 'cuenta bancaria'}:</span>
                                    <b>-{formatUSD(abonoUSD)} <span className="muted small">(-{formatVES(abonoVES)})</span></b>
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed #cbd5e1', paddingTop: 6, fontSize: 13, fontWeight: 800 }}>
                                  <span style={{ color: remUSD > 0 ? '#1e293b' : '#059669' }}>Saldo Restante en Cuenta por Cobrar (CxC):</span>
                                  <span style={{ color: remUSD > 0 ? 'var(--brand-700)' : '#059669' }}>
                                    {formatUSD(remUSD)} <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>({formatVES(remVES)})</span>
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                                  {remUSD > 0 ? (
                                    <>
                                      El saldo restante de <b>{formatUSD(remUSD)}</b> quedará registrado en <b>Cuentas por Cobrar</b> con estado <b>{abonoUSD > 0 ? 'PARCIAL' : 'PENDIENTE'}</b>. Al cobrar en Bolívares se liquidará a la tasa oficial BCV del día del cobro.
                                    </>
                                  ) : (
                                    <b style={{ color: '#15803d' }}>
                                      ✓ El abono cubre el total de la venta. Se asentará la CxC con saldo $0.00 y estado PAGADA.
                                    </b>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#991b1b' }}>
                            <AlertCircle size={18} />
                            <b style={{ fontSize: 13 }}>Datos Requeridos Incompletos para Venta a Crédito</b>
                          </div>
                          <p style={{ margin: 0, fontSize: 12, color: '#7f1d1d', lineHeight: 1.5 }}>
                            Para emitir una venta a crédito y asentar la Cuenta por Cobrar (CxC), el cliente debe contar con información legal completa: <b>Nombre real</b> (no Consumidor Final), <b>Cédula o RIF válido</b>, <b>Teléfono de contacto</b> y <b>Dirección fiscal/física</b>.
                          </p>
                          <button
                            type="button"
                            onClick={() => setCheckoutStep(1)}
                            className="button"
                            style={{ height: 34, padding: '0 14px', borderRadius: 6, background: '#dc2626', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, width: 'fit-content', cursor: 'pointer' }}
                          >
                            ← Ir al Paso 1 para Completar Datos del Cliente
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                  <Button
                    style={{ background: '#fff' }}
                    onClick={() => setCheckoutStep(1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (paymentType === 'CONTADO') {
                        let finalPayments = [...payments];

                        // Si no hay ningún abono guardado previamente, usar la cuenta seleccionada para registrar el pago completo
                        if (finalPayments.length === 0 && currentPaymentMethod) {
                          const acc = dbAccounts.find(a => a.id === currentPaymentMethod);
                          const isVES = acc?.currency === 'VES';
                          const numVES = parseFloat(currentPaymentAmountVES) || 0;
                          const numUSD = parseFloat(currentPaymentAmountUSD) || 0;

                          const pUSD = isVES
                            ? (numVES > 0 ? Math.round((numVES / activeRate) * 100) / 100 : grandTotalUSD)
                            : (numUSD > 0 ? numUSD : grandTotalUSD);
                          const pVES = isVES ? (numVES > 0 ? numVES : convertUSDtoVES(pUSD, activeRate)) : convertUSDtoVES(pUSD, activeRate);

                          const singlePayment: PaymentEntry = {
                            id: `ABONO-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                            method: acc ? `${acc.bank_name} (${acc.currency})` : 'Efectivo / Caja Mostrador (USD)',
                            amountUSD: pUSD,
                            amountVES: pVES,
                            bank_account_id: acc?.id || 'ACC-CASH-DEFAULT'
                          };
                          finalPayments = [singlePayment];
                          setPayments(finalPayments);
                        }

                        const currentTotalPaid = Math.round(finalPayments.reduce((sum, p) => sum + p.amountUSD, 0) * 100) / 100;
                        const currRemaining = Math.max(0, Math.round((grandTotalUSD - currentTotalPaid) * 100) / 100);

                        // Si aún queda una diferencia por cubrir
                        if (currRemaining > 0.05) {
                          const acc = dbAccounts.find(a => a.id === currentPaymentMethod);
                          const isVES = acc?.currency === 'VES';
                          const enteredUSD = isVES
                            ? (parseFloat(currentPaymentAmountVES) ? Math.round((parseFloat(currentPaymentAmountVES) / activeRate) * 100) / 100 : 0)
                            : (parseFloat(currentPaymentAmountUSD) || 0);

                          // Si el monto en pantalla corresponde a la diferencia restante, abonarlo automáticamente y continuar
                          if (Math.abs(enteredUSD - currRemaining) <= 0.05 && enteredUSD > 0) {
                            const autoPayment: PaymentEntry = {
                              id: `ABONO-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                              method: acc ? `${acc.bank_name} (${acc.currency})` : 'Cuenta Bancaria',
                              amountUSD: currRemaining,
                              amountVES: isVES ? convertUSDtoVES(currRemaining, activeRate) : convertUSDtoVES(currRemaining, activeRate),
                              bank_account_id: acc?.id || 'ACC-CASH-DEFAULT'
                            };
                            finalPayments = [...finalPayments, autoPayment];
                            setPayments(finalPayments);
                          } else {
                            showToast(`Falta cubrir ${formatUSD(currRemaining)} del total. Añada el abono restante con "+ Abonar a cuenta" o seleccione Crédito.`, 'info');
                            return;
                          }
                        }
                      } else if (paymentType === 'CREDITO') {
                        // Validaciones de abono inicial de capital en Crédito
                        if (hasInitialCapitalDownPayment) {
                          const numUSD = parseFloat(initialCapitalAmountUSD) || 0;
                          if (numUSD <= 0) {
                            showToast('Por favor ingrese el monto a abonar de capital o desactive la casilla de abono.', 'info');
                            return;
                          }
                          if (numUSD > grandTotalUSD + 0.01) {
                            showToast(`El abono ($${numUSD.toFixed(2)}) no puede exceder el total a pagar ($${grandTotalUSD.toFixed(2)}).`, 'info');
                            return;
                          }
                        }
                      }
                      setCheckoutStep(3);
                      updateCorrelativeForDocType(documentType === 'ESPERA' ? 'FACTURA' : documentType);
                    }}
                    disabled={
                      paymentType === 'CONTADO' 
                        ? (payments.length === 0 && (!currentPaymentMethod || (parseFloat(currentPaymentAmountUSD) <= 0 && parseFloat(currentPaymentAmountVES) <= 0)))
                        : !(
                            clientName && clientName.trim() !== '' && clientName.trim() !== 'Consumidor final' &&
                            clientRif && clientRif.trim() !== '' &&
                            clientPhone && clientPhone.trim() !== '' &&
                            clientAddress && clientAddress.trim() !== '' &&
                            (!hasInitialCapitalDownPayment || ((parseFloat(initialCapitalAmountUSD) || 0) > 0 && (parseFloat(initialCapitalAmountUSD) || 0) <= grandTotalUSD + 0.01))
                          )
                    }
                  >
                    Siguiente &gt;
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Resumen y Emisión del Documento (Matching Image 6 layout) */}
          {checkoutStep === 3 && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
              
              {/* LEFT COLUMN: RESUMEN DE COMPRA (List of items in the sale) */}
              <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <b style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>
                  RESUMEN DE COMPRA
                </b>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto' }}>
                  {cart.map(item => {
                    const itemTotalVES = convertUSDtoVES(item.priceUSD * item.quantity, activeRate);
                    return (
                      <div
                        key={item.sku}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '10px 12px',
                          background: '#fafbfc',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>
                            {item.name}
                          </div>
                          <span className="muted small" style={{ fontSize: 11 }}>
                            ${item.priceUSD.toFixed(2)} × {item.quantity}
                          </span>
                          <span className="muted small" style={{ display: 'block', fontSize: 10, color: '#059669' }}>
                            ≈ {formatVES(itemTotalVES)}
                          </span>
                        </div>

                        <span
                          style={{
                            background: '#e2e8f0',
                            color: '#334155',
                            fontSize: 11,
                            fontWeight: 800,
                            padding: '4px 8px',
                            borderRadius: 6
                          }}
                        >
                          X{item.quantity}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 11, color: '#64748b' }}>
                  <span><b>Cliente:</b> {clientName} ({clientRif})</span>
                </div>
              </div>

              {/* RIGHT COLUMN: TIPO DE COMPROBANTE & FINANCIAL SUMMARY */}
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* Header & Badges */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', margin: 0 }}>
                    TIPO DE COMPROBANTE FISCAL / DOCUMENTO
                  </label>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-700)', background: '#f4f8ff', padding: '3px 8px', borderRadius: 6 }}>
                    {documentType === 'FACTURA' ? 'Emisión de Factura Fiscal' : documentType === 'NOTA' ? 'Emisión de Nota de Entrega' : 'Pausar en Espera'}
                  </span>
                </div>

                {/* Option 3 buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <div
                    onClick={() => {
                      setDocumentType('FACTURA');
                      updateCorrelativeForDocType('FACTURA');
                    }}
                    style={{
                      border: documentType === 'FACTURA' ? '2px solid #0a2540' : '1px solid var(--border)',
                      padding: 10,
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: documentType === 'FACTURA' ? '#0a2540' : '#fff',
                      color: documentType === 'FACTURA' ? '#fff' : '#1e293b',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FileText size={18} />
                    <b style={{ fontSize: 12 }}>FACTURA</b>
                  </div>

                  <div
                    onClick={() => {
                      setDocumentType('NOTA');
                      updateCorrelativeForDocType('NOTA');
                    }}
                    style={{
                      border: documentType === 'NOTA' ? '2px solid #059669' : '1px solid var(--border)',
                      padding: 10,
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: documentType === 'NOTA' ? '#059669' : '#fff',
                      color: documentType === 'NOTA' ? '#fff' : '#1e293b',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FileText size={18} />
                    <b style={{ fontSize: 12 }}>NOTA</b>
                  </div>

                  <div
                    onClick={() => setDocumentType('ESPERA')}
                    style={{
                      border: documentType === 'ESPERA' ? '2px solid #f59e0b' : '1px solid var(--border)',
                      padding: 10,
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: documentType === 'ESPERA' ? '#f59e0b' : '#fff',
                      color: documentType === 'ESPERA' ? '#fff' : '#1e293b',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Clock size={18} />
                    <b style={{ fontSize: 12 }}>ESPERA</b>
                  </div>
                </div>

                {/* Form fields: Fecha & Número */}
                {documentType !== 'ESPERA' && (
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="field">
                      <label style={{ fontSize: 11, fontWeight: 600 }}>FECHA</label>
                      <input className="input" value={new Date().toLocaleDateString('es-VE')} disabled />
                    </div>
                    <div className="field">
                      <label style={{ fontSize: 11, fontWeight: 600 }}>{documentType === 'FACTURA' ? 'NÚMERO DE FACTURA' : 'NÚMERO DE NOTA'}</label>
                      <input
                        className="input"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Detailed financial breakdown as in Image 6 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Subtotal:</span>
                    <b>{formatUSD(rawSubtotalUSD)} <span className="muted small">({formatVES(convertUSDtoVES(rawSubtotalUSD, activeRate))})</span></b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669' }}>
                    <span>Descuento:</span>
                    <b>-{formatUSD(discountAmountUSD)} <span className="muted small">({formatVES(convertUSDtoVES(discountAmountUSD, activeRate))})</span></b>
                  </div>
                  {isTaxSubject && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">IVA (16%):</span>
                      <b>{formatUSD(taxAmountUSD)} <span className="muted small">({formatVES(convertUSDtoVES(taxAmountUSD, activeRate))})</span></b>
                    </div>
                  )}
                  {isIgtfApplied && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">IGTF (3%):</span>
                      <b>{formatUSD(igtfAmountUSD)} <span className="muted small">({formatVES(convertUSDtoVES(igtfAmountUSD, activeRate))})</span></b>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Exento (0%):</span>
                    <b>$0.00 (Bs. 0,00)</b>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 900, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                    <span style={{ color: 'var(--brand-700)' }}>Total a pagar:</span>
                    <span style={{ color: 'var(--brand-700)' }}>
                      {formatUSD(grandTotalUSD)} <span style={{ fontSize: 13 }}>({formatVES(grandTotalVES)})</span>
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Total pagado / abonado:</span>
                    <b>
                      {formatUSD(
                        paymentType === 'CONTADO'
                          ? totalPaidUSD
                          : (hasInitialCapitalDownPayment ? (parseFloat(initialCapitalAmountUSD) || 0) : 0)
                      )}
                    </b>
                  </div>

                  {paymentType === 'CONTADO' && payments.length > 0 && (
                    <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#475569' }}>
                        <span>Abonos asignados:</span>
                        <span>{payments.length} {payments.length === 1 ? 'cuenta' : 'cuentas'}</span>
                      </div>
                      {payments.map((p, idx) => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#334155' }}>
                          <span>#{idx + 1} {p.method}</span>
                          <b>{formatUSD(p.amountUSD)} <span className="muted small">({formatVES(p.amountVES)})</span></b>
                        </div>
                      ))}
                    </div>
                  )}

                  {paymentType === 'CREDITO' && (
                    <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 6, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, fontSize: 11 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#334155' }}>
                        <span>Modalidad de Cobro:</span>
                        <span style={{ color: 'var(--brand-700)' }}>Crédito (Cuenta por Cobrar)</span>
                      </div>
                      {hasInitialCapitalDownPayment && (parseFloat(initialCapitalAmountUSD) || 0) > 0 ? (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669' }}>
                            <span>Abono de Capital inicial:</span>
                            <b>{formatUSD(parseFloat(initialCapitalAmountUSD) || 0)}</b>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                            <span>Cuenta bancaria destino:</span>
                            <span>{dbAccounts.find(a => a.id === (initialCapitalBankId || dbAccounts[0]?.id))?.bank_name || 'Cuenta Bancaria'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: 4, fontWeight: 800 }}>
                            <span>Saldo Restante en CxC:</span>
                            <span style={{ color: (grandTotalUSD - (parseFloat(initialCapitalAmountUSD) || 0)) > 0 ? 'var(--brand-700)' : '#059669' }}>
                              {formatUSD(Math.max(0, grandTotalUSD - (parseFloat(initialCapitalAmountUSD) || 0)))}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                          <span>Saldo en CxC (100%):</span>
                          <b>{formatUSD(grandTotalUSD)} (PENDIENTE)</b>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 700 }}>
                    <span>Vuelto:</span>
                    <span>$0.00 (Bs. 0,00)</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <Button
                    style={{ background: '#fff' }}
                    onClick={() => setCheckoutStep(2)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleFinalizeSale}
                    disabled={isSubmittingSale}
                    style={{
                      fontWeight: 700,
                      padding: '10px 24px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      opacity: isSubmittingSale ? 0.7 : 1,
                      cursor: isSubmittingSale ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {isSubmittingSale ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" /> PROCESANDO...
                      </>
                    ) : documentType === 'ESPERA' ? (
                      <>
                        <Clock size={16} /> GUARDAR EN ESPERA
                      </>
                    ) : (
                      <>
                        <Printer size={16} /> FINALIZAR E IMPRIMIR
                      </>
                    )}
                  </Button>
                </div>

              </div>
            </div>
          )}

        </div>
      )}

      {/* MODAL: FACTURAS EN ESPERA (Parked Invoices Drawer) */}
      {isParkedModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(3px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1100,
            padding: 16
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 550,
              padding: 24,
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              background: '#fff'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0a2540' }}>
                  Facturas y Pedidos en Espera
                </h3>
                <span className="muted small">
                  Selecciona una orden en espera para restaurar los productos al carrito.
                </span>
              </div>
              <button
                onClick={() => setIsParkedModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#9aa0ad', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {parkedInvoices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
                <Clock size={36} strokeWidth={1.5} style={{ marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: 13 }}>No hay facturas pausadas en este momento.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflowY: 'auto' }}>
                {parkedInvoices.map(parked => (
                  <div
                    key={parked.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 12,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: '#fafbfc'
                    }}
                  >
                    <div>
                      <b style={{ fontSize: 13, color: '#0f172a' }}>{parked.clientName}</b>
                      <span className="muted small" style={{ display: 'block', fontSize: 11 }}>
                        {parked.items.length} productos · Creado a las {parked.createdAt}
                      </span>
                      <b style={{ fontSize: 12, color: 'var(--brand-700)' }}>
                        {formatUSD(parked.totalUSD)} · {formatVES(convertUSDtoVES(parked.totalUSD, activeRate))}
                      </b>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button
                        variant="primary"
                        onClick={() => handleRestoreParkedInvoice(parked)}
                        style={{ fontSize: 11, padding: '6px 12px' }}
                      >
                        Enganchar / Cobrar
                      </Button>
                      <button
                        onClick={() => setParkedInvoices(parkedInvoices.filter(p => p.id !== parked.id))}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Venta Libre / Ítem Abierto */}
      {isFreeItemOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(3px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1100,
            padding: 16
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 400, padding: 24, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Venta Libre / Ítem Abierto</h3>
              <span className="muted small">Agrega un servicio o producto no catalogado.</span>
            </div>

            <form onSubmit={handleAddFreeItem} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Descripción del Ítem</label>
                <input
                  className="input"
                  value={freeItemName}
                  onChange={(e) => setFreeItemName(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label>Precio en Dólares ($ USD) *</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={freeItemPriceUSD}
                  onChange={(e) => setFreeItemPriceUSD(e.target.value)}
                  placeholder="0.00"
                  required
                />
                <span className="muted small" style={{ color: '#059669', fontSize: 11, marginTop: 4, display: 'block' }}>
                  ≈ {formatVES(convertUSDtoVES(parseFloat(freeItemPriceUSD) || 0, activeRate))}
                </span>
              </div>

              <div className="field">
                <label>Cantidad *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setFreeItemQuantity(prev => Math.max(1, (parseInt(prev) || 1) - 1).toString())}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      fontSize: 18,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#475569'
                    }}
                    title="Disminuir cantidad (-1)"
                  >
                    -
                  </button>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    value={freeItemQuantity}
                    onChange={(e) => setFreeItemQuantity(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="1"
                    required
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 15,
                      height: 38
                    }}
                    title="Ingresa la cantidad manualmente"
                  />
                  <button
                    type="button"
                    onClick={() => setFreeItemQuantity(prev => ((parseInt(prev) || 0) + 1).toString())}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      fontSize: 18,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#475569'
                    }}
                    title="Aumentar cantidad (+1)"
                  >
                    +
                  </button>
                </div>
                <span className="muted small" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                  Puedes escribir la cantidad directamente o usar los botones - / +.
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <Button
                  type="button"
                  style={{ background: '#fff' }}
                  onClick={() => setIsFreeItemOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary">
                  Agregar a Venta
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT VIEW / TICKET DIGITAL EXACTO (Image 1) */}
      {printDocument && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1200,
            padding: 16,
            overflowY: 'auto'
          }}
        >
          <div
            style={{
              background: '#fff',
              width: '100%',
              maxWidth: 680,
              padding: '36px 40px',
              borderRadius: 8,
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              color: '#0f172a'
            }}
          >
            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 14, marginBottom: 20 }}>
              <span className="muted small" style={{ fontWeight: 700 }}>
                VISTA PREVIA DE IMPRESIÓN
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="primary"
                  onClick={() => window.print()}
                  style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Printer size={14} /> Imprimir Comprobante
                </Button>
                <Button
                  style={{ background: '#fff', fontSize: 12 }}
                  onClick={() => setPrintDocument(null)}
                >
                  Cerrar
                </Button>
              </div>
            </div>

            {/* Document Header */}
            {(() => {
              const business = getBusinessProfile();
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: 12, marginBottom: 16 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: 'var(--brand-700)' }}>
                      {business.businessName}
                    </h2>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                      {printDocument.docType === 'FACTURA' ? 'FACTURA DE VENTA' : 'NOTA DE ENTREGA'}: {printDocument.correlative}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: '#475569', lineHeight: 1.4 }}>
                    <b>RIF:</b> {business.rif}<br />
                    {business.address ? <>{business.address}<br /></> : null}
                    <b>Telf:</b> {business.phone}
                  </div>
                </div>
              );
            })()}

            {/* Client Info Grid as in Image 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 18, fontSize: 11 }}>
              <div>
                <span className="muted" style={{ display: 'block', fontSize: 10 }}>CLIENTE</span>
                <b>{printDocument.client.name}</b>
                <span className="muted" style={{ display: 'block', marginTop: 6, fontSize: 10 }}>DIRECCIÓN</span>
                <span>{printDocument.client.address || '—'}</span>
              </div>
              <div>
                <span className="muted" style={{ display: 'block', fontSize: 10 }}>C.I. / RIF</span>
                <b>{printDocument.client.rif}</b>
                <span className="muted" style={{ display: 'block', marginTop: 6, fontSize: 10 }}>MÉTODO DE PAGO</span>
                <span>{printDocument.paymentMethod}</span>
              </div>
            </div>

            {/* Items Table as in Image 1 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 18 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ padding: '6px 4px' }}>CANT</th>
                  <th style={{ padding: '6px 4px' }}>DESCRIPCIÓN</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>PRECIO USD</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>TOTAL USD</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>PRECIO BS</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>TOTAL BS</th>
                </tr>
              </thead>
              <tbody>
                {printDocument.items.map(item => {
                  const pVES = convertUSDtoVES(item.priceUSD, printDocument.rate);
                  const tUSD = item.priceUSD * item.quantity;
                  const tVES = convertUSDtoVES(tUSD, printDocument.rate);
                  return (
                    <tr key={item.sku} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 4px' }}>{item.quantity}</td>
                      <td style={{ padding: '8px 4px' }}>
                        <b>{item.name}</b> <span className="muted small">({item.sku})</span>
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right' }}>${item.priceUSD.toFixed(2)}</td>
                      <td style={{ padding: '8px 4px', textAlign: 'right' }}>${tUSD.toFixed(2)}</td>
                      <td style={{ padding: '8px 4px', textAlign: 'right' }}>Bs. {pVES.toFixed(2)}</td>
                      <td style={{ padding: '8px 4px', textAlign: 'right' }}><b>Bs. {tVES.toFixed(2)}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals Box as in Image 1 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, borderTop: '2px solid #0f172a', paddingTop: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: 280, fontSize: 12 }}>
                <span className="muted">Subtotal:</span>
                <b>${printDocument.subtotalUSD.toFixed(2)} &nbsp;·&nbsp; Bs. {printDocument.subtotalVES.toFixed(2)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: 280, fontSize: 14, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
                <span>TOTAL A PAGAR:</span>
                <span>${printDocument.totalUSD.toFixed(2)} &nbsp;·&nbsp; Bs. {printDocument.totalVES.toFixed(2)}</span>
              </div>
            </div>

            {/* Rate Badge banner as in Image 1 */}
            <div
              style={{
                border: '1px solid #93c5fd',
                background: '#eff6ff',
                color: '#1e40af',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 11,
                textAlign: 'center',
                fontWeight: 600,
                marginBottom: 16
              }}
            >
              Tasa BCV Aplicada: 1 USD = Bs. {printDocument.rate.toFixed(2).replace('.', ',')}
            </div>

            <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>
              *** GRACIAS POR SU COMPRA ***<br />
              Este documento es una representación digital del comprobante de venta emitido por {getBusinessProfile().businessName}.
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR NUEVO CLIENTE (DESDE VENTAS FLASH) */}
      {isNewCustomerModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(3px)',
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
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              background: '#fff',
              borderRadius: 12
            }}
          >
            {/* Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                color: 'white',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={18} style={{ color: '#ddd6fe' }} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  REGISTRAR NUEVO CLIENTE
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewCustomerModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#ddd6fe', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveNewCustomer} style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                  NOMBRE COMPLETO / RAZÓN SOCIAL *
                </label>
                <input
                  className="input"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="Ej: Inversiones Pérez C.A., María Gómez"
                  required
                  autoFocus
                />
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                    TIPO IDENTIFICACIÓN *
                  </label>
                  <select
                    className="input"
                    value={newCustomerDocType}
                    onChange={(e) => setNewCustomerDocType(e.target.value)}
                  >
                    <option value="Natural (V / E)">Natural (V / E)</option>
                    <option value="Jurídico (J)">Jurídico (J)</option>
                    <option value="Gubernamental (G)">Gubernamental (G)</option>
                    <option value="Pasaporte (P)">Pasaporte (P)</option>
                  </select>
                </div>

                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                    CÉDULA O RIF *
                  </label>
                  <input
                    className="input"
                    value={newCustomerDocNumber}
                    onChange={(e) => setNewCustomerDocNumber(e.target.value)}
                    placeholder="Ej: V-12345678 o J-314569..."
                    required
                  />
                </div>
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                    TELÉFONO
                  </label>
                  <input
                    className="input"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="Ej: 0412-1234567"
                  />
                </div>

                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                    LÍMITE CRÉDITO ($)
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={newCustomerCreditLimit}
                    onChange={(e) => setNewCustomerCreditLimit(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                  CORREO ELECTRÓNICO
                </label>
                <input
                  className="input"
                  type="email"
                  value={newCustomerEmail}
                  onChange={(e) => setNewCustomerEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                />
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                  DIRECCIÓN FISCAL / ENTREGA
                </label>
                <input
                  className="input"
                  value={newCustomerAddress}
                  onChange={(e) => setNewCustomerAddress(e.target.value)}
                  placeholder="Av. Principal, Edificio, Local, Ciudad..."
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setIsNewCustomerModalOpen(false)}
                  style={{
                    height: 38,
                    padding: '0 16px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    background: 'white',
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={isSavingCustomer}
                  style={{
                    height: 38,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    border: 'none',
                    fontWeight: 700
                  }}
                >
                  {isSavingCustomer ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Guardar y Asignar a la Venta</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Ventana Emergente: Alerta Producto sin Stock */}
      {stockAlertModal.isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999999, // Increased z-index
            backgroundColor: 'rgba(0, 0, 0, 0.6)', // Darker backdrop
            backdropFilter: 'blur(8px)', // More blur
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => setStockAlertModal(prev => ({ ...prev, isOpen: false }))}
        >
          <div
            style={{
              backgroundColor: 'white',
              border: '2px solid #ef4444',
              borderRadius: 20,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              width: '100%',
              maxWidth: 400,
              padding: 32,
              overflow: 'hidden',
              position: 'relative',
              animation: 'fadeIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header decorativo rojo */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 16,
                borderBottom: '1px solid var(--border, #f1f5f9)',
                marginBottom: 16
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    color: '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#dc2626' }}>
                    Producto sin stock
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted, #64748b)' }}>
                    Alerta de Control de Inventario
                  </p>
                </div>
              </div>

              <button
                onClick={() => setStockAlertModal(prev => ({ ...prev, isOpen: false }))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted, #94a3b8)',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Contenido de la alerta */}
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--fg, #0f172a)', marginBottom: 4 }}>
                {stockAlertModal.productName || 'Producto no disponible'}
              </div>
              {stockAlertModal.sku && (
                <div style={{ fontSize: '0.82rem', color: 'var(--muted, #64748b)', marginBottom: 10 }}>
                  Código SKU: <span style={{ fontWeight: 600 }}>{stockAlertModal.sku}</span>
                </div>
              )}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.85rem',
                  color: '#dc2626',
                  fontWeight: 700,
                  backgroundColor: '#fee2e2',
                  padding: '4px 10px',
                  borderRadius: 20
                }}
              >
                Stock Disponible: {stockAlertModal.availableStock} unidades
              </div>
            </div>

            <p style={{ fontSize: '0.92rem', color: 'var(--fg, #334155)', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              {stockAlertModal.message ||
                'No es posible realizar la venta de este producto porque no cuenta con existencia disponible en el inventario.'}
            </p>

            {/* Footer con botón principal */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button
                variant="primary"
                style={{
                  backgroundColor: '#dc2626',
                  borderColor: '#dc2626',
                  color: '#ffffff',
                  minWidth: 130,
                  fontWeight: 700,
                  height: 40,
                  fontSize: '0.9rem',
                  borderRadius: 10
                }}
                onClick={() => setStockAlertModal(prev => ({ ...prev, isOpen: false }))}
              >
                Entendido
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
