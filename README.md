# fotosort por arturogoga · web (fotosort.arturogoga.com)

Web de descargas y demo de fotosort (antes GOGASORT): ordena fotos y vídeos con IA que corre en tu PC
(SigLIP2 + Qwen3.5 Vision vía Ollama). Sin nube, sin cuentas, gratis.

- `site/` · la web estática (HTML/CSS/JS, sin build). `js/esfera.js` es el globo de fotos.
- `site/proart` · enlace de seguimiento a la ASUS ProArt P16 (cuenta la visita en Vercel Web Analytics y salta a https://pe.asus.click/v3t6du).
- `site/descargar/{windows,x64,arm64}` · enlaces de descarga con conteo (windows = instalador único).
- `tools/fotos_demo.py` · regenera las miniaturas de la demo desde la app.
- `tools/capturas.mjs` · capturas de revisión (escritorio y móvil).
- `tools/reporte.py` · reporte de clics (Vercel Web Analytics vía `vercel api`; guarda histórico en `reportes/`, que no se versiona).

Hecho por @arturogoga.
