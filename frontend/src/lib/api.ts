import type { TokenOut } from './types'

const BASE = '/api/v1'

/** Access token chỉ nằm trong bộ nhớ; refresh token nằm trong cookie httpOnly do server đặt. */
let accessToken: string | null = null
let refreshing: Promise<TokenOut | null> | null = null
let onSessionExpired: () => void = () => {}

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler
}

export class ApiError extends Error {
  readonly status: number
  /** Mã lý do máy đọc được, VD "expired" | "duplicate" khi điểm danh */
  readonly reason?: string

  constructor(status: number, message: string, reason?: string) {
    super(message)
    this.status = status
    this.reason = reason
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let detail: unknown
  try {
    detail = (await res.json()).detail
  } catch {
    return new ApiError(res.status, res.status >= 500 ? 'Máy chủ đang gặp sự cố, vui lòng thử lại sau' : 'Có lỗi xảy ra')
  }
  if (typeof detail === 'string') return new ApiError(res.status, detail)
  if (detail && typeof detail === 'object' && 'message' in detail) {
    const d = detail as { message: string; reason?: string }
    return new ApiError(res.status, d.message, d.reason)
  }
  if (Array.isArray(detail)) {
    // Lỗi validate 422 của FastAPI
    const fields = detail.map((e: { loc?: unknown[] }) => e.loc?.at(-1)).filter(Boolean)
    return new ApiError(res.status, `Dữ liệu không hợp lệ${fields.length ? `: ${fields.join(', ')}` : ''}`)
  }
  return new ApiError(res.status, 'Có lỗi xảy ra')
}

/** Đổi refresh token lấy access token mới. Nhiều request cùng hết hạn chỉ gọi refresh 1 lần. */
export function refreshSession(): Promise<TokenOut | null> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) return null
      const data = (await res.json()) as TokenOut
      accessToken = data.access_token
      return data
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

interface RequestOptions {
  method?: string
  json?: unknown
  form?: FormData
  signal?: AbortSignal
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json'
  return fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
    credentials: 'same-origin',
    signal: opts.signal,
  })
}

async function request(path: string, opts: RequestOptions = {}): Promise<Response> {
  let res = await send(path, opts)
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      res = await send(path, opts)
    } else {
      accessToken = null
      onSessionExpired()
    }
  }
  if (!res.ok) throw await toApiError(res)
  return res
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(path, opts)
  return (res.status === 204 ? undefined : await res.json()) as T
}

/** Tải file (CSV) kèm token, rồi kích hoạt hộp thoại lưu file của trình duyệt. */
export async function download(path: string, fallbackName: string) {
  const res = await request(path)
  const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: match?.[1] ?? fallbackName })
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
