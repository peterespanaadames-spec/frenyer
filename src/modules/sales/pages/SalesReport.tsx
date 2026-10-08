import { EmptyState } from '../../../components/ui/EmptyState';

export function SalesReportPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Reporte de Ventas</h1>
          <p>Análisis estadístico del rendimiento comercial bimonetario.</p>
        </div>
      </div>
      <EmptyState
        title="No hay datos de ventas para reportar"
        description="El reporte se calculará cuando haya ventas reales accesibles en la base de datos."
      />
    </div>
  );
}
