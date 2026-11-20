import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Lock, Unlock, KeyRound, X, Shield, Briefcase } from 'lucide-react';
import { api } from '../services/api.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import type { UserAccount, UserRole } from '../../../server/types.ts';
import { getNormalizedDepartments } from '../utils/categoryHelpers.ts';

export const UserManagerView: React.FC = () => {
  const { t, tf } = useLanguage();

  const [users, setUsers] = useState<UserAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create User Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [newDept, setNewDept] = useState('HCNS');
  const [newLaborAccess, setNewLaborAccess] = useState(false);
  const [categories, setCategories] = useState<any>(null);

  // Password reset modal state
  const [resetTargetUser, setResetTargetUser] = useState<UserAccount | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const [data, cats] = await Promise.all([
        api.getUsers(),
        api.getCategories().catch(() => null),
      ]);
      setUsers(data || []);
      if (cats) setCategories(cats);
    } catch (err: any) {
      setErrorMsg(err?.message || t.usersFailedToLoadUserAccounts);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const showToast = (msg: string, isSuccess = true) => {
    if (isSuccess) {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3500);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4000);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newName.trim() || !newEmail.trim()) {
      showToast(t.usersPleaseFillInUsernameFull, false);
      return;
    }
    try {
      await api.createUser({
        username: newUsername.trim(),
        password: newPassword,
        name: newName.trim(),
        email: newEmail.trim(),
        role: newRole,
        department: newDept,
        can_access_labor_contracts: newRole === 'admin' ? true : newLaborAccess,
      } as any);
      showToast(tf('usersCreatedSuccess', { username: newUsername }));
      setIsCreateOpen(false);
      setNewUsername('');
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewLaborAccess(false);
      fetchUsers();
    } catch (err: any) {
      showToast(err?.message || t.usersErrorCreatingUserAccount, false);
    }
  };

  const handleToggleLock = async (user: UserAccount) => {
    if (user.username === 'admin') {
      showToast(t.usersCannotLockThePrimaryAdmin, false);
      return;
    }
    const newStatus = user.status === 'locked' ? 'active' : 'locked';
    try {
      await api.updateUser(user.id, { status: newStatus });
      showToast(
        tf(newStatus === 'locked' ? 'usersLockedSuccess' : 'usersUnlockedSuccess', { username: user.username })
      );
      fetchUsers();
    } catch (err: any) {
      showToast(err?.message || t.usersFailedToUpdateStatus, false);
    }
  };

  const handleToggleLaborAccess = async (user: UserAccount) => {
    if (user.role === 'admin') {
      showToast(t.usersAdminAccountsHaveFullAccess);
      return;
    }
    const nextVal = !Boolean(user.can_access_labor_contracts);
    try {
      await api.updateUser(user.id, { can_access_labor_contracts: nextVal } as any);
      showToast(
        tf(nextVal ? 'usersLaborAccessGranted' : 'usersLaborAccessRevoked', { username: user.username })
      );
      fetchUsers();
    } catch (err: any) {
      showToast(err?.message || t.usersFailedToUpdateLaborContract, false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTargetUser) return;
    try {
      await api.updateUser(resetTargetUser.id, { password: resetPasswordVal });
      showToast(tf('usersPasswordResetSuccess', { username: resetTargetUser.username }));
      setResetTargetUser(null);
      setResetPasswordVal('');
    } catch (err: any) {
      showToast(err?.message || t.usersFailedToResetPassword, false);
    }
  };

  const handleChangeRole = async (user: UserAccount, role: UserRole) => {
    if (user.username === 'admin') {
      showToast(t.usersCannotChangeRoleOfPrimary, false);
      return;
    }
    try {
      await api.updateUser(user.id, {
        role,
        can_access_labor_contracts: role === 'admin' ? true : Boolean(user.can_access_labor_contracts),
      } as any);
      showToast(tf('usersRoleChanged', { username: user.username, role }));
      fetchUsers();
    } catch (err: any) {
      showToast(err?.message || t.usersFailedToUpdateRole, false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-surface-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: 'var(--accent-primary)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Users size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {t.userManagement}
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              {t.usersManageUserAccountsAdminUser}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 34,
            padding: '0 14px',
            borderRadius: 6,
            background: 'var(--accent-primary)',
            color: '#ffffff',
            border: 'none',
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <UserPlus size={15} />
          <span>{t.usersAddUserAccount}</span>
        </button>
      </div>

      {/* Alert Messages */}
      {successMsg && (
        <div
          style={{
            padding: '10px 24px',
            background: 'rgba(34, 197, 94, 0.15)',
            borderBottom: '1px solid #22c55e',
            color: '#16a34a',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div
          style={{
            padding: '10px 24px',
            background: 'rgba(239, 68, 68, 0.1)',
            borderBottom: '1px solid #ef4444',
            color: '#ef4444',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Users Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>{t.usersText}</th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>{t.usersUsername}</th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>{t.usersFullName}</th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>EMAIL</th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>{t.usersDepartment}</th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>{t.usersRole}</th>
              <th style={{ padding: '10px 14px', color: '#F59E0B', fontWeight: 700 }}>
                🔒 {t.usersLaborContractsAccess}
              </th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>{t.usersStatus}</th>
              <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700, textAlign: 'center' }}>{t.usersActions}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                  {t.usersLoadingUserAccounts}
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                  {t.usersNoUserAccountsFound}
                </td>
              </tr>
            ) : (
              users.map((u, i) => {
                const hasLabor = u.role === 'admin' || Boolean(u.can_access_labor_contracts);
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Shield size={14} color={u.role === 'admin' ? '#D97706' : '#64748B'} />
                        <span>{u.username}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-primary)' }}>{u.name}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{u.department || '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      {u.username === 'admin' ? (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            background: 'rgba(217, 119, 6, 0.15)',
                            color: '#b45309',
                          }}
                        >
                          {t.usersAdminFullAccess}
                        </span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={e => handleChangeRole(u, e.target.value as UserRole)}
                          style={{
                            padding: '3px 6px',
                            borderRadius: 4,
                            fontSize: 12,
                            border: '1px solid var(--border-strong)',
                            background: 'var(--bg-input)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          <option value="admin">{t.usersAdminFullAccess}</option>
                          <option value="user">{t.usersUserViewDownload}</option>
                        </select>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {u.role === 'admin' ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#F59E0B',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                          }}
                        >
                          <Briefcase size={12} />
                          {t.usersDefaultAdmin}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleLaborAccess(u)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: hasLabor ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border-strong)',
                            background: hasLabor ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface-subtle)',
                            color: hasLabor ? '#10B981' : 'var(--text-muted)',
                          }}
                          title={t.usersClickToGrantRevokeAccess}
                        >
                          {hasLabor ? <Unlock size={12} /> : <Lock size={12} />}
                          <span>
                            {hasLabor
                              ? t.usersAuthorizedClickToRevoke
                              : t.usersNoAccessClickToGrant}
                          </span>
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          background: u.status === 'locked' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                          color: u.status === 'locked' ? '#ef4444' : '#16a34a',
                        }}
                      >
                        {u.status === 'locked' ? t.statusLocked : t.statusActive}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        {/* Reset password button */}
                        <button
                          className="btn-icon"
                          style={{ width: 28, height: 28 }}
                          onClick={() => setResetTargetUser(u)}
                          title={t.usersResetPassword}
                        >
                          <KeyRound size={14} />
                        </button>

                        {/* Lock / Unlock button */}
                        {u.username !== 'admin' && (
                          <button
                            className="btn-icon"
                            style={{ width: 28, height: 28, color: u.status === 'locked' ? '#ef4444' : '#16a34a' }}
                            onClick={() => handleToggleLock(u)}
                            title={
                              u.status === 'locked'
                                ? t.usersUnlockAccount
                                : t.usersLockAccount
                            }
                          >
                            {u.status === 'locked' ? <Unlock size={14} /> : <Lock size={14} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Create User */}
      {isCreateOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: 'var(--bg-surface)',
              borderRadius: 10,
              overflow: 'hidden',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {t.usersAddUserAccount2}
              </h3>
              <button onClick={() => setIsCreateOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateUser} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  {t.usersUsername2} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. nguyen.van.a"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  {t.usersFullName2} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Nguyen Van A"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  Email <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  className="form-input"
                  placeholder="e.g. a.nguyen@sambogold.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    {t.usersInitialPassword}
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    {t.usersRole2}
                  </label>
                  <select
                    className="form-select"
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as UserRole)}
                  >
                    <option value="user">{t.usersUserViewDownload}</option>
                    <option value="admin">{t.usersAdminFullAccess}</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  {t.usersDepartment2}
                </label>
                <input
                  type="text"
                  className="form-input"
                  list="user-manager-depts-list"
                  placeholder={t.usersEGHrAccountingEngineering}
                  value={newDept}
                  onChange={e => setNewDept(e.target.value)}
                />
                <datalist id="user-manager-depts-list">
                  {getNormalizedDepartments(categories).map((d) => (
                    <option key={d.code || d.name} value={d.name}>
                      {d.code ? `${d.code} - ${d.name}` : d.name}
                    </option>
                  ))}
                </datalist>
              </div>

              {newRole !== 'admin' && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newLaborAccess}
                    onChange={e => setNewLaborAccess(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#F59E0B' }}
                  />
                  <span>
                    🔒 {t.usersGrantSpecialPermissionToAccess}
                  </span>
                </label>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: '1px solid var(--border-strong)',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 18px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--accent-primary)',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t.usersCreateAccount}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reset Password */}
      {resetTargetUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: 'var(--bg-surface)',
              borderRadius: 10,
              overflow: 'hidden',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {t.usersResetPassword2} {resetTargetUser.username}
              </h3>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  {t.usersNewPassword}
                </label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={resetPasswordVal}
                  onChange={e => setResetPasswordVal(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  onClick={() => setResetTargetUser(null)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 6,
                    border: '1px solid var(--border-strong)',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleResetPassword}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--accent-primary)',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t.usersUpdatePassword}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
