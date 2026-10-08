import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Building2, Eye, EyeOff, LockKeyhole, LogIn, Mail, UserRound, Database } from 'lucide-react';
import { supabase } from '../../lib/supabase/client';
import { SupabaseConnectionModal } from '../modals/SupabaseConnectionModal';

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
      theme: 'light';
    }
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type AuthMode = 'signIn' | 'signUp' | 'forgotPassword' | 'resetPassword';

interface AuthScreenProps {
  isLoading: boolean;
  isConfigured: boolean;
  message: string;
  canSignOut: boolean;
  onAuthenticated: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function AuthScreen({
  isLoading,
  isConfigured,
  message,
  canSignOut,
  onAuthenticated,
  onSignOut
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [isDbModalOpen, setIsDbModalOpen] = useState(false);
  const captchaContainerRef = useRef<HTMLDivElement>(null);
  const captchaWidgetId = useRef<string | null>(null);
  const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

  useEffect(() => {
    if (!captchaSiteKey) return;

    let isMounted = true;
    let script: HTMLScriptElement | null = null;
    const renderCaptcha = () => {
      if (!isMounted || !captchaContainerRef.current || !window.turnstile || captchaWidgetId.current) return;
      captchaWidgetId.current = window.turnstile.render(captchaContainerRef.current, {
        sitekey: captchaSiteKey,
        theme: 'light',
        callback: (token) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => {
          setCaptchaToken('');
          setErrorMessage('No se pudo completar la verificación antispam. Inténtalo de nuevo.');
        }
      });
    };

    if (window.turnstile) {
      renderCaptcha();
    } else {
      script = document.getElementById('cloudflare-turnstile') as HTMLScriptElement | null;
      const isNewScript = !script;
      if (!script) {
        script = document.createElement('script');
        script.id = 'cloudflare-turnstile';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
      }
      script.addEventListener('load', renderCaptcha);
      if (isNewScript) document.head.appendChild(script);
    }

    return () => {
      isMounted = false;
      script?.removeEventListener('load', renderCaptcha);
      if (captchaWidgetId.current && window.turnstile) {
        window.turnstile.remove(captchaWidgetId.current);
        captchaWidgetId.current = null;
      }
    };
  }, [captchaSiteKey]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('auth') === 'recovery') {
      setMode('resetPassword');
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('resetPassword');
        setFeedback('');
        setErrorMessage('');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFeedback('');
    setErrorMessage('');
    setPassword('');
    setConfirmation('');
    setCaptchaToken('');
    if (captchaWidgetId.current && window.turnstile) {
      window.turnstile.reset(captchaWidgetId.current);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback('');
    setErrorMessage('');

    try {
      if (captchaSiteKey && !captchaToken) {
        throw new Error('Completa la verificación antispam para continuar.');
      }

      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
          options: { captchaToken: captchaToken || undefined }
        });
        if (error) throw error;
        setPassword('');
        await onAuthenticated();
      } else if (mode === 'signUp') {
        if (password.length < 8) {
          throw new Error('La contraseña debe tener al menos 8 caracteres.');
        }
        if (password !== confirmation) {
          throw new Error('Las contraseñas no coinciden.');
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName.trim(),
              company_name: organizationName.trim()
            },
            captchaToken: captchaToken || undefined
          }
        });
        if (error) throw error;

        setPassword('');
        setConfirmation('');
        if (data.session) {
          await onAuthenticated();
        } else {
          setMode('signIn');
          setFeedback('Revisa tu correo para confirmar la cuenta y completar el registro.');
        }
      } else if (mode === 'forgotPassword') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/?auth=recovery`,
          captchaToken: captchaToken || undefined
        });
        if (error) throw error;
        setFeedback('Si existe una cuenta con ese correo, recibirás instrucciones para recuperar el acceso.');
      } else {
        if (password.length < 8) {
          throw new Error('La nueva contraseña debe tener al menos 8 caracteres.');
        }
        if (password !== confirmation) {
          throw new Error('Las contraseñas no coinciden.');
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword('');
        setConfirmation('');
        setFeedback('Contraseña actualizada. Ya puedes ingresar.');
        setMode('signIn');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo completar la solicitud.');
    } finally {
      setIsSubmitting(false);
      if (captchaWidgetId.current && window.turnstile) {
        setCaptchaToken('');
        window.turnstile.reset(captchaWidgetId.current);
      }
    }
  };

  const isPasswordMode = mode === 'signIn' || mode === 'signUp' || mode === 'resetPassword';
  const title = mode === 'signUp'
    ? 'Crear cuenta'
    : mode === 'forgotPassword'
      ? 'Recuperar contraseña'
      : mode === 'resetPassword'
        ? 'Nueva contraseña'
        : 'Iniciar sesión';

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <a className="auth-brand" href="/" aria-label="Frenyer, inicio">
          <span className="auth-brand-mark">F</span>
          <span>frenyer<span className="auth-brand-period">.</span></span>
        </a>

        <h1 id="auth-title">{title}</h1>
        <p className="auth-subtitle">
          {mode === 'signUp'
            ? 'Registra tu negocio y comienza a gestionarlo.'
            : mode === 'forgotPassword'
              ? 'Te enviaremos instrucciones para recuperar el acceso.'
              : mode === 'resetPassword'
                ? 'Elige una contraseña nueva y segura.'
                : 'Ingresa a tu espacio de gestión empresarial.'}
        </p>

        {isLoading ? (
          <p className="auth-status" role="status">Verificando sesión...</p>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {!isConfigured && (
              <div
                style={{
                  padding: '12px 14px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 10,
                  marginBottom: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
              >
                <div style={{ fontSize: 12, color: '#991b1b', lineHeight: 1.4 }}>
                  Configura la URL y la clave publicable de tu proyecto Supabase para habilitar el acceso y sincronizar los datos.
                </div>
                <button
                  type="button"
                  onClick={() => setIsDbModalOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: 'var(--brand-500)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Database size={14} /> Conectar Base de Datos Supabase
                </button>
              </div>
            )}

            {mode === 'signUp' && (
              <>
                <label className="auth-field">
                  Nombre completo
                  <span className="auth-input-wrap">
                    <UserRound size={17} aria-hidden="true" />
                    <input
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Tu nombre"
                      maxLength={100}
                      required
                      disabled={!isConfigured}
                    />
                  </span>
                </label>
                <label className="auth-field">
                  Nombre de la empresa
                  <span className="auth-input-wrap">
                    <Building2 size={17} aria-hidden="true" />
                    <input
                      type="text"
                      autoComplete="organization"
                      value={organizationName}
                      onChange={(event) => setOrganizationName(event.target.value)}
                      placeholder="Mi empresa"
                      maxLength={80}
                      required
                      disabled={!isConfigured}
                    />
                  </span>
                </label>
              </>
            )}

            <label className="auth-field">
              Correo electrónico
              <span className="auth-input-wrap">
                <Mail size={17} aria-hidden="true" />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="correo@ejemplo.com"
                  required
                  disabled={!isConfigured}
                />
              </span>
            </label>

            {isPasswordMode && (
              <>
                <label className="auth-field">
                  {mode === 'resetPassword' ? 'Nueva contraseña' : 'Contraseña'}
                  <span className="auth-input-wrap">
                    <LockKeyhole size={17} aria-hidden="true" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      minLength={8}
                      required
                      disabled={!isConfigured}
                    />
                    <button
                      className="auth-password-toggle"
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>
                {(mode === 'signUp' || mode === 'resetPassword') && (
                  <label className="auth-field">
                    Confirmar contraseña
                    <span className="auth-input-wrap">
                      <LockKeyhole size={17} aria-hidden="true" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                        placeholder="Repite la contraseña"
                        minLength={8}
                        required
                        disabled={!isConfigured}
                      />
                    </span>
                  </label>
                )}
              </>
            )}

            {mode === 'signIn' && (
              <button className="auth-text-button auth-forgot" type="button" onClick={() => changeMode('forgotPassword')}>
                ¿Olvidaste tu contraseña?
              </button>
            )}

            {captchaSiteKey && <div className="auth-captcha" ref={captchaContainerRef} />}
            {!captchaSiteKey && (
              <p className="auth-captcha-note">
                Puedes activar la verificación antispam de Cloudflare Turnstile en la configuración de Supabase.
              </p>
            )}

            {message && <p className="auth-message error" role="alert">{message}</p>}
            {errorMessage && <p className="auth-message error" role="alert">{errorMessage}</p>}
            {feedback && <p className="auth-message success" role="status">{feedback}</p>}

            <button
              className="auth-submit"
              type="submit"
              disabled={!isConfigured || isSubmitting}
            >
              <LogIn size={17} aria-hidden="true" />
              {isSubmitting
                ? 'Procesando...'
                : mode === 'signUp'
                  ? 'Crear cuenta'
                  : mode === 'forgotPassword'
                    ? 'Enviar instrucciones'
                    : mode === 'resetPassword'
                      ? 'Guardar contraseña'
                      : 'Iniciar sesión'}
            </button>
          </form>
        )}

        <div className="auth-switch">
          {mode === 'signIn' ? (
            <>¿No tienes una cuenta?{' '}
              <button className="auth-text-button" type="button" onClick={() => changeMode('signUp')}>Regístrate aquí</button>
            </>
          ) : mode === 'signUp' ? (
            <>¿Ya tienes una cuenta?{' '}
              <button className="auth-text-button" type="button" onClick={() => changeMode('signIn')}>Inicia sesión</button>
            </>
          ) : (
            <button className="auth-text-button auth-back" type="button" onClick={() => changeMode('signIn')}>
              <ArrowLeft size={15} /> Volver a iniciar sesión
            </button>
          )}
        </div>
        {canSignOut && (
          <button className="auth-text-button auth-signout" type="button" onClick={() => void onSignOut()}>
            Cerrar sesión de esta cuenta
          </button>
        )}
        <p className="auth-footer">Acceso protegido para la gestión de tu negocio.</p>
      </section>

      <SupabaseConnectionModal
        isOpen={isDbModalOpen}
        onClose={() => setIsDbModalOpen(false)}
        onConnected={async () => {
          setIsDbModalOpen(false);
          await onAuthenticated();
        }}
      />
    </main>
  );
}
