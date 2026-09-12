import { defineConfig } from "vitest/config"
import path from "node:path"

// No corre contra Next.js ni contra Supabase real — usa un cliente Supabase
// en memoria (fake-supabase, ver lib/automations/__tests__) o mockea los
// módulos de @/lib/supabase/* con vi.mock() para validar lógica sin red ni
// base de datos.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
})
