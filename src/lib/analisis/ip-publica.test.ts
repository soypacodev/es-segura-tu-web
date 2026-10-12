import { describe, expect, it } from 'vitest';
import { esIpPublica } from './ip-publica';

describe('esIpPublica · IPv4', () => {
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.255.255', '172.32.0.0', '100.63.255.255', '100.128.0.0', '11.0.0.1', '192.169.0.1', '198.20.0.1'])(
    '%s es pública',
    (ip) => expect(esIpPublica(ip)).toBe(true),
  );

  it.each([
    '0.0.0.0',
    '0.1.2.3',
    '10.0.0.1',
    '10.255.255.255',
    '100.64.0.0',
    '100.127.255.255',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254',
    '172.16.0.0',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.10',
    '192.168.0.1',
    '192.168.255.255',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
  ])('%s no es pública', (ip) => expect(esIpPublica(ip)).toBe(false));
});

describe('esIpPublica · IPv6', () => {
  it.each([
    '2606:4700:4700::1111',
    '2a00:1450:4001:81b::200e',
    '2001:4860:4860::8888',
    '2001:200::1',
    // Mapeada o NAT64 con una IPv4 pública dentro: manda la IPv4.
    '::ffff:8.8.8.8',
    '::ffff:808:808',
    '64:ff9b::8.8.8.8',
    '2002:808:808::1',
  ])('%s es pública', (ip) => expect(esIpPublica(ip)).toBe(true));

  it.each([
    '::',
    '::1',
    'fe80::1',
    'fe80::1ff:fe23:4567:890a',
    'fc00::1',
    'fd12:3456:789a::1',
    'ff02::1',
    'fec0::1',
    '::127.0.0.1', // IPv4 compatible, en desuso
    '::7f00:1',
    '2001:db8::1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2', // Teredo
    '2001:10::1', // ORCHID
    '3fff::1',
    '100::1',
    // Mapeada o NAT64 con una IPv4 interna dentro.
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:a9fe:a9fe',
    '64:ff9b::127.0.0.1',
    '64:ff9b::a00:1',
    '2002:7f00:1::1', // 6to4 con 127.0.0.1
    '2002:a9fe:a9fe::1', // 6to4 con 169.254.169.254
  ])('%s no es pública', (ip) => expect(esIpPublica(ip)).toBe(false));
});

describe('esIpPublica · lo que no es una IP canónica se rechaza', () => {
  it.each([
    '',
    ' ',
    'abc',
    'localhost',
    'ejemplo.com',
    '1.2.3',
    '1.2.3.4.5',
    '256.1.1.1',
    '08.8.8.8',
    '8.8.8.08',
    '0x7f.0.0.1',
    '2130706433', // 127.0.0.1 en decimal
    '017700000001', // 127.0.0.1 en octal
    '127.1',
    '8.8.8.8 ',
    ' 8.8.8.8',
    '8.8.8.8\n',
    '8.8.8.8/32',
    '[::1]',
    'fe80::1%eth0',
    '2606:4700:4700::1111%eth0',
    '2606:4700:4700::1111::',
    ':::',
    '1:2:3:4:5:6:7:8:9',
    'g::1',
  ])('«%s» se rechaza', (texto) => expect(esIpPublica(texto)).toBe(false));
});
