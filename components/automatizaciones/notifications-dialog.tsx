"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PushNotificationsManager } from "@/components/push-notifications-manager"

interface NotificationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// El contenido (PushNotificationsManager) solo se monta mientras el diálogo
// está abierto — no hace ninguna solicitud de permisos ni se suscribe solo:
// eso requiere siempre un click explícito dentro del propio componente.
export function NotificationsDialog({ open, onOpenChange }: NotificationsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[600px]">
        <div className="border-b border-border p-6 pb-4">
          <DialogHeader>
            <DialogTitle>Notificaciones push</DialogTitle>
          </DialogHeader>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{open && <PushNotificationsManager />}</div>
      </DialogContent>
    </Dialog>
  )
}
