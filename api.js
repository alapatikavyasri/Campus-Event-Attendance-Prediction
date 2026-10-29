export const API_BASE_URL = 'http://127.0.0.1:8000'

async function request(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  let response
  try {
    const token = localStorage.getItem('campus_token')
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Unable to connect to the server. Please make sure the backend is running.')
  }

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    const detail = typeof payload === 'object' && payload !== null
      ? payload.detail || payload.message
      : payload
    throw new Error(detail || `Request failed with status ${response.status}`)
  }

  return payload
}

function queryString(values) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const api = {
  // Auth
  login: (credentials) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),
  register: (data) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  health: () => request('/health'),
  students: (search = '') => request(`/students${queryString({ search })}`),
  events: () => request('/events'),
  createEvent: (event) => request('/events', {
    method: 'POST',
    body: JSON.stringify(event),
  }),
  uploadPermissionLetter: (eventId, file) => {
    const body = new FormData()
    body.append('file', file)
    return request(`/events/${eventId}/permission-letter/upload`, { method: 'POST', body })
  },
  verifyPermissionLetter: (eventId) => request(`/events/${eventId}/permission-letter/verify`, {
    method: 'POST',
  }),
  approvePermissionLetter: (eventId) => request(`/events/${eventId}/permission-letter/approve`, {
    method: 'POST',
  }),
  rejectPermissionLetter: (eventId, reason = '') => request(`/events/${eventId}/permission-letter/reject${queryString({ reason })}`, {
    method: 'POST',
  }),
  permissionStatus: (eventId) => request(`/events/${eventId}/permission-letter`),
  permissionLetter: (eventId) => request(`/events/${eventId}/permission-letter`),
  attendance: (eventId = '') => request(`/attendance${queryString({ event_id: eventId })}`),
  searchStudents: (search) => request(`/students${queryString({ search })}`),
  markAttendance: (record) => request('/attendance/mark', {
    method: 'POST',
    body: JSON.stringify(record),
  }),
  predict: (event) => request('/predict', {
    method: 'POST',
    body: JSON.stringify(event),
  }),
  modelInfo: () => request('/model/info'),
  dashboardStats: () => request('/dashboard/stats'),
  departmentWise: () => request('/dashboard/department-wise'),
  yearWise: () => request('/dashboard/year-wise'),
  eventWise: () => request('/dashboard/event-wise'),
  dateWise: () => request('/dashboard/date-wise'),
  report: (filters) => request(`/reports/attendance${queryString(filters)}`),
}