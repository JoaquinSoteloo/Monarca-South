"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  isOpen: boolean
  onClose: () => void
}

export function BarcodeScanner({ onScan, isOpen, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string>("")
  const [manualCode, setManualCode] = useState("")
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef<any>(null)
  const readerDivId = "barcode-reader"

  useEffect(() => {
    if (isOpen) {
      startScanner()
    } else {
      stopScanner()
    }

    return () => {
      void stopScanner()
    }
  }, [isOpen])

  const startScanner = async () => {
    try {
      setError("")
      setScanning(true)

      // Importar html5-qrcode dinámicamente
      const { Html5Qrcode } = await import("html5-qrcode")

      // Crear instancia del escáner
      scannerRef.current = new Html5Qrcode(readerDivId)

      // Configuración para móviles
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 150 },
        aspectRatio: 1.777778,
      }

      // Iniciar escáner con cámara trasera
      await scannerRef.current.start(
        { facingMode: "environment" },
        config,
        (decodedText: string) => {
          console.log("[v0] Código detectado:", decodedText)
          onScan(decodedText)
          stopScanner()
          onClose()
        },
        (errorMessage: string) => {
          // Ignorar errores de escaneo continuo
        },
      )
    } catch (err: any) {
      console.error("[v0] Error al iniciar escáner:", err)
      setError("No se pudo acceder a la cámara. Por favor ingresá el código manualmente.")
      setScanning(false)
    }
  }

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
        scannerRef.current = null
      } catch (err) {
        console.log("[v0] Error al detener escáner:", err)
      }
    }
    setScanning(false)
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualCode.trim()) {
      onScan(manualCode.trim())
      setManualCode("")
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Escanear Código de Barras</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div id={readerDivId} className="w-full" />

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground text-center">O ingresá el código manualmente:</p>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Código de barras..."
                className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-foreground"
              />
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                Confirmar
              </Button>
            </form>
          </div>

          <Button variant="outline" onClick={onClose} className="w-full bg-transparent">
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
