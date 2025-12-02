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
  activo: boolean
  created_at: string
  updated_at: string
}

export interface DetalleVenta {
  id: string
  venta_id: string
  genetica_id: string
  gramos: number
  cantidad_enrolados: number | null
  peso_enrolados: number | null
  peso_por_enrolado: number | null
  precio_unitario: number
  precio_enrolado: number | null
  subtotal: number
  created_at: string
  genetica?: Genetica
}

export interface LineaVenta {
  genetica_id: string
  gramos: number
  cantidad_enrolados: number
  peso_por_enrolado: number
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
  created_at: string
  socio?: Socio
  genetica?: Genetica
  detalles?: DetalleVenta[]
}
