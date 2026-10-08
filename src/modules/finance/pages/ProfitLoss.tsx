import { Card } from '../../../components/ui/Card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

const PLData = [
  { name: 'Ingresos', usd: 42680, color: '#28a879' },
  { name: 'Costo Ventas (COGS)', usd: -29100, color: '#e36f6f' },
  { name: 'Gasto Operativo (OPEX)', usd: -3415, color: '#e5a52b' },
  { name: 'Utilidad Neta', usd: 10165, color: '#8b78e8' },
];

export function ProfitLossPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Estado de Ganancias y Pérdidas</h1>
          <p>Estado de resultados financiero consolidado en USD / VES de tu empresa.</p>
        </div>
      </div>

      <div className="grid grid-4">
        <Card>
          <div className="kpi-label">Ingresos Totales</div>
          <div className="kpi-value">$ 42.680</div>
          <div className="positive small">Ingresos brutos declarados</div>
        </Card>
        <Card>
          <div className="kpi-label">Costo de Ventas</div>
          <div className="kpi-value">$ 29.100</div>
          <div className="negative small">Costo de inventario vendido</div>
        </Card>
        <Card>
          <div className="kpi-label">Gastos Operativos</div>
          <div className="kpi-value">$ 3.415</div>
          <div className="negative small">Alquiler, servicios, nómina</div>
        </Card>
        <Card>
          <div className="kpi-label">Utilidad Neta Estimada</div>
          <div className="kpi-value" style={{ color: 'var(--brand-700)' }}>$ 10.165</div>
          <div className="positive small">↑ Margen Neto del 23,8%</div>
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginTop: 14 }}>
        <Card>
          <h3>Resumen Financiero Estructurado</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <span><b>(+) Ingresos Operacionales</b></span>
              <b>$ 42.680,00</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <span>(-) Costo de Ventas (COGS)</span>
              <span className="negative">-$ 29.100,00</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)', background: 'var(--brand-50)', padding: '6px 8px', borderRadius: 6 }}>
              <span><b>(=) Margen Bruto (31.8%)</b></span>
              <b style={{ color: 'var(--brand-700)' }}>$ 13.580,00</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <span>(-) Gastos de Administración (OPEX)</span>
              <span className="negative">-$ 3.415,00</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '2px solid var(--text)', background: '#e9f7f1', padding: '6px 8px', borderRadius: 6 }}>
              <span><b style={{ color: '#237d5f' }}>(=) Utilidad de Operación Neta</b></span>
              <b style={{ color: '#237d5f' }}>$ 10.165,00</b>
            </div>
          </div>
        </Card>

        <Card>
          <h3>Distribución del Estado de Resultados</h3>
          <div className="chart" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={PLData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => `$ ${Number(value).toLocaleString()}`} />
                <Bar dataKey="usd" fill="#8b78e8" radius={[4, 4, 0, 0]} name="Monto en USD">
                  {PLData.map((entry, index) => (
                    <circle key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
