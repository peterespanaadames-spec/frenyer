import { useEffect, useState } from 'react';
import { ExitGuardModal } from '../modules/shop/components/ExitGuardModal';
import { useExitGuard } from '../modules/shop/hooks/useExitGuard';

/**
 * Lee la cantidad de artículos del carrito persistido de la tienda
 * ('frenyer_shop_cart' es el mismo mecanismo de persistencia que usa ShopPage:
 * el carrito sobrevive cierres y recargas, la advertencia evita perderlo por accidente).
 */
function readShopCartUnits(): number {
  if (typeof window === 'undefined') return 0;
  try {
    let totalUnits = 0;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || (key !== 'frenyer_shop_cart' && !key.startsWith('frenyer_shop_cart_'))) {
        continue;
      }
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsedCart = JSON.parse(raw);
      if (!Array.isArray(parsedCart)) continue;
      totalUnits += parsedCart.reduce(
        (acc: number, item: any) => acc + (Number(item?.quantity) || 0),
        0
      );
    }
    return totalUnits;
  } catch {
    return 0;
  }
}

/**
 * Guardia de salida GLOBAL de la ventana.
 *
 * Vive a nivel de la aplicación (main.tsx), no solo en la tienda: se resuelve
 * el hallazgo por el cual la advertencia `beforeunload` no aparece cuando el
 * usuario estaba en otras pantallas del panel (el listener anterior se
 * desmontaba al salir de ShopPage).
 *
 * Se arma solo cuando hay artículos en el carrito; sin riesgo no toca el
 * history ni interfiere con la navegación o el cierre de pestaña.
 */
export function AppExitGuard() {
  const [cartUnits, setCartUnits] = useState(readShopCartUnits);

  useEffect(() => {
    const syncCartUnits = () => setCartUnits(readShopCartUnits());
    // Cambios en la misma pestaña lo avisa ShopPage; otras pestañas via 'storage'.
    window.addEventListener('frenyer:cart-changed', syncCartUnits);
    window.addEventListener('storage', syncCartUnits);
    return () => {
      window.removeEventListener('frenyer:cart-changed', syncCartUnits);
      window.removeEventListener('storage', syncCartUnits);
    };
  }, []);

  const exitGuard = useExitGuard({ enabled: cartUnits > 0 });

  return (
    <ExitGuardModal
      isOpen={exitGuard.isExitPromptOpen}
      onStay={exitGuard.stay}
      onAbandon={exitGuard.abandon}
    />
  );
}
