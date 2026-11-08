#!/usr/bin/env python3
"""Genera las miniaturas de la demo de la web y site/js/fotos.js.

Fotos: las de prueba que trae GOGASORT (demo/fotos, Lorem Picsum / Unsplash).
Las descripciones marcadas con real=True son las que escribió Qwen3.5 Vision en la
demo real (data/cache/analysis.json); las demás se escribieron a mano para la web.
Uso: python3 -I tools/fotos_demo.py
"""
import json, os, subprocess, sys

APP = "/Volumes/500 GB/Demos/GOGASORT/demo/fotos"
WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site")
OUT = os.path.join(WEB, "img", "demo")

# (archivo, id, carpeta, descripcion, motor, confianza, real)
F = [
    ("foto_001.jpg", "paris", "Paisajes", "París con la Torre Eiffel", "qwen", .88, True),
    ("foto_032.jpg", "gafas", "Personas", "Chica con gafas de sol y flores", "clip", .96, False),
    ("foto_089.jpg", "perro", "Animales", "Perrito negro mirando", "qwen", .91, True),
    ("foto_043.jpg", "cafe", "Comida", "Taza de café sobre fondo rojo", "clip", .93, False),
    ("Screenshot_20261101_chat.png", "chat1", "Capturas", "Captura de un chat", "clip", .98, False),
    ("foto_002.jpg", "barco", "Paisajes", "Barco en el mar con ciudad al fondo", "qwen", .84, True),
    ("foto_185.jpg", "piano", "Personas", "Manos tocando piano", "qwen", .79, True),
    ("scan_documento_1.jpg", "recibo", "Documentos", "Recibo de compra escaneado", "clip", .97, False),
    ("foto_026.jpg", "leopardo", "Animales", "Leopardo en un camino de tierra", "clip", .95, False),
    ("foto_353.jpg", "atrapa", "Arte y fondos", "Atrapasueños con plumas", "qwen", .74, True),
    ("foto_041.jpg", "playa", "Vídeos", "Vídeo en la playa · 0:14", "clip", 1.0, False),
    ("foto_033.jpg", "uvas", "Comida", "Uvas negras maduras", "qwen", .86, True),
    ("foto_361.jpg", "bosque", "Personas", "Mujer sola en el bosque", "qwen", .71, True),
    ("foto_257.jpg", "golden", "Paisajes", "Puente dorado de San Francisco", "qwen", .9, True),
    ("foto_057.jpg", "reloj", "Otros", "Reloj analógico", "qwen", .62, True),
    ("foto_109.jpg", "pelicano", "Animales", "Pelícanos en un muelle", "clip", .92, False),
    ("foto_097.jpg", "olas", "Paisajes", "Olas rompiendo sobre rocas", "qwen", .87, True),
    ("foto_089.jpg", "perro2", "Duplicados", "Copia de «perrito negro mirando»", "clip", 1.0, False),
    ("foto_028.jpg", "te", "Comida", "Té en tetera de vidrio", "clip", .9, False),
    ("foto_116.jpg", "fotografo", "Personas", "Fotógrafo con cámara antigua", "clip", .94, False),
    ("foto_094.jpg", "ladrillo", "Arte y fondos", "Textura de pared de ladrillos", "clip", .88, False),
    ("foto_003.jpg", "flores", "Paisajes", "Flores rosas y cielo azul", "qwen", .82, True),
    ("Screenshot_20261102_chat.png", "chat2", "Capturas", "Chat: planes para mañana", "clip", .98, False),
    ("foto_209.jpg", "rana", "Animales", "Rana entre algas verdes", "qwen", .8, True),
    ("foto_425.jpg", "atardecer", "Personas", "Mujer sentada al atardecer", "qwen", .83, True),
    ("foto_113.jpg", "pasarela", "Paisajes", "Pasarela de madera hacia el mar", "qwen", .89, True),
    ("foto_048.jpg", "frambuesa", "Comida", "Frambuesas sobre la mesa", "clip", .91, False),
    ("foto_121.jpg", "laptop", "Otros", "Laptop y café sobre la mesa", "qwen", .66, True),
    ("foto_062.jpg", "pista", "Personas", "Hombre caminando por la pista", "clip", .9, False),
    ("foto_005.jpg", "puerto", "Paisajes", "Barco en puerto", "qwen", .85, True),
    ("foto_124.jpg", "libro", "Documentos", "Libro abierto sobre la mesa", "qwen", .7, False),
    ("foto_158.jpg", "gaviota", "Animales", "Gaviota frente al mar", "clip", .93, False),
    ("foto_129.jpg", "valle", "Paisajes", "Montañas y valle", "qwen", .88, True),
    ("foto_056.jpg", "cabello", "Personas", "Retrato al atardecer en el campo", "clip", .89, False),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    data = []
    for src, pid, folder, cap, eng, conf, real in F:
        dst = os.path.join(OUT, pid + ".webp")
        if not os.path.exists(dst):
            tmp = os.path.join(OUT, "_tmp.png")
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", os.path.join(APP, src),
                            "-vf", "scale=440:440:force_original_aspect_ratio=increase,crop=440:440",
                            tmp], check=True)
            subprocess.run(["cwebp", "-quiet", "-q", "70", tmp, "-o", dst], check=True)
            os.remove(tmp)
        data.append({"id": pid, "f": folder, "c": cap, "e": eng, "p": conf, "r": real})
    js = "// Generado por tools/fotos_demo.py. Fotos de prueba de GOGASORT (Unsplash).\n"
    js += "window.FOTOS = " + json.dumps(data, ensure_ascii=False, indent=0) + ";\n"
    with open(os.path.join(WEB, "js", "fotos.js"), "w", encoding="utf-8") as fh:
        fh.write(js)
    print(len(data), "fotos")


if __name__ == "__main__":
    sys.exit(main())
