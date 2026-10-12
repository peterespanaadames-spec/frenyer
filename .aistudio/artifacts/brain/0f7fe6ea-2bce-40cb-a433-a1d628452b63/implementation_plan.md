# Implementation Plan - Inventory Fixes & Enhancements

## Proposed Changes

### Inventory Module (`/src/modules/inventory/pages/Inventory.tsx`)
1. **Fix Delete Action**:
   - Ensure `deleteProductFromSupabase` properly handles deletion by SKU in Supabase and updates local state.
   - Add confirmation prompt (`window.confirm`) before deleting.
2. **Fix Stock Adjustment**:
   - Repair `handleSaveAdjustment` to correctly update stock in Supabase via `updateProductStockInSupabase` and refresh local inventory list.
3. **Remove '+' and '-' Buttons**:
   - Remove the plus and minus quick stock adjustment buttons from the product table action buttons.
4. **Product Movement History (Kárdex) Modal**:
   - Create a dedicated modal dialog (`historyModalProduct`) showing observed movements (entries from purchases/adjustments, exits from sales, and current stock).
   - Wire the clock/history button on each product row to open this modal.

## Verification Plan

### Automated Tests
- Run `compile_applet` to verify TypeScript types and build success.
- Run `lint_applet` to verify clean ESLint output.

### Manual Verification
- Test product deletion with confirmation.
- Test manual stock adjustment (`SlidersHorizontal`) and verify state update.
- Verify '+' and '-' buttons are removed from table rows.
- Click the history icon on a product and verify the movement history modal displays entries, exits, and current stock.
