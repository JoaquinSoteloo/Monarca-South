# Puente de la sede para los BroadLink

La notebook de la sede (Windows) hace de puente entre el sistema y los
BroadLink que manejan los aires. Cada 4 segundos le pregunta al sistema si
hay órdenes, las manda por infrarrojo y avisa cómo le fue. Si la notebook
está apagada, la orden vence a los 2 minutos y Automatizaciones la marca
como vencida.

## 1. Lo que tiene que hacer Joaco (una vez)

1. Generar una clave larga al azar (32 caracteres o más) y cargarla en
   Vercel como `BRIDGE_TOKEN`. Redeploy. **No mandarla por chat.**
2. Pasarle la clave a quien instale el puente en persona (o escribirla él
   mismo en `puente.env` de la notebook).

## 2. Preparar la notebook (una vez)

1. **Energía:** Configuración → Sistema → Energía → con cargador:
   suspender **Nunca**, apagar pantalla puede quedar. Panel de control →
   Opciones de energía → "Elegir el comportamiento al cerrar la tapa":
   **No hacer nada** (con cargador). Dejarla siempre enchufada.
2. **Windows Update:** Configuración → Windows Update → Horas activas:
   ponerlas en el horario de la noche de flora, para que no se reinicie
   justo ahí.
3. **Python:** instalar desde python.org (3.11 o más nuevo) y tildar
   **"Add python.exe to PATH"**.
4. Abrir una terminal (Win+R → `cmd`) y correr:
   `pip install broadlink`
5. Copiar esta carpeta `bridge` a la notebook, por ejemplo en
   `C:\Monarca\bridge`.
6. Copiar `puente.env.ejemplo` como `puente.env` y completar `BRIDGE_TOKEN`.
7. Pegar un cartel: **"No apagar: controla los aires de las salas"**.

## 3. Cargar cada BroadLink (en la notebook, dentro de la carpeta)

```
cd C:\Monarca\bridge
python puente.py buscar
python puente.py agregar sala5 192.168.0.50
```

`buscar` muestra la IP de cada BroadLink. Conviene reservar esa IP en el
router para que no cambie. El nombre (`sala5`) es el mismo que después se
escribe en Automatizaciones → dispositivo → "Nombre en el puente".

## 4. Enseñarle los botones del control del aire

Con el control remoto del split, apuntando al BroadLink:

```
python puente.py aprender sala5 apagar
python puente.py aprender sala5 frio_23
python puente.py aprender sala5 frio_24
python puente.py probar sala5 apagar
```

- `apagar` es obligatorio.
- `frio_23` = en el control, poner **frío y 23 °C** y apretar el botón de
  encender (el control manda todo junto). Aprender las temperaturas que usen
  las reglas (por ejemplo 23 y 24).
- Si una regla pide una temperatura que no está aprendida, usa `frio` y, si
  tampoco está, `encender`. Si no hay ninguno, el comando falla con el
  aviso "Falta aprender el botón…".

Los botones quedan en `codigos.json`, solo en la notebook.

## 5. Dejarlo corriendo solo

- Probar primero a mano: `python puente.py` (muestra lo que hace).
- Para que arranque solo: Win+R → `shell:startup` → poner ahí un acceso
  directo a `iniciar-puente.bat`. Corre sin ventana; lo que hace queda
  anotado en `puente.log`.

## 6. Conectar en el sistema

Automatizaciones → Sala 5 → Nuevo dispositivo: tipo Aire acondicionado,
proveedor **BroadLink**, "Nombre en el puente" = `sala5`. Probar desde
Control manual y después crear la regla de temperatura.
