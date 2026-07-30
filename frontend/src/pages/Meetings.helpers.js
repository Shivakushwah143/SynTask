import { ROLE, getRoleLabel, normalizeRole } from '../utils/roles'

const JUNIOR_ROLES_BY_CREATOR = {
  [ROLE.SUPER_ADMIN]: new Set([ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.LEAD, ROLE.EMPLOYEE]),
  [ROLE.ADMIN]: new Set([ROLE.MANAGER, ROLE.LEAD, ROLE.EMPLOYEE]),
  [ROLE.SUB_ADMIN]: new Set([ROLE.MANAGER, ROLE.LEAD, ROLE.EMPLOYEE]),
  [ROLE.MANAGER]: new Set([ROLE.LEAD, ROLE.EMPLOYEE]),
  [ROLE.LEAD]: new Set([ROLE.EMPLOYEE]),
}

export const getUserId = (user) => String(user?.id || user?._id || '')

export const getUserDisplayName = (user = {}) => {
  const name = String(user.name || '').trim()
  if (name) return name
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  return fullName || user.email || getUserId(user)
}

export const buildMeetingParticipantOptions = (users = [], creator = {}) => {
  const allowedRoles = JUNIOR_ROLES_BY_CREATOR[normalizeRole(creator.role)] || new Set()
  return users
    .filter((user) => {
      const id = getUserId(user)
      return id && id !== getUserId(creator) && allowedRoles.has(normalizeRole(user.role))
    })
    .map((user) => ({
      id: getUserId(user),
      label: getUserDisplayName(user),
      email: user.email || '',
      roleLabel: getRoleLabel(user.role),
    }))
}

export const filterMeetingParticipantOptions = (options = [], search = '') => {
  const query = String(search || '').trim().toLowerCase()
  if (!query) return options
  return options.filter((option) =>
    [option.label, option.roleLabel, option.email].some((value) => String(value || '').toLowerCase().includes(query))
  )
}

export const toggleMeetingParticipantId = (participantIds = [], nextId) => {
  const id = String(nextId || '')
  if (!id) return participantIds
  return participantIds.includes(id)
    ? participantIds.filter((item) => item !== id)
    : [...participantIds, id]
}

export const validateMeetingDuration = (duration) => {
  const value = Number(duration)
  if (!Number.isFinite(value) || value < 1) return 'Duration must be at least 1 minute'
  if (value > 60) return 'Duration must be 60 minutes or less'
  return ''
}
