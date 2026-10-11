import { Eye } from 'lucide-react';

export function SalesTransactionsTable() {
  const transactions = [
    { id: '001', date: '2026-10-10 10:00', doc: 'FAC-001', client: 'Juan Perez', method: 'Efectivo', rate: '1', usd: '100', ves: '100', status: 'Pagado' },
    { id: '002', date: '2026-10-10 12:00', doc: 'NE-002', client: 'Maria Lopez', method: 'Transferencia', rate: '36.5', usd: '250', ves: '9125', status: 'Pendiente' },
  ];

  return (
    <div className="bg-white p-4 rounded-[16px] border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead className="text-gray-500">
          <tr className="border-b">
            <th className="text-left p-2">Fecha/Hora</th>
            <th className="text-left p-2"># Doc</th>
            <th className="text-left p-2">Cliente</th>
            <th className="text-left p-2">Método</th>
            <th className="text-left p-2">Tasa</th>
            <th className="text-left p-2">USD</th>
            <th className="text-left p-2">VES</th>
            <th className="text-left p-2">Estado</th>
            <th className="text-left p-2">Acción</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="p-2">{t.date}</td>
              <td className="p-2">{t.doc}</td>
              <td className="p-2">{t.client}</td>
              <td className="p-2">{t.method}</td>
              <td className="p-2">{t.rate}</td>
              <td className="p-2">{t.usd}</td>
              <td className="p-2">{t.ves}</td>
              <td className="p-2">{t.status}</td>
              <td className="p-2"><button className="text-[var(--brand-500)]"><Eye className="w-4 h-4" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
