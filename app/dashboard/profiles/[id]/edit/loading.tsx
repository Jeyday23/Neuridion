import { Skeleton } from '@/app/components/ui/Skeleton'

export default function EditProfileLoading() {
  return (
    <div className="p-8 max-w-2xl">
      <Skeleton className="h-7 w-36 mb-6" />
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <div><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-10 w-full rounded-lg" /></div>
          <div><Skeleton className="h-4 w-28 mb-2" /><Skeleton className="h-10 w-full rounded-lg" /></div>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-10 w-full rounded-lg" /></div>
          <div><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-10 w-full rounded-lg" /></div>
        </div>
        <div><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-24 w-full rounded-lg" /></div>
        <div className="flex gap-3 pt-2">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-20 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
