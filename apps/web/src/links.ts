export function siteLink(value: string, base: string) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return url.href;
  } catch {
    /* Internal routes are relative to the configured repository base. */
  }
  return `${base}${value}`;
}
