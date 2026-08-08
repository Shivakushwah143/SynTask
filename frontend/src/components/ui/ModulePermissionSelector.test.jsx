import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import ModulePermissionSelector from './ModulePermissionSelector'
import { getRoleModuleDefaults } from '../../config/modulePermissions'

const Harness = ({ role, initial }) => {
  const [value, setValue] = useState(initial || getRoleModuleDefaults(role))
  return <ModulePermissionSelector value={value} onChange={setValue} role={role} />
}

describe('ModulePermissionSelector', () => {
  test('renders the Permissions section with the catalog', () => {
    render(<Harness role="employee" />)
    expect(screen.getByText('Permissions')).toBeInTheDocument()
    expect(screen.getAllByText(/Tasks & Projects/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Sales & CRM/).length).toBeGreaterThan(0)
  })

  test('Use Role Defaults restores the role baseline', () => {
    render(<Harness role="employee" initial={[]} />)
    fireEvent.click(screen.getByText('Use Role Defaults'))
    const tasks = screen.getByLabelText(/Tasks & Projects/)
    expect(tasks.checked).toBe(true)
  })

  test('Clear unchecks non-locked modules for employee-level roles', () => {
    render(<Harness role="employee" />)
    const sales = screen.getByLabelText(/Sales & CRM/)
    const reports = screen.getByLabelText(/Reports/)
    // Sales & CRM is role-implied -> locked on; Reports is free.
    expect(sales.checked).toBe(true)
    expect(sales.disabled).toBe(true)
    fireEvent.click(screen.getByText('Clear'))
    expect(sales.checked).toBe(true) // locked stays
    expect(reports.checked).toBe(false)
  })

  test('admin role can toggle every module freely', () => {
    render(<Harness role="admin" />)
    const sales = screen.getByLabelText(/Sales & CRM/)
    expect(sales.disabled).toBe(false)
    fireEvent.click(screen.getByText('Clear'))
    expect(sales.checked).toBe(false)
  })
})
