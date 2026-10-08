import { EmptyState } from '../../../components/ui/EmptyState';

export function InternalPurchasesPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Compras Internas</h1>
          <p>Requisiciones y compras internas vinculadas a proveedores.</p>
        </div>
      </div>
      <EmptyState
        title="No hay requisiciones registradas"
        description="Las requisiciones solo se mostrarán cuando el módulo cuente con persistencia en la base de datos."
      />
    </div>
  );
}
