import { describe, expect, it } from "vitest"
import { PANTALLAS, TODOS_LOS_PERMISOS, permisoDeRuta, primeraPantalla, tienePermiso } from "./permisos"

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

  it("el Chat y las pantallas anteriores usan el permiso de Equipo y Sede", () => {
    expect(permisoDeRuta("/chat")).toBe("equipo.ver")
    expect(permisoDeRuta("/chatear")).toBeNull()
    expect(permisoDeRuta("/equipo/anterior")).toBe("equipo.ver")
    expect(permisoDeRuta("/sede/oficina")).toBe("sede.ver")
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

describe("cargar gastos sin ver la lista", () => {
  it("/gastos/cargar tiene su propio permiso y /gastos sigue igual", () => {
    expect(permisoDeRuta("/gastos")).toBe("gastos.ver")
    expect(permisoDeRuta("/gastos/cargar")).toBe("gastos-cargar.ver")
  })
})

describe("primeraPantalla", () => {
  it("salta Inicio y respeta el orden del catálogo", () => {
    expect(primeraPantalla(["sede.ver", "equipo.ver", "riego.ver"])).toBe("/equipo")
    expect(primeraPantalla(["inicio.ver", "riego.ver"])).toBe("/riego")
  })

  it("sin pantallas, null", () => {
    expect(primeraPantalla([])).toBeNull()
    expect(primeraPantalla(undefined)).toBeNull()
  })
})
