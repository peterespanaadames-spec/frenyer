import { EmptyState } from '../../../components/ui/EmptyState';

export function AccountsReportPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Reporte de Cuentas</h1>
          <p>Análisis de flujo de caja, cobranzas estimadas y vencimiento de egresos.</p>
        </div>
      </div>
      <EmptyState
        title="No hay datos para proyectar"
        description="La proyección se mostrará cuando existan cuentas por cobrar y pagar persistidas."
      />
    </div>
  );
}
