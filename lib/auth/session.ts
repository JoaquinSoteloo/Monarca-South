// Única fuente de sesión server-side de Monarca: la cookie httpOnly
// "auth-session" que fija POST /api/auth/login. GET /api/auth/session y
// POST /api/auth/logout ya asumían la existencia de esta cookie, pero login
// nunca llegaba a fijarla — en la práctica NINGÚN endpoint podía verificar
// sesión del lado del servidor, y todo el "auth" real vivía en
// sessionStorage del navegador (ver components/auth-guard.tsx), que no
// protege nada si alguien pega directo contra la API.
//
// No es un sistema de auth nuevo: es terminar de cablear el que ya existía
// a medias, para poder gatear acá los endpoints que ahora sí importan
// (los que pueden terminar moviendo hardware real).
import { cookies } from "next/headers"

export interface AuthSession {
  id: string
  usuario: string
  nombre: string
}

export async function getServerSession(): Promise<AuthSession | null> {
  try {
    const cookieStore = await cookies()
    const raw = cookieStore.get("auth-session")?.value
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.usuario !== "string") return null
    return parsed as AuthSession
  } catch {
    return null
  }
}
