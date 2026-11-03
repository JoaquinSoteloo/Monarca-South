"use client"

/**
 * Usuarios con rol (operador / comisión) y reglas de entrega configurables.
 * Sólo la comisión llega a esta pantalla. Las altas y cambios de usuarios
 * van por /api/usuarios (service_role); la configuración de reglas se guarda
 * directo, la policy de config_entregas sólo deja escribir a la comisión.
 */
import type React from "react"
import { useEffect, useState } from "react"
import { KeyRound, Pencil, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { ConfigEntregas, Perfil, RolUsuario } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type Usuario = Perfil & { email: string }


interface Props {
  usuarioActualId: string
  initialConfig: ConfigEntregas
}

export function UsuariosManager({ usuarioActualId, initialConfig }: Props) {
  // Mensaje de resultado arriba de la pantalla (la app no monta un Toaster).
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  // Roles para elegir (scripts/084): la comisión primero.
  const [roles, setRoles] = useState<{ clave: string; nombre: string }[]>([])
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: "", email: "", password: "", rol: "operador" as RolUsuario })
  const [passwordPara, setPasswordPara] = useState<Usuario | null>(null)
  const [nombrePara, setNombrePara] = useState<Usuario | null>(null)
  const [nuevoNombre, setNuevoNombre] = useState("")
  const [nuevaPassword, setNuevaPassword] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [config, setConfig] = useState({
    tope_deuda: String(initialConfig.tope_deuda),
    dias_max_pendiente: String(initialConfig.dias_max_pendiente),
    max_entregas_externo_mes: String(initialConfig.max_entregas_externo_mes),
  })
  const [guardandoConfig, setGuardandoConfig] = useState(false)

  const cargar = async () => {
    setCargando(true)
    const { data: rolesData } = await createClient()
      .from("roles")
      .select("clave, nombre")
      .order("es_sistema", { ascending: false })
      .order("nombre")
    setRoles(rolesData || [])
    const response = await fetch("/api/usuarios")
    const data = await response.json().catch(() => ({}))
    if (response.ok) setUsuarios(data.usuarios)
    else setAviso({ ok: false, texto: data.error || "No se pudieron cargar los usuarios" })
    setCargando(false)
  }

  useEffect(() => {
    cargar()
  }, [])

  const actualizar = async (userId: string, cambios: Partial<Pick<Usuario, "rol" | "activo" | "nombre">> & { password?: string }) => {
    const response = await fetch("/api/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, ...cambios }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setAviso({ ok: false, texto: data.error || "No se pudo guardar el cambio" })
      return false
    }
    await cargar()
    return true
  }

  const crear = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    const response = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuevo),
    })
    const data = await response.json().catch(() => ({}))
    setEnviando(false)
    if (!response.ok) {
      setError(data.error || "No se pudo crear el usuario")
      return
    }
    setNuevoOpen(false)
    setNuevo({ nombre: "", email: "", password: "", rol: "operador" })
    setAviso({ ok: true, texto: `Usuario creado: ${nuevo.nombre} ya puede entrar con su email.` })
    await cargar()
  }

  const cambiarPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordPara) return
    setError(null)
    if (nuevaPassword.length < 8) {
      setError("La contraseña tiene que tener al menos 8 caracteres")
      return
    }
    setEnviando(true)
    const ok = await actualizar(passwordPara.user_id, { password: nuevaPassword })
    setEnviando(false)
    if (ok) {
      setPasswordPara(null)
      setNuevaPassword("")
      setAviso({ ok: true, texto: `Contraseña de ${passwordPara.nombre} actualizada.` })
    }
  }

  const cambiarNombre = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombrePara) return
    setError(null)
    const nombre = nuevoNombre.trim()
    if (!nombre) {
      setError("Escribí el nombre")
      return
    }
    setEnviando(true)
    const ok = await actualizar(nombrePara.user_id, { nombre })
    setEnviando(false)
    if (ok) {
      setNombrePara(null)
      setAviso({ ok: true, texto: `Ahora se llama ${nombre}. Se ve así en tareas, chats y registros nuevos.` })
    }
  }

  const guardarConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    const tope = Number(config.tope_deuda)
    const dias = Number(config.dias_max_pendiente)
    const maxExt = Number(config.max_entregas_externo_mes)
    if (!(tope >= 0) || !Number.isInteger(dias) || dias <= 0 || !Number.isInteger(maxExt) || maxExt <= 0) {
      setAviso({ ok: false, texto: "Revisá las reglas: tienen que ser números positivos." })
      return
    }
    setGuardandoConfig(true)
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from("config_entregas")
      .update({
        tope_deuda: tope,
        dias_max_pendiente: dias,
        max_entregas_externo_mes: maxExt,
        updated_at: new Date().toISOString(),
        updated_by: usuarioActualId,
      })
      .eq("id", true)
    setGuardandoConfig(false)
    setAviso(dbError ? { ok: false, texto: "No se pudieron guardar las reglas. Intentá nuevamente." } : { ok: true, texto: "Reglas actualizadas." })
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {aviso && (
        <p
          role="status"
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            aviso.ok ? "border-primary/30 bg-primary/5 text-foreground" : "border-red-200 bg-red-50 text-destructive",
          )}
        >
          {aviso.texto}
        </p>
      )}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold leading-tight text-foreground">Usuarios</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada persona entra con su propio usuario. Sólo la comisión directiva autoriza excepciones y administra
              usuarios.
            </p>
          </div>
          <Button
            onClick={() => {
              setError(null)
              setNuevoOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo usuario
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cargando ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Cargando usuarios...
                  </TableCell>
                </TableRow>
              ) : (
                usuarios.map((u) => (
                  <TableRow key={u.user_id} className={cn(!u.activo && "opacity-60")}>
                    <TableCell className="font-medium">
                      {u.nombre}
                      {u.user_id === usuarioActualId && <span className="ml-1 text-xs text-muted-foreground">(vos)</span>}
                      {!u.activo && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Dado de baja
                        </Badge>
                      )}
                      <p className="text-xs text-muted-foreground md:hidden">{u.email}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{u.email}</TableCell>
                    <TableCell>
                      <Select value={u.rol} onValueChange={(rol) => actualizar(u.user_id, { rol: rol as RolUsuario })}>
                        <SelectTrigger className="w-[190px] bg-card" aria-label={`Rol de ${u.nombre}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="monarca-theme">
                          {roles.map((r) => (
                            <SelectItem key={r.clave} value={r.clave}>
                              {r.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Cambiar nombre"
                          aria-label={`Cambiar el nombre de ${u.nombre}`}
                          onClick={() => {
                            setError(null)
                            setNuevoNombre(u.nombre)
                            setNombrePara(u)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Cambiar contraseña"
                          aria-label={`Cambiar contraseña de ${u.nombre}`}
                          onClick={() => {
                            setError(null)
                            setNuevaPassword("")
                            setPasswordPara(u)
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {u.user_id !== usuarioActualId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title={u.activo ? "Dar de baja" : "Reactivar"}
                            aria-label={u.activo ? `Dar de baja a ${u.nombre}` : `Reactivar a ${u.nombre}`}
                            onClick={() => actualizar(u.user_id, { activo: !u.activo })}
                          >
                            {u.activo ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Reglas de entrega
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Si una entrega no cumple alguna, sólo se registra con autorización de la comisión.
          </p>
        </div>
        <form onSubmit={guardarConfig} className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="tope-deuda">Tope de deuda por socio ($)</Label>
            <Input
              id="tope-deuda"
              inputMode="decimal"
              value={config.tope_deuda}
              onChange={(e) => setConfig({ ...config, tope_deuda: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dias-pendiente">Días máximos de un aporte pendiente</Label>
            <Input
              id="dias-pendiente"
              inputMode="numeric"
              value={config.dias_max_pendiente}
              onChange={(e) => setConfig({ ...config, dias_max_pendiente: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max-externos">Entregas por mes para externos</Label>
            <Input
              id="max-externos"
              inputMode="numeric"
              value={config.max_entregas_externo_mes}
              onChange={(e) => setConfig({ ...config, max_entregas_externo_mes: e.target.value })}
            />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={guardandoConfig}>
              {guardandoConfig ? "Guardando..." : "Guardar reglas"}
            </Button>
          </div>
        </form>
      </section>

      <Dialog open={nuevoOpen} onOpenChange={(o) => !enviando && setNuevoOpen(o)}>
        <DialogContent className="monarca-theme sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>La persona entra con este email y contraseña.</DialogDescription>
          </DialogHeader>
          <form onSubmit={crear} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nuevo-nombre">Nombre</Label>
              <Input id="nuevo-nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nuevo-email">Email</Label>
              <Input
                id="nuevo-email"
                type="email"
                autoComplete="off"
                value={nuevo.email}
                onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nuevo-password">Contraseña inicial (mínimo 8 caracteres)</Label>
              <Input
                id="nuevo-password"
                type="password"
                autoComplete="new-password"
                value={nuevo.password}
                onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nuevo-rol">Rol</Label>
              <Select value={nuevo.rol} onValueChange={(rol) => setNuevo({ ...nuevo, rol: rol as RolUsuario })}>
                <SelectTrigger id="nuevo-rol" className="bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="monarca-theme">
                  {roles.map((r) => (
                      <SelectItem key={r.clave} value={r.clave}>
                        {r.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setNuevoOpen(false)} disabled={enviando} className="bg-card">
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando ? "Creando..." : "Crear usuario"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!nombrePara} onOpenChange={(o) => !enviando && !o && setNombrePara(null)}>
        <DialogContent className="monarca-theme sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar nombre</DialogTitle>
            <DialogDescription>{nombrePara?.email}</DialogDescription>
          </DialogHeader>
          <form onSubmit={cambiarNombre} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nuevo-nombre">Nombre</Label>
              <Input id="nuevo-nombre" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} autoFocus />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setNombrePara(null)} disabled={enviando} className="bg-card">
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordPara} onOpenChange={(o) => !enviando && !o && setPasswordPara(null)}>
        <DialogContent className="monarca-theme sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>{passwordPara?.nombre}</DialogDescription>
          </DialogHeader>
          <form onSubmit={cambiarPassword} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nueva-password">Nueva contraseña (mínimo 8 caracteres)</Label>
              <Input
                id="nueva-password"
                type="password"
                autoComplete="new-password"
                value={nuevaPassword}
                onChange={(e) => setNuevaPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setPasswordPara(null)} disabled={enviando} className="bg-card">
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
