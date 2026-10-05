// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://inquilinatocadiz.org",
  // La sección se llamó "herramientas" en la primera versión.
  redirects: {
    "/afiliate/": "/unete/",
    "/herramientas/": "/utilidades/",
    "/herramientas/renta/": "/utilidades/renta/",
    "/herramientas/plazos/": "/utilidades/plazos/",
    "/herramientas/contrato/": "/utilidades/contrato/",
    "/herramientas/precio-referencia/": "/utilidades/precio-referencia/",
  },
  integrations: [sitemap()],
  vite: { plugins: [tailwindcss()] },
});
