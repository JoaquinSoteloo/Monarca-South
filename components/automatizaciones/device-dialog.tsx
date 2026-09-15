"use client"

import type React from "react"
import type { ProveedorDispositivo, TipoDispositivoControlable } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { tipoDispositivoConfig } from "@/lib/device-ui-config"
import type { DeviceFormState } from "./form-types"

export const proveedorOpciones: { value: ProveedorDispositivo; label: string; disponible: boolean }[] = [
  { value: "manual_noop", label: "Simulación (manual_noop) — sin hardware", disponible: true },
  { value: "broadlink_ir", label: "BroadLink IR — próximamente", disponible: false },
  { value: "shelly_local", label: "Shelly local — próximamente", disponible: false },
  { value: "shelly_cloud", label: "Shelly Cloud — próximamente", disponible: false },
  { value: "http_directo", label: "HTTP directo — próximamente", disponible: false },
]

interface DeviceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingDeviceId: number | null
  salaNombre: string | undefined
  form: DeviceFormState
  setForm: (updater: (prev: DeviceFormState) => DeviceFormState) => void
  loading: boolean
  onSubmit: (e: React.FormEvent) => void
}

export function DeviceDialog({ open, onOpenChange, editingDeviceId, salaNombre, form, setForm, loading, onSubmit }: DeviceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[880px]">
        <div className="border-b border-border p-6 pb-4">
          <DialogHeader>
            <DialogTitle>{editingDeviceId ? "Editar dispositivo" : "Nuevo dispositivo"}</DialogTitle>
          </DialogHeader>
          {salaNombre && <p className="mt-1 text-sm text-muted-foreground">Sala: {salaNombre}</p>}
        </div>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Datos del dispositivo</h3>
                <div className="space-y-2">
                  <Label htmlFor="dev_nombre">Nombre</Label>
                  <Input
                    id="dev_nombre"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej: Aire acondicionado Sala 1"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoDispositivoControlable }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(tipoDispositivoConfig).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>
                          {cfg.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Proveedor</Label>
                  <Select value={form.proveedor} onValueChange={(v) => setForm((f) => ({ ...f, proveedor: v as ProveedorDispositivo }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {proveedorOpciones.map((op) => (
                        <SelectItem key={op.value} value={op.value} disabled={!op.disponible}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Funcionamiento</h3>
                <div className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="dev_feedback" className="text-sm">
                      El proveedor puede confirmar estado real
                    </Label>
                    <Switch
                      id="dev_feedback"
                      checked={form.soporta_feedback}
                      onCheckedChange={(checked) => setForm((f) => ({ ...f, soporta_feedback: checked }))}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Si está apagado, la tarjeta del dispositivo mostrará &quot;Estado real no disponible&quot; en vez de asumir que el equipo
                    cambió de verdad.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Modo Ausente</Label>
                  <Select
                    value={form.requisito_ausente || "ninguno"}
                    onValueChange={(v) => setForm((f) => ({ ...f, requisito_ausente: v === "ninguno" ? "" : (v as "encendido" | "apagado") }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguno">No es crítico</SelectItem>
                      <SelectItem value="encendido">Debe quedar encendido</SelectItem>
                      <SelectItem value="apagado">Debe quedar apagado</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Si se marca, este dispositivo aparece en el checklist de /modo-ausente y se sigue vigilando mientras esté activo.
                  </p>
                </div>
              </div>
            </div>

            {form.proveedor === "manual_noop" && (
              <div className="space-y-3 rounded-md border border-accent/40 bg-accent/5 p-3">
                <p className="text-xs font-semibold text-foreground">Opciones de simulación</p>
                <p className="text-xs text-muted-foreground">
                  Este proveedor no controla hardware real: permite probar los caminos de error de la cola de comandos sin un equipo físico.
                </p>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="dev_fallar" className="text-sm">
                    Simular falla siempre
                  </Label>
                  <Switch
                    id="dev_fallar"
                    checked={form.simular_falla}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, simular_falla: checked }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dev_latencia">Latencia simulada (ms, opcional)</Label>
                  <Input
                    id="dev_latencia"
                    type="number"
                    value={form.latencia_ms}
                    onChange={(e) => setForm((f) => ({ ...f, latencia_ms: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border p-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
