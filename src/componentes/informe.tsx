'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Informe } from '@/lib/analisis/analizar';
import type { Categoria, Hallazgo, Resultado } from '@/lib/analisis/tipos';
import { primeraFrase } from '@/lib/frases';
import { colorDeLetra } from '@/lib/notas';
import { ordenarPorUrgencia, sePuedeArreglar, simular } from '@/lib/simulacion';
import { CATEGORIAS, GRAVEDAD, VEREDICTO, textoDeAviso, textoDeHallazgo, textoDeTecho } from '@/lib/textos/es';
import { Anillo } from './anillo';
import { IconoEstado } from './icono-estado';
import { Radar } from './radar';
import { Recorrido } from './recorrido';

interface Props {
  informe: Informe;
  arreglados: ReadonlySet<string>;
  alAlternar: (id: string) => void;
  alMarcarVarios: (ids: string[]) => void;
  alLimpiar: () => void;
}

const ORDEN_RESULTADO: Record<Resultado, number> = { fallo: 0, mejorable: 1, correcto: 2, 'no-aplica': 3 };

function CasillaSimula({ hallazgo, marcado, alternar }: { hallazgo: Hallazgo; marcado: boolean; alternar: (id: string) => void }) {
  const nombre = textoDeHallazgo(hallazgo).titulo;
  return (
    <label className="simula">
      <input
        className="simula__casilla"
        type="checkbox"
        checked={marcado}
        onChange={() => alternar(hallazgo.id)}
        aria-label={`Ver qué pasaría si arreglo: ${nombre}`}
      />
      Lo arreglaría
    </label>
  );
}

function BotonCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="codigo__copiar"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          window.setTimeout(() => setCopiado(false), 2000);
        } catch {
          // Sin permiso para el portapapeles: el texto sigue ahí para seleccionarlo.
        }
      }}
    >
      {copiado ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function Fila({
  hallazgo,
  marcado,
  alternar,
  conCasilla,
}: {
  hallazgo: Hallazgo;
  marcado: boolean;
  alternar: (id: string) => void;
  conCasilla: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const idDetalle = useId();
  const texto = textoDeHallazgo(hallazgo);
  const arreglable = sePuedeArreglar(hallazgo) && conCasilla;

  return (
    <li className="fila">
      <div className="fila__cabecera">
        <IconoEstado resultado={hallazgo.resultado} />
        <button type="button" className="fila__titulo" aria-expanded={abierta} aria-controls={idDetalle} onClick={() => setAbierta((a) => !a)}>
          <span className="fila__nombre">{texto.titulo}</span>
          <span className="fila__resumen">{primeraFrase(texto.explicacion)}</span>
        </button>
        {hallazgo.resultado !== 'correcto' && hallazgo.resultado !== 'no-aplica' && hallazgo.peso > 0 && (
          <span className="fila__gravedad">{GRAVEDAD[hallazgo.gravedad]}</span>
        )}
        {arreglable && <CasillaSimula hallazgo={hallazgo} marcado={marcado} alternar={alternar} />}
      </div>
      {abierta && (
        <div className="fila__detalle" id={idDetalle}>
          <p>{texto.explicacion}</p>
          {texto.arreglo && (
            <div>
              <h4>Cómo se arregla</h4>
              <p>{texto.arreglo}</p>
            </div>
          )}
          {texto.codigo && (
            <pre className="codigo">
              <BotonCopiar texto={texto.codigo} />
              {texto.codigo}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

export function InformeVisual({ informe, arreglados, alAlternar, alMarcarVarios, alLimpiar }: Props) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const { nota, hallazgos } = informe;
  const veredicto = VEREDICTO[nota.letra];

  // Al llegar el resultado, el foco va al titular: lo anuncian los lectores de pantalla y la vista se desplaza.
  useEffect(() => {
    titulo.current?.focus();
  }, [informe]);

  const simulada = useMemo(() => simular(hallazgos, arreglados), [hallazgos, arreglados]);
  const urgentes = useMemo(() => ordenarPorUrgencia(hallazgos).slice(0, 3), [hallazgos]);
  const ganancia = (h: Hallazgo) => simular(hallazgos, new Set([h.id])).puntos - nota.puntos;

  const grupos = (Object.keys(CATEGORIAS) as Categoria[])
    .map((id) => ({
      id,
      filas: hallazgos.filter((h) => h.categoria === id).sort((a, b) => ORDEN_RESULTADO[a.resultado] - ORDEN_RESULTADO[b.resultado]),
      puntos: nota.categorias.find((c) => c.id === id)?.puntos ?? null,
    }))
    .filter((g) => g.filas.length > 0);

  const hayCambio = arreglados.size > 0;
  const idsUrgentes = new Set(urgentes.map((h) => h.id));
  const notaAlta = nota.letra === 'A+' || nota.letra === 'A';

  return (
    <div className="informe">
      <section className="panel-nota" aria-labelledby="titulo-informe">
        <Anillo letra={nota.letra} puntos={nota.puntos} />
        <div>
          <h2 id="titulo-informe" className="panel-nota__titulo" tabIndex={-1} ref={titulo}>
            {veredicto.titulo}
          </h2>
          <p className="panel-nota__host">{informe.objetivo.host}</p>
          <p className="panel-nota__texto">{veredicto.texto}</p>
          {nota.techo && <p className="panel-nota__techo">{textoDeTecho(nota.techo.id, nota.techo.letra)}</p>}
          <div className="zona-categorias">
            <div className="categorias">
              {nota.categorias.map((c) => (
                <div key={c.id}>
                  <div className="categoria__cabecera">
                    <span>{CATEGORIAS[c.id].nombre}</span>
                    <span className="categoria__valor">{c.puntos === null ? '—' : `${c.puntos}/100`}</span>
                  </div>
                  <div className="categoria__pista" aria-hidden="true">
                    <div className="categoria__relleno" style={{ width: `${c.puntos ?? 0}%`, background: colorDeLetra(nota.letra) }} />
                  </div>
                  <p className="categoria__descripcion">{CATEGORIAS[c.id].descripcion}</p>
                </div>
              ))}
            </div>
            <Radar categorias={nota.categorias} color={colorDeLetra(nota.letra)} />
          </div>
        </div>
      </section>

      {informe.avisos.length > 0 && (
        <div className="avisos">
          {informe.avisos.map((a) => (
            <p className="aviso" key={a.id}>
              {textoDeAviso(a)}
            </p>
          ))}
        </div>
      )}

      <section aria-labelledby="titulo-recorrido">
        <h2 id="titulo-recorrido" className="seccion__titulo">
          El recorrido de tu web
        </h2>
        <p className="seccion__texto">
          Esto es lo que pasa desde que alguien escribe tu dirección hasta que se guardan sus cookies. Cambia según marques «Lo arreglaría».
        </p>
        <Recorrido hallazgos={hallazgos} arreglados={arreglados} />
      </section>

      <section aria-labelledby="titulo-urgente">
        <h2 id="titulo-urgente" className="seccion__titulo">
          {urgentes.length === 0 ? 'No hay nada urgente' : notaAlta ? 'Lo único que falta' : 'Empieza por esto'}
        </h2>
        {urgentes.length > 0 ? (
          <>
            <p className="seccion__texto">
              {notaAlta
                ? 'Tu web ya está muy bien. Esto es lo que queda para llegar al 100. Marca «Lo arreglaría» y mira cómo cambia la nota.'
                : 'Son las mejoras que más suben la nota. Marca «Lo arreglaría» y mira cómo cambia la escala.'}
            </p>
            <ol className="urgentes">
              {urgentes.map((h) => {
                const texto = textoDeHallazgo(h);
                const quitaTecho = h.resultado === 'fallo' && h.techo !== undefined;
                const subida = ganancia(h);
                return (
                  <li className="urgente" key={h.id}>
                    <div>
                      <p className="urgente__titulo">{texto.titulo}</p>
                      {(quitaTecho || subida > 0) && (
                        <p className="urgente__beneficio">
                          {quitaTecho ? 'Quita el tope de nota' : ''}
                          {quitaTecho && subida > 0 ? ' y suma ' : subida > 0 ? 'Suma ' : ''}
                          {subida > 0 ? `${subida} ${subida === 1 ? 'punto' : 'puntos'}` : ''}
                        </p>
                      )}
                      <p className="urgente__texto">{primeraFrase(texto.explicacion)}</p>
                    </div>
                    <CasillaSimula hallazgo={h} marcado={arreglados.has(h.id)} alternar={alAlternar} />
                  </li>
                );
              })}
            </ol>
            {!hayCambio && urgentes.length > 1 && (
              <p className="simula-todo">
                <button type="button" className="boton boton--discreto" onClick={() => alMarcarVarios(urgentes.map((h) => h.id))}>
                  Ver qué pasa si arreglo las {urgentes.length} primeras
                </button>
              </p>
            )}
          </>
        ) : (
          <p className="todo-bien">Todo lo que hemos comprobado está en orden.</p>
        )}
      </section>

      <section aria-labelledby="titulo-todo">
        <h2 id="titulo-todo" className="seccion__titulo">
          Todo lo que hemos revisado
        </h2>
        <p className="seccion__texto">Pulsa en cualquiera para ver qué significa y cómo se arregla.{urgentes.length > 0 && ' Lo que ya aparece arriba se marca allí.'}</p>
        {grupos.map((g) => (
          <div className="grupo" key={g.id}>
            <h3 className="grupo__titulo">
              {CATEGORIAS[g.id].nombre}
              <span className="grupo__puntos">{g.puntos === null ? 'Sin puntuar' : `${g.puntos} de 100`}</span>
            </h3>
            <ul className="filas">
              {g.filas.map((h) => (
                <Fila key={h.id} hallazgo={h} marcado={arreglados.has(h.id)} alternar={alAlternar} conCasilla={!idsUrgentes.has(h.id)} />
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="contrata" aria-labelledby="titulo-contrata">
        <div>
          <h2 id="titulo-contrata" className="contrata__titulo">
            ¿Te lo arreglo?
          </h2>
          <p className="contrata__texto">
            Si estas mejoras te suenan a chino, no hace falta que lo entiendas: las dejo hechas en tu web y te explico qué he cambiado.
          </p>
        </div>
        <a
          className="boton boton--enlace"
          href={`mailto:soypacodev@gmail.com?subject=${encodeURIComponent(`Revisión de seguridad de ${informe.objetivo.host}`)}&body=${encodeURIComponent(`Hola Paco, he analizado ${informe.objetivo.host} y ha sacado un ${nota.letra} (${nota.puntos}/100). Me gustaría que me ayudaras a mejorarlo.`)}`}
        >
          Quiero que me lo arregles
        </a>
      </section>

      {hayCambio && (
        <div className="barra-simulador" role="status">
          <div className="barra-simulador__cambio">
            <span className="letra-chip" data-nota={nota.letra} aria-label={`Ahora ${nota.letra}`}>{nota.letra}</span>
            <svg className="barra-simulador__flecha" viewBox="0 0 28 14" aria-hidden="true">
              <path d="M0 7h24M18 1l8 6-8 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="letra-chip" data-nota={simulada.letra} aria-label={`Con tus arreglos ${simulada.letra}`}>{simulada.letra}</span>
            <span>
              {nota.puntos} a {simulada.puntos} puntos
              <span className="barra-simulador__texto">
                {arreglados.size === 1 ? '1 arreglo marcado' : `${arreglados.size} arreglos marcados`}. Es una estimación.
              </span>
            </span>
          </div>
          <button type="button" className="boton boton--claro" onClick={alLimpiar}>
            Quitar marcas
          </button>
        </div>
      )}
    </div>
  );
}
