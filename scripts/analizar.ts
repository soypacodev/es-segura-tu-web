// Analiza una web desde la terminal, sin interfaz:
//
//   npm run analizar -- ejemplo.com
//   npm run analizar -- ejemplo.com --json
//
// Sirve para probar el motor y para ver el informe en bruto. Los textos
// de verdad (en español e inglés) se redactan en la interfaz; aquí se
// muestran los identificadores de cada hallazgo.

import { analizarSitio, type Informe } from '@/lib/analisis/analizar';
import { descargadorSeguro } from '@/lib/analisis/descarga';
import { resolvedorReal } from '@/lib/analisis/dns';

const MARCAS = { correcto: '✔ correcto ', mejorable: '~ mejorable', fallo: '✖ fallo    ', 'no-aplica': '· no aplica' } as const;

function mostrar(informe: Informe) {
  const { nota } = informe;
  console.log(`\nNota: ${nota.letra}  (${nota.puntos}/100)   ${informe.objetivo.url}`);
  for (const categoria of nota.categorias) {
    console.log(`  ${categoria.id.padEnd(10)} ${categoria.puntos ?? '—'}`);
  }
  if (nota.techo) console.log(`\n  La nota está limitada a ${nota.techo.letra} por: ${nota.techo.id}`);

  console.log('');
  for (const h of informe.hallazgos) {
    const datos = h.datos ? `  ${JSON.stringify(h.datos)}` : '';
    const gravedad = h.resultado === 'correcto' || h.resultado === 'no-aplica' ? '' : ` [${h.gravedad}]`;
    console.log(`  ${MARCAS[h.resultado]} ${h.id}${gravedad}${datos}`);
  }

  if (informe.avisos.length > 0) {
    console.log('\nAvisos sobre el análisis:');
    for (const aviso of informe.avisos) console.log(`  - ${aviso.id}${aviso.datos ? `  ${JSON.stringify(aviso.datos)}` : ''}`);
  }
  console.log(`\nTardó ${informe.duracionMs} ms.`);
}

async function principal() {
  const [, , direccion, opcion] = process.argv;
  if (!direccion || direccion.startsWith('-') || (opcion !== undefined && opcion !== '--json')) {
    console.error('Uso: npm run analizar -- <dirección> [--json]');
    process.exit(2);
  }

  const resultado = await analizarSitio(direccion, { descargador: descargadorSeguro, resolvedor: resolvedorReal() });
  if (!resultado.ok) {
    console.error(`\nNo se puede analizar: ${JSON.stringify(resultado.error)}`);
    process.exit(1);
  }
  if (opcion === '--json') console.log(JSON.stringify(resultado.informe, null, 2));
  else mostrar(resultado.informe);
}

principal().catch((causa) => {
  console.error(causa);
  process.exit(1);
});
