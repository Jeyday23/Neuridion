export function isReportApproved(reviewStatus: string | null | undefined): boolean {
  return reviewStatus === 'approved'
}

/** Older artifacts did not incorporate final human adjudication. Regenerate them. */
export function isCurrentReportArtifact(path: string | null | undefined): boolean {
  return typeof path === 'string' && /\/\d+_v2_report\.(html|pdf|xlsx|docx)$/.test(path)
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
