export interface NormalizedDocType {
  code: string;
  name: string;
  description?: string;
}

export interface NormalizedDepartment {
  code: string;
  name: string;
  lead?: string;
}

// i18n-data: stored doc type names, matched against category values (display via seedLabel).
export const DEFAULT_DOC_TYPE_NAMES = new Set([
  'Công văn',
  'Quyết định',
  'Thông báo',
  'Tờ trình',
  'Báo cáo',
  'Kế hoạch',
  'Giấy mời',
  'Biên bản',
  'Hợp đồng / Phụ lục',
  'Giấy phép / Chấp thuận',
  'Thư / Email chính thức',
]);

/**
 * Normalizes `categories.doc_types` so both string items and `{ code, prefix, name, description }` objects
 * work uniformly across all dropdowns and auto-numbering helpers.
 */
export function getNormalizedDocTypes(
  categories: any,
  fallbackList: any[] = []
): NormalizedDocType[] {
  const rawList =
    Array.isArray(categories?.doc_types) && categories.doc_types.length > 0
      ? categories.doc_types
      : fallbackList;

  const seen = new Set<string>();
  const result: NormalizedDocType[] = [];

  for (const item of rawList) {
    if (!item) continue;
    const name = typeof item === 'string' ? item.trim() : String(item.name || '').trim();
    const code =
      typeof item === 'string'
        ? ''
        : String(item.code || item.prefix || '').trim();
    const description =
      typeof item === 'object' && item.description ? String(item.description).trim() : undefined;

    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ code, name, description });
    }
  }

  return result;
}

/**
 * Normalizes `categories.departments` so both string items and `{ code, name, lead }` objects
 * work uniformly across Incoming/Outgoing Document modals, Edit modals, and User Management.
 */
export function getNormalizedDepartments(
  categories: any,
  fallbackList: any[] = []
): NormalizedDepartment[] {
  const rawList =
    Array.isArray(categories?.departments) && categories.departments.length > 0
      ? categories.departments
      : fallbackList;

  const seen = new Set<string>();
  const result: NormalizedDepartment[] = [];

  for (const item of rawList) {
    if (!item) continue;
    const name = typeof item === 'string' ? item.trim() : String(item.name || '').trim();
    const code = typeof item === 'string' ? '' : String(item.code || '').trim();
    const lead = typeof item === 'object' && item.lead ? String(item.lead).trim() : '';

    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ code, name, lead });
    }
  }

  return result;
}

/**
 * Unifies `categories.departments` (Internal Departments configured in Settings -> Phòng Ban Nội Bộ)
 * with `categories.contract_departments` so that any newly added internal department (e.g.
 * "Ban kiểm soát nội bộ", "Ban quản lý Dự án") is immediately selectable in Contract forms as well
 * as Document forms.
 */
export function getUnifiedContractDepartments(
  categories: any,
  fallbackContractDepts: any[] = [],
  fallbackInternalDepts: any[] = [],
  currentValue?: string | null
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const addOption = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  };

  if (currentValue && currentValue.trim()) {
    addOption(currentValue);
  }

  // 1. Include internal departments from Settings -> Phòng Ban Nội Bộ (`categories.departments`)
  const internalDepts = getNormalizedDepartments(categories, fallbackInternalDepts);
  for (const dept of internalDepts) {
    const formatted = dept.code ? `${dept.code} - ${dept.name}` : dept.name;
    addOption(formatted);
  }

  // 2. Include contract-specific departments (`categories.contract_departments`)
  const rawContractDepts =
    Array.isArray(categories?.contract_departments) && categories.contract_departments.length > 0
      ? categories.contract_departments
      : fallbackContractDepts;

  for (const item of rawContractDepts) {
    if (!item) continue;
    const formatted =
      typeof item === 'string'
        ? item
        : item.code
        ? `${item.code} - ${item.name}`
        : String(item.name || '');
    addOption(formatted);
  }

  return result;
}

/**
 * Unifies `categories.contract_types` with custom document types added in `categories.doc_types`
 * so that if an administrator adds a new type in Settings -> Loại Văn Bản (e.g. item #12 "Giấy ủy quyền (POA)")
 * or Settings -> Phân Loại Hợp Đồng, it is always available in the Contract category dropdown.
 */
export function getUnifiedContractTypes(
  categories: any,
  fallbackContractTypes: any[] = [],
  fallbackDocTypes: any[] = [],
  currentValue?: string | null
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const addOption = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  };

  if (currentValue && currentValue.trim()) {
    addOption(currentValue);
  }

  const rawContractTypes =
    Array.isArray(categories?.contract_types) && categories.contract_types.length > 0
      ? categories.contract_types
      : fallbackContractTypes;

  for (const ct of rawContractTypes) {
    if (!ct) continue;
    const name = typeof ct === 'string' ? ct : String(ct.name || '');
    addOption(name);
  }

  // Also include any custom doc_types added in Settings -> Loại Văn Bản (e.g., item #12 POA - Giấy ủy quyền)
  const docTypes = getNormalizedDocTypes(categories, fallbackDocTypes);
  for (const dt of docTypes) {
    if (!DEFAULT_DOC_TYPE_NAMES.has(dt.name)) {
      const label = dt.code ? `${dt.name} (${dt.code})` : dt.name;
      addOption(label);
    }
  }

  return result;
}
