import { describe, expect, it } from 'vitest';
import { bien, respuesta, sitio } from '../pruebas/construir';
import type { EstadoCuerpo } from '../tipos';
import { avisoDeCookies, comprobarPrivacidad, enlacesDeLaPagina, rastreadoresEnHtml, usaFuentesDeGoogle } from './privacidad';

const PIE = '<a href="/privacidad">Política de privacidad</a><a href="/aviso-legal">Aviso legal</a>';
const con = (html: string, estadoCuerpo: EstadoCuerpo = 'completo') =>
  comprobarPrivacidad(sitio({ https: bien(respuesta({ cuerpo: `<html><body>${html}</body></html>`, estadoCuerpo })) }));
const por = (hs: ReturnType<typeof con>, id: string) => hs.find((x) => x.id === id)!;

describe('rastreadoresEnHtml', () => {
  it('reconoce el dominio en una etiqueta o dentro de un script en línea, sin repetir', () => {
    const html = `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-1"></script>
      <script>!function(f){n.src='https://connect.facebook.net/en_US/fbevents.js'}()</script>
      <img src="https://www.googletagmanager.com/ns.html">`;
    expect(rastreadoresEnHtml(html)).toEqual(['Google Tag Manager', 'Píxel de Meta (Facebook)']);
  });
  it('no confunde dominios parecidos ni enlaces normales', () => {
    expect(rastreadoresEnHtml('<a href="https://www.facebook.com/mi-pagina">Facebook</a> <script src="/mihotjar.comun.js"></script>')).toEqual([]);
    expect(rastreadoresEnHtml('<script src="https://no-google-analytics.com.evil.test/x.js">')).toEqual([]);
  });
  it('no distingue mayúsculas', () => {
    expect(rastreadoresEnHtml('<SCRIPT SRC="HTTPS://STATIC.HOTJAR.COM/c/hotjar-1.js">')).toEqual(['Hotjar']);
  });
});

describe('avisoDeCookies', () => {
  it('reconoce gestores habituales', () => {
    expect(avisoDeCookies('<script src="https://cdn.cookiebot.com/uc.js"></script>')).toBe('Cookiebot');
    expect(avisoDeCookies('<div id="cmplz-cookiebanner-container">')).toBe('Complianz');
  });
  it('reconoce un aviso hecho a mano por su clase o su texto', () => {
    expect(avisoDeCookies('<div class="cookie-banner">Usamos cookies</div>')).toBe('propio');
    expect(avisoDeCookies('<button>Aceptar todas las cookies</button>')).toBe('propio');
  });
  it('una página sin aviso devuelve null', () => {
    expect(avisoDeCookies('<p>Hola, esta tienda vende galletas</p>')).toBeNull();
  });
});

describe('usaFuentesDeGoogle', () => {
  it('detecta las dos direcciones de Google Fonts', () => {
    expect(usaFuentesDeGoogle('<link href="https://fonts.googleapis.com/css2?family=Inter">')).toBe(true);
    expect(usaFuentesDeGoogle('<link rel="preconnect" href="https://fonts.gstatic.com">')).toBe(true);
    expect(usaFuentesDeGoogle('<link href="/fonts/inter.woff2">')).toBe(false);
  });
});

describe('enlacesDeLaPagina', () => {
  it('lee dirección y texto sin etiquetas interiores', () => {
    expect(enlacesDeLaPagina(`<a class="x" href='/priv'><span>Política</span>  de\n privacidad</a><a>sin href</a>`)).toEqual([
      { href: '/priv', texto: 'Política de privacidad' },
      { href: '', texto: 'sin href' },
    ]);
  });
});

describe('comprobarPrivacidad', () => {
  it('sin HTTPS no hay nada que valorar', () => {
    expect(comprobarPrivacidad(sitio({ https: { ok: false, error: { codigo: 'conexion', mensaje: 'x' } } }))).toEqual([]);
  });

  it('una web limpia con páginas legales lo tiene todo bien y el consentimiento no aplica', () => {
    const hs = con(PIE);
    expect(hs.map((x) => [x.id, x.resultado])).toEqual([
      ['privacidad.rastreadores', 'correcto'],
      ['privacidad.consentimiento', 'no-aplica'],
      ['privacidad.fuentes', 'correcto'],
      ['privacidad.politica', 'correcto'],
      ['privacidad.avisolegal', 'correcto'],
    ]);
  });

  it('con rastreadores y sin aviso: rastreadores y consentimiento mejorables, con los nombres', () => {
    const hs = con(`${PIE}<script src="https://www.googletagmanager.com/gtag/js"></script>`);
    expect(por(hs, 'privacidad.rastreadores')).toMatchObject({ resultado: 'mejorable', datos: { nombres: ['Google Tag Manager'], total: 1 } });
    expect(por(hs, 'privacidad.consentimiento')).toMatchObject({ resultado: 'mejorable', gravedad: 'alta' });
  });

  it('con rastreadores y aviso: el consentimiento está bien y dice qué gestor', () => {
    const hs = con(`${PIE}<script src="https://www.googletagmanager.com/gtag/js"></script><script src="https://consent.cookiebot.com/uc.js"></script>`);
    expect(por(hs, 'privacidad.consentimiento')).toMatchObject({ resultado: 'correcto', datos: { gestor: 'Cookiebot' } });
    expect(por(hs, 'privacidad.rastreadores').resultado).toBe('mejorable');
  });

  it('con más de cinco rastreadores lista cinco y dice cuántos quedan', () => {
    const scripts = ['googletagmanager.com', 'hotjar.com', 'clarity.ms', 'snap.licdn.com', 'mixpanel.com', 'criteo.com', 'bat.bing.com']
      .map((d) => `<script src="https://${d}/a.js"></script>`)
      .join('');
    const dato = por(con(PIE + scripts), 'privacidad.rastreadores').datos as { nombres: string[]; total: number; mas: number };
    expect(dato.nombres).toHaveLength(5);
    expect(dato.total).toBe(7);
    expect(dato.mas).toBe(2);
  });

  it('las tipografías de Google son mejorables', () => {
    expect(por(con(`${PIE}<link href="https://fonts.googleapis.com/css2?family=Inter">`), 'privacidad.fuentes').resultado).toBe('mejorable');
  });

  it('sin enlaces legales son mejorables (nunca fallo)', () => {
    const hs = con('<p>hola</p>');
    expect(por(hs, 'privacidad.politica').resultado).toBe('mejorable');
    expect(por(hs, 'privacidad.avisolegal').resultado).toBe('mejorable');
  });

  it('reconoce el enlace por su dirección aunque el texto no lo diga, y en inglés', () => {
    expect(por(con('<a href="/politica-de-privacidad"><img src="x.png"></a><a href="/legal">Legal notice</a>'), 'privacidad.politica').resultado).toBe('correcto');
    expect(por(con('<a href="/p">Privacy policy</a><a href="/l">Legal notice</a>'), 'privacidad.avisolegal').resultado).toBe('correcto');
  });

  it('un enlace «Terms» o «Términos» basta como aviso legal', () => {
    expect(por(con('<a href="/terms">Terms</a>'), 'privacidad.avisolegal').resultado).toBe('correcto');
    expect(por(con('<a href="/x">Términos y condiciones</a>'), 'privacidad.avisolegal').resultado).toBe('correcto');
  });

  it('si la página se recortó, lo que falta no se afirma (no aplica), pero lo que sí se vio cuenta', () => {
    const hs = con('<p>hola</p>', 'recortado');
    expect(hs.map((x) => x.resultado)).toEqual(['no-aplica', 'no-aplica', 'no-aplica', 'no-aplica', 'no-aplica']);
    const visto = con(`<script src="https://static.hotjar.com/c.js"></script>${PIE}`, 'recortado');
    expect(por(visto, 'privacidad.rastreadores').resultado).toBe('mejorable');
    expect(por(visto, 'privacidad.politica').resultado).toBe('correcto');
    expect(por(visto, 'privacidad.consentimiento').resultado).toBe('no-aplica');
  });

  it('sin cuerpo (no es HTML) todo es no aplica', () => {
    const hs = comprobarPrivacidad(sitio({ https: bien(respuesta({ cuerpo: null, estadoCuerpo: 'omitido' })) }));
    expect(hs.every((x) => x.resultado === 'no-aplica')).toBe(true);
  });
});
