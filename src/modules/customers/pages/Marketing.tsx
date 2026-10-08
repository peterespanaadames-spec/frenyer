import { EmptyState } from '../../../components/ui/EmptyState';

export function MarketingPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Marketing y Campañas</h1>
          <p>Crea cupones de descuento, promociones bimonetarias y sigue las conversiones de tus campañas.</p>
        </div>
      </div>
      <EmptyState
        title="No hay campañas registradas"
        description="Las campañas aparecerán aquí cuando el módulo tenga persistencia conectada."
      />
    </div>
  );
}
