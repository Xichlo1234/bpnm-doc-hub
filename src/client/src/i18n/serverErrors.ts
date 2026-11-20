import { formatMessage, type MessageParams } from './format.ts';
import type { TranslationKey, Translations } from './vi.ts';

/**
 * API error responses carry a stable `code` (and `params` for values) next to the Vietnamese `error` text.
 * Known codes are shown in the UI language; anything else falls back to the server's own text.
 */
export const SERVER_ERROR_KEYS: Record<string, TranslationKey> = {
  AUTH_REQUIRED: 'srvAuthRequired',
  FORBIDDEN: 'srvForbidden',
  ADMIN_ONLY: 'srvAdminOnly',
  CONTRACT_NOT_FOUND: 'srvContractNotFound',
  LABOR_CONTRACT_FORBIDDEN: 'srvLaborContractForbidden',
  CONTRACT_LIST_INVALID: 'srvContractListInvalid',
  CONTRACT_FIELDS_REQUIRED: 'srvContractFieldsRequired',
  LABOR_ONLY_MANAGE: 'srvLaborOnlyManage',
  LABOR_ONLY_EDIT: 'srvLaborOnlyEdit',
  DOCUMENT_NOT_FOUND: 'srvDocumentNotFound',
  DOCUMENT_LIST_INVALID: 'srvDocumentListInvalid',
  DOCUMENT_FIELDS_REQUIRED: 'srvDocumentFieldsRequired',
  CATEGORY_ITEM_NOT_FOUND: 'srvCategoryItemNotFound',
  USER_NOT_FOUND: 'srvUserNotFound',
  USERNAME_TAKEN: 'srvUsernameTaken',
  PRIMARY_ADMIN_PROTECTED: 'srvPrimaryAdminProtected',
  PRIMARY_ADMIN_DELETE: 'srvPrimaryAdminDelete',
  FILE_REQUIRED: 'srvFileRequired',
  FILE_SAVE_FAILED: 'srvFileSaveFailed',
  RECORD_KIND_INVALID: 'srvRecordKindInvalid',
  DRIVE_SYNC_FAILED: 'srvDriveSyncFailed',
  FILE_NOT_FOUND: 'srvFileNotFound',
  FILE_FORBIDDEN: 'srvFileForbidden',
  FILE_TYPE_UNSUPPORTED: 'srvFileTypeUnsupported',
  FILE_TOO_LARGE: 'srvFileTooLarge',
  PARTNER_NOT_FOUND: 'srvPartnerNotFound',
  PARTNER_CODE_TAKEN: 'srvPartnerCodeTaken',
  DB_NOT_MIGRATED: 'srvDbNotMigrated',
  INTERNAL_ERROR: 'srvInternalError',
  SERVER_NOT_CONFIGURED: 'srvServerNotConfigured',
  CREDENTIALS_REQUIRED: 'srvCredentialsRequired',
  TOO_MANY_ATTEMPTS: 'srvTooManyAttempts',
  INVALID_CREDENTIALS: 'srvInvalidCredentials',
  ACCOUNT_LOCKED: 'srvAccountLocked',
  SESSION_INVALID: 'srvSessionInvalid',
  PASSWORD_CHANGE_REQUIRED: 'srvPasswordChangeRequired',
  CURRENT_PASSWORD_WRONG: 'srvCurrentPasswordWrong',
  PASSWORD_REUSE: 'srvPasswordReuse',
  PASSWORD_TOO_SHORT: 'srvPasswordTooShort',
  PASSWORD_NEEDS_LETTERS_AND_DIGITS: 'srvPasswordNeedsLettersAndDigits',
  REVISION_CONFLICT: 'srvRevisionConflict',
  VALIDATION_FAILED: 'srvValidationFailed',
  UPLOAD_FORBIDDEN: 'srvUploadForbidden',
  FILE_ATTACH_FORBIDDEN: 'srvFileAttachForbidden',
  DOCUMENT_FORBIDDEN: 'srvDocumentForbidden',
  NOTIFICATION_NOT_FOUND: 'srvNotificationNotFound',
  RECORD_NOT_FOUND: 'srvRecordNotFound',
  ATTACHMENT_NOT_FOUND: 'srvAttachmentNotFound',
  TRASH_ITEM_NOT_FOUND: 'srvTrashItemNotFound',
  DOCUMENT_NUMBER_TAKEN: 'srvDocumentNumberTaken',
  INCOMING_NUMBER_SAME_AS_ORIGINAL: 'srvIncomingNumberSameAsOriginal',
  ADJUSTMENT_REASON_REQUIRED: 'srvAdjustmentReasonRequired',
  TRANSITION_NOT_ALLOWED: 'srvTransitionNotAllowed',
  TRANSITION_FIELD_REQUIRED: 'srvTransitionFieldRequired',
  CONTRACT_NUMBER_TAKEN: 'srvContractNumberTaken',
  CONTRACT_DATES_INVALID: 'srvContractDatesInvalid',
  CONTRACT_ALREADY_ENDED: 'srvContractAlreadyEnded',
  TERMINATION_REASON_REQUIRED: 'srvTerminationReasonRequired',
  APPENDIX_INVALID: 'srvAppendixInvalid',
  APPENDIX_NUMBER_TAKEN: 'srvAppendixNumberTaken',
  LINK_TARGET_INVALID: 'srvLinkTargetInvalid',
  IMPORT_HAS_ERRORS: 'srvImportHasErrors',
  IMPORT_CONFIRMATION_REQUIRED: 'srvImportConfirmationRequired',
  PAYLOAD_TOO_LARGE: 'srvPayloadTooLarge',
};

export interface ServerErrorBody {
  error?: string;
  code?: string;
  params?: MessageParams;
}

export function serverErrorMessage(t: Translations, body: ServerErrorBody | null | undefined, fallback: string): string {
  const key = body?.code ? SERVER_ERROR_KEYS[body.code] : undefined;
  if (key) return formatMessage(t[key], body?.params);
  return body?.error || fallback;
}
