/**
 * server.js — Servidor estatico sin dependencias.
 *
 * Necesario porque la camara (getUserMedia) solo funciona en contexto seguro:
 * http://localhost o https. Con file:// el navegador la bloquea.
 *
 * Desde el telefono, http://192.168.x.x NO es contexto seguro y la camara
 * queda bloqueada. Por eso el servidor sirve por HTTPS en cuanto encuentra
 * cert/certificado.pem y cert/clave.pem. Para crearlos:
 *
 *   node generar-certificado.js
 *
 *   node server.js            -> https://localhost:8443 si hay certificado,
 *                                http://localhost:8000 si no
 *   node server.js 3000       -> el mismo modo, en el puerto 3000
 *   node server.js --http     -> HTTP a la fuerza, ignorando el certificado
 *
 * Con HTTPS activo tambien escucha en el puerto 8000 y redirige, para que no
 * importe si en el telefono se escribe la direccion sin https.
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const proveedores = require('./js/proveedores');
const tabla = require('./js/tabla');

const RAIZ = __dirname;
const CARPETA_CERT = path.join(RAIZ, 'cert');
const ARCHIVO_CLAVE = path.join(CARPETA_CERT, 'clave.pem');
const ARCHIVO_CERT = path.join(CARPETA_CERT, 'certificado.pem');

const PUERTO_HTTP = 8000;
const PUERTO_HTTPS = 8443;

const ARGUMENTOS = process.argv.slice(2);
const FORZAR_HTTP = ARGUMENTOS.indexOf('--http') !== -1;
const PUERTO_PEDIDO = Number(ARGUMENTOS.filter((a) => /^[0-9]+$/.test(a))[0]) ||
                      Number(process.env.PORT) || 0;

/**
 * Lee el certificado autofirmado si existe. Sin el, el servidor sigue dando
 * servicio por HTTP: el escaner USB y la entrada manual no necesitan camara.
 */
function cargarCertificado() {
  if (FORZAR_HTTP) return null;
  try {
    return {
      key: fs.readFileSync(ARCHIVO_CLAVE),
      cert: fs.readFileSync(ARCHIVO_CERT)
    };
  } catch (e) {
    return null; // Sin certificado se sirve por HTTP.
  }
}

const CERTIFICADO = cargarCertificado();
const SEGURO = !!CERTIFICADO;
const PUERTO = PUERTO_PEDIDO || (SEGURO ? PUERTO_HTTPS : PUERTO_HTTP);

/**
 * Credenciales de Verified by GS1, el servicio oficial.
 * No es publico: cada organizacion miembro (en Colombia, GS1 Colombia / LOGYCA)
 * entrega su propia URL y su clave tras firmar contrato. Sin esto, el sistema
 * consulta solo las fuentes abiertas.
 *
 * Se toman de config.json si existe, o de variables de entorno.
 */
function cargarConfig() {
  let archivo = {};
  try {
    archivo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'config.json'), 'utf8'));
  } catch (e) { /* sin config.json se usan las variables de entorno */ }

  const gs1 = archivo.gs1 || {};
  return {
    gs1: {
      url: process.env.GS1_URL || gs1.url || '',
      clave: process.env.GS1_CLAVE || gs1.clave || '',
      esquema: process.env.GS1_ESQUEMA || gs1.esquema || 'apikey',
      cabecera: process.env.GS1_CABECERA || gs1.cabecera || ''
    }
  };
}

const CONFIG = cargarConfig();

// Memoria de consultas ya resueltas: evita repetir llamadas y cuidar el cupo diario.
const cache = new Map();
const CACHE_MAXIMO = 5000;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

/** Atiende una peticion. Se usa igual para el servidor HTTP y para el HTTPS. */
function manejar(peticion, respuesta) {
  let ruta;
  try {
    ruta = decodeURIComponent(new URL(peticion.url, 'http://localhost').pathname);
  } catch (e) {
    respuesta.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('URL invalida');
    return;
  }

  // Consulta del nombre del producto. El navegador no puede llamar estas APIs
  // directamente por CORS, y las credenciales no deben salir del servidor.
  if (ruta === '/api/consulta') {
    return atenderConsulta(peticion, respuesta);
  }
  if (ruta === '/api/estado') {
    const e = tabla.estado();
    return responderJson(respuesta, 200, {
      gs1Configurado: !!CONFIG.gs1.clave,
      fuentes: ['Verified by GS1', 'Open Food Facts', 'UPCitemdb'],
      enCache: cache.size,
      tabla: { version: e.version, actualizado: e.actualizado, skus: e.skus.length, pendientes: e.pendientes.length }
    });
  }

  // ── La tabla compartida ──
  //
  // El navegador la pide entera al arrancar y despues solo pregunta por la
  // version, que es un numero: asi varias cajas se enteran de lo que cambio
  // otra sin mover la tabla completa cada vez.
  if (ruta === '/api/datos') {
    return responderJson(respuesta, 200, tabla.estado());
  }
  if (ruta === '/api/version') {
    return responderJson(respuesta, 200, tabla.version());
  }
  if (ruta === '/api/operacion') {
    return atenderOperacion(peticion, respuesta);
  }

  if (ruta === '/') ruta = '/index.html';

  // Se resuelve contra la raiz y se verifica que no escape de ella.
  const destino = path.resolve(RAIZ, '.' + ruta);
  if (destino !== RAIZ && !destino.startsWith(RAIZ + path.sep)) {
    respuesta.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('Prohibido');
    return;
  }

  fs.readFile(destino, (error, contenido) => {
    if (error) {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      respuesta.end('No encontrado: ' + ruta);
      return;
    }
    respuesta.writeHead(200, {
      'Content-Type': TIPOS[path.extname(destino).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    respuesta.end(contenido);
  });
}

function responderJson(respuesta, codigo, datos) {
  const cuerpo = JSON.stringify(datos);
  respuesta.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  respuesta.end(cuerpo);
}

// Un listado entero viaja en una sola peticion, y son cientos de KB.
const CUERPO_MAXIMO = 32 * 1024 * 1024;

function leerCuerpo(peticion) {
  return new Promise((resolver, rechazar) => {
    const partes = [];
    let total = 0;
    peticion.on('data', (parte) => {
      total += parte.length;
      if (total > CUERPO_MAXIMO) {
        rechazar(new Error('El cuerpo de la peticion pasa de ' +
                           Math.round(CUERPO_MAXIMO / 1024 / 1024) + ' MB'));
        peticion.destroy();
        return;
      }
      partes.push(parte);
    });
    peticion.on('end', () => resolver(Buffer.concat(partes).toString('utf8')));
    peticion.on('error', rechazar);
  });
}

/**
 * Aplica una operacion sobre la tabla del servidor.
 *
 * El navegador ya la aplico sobre su copia antes de llamar aqui: asi la caja
 * no espera a la red para seguir trabajando. Esto escribe la copia que mandan
 * todas las cajas.
 */
async function atenderOperacion(peticion, respuesta) {
  if (peticion.method !== 'POST') {
    return responderJson(respuesta, 405, { ok: false, error: 'Se esperaba POST' });
  }

  let cuerpo;
  try {
    cuerpo = JSON.parse(await leerCuerpo(peticion));
  } catch (e) {
    return responderJson(respuesta, 400, { ok: false, error: 'Cuerpo invalido: ' + e.message });
  }

  const r = tabla.aplicar(cuerpo.modulo, cuerpo.nombre, cuerpo.argumentos);
  if (!r.ok) {
    console.log('OPERACION RECHAZADA  ' + cuerpo.modulo + '.' + cuerpo.nombre + ': ' + r.error);
    return responderJson(respuesta, 400, r);
  }

  const e = tabla.estado();
  console.log('tabla  ' + cuerpo.modulo + '.' + cuerpo.nombre +
              '  -> v' + r.version + '  ' + e.skus.length + ' SKU, ' + e.pendientes.length + ' pendientes');

  // Una operacion grande cambia tanto que es mas barato devolver la tabla
  // entera que hacer que el navegador la pida aparte.
  const pesada = cuerpo.modulo === 'Listado' ||
                 cuerpo.nombre === 'importar' ||
                 cuerpo.nombre === 'vaciar' ||
                 cuerpo.nombre === 'cargar';

  responderJson(respuesta, 200, {
    ok: true,
    version: r.version,
    resultado: r.resultado,
    estado: pesada ? e : null
  });
}

async function atenderConsulta(peticion, respuesta) {
  let codigo = '';
  try {
    codigo = new URL(peticion.url, 'http://localhost').searchParams.get('codigo') || '';
  } catch (e) { /* se trata como vacio */ }

  codigo = codigo.replace(/[^0-9]/g, '');
  if (codigo.length < 8 || codigo.length > 14) {
    return responderJson(respuesta, 400, {
      ok: false,
      error: 'Codigo invalido: se esperan entre 8 y 14 digitos'
    });
  }

  const clave = proveedores.aGtin13(codigo);
  if (cache.has(clave)) {
    const guardado = cache.get(clave);
    return responderJson(respuesta, 200, Object.assign({}, guardado, { deCache: true }));
  }

  const resultado = await proveedores.consultar(codigo, CONFIG);

  // Solo se memoriza lo encontrado: un fallo puede deberse a un corte temporal.
  if (resultado.ok) {
    if (cache.size >= CACHE_MAXIMO) cache.clear();
    cache.set(clave, resultado);
  }

  console.log(
    (resultado.ok ? 'OK  ' : 'NO  ') + codigo + '  ' +
    (resultado.ok ? resultado.producto.fuente + ': ' + resultado.producto.nombre
                  : resultado.intentos.map((i) => i.fuente + '=' + i.estado).join(', '))
  );

  responderJson(respuesta, 200, resultado);
}

/** Direcciones de red local por las que el telefono puede entrar. */
function direccionesLocales() {
  const direcciones = [];
  const interfaces = os.networkInterfaces();
  for (const nombre of Object.keys(interfaces)) {
    for (const red of interfaces[nombre] || []) {
      if (red.internal || red.family !== 'IPv4') continue;
      direcciones.push(red.address);
    }
  }
  return direcciones;
}

const ESQUEMA = SEGURO ? 'https' : 'http';
const servidor = SEGURO
  ? https.createServer(CERTIFICADO, manejar)
  : http.createServer(manejar);

servidor.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('El puerto ' + PUERTO + ' esta ocupado. Prueba: node server.js ' + (PUERTO + 1));
  } else {
    console.error('Error del servidor:', error.message);
  }
  process.exit(1);
});

// Con un certificado autofirmado, el navegador corta el saludo TLS cada vez que
// alguien no acepta el aviso. Se resume en una linea en vez de una traza.
servidor.on('tlsClientError', (error) => {
  if (error && error.code === 'ECONNRESET') return;
  console.log('Aviso TLS: ' + ((error && error.message) || 'desconocido'));
});

/**
 * Con HTTPS activo, el puerto 8000 queda redirigiendo. Asi funciona igual si
 * en el telefono se escribe la direccion sin https, que es lo normal.
 */
function arrancarRedireccion() {
  if (!SEGURO || PUERTO === PUERTO_HTTP) return;

  const redireccion = http.createServer((peticion, respuesta) => {
    const anfitrion = String(peticion.headers.host || '').split(':')[0] || 'localhost';
    const destino = 'https://' + anfitrion + ':' + PUERTO + peticion.url;
    respuesta.writeHead(307, { Location: destino, 'Cache-Control': 'no-store' });
    respuesta.end('Redirigiendo a ' + destino);
  });

  // Que el puerto 8000 este ocupado no es grave: el servidor HTTPS ya sirve.
  redireccion.on('error', (error) => {
    console.log('Sin redireccion desde el puerto ' + PUERTO_HTTP + ': ' + error.code);
  });
  redireccion.listen(PUERTO_HTTP, () => {
    console.log('El puerto ' + PUERTO_HTTP + ' redirige a HTTPS.');
  });
}

tabla.iniciar();

servidor.listen(PUERTO, () => {
  console.log('Lector de codigos de barras en ' + ESQUEMA + '://localhost:' + PUERTO);

  const locales = direccionesLocales();
  if (locales.length) {
    console.log('Desde el telefono, en la misma red:');
    for (const direccion of locales) {
      console.log('  ' + ESQUEMA + '://' + direccion + ':' + PUERTO);
    }
  }

  console.log('Carpeta servida: ' + RAIZ);

  if (SEGURO) {
    console.log('HTTPS con certificado autofirmado: la camara funciona desde el telefono.');
    console.log('El navegador avisara que el emisor es desconocido. Acepta y continua.');
  } else if (FORZAR_HTTP) {
    console.log('HTTP a la fuerza (--http): la camara solo funcionara en localhost.');
  } else {
    console.log('Sin certificado: la camara solo funcionara en localhost.');
    console.log('Para usarla desde el telefono: node generar-certificado.js');
  }

  console.log(CONFIG.gs1.clave
    ? 'Verified by GS1: configurado'
    : 'Verified by GS1: sin credenciales, se consultan solo las fuentes abiertas');
  console.log('Ctrl+C para detener.');

  arrancarRedireccion();
});
