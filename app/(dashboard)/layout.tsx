import type React from "react"
import "./theme.css"
import { AppShell } from "@/components/app-shell"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
