export type MessageParams = Record<string, string | number>;

/** Replaces `{name}` placeholders; unknown placeholders are left as-is so gaps stay visible. */
export function formatMessage(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}
