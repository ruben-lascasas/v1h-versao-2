/**
 * Validação dos endereços de calendário que o anfitrião escreve.
 *
 * PORQUE É QUE ISTO EXISTE
 *
 * A partir do momento em que um anfitrião pode guardar um endereço, o nosso
 * servidor passa a ir buscar coisas a sítios escolhidos por outra pessoa. Isso
 * é um pedido feito de dentro da nossa rede, com o que isso tem de acesso: os
 * serviços internos, o endereço de metadados do alojamento (169.254.169.254),
 * o que estiver a correr em localhost.
 *
 * Não devolvemos o corpo da resposta a ninguém, mas devolvemos a MENSAGEM DE
 * ERRO — e "o servidor respondeu 200" contra um endereço interno já diz a
 * quem perguntou que ele existe. Por isso filtra-se antes de pedir.
 *
 * O LIMITE DESTA PROTEÇÃO, DITO COM CLAREZA
 *
 * Valida-se o nome e, quando dá, o endereço IP para que ele resolve. Entre
 * essa verificação e o pedido em si o DNS pode mudar de resposta — é a corrida
 * conhecida por DNS rebinding. Fechá-la a sério exige um agente HTTP que
 * valide o IP no momento da ligação. Para o risco que corremos aqui, isto
 * chega; se um dia estes pedidos passarem a sair de uma rede com serviços
 * sensíveis ao lado, isto deixa de chegar.
 */

const dns = require('dns').promises;

const PRIVADOS_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./, // metadados do alojamento
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
];

const ehIpPrivado = ip => {
  const v = String(ip);
  if (v.includes(':')) {
    const b = v.toLowerCase();
    // ::1, fc00::/7 (únicos locais), fe80::/10 (ligação local)
    return b === '::1' || /^f[cd]/.test(b) || /^fe[89ab]/.test(b);
  }
  return PRIVADOS_V4.some(r => r.test(v));
};

const NOMES_PROIBIDOS = [/^localhost$/i, /\.local$/i, /\.internal$/i, /^metadata/i];

/**
 * Serve este endereço para ir buscar um calendário?
 *
 * @param {string} url
 * @param {Object} [opcoes]
 * @param {Function} [opcoes.resolver] para os testes
 * @returns {Promise<{ok: true, url: string} | {ok: false, motivo: string}>}
 */
const validarUrlCalendario = async (url, { resolver = dns.lookup } = {}) => {
  const bruto = String(url || '').trim();
  if (!bruto) return { ok: false, motivo: 'endereço vazio' };

  // Os calendários são muitas vezes copiados com webcal://, que é o mesmo que
  // https:// — vale a pena aceitar em vez de mandar a pessoa corrigir à mão.
  const normalizado = bruto.replace(/^webcal:\/\//i, 'https://');

  let u;
  try {
    u = new URL(normalizado);
  } catch (_) {
    return { ok: false, motivo: 'não é um endereço válido' };
  }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return { ok: false, motivo: 'só se aceitam endereços http ou https' };
  }

  if (NOMES_PROIBIDOS.some(r => r.test(u.hostname))) {
    return { ok: false, motivo: 'esse endereço não é acessível de fora' };
  }

  if (ehIpPrivado(u.hostname.replace(/^\[|\]$/g, ''))) {
    return { ok: false, motivo: 'esse endereço não é acessível de fora' };
  }

  // E para onde é que o nome aponta, de facto.
  try {
    const r = await resolver(u.hostname, { all: true });
    const enderecos = Array.isArray(r) ? r : [r];
    if (enderecos.some(e => ehIpPrivado(e.address))) {
      return { ok: false, motivo: 'esse endereço não é acessível de fora' };
    }
  } catch (_) {
    return { ok: false, motivo: 'não foi possível encontrar esse servidor' };
  }

  return { ok: true, url: u.toString() };
};

module.exports = { validarUrlCalendario, ehIpPrivado };
