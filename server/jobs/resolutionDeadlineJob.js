/**
 * O prazo de resposta do Centro de Resolução.
 *
 * PORQUE É QUE ISTO EXISTE
 *
 * O caso guardava `prazoResposta`, a página mostrava-o e o email anunciava
 * "tem até <data> para responder" — e não acontecia nada quando a data
 * passava. O caso ficava exactamente como estava: ninguém era avisado, nada
 * subia para análise. Um prazo que ninguém conta não é um prazo; é uma frase.
 *
 * O QUE FAZ, E O QUE NÃO FAZ
 *
 * Faz: passa o caso a "em análise" quando o prazo expira sem resposta, avisa
 * as duas partes de que passou a ser a Venue1Hub a olhar para ele, e avisa o
 * administrador de que há trabalho à espera.
 *
 * Não faz: não decide nada e não move dinheiro. Quem decide é uma pessoa, com
 * fundamentação — a ausência de resposta é um facto a ponderar, não uma
 * sentença contra quem não respondeu. Quem não respondeu continua a poder
 * juntar prova enquanto não houver decisão.
 *
 * Ambiente:
 *   RESOLUTION_DEADLINE_CRON     por omissão "0 7 * * *" (07:00, hora do servidor)
 *   ADMIN_EMAILS                 quem recebe o aviso de caso em análise
 *   DISABLE_RESOLUTION_DEADLINE  'true' salta o agendamento
 */

const cron = require('node-cron');
const { Resend } = require('resend');
const { mailFrom } = require('../api-util/emailSender');
const { getIntegrationSdk } = require('../api-util/sdk');
const { CHAVE, ESTADOS, casoDe, partesDe } = require('../api-util/resolutionCase');
const { avisarPrazoExpirado } = require('../api-util/resolutionEmails');

const PER_PAGE = 100;

/**
 * Quantas páginas se varrem por passagem.
 *
 * A API não deixa filtrar transacções por metadata, por isso não há forma de
 * pedir "as que têm caso aberto" — varre-se e filtra-se aqui. Com o limite
 * atingido, o job avisa em vez de ficar calado: um caso perdido em silêncio é
 * pior do que um log a dizer que a varredura precisa de ser maior.
 */
const MAX_PAGINAS = 10;

const ROOT_URL = () =>
  (process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'https://venue1hub.eu').replace(/\/$/, '');

const destinatariosAdmin = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);

/**
 * O caso passou do prazo sem resposta?
 *
 * Só conta quando ainda está "aberto": um caso respondido, em análise ou já
 * decidido não tem prazo a correr. Sem esta condição, o job voltava a escalar
 * o mesmo caso todos os dias.
 */
const prazoExpirado = (caso, agora = new Date()) => {
  if (!caso || caso.estado !== ESTADOS.ABERTO) return false;
  if (caso.resposta) return false;
  const prazo = Date.parse(caso.prazoResposta);
  if (Number.isNaN(prazo)) return false;
  return agora.getTime() > prazo;
};

/** Marca o caso como à espera da Venue1Hub. */
const escalar = async (sdk, transaction, caso) => {
  const agora = new Date().toISOString();
  const atualizado = {
    ...caso,
    estado: ESTADOS.EM_ANALISE,
    // Fica registado que o prazo passou em vazio. É um facto do processo, e a
    // cronologia é o que dá valor de prova ao dossier.
    cronologia: [
      ...(caso.cronologia || []),
      { em: agora, quem: 'sistema', acto: 'prazo-de-resposta-expirou' },
    ],
  };
  await sdk.transactions.updateMetadata({
    id: transaction.id.uuid,
    metadata: { [CHAVE]: atualizado },
  });
  return atualizado;
};

const avisarAdmin = async escalados => {
  const para = destinatariosAdmin();
  const apiKey = process.env.RESEND_API_KEY;
  if (!para.length || !apiKey || escalados.length === 0) return false;

  const linhas = escalados
    .map(
      e =>
        `<li style="margin-bottom:8px"><a href="${ROOT_URL()}/reserva/${e.txId}/resolucao">${
          e.txId
        }</a> — sem resposta de ${e.respondePor}</li>`
    )
    .join('');

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: mailFrom('Resolução'),
      to: para,
      subject: `${escalados.length} caso(s) à espera de decisão`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#2E2E2E">
        <h1 style="font-size:18px">Prazo de resposta terminado</h1>
        <p>Passaram para análise da Venue1Hub por falta de resposta dentro do prazo:</p>
        <ul style="padding-left:18px">${linhas}</ul>
        <p style="font-size:13px;color:#6b645c">Nenhum valor foi movimentado. A decisão e a eventual devolução são feitas à mão.</p>
      </div>`,
    });
    return true;
  } catch (e) {
    console.error('[resolução-prazo] aviso ao administrador falhou:', e?.message || e);
    return false;
  }
};

const runOnce = async ({ dryRun = false } = {}) => {
  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.error('[resolução-prazo] Integration SDK não configurado');
    return { verificados: 0, escalados: [] };
  }

  const transaccoes = [];
  let truncado = false;
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const res = await sdk.transactions.query({
      page,
      perPage: PER_PAGE,
      include: ['customer', 'provider'],
    });
    const batch = res?.data?.data || [];
    transaccoes.push(...batch);
    const totalPages = res?.data?.meta?.totalPages || 1;
    if (batch.length === 0 || page >= totalPages) break;
    if (page === MAX_PAGINAS) truncado = totalPages > MAX_PAGINAS;
  }
  if (truncado) {
    console.warn(
      `[resolução-prazo] varridas ${MAX_PAGINAS} páginas e há mais — aumentar MAX_PAGINAS`
    );
  }

  const agora = new Date();
  const escalados = [];

  for (const tx of transaccoes) {
    const caso = casoDe(tx);
    if (!prazoExpirado(caso, agora)) continue;

    const txId = tx.id.uuid;
    console.log(
      `[resolução-prazo] ${txId}: prazo expirou sem resposta de ${caso.respondePor}` +
        (dryRun ? ' (simulação)' : '')
    );
    escalados.push({ txId, respondePor: caso.respondePor });
    if (dryRun) continue;

    const atualizado = await escalar(sdk, tx, caso);
    // Os avisos são best-effort: o caso já subiu, e falhar um email não pode
    // desfazer isso nem travar os casos seguintes.
    const partes = partesDe(tx);
    for (const id of [partes.cliente, partes.anfitriao]) {
      if (!id) continue;
      await avisarPrazoExpirado(sdk, { destinatarioId: id, txId, caso: atualizado }).catch(e =>
        console.error('[resolução-prazo] aviso falhou:', e?.message || e)
      );
    }
  }

  if (!dryRun) await avisarAdmin(escalados);
  return { verificados: transaccoes.length, escalados };
};

const start = () => {
  if (process.env.DISABLE_RESOLUTION_DEADLINE === 'true') {
    console.log('[resolução-prazo] desligado por DISABLE_RESOLUTION_DEADLINE');
    return null;
  }
  const expr = process.env.RESOLUTION_DEADLINE_CRON || '0 7 * * *';
  if (!cron.validate(expr)) {
    console.error(`[resolução-prazo] expressão cron inválida: ${expr}`);
    return null;
  }
  console.log(`[resolução-prazo] agendado (${expr})`);
  return cron.schedule(expr, () => {
    runOnce().catch(e => console.error('[resolução-prazo] tick falhou:', e?.message || e));
  });
};

module.exports = { start, runOnce, prazoExpirado, escalar };
