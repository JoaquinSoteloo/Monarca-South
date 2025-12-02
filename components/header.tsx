import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HeaderProps {
  title?: string
  showBack?: boolean
}

export function Header({ title, showBack = false }: HeaderProps) {
  return (
    <header className="border-b border-emerald-800/30 bg-gradient-to-r from-emerald-950 to-emerald-900">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          {showBack && (
            <Link href="/">
              <Button
                variant="ghost"
                size="icon"
                className="text-amber-200/70 hover:text-amber-200 hover:bg-emerald-800/50"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          )}
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo-monarca.png" alt="Monarca South" width={48} height={48} className="rounded-full" />
            <div className="flex flex-col">
              <span className="text-xl font-bold text-amber-200 tracking-wide">Monarca South</span>
              <span className="text-xs text-amber-200/60 tracking-widest uppercase">{title || "Gestión"}</span>
            </div>
          </Link>
        </div>
      </div>
    </header>
  )
}
