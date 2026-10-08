import { Megaphone, Plus, Search } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';

const campaigns = [
  { name: 'Descuento Apertura Octubre', type: 'Cupón de Descuento', code: 'OCTUBRE10', discount: '10% OFF', usage: '48 veces', status: 'Activa' },
  { name: 'Día de la Alimentación', type: 'Oferta Especial Alimentos', code: 'ALIMENTOS15', discount: '15% OFF', usage: '128 veces', status: 'Activa' },
  { name: 'Promoción Camisas Oxford', type: 'Envío Gratis', code: 'ENVIOOXFORD', discount: 'Flete Gratis', usage: '12 veces', status: 'Expirada' },
];

export function MarketingPage() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h1>Marketing y Campañas</h1>
          <p>Crea cupones de descuento, promociones bimonetarias y sigue las conversiones de tus campañas.</p>
        </div>
        <Button variant="primary">
          <Plus size={16} /> Nueva campaña / cupón
        </Button>
      </div>

      <div className="grid grid-3">
        <Card>
          <div className="kpi-label">Campañas Activas</div>
          <div className="kpi-value">2</div>
          <div className="positive small">Generando tracción de clientes</div>
        </Card>
        <Card>
          <div className="kpi-label">Uso total de cupones</div>
          <div className="kpi-value">188 canjes</div>
          <div className="positive small">↑ 15% esta semana</div>
        </Card>
        <Card>
          <div className="kpi-label">Retorno estimado</div>
          <div className="kpi-value">$ 1.840,00</div>
          <div className="positive small">Ingresos adicionales medidos</div>
        </Card>
      </div>

      <Card className="spaced">
        <div className="section-head">
          <h3>Cupones y Promociones Activas</h3>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre de Campaña</th>
                <th>Tipo</th>
                <th>Código de Cupón</th>
                <th>Beneficio / Descuento</th>
                <th>Veces Utilizado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.name}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Megaphone size={15} className="muted" />
                      <b>{c.name}</b>
                    </div>
                  </td>
                  <td>{c.type}</td>
                  <td><code>{c.code}</code></td>
                  <td><b>{c.discount}</b></td>
                  <td>{c.usage}</td>
                  <td>
                    <Badge tone={c.status === 'Activa' ? 'success' : 'danger'}>
                      {c.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
