export function planCutoverFence(tables: string[]): {
  triggers: Array<{ name: string; sql: string }>;
  apply: string;
  release: string;
};
