import { Banknote, Plus, Search } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

const transactions = [
  { id: 'CAJ-2001', time: '14:42', type: 'Ingreso', amountUsd: '$420.00', amountVes: 'Bs. 16,380.00', desc: 'Venta #1048' },
  { id: 'CAJ-2000', time: '13:58', type: 'Ingreso', amountUsd: '$185.00', amountVes: 'Bs. 7,215.00', desc: 'Venta #1047' },
  { id: 'CAJ-1999', time: '11:15', type: 'Egreso', amountUsd: '-$50.00', amountVes: '-Bs. 1,950.00', desc: 'Sencillo vuelto caja' },
  { id: 'CAJ-1998', time: '09:00', type: 'Apertura', amountUsd: '$150.00', amountVes: 'Bs. 5,850.00', desc: 'Apertura de turno de caja' },
];

export function CashPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Caja</h1>
          <p>Control diario de flujo de caja, arqueos y movimientos de efectivo bimonetario.</p>
        </div>
        <div className="actions">
          <Button>Arqueo de caja</Button>
          <Button variant="primary">
            <Plus size={16} /> Movimiento manual
          </Button>
        </div>
      </div>

      <div className="grid grid-3">
        <Card>
          <div className="kpi-label">Efectivo en Caja (USD)</div>
          <div className="kpi-value">$ 705,00</div>
          <div className="positive small">USD físico disponible</div>
        </Card>
        <Card>
          <div className="kpi-label">Efectivo en Caja (VES)</div>
          <div className="kpi-value">Bs. 27.495,00</div>
          <div className="muted small">Tasa de cambio: Bs. 39.00 / USD</div>
        </Card>
        <Card>
          <div className="kpi-label">Estado de Turno</div>
          <div className="kpi-value">-</div>
          <div className="muted small">Estado de turno actual</div>
        </Card>
      </div>

      <Card className="spaced">
        <div className="section-head">
          <h3>Transacciones de la Sesión Actual</h3>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Hora</th>
                <th>Tipo</th>
                <th>Concepto / Descripción</th>
                <th className="num">Monto USD</th>
                <th className="num">Monto VES</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Banknote size={15} className="muted" />
                      <b>{t.id}</b>
                    </div>
                  </td>
                  <td>{t.time}</td>
                  <td>
                    <Badge
                      tone={
                        t.type === 'Ingreso'
                          ? 'success'
                          : t.type === 'Apertura'
                          ? 'brand'
                          : 'warning'
                      }
                    >
                      {t.type}
                    </Badge>
                  </td>
                  <td>{t.desc}</td>
                  <td className="num"><b>{t.amountUsd}</b></td>
                  <td className="num">{t.amountVes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
