import React, { useState } from 'react';
import { Lock, AlertCircle, KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';

interface ChangePasswordViewProps {
  /** Forced mode: shown instead of the app until the password is changed. */
  required?: boolean;
  onDone?: () => void;
}

const MIN_LENGTH = 8;

export const ChangePasswordView: React.FC<ChangePasswordViewProps> = ({ required = false, onDone }) => {
  const { changePassword, logout } = useAuth();
  const { t } = useLanguage();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) {
      setError(t.cpwMismatch);
      return;
    }
    if (next.length < MIN_LENGTH || !/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) {
      setError(t.cpwRules);
      return;
    }
    setIsSubmitting(true);
    try {
      await changePassword(current, next);
      onDone?.();
    } catch (err: any) {
      setError(err?.message || t.cpwFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, autoComplete: string) => (
    <div className="form-group" style={{ marginBottom: 14 }}>
      <label className="form-label" htmlFor={id} style={{ fontWeight: 600 }}>
        {label}
      </label>
      <div className="login-input-wrapper">
        <Lock size={16} className="login-input-icon" />
        <input
          id={id}
          type="password"
          className="form-input login-input"
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          required
        />
      </div>
    </div>
  );

  const form = (
    <form onSubmit={handleSubmit} className="login-form">
      {error && (
        <div className="login-error-alert" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {field('cpw-current', t.cpwCurrent, current, setCurrent, 'current-password')}
      {field('cpw-new', t.cpwNew, next, setNext, 'new-password')}
      {field('cpw-confirm', t.cpwConfirm, confirm, setConfirm, 'new-password')}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>{t.cpwRules}</p>
      <button type="submit" className="btn btn-primary login-submit-btn" disabled={isSubmitting}>
        <KeyRound size={16} />
        <span>{isSubmitting ? t.cpwSaving : t.cpwSubmit}</span>
      </button>
      {required ? (
        <button type="button" className="btn" style={{ marginTop: 10, width: '100%' }} onClick={() => logout()}>
          <LogOut size={16} />
          <span>{t.logout}</span>
        </button>
      ) : (
        <button type="button" className="btn" style={{ marginTop: 10, width: '100%' }} onClick={() => onDone?.()}>
          <span>{t.cancel}</span>
        </button>
      )}
    </form>
  );

  if (!required) return form;

  return (
    <div className="login-container">
      <div className="login-card" style={{ position: 'relative' }}>
        <div className="login-brand-header">
          <div className="login-logo-badge">
            <KeyRound size={22} />
          </div>
          <h1 className="login-brand-title">{t.cpwTitle}</h1>
          <p className="login-brand-desc">{t.cpwRequiredIntro}</p>
        </div>
        {form}
      </div>
    </div>
  );
};
