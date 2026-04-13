import { Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import OverviewPage from '@/pages/OverviewPage'
import ReleasesPage from '@/pages/ReleasesPage'
import ReleaseDetailPage from '@/pages/ReleaseDetailPage'
import UpgradesPage from '@/pages/UpgradesPage'
import EventsPage from '@/pages/EventsPage'
import NotFoundPage from '@/pages/NotFoundPage'

export default function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/releases" element={<ReleasesPage />} />
          <Route path="/releases/:namespace/:name" element={<ReleaseDetailPage />} />
          <Route path="/upgrades" element={<UpgradesPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  )
}
