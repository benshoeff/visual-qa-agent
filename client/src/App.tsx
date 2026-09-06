import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProjectProvider } from './contexts/ProjectContext'
import Dashboard from './components/Dashboard'
import PagesManager from './components/PagesManager'
import CrawlManager from './components/CrawlManager'
import TestRunner from './components/TestRunner'
import ReportViewer from './components/ReportViewer'
import RunHistory from './components/RunHistory'
import ScheduleManager from './components/ScheduleManager'
import IgnoreZonesPage from './components/IgnoreZonesPage'
import ProjectsManager from './components/ProjectsManager'

export default function App() {
  return (
    <BrowserRouter>
      <ProjectProvider>
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
              <Route path="/ignore-zones" element={<IgnoreZonesPage />} />
              <Route path="/projects" element={<ProjectsManager />} />
            </Routes>
          </ErrorBoundary>
        </Layout>
      </ProjectProvider>
    </BrowserRouter>
  )
}
