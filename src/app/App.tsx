import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { ToastProvider } from '../components/feedback/ToastProvider'
import { ROUTES } from '../constants/navigation'
import { BillDetailPage } from '../features/bills/BillDetailPage'
import { BillFormPage } from '../features/bills/BillFormPage'
import { BillsPage } from '../features/bills/BillsPage'
import { ImportBillPage } from '../features/bills/import/ImportBillPage'
import { ContractDetailPage } from '../features/contracts/ContractDetailPage'
import { ContractFormPage } from '../features/contracts/ContractFormPage'
import { ContractsPage } from '../features/contracts/ContractsPage'
import { CostOverviewPage } from '../features/costOverview/CostOverviewPage'
import { CostDetailPage } from '../features/costs/CostDetailPage'
import { CostFormPage } from '../features/costs/CostFormPage'
import { CostsPage } from '../features/costs/CostsPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { DocumentDetailPage } from '../features/documents/DocumentDetailPage'
import { DocumentsPage } from '../features/documents/DocumentsPage'
import { RemindersPage } from '../features/reminders/RemindersPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { StatisticsPage } from '../features/statistics/StatisticsPage'
import { WasteCostDetailPage } from '../features/waste/WasteCostDetailPage'
import { WasteCostFormPage } from '../features/waste/WasteCostFormPage'
import { WasteCostsPage } from '../features/waste/WasteCostsPage'
import { useDueReminderNotifications } from '../hooks/useDueReminderNotifications'

export function App() {
  useDueReminderNotifications()

  return (
    <ToastProvider>
      <AppLayout>
        <Routes>
          <Route path={ROUTES.home} element={<DashboardPage />} />
          <Route path={ROUTES.statistics} element={<StatisticsPage />} />

          <Route path={ROUTES.bills} element={<BillsPage />} />
          <Route path={ROUTES.billsNew} element={<BillFormPage mode="create" />} />
          <Route path={ROUTES.billsImport} element={<ImportBillPage />} />
          <Route path={ROUTES.billEditPattern} element={<BillFormPage mode="edit" />} />
          <Route path={ROUTES.billDetailPattern} element={<BillDetailPage />} />

          <Route path={ROUTES.contracts} element={<ContractsPage />} />
          <Route path={ROUTES.contractsNew} element={<ContractFormPage mode="create" />} />
          <Route path={ROUTES.contractEditPattern} element={<ContractFormPage mode="edit" />} />
          <Route path={ROUTES.contractDetailPattern} element={<ContractDetailPage />} />

          <Route path={ROUTES.costs} element={<CostsPage />} />
          <Route path={ROUTES.costsNew} element={<CostFormPage mode="create" />} />
          <Route path={ROUTES.costEditPattern} element={<CostFormPage mode="edit" />} />
          <Route path={ROUTES.costDetailPattern} element={<CostDetailPage />} />

          <Route path={ROUTES.reminders} element={<RemindersPage />} />

          <Route path={ROUTES.documents} element={<DocumentsPage />} />
          <Route path={ROUTES.documentDetailPattern} element={<DocumentDetailPage />} />

          <Route path={ROUTES.waste} element={<WasteCostsPage />} />
          <Route path={ROUTES.wasteNew} element={<WasteCostFormPage mode="create" />} />
          <Route path={ROUTES.wasteEditPattern} element={<WasteCostFormPage mode="edit" />} />
          <Route path={ROUTES.wasteDetailPattern} element={<WasteCostDetailPage />} />

          <Route path={ROUTES.costOverview} element={<CostOverviewPage />} />

          <Route path={ROUTES.settings} element={<SettingsPage />} />
          <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
        </Routes>
      </AppLayout>
    </ToastProvider>
  )
}
