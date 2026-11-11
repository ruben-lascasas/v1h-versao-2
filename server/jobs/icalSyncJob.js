/**
 * Sincroniza, de tempos a tempos, os anúncios que têm calendários iCal.
 *
 * PORQUE É QUE O INTERVALO IMPORTA
 *
 * Entre o hotel ocupar a sala no sistema dele e nós lermos o calendário, há
 * uma janela em que a Venue1Hub ainda a dá como livre. Essa janela é, no pior
 * caso, o intervalo entre passagens — e o que lá acontecer é uma reserva em
 * cima de uma sala ocupada.
 *
 * Quinze minutos é o compromisso: curto o suficiente para o risco ser pequeno
 * num espaço que se aluga por horas, longo o suficiente para não gastar a
 * quota de pedidos à API do Sharetribe nem bater nos limites de quem nos
 * serve os calendários. Quem quiser mais curto muda a variável; quem quiser
 * mesmo zero precisa de webhooks do outro lado, e isso não depende de nós.
 *
 * Variáveis de ambiente:
 *   ICAL_SYNC_CRON      (por omissão "*\/15 * * * *")
 *   DISABLE_ICAL_SYNC=true  → não agenda
 */

const cron = require('node-cron');
const { getIntegrationSdk } = require('../api-util/sdk');
const { sincronizarAnuncio } = require('../api-util/icalSync');

const PER_PAGE = 100;

/**
 * Os anúncios publicados que têm pelo menos um calendário configurado.
 *
 * Pede-se `privateData` de propósito: é lá que os endereços vivem, porque um
 * endereço iCal costuma trazer um código de acesso no próprio URL e não tem
 * nada que aparecer na página pública do anúncio.
 */
const anunciosComCalendario = async sdk => {
  const todos = [];
  let pagina = 1;
  while (true) {
    const res = await sdk.listings.query({
      states: 'published',
      page: pagina,
      perPage: PER_PAGE,
      'fields.listing': ['title', 'privateData'],
    });
    for (const l of res?.data?.data || []) {
      const feeds = l.attributes?.privateData?.icalFeeds;
      if (Array.isArray(feeds) && feeds.some(f => f && f.url)) todos.push(l);
    }
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || pagina >= meta.totalPages) break;
    pagina += 1;
  }
  return todos;
};

/**
 * Uma passagem. Exportada à parte do agendamento para poder ser testada sem
 * esperar pelo quarto de hora.
 *
 * @param {Object} sdk Integration SDK
 * @param {Object} [opcoes]
 * @param {Function} [opcoes.buscar] para os testes
 * @param {number} [opcoes.agora]
 * @returns {Promise<{anuncios:number, criadas:number, removidas:number, comErro:number}>}
 */
const correr = async (sdk, { buscar, agora } = {}) => {
  const anuncios = await anunciosComCalendario(sdk);
  const total = { anuncios: anuncios.length, criadas: 0, removidas: 0, comErro: 0 };

  for (const anuncio of anuncios) {
    try {
      const r = await sincronizarAnuncio({ sdk, anuncio, buscar, agora });
      total.criadas += r.criadas || 0;
      total.removidas += r.removidas || 0;
      if (r.erros && r.erros.length > 0) {
        total.comErro += 1;
        console.error(
          `[ical] ${anuncio.attributes?.title || anuncio.id?.uuid}: ${r.erros.join(' · ')}`
        );
      }
      // Os avisos não são erros — são partes do calendário que não soubemos
      // interpretar. Ficam registados porque é assim que se descobre que um
      // anfitrião usa uma repetição que o leitor ainda não cobre.
      for (const a of r.avisos || []) {
        console.warn(`[ical] ${anuncio.attributes?.title || anuncio.id?.uuid}: ${a}`);
      }
    } catch (e) {
      // Um anúncio que rebenta não pode levar os outros atrás.
      total.comErro += 1;
      console.error(`[ical] falhou em ${anuncio.id?.uuid}:`, e?.message || e);
    }
  }

  return total;
};

const start = () => {
  if (process.env.DISABLE_ICAL_SYNC === 'true') {
    console.log('[ical] desligado por variavel de ambiente');
    return;
  }
  const expressao = process.env.ICAL_SYNC_CRON || '*/15 * * * *';
  cron.schedule(expressao, async () => {
    const sdk = getIntegrationSdk();
    if (!sdk) {
      console.error('[ical] sem Integration SDK — passagem ignorada');
      return;
    }
    try {
      const r = await correr(sdk);
      if (r.anuncios > 0) {
        console.log(
          `[ical] ${r.anuncios} anuncio(s), +${r.criadas} bloqueios, -${r.removidas}, ${r.comErro} com erro`
        );
      }
    } catch (e) {
      console.error('[ical] passagem falhou:', e?.message || e);
    }
  });
  console.log(`[ical] agendado (${expressao})`);
};

module.exports = { start, correr, anunciosComCalendario };
