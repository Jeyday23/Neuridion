const UNSUPPORTED_PAGE_METHODS = new Set(['PUT', 'PATCH', 'DELETE'])

export function isUnsupportedPageMethod(pathname: string, method: string): boolean {
  return !pathname.startsWith('/api/') && UNSUPPORTED_PAGE_METHODS.has(method.toUpperCase())
}
