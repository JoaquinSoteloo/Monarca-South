export interface ConfigCitas {
  hora_inicio: string // "HH:MM" o "HH:MM:SS"
  hora_fin: string
  hora_limite_reserva: number
  max_por_turno: number
}

export const CONFIG_CITAS_DEFAULT: ConfigCitas = {
  hora_inicio: "14:00",
  hora_fin: "19:30",
  hora_limite_reserva: 16,
  max_por_turno: 2,
}

// Genera una lista de horarios "HH:MM" entre inicio y fin, cada 30 minutos (inclusive)
export function generarHorarios(horaInicio: string, horaFin: string): string[] {
  const normalizar = (h: string) => h.substring(0, 5) // "HH:MM"
  const aMinutos = (h: string) => {
    const [hh, mm] = normalizar(h).split(":").map(Number)
    return hh * 60 + mm
  }
  const aTexto = (min: number) => {
    const hh = Math.floor(min / 60)
    const mm = min % 60
    return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`
  }

  const inicio = aMinutos(horaInicio)
  const fin = aMinutos(horaFin)
  if (fin < inicio) return []

  const horarios: string[] = []
  for (let m = inicio; m <= fin; m += 30) {
    horarios.push(aTexto(m))
  }
  return horarios
}

// Genera todas las opciones de horario del día en formato 24hs, cada 30 minutos
export function todasLasHoras(): string[] {
  const horarios: string[] = []
  for (let m = 0; m < 24 * 60; m += 30) {
    const hh = Math.floor(m / 60)
    const mm = m % 60
    horarios.push(`${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`)
  }
  return horarios
}
