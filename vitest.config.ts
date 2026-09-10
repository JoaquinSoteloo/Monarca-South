import { defineConfig } from "vitest/config"
import path from "node:path"

// Cobertura hoy: SOLO lib/automations/engine.ts (ver
// lib/automations/__tests__/engine.test.ts). No corre contra Next.js ni
// contra Supabase real — usa un cliente Supabase en memoria (fake-supabase)
// para poder validar la lógica temporal del motor sin red ni base de datos.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
