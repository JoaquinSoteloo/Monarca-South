"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Camera, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  isOpen: boolean
  onClose: () => void
}

export function BarcodeScanner({ onScan, isOpen, onClose }: BarcodeScannerProps) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string>("")
  const [manualCode, setManualCode] = useState("")

  useEffect(() => {
    if (isOpen) {
      startCamera()
    } else {
      stopCamera()
    }

    return () => stopCamera()
  }, [isOpen])

  const startCamera = async () => {
    try {
      setError("")
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      })
      setStream(mediaStream)

      // Aquí se integraría una librería de escaneo como quagga2
      // Por simplicidad, mostramos input manual
    } catch (err) {
      setError("No se pudo acceder a la cámara. Por favor ingresá el código manualmente.")
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      setStream(null)
    }
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

          <div className="bg-muted/20 rounded-lg p-8 flex items-center justify-center min-h-[200px]">
            {stream ? (
              <div className="text-center">
                <Camera className="h-16 w-16 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Apuntá la cámara al código de barras</p>
              </div>
            ) : (
              <div className="text-center">
                <Camera className="h-16 w-16 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Cámara no disponible</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground text-center">O ingresá el código manualmente:</p>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Código de barras..."
                className="flex-1 px-3 py-2 rounded-md bg-background border border-border text-foreground"
                autoFocus
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
