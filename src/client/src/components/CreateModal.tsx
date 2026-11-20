import React, { useState, useEffect } from 'react';
import { X, FileCheck, ArrowDownLeft, ArrowUpRight, Sparkles, Building2, UploadCloud, Link2, Paperclip, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { useCreateForm, type CreateModalProps } from './create/useCreateForm.tsx';
import { ContractForm } from './create/ContractForm.tsx';
import { IncomingForm } from './create/IncomingForm.tsx';
import { OutgoingForm } from './create/OutgoingForm.tsx';
import { DEFAULT_CONTRACT_TYPES, DEFAULT_LABOR_CONTRACT_TYPES } from './create/constants.ts';

// Dialog shell: header, business tabs and footer. Each tab is its own form component
// (create/ContractForm, IncomingForm, OutgoingForm); state lives in create/useCreateForm.
export const CreateModal: React.FC<CreateModalProps> = (props) => {
  const f = useCreateForm(props);
  if (!props.isOpen) return null;
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
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content modal-structured"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 740, width: '95%' }}
      >
        {/* Pinned Modal Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">
              {tab === 'contract'
                ? t.createContractTitle
                : tab === 'labor'
                ? t.createLaborTitle
                : tab === 'incoming'
                ? t.createIncomingTitle
                : t.createOutgoingTitle}
            </h2>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>
              {tab === 'contract'
                ? t.createContractDesc
                : tab === 'labor'
                ? t.createLaborDesc
                : tab === 'incoming'
                ? t.createIncomingDesc
                : t.createOutgoingDesc}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} type="button" title={t.close}>
            <X size={18} />
          </button>
        </div>

        {/* Pinned Tab Bar */}
        <div className="modal-tabs-nav">
          <button
            type="button"
            className={`btn ${tab === 'contract' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8 }}
            onClick={() => {
              setTab('contract');
              setContractType('service');
              setContractCategory(DEFAULT_CONTRACT_TYPES[0]);
            }}
          >
            <FileCheck size={15} style={{ marginRight: 6 }} />
            {t.contractTab}
          </button>
          {canViewLabor && (
            <button
              type="button"
              className={`btn ${tab === 'labor' ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                fontSize: 13,
                padding: '7px 14px',
                borderRadius: 8,
                background: tab === 'labor' ? '#B45309' : undefined,
                borderColor: tab === 'labor' ? '#B45309' : undefined,
                color: tab === 'labor' ? '#fff' : '#F59E0B',
              }}
              onClick={() => {
                setTab('labor');
                setContractType('labor');
                setContractCategory(DEFAULT_LABOR_CONTRACT_TYPES[0]);
                setContractDepartment('HR - Nhan su');
                setContractStorageLocation('');
              }}
            >
              <Lock size={14} style={{ marginRight: 6 }} />
              {t.laborTabLabel}
            </button>
          )}
          <button
            type="button"
            className={`btn ${tab === 'incoming' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8 }}
            onClick={() => setTab('incoming')}
          >
            <ArrowDownLeft size={15} style={{ marginRight: 6 }} />
            {t.incomingTab}
          </button>
          <button
            type="button"
            className={`btn ${tab === 'outgoing' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 13, padding: '7px 14px', borderRadius: 8 }}
            onClick={() => setTab('outgoing')}
          >
            <ArrowUpRight size={15} style={{ marginRight: 6 }} />
            {t.outgoingTab}
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="modal-scroll-body">
          {/* TAB 1 & TAB LABOR: HỢP ĐỒNG KINH TẾ / HỢP ĐỒNG LAO ĐỘNG */}
          {(tab === 'contract' || tab === 'labor') && (
            <ContractForm f={f} />
          )}

          {/* TAB 2: CÔNG VĂN ĐẾN */}
          {tab === 'incoming' && (
            <IncomingForm f={f} />
          )}

          {/* TAB 3: CÔNG VĂN ĐI */}
          {tab === 'outgoing' && (
            <OutgoingForm f={f} />
          )}
        </div>

        {/* Pinned Modal Footer Actions */}
        <div className="modal-footer-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
            {t.cancel}
          </button>
          <button
            type="submit"
            form={
              tab === 'contract' || tab === 'labor'
                ? 'contract-form'
                : tab === 'incoming'
                ? 'incoming-form'
                : 'outgoing-form'
            }
            className="btn btn-primary"
            disabled={isSubmitting}
            style={{ minWidth: 140 }}
          >
            {isSubmitting
              ? t.saving
              : tab === 'contract'
              ? t.saveContractBtn
              : tab === 'labor'
              ? t.saveLaborBtn
              : tab === 'incoming'
              ? t.receiveAndLogBtn
              : t.issueAndLogBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
