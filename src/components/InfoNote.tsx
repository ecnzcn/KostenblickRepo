import { Link } from 'react-router-dom'

interface InfoNoteProps {
  message: string
  linkTo?: string
  linkLabel?: string
}

/** A calm, always-visible informational aside - unlike EmptyState/ErrorState
 * (which react to data state) or the amber warning boxes (which flag a
 * problem), this is for explaining an intentional, non-alarming design
 * decision (e.g. why two pages show different totals). Reuses the same
 * neutral note style already used for CostOverviewMonthlyChart's
 * unallocated-amount note. */
export function InfoNote({ message, linkTo, linkLabel }: InfoNoteProps) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-600">
      <p>{message}</p>
      {linkTo && linkLabel ? (
        <Link to={linkTo} className="mt-2 inline-block font-medium text-accent">
          {linkLabel} →
        </Link>
      ) : null}
    </div>
  )
}
