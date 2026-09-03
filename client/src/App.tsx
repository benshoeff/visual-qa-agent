import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import Dashboard from './components/Dashboard'
import PagesManager from './components/PagesManager'
import CrawlManager from './components/CrawlManager'
import TestRunner from './components/TestRunner'
import ReportViewer from './components/ReportViewer'
import RunHistory from './components/RunHistory'
import ScheduleManager from './components/ScheduleManager'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pages" element={<PagesManager />} />
            <Route path="/crawl" element={<CrawlManager />} />
            <Route path="/runner" element={<TestRunner />} />
            <Route path="/history" element={<RunHistory />} />
            <Route path="/schedules" element={<ScheduleManager />} />
            <Route path="/reports" element={<ReportViewer />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
    </BrowserRouter>
  )
}
