export const DEFAULT_ADMIN_API_KEY = 'locker_admin_prod_secret_2026_xof';

export function getAdminApiKey(): string {
  if (typeof window === 'undefined') return DEFAULT_ADMIN_API_KEY;
  const stored = localStorage.getItem('locker_api_key');
  if (!stored) {
    localStorage.setItem('locker_api_key', DEFAULT_ADMIN_API_KEY);
    return DEFAULT_ADMIN_API_KEY;
  }
  return stored;
}

export function setAdminApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('locker_api_key', key.trim());
  }
}

export function authHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': getAdminApiKey(),
    ...extraHeaders
  };
}

export async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = authHeaders((options.headers as Record<string, string>) || {});
  return fetch(url, {
    ...options,
    headers
  });
}
