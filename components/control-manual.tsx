"use client"

import { useMemo, useState } from "react"
import type { DispositivoControlable, TipoDispositivoControlable } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { formatComandoDispositivo, AC_MODO_OPTIONS, AC_FAN_OPTIONS } from "@/lib/automations/format"
import { tipoDispositivoConfig, comandoEstadoConfig, origenComandoLabels, formatMinutesAgo } from "@/lib/device-ui-config"
import { Power, PowerOff, Send, CheckCircle2, AlertTriangle, Clock } from "lucide-react"

interface ControlManualProps {
  initialDispositivos: DispositivoControlable[]
}

// Este componente nunca conoce BroadLink ni ningún hardware concreto — arma
// el mismo payload abstracto que usaría una automatización y lo manda a
// /api/devices/[id]/command, que es el único lugar que resuelve el adapter
// real (hoy siempre manual_noop). Ver también components/automatizaciones-manager.tsx.

// Tipos de dispositivo con controles propios además de encender/apagar. Hoy
// solo aire acondicionado (modo/setpoint/fan) — mismo criterio que
// lib/automations/format.ts y el diálogo de reglas. Sumar un tipo nuevo
// (extractor con velocidad, humidificador con % objetivo, etc.) es: agregar
// su tipo acá, su bloque de campos abajo, y su formateo en format.ts.
const TIPOS_CON_CONTROLES_AVANZADOS: TipoDispositivoControlable[] = ["aire_acondicionado"]

export function ControlManual({ initialDispositivos }: ControlManualProps) {
  const [dispositivos, setDispositivos] = useState<DispositivoControlable[]>(initialDispositivos)
  const [dispositivoId, setDispositivoId] = useState<string>(initialDispositivos[0] ? String(initialDispositivos[0].id) : "")
  const [accion, setAccion] = useState<"encender" | "apagar">("encender")
  const [modoAC, setModoAC] = useState(AC_MODO_OPTIONS[0]?.value ?? "frio")
  const [setpoint, setSetpoint] = useState("23")
  const [fan, setFan] = useState(AC_FAN_OPTIONS[0]?.value ?? "auto")
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const dispositivo = useMemo(() => dispositivos.find((d) => d.id === Number(dispositivoId)) ?? null, [dispositivos, dispositivoId])
  const esAireAcondicionado = dispositivo ? TIPOS_CON_CONTROLES_AVANZADOS.includes(dispositivo.tipo) : false

  const recargarDispositivos = async () => {
    const res = await fetch("/api/devices", { cache: "no-store" })
    if (res.ok) {
      const data = await res.json()
      setDispositivos(data.dispositivos ?? [])
    }
  }

  const handleEnviarComando = async () => {
    if (!dispositivo) return
    setEnviando(true)
    setMensaje(null)

    const payload: Record<string, unknown> =
      accion === "apagar"
        ? { accion: "apagar" }
        : esAireAcondicionado
          ? { accion: "encender", modo: modoAC, setpoint: Number(setpoint), fan }
          : { accion: "encender" }

    try {
      const res = await fetch(`/api/devices/${dispositivo.id}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      })
      if (res.status === 401) throw new Error("unauthorized")
      if (!res.ok) throw new Error("command_failed")
      await recargarDispositivos()
      setMensaje({ type: "success", text: "Comando manual enviado." })
    } catch (err) {
      const esUnauthorized = err instanceof Error && err.message === "unauthorized"
      setMensaje({
        type: "error",
        text: esUnauthorized ? "Tu sesión expiró. Volvé a iniciar sesión." : "No se pudo enviar el comando manual.",
      })
    } finally {
      setEnviando(false)
    }
  }

  const TipoIcon = dispositivo ? tipoDispositivoConfig[dispositivo.tipo].icon : Power
  const estadoCfg = dispositivo?.ultimo_comando_estado ? comandoEstadoConfig[dispositivo.ultimo_comando_estado] : null
  const EstadoIcon = estadoCfg?.icon ?? Clock

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-emerald-900">Control manual</h2>
        <p className="text-muted-foreground">
          Enviá un comando directo a un dispositivo. Si estaba en automático, pasa a manual para que la próxima
          corrida de automatizaciones no lo pise.
        </p>
      </div>

      {mensaje && (
        <Alert
          variant={mensaje.type === "error" ? "destructive" : "default"}
          className={mensaje.type === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : undefined}
        >
          {mensaje.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <AlertTitle>{mensaje.type === "success" ? "Listo" : "Atención"}</AlertTitle>
          <AlertDescription>{mensaje.text}</AlertDescription>
        </Alert>
      )}

      {dispositivos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay dispositivos controlables cargados. Creá uno primero desde Automatizaciones.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            <Label>Dispositivo</Label>
            <Select value={dispositivoId} onValueChange={setDispositivoId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar dispositivo" />
              </SelectTrigger>
              <SelectContent>
                {dispositivos.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.nombre}
                    {d.sala ? ` — ${d.sala.nombre}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {dispositivo && (
            <Card>
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TipoIcon className="h-5 w-5 text-emerald-700" />
                    <div>
                      <CardTitle className="text-base">{dispositivo.nombre}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {tipoDispositivoConfig[dispositivo.tipo].label}
                        {dispositivo.sala ? ` · ${dispositivo.sala.nombre}` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      dispositivo.modo === "manual"
                        ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                        : "border-amber-300 text-amber-700 bg-amber-50"
                    }
                  >
                    {dispositivo.modo === "manual" ? "Manual" : "Automático"}
                  </Badge>
                </div>
                {dispositivo.modo !== "manual" && (
                  <p className="text-xs text-muted-foreground">
                    Está en automático: al enviar el comando de abajo pasa a manual automáticamente.
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Misma lógica de lectura que components/automatizaciones-manager.tsx:
                    "Estado esperado" y "Último comando" son best-effort (lo que Monarca
                    pidió); "Estado real" solo se muestra si soporta_feedback=true — nunca
                    se asume que el equipo recibió el IR. */}
                <div className="text-sm space-y-0.5">
                  <p className="text-xs text-muted-foreground">Estado esperado</p>
                  <p className="font-medium">
                    {dispositivo.ultimo_comando_payload
                      ? formatComandoDispositivo(dispositivo.tipo, dispositivo.ultimo_comando_payload)
                      : "Sin comandos todavía"}
                  </p>
                </div>

                <div className="text-sm space-y-1">
                  <p className="text-xs text-muted-foreground">Último comando</p>
                  {dispositivo.ultimo_comando_en ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {estadoCfg && (
                        <Badge variant="outline" className={estadoCfg.color}>
                          <EstadoIcon className="h-3 w-3" />
                          {estadoCfg.label}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatMinutesAgo(dispositivo.ultimo_comando_en)}
                        {dispositivo.ultimo_comando_origen ? ` · ${origenComandoLabels[dispositivo.ultimo_comando_origen]}` : ""}
                      </span>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Sin comandos todavía</p>
                  )}
                </div>

                <div className="text-sm space-y-0.5">
                  <p className="text-xs text-muted-foreground">Estado real</p>
                  {!dispositivo.soporta_feedback ? (
                    <p className="text-muted-foreground italic">No disponible — control unidireccional, sin confirmación del equipo.</p>
                  ) : dispositivo.ultimo_estado_confirmado_payload ? (
                    <p className="font-medium">
                      {formatComandoDispositivo(dispositivo.tipo, dispositivo.ultimo_estado_confirmado_payload)} ·{" "}
                      {formatMinutesAgo(dispositivo.ultimo_estado_confirmado_en)}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Esperando confirmación del equipo</p>
                  )}
                </div>

                <div className="space-y-3 rounded-md border border-border p-3">
                  <p className="text-sm font-medium text-emerald-800">Comando a enviar</p>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={accion === "encender" ? "default" : "outline"}
                      className={accion === "encender" ? "flex-1 bg-emerald-700 hover:bg-emerald-800" : "flex-1"}
                      onClick={() => setAccion("encender")}
                    >
                      <Power className="h-4 w-4 mr-1" />
                      Encender
                    </Button>
                    <Button
                      type="button"
                      variant={accion === "apagar" ? "default" : "outline"}
                      className={accion === "apagar" ? "flex-1 bg-gray-700 hover:bg-gray-800" : "flex-1"}
                      onClick={() => setAccion("apagar")}
                    >
                      <PowerOff className="h-4 w-4 mr-1" />
                      Apagar
                    </Button>
                  </div>

                  {accion === "encender" &&
                    (esAireAcondicionado ? (
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div className="space-y-2">
                          <Label>Modo</Label>
                          <Select value={modoAC} onValueChange={setModoAC}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AC_MODO_OPTIONS.map((op) => (
                                <SelectItem key={op.value} value={op.value}>
                                  {op.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Setpoint (°C)</Label>
                          <Input type="number" value={setpoint} onChange={(e) => setSetpoint(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Fan</Label>
                          <Select value={fan} onValueChange={setFan}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AC_FAN_OPTIONS.map((op) => (
                                <SelectItem key={op.value} value={op.value}>
                                  {op.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Este equipo se enciende sin parámetros adicionales.</p>
                    ))}

                  <Button className="w-full bg-emerald-700 hover:bg-emerald-800" disabled={enviando} onClick={handleEnviarComando}>
                    <Send className="h-4 w-4 mr-2" />
                    {enviando ? "Enviando..." : "Enviar comando"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
