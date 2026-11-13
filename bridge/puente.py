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
  python puente.py shelly 28372f26420c encender  prende o apaga un Shelly por el WiFi
  python puente.py                             queda corriendo (modo puente)

Nombres de botones que usa el sistema:
  apagar
  frio_23, frio_24, ...  (modo y temperatura; los modos del sistema son
                          frio, calor y ventilador)
  frio, calor, ventilador (si piden el modo sin temperatura)
  encender               (si piden encender sin modo)
Se manda solo el botón exacto: si no está grabado, la orden falla y avisa.
"""
import json
import os
import sys
import time
import base64
import socket
import logging
import subprocess
import ipaddress
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor

AQUI = os.path.dirname(os.path.abspath(__file__))
EQUIPOS = os.path.join(AQUI, "equipos.json")
CODIGOS = os.path.join(AQUI, "codigos.json")
ESTADO = os.path.join(AQUI, "estado.json")  # si el puente dejó cada aire prendido o apagado
ESPERA_ENCENDIDO_S = 3  # lo que tarda el aire en arrancar antes de aceptar la temperatura
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


_fijadas = {}  # nombre -> IP que se fijó en Windows en esta corrida
_SIN_VENTANA = {"creationflags": 0x08000000} if os.name == "nt" else {}  # que no aparezcan ventanas negras


def es_admin():
    try:
        import ctypes
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:  # noqa: BLE001  (no es Windows)
        return False


def fijar_direccion(nombre, ip, mac):
    """Le dice a Windows cuál es la MAC de esta IP, para no tener que preguntarla a la red.

    El BroadLink dormita y no escucha esa pregunta (va a toda la red), así que
    sin esto la notebook a veces no lo encuentra al arrancar. Queda solo
    mientras la notebook esté prendida (store=active): cada vez que arranca el
    puente lo vuelve a poner, con la IP del momento. Necesita administrador.
    """
    if os.name != "nt" or not mac or _fijadas.get(nombre) == ip:
        return
    if not es_admin():
        if "__aviso_admin" not in _fijadas:
            _fijadas["__aviso_admin"] = ""
            log("Aviso: el puente no corre como administrador, así que no puede fijar la dirección del BroadLink. "
                "Anda igual, pero si la notebook se reinicia puede tardar en encontrarlo (ver LEEME, paso 5).")
        return
    anterior = _fijadas.get(nombre)
    # Si ya estaba fijada con esta MAC (por ejemplo, a mano con netsh) se deja como está;
    # si estaba con otra MAC o es una IP vieja de este BroadLink, se reemplaza.
    script = f"""
$ErrorActionPreference = 'Stop'
$i = (Get-NetIPAddress -IPAddress '{ip_local()}').InterfaceIndex
$m = '{mac.replace(':', '-').upper()}'
{f"Remove-NetNeighbor -InterfaceIndex $i -IPAddress '{anterior}' -Confirm:$false -ErrorAction SilentlyContinue" if anterior and anterior != ip else ""}
$n = Get-NetNeighbor -InterfaceIndex $i -IPAddress '{ip}' -ErrorAction SilentlyContinue | Where-Object State -eq 'Permanent'
if ($n -and $n.LinkLayerAddress -eq $m) {{ 'ya estaba' }} else {{
  Remove-NetNeighbor -InterfaceIndex $i -IPAddress '{ip}' -Confirm:$false -ErrorAction SilentlyContinue
  New-NetNeighbor -InterfaceIndex $i -IPAddress '{ip}' -LinkLayerAddress $m -PolicyStore ActiveStore | Out-Null
  'fijada'
}}
"""
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-Command", script],
                           capture_output=True, text=True, timeout=30, **_SIN_VENTANA)
        salida = r.stdout.strip()
        if r.returncode == 0 and salida in ("ya estaba", "fijada"):
            _fijadas[nombre] = ip
            log(f"BroadLink '{nombre}': dirección {salida} en Windows ({ip} = {mac}).")
        else:
            log(f"BroadLink '{nombre}': no pude fijar la dirección ({(r.stderr or salida).strip()[:160]}).")
    except Exception as e:  # noqa: BLE001
        log(f"BroadLink '{nombre}': no pude fijar la dirección ({e}).")


def reencontrar(nombre, mac):
    """Busca el BroadLink por su MAC si el router le cambió la IP."""
    log(f"'{nombre}' no contesta en su IP; lo busco en la red por su MAC {mac}…")
    for d in barrer_red():
        if mac_de(d) == mac:
            equipos = leer_json(EQUIPOS, {})
            equipos[nombre] = {"ip": d.host[0], "mac": mac}
            guardar_json(EQUIPOS, equipos)
            log(f"'{nombre}' ahora está en {d.host[0]}. Lo guardé.")
            fijar_direccion(nombre, d.host[0], mac)
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
    # Solo el botón exacto (decisión de Joaquín, 13/11/2026): si piden frío a 25 y no
    # está grabado frio_25, la orden falla y avisa, en vez de mandar otra cosa.
    modo = str(payload.get("modo") or "").lower()
    if modo and payload.get("setpoint") is not None:
        return [f"{modo}_{int(round(float(payload['setpoint'])))}"]
    if modo:
        return [modo]
    return ["encender"]


def mandar(nombre, payload):
    codigos = leer_json(CODIGOS, {}).get(nombre, {})
    candidatos = boton_para(payload)
    boton = next((b for b in candidatos if b in codigos), None)
    if not boton:
        grabados = ", ".join(sorted(b for b in codigos if b != "apagar")) or "ninguno"
        raise RuntimeError(
            f"Falta aprender el botón {candidatos[0] if candidatos else '?'} para {nombre} (grabados: {grabados})"
        )
    # Los botones de temperatura se grabaron con el aire prendido: no lo prenden
    # si está apagado. Si el puente no lo dejó prendido (o no sabe), primero
    # «encender», espera que arranque y después la temperatura.
    if boton not in ("apagar", "encender") and leer_json(ESTADO, {}).get(nombre) != "prendido":
        if "encender" not in codigos:
            raise RuntimeError(f"Falta aprender el botón encender para {nombre}: hace falta para prender el aire antes de la temperatura")
        enviar(nombre, "encender", codigos)
        time.sleep(ESPERA_ENCENDIDO_S)
        boton_final = enviar(nombre, boton, codigos)
        return f"encender + {boton_final}"
    return enviar(nombre, boton, codigos)


def enviar(nombre, boton, codigos=None):
    """Manda un botón grabado y anota si el aire quedó prendido o apagado."""
    codigos = codigos if codigos is not None else leer_json(CODIGOS, {}).get(nombre, {})
    paquete = base64.b64decode(codigos[boton])
    try:
        conectar(nombre).send_data(paquete)
    except Exception:
        _conexiones.pop(nombre, None)  # reintenta una vez con conexión nueva
        conectar(nombre).send_data(paquete)
    estado = leer_json(ESTADO, {})
    estado[nombre] = "apagado" if boton == "apagar" else "prendido"
    guardar_json(ESTADO, estado)
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
        datos = datos_equipo(equipos, nombre)
        fijar_direccion(nombre, datos["ip"], datos["mac"])
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


_lugar = None
PUERTO_UNICO = 47231  # puerto local que ocupa el puente para saber si ya hay otro corriendo


def ocupar_lugar():
    """Que nunca corran dos puentes a la vez en la misma notebook (se pisarían las órdenes)."""
    global _lugar
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        if os.name == "nt":
            s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        s.bind(("127.0.0.1", PUERTO_UNICO))
        s.listen(1)
    except OSError:
        s.close()
        return False
    _lugar = s
    return True


def correr():
    cfg = leer_config()
    if len(cfg["BRIDGE_TOKEN"]) < 16:
        sys.exit("Falta BRIDGE_TOKEN en puente.env (la misma clave que tiene Vercel).")
    if not ocupar_lugar():
        log("Ya hay un puente corriendo en esta notebook (puede estar sin ventana). No arranco otro.")
        sys.exit(3)  # «Abrir puente.bat» muestra entonces lo que va haciendo el que ya corre
    log("Puente de la sede andando. Para cortarlo, cerrá esta ventana.")
    conectar_todos()
    errores = 0
    vuelta = 0
    while True:
        vuelta += 1
        if vuelta % 2 == 0:  # cada 30 segundos
            saludar_equipos()
        if vuelta % 4 == 1:  # cada minuto (y al arrancar): estado real de los Shelly
            informar_shellys(cfg)
        try:
            comandos = pedir(cfg, "GET", "/api/bridge/commands").get("comandos", [])
            errores = 0
            hubo_shelly = False
            for c in comandos:
                config = c["dispositivo"].get("proveedor_config") or {}
                nombre = str(config.get("equipo", "")).lower()
                try:
                    if c["dispositivo"].get("proveedor") == "shelly_local":
                        boton = mandar_shelly(config, c.get("payload") or {})
                        hubo_shelly = True
                    else:
                        boton = mandar(nombre, c.get("payload") or {})
                    pedir(cfg, "POST", f"/api/bridge/commands/{c['id']}", {"estado": "ejecutado"})
                    log(f"{c['dispositivo']['nombre']}: {boton}")
                except Exception as e:  # noqa: BLE001
                    pedir(cfg, "POST", f"/api/bridge/commands/{c['id']}", {"estado": "fallido", "error": str(e)[:250]})
                    log(f"{c['dispositivo']['nombre']}: FALLÓ ({e})")
            if hubo_shelly:  # que la app muestre enseguida el estado real nuevo
                time.sleep(1)
                informar_shellys(cfg)
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


# --- Shelly por el WiFi (proveedor shelly_local) ---------------------------------
# Relés Shelly Gen2/Gen3 por su API local (http://IP/rpc/Switch.Set), sin pasar
# por la nube: no hacen falta las claves de la cuenta dueña. La app manda el ID
# del Shelly (proveedor_config.device_id) y el canal; el puente lo encuentra en
# la red por el ID y guarda la IP en equipos.json ("shelly:<id>").
# Si el Shelly tiene contraseña, todavía no está soportado (avisa el error).

def _shelly_get(ip, ruta, timeout=4):
    with urllib.request.urlopen(f"http://{ip}{ruta}", timeout=timeout) as r:
        return json.loads(r.read() or b"{}")


def _id_de_shelly(info):
    return str(info.get("mac") or "").lower().replace(":", "")


def buscar_shelly(device_id):
    """Pregunta en cada dirección de la red quién es ese Shelly (unos 20 segundos)."""
    propia = ip_local()
    red = ipaddress.ip_network(f"{propia}/22", strict=False)

    def preguntar(ip):
        try:
            return ip if _id_de_shelly(_shelly_get(ip, "/shelly", timeout=2)) == device_id else None
        except Exception:  # noqa: BLE001
            return None

    with ThreadPoolExecutor(128) as ex:
        for ip in ex.map(preguntar, [str(i) for i in red.hosts() if str(i) != propia]):
            if ip:
                return ip
    return None


def mandar_shelly(config, payload):
    device_id = str(config.get("device_id") or "").strip().lower().replace(":", "")
    canal = int(config.get("canal") or 0)
    accion = payload.get("accion")
    if not device_id:
        raise RuntimeError("El dispositivo no tiene cargado el ID del Shelly")
    if accion not in ("encender", "apagar"):
        raise RuntimeError(f"El Shelly solo prende o apaga (pidieron {accion})")
    clave = f"shelly:{device_id}"
    equipos = leer_json(EQUIPOS, {})
    ruta = f"/rpc/Switch.Set?id={canal}&on={'true' if accion == 'encender' else 'false'}"

    ip = (equipos.get(clave) or {}).get("ip")
    if ip:
        try:
            if _id_de_shelly(_shelly_get(ip, "/shelly")) == device_id:
                _shelly_get(ip, ruta)
                return f"Shelly {accion}"
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise RuntimeError("El Shelly tiene contraseña: el puente todavía no la soporta") from e
            raise
        except Exception:  # noqa: BLE001  (cambió de IP o no contesta: buscarlo)
            pass
    log(f"Busco el Shelly {device_id} en la red…")
    ip = buscar_shelly(device_id)
    if not ip:
        raise RuntimeError(f"No encuentro el Shelly {device_id} en la red. ¿Está enchufado y en el WiFi?")
    equipos = leer_json(EQUIPOS, {})
    equipos[clave] = {"ip": ip}
    guardar_json(EQUIPOS, equipos)
    log(f"Shelly {device_id} en {ip}. Lo guardé.")
    try:
        _shelly_get(ip, ruta)
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise RuntimeError("El Shelly tiene contraseña: el puente todavía no la soporta") from e
        raise
    return f"Shelly {accion}"


_shellys = []  # los Shelly por WiFi que la app le pidió leer (lo devuelve /api/bridge/estado)
_shelly_buscado = {}  # device_id -> cuándo se lo buscó en la red (para no barrer la red cada minuto)


def ip_de_shelly(device_id):
    """IP guardada del Shelly; si no hay, lo busca en la red (como mucho cada 5 minutos)."""
    ip = (leer_json(EQUIPOS, {}).get(f"shelly:{device_id}") or {}).get("ip")
    if ip:
        return ip
    if time.time() - _shelly_buscado.get(device_id, 0) < REINTENTO_S:
        return None
    _shelly_buscado[device_id] = time.time()
    ip = buscar_shelly(device_id)
    if ip:
        equipos = leer_json(EQUIPOS, {})
        equipos[f"shelly:{device_id}"] = {"ip": ip}
        guardar_json(EQUIPOS, equipos)
    return ip


def leer_shelly(device_id, canal):
    """Estado real del relé: (prendido, watts), o None si no contesta."""
    ip = ip_de_shelly(device_id)
    if not ip:
        return None
    try:
        st = _shelly_get(ip, f"/rpc/Switch.GetStatus?id={canal}")
        return bool(st.get("output")), st.get("apower")
    except Exception:  # noqa: BLE001  (cambió de IP: la próxima vez lo busca)
        equipos = leer_json(EQUIPOS, {})
        equipos.pop(f"shelly:{device_id}", None)
        guardar_json(EQUIPOS, equipos)
        return None


def informar_shellys(cfg):
    """Le cuenta a la app el estado real de cada Shelly por WiFi y recibe la lista actualizada."""
    global _shellys
    lecturas = []
    for sh in _shellys:
        estado = leer_shelly(str(sh["device_id"]).lower(), int(sh.get("canal") or 0))
        if estado:
            lecturas.append({"dispositivo_id": sh["id"], "encendido": estado[0], "potencia_w": estado[1]})
    try:
        _shellys = pedir(cfg, "POST", "/api/bridge/estado", {"lecturas": lecturas}).get("shelly", [])
    except Exception:  # noqa: BLE001  (sin internet o versión vieja de la app: se reintenta)
        pass


def main(args):
    if not args:
        return correr()
    cmd = args[0]
    if cmd == "buscar":
        return buscar()
    if cmd == "shelly" and len(args) == 3 and args[2].lower() in ("encender", "apagar"):
        return print(mandar_shelly({"device_id": args[1]}, {"accion": args[2].lower()}) + ": listo.")
    if cmd == "agregar" and len(args) == 3:
        return agregar(args[1], args[2])
    if cmd == "aprender" and len(args) == 3:
        return aprender(args[1], args[2].lower())
    if cmd == "probar" and len(args) == 3:
        codigos = leer_json(CODIGOS, {}).get(args[1].lower(), {})
        if args[2].lower() not in codigos:
            sys.exit(f"No está guardado «{args[2]}» para '{args[1]}'.")
        enviar(args[1].lower(), args[2].lower(), codigos)
        return print("Enviado.")
    print(__doc__)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except RuntimeError as e:  # errores esperables: mostrar el aviso, no el detalle técnico
        sys.exit(str(e))
