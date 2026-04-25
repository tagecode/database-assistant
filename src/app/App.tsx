import { AppProviders } from './providers/AppProviders'
import { MainLayout } from '@/layouts/MainLayout'
import { WorkbenchPage } from '@/pages/WorkbenchPage'

export default function App() {
  return (
    <AppProviders>
      <MainLayout>
        <WorkbenchPage />
      </MainLayout>
    </AppProviders>
  )
}
