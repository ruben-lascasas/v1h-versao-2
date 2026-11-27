/**
 * O endereço público do calendário: sem o código certo não se vê nada, e com
 * ele vêm só as reservas aceites deste anúncio.
 */

const LISTING = '11111111-1111-1111-1111-111111111111';
const CODIGO = 'a'.repeat(32);

const mockIntegracao = {
  listings: { show: jest.fn() },
  transactions: { query: jest.fn() },
};

jest.mock('../api-util/sdk', () => ({
  getSdk: jest.fn(),
  getIntegrationSdk: () => mockIntegracao,
  handleError: (res, e) => res.status(500).json({ error: e.message }),
}));

const { getSdk } = require('../api-util/sdk');
const icalExport = require('./ical-export');

const resposta = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    type() {
      return this;
    },
    set(h) {
      Object.assign(this.headers, h);
      return this;
    },
    send(b) {
      this.body = b;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  return res;
};

const anuncio = codigo => ({
  data: {
    data: {
      id: { uuid: LISTING },
      attributes: { title: 'Sala Azul', privateData: { icalExport: { codigo } } },
      relationships: { author: { data: { id: { uuid: 'host-1' } } } },
    },
  },
});

describe('ical-export', () => {
  beforeEach(() => {
    process.env.REACT_APP_MARKETPLACE_ROOT_URL = 'https://venue1hub.com';
    icalExport._cache.clear();
    mockIntegracao.listings.show.mockReset();
    mockIntegracao.transactions.query.mockReset();
  });

  it('código errado dá 404, igual a anúncio inexistente', async () => {
    mockIntegracao.listings.show.mockResolvedValue(anuncio('b'.repeat(32)));
    const res = resposta();
    await icalExport.calendario({ params: { listingId: LISTING, ficheiro: `${CODIGO}.ics` } }, res);
    expect(res.statusCode).toBe(404);
    expect(mockIntegracao.transactions.query).not.toHaveBeenCalled();
  });

  it('endereços mal formados nem chegam à API', async () => {
    const res = resposta();
    await icalExport.calendario({ params: { listingId: 'x', ficheiro: 'y.ics' } }, res);
    expect(res.statusCode).toBe(404);
    expect(mockIntegracao.listings.show).not.toHaveBeenCalled();
  });

  it('com o código certo devolve o calendário e guarda-o 5 minutos', async () => {
    mockIntegracao.listings.show.mockResolvedValue(anuncio(CODIGO));
    mockIntegracao.transactions.query.mockResolvedValue({
      data: {
        data: [
          {
            id: { uuid: 't1' },
            relationships: {
              listing: { data: { id: { uuid: LISTING } } },
              booking: { data: { id: { uuid: 'b1' } } },
              customer: { data: { id: { uuid: 'c1' } } },
            },
          },
        ],
        included: [
          {
            id: { uuid: 'b1' },
            type: 'booking',
            attributes: {
              state: 'accepted',
              start: new Date(Date.now() + 86400000),
              end: new Date(Date.now() + 90000000),
            },
          },
        ],
        meta: { totalPages: 1 },
      },
    });

    const res = resposta();
    await icalExport.calendario({ params: { listingId: LISTING, ficheiro: `${CODIGO}.ics` } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toMatch(/text\/calendar/);
    expect(res.body).toContain('UID:t1-reserva@venue1hub.com');
    expect(mockIntegracao.transactions.query).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'host-1' })
    );

    const outra = resposta();
    await icalExport.calendario({ params: { listingId: LISTING, ficheiro: `${CODIGO}.ics` } }, outra);
    expect(outra.body).toBe(res.body);
    expect(mockIntegracao.listings.show).toHaveBeenCalledTimes(1);
  });

  it('o dono recebe o link, e o código só é criado uma vez', async () => {
    const update = jest.fn().mockResolvedValue({});
    getSdk.mockReturnValue({
      ownListings: {
        show: jest.fn().mockResolvedValue({ data: { data: { attributes: { privateData: {} } } } }),
        update,
      },
    });
    const res = resposta();
    await icalExport.obterLink({ query: { listingId: LISTING } }, res);
    expect(res.body.url).toMatch(
      new RegExp(`^https://venue1hub\\.com/api/ical/${LISTING}/[A-Za-z0-9_-]{32}\\.ics$`)
    );
    expect(update).toHaveBeenCalledTimes(1);

    getSdk.mockReturnValue({
      ownListings: {
        show: jest.fn().mockResolvedValue({
          data: { data: { attributes: { privateData: { icalExport: { codigo: CODIGO } } } } },
        }),
        update,
      },
    });
    const outra = resposta();
    await icalExport.obterLink({ query: { listingId: LISTING } }, outra);
    expect(outra.body.url).toBe(`https://venue1hub.com/api/ical/${LISTING}/${CODIGO}.ics`);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
