import { describe, expect, it } from "vitest"
import { PANTALLAS, TODOS_LOS_PERMISOS, permisoDeRuta, tienePermiso } from "./permisos"

describe("permisoDeRuta", () => {
  it("la raíz es Inicio, sin confundirse con otras pantallas", () => {
    expect(permisoDeRuta("/")).toBe("inicio.ver")
    expect(permisoDeRuta("/stock")).toBe("stock.ver")
  })

  it("las subrutas usan el permiso de su pantalla", () => {
    expect(permisoDeRuta("/socios/123")).toBe("socios.ver")
    expect(permisoDeRuta("/ventas/nueva")).toBe("entregas.ver")
  })

  it("no confunde prefijos parecidos", () => {
    expect(permisoDeRuta("/stockeo")).toBeNull()
  })

  it("rutas fuera del catálogo no piden permiso", () => {
    expect(permisoDeRuta("/preview/monarca")).toBeNull()
  })
})

describe("catálogo", () => {
  it("las claves no se repiten y respetan el formato de la base", () => {
    expect(new Set(TODOS_LOS_PERMISOS).size).toBe(TODOS_LOS_PERMISOS.length)
    for (const p of TODOS_LOS_PERMISOS) expect(p).toMatch(/^[a-z-]+\.[a-z]+$/)
  })

  it("cada pantalla tiene su permiso ver", () => {
    for (const p of PANTALLAS) expect(p.ver.endsWith(".ver")).toBe(true)
  })

  it("tienePermiso", () => {
    expect(tienePermiso(["stock.ver"], "stock.ver")).toBe(true)
    expect(tienePermiso(["stock.ver"], "stock.editar")).toBe(false)
    expect(tienePermiso(undefined, "stock.ver")).toBe(false)
  })
})
