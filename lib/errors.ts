// Centralized error handling utilities

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  BAD_REQUEST = 'BAD_REQUEST'
}

export interface ApiError {
  code: ErrorCode
  message: string
  details?: any
  statusCode: number
}

export class ApiErrorResponse extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly details?: any

  constructor(error: ApiError) {
    super(error.message)
    this.name = 'ApiErrorResponse'
    this.code = error.code
    this.statusCode = error.statusCode
    this.details = error.details
  }
}

// Predefined error responses
export const ERRORS = {
  VALIDATION_FAILED: (details: any): ApiError => ({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Validation failed',
    details,
    statusCode: 400
  }),

  RATE_LIMIT_EXCEEDED: (message: string): ApiError => ({
    code: ErrorCode.RATE_LIMIT_EXCEEDED,
    message,
    statusCode: 429
  }),

  UNAUTHORIZED: (message: string = 'Unauthorized'): ApiError => ({
    code: ErrorCode.UNAUTHORIZED,
    message,
    statusCode: 401
  }),

  FORBIDDEN: (message: string = 'Forbidden'): ApiError => ({
    code: ErrorCode.FORBIDDEN,
    message,
    statusCode: 403
  }),

  NOT_FOUND: (resource: string = 'Resource'): ApiError => ({
    code: ErrorCode.NOT_FOUND,
    message: `${resource} not found`,
    statusCode: 404
  }),

  CONFLICT: (message: string): ApiError => ({
    code: ErrorCode.CONFLICT,
    message,
    statusCode: 409
  }),

  INTERNAL_ERROR: (message: string = 'Internal server error'): ApiError => ({
    code: ErrorCode.INTERNAL_ERROR,
    message,
    statusCode: 500
  }),

  SERVICE_UNAVAILABLE: (service: string): ApiError => ({
    code: ErrorCode.SERVICE_UNAVAILABLE,
    message: `${service} service is currently unavailable`,
    statusCode: 503
  }),

  BAD_REQUEST: (message: string): ApiError => ({
    code: ErrorCode.BAD_REQUEST,
    message,
    statusCode: 400
  })
}

// Sanitize error messages to prevent information leakage
export function sanitizeErrorMessage(error: any, isDevelopment: boolean = false): string {
  // In development, show more details
  if (isDevelopment && process.env.NODE_ENV === 'development') {
    return error.message || 'An error occurred'
  }

  // In production, sanitize sensitive information
  const message = error.message || 'An error occurred'

  // Remove potentially sensitive information
  const sanitized = message
    .replace(/\b(?:password|secret|key|token|credential)\b/gi, '[REDACTED]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, '[EMAIL_REDACTED]')
    .replace(/\b\d{4,}\b/g, '[NUMBER_REDACTED]')

  return sanitized
}

// Enhanced error logging
export function logError(
  error: any,
  context: {
    endpoint?: string
    userId?: string
    ip?: string
    userAgent?: string
    requestId?: string
    timestamp?: string
  } = {}
) {
  const logData = {
    timestamp: context.timestamp || new Date().toISOString(),
    level: 'ERROR',
    message: error.message,
    stack: error.stack,
    code: error.code || 'UNKNOWN',
    endpoint: context.endpoint,
    userId: context.userId,
    ip: context.ip,
    userAgent: context.userAgent,
    requestId: context.requestId,
    ...(error.details && { details: error.details })
  }

  console.error('API Error:', JSON.stringify(logData, null, 2))

  // In production, you might want to send this to an external logging service
  // like DataDog, Sentry, or CloudWatch
}

// Create standardized error response
export function createErrorResponse(apiError: ApiError): Response {
  const responseBody = {
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details && { details: apiError.details })
    }
  }

  return Response.json(responseBody, {
    status: apiError.statusCode,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

// Handle async errors in API routes
export function withErrorHandling<T extends any[]>(
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (error) {
      // Handle known API errors
      if (error instanceof ApiErrorResponse) {
        return createErrorResponse({
          code: error.code,
          message: error.message,
          details: error.details,
          statusCode: error.statusCode
        })
      }

      // Handle unknown errors
      const sanitizedMessage = sanitizeErrorMessage(error)

      // Log the full error for debugging
      logError(error, {
        endpoint: 'unknown',
        timestamp: new Date().toISOString()
      })

      return createErrorResponse(ERRORS.INTERNAL_ERROR(sanitizedMessage))
    }
  }
}