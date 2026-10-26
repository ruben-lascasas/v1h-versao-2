/**
 * Aprovar ou recusar um anúncio — a decisão em si, sem HTTP à volta.
 *
 * PORQUE É QUE ISTO EXISTE
 *
 * Havia um caminho só para decidir: os links no email que o `notify-admin`
 * manda ao administrador. Isso significa que o processo inteiro depende de um
 * email chegar — e em Outubro de 2026 os emails deste marketplace não eram
 * entregues de todo (ver api-util/emailSender). O resultado foi o anúncio de
 * uma cliente invisível durante 13 dias, depois de lhe termos dito que a
 * análise demora menos de 48 horas, sem ninguém dar por nada.
 *
 * Com o painel de administração a poder decidir também, a decisão passa a ter
 * dois caminhos. Para os dois não divergirem — e divergiriam, porque um
 * esquecer-se de limpar `listingPending` ou de avisar o anfitrião é o tipo de
 * diferença que só se descobre meses depois — a decisão vive aqui, num sítio
 * só, e os dois caminhos chamam-na.
 *
 * O QUE CADA DECISÃO FAZ
 *
 * Aprovar: `listings.open()` (o anúncio estava fechado de propósito desde que
 * foi publicado) e limpa `listingPending`.
 *
 * Recusar: deixa-o fechado e marca `listingRejected`, limpando `listingPending`
 * — deixa de estar à espera, passa a precisar de alterações.
 *
 * Em ambos os casos o anfitrião é avisado por email. O aviso é disparado sem
 * `await` de propósito: se o email falhar, a decisão já está tomada e não se
 * desfaz por causa disso. A falha fica nos registos.
 */

const { listingApproved, listingRejected } = require('./listingEmails');

/**
 * @param {Object} args
 * @param {Object} args.sdk Integration SDK
 * @param {string} args.listingId
 * @param {'approve'|'reject'} args.action
 * @param {string} [args.reason] motivo, só para a recusa
 * @param {string} [args.origem] de onde veio a decisão, para os registos
 * @returns {Promise<{ok: true, action: string}>}
 */
const aplicarDecisao = async ({ sdk, listingId, action, reason = null, origem = 'email' }) => {
  if (!sdk) throw new Error('integration-sdk-not-configured');
  if (!listingId) throw new Error('listingId-required');
  if (action !== 'approve' && action !== 'reject') throw new Error('invalid-action');

  if (action === 'approve') {
    await sdk.listings.open({ id: listingId });
    await sdk.listings.update({ id: listingId, publicData: { listingPending: null } });
    console.log(`[aprovacao:${origem}] aprovado → ${listingId}`);
    listingApproved({ sdk, listingId }).catch(e =>
      console.error(`[aprovacao:${origem}] aviso ao anfitrião falhou:`, e?.message || e)
    );
    return { ok: true, action };
  }

  await sdk.listings.update({
    id: listingId,
    publicData: { listingRejected: true, listingPending: null },
  });
  console.log(`[aprovacao:${origem}] recusado → ${listingId}`);
  listingRejected({ sdk, listingId, reason }).catch(e =>
    console.error(`[aprovacao:${origem}] aviso ao anfitrião falhou:`, e?.message || e)
  );
  return { ok: true, action };
};

module.exports = { aplicarDecisao };
