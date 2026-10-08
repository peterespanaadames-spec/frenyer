import { EmptyState } from '../../../components/ui/EmptyState';

export function CashPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Caja</h1>
          <p>Control de flujo de caja, arqueos y movimientos de efectivo bimonetario.</p>
        </div>
      </div>
      <EmptyState
        title="No hay movimientos de caja"
        description="Los movimientos de caja solo se mostrarán cuando estén registrados en la base de datos."
      />
    </div>
  );
}
