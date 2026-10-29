import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileBarChart2,
  FileCheck2,
  Filter,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from './api.js'

const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'mark', label: 'Mark Attendance', icon: ClipboardCheck },
  { id: 'attendance', label: 'Attendance Records', icon: CheckCircle2 },
  { id: 'predict', label: 'Predict Attendance', icon: Sparkles },
  { id: 'reports', label: 'Reports', icon: FileBarChart2 },
]

const pageDescriptions = {
  dashboard: 'Campus activity, clearly split between live operations and history.',
  students: 'Search the student roster loaded from the campus database.',
  events: 'Create events and view the live event register.',
  mark: 'Look up a student and record their presence for an event.',
  attendance: 'Review attendance check-ins recorded in the live database.',
  predict: 'Estimate event attendance from the selected student population.',
  reports: 'Filter historical attendance records and compare event outcomes.',
}

const chartColors = ['#146b55', '#e06b45', '#a8bd3b', '#559a9a']

function preferredAttendanceEvent(events, preferredId) {
  const requestedEvent = preferredId == null
    ? null
    : events.find((event) => String(event.id) === String(preferredId))
  const verifiedEvent = events.find((event) => event.permission_status?.toUpperCase() === 'VERIFIED')
  const pendingEvent = events.find((event) => event.permission_status?.toUpperCase() === 'PENDING')
  const rejectedEvent = events.find((event) => event.permission_status?.toUpperCase() === 'REJECTED')
  return requestedEvent || verifiedEvent || pendingEvent || rejectedEvent || events[0] || null
}

function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [authPage, setAuthPage] = useState('login')
  const [authReady, setAuthReady] = useState(false)

  // Main application state
  const [activePage, setActivePage] = useState('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [apiStatus, setApiStatus] = useState('checking')
  const [pageLoading, setPageLoading] = useState(true)
  const [appError, setAppError] = useState('')
  const [students, setStudents] = useState([])
  const [events, setEvents] = useState([])
  const [attendance, setAttendance] = useState([])
  const [historicalStats, setHistoricalStats] = useState(null)
  const [departmentData, setDepartmentData] = useState([])
  const [yearData, setYearData] = useState([])
  const [eventData, setEventData] = useState([])
  const [dateData, setDateData] = useState([])
  const [modelInfo, setModelInfo] = useState(null)
  const [selectedPermissionEventId, setSelectedPermissionEventId] = useState(null)

  async function refreshData() {
    setRefreshing(true)
    setAppError('')
    try {
      const [health, roster, liveEvents, liveAttendance, stats, departments,
        years, historicalEvents, dates, info] = await Promise.all([
        api.health(),
        api.students(),
        api.events(),
        api.attendance(),
        api.dashboardStats(),
        api.departmentWise(),
        api.yearWise(),
        api.eventWise(),
        api.dateWise(),
        api.modelInfo(),
      ])
      setApiStatus(health.status === 'healthy' ? 'online' : 'offline')
      setStudents(roster)
      setEvents(liveEvents)
      setAttendance(liveAttendance)
      setHistoricalStats(stats)
      setDepartmentData(departments)
      setYearData(years)
      setEventData(historicalEvents)
      setDateData(dates)
      setModelInfo(info)
    } catch (error) {
      setApiStatus('offline')
      setAppError(error.message || 'Could not load campus data.')
    } finally {
      setPageLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function bootstrapSession() {
      const token = localStorage.getItem('campus_token')
      if (!token) {
        if (!cancelled) {
          setCurrentUser(null)
          setPageLoading(false)
          setAuthReady(true)
          window.history.replaceState({}, '', '/login')
          setAuthPage('login')
        }
        return
      }

      try {
        const user = await api.me()
        if (cancelled) return
        localStorage.setItem('campus_user', JSON.stringify(user))
        setCurrentUser(user)
        setAuthPage('login')
        setActivePage('dashboard')
        if (window.location.pathname !== '/dashboard') {
          window.history.replaceState({}, '', '/dashboard')
        }
        setPageLoading(true)
      } catch {
        if (cancelled) return
        localStorage.removeItem('campus_token')
        localStorage.removeItem('campus_user')
        sessionStorage.removeItem('campus_user')
        setCurrentUser(null)
        setPageLoading(false)
        setAuthPage('login')
        window.history.replaceState({}, '', '/login')
      } finally {
        if (!cancelled) setAuthReady(true)
      }
    }

    bootstrapSession()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!authReady) return undefined

    const protectedPaths = new Set(['/dashboard', '/students', '/events', '/mark', '/attendance', '/predict', '/reports'])
    const syncRoute = () => {
      const pathname = window.location.pathname || '/'
      const requestedPage = pathname === '/students'
        ? 'students'
        : pathname === '/events'
          ? 'events'
          : pathname === '/mark'
            ? 'mark'
            : pathname === '/attendance'
              ? 'attendance'
              : pathname === '/predict'
                ? 'predict'
                : pathname === '/reports'
                  ? 'reports'
                  : 'dashboard'

      if (!currentUser) {
        if (pathname === '/register') {
          setAuthPage('register')
          return
        }
        if (pathname === '/' || pathname === '') {
          window.history.replaceState({}, '', '/login')
        }
        if (pathname !== '/login' && pathname !== '/register' && protectedPaths.has(pathname)) {
          window.history.replaceState({}, '', '/login')
        }
        setAuthPage('login')
        setActivePage('dashboard')
        return
      }

      if (pathname === '/login' || pathname === '/register' || pathname === '/') {
        window.history.replaceState({}, '', '/dashboard')
        setActivePage('dashboard')
        return
      }

      if (pathname !== `/${requestedPage}` && requestedPage !== 'dashboard') {
        window.history.replaceState({}, '', `/${requestedPage}`)
      }
      setActivePage(requestedPage)
    }

    syncRoute()
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [authReady, currentUser])

  useEffect(() => {
    if (authReady && currentUser) refreshData()
  }, [authReady, currentUser])

  // Authentication helpers
  function handleLogin(user, token) {
    localStorage.setItem('campus_token', token)
    localStorage.setItem('campus_user', JSON.stringify(user))
    setCurrentUser(user)
    setAuthPage('login')
    setActivePage('dashboard')
    window.history.replaceState({}, '', '/dashboard')
    setPageLoading(true)
  }

  async function handleLogout() {
    try { await api.logout() } catch { /* Clear local state even when the server is unavailable. */ }
    localStorage.removeItem('campus_token')
    localStorage.removeItem('campus_user')
    sessionStorage.removeItem('campus_user')
    setCurrentUser(null)
    setAuthPage('login')
    setActivePage('dashboard')
    setPageLoading(false)
    window.history.replaceState({}, '', '/login')
  }

  // Authentication gate
  if (!authReady) {
    return <LoginPage onSuccess={handleLogin} onSwitch={() => setAuthPage('register')} />
  }

  if (!currentUser) {
    if (authPage === 'register') {
      return <RegisterPage onSuccess={handleLogin} onSwitch={() => setAuthPage('login')} />
    }
    return <LoginPage onSuccess={handleLogin} onSwitch={() => setAuthPage('register')} />
  }

  const activeItem = navigation.find((item) => item.id === activePage) || navigation[0]
  const PageIcon = activeItem.icon

  function navigate(page, eventId = null) {
    if (!currentUser) {
      window.history.replaceState({}, '', '/login')
      setAuthPage('login')
      return
    }

    const pathMap = {
      dashboard: '/dashboard',
      students: '/students',
      events: '/events',
      mark: '/mark',
      attendance: '/attendance',
      predict: '/predict',
      reports: '/reports',
    }
    const targetPath = pathMap[page] || '/dashboard'
    window.history.replaceState({}, '', targetPath)
    setActivePage(page)
    setMobileMenuOpen(false)
    if (eventId) {
      setSelectedPermissionEventId(eventId)
    }
  }

  function renderPage() {
    if (pageLoading) return <LoadingState label="Connecting to campus services" />
    if (appError && !historicalStats) {
      return <ErrorState message={appError} onRetry={refreshData} />
    }

    const shared = {
      students,
      events,
      attendance,
      modelInfo,
      onRefresh: refreshData,
      onNavigate: navigate,
      setEvents,
      selectedPermissionEventId,
      setSelectedPermissionEventId,
    }

    switch (activePage) {
      case 'students':
        return <StudentsPage students={students} />
      case 'events':
        return <EventsPage {...shared} />
      case 'mark':
        return <MarkAttendancePage {...shared} />
      case 'attendance':
        return <AttendancePage attendance={attendance} />
      case 'predict':
        return <PredictPage modelInfo={modelInfo} />
      case 'reports':
        return <ReportsPage
          modelInfo={modelInfo}
          historicalEvents={eventData}
          dates={dateData}
        />
      default:
        return <DashboardPage
          students={students}
          events={events}
          attendance={attendance}
          stats={historicalStats}
          departments={departmentData}
          years={yearData}
          historicalEvents={eventData}
          dates={dateData}
        />
    }
  }

  return (
    <div className="app-shell">
      {mobileMenuOpen && (
        <button
          type="button"
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
        <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
          <a className="brand" href="#dashboard" onClick={(event) => {
            event.preventDefault()
            navigate('dashboard')
          }}>
            <span className="brand-mark"><GraduationCap size={22} strokeWidth={2.2} /></span>
            <span className="brand-copy">
              <strong>Campus</strong>
              <small>ATTENDANCE OPS</small>
            </span>
          </a>

          <div className="nav-label">WORKSPACE</div>
          <nav className="side-nav" aria-label="Main navigation">
            {navigation.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`nav-item ${activePage === id ? 'nav-item-active' : ''}`}
                onClick={() => navigate(id)}
              >
                <Icon size={18} strokeWidth={1.9} />
                <span>{label}</span>
                {activePage === id && <span className="nav-active-mark" />}
              </button>
            ))}
          </nav>

          <div className="sidebar-bottom">
            {currentUser && (
              <div className="sidebar-user">
                <div className="sidebar-user-main">
                  <div className="sidebar-user-avatar">
                    {currentUser.full_name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0,2)}
                  </div>
                  <div className="sidebar-user-info">
                    <strong>{currentUser.full_name}</strong>
                    <small>{currentUser.role}</small>
                  </div>
                </div>
                <button
                  type="button"
                  className="sidebar-logout"
                  title="Sign out"
                  aria-label="Sign out"
                  onClick={handleLogout}
                >
                  <LogOut size={15} />
                  <span>Logout</span>
                </button>
              </div>
            )}
            <div className="connection-card">
              <span className={`connection-dot connection-${apiStatus}`} />
              <div>
                <strong>{apiStatus === 'online' ? 'API connected' : apiStatus === 'checking' ? 'Connecting' : 'API unavailable'}</strong>
                <small>127.0.0.1:8000</small>
              </div>
              <Activity size={16} />
            </div>
            <div className="sidebar-footnote">Campus Event Attendance<br />Prediction System</div>
          </div>
        </aside>

      <main className="main-shell">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-menu-button"
            aria-label="Open navigation"
            onClick={() => setMobileMenuOpen(true)}
          ><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Campus</span><span className="crumb-slash">/</span><strong>{activeItem.label}</strong></div>
          <div className="topbar-actions">
            <span className={`api-indicator api-indicator-${apiStatus}`}>
              <span />{apiStatus === 'online' ? 'Connected' : apiStatus === 'checking' ? 'Checking' : 'Offline'}
            </span>
            <button
              type="button"
              className={`icon-button ${refreshing ? 'is-spinning' : ''}`}
              title="Refresh data"
              aria-label="Refresh data"
              onClick={refreshData}
              disabled={refreshing}
            >{refreshing ? <LoaderCircle size={18} /> : <RefreshCw size={18} />}</button>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><PageIcon size={14} /> CAMPUS OPERATIONS</div>
              <h1>{activeItem.label}</h1>
              <p>{pageDescriptions[activePage]}</p>
            </div>
            {activePage === 'dashboard' && (
              <div className="heading-date"><CalendarDays size={15} /> Live overview</div>
            )}
          </div>
          {appError && <InlineNotice kind="error" message={appError} />}
          {renderPage()}
        </div>
        <footer className="page-footer">
          <span>Campus Attendance Prediction</span>
          <span>Operational data and historical analytics are reported separately.</span>
        </footer>
      </main>
    </div>
  )
}

function DashboardPage({ students, events, attendance, stats, departments, years, historicalEvents, dates }) {
  const livePresent = attendance.filter((record) => record.status === 'Present').length
  return (
    <div className="page-content dashboard-content">
      <section className="data-section live-section">
        <div className="section-heading">
          <div>
            <div className="section-kicker"><span className="live-dot" /> LIVE ATTENDANCE / SQLITE</div>
            <h2>Campus, right now</h2>
          </div>
          <span className="source-badge source-live">Live database</span>
        </div>
        <div className="stats-grid stats-grid-three">
          <StatCard icon={Users} label="Total students" value={numberFormat(students.length)} meta="Registered in live roster" accent="green" />
          <StatCard icon={CalendarDays} label="Live events" value={numberFormat(events.length)} meta="Created in this system" accent="orange" />
          <StatCard icon={ClipboardCheck} label="Live attendance" value={numberFormat(livePresent)} meta="Present records in SQLite" accent="lime" />
        </div>
      </section>

      <section className="data-section history-section">
        <div className="section-heading">
          <div>
            <div className="section-kicker"><span className="history-dot" /> HISTORICAL ANALYTICS / CSV</div>
            <h2>Attendance trends</h2>
          </div>
          <span className="source-badge source-history">Historical source data</span>
        </div>
        <div className="historical-summary-row">
          <div className="history-lead-stat">
            <div className="history-lead-icon"><BarChart3 size={18} /></div>
            <div>
              <span>Overall historical attendance</span>
              <strong>{stats?.attendance_percentage ?? 0}<small>%</small></strong>
            </div>
            <div className="history-lead-meta">
              <span>{numberFormat(stats?.present ?? 0)} present</span>
              <span>{numberFormat(stats?.absent ?? 0)} absent</span>
              <span>{numberFormat(stats?.total_events ?? 0)} historical events</span>
            </div>
          </div>
          <div className="historical-note"><ArrowDownRight size={17} /> These figures come from the original historical attendance records, not live check-ins.</div>
        </div>

        <div className="chart-grid">
          <ChartPanel title="By department" subtitle="Present and absent student records">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={departments} barGap={5} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e7ece7" />
                <XAxis dataKey="Department" axisLine={false} tickLine={false} tick={{ fill: '#7d8982', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#87928b', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f0f5ef' }} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, color: '#718079' }} />
                <Bar dataKey="present" name="Present" fill="#146b55" radius={[4, 4, 0, 0]} />
                <Bar dataKey="absent" name="Absent" fill="#e7a18b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
          <ChartPanel title="By year" subtitle="Historical attendance rate by year">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={years} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e7ece7" />
                <XAxis dataKey="Year" axisLine={false} tickLine={false} tick={{ fill: '#7d8982', fontSize: 11 }} />
                <YAxis domain={[0, 100]} unit="%" axisLine={false} tickLine={false} tick={{ fill: '#87928b', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}%`, 'Attendance']} />
                <Bar dataKey="percentage" name="Attendance" fill="#d4e95f" radius={[5, 5, 0, 0]}>
                  {years.map((entry, index) => <Cell key={entry.Year} fill={chartColors[index % chartColors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
          <ChartPanel title="By event" subtitle="Attendance rate across historical event types" className="chart-wide">
            <ResponsiveContainer width="100%" height={290}>
              <BarChart data={historicalEvents} layout="vertical" margin={{ top: 4, right: 24, left: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 5" horizontal={false} stroke="#e7ece7" />
                <XAxis type="number" domain={[0, 100]} unit="%" axisLine={false} tickLine={false} tick={{ fill: '#87928b', fontSize: 11 }} />
                <YAxis type="category" dataKey="Event_Name" width={112} axisLine={false} tickLine={false} tick={{ fill: '#627169', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}%`, 'Attendance']} />
                <Bar dataKey="percentage" name="Attendance" fill="#146b55" radius={[0, 5, 5, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
          <ChartPanel title="By date" subtitle="Historical attendance rate per event date" className="chart-wide">
            <ResponsiveContainer width="100%" height={290}>
              <AreaChart data={dates} margin={{ top: 10, right: 12, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#146b55" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#146b55" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e7ece7" />
                <XAxis dataKey="Event_Date" minTickGap={24} tickFormatter={(value) => value.slice(5)} axisLine={false} tickLine={false} tick={{ fill: '#87928b', fontSize: 10 }} />
                <YAxis domain={[0, 100]} unit="%" axisLine={false} tickLine={false} tick={{ fill: '#87928b', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => `Date ${value}`} formatter={(value) => [`${value}%`, 'Attendance']} />
                <Area type="monotone" dataKey="percentage" name="Attendance" stroke="#146b55" strokeWidth={2} fill="url(#attendanceFill)" activeDot={{ r: 4, fill: '#e06b45', stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>
      </section>
    </div>
  )
}

function StudentsPage({ students }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 25
  const filtered = students.filter((student) =>
    `${student.student_name} ${student.roll_number}`.toLowerCase().includes(search.toLowerCase())
  )
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize)

  return (
    <section className="panel table-panel">
      <div className="panel-toolbar">
        <div>
          <h2>Student roster</h2>
          <p>{numberFormat(filtered.length)} students found</p>
        </div>
        <label className="search-field">
          <Search size={17} />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Search name or roll number" />
          {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')}><X size={15} /></button>}
        </label>
      </div>
      <DataTable
        columns={[
          { label: 'Student Name', render: (row) => <strong className="person-cell">{row.student_name}</strong> },
          { label: 'Roll Number', render: (row) => <span className="mono-cell">{row.roll_number}</span> },
          { label: 'Department', render: (row) => <span className="table-tag">{row.department}</span> },
          { label: 'Year', key: 'year' },
        ]}
        rows={visible}
        rowKey="id"
        emptyTitle="No students match"
        emptyMessage="Try a different name or roll number."
      />
      <Pagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} />
    </section>
  )
}

function EventsPage({ events, setEvents, modelInfo, onRefresh, onNavigate, selectedPermissionEventId, setSelectedPermissionEventId }) {
  const unique = modelInfo?.unique_values || {}
  const emptyForm = {
    event_name: '', event_type: '', event_date: '', time: '', venue: '',
    department: '', year: '', venue_capacity: '',
  }
  const [form, setForm] = useState({
    event_name: '', event_type: '', event_date: '', time: '', venue: '',
    department: '', year: '', venue_capacity: '',
  })
  const [permissionFile, setPermissionFile] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [letterInfo, setLetterInfo] = useState(null)
  const [verification, setVerification] = useState(null)
  const [busy, setBusy] = useState(false)
  const [fileKey, setFileKey] = useState(0)
  const [message, setMessage] = useState(null)

  function syncEventStatus(eventId, updates) {
    setEvents((currentEvents) => currentEvents.map((event) =>
      String(event.id) === String(eventId) ? { ...event, ...updates } : event
    ))
    setSelectedEvent((currentEvent) => currentEvent && String(currentEvent.id) === String(eventId)
      ? { ...currentEvent, ...updates }
      : currentEvent
    )
  }

  useEffect(() => {
    if (selectedPermissionEventId && events.length) {
      const match = events.find((evt) => String(evt.id) === String(selectedPermissionEventId))
      if (match) {
        openPermission(match)
        if (setSelectedPermissionEventId) setSelectedPermissionEventId(null)
      }
    }
  }, [selectedPermissionEventId, events])

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    let created
    try {
      created = await api.createEvent({
        ...form,
        venue_capacity: Number(form.venue_capacity),
      })
      setSelectedEvent(created)
      setForm(emptyForm)
      const uploaded = await api.uploadPermissionLetter(created.id, permissionFile)
      setLetterInfo(uploaded)
      setVerification(uploaded)
      setPermissionFile(null)
      setFileKey((key) => key + 1)
      setMessage({ kind: 'success', text: `${created.event_name} created and the letter uploaded. Verify the letter to enable attendance.` })
      await onRefresh()
    } catch (error) {
      if (created) {
        setSelectedEvent(created)
        setLetterInfo(null)
        setVerification(null)
        setMessage({ kind: 'error', text: `Event #${created.id} was created but its letter was not uploaded: ${error.message}` })
        await onRefresh()
      } else {
        setMessage({ kind: 'error', text: error.message })
      }
    } finally {
      setBusy(false)
    }
  }

  async function openPermission(event) {
    setSelectedEvent(event)
    setPermissionFile(null)
    setVerification(null)
    setLetterInfo(null)
    setMessage(null)
    setBusy(true)
    try {
      const status = await api.permissionStatus(event.id)
      setLetterInfo(status)
      setVerification(status)
      const permissionStatus = status.verification_status || status.permission_status || event.permission_status || 'PENDING'
      syncEventStatus(event.id, {
        permission_status: permissionStatus,
        attendance_enabled: permissionStatus === 'VERIFIED',
      })
    } catch {
      setLetterInfo(null)
      setVerification({
        permission_status: event.permission_status || 'PENDING',
        verification_status: event.permission_status || 'PENDING',
      })
    } finally {
      setBusy(false)
    }
  }

  async function uploadLetter() {
    if (!selectedEvent || !permissionFile) return
    setBusy(true)
    setMessage(null)
    try {
      const uploaded = await api.uploadPermissionLetter(selectedEvent.id, permissionFile)
      setLetterInfo(uploaded)
      setVerification(uploaded)
      setPermissionFile(null)
      setFileKey((key) => key + 1)
      syncEventStatus(selectedEvent.id, {
        permission_status: uploaded.verification_status || 'PENDING',
        attendance_enabled: false,
      })
      setMessage({
        kind: 'success',
        text: 'Permission letter uploaded successfully. Status: PENDING. Click "Verify Letter" or "Approve as HOD".',
      })
      await onRefresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  async function verifyLetter() {
    if (!selectedEvent) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.verifyPermissionLetter(selectedEvent.id)
      setVerification(result)
      setLetterInfo(result)
      const status = result.verification_status || result.permission_status || 'UNABLE_TO_VERIFY'
      const verified = status === 'VERIFIED'
      syncEventStatus(selectedEvent.id, { permission_status: status, attendance_enabled: verified })
      setMessage({
        kind: verified ? 'success' : 'error',
        text: result.verification_message || result.verification_reason || 'Verification completed.',
      })
      await onRefresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  async function approveAsHod() {
    if (!selectedEvent) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.approvePermissionLetter(selectedEvent.id)
      setVerification(result)
      setLetterInfo(result)
      syncEventStatus(selectedEvent.id, { permission_status: 'VERIFIED', attendance_enabled: true })
      setMessage({
        kind: 'success',
        text: 'Permission letter accepted & verified by HOD. Attendance is now unlocked!',
      })
      await onRefresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  async function rejectAsHod() {
    if (!selectedEvent) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.rejectPermissionLetter(selectedEvent.id)
      setVerification(result)
      setLetterInfo(result)
      syncEventStatus(selectedEvent.id, { permission_status: 'REJECTED', attendance_enabled: false })
      setMessage({
        kind: 'error',
        text: 'Permission letter rejected by HOD. Attendance remains locked.',
      })
      await onRefresh()
    } catch (error) {
      setMessage({ kind: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  function closePermission() {
    setSelectedEvent(null)
    setLetterInfo(null)
    setVerification(null)
    setPermissionFile(null)
    setMessage(null)
    setFileKey((key) => key + 1)
  }

  return (
    <div className="split-layout event-layout">
      <section className="panel form-panel">
        <div className="panel-title-row">
          <div>
            <div className="section-kicker">{selectedEvent ? `EVENT #${selectedEvent.id} AUTHORIZATION` : 'EVENT REGISTER'}</div>
            <h2>{selectedEvent ? 'HOD Permission Verification' : 'Create event'}</h2>
          </div>
          <span className={`panel-icon ${selectedEvent ? 'panel-icon-green' : 'panel-icon-orange'}`}>
            {selectedEvent ? <ShieldCheck size={18} /> : <Plus size={18} />}
          </span>
        </div>
        {message && <InlineNotice kind={message.kind} message={message.text} />}
        {selectedEvent ? (
          <div className="permission-workflow">
            <div className="permission-event-summary" style={{ display: 'grid', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <span className="section-kicker">EVENT #{selectedEvent.id}</span>
                  <h3 style={{ fontSize: '15px', fontWeight: 600 }}>{selectedEvent.event_name}</h3>
                </div>
                <PermissionBadge status={selectedEvent.permission_status || verification?.verification_status || 'PENDING'} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 12px', fontSize: '11px', color: '#526659', marginTop: '4px' }}>
                <div><strong>Event Date:</strong> {selectedEvent.event_date}</div>
                <div><strong>Time:</strong> {selectedEvent.time}</div>
                <div><strong>Venue:</strong> {selectedEvent.venue}</div>
                <div><strong>Department:</strong> {selectedEvent.department || 'All Departments'}</div>
                <div><strong>Year:</strong> {selectedEvent.year || 'All Years'}</div>
                <div><strong>Capacity:</strong> {numberFormat(selectedEvent.venue_capacity)}</div>
              </div>
            </div>

            <div className="permission-upload-row">
              <label className="field" style={{ flex: 1 }}>
                <span>Permission Letter · PDF, JPG, PNG, TXT · max 8 MB</span>
                <input
                  key={fileKey}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.txt,text/plain,application/pdf,image/jpeg,image/png"
                  onChange={(event) => setPermissionFile(event.target.files?.[0] || null)}
                />
              </label>
              <button className="button button-primary" type="button" onClick={uploadLetter} disabled={busy || !permissionFile}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}
                Upload Letter
              </button>
            </div>
            {permissionFile && <p className="permission-file-name" style={{ color: '#27634b' }}><FileCheck2 size={14} /> Selected: {permissionFile.name}</p>}
            {letterInfo?.file_name && <p className="permission-file-name"><FileCheck2 size={14} /> Uploaded Letter: <strong>{letterInfo.file_name}</strong></p>}

            <div style={{
              display: 'grid',
              gap: '12px',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #dce8dd',
              background: selectedEvent.permission_status === 'VERIFIED' ? '#f0fff4' : '#fafcf9'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#68776e' }}>Status:</span>
                  <PermissionBadge status={selectedEvent.permission_status || verification?.verification_status || 'PENDING'} />
                </div>
                {selectedEvent.permission_status === 'VERIFIED' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#22543d', fontWeight: 600, fontSize: '11px' }}>
                    <CheckCircle2 size={16} /> HOD Permission Verified · Attendance Unlocked
                  </div>
                )}
              </div>

              {selectedEvent.permission_status === 'VERIFIED' ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: '5px',
                    background: '#e6fffa',
                    border: '1px solid #b2f5ea',
                    color: '#234e52',
                    fontSize: '11px',
                    lineHeight: 1.5
                  }}>
                    <div><strong>✓ HOD Permission Verified</strong></div>
                    <div><strong>✓ Attendance Unlocked</strong></div>
                    <div style={{ marginTop: '3px', color: '#285e61' }}>
                      Attendance marking is now active for this event.
                    </div>
                  </div>
                  <div className="form-actions permission-actions">
                    <button className="button button-primary" type="button" onClick={() => onNavigate('mark', selectedEvent.id)}>
                      Continue to Attendance &rarr;
                    </button>
                    <button className="button button-secondary" type="button" onClick={closePermission} disabled={busy}>Done</button>
                  </div>
                </div>
              ) : (
                <div className="form-actions permission-actions">
                  <button className="button button-primary" type="button" onClick={verifyLetter} disabled={busy || !letterInfo?.file_name}>
                    {busy ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}
                    Verify Letter
                  </button>
                  <button className="button button-secondary" type="button" onClick={approveAsHod} disabled={busy} title="Manually approve this letter as Head of Department" style={{ color: '#22543d', borderColor: '#22543d', fontWeight: 600 }}>
                    <CheckCircle2 size={16} />
                    Approve as HOD
                  </button>
                  <button className="button button-secondary" type="button" onClick={rejectAsHod} disabled={busy} title="Reject permission for this event" style={{ color: '#9b2c2c' }}>
                    <X size={16} />
                    Reject as HOD
                  </button>
                  <button className="button button-secondary" type="button" onClick={closePermission} disabled={busy}>Cancel</button>
                </div>
              )}
            </div>

            {verification && verification.verification_score !== undefined && (
              <PermissionResult result={verification} />
            )}
          </div>
        ) : <form className="form-grid" onSubmit={submit}>
          <Field label="Event name" wide>
            <input required value={form.event_name} onChange={(event) => update('event_name', event.target.value)} placeholder="e.g. Robotics showcase" />
          </Field>
          <Field label="Event type">
            <SelectInput required value={form.event_type} onChange={(value) => update('event_type', value)} options={unique.Event_Type} placeholder="Choose type" />
          </Field>
          <Field label="Event date">
            <input required type="date" value={form.event_date} onChange={(event) => update('event_date', event.target.value)} />
          </Field>
          <Field label="Time">
            <input required type="time" value={form.time} onChange={(event) => update('time', event.target.value)} />
          </Field>
          <Field label="Venue">
            <SelectInput required value={form.venue} onChange={(value) => update('venue', value)} options={unique.Venue} placeholder="Choose venue" />
          </Field>
          <Field label="Department">
            <SelectInput required value={form.department} onChange={(value) => update('department', value)} options={unique.Department} placeholder="Choose department" />
          </Field>
          <Field label="Year">
            <SelectInput required value={form.year} onChange={(value) => update('year', value)} options={unique.Year} placeholder="Choose year" />
          </Field>
          <Field label="Venue capacity">
            <input required type="number" min="1" value={form.venue_capacity} onChange={(event) => update('venue_capacity', event.target.value)} placeholder="Capacity" />
          </Field>
          <Field label="HOD permission letter · PDF, JPG, PNG, TXT · max 8 MB" wide>
            <input key={fileKey} required type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,text/plain,application/pdf,image/jpeg,image/png" onChange={(event) => setPermissionFile(event.target.files?.[0] || null)} />
          </Field>
          <div className="form-actions wide-field">
            <button className="button button-primary" type="submit" disabled={busy || !permissionFile}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />}
              Create event and upload letter
            </button>
          </div>
        </form>}
      </section>

      <section className="panel event-register-panel">
        <div className="panel-toolbar compact-toolbar">
          <div><div className="section-kicker">LIVE DATABASE</div><h2>Events</h2></div>
          <span className="count-pill">{events.length} total</span>
        </div>
        {events.length === 0 ? <EmptyState icon={CalendarDays} title="No live events yet" message="Events created here will appear in this register." /> : (
          <div className="event-list">
            {events.map((event) => (
              <article className="event-list-item" key={event.id}>
                <div className="event-date-block"><span>{formatMonth(event.event_date)}</span><strong>{formatDay(event.event_date)}</strong></div>
                <div className="event-main">
                  <div className="event-title-line"><h3>{event.event_name}</h3><span className="table-tag">{event.event_type}</span><PermissionBadge status={event.permission_status || 'PENDING'} /></div>
                  <div className="event-meta-line"><span><Clock3 size={13} />{event.time}</span><span><Users size={13} />{event.department} · {event.year}</span></div>
                  <div className="event-meta-line"><span><CalendarDays size={13} />{event.venue}</span><span>Capacity {numberFormat(event.venue_capacity)}</span></div>
                </div>
                <div className="event-actions">
                  <span className="event-id">#{event.id}</span>
                  <button
                    className="button button-secondary"
                    type="button"
                    aria-label={`Verify or manage HOD permission letter for ${event.event_name}`}
                    title="Manage HOD permission letter"
                    onClick={() => openPermission(event)}
                    style={{ padding: '6px 12px', fontSize: '11px', gap: '6px', whiteSpace: 'nowrap' }}
                  >
                    <FileCheck2 size={14} />
                    Verify / Manage
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function PermissionBadge({ status }) {
  const raw = status || 'PENDING'
  const normalized = raw.toUpperCase().replace(/\s+/g, '_')
  const label = normalized === 'VERIFIED'
    ? 'Verified'
    : normalized === 'SUSPICIOUS'
      ? 'Suspicious'
      : normalized === 'REJECTED'
        ? 'Rejected'
        : normalized === 'UNABLE_TO_VERIFY'
          ? 'Unable to Verify'
          : 'Pending'
  const cls = normalized === 'VERIFIED'
    ? 'permission-verified'
    : normalized === 'SUSPICIOUS'
      ? 'permission-suspicious'
      : normalized === 'REJECTED'
        ? 'permission-rejected'
        : normalized === 'UNABLE_TO_VERIFY'
          ? 'permission-unable-to-verify'
          : 'permission-pending'
  return <span className={`permission-badge ${cls}`}>{label}</span>
}

function PermissionResult({ result }) {
  const verified = (result.permission_status || result.verification_status) === 'VERIFIED'
  const checks = [
    ['Document readable', Boolean(result.extracted_fields && Object.keys(result.extracted_fields).length)],
    ['Event details matched', Boolean(result.event_match)],
    ['HOD details detected', Boolean(result.hod_details_detected)],
    ['Approval/signature wording detected', Boolean(result.signature_detected)],
  ]
  const extracted = result.extracted_fields || {}
  return (
    <div className={`permission-result ${verified ? 'permission-result-good' : 'permission-result-bad'}`}>
      <div className="permission-result-title">
        {verified ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
        <strong>{verified ? 'HOD permission letter verified' : 'HOD permission letter verification failed'}</strong>
      </div>
      <ul className="permission-checks">
        {checks.map(([label, passed]) => <li key={label} className={passed ? 'check-passed' : 'check-failed'}>
          {passed ? <Check size={14} /> : <X size={14} />}{label}
        </li>)}
      </ul>
      <div className="permission-extracted">
        {['event_name', 'event_date', 'department', 'year', 'venue', 'hod_name'].map((key) => extracted[key] && (
          <div key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{extracted[key]}</strong></div>
        ))}
      </div>
      <div className="permission-caution">
        <LockKeyhole size={14} />
        {result.signature_status || 'Signature verification uncertain'} · Automated checks do not authenticate a signature or prove document origin.
      </div>
      {result.verification_reason && <p className="permission-reason">{result.verification_reason}</p>}
      {result.authenticity_reason && <p className="permission-reason">{result.authenticity_reason}</p>}
    </div>
  )
}

function PermissionGate({ event, enabled, onManagePermission }) {
  return (
    <div className={`permission-gate wide-field ${enabled ? 'permission-gate-open' : 'permission-gate-locked'}`}>
      {enabled ? <ShieldCheck size={20} /> : <LockKeyhole size={20} />}
      <div style={{ display: 'grid', gap: '3px' }}>
        <strong style={{ fontSize: '12px' }}>
          {enabled ? '✓ Attendance Unlocked' : '🔒 Attendance Locked'}
        </strong>
        <span>
          {enabled
            ? 'HOD permission letter verified. Student check-in is available.'
            : 'Attendance cannot be marked until the HOD permission letter is verified.'}
        </span>
      </div>
      <PermissionBadge status={event.permission_status || 'PENDING'} />
      {!enabled && onManagePermission && (
        <button
          type="button"
          className="button button-primary"
          onClick={() => onManagePermission(event)}
          style={{ whiteSpace: 'nowrap', marginLeft: 'auto', padding: '7px 14px', fontSize: '11px', gap: '6px' }}
        >
          <FileCheck2 size={15} />
          Verify HOD Letter &rarr;
        </button>
      )}
    </div>
  )
}

function MarkAttendancePage({ events, setEvents, attendance, onRefresh, onNavigate, selectedPermissionEventId, setSelectedPermissionEventId }) {
  const requestedEventId = useRef(selectedPermissionEventId)
  const [eventId, setEventId] = useState(() => {
    const preferredEvent = preferredAttendanceEvent(events, selectedPermissionEventId)
    return preferredEvent ? String(preferredEvent.id) : ''
  })
  const userSelectedEvent = useRef(false)
  const [rollNumber, setRollNumber] = useState('')
  const [student, setStudent] = useState(null)
  const [checking, setChecking] = useState(false)
  const [marking, setMarking] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let active = true
    api.events().then((currentEvents) => {
      if (!active) return
      setEvents(currentEvents)
      if (!userSelectedEvent.current) {
        const preferredEvent = preferredAttendanceEvent(currentEvents, requestedEventId.current)
        setEventId(preferredEvent ? String(preferredEvent.id) : '')
      }
    }).catch((error) => {
      if (active) setNotice({ kind: 'error', text: error.message })
    })
    return () => { active = false }
  }, [setEvents])

  useEffect(() => {
    if (selectedPermissionEventId) {
      requestedEventId.current = selectedPermissionEventId
      setEventId(String(selectedPermissionEventId))
      setStudent(null)
      setNotice(null)
      if (setSelectedPermissionEventId) setSelectedPermissionEventId(null)
    }
  }, [selectedPermissionEventId])
  const selectedEvent = events.find((event) => String(event.id) === String(eventId))
  const attendanceEnabled = selectedEvent?.permission_status === 'VERIFIED' && selectedEvent?.attendance_enabled === true
  const duplicate = attendance.some((record) =>
    String(record.event_id) === String(eventId) && record.roll_number === student?.roll_number
  )

  async function findStudent(event) {
    event.preventDefault()
    if (!attendanceEnabled) return
    setChecking(true)
    setNotice(null)
    setStudent(null)
    try {
      const matches = await api.searchStudents(rollNumber.trim())
      const exact = matches.find((item) => item.roll_number.toLowerCase() === rollNumber.trim().toLowerCase())
      if (!exact) throw new Error('Student not found.')
      setStudent(exact)
      if (attendance.some((record) => String(record.event_id) === String(eventId) && record.roll_number === exact.roll_number)) {
        setNotice({ kind: 'error', text: 'Attendance already marked for this event.' })
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error.message })
    } finally {
      setChecking(false)
    }
  }

  async function markPresent() {
    if (!attendanceEnabled || !student || !selectedEvent || duplicate) return
    setMarking(true)
    setNotice(null)
    try {
      const result = await api.markAttendance({ event_id: selectedEvent.id, roll_number: student.roll_number })
      setNotice({ kind: 'success', text: `${result.message} Check-in ${result.attendance.check_in_time}.` })
      await onRefresh()
    } catch (error) {
      setNotice({ kind: 'error', text: error.message })
    } finally {
      setMarking(false)
    }
  }

  return (
    <div className="mark-layout">
      <section className="panel form-panel mark-form-panel">
        <div className="panel-title-row">
          <div><div className="section-kicker">LIVE CHECK-IN</div><h2>Mark a student present</h2></div>
          <span className="panel-icon panel-icon-green"><ClipboardCheck size={18} /></span>
        </div>
        {notice && <InlineNotice kind={notice.kind} message={notice.text} />}
        <div className="form-grid mark-grid">
          <Field label="Event" wide>
            <select value={eventId} onChange={(event) => { userSelectedEvent.current = true; setEventId(event.target.value); setStudent(null); setNotice(null) }} required>
              <option value="">Select an event</option>
              {events.map((event) => <option key={event.id} value={event.id}>{event.event_name} · {event.event_date} · #{event.id}</option>)}
            </select>
          </Field>
          {selectedEvent && (
            <div className="selected-event-summary wide-field">
              <span className="summary-date"><CalendarDays size={16} /></span>
              <div><strong>{selectedEvent.event_name}</strong><span>{selectedEvent.event_type} · {selectedEvent.venue} · {selectedEvent.time}</span></div>
              <span className="table-tag">{selectedEvent.department} / {selectedEvent.year}</span>
            </div>
          )}
          {selectedEvent && (
            <PermissionGate
              event={selectedEvent}
              enabled={attendanceEnabled}
              onManagePermission={(evt) => onNavigate('events', evt.id)}
            />
          )}
          {selectedEvent && <>
          <form className="lookup-form wide-field" onSubmit={findStudent}>
            <Field label="Student roll number" wide>
              <div className="input-with-action">
                <input value={rollNumber} onChange={(event) => { setRollNumber(event.target.value); setStudent(null); setNotice(null) }} placeholder="Enter roll number" disabled={!attendanceEnabled} required />
                <button className="button button-secondary" type="submit" disabled={!attendanceEnabled || checking || !rollNumber.trim()}>
                  {checking ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />} Search
                </button>
              </div>
            </Field>
          </form>
          {student && (
            <div className="student-match wide-field">
              <div className="avatar-initials">{initials(student.student_name)}</div>
              <div className="student-match-copy"><span>STUDENT FOUND</span><strong>{student.student_name}</strong><small>{student.roll_number}</small></div>
              <div className="student-match-meta"><span>{student.department}</span><span>{student.year}</span></div>
              {duplicate && <span className="duplicate-pill"><Check size={13} /> Already marked</span>}
            </div>
          )}
          <div className="form-actions wide-field">
            <button className="button button-primary" type="button" onClick={markPresent} disabled={!attendanceEnabled || !student || !selectedEvent || duplicate || marking}>
              {marking ? <LoaderCircle size={17} className="spin" /> : <CheckCircle2 size={17} />}
              Mark Present
            </button>
            <span className="form-footnote">Check-in time is recorded by the attendance service.</span>
          </div>
          </>}
        </div>
      </section>
      <aside className="workflow-aside">
        <div className="aside-number">LIVE</div>
        <h2>Attendance is recorded to the campus database.</h2>
        <div className="aside-rule" />
        <div className="aside-detail"><span>Events available</span><strong>{events.length}</strong></div>
        <div className="aside-detail"><span>Check-ins recorded</span><strong>{attendance.length}</strong></div>
      </aside>
    </div>
  )
}

function AttendancePage({ attendance }) {
  const [search, setSearch] = useState('')
  const visible = attendance.filter((record) =>
    `${record.event_name} ${record.student_name} ${record.roll_number}`.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <section className="panel table-panel">
      <div className="panel-toolbar">
        <div><div className="section-kicker">LIVE DATABASE</div><h2>Attendance records</h2><p>{numberFormat(visible.length)} matching records</p></div>
        <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event, student or roll" /></label>
      </div>
      <DataTable
        columns={[
          { label: 'Event', render: (row) => <strong>{row.event_name}</strong> },
          { label: 'Student', key: 'student_name' },
          { label: 'Roll Number', render: (row) => <span className="mono-cell">{row.roll_number}</span> },
          { label: 'Status', render: (row) => <span className="status-pill"><span />{row.status}</span> },
          { label: 'Check-in Time', render: (row) => <span className="time-cell"><Clock3 size={14} />{row.check_in_time || '-'}</span> },
        ]}
        rows={visible}
        rowKey="id"
        emptyTitle="No attendance records"
        emptyMessage="Live check-ins will appear here after they are recorded."
      />
    </section>
  )
}

function PredictPage({ modelInfo }) {
  const unique = modelInfo?.unique_values || {}
  const [form, setForm] = useState({
    department: '', year: '', event_type: '', day: '', time_slot: '', venue: '',
    venue_capacity: '', promotion_channel: '', exam_near: '', past_average_attendance: '',
  })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!modelInfo?.unique_values) return
    const keyMap = {
      department: 'Department', year: 'Year', event_type: 'Event_Type', day: 'Day',
      time_slot: 'Time_Slot', venue: 'Venue', promotion_channel: 'Promotion_Channel',
      exam_near: 'Exam_Near',
    }
    setForm((current) => {
      const next = { ...current }
      Object.entries(keyMap).forEach(([formKey, dataKey]) => {
        if (!next[formKey] && unique[dataKey]?.length) next[formKey] = unique[dataKey][0]
      })
      return next
    })
  }, [modelInfo])

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    setResult(null)
    try {
      const prediction = await api.predict({
        ...form,
        venue_capacity: Number(form.venue_capacity),
        past_average_attendance: Number(form.past_average_attendance),
      })
      setResult(prediction)
      setNotice({ kind: 'success', text: 'Prediction generated from the selected student population.' })
    } catch (error) {
      setNotice({ kind: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const categoricalFields = [
    ['department', 'Department', 'Department'],
    ['year', 'Year', 'Year'],
    ['event_type', 'Event type', 'Event_Type'],
    ['day', 'Day', 'Day'],
    ['time_slot', 'Time slot', 'Time_Slot'],
    ['venue', 'Venue', 'Venue'],
    ['promotion_channel', 'Promotion channel', 'Promotion_Channel'],
    ['exam_near', 'Exam near', 'Exam_Near'],
  ]

  return (
    <div className="predict-layout">
      <section className="panel form-panel prediction-form-panel">
        <div className="panel-title-row">
          <div><div className="section-kicker">STUDENT-LEVEL CLASSIFICATION</div><h2>Future event details</h2></div>
          <span className="panel-icon panel-icon-lime"><Sparkles size={18} /></span>
        </div>
        <p className="panel-intro">Attendance probabilities are scored for each eligible student in the selected Department and Year.</p>
        {notice && <InlineNotice kind={notice.kind} message={notice.text} />}
        <form className="form-grid prediction-grid" onSubmit={submit}>
          {categoricalFields.map(([key, label, dataKey]) => (
            <Field label={label} key={key}>
              <SelectInput required value={form[key]} onChange={(value) => update(key, value)} options={unique[dataKey]} placeholder={`Choose ${label.toLowerCase()}`} />
            </Field>
          ))}
          <Field label="Venue capacity">
            <input required type="number" min="1" value={form.venue_capacity} onChange={(event) => update('venue_capacity', event.target.value)} placeholder="e.g. 300" />
          </Field>
          <Field label="Past average attendance">
            <input required type="number" min="0" max="100" step="0.01" value={form.past_average_attendance} onChange={(event) => update('past_average_attendance', event.target.value)} placeholder="Percentage" />
          </Field>
          <div className="form-actions wide-field">
            <button className="button button-primary" type="submit" disabled={busy || !modelInfo}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}
              Predict attendance <ArrowRight size={16} />
            </button>
            {!modelInfo && <span className="form-footnote">Model options are loading.</span>}
          </div>
        </form>
      </section>

      <aside className={`prediction-result ${result ? 'prediction-result-ready' : ''}`}>
        {result ? (
          <>
            <div className="result-topline"><span className="result-spark"><Sparkles size={17} /></span><span>MODEL RESULT</span><span className="result-live-dot" /></div>
            <div className="result-large-number">{formatNumber(result.predicted_attendance_percentage)}<small>%</small></div>
            <div className="result-caption">Predicted attendance percentage</div>
            <div className="result-divider" />
            <div className="result-stats">
              <div><span>Eligible students</span><strong>{numberFormat(result.eligible_students)}</strong></div>
              <div><span>Predicted attendance</span><strong>{numberFormat(result.predicted_attendance_count)}</strong></div>
            </div>
            <div className="result-population"><Users size={15} /> Probability sum across {numberFormat(result.eligible_students)} eligible students</div>
          </>
        ) : (
          <div className="result-empty">
            <div className="result-orbit"><Sparkles size={27} /></div>
            <span>READY WHEN YOU ARE</span>
            <h3>Event forecast</h3>
            <p>Complete the event details to see a prediction from the trained model.</p>
          </div>
        )}
      </aside>
    </div>
  )
}

function ReportsPage({ modelInfo, historicalEvents, dates }) {
  const unique = modelInfo?.unique_values || {}
  const [filters, setFilters] = useState({ department: '', year: '', event_name: '', event_date: '' })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 20

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.report(filters)
      .then((result) => { if (active) { setRows(result); setPage(0) } })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters])

  function update(key, value) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const totals = rows.reduce((summary, row) => ({
    total: summary.total + row.total,
    present: summary.present + row.present,
    absent: summary.absent + row.absent,
  }), { total: 0, present: 0, absent: 0 })
  const overall = totals.total ? (totals.present / totals.total) * 100 : 0
  const eventNames = historicalEvents.map((event) => event.Event_Name).sort()
  const eventDates = dates.map((date) => date.Event_Date).sort()

  return (
    <div className="reports-content">
      <section className="panel report-filter-panel">
        <div className="panel-toolbar report-filter-toolbar">
          <div><div className="section-kicker">HISTORICAL CSV</div><h2>Attendance report</h2><p>Filters apply together to student-level historical records.</p></div>
          <span className="filter-mark"><Filter size={17} /> Combined filters</span>
        </div>
        <div className="report-filter-grid">
          <FilterField label="Department" value={filters.department} onChange={(value) => update('department', value)} options={unique.Department} />
          <FilterField label="Year" value={filters.year} onChange={(value) => update('year', value)} options={unique.Year} />
          <FilterField label="Event" value={filters.event_name} onChange={(value) => update('event_name', value)} options={eventNames} />
          <FilterField label="Date" value={filters.event_date} onChange={(value) => update('event_date', value)} options={eventDates} />
        </div>
      </section>

      {error && <InlineNotice kind="error" message={error} />}
      <div className="report-metrics">
        <StatCard icon={CheckCircle2} label="Present" value={loading ? '-' : numberFormat(totals.present)} meta="Matching historical records" accent="green" />
        <StatCard icon={X} label="Absent" value={loading ? '-' : numberFormat(totals.absent)} meta="Matching historical records" accent="orange" />
        <StatCard icon={BarChart3} label="Attendance percentage" value={loading ? '-' : `${formatNumber(overall)}%`} meta={`${numberFormat(rows.length)} event occurrences`} accent="lime" />
      </div>

      <section className="panel table-panel report-table-panel">
        <div className="panel-toolbar compact-toolbar">
          <div><h2>Event attendance</h2><p>{loading ? 'Updating report...' : `${numberFormat(rows.length)} event occurrences`}</p></div>
          <span className="source-badge source-history">Historical only</span>
        </div>
        {loading ? <LoadingState label="Applying report filters" /> : (
          <>
            <DataTable
              columns={[
                { label: 'Event', render: (row) => <strong>{row.Event_Name}</strong> },
                { label: 'Date', key: 'Event_Date' },
                { label: 'Present', key: 'present' },
                { label: 'Absent', key: 'absent' },
                { label: 'Attendance', render: (row) => <span className="percentage-value">{formatNumber(row.attendance_percentage)}%</span> },
              ]}
              rows={rows.slice(page * pageSize, (page + 1) * pageSize)}
              rowKey={(row) => `${row.Event_Name}-${row.Event_Date}`}
              emptyTitle="No records for these filters"
              emptyMessage="Clear one or more filters to broaden the historical report."
            />
            <Pagination page={page} pageSize={pageSize} total={rows.length} onPage={setPage} />
          </>
        )}
      </section>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, meta, accent }) {
  return (
    <article className={`stat-card stat-${accent}`}>
      <div className="stat-card-top"><span>{label}</span><span className="stat-icon"><Icon size={17} /></span></div>
      <strong className="stat-value">{value}</strong>
      <span className="stat-meta">{meta}</span>
    </article>
  )
}

function ChartPanel({ title, subtitle, className = '', children }) {
  return <section className={`panel chart-panel ${className}`}><div className="chart-heading"><div><h3>{title}</h3><p>{subtitle}</p></div><span className="chart-menu-mark"><BarChart3 size={17} /></span></div>{children}</section>
}

function DataTable({ columns, rows, rowKey, emptyTitle, emptyMessage }) {
  if (!rows.length) return <EmptyState icon={ClipboardCheck} title={emptyTitle} message={emptyMessage} />
  return (
    <div className="table-scroll">
      <table>
        <thead><tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={typeof rowKey === 'function' ? rowKey(row) : row[rowKey] ?? index}>{columns.map((column) => <td key={column.label}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function Pagination({ page, pageSize, total, onPage }) {
  const pageCount = Math.ceil(total / pageSize)
  if (pageCount <= 1) return null
  const start = page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, total)
  return (
    <div className="pagination">
      <span>Showing {start}-{end} of {numberFormat(total)}</span>
      <div>
        <button type="button" className="icon-button" aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={17} /></button>
        <span>{page + 1} / {pageCount}</span>
        <button type="button" className="icon-button" aria-label="Next page" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}><ChevronRight size={17} /></button>
      </div>
    </div>
  )
}

function Field({ label, children, wide = false }) {
  return <label className={`field ${wide ? 'wide-field' : ''}`}><span>{label}</span>{children}</label>
}

function SelectInput({ value, onChange, options = [], placeholder, required = false }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option value={option} key={option}>{option}</option>)}
    </select>
  )
}

function FilterField({ label, value, onChange, options = [] }) {
  return (
    <label className="filter-field"><span>{label}</span><span className="select-wrap"><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">All {label.toLowerCase()}s</option>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select><ChevronDown size={15} /></span></label>
  )
}

function InlineNotice({ kind, message }) {
  const Icon = kind === 'success' ? CheckCircle2 : CircleHelp
  return <div className={`inline-notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon size={17} /><span>{message}</span></div>
}

function EmptyState({ icon: Icon, title, message }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={22} /></span><strong>{title}</strong><p>{message}</p></div>
}

function LoadingState({ label }) {
  return <div className="loading-state"><LoaderCircle size={22} className="spin" /><span>{label}</span></div>
}

function ErrorState({ message, onRetry }) {
  return <div className="panel error-state"><CircleHelp size={24} /><div><strong>Campus services unavailable</strong><p>{message}</p></div><button type="button" className="button button-secondary" onClick={onRetry}><RefreshCw size={15} /> Retry</button></div>
}

function numberFormat(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0)
}

function formatNumber(value) {
  const number = Number(value) || 0
  return Number.isInteger(number) ? String(number) : number.toFixed(2)
}

function formatMonth(value) {
  if (!value) return 'DATE'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
}

function formatDay(value) {
  if (!value) return '--'
  return new Date(`${value}T00:00:00`).getDate()
}

function initials(value = '') {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

const tooltipStyle = {
  border: '1px solid #e4eae4',
  borderRadius: 8,
  boxShadow: '0 12px 28px rgba(26, 48, 39, .12)',
  fontSize: 12,
  color: '#26352e',
}

// =============================================
// LoginPage
// =============================================
function LoginPage({ onSuccess, onSwitch }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim()) {
      setError('Please enter your email.')
      return
    }
    if (!password) {
      setError('Please enter your password.')
      return
    }
    setLoading(true)
    try {
      const res = await api.login({ email: email.trim(), password })
      onSuccess(res.user, res.access_token)
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-panel-brand">
          <div className="auth-panel-mark"><GraduationCap size={24} strokeWidth={2.2} /></div>
          <div className="auth-panel-brand-copy">
            <strong>Campus</strong>
            <small>ATTENDANCE OPS</small>
          </div>
        </div>
        <div className="auth-panel-hero">
          <h2>Smart Attendance,<br />Smarter Decisions.</h2>
          <p>Predict, track, and manage event attendance across your campus with AI-powered insights.</p>
          <ul className="auth-feature-list">
            <li><span className="auth-feature-icon"><LayoutDashboard size={16} /></span>Live dashboard &amp; analytics</li>
            <li><span className="auth-feature-icon"><Sparkles size={16} /></span>ML-based attendance prediction</li>
            <li><span className="auth-feature-icon"><ShieldCheck size={16} /></span>HOD permission verification</li>
            <li><span className="auth-feature-icon"><ClipboardCheck size={16} /></span>Instant roll-based check-in</li>
          </ul>
        </div>
        <div className="auth-panel-footer">Campus Event Attendance Prediction System</div>
      </div>

      <div className="auth-form-area">
        <div className="auth-card">
          <div className="auth-card-logo"><GraduationCap size={26} strokeWidth={2.2} /></div>
          <h1 className="auth-card-heading">Welcome Back</h1>
          <p className="auth-card-sub">Sign in to continue to Campus Attendance</p>

          {error && (
            <div className="auth-notice auth-notice-error" role="alert">
              <X size={15} /><span>{error}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} id="login-form">
            <div className="auth-field">
              <label htmlFor="login-email">Email Address</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><Mail size={16} /></span>
                <input
                  id="login-email"
                  type="email"
                  placeholder="you@college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="login-password">Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><LockKeyhole size={16} /></span>
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-submit" disabled={loading} id="login-submit">
              {loading ? <LoaderCircle size={18} className="spin" /> : <LogIn size={18} />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="auth-switch">
            Don't have an account?{' '}
            <button type="button" onClick={onSwitch} id="switch-to-register">Create account</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================
// RegisterPage
// =============================================
function RegisterPage({ onSuccess, onSwitch }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState('staff')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!fullName.trim()) { setError('Full name is required.'); return }
    if (!email.trim() || !email.includes('@')) { setError('A valid email is required.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await api.register({ full_name: fullName.trim(), email: email.trim(), password, role })
      setSuccess('Account created successfully.')
      setTimeout(() => {
        onSwitch()
      }, 900)
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-panel-brand">
          <div className="auth-panel-mark"><GraduationCap size={24} strokeWidth={2.2} /></div>
          <div className="auth-panel-brand-copy">
            <strong>Campus</strong>
            <small>ATTENDANCE OPS</small>
          </div>
        </div>
        <div className="auth-panel-hero">
          <h2>Join the Campus<br />Operations Team.</h2>
          <p>Create your account to manage attendance, events, and HOD permissions in one place.</p>
          <ul className="auth-feature-list">
            <li><span className="auth-feature-icon"><Users size={16} /></span>Student roster management</li>
            <li><span className="auth-feature-icon"><CalendarDays size={16} /></span>Event creation &amp; scheduling</li>
            <li><span className="auth-feature-icon"><FileBarChart2 size={16} /></span>Historical reports &amp; export</li>
            <li><span className="auth-feature-icon"><BarChart3 size={16} /></span>Departmental analytics</li>
          </ul>
        </div>
        <div className="auth-panel-footer">Campus Event Attendance Prediction System</div>
      </div>

      <div className="auth-form-area">
        <div className="auth-card">
          <div className="auth-card-logo"><UserPlus size={24} strokeWidth={2.2} /></div>
          <h1 className="auth-card-heading">Create Account</h1>
          <p className="auth-card-sub">Set up your campus attendance account</p>

          {error && (
            <div className="auth-notice auth-notice-error" role="alert">
              <X size={15} /><span>{error}</span>
            </div>
          )}
          {success && (
            <div className="auth-notice auth-notice-success" role="status">
              <CheckCircle2 size={15} /><span>{success}</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} id="register-form">
            <div className="auth-field">
              <label htmlFor="reg-name">Full Name</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><User size={16} /></span>
                <input
                  id="reg-name"
                  type="text"
                  placeholder="Dr. Priya Sharma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reg-email">Email Address</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><Mail size={16} /></span>
                <input
                  id="reg-email"
                  type="email"
                  placeholder="you@college.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reg-role">Role</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><ShieldCheck size={16} /></span>
                <select id="reg-role" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="staff">Staff</option>
                  <option value="hod">Head of Department (HOD)</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reg-password">Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><LockKeyhole size={16} /></span>
                <input
                  id="reg-password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="reg-confirm">Confirm Password</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon"><LockKeyhole size={16} /></span>
                <input
                  id="reg-confirm"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <button type="submit" className="auth-submit" disabled={loading} id="register-submit">
              {loading ? <LoaderCircle size={18} className="spin" /> : <UserPlus size={18} />}
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="auth-switch">
            Already have an account?{' '}
            <button type="button" onClick={onSwitch} id="switch-to-login">Sign in</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
