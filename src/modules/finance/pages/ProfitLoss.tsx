import { EmptyState } from '../../../components/ui/EmptyState';

export function ProfitLossPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Estado de Ganancias y Pérdidas</h1>
          <p>Estado de resultados financiero consolidado en USD / VES de tu empresa.</p>
        </div>
      </div>
      <EmptyState
        title="No hay datos suficientes para el reporte"
        description="El estado de resultados requiere ventas, costos y gastos persistidos para calcularse."
      />
    </div>
  );
}
