"""Puente de la sede para los BroadLink (aire acondicionado por infrarrojo).

Corre en la notebook de la sede, que queda prendida y en el mismo WiFi que
los BroadLink. Cada pocos segundos le pregunta al sistema si hay órdenes
para el aire, las manda por infrarrojo y avisa cómo le fue.

Uso (ver LEEME.md):
  python puente.py buscar                      lista los BroadLink de la red
  python puente.py agregar sala5 192.168.0.50  le pone nombre a un BroadLink
                                               (guarda su MAC: si el router le
                                               cambia la IP, lo vuelve a encontrar)
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
import socket
import logging
import ipaddress
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

AQUI = os.path.dirname(os.path.abspath(__file__))
EQUIPOS = os.path.join(AQUI, "equipos.json")
CODIGOS = os.path.join(AQUI, "codigos.json")
CONFIG = os.path.join(AQUI, "puente.env")
INTERVALO_S = 15

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


def ip_local():
    """IP de la notebook en el WiFi (no manda nada: solo elige la placa de red)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()


def barrer_red():
    """Le pregunta a cada dirección de la red si es un BroadLink.

    Más lento que la búsqueda general (unos 20 segundos), pero encuentra
    BroadLink que no contestan a esa búsqueda. Recorre las 1.022 direcciones
    alrededor de la de la notebook, que cubren las redes de casa y de oficina.
    """
    bl = broadlink_mod()
    propia = ip_local()
    red = ipaddress.ip_network(f"{propia}/22", strict=False)

    def preguntar(ip):
        try:
            return bl.discover(timeout=2, local_ip_address=propia, discover_ip_address=ip)
        except Exception:  # noqa: BLE001  (no es un BroadLink o no contesta)
            return []

    ips = [str(ip) for ip in red.hosts() if str(ip) != propia]
    with ThreadPoolExecutor(128) as ex:
        return [d for encontrados in ex.map(preguntar, ips) for d in encontrados]


def mac_de(dev):
    return dev.mac.hex(":")


def datos_equipo(equipos, nombre):
    """equipos.json guarda {"ip", "mac"}; las versiones viejas guardaban solo la IP."""
    valor = equipos[nombre]
    return valor if isinstance(valor, dict) else {"ip": valor, "mac": None}


def reencontrar(nombre, mac):
    """Busca el BroadLink por su MAC si el router le cambió la IP."""
    log(f"'{nombre}' no contesta en su IP; lo busco en la red por su MAC {mac}…")
    for d in barrer_red():
        if mac_de(d) == mac:
            equipos = leer_json(EQUIPOS, {})
            equipos[nombre] = {"ip": d.host[0], "mac": mac}
            guardar_json(EQUIPOS, equipos)
            log(f"'{nombre}' ahora está en {d.host[0]}. Lo guardé.")
            return d
    raise RuntimeError(
        f"No encuentro el BroadLink '{nombre}' en la red. ¿Está enchufado? "
        "Si la luz está normal, desenchufalo, enchufalo y probá de nuevo."
    )


def conectar(nombre):
    equipos = leer_json(EQUIPOS, {})
    if nombre not in equipos:
        raise RuntimeError(f"No hay ningún BroadLink llamado '{nombre}' en equipos.json")
    if nombre in _conexiones:
        return _conexiones[nombre]
    datos = datos_equipo(equipos, nombre)
    try:
        dev = broadlink_mod().hello(datos["ip"])
    except Exception:
        if not datos["mac"]:
            raise
        dev = reencontrar(nombre, datos["mac"])
    if datos["mac"] is None:  # equipo agregado con una versión vieja: guardo su MAC
        equipos[nombre] = {"ip": datos["ip"], "mac": mac_de(dev)}
        guardar_json(EQUIPOS, equipos)
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


REINTENTO_S = 5 * 60  # si un BroadLink se pierde, buscarlo en la red como mucho cada 5 minutos
_perdidos = {}  # nombre -> cuándo se intentó encontrarlo por última vez


def conectar_equipo(nombre):
    """Conecta un BroadLink (y lo busca por MAC si cambió de IP). Avisa solo cuando cambia algo."""
    try:
        dev = conectar(nombre)
    except Exception as e:  # noqa: BLE001
        if nombre not in _perdidos:
            log(f"{e} Sigo intentando cada {REINTENTO_S // 60} minutos.")
        _perdidos[nombre] = time.time()
        return False
    if nombre in _perdidos:
        del _perdidos[nombre]
        log(f"BroadLink '{nombre}': de nuevo conectado en {dev.host[0]}.")
    return True


def conectar_todos():
    """Al arrancar, se conecta a cada BroadLink sin esperar a que llegue una orden."""
    equipos = leer_json(EQUIPOS, {})
    if not equipos:
        log("No hay BroadLink cargados: corré  python puente.py agregar sala5 <IP>")
    for nombre in equipos:
        if conectar_equipo(nombre):
            log(f"BroadLink '{nombre}': conectado en {_conexiones[nombre].host[0]}.")


def saludar_equipos():
    """Le habla a cada BroadLink para mantener la conexión viva.

    El BroadLink dormita para ahorrar energía y no escucha los mensajes que
    van a toda la red: si la notebook se olvida de su dirección, no lo puede
    volver a encontrar. Saludarlo seguido la mantiene fresca. Si no contesta,
    lo vuelve a conectar (buscándolo por MAC) sin esperar a la próxima orden.
    """
    bl = broadlink_mod()
    for nombre in leer_json(EQUIPOS, {}):
        if nombre in _perdidos:
            if time.time() - _perdidos[nombre] >= REINTENTO_S:
                conectar_equipo(nombre)
            continue
        ip = datos_equipo(leer_json(EQUIPOS, {}), nombre)["ip"]
        try:
            bl.hello(ip, timeout=3)
            if nombre not in _conexiones:
                conectar_equipo(nombre)
        except Exception:  # noqa: BLE001  (no contestó: conexión nueva, buscándolo si hace falta)
            _conexiones.pop(nombre, None)
            conectar_equipo(nombre)


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
    conectar_todos()
    errores = 0
    vuelta = 0
    while True:
        vuelta += 1
        if vuelta % 2 == 0:  # cada 30 segundos
            saludar_equipos()
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
    dispositivos = broadlink_mod().discover(timeout=5, local_ip_address=ip_local())
    if not dispositivos:
        print("La búsqueda rápida no encontró nada; pregunto dirección por dirección (unos 20 segundos)…")
        dispositivos = barrer_red()
    if not dispositivos:
        print("No encontré ningún BroadLink. ¿Está enchufado y en el mismo WiFi? Probá desenchufarlo y enchufarlo.")
    for d in dispositivos:
        bloqueado = "  ¡BLOQUEADO! (desbloquealo en la app BroadLink)" if d.is_locked else ""
        print(f"{d.host[0]}  MAC {mac_de(d)}  {d.model or d.type}{bloqueado}")


def agregar(nombre, ip):
    nombre = nombre.lower()
    try:
        mac = mac_de(broadlink_mod().hello(ip))
    except Exception:  # noqa: BLE001
        sys.exit(f"No hay ningún BroadLink contestando en {ip}. Corré  python puente.py buscar")
    equipos = leer_json(EQUIPOS, {})
    equipos[nombre] = {"ip": ip, "mac": mac}
    guardar_json(EQUIPOS, equipos)
    print(f"Listo: '{nombre}' = {ip} (MAC {mac}). Si el router le cambia la IP, el puente lo encuentra solo.")


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
    try:
        main(sys.argv[1:])
    except RuntimeError as e:  # errores esperables: mostrar el aviso, no el detalle técnico
        sys.exit(str(e))
