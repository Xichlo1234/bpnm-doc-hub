import React from 'react';
import { useLanguage } from '../context/LanguageContext.tsx';

// Standard paper-archive location (Kho / Tủ / Ngăn / Hộp). The server rebuilds storage_location
// from these parts, so every record uses the same format.
export const PAPER_LOCATION_FIELDS = ['storage_warehouse', 'storage_cabinet', 'storage_shelf', 'storage_box'] as const;
export type PaperLocationField = (typeof PAPER_LOCATION_FIELDS)[number];

export const PaperLocationFields: React.FC<{
  value: Partial<Record<PaperLocationField, string | null>>;
  onChange: (field: PaperLocationField, value: string) => void;
}> = ({ value, onChange }) => {
  const { t } = useLanguage();
  const labels: Record<PaperLocationField, string> = {
    storage_warehouse: t.storageWarehouse,
    storage_cabinet: t.storageCabinet,
    storage_shelf: t.storageShelf,
    storage_box: t.storageBox,
  };
  return (
    <fieldset className="paper-location-fields">
      <legend className="form-label">{t.storagePaperLocation}</legend>
      <div className="paper-location-grid">
        {PAPER_LOCATION_FIELDS.map((field) => (
          <label key={field} className="paper-location-item">
            <span>{labels[field]}</span>
            <input
              type="text"
              className="form-input"
              maxLength={50}
              value={value[field] ?? ''}
              onChange={(e) => onChange(field, e.target.value)}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
};
