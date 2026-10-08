import { EmptyState } from '../../../components/ui/EmptyState';

export function Finance() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Finanzas</h1>
          <p>Control bimonetario de saldos, tasas y movimientos.</p>
        </div>
      </div>
      <EmptyState
        title="No hay movimientos disponibles"
        description="Consulta las cuentas bancarias y sus movimientos registrados para ver saldos reales."
      />
    </div>
  );
}
