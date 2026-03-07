"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, User, CheckCircle2, AlertCircle } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import Image from "next/image"

interface Cita {
  id: number
  fecha: string
  hora: string
  documento: string
}

// Horarios disponibles de 14:00 a 19:30, cada 30 min
const HORARIOS = [
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"
]

const MAX_POR_TURNO = 2

export default function ReservarPage() {
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    dni: "",
  })
  const [horarioSeleccionado, setHorarioSeleccionado] = useState<string | null>(null)
  const [citasHoy, setCitasHoy] = useState<Cita[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [yaReservo, setYaReservo] = useState(false)

  const supabase = createClient()
  const hoy = format(new Date(), "yyyy-MM-dd")

  useEffect(() => {
    cargarCitasHoy()
  }, [])

  const cargarCitasHoy = async () => {
    // Traer confirmadas y atendidas (no canceladas ni no_asistio)
    const { data } = await supabase
      .from("citas")
      .select("*")
      .eq("fecha", hoy)
      .in("estado", ["confirmada", "atendida"])
    
    setCitasHoy(data || [])
  }

  const getCantidadPorHorario = (hora: string) => {
    // Comparar solo HH:MM (la BD guarda HH:MM:SS)
    return citasHoy.filter(c => c.hora.substring(0, 5) === hora).length
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!horarioSeleccionado) {
      setError("Por favor seleccioná un horario")
      return
    }

    if (!formData.nombre || !formData.apellido || !formData.dni) {
      setError("Por favor completá todos los campos")
      return
    }

    // Validar que no tenga ya una cita hoy
    const yaExiste = citasHoy.some(c => c.documento === formData.dni.replace(/\./g, ""))
    if (yaExiste) {
      setYaReservo(true)
      setError("Ya tenés una cita reservada para hoy")
      return
    }

    // Validar que haya lugar en el turno
    if (getCantidadPorHorario(horarioSeleccionado) >= MAX_POR_TURNO) {
      setError("Este horario ya está completo, elegí otro")
      return
    }

    setLoading(true)

    // Buscar si es socio por DNI
    const dniLimpio = formData.dni.replace(/\./g, "")
    const { data: socio } = await supabase
      .from("socios")
      .select("id")
      .eq("dni", dniLimpio)
      .single()

    const { error: insertError } = await supabase.from("citas").insert({
      fecha: hoy,
      hora: horarioSeleccionado,
      nombre: formData.nombre,
      apellido: formData.apellido,
      documento: dniLimpio,
      socio_id: socio?.id || null,
      estado: "confirmada",
    })

    if (insertError) {
      setError("Error al reservar la cita. Intentá de nuevo.")
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
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

  if (yaReservo) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-900 to-emerald-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white/95 backdrop-blur">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-amber-800">Ya tenés una cita</h2>
            <p className="text-muted-foreground">
              Ya reservaste un turno para hoy con este documento.
            </p>
            <p className="text-xs text-muted-foreground">
              Si necesitás cambiar tu horario, contactanos por WhatsApp.
            </p>
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
