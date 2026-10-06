import { Truck, Plus, Search } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

const suppliers = [
  { name: 'Proveedor Central, C.A.', contact: 'Laura Pérez', email: 'laura@central.com', phone: '0424-555-1212', balance: '$760.00', status: 'Activo' },
  { name: 'Inversiones Almayor', contact: 'Roberto Gómez', email: 'roberto@almayor.com', phone: '0414-555-3434', balance: '$1,500.00', status: 'Activo' },
  { name: 'Distribuciones Alimentos', contact: 'María Rojas', email: 'maria@distribuciones.com', phone: '0212-555-7878', balance: '$3,020.00', status: 'Moroso' },
  { name: 'Textiles El Hilo', contact: 'Carlos Mendoza', email: 'carlos@elhilo.com', phone: '0412-555-9090', balance: '$0.00', status: 'Activo' },
];

export function SuppliersPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Proveedores</h1>
          <p>Directorio de proveedores registrados, control de compras asociadas y balances de deudas.</p>
        </div>
        <Button variant="primary">
          <Plus size={16} /> Nuevo proveedor
        </Button>
      </div>

      <div className="grid grid-3">
        <Card>
          <div className="kpi-label">Proveedores Registrados</div>
          <div className="kpi-value">12</div>
        </Card>
        <Card>
          <div className="kpi-label">Proveedores con deuda activa</div>
          <div className="kpi-value">3</div>
        </Card>
        <Card>
          <div className="kpi-label">Total deuda proveedores</div>
          <div className="kpi-value">$ 5.280,00</div>
        </Card>
      </div>

      <Card className="spaced">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Buscar proveedor..." />
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Contacto</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th className="num">Balance Pendiente</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.name}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Truck size={15} className="muted" />
                      <b>{s.name}</b>
                    </div>
                  </td>
                  <td>{s.contact}</td>
                  <td>{s.email}</td>
                  <td>{s.phone}</td>
                  <td className="num"><b>{s.balance}</b></td>
                  <td>
                    <Badge tone={s.status === 'Activo' ? 'success' : 'danger'}>
                      {s.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
