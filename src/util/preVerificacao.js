/**
 * Anúncios publicados por quem ainda não está verificado.
 *
 * O QUE MUDOU
 *
 * Publicar deixou de exigir documentos. Qualquer anunciante pode pôr o espaço
 * no ar; o que a verificação decide agora é se esse espaço pode **receber** —
 * reservas e contactos. Até lá o anúncio existe, aparece nas pesquisas e pode
 * ser guardado nos favoritos, e é essa procura visível que dá ao anfitrião a
 * razão para acabar o processo.
 *
 * ONDE ESTÁ A REGRA A SÉRIO
 *
 * Aqui não. Isto serve para o ecrã não oferecer o que não pode dar. A recusa
 * verdadeira está em `server/api/initiate-privileged.js`, que não cria a
 * transação. Esconder um botão nunca é um portão.
 *
 * QUANDO A MARCA NÃO EXISTE
 *
 * `podeReceberReservas` é escrita pelo servidor na primeira sincronização da
 * conta. Enquanto não existir, trata-se o anfitrião como verificado — e não ao
 * contrário. As contas que já publicaram foram verificadas ao abrigo da regra
 * antiga e nunca tiveram esta marca; assumir o pior faria desaparecer o painel
 * de reserva dos anúncios que hoje funcionam. O servidor usa o mesmo critério,
 * e lá, quando a marca falta, vai confirmar à fonte.
 */

/**
 * Os metadados públicos do autor de um anúncio.
 *
 * @param {Object} listing anúncio com o autor incluído (denormalizado)
 * @returns {Object}
 */
const metadadosDoAutor = listing => listing?.author?.attributes?.profile?.metadata || {};

/**
 * Este anúncio está à espera que o anfitrião se verifique?
 *
 * @param {Object} listing
 * @returns {boolean}
 */
export const emPreVerificacao = listing => metadadosDoAutor(listing).podeReceberReservas === false;

/**
 * É o próprio anfitrião a olhar para o seu anúncio por verificar?
 *
 * Serve para lhe dizer o que lhe falta fazer, em vez da mensagem que se mostra
 * a quem chega de fora — que não tem nada a tratar.
 *
 * @param {Object} listing
 * @param {Object} currentUser
 * @returns {boolean}
 */
export const ehOMeuAnuncioPorVerificar = (listing, currentUser) => {
  const autorId = listing?.author?.id?.uuid;
  const euId = currentUser?.id?.uuid;
  return emPreVerificacao(listing) && !!autorId && autorId === euId;
};
