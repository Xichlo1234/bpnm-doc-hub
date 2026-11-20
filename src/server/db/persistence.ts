import * as fs from 'fs';
import * as path from 'path';
import type { ContractRecord, DocumentRecord, PartnerRecord, NotificationRecord, UserAccount, AuditLogRecord, CurrencyItem } from '../types.ts';
import { getSeedDataset } from './seed.ts';
import initialCategories from './categories.json';

// Pre-migration data sources (data/*.json locally, the system_data blob on D1) and seed defaults.
// Since migrations/0001 the database tables are the source of truth; these are only read once,
// by importLegacyDataset() in repository.ts.

// DATA_DIR can be overridden (tests run against a throwaway copy of data/)
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

export const defaultCurrencies: CurrencyItem[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, is_default: true, active: true },
  { code: 'KHR', name: 'Cambodian Riel', symbol: '៛', decimals: 0, active: true },
  { code: 'VND', name: 'Việt Nam Đồng', symbol: '₫', decimals: 0, active: true },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2, active: true },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, active: true },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', decimals: 2, active: true },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimals: 2, active: true },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2, active: true },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0, active: true },
];

export const defaultUsers: UserAccount[] = [
  {
    id: 'admin_root',
    username: 'admin',
    // Bootstrap password for a fresh install only; the backend forces a change on first login
    password: 'Admin@6868',
    must_change_password: true,
    name: 'Quản trị viên Hệ thống',
    email: 'admin@sgii.vn',
    role: 'admin',
    status: 'active',
    department: 'Ban Giám Đốc',
    preferred_language: 'vi',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'user_viewer',
    username: 'user',
    password: 'User@123456',
    must_change_password: true,
    name: 'Chuyên viên Tra cứu',
    email: 'user@sgii.vn',
    role: 'user',
    status: 'active',
    department: 'Văn phòng Tổng hợp',
    preferred_language: 'vi',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export interface SystemSettings {
  alert_level_1_days: number; // default 30 days
  alert_level_2_days: number; // default 60 days
  report_currency: string;    // default USD
  company_code: string;       // default SGII
  company_name: string;       // default Sambo Gold
  google_drive_folder_url?: string; // Google drive cloud folder
}

export const defaultSettings: SystemSettings = {
  alert_level_1_days: 30,
  alert_level_2_days: 60,
  report_currency: 'USD',
  company_code: 'SGII',
  company_name: 'Công ty Cổ phần đầu tư quốc tế Sambo Gold - SGII',
  google_drive_folder_url: 'https://drive.google.com/drive/my-drive',
};

export interface PersistedDataset {
  contracts: ContractRecord[];
  documents: DocumentRecord[];
  partners: PartnerRecord[];
  categories: any;
  settings: SystemSettings;
  notifications: NotificationRecord[];
  users: UserAccount[];
  audit_logs: AuditLogRecord[];
  currencies: CurrencyItem[];
}

// Read-only: returns null for files that don't exist so missing data falls back to seeds.
function readJsonFile<T>(fileName: string): T | null {
  try {
    const filePath = path.join(DATA_DIR, fileName);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch (_err) {
    // Unreadable / serverless filesystem
  }
  return null;
}

/** Reads the legacy data/*.json files (local dev before the SQLite migration). */
export function readLegacyJsonDataset(): Partial<PersistedDataset> | null {
  const dataset: Partial<PersistedDataset> = {
    contracts: readJsonFile('contracts.json') ?? undefined,
    documents: readJsonFile('documents.json') ?? undefined,
    partners: readJsonFile('partners.json') ?? undefined,
    categories: readJsonFile('categories.json') ?? undefined,
    settings: readJsonFile('settings.json') ?? undefined,
    notifications: readJsonFile('notifications.json') ?? undefined,
    users: readJsonFile('users.json') ?? undefined,
    audit_logs: readJsonFile('audit_logs.json') ?? undefined,
    currencies: readJsonFile('currencies.json') ?? undefined,
  };
  return Object.values(dataset).some((v) => v !== undefined) ? dataset : null;
}

/** Reads the legacy single-row JSON blob from D1 (production before the migration). */
export async function readLegacyD1Dataset(db: any): Promise<Partial<PersistedDataset> | null> {
  try {
    const row = await db.prepare('SELECT json_data FROM system_data WHERE key = ?').bind('primary_dataset').first();
    if (row?.json_data) return JSON.parse(row.json_data);
  } catch (_err) {
    // system_data does not exist on fresh databases
  }
  return null;
}

/** Fills every missing/empty collection of a (possibly partial) dataset with seed data. */
export function withSeedDefaults(data: Partial<PersistedDataset> | null): PersistedDataset {
  const pick = <T>(value: T[] | undefined, fallback: T[]) => (value && value.length > 0 ? value : fallback);
  const seed = getSeedDataset();
  return {
    contracts: pick(data?.contracts, seed.contracts),
    documents: pick(data?.documents, seed.documents),
    partners: pick(data?.partners, seed.partners),
    categories: { ...JSON.parse(JSON.stringify(initialCategories)), ...(data?.categories || {}) },
    settings: { ...defaultSettings, ...(data?.settings || {}) },
    notifications: data?.notifications || [],
    users: pick(data?.users, (seed.users ?? defaultUsers).map((u) => ({ ...u }))),
    audit_logs: data?.audit_logs || [],
    currencies: pick(data?.currencies, defaultCurrencies),
  };
}
