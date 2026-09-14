/**
 * Registo de aceitação dos documentos jurídicos.
 *
 *   GET  /api/legal-acceptance   → o que esta conta aceitou, e o que falta
 *   POST /api/legal-acceptance   → grava a aceitação de um conjunto de documentos
 *
 * A escrita é feita pela Integration API, não pela sessão do utilizador: o
 * registo vive em `profile.metadata` precisamente para que a pessoa a quem ele
 * diz respeito não lhe possa mexer.
 */

const { getSdk, getIntegrationSdk } = require('../api-util/sdk');
const { aceitacoesDe, emFalta, exigidosPara, registar } = require('../api-util/legalAcceptance');

/** Quem está a chamar, a partir do cookie de sessão. */
const quemChama = async (req, res) => {
  try {
    const sdk = getSdk(req, res);
    const response = await sdk.currentUser.show();
    const user = response?.data?.data;
    return user?.id?.uuid ? user : null;
  } catch (_) {
    // Sem sessão, ou expirada. É um 401 para quem chama, não uma avaria — não
    // deixar isto sair como 500.
    return null;
  }
};

/**
 * A conta vista pela Integration API.
 *
 * O `currentUser.show()` não devolve metadata de operador, que é onde o registo
 * vive — por isso é preciso ir buscá-la outra vez por aqui.
 */
const contaCompleta = async userId => {
  const sdk = getIntegrationSdk();
  if (!sdk) throw new Error('integration-sdk-not-configured');
  const res = await sdk.users.show({ id: userId });
  return { sdk, user: res?.data?.data };
};

const estado = async (req, res) => {
  try {
    const caller = await quemChama(req, res);
    if (!caller) return res.status(401).json({ error: 'not-authenticated' });

    const { user } = await contaCompleta(caller.id.uuid);
    const userType = user?.attributes?.profile?.publicData?.userType || null;

    return res.json({
      aceites: aceitacoesDe(user),
      exigidos: exigidosPara(userType),
      emFalta: emFalta(user, userType),
    });
  } catch (e) {
    console.error('[legal] falha a ler as aceitações:', e?.message || e);
    return res.status(500).json({ error: 'internal-error' });
  }
};

const gravar = async (req, res) => {
  try {
    const caller = await quemChama(req, res);
    if (!caller) return res.status(401).json({ error: 'not-authenticated' });

    const { documentos, contexto } = req.body || {};
    const todos = documentos === 'todos';
    if (!todos && (!Array.isArray(documentos) || documentos.length === 0)) {
      return res.status(400).json({ error: 'sem-documentos' });
    }

    const { sdk, user } = await contaCompleta(caller.id.uuid);
    const userType = user?.attributes?.profile?.publicData?.userType || null;

    // Só se grava o que esta conta tem mesmo de aceitar. Sem este filtro,
    // qualquer pedido conseguia semear o registo com slugs à escolha — e um
    // registo de prova em que se pode escrever o que se quiser não é prova.
    //
    // "todos" é o caso do registo: quem marca a caixa aceita o conjunto
    // aplicável ao seu tipo de conta, e é o servidor que sabe qual é — o
    // cliente não tem de saber, nem convém que decida.
    const permitidos = exigidosPara(userType);
    const pedidos = todos ? permitidos : documentos.filter(d => permitidos.includes(d));
    if (pedidos.length === 0) return res.status(400).json({ error: 'documentos-nao-aplicaveis' });

    const resultado = await registar(sdk, user, pedidos, contexto === 're-aceitacao' ? 're-aceitacao' : 'registo');

    console.log(
      `[legal] ${caller.id.uuid} aceitou ${resultado.gravadas.map(g => `${g.slug}@${g.versao}`).join(', ') || '(nada novo)'}`
    );
    return res.json(resultado);
  } catch (e) {
    // Falhar aqui significa ficar sem prova de uma aceitação que aconteceu.
    // Não se inventa o registo mais tarde — grita-se agora.
    console.error('[legal] FALHA A GRAVAR ACEITAÇÃO:', e?.message || e);
    return res.status(500).json({ error: 'internal-error' });
  }
};

module.exports = { estado, gravar };
