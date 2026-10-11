import { Card } from '../../../components/ui/Card';

export function SalesKPIs() {
  const kpis = [
    { title: 'Órdenes', value: '145' },
    { title: 'Ingresos Totales', value: '$12,450.00' },
    { title: 'Utilidad Estimada', value: '$3,200.00' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.title}>
            <div className="p-4">
                <p className="text-sm text-gray-500">{kpi.title}</p>
                <p className="text-2xl font-bold text-[var(--brand-500)]">{kpi.value}</p>
            </div>
        </Card>
      ))}
    </div>
  );
}
