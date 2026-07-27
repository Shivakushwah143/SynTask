/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { 
  Area, AreaChart, Bar, BarChart, CartesianGrid, 
  ResponsiveContainer, XAxis, YAxis, PieChart, Pie, 
  Cell, Tooltip, Legend, Line, ComposedChart
} from 'recharts'
import { 
  ArrowRight, CalendarDays, Download, Filter, Import, Mail, Merge, 
  Phone, Plus, Search, Sparkles, Target, TrendingUp, Users,
  Zap, Eye, ChevronUp, DollarSign, Layers
} from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { salesApi } from '../../../api/sales'
import { usersAPI } from '../../../api/users'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { ChartCard } from '../../../components/charts/ChartCard'
import { ChartTooltip } from '../../../components/charts/ChartTooltip'
import { Badge, Button, Modal, PhoneInput, Skeleton, inputClassName } from '../../../components/ui'
import BulkImportLeadsModal from '../../../components/BulkImportProspectsModal'
import { useAuthStore } from '../../../store/authStore'
import { isEmployeeRole, normalizeRole } from '../../../utils/roles'
import { buildPipelineBoard, formatCurrency, getLeadContactLabel, getLeadDealValue, getLeadOwnerLabel, getLeadPriority, getLeadStageKey, getLeadTags, normalizeText } from '../pipeline/utils'
import { timeService } from '@/services/timeService'

// Helper functions (keeping existing ones)
const getOptionId = (item) => String(item?.id || item?._id || item?.value || item?.key || '').trim()
const getUserId = (item) => String(item?.id || item?._id || item?.user_id || item?.value || '').trim()
const getStageValue = (stage) => String(stage?.id || stage?._id || stage?.key || stage?.name || '').trim()
const isValidLeadOwner = (item) => ['lead', 'employee'].includes(normalizeRole(item?.role))
const isMongoObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || '').trim())
export const hasSalesCrmModule = (modules = []) => modules.includes('sales_crm') || modules.includes('sales')
const PRODUCT_LOCATION_OPTIONS = [
  { state: 'Andaman and Nicobar Islands', cities: ['Port Blair', 'Diglipur', 'Mayabunder', 'Rangat'] },
  { state: 'Andhra Pradesh', cities: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Tirupati'] },
  { state: 'Arunachal Pradesh', cities: ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang'] },
  { state: 'Assam', cities: ['Guwahati', 'Dibrugarh', 'Silchar', 'Jorhat', 'Tezpur'] },
  { state: 'Bihar', cities: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga'] },
  { state: 'Chandigarh', cities: ['Chandigarh'] },
  { state: 'Chhattisgarh', cities: ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg'] },
  { state: 'Dadra and Nagar Haveli and Daman and Diu', cities: ['Daman', 'Diu', 'Silvassa'] },
  { state: 'Delhi', cities: ['New Delhi', 'Dwarka', 'Rohini', 'Saket', 'Karol Bagh', 'Laxmi Nagar'] },
  { state: 'Goa', cities: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa'] },
  { state: 'Gujarat', cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'] },
  { state: 'Haryana', cities: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Hisar'] },
  { state: 'Himachal Pradesh', cities: ['Shimla', 'Dharamshala', 'Solan', 'Mandi'] },
  { state: 'Jammu and Kashmir', cities: ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla'] },
  { state: 'Jharkhand', cities: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar'] },
  { state: 'Karnataka', cities: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi', 'Kalaburagi'] },
  { state: 'Kerala', cities: ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam'] },
  { state: 'Ladakh', cities: ['Leh', 'Kargil'] },
  { state: 'Lakshadweep', cities: ['Kavaratti', 'Agatti', 'Amini'] },
  { state: 'Madhya Pradesh', cities: ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain'] },
  { state: 'Maharashtra', cities: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad'] },
  { state: 'Manipur', cities: ['Imphal', 'Thoubal', 'Bishnupur', 'Churachandpur'] },
  { state: 'Meghalaya', cities: ['Shillong', 'Tura', 'Jowai', 'Nongpoh'] },
  { state: 'Mizoram', cities: ['Aizawl', 'Lunglei', 'Champhai', 'Serchhip'] },
  { state: 'Nagaland', cities: ['Kohima', 'Dimapur', 'Mokokchung', 'Wokha'] },
  { state: 'Odisha', cities: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Puri', 'Sambalpur'] },
  { state: 'Puducherry', cities: ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'] },
  { state: 'Punjab', cities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Mohali'] },
  { state: 'Rajasthan', cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota'] },
  { state: 'Sikkim', cities: ['Gangtok', 'Namchi', 'Gyalshing', 'Mangan'] },
  { state: 'Tamil Nadu', cities: ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Tiruchirappalli'] },
  { state: 'Telangana', cities: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar'] },
  { state: 'Tripura', cities: ['Agartala', 'Udaipur', 'Dharmanagar', 'Kailashahar'] },
  { state: 'Uttar Pradesh', cities: ['Lucknow', 'Noida', 'Kanpur', 'Ghaziabad', 'Varanasi', 'Agra'] },
  { state: 'Uttarakhand', cities: ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Rishikesh'] },
  { state: 'West Bengal', cities: ['Kolkata', 'Howrah', 'Durgapur', 'Siliguri'] },
]

// Color palette for charts
const COLORS = ['#2563eb', '#38bdf8', '#818cf8', '#6366f1', '#8b5cf6', '#a855f7']

export default function CRMLeadsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const userRole = normalizeRole(user?.role)
  const isEmployee = isEmployeeRole(userRole)
  const currentUserId = user?.id || user?._id || ''
  const userModules = user?.modules || []
  const canCreateCategory = Boolean(user && (userRole === 'admin' || userRole === 'manager' || userRole === 'lead' || userRole === 'super_admin') && hasSalesCrmModule(userModules))
  const [mergeGroup, setMergeGroup] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [createProductOpen, setCreateProductOpen] = useState(false)
  const [showAllLeads, setShowAllLeads] = useState(false)
  const [showAllAccountLeads, setShowAllAccountLeads] = useState(false)
  const [showAllDuplicates, setShowAllDuplicates] = useState(false)
  const [showAllEmployeeLeads, setShowAllEmployeeLeads] = useState(false)
  const [createForm, setCreateForm] = useState({
    first_name: '',
    last_name: '',
    country_code: '+91',
    phone: '',
    email: '',
    company_name: '',
    category_id: '',
    product_ids: '',
    current_stage: '',
    assigned_to: '',
    interest_level: 'medium',
    estimated_close_date: '',
    remark: '',
    tag: '',
  })
  const [categoryForm, setCategoryForm] = useState({ name: '' })
  const [productForm, setProductForm] = useState({ name: '', category_id: '', rate: '', unit: '', state: '', city: '' })
  const [selectedIds, setSelectedIds] = useState([])
  const [leadSearch, setLeadSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')

  useEffect(() => {
    if (searchParams.get('import') !== '1') return
    setImportOpen(true)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('import')
      return next
    }, { replace: true })
  }, [searchParams, setSearchParams])

  const pipelineQuery = useQuery('crm-leads-entry', crmApi.getPipeline, {
    staleTime: 5 * 60 * 1000,
  })
  const leadsQuery = useQuery(
    ['crm-all-leads', userRole],
    () => crmApi.getLeads({ skip: 0, limit: 200 }),
    {
      enabled: !isEmployee,
      staleTime: 60 * 1000,
    }
  )
  const assignedLeadsQuery = useQuery(
    ['crm-assigned-leads', currentUserId],
    () => crmApi.getLeads({ assigned_to: currentUserId, limit: 200, skip: 0 }),
    {
      enabled: isEmployee && Boolean(currentUserId),
      staleTime: 60 * 1000,
    }
  )
  const duplicatesQuery = useQuery('crm-lead-duplicates', () => salesApi.getDuplicateLeads({}), {
    staleTime: 60 * 1000,
    enabled: !isEmployee,
  })
  const categoriesQuery = useQuery('crm-lead-categories', salesApi.getCategories, { staleTime: 5 * 60 * 1000 })
  const stagesQuery = useQuery('crm-lead-stages', salesApi.getStages, { staleTime: 5 * 60 * 1000 })
  const usersQuery = useQuery('crm-lead-users', () => usersAPI.getAssignableUsers(), { staleTime: 5 * 60 * 1000 })
  const productsQuery = useQuery('crm-lead-products', salesApi.getProducts, { staleTime: 5 * 60 * 1000 })

  const board = useMemo(() => buildPipelineBoard(pipelineQuery.data || {}), [pipelineQuery.data])
  const stages = useMemo(() => (Array.isArray(board?.stages) ? board.stages : []), [board])
  const leadCount = useMemo(() => stages.reduce((sum, stage) => sum + (stage.leads?.length || 0), 0), [stages])
  const recentLeads = useMemo(() => stages.flatMap((stage) => stage.leads || []).slice(0, 6), [stages])
  const allAccountLeads = useMemo(() => {
    const items = leadsQuery.data?.prospects || leadsQuery.data?.items || leadsQuery.data?.data?.prospects || leadsQuery.data?.data?.items || []
    return Array.isArray(items) ? items : []
  }, [leadsQuery.data])
  const duplicateGroups = useMemo(() => duplicatesQuery.data?.groups || duplicatesQuery.data?.data?.groups || [], [duplicatesQuery.data])
  const allLeads = useMemo(() => stages.flatMap((stage) => stage.leads || []), [stages])
  const stageOptions = useMemo(() => stages.filter((stage) => (stage.leads || []).length).map((stage) => ({ value: stage.key, label: stage.name })), [stages])
  const totalPipelineValue = useMemo(() => allLeads.reduce((sum, lead) => sum + getLeadDealValue(lead), 0), [allLeads])
  const leadAnalytics = useMemo(() => buildLeadDashboardAnalytics(allLeads, stages, timeService.now(), pipelineQuery.data?.meta?.currency || 'INR'), [allLeads, pipelineQuery.data?.meta?.currency, stages])
  
  const filteredLeads = useMemo(() => {
    const query = normalizeText(leadSearch)
    const stage = normalizeText(stageFilter)
    const priority = normalizeText(priorityFilter)
    return allLeads.filter((lead) => {
      const searchable = [
        lead.company_name,
        lead.prospect_name,
        lead.email,
        lead.phone,
        getLeadContactLabel(lead),
        getLeadOwnerLabel(lead),
        getLeadTags(lead).join(' '),
      ].filter(Boolean).map(normalizeText).join(' ')
      if (query && !searchable.includes(query)) return false
      if (stage && getLeadStageKey(lead) !== stage) return false
      if (priority && getLeadPriority(lead) !== priority) return false
      return true
    })
  }, [allLeads, leadSearch, priorityFilter, stageFilter])
  
  const selectedLeads = useMemo(() => allLeads.filter((lead) => selectedIds.includes(lead.id || lead._id)), [allLeads, selectedIds])
  const employeeLeads = useMemo(() => {
    const items = assignedLeadsQuery.data?.data?.prospects
      || assignedLeadsQuery.data?.prospects
      || assignedLeadsQuery.data?.data?.items
      || assignedLeadsQuery.data?.items
      || []
    return Array.isArray(items) ? items : []
  }, [assignedLeadsQuery.data])
  
  const assignableUsers = useMemo(() => {
    const data = usersQuery.data
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.users)) return data.users
    if (Array.isArray(data?.items)) return data.items
    return []
  }, [usersQuery.data])
  
  const categories = useMemo(() => getSalesCollection(categoriesQuery.data, 'categories'), [categoriesQuery.data])
  const products = useMemo(() => getSalesCollection(productsQuery.data, 'products'), [productsQuery.data])
  const leadOwnerOptions = useMemo(() => assignableUsers.filter(isValidLeadOwner), [assignableUsers])
  
  const userNameById = useMemo(() => {
    const map = new Map()
    assignableUsers.forEach((item) => {
      const id = String(item.id || item._id || '')
      const name = [item.first_name, item.last_name].filter(Boolean).join(' ').trim() || item.email
      if (id && name) map.set(id, name)
    })
    return map
  }, [assignableUsers])
  
  const defaultStageId = getStageValue(stages[0])
  const defaultCategoryId = getOptionId(categories[0])
  const defaultProductIds = getOptionId(products[0])
  const defaultOwnerId = getUserId(leadOwnerOptions[0]) || (isValidLeadOwner(user) ? currentUserId : '')

  useEffect(() => {
    if (!createOpen) return
    setCreateForm((state) => ({
      ...state,
      category_id: state.category_id || defaultCategoryId,
      product_ids: state.product_ids || defaultProductIds,
      current_stage: state.current_stage || defaultStageId,
      assigned_to: state.assigned_to || defaultOwnerId,
    }))
  }, [createOpen, defaultCategoryId, defaultOwnerId, defaultProductIds, defaultStageId])

  // All mutations remain the same
  const mergeMutation = useMutation((payload) => crmApi.mergeProspects(payload), {
    onSuccess: () => {
      toast.success('Leads merged')
      queryClient.invalidateQueries('crm-leads-entry')
      queryClient.invalidateQueries('crm-lead-duplicates')
      queryClient.invalidateQueries('crm-pipeline-board')
      setMergeGroup(null)
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || 'Unable to merge leads')
    },
  })

  const createLeadMutation = useMutation(
    (payload) => salesApi.createLead(payload),
    {
      onSuccess: () => {
        toast.success('Lead created')
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('crm-pipeline-board')
        queryClient.invalidateQueries('crm-lead-duplicates')
        queryClient.invalidateQueries('sales-prospects')
        setCreateOpen(false)
        setCreateForm({
          first_name: '',
          last_name: '',
          country_code: '+91',
          phone: '',
          email: '',
          company_name: '',
          category_id: defaultCategoryId,
          product_ids: defaultProductIds,
          current_stage: defaultStageId,
          assigned_to: '',
          interest_level: 'medium',
          estimated_close_date: '',
          remark: '',
          tag: '',
        })
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Unable to create lead')
      },
    }
  )

  const createCategoryMutation = useMutation(
    (payload) => salesApi.createCategory(payload),
    {
      onSuccess: (response, payload) => {
        const createdCategory = normalizeCreatedSalesOption(response?.data?.category || response?.data || response, payload)
        if (createdCategory) {
          queryClient.setQueryData('crm-lead-categories', (current) => {
            return mergeSalesCollectionItem(current, 'categories', createdCategory)
          })
          setCreateForm((state) => ({ ...state, category_id: getOptionId(createdCategory) || state.category_id }))
          setProductForm((state) => ({ ...state, category_id: getOptionId(createdCategory) || state.category_id }))
        }
        toast.success('Category created')
        queryClient.invalidateQueries('crm-lead-categories', { exact: true })
        queryClient.invalidateQueries('sales-categories', { exact: true })
        setCreateCategoryOpen(false)
        setCategoryForm({ name: '' })
      },
      onError: (error) => {
        if (error?.response?.status === 403) {
          toast.error(error?.response?.data?.detail || 'You do not have permission to create categories')
        } else if (error?.response?.status === 400) {
          toast.error(error?.response?.data?.detail || 'Category already exists or invalid input')
        } else {
          toast.error(error?.response?.data?.detail || 'Unable to create category')
        }
      },
    }
  )

  const createProductMutation = useMutation(
    (payload) => salesApi.createProduct(payload),
    {
      onSuccess: (response, payload) => {
        const createdProduct = normalizeCreatedProduct(response?.data, payload)
        if (createdProduct) {
          queryClient.setQueryData('crm-lead-products', (current) => {
            return mergeSalesCollectionItem(current, 'products', createdProduct)
          })
          setCreateForm((state) => ({ ...state, product_ids: getOptionId(createdProduct) || state.product_ids }))
        }
        toast.success('Product created')
        queryClient.invalidateQueries('crm-lead-products', { exact: true })
        queryClient.invalidateQueries('sales-products', { exact: true })
        setCreateProductOpen(false)
        setProductForm({ name: '', category_id: '', rate: '', unit: '', state: '', city: '' })
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Unable to create product')
      },
    }
  )

  const exportLeads = () => {
    if (!allLeads.length) {
      toast.error('No leads available to export')
      return
    }

    const headers = ['prospect_name', 'first_name', 'last_name', 'email', 'phone', 'country_code', 'company_name', 'current_stage', 'status', 'owner_name', 'tag', 'estimated_close_date']
    const escapeValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const rows = [
      headers.join(','),
      ...allLeads.map((lead) => headers.map((key) => {
        const value = Array.isArray(lead[key]) ? lead[key].join('|') : lead[key]
        return escapeValue(value)
      }).join(',')),
    ]

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `crm-leads-${timeService.toUtcISOString(timeService.now()).slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success('Leads exported')
  }

  const bulkMutation = useMutation(async (payload) => {
    const updates = payload.lead_ids.map((leadId) => salesApi.updateLeadForm(leadId, payload.fields))
    return Promise.all(updates)
  }, {
    onSuccess: () => {
      toast.success('Leads updated')
      queryClient.invalidateQueries('crm-leads-entry')
      queryClient.invalidateQueries('crm-lead-duplicates')
      queryClient.invalidateQueries('crm-pipeline-board')
      setBulkOpen(false)
      setSelectedIds([])
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || 'Bulk update failed')
    },
  })

  const employeeStatusMutation = useMutation(
    ({ leadId, customFields }) => salesApi.updateLeadForm(leadId, { custom_fields: JSON.stringify(customFields) }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['crm-assigned-leads', currentUserId])
        queryClient.invalidateQueries('crm-pipeline-board')
        queryClient.invalidateQueries('crm-leads-entry')
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Could not update lead status')
      },
    }
  )

  const getEmployeeLeadFlags = (lead) => {
    const custom = (() => {
      if (typeof lead?.custom_fields === 'string') {
        try { return JSON.parse(lead.custom_fields) || {} } catch { return {} }
      }
      return lead?.custom_fields || {}
    })()
    return {
      custom,
      meetingScheduled: Boolean(custom.meeting_scheduled),
      deadEnd: Boolean(custom.dead_end),
    }
  }

  // Helper function to render view more button
  const ViewMoreButton = ({ show, setShow, total, label = 'leads' }) => {
    if (total <= 6) return null
    return (
      <button
        onClick={() => setShow(!show)}
        className="mt-4 flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors dark:text-primary-400 dark:hover:text-primary-300"
      >
        {show ? (
          <>
            <ChevronUp className="h-4 w-4" />
            Show less
          </>
        ) : (
          <>
            <Eye className="h-4 w-4" />
            View all {total} {label}
          </>
        )}
      </button>
    )
  }

  return (
    <CRMPage>
      {/* Header */}
      <div className="mb-6">
        <CRMPageTitle
          eyebrow="CRM"
          title="Leads Dashboard"
          description={isEmployee ? 'Review assigned leads and update status.' : 'Comprehensive view of all leads, analytics, and pipeline status.'}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              {!isEmployee && (
                <>
                  <Button variant="secondary" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Add Lead
                  </Button>
                  <Button variant="secondary" onClick={() => setImportOpen(true)}>
                    <Import className="h-4 w-4" />
                    Import
                  </Button>
                  <Button variant="secondary" onClick={exportLeads}>
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                  <Button variant="secondary" onClick={() => setBulkOpen(true)} disabled={!selectedIds.length}>
                    Bulk edit
                  </Button>
                </>
              )}
              <Button variant="primary" onClick={() => navigate('/crm/pipeline')}>
                Pipeline
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        />
      </div>

      <section className="mb-6 overflow-hidden rounded-[28px] border border-primary-200/70 bg-gradient-to-br from-white via-primary-50/50 to-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] dark:border-[#5a4635] dark:from-[#241c14] dark:via-[#17120e] dark:to-[#1d1711]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600 dark:text-primary-300">Pipeline snapshot</p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">A quick view of your current lead momentum</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge label={`${leadCount} active records`} colorKey="draft" />
            <Badge label={`${filteredLeads.length} visible`} colorKey="scheduled" />
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CRMStatCard
            icon={Users}
            label="Total Leads"
            value={leadCount}
            helper="Live records across the pipeline"
            tone="blue"
          />
          <CRMStatCard
            icon={DollarSign}
            label="Pipeline Value"
            value={formatCurrency(totalPipelineValue, pipelineQuery.data?.meta?.currency || 'INR')}
            helper="Current opportunity value"
            tone="emerald"
          />
          <CRMStatCard
            icon={Layers}
            label="Active Stages"
            value={stages.length}
            helper="Stages currently in motion"
            tone="slate"
          />
          <CRMStatCard
            icon={Zap}
            label="Hot Leads"
            value={allLeads.filter((lead) => ['critical', 'high', 'hot'].includes(normalizeText(getLeadPriority(lead)))).length}
            helper="High-intent prospects"
            tone="amber"
          />
        </div>
      </section>

      {/* Analytics Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* Lead Trend Chart */}
        <ChartCard
          title="Lead Trends"
          period="Last 6 Months"
          right={<Badge label={`${allLeads.length} total`} colorKey="draft" />}
          className="overflow-hidden"
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={leadAnalytics.monthlyTrend} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.16} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Bar yAxisId="left" dataKey="count" name="Leads" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="value" name="Value (INR)" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Stage Distribution Pie Chart */}
        <ChartCard
          title="Stage Distribution"
          period="Current pipeline"
          right={<Badge label={`${stages.length} stages`} colorKey="draft" />}
          className="overflow-hidden"
        >
          <div className="h-72 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={leadAnalytics.stageStack}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey={(entry) => entry.hot + entry.warm + entry.cold}
                  nameKey="name"
                >
                  {leadAnalytics.stageStack.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Additional Analytics - Priority & Value Distribution */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <ChartCard
          title="Priority Distribution"
          period="By lead priority"
          className="overflow-hidden"
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leadAnalytics.priorityDistribution || getPriorityDistribution(allLeads)} layout="vertical" margin={{ top: 10, right: 20, left: 80, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.16} horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Leads" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Lead Velocity"
          period="Monthly growth"
          right={<Badge label={`${leadAnalytics.monthlyTrend.length} months`} colorKey="draft" />}
          className="overflow-hidden"
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={leadAnalytics.monthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="velocityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.16} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="count" name="New Leads" stroke="#8b5cf6" strokeWidth={3} fill="url(#velocityGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Lead Workspace - Search and Filter */}
      {!isEmployee && (
        <CRMSection
          title="Lead Workspace"
          description="Search, filter, and manage all leads"
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Badge label={`${filteredLeads.length} visible`} colorKey="draft" />
              <Badge label={`${selectedIds.length} selected`} colorKey="scheduled" />
            </div>
          )}
        >
          {/* Search & Filter Bar */}
          <div className="mb-4 rounded-[24px] border border-primary-200/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-[#5a4635] dark:bg-black/60">
            <div className="grid gap-3 lg:grid-cols-[1fr,160px,160px,auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  className="input min-h-10 pl-10 w-full"
                  value={leadSearch}
                  onChange={(event) => setLeadSearch(event.target.value)}
                  placeholder="Search leads, contacts, owner..."
                />
              </div>
              <select className="input min-h-10" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
                <option value="">All stages</option>
                {stageOptions.map((stage) => (
                  <option key={stage.value} value={stage.value}>{stage.label}</option>
                ))}
              </select>
              <select className="input min-h-10" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                <option value="">All priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="hot">Hot</option>
                <option value="medium">Medium</option>
                <option value="warm">Warm</option>
                <option value="low">Low</option>
                <option value="cold">Cold</option>
              </select>
              <Button
                variant="secondary"
                onClick={() => {
                  setLeadSearch('')
                  setStageFilter('')
                  setPriorityFilter('')
                }}
              >
                <Filter className="h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>

          {/* Leads Table */}
          {pipelineQuery.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : pipelineQuery.isError ? (
            <CRMEmptyState
              icon={Filter}
              title="Unable to load leads"
              description={pipelineQuery.error?.response?.data?.detail || 'Try again from the pipeline screen.'}
              action={<Button variant="secondary" onClick={() => pipelineQuery.refetch()}>Retry</Button>}
            />
          ) : filteredLeads.length ? (
            <>
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm dark:bg-black/80">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-surface-muted">
                      <tr>
                        <th className="w-10 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={filteredLeads.length > 0 && filteredLeads.every((lead) => selectedIds.includes(lead.id || lead._id))}
                            onChange={(event) => {
                              const ids = filteredLeads.map((lead) => lead.id || lead._id).filter(Boolean)
                              setSelectedIds((current) => event.target.checked ? Array.from(new Set([...current, ...ids])) : current.filter((id) => !ids.includes(id)))
                            }}
                            aria-label="Select visible leads"
                            className="rounded border-border"
                          />
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-text-primary">Lead</th>
                        <th className="px-4 py-3 text-left font-semibold text-text-primary">Owner</th>
                        <th className="px-4 py-3 text-left font-semibold text-text-primary">Stage</th>
                        <th className="px-4 py-3 text-left font-semibold text-text-primary">Priority</th>
                        <th className="px-4 py-3 text-left font-semibold text-text-primary">Value</th>
                        <th className="px-4 py-3 text-left font-semibold text-text-primary">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredLeads.slice(0, showAllLeads ? undefined : 10).map((lead) => {
                        const leadId = lead.id || lead._id
                        const custom = parseLeadCustomFields(lead)
                        const meetingScheduled = Boolean(custom.meeting_scheduled)
                        const deadEnd = Boolean(custom.dead_end)
                        const priority = getLeadPriority(lead)
                        return (
                          <tr key={leadId} className="hover:bg-surface-muted transition-colors cursor-pointer" onClick={() => navigate(`/crm/leads/${leadId}`)}>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(leadId)}
                                onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, leadId] : current.filter((value) => value !== leadId))}
                                aria-label={`Select ${lead.company_name || lead.prospect_name || leadId}`}
                                className="rounded border-border"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-text-primary">{lead.company_name || lead.prospect_name || 'Lead'}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                                {lead.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span>}
                                {lead.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-text-primary">{getOwnerName(lead, userNameById)}</td>
                            <td className="px-4 py-3"><Badge label={lead.current_stage || lead.stage || 'Unstaged'} colorKey="draft" /></td>
                            <td className="px-4 py-3"><PriorityPill priority={priority} /></td>
                            <td className="px-4 py-3 font-semibold text-text-primary">{formatCurrency(getLeadDealValue(lead), pipelineQuery.data?.meta?.currency || 'INR')}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <Badge 
                                  label={meetingScheduled ? 'Meeting' : 'No Meeting'} 
                                  colorKey={meetingScheduled ? 'scheduled' : 'draft'} 
                                />
                                {deadEnd && <Badge label="Dead End" colorKey="danger" />}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <ViewMoreButton 
                show={showAllLeads} 
                setShow={setShowAllLeads} 
                total={filteredLeads.length} 
                label="leads" 
              />
            </>
          ) : (
            <CRMEmptyState
              icon={Users}
              title="No leads found"
              description={allLeads.length ? 'Clear filters to see all pipeline leads.' : 'Leads will appear here once the pipeline has records.'}
              action={allLeads.length ? <Button variant="secondary" onClick={() => { setLeadSearch(''); setStageFilter(''); setPriorityFilter('') }}>Clear filters</Button> : <Button variant="secondary" onClick={() => navigate('/crm/pipeline')}>Pipeline</Button>}
            />
          )}
        </CRMSection>
      )}

      {/* Employee Assigned Leads */}
      {isEmployee && (
        <CRMSection
          title="My Assigned Leads"
          description="Leads assigned to you for follow-up"
          actions={<Badge label={`${employeeLeads.length} assigned`} colorKey="draft" />}
        >
          {assignedLeadsQuery.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 w-full rounded-xl" />)}
            </div>
          ) : assignedLeadsQuery.isError ? (
            <CRMEmptyState
              icon={Users}
              title="Unable to load your leads"
              description={assignedLeadsQuery.error?.response?.data?.detail || 'Try again after reloading.'}
              action={<Button variant="secondary" onClick={() => assignedLeadsQuery.refetch()}>Retry</Button>}
            />
          ) : employeeLeads.length ? (
            <>
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm dark:bg-black/80">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-surface-muted">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-text-primary">Lead</th>
                        <th className="px-4 py-3 text-left font-semibold text-text-primary">Company</th>
                        <th className="px-4 py-3 text-left font-semibold text-text-primary">Stage</th>
                        <th className="px-4 py-3 text-left font-semibold text-text-primary">Meeting</th>
                        <th className="px-4 py-3 text-left font-semibold text-text-primary">Dead End</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {employeeLeads.slice(0, showAllEmployeeLeads ? undefined : 6).map((lead) => {
                        const leadId = lead.id || lead._id
                        const custom = (() => {
                          if (typeof lead.custom_fields === 'string') {
                            try { return JSON.parse(lead.custom_fields) || {} } catch { return {} }
                          }
                          return lead.custom_fields || {}
                        })()
                        const meetingScheduled = Boolean(custom.meeting_scheduled)
                        const deadEnd = Boolean(custom.dead_end)
                        return (
                          <tr
                            key={leadId}
                            className="cursor-pointer hover:bg-surface-muted transition-colors"
                            onClick={() => navigate(`/crm/leads/${leadId}`)}
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-text-primary">{lead.prospect_name || 'Lead'}</div>
                              <p className="text-xs text-text-muted">{lead.email || lead.phone || '-'}</p>
                            </td>
                            <td className="px-4 py-3 text-text-primary">{lead.company_name || '-'}</td>
                            <td className="px-4 py-3"><Badge label={lead.current_stage || lead.stage || 'Unknown'} colorKey="draft" /></td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  employeeStatusMutation.mutate({ leadId, customFields: { ...custom, meeting_scheduled: !meetingScheduled, dead_end: deadEnd } })
                                }}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${meetingScheduled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200'}`}
                              >
                                {meetingScheduled ? 'Scheduled' : 'Not scheduled'}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  employeeStatusMutation.mutate({ leadId, customFields: { ...custom, dead_end: !deadEnd, meeting_scheduled: meetingScheduled } })
                                }}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${deadEnd ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200'}`}
                              >
                                {deadEnd ? 'Dead end' : 'Open'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <ViewMoreButton 
                show={showAllEmployeeLeads} 
                setShow={setShowAllEmployeeLeads} 
                total={employeeLeads.length} 
                label="assigned leads" 
              />
            </>
          ) : (
            <CRMEmptyState icon={Users} title="No assigned leads" description="Leads assigned to you will appear here automatically." />
          )}
        </CRMSection>
      )}

      {/* Duplicates Section */}
      <CRMSection
        title="Duplicate Management"
        description="Review and merge duplicate leads"
        actions={<Badge label={`${duplicateGroups.length} groups`} colorKey="draft" />}
      >
        {duplicatesQuery.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-28 w-full rounded-xl" />)}
          </div>
        ) : duplicatesQuery.isError ? (
          <CRMEmptyState
            icon={Merge}
            title="Unable to load duplicates"
            description={duplicatesQuery.error?.response?.data?.detail || 'Try again to review duplicate leads.'}
            action={<Button variant="secondary" onClick={() => duplicatesQuery.refetch()}>Retry</Button>}
          />
        ) : duplicateGroups.length ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {duplicateGroups.slice(0, showAllDuplicates ? undefined : 4).map((group) => (
                <article key={group.match_key} className="rounded-xl border border-border bg-surface p-4 shadow-sm hover:shadow-md transition-shadow dark:bg-black/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text-primary truncate">{group.match_key}</p>
                      <p className="mt-1 text-xs text-text-muted">{group.leads.length} matching leads</p>
                    </div>
                    <Button type="button" variant="primary" size="sm" onClick={() => setMergeGroup(group)}>
                      Merge
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {group.leads.slice(0, 3).map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        className="rounded-lg border border-border bg-surface-muted p-2 text-left text-sm transition hover:bg-surface-hover dark:bg-black/40"
                        onClick={() => navigate(`/crm/leads/${lead.id}`)}
                      >
                        <p className="font-medium text-text-primary">{lead.prospect_name || 'Lead'}</p>
                        <p className="text-xs text-text-muted">{lead.email || lead.phone || 'No identity'}</p>
                      </button>
                    ))}
                    {group.leads.length > 3 && (
                      <p className="text-xs text-text-muted text-center">+{group.leads.length - 3} more</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <ViewMoreButton 
              show={showAllDuplicates} 
              setShow={setShowAllDuplicates} 
              total={duplicateGroups.length} 
              label="duplicate groups" 
            />
          </>
        ) : (
          <CRMEmptyState icon={Merge} title="No duplicates found" description="All leads appear to be unique." />
        )}
      </CRMSection>

      {/* All Account Leads */}
      <CRMSection
        title={isEmployee ? 'Recent Pipeline Leads' : 'All Account Leads'}
        description={isEmployee ? 'Recently visible leads from the pipeline.' : 'Complete list of all leads in the account.'}
        actions={<Badge label={`${isEmployee ? recentLeads.length : allAccountLeads.length} leads`} colorKey="draft" />}
      >
        {!isEmployee && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="secondary" onClick={() => leadsQuery.refetch()}>
              Refresh
            </Button>
          </div>
        )}
        
        {((!isEmployee && leadsQuery.isLoading) || (isEmployee && pipelineQuery.isLoading)) ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : ((!isEmployee && leadsQuery.isError) || (isEmployee && pipelineQuery.isError)) ? (
          <CRMEmptyState
            icon={Filter}
            title="Unable to load leads"
            description={(isEmployee ? pipelineQuery.error?.response?.data?.detail : leadsQuery.error?.response?.data?.detail) || 'Try again from the pipeline screen.'}
            action={<Button variant="secondary" onClick={() => (isEmployee ? pipelineQuery.refetch() : leadsQuery.refetch())}>Retry</Button>}
          />
        ) : !isEmployee ? (
          allAccountLeads.length ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {allAccountLeads.slice(0, showAllAccountLeads ? undefined : 6).map((lead) => {
                  const leadId = lead.id || lead._id
                  const { meetingScheduled, deadEnd } = getEmployeeLeadFlags(lead)
                  return (
                    <div
                      key={leadId}
                      className="rounded-xl border border-border bg-surface p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer dark:bg-black/60"
                      onClick={() => navigate(`/crm/leads/${leadId}`)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-text-primary truncate">{lead.company_name || lead.prospect_name || 'Lead'}</p>
                          <p className="text-xs text-text-muted mt-1">{lead.email || lead.phone || '-'}</p>
                        </div>
                        <Badge label={lead.current_stage || lead.stage || 'Unknown'} colorKey="draft" />
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs text-text-muted">Owner: {getOwnerName(lead, userNameById)}</span>
                        <div className="flex gap-1">
                          <Badge label={meetingScheduled ? 'Meeting' : 'No Meeting'} colorKey={meetingScheduled ? 'scheduled' : 'draft'} size="sm" />
                          {deadEnd && <Badge label="Dead" colorKey="danger" size="sm" />}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <ViewMoreButton 
                show={showAllAccountLeads} 
                setShow={setShowAllAccountLeads} 
                total={allAccountLeads.length} 
                label="account leads" 
              />
            </>
          ) : (
            <CRMEmptyState icon={Users} title="No leads yet" description="Leads will appear here once the account has records." action={<Button variant="secondary" onClick={() => navigate('/crm/pipeline')}>Open Pipeline</Button>} />
          )
        ) : recentLeads.length ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recentLeads.slice(0, 6).map((lead) => (
                <div
                  key={lead.id || lead._id}
                  className="rounded-xl border border-border bg-surface p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer dark:bg-black/60"
                  onClick={() => navigate(`/crm/leads/${lead.id || lead._id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-text-primary truncate">{lead.company_name || lead.prospect_name || 'Lead'}</p>
                      <p className="text-xs text-text-muted mt-1">{getOwnerName(lead, userNameById)}</p>
                    </div>
                    <Badge label={lead.current_stage || lead.stage || 'Unknown'} colorKey="draft" />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <CRMEmptyState
            icon={Users}
            title="No leads yet"
            description="Leads will appear here once the pipeline has records."
            action={<Button variant="secondary" onClick={() => navigate('/crm/pipeline')}>Open Pipeline</Button>}
          />
        )}
      </CRMSection>

      {/* All Modals remain the same */}
      <MergeModal
        group={mergeGroup}
        isOpen={Boolean(mergeGroup)}
        onClose={() => setMergeGroup(null)}
        onConfirm={(payload) => mergeMutation.mutate(payload)}
        loading={mergeMutation.isLoading}
      />

      <BulkImportLeadsModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => {
          setImportOpen(false)
          queryClient.invalidateQueries('crm-leads-entry')
          queryClient.invalidateQueries('crm-lead-duplicates')
          queryClient.invalidateQueries('crm-pipeline-board')
        }}
        categories={categories}
        stages={stagesQuery.data?.stages || []}
        users={assignableUsers}
        products={products}
      />

      <BulkUpdateModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        leadCount={selectedLeads.length}
        onSubmit={(fields) => bulkMutation.mutate({ lead_ids: selectedIds, fields })}
        loading={bulkMutation.isLoading}
        stages={stagesQuery.data?.stages || []}
        users={assignableUsers}
      />

      {/* Create Lead Modal */}
      {!isEmployee && (
        <Modal
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Add New Lead"
          size="lg"
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              const payload = {
                first_name: createForm.first_name.trim(),
                last_name: createForm.last_name.trim(),
                country_code: createForm.country_code.trim() || '+91',
                phone: createForm.phone.trim(),
                email: createForm.email.trim(),
                company_name: createForm.company_name.trim(),
                category_id: createForm.category_id || undefined,
                product_ids: createForm.product_ids || undefined,
                current_stage: createForm.current_stage || undefined,
                assigned_to: createForm.assigned_to || defaultOwnerId || undefined,
                interest_level: createForm.interest_level || 'medium',
                estimated_close_date: createForm.estimated_close_date || undefined,
                remark: createForm.remark.trim(),
                tag: createForm.tag.trim(),
              }

              if (!payload.first_name || !payload.last_name || !payload.phone) {
                toast.error('First name, last name, and phone are required')
                return
              }
              if (!/^\+\d{1,4}$/.test(String(payload.country_code || '')) || !/^\d{10}$/.test(payload.phone)) {
                toast.error('Use a + country code and exactly 10 phone digits')
                return
              }
              if (!payload.assigned_to) {
                toast.error('No valid owner found for this company')
                return
              }
              createLeadMutation.mutate(payload)
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-text-muted">First name *</span>
                <input className={inputClassName} placeholder="First name" value={createForm.first_name} onChange={(e) => setCreateForm((state) => ({ ...state, first_name: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-text-muted">Last name *</span>
                <input className={inputClassName} placeholder="Last name" value={createForm.last_name} onChange={(e) => setCreateForm((state) => ({ ...state, last_name: e.target.value }))} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-text-muted">Phone *</span>
                <PhoneInput
                  countryCode={createForm.country_code}
                  phoneNumber={createForm.phone}
                  onCountryCodeChange={(value) => setCreateForm((state) => ({ ...state, country_code: value }))}
                  onPhoneNumberChange={(value) => setCreateForm((state) => ({ ...state, phone: value }))}
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-text-muted">Email</span>
                <input className={inputClassName} placeholder="Email" value={createForm.email} onChange={(e) => setCreateForm((state) => ({ ...state, email: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-text-muted">Company name</span>
                <input className={inputClassName} placeholder="Company name" value={createForm.company_name} onChange={(e) => setCreateForm((state) => ({ ...state, company_name: e.target.value }))} />
              </label>
              <label className="space-y-1">
                  <span className="flex items-center justify-between gap-2 text-xs font-medium text-text-muted">
                  <span>Category</span>
                  <button type="button" className={`text-primary-600 hover:underline ${canCreateCategory ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={() => { if (canCreateCategory) { toast.error('You do not have permission to create categories'); return } setCreateCategoryOpen(true) }} >+ New category</button>
                </span>
                <select className={inputClassName} value={createForm.category_id || defaultCategoryId} onChange={(e) => setCreateForm((state) => ({ ...state, category_id: e.target.value }))}>
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={getOptionId(category)} value={getOptionId(category)}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="flex items-center justify-between gap-2 text-xs font-medium text-text-muted">
                  <span>Product</span>
                  <button type="button" className="text-primary-600 hover:underline" onClick={() => setCreateProductOpen(true)}>+ New product</button>
                </span>
                <select className={inputClassName} value={createForm.product_ids || defaultProductIds} onChange={(e) => setCreateForm((state) => ({ ...state, product_ids: e.target.value }))}>
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={getOptionId(product)} value={getOptionId(product)}>{product.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-text-muted">Stage</span>
                <select className={inputClassName} value={createForm.current_stage || defaultStageId} onChange={(e) => setCreateForm((state) => ({ ...state, current_stage: e.target.value }))}>
                  <option value="">Select stage</option>
                  {stages.map((stage) => (
                    <option key={getStageValue(stage)} value={getStageValue(stage)}>{stage.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-text-muted">Owner</span>
                <select className={inputClassName} value={createForm.assigned_to || defaultOwnerId} onChange={(e) => setCreateForm((state) => ({ ...state, assigned_to: e.target.value }))}>
                  <option value="">Select owner</option>
                  {leadOwnerOptions.map((userOption) => (
                    <option key={getUserId(userOption)} value={getUserId(userOption)}>
                      {userOption.first_name} {userOption.last_name} {userOption.role ? `(${userOption.role})` : ''}
                    </option>
                  ))}
                  {!leadOwnerOptions.length && defaultOwnerId ? (
                    <option value={defaultOwnerId}>{user?.first_name} {user?.last_name} ({user?.role || 'owner'})</option>
                  ) : null}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-text-muted">Interest level</span>
                <select className={inputClassName} value={createForm.interest_level} onChange={(e) => setCreateForm((state) => ({ ...state, interest_level: e.target.value }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-text-muted">Estimated close date</span>
                <input className={inputClassName} type="date" value={createForm.estimated_close_date} onChange={(e) => setCreateForm((state) => ({ ...state, estimated_close_date: e.target.value }))} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-text-muted">Tags</span>
                <input className={inputClassName} placeholder="Tags, pipe-separated" value={createForm.tag} onChange={(e) => setCreateForm((state) => ({ ...state, tag: e.target.value }))} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-text-muted">Remark</span>
                <textarea className={`${inputClassName} min-h-28`} placeholder="Remark" value={createForm.remark} onChange={(e) => setCreateForm((state) => ({ ...state, remark: e.target.value }))} />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" loading={createLeadMutation.isLoading}>Save lead</Button>
            </div>
          </form>
        </Modal>
      )}
      <Modal
        isOpen={createCategoryOpen}
        onClose={() => setCreateCategoryOpen(false)}
        title="Create category"
        description="Add a new lead category and keep the lead form open."
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateCategoryOpen(false)}>Cancel</Button>
            <Button
              type="button"
              loading={createCategoryMutation.isLoading}
              onClick={() => {
                if (!categoryForm.name.trim()) {
                  toast.error('Category name is required')
                  return
                }
                createCategoryMutation.mutate({ name: categoryForm.name.trim() })
              }}
            >
              Save category
            </Button>
          </div>
        )}
      >
        <label className="space-y-1">
          <span className="text-xs font-medium text-text-muted">Category name</span>
          <input className={inputClassName} value={categoryForm.name} onChange={(e) => setCategoryForm({ name: e.target.value })} placeholder="New category name" />
        </label>
      </Modal>
      <Modal
        isOpen={createProductOpen}
        onClose={() => setCreateProductOpen(false)}
        title="Create product"
        description="Add a new product and keep the lead form open."
        size="lg"
        footer={(
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateProductOpen(false)}>Cancel</Button>
            <Button
              type="button"
              loading={createProductMutation.isLoading}
              onClick={() => {
                if (!productForm.name.trim()) {
                  toast.error('Product name is required')
                  return
                }
                if (!productForm.category_id) {
                  toast.error('Category is required')
                  return
                }
                createProductMutation.mutate({
                  name: productForm.name.trim(),
                  category_id: productForm.category_id || undefined,
                  rate: productForm.rate || undefined,
                  unit: productForm.unit.trim(),
                  state: productForm.state.trim(),
                  city: productForm.city.trim(),
                })
              }}
            >
              Save product
            </Button>
          </div>
        )}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-medium text-text-muted">Product name</span>
            <input className={inputClassName} value={productForm.name} onChange={(e) => setProductForm((state) => ({ ...state, name: e.target.value }))} placeholder="New product name" />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="flex items-center justify-between gap-2 text-xs font-medium text-text-muted">
              <span>Category *</span>
              <button type="button" className="text-primary-600 hover:underline" onClick={() => setCreateCategoryOpen(true)}>+ New category</button>
            </span>
            <select className={inputClassName} value={productForm.category_id} onChange={(e) => setProductForm((state) => ({ ...state, category_id: e.target.value }))}>
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={getOptionId(category)} value={getOptionId(category)}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-muted">Rate</span>
            <input className={inputClassName} value={productForm.rate} onChange={(e) => setProductForm((state) => ({ ...state, rate: e.target.value }))} placeholder="0" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-muted">Unit</span>
            <input className={inputClassName} value={productForm.unit} onChange={(e) => setProductForm((state) => ({ ...state, unit: e.target.value }))} placeholder="Each" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-muted">State</span>
            <select className={inputClassName} value={productForm.state} onChange={(e) => setProductForm((state) => ({ ...state, state: e.target.value, city: '' }))}>
              <option value="">Select state</option>
              {PRODUCT_LOCATION_OPTIONS.map((item) => (
                <option key={item.state} value={item.state}>{item.state}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-muted">City</span>
            <select className={inputClassName} value={productForm.city} onChange={(e) => setProductForm((state) => ({ ...state, city: e.target.value }))} disabled={!productForm.state}>
              <option value="">{productForm.state ? 'Select city' : 'Select state first'}</option>
              {getProductCities(productForm.state).map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </label>
        </div>
      </Modal>
    </CRMPage>
  )
}

// View More Button Component


// Helper function for priority distribution
function getPriorityDistribution(leads) {
  const priorityMap = new Map()
  leads.forEach(lead => {
    const priority = normalizeText(getLeadPriority(lead) || 'medium')
    priorityMap.set(priority, (priorityMap.get(priority) || 0) + 1)
  })
  const order = ['critical', 'high', 'hot', 'medium', 'warm', 'low', 'cold']
  return Array.from(priorityMap.entries())
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([name, value]) => ({ name, value }))
}

// Rest of the helper functions and components remain the same
function BulkUpdateModal({ isOpen, onClose, leadCount, onSubmit, loading, stages, users }) {
  const [fields, setFields] = useState({ current_stage: '', status: '', assigned_to: '', interest_level: '', channel: '', tag: '' })
  useEffect(() => { if (isOpen) setFields({ current_stage: '', status: '', assigned_to: '', interest_level: '', channel: '', tag: '' }) }, [isOpen])
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Bulk update ${leadCount} leads`} size="lg">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Stage"><select className={inputClassName} value={fields.current_stage} onChange={(e) => setFields((s) => ({ ...s, current_stage: e.target.value }))}><option value="">No change</option>{stages.map((s) => <option key={s.id || s.key || s.name} value={s.key || s.id || s.name}>{s.name}</option>)}</select></Field>
        <Field label="Status"><select className={inputClassName} value={fields.status} onChange={(e) => setFields((s) => ({ ...s, status: e.target.value }))}><option value="">No change</option><option value="active">Active</option><option value="won">Won</option><option value="lost">Lost</option><option value="closed">Closed</option></select></Field>
        <Field label="Owner"><select className={inputClassName} value={fields.assigned_to} onChange={(e) => setFields((s) => ({ ...s, assigned_to: e.target.value }))}><option value="">No change</option>{users.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}</select></Field>
        <Field label="Priority"><select className={inputClassName} value={fields.interest_level} onChange={(e) => setFields((s) => ({ ...s, interest_level: e.target.value }))}><option value="">No change</option><option value="cold">Cold</option><option value="warm">Warm</option><option value="hot">Hot</option></select></Field>
        <Field label="Source"><input className={inputClassName} value={fields.channel} onChange={(e) => setFields((s) => ({ ...s, channel: e.target.value }))} placeholder="Leave blank for no change" /></Field>
        <Field label="Tags"><input className={inputClassName} value={fields.tag} onChange={(e) => setFields((s) => ({ ...s, tag: e.target.value }))} placeholder="Pipe-separated tags" /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={loading} onClick={() => onSubmit(fields)} disabled={!leadCount}>Apply</Button>
      </div>
    </Modal>
  )
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>{children}</label>
}

export function getSalesCollection(data, legacyKey) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.[legacyKey])) return data[legacyKey]
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.data?.[legacyKey])) return data.data[legacyKey]
  if (Array.isArray(data?.data?.items)) return data.data.items
  return []
}

export function getProductCities(state) {
  return PRODUCT_LOCATION_OPTIONS.find((item) => item.state === state)?.cities || []
}

export function getProductStates() {
  return PRODUCT_LOCATION_OPTIONS.map((item) => item.state)
}

export function normalizeCreatedSalesOption(responseData, fallback = {}) {
  const item = Array.isArray(responseData) ? responseData[0] : responseData
  if (!item || typeof item !== 'object') return null
  const id = getOptionId(item) || getOptionId(fallback)
  const name = String(item.name || fallback.name || '').trim()
  if (!id && !name) return null
  return { ...fallback, ...item, id: id || name, name }
}

export function normalizeCreatedProduct(responseData, fallback = {}) {
  const product = normalizeCreatedSalesOption(
    responseData?.product || (Array.isArray(responseData) ? responseData[0] : responseData),
    fallback
  )
  const createdId = responseData?.ids?.[0] || responseData?.id || responseData?._id || getOptionId(product)
  if (!product && !createdId) return null
  return {
    ...fallback,
    ...(product || {}),
    id: String(createdId || getOptionId(product)).trim(),
    name: String(product?.name || fallback.name || '').trim(),
  }
}

export function mergeSalesCollectionItem(current, legacyKey, createdItem) {
  if (!createdItem) return current
  const currentItems = getSalesCollection(current, legacyKey)
  const createdId = getOptionId(createdItem)
  const nextItems = currentItems.some((item) => getOptionId(item) === createdId)
    ? currentItems.map((item) => (getOptionId(item) === createdId ? { ...item, ...createdItem } : item))
    : [...currentItems, createdItem]

  if (Array.isArray(current)) return nextItems
  if (current?.data && typeof current.data === 'object') {
    return { ...current, data: { ...current.data, items: nextItems, [legacyKey]: nextItems } }
  }
  if (current && typeof current === 'object') return { ...current, items: nextItems, [legacyKey]: nextItems }
  return { items: nextItems, [legacyKey]: nextItems }
}

export function getOwnerName(lead, userNameById = new Map()) {
  const direct = lead?.owner_name || lead?.assigned_to_name || lead?.owner?.name
  const ownerId = String(lead?.assigned_to || lead?.owner_id || direct || '').trim()
  if (ownerId && userNameById.has(ownerId)) return userNameById.get(ownerId)
  if (direct && !isMongoObjectId(direct)) return direct
  return 'Unassigned'
}

export function buildLeadDashboardAnalytics(leads = [], stages = [], now = timeService.now(), currency = 'INR') {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthKeys = Array.from({ length: 6 }, (_, index) => {
    const date = timeService.instantFromParts(now.getFullYear(), now.getMonth() - (5 - index), 1)
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      name: monthNames[date.getMonth()],
      count: 0,
      value: 0,
    }
  })
  const monthByKey = new Map(monthKeys.map((item) => [item.key, item]))
  leads.forEach((lead) => {
    const rawDate = lead.created_at || lead.updated_at || lead.estimated_close_date
    const date = rawDate ? timeService.instant(rawDate) : null
    if (!date || Number.isNaN(date.getTime())) return
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const bucket = monthByKey.get(key)
    if (!bucket) return
    bucket.count += 1
    bucket.value += getLeadDealValue(lead)
  })

  const stageLookup = new Map(stages.map((stage) => [normalizeText(stage.key || stage.id || stage.name), stage.name || stage.key || 'Stage']))
  const stageTotals = new Map()
  leads.forEach((lead) => {
    const stageKey = getLeadStageKey(lead) || normalizeText(lead.current_stage || lead.stage || 'unstaged')
    const stageName = stageLookup.get(stageKey) || lead.current_stage || lead.stage || 'Unstaged'
    const priority = normalizeText(getLeadPriority(lead) || 'medium')
    const type = ['critical', 'high', 'hot'].includes(priority) ? 'hot' : ['medium', 'warm'].includes(priority) ? 'warm' : 'cold'
    const current = stageTotals.get(stageName) || { name: stageName, hot: 0, warm: 0, cold: 0 }
    current[type] += 1
    stageTotals.set(stageName, current)
  })

  const activeCount = leads.filter((lead) => !['won', 'lost', 'closed'].includes(String(lead?.status || '').toLowerCase())).length
  const meetingCount = leads.filter((lead) => Boolean(parseLeadCustomFields(lead).meeting_scheduled)).length
  const hotCount = leads.filter((lead) => ['critical', 'high', 'hot'].includes(normalizeText(getLeadPriority(lead)))).length
  const pipelineValue = leads.reduce((sum, lead) => sum + getLeadDealValue(lead), 0)

  return {
    monthlyTrend: monthKeys,
    stageStack: Array.from(stageTotals.values()).slice(0, 6),
    priorityDistribution: getPriorityDistribution(leads),
    insights: [
      { label: 'Active', value: activeCount, helper: `${leads.length} total records`, icon: Sparkles, route: '/crm/pipeline' },
      { label: 'Hot leads', value: hotCount, helper: 'High-intent priority mix', icon: Target, route: '/crm/pipeline' },
      { label: 'Meetings', value: meetingCount, helper: 'Scheduled follow-ups', icon: CalendarDays, route: '/crm/activities' },
      { label: 'Avg value', value: leads.length ? formatCurrency(Math.round(pipelineValue / leads.length), currency) : formatCurrency(0, currency), helper: 'Mean deal size', icon: TrendingUp, route: '/crm/pipeline' },
    ],
  }
}

function parseLeadCustomFields(lead) {
  if (typeof lead?.custom_fields === 'string') {
    try {
      return JSON.parse(lead.custom_fields) || {}
    } catch {
      return {}
    }
  }
  return lead?.custom_fields || {}
}

function PriorityPill({ priority }) {
  const normalized = normalizeText(priority || 'medium')
  const styles = {
    critical: 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900',
    high: 'bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-900',
    hot: 'bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-900',
    medium: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900',
    warm: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900',
    low: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900',
    cold: 'bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900',
  }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${styles[normalized] || styles.medium}`}>
      {normalized || 'medium'}
    </span>
  )
}

function MergeModal({ group, isOpen, onClose, onConfirm, loading }) {
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')

  const leads = useMemo(() => group?.leads || [], [group?.leads])

  useEffect(() => {
    if (!isOpen || !leads.length) return
    const [first, second] = leads
    setTargetId(first?.id || '')
    setSourceId(second?.id || '')
  }, [isOpen, leads])

  const submit = () => {
    if (!sourceId || !targetId || sourceId === targetId) {
      toast.error('Select two different leads to merge')
      return
    }
    onConfirm?.({ source_lead_id: sourceId, target_lead_id: targetId })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Merge duplicate leads" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          The target lead keeps the combined data. The source lead will be marked deleted after the merge.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-text-primary">Target lead</span>
            <select className={inputClassName} value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">Select target</option>
              {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.prospect_name || lead.id}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-text-primary">Source lead</span>
            <select className={inputClassName} value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              <option value="">Select source</option>
              {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.prospect_name || lead.id}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={submit}>Merge leads</Button>
        </div>
      </div>
    </Modal>
  )
}
