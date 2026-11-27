/**
 * O link iCal de saída de um anúncio: as reservas aceites, para o anfitrião
 * subscrever no Google, no Outlook ou no PMS do hotel.
 *
 *   GET  /api/ical-export?listingId=…        o link (cria-o na primeira vez)
 *   POST /api/ical-export/novo               troca o código; o link antigo morre
 *   GET  /api/ical/:listingId/:codigo.ics    o calendário, sem sessão
 *
 * O CÓDIGO É A CHAVE
 *
 * Quem subscreve um calendário por URL não inicia sessão: o Google vai buscar
 * o endereço sozinho, de tempos a tempos. Por isso o próprio endereço tem de
 * ser o segredo. Cada anúncio tem um código aleatório em
 * `privateData.icalExport.codigo`; quem não o tiver recebe 404, sem distinguir
 * "não existe" de "código errado".
 *
 * As duas primeiras rotas passam pelo SDK do próprio utilizador e por
 * `ownListings`, como ical-feeds.js: só o dono vê ou troca o link.
 */

const crypto = require('crypto');
const { getSdk, getIntegrationSdk, handleError } = require('../api-util/sdk');
const { reservasDoAnuncio, gerarCalendario } = require('../api-util/icalExport');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO = /^[A-Za-z0-9_-]{32}$/;
const PER_PAGE = 100;
const MAX_PAGINAS = 10;
// Os calendários perguntam muitas vezes e cada resposta custa pedidos à API.
// Cinco minutos de cópia não atrasam nada que o próprio Google não atrase mais.
const CACHE_MS = 5 * 60 * 1000;

const cache = new Map();

const raiz = () => (process.env.REACT_APP_MARKETPLACE_ROOT_URL || '').replace(/\/$/, '');
const novoCodigo = () => crypto.randomBytes(24).toString('base64url');
const linkDe = (listingId, codigo) => `${raiz()}/api/ical/${listingId}/${codigo}.ics`;

const mesmoCodigo = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

const gravarCodigo = async (sdk, listingId) => {
  const codigo = novoCodigo();
  await sdk.ownListings.update({
    id: listingId,
    privateData: { icalExport: { codigo, criadoEm: new Date().toISOString() } },
  });
  cache.delete(listingId);
  return codigo;
};

/** GET /api/ical-export?listingId=… */
const obterLink = async (req, res) => {
  const { listingId } = req.query || {};
  if (!UUID.test(String(listingId || ''))) return res.status(400).json({ error: 'listingId-invalido' });
  try {
    const sdk = getSdk(req, res);
    const anuncio = (await sdk.ownListings.show({ id: listingId }))?.data?.data;
    if (!anuncio) return res.status(404).json({ error: 'listing-not-found' });
    const atual = anuncio.attributes?.privateData?.icalExport?.codigo;
    const codigo = CODIGO.test(String(atual || '')) ? atual : await gravarCodigo(sdk, listingId);
    return res.json({ url: linkDe(listingId, codigo) });
  } catch (e) {
    return handleError(res, e);
  }
};

/** POST /api/ical-export/novo  body: { listingId } */
const trocarLink = async (req, res) => {
  const { listingId } = req.body || {};
  if (!UUID.test(String(listingId || ''))) return res.status(400).json({ error: 'listingId-invalido' });
  try {
    const sdk = getSdk(req, res);
    const anuncio = (await sdk.ownListings.show({ id: listingId }))?.data?.data;
    if (!anuncio) return res.status(404).json({ error: 'listing-not-found' });
    const codigo = await gravarCodigo(sdk, listingId);
    return res.json({ url: linkDe(listingId, codigo) });
  } catch (e) {
    return handleError(res, e);
  }
};

const naoEncontrado = res => res.status(404).type('text/plain').send('Not found');

/** GET /api/ical/:listingId/:ficheiro  (ficheiro = "<código>.ics") */
const calendario = async (req, res) => {
  const { listingId, ficheiro } = req.params || {};
  const codigo = String(ficheiro || '').replace(/\.ics$/i, '');
  if (!UUID.test(String(listingId || '')) || !CODIGO.test(codigo)) return naoEncontrado(res);

  const emCache = cache.get(listingId);
  if (emCache && emCache.ate > Date.now() && mesmoCodigo(emCache.codigo, codigo)) {
    return enviar(res, emCache.texto);
  }

  const sdk = getIntegrationSdk();
  if (!sdk) return res.status(503).type('text/plain').send('Unavailable');

  try {
    const anuncio = (await sdk.listings.show({ id: listingId, include: ['author'] }))?.data?.data;
    const guardado = anuncio?.attributes?.privateData?.icalExport?.codigo;
    if (!anuncio || !mesmoCodigo(guardado, codigo)) return naoEncontrado(res);

    const autor = anuncio.relationships?.author?.data?.id;
    const providerId = autor?.uuid || autor;
    if (!providerId) return naoEncontrado(res);

    // As transações do anfitrião, filtradas depois por este anúncio. Ordena
    // pela criação, da mais recente: as reservas futuras estão no princípio.
    const transacoes = [];
    const incluidos = [];
    for (let page = 1; page <= MAX_PAGINAS; page++) {
      const r = await sdk.transactions.query({
        providerId,
        include: ['booking', 'customer'],
        'fields.user': ['profile.displayName'],
        page,
        perPage: PER_PAGE,
      });
      const lote = r?.data?.data || [];
      transacoes.push(...lote);
      incluidos.push(...(r?.data?.included || []));
      const totalPages = r?.data?.meta?.totalPages || 1;
      if (lote.length === 0 || page >= totalPages) break;
    }

    const texto = gerarCalendario({
      titulo: anuncio.attributes?.title,
      reservas: reservasDoAnuncio(transacoes, incluidos, listingId),
      raiz: raiz(),
      timeZone: anuncio.attributes?.availabilityPlan?.timezone || 'Europe/Lisbon',
    });
    cache.set(listingId, { codigo, texto, ate: Date.now() + CACHE_MS });
    return enviar(res, texto);
  } catch (e) {
    if (e?.status === 404) return naoEncontrado(res);
    console.error('[ical-export] falhou:', e?.message || e);
    return res.status(502).type('text/plain').send('Temporarily unavailable');
  }
};

const enviar = (res, texto) => {
  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'inline; filename="venue1hub.ics"',
    'Cache-Control': 'private, max-age=300',
    'X-Robots-Tag': 'noindex',
  });
  return res.send(texto);
};

module.exports = { obterLink, trocarLink, calendario, _cache: cache };
