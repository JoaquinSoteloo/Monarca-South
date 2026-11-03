"use client"

/**
 * Roles y permisos (scripts/084). Cada rol tiene permisos de la lista de
 * lib/permisos.ts: ver cada pantalla y algunas acciones sensibles. La
 * comisión directiva es fija y los tiene todos.
 */
import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { PANTALLAS, ROL_COMISION } from "@/lib/permisos"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Lock, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react"

interface Rol {
  clave: string
  nombre: string
  descripcion: string | null
  es_sistema: boolean
}

const GRUPOS = Array.from(new Set(PANTALLAS.map((p) => p.grupo)))

export function RolesManager({ puedeAdministrar }: { puedeAdministrar: boolean }) {
  const supabase = createClient()
  const [roles, setRoles] = useState<Rol[]>([])
  const [permisos, setPermisos] = useState<Record<string, string[]>>({})
  const [usuariosPorRol, setUsuariosPorRol] = useState<Record<string, number>>({})
  const [editando, setEditando] = useState<Rol | "nuevo" | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  async function cargar() {
    const [r, rp, pf] = await Promise.all([
      supabase.from("roles").select("*").order("es_sistema", { ascending: false }).order("nombre"),
      supabase.from("rol_permisos").select("rol, permiso"),
      supabase.from("perfiles").select("rol, activo"),
    ])
    setRoles(r.data || [])
    const map: Record<string, string[]> = {}
    for (const f of rp.data || []) (map[f.rol] ??= []).push(f.permiso)
    setPermisos(map)
    const cuenta: Record<string, number> = {}
    for (const f of pf.data || []) if (f.activo) cuenta[f.rol] = (cuenta[f.rol] ?? 0) + 1
    setUsuariosPorRol(cuenta)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function borrar(rol: Rol) {
    if (!confirm(`¿Borrar el rol "${rol.nombre}"?`)) return
    const { error } = await supabase.from("roles").delete().eq("clave", rol.clave)
    if (error) {
      setAviso({
        ok: false,
        texto: error.code === "23503" ? "Hay usuarios con este rol: pasalos a otro rol antes de borrarlo." : "No se pudo borrar el rol.",
      })
      return
    }
    setAviso({ ok: true, texto: `Rol "${rol.nombre}" borrado.` })
    cargar()
  }

  return (
    <Card className="gap-4 bg-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Roles y permisos</CardTitle>
          <p className="text-sm text-muted-foreground">Qué pantallas ve cada rol y qué acciones puede hacer.</p>
        </div>
        {puedeAdministrar && (
          <Button size="sm" onClick={() => setEditando("nuevo")}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo rol
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {aviso && (
          <p
            role={aviso.ok ? "status" : "alert"}
            className={cn(
              "rounded-md px-3 py-2 text-sm",
              aviso.ok ? "bg-primary/5 text-foreground" : "bg-red-50 text-destructive",
            )}
          >
            {aviso.texto}
          </p>
        )}
        <ul className="grid gap-3 md:grid-cols-2">
          {roles.map((rol) => {
            const esComision = rol.clave === ROL_COMISION
            const lista = permisos[rol.clave] ?? []
            const pantallas = PANTALLAS.filter((p) => esComision || lista.includes(p.ver))
            const acciones = PANTALLAS.flatMap((p) => p.acciones).filter((a) => esComision || lista.includes(a.clave))
            const usuarios = usuariosPorRol[rol.clave] ?? 0
            return (
              <li key={rol.clave} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {esComision ? <ShieldCheck className="h-4 w-4 text-primary" /> : null}
                      {rol.nombre}
                    </p>
                    {rol.descripcion && <p className="text-xs text-muted-foreground">{rol.descripcion}</p>}
                    <p className="text-xs text-muted-foreground">
                      {usuarios} {usuarios === 1 ? "usuario activo" : "usuarios activos"}
                    </p>
                  </div>
                  {esComision ? (
                    <Badge variant="outline" className="gap-1 font-normal">
                      <Lock className="h-3 w-3" /> Todos los permisos
                    </Badge>
                  ) : (
                    puedeAdministrar && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-primary"
                          onClick={() => setEditando(rol)}
                          aria-label={`Editar el rol ${rol.nombre}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600"
                          onClick={() => borrar(rol)}
                          aria-label={`Borrar el rol ${rol.nombre}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  )}
                </div>
                {!esComision && (
                  <>
                    <p className="text-xs">
                      <span className="text-muted-foreground">Ve: </span>
                      {pantallas.length === 0 ? "ninguna pantalla" : pantallas.map((p) => p.nombre).join(", ")}
                    </p>
                    <p className="text-xs">
                      <span className="text-muted-foreground">Puede: </span>
                      {acciones.length === 0 ? "ninguna acción restringida" : acciones.map((a) => a.label).join(" · ")}
                    </p>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>

      {editando && (
        <RolDialog
          rol={editando === "nuevo" ? null : editando}
          permisosIniciales={editando === "nuevo" ? [] : permisos[editando.clave] ?? []}
          onClose={() => setEditando(null)}
          onGuardado={(texto) => {
            setEditando(null)
            setAviso({ ok: true, texto })
            cargar()
          }}
        />
      )}
    </Card>
  )
}

function RolDialog({
  rol,
  permisosIniciales,
  onClose,
  onGuardado,
}: {
  rol: Rol | null
  permisosIniciales: string[]
  onClose: () => void
  onGuardado: (texto: string) => void
}) {
  const supabase = createClient()
  const [nombre, setNombre] = useState(rol?.nombre ?? "")
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? "")
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(permisosIniciales))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const porGrupo = useMemo(() => GRUPOS.map((g) => ({ grupo: g, pantallas: PANTALLAS.filter((p) => p.grupo === g) })), [])

  function alternar(permiso: string, accionesDeLaPantalla: string[] = []) {
    setElegidos((s) => {
      const n = new Set(s)
      if (n.has(permiso)) {
        n.delete(permiso)
        // Sin ver la pantalla, sus acciones no sirven.
        for (const a of accionesDeLaPantalla) n.delete(a)
      } else {
        n.add(permiso)
      }
      return n
    })
  }

  async function guardar() {
    setError(null)
    if (!nombre.trim()) return setError("Poné un nombre al rol.")
    setGuardando(true)
    let clave = rol?.clave
    if (rol) {
      const { error: e } = await supabase
        .from("roles")
        .update({ nombre: nombre.trim(), descripcion: descripcion.trim() || null })
        .eq("clave", rol.clave)
      if (e) {
        setGuardando(false)
        return setError(e.code === "23505" ? "Ya hay un rol con ese nombre." : "No se pudo guardar el rol.")
      }
    } else {
      const { data, error: e } = await supabase
        .from("roles")
        .insert([{ nombre: nombre.trim(), descripcion: descripcion.trim() || null }])
        .select("clave")
        .single()
      if (e || !data) {
        setGuardando(false)
        return setError(e?.code === "23505" ? "Ya hay un rol con ese nombre." : "No se pudo crear el rol.")
      }
      clave = data.clave
    }

    // Reemplaza los permisos del rol por los elegidos.
    const { error: e1 } = await supabase.from("rol_permisos").delete().eq("rol", clave!)
    const filas = Array.from(elegidos).map((permiso) => ({ rol: clave!, permiso }))
    const { error: e2 } = filas.length > 0 ? await supabase.from("rol_permisos").insert(filas) : { error: null }
    setGuardando(false)
    if (e1 || e2) return setError("El rol se guardó, pero no todos los permisos. Probá de nuevo.")
    onGuardado(rol ? `Rol "${nombre.trim()}" actualizado.` : `Rol "${nombre.trim()}" creado.`)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !guardando && onClose()}>
      <DialogContent className="monarca-theme flex max-h-[90dvh] flex-col bg-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rol ? `Editar rol: ${rol.nombre}` : "Nuevo rol"}</DialogTitle>
          <DialogDescription>Marcá las pantallas que ve y, dentro de cada una, las acciones restringidas.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rol-nombre">Nombre</Label>
              <Input id="rol-nombre" className="bg-white" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Cultivo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rol-descripcion">Descripción (opcional)</Label>
              <Input
                id="rol-descripcion"
                className="bg-white"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
          </div>

          {porGrupo.map(({ grupo, pantallas }) => (
            <fieldset key={grupo} className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{grupo}</legend>
              <div className="divide-y rounded-lg border">
                {pantallas.map((p) => {
                  const ve = elegidos.has(p.ver)
                  return (
                    <div key={p.ver} className="space-y-1.5 px-3 py-2">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={ve}
                          onChange={() => alternar(p.ver, p.acciones.map((a) => a.clave))}
                        />
                        Ver {p.nombre}
                      </label>
                      {p.acciones.map((a) => (
                        <label
                          key={a.clave}
                          className={cn("ml-6 flex items-center gap-2 text-sm", !ve && "text-muted-foreground opacity-60")}
                        >
                          <input type="checkbox" disabled={!ve} checked={elegidos.has(a.clave)} onChange={() => alternar(a.clave)} />
                          {a.label}
                        </label>
                      ))}
                    </div>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : rol ? "Guardar cambios" : "Crear rol"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
