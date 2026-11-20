// Central access policy. Every route that returns or changes records goes through these helpers so
// the rules live in one place:
//
//  - Admins can read and change everything.
//  - Labor contracts (and their files) need `can_access_labor_contracts`.
//  - Confidential documents (security level "Mật", "Tối mật", "Tuyệt mật") need
//    `can_access_confidential_documents`.
//  - Only admins change documents, partners, settings and users; labor-authorised users may also
//    create/edit labor contracts and upload their files.
//  - A file is readable when the user can read at least one record that references it, or when it
//    is the user's own upload that is not attached yet.

import type { ContractRecord, DocumentRecord } from '../types.ts';
import { canAccessLaborContracts, isLaborContract } from '../types.ts';

export interface AccessSubject {
  id?: string;
  role?: string | null;
  can_access_labor_contracts?: boolean | null;
  can_access_confidential_documents?: boolean | null;
}

/** True for "Mật", "Tối mật", "Tuyệt mật" (any case), "secret", "confidential"; not "mặt bằng". */
export function isConfidentialLevel(level?: string | null): boolean {
  if (!level) return false;
  const n = level.normalize('NFC').toLowerCase();
  return /(?<!\p{L})mật(?!\p{L})/u.test(n) || /secret|confidential/.test(n);
}

export function isAdmin(user?: AccessSubject | null): boolean {
  return user?.role === 'admin';
}

export function canAccessConfidentialDocuments(user?: AccessSubject | null): boolean {
  return isAdmin(user) || Boolean(user?.can_access_confidential_documents);
}

export function canReadDocument(user: AccessSubject | null | undefined, doc: Pick<DocumentRecord, 'security_level'> | null): boolean {
  if (!user || !doc) return false;
  return !isConfidentialLevel(doc.security_level) || canAccessConfidentialDocuments(user);
}

export function canReadContract(
  user: AccessSubject | null | undefined,
  contract: Pick<ContractRecord, 'contract_type' | 'contract_category'> | null
): boolean {
  if (!user || !contract) return false;
  return !isLaborContract(contract) || canAccessLaborContracts(user);
}

/** Who may upload attachments at all: admins and users who manage labor contracts. */
export function canUploadFiles(user?: AccessSubject | null): boolean {
  return isAdmin(user) || canAccessLaborContracts(user);
}
