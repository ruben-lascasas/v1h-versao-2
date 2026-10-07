const { types } = require('sharetribe-flex-sdk');
const { Money } = types;

const { precosDoAnuncio, temDoisModos, modoACobrar, diasCobertos } = require('./modosDePreco');

const anuncio = (unitType, price, precos) => ({
  attributes: {
    price: price != null ? new Money(price, 'EUR') : null,
    publicData: { unitType, ...(precos ? { precos } : {}) },
  },
});

describe('precosDoAnuncio', () => {
  /**
   * Todos os anúncios de hoje estão assim. Se esta leitura falhasse, a
   * funcionalidade partia o catálogo inteiro em vez de lhe acrescentar nada.
   */
  it('um anúncio antigo, sem `precos`, mantém o preço que tem', () => {
    expect(precosDoAnuncio(anuncio('day', 450000))).toEqual({ day: 450000 });
    expect(precosDoAnuncio(anuncio('hour', 2500))).toEqual({ hour: 2500 });
  });

  /**
   * O DIA EM QUE OS TIPOS FOREM FUNDIDOS
   *
   * Com um tipo único "Espaço", o `unitType` deixa de dizer o que o anúncio
   * vende — passa a ser só o que o tipo traz. Um espaço alugado AO DIA, num
   * tipo cujo unitType é "hour", cairia em `attributes.price` e passaria a
   * vender à hora pelo preço do dia: 4 500 € por uma hora, sem erro nenhum.
   *
   * Por isso, a partir do momento em que `precos` existe, é ele a verdade toda.
   */
  it('com `precos` presente, um modo em falta não se vende — nem pelo preço do anúncio', () => {
    const soAoDia = anuncio('hour', 450000, { day: 450000, hour: null });
    expect(precosDoAnuncio(soAoDia)).toEqual({ day: 450000 });
  });

  it('o mesmo quando a chave do modo nem sequer lá está', () => {
    const soAoDia = anuncio('hour', 450000, { day: 450000 });
    expect(precosDoAnuncio(soAoDia)).toEqual({ day: 450000 });
  });

  it('com os dois preços guardados, devolve os dois', () => {
    expect(precosDoAnuncio(anuncio('day', 450000, { day: 450000, hour: 60000 }))).toEqual({
      day: 450000,
      hour: 60000,
    });
  });

  it('o preço guardado manda sobre o do anúncio, se diferirem', () => {
    // Pode acontecer entre a gravação do painel de preços e a do anúncio.
    // Vale o que está em publicData, que é de onde se cobra.
    expect(precosDoAnuncio(anuncio('day', 450000, { day: 500000 })).day).toBe(500000);
  });

  it('ignora preços a zero, negativos ou que não sejam números', () => {
    // O `day` vai explicito: com `precos` presente nao ha recurso ao preco do
    // anuncio, nem para o modo principal.
    const com = hour => anuncio('day', 450000, { day: 450000, hour });
    expect(precosDoAnuncio(com(0))).toEqual({ day: 450000 });
    expect(precosDoAnuncio(com(-100))).toEqual({ day: 450000 });
    expect(precosDoAnuncio(com('60000'))).toEqual({ day: 450000 });
  });
});

describe('temDoisModos', () => {
  it('só com os dois preços', () => {
    expect(temDoisModos(anuncio('day', 450000))).toBe(false);
    expect(temDoisModos(anuncio('day', 450000, { day: 450000, hour: 60000 }))).toBe(true);
  });
});

describe('modoACobrar', () => {
  const doisModos = anuncio('day', 450000, { day: 450000, hour: 60000 });

  it('respeita o modo escolhido quando o anúncio o vende', () => {
    expect(modoACobrar(doisModos, 'hour')).toBe('hour');
    expect(modoACobrar(doisModos, 'day')).toBe('day');
  });

  /**
   * O nome do modo vem do browser. Um nome inventado não pode escolher preço
   * nenhum — e também não deve rebentar com uma reserva a meio do checkout.
   * Cai no modo principal do anúncio, que é o que ele sempre vendeu.
   */
  it('um modo que o anúncio não vende cai no principal', () => {
    expect(modoACobrar(anuncio('day', 450000), 'hour')).toBe('day');
    expect(modoACobrar(doisModos, 'minuto')).toBe('day');
    expect(modoACobrar(doisModos, undefined)).toBe('day');
    expect(modoACobrar(doisModos, { toString: () => 'hour' })).toBe('day');
  });
});

describe('diasCobertos', () => {
  /**
   * A FRONTEIRA QUE NÃO PODE MUDAR
   *
   * É assim que as reservas diárias são feitas hoje: meia-noite a meia-noite,
   * fim exclusivo. Se esta contagem passasse a dar 3 em vez de 2, cada reserva
   * diária do marketplace passava a custar mais um dia — em produção, sem
   * ninguém pedir. É o teste mais importante deste ficheiro.
   */
  it('1 Jan 00:00 -> 3 Jan 00:00 continua a dar 2 dias', () => {
    expect(diasCobertos('2026-01-01T00:00:00.000Z', '2026-01-03T00:00:00.000Z', 'Etc/UTC')).toBe(2);
  });

  it('um dia inteiro, meia-noite a meia-noite, é 1', () => {
    expect(diasCobertos('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 'Etc/UTC')).toBe(1);
  });

  // O caso novo: um "dia" é o horário de abertura do espaço.
  it('das 09:00 às 18:00 do mesmo dia é 1 dia, não zero', () => {
    expect(diasCobertos('2026-01-05T09:00:00.000Z', '2026-01-05T18:00:00.000Z', 'Etc/UTC')).toBe(1);
  });

  it('de segunda 09:00 a quarta 18:00 são 3 dias', () => {
    expect(diasCobertos('2026-01-05T09:00:00.000Z', '2026-01-07T18:00:00.000Z', 'Etc/UTC')).toBe(3);
  });

  /**
   * O fuso é o do anúncio, não o do servidor. Em Lisboa, no verão, as 23:30
   * UTC já são as 00:30 do dia seguinte — contar em UTC dava um dia a menos
   * numa reserva que, para o anfitrião, atravessa dois dias.
   */
  it('conta no fuso do anúncio, não em UTC', () => {
    const inicio = '2026-07-10T22:00:00.000Z'; // 23:00 em Lisboa, dia 10
    const fim = '2026-07-10T23:30:00.000Z'; // 00:30 em Lisboa, dia 11
    expect(diasCobertos(inicio, fim, 'Etc/UTC')).toBe(1);
    expect(diasCobertos(inicio, fim, 'Europe/Lisbon')).toBe(2);
  });

  it('devolve nulo para intervalos impossíveis', () => {
    expect(diasCobertos('2026-01-03T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(null);
    expect(diasCobertos('2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z')).toBe(null);
    expect(diasCobertos('nada disto', '2026-01-01T00:00:00.000Z')).toBe(null);
  });
});
