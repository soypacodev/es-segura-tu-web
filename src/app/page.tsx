import Link from 'next/link';
import { Analizador } from '@/componentes/analizador';

export default function Portada() {
  return (
    <>
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
      <main id="contenido">
        <Analizador />
      </main>
      <footer className="pie">
        <p>
          Solo miramos lo que ve cualquier visitante de tu web: el certificado y las cabeceras de la página principal. No entramos, no
          probamos contraseñas y no guardamos nada de tu web.
        </p>
        <p>Una herramienta gratuita de Paco López.</p>
      </footer>
    </>
  );
}
