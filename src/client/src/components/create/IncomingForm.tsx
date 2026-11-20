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

export const IncomingForm: React.FC<{ f: CreateFormState }> = ({ f }) => {
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
    setIncomingDocsList,
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
  return (
    <form id="incoming-form" onSubmit={handleIncomingSubmit}>
      <div className="form-row">
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label className="form-label" style={{ margin: 0 }}>
              {t.incomingNumberLabel} <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '2px 8px', height: 24, color: '#D97706' }}
              onClick={regenerateIncomingNumber}
              title={t.autoNumberTooltip}
            >
              <Sparkles size={12} style={{ marginRight: 4 }} /> {t.autoNumberBtn}
            </button>
          </div>
          <input
            type="text"
            required
            className="form-input mono-code"
            value={incomingDocNumber}
            onChange={e => setIncomingDocNumber(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">{t.originalDocNumberLabel}</label>
          <input
            type="text"
            className="form-input mono-code"
            placeholder="VD: 1520/SNNMT-MT, 2210/CAT-PC07..."
            value={incomingOrigNumber}
            onChange={e => setIncomingOrigNumber(e.target.value)}
          />
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
          placeholder={t.incomingTitlePlaceholder}
          value={incomingTitle}
          onChange={e => setIncomingTitle(e.target.value)}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            {tf('docTypeCountLabel', { count: docTypesList.length })} <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <select
            className="form-select"
            value={incomingCategory}
            onChange={e => setIncomingCategory(e.target.value)}
          >
            {docTypesList.map((dt: any) => (
              <option key={dt.code || dt.name} value={dt.name}>
                {seedLabel(language, dt.name)} ({dt.code || ''})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">
            {tf('senderAgencyCountLabel', { count: agenciesList.length })} <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <select
            className="form-select"
            value={selectedIncomingIssuer}
            onChange={e => handleIncomingIssuerChange(e.target.value)}
          >
            <optgroup label={t.stateAgenciesGroup}>
              {agenciesList.map((a: string) => (
                <option key={a} value={a}>
                  {seedLabel(language, a)}
                </option>
              ))}
            </optgroup>
            {partners.length > 0 && (
              <optgroup label={t.partnersFromDirectoryGroup}>
                {partners.slice(0, 15).map((p: any) => (
                  <option key={`partner-${p.id}`} value={p.name_vn}>
                    {p.name_vn}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="__custom__">{t.enterOtherAgency}</option>
          </select>
          {isCustomIncomingIssuer && (
            <input
              type="text"
              required
              className="form-input"
              placeholder={t.newAgencyPlaceholder}
              style={{ marginTop: 8 }}
              value={incomingIssuer}
              onChange={e => setIncomingIssuer(e.target.value)}
              autoFocus
            />
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            {tf('receivingDeptCountLabel', { count: departmentsList.length })} <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <select
            className="form-select"
            value={incomingDepartment}
            onChange={e => setIncomingDepartment(e.target.value)}
          >
            {departmentsList.map((d: any) => (
              <option key={d.code || d.name} value={d.name}>
                {seedLabel(language, d.name)} {d.code ? `(${d.code})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">{t.assignedHandlerLabel}</label>
          <select
            className="form-select"
            value={selectedIncomingHandler}
            onChange={e => handleIncomingHandlerChange(e.target.value)}
          >
            <option value="">{t.unassignedOption}</option>
            {personnelList.map((p: any) => (
              <option key={p.name} value={p.name}>
                {p.name} ({seedLabel(language, p.department)})
              </option>
            ))}
            <option value="__custom__">{t.enterOtherStaff}</option>
          </select>
          {isCustomIncomingHandler && (
            <input
              type="text"
              className="form-input"
              placeholder={t.newHandlerPlaceholder}
              style={{ marginTop: 8 }}
              value={incomingHandler}
              onChange={e => setIncomingHandler(e.target.value)}
              autoFocus
            />
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            {t.documentDateLabel} <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            type="date"
            required
            className="form-input"
            value={incomingIssueDate}
            onChange={e => setIncomingIssueDate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">
            {t.receivedDateLabel} <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            type="date"
            required
            className="form-input"
            value={incomingReceiveDate}
            onChange={e => setIncomingReceiveDate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label" style={{ color: '#EF4444' }}>
            {t.deadlineFormLabel}
          </label>
          <input
            type="date"
            className="form-input"
            value={incomingDueDate}
            onChange={e => setIncomingDueDate(e.target.value)}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">{t.docUrgencyCol}</label>
          <select
            className="form-select"
            value={incomingUrgency}
            onChange={e => setIncomingUrgency(e.target.value)}
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
            value={incomingSecurity}
            onChange={e => setIncomingSecurity(e.target.value)}
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
            value={incomingStorageType}
            onChange={e => setIncomingStorageType(e.target.value)}
          >
            {storageTypesList.map((st: string) => (
              <option key={st} value={st}>
                {seedLabel(language, st)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">{t.originalCopyLocationLabel}</label>
        <input
          type="text"
          className="form-input"
          list="create-storage-locations-list"
          placeholder={t.incomingLocationPlaceholder}
          value={incomingStorageLocation}
          onChange={e => setIncomingStorageLocation(e.target.value)}
        />
        <datalist id="create-storage-locations-list">
          {storageLocationsList.map((loc: string) => (
            <option key={loc} value={loc} />
          ))}
        </datalist>
      </div>

      {/* Directive */}
      <div className="form-group">
        <label className="form-label" style={{ color: '#D97706', fontWeight: 600 }}>
          {t.boardDirectiveLabel}
        </label>
        <textarea
          className="form-textarea"
          rows={2}
          placeholder={t.incomingDirectivePlaceholder}
          value={incomingDirective}
          onChange={e => setIncomingDirective(e.target.value)}
        />
      </div>

      {/* Tệp đính kèm hoặc Link Cloud */}
      <div className="form-group" style={{ background: 'var(--bg-page)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>
            {t.incomingAttachmentSection}
          </label>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', padding: 3, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => setIncomingAttachMode('link')}
              style={{
                border: 'none',
                background: incomingAttachMode === 'link' ? 'var(--accent-primary)' : 'transparent',
                color: incomingAttachMode === 'link' ? '#fff' : 'var(--text-secondary)',
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
              onClick={() => setIncomingAttachMode('upload')}
              style={{
                border: 'none',
                background: incomingAttachMode === 'upload' ? 'var(--accent-primary)' : 'transparent',
                color: incomingAttachMode === 'upload' ? '#fff' : 'var(--text-secondary)',
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

        {incomingAttachMode === 'upload' ? (
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
              value={incomingCloudLink}
              onChange={e => setIncomingCloudLink(e.target.value)}
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
