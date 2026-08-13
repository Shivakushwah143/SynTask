import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import ModulePermissionSelector from './ModulePermissionSelector'
import { getRoleModuleDefaults } from '../../config/modulePermissions'

const Harness = ({ role, initial }) => {
  const [value, setValue] = useState(initial || getRoleModuleDefaults(role))
  return <ModulePermissionSelector value={value} onChange={setValue} role={role} />
}

const checkboxFor = (text, index = 0) => screen.getAllByText(text)[index].closest('label').querySelector('input')
const checkboxesFor = (text) => screen.getAllByText(text).map((item) => item.closest('label').querySelector('input'))

describe('ModulePermissionSelector', () => {
  test('renders the Permissions section with the catalog', () => {
    render(<Harness role="employee" />)
    expect(screen.getByText('Permissions')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Sales')).toBeInTheDocument()
    expect(screen.getByText('Leads and All Leads')).toBeInTheDocument()
  })

  test('Use Role Defaults restores the role baseline', () => {
    render(<Harness role="employee" initial={[]} />)
    fireEvent.click(screen.getByText('Use Role Defaults'))
    expect(checkboxFor('Projects').checked).toBe(true)
    expect(checkboxFor('Tasks').checked).toBe(true)
  })

  test('employee defaults exclude Sales but Sales section is freely toggleable', () => {
    render(<Harness role="employee" />)
    const sales = checkboxFor('Sales')
    expect(sales.checked).toBe(false) // not in employee defaults
    expect(sales.disabled).toBe(false) // and not locked
    fireEvent.click(sales)
    expect(checkboxFor('Leads and All Leads').checked).toBe(true)
    expect(checkboxFor('Pipeline stages').checked).toBe(true)
  })

  test('Clear unchecks every module', () => {
    render(<Harness role="employee" />)
    fireEvent.click(screen.getByText('Clear'))
    expect(checkboxFor('Projects').checked).toBe(false)
    expect(checkboxesFor('Sales Reports').every((input) => input.checked === false)).toBe(true)
    expect(checkboxFor('Workspace Reports').checked).toBe(true)
    expect(checkboxFor('Home dashboard').checked).toBe(true)
  })

  test('Select All checks every catalog module', () => {
    render(<Harness role="employee" initial={[]} />)
    fireEvent.click(screen.getByText('Select All'))
    expect(checkboxFor('Leads and All Leads').checked).toBe(true)
    expect(checkboxFor('Workspace Reports').checked).toBe(true)
  })

  test('internal option toggles only its own module when it can be separate', () => {
    render(<Harness role="employee" initial={[]} />)
    fireEvent.click(checkboxFor('Content Studio'))
    expect(checkboxFor('Content Studio').checked).toBe(true)
    expect(checkboxFor('AI Assistant').checked).toBe(false)
  })
})
