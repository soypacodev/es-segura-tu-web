'use client';

import { Cabecera, Pie } from '@/componentes/cabecera';

/** Si algo se rompe al pintar la página, se dice con claridad y se deja volver a intentar. */
export default function ErrorDePagina({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <Cabecera />
      <main id="contenido">
        <div className="contenedor">
          <h1 className="portada__titulo">Algo ha fallado</h1>
          <p className="portada__texto">No es culpa de tu web ni de la dirección que has escrito. Vuelve a intentarlo en unos segundos.</p>
          <button className="boton boton--enlace" type="button" onClick={reset}>
            Volver a intentarlo
          </button>
        </div>
      </main>
      <Pie />
    </>
  );
}
