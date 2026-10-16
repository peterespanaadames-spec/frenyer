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
  CreditCard,
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
  ChevronDown,
  Store
} from 'lucide-react';

interface SidebarItem {
  label: string;
  icon: any;
  to?: string;
  permissionKey?: string;
  children?: {
    label: string;
    icon: any;
    to: string;
    permissionKey?: string;
  }[];
}

interface SidebarProps {
  isMobileOpen?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ isMobileOpen = false, onNavigate }: SidebarProps) {
  const location = useLocation();

  // Permisos del usuario activo (RBAC)
  const [userPermissions, setUserPermissions] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('frenyer_active_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (Array.isArray(u.permissions)) return u.permissions;
      }
      const rawPerms = localStorage.getItem('frenyer_user_permissions');
      if (rawPerms) {
        const p = JSON.parse(rawPerms);
        if (Array.isArray(p)) return p;
      }
    } catch {}
    // Default: acceso completo a todos los módulos
    return ['ventas', 'inventario', 'finanzas', 'reportes', 'usuarios'];
  });

  useEffect(() => {
    const handleUserChange = () => {
      try {
        const stored = localStorage.getItem('frenyer_active_user');
        if (stored) {
          const u = JSON.parse(stored);
          if (Array.isArray(u.permissions)) {
            setUserPermissions(u.permissions);
            return;
          }
        }
      } catch {}
      setUserPermissions(['ventas', 'inventario', 'finanzas', 'reportes', 'usuarios']);
    };

    window.addEventListener('frenyer:active-user-changed', handleUserChange);
    return () => window.removeEventListener('frenyer:active-user-changed', handleUserChange);
  }, []);

  // Define the menu structure exactly as shown in the image with RBAC keys
  const menuItems: SidebarItem[] = [
    {
      label: 'Dashboard',
      icon: LayoutDashboard,
      to: '/dashboard',
    },
    {
      label: 'Ventas Flash',
      icon: ShoppingCart,
      permissionKey: 'ventas',
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
      permissionKey: 'inventario',
      children: [
        { label: 'Productos', icon: Box, to: '/inventarios/productos' },
        { label: 'Compras internas', icon: Inbox, to: '/inventarios/compras' },
        { label: 'Movimientos', icon: ArrowLeftRight, to: '/inventarios/movimientos' },
        { label: 'Reporte diario', icon: FileText, to: '/inventarios/reporte-diario' },
      ],
    },
    {
      label: 'Cuentas',
      icon: Landmark,
      permissionKey: 'finanzas',
      children: [
        { label: 'Caja', icon: Banknote, to: '/cuentas/caja' },
        { label: 'Cuentas bancarias', icon: Building, to: '/cuentas/bancos' },
        { label: 'Cuentas por cobrar', icon: Receipt, to: '/cuentas/cobrar' },
        { label: 'Cuentas por pagar', icon: CreditCard, to: '/cuentas/pagar' },
        { label: 'Reporte de cuentas', icon: FileSpreadsheet, to: '/cuentas/reporte' },
      ],
    },
    {
      label: 'Gastos',
      icon: Coins,
      permissionKey: 'finanzas',
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
      permissionKey: 'reportes',
      children: [
        { label: 'Salud de empresa', icon: Heart, to: '/finanzas/salud' },
        { label: 'Ganancias y pérdidas', icon: Percent, to: '/finanzas/ganancias-perdidas' },
      ],
    },
  ];

  // Filtrar ítems visibles por permisos
  const visibleMenuItems = menuItems.filter(item => {
    if (!item.permissionKey) return true;
    return userPermissions.includes(item.permissionKey);
  });

  // Expanded sections state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Auto-expand sections that have active children
  useEffect(() => {
    const newExpanded = { ...expanded };
    let changed = false;

    visibleMenuItems.forEach((item) => {
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
    setExpanded((prev) => {
      const isAlreadyOpen = !!prev[label];
      return isAlreadyOpen ? {} : { [label]: true };
    });
  };

  return (
    <aside className={`sidebar${isMobileOpen ? ' mobile-open' : ''}`}>
      <div className="brand">
        Fren<span>y</span>er
      </div>
      <div className="nav-section">Principal</div>
      
      <div className="sidebar-nav">
        {visibleMenuItems.map((item) => {
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
                          onClick={onNavigate}
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
                onClick={onNavigate}
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
          to="/"
          onClick={onNavigate}
          className="sidebar-parent"
          style={{ marginBottom: 4 }}
        >
          <span className="sidebar-parent-label">
            <Store size={18} />
            <span>Tienda Online</span>
          </span>
        </NavLink>

        {userPermissions.includes('usuarios') && (
          <NavLink
            to="/configuracion"
            onClick={onNavigate}
            className={({ isActive }) =>
              `sidebar-parent ${isActive ? 'active-config' : 'config-link'}`
            }
          >
            <span className="sidebar-parent-label">
              <Settings size={18} />
              <span>Configuración</span>
            </span>
          </NavLink>
        )}
        
        <div style={{ padding: '12px 12px 4px 12px', fontSize: 11, color: '#9298a5' }}>
          Gestión empresarial
          <br />
          Bs. / USD
        </div>
      </div>
    </aside>
  );
}
