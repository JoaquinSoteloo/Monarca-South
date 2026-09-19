import type React from "react"
import { Fraunces } from "next/font/google"

// Serif de marca solo para /reservar (títulos y números destacados). Se
// expone como variable CSS acotada a este layout para no tocar la tipografía
// global (Geist) del resto de la app.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
})

export default function ReservarLayout({ children }: { children: React.ReactNode }) {
  return <div className={fraunces.variable}>{children}</div>
}
