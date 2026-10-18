# Cuentas Financieras

## Descripción
Gestión de cuentas bancarias, cuentas por cobrar (CxC) y cuentas por pagar (CxP).

## Estructura Actual
- Ubicación: `src/modules/accounts-receivable/`, `src/modules/finance/pages/AccountsPayable.tsx`
- Componentes clave: `Accounts.tsx` (CxC), `AccountsPayable.tsx` (CxP), `BankAccounts.tsx`.

## Funcionalidades Clave
- Registro y seguimiento de CXC y CXP.
- Conciliación bancaria básica y control de saldos.
- Reportes exportables en PDF y XLS con formato profesional.

## Guía de Reestructuración / Mantenimiento
- Las operaciones de pago deben ser transaccionales para asegurar la integridad con `bank_movements`.
- Para personalizar exportes, modificar `handleExportPDF` y `handleExportXLS` en los archivos correspondientes.
- **Reportes**: Los exportes (Excel/PDF) siguen el estándar: encabezados gris oscuro con letras blancas, datos en celdas blancas/transparentes con texto oscuro. Membrete dinámico con datos del negocio.
