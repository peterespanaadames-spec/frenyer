import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  FileText,
  FileBarChart2,
  Package,
  Box,
  Inbox,
  ArrowLeftRight,
  Landmark,
  Banknote,
  Building,
  Receipt,
  CircleDollarSign,
  FileSpreadsheet,
  Coins,
  Users,
  User,
  Truck,
  Megaphone,
  Percent,
  Heart,
  Settings,
  ChevronDown
} from 'lucide-react';

interface SidebarItem {
  label: string;
  icon: any;
  to?: string;
  children?: {
    label: string;
    icon: any;
    to: string;
  }[];
}

export function Sidebar() {
  const location = useLocation();

  // Define the menu structure exactly as shown in the image
  const menuItems: SidebarItem[] = [
    {
      label: 'Dashboard',
      icon: LayoutDashboard,
      to: '/',
    },
    {
      label: 'Ventas Flash',
      icon: ShoppingCart,
      children: [
        { label: 'Ventas', icon: ShoppingCart, to: '/ventas-flash/ventas' },
        { label: 'Pedidos', icon: ClipboardList, to: '/ventas-flash/pedidos' },
        { label: 'Cotizaciones', icon: FileText, to: '/ventas-flash/cotizaciones' },
        { label: 'Reporte de ventas', icon: FileBarChart2, to: '/ventas-flash/reporte' },
      ],
    },
    {
      label: 'Inventarios',
      icon: Package,
      children: [
        { label: 'Productos', icon: Box, to: '/inventarios/productos' },
        { label: 'Compras internas', icon: Inbox, to: '/inventarios/compras' },
        { label: 'Movimientos', icon: ArrowLeftRight, to: '/inventarios/movimientos' },
      ],
    },
    {
      label: 'Cuentas',
      icon: Landmark,
      children: [
        { label: 'Caja', icon: Banknote, to: '/cuentas/caja' },
        { label: 'Cuentas bancarias', icon: Building, to: '/cuentas/bancos' },
        { label: 'Cuentas por cobrar', icon: Receipt, to: '/cuentas/cobrar' },
        { label: 'Cuentas por pagar', icon: CircleDollarSign, to: '/cuentas/pagar' },
        { label: 'Reporte de cuentas', icon: FileSpreadsheet, to: '/cuentas/reporte' },
      ],
    },
    {
      label: 'Gastos',
      icon: Coins,
      to: '/gastos',
    },
    {
      label: 'Gestión de Contactos',
      icon: Users,
      children: [
        { label: 'Clientes', icon: User, to: '/contactos/clientes' },
        { label: 'Proveedores', icon: Truck, to: '/contactos/proveedores' },
      ],
    },
    {
      label: 'Marketing',
      icon: Megaphone,
      to: '/marketing',
    },
    {
      label: 'Finanzas',
      icon: Percent,
      children: [
        { label: 'Salud de empresa', icon: Heart, to: '/finanzas/salud' },
        { label: 'Ganancias y pérdidas', icon: Percent, to: '/finanzas/ganancias-perdidas' },
      ],
    },
  ];

  // Expanded sections state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Auto-expand sections that have active children
  useEffect(() => {
    const newExpanded = { ...expanded };
    let changed = false;

    menuItems.forEach((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some((child) => location.pathname === child.to);
        if (hasActiveChild && !expanded[item.label]) {
          newExpanded[item.label] = true;
          changed = true;
        }
      }
    });

    if (changed) {
      setExpanded(newExpanded);
    }
  }, [location.pathname]);

  const toggleExpand = (label: string) => {
    setExpanded((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        Fren<span>y</span>er
      </div>
      <div className="nav-section">Principal</div>
      
      <div className="sidebar-nav">
        {menuItems.map((item) => {
          const Icon = item.icon;
          
          if (item.children) {
            const isSectionOpen = !!expanded[item.label];
            const hasActiveChild = item.children.some((child) => location.pathname === child.to);
            
            return (
              <div key={item.label} className="sidebar-group">
                <button
                  onClick={() => toggleExpand(item.label)}
                  className={`sidebar-parent ${hasActiveChild ? 'active-parent' : ''}`}
                >
                  <span className="sidebar-parent-label">
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </span>
                  <ChevronDown
                    size={14}
                    className={`sidebar-chevron ${isSectionOpen ? 'open' : ''}`}
                  />
                </button>
                
                {isSectionOpen && (
                  <div className="sidebar-children-container">
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={({ isActive }) =>
                            `sidebar-child ${isActive ? 'active' : ''}`
                          }
                        >
                          <ChildIcon size={15} />
                          <span>{child.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          } else {
            return (
              <NavLink
                key={item.to}
                to={item.to!}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `sidebar-parent ${isActive ? 'active' : ''}`
                }
              >
                <span className="sidebar-parent-label">
                  <Icon size={18} />
                  <span>{item.label}</span>
                </span>
              </NavLink>
            );
          }
        })}
      </div>

      <div className="sidebar-bottom" style={{ marginTop: 'auto', paddingTop: '16px' }}>
        <NavLink
          to="/configuracion"
          className={({ isActive }) =>
            `sidebar-parent ${isActive ? 'active-config' : 'config-link'}`
          }
        >
          <span className="sidebar-parent-label">
            <Settings size={18} />
            <span>Configuración</span>
          </span>
        </NavLink>
        
        <div style={{ padding: '12px 12px 4px 12px', fontSize: 11, color: '#9298a5' }}>
          Gestión empresarial
          <br />
          Bs. / USD
        </div>
      </div>
    </aside>
  );
}
