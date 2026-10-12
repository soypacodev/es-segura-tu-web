import { describe, expect, it } from 'vitest';
import { normalizarObjetivo, type MotivoObjetivo } from './objetivo';

const bien = (entrada: string) => {
  const r = normalizarObjetivo(entrada);
  if (!r.ok) throw new Error(`Se esperaba válido: «${entrada}» → ${r.motivo}`);
  return r;
};

describe('normalizarObjetivo · direcciones válidas', () => {
  it('sin esquema añade https', () => {
    const r = bien('ejemplo.com');
    expect(r.url.href).toBe('https://ejemplo.com/');
    expect(r.host).toBe('ejemplo.com');
  });

  it.each([
    ['  Ejemplo.COM  ', 'https://ejemplo.com/'],
    ['https://www.ejemplo.com/tienda?x=1#parte', 'https://www.ejemplo.com/tienda?x=1'],
    ['http://ejemplo.com', 'http://ejemplo.com/'],
    ['HTTPS://EJEMPLO.COM/Ruta', 'https://ejemplo.com/Ruta'],
    ['ejemplo.com.', 'https://ejemplo.com/'],
    ['//ejemplo.com', 'https://ejemplo.com/'],
    ['https://ejemplo.com:443/', 'https://ejemplo.com/'],
    ['http://ejemplo.com:80/', 'http://ejemplo.com/'],
    ['ñandú.es', 'https://xn--and-6ma2c.es/'],
    ['sub.dominio.ejemplo.co.uk/pagina', 'https://sub.dominio.ejemplo.co.uk/pagina'],
  ])('«%s» → %s', (entrada, esperada) => expect(bien(entrada).url.href).toBe(esperada));

  it('el host se devuelve en minúsculas y sin el punto final', () => {
    expect(bien('WWW.Ejemplo.COM.').host).toBe('www.ejemplo.com');
  });
});

describe('normalizarObjetivo · lo que se rechaza', () => {
  const casos: [string, MotivoObjetivo][] = [
    ['', 'vacio'],
    ['   ', 'vacio'],
    [`https://${'a'.repeat(2050)}.com`, 'demasiado-largo'],
    ['ftp://ejemplo.com', 'protocolo'],
    ['file:///etc/passwd', 'protocolo'],
    ['javascript:alert(1)', 'protocolo'],
    ['data:text/html,<h1>x</h1>', 'protocolo'],
    ['mailto:a@ejemplo.com', 'protocolo'],
    ['gopher://ejemplo.com', 'protocolo'],
    ['ws://ejemplo.com', 'protocolo'],
    ['https://usuario:clave@ejemplo.com', 'credenciales'],
    ['https://usuario@ejemplo.com', 'credenciales'],
    ['ejemplo.com:8080', 'puerto'],
    ['https://ejemplo.com:22', 'puerto'],
    ['http://ejemplo.com:443', 'puerto'],
    ['127.0.0.1', 'ip-literal'],
    ['http://169.254.169.254/latest/meta-data', 'ip-literal'],
    ['http://2130706433/', 'ip-literal'], // 127.0.0.1 en decimal
    ['http://0x7f.1/', 'ip-literal'],
    ['http://0177.0.0.1/', 'ip-literal'],
    ['http://1.2.3/', 'ip-literal'],
    ['http://[::1]/', 'ip-literal'],
    ['http://[::ffff:127.0.0.1]/', 'ip-literal'],
    ['http://[2606:4700:4700::1111]/', 'ip-literal'],
    ['8.8.8.8', 'ip-literal'],
    ['localhost', 'host-interno'],
    ['intranet', 'host-interno'],
    ['servidor.local', 'host-interno'],
    ['app.localhost', 'host-interno'],
    ['nas.lan', 'host-interno'],
    ['metadata.internal', 'host-interno'],
    ['prueba.test', 'host-interno'],
    ['algo.invalid', 'host-interno'],
    ['abcdefghij.onion', 'host-interno'],
    ['1.0.0.127.in-addr.arpa', 'host-interno'],
    ['https://', 'host-invalido'],
    ['ejemplo .com', 'host-invalido'],
    ['ejemplo..com', 'host-invalido'],
    ['-ejemplo.com', 'host-invalido'],
    ['ejemplo-.com', 'host-invalido'],
    ['eje_mplo.com', 'host-invalido'],
    ['ejemplo.com\u0000.evil.com', 'host-invalido'],
    [`${'a'.repeat(64)}.com`, 'host-invalido'],
  ];

  it.each(casos)('«%s» → %s', (entrada, motivo) => {
    expect(normalizarObjetivo(entrada)).toEqual({ ok: false, motivo });
  });
});
