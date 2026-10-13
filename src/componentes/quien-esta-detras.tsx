import { AUTOR, INICIALES_AUTOR, enlaceCorreo } from '@/config/autor';

/** Tarjeta con quién hizo la herramienta y cómo contactar. Sin estado: sirve en servidor y en cliente. */
export function QuienEstaDetras({ asunto = 'Consulta desde «¿Es segura tu web?»' }: { asunto?: string }) {
  return (
    <section className="autor" aria-labelledby="titulo-autor">
      <div className="autor__avatar" aria-hidden="true">
        {INICIALES_AUTOR}
      </div>
      <div className="autor__cuerpo">
        <h2 id="titulo-autor" className="autor__titulo">
          Quién está detrás
        </h2>
        <p className="autor__nombre">
          {AUTOR.nombre} <span>· {AUTOR.titular}</span>
        </p>
        <p className="autor__texto">{AUTOR.descripcion}</p>
        <ul className="autor__enlaces">
          <li>
            <a href={enlaceCorreo(asunto)}>{AUTOR.correo}</a>
          </li>
          <li>
            <a href={AUTOR.github} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </li>
          {AUTOR.enlaces.map((e) => (
            <li key={e.url}>
              <a href={e.url} target="_blank" rel="noopener noreferrer" title={e.descripcion}>
                {e.nombre}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
