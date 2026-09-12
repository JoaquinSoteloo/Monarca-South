// Helpers puros para /reservar. Separados de app/reservar/page.tsx para que
// se puedan testear sin montar el componente React.

// Debe coincidir exactamente con la normalización que hacen las RPC en
// scripts/058_public_reservation_rpcs.sql (regexp_replace(..., '[^0-9]', '', 'g')),
// así el cliente compara el mismo valor que va a validar el servidor.
export function normalizarDni(input: string): string {
  return input.replace(/[^0-9]/g, "")
}

// Códigos de error MC00X que las RPC de scripts/058_public_reservation_rpcs.sql
// devuelven vía USING ERRCODE. El mensaje ya viene en español, pensado para
// mostrarse tal cual al usuario final.
const RESERVA_ERROR_CODES = new Set([
  "MC001", // reservas cerradas
  "MC002", // horario inválido
  "MC003", // turno completo
  "MC004", // ya existe una cita activa hoy a otro horario
  "MC005", // no se encontró cita para reprogramar
  "MC006", // datos inválidos (documento/nombre/apellido)
  "MC007", // cita existente ya no está confirmada
  "MC008", // configuración de turnos no disponible
])

export interface ReservaRpcError {
  code?: string
  message?: string
}

// Mapea el error de una RPC de reservas a un mensaje seguro para mostrar.
// Solo confía en el `message` cuando el `code` es uno de los MC00X que
// nosotros mismos definimos (texto pensado para el usuario); cualquier otro
// error (de red, o un error de Postgres que no previmos) cae a un mensaje
// genérico para no filtrarle detalles internos de la base al público.
export function mapReservaError(error: ReservaRpcError | null | undefined): string {
  if (error?.code && RESERVA_ERROR_CODES.has(error.code) && error.message) {
    return error.message
  }
  return "Ocurrió un error al procesar tu reserva. Intentá nuevamente."
}

// PostgREST puede entregar columnas `bigint` (como el `cantidad` de
// citas_ocupacion_hoy) serializadas como string en el JSON, para no perder
// precisión en clientes que no manejan bigint nativo. Acá los valores nunca
// se acercan a ese rango, así que convertir a Number es seguro.
export function bigintComoNumero(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined) return 0
  return typeof valor === "number" ? valor : Number(valor)
}
