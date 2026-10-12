export type EstadoPaso = 'espera' | 'curso' | 'hecho' | 'fallo';

export interface PasosAnalisis {
  https: EstadoPaso;
  http: EstadoPaso;
  evaluar: EstadoPaso;
}

const PASOS: { id: keyof PasosAnalisis; texto: Record<EstadoPaso, string> }[] = [
  {
    id: 'https',
    texto: {
      espera: 'Abrir tu web con conexión cifrada',
      curso: 'Abriendo tu web con conexión cifrada…',
      hecho: 'Tu web responde con conexión cifrada',
      fallo: 'No hemos podido abrir tu web con conexión cifrada',
    },
  },
  {
    id: 'http',
    texto: {
      espera: 'Probar la dirección sin cifrar',
      curso: 'Probando la dirección sin cifrar…',
      hecho: 'Hemos visto a dónde lleva la dirección sin cifrar',
      fallo: 'La dirección sin cifrar no responde',
    },
  },
  {
    id: 'evaluar',
    texto: {
      espera: 'Poner nota',
      curso: 'Poniendo nota…',
      hecho: 'Nota puesta',
      fallo: 'No hemos podido poner nota',
    },
  },
];

export function Progreso({ pasos }: { pasos: PasosAnalisis }) {
  return (
    <ol className="progreso">
      {PASOS.map((p) => (
        <li key={p.id} className={`progreso__paso progreso__paso--${pasos[p.id]}`}>
          <span className="progreso__punto" aria-hidden="true" />
          {p.texto[pasos[p.id]]}
        </li>
      ))}
    </ol>
  );
}
