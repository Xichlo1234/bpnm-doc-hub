import React, { useState, useEffect, useId, useRef } from 'react';
import {
  Search,
  Plus,
  Sun,
  Moon,
  FileText,
  LogOut,
  Menu,
  ShieldCheck,
  Bell,
  CheckCheck,
  Clock,
  UserCheck,
  Languages,
  ChevronDown,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { LANGUAGE_NAMES } from '../i18n/index.ts';
import { api } from '../services/api.ts';
import { formatNotificationTime } from '../utils/dateTime.ts';
import { ChangePasswordView } from './ChangePasswordView.tsx';

export type ViewMode = 'home' | 'split' | 'contract_table' | 'doc_table' | 'partners' | 'settings' | 'guide' | 'install';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  viewMode: ViewMode;
  onToggleViewMode: (mode: ViewMode) => void;
  onOpenHome: () => void;
  onOpenSpotlight: () => void;
  onOpenCreate: () => void;
  onSelectDocumentById?: (id: string) => void;
  /** Opens the sidebar drawer on small screens */
  onOpenNav?: () => void;
  isNavOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  viewMode,
  onToggleViewMode,
  onOpenHome,
  onOpenSpotlight,
  onOpenCreate,
  onOpenNav,
  isNavOpen,
  onSelectDocumentById,
}) => {
  const { user, logout } = useAuth();
  const { language, setLanguage, t, tf } = useLanguage();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuTrigger = useRef<HTMLButtonElement>(null);
  const userPanelId = useId();
  const notificationPanelId = useId();

  const fetchNotifications = async () => {
    try {
      const res = await api.getNotifications();
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch (_e) {}
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000); // Polling every 15s
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    await api.markAllNotificationsAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleNotifClick = async (notif: any) => {
    if (!notif.read) {
      await api.markNotificationAsRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    setIsNotifOpen(false);
    if (notif.target_id && onSelectDocumentById) {
      onSelectDocumentById(notif.target_id);
    }
  };

  return (
    <header className="top-header">
      {onOpenNav && (
        <button type="button" className="btn-icon nav-toggle" onClick={onOpenNav} title={t.navOpenMenu}
          aria-label={t.navOpenMenu} aria-expanded={isNavOpen} aria-controls="workspace-navigation">
          <Menu size={18} />
        </button>
      )}
      {/* Brand Logo */}
      <button type="button" className="brand-section brand-home-button" onClick={onOpenHome} aria-label={t.homeNav}>
        <span className="brand-logo">
          <FileText size={20} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <span className="brand-info">
          <span className="brand-title">{t.brandTitle}</span>
          <span className="brand-subtitle">{t.brandSubtitle}</span>
        </span>
      </button>

      {/* Central Spotlight Search Trigger */}
      <button type="button" className="spotlight-trigger" onClick={onOpenSpotlight} aria-label={t.search}>
        <span className="spotlight-label">
          <Search size={16} aria-hidden="true" />
          <span>{t.searchPlaceholder}</span>
        </span>
        <span className="spotlight-shortcut" aria-hidden="true">⌘ K</span>
      </button>

      {/* Header Actions */}
      <div className="header-actions">
        {/* View mode: cards | document register | contract table. Partners and settings live in the sidebar. */}
        {!['home', 'guide', 'install'].includes(viewMode) && <label className="view-select-wrap" title={t.viewModeLabel}>
          <span className="sr-only">{t.viewModeLabel}</span>
          <select
            className="view-select"
            aria-label={t.viewModeLabel}
            value={viewMode === 'partners' || viewMode === 'settings' ? '' : viewMode}
            onChange={(e) => onToggleViewMode(e.target.value as ViewMode)}
          >
            <option value="" disabled>{t.viewModeLabel}</option>
            <option value="split">{t.cardView}</option>
            <option value="doc_table">{t.docTable}</option>
            <option value="contract_table">{t.contractTable}</option>
          </select>
        </label>}

        {/* Notification Bell with Badge & Dropdown */}
        <div className="header-notifications" ref={notifDropdownRef}>
          <button
            type="button"
            className="btn-icon"
            onClick={() => { setIsNotifOpen((open) => !open); setIsUserMenuOpen(false); }}
            title={t.notificationsTitle}
            aria-label={t.notificationsTitle}
            aria-expanded={isNotifOpen}
            aria-controls={isNotifOpen ? notificationPanelId : undefined}
            style={{ position: 'relative' }}
          >
            <Bell size={17} aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  background: '#EF4444',
                  color: '#ffffff',
                  fontSize: 10,
                  fontWeight: 800,
                  borderRadius: 10,
                  padding: '1px 5px',
                  lineHeight: '14px',
                  boxShadow: '0 0 0 2px var(--bg-surface)',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown Menu */}
          {isNotifOpen && (
            <div
              id={notificationPanelId}
              className="header-notifications-panel"
              style={{
                maxHeight: 480,
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg, 0 10px 25px -5px rgba(0, 0, 0, 0.2))',
                border: '1px solid var(--border-subtle)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                whiteSpace: 'normal',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--bg-card)',
                  flexShrink: 0,
                  whiteSpace: 'normal',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <Bell size={15} color="var(--accent-primary)" />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{t.notificationsTitle}</span>
                  {unreadCount > 0 && (
                    <span
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#EF4444',
                        padding: '1px 6px',
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: 'var(--accent-primary)',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      flexShrink: 0,
                      padding: '2px 4px',
                    }}
                  >
                    <CheckCheck size={13} />
                    <span>{t.markAllRead}</span>
                  </button>
                )}
              </div>

              <div style={{ overflowY: 'auto', overflowX: 'hidden', maxHeight: 390, padding: '4px 0', whiteSpace: 'normal' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    {t.noNotifications}
                  </div>
                ) : (
                  notifications.map(notif => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotifClick(notif)}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-subtle)',
                        background: notif.read ? 'transparent' : 'rgba(252, 207, 77, 0.05)',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-card)')}
                      onMouseLeave={e => (e.currentTarget.style.background = notif.read ? 'transparent' : 'rgba(252, 207, 77, 0.05)')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flex: 1, minWidth: 0 }}>
                          {!notif.read && (
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: 'var(--accent-primary)',
                                display: 'inline-block',
                                marginTop: 5,
                                flexShrink: 0,
                              }}
                            />
                          )}
                          <span style={{ fontWeight: notif.read ? 600 : 700, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.35, wordBreak: 'break-word' }}>
                            {notif.title}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {formatNotificationTime(notif.created_at)}
                        </span>
                      </div>

                      <p style={{ margin: '0 0 8px 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        {notif.message}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                        {notif.recipient && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <UserCheck size={12} color="var(--accent-primary)" />
                            {notif.recipient}
                          </span>
                        )}
                        {notif.due_date && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#D97706' }}>
                            <Clock size={12} />
                            {notif.due_date}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {(user?.role === 'admin' || user?.can_access_labor_contracts) && (
          <button type="button" className="btn-primary" onClick={onOpenCreate} aria-label={t.addNew} title={t.addNew}>
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
            <span className="header-label">{t.addNew}</span>
          </button>
        )}

        {/* Account menu: language, theme, password, sign-out */}
        {user && (
          <div
            className="user-menu"
            ref={userMenuRef}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && isUserMenuOpen) {
                setIsUserMenuOpen(false);
                userMenuTrigger.current?.focus();
              }
            }}
          >
            <button
              type="button"
              className="header-user-badge"
              ref={userMenuTrigger}
              aria-label={t.userMenuLabel}
              aria-expanded={isUserMenuOpen}
              aria-controls={isUserMenuOpen ? userPanelId : undefined}
              onClick={() => { setIsUserMenuOpen((open) => !open); setIsNotifOpen(false); }}
              title={t.userMenuLabel}
            >
              <div className="header-user-avatar">
                <ShieldCheck size={13} aria-hidden="true" />
              </div>
              <span className="header-label">{user.username}</span>
              <ChevronDown className="header-label" size={13} aria-hidden="true" />
            </button>
            {isUserMenuOpen && (
              <div className="user-menu-panel" id={userPanelId}>
                <div className="user-menu-who">{tf('loggedInAs', { name: user.name, username: user.username })}</div>
                <label className="user-menu-language">
                  <span><Languages size={14} aria-hidden="true" />{t.language}</span>
                  <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
                    {Object.entries(LANGUAGE_NAMES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                  </select>
                </label>
                <button type="button" className="user-menu-item" onClick={onToggleTheme}>
                  {theme === 'dark' ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
                  {theme === 'dark' ? t.lightTheme : t.darkTheme}
                </button>
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    setIsPasswordOpen(true);
                  }}
                >
                  <KeyRound size={14} aria-hidden="true" />
                  {t.cpwTitle}
                </button>
                <button type="button" className="user-menu-item danger" onClick={logout}>
                  <LogOut size={14} aria-hidden="true" />
                  {t.logout}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {isPasswordOpen && (
        <div className="modal-backdrop" onClick={() => setIsPasswordOpen(false)}>
          <div
            className="modal-content"
            role="dialog"
            aria-label={t.cpwTitle}
            style={{ maxWidth: 420, width: '100%', padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 16, margin: '0 0 16px' }}>{t.cpwTitle}</h2>
            <ChangePasswordView onDone={() => setIsPasswordOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
};
