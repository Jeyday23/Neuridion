'use client'

const COOKIE_NAME = 'neuridion_cookie_consent'

export function ManageCookiesButton() {
  function resetConsent() {
    document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax; Secure`
    window.location.reload()
  }

  return (
    <button
      onClick={resetConsent}
      className="hover:text-zinc-600 transition-colors cursor-pointer"
    >
      Manage cookies
    </button>
  )
}
