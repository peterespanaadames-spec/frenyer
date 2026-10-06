import { Inbox, Plus, Search } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

const requisitions = [
  { id: 'REQ-089', date: '04 Oct 2026', item: 'Papelería y Oficina', dept: 'Administración', total: '$120.00', status: 'Aprobado' },
  { id: 'REQ-088', date: '02 Oct 2026', item: 'Insumos de Limpieza', dept: 'Operaciones', total: '$85.00', status: 'Pendiente' },
  { id: 'REQ-087', date: '29 Sep 2026', item: 'Café y Consumibles', dept: 'Recursos Humanos', total: '$45.00', status: 'Recibido' },
  { id: 'REQ-086', date: '20 Sep 2026', item: 'Tóner Impresora L300', dept: 'IT', total: '$110.00', status: 'Recibido' },
];

export function InternalPurchasesPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Compras Internas</h1>
          <p>Control de requisiciones de material y gastos internos autorizados.</p>
        </div>
        <Button variant="primary">
          <Plus size={16} /> Crear requisición
        </Button>
      </div>

      <div className="grid grid-3">
        <Card>
          <div className="kpi-label">Requisiciones Pendientes</div>
          <div className="kpi-value">1</div>
          <div className="warning small">Pendiente por aprobación directiva</div>
        </Card>
        <Card>
          <div className="kpi-label">Aprobadas este mes</div>
          <div className="kpi-value">3</div>
          <div className="muted small">Total invertido: $250.00</div>
        </Card>
        <Card>
          <div className="kpi-label">Presupuesto mensual restante</div>
          <div className="kpi-value">$ 750,00</div>
          <div className="positive small">Mantenido bajo el límite</div>
        </Card>
      </div>

      <Card className="spaced">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Buscar requisiciones..." />
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Fecha</th>
                <th>Artículo / Detalle</th>
                <th>Departamento</th>
                <th className="num">Total</th>
                <th>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {requisitions.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Inbox size={15} className="muted" />
                      <b>{r.id}</b>
                    </div>
                  </td>
                  <td>{r.date}</td>
                  <td>{r.item}</td>
                  <td>{r.dept}</td>
                  <td className="num"><b>{r.total}</b></td>
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
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
