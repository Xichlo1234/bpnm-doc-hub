export type InternalDocumentType = 'internal_incoming' | 'internal_outgoing';
export type NumberedDocumentType = 'incoming' | 'outgoing' | InternalDocumentType;
export const DOCUMENT_TYPES = ['incoming', 'outgoing', 'internal_incoming', 'internal_outgoing', 'internal', 'decision', 'other'] as const;
export type DocumentType = typeof DOCUMENT_TYPES[number];

export function isDirectionalInternalType(type?: string | null): type is InternalDocumentType {
  return type === 'internal_incoming' || type === 'internal_outgoing';
}

export function isNumberedDocumentType(type?: string | null): type is NumberedDocumentType {
  return type === 'incoming' || type === 'outgoing' || isDirectionalInternalType(type);
}

export function isInternalDocument(type?: string | null): boolean {
  return isDirectionalInternalType(type) || type === 'internal' || type === 'decision';
}

export interface DocumentRecord {
  id: string;
  document_number: string;
  original_doc_number?: string | null;
  title: string;
  doc_type: DocumentType;
  doc_category?: string | null;
  issuer: string | null;
  recipient?: string | null;
  signer: string | null;
  department?: string | null;
  handler?: string | null;
  issue_date: string;
  received_date: string | null;
  due_date?: string | null;
  completed_date?: string | null;
  urgency_level?: string | null;
  security_level?: string | null;
  linked_doc_number?: string | null;
  linked_doc_title?: string | null;
  send_method?: string | null;
  status?: string | null;
  directive?: string | null;
  storage_location?: string | null;
  notes?: string | null;
  summary: string | null;
  tags: string | null;
  file_key: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  google_drive_url?: string | null;
  google_drive_synced_at?: string | null;
  created_at: string;
  updated_at: string;
  // Incremented on every save; used for optimistic concurrency (409 on stale edits)
  revision?: number;
  // Soft delete: set while the record is in the trash
  deleted_at?: string | null;
  deleted_by?: string | null;
  deadline_status?: {
    level: string;
    label: string;
    daysRemaining: number | null;
    badgeType: BadgeType;
    color: string;
  };
}

export type ContractType = 'service' | 'lease' | 'procurement' | 'labor' | 'nda' | 'other';
export type ContractStatus = 'active' | 'liquidated' | 'terminated';

export type UrgencyLevel = 'urgent' | 'warning' | 'notice' | 'active' | 'expired' | 'indefinite' | 'liquidated' | 'terminated';
export type BadgeType = 'urgent' | 'warning' | 'notice' | 'success' | 'danger' | 'info' | 'gray';

export interface UrgencyInfo {
  level: UrgencyLevel;
  label: string;
  daysRemaining: number | null;
  badgeType: BadgeType;
  color: string;
}

export interface ContractRecord {
  id: string;
  contract_number: string;
  original_contract_number?: string | null;
  title: string;
  title_en?: string | null;
  contract_type: ContractType;
  contract_category?: string | null;
  party_a: string;
  party_b: string;
  partner_code?: string | null;
  partner_name_en?: string | null;
  partner_tax_id: string | null;
  partner_contact: string | null;
  department?: string | null;
  value: number;
  original_value?: number;
  currency: string;
  exchange_rate?: number;
  signed_date: string;
  start_date: string;
  end_date: string | null;
  duration_text?: string | null;
  status: ContractStatus;
  status_raw?: string | null;
  renewal_terms: string | null;
  notes?: string | null;
  storage_location?: string | null;
  electronic_location?: string | null;
  check_status?: string | null;
  file_key: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  google_drive_url?: string | null;
  google_drive_synced_at?: string | null;
  created_at: string;
  updated_at: string;
  // Incremented on every save; used for optimistic concurrency (409 on stale edits)
  revision?: number;
  deleted_at?: string | null;
  deleted_by?: string | null;
  urgency?: UrgencyInfo;
}

export interface PartnerRecord {
  id: string;
  code: string;
  name_vn: string;
  name_en?: string | null;
  category?: string | null;
  address?: string | null;
  tax_id?: string | null;
  representative?: string | null;
  contact_person?: string | null;
  contact?: string | null;
  notes?: string | null;
  contract_count?: number;
  active_contract_count?: number;
  total_contracts?: number;
  active_contracts?: number;
  is_locked?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  revision?: number;
}

export type AttachmentRecordType = 'document' | 'contract';

/** One stored version of a file attached to a document or contract (migration 0006). */
export interface AttachmentRecord {
  id: string;
  /** Shared by every version of the same logical attachment */
  series_id: string;
  record_type: AttachmentRecordType;
  record_id: string;
  file_key: string;
  original_name: string;
  size: number;
  mime_type: string;
  sha256: string;
  version: number;
  is_current: boolean;
  note?: string | null;
  uploaded_by: string;
  uploaded_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  revision?: number;
}

export interface ContractAppendix {
  id: string;
  contract_id: string;
  appendix_number: string;
  title: string;
  signed_date: string;
  new_end_date: string | null;
  summary: string | null;
  file_key: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type: 'directive' | 'document' | 'contract' | 'deadline' | 'system';
  target_id?: string | null;
  target_type?: 'document' | 'contract' | null;
  recipient?: string | null;
  recipient_email?: string | null;
  // The account the notification is addressed to; null = unresolved (shown to admins only)
  recipient_user_id?: string | null;
  read: boolean;
  due_date?: string | null;
  directive?: string | null;
  created_at: string;
}

export type UserRole = 'admin' | 'user' | 'editor';
export type UserStatus = 'active' | 'locked';

export interface UserAccount {
  id: string;
  username: string;
  password?: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  department?: string | null;
  preferred_language?: string;
  can_access_labor_contracts?: boolean;
  // Read access to documents whose security level is "Mật" / "Tối mật" / "Tuyệt mật"
  can_access_confidential_documents?: boolean;
  // Bumped whenever credentials or privileges change; invalidates every token issued before.
  token_version?: number;
  must_change_password?: boolean;
  created_at: string;
  updated_at: string;
  // Incremented on every save (migration 0009); admin edits send the revision they loaded
  revision?: number;
}

export function isLaborContract(
  c?: { contract_type?: string | null; contract_category?: string | null } | null
): boolean {
  if (!c) return false;
  if (c.contract_type === 'labor') return true;
  const cat = (c.contract_category || '').toLowerCase();
  return (
    cat.includes('hợp đồng lao động') ||
    cat.includes('hđlđ') ||
    cat.includes('hdld') ||
    cat.includes('labor contract')
  );
}

export function canAccessLaborContracts(
  user?: { role?: string | null; can_access_labor_contracts?: boolean | null } | null
): boolean {
  if (!user) return false;
  return user.role === 'admin' || Boolean(user.can_access_labor_contracts);
}

export interface AuditLogRecord {
  id: string;
  user_id: string;
  username: string;
  action: 'create' | 'update' | 'delete' | 'import' | 'export' | 'login' | 'status_change';
  entity_type: 'document' | 'contract' | 'partner' | 'user' | 'category' | 'auth';
  entity_id?: string | null;
  entity_title?: string | null;
  details?: string | null;
  ip_address?: string | null;
  timestamp: string;
}

export interface CurrencyItem {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  exchange_rate?: number;
  is_default?: boolean;
  active: boolean;
}

