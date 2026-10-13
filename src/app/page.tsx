import { Analizador } from '@/componentes/analizador';
import { Cabecera, Pie } from '@/componentes/cabecera';

export default function Portada() {
  return (
    <>
      <Cabecera />
      <main id="contenido">
        <Analizador />
      </main>
      <Pie />
    </>
  );
}
