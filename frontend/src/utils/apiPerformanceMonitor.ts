import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

export type ApiRequestSource = 'axios' | 'fetch'

export interface ApiPerformanceMetric {
  id: string
  endpoint: string
  method: string
  source: ApiRequestSource
  startTime: number
  durationMs: number
  ok: boolean
  status: number | null
  responseSizeBytes: number | null
  duplicate: boolean
  requestKey: string
  errorMessage?: string
}

export interface ApiPerformanceSummary {
  endpoint: string
  method: string
  source: ApiRequestSource
  callCount: number
  averageMs: number
  maxMs: number
  failureCount: number
  lastStatus: number | null
  lastSeenAt: number
  duplicateCount: number
  averageSizeBytes: number | null
}

type Listener = () => void

type PendingRequest = {
  id: string
  endpoint: string
  method: string
  source: ApiRequestSource
  requestKey: string
  startTime: number
  startPerf: number
  duplicate: boolean
}

const GLOBAL_KEY = '__SYN_TASK_API_PERF_MONITOR__'
const DUPLICATE_WINDOW_MS = 500

type MonitorState = {
  metrics: ApiPerformanceMetric[]
  listeners: Set<Listener>
  inFlight: Map<string, number>
  lastSeenAt: Map<string, number>
  installedAxios: WeakSet<AxiosInstance>
}

const getState = (): MonitorState => {
  const globalRef = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: MonitorState
  }

  if (!globalRef[GLOBAL_KEY]) {
    globalRef[GLOBAL_KEY] = {
      metrics: [],
      listeners: new Set<Listener>(),
      inFlight: new Map<string, number>(),
      lastSeenAt: new Map<string, number>(),
      installedAxios: new WeakSet<AxiosInstance>(),
    }
  }

  return globalRef[GLOBAL_KEY]!
}

const notify = () => {
  const state = getState()
  state.listeners.forEach((listener) => listener())
}

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

const normalizeMethod = (method?: string) => (method || 'GET').toUpperCase()

const normalizeEndpoint = (endpoint: string) => {
  if (!endpoint) return 'unknown'
  return endpoint.replace(/^https?:\/\/[^/]+/i, '').replace(/\/{2,}/g, '/')
}

const buildEndpoint = (config: AxiosRequestConfig, instance?: AxiosInstance) => {
  if (!instance?.getUri) {
    const url = config.url || ''
    return normalizeEndpoint(url)
  }

  try {
    const uri = instance.getUri(config)
    return normalizeEndpoint(uri)
  } catch {
    const baseUrl = config.baseURL || ''
    const url = config.url || ''
    return normalizeEndpoint(`${baseUrl}${url}`)
  }
}

const buildRequestKey = (method: string, endpoint: string, data: unknown) => {
  const bodyFingerprint =
    data instanceof FormData
      ? Array.from(data.entries())
          .map(([key, value]) => `${key}=${typeof value === 'string' ? value : '[blob]'}`)
          .join('&')
      : data instanceof URLSearchParams
        ? data.toString()
        : typeof data === 'string'
          ? data
          : safeStringify(data)

  return `${method}:${endpoint}:${bodyFingerprint || 'no-body'}`
}

const estimateResponseSize = (response: AxiosResponse | Response | undefined, body?: unknown) => {
  if (!response) return null

  const headerValue =
    'headers' in response
      ? typeof response.headers?.get === 'function'
        ? response.headers.get('content-length')
        : response.headers?.['content-length'] ?? response.headers?.['Content-Length']
      : null

  const parsedHeader = headerValue ? Number.parseInt(String(headerValue), 10) : Number.NaN
  if (Number.isFinite(parsedHeader)) return parsedHeader

  const payload = body ?? ('data' in response ? response.data : undefined)
  if (payload == null) return null

  if (typeof payload === 'string') return payload.length
  if (payload instanceof Blob) return payload.size
  if (payload instanceof ArrayBuffer) return payload.byteLength
  if (ArrayBuffer.isView(payload)) return payload.byteLength

  const serialized = safeStringify(payload)
  return serialized ? serialized.length : null
}

const recordMetric = (metric: ApiPerformanceMetric) => {
  const state = getState()
  state.metrics = [...state.metrics, metric]
  state.lastSeenAt.set(metric.requestKey, metric.startTime)

  // Keep the in-memory store bounded so the dashboard stays lightweight during long sessions.
  if (state.metrics.length > 1000) {
    state.metrics = state.metrics.slice(-1000)
  }

  notify()
}

const startPendingRequest = (
  source: ApiRequestSource,
  method: string,
  endpoint: string,
  data: unknown,
  requestKeyOverride?: string,
): PendingRequest => {
  const state = getState()
  const normalizedMethod = normalizeMethod(method)
  const requestKey = requestKeyOverride || buildRequestKey(normalizedMethod, endpoint, data)
  const startTime = Date.now()
  const startPerf = typeof performance !== 'undefined' ? performance.now() : startTime
  const lastSeen = state.lastSeenAt.get(requestKey)
  const duplicate = Boolean(
    state.inFlight.get(requestKey) ||
      (lastSeen != null && startTime - lastSeen <= DUPLICATE_WINDOW_MS),
  )

  state.inFlight.set(requestKey, (state.inFlight.get(requestKey) || 0) + 1)

  return {
    id: `${normalizedMethod}-${startTime}-${Math.random().toString(36).slice(2, 10)}`,
    endpoint,
    method: normalizedMethod,
    source,
    requestKey,
    startTime,
    startPerf,
    duplicate,
  }
}

const finishPendingRequest = (
  pending: PendingRequest,
  outcome: {
    ok: boolean
    status?: number | null
    responseSizeBytes?: number | null
    errorMessage?: string
  },
) => {
  const state = getState()
  const elapsedMs = typeof performance !== 'undefined' ? performance.now() - pending.startPerf : Date.now() - pending.startTime
  const currentCount = state.inFlight.get(pending.requestKey) || 0
  if (currentCount <= 1) {
    state.inFlight.delete(pending.requestKey)
  } else {
    state.inFlight.set(pending.requestKey, currentCount - 1)
  }

  recordMetric({
    id: pending.id,
    endpoint: pending.endpoint,
    method: pending.method,
    source: pending.source,
    startTime: pending.startTime,
    durationMs: Number(elapsedMs.toFixed(2)),
    ok: outcome.ok,
    status: outcome.status ?? null,
    responseSizeBytes: outcome.responseSizeBytes ?? null,
    duplicate: pending.duplicate,
    requestKey: pending.requestKey,
    errorMessage: outcome.errorMessage,
  })
}

export const subscribeApiPerformanceMetrics = (listener: Listener) => {
  const state = getState()
  state.listeners.add(listener)
  return () => state.listeners.delete(listener)
}

export const getApiPerformanceMetrics = () => getState().metrics

export const clearApiPerformanceMetrics = () => {
  const state = getState()
  state.metrics = []
  state.inFlight.clear()
  state.lastSeenAt.clear()
  notify()
}

export const getApiPerformanceSummaries = (
  metrics: ApiPerformanceMetric[] = getApiPerformanceMetrics(),
): ApiPerformanceSummary[] => {
  const summaries = new Map<string, ApiPerformanceSummary>()

  for (const metric of metrics) {
    const key = `${metric.method}:${metric.endpoint}:${metric.source}`
    const current = summaries.get(key)
    if (!current) {
      summaries.set(key, {
        endpoint: metric.endpoint,
        method: metric.method,
        source: metric.source,
        callCount: 1,
        averageMs: metric.durationMs,
        maxMs: metric.durationMs,
        failureCount: metric.ok ? 0 : 1,
        lastStatus: metric.status,
        lastSeenAt: metric.startTime,
        duplicateCount: metric.duplicate ? 1 : 0,
        averageSizeBytes: metric.responseSizeBytes,
      })
      continue
    }

    const nextCount = current.callCount + 1
    current.callCount = nextCount
    current.averageMs = Number(((current.averageMs * (nextCount - 1) + metric.durationMs) / nextCount).toFixed(2))
    current.maxMs = Math.max(current.maxMs, metric.durationMs)
    current.failureCount += metric.ok ? 0 : 1
    current.lastStatus = metric.status
    current.lastSeenAt = metric.startTime
    current.duplicateCount += metric.duplicate ? 1 : 0
    current.averageSizeBytes =
      metric.responseSizeBytes == null && current.averageSizeBytes == null
        ? null
        : Number(
            (((current.averageSizeBytes || 0) * (nextCount - 1) + (metric.responseSizeBytes || 0)) / nextCount).toFixed(2),
          )
  }

  return [...summaries.values()].sort((a, b) => b.maxMs - a.maxMs)
}

export const installApiPerformanceMonitor = (
  instance: AxiosInstance,
  options: { devOnly?: boolean } = {},
) => {
  const state = getState()
  if (state.installedAxios.has(instance)) return instance
  if (options.devOnly && typeof import.meta !== 'undefined' && !import.meta.env.DEV) {
    return instance
  }

  state.installedAxios.add(instance)

  instance.interceptors.request.use((config) => {
    const endpoint = buildEndpoint(config, instance)
    const pending = startPendingRequest('axios', config.method || 'GET', endpoint, config.data)
    ;(config as AxiosRequestConfig & { __apiPerformancePending?: PendingRequest }).__apiPerformancePending =
      pending

    if (typeof import.meta !== 'undefined' && import.meta.env.DEV) {
      console.debug('[api] start', {
        endpoint: pending.endpoint,
        method: pending.method,
        duplicate: pending.duplicate,
        at: pending.startTime,
      })
    }

    return config
  })

  instance.interceptors.response.use(
    (response) => {
      const config = response.config as AxiosRequestConfig & { __apiPerformancePending?: PendingRequest }
      const pending = config.__apiPerformancePending
      if (pending) {
        delete config.__apiPerformancePending
        finishPendingRequest(pending, {
          ok: true,
          status: response.status,
          responseSizeBytes: estimateResponseSize(response, response.data),
        })

        if (typeof import.meta !== 'undefined' && import.meta.env.DEV) {
          console.debug('[api] success', {
            endpoint: pending.endpoint,
            method: pending.method,
            status: response.status,
            durationMs: getApiPerformanceMetrics().at(-1)?.durationMs,
            responseSizeBytes: estimateResponseSize(response, response.data),
          })
        }
      }
      return response
    },
    (error) => {
      const config = error?.config as AxiosRequestConfig & { __apiPerformancePending?: PendingRequest }
      const pending = config?.__apiPerformancePending
      if (pending) {
        delete config.__apiPerformancePending
        finishPendingRequest(pending, {
          ok: false,
          status: error?.response?.status ?? null,
          responseSizeBytes: estimateResponseSize(error?.response, error?.response?.data),
          errorMessage: error?.response?.data?.detail || error?.response?.data?.message || error?.message,
        })

        if (typeof import.meta !== 'undefined' && import.meta.env.DEV) {
          console.debug('[api] failure', {
            endpoint: pending.endpoint,
            method: pending.method,
            status: error?.response?.status ?? null,
            error: error?.response?.data?.detail || error?.response?.data?.message || error?.message,
          })
        }
      }

      return Promise.reject(error)
    },
  )

  return instance
}

export const createMonitoredFetch = (fetchImpl: typeof fetch = fetch.bind(globalThis)) => {
  return async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const request = new Request(input, init)
    const endpoint = normalizeEndpoint(request.url)
    const method = normalizeMethod(request.method)
    const body = init.body
    const pending = startPendingRequest('fetch', method, endpoint, body, `${method}:${endpoint}:${body ? '[body]' : 'no-body'}`)

    if (typeof import.meta !== 'undefined' && import.meta.env.DEV) {
      console.debug('[fetch] start', {
        endpoint: pending.endpoint,
        method: pending.method,
        duplicate: pending.duplicate,
        at: pending.startTime,
      })
    }

    try {
      const response = await fetchImpl(request)
      finishPendingRequest(pending, {
        ok: response.ok,
        status: response.status,
        responseSizeBytes: estimateResponseSize(response),
      })
      return response
    } catch (error) {
      finishPendingRequest(pending, {
        ok: false,
        status: null,
        errorMessage: error instanceof Error ? error.message : 'Fetch failed',
      })
      throw error
    }
  }
}
