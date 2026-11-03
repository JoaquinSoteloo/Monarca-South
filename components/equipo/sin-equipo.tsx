/** Aviso para las pantallas del equipo cuando faltan las tablas o el usuario no está en el equipo. */
export function SinEquipo({ titulo, tablaFaltante }: { titulo: string; tablaFaltante: boolean }) {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-xl rounded-lg border p-6 text-sm">
        <h1 className="mb-2 text-lg font-semibold">{titulo}</h1>
        {tablaFaltante ? (
          <p>
            Falta crear las tablas del equipo. Correr <code>scripts/077_create_equipo_tareas.sql</code> y después{" "}
            <code>scripts/078_seed_equipo.sql</code> en el SQL Editor de Supabase.
          </p>
        ) : (
          <p>
            Tu usuario todavía no está en el equipo. Cada persona se crea en la pantalla Usuarios y después se suma al
            equipo (área y quién supervisa) corriendo <code>scripts/078_seed_equipo.sql</code>.
          </p>
        )}
      </div>
    </main>
  )
}
