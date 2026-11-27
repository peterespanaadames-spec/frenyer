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
  const [preview, setPreview] = useState<'dashboard' | 'ventas' | 'tienda'>('dashboard');

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
    padding: '10px 14px',
    borderRadius: 10,
    background: C.surface,
    border: `1px solid ${C.border}`,
    outline: 'none',
    fontSize: 13.5,
    fontFamily: font,
    transition: 'all 0.2s ease',
    color: C.charcoal
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: '#334155',
    marginBottom: 4
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'row',
        fontFamily: font,
        background: '#FFFFFF',
        overflowX: 'hidden'
      }}
      className="auth-page-v2"
    >
      {/* ============ COLUMNA IZQUIERDA: HERO (PC) ============ */}
      <section
        className="auth-hero-col"
        style={{
          width: '100%',
          background:
            'radial-gradient(circle at 0% 0%, rgba(253,224,71,0.62) 0%, rgba(254,240,138,0.42) 28%, rgba(254,249,195,0.25) 52%, rgba(255,255,255,0.95) 82%, #FFFFFF 100%), linear-gradient(135deg, #FEF08A 0%, #FEF9C3 35%, #FEFCE8 65%, #FFFFFF 100%)',
          padding: '20px 32px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 660,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            zIndex: 10
          }}
        >
          {/* Bloque superior: Pill + Título + Descripción */}
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '4px 11px',
                borderRadius: 9999,
                background: 'rgba(255,255,255,0.92)',
                border: '1px solid rgba(226,232,240,0.9)',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                marginBottom: 10
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', letterSpacing: '0.02em' }}>
                ERP + Punto de Venta + Tienda Online
              </span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(24px, 2.5vw, 34px)',
                fontWeight: 800,
                color: C.zinc900,
                letterSpacing: '-0.025em',
                lineHeight: 1.15,
                margin: '0 0 8px 0'
              }}
            >
              Tu sistema de{' '}
              <span
                style={{
                  display: 'inline-block',
                  background: C.gold,
                  color: C.zinc900,
                  padding: '1px 11px',
                  borderRadius: 10,
                  border: '1px solid rgba(250,204,21,0.6)',
                  boxShadow: '0 1px 2px rgba(15,23,42,0.04)'
                }}
              >
                Punto de Venta
              </span>{' '}
              y gestión total
            </h1>

            <p style={{ color: '#475569', fontSize: 13.5, lineHeight: 1.45, margin: 0, maxWidth: 560 }}>
              Digitaliza tu negocio con <strong style={{ fontWeight: 600, color: C.zinc900 }}>Frenyer</strong>. Controla Ventas Flash, inventario multimoneda{' '}
              <span style={{ fontWeight: 600, color: '#1F2937' }}>(Bs. / USD)</span>, cuentas por cobrar y tu propia tienda online desde cualquier dispositivo.
            </p>
          </div>

          {/* 3 Pilares en una fila compacta */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              { icon: <Zap size={14} />, title: 'Ventas Flash & POS', desc: 'Facturación rápida sincronizada con tu tienda.', bg: C.zinc900, fg: '#FACC15', border: 'none' },
              { icon: <Coins size={14} />, title: 'Multimoneda Bs. / USD', desc: 'Conversión automática con tasa diaria.', bg: C.goldSoft, fg: C.zinc900, border: '1px solid #FDE047' },
              { icon: <BarChart3 size={14} />, title: 'Control en Tiempo Real', desc: 'Alertas de stock, utilidades y cobranzas.', bg: '#D1FAE5', fg: '#047857', border: '1px solid #A7F3D0' }
            ].map((p, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  background: 'rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(4px)',
                  padding: '9px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(226,232,240,0.85)'
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: p.bg,
                    color: p.fg,
                    border: p.border,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 1
                  }}
                >
                  {p.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 11.5, fontWeight: 700, color: C.zinc900, lineHeight: 1.25, margin: 0 }}>{p.title}</p>
                  <p style={{ fontSize: 10.5, color: '#64748B', margin: '2px 0 0 0', lineHeight: 1.25 }}>{p.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Mockup interactivo compacto */}
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B' }}>Explora la interfaz real de Frenyer:</span>
              <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                {(['dashboard', 'ventas', 'tienda'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPreview(v)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 7,
                      fontSize: 11,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: preview === v ? C.zinc900 : 'transparent',
                      color: preview === v ? '#FFFFFF' : '#475569',
                      transition: 'all 0.2s'
                    }}
                  >
                    {v === 'dashboard' ? 'Dashboard' : v === 'ventas' ? 'Ventas Flash' : 'Tienda Online'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: '#FFFFFF', borderRadius: 12, boxShadow: '0 18px 40px -12px rgba(15,23,42,0.14), 0 0 0 1px rgba(226,232,240,0.9)', overflow: 'hidden' }}>
              <div style={{ background: 'rgba(248,250,252,0.9)', borderBottom: '1px solid rgba(226,232,240,0.8)', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(248,113,113,0.85)' }} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(251,191,36,0.85)' }} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(52,211,153,0.85)' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700, background: C.goldSoft, color: C.zinc900, border: '1px solid rgba(253,224,71,0.8)' }}>Bs. 926.36</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 500, background: '#FFFFFF', color: '#334155', border: '1px solid #E2E8F0' }}>Tienda Online</span>
                </div>
              </div>

              <div style={{ display: 'flex', height: 205, background: '#F8FAFC' }}>
                <aside style={{ width: 112, background: '#FFFFFF', borderRight: '1px solid rgba(226,232,240,0.8)', padding: '8px 7px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div>
                    <div style={{ padding: '0 4px 6px', marginBottom: 5, borderBottom: '1px solid #F1F5F9' }}>
                      <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: '-0.02em', color: C.zinc900 }}>
                        Frenyer<span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: C.gold, marginLeft: 3, verticalAlign: 'middle' }} />
                      </span>
                    </div>
                    <p style={{ padding: '0 4px', fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', margin: '0 0 4px 0' }}>Principal</p>
                    <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, fontWeight: 500 }}>
                      {[
                        { id: 'dashboard', label: 'Dashboard' },
                        { id: 'ventas', label: 'Ventas Flash' },
                        { id: 'tienda', label: 'Tienda Online' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setPreview(item.id as 'dashboard' | 'ventas' | 'tienda')}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 6px',
                            borderRadius: 6,
                            border: 'none',
                            cursor: 'pointer',
                            background: preview === item.id ? C.zinc900 : 'transparent',
                            color: preview === item.id ? '#FFFFFF' : '#475569',
                            fontWeight: preview === item.id ? 600 : 500,
                            transition: 'all 0.2s',
                            textAlign: 'left'
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </nav>
                  </div>
                  <div style={{ borderTop: '1px solid #F1F5F9', padding: '5px 4px 0' }}>
                    <div style={{ fontSize: 8.5, fontWeight: 700, color: C.zinc900 }}>Frenyer<span style={{ color: C.gold }}>•</span></div>
                    <div style={{ fontSize: 7.5, color: '#94A3B8' }}>Bs. / USD Sincronizado</div>
                  </div>
                </aside>

                <div style={{ flex: 1, padding: 9, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {preview === 'dashboard' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, animation: 'fadeInUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <h3 style={{ fontSize: 10.5, fontWeight: 800, color: C.zinc900, margin: 0 }}>Resumen operativo</h3>
                          <p style={{ fontSize: 7.5, color: '#64748B', margin: 0 }}>Indicadores clave de tu organización.</p>
                        </div>
                        <span style={{ fontSize: 7.5, fontWeight: 600, padding: '2px 6px', borderRadius: 5, background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>● En línea</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                        {[
                          { label: 'Ventas (7 días)', value: '$373.61', color: '#059669', sub: 'Recibos' },
                          { label: 'Utilidad Mes', value: '$1,240.80', color: C.zinc900, sub: '+18.4%', subColor: '#059669' },
                          { label: 'Inventario', value: '63.054', color: C.zinc900, sub: 'En almacén' },
                          { label: 'Bajo mínimo', value: '37', color: '#EF4444', sub: 'Reponer' }
                        ].map((k, i) => (
                          <div key={i} style={{ background: '#FFFFFF', padding: '5px 6px', borderRadius: 6, border: '1px solid rgba(226,232,240,0.85)' }}>
                            <p style={{ fontSize: 7, fontWeight: 600, color: '#64748B', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</p>
                            <p style={{ fontSize: 11, fontWeight: 800, color: k.color, margin: '1px 0 0 0' }}>{k.value}</p>
                            <p style={{ fontSize: 6.5, color: k.subColor || '#94A3B8', margin: '1px 0 0 0', fontWeight: k.subColor ? 600 : 400 }}>{k.sub}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                        <div style={{ background: '#FFFFFF', padding: '5px 7px', borderRadius: 6, border: '1px solid rgba(226,232,240,0.85)' }}>
                          <p style={{ fontSize: 8.5, fontWeight: 700, color: C.zinc900, margin: '0 0 3px 0' }}>Top productos más vendidos</p>
                          {['Multi examen — 85 uds.', 'IMPRESION B/NEGRO — 65 uds.', 'Copias carta — 54 uds.'].map((t, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0', borderBottom: i < 2 ? '1px solid #F1F5F9' : 'none', fontSize: 7.5 }}>
                              <span style={{ fontWeight: 500, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 3 }}>{t.split(' — ')[0]}</span>
                              <span style={{ padding: '1px 4px', borderRadius: 9999, background: C.zinc900, color: '#FFFFFF', fontWeight: 700, fontSize: 6.5, flexShrink: 0 }}>{t.split(' — ')[1]}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ background: '#FFFFFF', padding: '5px 7px', borderRadius: 6, border: '1px solid rgba(226,232,240,0.85)' }}>
                          <p style={{ fontSize: 8.5, fontWeight: 700, color: C.zinc900, margin: '0 0 3px 0' }}>Productos con bajo stock</p>
                          {['CAUCHO 90-90-18 TT 8PR', 'Embobinado 5 cables', 'Hoja de examen'].map((t, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0', borderBottom: i < 2 ? '1px solid #F1F5F9' : 'none', fontSize: 7.5 }}>
                              <span style={{ fontWeight: 500, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 3 }}>{t}</span>
                              <span style={{ padding: '1px 4px', borderRadius: 9999, background: '#FEF2F2', color: '#DC2626', fontWeight: 700, fontSize: 6.5, flexShrink: 0 }}>Stock: 0</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {preview === 'ventas' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: 'fadeInUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <h3 style={{ fontSize: 10.5, fontWeight: 800, color: C.zinc900, margin: 0 }}>Ventas Flash — Caja Rápida</h3>
                          <p style={{ fontSize: 7.5, color: '#64748B', margin: 0 }}>Cobra en USD o Bolívares al instante.</p>
                        </div>
                        <span style={{ padding: '2px 6px', borderRadius: 5, background: C.goldSoft, color: C.zinc900, fontWeight: 700, fontSize: 7.5 }}>1 USD = 926.36 Bs.</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 6, alignItems: 'stretch' }}>
                        <div style={{ background: '#FFFFFF', padding: 6, borderRadius: 7, border: '1px solid rgba(226,232,240,0.85)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {[
                            { name: 'Kit Embobinado 5 Cables', disp: 'Disp: 24 uds • SKU-104', price: '$14.50' },
                            { name: 'Caucho 90-90-18 Reforzado', disp: 'Disp: 12 uds • SKU-209', price: '$38.00' },
                            { name: 'Resma Papel Carta 500h', disp: 'Disp: 90 uds • SKU-012', price: '$5.20' }
                          ].map((p, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', padding: '4px 6px', borderRadius: 5, border: '1px solid rgba(226,232,240,0.7)' }}>
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: 8.5, fontWeight: 700, color: C.zinc900, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</p>
                                <p style={{ fontSize: 6.5, color: '#64748B', margin: 0 }}>{p.disp}</p>
                              </div>
                              <span style={{ fontSize: 9.5, fontWeight: 800, color: '#059669', flexShrink: 0, marginLeft: 4 }}>{p.price}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ background: C.zinc900, color: '#FFFFFF', padding: 9, borderRadius: 7, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div>
                            <p style={{ fontSize: 7.5, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600, margin: 0 }}>Total a cobrar</p>
                            <p style={{ fontSize: 16, fontWeight: 800, color: C.gold, margin: '3px 0 1px 0' }}>$57.70 USD</p>
                            <p style={{ fontSize: 8.5, color: '#CBD5E1', fontWeight: 500, margin: 0 }}>Bs. 53,450.97</p>
                          </div>
                          <div style={{ paddingTop: 6, borderTop: '1px solid #27272A' }}>
                            <div style={{ width: '100%', padding: '5px 0', borderRadius: 6, background: '#10B981', color: '#022C22', fontWeight: 800, fontSize: 8, textAlign: 'center' }}>
                              ✓ Cobrar y Emitir Recibo
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {preview === 'tienda' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'fadeInUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <h3 style={{ fontSize: 10.5, fontWeight: 800, color: C.zinc900, margin: 0 }}>Catálogo Tienda Online</h3>
                          <p style={{ fontSize: 7.5, color: '#64748B', margin: 0 }}>Inventario sincronizado automáticamente con tu almacén.</p>
                        </div>
                        <span style={{ padding: '2px 6px', borderRadius: 5, background: C.zinc900, color: C.gold, fontWeight: 700, fontSize: 7.5 }}>frenyer.store/tu-negocio</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[
                          { emoji: '⚡', name: 'Repuesto Motor', price: '$24.00', badge: 'En stock', badgeBg: '#F1F5F9', badgeFg: '#475569', bg: '#FEF3C7', fg: '#B45309' },
                          { emoji: '📦', name: 'Pack Papelería', price: '$11.50', badge: 'En stock', badgeBg: '#F1F5F9', badgeFg: '#475569', bg: '#D1FAE5', fg: '#047857' },
                          { emoji: '🛠️', name: 'Kit Herramientas', price: '$45.00', badge: 'Pedido WhatsApp', badgeBg: '#ECFDF5', badgeFg: '#047857', bg: C.zinc900, fg: C.gold }
                        ].map((p, i) => (
                          <div key={i} style={{ background: '#FFFFFF', padding: '10px 6px', borderRadius: 7, border: '1px solid rgba(226,232,240,0.85)', textAlign: 'center' }}>
                            <div style={{ width: 28, height: 28, margin: '0 auto 5px', borderRadius: 7, background: p.bg, color: p.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                              {p.emoji}
                            </div>
                            <p style={{ fontSize: 8.5, fontWeight: 700, color: C.zinc900, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                            <p style={{ fontSize: 11, fontWeight: 800, color: '#059669', margin: '2px 0 0 0' }}>{p.price}</p>
                            <span style={{ display: 'inline-block', marginTop: 4, fontSize: 6.5, padding: '2px 5px', borderRadius: 9999, background: p.badgeBg, color: p.badgeFg, fontWeight: 600 }}>{p.badge}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tarjeta flotante compacta */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'rgba(255,255,255,0.96)',
                backdropFilter: 'blur(8px)',
                padding: '7px 13px',
                borderRadius: 12,
                boxShadow: '0 12px 26px -8px rgba(15,23,42,0.14), 0 0 0 1px rgba(226,232,240,0.85)',
                width: 'fit-content',
                marginTop: 10,
                position: 'relative',
                zIndex: 20
              }}
              className="auth-float-card"
            >
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(16,185,129,0.12)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CheckCircle2 size={17} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.zinc900 }}>Venta registrada #1048</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: C.goldSoft, color: C.zinc900 }}>Bs. / USD</span>
                </div>
                <p style={{ fontSize: 10.5, color: '#64748B', margin: '1px 0 0 0' }}>+$42.50 USD • Inventario actualizado al instante</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ COLUMNA DERECHA: PANEL DE ACCESO ============ */}
      <main
        style={{
          width: '100%',
          background: '#FFFFFF',
          padding: '20px 32px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '100vh'
        }}
        className="auth-right-col"
      >
        <div
          style={{
            width: '100%',
            maxWidth: 400,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            flex: 1
          }}
        >
          {/* Barra superior derecha */}
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 9999, background: 'rgba(254,240,138,0.85)', border: '1px solid rgba(253,224,71,0.9)', fontSize: 11, fontWeight: 700, color: C.zinc900 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669' }} />
              Bs. / USD
            </div>
          </header>

          {/* Contenedor central */}
          <div style={{ width: '100%', padding: '12px 0', margin: 'auto 0' }}>
            {/* Logotipo */}
            <div style={{ marginBottom: 16 }}>
              {logo ? (
                <img src={logo} alt="Frenyer" style={{ maxWidth: 170, maxHeight: 68, objectFit: 'contain' }} />
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'baseline', fontWeight: 800, fontSize: 28, letterSpacing: '-0.02em', color: C.zinc900 }}>
                  Frenyer<span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: C.gold, marginLeft: 3, verticalAlign: 'middle' }} />
                </div>
              )}
            </div>

            {/* --- VISTA BIENVENIDA --- */}
            {view === 'welcome' && (
              <div style={{ animation: 'fadeInUp 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}>
                <h2 style={{ fontSize: 23, fontWeight: 800, color: C.zinc900, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 8px 0' }}>
                  Todo tu negocio, conectado
                </h2>
                <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.5, margin: '0 0 20px 0' }}>
                  Lleva el control de tus ventas, deudas, inventario y tienda online sin estrés ni complicaciones.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => goTo('register')}
                    style={{ width: '100%', padding: '12px 20px', borderRadius: 11, background: C.zinc900, color: '#FFFFFF', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 24px -8px rgba(15,23,42,0.16)', transition: 'all 0.2s' }}
                  >
                    <span>Empezar ahora</span>
                    <ArrowLeft style={{ width: 15, height: 15, color: C.gold, transform: 'rotate(180deg)' }} />
                  </button>

                  <button
                    type="button"
                    onClick={() => goTo('login')}
                    style={{ width: '100%', padding: '12px 20px', borderRadius: 11, background: '#FFFFFF', color: C.zinc900, fontWeight: 700, fontSize: 14, border: '1px solid #CBD5E1', cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    Ya tengo una cuenta
                  </button>
                </div>

                <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid #F1F5F9', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11.5, color: '#64748B' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10 }}>✓</span>
                    <span>Configuración en 2 min</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10 }}>✓</span>
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
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 12, padding: 0 }}
                >
                  <ArrowLeft style={{ width: 14, height: 14 }} />
                  Volver al inicio
                </button>

                <h2 style={{ fontSize: 22, fontWeight: 800, color: C.zinc900, letterSpacing: '-0.02em', margin: '0 0 4px 0' }}>
                  Bienvenido de nuevo
                </h2>
                <p style={{ color: '#64748B', fontSize: 13.5, margin: '0 0 16px 0' }}>
                  Ingresa tus credenciales para acceder a tu panel operativo.
                </p>

                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 12.5, marginBottom: 12 }}>
                    <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={labelStyle} htmlFor="login-email">Correo electrónico</label>
                    <div style={{ position: 'relative' }}>
                      <Mail style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#94A3B8' }} />
                      <input
                        id="login-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@tunegocio.com"
                        style={{ ...inputStyle, paddingLeft: 38 }}
                      />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }} htmlFor="login-pass">Contraseña</label>
                      <button type="button" onClick={() => setError('Te enviamos un enlace de recuperación a tu correo.')} style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <Lock style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#94A3B8' }} />
                      <input
                        id="login-pass"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        style={{ ...inputStyle, paddingLeft: 38, paddingRight: 38 }}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: 4 }} title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}>
                        {showPassword ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{ width: '100%', padding: '12px 20px', borderRadius: 11, background: C.zinc900, color: '#FFFFFF', fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 24px -8px rgba(15,23,42,0.16)', opacity: loading ? 0.7 : 1, transition: 'all 0.2s', marginTop: 2 }}
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Iniciar Sesión</span>
                    {!loading && <ArrowLeft style={{ width: 15, height: 15, color: C.gold, transform: 'rotate(180deg)' }} />}
                  </button>
                </form>

                <p style={{ marginTop: 16, marginBottom: 0, textAlign: 'center', fontSize: 12, color: '#64748B' }}>
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
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 10, padding: 0 }}
                >
                  <ArrowLeft style={{ width: 14, height: 14 }} />
                  Volver al inicio
                </button>

                <h2 style={{ fontSize: 21, fontWeight: 800, color: C.zinc900, letterSpacing: '-0.02em', margin: '0 0 3px 0' }}>
                  Crea tu cuenta en Frenyer
                </h2>
                <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 12px 0' }}>
                  Activa tu Punto de Venta, Inventario y Tienda Online en segundos.
                </p>

                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 12.5, marginBottom: 10 }}>
                    <AlertCircle style={{ width: 15, height: 15, flexShrink: 0 }} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div>
                    <label style={labelStyle} htmlFor="reg-name">Nombre Completo</label>
                    <div style={{ position: 'relative' }}>
                      <User style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#94A3B8' }} />
                      <input
                        id="reg-name"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ej. Juan Pérez"
                        style={{ ...inputStyle, padding: '9px 14px 9px 38px' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle} htmlFor="reg-email">Correo electrónico</label>
                    <div style={{ position: 'relative' }}>
                      <Mail style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#94A3B8' }} />
                      <input
                        id="reg-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="contacto@tunegocio.com"
                        style={{ ...inputStyle, padding: '9px 14px 9px 38px' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle} htmlFor="reg-pass">Contraseña</label>
                    <div style={{ position: 'relative' }}>
                      <Lock style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#94A3B8' }} />
                      <input
                        id="reg-pass"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        style={{ ...inputStyle, padding: '9px 38px' }}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: 4 }} title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}>
                        {showPassword ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle} htmlFor="reg-confirm">Confirmar Contraseña</label>
                    <div style={{ position: 'relative' }}>
                      <Lock style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#94A3B8' }} />
                      <input
                        id="reg-confirm"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repite tu contraseña"
                        style={{ ...inputStyle, padding: '9px 14px 9px 38px' }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{ width: '100%', padding: '11px 20px', borderRadius: 11, background: C.zinc900, color: '#FFFFFF', fontWeight: 700, fontSize: 13.5, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 24px -8px rgba(15,23,42,0.16)', opacity: loading ? 0.7 : 1, transition: 'all 0.2s', marginTop: 4 }}
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Crear mi espacio de trabajo</span>
                    {!loading && <ArrowLeft style={{ width: 15, height: 15, color: C.gold, transform: 'rotate(180deg)' }} />}
                  </button>
                </form>

                <p style={{ marginTop: 12, marginBottom: 0, textAlign: 'center', fontSize: 12, color: '#64748B' }}>
                  ¿Ya tienes una cuenta?{' '}
                  <button type="button" onClick={() => goTo('login')} style={{ fontWeight: 700, color: C.zinc900, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                    Inicia sesión
                  </button>
                </p>
              </div>
            )}
          </div>

          {/* Pie de página */}
          <footer style={{ paddingTop: 12, borderTop: '1px solid #F1F5F9', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: '#94A3B8' }}>
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
          .auth-page-v2 { height: 100vh !important; min-height: 620px !important; overflow-y: auto !important; }
          .auth-hero-col { width: 58% !important; height: 100% !important; border-right: 1px solid #F1F5F9; border-bottom: none !important; }
          .auth-right-col { width: 42% !important; height: 100% !important; min-height: 0 !important; }
          .auth-float-card { margin-left: 8px !important; }
        }
        @media (max-width: 1023px) {
          .auth-hero-col { display: none !important; }
          .auth-right-col { width: 100% !important; min-height: 100vh !important; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; padding: 20px 16px !important; }
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
