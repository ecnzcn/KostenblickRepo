import { Link } from 'react-router-dom'
import { ROUTES } from '../../../constants/navigation'

/** No bookings yet: explain where the figures come from and how to start. */
export function FinanceEmptyState() {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-700 shadow-sm">
      <h2 className="text-base font-semibold text-neutral-900">Noch keine Kontobewegungen</h2>
      <p className="mt-2">
        Einnahmen, Ausgaben und Saldo berechnet Kostenblick aus deinen Kontoumsätzen. Exportiere sie im Online-Banking der
        Sparkasse als CSV und importiere die Datei – sie wird nur auf diesem Gerät gelesen.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link to={ROUTES.transactionsImport} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-medium text-white">
          Sparkassen-CSV importieren
        </Link>
        <Link to={ROUTES.costOverview} className="inline-flex min-h-11 items-center font-medium text-accent">
          Erfasste Kosten in der Kostenübersicht
        </Link>
      </div>
    </section>
  )
}
