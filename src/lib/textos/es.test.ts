import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analizarSitio } from '../analisis/analizar';
import { AHORA, HTTP_REDIRIGE, bien, respuesta } from '../analisis/pruebas/construir';
import type { Resultado } from '../analisis/tipos';
import { ERRORES_ANALISIS, IDS_AVISO, TEXTOS, textoDeAviso, textoDeHallazgo } from './es';

const CARPETA = join(__dirname, '../analisis');

/** Todos los identificadores que aparecen escritos en el motor. */
function idsDelMotor(archivos: string[], patron: RegExp): string[] {
  const ids = new Set<string>();
  for (const archivo of archivos) for (const m of readFileSync(archivo, 'utf8').matchAll(patron)) ids.add(m[1]);
  return [...ids].sort();
}

const comprobaciones = readdirSync(join(CARPETA, 'comprobaciones'))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => join(CARPETA, 'comprobaciones', f));

describe('textos en español', () => {
  const ids = idsDelMotor(comprobaciones, /'((?:https|cabeceras|cookies|tecnologias|privacidad)\.[a-z]+(?:\.[a-z]+)*)'/g);

  it('el motor emite hallazgos (la búsqueda de identificadores funciona)', () => {
    expect(ids.length).toBeGreaterThanOrEqual(22);
  });

  it('hay texto para cada identificador que el motor puede emitir, y ninguno de sobra', () => {
    expect(Object.keys(TEXTOS).sort()).toEqual(ids);
  });

  /** Hallazgos que solo pueden salir bien o no aplicar: no hay nada que arreglar. */
  const SOLO_BIEN = new Set(['cookies.ninguna']);

  it.each(Object.keys(TEXTOS).filter((id) => !SOLO_BIEN.has(id)))('%s tiene explicación en cada resultado posible', (id) => {
    for (const resultado of ['correcto', 'mejorable', 'fallo'] as Resultado[]) {
      const t = textoDeHallazgo({ id, resultado });
      expect(t.titulo.length, `${id}/${resultado} título`).toBeGreaterThan(5);
      expect(t.explicacion.length, `${id}/${resultado} explicación`).toBeGreaterThan(20);
    }
    // Si hay que arreglar algo, se dice cómo; si está bien, no.
    expect(textoDeHallazgo({ id, resultado: 'fallo' }).arreglo).toBeTruthy();
    expect(textoDeHallazgo({ id, resultado: 'correcto' }).arreglo).toBeNull();
  });

  it('lo que solo puede salir bien tiene su texto', () => {
    expect(textoDeHallazgo({ id: 'cookies.ninguna', resultado: 'correcto' }).explicacion.length).toBeGreaterThan(20);
  });

  it('los «no aplica» que el motor emite tienen texto', () => {
    for (const id of [
      'https.certificado.caducidad',
      'https.tls.version',
      'https.hsts.subdominios',
      'https.hsts.precarga',
      'cookies.ninguna',
      'cookies.secure',
      'cookies.httponly',
      'cookies.samesite',
      'tecnologias.php',
      'tecnologias.generador',
    ]) {
      expect(textoDeHallazgo({ id, resultado: 'no-aplica' }).explicacion.length).toBeGreaterThan(10);
    }
  });

  it('los textos con datos los usan', () => {
    expect(textoDeHallazgo({ id: 'https.certificado.caducidad', resultado: 'mejorable', datos: { dias: 12 } }).explicacion).toContain('12 días');
    expect(textoDeHallazgo({ id: 'https.hsts', resultado: 'correcto', datos: { maxAge: 31_536_000 } }).explicacion).toContain('365 días');
    expect(textoDeHallazgo({ id: 'https.certificado.valido', resultado: 'fallo', datos: { motivo: 'caducado' } }).explicacion).toContain('caducado');
  });

  it('un identificador desconocido no rompe nada', () => {
    expect(textoDeHallazgo({ id: 'otra.cosa', resultado: 'fallo' })).toEqual({ titulo: 'otra.cosa', explicacion: '', arreglo: null, codigo: null });
  });

  it('hay texto para cada aviso y cada error del análisis', () => {
    const avisos = idsDelMotor([join(CARPETA, 'analizar.ts')], /id: '([a-z]+\.[a-z-]+)'/g);
    expect(avisos.sort()).toEqual([...IDS_AVISO].sort());
    for (const id of IDS_AVISO) expect(textoDeAviso({ id }).length).toBeGreaterThan(10);
    expect(Object.keys(ERRORES_ANALISIS).sort()).toEqual(['destino-no-permitido', 'no-existe', 'sin-respuesta']);
  });

  it('un análisis completo produce solo identificadores con texto', async () => {
    const r = await analizarSitio('ejemplo.com', {
      descargador: async (url) => (url.protocol === 'https:' ? bien(respuesta({ cabeceras: {} })) : HTTP_REDIRIGE),
      ahora: () => AHORA,
    });
    if (!r.ok) throw new Error('se esperaba informe');
    for (const h of r.informe.hallazgos) expect(TEXTOS[h.id], h.id).toBeDefined();
  });
});
