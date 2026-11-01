"use client"

/**
 * Externos: personas que no son socias pero se cargan en el sistema para
 * registrarles entregas (máximo por mes en config_entregas, scripts/066).
 * Viven en la misma tabla `socios` con tipo = "externo", así las entregas,
 * deudas e historial funcionan igual que para un socio.
 */
import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Plus, Search, UserCheck, UserX } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { Socio } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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

interface Props {
  initialExternos: Socio[]
  maxEntregasMes: number
}

const formVacio = { nombre: "", apellido: "", dni: "", telefono: "", email: "" }

export function ExternosManager({ initialExternos, maxEntregasMes }: Props) {
  const [externos, setExternos] = useState(initialExternos)
  const [search, setSearch] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [editando, setEditando] = useState<Socio | null>(null)
  const [formData, setFormData] = useState(formVacio)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pasarASocio, setPasarASocio] = useState<Socio | null>(null)
  const router = useRouter()

  const abrirNuevo = () => {
    setEditando(null)
    setFormData(formVacio)
    setError(null)
    setIsOpen(true)
  }

  const abrirEdicion = (externo: Socio) => {
    setEditando(externo)
    setFormData({
      nombre: externo.nombre,
      apellido: externo.apellido,
      dni: externo.dni,
      telefono: externo.telefono || "",
      email: externo.email || "",
    })
    setError(null)
    setIsOpen(true)
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const dni = formData.dni.replace(/\D/g, "")
    if (!formData.nombre.trim() || !formData.apellido.trim() || !dni) {
      setError("Nombre, apellido y DNI son obligatorios")
      return
    }

    setGuardando(true)
    const supabase = createClient()
    const datos = {
      nombre: formData.nombre.trim(),
      apellido: formData.apellido.trim(),
      dni,
      telefono: formData.telefono.trim() || null,
      email: formData.email.trim() || null,
    }

    const { data, error: dbError } = editando
      ? await supabase
          .from("socios")
          .update({ ...datos, updated_at: new Date().toISOString() })
          .eq("id", editando.id)
          .select("*")
          .single()
      : await supabase
          .from("socios")
          .insert({
            ...datos,
            tipo: "externo",
            // Externos: precio general, sin límite de gramos ni REPROCANN.
            es_miembro: false,
            es_vip: false,
            gramos_mensuales: null,
            estado_reprocan: null,
          })
          .select("*")
          .single()

    setGuardando(false)
    if (dbError) {
      setError(
        dbError.code === "23505"
          ? "Ya hay una persona cargada con ese DNI (como socio o externo)"
          : "No se pudo guardar. Intentá nuevamente.",
      )
      return
    }

    setExternos(
      editando
        ? externos.map((x) => (x.id === editando.id ? { ...data, entregas_mes: x.entregas_mes } : x))
        : [...externos, { ...data, entregas_mes: 0 }].sort((a, b) => a.apellido.localeCompare(b.apellido)),
    )
    setIsOpen(false)
    router.refresh()
  }

  const cambiarActivo = async (externo: Socio) => {
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from("socios")
      .update({ activo: !externo.activo, updated_at: new Date().toISOString() })
      .eq("id", externo.id)
    if (!dbError) {
      setExternos(externos.map((x) => (x.id === externo.id ? { ...x, activo: !x.activo } : x)))
    }
  }

  const confirmarPasarASocio = async () => {
    if (!pasarASocio) return
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from("socios")
      .update({ tipo: "socio", updated_at: new Date().toISOString() })
      .eq("id", pasarASocio.id)
    if (!dbError) {
      setExternos(externos.filter((x) => x.id !== pasarASocio.id))
      router.refresh()
    }
    setPasarASocio(null)
  }

  const termino = search.trim().toLowerCase()
  const filtrados = externos.filter(
    (x) =>
      !termino ||
      `${x.apellido} ${x.nombre}`.toLowerCase().includes(termino) ||
      x.dni.includes(termino.replace(/\D/g, "") || termino),
  )

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight text-foreground">Externos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Personas que no son socias. Pueden recibir hasta {maxEntregasMes} entregas por mes.
          </p>
        </div>
        <Button onClick={abrirNuevo}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo externo
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o DNI"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-card pl-9"
          aria-label="Buscar externo"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>DNI</TableHead>
              <TableHead className="hidden md:table-cell">Teléfono</TableHead>
              <TableHead>Entregas del mes</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {externos.length === 0 ? "Todavía no hay externos cargados." : "No hay resultados para esa búsqueda."}
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((x) => {
                const entregas = x.entregas_mes || 0
                const alTope = entregas >= maxEntregasMes
                return (
                  <TableRow key={x.id} className={cn(!x.activo && "opacity-60")}>
                    <TableCell className="font-medium">
                      {x.apellido}, {x.nombre}
                      {!x.activo && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Inactivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{x.dni}</TableCell>
                    <TableCell className="hidden md:table-cell">{x.telefono || "-"}</TableCell>
                    <TableCell>
                      <span className={cn("tabular-nums", alTope ? "font-medium text-destructive" : "text-foreground")}>
                        {entregas} de {maxEntregasMes}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicion(x)} aria-label={`Editar ${x.apellido}, ${x.nombre}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cambiarActivo(x)}
                          aria-label={x.activo ? `Desactivar ${x.apellido}, ${x.nombre}` : `Activar ${x.apellido}, ${x.nombre}`}
                          title={x.activo ? "Desactivar" : "Activar"}
                        >
                          {x.activo ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setPasarASocio(x)} className="bg-card">
                          Pasar a socio
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={(o) => !guardando && setIsOpen(o)}>
        <DialogContent className="monarca-theme sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar externo" : "Nuevo externo"}</DialogTitle>
            <DialogDescription>Persona que no es socia del club.</DialogDescription>
          </DialogHeader>
          <form onSubmit={guardar} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="externo-nombre">Nombre</Label>
                <Input
                  id="externo-nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="externo-apellido">Apellido</Label>
                <Input
                  id="externo-apellido"
                  value={formData.apellido}
                  onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="externo-dni">DNI</Label>
              <Input
                id="externo-dni"
                inputMode="numeric"
                value={formData.dni}
                onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="externo-telefono">Teléfono (opcional)</Label>
              <Input
                id="externo-telefono"
                type="tel"
                value={formData.telefono}
                onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="externo-email">Email (opcional)</Label>
              <Input
                id="externo-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={guardando} className="bg-card">
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pasarASocio} onOpenChange={(o) => !o && setPasarASocio(null)}>
        <DialogContent className="monarca-theme sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Pasar a socio?</DialogTitle>
            <DialogDescription>
              {pasarASocio?.apellido}, {pasarASocio?.nombre} pasa al listado de Socios con todo su historial. Después
              cargale el límite mensual y el estado REPROCANN desde Socios.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPasarASocio(null)} className="bg-card">
              Cancelar
            </Button>
            <Button onClick={confirmarPasarASocio}>Pasar a socio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
