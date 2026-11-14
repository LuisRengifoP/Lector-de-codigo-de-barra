/**
 * proveedores.js — Consulta del nombre de un producto a partir de su GTIN.
 *
 * Corre en Node, dentro del servidor, nunca en el navegador. Hay dos razones:
 *   1. CORS: las APIs de producto no autorizan llamadas desde una pagina web.
 *   2. Las credenciales de GS1 no pueden viajar al navegador.
 *
 * Se consultan las fuentes en orden y se devuelve la primera que da un nombre.
 */
'use strict';

const https = require('https');

const TIEMPO_LIMITE = 8000;
const AGENTE = 'LectorCodigosBarra/1.0 (consulta de catalogo propio)';

/** GET JSON con limite de tiempo. Nunca lanza: devuelve null ante cualquier problema. */
function pedirJson(url, cabeceras) {
  return new Promise((resolve) => {
    let terminado = false;
    const finalizar = (valor) => {
      if (!terminado) { terminado = true; resolve(valor); }
    };

    const peticion = https.get(url, {
      headers: Object.assign({ 'User-Agent': AGENTE, 'Accept': 'application/json' }, cabeceras || {}),
      timeout: TIEMPO_LIMITE
    }, (respuesta) => {
      // 404 significa "no lo tengo", no es un fallo del sistema.
      if (respuesta.statusCode === 404) { respuesta.resume(); return finalizar(null); }
      if (respuesta.statusCode !== 200) {
        respuesta.resume();
        return finalizar({ _error: 'HTTP ' + respuesta.statusCode });
      }
      let cuerpo = '';
      respuesta.setEncoding('utf8');
      respuesta.on('data', (trozo) => {
        cuerpo += trozo;
        if (cuerpo.length > 2e6) { peticion.destroy(); finalizar(null); } // Respuesta absurda: se corta.
      });
      respuesta.on('end', () => {
        try { finalizar(JSON.parse(cuerpo)); }
        catch (e) { finalizar({ _error: 'respuesta no es JSON' }); }
      });
    });

    peticion.on('timeout', () => { peticion.destroy(); finalizar({ _error: 'tiempo agotado' }); });
    peticion.on('error', (e) => finalizar({ _error: e.message }));
  });
}

/** Convierte a GTIN-13: un UPC-A de 12 digitos es el mismo producto con cero delante. */
function aGtin13(codigo) {
  const c = String(codigo).replace(/[^0-9]/g, '');
  if (c.length === 12) return '0' + c;
  if (c.length === 14 && c[0] === '0') return c.slice(1);
  return c;
}

// ───────────────────────── Verified by GS1 ─────────────────────────

/**
 * El servicio oficial de GS1. Devuelve el nombre de marca, la descripcion del
 * producto y la empresa titular del codigo.
 *
 * No es publico: hace falta contrato con la organizacion GS1 del pais
 * (en Colombia, LOGYCA / GS1 Colombia) y una clave de API. Sin credenciales
 * configuradas este proveedor se salta sin intentar nada.
 *
 * Como cada organizacion miembro publica su propia URL y su propio formato,
 * la ruta y el nombre de los campos se configuran por variables de entorno.
 */
async function verifiedByGs1(codigo, config) {
  if (!config || !config.url || !config.clave) return null;

  const url = config.url.replace('{gtin}', encodeURIComponent(aGtin13(codigo)));
  const cabeceras = {};
  // Cada organizacion usa su propio esquema de autenticacion.
  if (config.esquema === 'bearer') cabeceras['Authorization'] = 'Bearer ' + config.clave;
  else if (config.esquema === 'apikey') cabeceras['APIKey'] = config.clave;
  else cabeceras[config.cabecera || 'x-api-key'] = config.clave;

  const datos = await pedirJson(url, cabeceras);
  if (!datos || datos._error) {
    return datos && datos._error ? { _error: 'GS1: ' + datos._error } : null;
  }

  // Se buscan los campos habituales en las distintas implementaciones.
  const raiz = datos.gtinRecords ? datos.gtinRecords[0] : (datos.data || datos);
  if (!raiz) return null;

  const descripcion = raiz.productDescription || raiz.gtinName || raiz.description;
  const nombre = Array.isArray(descripcion)
    ? (descripcion[0] && (descripcion[0].value || descripcion[0].text))
    : descripcion;
  const marca = Array.isArray(raiz.brandName)
    ? (raiz.brandName[0] && (raiz.brandName[0].value || raiz.brandName[0].text))
    : raiz.brandName;

  if (!nombre && !marca) return null;

  return {
    nombre: String(nombre || marca).trim(),
    marca: marca ? String(marca).trim() : null,
    empresa: raiz.licenseeName || raiz.companyName || null,
    categoria: raiz.gpcCategoryName || null,
    fuente: 'Verified by GS1',
    oficial: true
  };
}

// ───────────────────────── Open Food Facts ─────────────────────────

/**
 * Base abierta y colaborativa de alimentos. Gratis, sin clave, con CORS.
 * Buena cobertura de alimentos colombianos; casi nula en aseo y cuidado personal.
 */
async function openFoodFacts(codigo) {
  const url = 'https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(aGtin13(codigo)) +
              '.json?fields=product_name,product_name_es,brands,quantity,categories';
  const datos = await pedirJson(url);
  if (!datos || datos._error || datos.status !== 1 || !datos.product) return null;

  const p = datos.product;
  let nombre = (p.product_name_es || p.product_name || '').trim();
  if (!nombre) return null;
  if (p.quantity && nombre.toLowerCase().indexOf(String(p.quantity).toLowerCase()) === -1) {
    nombre += ' ' + p.quantity;
  }

  return {
    nombre: nombre,
    marca: p.brands ? String(p.brands).split(',')[0].trim() : null,
    empresa: null,
    categoria: p.categories ? String(p.categories).split(',')[0].trim() : null,
    fuente: 'Open Food Facts',
    oficial: false
  };
}

// ───────────────────────── UPCitemdb ─────────────────────────

/**
 * Base comercial con nivel gratuito: 100 consultas por dia, sin registro,
 * por una ruta de prueba aparte. Cubre mas alla de alimentos, pero los
 * titulos vienen de comercios y a veces traen ruido.
 */
async function upcItemDb(codigo) {
  const url = 'https://api.upcitemdb.com/prod/trial/lookup?upc=' + encodeURIComponent(aGtin13(codigo));
  const datos = await pedirJson(url);
  if (!datos || datos._error || datos.code !== 'OK' || !datos.items || !datos.items.length) {
    if (datos && datos._error) return { _error: 'UPCitemdb: ' + datos._error };
    return null;
  }

  const item = datos.items[0];
  const titulo = (item.title || '').trim();
  if (!titulo) return null;

  return {
    nombre: titulo,
    marca: item.brand ? String(item.brand).trim() : null,
    empresa: null,
    categoria: item.category ? String(item.category).split('>').pop().trim() : null,
    fuente: 'UPCitemdb',
    oficial: false
  };
}

// ───────────────────────── Cadena de consulta ─────────────────────────

/**
 * Consulta las fuentes en orden de confianza y devuelve la primera con nombre.
 * `config.gs1` habilita el proveedor oficial cuando hay credenciales.
 */
async function consultar(codigo, config) {
  const intentos = [];
  const fuentes = [
    { nombre: 'Verified by GS1', fn: () => verifiedByGs1(codigo, config && config.gs1) },
    { nombre: 'Open Food Facts', fn: () => openFoodFacts(codigo) },
    { nombre: 'UPCitemdb', fn: () => upcItemDb(codigo) }
  ];

  for (const fuente of fuentes) {
    let resultado = null;
    try {
      resultado = await fuente.fn();
    } catch (e) {
      resultado = { _error: e.message };
    }

    if (resultado && resultado._error) {
      intentos.push({ fuente: fuente.nombre, estado: 'error', detalle: resultado._error });
      continue;
    }
    if (resultado && resultado.nombre) {
      intentos.push({ fuente: fuente.nombre, estado: 'encontrado' });
      return { ok: true, codigo: String(codigo), producto: resultado, intentos: intentos };
    }
    intentos.push({
      fuente: fuente.nombre,
      estado: fuente.nombre === 'Verified by GS1' && !(config && config.gs1 && config.gs1.clave)
        ? 'sin credenciales'
        : 'sin resultado'
    });
  }

  return { ok: false, codigo: String(codigo), producto: null, intentos: intentos };
}

module.exports = { consultar, aGtin13, verifiedByGs1, openFoodFacts, upcItemDb };
