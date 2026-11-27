import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isInternalRole } from '../../lib/auth/roles';
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
  Loader2,
  Zap,
  Coins,
  BarChart3
} from 'lucide-react';

// Paleta fiel a la referencia de Frenyer (HTML)
const C = {
  dark: '#18181B',
  charcoal: '#111827',
  gold: '#FACC15',
  goldSoft: '#FEF08A',
  goldLight: '#FEFCE8',
  surface: '#F8FAFC',
  border: '#E2E8F0',
  green: '#16A34A',
  red: '#EF4444',
  slate500: '#64748B',
  slate600: '#475569',
  zinc900: '#18181B'
};

const font = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithEmail, signUpWithEmail } = useAuth();

  const isRegisterInitial = location.pathname.includes('registro');
  const [isRegister, setIsRegister] = useState(isRegisterInitial);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/public/config')
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && json?.data?.logo) setLogo(json.data.logo);
      })
      .catch(() => {});
  }, []);

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
          'cliente'
        );
        if (signUpError) {
          setError(signUpError.message || 'Error al crear la cuenta.');
        } else {
          navigate('/', { replace: true });
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
          if (isInternalRole(localStorage.getItem('frenyer_user_role'))) {
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 12,
    background: C.surface,
    border: `1px solid ${C.border}`,
    outline: 'none',
    fontSize: 14,
    fontFamily: font,
    transition: 'all 0.2s ease',
    color: C.charcoal
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: '#334155',
    marginBottom: 6
  };

  const showAuthForm = (target: 'welcome' | 'login' | 'register') => {
    // handled by isRegister state + a view state
    if (target === 'register') setIsRegister(true);
    else if (target === 'login') setIsRegister(false);
    setError(null);
    setSuccessMessage(null);
  };

  const [view, setView] = useState<'welcome' | 'login' | 'register'>(
    isRegisterInitial ? 'register' : 'welcome'
  );

  const goTo = (v: 'welcome' | 'login' | 'register') => {
    setView(v);
    setError(null);
    setSuccessMessage(null);
    if (v === 'register') setIsRegister(true);
    if (v === 'login') setIsRegister(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row', fontFamily: font, background: '#FFFFFF', overflowX: 'hidden' }} className="auth-page-v2">
      {/* ============ COLUMNA IZQUIERDA: HERO ============ */}
      <section
        className="auth-hero-col"
        style={{
          width: '100%',
          background: 'radial-gradient(circle at 0% 0%, rgba(253,224,71,0.62) 0%, rgba(254,240,138,0.42) 28%, rgba(254,249,195,0.25) 52%, rgba(255,255,255,0.95) 82%, #FFFFFF 100%), linear-gradient(135deg, #FEF08A 0%, #FEF9C3 35%, #FEFCE8 65%, #FFFFFF 100%)',
          padding: '32px 20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Encabezado móvil */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }} className="auth-mobile-header">
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', color: C.zinc900 }}>
            Frenyer<span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#FACC15', marginLeft: 3, verticalAlign: 'middle' }} />
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 600, background: 'rgba(254,240,138,0.9)', color: C.zinc900, border: '1px solid #FDE047' }}>
            Bs. / USD
          </span>
        </div>

        <div style={{ maxWidth: 640, zIndex: 10 }}>
          {/* Pill */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(226,232,240,0.9)', boxShadow: '0 1px 2px rgba(15,23,42,0.04)', marginBottom: 20 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', letterSpacing: '0.02em' }}>ERP + Punto de Venta + Tienda Online</span>
          </div>

          {/* Título */}
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: C.zinc900, letterSpacing: '-0.02em', lineHeight: 1.14, marginBottom: 16 }}>
            Tu sistema de{' '}
            <span style={{ display: 'inline-block', background: C.gold, color: C.zinc900, padding: '2px 14px', borderRadius: 12, border: '1px solid rgba(250,204,21,0.6)', boxShadow: '0 1px 2px rgba(15,23,42,0.04)', marginTop: 4 }}>
              Punto de Venta
            </span>{' '}
            y gestión total
          </h1>

          <p style={{ color: '#475569', fontSize: 16, lineHeight: 1.6, marginBottom: 24, maxWidth: 560 }}>
            Digitaliza tu negocio con <strong style={{ fontWeight: 600, color: C.zinc900 }}>Frenyer</strong>. Controla Ventas Flash, inventario multimoneda <span style={{ fontWeight: 600, color: '#1F2937' }}>(Bs. / USD)</span>, cuentas por cobrar y tu propia tienda online desde cualquier dispositivo.
          </p>

          {/* 3 Pilares */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 32 }}>
            {[
              { icon: <Zap className="w-4 h-4" />, title: 'Ventas Flash & POS', desc: 'Facturación rápida y sincrónica con tu tienda online.', bg: C.zinc900, fg: '#FACC15', border: 'none' },
              { icon: <Coins className="w-4 h-4" />, title: 'Multimoneda Bs. / USD', desc: 'Conversión automática con tasa diaria actualizada.', bg: C.goldSoft, fg: C.zinc900, border: '1px solid #FDE047' },
              { icon: <BarChart3 className="w-4 h-4" />, title: 'Control en Tiempo Real', desc: 'Alertas de bajo stock, utilidades y cuentas por cobrar.', bg: '#D1FAE5', fg: '#047857', border: '1px solid #A7F3D0' }
            ].map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)', padding: 12, borderRadius: 12, border: '1px solid rgba(226,232,240,0.8)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: p.bg, color: p.fg, border: p.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  {p.icon}
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.zinc900, lineHeight: 1.3 }}>{p.title}</p>
                  <p style={{ fontSize: 11, color: '#64748B', marginTop: 2, lineHeight: 1.3 }}>{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tarjeta flotante */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', padding: '10px 16px', borderRadius: 16, boxShadow: '0 20px 35px -8px rgba(15,23,42,0.16), 0 0 0 1px rgba(226,232,240,0.85)', width: 'fit-content', marginTop: 16, position: 'relative', zIndex: 20 }} className="auth-float-card">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16,185,129,0.1)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.zinc900 }}>Venta registrada #1048</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: C.goldSoft, color: C.zinc900 }}>Bs. / USD</span>
            </div>
            <p style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>+$42.50 USD • Inventario actualizado al instante</p>
          </div>
        </div>
      </section>

      {/* ============ COLUMNA DERECHA: PANEL DE ACCESO ============ */}
      <main style={{ width: '100%', background: '#FFFFFF', padding: '32px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 540 }} className="auth-right-col">
        {/* Barra superior derecha */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 12, background: 'rgba(254,240,138,0.8)', border: '1px solid rgba(253,224,71,0.8)', fontSize: 12, fontWeight: 700, color: C.zinc900 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669' }} />
            Bs. / USD
          </div>
        </header>

        {/* Contenedor central */}
        <div style={{ width: '100%', maxWidth: 420, margin: '0 auto', padding: '32px 0' }}>
          {/* Logotipo */}
          <div style={{ marginBottom: 28 }}>
            {logo ? (
              <img src={logo} alt="Frenyer" style={{ maxWidth: 220, maxHeight: 120, objectFit: 'contain', marginBottom: 14 }} />
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'baseline', fontWeight: 800, fontSize: 32, letterSpacing: '-0.02em', color: C.zinc900 }}>
                Frenyer<span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: C.gold, marginLeft: 3, verticalAlign: 'middle' }} />
              </div>
            )}
          </div>

          {/* --- VISTA BIENVENIDA --- */}
          {view === 'welcome' && (
            <div style={{ animation: 'fadeInUp 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: C.zinc900, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 10 }}>
                Todo tu negocio, conectado
              </h2>
              <p style={{ color: '#64748B', fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
                Lleva el control de tus ventas, deudas, inventario y tienda online sin estrés ni complicaciones.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => goTo('register')}
                  style={{ width: '100%', padding: '14px 24px', borderRadius: 12, background: C.zinc900, color: '#FFFFFF', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 10px 40px -10px rgba(15,23,42,0.08)', transition: 'all 0.2s' }}
                >
                  <span>Empezar ahora</span>
                  <ArrowLeft style={{ width: 16, height: 16, color: C.gold, transform: 'rotate(180deg)' }} />
                </button>

                <button
                  type="button"
                  onClick={() => goTo('login')}
                  style={{ width: '100%', padding: '14px 24px', borderRadius: 12, background: '#FFFFFF', color: C.zinc900, fontWeight: 700, fontSize: 15, border: '1px solid #CBD5E1', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Ya tengo una cuenta
                </button>
              </div>

              <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #F1F5F9', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, color: '#64748B' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>✓</span>
                  <span>Configuración en 2 min</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>✓</span>
                  <span>Multi-sucursal y nube</span>
                </div>
              </div>
            </div>
          )}

          {/* --- VISTA LOGIN --- */}
          {view === 'login' && (
            <div style={{ animation: 'fadeInUp 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}>
              <button
                type="button"
                onClick={() => goTo('welcome')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 20, padding: 0 }}
              >
                <ArrowLeft style={{ width: 14, height: 14 }} />
                Volver al inicio
              </button>

              <h2 style={{ fontSize: 24, fontWeight: 800, color: C.zinc900, letterSpacing: '-0.02em', marginBottom: 6 }}>
                Bienvenido de nuevo
              </h2>
              <p style={{ color: '#64748B', fontSize: 14, marginBottom: 24 }}>
                Ingresa tus credenciales para acceder a tu panel operativo.
              </p>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>
                  <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle} htmlFor="login-email">Correo electrónico</label>
                  <div style={{ position: 'relative' }}>
                    <Mail style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94A3B8' }} />
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@tunegocio.com"
                      style={{ ...inputStyle, paddingLeft: 42 }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }} htmlFor="login-pass">Contraseña</label>
                    <button type="button" onClick={() => setError('Te enviamos un enlace de recuperación a tu correo.')} style={{ fontSize: 12, fontWeight: 600, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Lock style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94A3B8' }} />
                    <input
                      id="login-pass"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{ ...inputStyle, paddingLeft: 42, paddingRight: 42 }}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: 4 }} title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}>
                      {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: '100%', padding: '14px 24px', borderRadius: 12, background: C.zinc900, color: '#FFFFFF', fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 10px 40px -10px rgba(15,23,42,0.08)', opacity: loading ? 0.7 : 1, transition: 'all 0.2s' }}
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Iniciar Sesión</span>
                  {!loading && <ArrowLeft style={{ width: 16, height: 16, color: C.gold, transform: 'rotate(180deg)' }} />}
                </button>
              </form>

              <p style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: '#64748B' }}>
                ¿Aún no tienes cuenta en Frenyer?{' '}
                <button type="button" onClick={() => goTo('register')} style={{ fontWeight: 700, color: C.zinc900, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                  Créala gratis aquí
                </button>
              </p>
            </div>
          )}

          {/* --- VISTA REGISTRO --- */}
          {view === 'register' && (
            <div style={{ animation: 'fadeInUp 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}>
              <button
                type="button"
                onClick={() => goTo('welcome')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 20, padding: 0 }}
              >
                <ArrowLeft style={{ width: 14, height: 14 }} />
                Volver al inicio
              </button>

              <h2 style={{ fontSize: 24, fontWeight: 800, color: C.zinc900, letterSpacing: '-0.02em', marginBottom: 6 }}>
                Crea tu cuenta en Frenyer
              </h2>
              <p style={{ color: '#64748B', fontSize: 14, marginBottom: 20 }}>
                Activa tu Punto de Venta, Inventario y Tienda Online en segundos.
              </p>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>
                  <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle} htmlFor="reg-name">Nombre Completo</label>
                  <div style={{ position: 'relative' }}>
                    <User style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94A3B8' }} />
                    <input
                      id="reg-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      style={{ ...inputStyle, paddingLeft: 42 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle} htmlFor="reg-email">Correo electrónico</label>
                  <div style={{ position: 'relative' }}>
                    <Mail style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94A3B8' }} />
                    <input
                      id="reg-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contacto@tunegocio.com"
                      style={{ ...inputStyle, paddingLeft: 42 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle} htmlFor="reg-pass">Contraseña</label>
                  <div style={{ position: 'relative' }}>
                    <Lock style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94A3B8' }} />
                    <input
                      id="reg-pass"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      style={{ ...inputStyle, paddingLeft: 42, paddingRight: 42 }}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: 4 }} title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}>
                      {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={labelStyle} htmlFor="reg-confirm">Confirmar Contraseña</label>
                  <div style={{ position: 'relative' }}>
                    <Lock style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94A3B8' }} />
                    <input
                      id="reg-confirm"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repite tu contraseña"
                      style={{ ...inputStyle, paddingLeft: 42 }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: '100%', padding: '14px 24px', borderRadius: 12, background: C.zinc900, color: '#FFFFFF', fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 10px 40px -10px rgba(15,23,42,0.08)', opacity: loading ? 0.7 : 1, transition: 'all 0.2s', marginTop: 4 }}
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Crear mi espacio de trabajo</span>
                  {!loading && <ArrowLeft style={{ width: 16, height: 16, color: C.gold, transform: 'rotate(180deg)' }} />}
                </button>
              </form>

              <p style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#64748B' }}>
                ¿Ya tienes una cuenta?{' '}
                <button type="button" onClick={() => goTo('login')} style={{ fontWeight: 700, color: C.zinc900, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                  Inicia sesión
                </button>
              </p>
            </div>
          )}

          {/* Pie de página */}
          <footer style={{ paddingTop: 16, borderTop: '1px solid #F1F5F9', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: '#94A3B8', marginTop: 32 }}>
            <span>© 2026 Frenyer ERP & POS. Todos los derechos reservados.</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#64748B', fontWeight: 500 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
              Sistema Operativo 99.9%
            </span>
          </footer>
        </div>
      </main>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @media (min-width: 1024px) {
          .auth-hero-col { width: 60% !important; border-right: 1px solid #F1F5F9; border-bottom: none !important; }
          .auth-right-col { width: 40% !important; }
          .auth-mobile-header { display: none !important; }
          .auth-float-card { margin-left: 16px !important; }
        }
        @media (max-width: 1023px) {
          .auth-hero-col { display: none !important; }
          .auth-mobile-header { display: flex !important; }
        }
        input:focus {
          background: #FFFFFF !important;
          border-color: #18181B !important;
          box-shadow: 0 0 0 2px rgba(24,24,27,0.1) !important;
        }
        button:hover { opacity: 0.92; }
      `}</style>
    </div>
  );
}
