import type { DocumentType } from '../../../server/types.ts';
import type { TranslationKey, Translations } from './vi.ts';

const labels: Record<DocumentType, TranslationKey> = {
  incoming: 'incomingDoc',
  outgoing: 'outgoingDoc',
  internal_incoming: 'internalIncomingTab',
  internal_outgoing: 'internalOutgoingTab',
  internal: 'docTypeInternal',
  decision: 'decisions',
  other: 'docTypeOther',
};

export function documentTypeLabel(t: Translations, type: DocumentType): string {
  return t[labels[type]] ?? type;
}
