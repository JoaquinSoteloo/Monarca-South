"use client"

/**
 * Selectores de fecha y de mes con el diseño de la app, en lugar de los
 * calendarios del navegador (cambian según el celular y no siguen los colores).
 * Usan el mismo texto que <input type="date"> y type="month" ("yyyy-MM-dd" y
 * "yyyy-MM"), así que los reemplazan sin cambiar cómo se guardan los datos.
 */
import * as React from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react"
import type { DateAfter, DateBefore } from "react-day-picker"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)

/** "yyyy-MM-dd" → fecha local (sin correrse por el huso horario). */
export function textoAFecha(texto: string | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto ?? "")
  if (!m) return undefined
  const fecha = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(fecha.getTime()) ? undefined : fecha
}

/** Fecha → "yyyy-MM-dd" ("" sin fecha), para los campos que guardan un Date. */
export function fechaATexto(fecha: Date | null | undefined): string {
  return fecha ? format(fecha, "yyyy-MM-dd") : ""
}

/** "Hoy, 4 nov 2026", "Mañana, 5 nov 2026" o "3 sep 2026". */
function textoFecha(fecha: Date): string {
  const corto = format(fecha, "d MMM yyyy", { locale: es })
  const dias = Math.round((fecha.getTime() - textoAFecha(fechaATexto(new Date()))!.getTime()) / 86400000)
  const relativo = dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : dias === -1 ? "Ayer" : null
  return relativo ? `${relativo}, ${corto}` : corto
}

/**
 * El botón que abre el globo: se ve como los demás campos de los formularios.
 * Va dentro de un contenedor flex que recibe el className (ancho o alto, como
 * "w-48" o "h-11") y se estira a su alto; sin alto, mide lo mismo que un Input.
 */
const claseCampo = cn(
  "flex min-h-9 w-full min-w-0 flex-1 items-center gap-2 self-stretch rounded-md border border-input bg-white px-3 py-1 text-left text-base shadow-xs outline-none transition-[color,box-shadow,border-color] md:text-sm",
  "hover:border-primary/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "data-[state=open]:border-ring data-[state=open]:ring-[3px] data-[state=open]:ring-ring/20",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
)

interface DatePickerProps {
  /** "yyyy-MM-dd", o "" si no hay fecha. */
  value: string
  onChange: (value: string) => void
  id?: string
  /** Primera y última fecha que se pueden elegir ("yyyy-MM-dd"). */
  min?: string
  max?: string
  placeholder?: string
  /** Muestra una cruz para dejar el campo sin fecha. */
  clearable?: boolean
  /** Mes y año en listas, para saltar lejos (por ejemplo, un vencimiento). */
  conAnios?: boolean
  disabled?: boolean
  /** Para el ancho o el alto del campo. */
  className?: string
  "aria-label"?: string
}

export function DatePicker({
  value,
  onChange,
  id,
  min,
  max,
  placeholder = "Elegí una fecha",
  clearable = false,
  conAnios = false,
  disabled,
  className,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const [abierto, setAbierto] = React.useState(false)
  const fecha = textoAFecha(value)
  const desde = textoAFecha(min)
  const hasta = textoAFecha(max)
  const hoy = fechaATexto(new Date())
  const hoySePuede = (!min || hoy >= min) && (!max || hoy <= max)
  const fueraDeRango: (DateBefore | DateAfter)[] = [
    ...(desde ? [{ before: desde }] : []),
    ...(hasta ? [{ after: hasta }] : []),
  ]
  const anioActual = new Date().getFullYear()

  function elegir(texto: string) {
    onChange(texto)
    setAbierto(false)
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <div className={cn("relative flex w-full", className)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={ariaLabel}
            title={fecha ? conMayuscula(format(fecha, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })) : undefined}
            className={cn(claseCampo, clearable && fecha && "pr-9")}
          >
            <CalendarIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {/* "Hoy"/"Ayer" depende del reloj: el servidor puede estar en otro día. */}
            <span suppressHydrationWarning className={cn("truncate", !fecha && "text-muted-foreground")}>
              {fecha ? textoFecha(fecha) : placeholder}
            </span>
          </button>
        </PopoverTrigger>
        {clearable && fecha && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Quitar la fecha"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverContent className="monarca-theme w-auto overflow-hidden rounded-xl p-0" align="start">
        <Calendar
          mode="single"
          selected={fecha}
          defaultMonth={fecha ?? (hasta && hoy > (max ?? "") ? hasta : desde && hoy < (min ?? "") ? desde : undefined)}
          onSelect={(dia) => dia && elegir(fechaATexto(dia))}
          disabled={fueraDeRango}
          // Sin startMonth/endMonth en min/max: el calendario deja de dibujar
          // los días del mes vecino y la última semana queda mal. Los días
          // fuera de rango se ven apagados y no se pueden elegir.
          startMonth={conAnios ? new Date(anioActual - 10, 0) : undefined}
          endMonth={conAnios ? new Date(anioActual + 10, 11) : undefined}
          captionLayout={conAnios ? "dropdown" : "label"}
          autoFocus
        />
        {(hoySePuede || (clearable && fecha)) && (
          <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-3 py-2">
            {hoySePuede ? (
              <Button type="button" variant="ghost" size="sm" className="text-primary hover:bg-primary/10 hover:text-primary" onClick={() => elegir(hoy)}>
                Hoy
              </Button>
            ) : (
              <span />
            )}
            {clearable && fecha && (
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => elegir("")}>
                Quitar fecha
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

interface MonthPickerProps {
  /** "yyyy-MM", o "" si no hay mes. */
  value: string
  onChange: (value: string) => void
  id?: string
  /** Primer y último mes que se pueden elegir ("yyyy-MM"). */
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

export function MonthPicker({
  value,
  onChange,
  id,
  min,
  max,
  placeholder = "Elegí un mes",
  disabled,
  className,
  "aria-label": ariaLabel,
}: MonthPickerProps) {
  const actual = format(new Date(), "yyyy-MM")
  const [abierto, setAbierto] = React.useState(false)
  const [anio, setAnio] = React.useState(() => Number((value || actual).slice(0, 4)))
  const valido = /^\d{4}-\d{2}$/.test(value)
  const texto = valido
    ? conMayuscula(format(new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1), "LLLL yyyy", { locale: es }))
    : null
  const fuera = (clave: string) => Boolean((min && clave < min) || (max && clave > max))

  function cambiarAbierto(si: boolean) {
    // Al abrir, muestra el año del mes elegido.
    if (si) setAnio(Number((valido ? value : actual).slice(0, 4)))
    setAbierto(si)
  }

  function elegir(clave: string) {
    onChange(clave)
    setAbierto(false)
  }

  return (
    <Popover open={abierto} onOpenChange={cambiarAbierto}>
      <div className={cn("flex w-full", className)}>
        <PopoverTrigger asChild>
          <button type="button" id={id} disabled={disabled} aria-label={ariaLabel} className={claseCampo}>
            <CalendarIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className={cn("truncate", !texto && "text-muted-foreground")}>{texto ?? placeholder}</span>
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="monarca-theme w-64 overflow-hidden rounded-xl p-0" align="start">
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-primary hover:bg-primary/10 hover:text-primary"
              aria-label="Año anterior"
              disabled={Boolean(min && anio <= Number(min.slice(0, 4)))}
              onClick={() => setAnio((a) => a - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm font-semibold">{anio}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-primary hover:bg-primary/10 hover:text-primary"
              aria-label="Año siguiente"
              disabled={Boolean(max && anio >= Number(max.slice(0, 4)))}
              onClick={() => setAnio((a) => a + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MESES.map((nombre, i) => {
              const clave = `${anio}-${String(i + 1).padStart(2, "0")}`
              const elegido = clave === value
              return (
                <button
                  key={clave}
                  type="button"
                  disabled={fuera(clave)}
                  aria-pressed={elegido}
                  onClick={() => elegir(clave)}
                  className={cn(
                    "h-9 rounded-md text-sm capitalize transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-40",
                    elegido && "bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90",
                    !elegido && clave === actual && "font-semibold text-primary ring-1 ring-inset ring-accent",
                  )}
                >
                  {nombre}
                </button>
              )
            })}
          </div>
        </div>
        {!fuera(actual) && (
          <div className="flex items-center border-t border-border bg-muted/40 px-3 py-2">
            <Button type="button" variant="ghost" size="sm" className="text-primary hover:bg-primary/10 hover:text-primary" onClick={() => elegir(actual)}>
              Este mes
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
