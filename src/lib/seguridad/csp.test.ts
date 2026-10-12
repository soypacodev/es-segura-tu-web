import { describe, expect, it } from 'vitest';
import { politicaSeguridad } from './csp';

describe('politicaSeguridad', () => {
  const produccion = politicaSeguridad('abc123', false, true);

  it('incluye el nonce y strict-dynamic en scripts', () => {
    expect(produccion).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  });
  it('en producción no permite eval ni inline en scripts', () => {
    expect(produccion).not.toContain('unsafe-eval');
    expect(produccion).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(produccion).not.toMatch(/style-src 'self'[^;]*unsafe-inline/);
  });
  it('prohíbe marcos, objetos y base ajena', () => {
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "default-src 'self'"]) expect(produccion).toContain(d);
  });
  it('solo sube a https si se pide', () => {
    expect(produccion).toContain('upgrade-insecure-requests');
    expect(politicaSeguridad('x', false, false)).not.toContain('upgrade-insecure-requests');
  });
  it('en desarrollo permite eval (recarga en caliente)', () => {
    expect(politicaSeguridad('x', true, false)).toContain("'unsafe-eval'");
  });
});
