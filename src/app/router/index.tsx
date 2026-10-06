import { createBrowserRouter } from 'react-router-dom';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { Dashboard } from '../../pages/Dashboard';
import { Sales } from '../../modules/sales/pages/Sales';
import { Inventory } from '../../modules/inventory/pages/Inventory';
import { Finance } from '../../modules/finance/pages/Finance';
import { Accounts } from '../../modules/accounts-receivable/pages/Accounts';
import { Customers } from '../../modules/customers/pages/Customers';
import { Alma } from '../../modules/alma/pages/Alma';

// Import new high-fidelity modules
import { OrdersPage } from '../../modules/sales/pages/Orders';
import { QuotesPage } from '../../modules/sales/pages/Quotes';
import { SalesReportPage } from '../../modules/sales/pages/SalesReport';
import { InternalPurchasesPage } from '../../modules/inventory/pages/InternalPurchases';
import { MovementsPage } from '../../modules/inventory/pages/Movements';
import { CashPage } from '../../modules/finance/pages/Cash';
import { BankAccountsPage } from '../../modules/finance/pages/BankAccounts';
import { AccountsPayablePage } from '../../modules/finance/pages/AccountsPayable';
import { AccountsReportPage } from '../../modules/finance/pages/AccountsReport';
import { ExpensesPage } from '../../modules/finance/pages/Expenses';
import { SuppliersPage } from '../../modules/customers/pages/Suppliers';
import { MarketingPage } from '../../modules/customers/pages/Marketing';
import { ProfitLossPage } from '../../modules/finance/pages/ProfitLoss';
import { ConfigPage } from '../../modules/alma/pages/Config';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      
      // Ventas Flash
      { path: 'ventas-flash/ventas', element: <Sales /> },
      { path: 'ventas-flash/pedidos', element: <OrdersPage /> },
      { path: 'ventas-flash/cotizaciones', element: <QuotesPage /> },
      { path: 'ventas-flash/reporte', element: <SalesReportPage /> },
      
      // Inventarios
      { path: 'inventarios/productos', element: <Inventory /> },
      { path: 'inventarios/compras', element: <InternalPurchasesPage /> },
      { path: 'inventarios/movimientos', element: <MovementsPage /> },
      
      // Cuentas
      { path: 'cuentas/caja', element: <CashPage /> },
      { path: 'cuentas/bancos', element: <BankAccountsPage /> },
      { path: 'cuentas/cobrar', element: <Accounts /> },
      { path: 'cuentas/pagar', element: <AccountsPayablePage /> },
      { path: 'cuentas/reporte', element: <AccountsReportPage /> },
      
      // Gastos
      { path: 'gastos', element: <ExpensesPage /> },
      
      // Gestión de Contactos
      { path: 'contactos/clientes', element: <Customers /> },
      { path: 'contactos/proveedores', element: <SuppliersPage /> },
      
      // Marketing
      { path: 'marketing', element: <MarketingPage /> },
      
      // Finanzas
      { path: 'finanzas/salud', element: <Finance /> },
      { path: 'finanzas/ganancias-perdidas', element: <ProfitLossPage /> },
      
      // Configuración
      { path: 'configuracion', element: <ConfigPage /> },
      
      // Alma
      { path: 'alma', element: <Alma /> },

      // Backward compatible legacy paths
      { path: 'ventas', element: <Sales /> },
      { path: 'inventario', element: <Inventory /> },
      { path: 'finanzas', element: <Finance /> },
      { path: 'cuentas', element: <Accounts /> },
      { path: 'clientes', element: <Customers /> }
    ],
  },
]);
