"use client"

import type React from "react"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { SalaCultivo, CamaCultivo, Genetica } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, Leaf, Flower2, Sprout, Package, Settings, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

interface CultivoManagerProps {
  initialSalas: SalaCultivo[]
  geneticas: Genetica[]
}

const estadoConfig = {
  vacio: { label: "Vacío", color: "bg-gray-200 border-gray-400 text-gray-700", icon: Package },
  vegetativo: { label: "Vegetativo", color: "bg-green-200 border-green-500 text-green-800", icon: Sprout },
  floracion: { label: "Floración", color: "bg-purple-200 border-purple-500 text-purple-800", icon: Flower2 },
  cosecha: { label: "Cosecha", color: "bg-amber-200 border-amber-500 text-amber-800", icon: Leaf },
}

export function CultivoManager({ initialSalas, geneticas }: CultivoManagerProps) {
  const [salas, setSalas] = useState(initialSalas)
  const [selectedCama, setSelectedCama] = useState<CamaCultivo | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isAddSalaOpen, setIsAddSalaOpen] = useState(false)
  const [isAddCamaOpen, setIsAddCamaOpen] = useState(false)
  const [selectedSalaId, setSelectedSalaId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const [camaForm, setCamaForm] = useState({
    genetica_id: "",
    cantidad_plantas: "",
    fecha_siembra: "",
    estado: "vacio" as CamaCultivo["estado"],
    notas: "",
  })

  const [salaForm, setSalaForm] = useState({
    nombre: "",
    descripcion: "",
  })

  const [newCamaForm, setNewCamaForm] = useState({
    nombre: "",
  })

  const handleCamaClick = (cama: CamaCultivo) => {
    setSelectedCama(cama)
    setCamaForm({
      genetica_id: cama.genetica_id?.toString() || "",
      cantidad_plantas: cama.cantidad_plantas?.toString() || "",
      fecha_siembra: cama.fecha_siembra || "",
      estado: cama.estado,
      notas: cama.notas || "",
    })
    setIsEditOpen(true)
  }

  const handleSaveCama = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCama) return
    setLoading(true)

    const supabase = createClient()
    const data = {
      genetica_id: camaForm.genetica_id ? Number(camaForm.genetica_id) : null,
      cantidad_plantas: camaForm.cantidad_plantas ? Number(camaForm.cantidad_plantas) : 0,
      fecha_siembra: camaForm.fecha_siembra || null,
      estado: camaForm.estado,
      notas: camaForm.notas || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from("camas_cultivo")
      .update(data)
      .eq("id", selectedCama.id)

    if (!error) {
      setSalas(salas.map(sala => ({
        ...sala,
        camas: sala.camas?.map(cama =>
          cama.id === selectedCama.id
            ? { ...cama, ...data, genetica: geneticas.find(g => g.id === data.genetica_id?.toString()) }
            : cama
        )
      })))
    }

    setLoading(false)
    setIsEditOpen(false)
    router.refresh()
  }

  const handleVaciarCama = async () => {
    if (!selectedCama) return
    setLoading(true)

    const supabase = createClient()
    const data = {
      genetica_id: null,
      cantidad_plantas: 0,
      fecha_siembra: null,
      estado: "vacio" as const,
      notas: null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from("camas_cultivo")
      .update(data)
      .eq("id", selectedCama.id)

    if (!error) {
      setSalas(salas.map(sala => ({
        ...sala,
        camas: sala.camas?.map(cama =>
          cama.id === selectedCama.id ? { ...cama, ...data, genetica: undefined } : cama
        )
      })))
    }

    setLoading(false)
    setIsEditOpen(false)
    router.refresh()
  }

  const handleAddSala = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { data: newSala, error } = await supabase
      .from("salas_cultivo")
      .insert({
        nombre: salaForm.nombre,
        descripcion: salaForm.descripcion || null,
      })
      .select()
      .single()

    if (!error && newSala) {
      setSalas([...salas, { ...newSala, camas: [] }])
      setSalaForm({ nombre: "", descripcion: "" })
    }

    setLoading(false)
    setIsAddSalaOpen(false)
    router.refresh()
  }

  const handleAddCama = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSalaId) return
    setLoading(true)

    const supabase = createClient()
    const { data: newCama, error } = await supabase
      .from("camas_cultivo")
      .insert({
        sala_id: selectedSalaId,
        nombre: newCamaForm.nombre,
      })
      .select()
      .single()

    if (!error && newCama) {
      setSalas(salas.map(sala =>
        sala.id === selectedSalaId
          ? { ...sala, camas: [...(sala.camas || []), newCama] }
          : sala
      ))
      setNewCamaForm({ nombre: "" })
    }

    setLoading(false)
    setIsAddCamaOpen(false)
    router.refresh()
  }

  const handleDeleteSala = async (salaId: number) => {
    if (!confirm("¿Estás seguro de eliminar esta sala? Se eliminarán también todas sus camas.")) return

    const supabase = createClient()
    const { error } = await supabase.from("salas_cultivo").delete().eq("id", salaId)

    if (!error) {
      setSalas(salas.filter(s => s.id !== salaId))
    }
    router.refresh()
  }

  const handleDeleteCama = async (camaId: number) => {
    if (!confirm("¿Estás seguro de eliminar esta cama?")) return

    const supabase = createClient()
    const { error } = await supabase.from("camas_cultivo").delete().eq("id", camaId)

    if (!error) {
      setSalas(salas.map(sala => ({
        ...sala,
        camas: sala.camas?.filter(c => c.id !== camaId)
      })))
      setIsEditOpen(false)
    }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-emerald-900">Salas de Cultivo</h2>
          <p className="text-muted-foreground">Gestiona las salas y camas de cultivo</p>
        </div>
        <Button onClick={() => setIsAddSalaOpen(true)} className="bg-emerald-700 hover:bg-emerald-800">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Sala
        </Button>
      </div>

      {/* Leyenda de estados */}
      <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
        <span className="text-sm font-medium text-muted-foreground">Estados:</span>
        {Object.entries(estadoConfig).map(([key, config]) => {
          const Icon = config.icon
          return (
            <div key={key} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded border-2 ${config.color}`} />
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{config.label}</span>
            </div>
          )
        })}
      </div>

      {/* Tabs para cada sala */}
      <Tabs defaultValue={salas[0]?.id.toString()} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-2 bg-emerald-100/50">
          {salas.map((sala) => (
            <TabsTrigger
              key={sala.id}
              value={sala.id.toString()}
              className="data-[state=active]:bg-emerald-700 data-[state=active]:text-white"
            >
              {sala.nombre}
            </TabsTrigger>
          ))}
        </TabsList>

        {salas.map((sala) => (
          <TabsContent key={sala.id} value={sala.id.toString()} className="mt-6">
            <Card className="border-emerald-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-emerald-800">{sala.nombre}</CardTitle>
                  {sala.descripcion && (
                    <p className="text-sm text-muted-foreground mt-1">{sala.descripcion}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedSalaId(sala.id)
                      setIsAddCamaOpen(true)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Cama
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDeleteSala(sala.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {sala.camas?.map((cama) => {
                    const config = estadoConfig[cama.estado]
                    const Icon = config.icon
                    const genetica = geneticas.find(g => g.id === cama.genetica_id?.toString())

                    return (
                      <button
                        key={cama.id}
                        onClick={() => handleCamaClick(cama)}
                        className={`p-4 rounded-lg border-2 text-left transition-all hover:shadow-md hover:scale-[1.02] ${config.color}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold">{cama.nombre}</span>
                          <Icon className="h-5 w-5" />
                        </div>
                        {cama.estado !== "vacio" && genetica && (
                          <div className="space-y-1 text-sm">
                            <p className="font-medium truncate">{genetica.nombre}</p>
                            <p>{cama.cantidad_plantas} plantas</p>
                            {cama.fecha_siembra && (
                              <p className="text-xs opacity-75">
                                Siembra: {new Date(cama.fecha_siembra).toLocaleDateString("es-AR")}
                              </p>
                            )}
                          </div>
                        )}
                        {cama.estado === "vacio" && (
                          <p className="text-sm opacity-75">Sin asignar</p>
                        )}
                      </button>
                    )
                  })}
                  {(!sala.camas || sala.camas.length === 0) && (
                    <p className="text-muted-foreground col-span-full text-center py-8">
                      No hay camas en esta sala. Agregá una nueva cama.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Modal editar cama */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar {selectedCama?.nombre}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveCama} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="genetica">Genética</Label>
              <Select
                value={camaForm.genetica_id || "none"}
                onValueChange={(value) => setCamaForm({ ...camaForm, genetica_id: value === "none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar genética" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {geneticas.filter(g => g.activo).map((g) => (
                    <SelectItem key={g.id} value={g.id.toString()}>
                      {g.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cantidad_plantas">Cantidad de Plantas</Label>
              <Input
                id="cantidad_plantas"
                type="number"
                value={camaForm.cantidad_plantas}
                onChange={(e) => setCamaForm({ ...camaForm, cantidad_plantas: e.target.value })}
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fecha_siembra">Fecha de Siembra</Label>
              <Input
                id="fecha_siembra"
                type="date"
                value={camaForm.fecha_siembra}
                onChange={(e) => setCamaForm({ ...camaForm, fecha_siembra: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estado">Estado</Label>
              <Select
                value={camaForm.estado}
                onValueChange={(value) => setCamaForm({ ...camaForm, estado: value as CamaCultivo["estado"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(estadoConfig).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea
                id="notas"
                value={camaForm.notas}
                onChange={(e) => setCamaForm({ ...camaForm, notas: e.target.value })}
                placeholder="Observaciones..."
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" className="flex-1 bg-emerald-700 hover:bg-emerald-800" disabled={loading}>
                {loading ? "Guardando..." : "Guardar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleVaciarCama}
                disabled={loading}
              >
                Vaciar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => selectedCama && handleDeleteCama(selectedCama.id)}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal agregar sala */}
      <Dialog open={isAddSalaOpen} onOpenChange={setIsAddSalaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Sala de Cultivo</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSala} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sala_nombre">Nombre</Label>
              <Input
                id="sala_nombre"
                value={salaForm.nombre}
                onChange={(e) => setSalaForm({ ...salaForm, nombre: e.target.value })}
                placeholder="Ej: Sala 4"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sala_descripcion">Descripción (opcional)</Label>
              <Textarea
                id="sala_descripcion"
                value={salaForm.descripcion}
                onChange={(e) => setSalaForm({ ...salaForm, descripcion: e.target.value })}
                placeholder="Descripción de la sala..."
                rows={2}
              />
            </div>
            <Button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800" disabled={loading}>
              {loading ? "Creando..." : "Crear Sala"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal agregar cama */}
      <Dialog open={isAddCamaOpen} onOpenChange={setIsAddCamaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Cama</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCama} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cama_nombre">Nombre</Label>
              <Input
                id="cama_nombre"
                value={newCamaForm.nombre}
                onChange={(e) => setNewCamaForm({ ...newCamaForm, nombre: e.target.value })}
                placeholder="Ej: Cama 5"
                required
              />
            </div>
            <Button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-800" disabled={loading}>
              {loading ? "Creando..." : "Crear Cama"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
