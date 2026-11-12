/**
 * Catálogo de permisos (scripts/084). Cada pantalla tiene un permiso "ver" y,
 * algunas, acciones sensibles aparte. Los roles se arman en Usuarios → Roles
 * eligiendo de esta lista; la comisión directiva tiene todos, siempre.
 *
 * Las claves también se usan en la base (rol_permisos y tiene_permiso()), así
 * que no se renombran: si una acción deja de existir, se saca de acá.
 */

export const ROL_COMISION = "comision"

export interface Accion {
  clave: string
  label: string
}

export interface PantallaPermisos {
  ruta: string
  nombre: string
  grupo: string
  ver: string
  acciones: Accion[]
}

export const PANTALLAS: PantallaPermisos[] = [
  { ruta: "/", nombre: "Inicio", grupo: "Principal", ver: "inicio.ver", acciones: [] },
  { ruta: "/equipo", nombre: "Equipo", grupo: "Principal", ver: "equipo.ver", acciones: [] },
  { ruta: "/sede", nombre: "Sede", grupo: "Principal", ver: "sede.ver", acciones: [] },
  {
    ruta: "/ventas",
    nombre: "Entregas",
    grupo: "Principal",
    ver: "entregas.ver",
    acciones: [{ clave: "entregas.autorizar", label: "Autorizar excepciones a las reglas de entrega" }],
  },
  {
    ruta: "/historial",
    nombre: "Historial",
    grupo: "Principal",
    ver: "historial.ver",
    acciones: [{ clave: "entregas.editar", label: "Editar y eliminar entregas" }],
  },
  {
    ruta: "/stock",
    nombre: "Stock",
    grupo: "Operación",
    ver: "stock.ver",
    acciones: [{ clave: "stock.editar", label: "Agregar y editar genéticas y precios" }],
  },
  {
    ruta: "/cosechas",
    nombre: "Cosechas",
    grupo: "Operación",
    ver: "cosechas.ver",
    acciones: [{ clave: "cosechas.borrar", label: "Borrar cierres de cosecha" }],
  },
  { ruta: "/ciclos", nombre: "Ciclos", grupo: "Operación", ver: "ciclos.ver", acciones: [] },
  { ruta: "/procesos", nombre: "Procedimientos", grupo: "Operación", ver: "procesos.ver", acciones: [] },
  { ruta: "/cultivo", nombre: "Cultivo", grupo: "Operación", ver: "cultivo.ver", acciones: [] },
  { ruta: "/riego", nombre: "Riego", grupo: "Operación", ver: "riego.ver", acciones: [] },
  { ruta: "/monitoreo", nombre: "Monitoreo", grupo: "Operación", ver: "monitoreo.ver", acciones: [] },
  { ruta: "/citas", nombre: "Citas", grupo: "Operación", ver: "citas.ver", acciones: [] },
  { ruta: "/socios", nombre: "Socios", grupo: "Personas", ver: "socios.ver", acciones: [] },
  { ruta: "/externos", nombre: "Externos", grupo: "Personas", ver: "externos.ver", acciones: [] },
  { ruta: "/sucursales", nombre: "Sucursales", grupo: "Personas", ver: "sucursales.ver", acciones: [] },
  { ruta: "/caja", nombre: "Caja", grupo: "Finanzas", ver: "caja.ver", acciones: [] },
  {
    ruta: "/gastos",
    nombre: "Gastos",
    grupo: "Finanzas",
    ver: "gastos.ver",
    acciones: [
      { clave: "gastos.todos", label: "Ver todos los gastos y los totales (sin esto, solo carga y ve los suyos)" },
      { clave: "gastos.categorias", label: "Crear, renombrar y borrar categorías" },
    ],
  },
  {
    ruta: "/aportes",
    nombre: "Aportes de capital",
    grupo: "Finanzas",
    ver: "aportes.ver",
    acciones: [{ clave: "aportes.editar", label: "Cargar, editar y borrar aportes" }],
  },
  {
    ruta: "/retribuciones",
    nombre: "Retribuciones",
    grupo: "Finanzas",
    ver: "retribuciones.ver",
    acciones: [{ clave: "retribuciones.liquidar", label: "Cargar personas, liquidar y anular liquidaciones" }],
  },
  {
    ruta: "/deudas",
    nombre: "Deudas",
    grupo: "Finanzas",
    ver: "deudas.ver",
    acciones: [{ clave: "deudas.corregir", label: "Corregir o anular pagos cargados por error" }],
  },
  { ruta: "/automatizaciones", nombre: "Automatizaciones", grupo: "Control", ver: "automatizaciones.ver", acciones: [] },
  { ruta: "/control-manual", nombre: "Control manual", grupo: "Control", ver: "control-manual.ver", acciones: [] },
  { ruta: "/modo-ausente", nombre: "Modo Ausente", grupo: "Control", ver: "modo-ausente.ver", acciones: [] },
  {
    ruta: "/usuarios",
    nombre: "Usuarios",
    grupo: "Control",
    ver: "usuarios.ver",
    acciones: [
      { clave: "usuarios.administrar", label: "Crear usuarios, roles y permisos" },
      { clave: "reglas.editar", label: "Cambiar las reglas de entrega" },
    ],
  },
]

export const TODOS_LOS_PERMISOS: string[] = PANTALLAS.flatMap((p) => [p.ver, ...p.acciones.map((a) => a.clave)])

/** Rutas que no son una pantalla del catálogo y usan el permiso de otra (el Chat es parte de Equipo). */
const RUTAS_CON_PERMISO_DE: Record<string, string> = { "/chat": "/equipo" }

/** Permiso "ver" de la pantalla de una ruta (el prefijo más largo que coincide). */
export function permisoDeRuta(pathname: string): string | null {
  for (const [ruta, de] of Object.entries(RUTAS_CON_PERMISO_DE)) {
    if (pathname === ruta || pathname.startsWith(`${ruta}/`)) return permisoDeRuta(de)
  }
  let mejor: PantallaPermisos | null = null
  for (const p of PANTALLAS) {
    const coincide = p.ruta === "/" ? pathname === "/" : pathname === p.ruta || pathname.startsWith(`${p.ruta}/`)
    if (coincide && (!mejor || p.ruta.length > mejor.ruta.length)) mejor = p
  }
  return mejor?.ver ?? null
}

export function tienePermiso(permisos: readonly string[] | null | undefined, permiso: string): boolean {
  return !!permisos?.includes(permiso)
}
