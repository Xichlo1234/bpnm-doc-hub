export interface PreflightReport {
  blocking: string[];
  warnings: string[];
  info: Record<string, any>;
}
export declare const BASE_TABLES: string[];
export declare const EXPECTED_AFTER: Record<string, { tables?: string[]; columns?: Record<string, string[]> }>;
export declare function runPreflight(query: (sql: string) => Promise<any[]>, migrationFiles: string[]): Promise<PreflightReport>;
