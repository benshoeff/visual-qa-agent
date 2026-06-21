import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import PagesManager from './components/PagesManager'
import TestRunner from './components/TestRunner'
import ReportViewer from './components/ReportViewer'
import ScheduleManager from './components/ScheduleManager'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pages" element={<PagesManager />} />
          <Route path="/runner" element={<TestRunner />} />
          <Route path="/schedules" element={<ScheduleManager />} />
          <Route path="/reports" element={<ReportViewer />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
