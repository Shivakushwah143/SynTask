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

  test('employee defaults exclude Sales but Sales is freely toggleable', () => {
    render(<Harness role="employee" />)
    const sales = screen.getByLabelText(/Sales & CRM/)
    expect(sales.checked).toBe(false) // not in employee defaults
    expect(sales.disabled).toBe(false) // and not locked
    fireEvent.click(sales)
    expect(screen.getByLabelText(/Sales & CRM/).checked).toBe(true)
  })

  test('Clear unchecks every module', () => {
    render(<Harness role="employee" />)
    fireEvent.click(screen.getByText('Clear'))
    expect(screen.getByLabelText(/Tasks & Projects/).checked).toBe(false)
    expect(screen.getByLabelText(/Reports/).checked).toBe(false)
  })

  test('Select All checks every catalog module', () => {
    render(<Harness role="employee" initial={[]} />)
    fireEvent.click(screen.getByText('Select All'))
    expect(screen.getByLabelText(/Sales & CRM/).checked).toBe(true)
    expect(screen.getByLabelText(/Reports/).checked).toBe(true)
  })
})
