import React, { useState, useEffect } from 'react';
import { notify } from '../context/ToastContext.tsx';
import {
  SlidersHorizontal,
  FileCode2,
  Building,
  Users2,
  UserCheck,
  FileSpreadsheet,
  BellRing,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Save,
  AlertCircle,
  Archive,
  Send,
  Coins,
  Shield,
  History,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { UserManagerView } from './UserManagerView.tsx';
import { AuditLogView } from './AuditLogView.tsx';
import { TrashView } from './TrashView.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { seedLabel } from '../i18n/index.ts';
import type { CurrencyItem } from '../../../server/types.ts';

interface CategorySettingsViewProps {
  onRefreshGlobal?: () => void;
  initialSubTab?: string | null;
  onSubTabChange?: (tab: SettingsSubTab) => void;
}

export type SettingsSubTab =
  | 'doc_types'
  | 'agencies'
  | 'departments'
  | 'personnel'
  | 'contract_config'
  | 'alert_settings'
  | 'currencies'
  | 'users'
  | 'audit'
  | 'trash';

export const CategorySettingsView: React.FC<CategorySettingsViewProps> = ({
  onRefreshGlobal,
  initialSubTab,
  onSubTabChange,
}) => {
  const { language, t, tf } = useLanguage();
  const displaySeed = (val?: string) => seedLabel(language, val);

  const validTabs = ['doc_types', 'agencies', 'departments', 'personnel', 'contract_config', 'alert_settings', 'currencies', 'users', 'audit', 'trash'];
  const [activeTab, setActiveTab] = useState<SettingsSubTab>(
    (initialSubTab && validTabs.includes(initialSubTab))
      ? (initialSubTab as SettingsSubTab)
      : 'doc_types'
  );

  useEffect(() => {
    if (initialSubTab && validTabs.includes(initialSubTab)) {
      setActiveTab(initialSubTab as SettingsSubTab);
    }
  }, [initialSubTab]);

  const changeTab = (tab: SettingsSubTab) => {
    setActiveTab(tab);
    setIsAdding(false);
    setEditingIndex(null);
    if (onSubTabChange) onSubTabChange(tab);
  };
  const [categories, setCategories] = useState<any>({
    doc_types: [],
    agencies: [],
    departments: [],
    personnel: [],
    contract_types: [],
    storage_locations: [],
    send_methods: [],
    parties_a: [],
  });
  const [settings, setSettings] = useState<any>({
    alert_level_1_days: 30,
    alert_level_2_days: 60,
    report_currency: 'USD',
    company_code: 'SGII',
    company_name: 'Công ty Cổ phần đầu tư quốc tế Sambo Gold - SGII', // i18n-data
  });
  const [, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Editing state for generic lists
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState<any>({});

  // Adding state
  const [isAdding, setIsAdding] = useState(false);
  const [newItemValue, setNewItemValue] = useState<any>({});

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [currencies, setCurrencies] = useState<CurrencyItem[]>([]);
  const [newCurrency, setNewCurrency] = useState<Partial<CurrencyItem>>({
    code: '',
    name: '',
    symbol: '',
    decimals: 2,
    exchange_rate: 1,
    is_default: false,
    active: true,
  });

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [res, currList] = await Promise.all([
        api.getCategorySettings(),
        api.getCurrencies().catch(() => []),
      ]);
      setCategories(res.categories || {});
      setSettings(res.settings || {});
      if (currList && currList.length > 0) {
        setCurrencies(currList);
      }
    } catch (err) {
      showToast(t.settingsFailedToLoadSettings + String(err), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddCurrency = async () => {
    if (!newCurrency.code || !newCurrency.name) {
      showToast(t.settingsPleaseEnterCurrencyCodeIso, 'error');
      return;
    }
    try {
      await api.addCurrency({
        code: newCurrency.code.toUpperCase().trim(),
        name: newCurrency.name.trim(),
        symbol: newCurrency.symbol || newCurrency.code,
        decimals: Number(newCurrency.decimals ?? 2),
        exchange_rate: Number(newCurrency.exchange_rate ?? 1),
        is_default: Boolean(newCurrency.is_default),
        active: true,
      });
      showToast(t.settingsCurrencyAddedSuccessfully, 'success');
      setNewCurrency({ code: '', name: '', symbol: '', decimals: 2, exchange_rate: 1, is_default: false, active: true });
      setIsAdding(false);
      const updated = await api.getCurrencies();
      setCurrencies(updated);
      onRefreshGlobal?.();
    } catch (err: any) {
      showToast(t.settingsErrorAddingCurrency + (err.message || String(err)), 'error');
    }
  };

  const handleToggleCurrencyActive = async (curr: CurrencyItem) => {
    try {
      await api.updateCurrency(curr.code, { active: !curr.active });
      const updated = await api.getCurrencies();
      setCurrencies(updated);
      showToast(
        tf(!curr.active ? 'settingsCurrencyActivated' : 'settingsCurrencySuspended', { code: curr.code }),
        'success'
      );
    } catch (err: any) {
      showToast(t.settingsErrorUpdatingCurrency + (err.message || String(err)), 'error');
    }
  };

  const showToast = (text: string, type: 'success' | 'error') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Handle Settings Save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      showToast(
        t.settingsAlertParametersAndSystemConfiguration,
        'success'
      );
      onRefreshGlobal?.();
    } catch (err) {
      showToast(t.settingsFailedToSaveSettings + String(err), 'error');
    }
  };

  // Add Item to Category
  const handleAddItem = async (catType: string, payload: any) => {
    try {
      await api.addCategoryItem(catType, payload);
      await loadData();
      setIsAdding(false);
      setNewItemValue({});
      showToast(t.settingsAddedToCategorySuccessfully, 'success');
      onRefreshGlobal?.();
    } catch (err) {
      showToast(t.settingsErrorAddingItem + String(err), 'error');
    }
  };

  // Update Item in Category
  const handleUpdateItem = async (catType: string, index: number, payload: any) => {
    try {
      await api.updateCategoryItem(catType, index, payload);
      await loadData();
      setEditingIndex(null);
      setEditingValue({});
      showToast(t.settingsCategoryItemUpdatedSuccessfully, 'success');
      onRefreshGlobal?.();
    } catch (err) {
      showToast(t.settingsErrorUpdatingItem + String(err), 'error');
    }
  };

  // Delete Item from Category
  const handleDeleteItem = async (catType: string, index: number, label: string) => {
    if (
      confirm(
        tf('settingsDeleteItemConfirm', { label })
      )
    ) {
      try {
        await api.deleteCategoryItem(catType, index);
        await loadData();
        showToast(t.settingsItemDeletedFromCategory, 'success');
        onRefreshGlobal?.();
      } catch (err) {
        showToast(t.settingsErrorDeletingItem + String(err), 'error');
      }
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-page)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'rgba(252, 207, 77, 0.12)',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SlidersHorizontal size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {t.settingsReferenceCategoriesSystemConfiguration}
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              {t.settingsManageDocumentTypesIssuingAgencies}
            </p>
          </div>
        </div>

        {statusMessage && (
          <div
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              background: statusMessage.type === 'success' ? 'rgba(159, 174, 74, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: statusMessage.type === 'success' ? 'var(--success-text)' : '#ef4444',
              border: `1px solid ${statusMessage.type === 'success' ? 'var(--success-dot)' : '#ef4444'}`,
              fontSize: 13,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {statusMessage.type === 'success' ? <Check size={15} /> : <AlertCircle size={15} />}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Sub-tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '10px 24px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
        }}
      >
        <button
          onClick={() => changeTab('doc_types')}
          className={`settings-tab${activeTab === 'doc_types' ? ' active' : ''}`}
          aria-pressed={activeTab === 'doc_types'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <FileCode2 size={16} />
          <span>
            {t.settingsDocumentTypes} ({categories.doc_types?.length || 0})
          </span>
        </button>

        <button
          onClick={() => changeTab('agencies')}
          className={`settings-tab${activeTab === 'agencies' ? ' active' : ''}`}
          aria-pressed={activeTab === 'agencies'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <Building size={16} />
          <span>
            {t.settingsIssuingAgencies} ({categories.agencies?.length || 0})
          </span>
        </button>

        <button
          onClick={() => changeTab('departments')}
          className={`settings-tab${activeTab === 'departments' ? ' active' : ''}`}
          aria-pressed={activeTab === 'departments'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <Users2 size={16} />
          <span>
            {t.settingsInternalDepartments} ({categories.departments?.length || 0})
          </span>
        </button>

        <button
          onClick={() => changeTab('personnel')}
          className={`settings-tab${activeTab === 'personnel' ? ' active' : ''}`}
          aria-pressed={activeTab === 'personnel'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <UserCheck size={16} />
          <span>
            {t.settingsPersonnelDirectory} ({categories.personnel?.length || 0})
          </span>
        </button>

        <button
          onClick={() => changeTab('contract_config')}
          className={`settings-tab${activeTab === 'contract_config' ? ' active' : ''}`}
          aria-pressed={activeTab === 'contract_config'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <FileSpreadsheet size={16} />
          <span>{t.settingsContractsStorage}</span>
        </button>

        <button
          onClick={() => changeTab('alert_settings')}
          className={`settings-tab${activeTab === 'alert_settings' ? ' active' : ''}`}
          aria-pressed={activeTab === 'alert_settings'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <BellRing size={16} />
          <span>{t.settingsAlertSystemSettings}</span>
        </button>

        <button
          onClick={() => changeTab('currencies')}
          className={`settings-tab${activeTab === 'currencies' ? ' active' : ''}`}
          aria-pressed={activeTab === 'currencies'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <Coins size={16} />
          <span>
            {t.settingsCurrencies} ({currencies.length})
          </span>
        </button>

        {isAdmin && (
          <>
            <button
              onClick={() => changeTab('users')}
              className={`settings-tab${activeTab === 'users' ? ' active' : ''}`}
              aria-pressed={activeTab === 'users'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <Shield size={16} />
              <span>{t.settingsAccountsPermissions}</span>
            </button>

            <button
              onClick={() => changeTab('audit')}
              className={`settings-tab${activeTab === 'audit' ? ' active' : ''}`}
              aria-pressed={activeTab === 'audit'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <History size={16} />
              <span>{t.settingsAuditLogs}</span>
            </button>

            <button
              onClick={() => changeTab('trash')}
              className={`settings-tab${activeTab === 'trash' ? ' active' : ''}`}
              aria-pressed={activeTab === 'trash'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <Trash2 size={16} />
              <span>{t.trashTitle}</span>
            </button>
          </>
        )}
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {/* TAB 1: Doc Types */}
        {activeTab === 'doc_types' && (
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-sm)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-hover)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t.settingsDocumentTypesCodeSymbols}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t.settingsUsedToAutoGenerateIncoming}
                </span>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setIsAdding(true);
                  setNewItemValue({ code: '', name: '', description: '' });
                }}
                disabled={isAdding}
                style={{ fontSize: 12, height: 32 }}
              >
                <Plus size={14} />
                <span>{t.settingsAddDocumentType}</span>
              </button>
            </div>

            {/* Add New Row Inline */}
            {isAdding && (
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '14px 20px',
                  background: 'rgba(252, 207, 77, 0.05)',
                  borderBottom: '1px solid var(--border-subtle)',
                  alignItems: 'center',
                }}
              >
                <input
                  type="text"
                  placeholder={t.settingsCodeEGTb}
                  className="form-input mono-code"
                  style={{ width: 140 }}
                  value={newItemValue.code || ''}
                  onChange={e => setNewItemValue({ ...newItemValue, code: e.target.value.toUpperCase() })}
                />
                <input
                  type="text"
                  placeholder={t.settingsDocumentTypeNameEG}
                  className="form-input"
                  style={{ flex: 1.5 }}
                  value={newItemValue.name || ''}
                  onChange={e => setNewItemValue({ ...newItemValue, name: e.target.value })}
                />
                <input
                  type="text"
                  placeholder={t.settingsDescriptionNote}
                  className="form-input"
                  style={{ flex: 2 }}
                  value={newItemValue.description || ''}
                  onChange={e => setNewItemValue({ ...newItemValue, description: e.target.value })}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-primary"
                    style={{ height: 34, padding: '0 12px' }}
                    onClick={() => {
                      if (!newItemValue.code || !newItemValue.name) {
                        notify.error(t.settingsPleaseEnterBothCodeAnd);
                        return;
                      }
                      handleAddItem('doc_types', newItemValue);
                    }}
                  >
                    <Check size={14} />
                    <span>{t.settingsSave}</span>
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ height: 34, padding: '0 10px' }}
                    onClick={() => setIsAdding(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-hover)' }}>
                  <th style={{ padding: '10px 16px', width: 60, color: 'var(--text-muted)' }}>{t.usersText}</th>
                  <th style={{ padding: '10px 16px', width: 140, color: 'var(--text-muted)' }}>{t.settingsCodeSymbol}</th>
                  <th style={{ padding: '10px 16px', width: 240, color: 'var(--text-muted)' }}>{t.settingsDocumentTypeName}</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{t.settingsDescriptionRegulation}</th>
                  <th style={{ padding: '10px 16px', width: 100, textAlign: 'right', color: 'var(--text-muted)' }}>{t.settingsActions}</th>
                </tr>
              </thead>
              <tbody>
                {categories.doc_types?.map((item: any, idx: number) => {
                  const isRowEditing = editingIndex === idx;
                  return (
                    <tr
                      key={idx}
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      className="table-row-hover"
                    >
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {isRowEditing ? (
                          <input
                            type="text"
                            className="form-input mono-code"
                            value={editingValue.code || ''}
                            onChange={e => setEditingValue({ ...editingValue, code: e.target.value.toUpperCase() })}
                          />
                        ) : (
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: 'rgba(252, 207, 77, 0.1)',
                              color: 'var(--accent-primary)',
                              border: '1px solid rgba(252, 207, 77, 0.2)',
                            }}
                          >
                            {item.code}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {isRowEditing ? (
                          <input
                            type="text"
                            className="form-input"
                            value={editingValue.name || ''}
                            onChange={e => setEditingValue({ ...editingValue, name: e.target.value })}
                          />
                        ) : (
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{displaySeed(item.name)}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {isRowEditing ? (
                          <input
                            type="text"
                            className="form-input"
                            value={editingValue.description || ''}
                            onChange={e => setEditingValue({ ...editingValue, description: e.target.value })}
                          />
                        ) : (
                          displaySeed(item.description) || '—'
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {isRowEditing ? (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-primary"
                              style={{ height: 28, padding: '0 8px' }}
                              onClick={() => handleUpdateItem('doc_types', idx, editingValue)}
                            >
                              <Check size={13} />
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ height: 28, padding: '0 6px' }}
                              onClick={() => setEditingIndex(null)}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              style={{
                                border: '1px solid var(--border-subtle)',
                                background: 'transparent',
                                borderRadius: 4,
                                padding: 5,
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                              }}
                              onClick={() => {
                                setEditingIndex(idx);
                                setEditingValue({ ...item });
                              }}
                              title={t.settingsEditItem}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              style={{
                                border: '1px solid var(--border-subtle)',
                                background: 'transparent',
                                borderRadius: 4,
                                padding: 5,
                                cursor: 'pointer',
                                color: '#ef4444',
                              }}
                              onClick={() => handleDeleteItem('doc_types', idx, item.name)}
                              title={t.settingsDeleteItem}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: Agencies */}
        {activeTab === 'agencies' && (
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-sm)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-hover)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t.settingsIssuingAgenciesDocumentPartners}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t.settingsListOfStateRegulatoryAgencies}
                </span>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setIsAdding(true);
                  setNewItemValue({ agency: '' });
                }}
                disabled={isAdding}
                style={{ fontSize: 12, height: 32 }}
              >
                <Plus size={14} />
                <span>{t.settingsAddAgency}</span>
              </button>
            </div>

            {/* Inline Add */}
            {isAdding && (
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '14px 20px',
                  background: 'rgba(252, 207, 77, 0.05)',
                  borderBottom: '1px solid var(--border-subtle)',
                  alignItems: 'center',
                }}
              >
                <input
                  type="text"
                  placeholder={t.settingsAgencyOrOrganizationName}
                  className="form-input"
                  style={{ flex: 1 }}
                  value={newItemValue.agency || ''}
                  onChange={e => setNewItemValue({ agency: e.target.value })}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-primary"
                    style={{ height: 34, padding: '0 12px' }}
                    onClick={() => {
                      if (!newItemValue.agency?.trim()) {
                        notify.error(t.settingsPleaseEnterAgencyName);
                        return;
                      }
                      handleAddItem('agencies', newItemValue.agency.trim());
                    }}
                  >
                    <Check size={14} />
                    <span>{t.settingsSave}</span>
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ height: 34, padding: '0 10px' }}
                    onClick={() => setIsAdding(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            <div style={{ padding: '8px 0' }}>
              {categories.agencies?.map((agency: string, idx: number) => {
                const isRowEditing = editingIndex === idx;
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 20px',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                    className="table-row-hover"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 30 }}>{idx + 1}.</span>
                      {isRowEditing ? (
                        <input
                          type="text"
                          className="form-input"
                          style={{ flex: 1 }}
                          value={editingValue.agency || ''}
                          onChange={e => setEditingValue({ agency: e.target.value })}
                        />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Building size={14} color="var(--accent-primary)" />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{agency}</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {isRowEditing ? (
                        <>
                          <button
                            className="btn btn-primary"
                            style={{ height: 28, padding: '0 8px' }}
                            onClick={() => handleUpdateItem('agencies', idx, editingValue.agency)}
                          >
                            <Check size={13} />
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{ height: 28, padding: '0 6px' }}
                            onClick={() => setEditingIndex(null)}
                          >
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            style={{
                              border: '1px solid var(--border-subtle)',
                              background: 'transparent',
                              borderRadius: 4,
                              padding: 5,
                              cursor: 'pointer',
                              color: 'var(--text-secondary)',
                            }}
                            onClick={() => {
                              setEditingIndex(idx);
                              setEditingValue({ agency });
                            }}
                            title={t.settingsEdit}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            style={{
                              border: '1px solid var(--border-subtle)',
                              background: 'transparent',
                              borderRadius: 4,
                              padding: 5,
                              cursor: 'pointer',
                              color: '#ef4444',
                            }}
                            onClick={() => handleDeleteItem('agencies', idx, agency)}
                            title={t.delete}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: Departments */}
        {activeTab === 'departments' && (
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-sm)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-hover)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t.settingsInternalDepartmentsFunctionalDivisions}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t.settingsDepartmentCodesUsedInOutgoing}
                </span>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setIsAdding(true);
                  setNewItemValue({ code: '', name: '', lead: '' });
                }}
                disabled={isAdding}
                style={{ fontSize: 12, height: 32 }}
              >
                <Plus size={14} />
                <span>{t.settingsAddDepartment}</span>
              </button>
            </div>

            {/* Inline Add */}
            {isAdding && (
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '14px 20px',
                  background: 'rgba(252, 207, 77, 0.05)',
                  borderBottom: '1px solid var(--border-subtle)',
                  alignItems: 'center',
                }}
              >
                <input
                  type="text"
                  placeholder={t.settingsDeptCodeEGTckt}
                  className="form-input mono-code"
                  style={{ width: 130 }}
                  value={newItemValue.code || ''}
                  onChange={e => setNewItemValue({ ...newItemValue, code: e.target.value.toUpperCase() })}
                />
                <input
                  type="text"
                  placeholder={t.settingsDepartmentNameEGFinance}
                  className="form-input"
                  style={{ flex: 2 }}
                  value={newItemValue.name || ''}
                  onChange={e => setNewItemValue({ ...newItemValue, name: e.target.value })}
                />
                <input
                  type="text"
                  placeholder={t.settingsDepartmentHeadLead}
                  className="form-input"
                  style={{ flex: 1.5 }}
                  value={newItemValue.lead || ''}
                  onChange={e => setNewItemValue({ ...newItemValue, lead: e.target.value })}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-primary"
                    style={{ height: 34, padding: '0 12px' }}
                    onClick={() => {
                      if (!newItemValue.code || !newItemValue.name) {
                        notify.error(t.settingsPleaseEnterDepartmentCodeAnd);
                        return;
                      }
                      handleAddItem('departments', newItemValue);
                    }}
                  >
                    <Check size={14} />
                    <span>{t.settingsSave}</span>
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ height: 34, padding: '0 10px' }}
                    onClick={() => setIsAdding(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-hover)' }}>
                  <th style={{ padding: '10px 16px', width: 60, color: 'var(--text-muted)' }}>{t.usersText}</th>
                  <th style={{ padding: '10px 16px', width: 140, color: 'var(--text-muted)' }}>{t.settingsDepartmentCode}</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{t.settingsDepartmentName}</th>
                  <th style={{ padding: '10px 16px', width: 220, color: 'var(--text-muted)' }}>{t.settingsDepartmentLead}</th>
                  <th style={{ padding: '10px 16px', width: 100, textAlign: 'right', color: 'var(--text-muted)' }}>{t.settingsActions}</th>
                </tr>
              </thead>
              <tbody>
                {categories.departments?.map((dept: any, idx: number) => {
                  const isRowEditing = editingIndex === idx;
                  const deptObj = typeof dept === 'string' ? { code: dept, name: dept, lead: '' } : dept;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="table-row-hover">
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {isRowEditing ? (
                          <input
                            type="text"
                            className="form-input mono-code"
                            value={editingValue.code || ''}
                            onChange={e => setEditingValue({ ...editingValue, code: e.target.value.toUpperCase() })}
                          />
                        ) : (
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: 'rgba(16, 124, 65, 0.1)',
                              color: 'var(--accent-primary)',
                              border: '1px solid rgba(16, 124, 65, 0.2)',
                            }}
                          >
                            {deptObj.code}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {isRowEditing ? (
                          <input
                            type="text"
                            className="form-input"
                            value={editingValue.name || ''}
                            onChange={e => setEditingValue({ ...editingValue, name: e.target.value })}
                          />
                        ) : (
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{displaySeed(deptObj.name)}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {isRowEditing ? (
                          <input
                            type="text"
                            className="form-input"
                            value={editingValue.lead || ''}
                            onChange={e => setEditingValue({ ...editingValue, lead: e.target.value })}
                          />
                        ) : (
                          deptObj.lead || '—'
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {isRowEditing ? (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-primary"
                              style={{ height: 28, padding: '0 8px' }}
                              onClick={() => handleUpdateItem('departments', idx, editingValue)}
                            >
                              <Check size={13} />
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ height: 28, padding: '0 6px' }}
                              onClick={() => setEditingIndex(null)}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              style={{
                                border: '1px solid var(--border-subtle)',
                                background: 'transparent',
                                borderRadius: 4,
                                padding: 5,
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                              }}
                              onClick={() => {
                                setEditingIndex(idx);
                                setEditingValue({ ...deptObj });
                              }}
                              title={t.settingsEdit}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              style={{
                                border: '1px solid var(--border-subtle)',
                                background: 'transparent',
                                borderRadius: 4,
                                padding: 5,
                                cursor: 'pointer',
                                color: '#ef4444',
                              }}
                              onClick={() => handleDeleteItem('departments', idx, deptObj.name)}
                              title={t.delete}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: Personnel */}
        {activeTab === 'personnel' && (
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-sm)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-hover)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t.settingsPersonnelDocumentHandlersDirectory}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t.settingsListOfIncomingDocumentHandlers}
                </span>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setIsAdding(true);
                  setNewItemValue({
                    name: '',
                    department: categories.departments?.[0]?.name || 'Hành chính - Nhân sự', // i18n-data
                    role: 'Chuyên viên', // i18n-data
                    phone: '',
                    email: '',
                  });
                }}
                disabled={isAdding}
                style={{ fontSize: 12, height: 32 }}
              >
                <Plus size={14} />
                <span>{t.settingsAddPersonnel}</span>
              </button>
            </div>

            {/* Inline Add */}
            {isAdding && (
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '14px 20px',
                  background: 'rgba(252, 207, 77, 0.05)',
                  borderBottom: '1px solid var(--border-subtle)',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <input
                  type="text"
                  placeholder={t.settingsFullName}
                  className="form-input"
                  style={{ width: 180 }}
                  value={newItemValue.name || ''}
                  onChange={e => setNewItemValue({ ...newItemValue, name: e.target.value })}
                />
                <select
                  className="form-select"
                  style={{ width: 180 }}
                  value={newItemValue.department || ''}
                  onChange={e => setNewItemValue({ ...newItemValue, department: e.target.value })}
                >
                  {categories.departments?.map((d: any) => {
                    const name = typeof d === 'string' ? d : d.name;
                    const code = typeof d === 'string' ? d : d.code;
                    return (
                      <option key={code || name} value={name}>
                        {displaySeed(name)}
                      </option>
                    );
                  })}
                </select>
                <input
                  type="text"
                  placeholder={t.settingsTitleRole}
                  className="form-input"
                  style={{ width: 160 }}
                  value={newItemValue.role || ''}
                  onChange={e => setNewItemValue({ ...newItemValue, role: e.target.value })}
                />
                <input
                  type="text"
                  placeholder={t.settingsPhoneEmail}
                  className="form-input"
                  style={{ width: 160 }}
                  value={newItemValue.phone || ''}
                  onChange={e => setNewItemValue({ ...newItemValue, phone: e.target.value })}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-primary"
                    style={{ height: 34, padding: '0 12px' }}
                    onClick={() => {
                      if (!newItemValue.name?.trim()) {
                        notify.error(t.settingsPleaseEnterPersonnelFullName);
                        return;
                      }
                      handleAddItem('personnel', newItemValue);
                    }}
                  >
                    <Check size={14} />
                    <span>{t.settingsSave}</span>
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ height: 34, padding: '0 10px' }}
                    onClick={() => setIsAdding(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-hover)' }}>
                  <th style={{ padding: '10px 16px', width: 60, color: 'var(--text-muted)' }}>{t.usersText}</th>
                  <th style={{ padding: '10px 16px', width: 220, color: 'var(--text-muted)' }}>{t.settingsFullName2}</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{t.settingsDepartment}</th>
                  <th style={{ padding: '10px 16px', width: 180, color: 'var(--text-muted)' }}>{t.settingsTitleRole2}</th>
                  <th style={{ padding: '10px 16px', width: 180, color: 'var(--text-muted)' }}>{t.settingsContact}</th>
                  <th style={{ padding: '10px 16px', width: 100, textAlign: 'right', color: 'var(--text-muted)' }}>{t.settingsActions}</th>
                </tr>
              </thead>
              <tbody>
                {categories.personnel?.map((person: any, idx: number) => {
                  const isRowEditing = editingIndex === idx;
                  const personObj = typeof person === 'string' ? { name: person, department: '', role: 'Chuyên viên', phone: '' } : person; // i18n-data
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="table-row-hover">
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {isRowEditing ? (
                          <input
                            type="text"
                            className="form-input"
                            value={editingValue.name || ''}
                            onChange={e => setEditingValue({ ...editingValue, name: e.target.value })}
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                background: 'rgba(252, 207, 77, 0.1)',
                                color: 'var(--accent-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {(personObj.name || 'N').charAt(0)}
                            </div>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{personObj.name}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {isRowEditing ? (
                          <select
                            className="form-select"
                            value={editingValue.department || ''}
                            onChange={e => setEditingValue({ ...editingValue, department: e.target.value })}
                          >
                            {categories.departments?.map((d: any) => {
                              const name = typeof d === 'string' ? d : d.name;
                              const code = typeof d === 'string' ? d : d.code;
                              return (
                                <option key={code || name} value={name}>
                                  {displaySeed(name)}
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>{displaySeed(personObj.department) || '—'}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {isRowEditing ? (
                          <input
                            type="text"
                            className="form-input"
                            value={editingValue.role || ''}
                            onChange={e => setEditingValue({ ...editingValue, role: e.target.value })}
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: 12,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: 'var(--bg-hover)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {displaySeed(personObj.role) || t.settingsSpecialist}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
                        {isRowEditing ? (
                          <input
                            type="text"
                            className="form-input"
                            value={editingValue.phone || ''}
                            onChange={e => setEditingValue({ ...editingValue, phone: e.target.value })}
                          />
                        ) : (
                          personObj.phone || personObj.email || '—'
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {isRowEditing ? (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-primary"
                              style={{ height: 28, padding: '0 8px' }}
                              onClick={() => handleUpdateItem('personnel', idx, editingValue)}
                            >
                              <Check size={13} />
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ height: 28, padding: '0 6px' }}
                              onClick={() => setEditingIndex(null)}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              style={{
                                border: '1px solid var(--border-subtle)',
                                background: 'transparent',
                                borderRadius: 4,
                                padding: 5,
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                              }}
                              onClick={() => {
                                setEditingIndex(idx);
                                setEditingValue({ ...personObj });
                              }}
                              title={t.settingsEdit}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              style={{
                                border: '1px solid var(--border-subtle)',
                                background: 'transparent',
                                borderRadius: 4,
                                padding: 5,
                                cursor: 'pointer',
                                color: '#ef4444',
                              }}
                              onClick={() => handleDeleteItem('personnel', idx, personObj.name)}
                              title={t.delete}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 5: Contract Config & Storage */}
        {activeTab === 'contract_config' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
            {/* Contract Types Card */}
            <div
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--bg-hover)',
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t.settingsContractCategories}
                  </h4>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t.settingsContractClassificationGroups}
                  </span>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ height: 28, fontSize: 11, padding: '0 10px' }}
                  onClick={() => {
                    const name = prompt(t.settingsEnterNewContractCategoryName);
                    if (name?.trim()) handleAddItem('contract_types', { code: name.slice(0, 3).toUpperCase(), name });
                  }}
                >
                  <Plus size={13} />
                  <span>{t.settingsAdd}</span>
                </button>
              </div>
              <div style={{ padding: '8px 0' }}>
                {categories.contract_types?.map((ct: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 18px',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                        {displaySeed(typeof ct === 'string' ? ct : ct.name)}
                      </span>
                    </div>
                    <button
                      style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                      onClick={() => handleDeleteItem('contract_types', idx, typeof ct === 'string' ? ct : ct.name)}
                      title={t.delete}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Storage Locations Card */}
            <div
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--bg-hover)',
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t.settingsPhysicalStorageLocationsCabinets}
                  </h4>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t.settingsOriginalHardcopyArchiveLocations}
                  </span>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ height: 28, fontSize: 11, padding: '0 10px' }}
                  onClick={() => {
                    const loc = prompt(t.settingsEnterNewStorageLocation);
                    if (loc?.trim()) handleAddItem('storage_locations', loc.trim());
                  }}
                >
                  <Plus size={13} />
                  <span>{t.settingsAdd}</span>
                </button>
              </div>
              <div style={{ padding: '8px 0' }}>
                {categories.storage_locations?.map((loc: string, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 18px',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Archive size={14} color="#D97706" />
                      <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>{loc}</span>
                    </div>
                    <button
                      style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                      onClick={() => handleDeleteItem('storage_locations', idx, loc)}
                      title={t.delete}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Send Methods Card */}
            <div
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--bg-hover)',
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t.settingsOutgoingDispatchMethods}
                  </h4>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t.settingsDeliveryDispatchChannels}
                  </span>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ height: 28, fontSize: 11, padding: '0 10px' }}
                  onClick={() => {
                    const method = prompt(t.settingsEnterNewDispatchMethod);
                    if (method?.trim()) handleAddItem('send_methods', method.trim());
                  }}
                >
                  <Plus size={13} />
                  <span>{t.settingsAdd}</span>
                </button>
              </div>
              <div style={{ padding: '8px 0' }}>
                {categories.send_methods?.map((m: string, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 18px',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Send size={14} color="var(--accent-primary)" />
                      <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>{displaySeed(m)}</span>
                    </div>
                    <button
                      style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                      onClick={() => handleDeleteItem('send_methods', idx, m)}
                      title={t.delete}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Bên A (Chủ Đầu Tư / Pháp Nhân Mua) Card */}
            <div
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--bg-hover)',
                }}
              >
                <div>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t.settingsPartyAInvestorContractingEntity}
                  </h4>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t.settingsLegalEntitiesSubsidiariesOrBranches}
                  </span>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ height: 28, fontSize: 11, padding: '0 10px' }}
                  onClick={() => {
                    const name = prompt(t.settingsEnterNewPartyALegal);
                    if (name?.trim()) handleAddItem('parties_a', name.trim());
                  }}
                >
                  <Plus size={13} />
                  <span>{t.settingsAdd}</span>
                </button>
              </div>
              <div style={{ padding: '8px 0' }}>
                {categories.parties_a && categories.parties_a.length > 0 ? (
                  categories.parties_a.map((pA: string, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 18px',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Building size={14} color="var(--accent-primary)" />
                        <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{pA}</span>
                      </div>
                      <button
                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                        onClick={() => handleDeleteItem('parties_a', idx, pA)}
                        title={t.delete}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    {t.settingsNoPartyAEntitiesYet}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: System Alert Settings */}
        {activeTab === 'alert_settings' && (
          <div style={{ maxWidth: 680 }}>
            <div
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)',
                padding: 24,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <BellRing size={20} color="var(--accent-primary)" />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t.settingsExpirationAlertParametersSystemStandards}
                  </h3>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {t.settingsAutomatedAlertThresholdsAppliedAcross}
                  </span>
                </div>
              </div>

              <form onSubmit={handleSaveSettings}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      🔴 {t.settingsLevel1AlertThresholdUrgent}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="number"
                        min="1"
                        max="90"
                        className="form-input"
                        style={{ width: 140 }}
                        value={settings.alert_level_1_days}
                        onChange={e => setSettings({ ...settings, alert_level_1_days: Number(e.target.value) })}
                      />
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {tf('settingsAlertLevel1Hint', { days: settings.alert_level_1_days })}
                      </span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      🟡 {t.settingsLevel2AlertThresholdEarly}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="number"
                        min="10"
                        max="180"
                        className="form-input"
                        style={{ width: 140 }}
                        value={settings.alert_level_2_days}
                        onChange={e => setSettings({ ...settings, alert_level_2_days: Number(e.target.value) })}
                      />
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {tf('settingsAlertLevel2Hint', { days: settings.alert_level_2_days })}
                      </span>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        {t.settingsPrimaryReportingCurrency}
                      </label>
                      <select
                        className="form-select"
                        value={settings.report_currency}
                        onChange={e => setSettings({ ...settings, report_currency: e.target.value })}
                      >
                        <option value="USD">{t.settingsUsdUsDollarMatchesExcel}</option>
                        <option value="VND">{t.settingsVndVietnameseDong}</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>
                        {t.settingsCompanyCodePrefix}
                      </label>
                      <input
                        type="text"
                        className="form-input mono-code"
                        value={settings.company_code}
                        onChange={e => setSettings({ ...settings, company_code: e.target.value.toUpperCase() })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      {t.settingsManagingCompanyName}
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={settings.company_name}
                      onChange={e => setSettings({ ...settings, company_name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      {t.settingsCompanyGoogleDriveArchiveFolder}
                    </label>
                    <input
                      type="url"
                      className="form-input"
                      placeholder="https://drive.google.com/drive/folders/..."
                      value={settings.google_drive_folder_url || ''}
                      onChange={e => setSettings({ ...settings, google_drive_folder_url: e.target.value })}
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {t.settingsSharedGoogleDriveFolderLink}
                    </div>
                  </div>

                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0 20px', height: 38 }}>
                      <Save size={16} />
                      <span>{t.settingsSaveAlertSettings}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB: Currencies */}
        {activeTab === 'currencies' && (
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-sm)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-hover)',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t.settingsCurrenciesFormattingDirectoryIso4217}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {t.settingsMultiCurrencySupportUsdKhr}
                </span>
              </div>
              {isAdmin && (
                <button
                  className="btn btn-primary"
                  onClick={() => setIsAdding(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Plus size={16} />
                  <span>{t.settingsAddCurrency}</span>
                </button>
              )}
            </div>

            {/* Add Currency Modal/Form */}
            {isAdding && isAdmin && (
              <div
                style={{
                  padding: 16,
                  background: 'var(--bg-card)',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                }}
              >
                <div style={{ width: 100 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>{t.settingsCodeIso}</label>
                  <input
                    type="text"
                    className="form-input mono-code"
                    placeholder="e.g. AUD"
                    maxLength={5}
                    value={newCurrency.code || ''}
                    onChange={e => setNewCurrency({ ...newCurrency, code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>{t.currencyName}</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={t.settingsEGAustralianDollar}
                    value={newCurrency.name || ''}
                    onChange={e => setNewCurrency({ ...newCurrency, name: e.target.value })}
                  />
                </div>
                <div style={{ width: 80 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>{t.currencySymbol}</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="A$"
                    value={newCurrency.symbol || ''}
                    onChange={e => setNewCurrency({ ...newCurrency, symbol: e.target.value })}
                  />
                </div>
                <div style={{ width: 90 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>{t.settingsDecimals}</label>
                  <input
                    type="number"
                    className="form-input"
                    min={0}
                    max={4}
                    value={newCurrency.decimals ?? 2}
                    onChange={e => setNewCurrency({ ...newCurrency, decimals: Number(e.target.value) })}
                  />
                </div>
                <div style={{ width: 120 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>{t.settingsExchangeRate}</label>
                  <input
                    type="number"
                    className="form-input"
                    step="any"
                    value={newCurrency.exchange_rate ?? 1}
                    onChange={e => setNewCurrency({ ...newCurrency, exchange_rate: Number(e.target.value) })}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, paddingBottom: 2 }}>
                  <button className="btn btn-primary" onClick={handleAddCurrency}>
                    <Check size={14} />
                    <span>{t.settingsSave}</span>
                  </button>
                  <button className="btn btn-secondary" onClick={() => setIsAdding(false)}>
                    <X size={14} />
                    <span>{t.settingsCancel}</span>
                  </button>
                </div>
              </div>
            )}

            <div style={{ padding: 16, overflowX: 'auto' }}>
              <table className="excel-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', fontSize: 13 }}>{t.settingsCodeIso}</th>
                    <th style={{ padding: '10px 12px', fontSize: 13 }}>{t.currencyName}</th>
                    <th style={{ padding: '10px 12px', fontSize: 13 }}>{t.currencySymbol}</th>
                    <th style={{ padding: '10px 12px', fontSize: 13 }}>{t.settingsDecimalPlaces}</th>
                    <th style={{ padding: '10px 12px', fontSize: 13 }}>{t.settingsExchangeRate2}</th>
                    <th style={{ padding: '10px 12px', fontSize: 13 }}>{t.status}</th>
                    {isAdmin && <th style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right' }}>{t.actionsHeader}</th>}
                  </tr>
                </thead>
                <tbody>
                  {currencies.map(curr => (
                    <tr key={curr.code} style={{ borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace' }}>
                        {curr.code}{' '}
                        {curr.is_default && (
                          <span style={{ fontSize: 10, color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: 4, marginLeft: 4 }}>
                            {t.isDefault}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>{curr.name}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{curr.symbol || curr.code}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {curr.decimals} {t.settingsDecimals2} (e.g. {curr.decimals === 0 ? '1,000,000' : '1,000.00'})
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{curr.exchange_rate}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600,
                            background: curr.active ? 'rgba(159, 174, 74, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: curr.active ? '#059669' : '#dc2626',
                          }}
                        >
                          {curr.active ? t.settingsActive : t.settingsSuspended}
                        </span>
                      </td>
                      {isAdmin && (
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button
                            className="btn-secondary"
                            onClick={() => handleToggleCurrencyActive(curr)}
                            style={{ fontSize: 12, padding: '3px 8px' }}
                          >
                            {curr.active ? t.settingsSuspend : t.settingsActivate}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: User Management */}
        {activeTab === 'users' && isAdmin && (
          <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
            <UserManagerView />
          </div>
        )}

        {/* TAB: Audit Logs */}
        {activeTab === 'trash' && isAdmin && <TrashView onChanged={onRefreshGlobal} />}

        {activeTab === 'audit' && isAdmin && (
          <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
            <AuditLogView />
          </div>
        )}
      </div>
    </div>
  );
};
