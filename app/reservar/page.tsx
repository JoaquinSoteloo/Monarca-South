"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  X,
} from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import Image from "next/image"
import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import { generarHorarios, type ConfigCitas } from "@/lib/horarios"
import { bigintComoNumero, mapReservaError, normalizarDni } from "@/lib/reservas"

// pdfjs-dist toca `window`/`document` al evaluarse, así que el visor no
// puede pasar por el render en el servidor (rompe con "window is not
// defined"). ssr:false lo difiere al cliente, recién cuando se abre el modal.
const PaginasCatalogo = dynamic(() => import("./paginas-catalogo"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center bg-[#EDEAE0] py-10">
      <Loader2 className="h-6 w-6 animate-spin text-[#1F3D2B]" aria-hidden />
    </div>
  ),
})

// Fila devuelta por la RPC mi_cita_hoy (ver scripts/058_public_reservation_rpcs.sql).
interface MiCita {
  id: number
  hora: string
  estado: string
}

type EstadoDatos = "cargando" | "error" | "listo"
type Paso = 1 | 2

// Paleta de marca de /reservar (verde bosque + dorado como detalle puntual).
// Acotada a esta página: el tema global (globals.css, dashboard, login) no
// se toca.
const VERDE_BOSQUE = "#1F3D2B"
const DORADO = "#C9A66B"
// Serif de marca cargada en app/reservar/layout.tsx (Fraunces), expuesta acá
// como variable CSS para usar en unos pocos elementos "hero" (título,
// números de hora). El resto de la tipografía sigue con la Geist global.
const FUENTE_SERIF = "var(--font-fraunces)"

const ALERTA_ERROR = "rounded-lg border border-[#E7C9C0] bg-[#FBF1EE] px-3 py-2 text-sm text-[#8A3B2C]"
const BOTON_PRIMARIO = cn(
  "bg-[#1F3D2B] text-white hover:bg-[#17301F]",
  "disabled:cursor-not-allowed disabled:bg-[#CFE0D2] disabled:text-[#4C5B4E] disabled:opacity-100",
)
const INPUT_MARCA =
  "h-12 border-[#CBC4AE] bg-white text-base text-[#2B2A26] focus-visible:border-[#1F3D2B] focus-visible:ring-[#1F3D2B]/40"
const SOMBRA_TARJETA = "shadow-[0_16px_32px_-18px_rgba(15,36,23,0.45)]"

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// Emblema de hoja de cannabis (línea/silueta, siete folíolos), usado como
// marca de agua decorativa y como acento puntual en la confirmación. Club
// cannábico legal: la hoja es identidad de marca, no un ícono a evitar. Es un
// SVG propio y abstracto (geométrico, un solo color vía currentColor), no una
// foto ni un ícono realista/de librería.
function HojaCannabis({ className }: { className?: string }) {
  const foliolos = [
    { rot: -72, escala: 0.42 },
    { rot: -48, escala: 0.64 },
    { rot: -24, escala: 0.86 },
    { rot: 0, escala: 1 },
    { rot: 24, escala: 0.86 },
    { rot: 48, escala: 0.64 },
    { rot: 72, escala: 0.42 },
  ]

  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" aria-hidden focusable="false">
      <g transform="translate(60,62)">
        {foliolos.map((f, i) => (
          <g key={f.rot} transform={`rotate(${f.rot}) scale(${f.escala})`}>
            <path
              d="M0 0 C -7 -16 -8 -34 0 -52 C 8 -34 7 -16 0 0Z"
              fill="currentColor"
              opacity={i === 3 ? 0.95 : 0.7}
            />
          </g>
        ))}
      </g>
      <line x1="60" y1="62" x2="60" y2="82" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
    </svg>
  )
}

// Botón radio con feedback táctil (framer-motion). El tamaño de la opción no
// cambia entre estados: solo hay un `whileTap` transitorio que vuelve a su
// posición, así la grilla nunca se desplaza.
const HorarioOpcion = motion(RadioGroupItem)

// Identidad exterior: logo + "Monarca South" + "Reserva de turnos", centrados
// arriba. Composición sin cambios respecto de versiones anteriores.
function EncabezadoMarca() {
  return (
    <header className="relative z-10 flex items-center justify-center gap-3">
      <Image
        src="/logo-monarca.png"
        alt=""
        width={44}
        height={44}
        className="h-11 w-11 shrink-0 rounded-full object-contain"
        priority
      />
      <div className="text-left">
        <p className="text-base font-semibold leading-tight text-white" style={{ fontFamily: FUENTE_SERIF }}>
          Monarca South
        </p>
        <p className="text-xs leading-tight text-[#CFE0D2]">Reserva de turnos</p>
      </div>
    </header>
  )
}

// Botón que abre el catálogo en el visor embebido (CatalogoModal). Vive
// fuera de la tarjeta blanca, junto al encabezado, para que esté visible en
// cualquier paso del flujo sin competir con el formulario. A propósito no es
// un <a target="_blank">: en varios navegadores in-app (Instagram, WhatsApp)
// eso dispara una descarga del PDF en vez de mostrarlo.
function BotonCatalogo({ onAbrir }: { onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="relative z-10 mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-[#F7F4EC]/90 underline underline-offset-2 hover:text-white"
    >
      <BookOpen className="h-4 w-4 text-[#C9A66B]" aria-hidden />
      Ver catálogo de productos
    </button>
  )
}

// Visor embebido del catálogo en un modal a pantalla completa. Mantiene al
// socio dentro de /reservar en vez de navegar a la URL del PDF, que es lo
// que dispara la descarga en los navegadores in-app (Instagram, WhatsApp).
function CatalogoModal({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  useEffect(() => {
    if (!abierto) return

    const overflowOriginal = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar()
    }
    window.addEventListener("keydown", alPresionarTecla)

    return () => {
      document.body.style.overflow = overflowOriginal
      window.removeEventListener("keydown", alPresionarTecla)
    }
  }, [abierto, onCerrar])

  return (
    <AnimatePresence>
      {abierto && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onCerrar}
          role="dialog"
          aria-modal="true"
          aria-label="Catálogo de productos"
        >
          <motion.div
            className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[#F7F4EC] shadow-2xl"
            initial={{ scale: 0.97, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E4DFCF] px-4 py-3">
              <p className="text-sm font-semibold text-[#1F3D2B]">Catálogo de productos</p>
              <button
                type="button"
                onClick={onCerrar}
                aria-label="Cerrar catálogo"
                className="rounded-full p-1.5 text-[#6B6558] transition-colors hover:bg-[#EDEAE0] hover:text-[#1F3D2B]"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <PaginasCatalogo />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Fondo verde bosque sólido de toda la página + una única tarjeta marfil
// centrada (máx. ~580px, también en escritorio). No usa el layout del
// dashboard: sin sidebar, sin navegación administrativa. Un leve degradado
// radial y una hoja de cannabis como marca de agua le dan profundidad al
// verde sólido sin volverlo un fondo decorativo cargado.
function PageShell({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = useReducedMotion()
  const [catalogoAbierto, setCatalogoAbierto] = useState(false)

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{
        background: "radial-gradient(circle at 50% -8%, #2C5039 0%, #1F3D2B 60%)",
      }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-6 h-56 w-56 text-white/[0.06] sm:h-72 sm:w-72"
        animate={prefersReducedMotion ? undefined : { rotate: [0, 6, 0], scale: [1, 1.04, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      >
        <HojaCannabis className="h-full w-full" />
      </motion.div>

      <div className="relative mx-auto flex w-full max-w-[580px] flex-col px-4 pt-5 sm:pt-6">
        <EncabezadoMarca />
        <BotonCatalogo onAbrir={() => setCatalogoAbierto(true)} />
        <main className="mt-4 sm:mt-5">{children}</main>
        <p className="mt-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] text-center text-xs text-white/55">
          Monarca South · Club cannábico
        </p>
      </div>

      <CatalogoModal abierto={catalogoAbierto} onCerrar={() => setCatalogoAbierto(false)} />
    </div>
  )
}

function Tarjeta({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative z-10 rounded-[20px] bg-[#F7F4EC] p-5 sm:p-7", SOMBRA_TARJETA, className)}>
      {children}
    </div>
  )
}

function IconoCirculo({ children, bg }: { children: React.ReactNode; bg: string }) {
  return (
    <div className={cn("flex h-14 w-14 items-center justify-center rounded-full", bg)}>{children}</div>
  )
}

// Indicador compacto de progreso: "Paso X de 2" + dos segmentos pequeños. El
// segmento del paso activo usa el dorado de marca como único acento; no hay
// un stepper grande ni se repiten descripciones largas en cada paso.
function IndicadorPaso({ paso }: { paso: Paso }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="flex gap-1" aria-hidden>
        {([1, 2] as const).map((n) => (
          <motion.span
            key={n}
            className="h-1 w-6 rounded-full"
            animate={{ backgroundColor: n < paso ? VERDE_BOSQUE : n === paso ? DORADO : "#E4DFCF" }}
            transition={{ duration: 0.25 }}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-[#6B6558]">Paso {paso} de 2</span>
    </div>
  )
}

// Ráfaga breve y sutil de puntos de marca (verde + dorado) al confirmarse la
// reserva. Puramente decorativo: si el usuario prefiere menos movimiento, no
// se renderiza.
function DestelloConfirmacion() {
  const prefersReducedMotion = useReducedMotion()
  if (prefersReducedMotion) return null

  const puntos = [
    { x: -46, y: -18, color: DORADO, size: 7 },
    { x: 42, y: -22, color: VERDE_BOSQUE, size: 6 },
    { x: -30, y: 30, color: VERDE_BOSQUE, size: 5 },
    { x: 34, y: 26, color: DORADO, size: 6 },
    { x: 0, y: -40, color: DORADO, size: 5 },
    { x: 0, y: 40, color: VERDE_BOSQUE, size: 5 },
  ]

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {puntos.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ backgroundColor: p.color, width: p.size, height: p.size }}
          initial={{ x: 0, y: 0, opacity: 0.9, scale: 0.4 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }}
        />
      ))}
    </div>
  )
}

export default function ReservarPage() {
  const [paso, setPaso] = useState<Paso>(1)
  const [direccion, setDireccion] = useState<1 | -1>(1)
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    dni: "",
  })
  const [horarioSeleccionado, setHorarioSeleccionado] = useState<string | null>(null)
  const [config, setConfig] = useState<ConfigCitas | null>(null)
  const [ocupacion, setOcupacion] = useState<Record<string, number> | null>(null)
  const [estadoDatos, setEstadoDatos] = useState<EstadoDatos>("cargando")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [citaExistente, setCitaExistente] = useState<MiCita | null>(null)
  const [horaActual, setHoraActual] = useState<number>(new Date().getHours())

  const supabase = createClient()
  const prefersReducedMotion = useReducedMotion()
  const pasoHeadingRef = useRef<HTMLHeadingElement>(null)
  const esPrimerRender = useRef(true)

  // Único punto de cambio de paso: registra la dirección (para la transición
  // de entrada/salida) y actualiza el estado local. No dispara ninguna
  // consulta ni mutación — es navegación puramente visual.
  const irAPaso = (nuevo: Paso) => {
    setDireccion(nuevo > paso ? 1 : -1)
    setPaso(nuevo)
  }

  // Carga config + ocupación juntas. Si cualquiera de las dos falla no hay
  // forma de saber si hay cupo o si las reservas siguen abiertas, así que
  // tratamos el conjunto como una sola unidad: o las dos cargaron bien, o
  // mostramos el estado de error (nunca asumimos "cero reservas" ni la
  // configuración por defecto ante una falla real de red).
  const cargarDatos = useCallback(async () => {
    setEstadoDatos("cargando")
    const [configRes, ocupacionRes] = await Promise.all([
      supabase.from("config_citas").select("*").eq("id", 1).maybeSingle(),
      supabase.rpc("citas_ocupacion_hoy"),
    ])

    if (configRes.error || !configRes.data || ocupacionRes.error) {
      console.log("[v0] Error cargando config/ocupación:", configRes.error, ocupacionRes.error)
      setEstadoDatos("error")
      return
    }

    const mapa: Record<string, number> = {}
    for (const fila of ocupacionRes.data ?? []) {
      // La BD guarda HH:MM:SS, comparamos solo HH:MM.
      mapa[String(fila.hora).substring(0, 5)] = bigintComoNumero(fila.cantidad)
    }

    setConfig(configRes.data)
    setOcupacion(mapa)
    setEstadoDatos("listo")
  }, [supabase])

  useEffect(() => {
    cargarDatos()
    // Actualizar la hora cada minuto por si el usuario deja abierta la página
    // (afecta el aviso de cierre de reservas, que igual valida el servidor).
    const interval = setInterval(() => {
      setHoraActual(new Date().getHours())
    }, 60000)
    return () => clearInterval(interval)
  }, [cargarDatos])

  // Al cambiar de paso, llevar el foco al encabezado del paso nuevo (no en
  // el primer render, para no robarle el foco a la página al cargar).
  useEffect(() => {
    if (esPrimerRender.current) {
      esPrimerRender.current = false
      return
    }
    pasoHeadingRef.current?.focus()
  }, [paso])

  const irAPasoHorario = () => {
    setCitaExistente(null)
    setError(null)
    irAPaso(1)
  }

  const ejecutarReserva = async (citaPrevia?: MiCita) => {
    if (loading) return
    setLoading(true)
    setError(null)

    const dniLimpio = normalizarDni(formData.dni)

    const { error: rpcError } = citaPrevia
      ? await supabase.rpc("reprogramar_reserva_publica", {
          p_nombre: formData.nombre,
          p_apellido: formData.apellido,
          p_documento: dniLimpio,
          p_hora_nueva: horarioSeleccionado,
        })
      : await supabase.rpc("crear_reserva_publica", {
          p_nombre: formData.nombre,
          p_apellido: formData.apellido,
          p_documento: dniLimpio,
          p_hora: horarioSeleccionado,
        })

    if (rpcError) {
      console.log("[v0] Error RPC reserva:", rpcError)
      setError(mapReservaError(rpcError))
      setLoading(false)
      // El turno se completó entre que cargamos la disponibilidad y que
      // confirmamos: no lo damos por reservado, conservamos los datos
      // ingresados, refrescamos cupos y volvemos al paso de horarios para
      // que elijan otro (sin elegirlo nosotros).
      if (rpcError.code === "MC003") {
        setHorarioSeleccionado(null)
        setCitaExistente(null)
        irAPaso(1)
        cargarDatos()
      }
      return
    }

    setSuccess(true)
    setLoading(false)
    setCitaExistente(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading || !config || !ocupacion) return
    setError(null)

    if (horaActual >= config.hora_limite_reserva) {
      setError(`Las reservas están cerradas después de las ${config.hora_limite_reserva}:00hs`)
      return
    }

    if (!horarioSeleccionado) {
      setError("Por favor seleccioná un horario")
      irAPaso(1)
      return
    }

    if (!formData.nombre || !formData.apellido || !formData.dni) {
      setError("Por favor completá todos los campos")
      return
    }

    // Chequeo de UX: el cupo real lo garantiza el lock server-side dentro de
    // las RPC.
    if ((ocupacion[horarioSeleccionado] ?? 0) >= config.max_por_turno) {
      setError("Este horario ya está completo, elegí otro")
      setHorarioSeleccionado(null)
      irAPaso(1)
      cargarDatos()
      return
    }

    const dniLimpio = normalizarDni(formData.dni)

    setLoading(true)
    const { data, error: miCitaError } = await supabase.rpc("mi_cita_hoy", { p_documento: dniLimpio })

    if (miCitaError) {
      console.log("[v0] Error RPC mi_cita_hoy:", miCitaError)
      setError(mapReservaError(miCitaError))
      setLoading(false)
      return
    }

    const citaPrevia: MiCita | null = data && data.length > 0 ? data[0] : null

    if (citaPrevia) {
      if (citaPrevia.hora.substring(0, 5) === horarioSeleccionado) {
        setError("Ya tenés una cita reservada para este mismo horario")
        setLoading(false)
        return
      }
      // Mostrar la confirmación de cambio de turno, dentro de la misma tarjeta.
      setCitaExistente(citaPrevia)
      setLoading(false)
      return
    }

    await ejecutarReserva()
  }

  const fechaTexto = capitalizar(format(new Date(), "EEEE d 'de' MMMM 'de' yyyy", { locale: es }))

  // --- Estados de carga y error de disponibilidad -------------------------

  if (estadoDatos === "cargando") {
    return (
      <PageShell>
        <Tarjeta className="space-y-4 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1F3D2B]" aria-hidden />
          <p className="text-sm text-[#6B6558]" role="status">
            Cargando horarios disponibles…
          </p>
        </Tarjeta>
      </PageShell>
    )
  }

  if (estadoDatos === "error" || !config || !ocupacion) {
    return (
      <PageShell>
        <Tarjeta className="space-y-4 text-center">
          <IconoCirculo bg="mx-auto bg-[#F6EFDD]">
            <AlertTriangle className="h-7 w-7 text-[#8A6B1E]" aria-hidden />
          </IconoCirculo>
          <div>
            <h2 className="text-lg font-semibold text-[#2B2A26]">No pudimos cargar la disponibilidad</h2>
            <p className="mt-1 text-sm text-[#6B6558]">Revisá tu conexión e intentá de nuevo.</p>
          </div>
          <Button onClick={cargarDatos} className={cn("h-12 w-full", BOTON_PRIMARIO)}>
            Reintentar
          </Button>
        </Tarjeta>
      </PageShell>
    )
  }

  const HORARIOS = generarHorarios(config.hora_inicio, config.hora_fin)
  const MAX_POR_TURNO = config.max_por_turno
  const reservasCerradas = horaActual >= config.hora_limite_reserva
  const hayCuposLibres = HORARIOS.some((hora) => (ocupacion[hora] ?? 0) < MAX_POR_TURNO)

  // --- Reserva confirmada ---------------------------------------------------

  if (success) {
    return (
      <PageShell>
        <Tarjeta className="relative space-y-4 text-center">
          <DestelloConfirmacion />
          <motion.div
            initial={prefersReducedMotion ? undefined : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
          >
            <IconoCirculo bg="mx-auto bg-[#EFF5EE] ring-2 ring-[#C9A66B]/50 ring-offset-2 ring-offset-[#F7F4EC]">
              <CheckCircle2 className="h-7 w-7 text-[#1F3D2B]" aria-hidden />
            </IconoCirculo>
          </motion.div>
          <div className="flex items-center justify-center gap-1.5">
            <HojaCannabis className="h-4 w-4 text-[#C9A66B]" />
            <h2 className="text-lg font-semibold text-[#2B2A26]">Tu turno está confirmado</h2>
          </div>
          <div>
            <p className="text-3xl font-semibold text-[#1F3D2B]" style={{ fontFamily: FUENTE_SERIF }}>
              {horarioSeleccionado}hs
            </p>
            <p className="text-sm text-[#6B6558]">{fechaTexto}</p>
          </div>
          <p className="text-sm text-[#2B2A26]">
            {formData.nombre} {formData.apellido}
          </p>
          <p className="text-xs text-[#8A8474]">Te esperamos en Monarca South. Recordá llegar a horario.</p>
        </Tarjeta>
      </PageShell>
    )
  }

  // --- Cambio de turno existente -------------------------------------------

  if (citaExistente) {
    return (
      <PageShell>
        <Tarjeta className="space-y-4">
          <div className="text-center">
            <IconoCirculo bg="mx-auto bg-[#F6EFDD]">
              <AlertTriangle className="h-6 w-6 text-[#8A6B1E]" aria-hidden />
            </IconoCirculo>
            <h2 className="mt-3 text-lg font-semibold text-[#2B2A26]">Ya tenés un turno para hoy</h2>
          </div>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <div className="w-full rounded-xl border border-[#E4DFCF] bg-white p-4 text-center sm:w-40">
              <p className="text-xs font-medium uppercase tracking-wide text-[#8A8474]">Turno actual</p>
              <p className="mt-1 text-xl font-semibold text-[#2B2A26]">
                {citaExistente.hora.substring(0, 5)}hs
              </p>
            </div>
            <ArrowRight className="hidden h-5 w-5 shrink-0 text-[#8A8474] sm:block" aria-hidden />
            <ArrowDown className="h-5 w-5 shrink-0 text-[#8A8474] sm:hidden" aria-hidden />
            <div className="w-full rounded-xl bg-[#1F3D2B] p-4 text-center sm:w-40">
              <p className="text-xs font-medium uppercase tracking-wide text-[#CFE0D2]">Nuevo horario</p>
              <p className="mt-1 text-xl font-semibold text-white">{horarioSeleccionado}hs</p>
            </div>
          </div>

          <p className="text-center text-xs text-[#8A8474]">
            Al confirmar el cambio, se liberará tu horario anterior.
          </p>

          {error && (
            <div role="alert" aria-live="assertive" className={ALERTA_ERROR}>
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 border-[#D8D3C2]"
              disabled={loading}
              onClick={() => {
                setCitaExistente(null)
                setError(null)
              }}
            >
              Volver
            </Button>
            <Button
              type="button"
              className={cn("h-12 flex-1", BOTON_PRIMARIO)}
              disabled={loading}
              onClick={() => ejecutarReserva(citaExistente)}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Confirmando…
                </>
              ) : (
                "Confirmar cambio"
              )}
            </Button>
          </div>
        </Tarjeta>
      </PageShell>
    )
  }

  // --- Reservas cerradas (informativo, no un fallo del sistema) ------------

  if (reservasCerradas) {
    return (
      <PageShell>
        <Tarjeta className="space-y-4 text-center">
          <IconoCirculo bg="mx-auto bg-[#EAF2EA]">
            <Clock className="h-7 w-7 text-[#3C6B49]" aria-hidden />
          </IconoCirculo>
          <div>
            <h2 className="text-lg font-semibold text-[#1F3D2B]">Las reservas de hoy están cerradas</h2>
            <p className="mt-1 text-sm text-[#6B6558]">
              Las reservas online están disponibles hasta las{" "}
              <span className="font-medium text-[#2B2A26]">{config.hora_limite_reserva}:00hs</span>.
            </p>
          </div>
          <p className="text-xs text-[#8A8474]">Podés volver a reservar mañana a partir de las 00:00hs.</p>
        </Tarjeta>
      </PageShell>
    )
  }

  // --- Sin cupos disponibles (disponibilidad, no un error) -----------------

  if (!hayCuposLibres) {
    return (
      <PageShell>
        <Tarjeta className="space-y-4 text-center">
          <IconoCirculo bg="mx-auto bg-[#EAF2EA]">
            <CalendarClock className="h-7 w-7 text-[#3C6B49]" aria-hidden />
          </IconoCirculo>
          <div>
            <h2 className="text-lg font-semibold text-[#1F3D2B]">No quedan turnos disponibles para hoy</h2>
            <p className="mt-1 text-sm text-[#6B6558]">Todos los horarios de hoy ya están completos.</p>
          </div>
          <Button
            onClick={cargarDatos}
            variant="outline"
            className="h-12 w-full border-[#1F3D2B] text-[#1F3D2B] hover:bg-[#EFF5EE]"
          >
            Volver a consultar
          </Button>
        </Tarjeta>
      </PageShell>
    )
  }

  // --- Flujo de reserva: paso 1 (horario) / paso 2 (datos) -----------------

  const variantesPaso = {
    enter: (dir: number) => ({ opacity: 0, x: prefersReducedMotion ? 0 : dir * 24 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: prefersReducedMotion ? 0 : dir * -24 }),
  }

  return (
    <PageShell>
      <Tarjeta className="overflow-hidden">
        <h1
          className="text-2xl font-semibold text-[#2B2A26] sm:text-[1.75rem]"
          style={{ fontFamily: FUENTE_SERIF }}
        >
          Reservá tu turno
        </h1>
        <IndicadorPaso paso={paso} />

        <AnimatePresence mode="wait" custom={direccion} initial={false}>
          <motion.div
            key={paso}
            custom={direccion}
            variants={variantesPaso}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.22, ease: "easeOut" }}
          >
            {paso === 1 ? (
              <div>
                <h2
                  ref={pasoHeadingRef}
                  tabIndex={-1}
                  className="text-base font-semibold text-[#1F3D2B] outline-none"
                >
                  Elegí tu horario
                </h2>
                <p className="mt-1 text-sm text-[#5C6B5E]">
                  {fechaTexto} · Reservas hasta las {config.hora_limite_reserva}:00hs
                </p>

                <RadioGroup
                  className="mt-4 grid grid-cols-2 gap-2 min-[360px]:grid-cols-3"
                  value={horarioSeleccionado ?? undefined}
                  onValueChange={setHorarioSeleccionado}
                  aria-label="Horarios disponibles para hoy"
                >
                  {HORARIOS.map((hora) => {
                    const cantidad = ocupacion[hora] ?? 0
                    const cuposLibres = Math.max(0, MAX_POR_TURNO - cantidad)
                    const lleno = cuposLibres <= 0
                    const seleccionado = horarioSeleccionado === hora

                    return (
                      <HorarioOpcion
                        key={hora}
                        value={hora}
                        disabled={lleno}
                        whileTap={lleno || prefersReducedMotion ? undefined : { scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 500, damping: 25 }}
                        className={cn(
                          "flex h-[68px] flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] px-2 text-center transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3D2B] focus-visible:ring-offset-2",
                          lleno && "cursor-not-allowed border-[#E4DFCF] bg-[#EDEAE0] text-[#8C8879]",
                          !lleno &&
                            seleccionado &&
                            "border-[#1F3D2B] bg-[#1F3D2B] text-white ring-2 ring-[#0F2417]/40 ring-offset-2 ring-offset-[#F7F4EC]",
                          !lleno &&
                            !seleccionado &&
                            "border-[#AEC3B1] bg-white text-[#2B2A26] hover:border-[#1F3D2B] hover:bg-[#F4F8F4]",
                        )}
                      >
                        <span className="flex items-center gap-1 text-base font-bold leading-none">
                          {hora}
                          {seleccionado && <CheckCircle2 className="h-4 w-4" aria-hidden />}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] leading-none",
                            lleno ? "text-[#8C8879]" : seleccionado ? "text-white/85" : "text-[#4B5D4E]",
                          )}
                        >
                          {lleno ? "Completo" : `${cuposLibres} ${cuposLibres === 1 ? "lugar" : "lugares"}`}
                        </span>
                      </HorarioOpcion>
                    )
                  })}
                </RadioGroup>

                {error && (
                  <div role="alert" aria-live="assertive" className={cn("mt-4", ALERTA_ERROR)}>
                    {error}
                  </div>
                )}

                <p className="mt-4 min-h-[1.25rem] text-sm text-[#3C6B49]" aria-live="polite">
                  {horarioSeleccionado ? `Elegiste las ${horarioSeleccionado}` : ""}
                </p>
                <Button
                  type="button"
                  className={cn("mt-2 h-12 w-full", BOTON_PRIMARIO)}
                  disabled={!horarioSeleccionado}
                  onClick={() => irAPaso(2)}
                >
                  Continuar
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-[#EAF2EA] px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <CalendarClock className="h-4 w-4 shrink-0 text-[#3C6B49]" aria-hidden />
                    <p className="truncate text-sm text-[#2B2A26]">
                      <span className="font-semibold text-[#1F3D2B]">{horarioSeleccionado}hs</span> ·{" "}
                      {fechaTexto}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={irAPasoHorario}
                    className="shrink-0 text-sm font-medium text-[#1F3D2B] underline underline-offset-2"
                  >
                    Cambiar
                  </button>
                </div>

                <h2
                  ref={pasoHeadingRef}
                  tabIndex={-1}
                  className="text-base font-semibold text-[#1F3D2B] outline-none"
                >
                  Completá tus datos
                </h2>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="nombre">Nombre</Label>
                    <Input
                      id="nombre"
                      autoComplete="given-name"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      placeholder="Juan"
                      required
                      className={INPUT_MARCA}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="apellido">Apellido</Label>
                    <Input
                      id="apellido"
                      autoComplete="family-name"
                      value={formData.apellido}
                      onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                      placeholder="Pérez"
                      required
                      className={INPUT_MARCA}
                    />
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="dni">Documento (DNI)</Label>
                  <Input
                    id="dni"
                    inputMode="numeric"
                    autoComplete="off"
                    value={formData.dni}
                    onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                    placeholder="12345678"
                    required
                    className={INPUT_MARCA}
                  />
                </div>

                {error && (
                  <div role="alert" aria-live="assertive" className={cn("mt-4", ALERTA_ERROR)}>
                    {error}
                  </div>
                )}

                <div className="mt-5 space-y-2">
                  <Button type="submit" className={cn("h-12 w-full", BOTON_PRIMARIO)} disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Confirmando…
                      </>
                    ) : (
                      "Confirmar reserva"
                    )}
                  </Button>
                  <p className="text-center text-xs text-[#8A8474]">
                    La reserva queda confirmada al finalizar este paso
                  </p>
                  <button
                    type="button"
                    onClick={irAPasoHorario}
                    disabled={loading}
                    className="block w-full text-center text-sm font-medium text-[#1F3D2B] underline underline-offset-2 disabled:opacity-50"
                  >
                    Volver a elegir horario
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </AnimatePresence>
      </Tarjeta>
    </PageShell>
  )
}
