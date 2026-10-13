import Link from 'next/link';
import { AUTOR } from '@/config/autor';

export function Cabecera() {
  return (
    <header className="cabecera">
      <Link className="marca-web" href="/">
        <svg className="marca-web__icono" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M3 5h11l3 2.5L14 10H3z" fill="var(--nota-a)" />
          <path d="M3 13.5h17l3 2.5-3 2.5H3z" fill="var(--nota-c)" />
          <path d="M3 22h23l3 2.5-3 2.5H3z" fill="var(--nota-f)" />
        </svg>
        ¿Es segura tu web?
      </Link>
    </header>
  );
}

export function Pie() {
  return (
    <footer className="pie">
      <p>
        Solo miramos lo que ve cualquier visitante de tu web: el certificado, las cabeceras y el código de la página principal, y los registros públicos de su
        dominio. No entramos, no probamos contraseñas y no guardamos nada de tu web: solo se guarda un informe si tú pulsas «Crear enlace para compartir».
      </p>
      <p className="pie__autor">
        Una herramienta gratuita de {AUTOR.nombre}, {AUTOR.titular.toLowerCase()}. <a href={`mailto:${AUTOR.correo}`}>{AUTOR.correo}</a>
        {' · '}
        <a href={AUTOR.github} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        {AUTOR.enlaces.map((e) => (
          <span key={e.url}>
            {' · '}
            <a href={e.url} target="_blank" rel="noopener noreferrer">
              {e.nombre}
            </a>
          </span>
        ))}
      </p>
    </footer>
  );
}
