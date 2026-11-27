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

export const ContractForm: React.FC<{ f: CreateFormState }> = ({ f }) => {
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
  return (
    <form id="contract-form" onSubmit={handleContractSubmit}>
      <div className="form-row">
        <div className="form-group" style={{ flex: 1.2 }}>
          <label className="form-label">
            {tab === 'labor' ? t.laborContractNumberLabel : t.contractNumberLabel} <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            type="text"
            required
            className="form-input mono-code"
            placeholder={tf('examplePlaceholder', { example: tab === 'labor' ? LABOR_NUMBER_EXAMPLE : CONTRACT_NUMBER_EXAMPLE })}
            value={contractNumber}
            onChange={e => setContractNumber(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ flex: 1.8 }}>
          <label className="form-label">
            {tab === 'labor'
              ? tf('laborContractTypeCount', { count: DEFAULT_LABOR_CONTRACT_TYPES.length })
              : tf('contractCategoryCount', { count: contractTypesList.length })}
          </label>
          <select
            className="form-select"
            value={contractCategory}
            onChange={e => handleContractCategoryChange(e.target.value)}
          >
            {(tab === 'labor' ? DEFAULT_LABOR_CONTRACT_TYPES : contractTypesList).map((ct: any) => {
              const name = typeof ct === 'string' ? ct : ct.name;
              return (
                <option key={name} value={name}>
                  {seedLabel(language, name)}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">
          {tab === 'labor' ? t.laborTitleLabel : t.contractTitleLabel} <span style={{ color: '#EF4444' }}>*</span>
        </label>
        <input
          type="text"
          required
          className="form-input"
          placeholder={
            tab === 'labor'
              ? t.laborTitlePlaceholder
              : t.contractTitlePlaceholder
          }
          value={contractTitle}
          onChange={e => setContractTitle(e.target.value)}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <label className="form-label" style={{ margin: 0 }}>
              {tab === 'labor' ? t.laborPartyALabel : t.contractPartyALabel} <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {tf('legalEntitiesCount', { count: partiesAList.length })}
            </span>
          </div>
          <select
            className="form-select"
            value={selectedPartyA}
            onChange={e => handlePartyAChange(e.target.value)}
          >
            {partiesAList.map((pa: string) => (
              <option key={pa} value={pa}>
                {pa}
              </option>
            ))}
            <option value="__custom__">{t.enterOtherEntity}</option>
          </select>
          {isCustomPartyA && (
            <input
              type="text"
              required
              className="form-input"
              style={{ marginTop: 6 }}
              placeholder={t.newPartyAPlaceholder}
              value={partyA}
              onChange={e => setPartyA(e.target.value)}
            />
          )}
        </div>

        <div className="form-group">
          {tab === 'labor' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <label className="form-label" style={{ margin: 0 }}>
                  {t.laborPartyBLabel} <span style={{ color: '#EF4444' }}>*</span>
                </label>
              </div>
              <input
                type="text"
                required
                className="form-input"
                list="labor-personnel-list"
                placeholder={t.employeeNamePlaceholder}
                value={partyB}
                onChange={e => setPartyB(e.target.value)}
              />
              <datalist id="labor-personnel-list">
                {personnelList.map((p: any) => {
                  const name = typeof p === 'string' ? p : p.name;
                  return <option key={name} value={name} />;
                })}
              </datalist>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <label className="form-label" style={{ margin: 0 }}>
                  {t.contractPartyBLabel} <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {tf('partnersCount', { count: partners.length })}
                </span>
              </div>
              <select
                className="form-select"
                required
                value={selectedPartnerId}
                onChange={e => handlePartnerChange(e.target.value)}
              >
                <option value="">{tf('selectPartnerOption', { count: partners.length })}</option>
                {partners.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `[${p.code}] ` : ''}{p.name_vn} {p.tax_id ? `(MST: ${p.tax_id})` : ''}
                  </option>
                ))}
                <option value="__custom__">{t.enterNewPartner}</option>
              </select>
              {isCustomPartner && (
                <input
                  type="text"
                  required
                  className="form-input"
                  style={{ marginTop: 6 }}
                  placeholder={t.newPartnerPlaceholder}
                  value={partyB}
                  onChange={e => setPartyB(e.target.value)}
                />
              )}
            </>
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            {tab === 'labor' ? t.employeeIdLabel : t.partnerTaxIdLabel}
          </label>
          <input
            type="text"
            className="form-input mono-code"
            placeholder={tab === 'labor' ? 'VD: NV-0125 / CCCD: 001090xxxxxx...' : 'VD: 0100109106...'}
            value={partnerTaxId}
            onChange={e => setPartnerTaxId(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">
            {tab === 'labor' ? t.employeeContactLabel : t.partnerRepresentativeLabel}
          </label>
          <input
            type="text"
            className="form-input"
            placeholder={tab === 'labor' ? t.employeeContactPlaceholder : t.partnerContactPlaceholder}
            value={partnerContact}
            onChange={e => setPartnerContact(e.target.value)}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">{tf('departmentsCountLabel', { count: contractDeptsList.length })}</label>
          <select
            className="form-select"
            value={contractDepartment}
            onChange={e => setContractDepartment(e.target.value)}
          >
            {contractDeptsList.map((dept: string) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">{t.contractStatusLabel}</label>
          <select
            className="form-select"
            value={contractStatus}
            onChange={e => setContractStatus(e.target.value)}
          >
            {contractStatusesList.map((st: string) => (
              <option key={st} value={st}>
                {statusLabel(t, st)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group" style={{ flex: 1.5 }}>
          <label className="form-label">
            {tab === 'labor' ? t.laborSalaryLabel : t.contractValueLabel}
          </label>
          <input
            type="number"
            className="form-input"
            placeholder={tab === 'labor' ? 'VD: 35000000' : 'VD: 150000000'}
            value={contractValue}
            onChange={e => setContractValue(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ flex: 0.6 }}>
          <label className="form-label">{t.currencyLabel}</label>
          <select
            className="form-select"
            value={currency}
            onChange={e => setCurrency(e.target.value)}
          >
            {currencyList.map((c: any) => (
              <option key={c.code} value={c.code}>
                {c.code} {c.name ? `(${c.name})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">
            {t.signedDateLabel} <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            type="date"
            required
            className="form-input"
            value={signedDate}
            onChange={e => setSignedDate(e.target.value)}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">
            {t.effectiveDateLabel} <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <input
            type="date"
            required
            className="form-input"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">
            {t.expiryDateLabel} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.emptyIfIndefinite}</span>
          </label>
          <input
            type="date"
            className="form-input"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">{t.storageTypeLabel}</label>
          <select
            className="form-select"
            value={contractStorageType}
            onChange={e => setContractStorageType(e.target.value)}
          >
            {storageTypesList.map((st: string) => (
              <option key={st} value={st}>
                {seedLabel(language, st)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1.5 }}>
          <label className="form-label">{t.physicalLocationLabel}</label>
          <input
            type="text"
            className="form-input"
            list="create-storage-locations-list"
            placeholder={t.contractLocationPlaceholder}
            value={contractStorageLocation}
            onChange={e => setContractStorageLocation(e.target.value)}
          />
          <datalist id="create-storage-locations-list">
            {storageLocationsList.map((loc: string) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">{t.renewalNotesLabel}</label>
        <textarea
          className="form-textarea"
          rows={2}
          placeholder={t.renewalNotesPlaceholder}
          value={renewalTerms}
          onChange={e => setRenewalTerms(e.target.value)}
        />
      </div>

      {/* Tệp đính kèm hoặc Link Cloud */}
      <div className="form-group" style={{ background: 'var(--bg-page)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>
            {t.contractAttachmentSection}
          </label>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface)', padding: 3, borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => setContractAttachMode('link')}
              style={{
                border: 'none',
                background: contractAttachMode === 'link' ? 'var(--accent-primary)' : 'transparent',
                color: contractAttachMode === 'link' ? '#fff' : 'var(--text-secondary)',
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
              onClick={() => setContractAttachMode('upload')}
              style={{
                border: 'none',
                background: contractAttachMode === 'upload' ? 'var(--accent-primary)' : 'transparent',
                color: contractAttachMode === 'upload' ? '#fff' : 'var(--text-secondary)',
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

        {contractAttachMode === 'upload' ? (
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
              value={contractCloudLink}
              onChange={e => setContractCloudLink(e.target.value)}
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
