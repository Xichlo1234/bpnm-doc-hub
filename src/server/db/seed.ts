import type { DocumentRecord, ContractRecord, PartnerRecord, UserAccount } from '../types.ts';

// A fresh installation starts with no business records: production data lives in D1 only and
// must never ship inside the Worker bundle. Tests and local demos inject a synthetic dataset
// with setSeedDataset() (see tests/fixtures and scripts/demo-seed).

export interface SeedDataset {
  documents: DocumentRecord[];
  contracts: ContractRecord[];
  partners: PartnerRecord[];
  /** Replaces the bootstrap accounts (tests only); omitted = defaultUsers in persistence.ts. */
  users?: UserAccount[];
}

let seed: SeedDataset = { documents: [], contracts: [], partners: [] };

export function setSeedDataset(next: Partial<SeedDataset>) {
  seed = { documents: next.documents ?? [], contracts: next.contracts ?? [], partners: next.partners ?? [], users: next.users };
}

export function getSeedDataset(): SeedDataset {
  return seed;
}
