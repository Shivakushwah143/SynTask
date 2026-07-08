import { useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { CRMWorkspace } from '../components/crm'
import { CRM_NAV_ITEMS, CRM_ROUTE_DESCRIPTIONS, CRM_ROUTE_LABELS } from '../pages/crm/metadata'

const CRMLayout = () => {
  const location = useLocation()
  const [searchValue, setSearchValue] = useState('')

  const routePath = useMemo(() => {
    const pathname = location.pathname.replace(/\/+$/, '') || '/crm/pipeline'
    if (pathname === '/crm') return '/crm/pipeline'
    return pathname
  }, [location.pathname])

  const title = routePath.startsWith('/crm/companies/')
    ? 'Companies'
    : routePath.startsWith('/crm/leads/')
      ? 'Leads'
      : CRM_ROUTE_LABELS[routePath] || 'CRM'
  const description = routePath.startsWith('/crm/companies/')
    ? 'Company workspace for account management and related contacts.'
    : routePath.startsWith('/crm/leads/')
      ? 'Lead workspace for the selected CRM record.'
      : CRM_ROUTE_DESCRIPTIONS[routePath] || 'Workspace foundation for agency relationships.'
  const searchPlaceholder = routePath.startsWith('/crm/companies')
    ? 'Search companies'
    : routePath.startsWith('/crm/contacts')
      ? 'Search contacts'
      : routePath === '/crm/pipeline'
        ? 'Search pipeline leads'
        : 'Search CRM records'

  return (
    <CRMWorkspace
      breadcrumbs={[
        { label: 'CRM', href: '/crm/pipeline' },
        { label: title },
      ]}
      title={title}
      description={description}
      navigation={CRM_NAV_ITEMS}
      activePath={routePath}
      toolbar={{
        searchValue,
        onSearchChange: setSearchValue,
        searchPlaceholder,
        onSearchSubmit: () => undefined,
      }}
    >
      <Outlet context={{ searchValue, setSearchValue }} />
    </CRMWorkspace>
  )
}

export default CRMLayout
