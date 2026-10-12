import { describe, expect, it, vi } from 'vitest';
import { OPCIONES_HTTP, OPCIONES_HTTPS, analizarSitio } from './analizar';
import type { Descargador } from './descarga';
import { AHORA, HTTP_REDIRIGE, bien, mal, resolvedorFalso, respuesta, tls } from './pruebas/construir';
import type { ResultadoCaptura } from './tipos';

/** Descargador falso: responde según el protocolo de la dirección pedida. */
function falso(https: ResultadoCaptura, http: ResultadoCaptura = HTTP_REDIRIGE) {
  const descargador = vi.fn<Descargador>(async (url) => (url.protocol === 'https:' ? https : http));
  return { descargador, deps: { descargador, ahora: () => AHORA } };
}

const analizar = (entrada: string, https: ResultadoCaptura, http?: ResultadoCaptura) => analizarSitio(entrada, falso(https, http).deps);

async function informe(entrada: string, https: ResultadoCaptura, http?: ResultadoCaptura) {
  const r = await analizar(entrada, https, http);
  if (!r.ok) throw new Error(`Se esperaba un informe: ${JSON.stringify(r.error)}`);
  return r.informe;
}

describe('analizarSitio · camino feliz', () => {
  it('un sitio perfecto saca A+ con 100 puntos y sin techo ni avisos', async () => {
    const i = await informe('ejemplo.com', bien(respuesta()));
    expect(i).toMatchObject({
      version: 1,
      objetivo: { host: 'ejemplo.com', url: 'https://ejemplo.com/' },
      nota: { puntos: 100, letra: 'A+', techo: null },
      avisos: [],
      analizadoEn: AHORA.toISOString(),
    });
    expect(i.hallazgos.length).toBeGreaterThan(10);
    expect(i.nota.categorias).toEqual([
      { id: 'https', puntos: 100 },
      { id: 'dns', puntos: null },
      { id: 'cabeceras', puntos: 100 },
      { id: 'contenido', puntos: 100 },
      { id: 'cookies', puntos: 100 },
      { id: 'privacidad', puntos: 100 },
      { id: 'tecnologias', puntos: 100 },
      { id: 'rendimiento', puntos: 100 },
    ]);
  });

  it('pide la web por HTTPS (siguiendo redirecciones) y por HTTP (sin seguirlas), con la ruta que se escribió', async () => {
    const { descargador, deps } = falso(bien(respuesta()));
    await analizarSitio('http://Ejemplo.com/tienda?x=1#nada', deps);
    expect(descargador).toHaveBeenCalledTimes(2);
    expect(descargador).toHaveBeenCalledWith(new URL('https://ejemplo.com/tienda?x=1'), OPCIONES_HTTPS);
    expect(descargador).toHaveBeenCalledWith(new URL('http://ejemplo.com/tienda?x=1'), OPCIONES_HTTP);
    expect(OPCIONES_HTTP.seguirRedirecciones).toBe(0);
    expect(OPCIONES_HTTPS.seguirRedirecciones).toBeGreaterThan(0);
  });

  it('el informe nunca lleva el contenido de la página', async () => {
    const i = await informe('ejemplo.com', bien(respuesta({ cuerpo: '<html>CONTENIDO-PRIVADO-DE-LA-PAGINA</html>' })));
    expect(JSON.stringify(i)).not.toContain('CONTENIDO-PRIVADO');
    expect(Object.keys(i)).not.toContain('cuerpo');
  });

  it('es serializable y se reconstruye igual', async () => {
    const i = await informe('ejemplo.com', bien(respuesta()));
    expect(JSON.parse(JSON.stringify(i))).toEqual(i);
  });
});

describe('analizarSitio · notas realistas (cuentas hechas a mano)', () => {
  it('sin HSTS: (163 − 12) / 163 = 93 → A', async () => {
    const sinHsts = respuesta({ cabeceras: { ...respuesta().cabeceras, 'strict-transport-security': [] } });
    delete sinHsts.cabeceras['strict-transport-security'];
    const i = await informe('ejemplo.com', bien(sinHsts));
    expect(i.nota).toMatchObject({ puntos: 93, letra: 'A' });
  });

  it('sin política CSP (que también deja sin protección contra clickjacking): (163 − 14 − 6) / 163 = 88 → B', async () => {
    const base = respuesta();
    delete base.cabeceras['content-security-policy'];
    const i = await informe('ejemplo.com', bien(base));
    expect(i.nota).toMatchObject({ puntos: 88, letra: 'B' });
  });

  it('web antigua con PHP 7.4 y una cookie de sesión sin proteger: (184 − 8 − 8 − 6 − 1,5 − 1,5) / 184 = 86 → B (la cabecera que anuncia «PHP/7.4.3» también resta medio punto de 3)', async () => {
    const r = respuesta({ cabeceras: { ...respuesta().cabeceras, 'x-powered-by': ['PHP/7.4.3'], 'set-cookie': ['PHPSESSID=abc; Path=/'] } });
    const i = await informe('ejemplo.com', bien(r));
    expect(i.nota).toMatchObject({ puntos: 86, letra: 'B', techo: null });
    const por = (id: string) => i.hallazgos.find((x) => x.id === id)?.resultado;
    expect([por('tecnologias.php'), por('tecnologias.cabecera'), por('cookies.secure'), por('cookies.httponly'), por('cookies.samesite')]).toEqual([
      'fallo',
      'mejorable',
      'fallo',
      'fallo',
      'mejorable',
    ]);
    expect(i.nota.categorias.find((c) => c.id === 'cookies')?.puntos).toBe(Math.round((100 * 1.5) / 17));
  });

  it('certificado caducado: la letra se queda en D por mucho que lo demás vaya bien', async () => {
    const r = respuesta({ certificados: [{ host: 'ejemplo.com', tls: tls({ autorizado: false, errorAutorizacion: 'CERT_HAS_EXPIRED' }) }] });
    const i = await informe('ejemplo.com', bien(r));
    expect(i.nota.letra).toBe('D');
    expect(i.nota.techo).toEqual({ id: 'https.certificado.valido', letra: 'D' });
  });

  it('sin HTTPS pero con HTTP funcionando: F con techo en «https.disponible»', async () => {
    const i = await informe('ejemplo.com', mal('conexion'), bien(respuesta({ urlFinal: 'http://ejemplo.com/', certificados: [] })));
    expect(i.nota).toMatchObject({ puntos: 0, letra: 'F' });
    expect(i.hallazgos.map((x) => x.id)).toEqual(['https.disponible']);
  });
});

describe('analizarSitio · avisos sobre el propio análisis', () => {
  it('avisa si se recortó la descarga o se interrumpió', async () => {
    expect((await informe('ejemplo.com', bien(respuesta({ estadoCuerpo: 'recortado' })))).avisos).toEqual([
      { id: 'cuerpo.recortado', datos: { maxBytes: OPCIONES_HTTPS.maxBytes } },
    ]);
    expect((await informe('ejemplo.com', bien(respuesta({ estadoCuerpo: 'interrumpido', bytesLeidos: 123 })))).avisos).toEqual([
      { id: 'cuerpo.interrumpido', datos: { bytesLeidos: 123 } },
    ]);
  });

  it('avisa si la web acaba en otro servidor (por ejemplo, de ejemplo.com a www.ejemplo.com)', async () => {
    const i = await informe('ejemplo.com', bien(respuesta({ urlFinal: 'https://www.ejemplo.com/', certificados: [{ host: 'www.ejemplo.com', tls: tls() }] })));
    expect(i.avisos).toEqual([{ id: 'redireccion.otro-host', datos: { desde: 'ejemplo.com', hasta: 'www.ejemplo.com' } }]);
  });
});

describe('analizarSitio · cuando no hay nota que dar', () => {
  it('una entrada no válida no llega ni a descargar', async () => {
    const { descargador, deps } = falso(bien(respuesta()));
    expect(await analizarSitio('localhost', deps)).toEqual({ ok: false, error: { codigo: 'objetivo-invalido', motivo: 'host-interno' } });
    expect(await analizarSitio('ftp://ejemplo.com', deps)).toEqual({ ok: false, error: { codigo: 'objetivo-invalido', motivo: 'protocolo' } });
    expect(descargador).not.toHaveBeenCalled();
  });

  it('un nombre que apunta a una IP no pública se rechaza, no se puntúa', async () => {
    const r = await analizar('ejemplo.com', mal('ip-no-publica'), mal('ip-no-publica'));
    expect(r).toMatchObject({ ok: false, error: { codigo: 'destino-no-permitido' } });
  });

  it('también si solo lo hace una de las dos conexiones (por ejemplo, una redirección interna)', async () => {
    expect(await analizar('ejemplo.com', mal('ip-no-publica'))).toMatchObject({ ok: false, error: { codigo: 'destino-no-permitido' } });
    expect(await analizar('ejemplo.com', bien(respuesta()), mal('ip-no-publica'))).toMatchObject({ ok: false, error: { codigo: 'destino-no-permitido' } });
  });

  it('un nombre que no existe no es un «F»', async () => {
    expect(await analizar('noexiste.com', mal('dns'), mal('dns'))).toMatchObject({ ok: false, error: { codigo: 'no-existe' } });
  });

  it('una web que no responde por ninguna de las dos vías tampoco', async () => {
    expect(await analizar('ejemplo.com', mal('conexion'), mal('conexion'))).toMatchObject({ ok: false, error: { codigo: 'sin-respuesta' } });
    expect(await analizar('ejemplo.com', mal('tiempo-agotado'), mal('tiempo-agotado'))).toMatchObject({ ok: false, error: { codigo: 'sin-respuesta' } });
  });
});

describe('analizarSitio · progreso', () => {
  it('avisa cuando termina cada captura, con su resultado', async () => {
    const alProgreso = vi.fn();
    await analizarSitio('ejemplo.com', { ...falso(bien(respuesta()), mal('conexion')).deps, alProgreso });
    expect(alProgreso).toHaveBeenCalledTimes(2);
    expect(alProgreso).toHaveBeenCalledWith({ tipo: 'captura', via: 'https', ok: true });
    expect(alProgreso).toHaveBeenCalledWith({ tipo: 'captura', via: 'http', ok: false });
  });

  it('un fallo en quien escucha el progreso no rompe el análisis', async () => {
    const alProgreso = vi.fn(() => {
      throw new Error('boom');
    });
    const r = await analizarSitio('ejemplo.com', { ...falso(bien(respuesta())).deps, alProgreso });
    expect(r.ok).toBe(true);
  });
});

describe('analizarSitio · DNS (SPF, DMARC, CAA)', () => {
  const BUEN_DNS = resolvedorFalso({
    txt: { 'ejemplo.com': [['v=spf1 mx -all']], '_dmarc.ejemplo.com': [['v=DMARC1; p=reject']] },
    mx: { 'ejemplo.com': [{ exchange: 'mx.ejemplo.com', priority: 10 }] },
    caa: { 'ejemplo.com': [{ issue: 'letsencrypt.org' }] },
  });
  const conDns = (resolvedor: ReturnType<typeof resolvedorFalso>) => {
    const { deps } = falso(bien(respuesta()));
    return analizarSitio('ejemplo.com', { ...deps, resolvedor });
  };

  it('con el DNS en regla la nota sigue siendo A+ y la categoría «dns» sale a 100', async () => {
    const r = await conDns(BUEN_DNS);
    if (!r.ok) throw new Error('se esperaba informe');
    expect(r.informe.nota).toMatchObject({ puntos: 100, letra: 'A+' });
    expect(r.informe.nota.categorias.find((c) => c.id === 'dns')?.puntos).toBe(100);
  });

  it('un dominio que recibe correo sin SPF ni DMARC pierde 14 de 180: (180 − 14) / 180 = 92', async () => {
    const r = await conDns(resolvedorFalso({ mx: { 'ejemplo.com': [{ exchange: 'mx.ejemplo.com', priority: 10 }] }, caa: { 'ejemplo.com': [{ issue: 'x' }] } }));
    if (!r.ok) throw new Error('se esperaba informe');
    expect(r.informe.nota.puntos).toBe(92);
    expect(r.informe.hallazgos.filter((h) => h.categoria === 'dns' && h.resultado === 'fallo').map((h) => h.id)).toEqual(['dns.spf', 'dns.dmarc']);
  });

  it('si el DNS no contesta, el análisis sigue y esas comprobaciones no aplican (sin castigo)', async () => {
    const r = await conDns(resolvedorFalso({ txt: { 'ejemplo.com': 'ETIMEOUT', '_dmarc.ejemplo.com': 'ETIMEOUT' }, mx: { 'ejemplo.com': 'ETIMEOUT' }, caa: { 'ejemplo.com': 'ETIMEOUT' } }));
    if (!r.ok) throw new Error('se esperaba informe');
    expect(r.informe.hallazgos.filter((h) => h.categoria === 'dns').map((h) => h.resultado)).toEqual(['no-aplica', 'no-aplica', 'no-aplica']);
    expect(r.informe.nota.puntos).toBe(100);
    expect(r.informe.nota.categorias.find((c) => c.id === 'dns')?.puntos).toBeNull();
  });

  it('si el resolvedor lanza errores raros, el análisis no se cae y esas comprobaciones no aplican', async () => {
    const roto = { ns: () => { throw new Error('boom'); }, txt: () => { throw new Error('boom'); }, mx: () => { throw new Error('boom'); }, caa: () => { throw new Error('boom'); } };
    const { deps } = falso(bien(respuesta()));
    const r = await analizarSitio('ejemplo.com', { ...deps, resolvedor: roto });
    if (!r.ok) throw new Error('se esperaba informe');
    expect(r.informe.hallazgos.some((h) => h.categoria === 'dns')).toBe(true);
  });

  it('una IP no tiene dominio: no se mira el DNS', async () => {
    const { deps } = falso(bien(respuesta()));
    const r = await analizarSitio('93.184.216.34', { ...deps, resolvedor: BUEN_DNS });
    if (r.ok) expect(r.informe.hallazgos.some((h) => h.categoria === 'dns')).toBe(false);
  });
});
