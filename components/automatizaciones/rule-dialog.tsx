"use client"

import type React from "react"
import { useMemo } from "react"
import type { DispositivoControlable, OperadorComparacion, VariableAmbiental } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { VARIABLE_CONFIG as variableConfig, AC_MODO_OPTIONS, AC_FAN_OPTIONS } from "@/lib/automations/format"
import type { RuleFormState } from "./form-types"

interface PulseDeviceOption {
  id: number
  name: string
  sala_id: number | null
}

interface RuleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingReglaId: number | null
  form: RuleFormState
  setForm: (updater: (prev: RuleFormState) => RuleFormState) => void
  pulseDevices: PulseDeviceOption[]
  dispositivos: DispositivoControlable[]
  loading: boolean
  onSubmit: (e: React.FormEvent) => void
}

const OPERADORES: OperadorComparacion[] = [">", "<", ">=", "<="]

export function RuleDialog({ open, onOpenChange, editingReglaId, form, setForm, pulseDevices, dispositivos, loading, onSubmit }: RuleDialogProps) {
  const dispositivoSeleccionado = dispositivos.find((d) => d.id === Number(form.dispositivo_id))
  const esAireAcondicionado = dispositivoSeleccionado?.tipo === "aire_acondicionado"

  const resumen = useMemo(() => {
    const cfg = variableConfig[form.variable]
    const valor = form.valor_objetivo || "…"
    const minutos = form.duracion_minima_minutos || "0"
    const nombreDispositivo = dispositivoSeleccionado?.nombre ?? "el dispositivo seleccionado"
    const accionTxt = esAireAcondicionado
      ? `encender en modo ${AC_MODO_OPTIONS.find((o) => o.value === form.accion_modo)?.label ?? form.accion_modo} a ${
          form.accion_setpoint || "…"
        }°C (fan ${AC_FAN_OPTIONS.find((o) => o.value === form.accion_fan)?.label ?? form.accion_fan})`
      : "encender"
    return `Si ${cfg.label.toLowerCase()} ${form.operador} ${valor}${cfg.unidad} durante ${minutos} min, enviar "${accionTxt}" a ${nombreDispositivo}.`
  }, [form, dispositivoSeleccionado, esAireAcondicionado])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-[1080px]">
        <div className="border-b border-border p-6 pb-4">
          <DialogHeader>
            <DialogTitle>{editingReglaId ? "Editar regla" : "Nueva regla"}</DialogTitle>
          </DialogHeader>
        </div>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="regla_nombre">Nombre de la regla</Label>
                <Input
                  id="regla_nombre"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Enfriar Sala 1"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Sensor Pulse</Label>
                <Select value={form.pulse_device_id} onValueChange={(v) => setForm((f) => ({ ...f, pulse_device_id: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar sensor" />
                  </SelectTrigger>
                  <SelectContent>
                    {pulseDevices.map((pd) => (
                      <SelectItem key={pd.id} value={String(pd.id)}>
                        {pd.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md bg-secondary/60 p-3 text-sm text-foreground">{resumen}</div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Condiciones</h3>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Variable</Label>
                    <Select value={form.variable} onValueChange={(v) => setForm((f) => ({ ...f, variable: v as VariableAmbiental }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(variableConfig).map(([key, cfg]) => (
                          <SelectItem key={key} value={key}>
                            {cfg.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Operador</Label>
                    <Select value={form.operador} onValueChange={(v) => setForm((f) => ({ ...f, operador: v as OperadorComparacion }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERADORES.map((op) => (
                          <SelectItem key={op} value={op}>
                            {op}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={form.valor_objetivo}
                      onChange={(e) => setForm((f) => ({ ...f, valor_objetivo: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Durante (minutos sostenido, 0 = instantáneo)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.duracion_minima_minutos}
                    onChange={(e) => setForm((f) => ({ ...f, duracion_minima_minutos: e.target.value }))}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <Label htmlFor="regla_histeresis" className="text-sm">
                    Condición de apagado distinta (histéresis)
                  </Label>
                  <Switch
                    id="regla_histeresis"
                    checked={form.usar_histeresis}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, usar_histeresis: checked }))}
                  />
                </div>

                {form.usar_histeresis ? (
                  <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Operador</Label>
                      <Select
                        value={form.operador_apagado}
                        onValueChange={(v) => setForm((f) => ({ ...f, operador_apagado: v as OperadorComparacion }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERADORES.map((op) => (
                            <SelectItem key={op} value={op}>
                              {op}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Valor</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={form.valor_apagado}
                        onChange={(e) => setForm((f) => ({ ...f, valor_apagado: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Minutos</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.duracion_apagado_minutos}
                        onChange={(e) => setForm((f) => ({ ...f, duracion_apagado_minutos: e.target.value }))}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Sin histéresis configurada: se apaga apenas deja de cumplirse la condición de encendido.
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Equipo y comportamiento</h3>

                <div className="space-y-2">
                  <Label>Dispositivo a controlar</Label>
                  <Select value={form.dispositivo_id} onValueChange={(v) => setForm((f) => ({ ...f, dispositivo_id: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar dispositivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {dispositivos.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {esAireAcondicionado ? (
                  <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Modo</Label>
                      <Select value={form.accion_modo} onValueChange={(v) => setForm((f) => ({ ...f, accion_modo: v }))}>
                        <SelectTrigger className="w-full">
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
                      <Input
                        type="number"
                        value={form.accion_setpoint}
                        onChange={(e) => setForm((f) => ({ ...f, accion_setpoint: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fan</Label>
                      <Select value={form.accion_fan} onValueChange={(v) => setForm((f) => ({ ...f, accion_fan: v }))}>
                        <SelectTrigger className="w-full">
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
                  dispositivoSeleccionado && (
                    <p className="text-xs text-muted-foreground">Este equipo se enciende/apaga sin parámetros adicionales.</p>
                  )
                )}

                <div className="space-y-2">
                  <Label>Tiempo mínimo entre acciones (minutos)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.cooldown_minutos}
                    onChange={(e) => setForm((f) => ({ ...f, cooldown_minutos: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Si Pulse deja de reportar</Label>
                  <Select
                    value={form.accion_fail_safe}
                    onValueChange={(v) => setForm((f) => ({ ...f, accion_fail_safe: v as "mantener" | "apagar" }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mantener">Mantener último comando (recomendado)</SelectItem>
                      <SelectItem value="apagar">Apagar automáticamente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border p-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Guardar regla"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
