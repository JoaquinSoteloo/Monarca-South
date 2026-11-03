import { describe, expect, it } from "vitest"
import { errorDeContrasena, LARGO_MINIMO, validarNuevaContrasena } from "./contrasena"

describe("validarNuevaContrasena", () => {
  it("pide la actual", () => {
    expect(validarNuevaContrasena("", "unaNueva123", "unaNueva123")).toBe("Escribí tu contraseña actual.")
  })
  it("pide un largo mínimo", () => {
    expect(validarNuevaContrasena("actual", "corta", "corta")).toContain(`${LARGO_MINIMO} caracteres`)
  })
  it("las dos nuevas tienen que coincidir", () => {
    expect(validarNuevaContrasena("actual", "unaNueva123", "otraNueva123")).toBe("Las dos contraseñas nuevas no coinciden.")
  })
  it("la nueva tiene que ser distinta", () => {
    expect(validarNuevaContrasena("igualigual", "igualigual", "igualigual")).toBe("La nueva tiene que ser distinta de la actual.")
  })
  it("sin la repetida (en el servidor) solo valida lo demás", () => {
    expect(validarNuevaContrasena("actual", "unaNueva123")).toBeNull()
    expect(validarNuevaContrasena("actual", "unaNueva123", "unaNueva123")).toBeNull()
  })
})

describe("errorDeContrasena", () => {
  it("traduce lo que devuelve Supabase", () => {
    expect(errorDeContrasena("New password should be different from the old password.")).toBe("La nueva tiene que ser distinta de la actual.")
    expect(errorDeContrasena("Password should be at least 6 characters")).toContain("muy fácil")
    expect(errorDeContrasena("Request rate limit reached")).toContain("muchos intentos")
    expect(errorDeContrasena("algo raro")).toBe("No se pudo cambiar la contraseña. Probá de nuevo.")
  })
})
