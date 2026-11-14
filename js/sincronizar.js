/**
 * sincronizar.js — Una sola tabla para todas las cajas.
 *
 * La tabla de SKU vivia en el localStorage de cada navegador: cada equipo
 * tenia su copia y habia que cargarle el listado por separado. Ahora la tabla
 * esta en el servidor y este modulo mantiene en linea las dos puntas.
 *
 * Como funciona, y por que asi:
 *
 *   Al arrancar se pide la tabla entera y se mete en SKU y Revision. Desde
 *   ahi, **leer es local**. Escanear un codigo no toca la red: el cajero no
 *   puede quedarse esperando a que responda un servidor con el cliente
 *   enfrente, y en una tienda la red se cae.
 *
 *   Al escribir se aplica primero en local y despues se manda la operacion al
 *   servidor. La pantalla responde al instante y el servidor se entera
 *   enseguida. Si la red esta caida, la operacion queda en una cola y se
 *   reintenta; mientras tanto la caja sigue trabajando.
 *
 *   Cada cierto tiempo se pregunta por el numero de version. Si cambio, lo
 *   cambio otra caja o compras, y se vuelve a pedir la tabla.
 *
 * Esto no es un sistema de replicacion: es lo que necesita un negocio con dos
 * o tres cajas. Dos personas editando el mismo SKU al mismo tiempo pueden
 * pisarse, y gana la ultima. Lo que no puede pasar —y no pasa— es que una
 * caja no vea un producto que compras acaba de cargar.
 */
(function (global) {
  'use strict';

  var CLAVE_COLA = 'slb.cola.v1';
  var CADA_CUANTO = 20000;   // Cada cuanto se pregunta por la version, en ms.

  // Operaciones que escriben. El resto son lecturas y no salen de aqui.
  var ESCRITURAS = {
    SKU: ['crear', 'actualizar', 'vincular', 'desvincular', 'eliminar', 'vaciar', 'importar'],
    Revision: ['agregar', 'agregarVarias', 'quitar', 'vaciar', 'resolverConCodigo']
  };

  var modo = 'local';        // 'local' | 'servidor' | 'sin-conexion'
  var version = 0;
  var actualizado = null;
  var cola = [];
  var enProfundidad = 0;     // Para no mandar las operaciones de adentro.
  var alCambiar = null;      // Aviso para que la interfaz se vuelva a pintar.
  var reloj = null;
  var enviando = false;

  function leerCola() {
    try {
      cola = JSON.parse(global.localStorage.getItem(CLAVE_COLA) || '[]');
    } catch (e) {
      cola = [];
    }
  }

  function guardarCola() {
    try {
      global.localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
    } catch (e) { /* sin almacenamiento se pierde la cola al recargar */ }
  }

  function pedir(ruta, opciones) {
    return fetch(ruta, Object.assign({ cache: 'no-store' }, opciones || {}))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  // ───────────────── Estado ─────────────────

  function aplicarEstado(estado) {
    if (!estado) return;
    global.SKU.cargar(estado.skus || []);
    global.Revision.cargar(estado.pendientes || []);
    version = estado.version || 0;
    actualizado = estado.actualizado || null;
  }

  function traerTodo() {
    return pedir('api/datos').then(function (estado) {
      aplicarEstado(estado);
      modo = 'servidor';
      return estado;
    });
  }

  // ───────────────── Envio de operaciones ─────────────────

  function encolar(modulo, nombre, argumentos) {
    cola.push({ modulo: modulo, nombre: nombre, argumentos: argumentos, ts: Date.now() });
    guardarCola();
    vaciarCola();
  }

  /**
   * Manda la cola en orden, una por una. En orden porque las operaciones
   * dependen de las anteriores: vincular un codigo supone que el SKU existe.
   */
  function vaciarCola() {
    if (enviando || !cola.length) return Promise.resolve();
    enviando = true;

    var operacion = cola[0];
    return pedir('api/operacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operacion)
    }).then(function (r) {
      cola.shift();
      guardarCola();
      version = r.version || version;
      if (modo === 'sin-conexion') modo = 'servidor';
      if (r.estado) { aplicarEstado(r.estado); avisar(); }
      enviando = false;
      if (cola.length) return vaciarCola();
      return null;
    }).catch(function (e) {
      enviando = false;
      // Si el servidor rechaza la operacion, reintentarla no sirve de nada:
      // se descarta y se vuelve a traer la tabla, que es la que manda.
      if (/HTTP 4\d\d/.test(e.message)) {
        console.warn('El servidor rechazo ' + operacion.modulo + '.' + operacion.nombre +
                     ' (' + e.message + '). Se descarta y se recarga la tabla.');
        cola.shift();
        guardarCola();
        return traerTodo().then(avisar).catch(function () { modo = 'sin-conexion'; });
      }
      modo = 'sin-conexion';
      return null;
    });
  }

  function avisar() {
    if (typeof alCambiar === 'function') alCambiar();
  }

  // ───────────────── Envoltura de las escrituras ─────────────────

  /**
   * Cada funcion que escribe se envuelve: hace lo suyo en local y, si salio
   * bien, manda la misma operacion al servidor.
   *
   * El contador de profundidad existe porque hay operaciones que llaman a
   * otras. Revision.resolverConCodigo llama a SKU.crear y a SKU.vincular; si
   * se mandaran las tres, el servidor aplicaria el trabajo dos veces. Solo
   * sale la de mas afuera, que es la que describe lo que paso.
   */
  function envolver(modulo, nombre) {
    var destino = global[modulo];
    var original = destino[nombre];
    if (typeof original !== 'function') return;

    destino[nombre] = function () {
      var argumentos = Array.prototype.slice.call(arguments);
      enProfundidad++;
      var r;
      try {
        r = original.apply(destino, argumentos);
      } finally {
        enProfundidad--;
      }

      var fallo = r && r.ok === false;
      if (modo !== 'local' && !enProfundidad && !fallo) {
        encolar(modulo, nombre, argumentos);
      }
      return r;
    };
  }

  /**
   * Corre algo sin que sus escrituras se manden una por una. Para cuando ya
   * se va a mandar la operacion de mas afuera, que las resume todas.
   */
  function sinEnviar(fn) {
    enProfundidad++;
    try {
      return fn();
    } finally {
      enProfundidad--;
    }
  }

  function envolverTodo() {
    Object.keys(ESCRITURAS).forEach(function (modulo) {
      ESCRITURAS[modulo].forEach(function (nombre) { envolver(modulo, nombre); });
    });
  }

  // ───────────────── Listado completo ─────────────────

  /**
   * Cargar un listado son cientos de operaciones. En vez de mandarlas una por
   * una, se manda el listado y el servidor lo aplica con el mismo codigo, y
   * devuelve la tabla ya hecha.
   */
  function aplicarListado(filas, reemplazar) {
    if (modo === 'local') {
      return Promise.resolve(sinEnviar(function () {
        return global.Listado.aplicar(filas, reemplazar);
      }));
    }

    return pedir('api/operacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modulo: 'Listado', nombre: 'aplicar', argumentos: [filas, reemplazar] })
    }).then(function (r) {
      version = r.version || version;
      if (r.estado) aplicarEstado(r.estado);
      return r.resultado;
    }).catch(function (e) {
      // Sin servidor se carga igual, en local, y queda en la cola para cuando
      // vuelva: un listado nuevo no puede esperar a que alguien arregle la red.
      //
      // Va dentro de sinEnviar porque Listado.aplicar llama cientos de veces a
      // SKU.crear y a SKU.vincular. Sin eso, cada una se encolaria por su
      // cuenta ademas del listado entero, y el servidor aplicaria el trabajo
      // dos veces.
      modo = 'sin-conexion';
      var resultado = sinEnviar(function () {
        return global.Listado.aplicar(filas, reemplazar);
      });
      encolar('Listado', 'aplicar', [filas, reemplazar]);
      console.warn('Listado cargado solo en este equipo: ' + e.message);
      return resultado;
    });
  }

  // ───────────────── Vigilancia ─────────────────

  function mirarVersion() {
    if (modo === 'local') return Promise.resolve();
    return pedir('api/version').then(function (r) {
      if (modo === 'sin-conexion') { modo = 'servidor'; vaciarCola(); }
      if ((r.version || 0) === version) return null;
      // Cambio algo en otra caja.
      return traerTodo().then(avisar);
    }).catch(function () {
      modo = 'sin-conexion';
      avisar();
      return null;
    });
  }

  function arrancarReloj() {
    if (reloj) return;
    reloj = setInterval(mirarVersion, CADA_CUANTO);
    // Al volver a la pestana conviene mirar ya, sin esperar el turno.
    if (global.document) {
      global.document.addEventListener('visibilitychange', function () {
        if (!global.document.hidden) mirarVersion();
      });
    }
  }

  /**
   * Arranca. Si el servidor responde, su tabla reemplaza lo que haya en este
   * navegador. Si no responde, se sigue con la copia local y se avisa.
   *
   * `opciones.alCambiar` se llama cuando la tabla cambio por fuera.
   */
  function iniciar(opciones) {
    alCambiar = (opciones || {}).alCambiar || null;
    leerCola();

    return traerTodo().then(function (estado) {
      envolverTodo();
      arrancarReloj();
      vaciarCola();
      return { modo: modo, version: version, skus: (estado.skus || []).length };
    }).catch(function (e) {
      // Sin servidor el sistema sigue funcionando contra localStorage, que es
      // como funcionaba antes. Se envuelve igual, para que lo que se haga
      // ahora se mande en cuanto el servidor vuelva.
      modo = 'sin-conexion';
      envolverTodo();
      arrancarReloj();
      console.warn('Sin tabla del servidor: ' + e.message);
      return { modo: modo, version: 0, skus: global.SKU.todos().length, error: e.message };
    });
  }

  global.Sincronizar = {
    iniciar: iniciar,
    aplicarListado: aplicarListado,
    mirarVersion: mirarVersion,
    vaciarCola: vaciarCola,
    get modo() { return modo; },
    get version() { return version; },
    get actualizado() { return actualizado; },
    get pendientesDeEnvio() { return cola.length; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
