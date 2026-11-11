/**
 * Os calendários iCal de um anúncio: ver, acrescentar, remover.
 *
 * QUEM PODE MEXER
 *
 * Tudo aqui passa pelo SDK do próprio utilizador e por `ownListings`, que só
 * devolve e só aceita alterações nos anúncios de quem está autenticado. A
 * verificação de quem é dono do quê é do Sharetribe, não deste ficheiro — é
 * uma coisa a menos para eu enganar-me.
 *
 * ONDE FICAM GUARDADOS
 *
 * Em `privateData`, não em `publicData`. Um endereço iCal costuma trazer um
 * código de acesso no próprio URL: quem o tiver vê a agenda toda do espaço.
 * Isso não tem nada que aparecer na página pública do anúncio.
 */

const { getSdk, handleError } = require('../api-util/sdk');
const { validarUrlCalendario } = require('../api-util/icalUrl');

const MAX_CALENDARIOS = 5;

const lerAnuncio = async (sdk, listingId) => {
  const res = await sdk.ownListings.show({ id: listingId });
  return res?.data?.data || null;
};

const feedsDe = anuncio => {
  const f = anuncio?.attributes?.privateData?.icalFeeds;
  return Array.isArray(f) ? f.filter(x => x && x.url) : [];
};

/**
 * GET /api/ical-feeds?listingId=...
 * Os calendários deste anúncio e como correu a última sincronização.
 */
const listar = async (req, res) => {
  const { listingId } = req.query || {};
  if (!listingId) return res.status(400).json({ error: 'listingId-required' });

  try {
    const sdk = getSdk(req, res);
    const anuncio = await lerAnuncio(sdk, listingId);
    if (!anuncio) return res.status(404).json({ error: 'listing-not-found' });

    const sync = anuncio.attributes?.privateData?.icalSync || null;
    return res.json({
      feeds: feedsDe(anuncio),
      sincronizacao: sync
        ? {
            ultima: sync.ultimaSincronizacao || null,
            bloqueios: Array.isArray(sync.excepcoes) ? sync.excepcoes.length : 0,
            ultimoErro: sync.ultimoErro || null,
          }
        : null,
    });
  } catch (e) {
    return handleError(res, e);
  }
};

/**
 * POST /api/ical-feeds
 * body: { listingId, url, nome? }
 */
const acrescentar = async (req, res) => {
  const { listingId, url, nome } = req.body || {};
  if (!listingId || !url) return res.status(400).json({ error: 'listingId-e-url-obrigatorios' });

  const validacao = await validarUrlCalendario(url);
  if (!validacao.ok) return res.status(400).json({ error: 'url-invalido', motivo: validacao.motivo });

  try {
    const sdk = getSdk(req, res);
    const anuncio = await lerAnuncio(sdk, listingId);
    if (!anuncio) return res.status(404).json({ error: 'listing-not-found' });

    const feeds = feedsDe(anuncio);
    if (feeds.some(f => f.url === validacao.url)) {
      return res.status(409).json({ error: 'ja-existe' });
    }
    if (feeds.length >= MAX_CALENDARIOS) {
      return res.status(400).json({ error: 'demasiados-calendarios', maximo: MAX_CALENDARIOS });
    }

    const novos = [
      ...feeds,
      {
        url: validacao.url,
        nome: String(nome || '').trim().slice(0, 60) || 'Calendário',
        adicionadoEm: new Date().toISOString(),
      },
    ];

    await sdk.ownListings.update({ id: listingId, privateData: { icalFeeds: novos } });
    return res.json({ feeds: novos });
  } catch (e) {
    return handleError(res, e);
  }
};

/**
 * DELETE /api/ical-feeds
 * body: { listingId, url }
 *
 * Tirar o último calendário tem de apagar também os bloqueios que ele tinha
 * posto. Sem isso o anúncio ficava com horas fechadas para sempre: a passagem
 * periódica salta os anúncios sem calendários, por isso ninguém lá voltaria
 * para as limpar, e o anfitrião não faria ideia de onde tinham vindo.
 */
const remover = async (req, res) => {
  const { listingId, url } = req.body || {};
  if (!listingId || !url) return res.status(400).json({ error: 'listingId-e-url-obrigatorios' });

  try {
    const sdk = getSdk(req, res);
    const anuncio = await lerAnuncio(sdk, listingId);
    if (!anuncio) return res.status(404).json({ error: 'listing-not-found' });

    const feeds = feedsDe(anuncio).filter(f => f.url !== url);
    const pd = anuncio.attributes?.privateData || {};
    const excepcoes = Array.isArray(pd.icalSync?.excepcoes) ? pd.icalSync.excepcoes : [];

    const alteracao = { icalFeeds: feeds };
    let limpos = 0;

    if (feeds.length === 0 && excepcoes.length > 0) {
      for (const e of excepcoes) {
        if (!e?.id) continue;
        try {
          await sdk.availabilityExceptions.delete({ id: e.id });
          limpos += 1;
        } catch (err) {
          // Já não existir é o resultado pretendido.
          console.error('[ical] nao foi possivel limpar um bloqueio:', err?.message || err);
        }
      }
      alteracao.icalSync = {
        ultimaSincronizacao: pd.icalSync?.ultimaSincronizacao || null,
        excepcoes: [],
        ultimoErro: null,
      };
    }

    await sdk.ownListings.update({ id: listingId, privateData: alteracao });
    return res.json({ feeds, bloqueiosLimpos: limpos });
  } catch (e) {
    return handleError(res, e);
  }
};

module.exports = { listar, acrescentar, remover };
