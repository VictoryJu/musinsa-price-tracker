export function canonicalizeProductUrl(rawUrl: string, whitelistedParams: string[] = []): string {
  const url = new URL(rawUrl);
  const allowed = new Set(whitelistedParams);
  const nextParams = new URLSearchParams();

  for (const [key, value] of url.searchParams) {
    if (allowed.has(key)) nextParams.append(key, value);
  }

  const query = nextParams.toString();
  return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`;
}
