import { EmptyState } from '../../../components/ui/EmptyState';

export function MovementsPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Movimientos de Inventario</h1>
          <p>Kárdex detallado de entradas, salidas y transferencias de mercancía.</p>
        </div>
      </div>
      <EmptyState
        title="No hay movimientos registrados"
        description="El kárdex solo mostrará movimientos persistidos en la base de datos."
      />
    </div>
  );
}
