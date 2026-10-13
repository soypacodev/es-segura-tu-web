import Link from 'next/link';
import { Cabecera, Pie } from '@/componentes/cabecera';

export const metadata = { title: 'Página no encontrada · ¿Es segura tu web?' };

export default function NoEncontrada() {
  return (
    <>
      <Cabecera />
      <main id="contenido">
        <div className="contenedor">
          <h1 className="portada__titulo">Esta página no existe</h1>
          <p className="portada__texto">La dirección está mal escrita o la página ya no está. Lo que sí puedes hacer es revisar tu web.</p>
          <Link className="boton boton--enlace" href="/">
            Revisar una web
          </Link>
        </div>
      </main>
      <Pie />
    </>
  );
}
