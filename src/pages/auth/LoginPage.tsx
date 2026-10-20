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
  Loader2
} from 'lucide-react';

type AuthMode = 'supabase' | 'local' | 'unavailable';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithEmail, signUpWithEmail, signInWithAccessKey, signInWithGoogle } = useAuth();

  // Modo: login o registro
  const isRegisterInitial = location.pathname.includes('registro');
  const [isRegister, setIsRegister] = useState(isRegisterInitial);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<SupabaseServerStatus | null>(null);
  const [mode, setMode] = useState<AuthMode>('supabase');

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  useEffect(() => {
    let isMounted = true;

    const loadStatus = async () => {
      const serverStatus = await refreshSupabaseStatus();
      if (!isMounted) return;
      setStatus(serverStatus);

      if (serverStatus.supabaseConfigured && serverStatus.supabaseConnected) {
        setMode('supabase');
      } else if (serverStatus.localAccessEnabled) {
        setMode('local');
      } else {
        setMode('unavailable');
      }
    };

    void loadStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAccessKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!accessKey.trim()) {
      setError('Ingresa la clave de acceso del administrador.');
      return;
    }

    setLoading(true);
    try {
      const { error: accessKeyError } = await signInWithAccessKey(
        accessKey.trim(),
        email.trim() || undefined
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

    if (!email.trim() || !password.trim()) {
      setError('Por favor completa todos los campos requeridos.');
      return;
    }

    if (isRegister) {
      if (!fullName.trim()) {
        setError('Por favor introduce tu nombre completo.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
        return;
      }
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres.');
        return;
      }

      setLoading(true);
      try {
        const { error: signUpError } = await signUpWithEmail(email.trim(), password, fullName.trim());
        if (signUpError) {
          setError(signUpError.message || 'Error al crear la cuenta.');
        } else {
          setSuccessMessage('¡Cuenta creada exitosamente! Revisa tu correo o inicia sesión.');
          setIsRegister(false);
        }
      } catch (err: any) {
        setError(err?.message || 'Error inesperado durante el registro.');
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        const { error: signInError } = await signInWithEmail(email.trim(), password);
        if (signInError) {
          setError(signInError.message || 'Error al iniciar sesión.');
        } else {
          navigate(from, { replace: true });
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

  const isLocalMode = mode === 'local';
  const isUnavailable = mode === 'unavailable';

  return (
    <div className="auth-page">
      {/* Botón Volver a la Tienda */}
      <Link to="/" className="auth-back-link">
        <ArrowLeft className="w-4 h-4" />
        <span>Volver al catálogo</span>
      </Link>

      <div className="auth-container">
        {/* Cabecera / Marca */}
        <div className="auth-header">
          <div className="auth-logo-icon">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="auth-title">
            {isLocalMode ? 'Acceso al panel' : isRegister ? 'Crea tu cuenta' : 'Bienvenido a Frenyer'}
          </h2>
          <p className="auth-subtitle">
            {isLocalMode
              ? 'Introduce la clave de acceso del administrador para continuar'
              : isRegister
              ? 'Regístrate para gestionar pedidos y cotizaciones'
              : 'Accede a tu panel administrativo y de comercio'}
          </p>
        </div>

        {/* Tarjeta de Formulario */}
        <div className="auth-card">
          {/* Mensajes de Alerta */}
          {error && (
            <div className="auth-alert-error">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="auth-alert-success">
              <CheckCircle2 className="w-4 h-4" />
              <span>{successMessage}</span>
            </div>
          )}

          {isUnavailable && (
            <div className="auth-db-banner">
              <div className="auth-db-banner-copy">
                <strong>Servicio no disponible</strong>
                <span>
                  El servidor no tiene configurada la base de datos ni el acceso directo.
                  La tienda pública sigue operativa. Para habilitar el panel, el
                  administrador debe configurar la conexión en el servidor.
                </span>
              </div>
            </div>
          )}

          {isLocalMode ? (
            <form className="auth-form" onSubmit={handleAccessKeySubmit}>
              <div className="auth-field">
                <label>Clave de acceso</label>
                <div className="auth-input-wrapper">
                  <KeyRound className="w-4 h-4 auth-input-icon" style={{ width: 16, height: 16 }} />
                  <input
                    type="password"
                    required
                    autoFocus
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    placeholder="••••••••••"
                    className="auth-input"
                  />
                </div>
              </div>

              <div className="auth-field">
                <label>Correo electrónico (opcional)</label>
                <div className="auth-input-wrapper">
                  <Mail className="w-4 h-4 auth-input-icon" style={{ width: 16, height: 16 }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    className="auth-input"
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="auth-submit-btn">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Entrar al panel</span>
              </button>
            </form>
          ) : (
            <>
              {/* Botón de Google OAuth */}
              {mode === 'supabase' && (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading || loading}
                  className="auth-social-btn"
                >
                  {googleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
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
                  <span>{isRegister ? 'Registrarse con Google' : 'Continuar con Google'}</span>
                </button>
              )}

              {mode === 'supabase' && (
                <div className="auth-divider">
                  <span>o con correo electrónico</span>
                </div>
              )}

              {/* Formulario Principal */}
              <form className="auth-form" onSubmit={handleSubmit}>
                {isRegister && (
                  <div className="auth-field">
                    <label>Nombre Completo</label>
                    <div className="auth-input-wrapper">
                      <User className="w-4 h-4 auth-input-icon" style={{ width: 16, height: 16 }} />
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
                )}

                <div className="auth-field">
                  <label>Correo Electrónico</label>
                  <div className="auth-input-wrapper">
                    <Mail className="w-4 h-4 auth-input-icon" style={{ width: 16, height: 16 }} />
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
                    <Lock className="w-4 h-4 auth-input-icon" style={{ width: 16, height: 16 }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="auth-input has-toggle"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="auth-toggle-visibility"
                      title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" style={{ width: 16, height: 16 }} />
                      ) : (
                        <Eye className="w-4 h-4" style={{ width: 16, height: 16 }} />
                      )}
                    </button>
                  </div>
                </div>

                {isRegister && (
                  <div className="auth-field">
                    <label>Confirmar Contraseña</label>
                    <div className="auth-input-wrapper">
                      <Lock className="w-4 h-4 auth-input-icon" style={{ width: 16, height: 16 }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
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
                  <span>{isRegister ? 'Crear Cuenta' : 'Iniciar Sesión'}</span>
                </button>
              </form>

              {/* Alternar entre Iniciar Sesión y Registro */}
              <div className="auth-footer">
                <span>{isRegister ? '¿Ya tienes una cuenta?' : '¿No tienes cuenta?'}</span>{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="auth-footer-btn"
                >
                  {isRegister ? 'Inicia sesión aquí' : 'Regístrate gratis'}
                </button>
              </div>
            </>
          )}
        </div>

        {status && !isLocalMode && status.credentialsSource && (
          <p className="auth-status-note">
            Base de datos: {status.supabaseConnected ? 'conectada' : 'sin conexión'} · credenciales en el servidor
          </p>
        )}
      </div>
    </div>
  );
}
