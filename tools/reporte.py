#!/usr/bin/env python3
"""Reporte de clics de fotosort.arturogoga.com (Vercel Web Analytics, vía la CLI `vercel api`).

Qué mide (cada visita a la página de salto = 1 clic; los navegadores automatizados no cuentan):
  /proart, /proart/<canal>          -> clics al enlace de la ASUS ProArt P16 (salta a pe.asus.click/v3t6du)
  /descargar/x64[/<canal>], /descargar/arm64[/<canal>] -> clics de descarga
  /                                  -> visitas a la web

El plan Hobby de Vercel solo guarda los datos un tiempo y no desglosa UTM; por eso los canales van en la ruta
y cada ejecución guarda una copia diaria en reportes/historial.json (se fusiona: no se pierde lo viejo).

Uso:  python3 -I tools/reporte.py [desde AAAA-MM-DD] [hasta AAAA-MM-DD]
Sale: reportes/reporte_<fecha>.md  (y lo imprime)
"""
import datetime as dt
import json
import os
import subprocess
import sys
import urllib.parse

PROJECT = "prj_exyA9JCPTha4C4petE0440TWCRjL"
TEAM = "team_XBK06osLLUeqDNDBNYKxv4cf"
INICIO = "2026-11-08"
PRUEBAS = {"/proart/prueba-claude"}          # clics de prueba que no se cuentan
PRUEBAS_DIA = {("2026-11-08", "/proart"): 2}  # 2 clics de prueba antes de tener canales
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "reportes")


def q(by, desde, hasta, limit=100, filtro=None):
    params = [("projectId", PROJECT), ("teamId", TEAM), ("since", desde + "T00:00:00Z"), ("until", hasta + "T23:59:59Z"), ("limit", str(limit))]
    params += [("by", b) for b in by]
    if filtro:
        params.append(("filter", filtro))
    url = "/v1/query/web-analytics/visits/aggregate?" + urllib.parse.urlencode(params)
    out = subprocess.run(["vercel", "api", url, "--method", "GET"], capture_output=True, text=True)
    txt = out.stdout.strip()
    try:
        return json.loads(txt[txt.index("{"):]).get("data", [])
    except ValueError:
        sys.exit("Error de Vercel: " + (out.stderr or txt)[:400])


def tipo(path):
    if path.startswith("/proart"):
        return "proart"
    if path.startswith("/descargar/x64"):
        return "x64"
    if path.startswith("/descargar/arm64"):
        return "arm64"
    if path == "/":
        return "web"
    return "otro"


def canal(path):
    partes = [p for p in path.split("/") if p]
    base = 1 if partes and partes[0] == "proart" else 2
    return partes[base] if len(partes) > base else "directo"


def main():
    hoy = dt.date.today().isoformat()
    desde = sys.argv[1] if len(sys.argv) > 1 else INICIO
    hasta = sys.argv[2] if len(sys.argv) > 2 else hoy
    os.makedirs(RAIZ, exist_ok=True)

    # 1) histórico por día y ruta (se fusiona con lo guardado)
    hist_f = os.path.join(RAIZ, "historial.json")
    hist = json.load(open(hist_f)) if os.path.exists(hist_f) else {}
    for r in q(["day", "requestPath"], desde, hasta, limit=100):
        dia = (r.get("timestamp") or r.get("day") or "")[:10]
        path = r.get("requestPath", "")
        if not dia or path in PRUEBAS:
            continue
        pv = r.get("pageviews", 0) - PRUEBAS_DIA.get((dia, path), 0)
        hist.setdefault(dia, {})[path] = max(pv, hist.get(dia, {}).get(path, 0))
    json.dump(hist, open(hist_f, "w"), indent=1, sort_keys=True)

    dias = sorted(d for d in hist if desde <= d <= hasta)
    tot = {"proart": 0, "x64": 0, "arm64": 0, "web": 0}
    canales = {}
    por_dia = []
    for d in dias:
        fila = {"proart": 0, "x64": 0, "arm64": 0, "web": 0}
        for path, n in hist[d].items():
            t = tipo(path)
            if t in fila:
                fila[t] += n
                tot[t] += n
            if t == "proart":
                canales[canal(path)] = canales.get(canal(path), 0) + n
        por_dia.append((d, fila))

    # 2) desgloses del enlace ProArt (país, dispositivo, sistema, origen)
    f_pro = "startswith(requestPath,'/proart') and requestPath ne '/proart/prueba-claude'"
    def tabla(dim):
        filas = q([dim], desde, hasta, limit=10, filtro=f_pro)
        return sorted(((r.get(dim) or "(sin dato)", r.get("pageviews", 0)) for r in filas), key=lambda x: -x[1])

    L = []
    L.append(f"# Reporte de clics · fotosort.arturogoga.com")
    L.append(f"Periodo: **{desde} a {hasta}** (días en hora UTC) · generado {dt.datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
    L.append("| Métrica | Clics |\n|---|---|")
    L.append(f"| **ASUS ProArt P16** (enlace de seguimiento) | **{tot['proart']}** |")
    L.append(f"| Descargas Windows x64 | {tot['x64']} |")
    L.append(f"| Descargas Windows ARM64 | {tot['arm64']} |")
    L.append(f"| Visitas a la web | {tot['web']} |")
    if tot["web"]:
        L.append(f"\nDe cada 100 visitas a la web, {round(100 * tot['proart'] / tot['web'], 1)} hicieron clic en la ProArt (incluye clics directos al enlace).")
    L.append("\n## ProArt P16 por canal\n\n| Canal (ruta) | Clics |\n|---|---|")
    for c, n in sorted(canales.items(), key=lambda x: -x[1]):
        L.append(f"| {c} (`/proart{'' if c == 'directo' else '/' + c}`) | {n} |")
    L.append("\n## Por día\n\n| Día | ProArt | x64 | ARM64 | Web |\n|---|---|---|---|---|")
    for d, f in por_dia:
        L.append(f"| {d} | {f['proart']} | {f['x64']} | {f['arm64']} | {f['web']} |")
    for dim, titulo in [("country", "País"), ("deviceType", "Dispositivo"), ("osName", "Sistema"), ("referrerHostname", "Viene de")]:
        L.append(f"\n## ProArt P16 por {titulo.lower()}\n\n| {titulo} | Clics |\n|---|---|")
        for k, n in tabla(dim):
            L.append(f"| {k} | {n} |")
    L.append("\n_Notas: cada visita a la página de salto cuenta como un clic; no cuentan los bots ni los navegadores automatizados. "
             "Los desgloses por país/dispositivo pueden incluir los 2 clics de prueba del 8-nov. «Viene de» suele salir vacío desde apps (TikTok, Instagram), por eso los canales van en la ruta._")
    md = "\n".join(L) + "\n"
    out = os.path.join(RAIZ, f"reporte_{hasta}.md")
    open(out, "w", encoding="utf-8").write(md)
    print(md)
    print("->", out)


if __name__ == "__main__":
    main()
