import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/session"
import { createServiceClient } from "@/lib/supabase/service"
import type { RolUsuario } from "@/lib/types"
import { ROL_COMISION, tienePermiso } from "@/lib/permisos"

// Altas y cambios de usuarios. perfiles no tiene policies de escritura (ver
// scripts/066): todo pasa por acá con service_role, y por eso el gateo es
// acá mismo — hace falta el permiso usuarios.administrar (scripts/084).
const BAN_INDEFINIDO = "876000h" // ~100 años: "dado de baja"

async function rolExiste(service: ReturnType<typeof createServiceClient>, rol: string) {
  const { data } = await service.from("roles").select("clave").eq("clave", rol).maybeSingle()
  return !!data
}

async function exigirComision() {
  const session = await getServerSession()
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }
  if (!tienePermiso(session.permisos, "usuarios.administrar")) {
    return { error: NextResponse.json({ error: "Tu rol no puede administrar usuarios" }, { status: 403 }) }
  }
  return { session }
}

export async function GET() {
  const { error } = await exigirComision()
  if (error) return error

  const service = createServiceClient()
  const [{ data: perfiles, error: perfilesError }, { data: authData, error: authError }] = await Promise.all([
    service.from("perfiles").select("*").order("nombre"),
    service.auth.admin.listUsers({ perPage: 200 }),
  ])
  if (perfilesError || authError) {
    console.error("Error al listar usuarios:", perfilesError || authError)
    return NextResponse.json({ error: "No se pudieron cargar los usuarios" }, { status: 500 })
  }

  const emails = new Map(authData.users.map((u) => [u.id, u.email ?? ""]))
  return NextResponse.json({
    usuarios: (perfiles ?? []).map((p) => ({ ...p, email: emails.get(p.user_id) ?? "" })),
  })
}

export async function POST(request: Request) {
  const { error } = await exigirComision()
  if (error) return error

  const body = (await request.json().catch(() => null)) as {
    email?: string
    password?: string
    nombre?: string
    rol?: RolUsuario
  } | null

  const email = body?.email?.trim().toLowerCase()
  const nombre = body?.nombre?.trim()
  const rol = body?.rol ?? "operador"
  if (!email || !nombre || !body?.password) {
    return NextResponse.json({ error: "Completá nombre, email y contraseña" }, { status: 400 })
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: "La contraseña tiene que tener al menos 8 caracteres" }, { status: 400 })
  }
  const service = createServiceClient()
  if (!(await rolExiste(service, rol))) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 })
  }

  const { data: creado, error: createError } = await service.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
  })
  if (createError || !creado.user) {
    const yaExiste = /already|registered|exists/i.test(createError?.message ?? "")
    if (!yaExiste) console.error("Error al crear usuario:", createError)
    return NextResponse.json(
      { error: yaExiste ? "Ya existe un usuario con ese email" : "No se pudo crear el usuario" },
      { status: 400 },
    )
  }

  const { error: perfilError } = await service.from("perfiles").insert({ user_id: creado.user.id, nombre, rol })
  if (perfilError) {
    // Sin perfil la cuenta quedaría como operador "fantasma": se deshace.
    await service.auth.admin.deleteUser(creado.user.id)
    console.error("Error al crear el perfil:", perfilError)
    return NextResponse.json({ error: "No se pudo crear el usuario" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request) {
  const { session, error } = await exigirComision()
  if (error) return error

  const body = (await request.json().catch(() => null)) as {
    user_id?: string
    nombre?: string
    rol?: RolUsuario
    activo?: boolean
    password?: string
  } | null

  if (!body?.user_id) {
    return NextResponse.json({ error: "Falta el usuario" }, { status: 400 })
  }
  if (body.password !== undefined && body.password.length < 8) {
    return NextResponse.json({ error: "La contraseña tiene que tener al menos 8 caracteres" }, { status: 400 })
  }

  const service = createServiceClient()
  if (body.rol !== undefined && !(await rolExiste(service, body.rol))) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 })
  }
  const { data: actual } = await service.from("perfiles").select("*").eq("user_id", body.user_id).maybeSingle()
  if (!actual) {
    return NextResponse.json({ error: "El usuario no existe" }, { status: 404 })
  }

  // Siempre tiene que quedar al menos una persona de la comisión activa, o
  // nadie podría volver a administrar usuarios ni autorizar excepciones.
  const dejaDeSerComision =
    actual.rol === ROL_COMISION &&
    actual.activo &&
    ((body.rol !== undefined && body.rol !== ROL_COMISION) || body.activo === false)
  if (dejaDeSerComision) {
    const { count } = await service
      .from("perfiles")
      .select("user_id", { count: "exact", head: true })
      .eq("rol", "comision")
      .eq("activo", true)
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Tiene que quedar al menos una persona de la comisión activa" }, { status: 400 })
    }
  }
  if (body.activo === false && body.user_id === session.id) {
    return NextResponse.json({ error: "No podés darte de baja a vos mismo" }, { status: 400 })
  }

  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.nombre?.trim()) cambios.nombre = body.nombre.trim()
  if (body.rol !== undefined) cambios.rol = body.rol
  if (body.activo !== undefined) cambios.activo = body.activo

  const { error: updateError } = await service.from("perfiles").update(cambios).eq("user_id", body.user_id)
  if (updateError) {
    console.error("Error al actualizar el perfil:", updateError)
    return NextResponse.json({ error: "No se pudo guardar el cambio" }, { status: 500 })
  }

  const cambiosAuth: { ban_duration?: string; password?: string } = {}
  if (body.activo !== undefined && body.activo !== actual.activo) {
    cambiosAuth.ban_duration = body.activo ? "none" : BAN_INDEFINIDO
  }
  if (body.password) cambiosAuth.password = body.password
  if (Object.keys(cambiosAuth).length > 0) {
    const { error: authError } = await service.auth.admin.updateUserById(body.user_id, cambiosAuth)
    if (authError) {
      console.error("Error al actualizar la cuenta:", authError)
      return NextResponse.json({ error: "Se guardó el perfil pero no se pudo actualizar la cuenta" }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
