import { CircleDollarSign, Plus, Search } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

const payables = [
  { doc: 'COMP-081', supplier: 'Proveedor Central, C.A.', date: '04 Oct 2026', total: '$760.00', due: '18 Oct 2026', status: 'Pendiente' },
  { doc: 'COMP-079', supplier: 'Inversiones Almayor', date: '28 Sep 2026', total: '$1,500.00', due: '12 Oct 2026', status: 'Parcial' },
  { doc: 'COMP-075', supplier: 'Distribuciones Alimentos', date: '15 Sep 2026', total: '$3,020.00', due: '30 Sep 2026', status: 'Vencida' },
];

export function AccountsPayablePage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Cuentas por Pagar</h1>
          <p>Control de deudas de proveedores, facturas de compras por pagar y plazos de vencimiento.</p>
        </div>
        <Button variant="primary">
          <Plus size={16} /> Registrar obligación
        </Button>
      </div>

      <div className="grid grid-3">
        <Card>
          <div className="kpi-label">Total por pagar</div>
          <div className="kpi-value">$ 5.280</div>
          <div className="muted small">Oligaciones con proveedores</div>
        </Card>
        <Card>
          <div className="kpi-label">Vence esta semana</div>
          <div className="kpi-value">$ 1.500</div>
          <div className="warning small">Requiere previsión de fondos</div>
        </Card>
        <Card>
          <div className="kpi-label">Saldos Vencidos</div>
          <div className="kpi-value">$ 3.020</div>
          <div className="negative small">En mora comercial</div>
        </Card>
      </div>

      <Card className="spaced">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Buscar proveedores u obligaciones..." />
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Factura de Compra</th>
                <th>Proveedor</th>
                <th>Fecha Emisión</th>
                <th>Fecha Vencimiento</th>
                <th className="num">Total Obligación</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {payables.map((p) => (
                <tr key={p.doc}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CircleDollarSign size={15} className="muted" />
                      <b>{p.doc}</b>
                    </div>
                  </td>
                  <td>{p.supplier}</td>
                  <td>{p.date}</td>
                  <td>{p.due}</td>
                  <td className="num"><b>{p.total}</b></td>
                  <td>
                    <Badge
                      tone={
                        p.status === 'Pendiente'
                          ? 'warning'
                          : p.status === 'Parcial'
                          ? 'brand'
                          : 'danger'
                      }
                    >
                      {p.status}
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
