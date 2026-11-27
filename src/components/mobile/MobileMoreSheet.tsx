import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ClipboardList, FileText, Inbox, ArrowLeftRight, FileText as FileText2,
  Landmark, Building, Receipt, CreditCard, FileSpreadsheet, Coins, Users, User, Truck,
  Percent, Heart, Megaphone, Store, Settings, X
} from 'lucide-react';

interface MoreItem { label: string; icon: any; to: string; permissionKey?: string; }

const GROUPS: { title: string; items: MoreItem[] }[] = [
  { title: 'Ventas', items: [
    { label: 'Pedidos', icon: ClipboardList, to: '/ventas-flash/pedidos', permissionKey: 'ventas' },
    { label: 'Cotizaciones', icon: FileText, to: '/ventas-flash/cotizaciones', permissionKey: 'ventas' },
  ]},
  { title: 'Inventario', items: [
    { label: 'Compras internas', icon: Inbox, to: '/inventarios/compras', permissionKey: 'inventario' },
    { label: 'Movimientos', icon: ArrowLeftRight, to: '/inventarios/movimientos', permissionKey: 'inventario' },
    { label: 'Reporte diario', icon: FileText2, to: '/inventarios/reporte-diario', permissionKey: 'inventario' },
  ]},
  { title: 'Cuentas', items: [
    { label: 'Cuentas bancarias', icon: Building, to: '/cuentas/bancos', permissionKey: 'finanzas' },
    { label: 'Cuentas por cobrar', icon: Receipt, to: '/cuentas/cobrar', permissionKey: 'finanzas' },
    { label: 'Cuentas por pagar', icon: CreditCard, to: '/cuentas/pagar', permissionKey: 'finanzas' },
    { label: 'Reporte de cuentas', icon: FileSpreadsheet, to: '/cuentas/reporte', permissionKey: 'finanzas' },
  ]},
  { title: 'Finanzas', items: [
    { label: 'Gastos', icon: Coins, to: '/gastos', permissionKey: 'finanzas' },
    { label: 'Salud de empresa', icon: Heart, to: '/finanzas/salud', permissionKey: 'reportes' },
    { label: 'Ganancias y pérdidas', icon: Percent, to: '/finanzas/ganancias-perdidas', permissionKey: 'reportes' },
  ]},
  { title: 'Contactos', items: [
    { label: 'Clientes', icon: User, to: '/contactos/clientes' },
    { label: 'Proveedores', icon: Truck, to: '/contactos/proveedores' },
    { label: 'Marketing', icon: Megaphone, to: '/marketing' },
  ]},
  { title: 'Otros', items: [
    { label: 'Tienda online', icon: Store, to: '/tienda' },
    { label: 'Configuración', icon: Settings, to: '/configuracion' },
  ]},
];

export function MobileMoreSheet({ open, onClose, permissions }: { open: boolean; onClose: () => void; permissions: string[] }) {
  const navigate = useNavigate();
  const { userOrganizations, activeOrganizationId } = useAuth();
  const activeOrg = userOrganizations.find(o => o.isActive) || userOrganizations.find(o => o.id === activeOrganizationId) || userOrganizations[0];
  const slug = activeOrg?.slug || 'demostras';
  if (!open) return null;

  const hasPerm = (k?: string) => !k || permissions.includes(k);

  return (
    <div className="mobile-more-sheet__backdrop" onClick={onClose}>
      <div className="mobile-more-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-more-sheet__handle" />
        <div className="mobile-more-sheet__header">
          <span>Más módulos</span>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="mobile-more-sheet__body">
          {GROUPS.map((g) => {
            const visible = g.items.filter((i) => hasPerm(i.permissionKey));
            if (visible.length === 0) return null;
            return (
              <div key={g.title} className="mobile-more-sheet__group">
                <div className="mobile-more-sheet__group-title">{g.title}</div>
                <div className="mobile-more-sheet__grid">
                  {visible.map((it) => {
                    const Icon = it.icon;
                    const targetTo = it.label === 'Tienda online' ? `/tienda/${slug}` : it.to;
                    return (
                      <button key={it.to} type="button" className="mobile-more-sheet__item"
                        onClick={() => { onClose(); navigate(targetTo); }}>
                        <Icon size={18} />
                        <span>{it.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
