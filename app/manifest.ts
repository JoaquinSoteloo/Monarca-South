import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Monarca South - Sistema de Gestión",
    short_name: "Monarca South",
    description: "Sistema de gestión interno para Monarca South",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f9f6",
    theme_color: "#00481b",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
