// Interfaz que implementa cualquier provider con modo_ejecucion =
// 'servidor_directo' (ver dispositivos_controlables.modo_ejecucion). El
// motor de reglas nunca importa un adapter concreto directamente: siempre
// pasa por getServerAdapter() en ./index.ts.
export interface ResultadoAdapter {
  estado: "ejecutado" | "fallido"
  error?: string
}

export interface AdapterServidorDirecto {
  ejecutarComando(payload: Record<string, unknown>, proveedorConfig: Record<string, unknown>): Promise<ResultadoAdapter>
}
