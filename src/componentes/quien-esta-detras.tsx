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
        </ul>
        {AUTOR.enlaces.length > 0 && (
          <>
            <h3 className="autor__subtitulo">Otros proyectos</h3>
            <ul className="autor__proyectos">
              {AUTOR.enlaces.map((e) => (
                <li key={e.url}>
                  <a href={e.url} target="_blank" rel="noopener noreferrer">
                    {e.nombre}
                  </a>
                  <span>{e.descripcion}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
