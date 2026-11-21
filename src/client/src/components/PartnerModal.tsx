import React, { useState, useEffect } from 'react';
import { X, Building2, Save } from 'lucide-react';
import { api } from '../services/api.ts';
import type { PartnerRecord } from '../../../server/types.ts';
import { useLanguage } from '../context/LanguageContext.tsx';
import { seedLabel } from '../i18n/index.ts';

interface PartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  partner?: PartnerRecord | null;
}

// i18n-data: stored partner categories; displayed through seedLabel().
const CATEGORY_OPTIONS = [
  'Nhà thầu thi công',
  'Nhà cung cấp vật tư / thiết bị',
  'Dịch vụ kỹ thuật & bảo trì',
  'Khách hàng / Chủ đầu tư',
  'Cơ quan quản lý / Đối tác chiến lược',
  'Tư vấn & Kiểm định',
  'Khác',
];

export const PartnerModal: React.FC<PartnerModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  partner,
}) => {
  const { language, t, tf } = useLanguage();
  const isEditing = Boolean(partner && partner.id);

  const [code, setCode] = useState('');
  const [nameVn, setNameVn] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [taxId, setTaxId] = useState('');
  const [representative, setRepresentative] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (partner) {
      setCode(partner.code || '');
      setNameVn(partner.name_vn || '');
      setNameEn(partner.name_en || '');
      setCategory(partner.category || CATEGORY_OPTIONS[0]);
      setTaxId(partner.tax_id || '');
      setRepresentative(partner.representative || '');
      setContact(partner.contact_person || partner.contact || '');
      setAddress(partner.address || '');
      setNotes(partner.notes || '');
    } else {
      setCode('');
      setNameVn('');
      setNameEn('');
      setCategory(CATEGORY_OPTIONS[0]);
      setTaxId('');
      setRepresentative('');
      setContact('');
      setAddress('');
      setNotes('');
    }
    setErrorMessage('');
  }, [partner, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!code.trim() || !nameVn.trim()) {
      setErrorMessage(t.partnerRequiredFields);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Partial<PartnerRecord> = {
        code: code.trim().toUpperCase(),
        name_vn: nameVn.trim(),
        name_en: nameEn.trim() || null,
        category: category.trim(),
        tax_id: taxId.trim() || null,
        representative: representative.trim() || null,
        contact_person: contact.trim() || null,
        contact: contact.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      };

      if (isEditing && partner?.id) {
        await api.updatePartner(partner.id, { ...payload, expected_revision: partner.revision ?? 0 } as any);
      } else {
        await api.createPartner(payload);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || t.partnerSaveFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(16, 124, 65, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
              }}
            >
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="modal-title">
                {isEditing ? tf('partnerEditTitle', { code: partner?.code ?? '' }) : t.partnerCreateTitle}
              </h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {isEditing
                  ? t.partnerEditSubtitle
                  : t.partnerCreateSubtitle}
              </span>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        {errorMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">
                {t.partnerCodeLabel} <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                type="text"
                className="form-input mono-code"
                placeholder="VD: HUYTRUONG, HOANHA..."
                value={code}
                onChange={e => setCode(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1.5 }}>
              <label className="form-label">{t.partnerCategoryLabel}</label>
              <select
                className="form-select"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>
                    {seedLabel(language, opt)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              {t.partnerNameVnLabel} <span style={{ color: 'red' }}>*</span>
            </label>
            <input
              type="text"
              className="form-input"
              placeholder={t.partnerNameVnPlaceholder}
              value={nameVn}
              onChange={e => setNameVn(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t.partnerNameEnLabel}</label>
            <input
              type="text"
              className="form-input"
              placeholder="VD: Huy Truong Logistics Co., Ltd"
              value={nameEn}
              onChange={e => setNameEn(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t.partnerTaxIdLabelFull}</label>
              <input
                type="text"
                className="form-input"
                placeholder="VD: 0312345678"
                value={taxId}
                onChange={e => setTaxId(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t.legalRepresentativeLabel}</label>
              <input
                type="text"
                className="form-input"
                placeholder={t.legalRepresentativePlaceholder}
                value={representative}
                onChange={e => setRepresentative(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t.contactPointLabel}</label>
              <input
                type="text"
                className="form-input"
                placeholder={t.contactPointPlaceholder}
                value={contact}
                onChange={e => setContact(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t.headOfficeAddressLabel}</label>
              <input
                type="text"
                className="form-input"
                placeholder={t.headOfficeAddressPlaceholder}
                value={address}
                onChange={e => setAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t.partnerNotesLabel}</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder={t.partnerNotesPlaceholder}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: 24 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting}>
              {t.cancel}
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              <Save size={16} />
              <span>{isSubmitting ? t.saving : isEditing ? t.partnerUpdateBtn : t.partnerSaveNewBtn}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
