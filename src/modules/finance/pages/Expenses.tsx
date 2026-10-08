import { EmptyState } from '../../../components/ui/EmptyState';

export function ExpensesPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Gastos</h1>
          <p>Registro y clasificación de gastos operativos, fijos y variables del negocio.</p>
        </div>
      </div>
      <EmptyState
        title="No hay gastos registrados"
        description="Esta pantalla no dispone de un origen de datos persistente para gastos."
      />
    </div>
  );
}
