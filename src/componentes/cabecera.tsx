import Link from 'next/link';
import { AUTOR } from '@/config/autor';
import { IconoMarca } from '@/lib/icono-marca';

export function Cabecera() {
  return (
    <header className="cabecera">
      <Link className="marca-web" href="/">
        <span className="marca-web__icono" aria-hidden="true">
          <IconoMarca tamano={28} />
        </span>
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
