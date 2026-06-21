import { useEffect, useState } from 'react'
import {
  getSchedules, addSchedule, updateSchedule, deleteSchedule, validateCron,
  type Schedule,
} from '../api'

const PRESETS = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Daily at 9:00', cron: '0 9 * * *' },
  { label: 'Daily at 18:00', cron: '0 18 * * *' },
  { label: 'Weekdays at 9:00', cron: '0 9 * * 1-5' },
  { label: 'Weekly (Monday 9:00)', cron: '0 9 * * 1' },
]

export default function ScheduleManager() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [editing, setEditing] = useState<Partial<Schedule> & { isNew?: boolean } | null>(null)
  const [error, setError] = useState('')
  const [validCron, setValidCron] = useState<{ valid: boolean; nextRun: string | null } | null>(null)

  useEffect(() => {
    getSchedules().then(setSchedules)
  }, [])

  const refresh = () => getSchedules().then(setSchedules)

  const handleSave = async () => {
    if (!editing || !editing.name || !editing.cronExpression || !editing.mode) {
      setError('Name, cron expression, and mode are required')
      return
    }
    setError('')
    try {
      if (editing.isNew) {
        await addSchedule({
          name: editing.name,
          cronExpression: editing.cronExpression,
          mode: editing.mode,
          enabled: editing.enabled ?? true,
        })
      } else if (editing.id) {
        await updateSchedule(editing.id, {
          name: editing.name,
          cronExpression: editing.cronExpression,
          mode: editing.mode,
          enabled: editing.enabled,
        })
      }
      setEditing(null)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return
    try {
      await deleteSchedule(id)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const toggleEnabled = async (s: Schedule) => {
    try {
      await updateSchedule(s.id, { enabled: !s.enabled })
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleCronChange = async (cron: string) => {
    setEditing((prev) => prev ? { ...prev, cronExpression: cron } : null)
    if (cron) {
      const result = await validateCron(cron)
      setValidCron(result)
    } else {
      setValidCron(null)
    }
  }

  return (
    <div>
      <div className="section-header">
        <h1>Schedules</h1>
        <button className="btn btn-primary" onClick={() => {
          setEditing({ name: '', cronExpression: '', mode: 'test', enabled: true, isNew: true })
          setValidCron(null)
          setError('')
        }}>
          + Add Schedule
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {editing && (
        <div className="modal-overlay" onClick={() => { setEditing(null); setError(''); setValidCron(null) }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing.isNew ? 'New Schedule' : 'Edit Schedule'}</h2>

            <label>
              Name
              <input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Nightly regression" />
            </label>

            <label>
              Cron Expression
              <input value={editing.cronExpression ?? ''} onChange={(e) => handleCronChange(e.target.value)} placeholder="0 9 * * *" />
            </label>

            {validCron && (
              <div style={{ fontSize: '0.8rem', marginBottom: '0.75rem', color: validCron.valid ? 'var(--success)' : 'var(--danger)' }}>
                {validCron.valid
                  ? `Valid - next run: ${new Date(validCron.nextRun!).toLocaleString('he-IL')}`
                  : 'Invalid cron expression'}
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Presets:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {PRESETS.map((p) => (
                  <button key={p.cron} className="btn btn-sm" onClick={() => handleCronChange(p.cron)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <label>
              Mode
              <select
                value={editing.mode ?? 'test'}
                onChange={(e) => setEditing({ ...editing, mode: e.target.value as 'baseline' | 'test' })}
                style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', width: '100%', fontSize: 14 }}
              >
                <option value="test">Test (compare vs baseline)</option>
                <option value="baseline">Baseline (capture screenshots)</option>
              </select>
            </label>

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={handleSave}>
                {editing.isNew ? 'Create' : 'Save'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setEditing(null); setError(''); setValidCron(null) }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Schedule</th>
            <th>Mode</th>
            <th>Status</th>
            <th>Last Run</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {schedules.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">No schedules yet. Click "Add Schedule" to create one.</td>
            </tr>
          )}
          {schedules.map((s) => (
            <tr key={s.id}>
              <td><strong>{s.name}</strong></td>
              <td><code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4, fontSize: '0.85rem' }}>{s.cronExpression}</code></td>
              <td><span style={{ textTransform: 'capitalize' }}>{s.mode}</span></td>
              <td>
                <button
                  className={`btn btn-sm ${s.enabled ? '' : 'btn-secondary'}`}
                  onClick={() => toggleEnabled(s)}
                  style={s.enabled ? { background: 'var(--success)', color: '#0f1117', borderColor: 'var(--success)' } : {}}
                >
                  {s.enabled ? 'Active' : 'Paused'}
                </button>
              </td>
              <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {s.lastRun ? new Date(s.lastRun).toLocaleString('he-IL') : 'Never'}
              </td>
              <td className="actions-cell">
                <button className="btn btn-sm" onClick={() => {
                  setEditing({ ...s, isNew: false })
                  setError('')
                  setValidCron(null)
                }}>
                  Edit
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
