export function SalesFilters() {
  return (
    <div className="flex flex-wrap gap-4 p-4 bg-white rounded-[16px] border border-[var(--border)]">
      <input type="text" placeholder="Buscar por cliente, documento, producto..." className="p-2 border rounded w-full md:w-64" />
      <select className="p-2 border rounded">
        <option>Período (Este mes)</option>
        <option>Hoy</option>
        <option>Ayer</option>
        <option>Últimos 30 días</option>
      </select>
      <select className="p-2 border rounded">
        <option>Tipo Doc</option>
        <option>Factura</option>
        <option>Nota de Entrega</option>
      </select>
      <select className="p-2 border rounded">
        <option>Método de Pago</option>
        <option>Efectivo</option>
        <option>Transferencia</option>
      </select>
      <select className="p-2 border rounded">
        <option>Estado</option>
        <option>Pagado</option>
        <option>Pendiente</option>
      </select>
    </div>
  );
}
