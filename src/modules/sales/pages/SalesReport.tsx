import { useState } from 'react';
import { RefreshCcw, FileDown, Calendar, Search } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

// Mock data for demonstration
const kpiData = {
  orders: 27,
  income: 76.79,
  profit: 30.24
};

export const SalesReportPage = () => {
  const [activeKpiTab, setActiveKpiTab] = useState('ventas');

  return (
    <div className="p-6 space-y-6 bg-slate-50/50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">
          Reporte de Ventas
        </h1>
        <div className="flex gap-2">
          <Button variant="secondary"><RefreshCcw className="w-4 h-4 mr-2" /> Actualizar</Button>
          <Button variant="secondary"><FileDown className="w-4 h-4 mr-2" /> Exportar</Button>
        </div>
      </div>

      {/* Date Filters */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-[16px] border border-slate-200">
        <div className="flex gap-2">
            {['Hoy', 'Ayer', 'Esta Semana', 'Este Mes', 'Mes Anterior', 'Últimos 30 días', 'Histórico'].map(label => (
                <button key={label} className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${label === 'Hoy' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>
            ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="w-4 h-4" />
            <input type="date" className="border border-slate-200 rounded-lg p-2" defaultValue="2026-10-01" />
            <input type="date" className="border border-slate-200 rounded-lg p-2" defaultValue="2026-10-11" />
        </div>
      </div>

      {/* KPI Values */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[16px] border border-slate-200">
            <p className="text-sm text-slate-500">Total Órdenes</p>
            <p className="text-4xl font-bold text-slate-900 tabular-nums">{kpiData.orders}</p>
        </div>
        <div className="bg-white p-6 rounded-[16px] border border-slate-200">
            <p className="text-sm text-slate-500">Total Ingresos ($)</p>
            <p className="text-4xl font-bold text-slate-900 tabular-nums">${kpiData.income.toFixed(2)}</p>
        </div>
        <div className="bg-white p-6 rounded-[16px] border border-slate-200">
            <p className="text-sm text-slate-500">Utilidad Estimada ($)</p>
            <p className="text-4xl font-bold text-slate-900 tabular-nums">${kpiData.profit.toFixed(2)}</p>
        </div>
      </div>

      {/* Table Filters */}
      <div className="flex gap-4 bg-white p-4 rounded-[16px] border border-slate-200">
        <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Buscar por N° control, cliente, RIF, producto o cuenta..." className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <select className="border border-slate-200 rounded-lg p-2 text-sm text-slate-600"><option>Todos los documentos</option></select>
        <select className="border border-slate-200 rounded-lg p-2 text-sm text-slate-600"><option>Cuentas bancarias</option></select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[16px] border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                <tr>
                    <th className="p-4 text-left font-medium">Fecha</th>
                    <th className="p-4 text-left font-medium">Comprobante</th>
                    <th className="p-4 text-left font-medium">Tipo</th>
                    <th className="p-4 text-left font-medium">Cliente</th>
                    <th className="p-4 text-left font-medium">Monto ($)</th>
                    <th className="p-4 text-left font-medium">Estado</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                <tr>
                    <td className="p-4 text-slate-600 tabular-nums">10/10/2026</td>
                    <td className="p-4 font-medium text-slate-900">#70</td>
                    <td className="p-4 text-slate-500">Pedido Web</td>
                    <td className="p-4 text-slate-900">Pedro Perez</td>
                    <td className="p-4 font-medium text-slate-900 tabular-nums">$0.59</td>
                    <td className="p-4 text-slate-500">Entregado</td>
                </tr>
            </tbody>
        </table>
      </div>
    </div>
  );
};
