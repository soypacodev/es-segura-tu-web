import { describe, expect, it } from 'vitest';
import { primeraFrase, textoDeEspera } from './frases';

describe('primeraFrase', () => {
  it.each([
    ['Una frase. Otra frase.', 'Una frase.'],
    ['¿Seguro? Sí.', '¿Seguro?'],
    ['¡Cuidado! Mucho.', '¡Cuidado!'],
    ['Sin punto final', 'Sin punto final'],
    ['Termina así.', 'Termina así.'],
    ['Versión 1.2.3 es antigua. Actualiza.', 'Versión 1.2.3 es antigua.'],
    ['', ''],
  ])('%j → %j', (entrada, esperada) => expect(primeraFrase(entrada)).toBe(esperada));

  it('un punto dentro de «…» no corta (lo que dice la web puede traer cualquier cosa)', () => {
    expect(primeraFrase('El servidor se presenta como «nginx. 1.18». Con eso, quien busque fallos sabe cuáles probar.')).toBe(
      'El servidor se presenta como «nginx. 1.18».',
    );
    expect(primeraFrase('Dice «a. b. c. d». Fin.')).toBe('Dice «a. b. c. d». Fin.'.slice(0, 'Dice «a. b. c. d».'.length));
  });
  it('unas comillas sin cerrar no se tragan el resto sin remedio: al final del texto se devuelve todo', () => {
    expect(primeraFrase('Dice «sin cerrar. Y sigue.')).toBe('Dice «sin cerrar. Y sigue.');
  });
  it('un » suelto no rompe la cuenta', () => {
    expect(primeraFrase('Un » suelto. Otra.')).toBe('Un » suelto.');
  });
  it('un texto enorme se recorre una vez', () => {
    const t = performance.now();
    primeraFrase('«'.repeat(1_000_000));
    primeraFrase('a'.repeat(1_000_000));
    expect(performance.now() - t).toBeLessThan(300);
  });
});

describe('textoDeEspera', () => {
  it.each([
    [1, 'en 1 segundo'],
    [15, 'en 15 segundos'],
    [59, 'en 59 segundos'],
    [60, 'en 1 minuto'],
    [61, 'en unos 2 minutos'],
    [3000, 'en unos 50 minutos'],
    [3600, 'en 1 hora'],
    [3601, 'en 2 horas'],
    [0, 'en 1 segundo'],
    [-5, 'en 1 segundo'],
    [Number.NaN, 'en 1 segundo'],
    [Number.POSITIVE_INFINITY, 'en 1 segundo'],
  ])('%s → %s', (s, esperado) => expect(textoDeEspera(s)).toBe(esperado));
});
