import type { OperadorComparacion, ProveedorDispositivo, TipoDispositivoControlable, VariableAmbiental } from "@/lib/types"

export interface DeviceFormState {
  nombre: string
  tipo: TipoDispositivoControlable
  proveedor: ProveedorDispositivo
  soporta_feedback: boolean
  simular_falla: boolean
  latencia_ms: string
  requisito_ausente: "" | "encendido" | "apagado"
}

export const initialDeviceForm: DeviceFormState = {
  nombre: "",
  tipo: "aire_acondicionado",
  proveedor: "manual_noop",
  soporta_feedback: false,
  simular_falla: false,
  latencia_ms: "",
  requisito_ausente: "",
}

export interface RuleFormState {
  nombre: string
  pulse_device_id: string
  variable: VariableAmbiental
  operador: OperadorComparacion
  valor_objetivo: string
  duracion_minima_minutos: string
  usar_histeresis: boolean
  operador_apagado: OperadorComparacion
  valor_apagado: string
  duracion_apagado_minutos: string
  cooldown_minutos: string
  dispositivo_id: string
  accion_modo: string
  accion_setpoint: string
  accion_fan: string
  accion_fail_safe: "mantener" | "apagar"
}

export const initialReglaForm: RuleFormState = {
  nombre: "",
  pulse_device_id: "",
  variable: "temperatura_c",
  operador: ">",
  valor_objetivo: "",
  duracion_minima_minutos: "3",
  usar_histeresis: false,
  operador_apagado: "<",
  valor_apagado: "",
  duracion_apagado_minutos: "3",
  cooldown_minutos: "5",
  dispositivo_id: "",
  accion_modo: "frio",
  accion_setpoint: "23",
  accion_fan: "auto",
  accion_fail_safe: "mantener",
}
