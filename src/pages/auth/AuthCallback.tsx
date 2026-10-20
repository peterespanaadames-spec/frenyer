import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase/client';
import { Sparkles, AlertCircle } from 'lucide-react';

export function AuthCallback() {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const processAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          if (isMounted) setErrorMsg(error.message);
          return;
        }

        if (data?.session?.user) {
          // Verificar si tiene rol de cliente o administrativo
          const user = data.session.user;
          const role = (user.user_metadata?.role || '').toLowerCase();

          if (role === 'cliente' || role === 'customer') {
            navigate('/', { replace: true });
          } else {
            navigate('/dashboard', { replace: true });
          }
        } else {
          // Si no hay sesión inmediata, suscribirse al evento de cambio
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user && isMounted) {
              subscription.unsubscribe();
              const role = (session.user.user_metadata?.role || '').toLowerCase();
              if (role === 'cliente' || role === 'customer') {
                navigate('/', { replace: true });
              } else {
                navigate('/dashboard', { replace: true });
              }
            }
          });

          // Timeout de seguridad por si falla la autenticación
          setTimeout(() => {
            if (isMounted) {
              navigate('/login', { replace: true });
            }
          }, 6000);
        }
      } catch (err: any) {
        if (isMounted) setErrorMsg(err?.message || 'Error procesando la autenticación.');
      }
    };

    processAuth();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center p-4">
      <div className="bg-[#121827] border border-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
        {errorMsg ? (
          <>
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4 text-red-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-white font-medium text-lg mb-2">Error de autenticación</h3>
            <p className="text-slate-400 text-sm mb-6">{errorMsg}</p>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition-all"
            >
              Volver al inicio de sesión
            </button>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/20 animate-pulse">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-white font-medium text-lg mb-1">Completando autenticación</h3>
            <p className="text-slate-400 text-sm">Validando credenciales y preparando tu sesión...</p>
          </>
        )}
      </div>
    </div>
  );
}
