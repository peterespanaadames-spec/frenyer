import { FileText, Plus, Search } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

const quotes = [
  { id: 'COT-204', date: '04 Oct 2026', customer: 'Inversiones Delta', total: '$1,240.00', validity: '14 Oct 2026', status: 'Enviada' },
  { id: 'COT-203', date: '02 Oct 2026', customer: 'Constructora Sigo', total: '$8,450.00', validity: '12 Oct 2026', status: 'Aceptada' },
  { id: 'COT-202', date: '28 Sep 2026', customer: 'Hotel Caracas Palace', total: '$3,150.00', validity: '08 Oct 2026', status: 'Aceptada' },
  { id: 'COT-201', date: '15 Sep 2026', customer: 'Alimentos Polar', total: '$12,300.00', validity: '25 Sep 2026', status: 'Expirada' },
];

export function QuotesPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Cotizaciones</h1>
          <p>Elabora propuestas de venta y presupuestos para tus clientes.</p>
        </div>
        <Button variant="primary">
          <Plus size={16} /> Nueva cotización
        </Button>
      </div>

      <div className="grid grid-3">
        <Card>
          <div className="kpi-label">Pendientes por aprobar</div>
          <div className="kpi-value">1</div>
          <div className="muted small">Esperando respuesta del cliente</div>
        </Card>
        <Card>
          <div className="kpi-label">Aceptadas este mes</div>
          <div className="kpi-value">2</div>
          <div className="positive small">Convertidas a ventas</div>
        </Card>
        <Card>
          <div className="kpi-label">Efectividad de cierre</div>
          <div className="kpi-value">66,7%</div>
          <div className="positive small">↑ 5% vs. mes anterior</div>
        </Card>
      </div>

      <Card className="spaced">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Buscar presupuestos..." />
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cotización</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Validez</th>
                <th className="num">Importe</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileText size={15} className="muted" />
                      <b>{q.id}</b>
                    </div>
                  </td>
                  <td>{q.date}</td>
                  <td>{q.customer}</td>
                  <td>{q.validity}</td>
                  <td className="num"><b>{q.total}</b></td>
                  <td>
                    <Badge
                      tone={
                        q.status === 'Aceptada'
                          ? 'success'
                          : q.status === 'Enviada'
                          ? 'brand'
                          : 'danger'
                      }
                    >
                      {q.status}
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
