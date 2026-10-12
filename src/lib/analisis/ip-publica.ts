// ¿Es esta dirección IP de internet, o de una red interna?
//
// Es la pieza central contra SSRF: el servidor solo se conecta a direcciones
// que devuelven «true» aquí. Ante la duda, «false»: cualquier cosa que no se
// reconozca como una dirección IP canónica se rechaza.

import { isIP } from 'node:net';

type Rango4 = readonly [base: string, bits: number];

/** IPv4 que no son de internet (RFC 6890 y relacionados). */
const RANGOS_NO_PUBLICOS_V4: readonly Rango4[] = [
  ['0.0.0.0', 8], // «esta red»
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // enlace local: incluye el servicio de metadatos de la nube
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24], // protocolos IETF
  ['192.0.2.0', 24], // documentación
  ['192.88.99.0', 24], // 6to4 anycast, en desuso
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // pruebas de rendimiento
  ['198.51.100.0', 24], // documentación
  ['203.0.113.0', 24], // documentación
  ['224.0.0.0', 4], // multidifusión
  ['240.0.0.0', 4], // reservada y difusión (255.255.255.255)
];

function parsearIpv4(texto: string): number | null {
  if (isIP(texto) !== 4) return null;
  const partes = texto.split('.');
  if (partes.length !== 4) return null;
  let valor = 0;
  for (const parte of partes) {
    if (!/^(?:0|[1-9]\d{0,2})$/.test(parte)) return null;
    const numero = Number(parte);
    if (numero > 255) return null;
    valor = valor * 256 + numero;
  }
  return valor;
}

function enRango4(valor: number, [base, bits]: Rango4): boolean {
  const desplazamiento = 32 - bits;
  const inicio = parsearIpv4(base) as number;
  return Math.floor(valor / 2 ** desplazamiento) === Math.floor(inicio / 2 ** desplazamiento);
}

function ipv4Publica(valor: number): boolean {
  return !RANGOS_NO_PUBLICOS_V4.some((rango) => enRango4(valor, rango));
}

function parsearIpv6(texto: string): bigint | null {
  // Node acepta «fe80::1%eth0»: un identificador de zona no es una dirección pública.
  if (texto.includes('%') || isIP(texto) !== 6) return null;

  let t = texto;
  const ultimosDosPuntos = t.lastIndexOf(':');
  const cola = t.slice(ultimosDosPuntos + 1);
  if (cola.includes('.')) {
    const v4 = parsearIpv4(cola);
    if (v4 === null) return null;
    t = `${t.slice(0, ultimosDosPuntos + 1)}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }

  const trozos = t.split('::');
  if (trozos.length > 2) return null;
  const grupos = (s: string) => (s === '' ? [] : s.split(':'));
  const izquierda = grupos(trozos[0]);
  const derecha = trozos.length === 2 ? grupos(trozos[1]) : [];
  const relleno = 8 - izquierda.length - derecha.length;
  if (trozos.length === 1 ? izquierda.length !== 8 : relleno < 1) return null;

  const todos = [...izquierda, ...Array<string>(trozos.length === 2 ? relleno : 0).fill('0'), ...derecha];
  if (todos.length !== 8) return null;

  let valor = 0n;
  for (const grupo of todos) {
    if (!/^[0-9a-f]{1,4}$/i.test(grupo)) return null;
    valor = (valor << 16n) | BigInt(parseInt(grupo, 16));
  }
  return valor;
}

function enRango6(valor: bigint, base: bigint, bits: number): boolean {
  const desplazamiento = BigInt(128 - bits);
  return valor >> desplazamiento === base >> desplazamiento;
}

const MASCARA_32 = 0xffffffffn;

function ipv6Publica(valor: bigint): boolean {
  // IPv4 mapeada (::ffff:a.b.c.d): manda la IPv4 que lleva dentro.
  if (enRango6(valor, 0xffffn << 32n, 96)) return ipv4Publica(Number(valor & MASCARA_32));
  // NAT64 (64:ff9b::/96): igual, manda la IPv4 incrustada.
  if (enRango6(valor, 0x0064ff9bn << 96n, 96)) return ipv4Publica(Number(valor & MASCARA_32));
  // 6to4 (2002::/16): la IPv4 va en los bits 16 a 48.
  if (enRango6(valor, 0x2002n << 112n, 16)) return ipv4Publica(Number((valor >> 80n) & MASCARA_32));

  // Solo unicast global (2000::/3): deja fuera ::1, fe80::/10, fc00::/7, ff00::/8, ::/96…
  if (!enRango6(valor, 0x2000n << 112n, 3)) return false;
  // Dentro de 2000::/3, lo que no es de internet.
  if (enRango6(valor, 0x2001n << 112n, 23)) return false; // protocolos IETF: Teredo, ORCHID, pruebas
  if (enRango6(valor, 0x20010db8n << 96n, 32)) return false; // documentación
  if (enRango6(valor, 0x3fffn << 112n, 20)) return false; // documentación (RFC 9637)
  return true;
}

export function esIpPublica(ip: string): boolean {
  const v4 = parsearIpv4(ip);
  if (v4 !== null) return ipv4Publica(v4);
  const v6 = parsearIpv6(ip);
  if (v6 !== null) return ipv6Publica(v6);
  return false;
}
