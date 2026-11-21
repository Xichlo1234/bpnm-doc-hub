import type { DocumentRecord, ContractRecord, PartnerRecord, AttachmentRecord } from '../../../server/types.ts';
import { tr, trServerError } from '../i18n/index.ts';

const API_BASE = '/api';

export interface ImportPreviewRow {
  index: number;
  key: string;
  action: 'create' | 'update' | 'unchanged' | 'duplicate_in_file' | 'error';
  id?: string;
  changes?: Record<string, [unknown, unknown]>;
  errors?: string[];
}
export interface ImportPreview {
  rows: ImportPreviewRow[];
  summary: { total: number; create: number; update: number; unchanged: number; duplicate_in_file: number; error: number };
}
export interface ImportCommitOptions {
  /** The user reviewed the preview and accepts updating existing records */
  confirmUpdates?: boolean;
  fileName?: string;
}
export const TOKEN_KEY = 'sgii_auth_token';

let inMemoryToken: string | null = null;

export const authStorage = {
  getToken(): string | null {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      return (
        localStorage.getItem(TOKEN_KEY) ||
        localStorage.getItem('auth_token') ||
        inMemoryToken
      );
    }
    return inMemoryToken;
  },
  setToken(token: string | null) {
    inMemoryToken = token;
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('auth_token');
      }
    }
  },
};

function handleUnauthorizedResponse(url: string) {
  if (!url.includes('/api/auth/login') && !url.includes('/api/auth/me')) {
    authStorage.setToken(null);
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
  }
}

async function customFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = authStorage.getToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers,
  });
  if (res.status === 401) {
    handleUnauthorizedResponse(url);
  } else if (res.status === 403 && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    res
      .clone()
      .json()
      .then((body: any) => {
        if (body?.code === 'PASSWORD_CHANGE_REQUIRED') window.dispatchEvent(new CustomEvent('auth:password-change-required'));
      })
      .catch(() => {});
  }
  return res;
}

function customXhrRequest<T>(
  url: string,
  body: FormData,
  options: {
    defaultErrorMsg: string;
    networkErrorMsg: string;
    timeoutErrorMsg: string;
    includeHttpCodeInError?: boolean;
    fallbackSuccessPayload?: T;
    onProgress?: (percent: number, loaded: number, total: number) => void;
  }
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    if (xhr.upload && options.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
          options.onProgress!(percent, e.loaded, e.total);
        }
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (options.onProgress) {
          options.onProgress(100, 100, 100);
        }
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve((options.fallbackSuccessPayload ?? ({} as any)) as T);
        }
      } else {
        if (xhr.status === 401) {
          handleUnauthorizedResponse(url);
        }
        let msg = options.defaultErrorMsg;
        try {
          msg = trServerError(JSON.parse(xhr.responseText), msg);
        } catch {}
        if (options.includeHttpCodeInError) {
          reject(new Error(tr('errHttpCode', { message: msg, status: xhr.status })));
        } else {
          reject(new Error(msg));
        }
      }
    };
    xhr.onerror = () => reject(new Error(options.networkErrorMsg));
    xhr.ontimeout = () => reject(new Error(options.timeoutErrorMsg));
    xhr.timeout = 45000;
    xhr.open('POST', url, true);
    const token = authStorage.getToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.send(body);
  });
}

export const api = {
  // Authentication
  async login(username: string, password: string): Promise<{ token: string; user: any }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(trServerError(err, tr('errLoginFailed')));
    }
    const data = (await res.json()) as { token: string; user: any };
    authStorage.setToken(data.token);
    return data;
  },

  async getMe(): Promise<{ user: any }> {
    const res = await customFetch(`${API_BASE}/auth/me`);
    if (!res.ok) {
      throw new Error(tr('errNotLoggedIn'));
    }
    return res.json();
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ token: string; user: any }> {
    const res = await customFetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(trServerError(err, tr('cpwFailed')));
    }
    const data = (await res.json()) as { token: string; user: any };
    authStorage.setToken(data.token);
    return data;
  },

  async logout(): Promise<void> {
    try {
      await customFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    } finally {
      authStorage.setToken(null);
    }
  },

  setAuthToken(token: string | null) {
    authStorage.setToken(token);
  },

  getAuthToken(): string | null {
    return authStorage.getToken();
  },

  // Documents
  async getDocuments(type?: string): Promise<DocumentRecord[]> {
    const url = type && type !== 'all' ? `${API_BASE}/documents?type=${encodeURIComponent(type)}` : `${API_BASE}/documents`;
    const res = await customFetch(url);
    if (!res.ok) throw new Error(tr('errLoadDocuments'));
    return res.json();
  },

  async getDocument(id: string): Promise<DocumentRecord> {
    const res = await customFetch(`${API_BASE}/documents/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(tr('errLoadDocument'));
    return res.json();
  },

  async createDocument(
    data: FormData | Partial<DocumentRecord>,
    onProgress?: (percent: number) => void
  ): Promise<DocumentRecord> {
    const isFormData = data instanceof FormData;
    if (isFormData && onProgress && typeof XMLHttpRequest !== 'undefined') {
      return customXhrRequest<DocumentRecord>(`${API_BASE}/documents`, data, {
        defaultErrorMsg: tr('errCreateDocument'),
        networkErrorMsg: tr('errNetworkUploadDocument'),
        timeoutErrorMsg: tr('errTimeoutSaveDocument'),
        onProgress: (percent) => onProgress(percent),
      });
    }

    const res = await customFetch(`${API_BASE}/documents`, {
      method: 'POST',
      headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
      body: isFormData ? data : JSON.stringify(data),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(trServerError(err, tr('errCreateDocument')));
    }
    return res.json();
  },

  async deleteDocument(id: string): Promise<boolean> {
    const res = await customFetch(`${API_BASE}/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    // Never report a delete that the server refused (permission, not found, conflict)
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('srvInternalError')));
    return true;
  },

  async getNextDocNumber(type: 'incoming' | 'outgoing', category = 'CV', department = 'HCNS'): Promise<{ nextNumber: string }> {
    const res = await customFetch(`${API_BASE}/documents/next-number?type=${type}&category=${category}&department=${department}`);
    if (!res.ok) throw new Error(tr('errLoadNextNumber'));
    return res.json();
  },

  // Contracts
  async getContracts(urgency?: string): Promise<ContractRecord[]> {
    const url = urgency && urgency !== 'all' ? `${API_BASE}/contracts?urgency=${encodeURIComponent(urgency)}` : `${API_BASE}/contracts`;
    const res = await customFetch(url);
    if (!res.ok) throw new Error(tr('errLoadContracts'));
    return res.json();
  },

  async getContract(id: string): Promise<ContractRecord> {
    const res = await customFetch(`${API_BASE}/contracts/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(tr('errLoadContract'));
    return res.json();
  },

  async createContract(
    data: FormData | Partial<ContractRecord>,
    onProgress?: (percent: number) => void
  ): Promise<ContractRecord> {
    const isFormData = data instanceof FormData;
    if (isFormData && onProgress && typeof XMLHttpRequest !== 'undefined') {
      return customXhrRequest<ContractRecord>(`${API_BASE}/contracts`, data, {
        defaultErrorMsg: tr('errCreateContract'),
        networkErrorMsg: tr('errNetworkUploadContract'),
        timeoutErrorMsg: tr('errTimeoutCreateContract'),
        onProgress: (percent) => onProgress(percent),
      });
    }

    const res = await customFetch(`${API_BASE}/contracts`, {
      method: 'POST',
      headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
      body: isFormData ? data : JSON.stringify(data),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(trServerError(err, tr('errCreateContract')));
    }
    return res.json();
  },

  async liquidateContract(id: string, expectedRevision: number): Promise<ContractRecord> {
    const res = await customFetch(`${API_BASE}/contracts/${encodeURIComponent(id)}/liquidate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_revision: expectedRevision }),
    });
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('errLiquidateContract')));
    return res.json();
  },

  async deleteContract(id: string): Promise<boolean> {
    const res = await customFetch(`${API_BASE}/contracts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    // Never report a delete that the server refused (permission, not found, conflict)
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('srvInternalError')));
    return true;
  },

  /** Server-side dry run of an import: validation, duplicates, new vs. updated rows with field changes. */
  async previewImport(type: 'contract' | 'document', rows: any[]): Promise<ImportPreview> {
    const res = await customFetch(`${API_BASE}/${type}s/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(trServerError(err, tr(type === 'contract' ? 'errImportContracts' : 'errImportDocuments')));
    }
    return res.json();
  },

  async bulkImportContracts(
    contracts: Array<Partial<ContractRecord>>,
    options: ImportCommitOptions = {}
  ): Promise<{ success: boolean; message: string; added: number; updated: number; total: number }> {
    const res = await customFetch(`${API_BASE}/contracts/bulk-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contracts, confirm_updates: options.confirmUpdates === true, file_name: options.fileName }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(trServerError(err, tr('errImportContracts')));
    }
    return res.json();
  },

  // Search & Stats
  async searchAll(query: string): Promise<{ documents: DocumentRecord[]; contracts: ContractRecord[] }> {
    const res = await customFetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(tr('errSearch'));
    return res.json();
  },

  async getStats(): Promise<any> {
    const res = await customFetch(`${API_BASE}/stats`);
    if (!res.ok) throw new Error(tr('errLoadStats'));
    return res.json();
  },

  async getCategories(): Promise<any> {
    const res = await customFetch(`${API_BASE}/categories`);
    if (!res.ok) throw new Error(tr('errLoadCategories'));
    return res.json();
  },

  async getPartners(): Promise<PartnerRecord[]> {
    const res = await customFetch(`${API_BASE}/partners`);
    if (!res.ok) throw new Error(tr('errLoadPartners'));
    return res.json();
  },

  // expected_revision: the revision the user started editing; the server answers 409 if it changed since
  async updateContract(id: string, data: Partial<ContractRecord> & { expected_revision: number }): Promise<ContractRecord> {
    const res = await customFetch(`${API_BASE}/contracts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      // Surface the server's message (validation errors, 409 revision conflicts)
      const err = (await res.json().catch(() => ({}))) as any;
      throw Object.assign(new Error(trServerError(err, tr('errUpdateContract'))), { code: err.code, current: err.current });
    }
    return res.json();
  },

  async updateDocument(id: string, data: Partial<DocumentRecord> & { expected_revision: number }): Promise<DocumentRecord> {
    const res = await customFetch(`${API_BASE}/documents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      // Surface the server's message (validation errors, 409 revision conflicts)
      const err = (await res.json().catch(() => ({}))) as any;
      throw Object.assign(new Error(trServerError(err, tr('errUpdateDocument'))), { code: err.code, current: err.current });
    }
    return res.json();
  },

  // Partners CRUD
  async createPartner(data: Partial<PartnerRecord>): Promise<PartnerRecord> {
    const res = await customFetch(`${API_BASE}/partners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(tr('errCreatePartner'));
    return res.json();
  },

  async updatePartner(id: string, data: Partial<PartnerRecord>): Promise<PartnerRecord> {
    const res = await customFetch(`${API_BASE}/partners/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(tr('errUpdatePartner'));
    return res.json();
  },

  async deletePartner(id: string, expectedRevision: number): Promise<boolean> {
    const res = await customFetch(`${API_BASE}/partners/${encodeURIComponent(id)}?expected_revision=${expectedRevision}`, {
      method: 'DELETE',
    });
    // Never report a delete that the server refused (permission, not found, conflict)
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('srvInternalError')));
    return true;
  },

  // There is no separate toggle endpoint: a revision-checked PATCH of is_locked
  async togglePartnerLock(partner: PartnerRecord): Promise<PartnerRecord> {
    const res = await customFetch(`${API_BASE}/partners/${encodeURIComponent(partner.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_locked: !partner.is_locked, expected_revision: partner.revision ?? 0 }),
    });
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('errTogglePartnerLock')));
    return res.json();
  },

  // Categories & Settings
  async getCategorySettings(): Promise<{ categories: any; settings: any }> {
    const [catRes, setRes] = await Promise.all([
      customFetch(`${API_BASE}/categories`),
      customFetch(`${API_BASE}/categories/settings`),
    ]);
    if (!catRes.ok || !setRes.ok) throw new Error(tr('errLoadSettings'));
    const categories = await catRes.json();
    const settings = await setRes.json();
    return { categories, settings };
  },

  async addCategoryItem(categoryType: string, item: any): Promise<any> {
    const res = await customFetch(`${API_BASE}/categories/${encodeURIComponent(categoryType)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item }),
    });
    if (!res.ok) throw new Error(tr('errAddCategoryItem'));
    return res.json();
  },

  async updateCategoryItem(categoryType: string, index: number | string, item: any): Promise<any> {
    const res = await customFetch(`${API_BASE}/categories/${encodeURIComponent(categoryType)}/${index}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item }),
    });
    if (!res.ok) throw new Error(tr('errUpdateCategoryItem'));
    return res.json();
  },

  async deleteCategoryItem(categoryType: string, index: number | string): Promise<boolean> {
    const res = await customFetch(`${API_BASE}/categories/${encodeURIComponent(categoryType)}/${index}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(tr('errDeleteCategoryItem'));
    return res.ok;
  },

  async updateSettings(settings: any): Promise<any> {
    const res = await customFetch(`${API_BASE}/categories/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error(tr('errUpdateSettings'));
    return res.json();
  },

  // File Upload with Progress Tracking & Instant Error Detection
  uploadFileWithProgress(
    file: File,
    onProgress?: (percent: number, loaded: number, total: number) => void
  ): Promise<{
    success: boolean;
    file_key: string;
    file_name: string;
    file_size: number;
    file_type: string;
    url: string;
  }> {
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB Cloudflare D1 limit
    if (file.size > MAX_FILE_SIZE) {
      const err = new Error(tr('errFileTooLarge', { size: (file.size / (1024 * 1024)).toFixed(2) }));
      return Promise.reject(err);
    }

    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      if (typeof XMLHttpRequest === 'undefined') {
        if (onProgress) onProgress(50, file.size / 2, file.size);
        customFetch(`${API_BASE}/files/upload`, {
          method: 'POST',
          body: formData,
        })
          .then(async (res) => {
            if (!res.ok) {
              const err = (await res.json().catch(() => ({}))) as any;
              throw new Error(trServerError(err, tr('errUploadToServer')));
            }
            if (onProgress) onProgress(100, file.size, file.size);
            return res.json() as Promise<any>;
          })
          .then((data) => resolve(data))
          .catch(reject);
        return;
      }

      customXhrRequest<{
        success: boolean;
        file_key: string;
        file_name: string;
        file_size: number;
        file_type: string;
        url: string;
      }>(`${API_BASE}/files/upload`, formData, {
        defaultErrorMsg: tr('errUploadFailed'),
        networkErrorMsg: tr('errNetworkUploadFile'),
        timeoutErrorMsg: tr('errTimeoutUploadFile'),
        includeHttpCodeInError: true,
        fallbackSuccessPayload: {
          success: true,
          file_key: '',
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          url: '',
        },
        onProgress: (percent, loaded, total) => {
          if (onProgress) {
            onProgress(percent, percent === 100 ? file.size : loaded, percent === 100 ? file.size : total);
          }
        },
      })
        .then(resolve)
        .catch(reject);
    });
  },

  async uploadFile(file: File, onProgress?: (percent: number, loaded: number, total: number) => void): Promise<{
    success: boolean;
    file_key: string;
    file_name: string;
    file_size: number;
    file_type: string;
    url: string;
  }> {
    return this.uploadFileWithProgress(file, onProgress);
  },

  // Google Drive Sync
  async syncGoogleDrive(id: string, type: 'contract' | 'document', drive_url: string | undefined, expectedRevision: number): Promise<{
    success: boolean;
    record: any;
    google_drive_url: string;
  }> {
    const res = await customFetch(`${API_BASE}/files/sync-drive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, type, drive_url, expected_revision: expectedRevision }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(trServerError(err, tr('errMoveToDrive')));
    }
    return res.json();
  },

  // Notifications
  async getNotifications(): Promise<{ notifications: any[]; unreadCount: number }> {
    const res = await customFetch(`${API_BASE}/notifications`);
    if (!res.ok) {
      return { notifications: [], unreadCount: 0 };
    }
    return res.json();
  },

  async markNotificationAsRead(id: string): Promise<boolean> {
    const res = await customFetch(`${API_BASE}/notifications/${id}/read`, {
      method: 'PATCH',
    });
    return res.ok;
  },

  async markAllNotificationsAsRead(): Promise<boolean> {
    const res = await customFetch(`${API_BASE}/notifications/read-all`, {
      method: 'POST',
    });
    return res.ok;
  },

  // Currencies API
  async getCurrencies(): Promise<any[]> {
    const res = await customFetch(`${API_BASE}/categories/currencies`);
    if (!res.ok) return [];
    return res.json();
  },

  async updateCurrencies(currencies: any[]): Promise<any[]> {
    const res = await customFetch(`${API_BASE}/categories/currencies`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currencies),
    });
    if (!res.ok) throw new Error(tr('errUpdateCurrencies'));
    return res.json();
  },

  async addCurrency(currency: any): Promise<any[]> {
    const res = await customFetch(`${API_BASE}/categories/currencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currency),
    });
    if (!res.ok) throw new Error(tr('errAddCurrency'));
    return res.json();
  },

  async updateCurrency(code: string, updates: any): Promise<any> {
    const list = await this.getCurrencies();
    const updatedList = list.map(c => c.code.toUpperCase() === code.toUpperCase() ? { ...c, ...updates } : c);
    return this.updateCurrencies(updatedList);
  },

  // Document bulk-import
  async bulkImportDocuments(documents: any[], options: ImportCommitOptions = {}): Promise<any> {
    const res = await customFetch(`${API_BASE}/documents/bulk-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documents, confirm_updates: options.confirmUpdates === true, file_name: options.fileName }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(trServerError(err, tr('errImportDocuments')));
    }
    return res.json();
  },

  // Users API
  async getUsers(): Promise<any[]> {
    const res = await customFetch(`${API_BASE}/users`);
    if (!res.ok) throw new Error(tr('errLoadUsers'));
    return res.json();
  },

  async createUser(userData: any): Promise<any> {
    const res = await customFetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(trServerError(err, tr('errCreateUser')));
    }
    return res.json();
  },

  async updateUser(id: string, userData: any): Promise<any> {
    const res = await customFetch(`${API_BASE}/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(trServerError(err, tr('errUpdateUser')));
    }
    return res.json();
  },

  async deleteUser(id: string, expectedRevision: number): Promise<boolean> {
    const res = await customFetch(`${API_BASE}/users/${encodeURIComponent(id)}?expected_revision=${expectedRevision}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(trServerError(err, tr('errDeleteUser')));
    }
    return true;
  },

  // Audit Logs API
  // Workflow (incoming / outgoing documents)
  async transitionDocument(
    id: string,
    payload: { to: string; expected_revision: number; handler?: string; due_date?: string; directive?: string; signer?: string; note?: string }
  ): Promise<any> {
    const res = await customFetch(`${API_BASE}/documents/${encodeURIComponent(id)}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('errUpdateDocument')));
    return res.json();
  },

  async terminateContract(id: string, payload: { date?: string; reason: string; expected_revision: number }): Promise<any> {
    const res = await customFetch(`${API_BASE}/contracts/${encodeURIComponent(id)}/terminate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('errUpdateContract')));
    return res.json();
  },

  async addContractAppendix(
    id: string,
    payload: {
      appendix_number: string;
      title: string;
      signed_date: string;
      new_end_date?: string | null;
      new_value?: number | null;
      summary?: string;
      expected_revision: number;
    }
  ): Promise<{ appendix: any; contract: any }> {
    const res = await customFetch(`${API_BASE}/contracts/${encodeURIComponent(id)}/appendices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('errUpdateContract')));
    return res.json();
  },

  // Attachments (several files per record, with versions)
  async getAttachments(type: 'document' | 'contract', id: string, includeVersions = false): Promise<AttachmentRecord[]> {
    const res = await customFetch(`${API_BASE}/attachments/${type}/${encodeURIComponent(id)}${includeVersions ? '?versions=1' : ''}`);
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('attFailed')));
    return ((await res.json()) as any).attachments;
  },

  /** Resolves only after the server confirmed the file and the record were saved. */
  addAttachment(
    type: 'document' | 'contract',
    id: string,
    file: File,
    options: { expectedRevision: number; replaces?: string; onProgress?: (percent: number) => void }
  ): Promise<{ attachment: AttachmentRecord; record: any }> {
    const form = new FormData();
    form.append('file', file);
    form.append('expected_revision', String(options.expectedRevision));
    if (options.replaces) form.append('replaces', options.replaces);
    return customXhrRequest(`${API_BASE}/attachments/${type}/${encodeURIComponent(id)}`, form, {
      defaultErrorMsg: tr('attFailed'),
      networkErrorMsg: tr('attFailed'),
      timeoutErrorMsg: tr('attFailed'),
      onProgress: options.onProgress ? (p) => options.onProgress!(p) : undefined,
    });
  },

  async removeAttachment(attachmentId: string, expectedRevision: number): Promise<{ record: any }> {
    const res = await customFetch(`${API_BASE}/attachments/${encodeURIComponent(attachmentId)}?expected_revision=${expectedRevision}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('attFailed')));
    return res.json();
  },

  async getHistory(type: 'document' | 'contract', id: string): Promise<any[]> {
    const res = await customFetch(`${API_BASE}/history/${type}/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('histLoadFailed')));
    return ((await res.json()) as any).history;
  },

  // Trash
  async getTrash(): Promise<{ documents: any[]; contracts: any[]; partners: any[] }> {
    const res = await customFetch(`${API_BASE}/trash`);
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('srvInternalError')));
    return res.json();
  },

  async restoreFromTrash(type: 'document' | 'contract' | 'partner', id: string): Promise<void> {
    const res = await customFetch(`${API_BASE}/trash/${type}/${encodeURIComponent(id)}/restore`, { method: 'POST' });
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('srvInternalError')));
  },

  async purgeFromTrash(type: 'document' | 'contract' | 'partner', id: string): Promise<void> {
    const res = await customFetch(`${API_BASE}/trash/${type}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('srvInternalError')));
  },

  async storageCheck(): Promise<{ ok: boolean; missing: string[]; orphans: Array<{ key: string; size: number }>; stored_objects: number; referenced_files: number }> {
    const res = await customFetch(`${API_BASE}/admin/storage-check`);
    if (!res.ok) throw new Error(trServerError((await res.json().catch(() => ({}))) as any, tr('reconFailed')));
    return res.json();
  },

  async getAuditLogs(limit = 100): Promise<any[]> {
    const res = await customFetch(`${API_BASE}/audit-logs?limit=${limit}`);
    if (!res.ok) return [];
    return res.json();
  },
};

