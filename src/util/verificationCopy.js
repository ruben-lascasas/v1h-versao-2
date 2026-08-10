/**
 * Textos do estado de verificação de um anunciante, num sítio só.
 *
 * Existem dois lugares que os mostram — o aviso no topo de todas as páginas e a
 * NoAccessPage, para quem tenta publicar sem poder. Estavam escritos à parte, e
 * o resultado foi a NoAccessPage a dizer a um anunciante que precisava de "uma
 * conta de Anunciante", que é o que ele já tem. Com a redação aqui, os dois
 * dizem sempre o mesmo.
 *
 * Os estados são os do servidor (ACCOUNT_STATUS em server/api-util/verification.js).
 */

const t = (isEN, pt, en) => (isEN ? en : pt);

/**
 * Qual é o estado a comunicar.
 *
 * "Recusado" ganha a "em falta": quem tem um documento assinalado precisa de
 * saber que há algo para corrigir, não que há algo para acrescentar.
 *
 * @param {string} status estado global vindo do servidor
 * @param {Array} docs documentos, para distinguir uma recusa isolada
 * @returns {'recusado'|'nao_iniciado'|'pendente'}
 */
export const verificationPhase = (status, docs = []) => {
  const hasRejected = (docs || []).some(d => d.status === 'recusado');
  if (hasRejected || status === 'recusado') return 'recusado';
  if (status === 'nao_iniciado') return 'nao_iniciado';
  return 'pendente';
};

/**
 * Título e corpo para o estado actual.
 *
 * @param {Object} params
 * @param {string} params.status
 * @param {Array} [params.docs]
 * @param {boolean} params.isEN
 * @returns {{heading: string, body: string, action: string}}
 */
export const verificationCopy = ({ status, docs = [], isEN }) => {
  const phase = verificationPhase(status, docs);

  if (phase === 'recusado') {
    return {
      heading: t(isEN, 'Há documentos por corrigir', 'Some documents need fixing'),
      body: t(
        isEN,
        'Reveja os documentos assinalados e volte a submeter apenas esses.',
        'Review the flagged documents and re-submit only those.'
      ),
      action: t(isEN, 'Corrigir documentos', 'Fix documents'),
    };
  }

  if (phase === 'nao_iniciado') {
    return {
      heading: t(isEN, 'Falta verificar a sua conta', 'Your account needs verifying'),
      body: t(
        isEN,
        'Para publicar anúncios, submeta os documentos de verificação. A análise demora até 48 horas.',
        'To publish listings, submit your verification documents. Review takes up to 48 hours.'
      ),
      action: t(isEN, 'Submeter documentos', 'Submit documents'),
    };
  }

  return {
    heading: t(isEN, 'Documentos em análise', 'Documents under review'),
    body: t(
      isEN,
      'Recebemos os seus documentos. A análise demora até 48 horas e avisamos assim que estiver concluída.',
      'We have your documents. Review takes up to 48 hours and we will let you know as soon as it is done.'
    ),
    action: t(isEN, 'Ver os meus documentos', 'View my documents'),
  };
};
