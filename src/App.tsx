import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

type Profile = {
  name: string
  dailyGoal: number
  costPerCigarette: number
  quitDate: string
  quitCompletedAt?: string
}

type StoredProfile = Partial<Profile> & {
  packPrice?: number
  cigarettesPerPack?: number
  motivation?: string
}

type SmokeLog = {
  id: string
  date: string
  time: string
  timestamp?: number
}

type TrackerBackup = {
  app: 'little-by-little-smoke-tracker'
  version: 1
  exportedAt: string
  profile: Profile
  logs: SmokeLog[]
}

type LogFilter = 'today' | 'all'
type Page = 'home' | 'calendar' | 'analytics' | 'quit-plan' | 'badges' | 'backup'

const PROFILE_KEY = 'smoke-tracker-profile'
const LOGS_KEY = 'smoke-tracker-logs'
const LOGS_PER_PAGE = 5

function readStorage<T,>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key)
    return saved ? (JSON.parse(saved) as T) : fallback
  } catch (error) {
    console.error(`Could not read "${key}" from local storage.`, error)
    return fallback
  }
}

function readProfile(): Profile | null {
  const saved = readStorage<StoredProfile | null>(PROFILE_KEY, null)
  if (
    !saved ||
    typeof saved.name !== 'string' ||
    typeof saved.dailyGoal !== 'number' ||
    typeof saved.costPerCigarette !== 'number'
  ) return null
  return {
    name: saved.name,
    dailyGoal: saved.dailyGoal,
    costPerCigarette: saved.costPerCigarette,
    quitDate: typeof saved.quitDate === 'string' ? saved.quitDate : defaultQuitDate(),
    ...(typeof saved.quitCompletedAt === 'string' ? { quitCompletedAt: saved.quitCompletedAt } : {}),
  }
}

function readSetup(): Profile {
  const saved = readStorage<StoredProfile | null>(PROFILE_KEY, null)
  return {
    name: typeof saved?.name === 'string' ? saved.name : '',
    dailyGoal: typeof saved?.dailyGoal === 'number' ? saved.dailyGoal : 10,
    costPerCigarette: typeof saved?.costPerCigarette === 'number' ? saved.costPerCigarette : 0,
    quitDate: typeof saved?.quitDate === 'string' ? saved.quitDate : defaultQuitDate(),
    ...(typeof saved?.quitCompletedAt === 'string' ? { quitCompletedAt: saved.quitCompletedAt } : {}),
  }
}

function formatMMK(amount: number) {
  return `MMK ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function todayKey() {
  const now = new Date()
  return dateKey(now)
}

function defaultQuitDate() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return dateKey(date)
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00`)
  return Number.isFinite(date.getTime()) && dateKey(date) === value
}

function isProfile(value: unknown): value is Profile {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    typeof candidate.dailyGoal === 'number' &&
    Number.isInteger(candidate.dailyGoal) &&
    candidate.dailyGoal > 0 &&
    typeof candidate.costPerCigarette === 'number' &&
    Number.isFinite(candidate.costPerCigarette) &&
    candidate.costPerCigarette >= 0 &&
    isDateKey(candidate.quitDate) &&
    (candidate.quitCompletedAt === undefined || (typeof candidate.quitCompletedAt === 'string' && Number.isFinite(Date.parse(candidate.quitCompletedAt))))
}

function isSmokeLog(value: unknown): value is SmokeLog {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    isDateKey(candidate.date) &&
    typeof candidate.time === 'string' &&
    candidate.time.length > 0 &&
    (candidate.timestamp === undefined || (typeof candidate.timestamp === 'number' && Number.isFinite(candidate.timestamp)))
}

function isTrackerBackup(value: unknown): value is TrackerBackup {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return candidate.app === 'little-by-little-smoke-tracker' &&
    candidate.version === 1 &&
    typeof candidate.exportedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.exportedAt)) &&
    isProfile(candidate.profile) &&
    Array.isArray(candidate.logs) &&
    candidate.logs.every(isSmokeLog)
}

function daysBetweenDates(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  const fromUtc = Date.UTC(fromYear, fromMonth - 1, fromDay)
  const toUtc = Date.UTC(toYear, toMonth - 1, toDay)
  return Math.round((toUtc - fromUtc) / 86_400_000)
}

function getLogTimestamp(log: SmokeLog) {
  if (typeof log.timestamp === 'number' && Number.isFinite(log.timestamp)) return log.timestamp
  const legacyTimestamp = new Date(`${log.date} ${log.time}`).getTime()
  return Number.isFinite(legacyTimestamp) ? legacyTimestamp : null
}

function formatSmokeFreeTime(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days) return `${days}d ${hours}h ${minutes}m`
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
}

function App() {
  const [profile, setProfile] = useState<Profile | null>(readProfile)
  const [logs, setLogs] = useState<SmokeLog[]>(() => readStorage<SmokeLog[]>(LOGS_KEY, []))
  const [step, setStep] = useState(0)
  const [notice, setNotice] = useState('')
  const [confirmLog, setConfirmLog] = useState(false)
  const [page, setPage] = useState<Page>('home')
  const [logFilter, setLogFilter] = useState<LogFilter>('today')
  const [logPage, setLogPage] = useState(0)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [analysisMonth, setAnalysisMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [quitDateDraft, setQuitDateDraft] = useState(() => readProfile()?.quitDate ?? defaultQuitDate())
  const [clock, setClock] = useState(() => Date.now())
  const [backupToRestore, setBackupToRestore] = useState<{ backup: TrackerBackup; fileName: string } | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<Profile>(readSetup)

  useEffect(() => {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs))
  }, [logs])

  useEffect(() => {
    if (!confirmLog) return
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setConfirmLog(false)
    }
    window.addEventListener('keydown', dismissOnEscape)
    return () => window.removeEventListener('keydown', dismissOnEscape)
  }, [confirmLog])

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const todayLogs = useMemo(() => logs.filter((log) => log.date === todayKey()), [logs])
  const dailyGoal = profile?.dailyGoal ?? 10
  const progress = Math.min((todayLogs.length / dailyGoal) * 100, 100)
  const goalStatus = todayLogs.length < dailyGoal
    ? { className: 'below', message: `Below target by ${dailyGoal - todayLogs.length}` }
    : todayLogs.length === dailyGoal
      ? { className: 'at', message: 'At target' }
      : { className: 'over', message: `Over target by ${todayLogs.length - dailyGoal}` }
  const costPerCigarette = profile?.costPerCigarette ?? 0
  const daysUntilQuitDate = profile ? daysBetweenDates(todayKey(), profile.quitDate) : 0
  const todaySpend = todayLogs.length * costPerCigarette
  const lastLogTimestamp = logs.reduce<number | null>((latest, log) => {
    const timestamp = getLogTimestamp(log)
    return timestamp !== null && (latest === null || timestamp > latest) ? timestamp : latest
  }, null)
  const smokeFreeTime = lastLogTimestamp === null ? null : formatSmokeFreeTime(clock - lastLogTimestamp)
  const badgeDayCounts = new Map<string, number>()
  logs.forEach((log) => badgeDayCounts.set(log.date, (badgeDayCounts.get(log.date) ?? 0) + 1))
  const trackedDays = badgeDayCounts.size
  const daysAtOrBelowGoal = Array.from(badgeDayCounts.values()).filter((count) => count <= dailyGoal).length
  const badgeProgress = [
    { id: 'first-check-in', icon: '✳', title: 'First check-in', description: 'Log your first moment of awareness.', progress: Math.min(logs.length, 1), target: 1, color: 'yellow' },
    { id: 'three-days', icon: '☼', title: 'Finding your rhythm', description: 'Check in on 3 different days.', progress: Math.min(trackedDays, 3), target: 3, color: 'blue' },
    { id: 'seven-days', icon: '✦', title: 'A week of awareness', description: 'Check in on 7 different days.', progress: Math.min(trackedDays, 7), target: 7, color: 'green' },
    { id: 'fourteen-days', icon: '❋', title: 'Two weeks of awareness', description: 'Check in on 14 different days.', progress: Math.min(trackedDays, 14), target: 14, color: 'coral' },
    { id: 'thirty-days', icon: '❋', title: 'A month of awareness', description: 'Check in on 30 different days.', progress: Math.min(trackedDays, 30), target: 30, color: 'coral' },
    { id: 'sixty-days', icon: '✧', title: 'Showing up for 60 days', description: 'Check in on 60 different days.', progress: Math.min(trackedDays, 60), target: 60, color: 'blue' },
    { id: 'first-goal-day', icon: '✓', title: 'A day at your goal', description: 'Log a day at or below your personal goal.', progress: Math.min(daysAtOrBelowGoal, 1), target: 1, color: 'green' },
    { id: 'five-goal-days', icon: '★', title: 'Steady steps', description: 'Log 5 days at or below your personal goal.', progress: Math.min(daysAtOrBelowGoal, 5), target: 5, color: 'yellow' },
    { id: 'ten-goal-days', icon: '✿', title: 'Ten thoughtful days', description: 'Log 10 days at or below your personal goal.', progress: Math.min(daysAtOrBelowGoal, 10), target: 10, color: 'blue' },
    { id: 'twenty-goal-days', icon: '✦', title: 'Building on progress', description: 'Log 20 days at or below your personal goal.', progress: Math.min(daysAtOrBelowGoal, 20), target: 20, color: 'coral' },
    { id: 'thirty-goal-days', icon: '★', title: 'A month of progress', description: 'Log 30 days at or below your personal goal.', progress: Math.min(daysAtOrBelowGoal, 30), target: 30, color: 'green' },
    { id: 'quit-goal-complete', icon: '✧', title: 'Quit goal completed', description: 'Mark your quit goal complete when you feel ready on your Quit plan page.', progress: profile?.quitCompletedAt ? 1 : 0, target: 1, color: 'coral' },
  ]
  const earnedBadgeCount = badgeProgress.filter((badge) => badge.progress >= badge.target).length
  const filteredLogs = logFilter === 'today' ? todayLogs : logs
  const totalLogPages = Math.ceil(filteredLogs.length / LOGS_PER_PAGE)
  const currentLogPage = Math.min(logPage, Math.max(0, totalLogPages - 1))
  const visibleLogs = filteredLogs.slice(currentLogPage * LOGS_PER_PAGE, (currentLogPage + 1) * LOGS_PER_PAGE)
  const monthKey = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`
  const monthLogs = logs.filter((log) => log.date.startsWith(monthKey))
  const monthCounts = new Map<string, number>()
  monthLogs.forEach((log) => monthCounts.set(log.date, (monthCounts.get(log.date) ?? 0) + 1))
  const firstWeekday = (new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() + 6) % 7
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate()
  const calendarCells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1
    return day > 0 && day <= daysInMonth ? day : null
  })
  const monthElapsedDays = calendarMonth.getFullYear() === new Date().getFullYear() && calendarMonth.getMonth() === new Date().getMonth()
    ? new Date().getDate()
    : calendarMonth > new Date()
      ? 0
      : daysInMonth
  const trackedDayCounts = Array.from({ length: monthElapsedDays }, (_, index) => monthCounts.get(`${monthKey}-${String(index + 1).padStart(2, '0')}`) ?? 0).filter((count) => count > 0)
  const underTargetDays = trackedDayCounts.filter((count) => count < dailyGoal).length
  const targetHitDays = trackedDayCounts.filter((count) => count === dailyGoal).length
  const overTargetDays = trackedDayCounts.filter((count) => count > dailyGoal).length
  const monthTotal = monthLogs.length
  const selectedDayLogs = logs.filter((log) => log.date === selectedDate)
  const selectedCount = selectedDayLogs.length
  const selectedDateObject = new Date(`${selectedDate}T00:00:00`)
  const isSelectedFuture = selectedDate > todayKey()
  const chartDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date()
    day.setDate(day.getDate() - (6 - index))
    const key = dateKey(day)
    return { date: day, key, count: logs.filter((log) => log.date === key).length }
  })
  const chartMax = Math.max(dailyGoal, ...chartDays.map((day) => day.count), 1)
  const analysisMonthKey = `${analysisMonth.getFullYear()}-${String(analysisMonth.getMonth() + 1).padStart(2, '0')}`
  const analysisMonthLogs = logs.filter((log) => log.date.startsWith(analysisMonthKey))
  const analysisDaysInMonth = new Date(analysisMonth.getFullYear(), analysisMonth.getMonth() + 1, 0).getDate()
  const analysisElapsedDays = analysisMonthKey === todayKey().slice(0, 7)
    ? new Date().getDate()
    : analysisMonthKey > todayKey().slice(0, 7)
      ? 0
      : analysisDaysInMonth
  const analysisDayCounts = new Map<string, number>()
  analysisMonthLogs.forEach((log) => analysisDayCounts.set(log.date, (analysisDayCounts.get(log.date) ?? 0) + 1))
  const analysisTrackedCounts = Array.from({ length: analysisElapsedDays }, (_, index) => analysisDayCounts.get(`${analysisMonthKey}-${String(index + 1).padStart(2, '0')}`) ?? 0).filter((count) => count > 0)
  const analysisTargetDays = analysisTrackedCounts.filter((count) => count === dailyGoal).length
  const analysisOverDays = analysisTrackedCounts.filter((count) => count > dailyGoal).length
  const analysisFirstWeekday = (new Date(analysisMonth.getFullYear(), analysisMonth.getMonth(), 1).getDay() + 6) % 7
  const analysisWeekCount = Math.ceil((analysisFirstWeekday + analysisDaysInMonth) / 7)
  const analysisWeeks = Array.from({ length: analysisWeekCount }, (_, index) => {
    const startDay = Math.max(1, index * 7 - analysisFirstWeekday + 1)
    const endDay = Math.min(analysisDaysInMonth, (index + 1) * 7 - analysisFirstWeekday, analysisElapsedDays)
    const weekCounts = Array.from({ length: Math.max(0, endDay - startDay + 1) }, (_, offset) => analysisDayCounts.get(`${analysisMonthKey}-${String(startDay + offset).padStart(2, '0')}`) ?? 0).filter((count) => count > 0)
    const average = weekCounts.length ? weekCounts.reduce((total, count) => total + count, 0) / weekCounts.length : 0
    return { week: index + 1, startDay, endDay: Math.min(analysisDaysInMonth, (index + 1) * 7 - analysisFirstWeekday), trackedDays: weekCounts.length, average }
  }).filter((week) => week.startDay <= analysisElapsedDays)

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim() || !form.quitDate) return
    localStorage.setItem(PROFILE_KEY, JSON.stringify(form))
    setProfile(form)
  }

  function saveQuitDate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile || !quitDateDraft) return
    const updatedProfile = { ...profile, quitDate: quitDateDraft }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(updatedProfile))
    setProfile(updatedProfile)
    setNotice('Your quit target date has been updated.')
    window.setTimeout(() => setNotice(''), 2600)
  }

  function markQuitGoalComplete() {
    if (!profile || profile.quitCompletedAt) return
    const updatedProfile = { ...profile, quitCompletedAt: new Date().toISOString() }
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(updatedProfile))
      setProfile(updatedProfile)
      setForm(updatedProfile)
      setNotice('Quit goal marked complete. Congratulations on reaching your milestone.')
      window.setTimeout(() => setNotice(''), 3500)
    } catch (error) {
      console.error('Could not save quit goal completion.', error)
      setNotice('Your completion could not be saved. Please check local storage and try again.')
    }
  }

  function exportBackup() {
    if (!profile) {
      setNotice('Complete your tracker setup before making a backup.')
      return
    }
    try {
      const backup: TrackerBackup = {
        app: 'little-by-little-smoke-tracker',
        version: 1,
        exportedAt: new Date().toISOString(),
        profile,
        logs,
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `little-by-little-backup-${todayKey()}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNotice('Your backup file has been downloaded.')
      window.setTimeout(() => setNotice(''), 2600)
    } catch (error) {
      console.error('Could not export tracker backup.', error)
      setNotice('Backup could not be downloaded. Please try again.')
    }
  }

  async function selectBackupFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.json')) {
      setNotice('Choose a Little by little .json backup file.')
      return
    }
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isTrackerBackup(parsed)) {
        setNotice('That backup is invalid or not supported. Your current data is unchanged.')
        return
      }
      setBackupToRestore({ backup: parsed, fileName: file.name })
      setNotice('')
    } catch (error) {
      console.error('Could not read selected tracker backup.', error)
      setNotice('The backup file could not be read. Your current data is unchanged.')
    }
  }

  function restoreBackup() {
    if (!backupToRestore) return
    const { backup } = backupToRestore
    const previousProfile = localStorage.getItem(PROFILE_KEY)
    const previousLogs = localStorage.getItem(LOGS_KEY)
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(backup.profile))
      localStorage.setItem(LOGS_KEY, JSON.stringify(backup.logs))
      setProfile(backup.profile)
      setForm(backup.profile)
      setQuitDateDraft(backup.profile.quitDate)
      setLogs(backup.logs)
      setBackupToRestore(null)
      setLogPage(0)
      setLogFilter('today')
      setPage('home')
      setNotice(`Restored ${backup.logs.length} smoke ${backup.logs.length === 1 ? 'log' : 'logs'} from ${backupToRestore.fileName}.`)
      window.setTimeout(() => setNotice(''), 3500)
    } catch (error) {
      console.error('Could not restore tracker backup.', error)
      try {
        if (previousProfile === null) localStorage.removeItem(PROFILE_KEY)
        else localStorage.setItem(PROFILE_KEY, previousProfile)
        if (previousLogs === null) localStorage.removeItem(LOGS_KEY)
        else localStorage.setItem(LOGS_KEY, previousLogs)
        setNotice('Restore failed. Your previous local data has been kept.')
      } catch (rollbackError) {
        console.error('Could not roll back partially restored tracker data.', rollbackError)
        setNotice('Restore and rollback failed. Check this browser’s local storage before continuing.')
      }
    }
  }

  function addSmoke() {
    setConfirmLog(false)
    const now = new Date()
    setLogs((current) => [
      { id: `${now.getTime()}-${Math.random().toString(36).slice(2)}`, date: todayKey(), time: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), timestamp: now.getTime() },
      ...current,
    ])
    setClock(now.getTime())
    setNotice('Smoke logged. One moment at a time.')
    window.setTimeout(() => setNotice(''), 2600)
  }

  function resetProfile() {
    localStorage.removeItem(PROFILE_KEY)
    setProfile(null)
    setStep(0)
  }

  if (!profile) {
    return (
      <main className="onboarding">
        <header className="topbar">
          <a className="brand" href="#" aria-label="Little by little home"><span className="brand-mark">✳</span> little by little</a>
          <span className="local-badge"><span /> SAVED ON THIS DEVICE</span>
        </header>
        <section className="welcome">
          <p className="eyebrow">A SMALL STEP, JUST FOR YOU</p>
          <h1>Your journey,<br /><span>your pace.</span></h1>
          <p className="welcome-copy">Get to know your habits without judgment. A few details help make this tracker yours.</p>
        </section>
        <div className="setup-card">
          <div className="step-head">
            <div className="step-count">{step + 1} <span>/ 3</span></div>
            <div className="step-track"><i style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>
          </div>
          {step === 0 && (
            <div className="step-body">
              <p className="eyebrow">FIRST THINGS FIRST</p>
              <h2>What should we call you?</h2>
              <p className="subcopy">This is your space. Choose a name that feels like you.</p>
              <label className="field-label" htmlFor="name">YOUR NAME</label>
              <input id="name" autoFocus placeholder="e.g. Alex" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              <button className="button button-dark next-button" disabled={!form.name.trim()} onClick={() => setStep(1)}>That’s me <span>→</span></button>
            </div>
          )}
          {step === 1 && (
            <div className="step-body">
              <p className="eyebrow">NO PRESSURE, JUST A BASELINE</p>
              <h2>Let’s understand your routine.</h2>
              <p className="subcopy">A rough estimate is perfect. You can change this anytime.</p>
              <label className="field-label" htmlFor="dailyGoal">CIGARETTES PER DAY</label>
              <div className="number-control"><button type="button" aria-label="Decrease daily cigarettes" onClick={() => setForm({ ...form, dailyGoal: Math.max(1, form.dailyGoal - 1) })}>−</button><strong>{form.dailyGoal}</strong><button type="button" aria-label="Increase daily cigarettes" onClick={() => setForm({ ...form, dailyGoal: form.dailyGoal + 1 })}>+</button></div>
              <label className="field-label" htmlFor="costPerCigarette">HOW MUCH IS ONE CIGARETTE?</label>
              <div className="money-input price-input"><span aria-hidden="true">MMK</span><input id="costPerCigarette" type="number" inputMode="numeric" min="0" step="1" placeholder="e.g. 500" value={form.costPerCigarette || ''} onChange={(event) => setForm({ ...form, costPerCigarette: Math.max(0, Number(event.target.value)) })} /></div>
              <p className="price-hint">{form.costPerCigarette > 0 ? `At ${form.dailyGoal} cigarettes a day, that’s about ${formatMMK(form.dailyGoal * form.costPerCigarette)} per day.` : 'We’ll use this to estimate your daily smoking cost.'}</p>
              <div className="step-actions"><button type="button" className="button button-light" onClick={() => setStep(0)}>← Back</button><button className="button button-dark" onClick={() => setStep(2)}>Next <span>→</span></button></div>
            </div>
          )}
          {step === 2 && (
            <form className="step-body" onSubmit={saveProfile}>
              <p className="eyebrow">YOUR GOAL, YOUR TIMELINE</p>
              <h2>Choose your quit date.</h2>
              <p className="subcopy">Pick a date that feels right for you. You can change it anytime.</p>
              <label className="field-label" htmlFor="quitDate">MY TARGET DATE</label>
              <input className="date-input" id="quitDate" type="date" min={todayKey()} required value={form.quitDate} onChange={(event) => setForm({ ...form, quitDate: event.target.value })} />
              <p className="price-hint">{form.quitDate ? `${daysBetweenDates(todayKey(), form.quitDate)} days from today. This is your plan—not a pressure.` : 'Choose a date to start your countdown.'}</p>
              <div className="step-actions"><button type="button" className="button button-light" onClick={() => setStep(1)}>← Back</button><button className="button button-dark" type="submit">Start my tracker <span>→</span></button></div>
            </form>
          )}
        </div>
        <footer className="onboarding-foot">NO SHAME. NO STREAKS. JUST A LITTLE MORE AWARENESS. <span>✳</span></footer>
      </main>
    )
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Little by little home"><span className="brand-mark">✳</span> little by little</a>
        <div className="header-right"><span className="local-badge"><span /> YOUR DATA STAYS HERE</span><button className="profile-button" onClick={resetProfile} title="Edit your setup">{profile.name.slice(0, 1).toUpperCase()}</button></div>
      </header>
      <nav className="main-nav" aria-label="Main navigation">
        <button className={page === 'home' ? 'active' : ''} aria-current={page === 'home' ? 'page' : undefined} onClick={() => setPage('home')}><span>⌂</span> Today</button>
        <button className={page === 'calendar' ? 'active' : ''} aria-current={page === 'calendar' ? 'page' : undefined} onClick={() => setPage('calendar')}><span>▦</span> Calendar</button>
        <button className={page === 'analytics' ? 'active' : ''} aria-current={page === 'analytics' ? 'page' : undefined} onClick={() => setPage('analytics')}><span>↗</span> Insights</button>
        <button className={page === 'quit-plan' ? 'active' : ''} aria-current={page === 'quit-plan' ? 'page' : undefined} onClick={() => { setQuitDateDraft(profile.quitDate); setPage('quit-plan') }}><span>◎</span> Quit plan</button>
        <button className={page === 'badges' ? 'active' : ''} aria-current={page === 'badges' ? 'page' : undefined} onClick={() => setPage('badges')}><span>✦</span> Badges</button>
        <button className={page === 'backup' ? 'active' : ''} aria-current={page === 'backup' ? 'page' : undefined} onClick={() => setPage('backup')}><span>⇅</span> Backup</button>
      </nav>
      <section className="greeting">
        <div><p className="eyebrow">{page === 'home' ? new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase() : page === 'calendar' ? 'YOUR MONTH, AT A GLANCE' : page === 'analytics' ? 'PATTERNS, NOT PRESSURE' : page === 'quit-plan' ? 'A GOAL THAT IS YOURS' : page === 'badges' ? 'SMALL STEPS COUNT' : 'YOUR DATA, YOURS TO KEEP'}</p><h1>{page === 'home' ? <>Hey, {profile.name}<span className="wave">✳</span></> : page === 'calendar' ? 'Your calendar' : page === 'analytics' ? 'Your insights' : page === 'quit-plan' ? 'Your quit plan' : page === 'badges' ? 'Your badges' : 'Backup & restore'}</h1><p className="greeting-copy">{page === 'home' ? 'Noticing is progress. You’re doing just fine.' : page === 'calendar' ? 'Every day is information, not a grade.' : page === 'analytics' ? 'A little perspective on your smoking patterns.' : page === 'quit-plan' ? 'A gentle countdown toward the date you chose.' : page === 'badges' ? 'Celebrate the moments you’ve shown up for yourself.' : 'Move your tracker safely between devices.'}</p></div>
        <span className="day-note">{page === 'home' ? <>A FRESH DAY, A FRESH START <span>↗</span></> : <>YOUR DATA STAYS PRIVATE <span>✳</span></>}</span>
      </section>
      {page === 'home' && <>
      <section className="dashboard-grid">
        <article className={`card progress-card status-${goalStatus.className}`}>
          <div className="card-kicker">TODAY’S CHECK-IN <span className="live-dot" /> LIVE</div>
          <div className="progress-content">
            <div className={`progress-ring status-${goalStatus.className}`} role="img" aria-label={`${todayLogs.length} cigarettes today. ${goalStatus.message}.`} style={{ '--progress': `${progress}%` } as React.CSSProperties}><div className="ring-inner"><strong>{todayLogs.length}</strong><span>{goalStatus.className === 'over' ? 'OVER TARGET' : goalStatus.className === 'at' ? 'AT TARGET' : 'BELOW TARGET'}</span></div></div>
            <div className="progress-copy"><h2>One moment<br />at a time.</h2><p>You set a gentle goal of <strong>{dailyGoal} a day.</strong></p><div className="goal-label"><span>DAILY GOAL</span><strong>{todayLogs.length} <i>/ {dailyGoal}</i></strong></div><div className="goal-track"><i style={{ width: `${progress}%` }} /></div><p className={`goal-status status-${goalStatus.className}`} aria-live="polite">{goalStatus.message}</p><div className="smoke-free-clock" aria-live="polite"><span className="clock-icon">◷</span><div><span className="clock-label">TIME SINCE LAST CIGARETTE</span><strong>{smokeFreeTime ?? 'Not started'}</strong><span className="clock-caption">{smokeFreeTime ? 'One moment at a time.' : 'Your timer starts after your first log.'}</span></div></div><p className="kind-note">This isn’t a score. It’s just information.</p></div>
          </div>
          <button className="button button-dark log-button" onClick={() => setConfirmLog(true)}><span className="plus">＋</span> Log a cigarette <span className="button-arrow">→</span></button>
          <div className="card-bottom-note">NO JUDGMENT. JUST A CHECK-IN.</div>
        </article>
        <div className="side-column">
          <article className="card spend-card"><div className="card-kicker">A LITTLE PERSPECTIVE <span className="sparkle">✳</span></div><h2>{formatMMK(todaySpend)}<span> today</span></h2><p>That’s the estimated cost of today’s cigarettes.</p><div className="spend-divider" /><div className="spend-detail"><span>PRICE PER CIGARETTE</span><strong>{formatMMK(costPerCigarette)}</strong></div></article>
        </div>
      </section>
      <section className="history-section">
        <div className="history-heading"><div><p className="eyebrow">NO STREAKS, NO PRESSURE</p><h2>Your smoke log</h2></div><span className="log-count">{filteredLogs.length} {filteredLogs.length === 1 ? 'MOMENT' : 'MOMENTS'} {logFilter === 'today' ? 'TODAY' : 'IN TOTAL'}</span></div>
        <div className="log-toolbar">
          <div className="log-filters" aria-label="Filter smoke log">
            <button className={logFilter === 'today' ? 'active' : ''} aria-pressed={logFilter === 'today'} onClick={() => { setLogFilter('today'); setLogPage(0) }}>Today</button>
            <button className={logFilter === 'all' ? 'active' : ''} aria-pressed={logFilter === 'all'} onClick={() => { setLogFilter('all'); setLogPage(0) }}>All logs</button>
          </div>
          <span className="log-page-size">5 ENTRIES PER PAGE</span>
        </div>
        {filteredLogs.length ? <>
          <div className="log-list">{visibleLogs.map((log) => <div className="log-row" key={log.id}>
            <span className="log-icon">✳</span>
            <span className="log-info"><span className="log-name">Cigarette logged</span><span className="log-meta">{new Date(`${log.date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · {log.time} · {formatMMK(costPerCigarette)}</span></span>
          </div>)}</div>
          {totalLogPages > 1 && <nav className="pagination" aria-label="Smoke log pages">
            <button className="button button-light" disabled={currentLogPage === 0} onClick={() => setLogPage((current) => current - 1)}>← Previous</button>
            <span>PAGE {currentLogPage + 1} / {totalLogPages}</span>
            <button className="button button-light" disabled={currentLogPage + 1 >= totalLogPages} onClick={() => setLogPage((current) => current + 1)}>Next →</button>
          </nav>}
        </> : <div className="empty-state"><span>☼</span><p>{logFilter === 'today' ? 'No check-ins yet today.' : 'No smoke logs yet.'}</p><span>{logFilter === 'today' ? 'Whenever you’re ready, log your first one above.' : 'Your cigarette check-ins will show up here.'}</span></div>}
      </section>
      </>}
      {page === 'calendar' && <section className="calendar-page">
        <div className="calendar-summary calendar-summary-four">
          <article className="summary-tile"><span>SMOKES THIS MONTH</span><strong>{monthTotal}</strong><i>logged cigarettes</i></article>
          <article className="summary-tile summary-at"><span>AT TARGET</span><strong>{targetHitDays}</strong><i>logged days at {dailyGoal}</i></article>
          <article className="summary-tile summary-below"><span>BELOW TARGET</span><strong>{underTargetDays}</strong><i>logged days below {dailyGoal}</i></article>
          <article className="summary-tile summary-over"><span>OVER TARGET</span><strong>{overTargetDays}</strong><i>logged days above {dailyGoal}</i></article>
        </div>
        <article className="card calendar-card">
          <div className="calendar-toolbar">
            <div><p className="eyebrow">MONTHLY VIEW</p><h2>{calendarMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2></div>
            <div className="month-controls">
              <button aria-label="Previous month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
              <button aria-label="Next month" disabled={monthKey >= todayKey().slice(0, 7)} onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
            </div>
          </div>
          <div className="calendar-legend"><span><i className="legend-below" /> Below target</span><span><i className="legend-at" /> At target</span><span><i className="legend-over" /> Over target</span><span><i className="legend-no-logs" /> No logs</span></div>
          <div className="calendar-grid" role="grid" aria-label="Monthly cigarette log calendar">
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((weekday) => <span className="calendar-weekday" role="columnheader" key={weekday}>{weekday}</span>)}
            {calendarCells.map((day, index) => {
              if (!day) return <span className="calendar-blank" role="gridcell" key={`blank-${index}`} />
              const key = `${monthKey}-${String(day).padStart(2, '0')}`
              const count = monthCounts.get(key) ?? 0
              const future = key > todayKey()
              const status = future ? 'future' : count > dailyGoal ? 'over' : count === dailyGoal && count > 0 ? 'at' : count > 0 ? 'below' : 'empty'
              const statusText = status === 'over' ? 'Over target' : status === 'at' ? 'At target' : status === 'below' ? 'Below target' : 'No logs'
              return <button className={`calendar-day ${status} ${selectedDate === key ? 'selected' : ''} ${key === todayKey() ? 'is-today' : ''}`} role="gridcell" aria-pressed={selectedDate === key} aria-label={`${calendarMonth.toLocaleDateString([], { month: 'long' })} ${day}: ${future ? 'future date' : `${count} cigarettes, ${statusText}`}`} disabled={future} key={key} onClick={() => setSelectedDate(key)}><span>{day}</span>{!future && <strong>{count || '·'}</strong>}</button>
            })}
          </div>
          <p className="calendar-footnote">Daily goal: <strong>{dailyGoal} cigarettes</strong>. Choose a day to see its check-ins.</p>
        </article>
        <article className="card selected-day-card">
          <div className="selected-day-heading"><div><p className="eyebrow">DAY DETAILS</p><h2>{selectedDateObject.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h2></div><span className={`day-status-chip ${isSelectedFuture ? 'upcoming' : selectedCount > dailyGoal ? 'over' : selectedCount === dailyGoal && selectedCount > 0 ? 'at' : selectedCount > 0 ? 'below' : 'no-logs'}`}>{isSelectedFuture ? 'UPCOMING' : selectedCount > dailyGoal ? 'Over target' : selectedCount === dailyGoal && selectedCount > 0 ? 'At target' : selectedCount > 0 ? 'Below target' : 'NO LOGS'}</span></div>
          <div className="selected-day-stats"><div><span>CIGARETTES</span><strong>{selectedCount}</strong></div><div><span>EST. SPEND</span><strong>{formatMMK(selectedCount * costPerCigarette)}</strong></div></div>
          {selectedDayLogs.length ? <div className="day-log-list">{selectedDayLogs.map((log) => <div className="day-log-row" key={log.id}><span>✳</span><strong>Smoke logged</strong><time>{log.time}</time></div>)}</div> : <p className="calendar-empty">{isSelectedFuture ? 'This day hasn’t arrived yet.' : 'No entries saved for this day.'}</p>}
        </article>
      </section>}
      {page === 'analytics' && <section className="analytics-page">
        <div className="calendar-summary analytics-summary">
          <article className="summary-tile"><span>CIGARETTES LOGGED</span><strong>{analysisMonthLogs.length}</strong><i>in {analysisMonth.toLocaleDateString([], { month: 'long' })}</i></article>
          <article className="summary-tile summary-green"><span>AVG. PER LOGGED DAY</span><strong>{analysisTrackedCounts.length ? (analysisMonthLogs.length / analysisTrackedCounts.length).toFixed(1) : '0'}</strong><i>cigarettes per logged day</i></article>
          <article className="summary-tile summary-yellow"><span>ESTIMATED SPEND</span><strong className="money-stat">{formatMMK(analysisMonthLogs.length * costPerCigarette)}</strong><i>in {analysisMonth.toLocaleDateString([], { month: 'long' })}</i></article>
          <article className="summary-tile summary-over"><span>OVER TARGET</span><strong>{analysisOverDays}</strong><i>{analysisTargetDays} days at target</i></article>
        </div>
        <article className="card monthly-analysis-card">
          <div className="calendar-toolbar">
            <div><p className="eyebrow">MONTHLY ANALYSIS</p><h2>{analysisMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2></div>
            <div className="month-controls">
              <button aria-label="Previous analysis month" onClick={() => setAnalysisMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}>←</button>
              <button aria-label="Next analysis month" disabled={analysisMonthKey >= todayKey().slice(0, 7)} onClick={() => setAnalysisMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}>→</button>
            </div>
          </div>
          <p className="chart-description">Average cigarettes on days you logged at least one. Days without entries are not counted as zero.</p>
          {analysisWeeks.length ? <div className="monthly-weeks" aria-label={`Weekly average cigarettes per logged day in ${analysisMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}. Daily goal is ${dailyGoal}.`}>
            {analysisWeeks.map((week) => {
              const weekStatus = week.average > dailyGoal ? 'over' : week.average === dailyGoal && week.trackedDays ? 'at' : 'below'
              const fillPercent = week.trackedDays ? Math.min((week.average / dailyGoal) * 100, 100) : 0
              return <div className={`monthly-week-column ${week.trackedDays ? weekStatus : 'no-logs'}`} key={week.week}>
                <div className="monthly-week-heading"><strong>WEEK {week.week}</strong><span>{week.startDay}–{week.endDay}</span></div>
                <div className="monthly-week-result"><strong>{week.trackedDays ? week.average.toFixed(1) : '—'}</strong><span>{week.trackedDays ? 'AVG / LOGGED DAY' : 'NO LOGS'}</span></div>
                <div className="monthly-week-meter"><i style={{ width: `${fillPercent}%` }} /></div>
                <div className="monthly-week-footer"><span>{week.trackedDays} {week.trackedDays === 1 ? 'day' : 'days'} with logs</span><span>{week.trackedDays ? week.average > dailyGoal ? `Over target by ${(week.average - dailyGoal).toFixed(1)}` : week.average === dailyGoal ? 'At target' : `Below target by ${(dailyGoal - week.average).toFixed(1)}` : '—'}</span></div>
              </div>
            })}
          </div> : <div className="calendar-empty">No days in this month yet.</div>}
          <div className="monthly-goal-note"><span className="goal-note-mark">↗</span><span>Daily goal</span><strong>{dailyGoal} cigarettes</strong><span className="monthly-goal-divider" /><span>Average uses logged days only</span></div>
        </article>
        <article className="card analytics-chart-card">
          <div className="chart-heading"><div><p className="eyebrow">LAST 7 DAYS</p><h2>Your daily pattern</h2></div><span className="chart-goal-key"><i /> DAILY GOAL · {dailyGoal}</span></div>
          <p className="chart-description">Cigarettes logged each day compared with your personal target.</p>
          <div className="weekly-chart" role="img" aria-label={`Bar chart of cigarettes logged over the last seven days. Daily goal is ${dailyGoal}.`}>
            {chartDays.map((day) => <div className="chart-column" key={day.key}>
              <div className="chart-bar-area" style={{ '--target-height': `${(dailyGoal / chartMax) * 100}%` } as React.CSSProperties}><div className={`chart-bar ${day.count === 0 ? 'no-logs' : day.count > dailyGoal ? 'over' : day.count === dailyGoal ? 'at' : 'below'}`} style={{ height: `${day.count ? Math.max((day.count / chartMax) * 100, 3) : 0}%` }}><span>{day.count || ''}</span></div></div>
              <span className="chart-day-label">{day.date.toLocaleDateString([], { weekday: 'short' })}</span><span className="chart-date-label">{day.date.getDate()}</span>
            </div>)}
          </div>
          <div className="chart-legend"><span><i className="legend-below" /> Below target</span><span><i className="legend-at" /> At target</span><span><i className="legend-over" /> Over target</span><span><i className="legend-no-logs" /> No logs</span><span><i className="legend-line" /> Daily target</span></div>
        </article>
        <div className="insight-note"><span>✳</span><p><strong>Your progress isn’t a straight line.</strong> These numbers are here to help you notice patterns—not to judge your day.</p></div>
      </section>}
      {page === 'quit-plan' && <section className="quit-plan-page">
        <article className={`card quit-countdown-card ${daysUntilQuitDate < 0 ? 'date-passed' : daysUntilQuitDate === 0 ? 'date-today' : ''}`}>
          <div className="quit-countdown-kicker"><span>YOUR PERSONAL MILESTONE</span><span>✳</span></div>
          <div className="quit-countdown-main">
            <div className="quit-days-number">{daysUntilQuitDate > 0 ? daysUntilQuitDate : Math.abs(daysUntilQuitDate)}</div>
            <div className="quit-days-label">{daysUntilQuitDate > 0 ? 'DAYS TO GO' : daysUntilQuitDate === 0 ? 'YOUR TARGET IS TODAY' : 'DAYS SINCE TARGET'}</div>
          </div>
          <div className="quit-target-date"><span>YOUR QUIT TARGET</span><strong>{new Date(`${profile.quitDate}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
          <p className="quit-countdown-note">{daysUntilQuitDate > 0 ? 'A date to work toward—not a reason to be hard on yourself. Every small step counts.' : daysUntilQuitDate === 0 ? 'Your chosen date is here. Take this one moment at a time.' : 'Your plans can change. Choose a new date below whenever you’re ready.'}</p>
          {profile.quitCompletedAt
            ? <div className="quit-completion-state" role="status"><span>✓</span><div><strong>QUIT GOAL COMPLETED</strong><small>Marked on {new Date(profile.quitCompletedAt).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}. Well done.</small></div></div>
            : <button className="button button-dark quit-complete-button" onClick={markQuitGoalComplete}>I’ve completed my quit goal <span>✓</span></button>}
        </article>
        <form className="card quit-date-form" onSubmit={saveQuitDate}>
          <p className="eyebrow">MAKE IT YOURS</p>
          <h2>Change your target date</h2>
          <p>There’s no perfect timeline. Update your date to one that works for you.</p>
          <label className="field-label" htmlFor="updateQuitDate">NEW QUIT TARGET DATE</label>
          <input className="date-input" id="updateQuitDate" type="date" min={todayKey()} required value={quitDateDraft} onChange={(event) => setQuitDateDraft(event.target.value)} />
          <button className="button button-dark" type="submit">Save my date <span>→</span></button>
        </form>
        <div className="insight-note"><span>✳</span><p><strong>Progress isn’t all-or-nothing.</strong> Your target is a guide you chose. You can adjust it whenever your needs change.</p></div>
      </section>}
      {page === 'badges' && <section className="badges-page">
        <article className="badges-summary">
          <div className="badges-summary-mark">✦</div>
          <div><p className="eyebrow">YOUR MILESTONES</p><h2>{earnedBadgeCount} <span>/ {badgeProgress.length}</span></h2><p>{earnedBadgeCount === 1 ? 'badge earned' : 'badges earned'}, one moment at a time</p></div>
          <div className="badges-summary-progress" role="img" aria-label={`${earnedBadgeCount} of ${badgeProgress.length} badges earned`}><i style={{ width: `${(earnedBadgeCount / badgeProgress.length) * 100}%` }} /></div>
        </article>
        <div className="badges-grid">
          {badgeProgress.map((badge) => {
            const earned = badge.progress >= badge.target
            const progressUnit = badge.id === 'first-check-in' ? 'logs' : 'days'
            const progressText = badge.id === 'quit-goal-complete' ? (earned ? 'MILESTONE REACHED' : 'MARK WHEN READY') : earned ? 'MILESTONE REACHED' : `${badge.progress} / ${badge.target} ${progressUnit}`
            return <article className={`badge-card badge-${badge.color} ${earned ? 'earned' : 'locked'}`} key={badge.id}>
              <div className="badge-card-top"><span className="badge-emblem" aria-hidden="true">{badge.icon}</span><span className={`badge-state ${earned ? 'is-earned' : ''}`}>{earned ? 'EARNED' : 'IN PROGRESS'}</span></div>
              <h2>{badge.title}</h2>
              <p>{badge.description}</p>
              <div className="badge-progress-label"><span>{progressText}</span><strong>{earned ? '✓' : `${Math.round((badge.progress / badge.target) * 100)}%`}</strong></div>
              <div className="badge-progress-track" role="progressbar" aria-label={`${badge.title} progress`} aria-valuemin={0} aria-valuemax={badge.target} aria-valuenow={badge.progress}><i style={{ width: `${(badge.progress / badge.target) * 100}%` }} /></div>
            </article>
          })}
        </div>
        <div className="insight-note"><span>✳</span><p><strong>These are reminders to notice your effort—not a score.</strong> Tracking milestones count different days with logs. Goal badges count logged days at or below your personal target; days without a log are never assumed to be smoke-free.</p></div>
      </section>}
      {page === 'backup' && <section className="backup-page">
        <article className="card backup-export-card">
          <div className="backup-card-icon">↓</div>
          <p className="eyebrow">TAKE YOUR DATA WITH YOU</p>
          <h2>Back up your tracker</h2>
          <p>Download one file with your profile, daily target, quit date, cigarette price, and all smoke logs. Keep it somewhere safe or move it to your other device.</p>
          <div className="backup-includes"><span>INCLUDED IN YOUR BACKUP</span><ul><li>Profile and daily cigarette goal</li><li>MMK price per cigarette and quit date</li><li>{logs.length} saved smoke {logs.length === 1 ? 'log' : 'logs'}</li></ul></div>
          <button className="button button-dark" onClick={exportBackup}>Download backup <span>↓</span></button>
        </article>
        <article className="card backup-import-card">
          <div className="backup-card-icon">↑</div>
          <p className="eyebrow">MOVING TO A NEW DEVICE?</p>
          <h2>Restore from backup</h2>
          <p>Select a backup JSON file you downloaded from Little by little. We’ll check it before changing anything.</p>
          <input ref={importInputRef} className="backup-file-input" type="file" accept=".json,application/json" aria-label="Choose a tracker backup JSON file" onChange={selectBackupFile} />
          <button className="button button-light" onClick={() => importInputRef.current?.click()}>Choose backup file <span>↑</span></button>
          {backupToRestore && <div className="restore-preview">
            <div className="restore-preview-head"><span className="restore-check">✓</span><div><strong>Backup ready</strong><span>{backupToRestore.fileName}</span></div></div>
            <div className="restore-preview-stats"><span>{backupToRestore.backup.profile.name}</span><span>{backupToRestore.backup.logs.length} {backupToRestore.backup.logs.length === 1 ? 'smoke log' : 'smoke logs'}</span><span>{new Date(backupToRestore.backup.exportedAt).toLocaleDateString()}</span></div>
            <p>Restoring replaces the profile and logs currently saved in this browser.</p>
            <div className="restore-actions"><button className="button button-light" onClick={() => setBackupToRestore(null)}>Cancel</button><button className="button button-dark" onClick={restoreBackup}>Restore backup <span>→</span></button></div>
          </div>}
        </article>
        <div className="insight-note"><span>✳</span><p><strong>Your data stays on this device unless you export it.</strong> Backups contain your personal tracker information. Keep the downloaded file private. Restoring replaces this browser’s current profile and logs.</p></div>
      </section>}
      <footer className="dashboard-footer"><span>MADE FOR REAL LIFE, NOT PERFECTION.</span><button onClick={resetProfile}>EDIT MY SETUP</button><span>YOUR DATA LIVES ONLY ON THIS DEVICE <span className="footer-flower">✳</span></span></footer>
      {confirmLog && <div className="confirm-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setConfirmLog(false) }}>
        <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
          <span className="confirm-mark" aria-hidden="true">＋</span>
          <p className="eyebrow">A QUICK CHECK-IN</p>
          <h2 id="confirm-title">Log this cigarette?</h2>
          <p id="confirm-description">This will add one cigarette to today’s log and update your daily progress.</p>
          <div className="confirm-cost"><span>ESTIMATED COST</span><strong>{formatMMK(costPerCigarette)}</strong></div>
          <div className="confirm-actions">
            <button className="button button-light" onClick={() => setConfirmLog(false)}>Cancel</button>
            <button className="button button-dark" autoFocus onClick={addSmoke}>Yes, log it <span>→</span></button>
          </div>
        </section>
      </div>}
      {notice && <div className="toast" role="status"><span>✳</span>{notice}</div>}
    </main>
  )
}

export default App
