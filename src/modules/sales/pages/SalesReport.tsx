import { Card } from '../../../components/ui/Card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

const salesByCategory = [
  { category: 'Alimentos', usd: 18400, vesEquivalent: 644000 },
  { category: 'Bebidas', usd: 12100, vesEquivalent: 423500 },
  { category: 'Textil', usd: 8500, vesEquivalent: 297500 },
  { category: 'Electrónica', usd: 3680, vesEquivalent: 128800 },
];

export function SalesReportPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Reporte de Ventas</h1>
          <p>Análisis estadístico del rendimiento comercial bimonetario.</p>
        </div>
      </div>

      <div className="grid grid-3">
        <Card>
          <div className="kpi-label">Ventas totales (USD)</div>
          <div className="kpi-value">$ 42.680</div>
          <div className="positive small">↑ 12,4% vs. mes anterior</div>
        </Card>
        <Card>
          <div className="kpi-label">Margen bruto promedio</div>
          <div className="kpi-value">31,8%</div>
          <div className="positive small">Mantenido estable</div>
        </Card>
        <Card>
          <div className="kpi-label">Transacciones totales</div>
          <div className="kpi-value">378</div>
          <div className="muted small">Promedio $112,90 por ticket</div>
        </Card>
      </div>

      <div className="grid grid-1" style={{ marginTop: 14 }}>
        <Card>
          <h3>Ventas por Categoría (USD)</h3>
          <div className="chart" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByCategory}>
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => `$ ${Number(value).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="usd" fill="#8b78e8" radius={[4, 4, 0, 0]} name="Monto en USD" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
