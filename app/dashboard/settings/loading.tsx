import { Skeleton } from '@/app/components/ui/Skeleton'

export default function SettingsLoading() {
  return (
    <div className="p-8 max-w-2xl space-y-10">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-md border border-zinc-200 bg-white p-6">
          <Skeleton className="h-6 w-44 mb-5" />
          <div className="space-y-4">
            <div><Skeleton className="h-4 w-16 mb-2" /><Skeleton className="h-10 w-full rounded" /></div>
            <div><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-10 w-full rounded" /></div>
            <Skeleton className="h-10 w-32 rounded mt-2" />
          </div>
        </div>
      ))}
    </div>
  )
}
