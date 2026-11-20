import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../src/server/index.ts';
import { store } from '../src/server/db/store.ts';
import { api, authStorage } from '../src/client/src/services/api.ts';
import {
  getNormalizedDocTypes,
  getNormalizedDepartments,
  getUnifiedContractDepartments,
  getUnifiedContractTypes,
} from '../src/client/src/utils/categoryHelpers.ts';
import {
  formatNotificationTime,
  formatSystemDateTime,
} from '../src/client/src/utils/dateTime.ts';

describe('System Architecture & Consistency Regression Tests', () => {
  const originalFetch = globalThis.fetch;
  const originalXHR = (globalThis as any).XMLHttpRequest;

  beforeEach(() => {
    store.reset();

    // Provide a browser-like localStorage mock
    const storageMap = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (key: string) => (storageMap.has(key) ? storageMap.get(key)! : null),
        setItem: (key: string, val: string) => storageMap.set(key, String(val)),
        removeItem: (key: string) => storageMap.delete(key),
        clear: () => storageMap.clear(),
      },
    });
    (globalThis as any).window = globalThis;

    // Route global fetch to Hono app
    globalThis.fetch = async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      const fullUrl = url.startsWith('http') ? url : `http://localhost${url}`;
      return app.request(fullUrl, init);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalXHR === undefined) {
      delete (globalThis as any).XMLHttpRequest;
    } else {
      (globalThis as any).XMLHttpRequest = originalXHR;
    }
  });

  it('Bug 1: XMLHttpRequest in api.createContract / createDocument attaches Bearer token from authStorage (sgii_auth_token) instead of failing with 401', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      // 1. Login via api.login -> sets token in authStorage ('sgii_auth_token')
      const loginRes = await api.login('admin', 'Admin@6868');
      expect(loginRes.token).toBeTruthy();
      expect(authStorage.getToken()).toBe(loginRes.token);
      // Notice localStorage has 'sgii_auth_token', NOT 'auth_token'
      expect(localStorage.getItem('sgii_auth_token')).toBe(loginRes.token);
      expect(localStorage.getItem('auth_token')).toBeNull();

      // 2. Simulate browser XMLHttpRequest bridged to Hono app.request
      class MockXMLHttpRequest {
        method = 'GET';
        url = '';
        headers: Record<string, string> = {};
        status = 0;
        responseText = '';
        upload: { onprogress: ((e: any) => void) | null } = { onprogress: null };
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        open(method: string, url: string) {
          this.method = method;
          this.url = url;
        }

        setRequestHeader(key: string, value: string) {
          this.headers[key] = value;
        }

        send(body: any) {
          const fullUrl = this.url.startsWith('http') ? this.url : `http://localhost${this.url}`;
          if (this.upload.onprogress) {
            this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
          }
          Promise.resolve(
            app.request(fullUrl, {
              method: this.method,
              headers: this.headers,
              body,
            })
          )
            .then(async (res: Response) => {
              this.status = res.status;
              this.responseText = await res.text();
              if (this.onload) this.onload();
            })
            .catch(() => {
              if (this.onerror) this.onerror();
            });
        }
      }

      (globalThis as any).XMLHttpRequest = MockXMLHttpRequest;

      // 3. Call api.createContract with FormData + onProgress (exact path taken by CreateModal.handleContractSubmit)
      const formData = new FormData();
      formData.append('contract_number', '01/2026/HĐ-KSNB');
      formData.append('title', 'Hợp đồng kiểm toán nội bộ 2026');
      formData.append('contract_type', 'service');
      formData.append('contract_category', 'Giấy ủy quyền (POA)');
      formData.append('party_a', 'CÔNG TY CP ĐẦU TƯ QUỐC TẾ SÀI GÒN (SGII)');
      formData.append('party_b', 'Công ty Kiểm toán ABC');
      formData.append('department', 'BKS - Ban Kiểm soát nội bộ');
      formData.append('value', '150000000');
      formData.append('currency', 'VND');
      formData.append('signed_date', '2026-10-25');
      formData.append('start_date', '2026-10-25');

      const progressEvents: number[] = [];
      const createdContract = await api.createContract(formData, (pct) => progressEvents.push(pct));

      expect(createdContract).toHaveProperty('id');
      expect(createdContract.title).toBe('Hợp đồng kiểm toán nội bộ 2026');
      expect(createdContract.department).toBe('BKS - Ban Kiểm soát nội bộ');
      expect(progressEvents.length).toBeGreaterThan(0);

      // 4. Also verify api.createDocument with FormData + onProgress attaches Bearer token
      const docFormData = new FormData();
      docFormData.append('document_number', 'ĐẾN-2026-0099');
      docFormData.append('doc_type', 'incoming');
      docFormData.append('title', 'Công văn kiểm thử XHR');
      docFormData.append('doc_category', 'Giấy ủy quyền');
      docFormData.append('department', 'Ban quản lý Dự án');
      docFormData.append('issue_date', '2026-10-25');
      docFormData.append('issuer', 'UBND tỉnh Sơn La');
      const createdDoc = await api.createDocument(docFormData, (pct) => progressEvents.push(pct));
      expect(createdDoc).toHaveProperty('id');
      expect(createdDoc.department).toBe('Ban quản lý Dự án');
      expect(createdDoc.doc_category).toBe('Giấy ủy quyền');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  it('Bug 2 & 3: Adding new internal departments and 12th doc_type in Settings immediately reflects in api.getCategories() and GET /api/documents/categories even when store is hydrated from D1/persistence', async () => {
    // Simulate D1 hydration (where store.categories is a fresh JSON object, separate from static categories.json import)
    (store as any).categories = JSON.parse(JSON.stringify(store.getCategories()));
    // 1. Add 2 new internal departments as reported by user
    const dept1Res = await app.request('/api/categories/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item: { code: 'KSNB', name: 'Ban kiểm soát nội bộ', lead: '' },
      }),
    });
    expect(dept1Res.status).toBe(201);

    const dept2Res = await app.request('/api/categories/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item: { code: 'QLDA', name: 'Ban quản lý Dự án', lead: '' },
      }),
    });
    expect(dept2Res.status).toBe(201);

    // 2. Add 12th document type (Mục 12) in Settings as reported by user
    const docType12Res = await app.request('/api/categories/doc_types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item: { code: '12', name: 'Mục 12 - Tài liệu mới', prefix: 'M12' },
      }),
    });
    expect(docType12Res.status).toBe(201);

    // 3. Fetch categories via api.getCategories() (used by CreateModal & EditRecordModal)
    const modalCategories = await api.getCategories();

    const deptNames = modalCategories.departments.map((d: any) =>
      typeof d === 'string' ? d : d.name
    );
    expect(deptNames).toContain('Ban kiểm soát nội bộ');
    expect(deptNames).toContain('Ban quản lý Dự án');

    expect(modalCategories.doc_types.length).toBeGreaterThanOrEqual(12);
    const docTypeNames = modalCategories.doc_types.map((dt: any) =>
      typeof dt === 'string' ? dt : dt.name
    );
    expect(docTypeNames).toContain('Mục 12 - Tài liệu mới');

    // 4. Also verify GET /api/documents/categories returns the live store categories (not static JSON)
    const legacyEndpointRes = await app.request('/api/documents/categories');
    expect(legacyEndpointRes.status).toBe(200);
    const legacyCats = (await legacyEndpointRes.json()) as any;
    expect(legacyCats.doc_types.map((dt: any) => dt.name)).toContain('Mục 12 - Tài liệu mới');
    expect(legacyCats.departments.map((d: any) => d.name)).toContain('Ban kiểm soát nội bộ');
    expect(legacyCats.departments.map((d: any) => d.name)).toContain('Ban quản lý Dự án');

    // 5. Verify unified frontend helpers surface the new internal departments & doc_type #12 across Contract & Document dropdowns
    const unifiedContractDepts = getUnifiedContractDepartments(modalCategories);
    expect(unifiedContractDepts).toContain('KSNB - Ban kiểm soát nội bộ');
    expect(unifiedContractDepts).toContain('QLDA - Ban quản lý Dự án');
    expect(unifiedContractDepts).toContain('ADM - Hanh chinh');

    const unifiedContractTypes = getUnifiedContractTypes(modalCategories);
    expect(unifiedContractTypes).toContain('Mục 12 - Tài liệu mới (12)');

    const normalizedDocTypes = getNormalizedDocTypes(modalCategories);
    expect(normalizedDocTypes.some((d) => d.name === 'Mục 12 - Tài liệu mới' && d.code === '12')).toBe(true);

    const normalizedDepts = getNormalizedDepartments(modalCategories);
    expect(normalizedDepts.some((d) => d.name === 'Ban kiểm soát nội bộ' && d.code === 'KSNB')).toBe(true);
    expect(normalizedDepts.some((d) => d.name === 'Ban quản lý Dự án' && d.code === 'QLDA')).toBe(true);
  });

  it('Bug 4 (Timezone): Converts UTC notification and audit timestamps to Asia/Ho_Chi_Minh (GMT+7) local time', () => {
    // 07:11 UTC is 14:11 in Vietnam (GMT+7)
    expect(formatNotificationTime('2026-10-26T07:11:00.000Z')).toBe('26/10 14:11');
    expect(formatNotificationTime('2026-10-26 07:11:25')).toBe('26/10 14:11');
    expect(formatNotificationTime('2026-03-21')).toBe('21/03/2026');

    expect(formatSystemDateTime('2026-10-26T07:11:25.000Z')).toBe('26/10/2026 14:11:25');
    expect(formatSystemDateTime('2026-10-26 07:11:25')).toBe('26/10/2026 14:11:25');
  });

  it('Bug 5 (Active vs Indefinite Contracts): Active contract filter strictly excludes indefinite contracts and matches stats.activeCount', () => {
    const stats = store.getStats();
    const allContracts = store.getContracts();

    const activeFiltered = allContracts.filter(c => c.urgency?.level === 'active');
    const indefiniteFiltered = allContracts.filter(c => c.urgency?.level === 'indefinite');

    expect(activeFiltered.length).toBe(stats.activeCount);
    expect(indefiniteFiltered.length).toBe(stats.indefiniteCount);
    expect(activeFiltered.every(c => Boolean(c.end_date && c.end_date.trim() !== ''))).toBe(true);
    expect(indefiniteFiltered.every(c => !c.end_date || c.end_date.trim() === '')).toBe(true);
  });

  it('Bug 6 (Confidential Labor Contracts & User-Level RBAC): Separates Labor Contracts from Economic Contracts and enforces strict permission control', async () => {
    // 1. Login as Admin
    const adminLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin@6868' }),
    });
    expect(adminLoginRes.status).toBe(200);
    const { token: adminToken } = (await adminLoginRes.json()) as any;

    // 2. Create a regular user WITHOUT labor contract access
    const createUserRes = await app.request('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        username: 'staff_regular',
        password: 'Staff@2026',
        name: 'Nhân viên Hành chính',
        email: 'staff@sambo.vn',
        role: 'user',
        can_access_labor_contracts: false,
      }),
    });
    expect(createUserRes.status).toBe(201);
    const regularUser = (await createUserRes.json()) as any;

    // Login as regular user
    const staffLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'staff_regular', password: 'Staff@2026' }),
    });
    expect(staffLoginRes.status).toBe(200);
    const { token: staffToken, user: staffProfile } = (await staffLoginRes.json()) as any;
    // The admin-assigned password works right away, no forced change
    const firstRes = await app.request('/api/contracts', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(firstRes.status).toBe(200);
    expect(staffProfile.can_access_labor_contracts).toBe(false);

    // 3. Admin creates a confidential Labor Contract (Hợp đồng lao động - Mật)
    const createLaborRes = await app.request('/api/contracts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        contract_number: '01/2026/HĐLĐ-MẬT',
        title: 'Hợp đồng lao động Giám đốc Kỹ thuật Mỏ - Mức lương 85.000.000đ',
        contract_type: 'labor',
        contract_category: 'Hợp đồng lao động xác định thời hạn (12 - 36 tháng)',
        party_a: 'Công ty Cổ phần đầu tư quốc tế Sambo Gold - SGII',
        party_b: 'Ông Trần Quốc Bảo',
        department: 'HR - Nhan su',
        value: 85000000,
        currency: 'VND',
        signed_date: '2026-01-10',
        start_date: '2026-01-10',
        end_date: '2028-01-10',
      }),
    });
    expect(createLaborRes.status).toBe(201);
    const laborContract = (await createLaborRes.json()) as any;

    // 4. Verify Admin can see the Labor Contract and stats separate Economic vs Labor
    const adminStatsRes = await app.request('/api/stats', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminStats = (await adminStatsRes.json()) as any;
    expect(adminStats.totalLaborContracts).toBeGreaterThanOrEqual(1);

    // 5. Verify Unauthorized Regular User CANNOT see Labor Contract anywhere
    const staffContractsRes = await app.request('/api/contracts', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const staffContracts = (await staffContractsRes.json()) as any[];
    expect(staffContracts.some((c: any) => c.id === laborContract.id)).toBe(false);

    const staffDirectRes = await app.request(`/api/contracts/${laborContract.id}`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(staffDirectRes.status).toBe(403);

    const staffSearchRes = await app.request('/api/search?q=Trần Quốc Bảo', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const staffSearch = (await staffSearchRes.json()) as any;
    expect(staffSearch.contracts.some((c: any) => c.id === laborContract.id)).toBe(false);

    const staffStatsRes = await app.request('/api/stats', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const staffStats = (await staffStatsRes.json()) as any;
    expect(staffStats.totalLaborContracts).toBe(0);

    // 6. Admin grants `can_access_labor_contracts: true` to regular user
    const grantRes = await app.request(`/api/users/${regularUser.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ can_access_labor_contracts: true }),
    });
    expect(grantRes.status).toBe(200);
    const updatedUser = (await grantRes.json()) as any;
    expect(updatedUser.can_access_labor_contracts).toBe(true);

    // 7. Immediately (even with existing token), authorized user CAN view and manage Labor Contracts!
    const authorizedContractsRes = await app.request('/api/contracts', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const authorizedContracts = (await authorizedContractsRes.json()) as any[];
    expect(authorizedContracts.some((c: any) => c.id === laborContract.id)).toBe(true);

    const authorizedDirectRes = await app.request(`/api/contracts/${laborContract.id}`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    expect(authorizedDirectRes.status).toBe(200);

    const authorizedStatsRes = await app.request('/api/stats', {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    const authorizedStats = (await authorizedStatsRes.json()) as any;
    expect(authorizedStats.totalLaborContracts).toBeGreaterThanOrEqual(1);
  });
});
