import React, { useState } from 'react';
import { User, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { LANGUAGE_NAMES } from '../i18n/index.ts';

export const LoginView: React.FC = () => {
  const { login } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage(t.loginMissingFields);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setErrorMessage(err.message || t.loginInvalidCredentials);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      {/* Background ambient decorative shapes */}
      <div className="login-ambient-shape login-shape-1" />
      <div className="login-ambient-shape login-shape-2" />

      <div className="login-card" style={{ position: 'relative' }}>
        {/* Language switcher bar in Login screen */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-input, #f3f4f6)',
            borderRadius: 6,
            padding: 2,
            border: '1px solid var(--border-subtle, #e5e7eb)',
          }}
        >
          <button
            type="button"
            onClick={() => setLanguage('vi')}
            style={{
              border: 'none',
              borderRadius: 4,
              padding: '3px 6px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              background: language === 'vi' ? 'var(--accent-primary, #107C41)' : 'transparent',
              color: language === 'vi' ? '#ffffff' : 'var(--text-muted, #64748b)',
            }}
            title={LANGUAGE_NAMES.vi}
          >
            🇻🇳 VN
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            style={{
              border: 'none',
              borderRadius: 4,
              padding: '3px 6px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              background: language === 'en' ? 'var(--accent-primary, #107C41)' : 'transparent',
              color: language === 'en' ? '#ffffff' : 'var(--text-muted, #64748b)',
            }}
            title={LANGUAGE_NAMES.en}
          >
            🇬🇧 EN
          </button>
          <button
            type="button"
            onClick={() => setLanguage('km')}
            style={{
              border: 'none',
              borderRadius: 4,
              padding: '3px 6px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              background: language === 'km' ? 'var(--accent-primary, #107C41)' : 'transparent',
              color: language === 'km' ? '#ffffff' : 'var(--text-muted, #64748b)',
            }}
            title={LANGUAGE_NAMES.km}
          >
            🇰🇭 KM
          </button>
        </div>

        {/* Brand header */}
        <div className="login-brand-header">
          <div className="login-logo-badge">
            <Building2 size={26} color="#ffffff" />
          </div>
          <div className="login-brand-sub">{t.loginCompanySub}</div>
          <h1 className="login-brand-title">{t.loginMainTitle}</h1>
          <p className="login-brand-desc">
            {t.loginDesc}
          </p>
        </div>

        {/* Error alert */}
        {errorMessage && (
          <div className="login-error-alert">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label" style={{ fontWeight: 600 }}>
              {t.loginUsernameLabel} <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <div className="login-input-wrapper">
              <User size={16} className="login-input-icon" />
              <input
                type="text"
                required
                className="form-input login-input"
                placeholder={t.loginUsernamePlaceholder}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label className="form-label" style={{ fontWeight: 600, margin: 0 }}>
                {t.loginPasswordLabel} <span style={{ color: '#EF4444' }}>*</span>
              </label>
            </div>
            <div className="login-input-wrapper">
              <Lock size={16} className="login-input-icon" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="form-input login-input"
                placeholder={t.loginPasswordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', userSelect: 'none', color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: '#107C41', cursor: 'pointer' }}
              />
              <span>{t.loginRememberMe}</span>
            </label>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.loginDefaultDays}</span>
          </div>

          <button
            type="submit"
            className="btn btn-primary login-submit-btn"
            disabled={isSubmitting}
          >
            <span>{isSubmitting ? t.loginAuthenticating : t.loginSubmitBtn}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <div>{t.loginFooterTitle}</div>
          <div style={{ marginTop: 2 }}>{t.loginFooterSub}</div>
        </div>
      </div>
    </div>
  );
};
