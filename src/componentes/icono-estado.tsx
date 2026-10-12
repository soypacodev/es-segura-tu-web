import type { Resultado } from '@/lib/analisis/tipos';

export function IconoEstado({ resultado }: { resultado: Resultado }) {
  const etiqueta = { correcto: 'Correcto', mejorable: 'Mejorable', fallo: 'Falla', 'no-aplica': 'No aplica' }[resultado];
  return (
    <svg className="fila__estado" viewBox="0 0 28 28" role="img" aria-label={etiqueta}>
      {resultado === 'correcto' && (
        <>
          <circle cx="14" cy="14" r="13" fill="var(--nota-a)" />
          <path d="M8 14.5l4 4 8-9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {resultado === 'mejorable' && (
        <>
          <path d="M14 2.5L26.5 25H1.5z" fill="var(--nota-c)" stroke="var(--nota-c)" strokeWidth="2" strokeLinejoin="round" />
          <path d="M14 10v7M14 20.2v.1" stroke="#101a33" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
      {resultado === 'fallo' && (
        <>
          <rect x="3" y="3" width="22" height="22" rx="4" transform="rotate(45 14 14)" fill="var(--nota-f)" />
          <path d="M9.5 9.5l9 9M18.5 9.5l-9 9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
      {resultado === 'no-aplica' && (
        <>
          <circle cx="14" cy="14" r="12" fill="none" stroke="var(--tinta-suave)" strokeWidth="2" strokeDasharray="3 3" />
          <path d="M9 14h10" stroke="var(--tinta-suave)" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
