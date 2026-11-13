# Puente de la sede para los BroadLink

La notebook de la sede (Windows) hace de puente entre el sistema y los
BroadLink que manejan los aires. Cada 15 segundos le pregunta al sistema si
hay órdenes, las manda por infrarrojo y avisa cómo le fue. Si la notebook
está apagada, la orden no se ejecuta tarde: vence a los 2 minutos y, en la
siguiente corrida del motor (cada 5 minutos), la pantalla de Automatizaciones
muestra la alerta y llega un aviso al celular.

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

`buscar` muestra la IP de cada BroadLink. Si no aparece, desenchufalo, volvé
a enchufarlo y buscá de nuevo: a veces queda dormido en la red.

`agregar` guarda también la MAC del BroadLink. Si el router le cambia la IP,
el puente lo vuelve a encontrar solo y guarda la nueva. No hace falta tocar
el router. El nombre (`sala5`) es el mismo que después se
escribe en Automatizaciones → dispositivo → "Nombre en el puente".

**Pasarlo a otra notebook:** copiá la carpeta `bridge` entera, incluidos
`equipos.json` y `codigos.json`. Ahí quedan los botones grabados, así que no
hace falta volver a aprenderlos.

## 4. Enseñarle los botones del control del aire

Con el control remoto del split, apuntando al BroadLink:

```
python puente.py aprender sala5 apagar
python puente.py aprender sala5 encender
python puente.py aprender sala5 frio_23
python puente.py aprender sala5 frio_24
python puente.py probar sala5 apagar
```

- `apagar` es obligatorio.
- `encender` es lo que manda el botón Encender de **Control manual**: en el
  control, poner el aire como lo quieran por defecto (por ejemplo frío y
  23 °C) y apretar el botón de encender.
- `frio_23` = en el control, poner **frío y 23 °C** y apretar el botón de
  encender (el control manda todo junto). Aprender las temperaturas que usen
  las reglas (por ejemplo 23 y 24).
- Se manda solo el botón exacto. Si una regla o Control manual pide una
  temperatura que no está aprendida (por ejemplo frío a 25 sin `frio_25`),
  la orden **falla**: en la app figura como fallida con "Falta aprender el
  botón frio_25…" y llega el aviso al celular. Aprender las temperaturas
  que usen las reglas.

Los botones quedan en `codigos.json`, solo en la notebook.

Las temperaturas se graban con el aire **prendido**, tocando subir o bajar
en el control (no power). Como esos botones no prenden el aire, el puente
anota en `estado.json` si lo dejó prendido o apagado: si piden una
temperatura y el aire está apagado (o el puente no sabe cómo quedó), manda
primero `encender`, espera 3 segundos y después la temperatura. Por eso el
aire se maneja solo desde la app, no con el control.

## 5. Dejarlo corriendo solo

- Probar primero a mano: `python puente.py` (muestra lo que hace). Al
  arrancar se conecta a cada BroadLink y avisa "conectado en …".
- Lo normal: **doble clic en `Abrir puente.bat`** → Windows pide permiso
  de administrador → **Sí**. La primera vez deja instalada la tarea
  "Puente Monarca", que lo arranca solo (sin ventana) cada vez que se entra
  a Windows. Después abre el puente en esa ventana. Si ya había uno
  corriendo, no arranca otro: muestra en vivo lo que va haciendo (lo que
  hace queda anotado en `puente.log`).
- ¿Por qué administrador? El BroadLink dormita y no contesta cuando la
  notebook pregunta "¿quién tiene esta IP?" a toda la red. Como
  administrador, el puente le dice a Windows la MAC del BroadLink al
  arrancar y así lo encuentra siempre. Sin administrador anda igual, pero
  después de un reinicio puede no encontrarlo hasta que se reenchufe.
- Si antes se puso un acceso directo en `shell:startup`, borrarlo para que
  no corran dos puentes.

## 6. Conectar en el sistema

Automatizaciones → Sala 5 → Nuevo dispositivo: tipo Aire acondicionado,
proveedor **BroadLink**, "Nombre en el puente" = `sala5`. Probar desde
Control manual y después crear la regla de temperatura.
