export type ApiError = {
  code: string
  message: string
  details?: unknown
}

export type ApiSuccess<T> = {
  success: true
  data: T
}

export type ApiFailure = {
  success: false
  error: ApiError
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data }
}

export function err(code: string, message: string, details?: unknown): ApiFailure {
  return { success: false, error: { code, message, details } }
}
