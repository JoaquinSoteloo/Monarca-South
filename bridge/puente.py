"""Puente de la sede para los BroadLink (aire acondicionado por infrarrojo).

Corre en la notebook de la sede, que queda prendida y en el mismo WiFi que
los BroadLink. Cada pocos segundos le pregunta al sistema si hay órdenes
para el aire, las manda por infrarrojo y avisa cómo le fue.

Uso (ver LEEME.md):
  python puente.py buscar                      lista los BroadLink de la red
  python puente.py agregar sala5 192.168.0.50  le pone nombre a un BroadLink
  python puente.py aprender sala5 apagar       guarda un botón del control
  python puente.py probar sala5 apagar         manda ese botón
  python puente.py                             queda corriendo (modo puente)

Nombres de botones que usa el sistema:
  apagar
  frio_23, frio_24, ...  (modo y temperatura; los modos del sistema son
                          frio, calor y ventilador)
  frio, calor, ventilador (si no está la temperatura exacta)
  encender               (último recurso)
"""
import json
import os
import sys
import time
import base64
import logging
import urllib.request
import urllib.error

AQUI = os.path.dirname(os.path.abspath(__file__))
EQUIPOS = os.path.join(AQUI, "equipos.json")
CODIGOS = os.path.join(AQUI, "codigos.json")
CONFIG = os.path.join(AQUI, "puente.env")
INTERVALO_S = 4

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    handlers=[logging.FileHandler(os.path.join(AQUI, "puente.log"), encoding="utf-8"), logging.StreamHandler()],
)
log = logging.info


def leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return defecto


def guardar_json(ruta, datos):
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, indent=2, ensure_ascii=False)


def leer_config():
    cfg = {}
    if os.path.exists(CONFIG):
        with open(CONFIG, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if linea and not linea.startswith("#") and "=" in linea:
                    k, v = linea.split("=", 1)
                    cfg[k.strip()] = v.strip()
    cfg.setdefault("MONARCA_URL", os.environ.get("MONARCA_URL", "https://monarca-south.vercel.app"))
    cfg.setdefault("BRIDGE_TOKEN", os.environ.get("BRIDGE_TOKEN", ""))
    cfg.setdefault("BRIDGE_ID", os.environ.get("BRIDGE_ID", "notebook-sede"))
    return cfg


def broadlink_mod():
    try:
        import broadlink  # noqa: F401
        return broadlink
    except ImportError:
        sys.exit("Falta la librería: abrí una terminal y corré  pip install broadlink")


_conexiones = {}


def conectar(nombre):
    equipos = leer_json(EQUIPOS, {})
    if nombre not in equipos:
        raise RuntimeError(f"No hay ningún BroadLink llamado '{nombre}' en equipos.json")
    if nombre in _conexiones:
        return _conexiones[nombre]
    dev = broadlink_mod().hello(equipos[nombre])
    dev.auth()
    _conexiones[nombre] = dev
    return dev


def boton_para(payload):
    accion = payload.get("accion")
    if accion == "apagar":
        return ["apagar"]
    if accion != "encender":
        return []
    modo = str(payload.get("modo") or "").lower()
    candidatos = []
    if modo and payload.get("setpoint") is not None:
        candidatos.append(f"{modo}_{int(round(float(payload['setpoint'])))}")
    if modo:
        candidatos.append(modo)
    candidatos.append("encender")
    return candidatos


def mandar(nombre, payload):
    codigos = leer_json(CODIGOS, {}).get(nombre, {})
    candidatos = boton_para(payload)
    boton = next((b for b in candidatos if b in codigos), None)
    if not boton:
        raise RuntimeError(f"Falta aprender el botón {candidatos[0] if candidatos else '?'} para {nombre}")
    paquete = base64.b64decode(codigos[boton])
    try:
        conectar(nombre).send_data(paquete)
    except Exception:
        _conexiones.pop(nombre, None)  # reintenta una vez con conexión nueva
        conectar(nombre).send_data(paquete)
    return boton


def pedir(cfg, metodo, ruta, cuerpo=None):
    req = urllib.request.Request(
        cfg["MONARCA_URL"].rstrip("/") + ruta,
        method=metodo,
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers={
            "Authorization": f"Bearer {cfg['BRIDGE_TOKEN']}",
            "X-Bridge-Id": cfg["BRIDGE_ID"],
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read() or b"{}")


def correr():
    cfg = leer_config()
    if len(cfg["BRIDGE_TOKEN"]) < 16:
        sys.exit("Falta BRIDGE_TOKEN en puente.env (la misma clave que tiene Vercel).")
    log("Puente de la sede andando. Para cortarlo, cerrá esta ventana.")
    errores = 0
    while True:
        try:
            comandos = pedir(cfg, "GET", "/api/bridge/commands").get("comandos", [])
            errores = 0
            for c in comandos:
                nombre = str(c["dispositivo"]["proveedor_config"].get("equipo", "")).lower()
                try:
                    boton = mandar(nombre, c.get("payload") or {})
                    pedir(cfg, "POST", f"/api/bridge/commands/{c['id']}", {"estado": "ejecutado"})
                    log(f"{c['dispositivo']['nombre']}: {boton}")
                except Exception as e:  # noqa: BLE001
                    pedir(cfg, "POST", f"/api/bridge/commands/{c['id']}", {"estado": "fallido", "error": str(e)[:250]})
                    log(f"{c['dispositivo']['nombre']}: FALLÓ ({e})")
        except urllib.error.HTTPError as e:
            errores += 1
            if e.code == 401:
                log("El sistema rechazó la clave: revisá BRIDGE_TOKEN en puente.env.")
                time.sleep(60)
            elif errores in (1, 10) or errores % 100 == 0:
                log(f"El sistema respondió {e.code}; sigo intentando.")
        except Exception as e:  # noqa: BLE001  (sin internet, etc.)
            errores += 1
            if errores in (1, 10) or errores % 100 == 0:
                log(f"Sin conexión con el sistema ({e}); sigo intentando.")
        time.sleep(INTERVALO_S)


def buscar():
    dispositivos = broadlink_mod().discover(timeout=5)
    if not dispositivos:
        print("No encontré ningún BroadLink. ¿La notebook está en el mismo WiFi?")
    for d in dispositivos:
        print(f"{d.host[0]}  MAC {d.mac.hex(':')}  {d.model or d.type}")
    print("\nTip: en el router, reservá esa IP para cada BroadLink así no cambia.")


def agregar(nombre, ip):
    equipos = leer_json(EQUIPOS, {})
    equipos[nombre.lower()] = ip
    guardar_json(EQUIPOS, equipos)
    print(f"Listo: '{nombre.lower()}' = {ip}")


def aprender(nombre, boton):
    nombre = nombre.lower()
    dev = conectar(nombre)
    dev.enter_learning()
    print(f"Apuntá el control del aire al BroadLink '{nombre}' y apretá el botón para «{boton}» (20 segundos)…")
    paquete = None
    for _ in range(40):
        time.sleep(0.5)
        try:
            paquete = dev.check_data()
            if paquete:
                break
        except Exception:  # noqa: BLE001  (todavía no recibió nada)
            pass
    if not paquete:
        sys.exit("No recibí nada. Probá de nuevo, más cerca del BroadLink.")
    codigos = leer_json(CODIGOS, {})
    codigos.setdefault(nombre, {})[boton] = base64.b64encode(paquete).decode()
    guardar_json(CODIGOS, codigos)
    print(f"Guardado «{boton}» para '{nombre}'.")


def main(args):
    if not args:
        return correr()
    cmd = args[0]
    if cmd == "buscar":
        return buscar()
    if cmd == "agregar" and len(args) == 3:
        return agregar(args[1], args[2])
    if cmd == "aprender" and len(args) == 3:
        return aprender(args[1], args[2].lower())
    if cmd == "probar" and len(args) == 3:
        codigos = leer_json(CODIGOS, {}).get(args[1].lower(), {})
        if args[2].lower() not in codigos:
            sys.exit(f"No está guardado «{args[2]}» para '{args[1]}'.")
        conectar(args[1].lower()).send_data(base64.b64decode(codigos[args[2].lower()]))
        return print("Enviado.")
    print(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
