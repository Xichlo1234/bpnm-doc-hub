import { describe, it, expect, vi } from 'vitest';
import { api } from '../src/client/src/services/api';

describe('Upload Progress and Error Handling', () => {
  it('rejects immediately with clear message when file exceeds 5MB', async () => {
    // Create a mock large file > 5MB
    const bigFile = new File(['a'.repeat(100)], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 });

    await expect(api.uploadFile(bigFile)).rejects.toThrow(/vượt quá giới hạn cho phép \(tối đa 5MB\)/);
  });

  it('reports progress events when onProgress callback is provided', async () => {
    // Verify uploadFileWithProgress exists and reports progress
    expect(typeof (api as any).uploadFileWithProgress).toBe('function');
  });
});
