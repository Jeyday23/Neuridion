export function isReportApproved(reviewStatus: string | null | undefined): boolean {
  return reviewStatus === 'approved'
}

export function isReportReleaseAuthorized(
  reviewStatus: string | null | undefined,
  reviewedBy: string | null | undefined,
  reviewedAt: string | null | undefined,
): boolean {
  return reviewStatus === 'approved'
    && Boolean(reviewedBy)
    && Boolean(reviewedAt)
    && !Number.isNaN(Date.parse(reviewedAt!))
}
