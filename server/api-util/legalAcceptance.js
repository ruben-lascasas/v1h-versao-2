/**
 * Registo de aceitação dos documentos jurídicos.
 *
 * O PORQUÊ
 *
 * Publicar 38 documentos não prova nada. O que se tem de conseguir demonstrar,
 * se um dia alguém contestar, é: **quem** aceitou, **o quê**, **quando** e
 * **qual versão estava em vigor nesse momento**. O guia interno chama-lhe
 * Princípio de Prova; a checklist são os pontos 132 e 133.
 *
 * O QUE NÃO SE FAZ
 *
 * Não se duplicam os documentos por utilizador. Trinta e oito textos vezes cada
 * conta seriam milhares de cópias, e no dia em que o jurista mudasse uma
 * cláusula ninguém saberia quais atualizar e quais congelar. Guarda-se o
 * ponteiro — slug e versão — e o texto continua a ser um só.
 *
 * ONDE FICA
 *
 * Em `profile.metadata`, e não em `privateData`, porque metadata só é escrita
 * pela Integration API. Um registo de aceitação que o próprio utilizador
 * pudesse editar não valia nada como prova.
 *
 * NUNCA SE INVENTA
 *
 * Só se regista o que resultou de um acto concreto — a caixa marcada no registo,
 * a re-aceitação depois de uma alteração. Se a escrita falhar, fica um erro no
 * log e não há registo. Escrever "aceitou" numa passagem posterior seria
 * fabricar prova, que é pior do que não ter nenhuma.
 */

const CATALOGO = require('../../src/config/legalDocuments.json');

/** Onde o registo vive dentro de `profile.metadata`. */
const CHAVE = 'legalAcceptances';

/**
 * Documentos que exigem aceitação expressa, por tipo de conta.
 *
 * Toda a gente aceita os Termos de Serviço e a Política de Privacidade. Depois,
 * consoante o que a conta vai fazer na plataforma, acrescenta-se o documento
 * que regula esse papel — não faz sentido pedir a um visitante que aceite os
 * Termos do Anfitrião.
 */
const EXIGIDOS = {
  base: ['termos-de-servico', 'politica-de-privacidade'],
  anunciante: ['termos-do-anfitriao', 'termos-de-pagamento'],
  prestador_de_servicos: ['prestadores-e-parceiros', 'termos-de-pagamento'],
  visitante: ['termos-do-cliente'],
};

/** Os slugs que este tipo de conta tem de aceitar. */
const exigidosPara = userType => {
  const extra = EXIGIDOS[userType] || [];
  // Set para o caso de um documento aparecer nos dois conjuntos.
  return [...new Set([...EXIGIDOS.base, ...extra])];
};

/** Versão em vigor de um documento, ou null se o slug não existir. */
const versaoEmVigor = slug => {
  const doc = CATALOGO.find(d => d.slug === slug);
  return doc ? doc.versao : null;
};

/** O que esta conta já tem registado. */
const aceitacoesDe = user => {
  const registo = user?.attributes?.profile?.metadata?.[CHAVE];
  return Array.isArray(registo) ? registo : [];
};

/**
 * Documentos que faltam aceitar — nunca aceites, ou aceites numa versão
 * anterior à que está em vigor.
 *
 * É isto que permite pedir uma nova aceitação quando um documento muda, em vez
 * de assumir que a aceitação de 2026 cobre um texto de 2027.
 */
const emFalta = (user, userType) => {
  const registadas = aceitacoesDe(user);
  return exigidosPara(userType)
    .map(slug => {
      const atual = versaoEmVigor(slug);
      if (!atual) return null;
      const ultima = registadas.filter(r => r.slug === slug).pop();
      if (ultima && ultima.versao === atual) return null;
      return { slug, versao: atual, motivo: ultima ? 'versão-nova' : 'nunca-aceite' };
    })
    .filter(Boolean);
};

/**
 * Grava a aceitação de um conjunto de documentos.
 *
 * O registo é acrescentado, nunca substituído: o histórico é o que permite
 * dizer "aceitou a versão 1.0 em setembro e a 1.1 em março". Um registo que se
 * sobrepusesse a si próprio perdia exactamente a informação que interessa.
 *
 * @param {Object} sdk Integration SDK
 * @param {Object} user o utilizador, como vem de `users.show`
 * @param {string[]} slugs documentos aceites
 * @param {string} contexto onde aconteceu ('registo', 're-aceitacao', ...)
 * @returns {Promise<{gravadas: Array, jaTinha: Array}>}
 */
const registar = async (sdk, user, slugs, contexto) => {
  const uid = user?.id?.uuid;
  if (!uid) throw new Error('utilizador sem id');

  const registadas = aceitacoesDe(user);
  const agora = new Date().toISOString();

  const novas = [];
  const jaTinha = [];
  for (const slug of slugs) {
    const atual = versaoEmVigor(slug);
    if (!atual) continue; // slug desconhecido: ignora-se em vez de gravar lixo
    const ultima = registadas.filter(r => r.slug === slug).pop();
    if (ultima && ultima.versao === atual) {
      jaTinha.push({ slug, versao: atual });
      continue;
    }
    novas.push({ slug, versao: atual, em: agora, contexto });
  }

  if (novas.length === 0) return { gravadas: [], jaTinha };

  await sdk.users.updateProfile({
    id: uid,
    metadata: { [CHAVE]: [...registadas, ...novas] },
  });

  return { gravadas: novas, jaTinha };
};

module.exports = {
  CHAVE,
  EXIGIDOS,
  exigidosPara,
  versaoEmVigor,
  aceitacoesDe,
  emFalta,
  registar,
};
