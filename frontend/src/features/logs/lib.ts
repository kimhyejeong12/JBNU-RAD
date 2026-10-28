// 로그 줄의 항목(Attachments=… · PrintCount=…) 한 줄.
export const logAttrs = (e: { attributes?: Record<string, string | number> | null }): string =>
  Object.entries(e.attributes || {}).map(([k, v]) => `${k}=${v}`).join(" · ");

export const pageCount = (d: { total: number; page_size: number }): number => Math.max(1, Math.ceil(d.total / d.page_size));
