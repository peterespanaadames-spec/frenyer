import { EmptyState } from '../../../components/ui/EmptyState';

export function OrdersPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Pedidos</h1>
          <p>Gestiona los pedidos de ventas y el estatus de despacho.</p>
        </div>
      </div>
      <EmptyState
        title="No hay pedidos registrados"
        description="Los pedidos aparecerán aquí cuando exista persistencia habilitada para este módulo."
      />
    </div>
  );
}
