/**
 * O contrato de uma reserva.
 *
 *   GET /api/booking-contract/:id
 *
 * Devolve os blocos do contrato já preenchidos com os dados reais da reserva.
 * Só as duas partes o veem — um contrato entre duas pessoas não é público.
 */

const { getSdk, getIntegrationSdk } = require('../api-util/sdk');
const modelo = require('../../src/containers/LegalPage/documentos/contrato-de-reserva.json');
const {
  congelar,
  ponteiroDe,
  valores,
  preencherBlocos,
} = require('../api-util/bookingContract');

const quemChama = async (req, res) => {
  try {
    const sdk = getSdk(req, res);
    const r = await sdk.currentUser.show();
    const u = r?.data?.data;
    return u?.id?.uuid ? u : null;
  } catch (_) {
    return null;
  }
};

const contrato = async (req, res) => {
  try {
    const caller = await quemChama(req, res);
    if (!caller) return res.status(401).json({ error: 'not-authenticated' });

    const txId = req.params.id;
    if (!txId) return res.status(400).json({ error: 'sem-id' });

    const sdk = getIntegrationSdk();
    if (!sdk) return res.status(500).json({ error: 'integration-sdk-not-configured' });

    const resposta = await sdk.transactions.show({
      id: txId,
      include: ['customer', 'provider', 'listing', 'booking'],
    });
    const transaction = resposta?.data?.data;
    if (!transaction) return res.status(404).json({ error: 'reserva-nao-encontrada' });

    const incluidos = resposta.data.included || [];
    const idDe = papel => transaction.relationships?.[papel]?.data?.id?.uuid;
    const clienteId = idDe('customer');
    const anfitriaoId = idDe('provider');

    // Um contrato entre duas pessoas não é público. Sem esta verificação,
    // qualquer sessão iniciada lia o contrato de qualquer reserva — com os
    // nomes, moradas, NIF e preço lá dentro.
    const meu = caller.id.uuid;
    if (meu !== clienteId && meu !== anfitriaoId) {
      return res.status(403).json({ error: 'nao-e-parte-desta-reserva' });
    }

    const acharUser = id => incluidos.find(r => r.type === 'user' && r.id?.uuid === id) || null;
    const listing = incluidos.find(r => r.type === 'listing') || null;

    // As versões prendem-se à reserva na primeira vez que o contrato é pedido.
    // O ideal seria no momento em que a reserva se forma; sendo idempotente,
    // isto garante que fica preso o mais cedo possível de qualquer forma.
    const { ponteiro } = await congelar(sdk, transaction);

    const mapa = valores({
      transaction,
      listing,
      booking: incluidos.find(r => r.type === 'booking') || null,
      host: acharUser(anfitriaoId),
      guest: acharUser(clienteId),
      ponteiro: ponteiro || ponteiroDe(transaction),
    });

    return res.json({
      titulo: modelo.titulo,
      versao: (ponteiro && ponteiro.versoes?.['contrato-de-reserva']) || modelo.versao,
      congeladoEm: ponteiro ? ponteiro.em : null,
      papel: meu === clienteId ? 'cliente' : 'anfitriao',
      blocos: preencherBlocos(modelo.blocos, mapa),
    });
  } catch (e) {
    console.error('[contrato] falha a gerar:', e?.message || e);
    return res.status(500).json({ error: 'internal-error' });
  }
};

module.exports = { contrato };
