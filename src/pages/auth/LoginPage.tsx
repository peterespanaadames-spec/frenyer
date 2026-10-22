import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { refreshSupabaseStatus, type SupabaseServerStatus } from '../../lib/supabase/client';
import {
  Sparkles,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  ShieldCheck,
  Building,
  ShoppingBag
} from 'lucide-react';

type TabMode = 'email' | 'accessKey';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithEmail, signUpWithEmail, signInWithAccessKey, signInWithGoogle } = useAuth();

  // Modo inicial: login o registro
  const isRegisterInitial = location.pathname.includes('registro');
  const [isRegister, setIsRegister] = useState(isRegisterInitial);
  const [activeTab, setActiveTab] = useState<TabMode>('email');

  // Campos
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [accountRole, setAccountRole] = useState<'gerente' | 'cliente'>('gerente');
  const [showPassword, setShowPassword] = useState(false);

  // Estados de carga y mensajes
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<SupabaseServerStatus | null>(null);

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  useEffect(() => {
    let isMounted = true;

    const loadStatus = async () => {
      const serverStatus = await refreshSupabaseStatus();
      if (!isMounted) return;
      setStatus(serverStatus);

      // Si Supabase no está conectado pero hay clave local, sugerir pestaña de clave
      if (!serverStatus.supabaseConnected && serverStatus.localAccessEnabled) {
        setActiveTab('accessKey');
      }
    };

    void loadStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  // Rellenar credenciales del administrador principal
  const handleUseAdminCredentials = () => {
    setActiveTab('email');
    setIsRegister(false);
    setEmail('fotocopiasfyp@gmail.com');
    setPassword('Password123!');
    setError(null);
    setSuccessMessage('Credenciales de administrador cargadas. Haz clic en "Iniciar Sesión".');
  };

  // Rellenar clave maestra rápida
  const handleUseQuickKey = () => {
    setActiveTab('accessKey');
    setAccessKey('admin123');
    setEmail('fotocopiasfyp@gmail.com');
    setError(null);
  };

  const handleAccessKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const keyToUse = accessKey.trim();
    if (!keyToUse) {
      setError('Ingresa la clave de acceso del administrador.');
      return;
    }

    setLoading(true);
    try {
      const { error: accessKeyError } = await signInWithAccessKey(
        keyToUse,
        email.trim() || 'fotocopiasfyp@gmail.com'
      );
      if (accessKeyError) {
        setError(accessKeyError.message || 'Clave de acceso incorrecta.');
      } else {
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      setError(err?.message || 'Error inesperado al validar la clave.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError('Por favor completa el correo y la contraseña.');
      return;
    }

    if (isRegister) {
      if (!fullName.trim()) {
        setError('Por favor introduce tu nombre completo.');
        return;
      }
      if (cleanPassword !== confirmPassword.trim()) {
        setError('Las contraseñas no coinciden.');
        return;
      }
      if (cleanPassword.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres.');
        return;
      }

      setLoading(true);
      try {
        const { error: signUpError } = await signUpWithEmail(
          cleanEmail,
          cleanPassword,
          fullName.trim(),
          accountRole
        );
        if (signUpError) {
          setError(signUpError.message || 'Error al crear la cuenta.');
        } else {
          // Si el usuario registrado es administrador/gerente, dirigir al dashboard
          if (accountRole === 'gerente') {
            navigate('/dashboard', { replace: true });
          } else {
            navigate('/', { replace: true });
          }
        }
      } catch (err: any) {
        setError(err?.message || 'Error inesperado durante el registro.');
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        const { error: signInError } = await signInWithEmail(cleanEmail, cleanPassword);
        if (signInError) {
          setError(signInError.message || 'Error al iniciar sesión. Verifica tu correo y contraseña.');
        } else {
          const storedRole = (localStorage.getItem('frenyer_user_role') || '').toLowerCase();
          const internalRoles = [
            'gerente',
            'administrador',
            'admin',
            'cajero',
            'ventas',
            'inventario',
            'almacenista',
            'contador',
            'superadmin',
            'soporte',
            'director',
            'propietario',
            'asociado',
            'personal'
          ];
          if (internalRoles.includes(storedRole)) {
            navigate('/dashboard', { replace: true });
          } else {
            navigate('/', { replace: true });
          }
        }
      } catch (err: any) {
        setError(err?.message || 'Error inesperado al iniciar sesión.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error: googleError } = await signInWithGoogle();
      if (googleError) {
        setError(googleError.message || 'No se pudo conectar con Google.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error iniciando sesión con Google.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <main className="auth-page">
      {/* Botón Volver al Catálogo */}
      <Link to="/" className="auth-back-link">
        <ArrowLeft className="w-4 h-4" />
        <span>Volver a la tienda</span>
      </Link>

      <section className="auth-container">
        {/* Cabecera */}
        <header className="auth-header">
          <div className="auth-logo-icon">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="auth-title">
            {activeTab === 'accessKey'
              ? 'Acceso de Administrador'
              : isRegister
              ? 'Crear Cuenta'
              : 'Bienvenido a Frenyer'}
          </h2>
          <p className="auth-subtitle">
            {activeTab === 'accessKey'
              ? 'Ingreso directo al panel ERP con clave maestra'
              : isRegister
              ? 'Genera tu usuario para acceder al sistema o comprar'
              : 'Accede a tu panel administrativo o portal de compras'}
          </p>
        </header>

        {/* Tarjeta de Autenticación */}
        <div className="auth-card" style={{ display: 'block' }}>
          {/* Selector de Pestañas: Correo vs Clave Maestra */}
          <div className="auth-tabs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('email');
                setError(null);
              }}
              className={`auth-tab ${activeTab === 'email' ? 'active' : ''}`}
            >
              <Mail className="w-4 h-4" />
              <span>Correo y Contraseña</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('accessKey');
                setError(null);
              }}
              className={`auth-tab ${activeTab === 'accessKey' ? 'active' : ''}`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Clave de Administrador</span>
            </button>
          </div>

          {/* Mensajes de Alerta */}
          {error && (
            <div className="auth-alert-error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="auth-alert-success">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Tarjeta de Acceso Rápido Recomendado para Administrador */}
          <div className="auth-quick-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <strong>Acceso rápido de Administrador</strong>
            </div>
            <div>
              Usuario principal: <code>fotocopiasfyp@gmail.com</code> / Contraseña: <code>Password123!</code>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleUseAdminCredentials}
                className="auth-quick-btn"
              >
                Rellenar cuenta de Administrador
              </button>
              <button
                type="button"
                onClick={handleUseQuickKey}
                className="auth-quick-btn"
                style={{ background: '#f1f5f9', borderColor: '#cbd5e1', color: '#334155' }}
              >
                Usar clave "admin123"
              </button>
            </div>
          </div>

          {activeTab === 'accessKey' ? (
            /* --- FORMULARIO CON CLAVE DE ADMINISTRADOR --- */
            <form className="auth-form" onSubmit={handleAccessKeySubmit}>
              <div className="auth-field">
                <label>Clave de acceso de Administrador</label>
                <div className="auth-input-wrapper">
                  <KeyRound className="auth-input-icon" style={{ width: 16, height: 16 }} />
                  <input
                    type="password"
                    required
                    autoFocus
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    placeholder="Escribe admin123 o tu clave secreta"
                    className="auth-input"
                  />
                </div>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Puedes usar la clave directa <strong>admin123</strong> para ingresar al ERP.
                </span>
              </div>

              <div className="auth-field">
                <label>Correo de sesión (opcional)</label>
                <div className="auth-input-wrapper">
                  <Mail className="auth-input-icon" style={{ width: 16, height: 16 }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="fotocopiasfyp@gmail.com"
                    className="auth-input"
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="auth-submit-btn">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Entrar al Panel ERP</span>
              </button>
            </form>
          ) : (
            /* --- FORMULARIO CON CORREO / CONTRASEÑA --- */
            <>
              {/* Botón de Google OAuth */}
              {!isRegister && status?.supabaseConnected && (
                <>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={googleLoading || loading}
                    className="auth-social-btn"
                  >
                    {googleLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <svg viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                    )}
                    <span>Continuar con Google</span>
                  </button>

                  <div className="auth-divider">
                    <span>o con correo electrónico</span>
                  </div>
                </>
              )}

              <form className="auth-form" onSubmit={handleSubmit}>
                {isRegister && (
                  <>
                    <div className="auth-field">
                      <label>Nombre Completo</label>
                      <div className="auth-input-wrapper">
                        <User className="auth-input-icon" style={{ width: 16, height: 16 }} />
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Ej. Juan Pérez"
                          className="auth-input"
                        />
                      </div>
                    </div>

                    <div className="auth-field">
                      <label>Tipo de acceso al sistema</label>
                      <div className="auth-role-select">
                        <button
                          type="button"
                          onClick={() => setAccountRole('gerente')}
                          className={`auth-role-option ${accountRole === 'gerente' ? 'selected' : ''}`}
                        >
                          <Building style={{ width: 14, height: 14, display: 'inline', marginRight: 4 }} />
                          Administrador / ERP
                        </button>
                        <button
                          type="button"
                          onClick={() => setAccountRole('cliente')}
                          className={`auth-role-option ${accountRole === 'cliente' ? 'selected' : ''}`}
                        >
                          <ShoppingBag style={{ width: 14, height: 14, display: 'inline', marginRight: 4 }} />
                          Cliente Tienda
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className="auth-field">
                  <label>Correo Electrónico</label>
                  <div className="auth-input-wrapper">
                    <Mail className="auth-input-icon" style={{ width: 16, height: 16 }} />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      className="auth-input"
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label>Contraseña</label>
                  <div className="auth-input-wrapper">
                    <Lock className="auth-input-icon" style={{ width: 16, height: 16 }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="auth-input has-toggle"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="auth-toggle-visibility"
                      title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {showPassword ? (
                        <EyeOff style={{ width: 16, height: 16 }} />
                      ) : (
                        <Eye style={{ width: 16, height: 16 }} />
                      )}
                    </button>
                  </div>
                </div>

                {isRegister && (
                  <div className="auth-field">
                    <label>Confirmar Contraseña</label>
                    <div className="auth-input-wrapper">
                      <Lock className="auth-input-icon" style={{ width: 16, height: 16 }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repite tu contraseña"
                        className="auth-input"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="auth-submit-btn"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isRegister ? 'Crear Cuenta e Ingresar' : 'Iniciar Sesión'}</span>
                </button>
              </form>

              {/* Alternar entre Login y Registro */}
              <div className="auth-footer">
                <span>{isRegister ? '¿Ya tienes una cuenta?' : '¿No tienes cuenta aún?'}</span>{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="auth-footer-btn"
                >
                  {isRegister ? 'Inicia sesión aquí' : 'Genera tu usuario gratis'}
                </button>
              </div>
            </>
          )}
        </div>

        {status && (
          <p className="auth-status-note" style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
            Base de datos: {status.supabaseConnected ? 'Conectada (Supabase)' : 'Modo local activo'}
          </p>
        )}
      </section>
    </main>
  );
}
