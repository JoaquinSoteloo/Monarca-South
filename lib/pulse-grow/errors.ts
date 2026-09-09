// Errores categorizados de la integración con Pulse Grow.
// El código (`code`) es lo único que puede llegar al frontend; el `message`
// completo queda solo en los logs del servidor (nunca se expone al cliente).

export type PulseErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "unavailable"
  | "timeout"
  | "not_found"
  | "unexpected_response"

export class PulseApiError extends Error {
  code: PulseErrorCode
  status?: number

  constructor(code: PulseErrorCode, message: string, status?: number) {
    super(message)
    this.name = "PulseApiError"
    this.code = code
    this.status = status
  }
}
