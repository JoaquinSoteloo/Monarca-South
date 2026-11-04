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
  // "externo" = persona no socia cargada en el sistema (scripts/066).
  tipo: "socio" | "externo"
  // Registro genérico "No socios": conserva su historial, sin entregas nuevas.
  es_generico: boolean
  // Checklist de documentos y vencimiento del REPROCANN (scripts/083).
  doc_credencial_reprocann: boolean
  doc_codigo_vinculacion: boolean
  doc_dni: boolean
  doc_notas_firmadas: boolean
  reprocann_vence: string | null
  created_at: string
  updated_at: string
  membresia?: Membresia
  sucursal?: Sucursal
  // Calculado en la página (lib/consumo.ts), no es columna.
  entregas_mes?: number
}

/** Clave de public.roles (scripts/084). "comision" es fija y tiene todos los permisos. */
export type RolUsuario = string

export interface Perfil {
  user_id: string
  nombre: string
  rol: RolUsuario
  activo: boolean
  created_at: string
  updated_at: string
}

export interface ConfigEntregas {
  tope_deuda: number
  dias_max_pendiente: number
  max_entregas_externo_mes: number
}

export interface Genetica {
  id: string
  nombre: string
  descripcion: string | null
  /** Stock para entregar sueltos. */
  gramos_disponibles: number
  /** Stock reservado para enrolados (scripts/068). */
  gramos_enrolados: number
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
  detalle_id?: string | null // Sólo para editar_venta: id de la fila detalle_venta original (null/ausente = línea nueva)
}

export interface Venta {
  id: string
  socio_id: string
  genetica_id: string | null
  gramos: number
  precio_unitario: number
  total: number
  /** "retribucion": se pagó con el sueldo de alguien del equipo; "mixto": parte así y parte en plata (scripts/091). */
  metodo_pago: "efectivo" | "transferencia" | "pendiente" | "mixto" | "retribucion"
  tipo_venta: "gramos" | "enrolados" | "mixto" | "producto"
  cantidad_enrolados: number | null
  peso_enrolados: number | null
  notas: string | null
  saldo_pendiente: number
  monto_pagado: number
  created_at: string
  socio?: Socio
  genetica?: Genetica
  producto?: Producto
  detalles?: DetalleVenta[]
  pagos?: Pago[]
}

export interface Gasto {
  id: string
  descripcion: string
  monto: number
  categoria: string
  /** Proyecto opcional (ej. "Sala nueva"), scripts/069. */
  proyecto: string | null
  /** Aporte que devuelve (sólo en la categoría de devolución), scripts/070. */
  aporte_id: string | null
  /** Las devoluciones van en la moneda del aporte; el resto, en pesos. */
  moneda: "ARS" | "USD"
  /** "producto": retribución pagada en cannabis (no mueve caja), scripts/072. */
  metodo_pago: "efectivo" | "transferencia" | "producto"
  fecha: string
  created_at: string
  updated_at: string
}

/** Persona del equipo con su retribución mensual (scripts/072). */
export interface MiembroEquipo {
  id: string
  nombre: string
  retribucion_mensual: number
  forma_cobro: "dinero" | "producto"
  /** Primer mes que se le debe (yyyy-mm-01). */
  desde: string
  /** Socio con el que retira, para el resumen de consumo (scripts/083). */
  socio_id: string | null
  activo: boolean
  nota: string | null
  created_at: string
  updated_at: string
}

export interface LiquidacionEquipo {
  id: string
  miembro_id: string
  /** Mes liquidado (yyyy-mm-01). */
  periodo: string
  fecha: string
  dinero: number
  metodo_pago: "efectivo" | "transferencia" | null
  genetica_id: string | null
  gramos: number
  cantidad_enrolados: number
  peso_enrolados: number
  precio_gramo: number
  precio_enrolado: number
  valor_producto: number
  /** La parte del sueldo que canceló deuda de sus entregas (scripts/091). */
  monto_deuda: number
  total: number
  nota: string | null
  usuario_nombre: string | null
  created_at: string
}

/** Aporte de capital con su saldo (vista aportes_capital_resumen, scripts/070). */
export interface AporteCapital {
  id: string
  aportante: string
  monto: number
  moneda: "ARS" | "USD"
  fecha: string
  cuotas: number
  /** Cuándo hay que devolverlo; null = cuando haya plata (scripts/071). */
  fecha_devolucion: string | null
  nota: string | null
  created_at: string
  updated_at: string
  devuelto: number
  cuotas_pagadas: number
  saldo: number
  ultima_devolucion: string | null
}

/** Cómo cuenta una categoría en el resultado del mes (scripts/069). */
export type EnResultado = "resultado" | "inversion" | "aparte"

export interface CategoriaGasto {
  id: string
  nombre: string
  /** Qué entra en la categoría. */
  descripcion: string | null
  en_resultado: EnResultado
  orden: number
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
  /** "retribucion": descontado del sueldo al liquidar (no es plata que entra), scripts/091. */
  metodo_pago: "efectivo" | "transferencia" | "retribucion"
  /** De qué liquidación salió un pago "retribucion". */
  liquidacion_id?: string | null
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
  mapa_macetas?: MapaMacetas
  mapa_version?: number
  fecha_vegetativo?: string | null
  fecha_floracion?: string | null
  fecha_cosecha?: string | null
}

export interface RegistroRiego {
  id: number
  fecha: string
  sala_id: number
  etapa: "esqueje" | "vegetativo" | "floracion" | "lavado"
  semana: number | null
  responsable: string
  ec_entrada: number | null
  ph_entrada: number | null
  litros_por_maceta: number | null
  ec_runoff: number | null
  ph_runoff: number | null
  drenaje_pct: number | null
  notas: string | null
  created_at: string
}

export interface MacetaCultivo {
  fila: number
  columna: number
  etiqueta: string
  genetica_id: string | null
  salud: "sin_evaluar" | "sana" | "observacion" | "enferma"
  notas: string
}

export type CicloCama = Pick<CamaCultivo, "estado" | "fecha_vegetativo" | "fecha_floracion" | "fecha_cosecha">

export interface MapaMacetas {
  filas: number
  columnas: number
  macetas: MacetaCultivo[]
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
export type RequisitoAusente = "encendido" | "apagado"

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
  // NULL = no es crítico para Modo Ausente (default). Ver lib/modo-ausente/.
  requisito_ausente: RequisitoAusente | null
  created_at: string
  updated_at: string
  sala?: SalaCultivo | null
}

// Modo Ausente / Cierre — ver lib/modo-ausente/engine.ts y
// scripts/051_create_modo_ausente.sql.
export interface ModoAusenteEstado {
  activo: boolean
  activado_en: string | null
  activado_por: string | null
  activado_desde: string | null
  desactivado_en: string | null
  desactivado_por: string | null
}

export type EstadoViolacionAusente = "ok" | "violacion"

export interface ModoAusenteViolacion {
  dispositivo_id: number
  estado: EstadoViolacionAusente
  motivo: string | null
  detectado_en: string | null
  notificado_en: string | null
  resuelto_notificado_en: string | null
  updated_at: string
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
