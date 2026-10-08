import { ClipboardList, Plus, Search } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

const orders = [
  { id: 'PED-104', date: '04 Oct 2026', customer: 'Automotriz Express', total: '$1,850.00', status: 'Pendiente' },
  { id: 'PED-103', date: '03 Oct 2026', customer: 'Supermercado Central', total: '$3,420.00', status: 'Despachado' },
  { id: 'PED-102', date: '01 Oct 2026', customer: 'Distribuidora F', total: '$890.00', status: 'Entregado' },
  { id: 'PED-101', date: '28 Sep 2026', customer: 'Ferretería El Candado', total: '$1,200.00', status: 'Entregado' },
];

export function OrdersPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Pedidos</h1>
          <p>Gestiona los pedidos de ventas y estatus de despacho.</p>
        </div>
        <Button variant="primary">
          <Plus size={16} /> Nuevo pedido
        </Button>
      </div>

      <div className="grid grid-3">
        <Card>
          <div className="kpi-label">Pedidos Pendientes</div>
          <div className="kpi-value">1</div>
          <div className="positive small">Requiere atención</div>
        </Card>
        <Card>
          <div className="kpi-label">En Despacho</div>
          <div className="kpi-value">1</div>
          <div className="muted small">En proceso de envío</div>
        </Card>
        <Card>
          <div className="kpi-label">Entregados hoy</div>
          <div className="kpi-value">2</div>
          <div className="positive small">Completados con éxito</div>
        </Card>
      </div>

      <Card className="spaced">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Buscar pedidos por número o cliente..." />
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nro Pedido</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th className="num">Total</th>
                <th>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ClipboardList size={15} className="muted" />
                      <b>{o.id}</b>
                    </div>
                  </td>
                  <td>{o.date}</td>
                  <td>{o.customer}</td>
                  <td className="num"><b>{o.total}</b></td>
                  <td>
                    <Badge
                      tone={
                        o.status === 'Entregado'
                          ? 'success'
                          : o.status === 'Despachado'
                          ? 'brand'
                          : 'warning'
                      }
                    >
                      {o.status}
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
