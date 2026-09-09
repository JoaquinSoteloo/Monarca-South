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
