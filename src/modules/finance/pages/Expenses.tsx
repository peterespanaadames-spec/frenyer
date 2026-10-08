import { Coins, Plus, Search } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

const expensesList = [
  { id: 'EXP-104', date: '03 Oct 2026', category: 'Alquiler', desc: 'Pago canon de arrendamiento local principal', amount: '$1,200.00', method: 'Transferencia USD' },
  { id: 'EXP-103', date: '01 Oct 2026', category: 'Servicios', desc: 'Pago Electricidad Corpoelec', amount: '$45.00', method: 'Bs. Pago Móvil' },
  { id: 'EXP-102', date: '30 Sep 2026', category: 'Nómina', desc: 'Sueldo quincenal personal administrativo', amount: '$1,850.00', method: 'Transferencia USD' },
  { id: 'EXP-101', date: '28 Sep 2026', category: 'Logística', desc: 'Flete de despacho de mercancía regional', amount: '$320.00', method: 'Efectivo USD' },
];

export function ExpensesPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Gastos</h1>
          <p>Registro y clasificación de gastos operativos, fijos y variables del negocio.</p>
        </div>
        <Button variant="primary">
          <Plus size={16} /> Registrar gasto
        </Button>
      </div>

      <div className="grid grid-3">
        <Card>
          <div className="kpi-label">Gastos del mes (USD)</div>
          <div className="kpi-value">$ 3.415,00</div>
          <div className="muted small">Dentro del presupuesto programado</div>
        </Card>
        <Card>
          <div className="kpi-label">Mayor Categoría de Gasto</div>
          <div className="kpi-value">Nómina</div>
          <div className="muted small">Representa el 54,2% del total</div>
        </Card>
        <Card>
          <div className="kpi-label">Gastos en Moneda Nacional</div>
          <div className="kpi-value">Bs. 1.755,00</div>
          <div className="muted small">Pagado a tasa de cambio oficial</div>
        </Card>
      </div>

      <Card className="spaced">
        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Buscar gastos..." />
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Código Gasto</th>
                <th>Fecha</th>
                <th>Categoría</th>
                <th>Descripción / Concepto</th>
                <th className="num">Monto</th>
                <th>Método de Pago</th>
              </tr>
            </thead>
            <tbody>
              {expensesList.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Coins size={15} className="muted" />
                      <b>{e.id}</b>
                    </div>
                  </td>
                  <td>{e.date}</td>
                  <td>
                    <Badge tone={e.category === 'Nómina' ? 'danger' : e.category === 'Alquiler' ? 'warning' : 'brand'}>
                      {e.category}
                    </Badge>
                  </td>
                  <td>{e.desc}</td>
                  <td className="num"><b>{e.amount}</b></td>
                  <td>{e.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
