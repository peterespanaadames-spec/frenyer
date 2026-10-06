import { ArrowLeftRight, Search, Plus } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

const logs = [
  { id: 'MOV-304', date: '04 Oct 2026 · 14:02', sku: 'PRD-001', name: 'Café Premium 500g', type: 'Entrada', qty: '+50 uds.', reason: 'Compra a Proveedor Central' },
  { id: 'MOV-303', date: '04 Oct 2026 · 12:48', sku: 'PRD-004', name: 'Audífonos Bluetooth', type: 'Salida', qty: '-2 uds.', reason: 'Ajuste de inventario dañado' },
  { id: 'MOV-302', date: '03 Oct 2026 · 10:15', sku: 'PRD-002', name: 'Aceite Vegetal 1L', type: 'Entrada', qty: '+100 uds.', reason: 'Reposición de stock' },
  { id: 'MOV-301', date: '01 Oct 2026 · 16:30', sku: 'PRD-003', name: 'Camisa Oxford Azul M', type: 'Transferencia', qty: '-10 uds.', reason: 'Traspaso a Sucursal Norte' },
];

export function MovementsPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Movimientos de Inventario</h1>
          <p>Kárdex detallado de entradas, salidas y transferencias de mercancía.</p>
        </div>
        <Button variant="primary">
          <Plus size={16} /> Registrar ajuste
        </Button>
      </div>

      <div className="grid grid-3">
        <Card>
          <div className="kpi-label">Entradas este mes</div>
          <div className="kpi-value">1.150 uds.</div>
          <div className="positive small">Ingreso de mercancía regular</div>
        </Card>
        <Card>
          <div className="kpi-label">Salidas registradas</div>
          <div className="kpi-value">340 uds.</div>
          <div className="muted small">Ventas y mermas directas</div>
        </Card>
        <Card>
          <div className="kpi-label">Ajustes manuales</div>
          <div className="kpi-value">4 logs</div>
          <div className="warning small">Monitoreados por auditoría</div>
        </Card>
      </div>

      <Card className="spaced">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Buscar movimientos por SKU o producto..." />
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Movimiento</th>
                <th>Fecha</th>
                <th>SKU</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th className="num">Cantidad</th>
                <th>Motivo / Referencia</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ArrowLeftRight size={15} className="muted" />
                      <b>{l.id}</b>
                    </div>
                  </td>
                  <td>{l.date}</td>
                  <td><code>{l.sku}</code></td>
                  <td>{l.name}</td>
                  <td>
                    <Badge
                      tone={
                        l.type === 'Entrada'
                          ? 'success'
                          : l.type === 'Transferencia'
                          ? 'brand'
                          : 'danger'
                      }
                    >
                      {l.type}
                    </Badge>
                  </td>
                  <td className="num"><b>{l.qty}</b></td>
                  <td>{l.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
