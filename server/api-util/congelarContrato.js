/**
 * Prender as versões dos documentos a uma reserva, no momento em que ela nasce.
 *
 * PORQUE É QUE ISTO EXISTE À PARTE
 *
 * O congelamento estava a acontecer na primeira vez que alguém abria o
 * contrato. Funcionava, mas estava errado: se ninguém o abrisse durante
 * semanas e entretanto saísse uma versão nova de um documento, ficava presa a
 * versão de quando se abriu — e não a de quando se reservou. O contrato passava
 * a citar um texto que não estava em vigor no momento em que as partes se
 * vincularam.
 *
 * Agora prende-se nos dois sítios onde uma reserva se forma — a criação e as
 * transições privilegiadas — e o `congelar` é idempotente, por isso o primeiro
 * a chegar é o que manda. A abertura do contrato continua a chamá-lo como
 * última rede de segurança, para reservas anteriores a esta mudança.
 *
 * FIRE-AND-FORGET, DE PROPÓSITO
 *
 * Falhar a prender as versões não pode fazer falhar uma reserva. O cliente
 * acabou de pagar; recusar-lhe a reserva porque não se conseguiu escrever
 * metadata seria absurdo. Fica o erro no log, e a abertura do contrato volta a
 * tentar.
 */

const { getIntegrationSdk } = require('./sdk');
const { congelar, ponteiroDe } = require('./bookingContract');

/**
 * @param {Object} data corpo `data` da resposta da API, como vem do SDK
 */
const prenderVersoes = async data => {
  const transaction = data?.data;
  const txId = transaction?.id?.uuid;
  if (!txId) return null;
  if (ponteiroDe(transaction)) return null;

  const sdk = getIntegrationSdk();
  if (!sdk) return null;

  const { congelado, ponteiro } = await congelar(sdk, transaction);
  if (congelado) {
    console.log(`[contrato] versões presas à reserva ${txId}: ${Object.keys(ponteiro.versoes).length} documentos`);
  }
  return ponteiro;
};

/** Versão que nunca lança — para usar a seguir a uma transição bem sucedida. */
const prenderVersoesSemFalhar = data =>
  prenderVersoes(data).catch(e =>
    console.error('[contrato] não foi possível prender as versões:', e?.message || e)
  );

module.exports = { prenderVersoes, prenderVersoesSemFalhar };
