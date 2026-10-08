import { useState, useEffect } from 'react';
import { Inbox, Plus, Search, X, Building2, RefreshCw } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { fetchSuppliersFromSupabase, DbSupplier } from '../../../lib/supabase/db';
import { getActiveExchangeRate, convertUSDtoVES, formatVES } from '../../../lib/currency';

interface Requisition {
  id: string;
  date: string;
  item: string;
  supplier_name: string;
  dept: string;
  total_usd: number;
  status: 'Pendiente' | 'Aprobado' | 'Recibido';
}

export function InternalPurchasesPage() {
  const [suppliersList, setSuppliersList] = useState<DbSupplier[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([
    { id: 'REQ-089', date: new Date().toLocaleDateString('es-VE'), item: 'Papelería y Insumos de Oficina', supplier_name: 'Proveedor General', dept: 'Administración', total_usd: 120.00, status: 'Aprobado' },
    { id: 'REQ-088', date: new Date().toLocaleDateString('es-VE'), item: 'Insumos de Limpieza y Mantenimiento', supplier_name: 'Distribuidora Central', dept: 'Operaciones', total_usd: 85.00, status: 'Pendiente' },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeRate] = useState(() => getActiveExchangeRate());
  const [toast, setToast] = useState<string | null>(null);

  // Form state
  const [itemInput, setItemInput] = useState('');
  const [supplierInput, setSupplierInput] = useState('');
  const [deptInput, setDeptInput] = useState('Administración');
  const [totalInput, setTotalInput] = useState('');
  const [statusInput, setStatusInput] = useState<'Pendiente' | 'Aprobado' | 'Recibido'>('Pendiente');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadSuppliers = async () => {
    setIsLoading(true);
    const data = await fetchSuppliersFromSupabase();
    setSuppliersList(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const handleOpenModal = () => {
    setItemInput('');
    setSupplierInput(suppliersList.length > 0 ? suppliersList[0].name : '');
    setDeptInput('Administración');
    setTotalInput('');
    setStatusInput('Pendiente');
    setIsModalOpen(true);
  };

  const handleCreateRequisition = (e: React.FormEvent) => {
    e.preventDefault();

    if (!itemInput.trim()) {
      showToast('⚠️ Ingresa el artículo o detalle de la requisición.');
      return;
    }
    if (!supplierInput.trim()) {
      showToast('⚠️ Selecciona o ingresa un proveedor.');
      return;
    }

    const newReq: Requisition = {
      id: `REQ-${Math.floor(100 + Math.random() * 900)}`,
      date: new Date().toLocaleDateString('es-VE'),
      item: itemInput.trim(),
      supplier_name: supplierInput.trim(),
      dept: deptInput,
      total_usd: parseFloat(totalInput) || 0,
      status: statusInput
    };

    setRequisitions(prev => [newReq, ...prev]);
    showToast('✅ Requisición de compra creada correctamente.');
    setIsModalOpen(false);
  };

  // KPI Calculations
  const pendingCount = requisitions.filter(r => r.status === 'Pendiente').length;
  const approvedCount = requisitions.filter(r => r.status === 'Aprobado' || r.status === 'Recibido').length;
  const totalInvestedUSD = requisitions.reduce((sum, r) => sum + r.total_usd, 0);
  const totalInvestedVES = convertUSDtoVES(totalInvestedUSD, activeRate);

  const filtered = requisitions.filter(r =>
    r.item.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.dept.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="content">
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            backgroundColor: '#1e293b',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            zIndex: 9999,
            fontSize: '0.9rem',
            border: '1px solid #334155'
          }}
        >
          {toast}
        </div>
      )}

      <div className="page-head">
        <div>
          <h1>Compras Internas</h1>
          <p>Control de requisiciones de material y órdenes asignadas a proveedores registrados.</p>
        </div>
        <Button variant="primary" onClick={handleOpenModal}>
          <Plus size={16} /> Crear requisición
        </Button>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <Card>
          <div className="kpi-label">Requisiciones Pendientes</div>
          <div className="kpi-value">{pendingCount}</div>
          <div className="warning small">Pendientes por aprobación directiva</div>
        </Card>
        <Card>
          <div className="kpi-label">Aprobadas / Procesadas</div>
          <div className="kpi-value" style={{ color: '#10b981' }}>{approvedCount}</div>
          <div className="positive small">Inversión autorizada</div>
        </Card>
        <Card>
          <div className="kpi-label">Total Invertido en Compras</div>
          <div className="kpi-value">
            $ {totalInvestedUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="muted small">{formatVES(totalInvestedVES)} (BCV: {activeRate.toFixed(2)} Bs/$)</div>
        </Card>
      </div>

      <Card className="spaced">
        <div className="toolbar" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="search" style={{ flex: 1, maxWidth: 380 }}>
            <Search size={16} />
            <input
              className="input"
              placeholder="Buscar requisición, proveedor o departamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Button variant="secondary" onClick={loadSuppliers} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} /> Refrescar Proveedores
          </Button>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Fecha</th>
                <th>Artículo / Detalle</th>
                <th>Proveedor Asignado</th>
                <th>Departamento</th>
                <th className="num">Total ($)</th>
                <th>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)' }}>
                    No se encontraron requisiciones registradas.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Inbox size={15} className="muted" />
                        <b>{r.id}</b>
                      </div>
                    </td>
                    <td>{r.date}</td>
                    <td><b>{r.item}</b></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Building2 size={14} style={{ color: 'var(--brand-500)' }} />
                        <span>{r.supplier_name}</span>
                      </div>
                    </td>
                    <td>{r.dept}</td>
                    <td className="num"><b>$ {r.total_usd.toFixed(2)}</b></td>
                    <td>
                      <Badge
                        tone={
                          r.status === 'Recibido'
                            ? 'success'
                            : r.status === 'Aprobado'
                            ? 'brand'
                            : 'warning'
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Crear Requisición de Compra Interna */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 520, width: '100%' }}>
            <div className="modal-head">
              <h3>Nueva Requisición de Compra</h3>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateRequisition} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Artículo / Insumo Solicitado *</label>
                <input
                  className="input"
                  placeholder="Ej. Resmas de papel, Insumos de limpieza, Repuestos..."
                  value={itemInput}
                  onChange={(e) => setItemInput(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="label">Proveedor Asignado (Directorio Supabase) *</label>
                <input
                  className="input"
                  list="internal-suppliers-list"
                  placeholder="Seleccionar o ingresar proveedor..."
                  value={supplierInput}
                  onChange={(e) => setSupplierInput(e.target.value)}
                  required
                />
                <datalist id="internal-suppliers-list">
                  {suppliersList.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.doc_number ? `${s.name} (${s.doc_number})` : s.name}
                    </option>
                  ))}
                </datalist>
              </div>

              <div className="grid grid-2" style={{ gap: 12 }}>
                <div>
                  <label className="label">Departamento Solicitante</label>
                  <select
                    className="input"
                    value={deptInput}
                    onChange={(e) => setDeptInput(e.target.value)}
                  >
                    <option value="Administración">Administración</option>
                    <option value="Operaciones">Operaciones</option>
                    <option value="Ventas">Ventas</option>
                    <option value="Recursos Humanos">Recursos Humanos</option>
                    <option value="IT / Sistemas">IT / Sistemas</option>
                    <option value="Almacén">Almacén</option>
                  </select>
                </div>

                <div>
                  <label className="label">Monto Estimado ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    placeholder="0.00"
                    value={totalInput}
                    onChange={(e) => setTotalInput(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Estatus de la Requisición</label>
                <select
                  className="input"
                  value={statusInput}
                  onChange={(e) => setStatusInput(e.target.value as any)}
                >
                  <option value="Pendiente">Pendiente por aprobación</option>
                  <option value="Aprobado">Aprobado</option>
                  <option value="Recibido">Recibido</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary">
                  Crear Requisición
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
