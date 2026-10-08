import { Card } from '../../../components/ui/Card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend } from 'recharts';

const projectionData = [
  { name: 'Semana 1', cobros: 4200, pagos: 2500 },
  { name: 'Semana 2', cobros: 5100, pagos: 3100 },
  { name: 'Semana 3', cobros: 3800, pagos: 4500 },
  { name: 'Semana 4', cobros: 6300, pagos: 1200 },
];

export function AccountsReportPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Reporte de Cuentas</h1>
          <p>Análisis predictivo de flujo de caja libre, cobranzas estimadas y vencimiento de egresos.</p>
        </div>
      </div>

      <div className="grid grid-3">
        <Card>
          <div className="kpi-label">Proyección Cobros (30 días)</div>
          <div className="kpi-value">$ 19.400</div>
          <div className="positive small">Cuentas por cobrar activas</div>
        </Card>
        <Card>
          <div className="kpi-label">Proyección Pagos (30 días)</div>
          <div className="kpi-value">$ 11.300</div>
          <div className="negative small">Facturas pendientes por liquidar</div>
        </Card>
        <Card>
          <div className="kpi-label">Superávit Proyectado</div>
          <div className="kpi-value">$ 8.100</div>
          <div className="positive small">Flujo neto estimado positivo</div>
        </Card>
      </div>

      <div className="grid grid-1" style={{ marginTop: 14 }}>
        <Card>
          <h3>Pronóstico de Flujos: Cobros vs. Pagos</h3>
          <div className="chart" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => `$ ${value}`} />
                <Legend />
                <Area type="monotone" dataKey="cobros" stroke="#28a879" fill="#e2f7ee" name="Cobros Proyectados" />
                <Area type="monotone" dataKey="pagos" stroke="#e36f6f" fill="#fdeaea" name="Pagos Comprometidos" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
