const CSRF_HEADER = { 'x-csrf-protection': '1' } as const

export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...CSRF_HEADER, ...init?.headers },
  })
}
