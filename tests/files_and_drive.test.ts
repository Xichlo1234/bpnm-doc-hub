import { describe, it, expect } from 'vitest';
import { app } from '../src/server/index.ts';
import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from '../src/server/utils/fileStorage.ts';

describe('File Upload & Google Drive Sync API', () => {
  it('should upload a file and serve it back via GET /api/files/:key', async () => {
    const fileContent = 'Hello World - Test Contract File Content ' + Date.now();
    const fileName = 'test_sample_contract.pdf';
    const blob = new Blob([fileContent], { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', blob, fileName);

    const uploadRes = await app.request('/api/files/upload', {
      method: 'POST',
      body: formData,
    });

    expect(uploadRes.status).toBe(200);
    const uploadData = await uploadRes.json() as any;

    expect(uploadData.success).toBe(true);
    expect(uploadData.file_name).toBe(fileName);
    expect(uploadData.file_size).toBe(fileContent.length);
    expect(uploadData.file_type).toBe('application/pdf');
    expect(uploadData.file_key).toMatch(/^uploads\/\d+_[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}_test_sample_contract\.pdf$/);

    // Verify file exists on disk
    const savedPath = path.join(DATA_DIR, uploadData.file_key);
    expect(fs.existsSync(savedPath)).toBe(true);
    const readContent = fs.readFileSync(savedPath, 'utf-8');
    expect(readContent).toBe(fileContent);

    // Verify GET /api/files/:key serves the file
    const getRes = await app.request(`/api/files/${uploadData.file_key}`);
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get('content-type')).toBe('application/pdf');
    const fetchedText = await getRes.text();
    expect(fetchedText).toBe(fileContent);
  });

  it('should reject file upload when no file is provided', async () => {
    const formData = new FormData();
    const res = await app.request('/api/files/upload', {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toBeDefined();
  });

  it('should sync contract to Google Drive', async () => {
    // 1. Get first contract
    const contractsRes = await app.request('/api/contracts');
    const contracts = await contractsRes.json() as any[];
    expect(contracts.length).toBeGreaterThan(0);
    const target = contracts[0];

    const testDriveUrl = 'https://drive.google.com/file/d/test-contract-12345/view';

    // 2. Sync to Google Drive
    const syncRes = await app.request('/api/files/sync-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: target.id,
        type: 'contract',
        drive_url: testDriveUrl,
      }),
    });

    expect(syncRes.status).toBe(200);
    const syncData = await syncRes.json() as any;
    expect(syncData.success).toBe(true);
    expect(syncData.google_drive_url).toBe(testDriveUrl);
    expect(syncData.record.google_drive_url).toBe(testDriveUrl);
    expect(syncData.record.google_drive_synced_at).toBeDefined();

    // 3. Verify directly via GET /api/contracts/:id
    const verifyRes = await app.request(`/api/contracts/${target.id}`);
    const verified = await verifyRes.json() as any;
    expect(verified.google_drive_url).toBe(testDriveUrl);
  });

  it('should sync document to Google Drive', async () => {
    // 1. Get first document
    const docsRes = await app.request('/api/documents');
    const docs = await docsRes.json() as any[];
    expect(docs.length).toBeGreaterThan(0);
    const target = docs[0];

    const testDocDriveUrl = 'https://drive.google.com/file/d/test-doc-67890/view';

    // 2. Sync to Google Drive
    const syncRes = await app.request('/api/files/sync-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: target.id,
        type: 'document',
        drive_url: testDocDriveUrl,
      }),
    });

    expect(syncRes.status).toBe(200);
    const syncData = await syncRes.json() as any;
    expect(syncData.success).toBe(true);
    expect(syncData.google_drive_url).toBe(testDocDriveUrl);
    expect(syncData.record.google_drive_url).toBe(testDocDriveUrl);
    expect(syncData.record.google_drive_synced_at).toBeDefined();

    // 3. Verify directly via GET /api/documents/:id
    const verifyRes = await app.request(`/api/documents/${target.id}`);
    const verified = await verifyRes.json() as any;
    expect(verified.google_drive_url).toBe(testDocDriveUrl);
  });
});

describe('filenameFromContentDisposition', () => {
  it('reads the RFC 5987 form used for R2 copies, and the plain form', async () => {
    const { filenameFromContentDisposition } = await import('../src/server/utils/fileStorage.ts');
    expect(filenameFromContentDisposition(`inline; filename*=UTF-8''${encodeURIComponent('Quyết định số 27.pdf')}`)).toBe('Quyết định số 27.pdf');
    expect(filenameFromContentDisposition('attachment; filename="report.pdf"')).toBe('report.pdf');
    expect(filenameFromContentDisposition(undefined)).toBeNull();
  });
});
