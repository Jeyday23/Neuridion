'use client'

interface Profile {
  id: string
  device_name: string
  manufacturer: string
  intended_use: string | null
  emdn_code: string | null
  device_class: string | null
  search_strategy: {
    competitor_terms?: Array<{ name: string; manufacturer?: string }>
    strategy_doc_paths?: string[]
  } | null
}

export function ProfilePreviewCard({ profile }: { profile: Profile }) {
  const competitorCount = profile.search_strategy?.competitor_terms?.filter(c => c.name?.trim()).length ?? 0
  const docCount = profile.search_strategy?.strategy_doc_paths?.length ?? 0

  return (
    <div className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[#0F1F3D] truncate">
            {profile.device_name} — {profile.manufacturer}
          </h3>
          <div className="mt-2 space-y-1">
            {profile.intended_use && (
              <p className="text-xs text-[#134E4A] line-clamp-2">{profile.intended_use}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#0F766E]">
              {profile.device_class && <span>{profile.device_class}</span>}
              {profile.emdn_code && <span>EMDN: {profile.emdn_code}</span>}
              {competitorCount > 0 && (
                <span>{competitorCount} competitor{competitorCount !== 1 ? 's' : ''} monitored</span>
              )}
              {docCount > 0 && (
                <span>{docCount} strategy doc{docCount !== 1 ? 's' : ''} attached</span>
              )}
            </div>
          </div>
        </div>
        <a
          href={`/dashboard/profiles/${profile.id}/edit`}
          className="shrink-0 text-xs font-medium text-[#0D9488] hover:underline"
        >
          Edit →
        </a>
      </div>
    </div>
  )
}
