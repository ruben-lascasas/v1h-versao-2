const {
  comissaoDe,
  jaFacturada,
  descricaoLinha,
  registarComissao,
  fecharFacturaDe,
  MARCA,
} = require('./commissionInvoices');
const billing = require('./stripeBilling');

// `client()` recusa-se a devolver o duplo sem uma chave presente — é a mesma
// guarda que impede o servidor de arrancar mal configurado. Nos testes basta um
// valor qualquer: nenhuma chamada sai daqui.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_para_testes';

const transacao = (over = {}) => ({
  id: { uuid: 'tx-1' },
  attributes: {
    lineItems: [
      { code: 'line-item/day', lineTotal: { amount: 10000, currency: 'EUR' } },
      // A Sharetribe grava a comissão do fornecedor em negativo: é o que se
      // retira ao anfitrião.
      { code: 'line-item/provider-commission', lineTotal: { amount: -1000, currency: 'EUR' } },
    ],
    metadata: {},
    ...over,
  },
});

const anfitriao = {
  id: { uuid: 'user-1' },
  attributes: { email: 'anfitriao@exemplo.pt', profile: { displayName: 'Lídia F.' } },
};
const anuncio = { id: { uuid: 'l-1' }, attributes: { title: 'Quinta do Sol' } };

describe('comissaoDe', () => {
  it('devolve o valor absoluto, porque a Sharetribe grava-o negativo', () => {
    expect(comissaoDe(transacao())).toEqual({ cents: 1000, currency: 'eur' });
  });

  it('devolve null quando não há linha de comissão', () => {
    expect(
      comissaoDe(transacao({ lineItems: [{ code: 'line-item/day', lineTotal: { amount: 10000 } }] }))
    ).toBeNull();
  });

  it('devolve null quando a comissão é zero — não se emite factura de nada', () => {
    expect(
      comissaoDe(
        transacao({
          lineItems: [
            { code: 'line-item/provider-commission', lineTotal: { amount: 0, currency: 'EUR' } },
          ],
        })
      )
    ).toBeNull();
  });

  it('aguenta uma transacção sem linhas', () => {
    expect(comissaoDe({ attributes: {} })).toBeNull();
    expect(comissaoDe(null)).toBeNull();
  });
});

describe('descricaoLinha', () => {
  it('inclui o período quando existe, para o anfitrião conferir', () => {
    const d = descricaoLinha({
      listingTitle: 'Quinta do Sol',
      inicio: '2026-09-01T10:00:00Z',
      fim: '2026-09-01T18:00:00Z',
    });
    expect(d).toContain('Quinta do Sol');
    expect(d).toContain('01/09/2026');
  });

  it('não inventa período quando não há datas', () => {
    expect(descricaoLinha({ listingTitle: 'Quinta do Sol' })).toBe(
      'Comissão Venue1Hub — Quinta do Sol'
    );
  });
});

describe('registarComissao', () => {
  let criadas;
  let metadataEscrita;
  let sdk;

  beforeEach(() => {
    criadas = [];
    metadataEscrita = [];
    sdk = {
      transactions: {
        updateMetadata: async p => {
          metadataEscrita.push(p);
          return {};
        },
      },
    };
    billing.__setClient({
      customers: {
        create: async () => ({ id: 'cus_teste' }),
        retrieve: async () => ({ id: 'cus_teste' }),
      },
      invoiceItems: {
        create: async (params, opts) => {
          criadas.push({ params, opts });
          return { id: 'ii_1' };
        },
      },
    });
  });

  it('cria a linha com o valor positivo e marca a reserva', async () => {
    const r = await registarComissao({
      sdk,
      transaction: transacao(),
      provider: anfitriao,
      listing: anuncio,
    });

    expect(r.estado).toBe('registada');
    expect(criadas).toHaveLength(1);
    expect(criadas[0].params.amount).toBe(1000);
    expect(criadas[0].params.currency).toBe('eur');
    expect(criadas[0].params.metadata.sharetribeTransactionId).toBe('tx-1');
    // A marca é o que impede a segunda facturação na passagem seguinte.
    expect(metadataEscrita[0].metadata[MARCA]).toBeTruthy();
  });

  it('leva uma idempotency key ligada à reserva', async () => {
    // Segunda defesa: se a marcação falhar depois da linha ser criada, o Stripe
    // recusa a repetição em vez de facturar duas vezes.
    await registarComissao({ sdk, transaction: transacao(), provider: anfitriao, listing: anuncio });
    expect(criadas[0].opts.idempotencyKey).toBe('comissao-tx-1');
  });

  it('não repete uma reserva já facturada', async () => {
    const tx = transacao({ metadata: { [MARCA]: '2026-08-01T00:00:00.000Z' } });
    const r = await registarComissao({ sdk, transaction: tx, provider: anfitriao, listing: anuncio });

    expect(r.estado).toBe('já-facturada');
    expect(criadas).toHaveLength(0);
    expect(metadataEscrita).toHaveLength(0);
  });

  it('salta quando não há comissão', async () => {
    const tx = transacao({ lineItems: [{ code: 'line-item/day', lineTotal: { amount: 100 } }] });
    const r = await registarComissao({ sdk, transaction: tx, provider: anfitriao, listing: anuncio });
    expect(r.estado).toBe('sem-comissão');
    expect(criadas).toHaveLength(0);
  });

  it('salta quando o anfitrião não tem email', async () => {
    const semEmail = { id: { uuid: 'u' }, attributes: { profile: {} } };
    const r = await registarComissao({
      sdk,
      transaction: transacao(),
      provider: semEmail,
      listing: anuncio,
    });
    expect(r.estado).toBe('anfitrião-sem-email');
    expect(criadas).toHaveLength(0);
  });

  it('em dry-run não escreve nada', async () => {
    const r = await registarComissao({
      sdk,
      transaction: transacao(),
      provider: anfitriao,
      listing: anuncio,
      dryRun: true,
    });
    expect(r.estado).toBe('seria-registada');
    expect(criadas).toHaveLength(0);
    expect(metadataEscrita).toHaveLength(0);
  });
});

describe('fecharFacturaDe', () => {
  let accoes;

  beforeEach(() => {
    accoes = [];
    billing.__setClient({
      invoiceItems: {
        list: async () => ({ data: [{ amount: 1000 }, { amount: 500 }] }),
      },
      invoices: {
        create: async p => {
          accoes.push(['create', p]);
          return { id: 'in_1' };
        },
        finalizeInvoice: async id => {
          accoes.push(['finalize', id]);
          return { id };
        },
        pay: async (id, p) => {
          accoes.push(['pay', p]);
          return { id, number: 'V1H-0001' };
        },
      },
    });
  });

  it('emite a factura já paga — o dinheiro já tinha sido retido', async () => {
    const r = await fecharFacturaDe({ customerId: 'cus_1' });

    expect(r.estado).toBe('fechada');
    expect(accoes.map(a => a[0])).toEqual(['create', 'finalize', 'pay']);
    // Sem isto, o Stripe tentava cobrar ao anfitrião uma comissão que já
    // tinha sido descontada.
    expect(accoes[2][1]).toEqual({ paid_out_of_band: true });
  });

  it('não calcula imposto e escreve o motivo da isenção', async () => {
    await fecharFacturaDe({ customerId: 'cus_1' });
    const params = accoes[0][1];
    expect(params.automatic_tax).toEqual({ enabled: false });
    expect(params.footer).toMatch(/isento|exempt/i);
  });

  it('não emite factura quando não há linhas pendentes', async () => {
    billing.__setClient({ invoiceItems: { list: async () => ({ data: [] }) }, invoices: {} });
    const r = await fecharFacturaDe({ customerId: 'cus_1' });
    expect(r.estado).toBe('sem-linhas');
  });

  it('em dry-run não emite nada', async () => {
    const r = await fecharFacturaDe({ customerId: 'cus_1', dryRun: true });
    expect(r.estado).toBe('seria-fechada');
    expect(accoes).toHaveLength(0);
  });
});
