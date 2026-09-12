"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, User, CheckCircle2, AlertCircle, XCircle } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import Image from "next/image"
import { generarHorarios, CONFIG_CITAS_DEFAULT, type ConfigCitas } from "@/lib/horarios"
import { bigintComoNumero, mapReservaError, normalizarDni } from "@/lib/reservas"

// Fila devuelta por la RPC mi_cita_hoy (ver scripts/058_public_reservation_rpcs.sql).
interface MiCita {
  id: number
  hora: string
  estado: string
}

export default function ReservarPage() {
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    dni: "",
  })
  const [horarioSeleccionado, setHorarioSeleccionado] = useState<string | null>(null)
  const [ocupacion, setOcupacion] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [citaExistente, setCitaExistente] = useState<MiCita | null>(null)
  const [horaActual, setHoraActual] = useState<number>(new Date().getHours())
  const [config, setConfig] = useState<ConfigCitas>(CONFIG_CITAS_DEFAULT)

  const supabase = createClient()
  const HORARIOS = generarHorarios(config.hora_inicio, config.hora_fin)
  const MAX_POR_TURNO = config.max_por_turno
  const reservasCerradas = horaActual >= config.hora_limite_reserva

  useEffect(() => {
    cargarConfig()
    cargarOcupacionHoy()
    // Actualizar hora cada minuto por si el usuario deja abierta la página
    const interval = setInterval(() => {
      setHoraActual(new Date().getHours())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const cargarConfig = async () => {
    // config_citas sigue siendo legible por anon (policy "anon_select_config_citas",
    // scripts/059_rls_hardening_reservations_add.sql) — no necesita RPC.
    const { data } = await supabase.from("config_citas").select("*").eq("id", 1).maybeSingle()
    if (data) setConfig(data)
  }

  const cargarOcupacionHoy = async () => {
    const { data } = await supabase.rpc("citas_ocupacion_hoy")
    const mapa: Record<string, number> = {}
    for (const fila of data ?? []) {
      // La BD guarda HH:MM:SS, comparamos solo HH:MM.
      mapa[String(fila.hora).substring(0, 5)] = bigintComoNumero(fila.cantidad)
    }
    setOcupacion(mapa)
  }

  const getCantidadPorHorario = (hora: string) => {
    return ocupacion[hora] ?? 0
  }

  const ejecutarReserva = async (citaPrevia?: MiCita) => {
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
      return
    }

    setSuccess(true)
    setLoading(false)
    setCitaExistente(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validar que no sean pasadas las 16
    if (reservasCerradas) {
      setError(`Las reservas están cerradas después de las ${config.hora_limite_reserva}:00hs`)
      return
    }

    if (!horarioSeleccionado) {
      setError("Por favor seleccioná un horario")
      return
    }

    if (!formData.nombre || !formData.apellido || !formData.dni) {
      setError("Por favor completá todos los campos")
      return
    }

    // Validar que haya lugar en el turno (chequeo de UX: el cupo real lo
    // garantiza el lock server-side dentro de las RPC).
    if (getCantidadPorHorario(horarioSeleccionado) >= MAX_POR_TURNO) {
      setError("Este horario ya está completo, elegí otro")
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
      // Si la cita existente es al mismo horario, no hacer nada
      if (citaPrevia.hora.substring(0, 5) === horarioSeleccionado) {
        setError("Ya tenés una cita reservada para este mismo horario")
        setLoading(false)
        return
      }
      // Mostrar diálogo de confirmación para cambiar
      setCitaExistente(citaPrevia)
      setLoading(false)
      return
    }

    // Sin cita previa - crear directamente
    await ejecutarReserva()
  }

  // Pantalla de reservas cerradas (después de las 16hs)
  if (reservasCerradas && !success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-900 to-emerald-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white/95 backdrop-blur">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-red-800">Reservas cerradas</h2>
            <p className="text-muted-foreground">
              Las reservas online están disponibles hasta las{" "}
              <span className="font-semibold">{config.hora_limite_reserva}:00hs</span>.
            </p>
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-sm text-amber-800">
                Podés volver a reservar mañana a partir de las 00:00hs.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Si necesitás una atención urgente, contactanos por WhatsApp.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-900 to-emerald-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white/95 backdrop-blur">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-emerald-800">Reserva Confirmada</h2>
            <p className="text-muted-foreground">
              Tu cita para hoy a las <span className="font-semibold">{horarioSeleccionado}hs</span> ha sido confirmada.
            </p>
            <div className="p-4 bg-emerald-50 rounded-lg">
              <p className="text-sm text-emerald-700">
                <strong>{formData.nombre} {formData.apellido}</strong>
                <br />
                DNI: {formData.dni}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Te esperamos en Monarca South. Por favor llegá a horario.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Pantalla de confirmación de cambio de horario
  if (citaExistente) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-900 to-emerald-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white/95 backdrop-blur">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-amber-800">Ya tenés una cita</h2>
            <p className="text-muted-foreground">
              Con este documento ya reservaste un turno para hoy a las{" "}
              <span className="font-semibold text-amber-800">
                {citaExistente.hora.substring(0, 5)}hs
              </span>
              .
            </p>
            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <p className="text-sm text-emerald-800">
                ¿Querés cambiarlo a las{" "}
                <span className="font-semibold">{horarioSeleccionado}hs</span>?
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                Se liberará tu turno anterior.
              </p>
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setCitaExistente(null)
                  setError(null)
                }}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => ejecutarReserva(citaExistente)}
                disabled={loading}
              >
                {loading ? "Cambiando..." : "Sí, cambiar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-900 to-emerald-950 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo-monarca.png"
              alt="Monarca South"
              width={80}
              height={80}
              className="rounded-full bg-white p-2"
            />
          </div>
          <h1 className="text-2xl font-bold text-white">Reservá tu turno</h1>
          <p className="text-emerald-200 text-sm">
            {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
          </p>
        </div>

        {/* Formulario */}
        <Card className="bg-white/95 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-emerald-600" />
              Tus datos
            </CardTitle>
            <CardDescription>
              Ingresá tu información para reservar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="Juan"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apellido">Apellido</Label>
                  <Input
                    id="apellido"
                    value={formData.apellido}
                    onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                    placeholder="Pérez"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dni">Documento (DNI)</Label>
                <Input
                  id="dni"
                  value={formData.dni}
                  onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                  placeholder="12345678"
                  required
                />
              </div>

              {/* Horarios */}
              <div className="space-y-3 pt-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-600" />
                  Elegí tu horario
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {HORARIOS.map((hora) => {
                    const cantidad = getCantidadPorHorario(hora)
                    const lleno = cantidad >= MAX_POR_TURNO
                    const seleccionado = horarioSeleccionado === hora

                    return (
                      <Button
                        key={hora}
                        type="button"
                        variant={seleccionado ? "default" : "outline"}
                        className={`relative ${
                          lleno
                            ? "opacity-50 cursor-not-allowed"
                            : seleccionado
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                              : "hover:border-emerald-500 hover:text-emerald-600"
                        }`}
                        disabled={lleno}
                        onClick={() => setHorarioSeleccionado(hora)}
                      >
                        {hora}
                        {cantidad > 0 && !lleno && (
                          <Badge
                            variant="secondary"
                            className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs bg-amber-100 text-amber-700"
                          >
                            {MAX_POR_TURNO - cantidad}
                          </Badge>
                        )}
                        {lleno && (
                          <Badge
                            variant="secondary"
                            className="absolute -top-2 -right-2 h-5 px-1 text-xs bg-red-100 text-red-700"
                          >
                            Lleno
                          </Badge>
                        )}
                      </Button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  El número indica lugares disponibles
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                disabled={loading || !horarioSeleccionado}
              >
                {loading ? "Reservando..." : "Confirmar Reserva"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-emerald-200/60 text-xs">
          Monarca South - Club Cannábico
        </p>
      </div>
    </div>
  )
}
