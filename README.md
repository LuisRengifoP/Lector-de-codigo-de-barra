# Sistema lector de códigos de barras

Lee el código de barras de un producto, **consulta ese código en línea** y muestra el nombre. No hay que registrar productos a mano: el nombre lo traen las fuentes.

```
escáner  →  "7702084137520"  →  consulta en línea  →  "P.A.N. Harina De Maíz Blanco 1 kg"  [PAN]
```

Encima de eso hay una segunda capa, que es dato propio de la empresa: la **tabla de SKU**, donde un producto tiene *varios* códigos de barras — el de la unidad y el de la caja — y cada empaque dice cuántas unidades trae.

```
escáner  →  "17702084137527"  →  tabla de SKU  →  SKU-00412, 1 caja = 24 unidades
```

El **listado de precios que sale del DMS** trae el SKU, el nombre interno y el precio de góndola, y es lo que llena esa tabla de un golpe.

```
escáner  →  "7509546694870"  →  tabla de SKU  →  SKU 520012-1, $ 8.009 con IVA
```

Las fuentes en línea dicen **qué** es el producto. La tabla de SKU dice **cuál** de tus productos es, **cuánto cuesta** y **cuántas unidades** entraron. Para vender y para recibir mercancía hacen falta las dos.

No hay modelo de inteligencia artificial ni entrenamiento. Un código de barras se **decodifica** con un algoritmo determinista. El código es una llave; el nombre sale de la fuente que lo tenga publicado.

## Lo primero que hay que saber sobre GS1

**GS1 no ofrece una API pública y gratuita que devuelva nombres de producto.**

- **Verified by GS1** es el servicio oficial. Devuelve marca, descripción del producto y empresa titular del código. No tiene API pública: el acceso programático va por la organización GS1 de cada país, con contrato y clave de API. En Colombia esa organización es **GS1 Colombia / LOGYCA** ([gs1co.org](https://gs1co.org)).


Por eso este sistema consulta **tres fuentes en cadena** y se queda con la primera que responde con un nombre:

| Orden | Fuente | Qué devuelve | Costo |
|---|---|---|---|
| 1 | **Verified by GS1** | Marca, descripción, empresa titular. Dato oficial. | Contrato con GS1 Colombia. Si no hay credenciales, se salta |
| 2 | **Open Food Facts** | Nombre, marca, categoría. Alimentos y bebidas. | Gratis, sin clave |
| 3 | **UPCitemdb** | Título de comercio. Más allá de alimentos. | Gratis hasta 100 consultas por día, sin registro |

### Cobertura real medida

Sobre una muestra de 200 productos de Colombia en Open Food Facts: **110 tenían prefijo colombiano 770/771 y 103 de ellos traían nombre útil** — Para alimentos y bebidas la cobertura colombiana es razonable.

Fuera de alimentos (aseo, cuidado personal, ferretería, etc) cae mucho: ahí trabaja UPCitemdb, con menor calidad de título, y es donde Verified by GS1 marca la diferencia.

Mide tu propio surtido antes de decidir si necesitas el contrato con GS1:

```bash
node consultar.js --archivo mis-codigos.txt
```

Un código por línea, o un CSV con el código en la primera columna. Al final imprime el porcentaje encontrado y por qué fuente.

## Arranque

Requiere Node.js. Sin dependencias que instalar.

```bash
node server.js
```

Abre http://localhost:8000. Para otro puerto: `node server.js 8137`.

El servidor es obligatorio, por tres razones:

1. **CORS**: las APIs de producto no autorizan llamadas desde una página web; el servidor hace de intermediario.
2. **La clave de GS1 no debe viajar al navegador.**
3. **La cámara** solo funciona en contexto seguro (`http://localhost` o `https`).

## Usar desde el teléfono

La interfaz ya está hecha para pantalla angosta y el escáner prefiere la cámara trasera, así que un teléfono sirve como lector sin cambiar nada del código. Lo único que estorba es el contexto seguro: `http://localhost` cuenta como seguro, pero `http://192.168.1.50:8000` **no**, y el navegador del teléfono bloquea la cámara. Por eso el servidor puede hablar HTTPS.

Una sola vez, en el PC:

```bash
node generar-certificado.js
```

Crea `cert/certificado.pem` y `cert/clave.pem`, válidos 825 días, a nombre de `localhost` y de cada IP de red local que tenga la máquina. Usa `openssl`, que ya viene con Git para Windows, macOS y Linux; no instala nada de npm. Si en PowerShell no lo encuentra, el script lo busca dentro de Git para Windows, y si tampoco, lo dice y explica las alternativas.

Luego, como siempre:

```bash
node server.js
```

Al arrancar imprime las direcciones por las que entrar desde el teléfono:

```
Lector de codigos de barras en https://localhost:8443
Desde el telefono, en la misma red:
  https://192.168.2.158:8443
El puerto 8000 redirige a HTTPS.
```

Abre esa dirección en el teléfono, conectado al mismo wifi. **El navegador avisará que el certificado es de un emisor desconocido**: es lo esperado, lo firmaste tú y no una autoridad certificadora. En Chrome, *Configuración avanzada → Continuar*. Después la cámara funciona, aunque la barra de direcciones siga diciendo "no es seguro". Para el teléfono vale la pena marcar la página como acceso directo en el escritorio y no repetir el aviso.

El puerto 8000 queda redirigiendo al 8443, así que da igual si escribes la dirección sin `https`.

| Comando | Qué hace |
|---|---|
| `node server.js` | HTTPS en 8443 si hay certificado; HTTP en 8000 si no |
| `node server.js 3000` | El mismo modo, en el puerto que pidas |
| `node server.js --http` | HTTP a la fuerza, ignorando el certificado |
| `node generar-certificado.js --forzar` | Rehace el certificado; hace falta si cambió la IP del PC |

**`cert/clave.pem` es una llave privada: no la subas a ningún repositorio ni la compartas**, igual que `config.json`.

Tres cosas que conviene saber antes de usarlo en serio:

- **Los datos no se comparten entre equipos.** La caché, los SKU y el listado viven en `localStorage`, que es por navegador. El teléfono arranca vacío: lo que tengas en el PC hay que exportarlo a JSON desde **Productos** o **SKU** e importarlo allá.
- **Un escáner USB también funciona en Android** por un adaptador OTG: entra como teclado, igual que en el PC.
- **Si el certificado estorba**, un túnel HTTPS evita el aviso: `cloudflared tunnel --url http://localhost:8000` da una URL pública ya confiable. El costo es que expone el sistema a internet mientras el túnel esté arriba.

## Conectar Verified by GS1

Cuando tengas contrato con GS1 Colombia:

```bash
cp config.ejemplo.json config.json
```

Llena `url` (con `{gtin}` donde va el código), `clave` y el `esquema` de autenticación que te indiquen. O usa variables de entorno:

```bash
GS1_URL="https://.../gtins/{gtin}" GS1_CLAVE="tu-clave" node server.js
```

Al arrancar, el servidor dice si quedó configurado, y la app lo muestra arriba. **`config.json` contiene una clave: no lo subas a ningún repositorio ni lo compartas.**

Como cada organización GS1 publica su propia URL y su propio formato de respuesta, el adaptador en [js/proveedores.js](js/proveedores.js) busca los nombres de campo habituales (`productDescription`, `brandName`, `licenseeName`). Si tu organización usa otros, ese es el único punto a ajustar.

## Un SKU, varios códigos

Cuando llega mercancía, la caja trae un código y la unidad trae otro. **No son el mismo número.** Algunos proveedores repiten el mismo código en caja y unidad — Colombina lo hace con parte de su surtido —, pero la mayoría no. Y el nombre que le da el proveedor casi nunca es el nombre que usa compras.

De ahí la regla que sostiene todo el sistema: **el nombre no sirve para cruzar nada; el código de barras es la única llave de verificación.**

Por eso un SKU tiene una lista de códigos, no uno:

| SKU | Nombre interno | Código | Nivel | Cantidad |
|---|---|---|---|---|
| SKU-00412 | Harina de maíz blanco PAN 1 kg | 7702084137520 | unidad | 1 |
| SKU-00412 | Harina de maíz blanco PAN 1 kg | 17702084137527 | caja | 24 |

La **cantidad** de un empaque son las unidades que contiene. Es el dato que convierte una caja recibida en unidades de inventario, y no lo publica ninguna fuente: lo sabe quien abre la caja. Por eso la app no deja vincular una caja sin ese número.

### El display, un empaque intermedio

Algunos productos de algunos proveedores traen un nivel más entre la unidad y la caja: el **display**. Es un empaque que agrupa pocas unidades para exhibir el producto en góndola. Su forma cambia según el proveedor —una cajita (las Piazza vienen en una cajita), una bolsa con varias unidades dentro, u otro soporte—, pero el concepto es el mismo: tiene su propio código de barras, distinto del de la unidad y del de la caja.

No todo producto tiene display. Por eso es un nivel opcional: se escoge `display` al vincular su código, igual que `caja` o `paca`.

Los niveles anidan, y la cantidad de cada empaque son siempre las **unidades totales** que contiene, no los sub-empaques. Ejemplo, Piazza Jirafa Chocoleche:

| Código | Nivel | u/e del proveedor | Cantidad (unidades) |
|---|---|---|---|
| código de la unidad | unidad | — | 1 |
| código del display | display | 24 unidades por display | 24 |
| código de la caja | caja | 12 displays por caja | 288 |

La caja trae 12 displays y cada display 24 unidades: 12 × 24 = **288 unidades**. Ojo con la columna `u/e` del listado: para la caja dice **12** (son displays, no unidades), así que al vincular la caja se cuenta el total de unidades (288), no se copia el 12.

### Cómo se propone el vínculo entre la caja y la unidad

Un GTIN-14 se compone de un **dígito indicador**, doce dígitos base y el verificador. Esos doce dígitos base son los mismos del EAN-13 de la unidad:

```
  1 770208413752 7     ITF-14, caja
    770208413752 0     EAN-13, unidad   ← mismos 12 dígitos base
```

Cuando lees un código que no está vinculado, la app busca los SKU que comparten esa base y los **propone**. No los vincula sola: hay proveedores que numeran la caja sin ninguna relación con la unidad, y vincular mal mezcla dos productos distintos bajo un mismo SKU. La confirmación es de una persona.

### Recibir mercancía

1. Dispara el escáner sobre la caja.
2. Si el código ya está vinculado, la app muestra el SKU, el nombre interno y **1 caja = 24 unidades**.
3. Si no lo está, propone el SKU que comparte la base. Confirmas, cuentas las unidades y queda vinculado para siempre.

Un código de caja casi nunca aparece en Open Food Facts ni en UPCitemdb: ahí se publica la unidad que compra el consumidor. Que las fuentes no lo tengan no es un problema cuando la tabla de SKU sí lo tiene.

### La tabla es tuya

La pestaña **SKU** exporta a CSV con una fila por código — `sku,nombre,categoria,codigo,tipo,nivel,cantidad,proveedor,nombre_proveedor` —, que es el formato que el area de compras puede revisar en una hoja de cálculo y devolver corregido. Importa ese mismo CSV y el JSON de exportación.

Ningún proveedor ni ninguna fuente en línea puede devolverte esta tabla si se pierde: los vínculos entre códigos, SKU y cantidades son datos propios de la empresa. Expórtala.

## El listado de precios que viene del DMS

De aquí salen el SKU y el **precio**. Es el reporte `que cargue en pdf`
del DMS SQL, con estas columnas:

| Columna | Qué es | A dónde va |
|---|---|---|
| `Codigo` | el SKU que asigna compras | `sku` |
| `Alterna` | el código de barras de la unidad de venta | el código del SKU |
| `Descripcion` | el nombre interno | `nombre` |
| `u/e` | palabra de empaque (CAJ, PAC) y unidades que trae | `empaque` y `unidadesPorCaja` |
| `Cajas` | existencia en empaques | `cajas` |
| `Precio Und` | precio sin IVA | `precioSinIva` |
| `IVA` | tarifa | `iva` |
| `Precio Final` | precio con IVA, el de góndola | `precio` |

El **proveedor no es una columna**: es el encabezado de cada sección del
reporte, y la categoría son líneas sueltas dentro de la sección. Las dos se
leen recorriendo el archivo en orden.

Se carga desde la pestaña **Listado**, eligiendo un archivo o pegando el texto. Primero muestra qué trae y después pregunta si cargarlo:
un listado puede venir con la columna de códigos mal, y eso hay que verlo
antes de escribir nada en la tabla.

### Qué formato darle

| Formato | Cómo se obtiene | Qué tal queda |
|---|---|---|
| **Excel (.xlsx)** | una fila por producto, con encabezados | completo, es el camino bueno |
| **CSV exportado** | desde el DMS, el mismo reporte | igual de bueno |
| Texto con columnas | `pdftotext -layout listado.pdf listado.txt` | **no sirve**, ver abajo |
| PDF | `node convertir-listado.js listado.pdf` | igual que el anterior |

El .xlsx se lee sin librerías: es un ZIP con XML adentro, y
[js/xlsx.js](js/xlsx.js) saca de ahí lo justo. Los encabezados se reconocen
sin tildes y en varias formas, así que `Código(SKU)`, `Código alterno
(barras)`, `U/E (und por empaque)` y `Precio Final (listado)` entran igual
que `sku`, `codigo`, `cantidad` y `precio`. El IVA y el descuento se
aceptan como 19 o como 0,19. Si el libro tiene varias hojas, se usa la que
tenga columnas de listado, no la primera.

**El texto del PDF no es una fuente confiable.** Cuando la descripción es
larga, el PDF corre las columnas numéricas, y la herramienta que lo convierte
a texto junta en un renglón valores que pertenecen a filas distintas. Medido
contra el listado real: de 374 filas leídas así, **191 tienen el precio final
descuadrado** — el 51%. Del mismo listado en Excel, 23 de 1123 — el 2%, y casi
todas por impuesto al consumo. Una fila corrida no se ve a simple vista: trae
un código de barras que pertenece a otro producto.

### La comprobación que hace el sistema

```
Precio Und × (1 − Desc. Máx) × (1 + IVA) = Precio Final
```

Es la única comprobación que el propio archivo permite hacer, y es la que
detecta una fila corrida de renglón. Donde no da, el SKU queda marcado
**precio por confirmar**, y la marca sale al escanear, junto al precio.

No rechaza la fila, porque hay un caso legítimo: cigarrillos y algunas bebidas
llevan impuesto al consumo, que no aparece en ninguna columna del listado. El
sistema no puede distinguir ese caso de una fila mal leída, así que avisa y
deja decidir.

Desde la terminal, sin abrir el navegador:

```
node convertir-listado.js New_listado_precios.pdf
```

Escribe `listado-skus.csv` (lo que se puede importar) y
`listado-revision.csv` (lo que falta resolver), e imprime el conteo de cada
cosa.

### La columna Alterna no siempre trae un código de barras

En el listado que se revisó (1123 productos), de 1093 filas con valor en
`Alterna`, **144 no son un código de barras** y 30 vienen vacías. Hay dos
clases de las malas:

```
SKU 10223103  Alterna 102231031   relleno del DMS: es el propio SKU con un dígito
SKU 310009421 Alterna 7792993059445   falla el dígito verificador por uno
```

Ninguno existe impreso en un empaque. **No se guardan como código**: van a la
cola de pendientes con el motivo escrito. Un código inventado en la tabla no
se nota nunca — nadie lo escanea, porque no existe, y mientras tanto el
producto figura como registrado. Una fila en la cola sí se nota: está contada
y tiene un botón.

La cola se resuelve **escaneando el empaque**, que es la única fuente
confiable del código. Al escanear, el SKU se crea con el precio y el proveedor
que ya traía el listado, y la fila sale de la cola. También se exporta a CSV
para que compras la trabaje en una hoja de cálculo.

Para las que fallan por un dígito, el sistema muestra cuál sería el código con
el verificador corregido, pero **no lo usa**: el cálculo supone que el error
está en el último dígito, y puede estar en cualquiera. Es para comparar contra
el empaque.

### Qué se ve al escanear

El bloque de SKU se pinta apenas el código es válido, sin esperar la consulta
en línea: el SKU, el nombre interno y el precio están en esta máquina.

```
SKU 520012-1   unidad   1 u por empaque
LIMPIADOR PISOS LAVANDA X 1000 ML
$ 8.009  IVA 19% incluido
Sin IVA $ 6.730
Del proveedor viene en CAJ de 12 unidades, hay 9 en existencia.
```

## Una sola tabla para todas las cajas

La tabla de SKU y la cola de pendientes viven en el servidor, en
`datos/tabla.json`. Cada navegador la pide al arrancar, así que el listado se
carga **una vez** y todas las cajas lo ven.

```
caja 1  ─┐
caja 2  ─┼─→  node server.js  ─→  datos/tabla.json
compras ─┘
```

Arriba de la pantalla hay un indicador que dice de dónde sale lo que estás
viendo:

| Indicador | Qué significa |
|---|---|
| **Tabla compartida** | del servidor; lo que registres aquí lo ven las demás cajas |
| **Sin servidor** | de la copia de este equipo; los cambios se suben solos cuando vuelva |
| **Solo este equipo** | sin servidor desde el arranque, como funcionaba antes |

### Cómo está hecho

**Leer es local, escribir va al servidor.** Al arrancar se trae la tabla
entera y se guarda en memoria; escanear un código no toca la red. Un cajero no
puede quedarse esperando a un servidor con el cliente enfrente, y en una
tienda la red se cae. Al escribir, el cambio se aplica primero en la pantalla
y después se manda; si no hay red, queda en una cola y se reintenta.

**El servidor corre el mismo código que el navegador.** [js/tabla.js](js/tabla.js)
carga [js/sku.js](js/sku.js), [js/revision.js](js/revision.js) y
[js/listado.js](js/listado.js) dándoles un `localStorage` falso respaldado por
un archivo. Las reglas —que un código no se mueve solo de un SKU a otro, que
un número sin dígito verificador válido no entra— están escritas una sola vez.
Dos copias de esas reglas se irían separando sin que nadie lo note.

**Cargar un listado es una sola petición.** Serían cientos de operaciones
sueltas; en vez de eso se manda el listado y el servidor lo aplica con ese
mismo código, y devuelve la tabla ya hecha.

**Cada 20 segundos se pregunta por el número de versión**, que es un entero. Si
cambió, otra caja tocó algo y se vuelve a pedir la tabla. También se pregunta
al volver a la pestaña.

El archivo se escribe entero y de forma atómica: primero a un temporal y
después `rename`. Si se corta la luz a mitad de la escritura, el archivo bueno
sigue siendo el de antes. A esta escala —mil SKU, unos cientos de KB— es más
simple y más seguro que una base de datos, y se abre con un editor de texto.

### Lo que esto no es

No es replicación. Dos personas editando el mismo SKU al mismo tiempo se
pisan, y gana la última. Lo que no puede pasar —y no pasa— es que una caja no
vea un producto que compras acaba de cargar.

El servidor no pide contraseña: cualquiera en la red puede escribir en la
tabla. Para una red de tienda está bien; expuesto a internet, no.

### Endpoints

| Ruta | Qué hace |
|---|---|
| `GET /api/datos` | la tabla entera, con su número de versión |
| `GET /api/version` | solo el número, para preguntar seguido |
| `POST /api/operacion` | aplica una operación con nombre sobre la tabla |
| `GET /api/estado` | estado de las fuentes y resumen de la tabla |

`/api/operacion` solo acepta operaciones de una lista cerrada
(`crear`, `vincular`, `resolverConCodigo`…). Cualquier otro nombre se rechaza.

## Las tres formas de leer un código

| Vía | Qué hace falta | Cómo se usa |
|---|---|---|
| Escáner USB o Bluetooth | El aparato, nada de software | Dispara. Teclea el código y envía Enter; se capta aunque el campo no tenga el foco |
| Cámara | El servidor e internet la primera vez | Botón **Usar la cámara** |
| Manual | Nada | Escribe el código y Enter |

Las tres pasan por `procesarCodigo()` en [js/app.js](js/app.js).

### Cámara del PC: qué esperar

La webcam de un portátil es 720p con enfoque fijo, pensada para una cara a medio metro, no para barras finas de cerca. Lee, pero exige ayuda:

- **Luz pareja** sobre la etiqueta; la sombra de tu propia mano es lo que más falla
- **15 a 25 cm**, con el código llenando el recuadro de la guía
- **Código plano**, sin curvar sobre botella o bolsa arrugada
- **Sin reflejo** del techo sobre las barras
- **Quieto un segundo**: la webcam no congela movimiento

A los 10 segundos sin lectura, la app muestra esa guía sola. No es un error: la cámara sigue buscando.

Para leer muchos productos seguidos, un escáner USB de mostrador es mucho más rápido y no necesita ningún cambio en la app.

### Por qué la cámara no usa la capa de cámara de ZXing

Hasta noviembre de 2026 la cámara se quedaba buscando sin leer nunca, ni con un código perfecto delante. La causa no era la webcam: es un defecto de `@zxing/library` 0.21.3. Al decodificar desde un `<video>`, su fuente de luminancia **invierte el blanco y el negro en fotogramas alternos**:

```js
FRAME_INDEX = !FRAME_INDEX
if (FRAME_INDEX || !isVideo) { gris normal } else { gris invertido }
```

La idea era leer también etiquetas en negativo. El efecto real es que la mitad de los intentos analiza una imagen donde un código normal no existe. Y como ese interruptor es estático y compartido, con `TRY_HARDER` el lector gira la imagen, crea más fuentes y descuadra la paridad: medido sobre un mismo fotograma, **0 lecturas en 10 intentos con el indicador de vídeo, 10 de 10 sin él**.

Por eso [js/scanner.js](js/scanner.js) captura el fotograma en su propio lienzo y arma el bitmap a mano, siempre en gris normal, antes de llamar al decodificador de ZXing. El algoritmo de decodificación es el mismo; lo que se evita es su envoltorio de cámara. De paso:

- Se pide `1280x720` en vez de aceptar los `640x480` por defecto. Una barra fina necesita píxeles.
- Se pide la cámara trasera por `facingMode`, que en el teléfono es lo correcto, en vez de adivinar por el nombre del dispositivo — que viene vacío hasta que el usuario da permiso.
- Si el fotograma completo no da, se reintenta sobre la **franja central ampliada al doble**, que es donde apunta la guía, y después sobre el **fotograma girado un cuarto de vuelta**.
- Se espera a que el vídeo entregue imagen antes de analizar; antes del primer fotograma `videoWidth` es 0 y no hay nada que leer.

### Por qué no se usa TRY_HARDER

`TRY_HARDER` hace dos cosas: muestrear más filas y reintentar sobre la imagen girada. Lo segundo era lo único que hacía falta — un lector de una dimensión recorre filas horizontales, así que un código vertical le resulta invisible — y sale carísimo.

Medido sobre un fotograma de 1280x720 sin ningún código, que es lo que la cámara ve casi todo el tiempo:

| Ciclo de análisis | Coste por intento |
|---|---|
| Completo + franja, **con** `TRY_HARDER` | **713 ms** |
| Completo + franja + girado, **sin** `TRY_HARDER` | **75 ms** |

Con `TRY_HARDER` el lector hacía menos de dos intentos por segundo y dejaba la CPU al tope; en un teléfono, peor. El giro se resuelve ahora rotando el fotograma nosotros mismos, que cuesta unos pocos milisegundos y lee igual: un EAN-13 girado 90° se lee en **155 ms**.

### Un código no se relee mientras sigue delante

Un producto olvidado en el encuadre se leía cada segundo y medio, con su pitido cada vez. Ahora un mismo código solo vuelve a contar como lectura nueva si **desaparece del encuadre al menos 900 ms**; un código distinto cuenta siempre, de inmediato. Perder un fotograma suelto no basta para reactivarlo: la mano tiembla y el enfoque respira, así que fallar un par de intentos seguidos es normal.

Medido con una cámara simulada que dibuja un EAN-13 real:

| Situación | Lecturas |
|---|---|
| Primera lectura | 85 ms |
| Producto quieto 6 s | 1 |
| Apartado 400 ms y devuelto | 1 (no cuenta de nuevo) |
| Apartado 1,2 s y devuelto | 2 (cuenta de nuevo) |
| Otro producto, sin apartar nada | cuenta de inmediato |

El pitido también sale una sola vez por lectura. Antes sonaban dos, uno desde `scanner.js` y otro desde `app.js`, separados por unos milisegundos: superpuestos se oían como un chirrido. Ahora solo pita `app.js`, que es quien sabe el resultado, con una onda senoidal y rampas de entrada y salida — la cuadrada anterior, arrancando de golpe, chasqueaba.

## Qué pasa con cada lectura

1. **Normaliza** el texto: quita Enter, espacios y guiones del escáner.
2. **Detecta la simbología** por longitud: EAN-8, UPC-A, EAN-13, ITF-14.
3. **Valida el dígito verificador**. Una lectura dañada se rechaza aquí, sin gastar una consulta.
4. **Mira la caché local**: si ese código ya se consultó, responde al instante, sin red.
5. **Consulta en línea** las tres fuentes en orden y muestra el nombre, la marca, la empresa titular cuando la hay, y **de qué fuente salió**.
6. **Memoriza** el resultado. La próxima lectura de ese código es instantánea.

Si ninguna fuente lo tiene, lo dice con claridad y ofrece ponerle nombre a mano — es la excepción, no el flujo normal. Un nombre escrito por ti nunca se pisa después con el de una fuente.

El desplegable **Qué respondió cada fuente** muestra el detalle de los tres intentos. Sirve para entender si un código falta en las bases o si hubo un problema de red.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| [index.html](index.html) | Estructura de las cinco vistas |
| [css/styles.css](css/styles.css) | Tema claro y oscuro, diseño móvil |
| [js/barcode.js](js/barcode.js) | Normalización, tipo, dígito verificador, prefijos GS1 |
| [js/proveedores.js](js/proveedores.js) | Cadena de consulta: GS1, Open Food Facts, UPCitemdb |
| [js/db.js](js/db.js) | Caché local de lo consultado, búsqueda, importar y exportar |
| [js/sku.js](js/sku.js) | Tabla de SKU: varios códigos por producto, niveles de empaque, cantidades, precio |
| [js/tabla.js](js/tabla.js) | La tabla compartida del servidor, en `datos/tabla.json` |
| [js/sincronizar.js](js/sincronizar.js) | Mantiene al navegador en línea con la tabla del servidor |
| [js/xlsx.js](js/xlsx.js) | Lector mínimo de .xlsx, sin librerías |
| [js/listado.js](js/listado.js) | Lee el listado de precios del DMS y clasifica cada fila |
| [js/revision.js](js/revision.js) | Cola de lo que el listado dejó sin resolver |
| [js/scanner.js](js/scanner.js) | Cámara con ZXing y captura del escáner USB |
| [js/ean13.js](js/ean13.js) | Dibuja códigos EAN-13 en canvas |
| [js/ui.js](js/ui.js) | Tema claro/oscuro y paginación de las tablas |
| [js/app.js](js/app.js) | Interfaz y flujo completo |
| [server.js](server.js) | Servidor estático y proxy de consulta, HTTP o HTTPS |
| [generar-certificado.js](generar-certificado.js) | Certificado autofirmado para la cámara en el teléfono |
| [consultar.js](consultar.js) | Consulta desde la terminal, para medir cobertura |
| [convertir-listado.js](convertir-listado.js) | Convierte el listado del DMS en CSV desde la terminal |
| [config.ejemplo.json](config.ejemplo.json) | Plantilla de credenciales de GS1 |

## Tema y paginación

El tema claro/oscuro y las filas por página de cada tabla viven en
`localStorage` bajo `slb.ui.v1`, que maneja [js/ui.js](js/ui.js). Sin nada
guardado manda `prefers-color-scheme`, es decir el tema del sistema; el botón
de la barra superior fija uno y a partir de ahí ese manda.

Las tablas de **SKU**, **Productos**, **Pendientes** e **Historial** se pintan
por páginas. El tamaño se elige en el pie de cada tabla (10, 25, 50, 100 o
todas) y se recuerda por tabla. Al cambiar la búsqueda se vuelve a la primera
página.

En el teléfono, por debajo de 760 px, cada fila se muestra como una tarjeta con
sus etiquetas: ninguna columna queda escondida detrás de un desplazamiento
horizontal. Entre 760 y 1080 px se retiran primero Categoría y después Cajas,
que son las que menos deciden.

## La caché

Vive en `localStorage` bajo `slb.productos.v3`. Guarda lo que las fuentes respondieron: código, nombre, marca, empresa, categoría y **de qué fuente vino**.

El servidor mantiene además su propia caché en memoria, para no repetir llamadas mientras está encendido y cuidar el cupo diario de UPCitemdb.

Desde la pestaña **Productos** se puede buscar, corregir un nombre, exportar a JSON o CSV, importar y vaciar la caché. **Volver a consultar**, en el resultado, descarta lo memorizado de ese código y vuelve a preguntar a las fuentes.

## Límites conocidos

- Ningún sistema identifica el 100% de los códigos: un producto solo aparece si su dueño publicó los datos en alguna de esas bases.
- La cámara necesita al menos 2 píxeles por módulo de la barra. Con el código ocupando menos de una quinta parte del ancho del encuadre no lee, por más vueltas que dé: hay que acercarse. El escáner USB no tiene ese límite.
- Al no usarse la capa de cámara de ZXing, tampoco se leen etiquetas en negativo (barras blancas sobre fondo negro). No es el caso de ningún código de retail.
- UPCitemdb corta en 100 consultas por día en su nivel gratuito; después responde HTTP 429. La caché amortigua mucho ese límite.
- La caché es local a ese navegador y equipo. Para compartirla entre varias cajas hace falta un servidor con base de datos.
- La tabla de SKU vive en el servidor (`datos/tabla.json`) y cada navegador guarda una copia para seguir trabajando sin red. **Ese archivo es dato propio: ninguna fuente puede devolvértelo si se pierde.** Respáldalo.
- El servidor no pide contraseña. Para una red de tienda está bien; no lo expongas a internet.
- El vínculo entre la caja y la unidad se **propone** por los 12 dígitos base del GTIN, y hay proveedores que no respetan esa norma. La propuesta siempre la confirma una persona.
- El precio viene del listado del DMS y vale hasta que salga el siguiente listado. Cargar uno nuevo actualiza precio y existencia de los SKU que ya están, y respeta el nombre interno por si se corrigió a mano.
- El listado trae **un código por SKU**, al nivel en que se vende. Los demás niveles de empaque se agregan escaneando.
- Un código que ya pertenece a otro SKU no se mueve solo: la fila queda sin vincular y se dice a cuál pertenece. En el listado real pasa con 36 códigos, casi todos entre un SKU y su variante (`N16939` y `N16939-1`).
- La comprobación del precio detecta filas corridas, no precios equivocados. Un listado bien formado con un precio mal digitado cuadra igual.
- La cola de pendientes vive en `localStorage` bajo `slb.revision.v1`, igual que la tabla de SKU: es de ese navegador. Expórtala a CSV si compras la trabaja en otro equipo.
- Open Food Facts es colaborativo: un nombre puede venir incompleto o mal escrito. Por eso existe **Corregir nombre**.
- Sin internet no se puede identificar un código nuevo; los ya consultados siguen respondiendo desde la caché.
- El certificado autofirmado nombra las IP que tenía el PC al generarlo. Si el router le da otra, el teléfono avisará además por nombre equivocado: `node generar-certificado.js --forzar` lo rehace. Una IP fija o reservada en el router evita el trámite.

## Pasos siguientes posibles

- Contratar Verified by GS1 con GS1 Colombia si la cobertura abierta no alcanza para tu surtido.
- Base de datos de verdad si las cajas pasan de unas pocas o si dos personas editan a la vez: hoy gana la última.
- Compartir también la caché de nombres entre cajas; hoy solo se comparte la tabla de SKU.
- Ventas y movimiento de inventario encima del precio que ya trae el listado.
- Descontar existencia al vender, para que la columna de cajas no quede congelada en lo que decía el último listado.
