/**
 * tabla.js — La tabla de SKU y la cola de pendientes, guardadas en el servidor.
 *
 * Mientras hubo una sola caja, que la tabla viviera en el localStorage del
 * navegador alcanzaba. Con dos cajas y compras mirando lo mismo, no: cada
 * navegador tenia su propia copia y habia que cargar el listado en cada uno.
 *
 * Aqui la tabla es una sola, en un archivo del servidor, y los navegadores la
 * leen al arrancar.
 *
 * La decision que importa: **no se reescribe la logica**. Este modulo carga
 * los mismos js/sku.js, js/revision.js y js/listado.js que corre el navegador,
 * dandoles un localStorage falso respaldado por un archivo. Las reglas —que un
 * codigo no se mueve solo de SKU, que un codigo sin digito verificador valido
 * no entra— quedan escritas una sola vez. Dos copias de esas reglas, una en el
 * navegador y otra aqui, se irian separando sin que nadie lo note.
 *
 * El archivo se escribe entero y de forma atomica (a un temporal y luego
 * rename). Son cientos de KB: a esta escala es mas simple y mas seguro que
 * cualquier base de datos, y se puede abrir con un editor de texto.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CARPETA = path.join(RAIZ, 'datos');
const ARCHIVO = path.join(CARPETA, 'tabla.json');
const ARCHIVO_TEMPORAL = ARCHIVO + '.tmp';

// ───────────────── localStorage respaldado por un archivo ─────────────────

let guardado = { claves: {}, version: 0, actualizado: null };
let escrituraPendiente = null;

function leerDelDisco() {
  try {
    const crudo = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
    guardado = {
      claves: crudo.claves || {},
      version: Number(crudo.version) || 0,
      actualizado: crudo.actualizado || null
    };
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('No se pudo leer ' + ARCHIVO + ': ' + e.message);
      console.error('Se arranca con la tabla vacia. El archivo anterior no se toca.');
    }
    guardado = { claves: {}, version: 0, actualizado: null };
  }
}

function escribirEnDisco() {
  try {
    fs.mkdirSync(CARPETA, { recursive: true });
    // Primero al temporal y despues rename: si se corta la luz a mitad de la
    // escritura, el archivo bueno sigue siendo el de antes.
    fs.writeFileSync(ARCHIVO_TEMPORAL, JSON.stringify(guardado), 'utf8');
    fs.renameSync(ARCHIVO_TEMPORAL, ARCHIVO);
    return true;
  } catch (e) {
    console.error('No se pudo guardar la tabla: ' + e.message);
    return false;
  }
}

/**
 * Una operacion toca varias claves (crear un SKU escribe la tabla, resolver un
 * pendiente escribe las dos). Se junta todo en una sola escritura al final.
 */
function programarEscritura() {
  if (escrituraPendiente) return;
  escrituraPendiente = setTimeout(() => {
    escrituraPendiente = null;
    escribirEnDisco();
  }, 0);
}

const almacenFalso = {
  getItem(clave) {
    return Object.prototype.hasOwnProperty.call(guardado.claves, clave)
      ? guardado.claves[clave]
      : null;
  },
  setItem(clave, valor) {
    guardado.claves[clave] = String(valor);
    programarEscritura();
  },
  removeItem(clave) {
    delete guardado.claves[clave];
    programarEscritura();
  }
};

// ───────────────── Carga de los modulos del navegador ─────────────────

leerDelDisco();

if (!global.localStorage) global.localStorage = almacenFalso;
require('./barcode.js');
require('./xlsx.js');
require('./sku.js');
require('./revision.js');
require('./listado.js');

const { SKU, Revision, Listado } = global;

let iniciado = false;

function iniciar() {
  if (iniciado) return Promise.resolve();
  iniciado = true;
  return Promise.all([SKU.iniciar(), Revision.iniciar()]).then(() => {
    const e = SKU.estadisticas();
    console.log('Tabla del servidor: ' + e.skus + ' SKU, ' + e.codigos + ' codigos, ' +
                Revision.todos().length + ' pendientes  (' + ARCHIVO + ')');
  });
}

// ───────────────── Operaciones ─────────────────
//
// Solo se exponen las que escriben. Las lecturas las hace cada navegador
// contra su copia, que es lo que permite que escanear sea instantaneo.

const OPERACIONES = {
  SKU: ['crear', 'actualizar', 'vincular', 'desvincular', 'eliminar', 'vaciar', 'importar', 'cargar'],
  Revision: ['agregar', 'agregarVarias', 'quitar', 'vaciar', 'resolverConCodigo', 'cargar'],
  Listado: ['aplicar']
};

const MODULOS = { SKU, Revision, Listado };

/** Estado completo, que es lo que un navegador pide al arrancar. */
function estado() {
  return {
    version: guardado.version,
    actualizado: guardado.actualizado,
    skus: SKU.todos(),
    pendientes: Revision.todos()
  };
}

/** Solo la version, para preguntar seguido sin mover toda la tabla. */
function version() {
  return { version: guardado.version, actualizado: guardado.actualizado };
}

/**
 * Aplica una operacion con nombre. El navegador ya la aplico sobre su copia;
 * aqui se aplica sobre la del servidor, que es la que manda.
 */
function aplicar(modulo, nombre, argumentos) {
  const permitidas = OPERACIONES[modulo];
  if (!permitidas || permitidas.indexOf(nombre) === -1) {
    return { ok: false, error: 'Operacion no permitida: ' + modulo + '.' + nombre };
  }

  const destino = MODULOS[modulo];
  if (!destino || typeof destino[nombre] !== 'function') {
    return { ok: false, error: 'No existe ' + modulo + '.' + nombre };
  }

  let resultado;
  try {
    resultado = destino[nombre].apply(destino, argumentos || []);
  } catch (e) {
    return { ok: false, error: 'Fallo ' + modulo + '.' + nombre + ': ' + e.message };
  }

  guardado.version += 1;
  guardado.actualizado = new Date().toISOString();
  programarEscritura();

  return { ok: true, resultado: resultado, version: guardado.version };
}

module.exports = {
  ARCHIVO,
  iniciar,
  estado,
  version,
  aplicar,
  OPERACIONES
};
