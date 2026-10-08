import { EmptyState } from '../../../components/ui/EmptyState';

export function Alma() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Alma</h1>
          <p>Asistente inteligente corporativo.</p>
        </div>
      </div>
      <EmptyState
        title="El asistente no está conectado"
        description="El chat estará disponible cuando las herramientas autorizadas del servidor estén configuradas."
      />
    </div>
  );
}
