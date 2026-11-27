import React, { useState, useEffect } from 'react';
import { X, FileCheck, ArrowDownLeft, ArrowUpRight, Sparkles, Building2, UploadCloud, Link2, Paperclip, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { api } from '../../services/api.ts';
import { canAccessLaborContracts, type ContractType, type PartnerRecord } from '../../../../server/types.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';
import { seedLabel, statusLabel, urgencyLabel } from '../../i18n/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  getNormalizedDocTypes,
  getNormalizedDepartments,
  getUnifiedContractDepartments,
  getUnifiedContractTypes,
} from '../../utils/categoryHelpers.ts';
import { DEFAULT_DOC_TYPES, DEFAULT_CONTRACT_TYPES, DEFAULT_CONTRACT_DEPTS, DEFAULT_DEPARTMENTS, DEFAULT_AGENCIES, DEFAULT_PERSONNEL, DEFAULT_URGENCY_LEVELS, DEFAULT_SECURITY_LEVELS, DEFAULT_STORAGE_TYPES, DEFAULT_CONTRACT_STATUSES, DEFAULT_SEND_METHODS, DEFAULT_OUTGOING_STATUSES, DEFAULT_PARTIES_A, DEFAULT_LABOR_CONTRACT_TYPES, DEFAULT_RECIPIENTS, LABOR_NUMBER_EXAMPLE, CONTRACT_NUMBER_EXAMPLE, REPLY_NUMBER_EXAMPLE } from './constants.ts';
import type { CreateFormState } from './useCreateForm.tsx';

export const OutgoingForm: React.FC<{ f: CreateFormState }> = ({ f }) => {
  const {
    language,
    t,
    tf,
    notifyReassigned,
    user,
    canViewLabor,
    tab,
    setTab,
    isSubmitting,
    setIsSubmitting,
    categories,
    setCategories,
    partners,
    setPartners,
    currencyList,
    setCurrencyList,
    contractNumber,
    setContractNumber,
    contractTitle,
    setContractTitle,
    contractCategory,
    setContractCategory,
    contractType,
    setContractType,
    selectedPartyA,
    setSelectedPartyA,
    isCustomPartyA,
    setIsCustomPartyA,
    partyA,
    setPartyA,
    selectedPartnerId,
    setSelectedPartnerId,
    isCustomPartner,
    setIsCustomPartner,
    partyB,
    setPartyB,
    partnerCode,
    setPartnerCode,
    partnerTaxId,
    setPartnerTaxId,
    partnerContact,
    setPartnerContact,
    contractDepartment,
    setContractDepartment,
    contractValue,
    setContractValue,
    currency,
    setCurrency,
    signedDate,
    setSignedDate,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    contractStatus,
    setContractStatus,
    contractStorageType,
    setContractStorageType,
    contractStorageLocation,
    setContractStorageLocation,
    renewalTerms,
    setRenewalTerms,
    incomingDocNumber,
    setIncomingDocNumber,
    incomingOrigNumber,
    setIncomingOrigNumber,
    incomingTitle,
    setIncomingTitle,
    incomingCategory,
    setIncomingCategory,
    selectedIncomingIssuer,
    setSelectedIncomingIssuer,
    isCustomIncomingIssuer,
    setIsCustomIncomingIssuer,
    incomingIssuer,
    setIncomingIssuer,
    incomingDepartment,
    setIncomingDepartment,
    selectedIncomingHandler,
    setSelectedIncomingHandler,
    isCustomIncomingHandler,
    setIsCustomIncomingHandler,
    incomingHandler,
    setIncomingHandler,
    incomingReceiveDate,
    setIncomingReceiveDate,
    incomingIssueDate,
    setIncomingIssueDate,
    incomingDueDate,
    setIncomingDueDate,
    incomingUrgency,
    setIncomingUrgency,
    incomingSecurity,
    setIncomingSecurity,
    incomingDirective,
    setIncomingDirective,
    incomingStorageType,
    setIncomingStorageType,
    incomingStorageLocation,
    setIncomingStorageLocation,
    outgoingDocNumber,
    setOutgoingDocNumber,
    outgoingTitle,
    setOutgoingTitle,
    outgoingCategory,
    setOutgoingCategory,
    outgoingCategoryCode,
    setOutgoingCategoryCode,
    outgoingDepartment,
    setOutgoingDepartment,
    outgoingDeptCode,
    setOutgoingDeptCode,
    selectedOutgoingHandler,
    setSelectedOutgoingHandler,
    isCustomOutgoingHandler,
    setIsCustomOutgoingHandler,
    outgoingHandler,
    setOutgoingHandler,
    selectedOutgoingSigner,
    setSelectedOutgoingSigner,
    isCustomOutgoingSigner,
    setIsCustomOutgoingSigner,
    outgoingSigner,
    setOutgoingSigner,
    selectedOutgoingRecipient,
    setSelectedOutgoingRecipient,
    isCustomOutgoingRecipient,
    setIsCustomOutgoingRecipient,
    outgoingRecipient,
    setOutgoingRecipient,
    outgoingIssueDate,
    setOutgoingIssueDate,
    selectedLinkedDoc,
    setSelectedLinkedDoc,
    isCustomLinkedDoc,
    setIsCustomLinkedDoc,
    outgoingLinkedDoc,
    setOutgoingLinkedDoc,
    outgoingSendMethod,
    setOutgoingSendMethod,
    outgoingStatus,
    setOutgoingStatus,
    outgoingUrgency,
    setOutgoingUrgency,
    outgoingSecurity,
    setOutgoingSecurity,
    outgoingStorageType,
    setOutgoingStorageType,
    outgoingStorageLocation,
    setOutgoingStorageLocation,
    incomingDocsList,
    contractAttachMode,
    setContractAttachMode,
    contractCloudLink,
    setContractCloudLink,
    incomingAttachMode,
    setIncomingAttachMode,
    incomingCloudLink,
    setIncomingCloudLink,
    outgoingAttachMode,
    setOutgoingAttachMode,
    outgoingCloudLink,
    setOutgoingCloudLink,
    selectedFile,
    setSelectedFile,
    uploadProgress,
    setUploadProgress,
    isUploadingFile,
    setIsUploadingFile,
    uploadError,
    setUploadError,
    uploadSuccess,
    setUploadSuccess,
    handleFileChange,
    regenerateIncomingNumber,
    regenerateOutgoingNumber,
    handlePartyAChange,
    handlePartnerChange,
    handleContractCategoryChange,
    handleOutgoingCategoryChange,
    handleOutgoingDepartmentChange,
    handleIncomingIssuerChange,
    handleIncomingHandlerChange,
    handleOutgoingRecipientChange,
    handleOutgoingHandlerChange,
    handleOutgoingSignerChange,
    handleLinkedDocChange,
    handleContractSubmit,
    handleIncomingSubmit,
    handleOutgoingSubmit,
    docTypesList,
    contractTypesList,
    contractDeptsList,
    departmentsList,
    agenciesList,
    personnelList,
    urgencyLevelsList,
    securityLevelsList,
    storageTypesList,
    storageLocationsList,
    sendMethodsList,
    outgoingStatusesList,
    contractStatusesList,
    partiesAList,
    onClose,
    onCreated,
  } = f;
  const internal = tab === 'internal_outgoing';
  return (
    <form id="outgoing-form" onSubmit={handleOutgoingSubmit}>
      <div className="form-row">
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label className="form-label" style={{ margin: 0 }}>
              {t.autoOutgoingNumberLabel} <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '2px 8px', height: 24, color: '#D97706' }}
              onClick={() => regenerateOutgoingNumber()}
              title={t.autoOutgoingNumberTooltip}
            >
              <Sparkles size={12} style={{ marginRight: 4 }} /> {t.autoOutgoingNumberBtn}
            </button>
          </div>
          <input
            type="text"
            required
            className="form-input mono-code"
            value={outgoingDocNumber}
            onChange={e => setOutgoingDocNumber(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">{tf('docTypeCountLabel', { count: docTypesList.length })}</label>
          <select
            className="form-select"
            value={outgoingCategory}
            onChange={e => handleOutgoingCategoryChange(e.target.value)}
          >
            {docTypesList.map((dt: any) => (
              <option key={dt.code || dt.name} value={dt.name}>
                {seedLabel(language, dt.name)} ({dt.code || ''})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">
          {t.docTitleCol} <span style={{ color: '#EF4444' }}>*</span>
        </label>
        <textarea
          required
          rows={2}
          className="form-textarea"
          placeholder={t.outgoingTitlePlaceholder}
          value={outgoingTitle}
          onChange={e => setOutgoingTitle(e.target.value)}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="create-outgoing-sender">
            {internal ? t.internalSenderDepartment : tf('draftingDeptCountLabel', { count: departmentsList.length })}
            {internal && <span style={{ color: '#EF4444' }}> *</span>}
          </label>
          <select
            id="create-outgoing-sender"
            className="form-select"
            required={internal}
            value={outgoingDepartment}
            onChange={e => handleOutgoingDepartmentChange(e.target.value)}
          >
            {internal && <option value="">{t.selectDepartment}</option>}
            {departmentsList.map((d: any) => (
              <option key={d.code || d.name} value={d.name}>
                {seedLabel(language, d.name)} {d.code ? `(${d.code})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="create-outgoing-recipient">
            {internal ? t.internalRecipientDepartment : t.docRecipientCol} <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <select
            id="create-outgoing-recipient"
            className="form-select"
            required={internal}
            value={selectedOutgoingRecipient}
            onChange={e => handleOutgoingRecipientChange(e.target.value)}
          >
            <option value="">{t.selectPlaceholder}</option>
            {internal ? (
              departmentsList.map(d => <option key={d.name} value={d.name}>{seedLabel(language, d.name)}</option>)
            ) : (
              <>
                <optgroup label={t.internalCompanyGroup}>
                  {DEFAULT_RECIPIENTS.map((r) => (
                    <option key={r} value={r}>
                      {seedLabel(language, r)}
                    </option>
                  ))}
                  {departmentsList.map((d: any) => (
                    <option key={`out-dept-${d.code || d.name}`} value={d.name}>
                      {seedLabel(language, d.name)} {d.code ? `(${d.code})` : ''}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t.stateAgenciesGroup}>
                  {agenciesList.map((a: string) => (
                    <option key={`out-agency-${a}`} value={a}>
                      {seedLabel(language, a)}
                    </option>
                  ))}
                </optgroup>
                {partners.length > 0 && (
                  <optgroup label={t.partnersAndCustomersGroup}>
                    {partners.slice(0, 15).map((p: any) => (
                      <option key={`out-partner-${p.id}`} value={p.name_vn}>
                        {p.name_vn}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="__custom__">{t.enterOtherRecipient}</option>
              </>
            )}
          </select>
          {!internal && isCustomOutgoingRecipient && (
            <input
              type="text"
              required
              className="form-input"
              placeholder={t.newRecipientPlaceholder}
              style={{ marginTop: 8 }}
              value={outgoingRecipient}
              onChange={e => setOutgoingRecipient(e.target.value)}
              autoFocus
            />
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">{t.drafterLabel}</label>
          <select
            className="form-select"
            value={selectedOutgoingHandler}
            onChange={e => handleOutgoingHandlerChange(e.target.value)}
          >
            <option value="">{t.selectPlaceholder}</option>
            {personnelList.map((p: any) => (
              <option key={`out-handler-${p.name}`} value={p.name}>
                {p.name} ({seedLabel(language, p.department)})
              </option>
            ))}
            <option value="__custom__">{t.enterOtherDrafter}</option>
          </select>
          {isCustomOutgoingHandler && (
            <input
              type="text"
              className="form-input"
              placeholder={t.newDrafterPlaceholder}
              style={{ marginTop: 8 }}
              value={outgoingHandler}
              onChange={e => setOutgoingHandler(e.target.value)}
              autoFocus
            />
          )}
        </div>
        <div className="form-group">
          <label className="form-label">{t.approverLabel}</label>
          <select
            className="form-select"
            value={selectedOutgoingSigner}
            onChange={e => handleOutgoingSignerChange(e.target.value)}
          >
            <option value="">{t.selectPlaceholder}</option>
            {personnelList.map((p: any) => (
              <option key={`out-signer-${p.name}`} value={p.name}>
                {p.name} ({seedLabel(language, p.department)})
              </option>
            ))}
            <option value="__custom__">{t.enterOtherSigner}</option>
          </select>
          {isCustomOutgoingSigner && (
            <input
              type="text"
              className="form-input"
              placeholder={t.newSignerPlaceholder}
              style={{ marginTop: 8 }}
              value={outgoingSigner}
              onChange={e => setOutgoingSigner(e.target.value)}
              autoFocus
            />
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            {t.issueDateLabel} <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            type="date"
            required
            className="form-input"
            value={outgoingIssueDate}
            onChange={e => setOutgoingIssueDate(e.target.value)}
          />
        </div>
        {internal ? (
          <div className="form-group">
            <label className="form-label" htmlFor="internal-outgoing-due">{t.dueDateLabel}</label>
            <input id="internal-outgoing-due" type="date" className="form-input" value={f.internalOutgoingDueDate}
              onChange={e => f.setInternalOutgoingDueDate(e.target.value)} />
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">{t.sendMethodLabel}</label>
            <select
              className="form-select"
              value={outgoingSendMethod}
              onChange={e => setOutgoingSendMethod(e.target.value)}
            >
              {sendMethodsList.map((m: string) => (
                <option key={m} value={m}>
                  {seedLabel(language, m)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">{t.issueStatusLabel}</label>
          <select
            className="form-select"
            value={outgoingStatus}
            onChange={e => setOutgoingStatus(e.target.value)}
          >
            {outgoingStatusesList.map((st: string) => (
              <option key={st} value={st}>
                {statusLabel(t, st)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">{t.docUrgencyCol}</label>
          <select
            className="form-select"
            value={outgoingUrgency}
            onChange={e => setOutgoingUrgency(e.target.value)}
          >
            {urgencyLevelsList.map((u: string) => (
              <option key={u} value={u}>
                {urgencyLabel(t, u)}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">{t.securityLevelLabel}</label>
          <select
            className="form-select"
            value={outgoingSecurity}
            onChange={e => setOutgoingSecurity(e.target.value)}
          >
            {securityLevelsList.map((s: string) => (
              <option key={s} value={s}>
                {seedLabel(language, s)}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">{t.storageTypeLabel}</label>
          <select
            className="form-select"
            value={outgoingStorageType}
            onChange={e => setOutgoingStorageType(e.target.value)}
          >
            {storageTypesList.map((st: string) => (
              <option key={st} value={st}>
                {seedLabel(language, st)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Linked Doc & Storage Location */}
      {internal && (
        <div className="form-group">
          <label className="form-label" htmlFor="internal-outgoing-directive">{t.directiveLabel}</label>
          <textarea id="internal-outgoing-directive" className="form-textarea" rows={2}
            value={f.internalOutgoingDirective} onChange={e => f.setInternalOutgoingDirective(e.target.value)} />
        </div>
      )}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" style={{ color: 'var(--accent-primary)' }}>
            {internal ? t.replyToInternalIncoming : t.replyToIncomingLabel}
          </label>
          <select
            className="form-select"
            value={selectedLinkedDoc}
            onChange={e => handleLinkedDocChange(e.target.value)}
          >
            <option value="">{t.standaloneDocOption}</option>
            {incomingDocsList.map((doc: any) => (
              <option key={`link-${doc.id || doc.document_number}`} value={doc.document_number}>
                [{doc.document_number}] {doc.title?.length > 40 ? doc.title.slice(0, 40) + '...' : doc.title}
              </option>
            ))}
            {!internal && <option value="__custom__">{t.enterOtherDocNumber}</option>}
          </select>
          {!internal && isCustomLinkedDoc && (
            <input
              type="text"
              className="form-input mono-code"
              placeholder={tf('examplePlaceholder', { example: REPLY_NUMBER_EXAMPLE })}
              style={{ marginTop: 8 }}
              value={outgoingLinkedDoc}
              onChange={e => setOutgoingLinkedDoc(e.target.value)}
              autoFocus
            />
          )}
        </div>
        <div className="form-group">
          <label className="form-label">{t.physicalLocationLabel}</label>
          <input
            type="text"
            className="form-input"
            list="create-storage-locations-list"
            placeholder={t.outgoingLocationPlaceholder}
            value={outgoingStorageLocation}
            onChange={e => setOutgoingStorageLocation(e.target.value)}
          />
          <datalist id="create-storage-locations-list">
            {storageLocationsList.map((loc: string) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Tệp đính kèm hoặc Link Cloud */}
      <div className="form-group" style={{ background: 'var(--bg-page)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>
            {t.outgoingAttachmentSection}
          </label>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', padding: 3, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => setOutgoingAttachMode('link')}
              style={{
                border: 'none',
                background: outgoingAttachMode === 'link' ? 'var(--accent-primary)' : 'transparent',
                color: outgoingAttachMode === 'link' ? '#fff' : 'var(--text-secondary)',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Link2 size={12} /> {t.pasteDriveLinkMode}
            </button>
            <button
              type="button"
              onClick={() => setOutgoingAttachMode('upload')}
              style={{
                border: 'none',
                background: outgoingAttachMode === 'upload' ? 'var(--accent-primary)' : 'transparent',
                color: outgoingAttachMode === 'upload' ? '#fff' : 'var(--text-secondary)',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <UploadCloud size={12} /> {t.uploadFileMode}
            </button>
          </div>
        </div>

        {outgoingAttachMode === 'upload' ? (
          <div>
            <input
              type="file"
              accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.svg,.txt,.csv,.zip"
              onChange={handleFileChange}
              className="form-input"
              style={{ padding: '6px' }}
            />
            {selectedFile && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-primary)', fontWeight: 600 }}>
                <Paperclip size={13} />
                <span>{tf('selectedFileInfo', { name: selectedFile.name, size: (selectedFile.size / 1024).toFixed(1) })}</span>
              </div>
            )}
            {/* Real-time Progress Bar & Instant Error UI */}
            {uploadError && (
              <div className="upload-progress-box has-error">
                <div className="upload-error-text">
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{uploadError}</span>
                </div>
              </div>
            )}

            {isUploadingFile && (
              <div className="upload-progress-box">
                <div className="upload-progress-header">
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {tf('uploadingFileName', { name: selectedFile?.name ?? '' })}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                    {uploadProgress}%
                  </span>
                </div>
                <div className="upload-progress-track">
                  <div
                    className="upload-progress-bar is-animated"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {uploadSuccess && (
              <div className="upload-progress-box is-success">
                <div className="upload-success-text">
                  <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                  <span>{t.uploadAndSaveSuccess}</span>
                </div>
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {t.supportedFileTypes}
            </div>
          </div>
        ) : (
          <div>
            <input
              type="url"
              placeholder={t.cloudLinkInputPlaceholder}
              value={outgoingCloudLink}
              onChange={e => setOutgoingCloudLink(e.target.value)}
              className="form-input"
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {t.cloudLinkHint}
            </div>
          </div>
        )}
      </div>
    </form>
  );
};
