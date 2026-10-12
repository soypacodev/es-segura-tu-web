'use client';

import { useId, useState } from 'react';

interface Props {
  ocupado: boolean;
  error: { titulo: string; texto?: string } | null;
  alEnviar: (direccion: string) => void;
}

export function Formulario({ ocupado, error, alEnviar }: Props) {
  const [direccion, setDireccion] = useState('');
  const id = useId();
  const idError = `${id}-error`;

  return (
    <form
      className="formulario"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!ocupado) alEnviar(direccion);
      }}
    >
      <label className="formulario__etiqueta" htmlFor={id}>
        Dirección de tu web
      </label>
      <div className="formulario__fila">
        <input
          id={id}
          className="formulario__campo"
          type="text"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="tuempresa.com"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          maxLength={300}
        />
        <button className="boton" type="submit" disabled={ocupado}>
          {ocupado ? 'Revisando…' : 'Revisar mi web'}
        </button>
      </div>
      {error ? (
        <p className="formulario__error" id={idError} role="alert">
          {error.titulo}
          {error.texto && <span>{error.texto}</span>}
        </p>
      ) : (
        <p className="formulario__nota">Gratis y sin registro. Tarda unos segundos.</p>
      )}
    </form>
  );
}
