import { describe, expect, it, vi } from 'vitest';
import { OPCIONES_HTTP, OPCIONES_HTTPS, analizarSitio } from './analizar';
import type { Descargador } from './descarga';
import { AHORA, HTTP_REDIRIGE, bien, mal, respuesta, tls } from './pruebas/construir';
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
      { id: 'cabeceras', puntos: 100 },
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
  it('sin HSTS: (89 − 12) / 89 = 87 → B', async () => {
    const sinHsts = respuesta({ cabeceras: { ...respuesta().cabeceras, 'strict-transport-security': [] } });
    delete sinHsts.cabeceras['strict-transport-security'];
    const i = await informe('ejemplo.com', bien(sinHsts));
    expect(i.nota).toMatchObject({ puntos: 87, letra: 'B' });
  });

  it('sin política CSP (que también deja sin protección contra clickjacking): (91 − 14 − 6) / 91 = 78 → C', async () => {
    const base = respuesta();
    delete base.cabeceras['content-security-policy'];
    const i = await informe('ejemplo.com', bien(base));
    expect(i.nota).toMatchObject({ puntos: 78, letra: 'C' });
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
