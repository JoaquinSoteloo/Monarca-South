import type React from "react"
import type { Metadata } from "next"
import "./theme.css"

export const metadata: Metadata = {
  title: "Monarca South - Vista previa de diseño",
}

export default function PreviewMonarcaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
