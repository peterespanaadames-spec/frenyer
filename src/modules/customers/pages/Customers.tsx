import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Plus,
  Search,
  RefreshCw,
  Printer,
  Download,
  UserCheck,
  UserX,
  Users,
  X,
  Edit2,
  Trash2,
  Phone,
  Mail,
  MapPin,
  History,
  CheckCircle,
  ShoppingBag,
  Package,
  DollarSign,
  Calendar,
  ExternalLink
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { getActiveExchangeRate, convertUSDtoVES, formatVES } from '../../../lib/currency';
import {
  fetchCustomersFromSupabase,
  createCustomerInSupabase,
  updateCustomerInSupabase,
  deleteCustomerFromSupabase,
  DbCustomer
} from '../../../lib/supabase/db';
import { supabase } from '../../../lib/supabase/client';

interface CustomerOrder {
  id: string;
  doc_number: string;
  doc_type: string;
  created_at: string;
  total_usd: number;
  status: string;
}

interface TopProduct {
  name: string;
  sku: string;
  total_qty: number;
  total_spent: number;
}

export function Customers() {
  const [customers, setCustomers] = useState<DbCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Activo' | 'Inactivo'>('Todos');
  const [activeRate] = useState(() => getActiveExchangeRate());
  const [toast, setToast] = useState<string | null>(null);

  // Modal State for New/Edit Client
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [docTypeInput, setDocTypeInput] = useState('Natural (V / E)');
  const [docNumberInput, setDocNumberInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [creditLimitInput, setCreditLimitInput] = useState('0');
  const [addressInput, setAddressInput] = useState('');

  // Client Details Drawer & Real-Time Stats
  const [selectedClient, setSelectedClient] = useState<DbCustomer | null>(null);
  const [clientOrders, setClientOrders] = useState<CustomerOrder[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Load Real Data from Supabase
  const loadCustomers = async () => {
    setIsLoading(true);
    const data = await fetchCustomersFromSupabase();
    setCustomers(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  // When selectedClient changes, fetch real-time orders & top purchased products from Supabase
  useEffect(() => {
    if (!selectedClient) {
      setClientOrders([]);
      setTopProducts([]);
      return;
    }

    const fetchClientAnalytics = async () => {
      setIsLoadingDetails(true);
      try {
        // 1. Fetch real sales/orders for this customer
        const { data: salesData, error: salesError } = await supabase
          .from('sales')
          .select('id, doc_number, doc_type, created_at, total_usd, status')
          .eq('customer_id', selectedClient.id)
          .order('created_at', { ascending: false });

        if (salesError) {
          console.warn('Error fetching client sales:', salesError.message);
          setClientOrders([]);
          setTopProducts([]);
          setIsLoadingDetails(false);
          return;
        }

        const rawSales = salesData || [];
        // Deduplicate sales by composite key (doc_number + doc_type + total_usd) to prevent duplicate records
        const uniqueSalesMap = new Map<string, CustomerOrder>();
        for (const s of rawSales) {
          const key = `${s.doc_number || ''}-${s.doc_type || ''}-${s.total_usd || 0}`;
          if (!uniqueSalesMap.has(key)) {
            uniqueSalesMap.set(key, s);
          }
        }
        const ordersList: CustomerOrder[] = Array.from(uniqueSalesMap.values());
        setClientOrders(ordersList);

        // 2. Fetch sale items for these orders to calculate top purchased products
        if (ordersList.length > 0) {
          const saleIds = ordersList.map(o => o.id);
          const { data: itemsData, error: itemsError } = await supabase
            .from('sale_items')
            .select('sku, name, quantity, total_usd')
            .in('sale_id', saleIds);

          if (!itemsError && itemsData && itemsData.length > 0) {
            // Aggregate by SKU / Product Name
            const productMap: Record<string, { name: string; sku: string; total_qty: number; total_spent: number }> = {};
            
            for (const item of itemsData) {
              const key = item.sku || item.name;
              if (!productMap[key]) {
                productMap[key] = {
                  name: item.name || 'Producto',
                  sku: item.sku || 'S/N',
                  total_qty: 0,
                  total_spent: 0
                };
              }
              productMap[key].total_qty += Number(item.quantity) || 1;
              productMap[key].total_spent += Number(item.total_usd) || 0;
            }

            const sortedProducts = Object.values(productMap).sort((a, b) => b.total_qty - a.total_qty);
            setTopProducts(sortedProducts);
          } else {
            setTopProducts([]);
          }
        } else {
          setTopProducts([]);
        }
      } catch (err) {
        console.error('Error in fetchClientAnalytics:', err);
      } finally {
        setIsLoadingDetails(false);
      }
    };

    fetchClientAnalytics();
  }, [selectedClient]);

  // KPIs
  const activeCount = customers.filter(c => c.status === 'Activo').length;
  const inactiveCount = customers.filter(c => c.status === 'Inactivo').length;
  const totalCount = customers.length;

  // Filtered List
  const filteredCustomers = customers.filter(c => {
    const query = searchTerm.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(query) ||
      (c.doc_number && c.doc_number.toLowerCase().includes(query)) ||
      (c.code && c.code.toLowerCase().includes(query)) ||
      (c.phone && c.phone.toLowerCase().includes(query)) ||
      (c.email && c.email.toLowerCase().includes(query));
    const matchesStatus = statusFilter === 'Todos' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Open creation modal
  const handleOpenNewModal = () => {
    setEditingId(null);
    setNameInput('');
    setDocTypeInput('Natural (V / E)');
    setDocNumberInput('');
    setPhoneInput('');
    setEmailInput('');
    setCreditLimitInput('0');
    setAddressInput('');
    setIsModalOpen(true);
  };

  // Open edit modal
  const handleOpenEditModal = (c: DbCustomer) => {
    setEditingId(c.id);
    setNameInput(c.name);
    setDocTypeInput(c.doc_type || 'Natural (V / E)');
    setDocNumberInput(c.doc_number || '');
    setPhoneInput(c.phone || '');
    setEmailInput(c.email || '');
    setCreditLimitInput((c.credit_limit || 0).toString());
    setAddressInput(c.address || '');
    setIsModalOpen(true);
  };

  // Save/Update Client to Supabase
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setIsSaving(true);

    if (editingId) {
      const success = await updateCustomerInSupabase(editingId, {
        name: nameInput.trim(),
        doc_type: docTypeInput,
        doc_number: docNumberInput.trim(),
        phone: phoneInput.trim(),
        email: emailInput.trim(),
        credit_limit: parseFloat(creditLimitInput) || 0,
        address: addressInput.trim()
      });

      if (success) {
        showToast(`Cliente ${nameInput} actualizado correctamente.`);
        await loadCustomers();
      } else {
        showToast('Error al actualizar en la base de datos.');
      }
    } else {
      const nextNum = customers.length + 1;
      const created = await createCustomerInSupabase({
        code: `CLI-${nextNum.toString().padStart(4, '0')}`,
        name: nameInput.trim(),
        doc_type: docTypeInput,
        doc_number: docNumberInput.trim(),
        phone: phoneInput.trim(),
        email: emailInput.trim(),
        credit_limit: parseFloat(creditLimitInput) || 0,
        address: addressInput.trim(),
        status: 'Activo',
        orders_count: 0,
        total_spent_usd: 0,
        last_order_date: '—'
      });

      if (created) {
        showToast(`Cliente ${created.name} registrado exitosamente.`);
        await loadCustomers();
      } else {
        showToast('Error al registrar cliente.');
      }
    }

    setIsSaving(false);
    setIsModalOpen(false);
  };

  // Toggle status
  const handleToggleStatus = async (client: DbCustomer) => {
    const newStatus = client.status === 'Activo' ? 'Inactivo' : 'Activo';
    const success = await updateCustomerInSupabase(client.id, { status: newStatus });
    if (success) {
      showToast(`Estado cambiado a ${newStatus}.`);
      await loadCustomers();
    }
  };

  // Delete
  const handleDeleteCustomer = async (id: string) => {
    const success = await deleteCustomerFromSupabase(id);
    if (success) {
      if (selectedClient?.id === id) setSelectedClient(null);
      showToast('Cliente eliminado correctamente.');
      await loadCustomers();
    }
  };

  // Export to Excel / CSV
  const handleExportCSV = () => {
    const dataForExport = filteredCustomers.map(c => ({
      'ID / Código': c.code || c.id,
      'Documento': c.doc_number,
      'Nombre / Razón Social': c.name,
      'Tipo': c.doc_type,
      'Teléfono': c.phone || '—',
      'Correo': c.email || '—',
      'Límite Crédito (USD)': c.credit_limit || 0,
      'Dirección': c.address || '—',
      'Estado': c.status,
      'Órdenes': c.orders_count || 0,
      'Total Gastado (USD)': Number(c.total_spent_usd) || 0,
      'Total Gastado (VES)': convertUSDtoVES(Number(c.total_spent_usd) || 0, activeRate),
      'Última Orden': c.last_order_date || '—'
    }));

    const ws = XLSX.utils.json_to_sheet(dataForExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, 'directorio_clientes_Frenyer.xlsx');
    showToast('Archivo Excel de clientes descargado.');
  };

  return (
    <div className="content" style={{ paddingBottom: 40 }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            background: '#059669',
            color: 'white',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1200,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <CheckCircle size={16} />
          {toast}
        </div>
      )}

      {/* TOP 3 KPI CARDS */}
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        
        {/* Card 1: Clientes Activos */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #10b981' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#059669', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              CLIENTES ACTIVOS:
            </span>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
              {activeCount}
            </div>
            <span className="muted small" style={{ fontSize: 11 }}>
              Con compras o interacción en los últimos 90 días
            </span>
          </div>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#ecfdf5', color: '#059669', display: 'grid', placeItems: 'center' }}>
            <UserCheck size={22} />
          </div>
        </div>

        {/* Card 2: Clientes Inactivos */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid #f43f5e' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#e11d48', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f43f5e', display: 'inline-block' }} />
              CLIENTES INACTIVOS:
            </span>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
              {inactiveCount}
            </div>
            <span className="muted small" style={{ fontSize: 11 }}>
              Sin actividad reciente o sin compras registradas
            </span>
          </div>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fff1f2', color: '#e11d48', display: 'grid', placeItems: 'center' }}>
            <UserX size={22} />
          </div>
        </div>

        {/* Card 3: Clientes Totales */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid var(--brand-500)' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand-700)', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-500)', display: 'inline-block' }} />
              CLIENTES TOTALES:
            </span>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
              {totalCount}
            </div>
            <span className="muted small" style={{ fontSize: 11 }}>
              Directorio general y cartera de clientes
            </span>
          </div>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f4f8ff', color: 'var(--brand-700)', display: 'grid', placeItems: 'center' }}>
            <Users size={22} />
          </div>
        </div>

      </div>

      {/* TABLE CARD & TOOLBAR */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        
        {/* Toolbar Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          
          {/* Search Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', minWidth: 320, flex: 1, maxWidth: 440 }}>
            <Search size={16} style={{ color: '#94a3b8' }} />
            <input
              style={{ border: 'none', outline: 'none', padding: '8px 0', fontSize: 13, width: '100%' }}
              placeholder="Buscar por nombre, cédula/RIF, código, teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            
            {/* Filter */}
            <select
              className="input"
              style={{ height: 36, fontSize: 12, width: 'auto', fontWeight: 600 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="Todos">Todos los estados</option>
              <option value="Activo">Solo Activos</option>
              <option value="Inactivo">Solo Inactivos</option>
            </select>

            <button
              onClick={loadCustomers}
              title="Actualizar lista de clientes"
              style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: '#64748b', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>

            <Button
              style={{ background: '#fff', fontSize: 12, height: 36, display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => window.print()}
            >
              <Printer size={14} /> Imprimir
            </Button>

            <Button
              style={{ background: '#fff', color: 'var(--text)', borderColor: 'var(--border)', fontSize: 12, height: 36, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
              onClick={handleExportCSV}
            >
              <Download size={14} style={{ color: '#059669' }} /> Exportar Excel
            </Button>

            <Button
              variant="primary"
              onClick={handleOpenNewModal}
              style={{ fontSize: 12, height: 36, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              <Plus size={15} /> Nuevo cliente
            </Button>
          </div>
        </div>

        {/* Table Content */}
        <div className="table-wrap" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
          <table className="table" style={{ fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#0a2540', color: '#fff' }}>
                <th style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>ESTADO / ID</th>
                <th style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>DOCUMENTO</th>
                <th style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>NOMBRE / RAZÓN SOCIAL</th>
                <th style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>TIPO</th>
                <th style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>TELÉFONO</th>
                <th style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>CORREO</th>
                <th style={{ color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>ÓRDENES</th>
                <th style={{ color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>TOTAL GASTADO</th>
                <th style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>ÚLTIMA ORDEN</th>
                <th style={{ color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
                      <span>Cargando clientes...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                    <Users size={32} strokeWidth={1.5} style={{ marginBottom: 8 }} />
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                      No se encontraron clientes registrados.
                    </p>
                    <span className="muted small">Haz clic en "+ Nuevo cliente" para registrar el primero.</span>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(client => {
                  const spentUSD = Number(client.total_spent_usd) || 0;
                  const spentVES = convertUSDtoVES(spentUSD, activeRate);
                  return (
                    <tr
                      key={client.id}
                      onClick={() => setSelectedClient(client)}
                      style={{ cursor: 'pointer', transition: 'background 0.1s ease' }}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: client.status === 'Activo' ? '#10b981' : '#f43f5e',
                              display: 'inline-block'
                            }}
                          />
                          <b style={{ fontSize: 11, color: '#334155' }}>{client.code || client.id.slice(0, 8)}</b>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{client.doc_number}</span>
                      </td>
                      <td>
                        <b style={{ color: 'var(--text)' }}>{client.name}</b>
                      </td>
                      <td>
                        <span className="muted small" style={{ fontSize: 11 }}>
                          {(client.doc_type || 'Natural').split(' ')[0]}
                        </span>
                      </td>
                      <td>{client.phone || '—'}</td>
                      <td>
                        <span className="muted small" style={{ fontSize: 11 }}>
                          {client.email || '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 8px', borderRadius: 6, fontWeight: 700, fontSize: 11 }}>
                          {client.orders_count || 0}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <b style={{ color: '#0f172a' }}>${spentUSD.toFixed(2)}</b>
                        <span className="muted small" style={{ display: 'block', fontSize: 10, color: '#059669' }}>
                          ≈ {formatVES(spentVES)}
                        </span>
                      </td>
                      <td>
                        <span className="muted small">{client.last_order_date || '—'}</span>
                      </td>
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button
                            title="Editar cliente"
                            onClick={() => handleOpenEditModal(client)}
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: '#475569', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            title={client.status === 'Activo' ? 'Desactivar' : 'Activar'}
                            onClick={() => handleToggleStatus(client)}
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: client.status === 'Activo' ? '#f43f5e' : '#10b981', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                          >
                            {client.status === 'Activo' ? <UserX size={13} /> : <UserCheck size={13} />}
                          </button>
                          <button
                            title="Eliminar"
                            onClick={() => handleDeleteCustomer(client.id)}
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: '#ef4444', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                          >
                            <Trash2 size={13} />
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

        {/* Table Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafbfc', fontSize: 11, color: '#64748b' }}>
          <span>
            Mostrando <b>{filteredCustomers.length}</b> de <b>{totalCount}</b> clientes en total
          </span>
        </div>

      </div>

      {/* MODAL: NUEVO CLIENTE / EDITAR CLIENTE */}
      {isModalOpen && (
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
            zIndex: 1100,
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
              background: '#fff'
            }}
          >
            {/* Modal Header */}
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
                  {editingId ? 'EDITAR CLIENTE' : 'NUEVO CLIENTE'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#ddd6fe', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form Fields */}
            <form onSubmit={handleSaveCustomer} style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                  NOMBRE COMPLETO / RAZÓN SOCIAL *
                </label>
                <input
                  className="input"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Ej: Inversiones Pérez C.A., María Gómez"
                  required
                />
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                    TIPO IDENTIFICACIÓN *
                  </label>
                  <select
                    className="input"
                    value={docTypeInput}
                    onChange={(e) => setDocTypeInput(e.target.value)}
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
                    value={docNumberInput}
                    onChange={(e) => setDocNumberInput(e.target.value)}
                    placeholder="Ej: V-12345678 o J-314569..."
                    required
                  />
                </div>
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                    TELÉFONO / WHATSAPP
                  </label>
                  <input
                    className="input"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="Ej: 0412-5551234"
                  />
                </div>

                <div className="field">
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                    LÍMITE DE CRÉDITO (USD)
                  </label>
                  <input
                    className="input"
                    type="number"
                    step="1"
                    min="0"
                    value={creditLimitInput}
                    onChange={(e) => setCreditLimitInput(e.target.value)}
                    placeholder="0"
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
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="Ej: cliente@ejemplo.com"
                />
              </div>

              <div className="field">
                <label style={{ fontSize: 11, fontWeight: 700, color: '#334155', textTransform: 'uppercase', marginBottom: 4 }}>
                  DIRECCIÓN
                </label>
                <input
                  className="input"
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="Ej: Av. Bella Vista, Calle 72, Sector Tierra Negra"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid #f1f5f9', paddingTop: 14, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: '#fff',
                    color: '#475569',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <X size={16} /> Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--brand-500)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <CheckCircle size={16} /> {isSaving ? 'Guardando...' : 'Guardar Cliente'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* CLIENT DETAILS DRAWER WITH REAL-TIME ORDERS & TOP PRODUCTS */}
      {selectedClient && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 480,
            background: '#fff',
            boxShadow: '-4px 0 25px rgba(0,0,0,0.15)',
            zIndex: 1050,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            overflowY: 'auto'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
            <div>
              <span className="muted small" style={{ fontWeight: 800 }}>{selectedClient.code || selectedClient.id}</span>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{selectedClient.name}</h2>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-700)' }}>{selectedClient.doc_number}</span>
            </div>
            <button
              onClick={() => setSelectedClient(null)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: '#fafbfc' }}>
              <span className="muted small" style={{ fontSize: 10, fontWeight: 700 }}>TOTAL GASTADO</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                ${(Number(selectedClient.total_spent_usd) || 0).toFixed(2)}
              </div>
              <span className="muted small" style={{ fontSize: 10, color: '#059669' }}>
                ≈ {formatVES(convertUSDtoVES(Number(selectedClient.total_spent_usd) || 0, activeRate))}
              </span>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: '#fafbfc' }}>
              <span className="muted small" style={{ fontSize: 10, fontWeight: 700 }}>LÍMITE DE CRÉDITO</span>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand-700)', marginTop: 2 }}>
                ${(Number(selectedClient.credit_limit) || 0).toFixed(2)}
              </div>
              <span className="muted small" style={{ fontSize: 10 }}>
                {Number(selectedClient.credit_limit) > 0 ? 'Habilitado para CxC' : 'Solo Contado'}
              </span>
            </div>
          </div>

          {/* Details List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Phone size={14} style={{ color: '#64748b' }} />
              <span><b>Teléfono:</b> {selectedClient.phone || 'No registrado'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={14} style={{ color: '#64748b' }} />
              <span><b>Correo:</b> {selectedClient.email || 'No registrado'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <MapPin size={14} style={{ color: '#64748b', marginTop: 2 }} />
              <span><b>Dirección:</b> {selectedClient.address || 'No registrada'}</span>
            </div>
          </div>

          {/* REAL-TIME: TOP PRODUCT PURCHASED */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#0f172a', fontWeight: 800, fontSize: 12 }}>
              <Package size={15} style={{ color: 'var(--brand-500)' }} />
              <span>PRODUCTO MÁS COMPRADO</span>
            </div>
            {isLoadingDetails ? (
              <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 8 }}>Calculando...</div>
            ) : topProducts.length > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>{topProducts[0].name}</div>
                  <span className="muted small" style={{ fontSize: 10 }}>SKU: {topProducts[0].sku}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 12, color: '#059669' }}>{topProducts[0].total_qty} unids</div>
                  <span className="muted small" style={{ fontSize: 10 }}>${topProducts[0].total_spent.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Sin compras registradas aún.</div>
            )}
          </div>

          {/* REAL-TIME: LAST ORDERS */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, background: '#fff', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: '#0f172a', fontWeight: 800, fontSize: 12 }}>
              <ShoppingBag size={15} style={{ color: 'var(--brand-500)' }} />
              <span>ÚLTIMAS ÓRDENES Y FACTURAS ({clientOrders.length})</span>
            </div>

            {isLoadingDetails ? (
              <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', padding: 20 }}>Cargando órdenes desde Supabase...</div>
            ) : clientOrders.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                {clientOrders.map(ord => (
                  <div key={ord.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 11 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{ord.doc_number}</span>
                        <span style={{ fontSize: 9, background: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: 4 }}>{ord.doc_type}</span>
                      </div>
                      <span className="muted small" style={{ fontSize: 10 }}>{new Date(ord.created_at).toLocaleDateString()}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: '#059669' }}>${(Number(ord.total_usd) || 0).toFixed(2)}</div>
                      <span style={{ fontSize: 9, color: ord.status === 'COMPLETADA' ? '#059669' : '#d97706', fontWeight: 700 }}>{ord.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '16px 0', textAlign: 'center' }}>
                No hay órdenes emitidas para este cliente.
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', gap: 8 }}>
            <Button
              variant="primary"
              onClick={() => {
                const c = selectedClient;
                setSelectedClient(null);
                handleOpenEditModal(c);
              }}
              style={{ flex: 1, fontSize: 12 }}
            >
              <Edit2 size={14} /> Editar Cliente
            </Button>
            <Button
              style={{ background: '#fff', color: '#ef4444', borderColor: '#ef4444', fontSize: 12 }}
              onClick={() => handleDeleteCustomer(selectedClient.id)}
            >
              <Trash2 size={14} /> Eliminar
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
