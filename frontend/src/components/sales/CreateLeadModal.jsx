/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { salesApi } from '../../api/sales'
import { usersAPI } from '../../api/users'
import { Button, Modal, PhoneInput, inputClassName } from '../ui'
import { useAuthStore } from '../../store/authStore'
import { normalizeRole } from '../../utils/roles'
import { isAssignableActiveUser } from '../../utils/userFilters'

// ============================================================
// SHARED HELPERS — single source of truth for sales option data
// (kept here so every lead creation entry point behaves identically).
// ============================================================
const getOptionId = (item) => String(item?.id || item?._id || item?.value || item?.key || '').trim()
const getUserId = (item) => String(item?.id || item?._id || item?.user_id || item?.value || '').trim()
const getStageValue = (stage) => String(stage?.id || stage?._id || stage?.key || stage?.name || '').trim()

export const hasSalesCrmModule = (modules = []) => modules.includes('sales_crm') || modules.includes('sales')

// Lead owners can be any active assignable company user returned by the backend.
export const isValidLeadOwner = (item) => isAssignableActiveUser(item) && ['admin', 'sub_admin', 'manager', 'lead', 'employee'].includes(normalizeRole(item?.role))

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

export const getProductStates = () => PRODUCT_LOCATION_OPTIONS.map((item) => item.state)
export const getProductCities = (state) => PRODUCT_LOCATION_OPTIONS.find((item) => item.state === state)?.cities || []

export function getSalesCollection(data, legacyKey) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.[legacyKey])) return data[legacyKey]
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.data?.[legacyKey])) return data.data[legacyKey]
  if (Array.isArray(data?.data?.items)) return data.data.items
  return []
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

// ============================================================
// FORM CONSTANTS
// ============================================================
const EMPTY_LEAD_FORM = {
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
  referred_by: '',
  interest_level: 'medium',
  estimated_close_date: '',
  remark: '',
  tag: '',
}

const EMPTY_PRODUCT_FORM = { name: '', category_id: '', rate: '', unit: '', state: '', city: '' }

// FastAPI validation errors carry `detail` as an array of {type, loc, msg, input, url}
// objects. Stringify it so toast.error never tries to render objects as React children
// (reported crash: "Objects are not valid as a React child (found: object with keys {type, loc, msg, input, url})").
const toErrorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail || fallback
  if (Array.isArray(detail)) {
    const message = detail
      .map((item) => item?.msg || (typeof item === 'string' ? item : ''))
      .filter(Boolean)
      .join(', ')
    return message || fallback
  }
  return fallback
}

// ============================================================
// SHARED "ADD NEW LEAD" MODAL
// ============================================================
// Single lead-creation entry point used by the CRM Leads Dashboard and the
// Pipeline page. Always shows every field, including "+ New category" and
// "+ New product" quick-creation flows, so no entry point offers a reduced form.
export default function CreateLeadModal({ isOpen, onClose, onCreated }) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const currentUserId = user?.id || user?._id || ''

  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [createProductOpen, setCreateProductOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_LEAD_FORM)
  const [categoryForm, setCategoryForm] = useState({ name: '' })
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT_FORM)

  const categoriesQuery = useQuery('crm-lead-categories', salesApi.getCategories, { staleTime: 5 * 60 * 1000 })
  const stagesQuery = useQuery('crm-lead-stages', salesApi.getStages, { staleTime: 5 * 60 * 1000 })
  const usersQuery = useQuery('crm-lead-users', () => usersAPI.getAssignableUsers(), { staleTime: 5 * 60 * 1000 })
  const productsQuery = useQuery('crm-lead-products', salesApi.getProducts, { staleTime: 5 * 60 * 1000 })

  const categories = useMemo(() => getSalesCollection(categoriesQuery.data, 'categories'), [categoriesQuery.data])
  const products = useMemo(() => getSalesCollection(productsQuery.data, 'products'), [productsQuery.data])
  const stages = useMemo(() => {
    const data = stagesQuery.data
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.stages)) return data.stages
    if (Array.isArray(data?.items)) return data.items
    return []
  }, [stagesQuery.data])
  const assignableUsers = useMemo(() => {
    const data = usersQuery.data
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.users)) return data.users
    if (Array.isArray(data?.items)) return data.items
    return []
  }, [usersQuery.data])
  const leadOwnerOptions = useMemo(() => assignableUsers.filter(isValidLeadOwner), [assignableUsers])
  // Referral sources are any active employee or manager in the company (optional).
  const referralOptions = useMemo(() => assignableUsers.filter(isAssignableActiveUser), [assignableUsers])

  const defaultStageId = getStageValue(stages[0])
  const defaultCategoryId = getOptionId(categories[0])
  const defaultProductIds = getOptionId(products[0])
  const defaultOwnerId = getUserId(leadOwnerOptions[0]) || (isValidLeadOwner(user) ? currentUserId : '')

  useEffect(() => {
    if (!isOpen) return
    setCreateForm((state) => ({
      ...state,
      category_id: state.category_id || defaultCategoryId,
      product_ids: state.product_ids || defaultProductIds,
      current_stage: state.current_stage || defaultStageId,
      assigned_to: state.assigned_to || defaultOwnerId,
    }))
  }, [isOpen, defaultCategoryId, defaultOwnerId, defaultProductIds, defaultStageId])

  const resetForms = () => {
    setCreateForm(EMPTY_LEAD_FORM)
    setCategoryForm({ name: '' })
    setProductForm(EMPTY_PRODUCT_FORM)
    setCreateCategoryOpen(false)
    setCreateProductOpen(false)
  }

  const handleClose = () => {
    resetForms()
    onClose?.()
  }

  const createLeadMutation = useMutation(
    (payload) => salesApi.createLead(payload),
    {
      onSuccess: () => {
        toast.success('Lead created')
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('crm-pipeline-board')
        queryClient.invalidateQueries('crm-lead-duplicates')
        queryClient.invalidateQueries('crm-all-leads')
        queryClient.invalidateQueries('sales-prospects')
        onCreated?.()
        handleClose()
      },
      onError: (error) => {
        toast.error(toErrorMessage(error, 'Unable to create lead'))
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
          toast.error(toErrorMessage(error, 'You do not have permission to create categories'))
        } else if (error?.response?.status === 400) {
          toast.error(toErrorMessage(error, 'Category already exists or invalid input'))
        } else {
          toast.error(toErrorMessage(error, 'Unable to create category'))
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
        setProductForm(EMPTY_PRODUCT_FORM)
      },
      onError: (error) => {
        toast.error(toErrorMessage(error, 'Unable to create product'))
      },
    }
  )

  const submitCreateLead = (event) => {
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
      referred_by: createForm.referred_by || undefined,
      interest_level: createForm.interest_level || 'medium',
      estimated_close_date: createForm.estimated_close_date || undefined,
      remark: createForm.remark.trim(),
      tag: createForm.tag.trim(),
    }

    // All fields are optional for partial lead creation — phone included.
    // When a phone IS entered it must still match the +country code + 10 digits format.
    if (payload.phone && (!/^\+\d{1,4}$/.test(String(payload.country_code || '')) || !/^\d{10}$/.test(payload.phone))) {
      toast.error('Use a + country code and exactly 10 phone digits')
      return
    }
    // Owner assignment is handled automatically by backend if not provided
    createLeadMutation.mutate(payload)
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Add New Lead"
        size="lg"
      >
        <form
          className="space-y-4"
          onSubmit={submitCreateLead}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">First name</span>
              <input className={inputClassName} placeholder="First name" value={createForm.first_name} onChange={(e) => setCreateForm((state) => ({ ...state, first_name: e.target.value }))} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">Last name</span>
              <input className={inputClassName} placeholder="Last name" value={createForm.last_name} onChange={(e) => setCreateForm((state) => ({ ...state, last_name: e.target.value }))} />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium text-text-muted">Phone</span>
              <PhoneInput
                countryCode={createForm.country_code}
                phoneNumber={createForm.phone}
                onCountryCodeChange={(value) => setCreateForm((state) => ({ ...state, country_code: value }))}
                onPhoneNumberChange={(value) => setCreateForm((state) => ({ ...state, phone: value }))}
                placeholder="Enter mobile number"
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
                <button type="button" className="text-primary-600 hover:underline" onClick={() => setCreateCategoryOpen(true)}>+ New category</button>
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
              <span className="text-xs font-medium text-text-muted">Assigned To</span>
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
              <span className="text-xs font-medium text-text-muted">Referred by</span>
              <select className={inputClassName} value={createForm.referred_by} onChange={(e) => setCreateForm((state) => ({ ...state, referred_by: e.target.value }))}>
                <option value="">Not referred</option>
                {referralOptions.map((userOption) => (
                  <option key={getUserId(userOption)} value={getUserId(userOption)}>
                    {userOption.first_name} {userOption.last_name} {userOption.role ? `(${userOption.role})` : ''}
                  </option>
                ))}
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
            <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={createLeadMutation.isLoading}>Save lead</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={createCategoryOpen}
        onClose={() => setCreateCategoryOpen(false)}
        title="Create category"
        zIndexClass="z-[70]"
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
    </>
  )
}
