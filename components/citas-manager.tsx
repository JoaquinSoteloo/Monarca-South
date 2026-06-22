"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  UserCheck, 
  UserX, 
  RefreshCw,
  Copy,
  CheckCircle2,
  XCircle,
  Trash2,
  Settings,
  Save
} from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { generarHorarios, CONFIG_CITAS_DEFAULT, type ConfigCitas } from "@/lib/horarios"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Cita {
  id: number
  fecha: string
  hora: string
  nombre: string
  apellido: string
  documento: string
  socio_id: string | null
  estado: "confirmada" | "atendida" | "cancelada" | "no_asistio"
  created_at: string
  socio?: {
    nombre: string
    apellido: string
  }
}

export function CitasManager() {
  const [citas, setCitas] = useState<Cita[]>([])
  const [loading, setLoading] = useState(true)
  const [fechaSeleccionada, setFechaSeleccionada] = useState<Date>(new Date())
  const [linkCopiado, setLinkCopiado] = useState(false)
  const [citaABorrar, setCitaABorrar] = useState<Cita | null>(null)
  const [config, setConfig] = useState<ConfigCitas>(CONFIG_CITAS_DEFAULT)
  const [configForm, setConfigForm] = useState<ConfigCitas>(CONFIG_CITAS_DEFAULT)
  const [guardandoConfig, setGuardandoConfig] = useState(false)
  const [configGuardada, setConfigGuardada] = useState(false)

  const supabase = createClient()
  const HORARIOS = generarHorarios(config.hora_inicio, config.hora_fin)
  const MAX_POR_TURNO = config.max_por_turno

  useEffect(() => {
    cargarConfig()
  }, [])

  useEffect(() => {
    cargarCitas()
  }, [fechaSeleccionada])

  const cargarConfig = async () => {
    const { data } = await supabase.from("config_citas").select("*").eq("id", 1).maybeSingle()
    if (data) {
      const cfg = {
        hora_inicio: data.hora_inicio.substring(0, 5),
        hora_fin: data.hora_fin.substring(0, 5),
        hora_limite_reserva: data.hora_limite_reserva,
        max_por_turno: data.max_por_turno,
      }
      setConfig(cfg)
      setConfigForm(cfg)
    }
  }

  const guardarConfig = async () => {
    setGuardandoConfig(true)
    const { error } = await supabase
      .from("config_citas")
      .update({
        hora_inicio: configForm.hora_inicio,
        hora_fin: configForm.hora_fin,
        hora_limite_reserva: configForm.hora_limite_reserva,
        max_por_turno: configForm.max_por_turno,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)

    if (!error) {
      setConfig(configForm)
      setConfigGuardada(true)
      setTimeout(() => setConfigGuardada(false), 2000)
    }
    setGuardandoConfig(false)
  }

  const cargarCitas = async () => {
    setLoading(true)
    const fechaStr = format(fechaSeleccionada, "yyyy-MM-dd")
    
    const { data } = await supabase
      .from("citas")
      .select("*, socio:socios(nombre, apellido)")
      .eq("fecha", fechaStr)
      .order("hora", { ascending: true })
    
    setCitas(data || [])
    setLoading(false)
  }

  const cambiarEstado = async (cita: Cita, nuevoEstado: Cita["estado"]) => {
    await supabase
      .from("citas")
      .update({ estado: nuevoEstado })
      .eq("id", cita.id)
    
    setCitas(citas.map(c => c.id === cita.id ? { ...c, estado: nuevoEstado } : c))
  }

  const eliminarCita = async () => {
    if (!citaABorrar) return
    
    await supabase
      .from("citas")
      .delete()
      .eq("id", citaABorrar.id)
    
    setCitas(citas.filter(c => c.id !== citaABorrar.id))
    setCitaABorrar(null)
  }

  const copiarLink = () => {
    const link = `${window.location.origin}/reservar`
    navigator.clipboard.writeText(link)
    setLinkCopiado(true)
    setTimeout(() => setLinkCopiado(false), 2000)
  }

  const getCitasPorHorario = (hora: string) => {
    // Comparar solo HH:MM (la BD puede guardar HH:MM:SS)
    return citas.filter(c => c.hora.substring(0, 5) === hora && c.estado !== "cancelada")
  }

  const getEstadoBadge = (estado: Cita["estado"]) => {
    switch (estado) {
      case "confirmada":
        return <Badge variant="outline" className="border-blue-300 text-blue-600">Confirmada</Badge>
      case "atendida":
        return <Badge variant="outline" className="border-emerald-300 text-emerald-600">Atendida</Badge>
      case "cancelada":
        return <Badge variant="outline" className="border-red-300 text-red-600">Cancelada</Badge>
      case "no_asistio":
        return <Badge variant="outline" className="border-amber-300 text-amber-600">No asistió</Badge>
    }
  }

  const totalConfirmadas = citas.filter(c => c.estado === "confirmada").length
  const totalAtendidas = citas.filter(c => c.estado === "atendida").length
  const totalNoAsistio = citas.filter(c => c.estado === "no_asistio").length

  return (
    <div className="space-y-6">
      {/* Header con acciones */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Gestión de Citas</h2>
          <p className="text-muted-foreground">Administrá los turnos del día</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copiarLink}>
            {linkCopiado ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-600" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copiar Link
              </>
            )}
          </Button>
          <Button variant="outline" onClick={cargarCitas}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Configuración de horarios */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-emerald-600" />
            Configuración de horarios
          </CardTitle>
          <CardDescription>
            Definí el rango de horarios disponibles para reservar y hasta qué hora se puede anotar la gente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="hora_inicio">Desde</Label>
              <Input
                id="hora_inicio"
                type="time"
                step={1800}
                value={configForm.hora_inicio}
                onChange={(e) => setConfigForm({ ...configForm, hora_inicio: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hora_fin">Hasta</Label>
              <Input
                id="hora_fin"
                type="time"
                step={1800}
                value={configForm.hora_fin}
                onChange={(e) => setConfigForm({ ...configForm, hora_fin: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hora_limite">Cierre de reservas (hora)</Label>
              <Input
                id="hora_limite"
                type="number"
                min={0}
                max={23}
                value={configForm.hora_limite_reserva}
                onChange={(e) =>
                  setConfigForm({ ...configForm, hora_limite_reserva: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_turno">Cupos por turno</Label>
              <Input
                id="max_turno"
                type="number"
                min={1}
                max={20}
                value={configForm.max_por_turno}
                onChange={(e) =>
                  setConfigForm({ ...configForm, max_por_turno: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Button
              onClick={guardarConfig}
              disabled={guardandoConfig}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {configGuardada ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Guardado
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {guardandoConfig ? "Guardando..." : "Guardar cambios"}
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Las reservas se cierran a las {configForm.hora_limite_reserva}:00hs.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stats y Selector de fecha */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Confirmadas</p>
                <p className="text-2xl font-bold text-blue-600">{totalConfirmadas}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Atendidas</p>
                <p className="text-2xl font-bold text-emerald-600">{totalAtendidas}</p>
              </div>
              <UserCheck className="h-8 w-8 text-emerald-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">No asistió</p>
                <p className="text-2xl font-bold text-amber-600">{totalNoAsistio}</p>
              </div>
              <UserX className="h-8 w-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(fechaSeleccionada, "PPP", { locale: es })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fechaSeleccionada}
                  onSelect={(date) => date && setFechaSeleccionada(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>
      </div>

      {/* Vista por horarios */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-emerald-600" />
            Turnos del {format(fechaSeleccionada, "EEEE d 'de' MMMM", { locale: es })}
          </CardTitle>
          <CardDescription>
            Vista organizada por horarios
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando citas...</div>
          ) : (
            <div className="space-y-3">
              {HORARIOS.map((hora) => {
                const citasHora = getCitasPorHorario(hora)
                return (
                  <div key={hora} className="flex items-start gap-4 p-3 rounded-lg bg-muted/30 border">
                    <div className="w-16 text-center">
                      <span className="text-lg font-bold text-emerald-600">{hora}</span>
                    </div>
                    <div className="flex-1">
                      {citasHora.length === 0 ? (
                        <span className="text-muted-foreground text-sm">Sin turnos</span>
                      ) : (
                        <div className="space-y-2">
                          {citasHora.map((cita) => (
                            <div 
                              key={cita.id} 
                              className={`flex items-center justify-between p-2 rounded-md ${
                                cita.estado === "atendida" ? "bg-emerald-50" : 
                                cita.estado === "no_asistio" ? "bg-amber-50" : "bg-white"
                              } border`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                  cita.socio_id ? "bg-emerald-100" : "bg-gray-100"
                                }`}>
                                  {cita.socio_id ? (
                                    <UserCheck className="h-4 w-4 text-emerald-600" />
                                  ) : (
                                    <User className="h-4 w-4 text-gray-500" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-sm">
                                    {cita.apellido}, {cita.nombre}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    DNI: {cita.documento}
                                    {cita.socio_id && (
                                      <span className="ml-2 text-emerald-600 font-medium">Socio</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {getEstadoBadge(cita.estado)}
                                {cita.estado === "confirmada" && (
                                  <>
                                    <Button 
                                      size="sm" 
                                      variant="ghost"
                                      className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                      onClick={() => cambiarEstado(cita, "atendida")}
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="ghost"
                                      className="h-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                      onClick={() => cambiarEstado(cita, "no_asistio")}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setCitaABorrar(cita)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-16 text-center">
                      <Badge variant="outline" className={`${
                        citasHora.length >= MAX_POR_TURNO ? "border-red-300 text-red-600" : 
                        citasHora.length > 0 ? "border-amber-300 text-amber-600" : 
                        "border-emerald-300 text-emerald-600"
                      }`}>
                        {citasHora.length}/{MAX_POR_TURNO}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista completa */}
      {citas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Listado Completo</CardTitle>
            <CardDescription>Todas las citas del día</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>DNI</TableHead>
                  <TableHead>Socio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {citas.map((cita) => (
                  <TableRow key={cita.id}>
                    <TableCell className="font-medium">{cita.hora}</TableCell>
                    <TableCell>{cita.apellido}, {cita.nombre}</TableCell>
                    <TableCell>{cita.documento}</TableCell>
                    <TableCell>
                      {cita.socio_id ? (
                        <Badge variant="outline" className="border-emerald-300 text-emerald-600">
                          <UserCheck className="h-3 w-3 mr-1" />
                          Sí
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-gray-300 text-gray-500">
                          No
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{getEstadoBadge(cita.estado)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {cita.estado === "confirmada" && (
                          <>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => cambiarEstado(cita, "atendida")}
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => cambiarEstado(cita, "no_asistio")}
                            >
                              <XCircle className="h-4 w-4 text-amber-600" />
                            </Button>
                          </>
                        )}
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => setCitaABorrar(cita)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialog de confirmación para eliminar */}
      <AlertDialog open={!!citaABorrar} onOpenChange={(open) => !open && setCitaABorrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cita</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar la cita de {citaABorrar?.nombre} {citaABorrar?.apellido} a las {citaABorrar?.hora}hs?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminarCita} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
