export interface Membresia {
  id: string
  nombre: string
  gramos_mensuales: number
  created_at: string
}

export interface Sucursal {
  id: string
  nombre: string
  direccion: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Socio {
  id: string
  nombre: string
  apellido: string
  dni: string
  email: string | null
  telefono: string | null
  membresia_id: string | null
  estado_reprocan: "Activo" | "Pendiente" | null
  sucursal_id: string | null
  gramos_mensuales: number | null
  gramos_consumidos_mes: number
  es_miembro: boolean
  es_vip: boolean
  activo: boolean
  created_at: string
  updated_at: string
  membresia?: Membresia
  sucursal?: Sucursal
}

export interface Genetica {
  id: string
  nombre: string
  descripcion: string | null
  gramos_disponibles: number
  precio_por_gramo: number
  precio_por_enrolado: number
  precio_gramo_miembro: number
  precio_enrolado_miembro: number
  precio_gramo_vip: number
  precio_enrolado_vip: number
  activo: boolean
  created_at: string
  updated_at: string
}

export interface DetalleVenta {
  id: string
  venta_id: string
  genetica_id: string | null // Ahora es opcional para permitir productos
  producto_id: string | null // Nuevo campo para productos
  gramos: number
  cantidad_enrolados: number | null
  peso_enrolados: number | null
  peso_por_enrolado: number | null
  precio_unitario: number
  precio_enrolado: number | null
  subtotal: number
  created_at: string
  genetica?: Genetica
  producto?: Producto // Nueva relación con producto
}

export interface LineaVenta {
  tipo: "genetica" | "producto" // Tipo de línea
  genetica_id: string
  producto_id: string // ID del producto
  gramos: number
  cantidad_enrolados: number
  peso_por_enrolado: number
  cantidad_producto: number // Cantidad del producto
}

export interface Venta {
  id: string
  socio_id: string
  genetica_id: string | null
  gramos: number
  precio_unitario: number
  total: number
  metodo_pago: "efectivo" | "transferencia" | "pendiente"
  tipo_venta: "gramos" | "enrolados" | "mixto"
  cantidad_enrolados: number | null
  peso_enrolados: number | null
  notas: string | null
  saldo_pendiente: number
  monto_pagado: number
  created_at: string
  socio?: Socio
  genetica?: Genetica
  detalles?: DetalleVenta[]
  pagos?: Pago[]
}

export interface Gasto {
  id: string
  descripcion: string
  monto: number
  categoria: string
  metodo_pago: "efectivo" | "transferencia"
  fecha: string
  created_at: string
  updated_at: string
}

export interface CategoriaGasto {
  id: string
  nombre: string
  created_at: string
}

export interface Producto {
  id: string
  codigo_barras: string | null
  nombre: string
  descripcion: string | null
  precio: number
  cantidad: number
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Pago {
  id: string
  venta_id: string
  monto: number
  metodo_pago: "efectivo" | "transferencia"
  comprobante_url: string | null
  notas: string | null
  fecha: string
  created_at: string
  venta?: Venta
}

export interface SalaCultivo {
  id: number
  nombre: string
  descripcion: string | null
  activo: boolean
  created_at: string
  updated_at: string
  camas?: CamaCultivo[]
}

export interface CamaCultivo {
  id: number
  sala_id: number
  nombre: string
  genetica_id: number | null
  cantidad_plantas: number
  fecha_siembra: string | null
  estado: "vacio" | "vegetativo" | "floracion" | "cosecha"
  notas: string | null
  created_at: string
  updated_at: string
  genetica?: Genetica
}

export interface PulseDevice {
  id: number
  name: string
  device_type: number | null
  sala_id: number | null
  activo: boolean
  last_synced_at: string | null
  created_at: string
  updated_at: string
  sala?: SalaCultivo | null
}

export interface LecturaAmbiental {
  id: number
  pulse_device_id: number
  sala_id: number | null
  temperatura_c: number | null
  humedad_rh: number | null
  vpd: number | null
  luz_lux: number | null
  presion_hpa: number | null
  dew_point_c: number | null
  leido_en: string
  created_at: string
}

export type VariableAmbiental = "temperatura_c" | "humedad_rh" | "vpd" | "luz_lux" | "dew_point_c" | "presion_hpa"
export type OperadorComparacion = ">" | "<" | ">=" | "<="
export type TipoDispositivoControlable = "aire_acondicionado" | "extractor" | "humidificador" | "deshumidificador" | "otro"
export type ProveedorDispositivo = "manual_noop" | "broadlink_ir" | "shelly_local" | "shelly_cloud" | "http_directo"
export type ModoEjecucionDispositivo = "servidor_directo" | "bridge_polling"
export type ModoDispositivo = "automatico" | "manual"
export type OrigenComando = "automatizacion" | "manual" | "sistema"
export type EstadoComando = "pendiente" | "en_proceso" | "ejecutado" | "fallido" | "timeout" | "cancelado"
export type EjecutorComando = "servidor" | "bridge"
export type AccionFailSafe = "mantener" | "apagar"
export type TipoDisparo = "encendido" | "apagado"
export type TipoEjecucionAutomatizacion = "encendido" | "apagado" | "fail_safe" | "error"

export interface DispositivoControlable {
  id: number
  nombre: string
  sala_id: number | null
  tipo: TipoDispositivoControlable
  proveedor: ProveedorDispositivo
  modo_ejecucion: ModoEjecucionDispositivo
  proveedor_config: Record<string, unknown>
  soporta_feedback: boolean
  modo: ModoDispositivo
  activo: boolean
  ultimo_comando_payload: Record<string, unknown> | null
  ultimo_comando_en: string | null
  ultimo_comando_origen: OrigenComando | null
  ultimo_comando_estado: EstadoComando | null
  ultimo_estado_confirmado_payload: Record<string, unknown> | null
  ultimo_estado_confirmado_en: string | null
  created_at: string
  updated_at: string
  sala?: SalaCultivo | null
}

export interface ComandoDispositivo {
  id: number
  dispositivo_id: number
  origen: OrigenComando
  automatizacion_id: number | null
  payload: Record<string, unknown>
  estado: EstadoComando
  ejecutado_por: EjecutorComando | null
  bridge_id: string | null
  intentos: number
  error: string | null
  creado_en: string
  enviado_en: string | null
  resuelto_en: string | null
}

export interface Automatizacion {
  id: number
  nombre: string
  sala_id: number
  activa: boolean
  pulse_device_id: number
  variable: VariableAmbiental
  operador: OperadorComparacion
  valor_objetivo: number
  duracion_minima_segundos: number
  operador_apagado: OperadorComparacion | null
  valor_apagado: number | null
  duracion_apagado_segundos: number | null
  cooldown_segundos: number
  dispositivo_id: number
  accion_encendido: Record<string, unknown>
  accion_apagado: Record<string, unknown>
  accion_fail_safe: AccionFailSafe
  ultimo_disparo_en: string | null
  ultimo_disparo_tipo: TipoDisparo | null
  created_at: string
  updated_at: string
  sala?: SalaCultivo
  pulse_device?: PulseDevice
  dispositivo?: DispositivoControlable
}

export interface EjecucionAutomatizacion {
  id: number
  automatizacion_id: number
  tipo: TipoEjecucionAutomatizacion
  variable_valor: number | null
  comando_id: number | null
  mensaje: string | null
  creado_en: string
}
