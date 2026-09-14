const {
  exigidosPara,
  versaoEmVigor,
  aceitacoesDe,
  emFalta,
  registar,
  CHAVE,
} = require('./legalAcceptance');
const CATALOGO = require('../../src/config/legalDocuments.json');

const conta = (metadata = {}, userType = 'anunciante') => ({
  id: { uuid: 'u-1' },
  attributes: { profile: { publicData: { userType }, metadata } },
});

const sdkQueGrava = () => {
  const escrito = [];
  return {
    escrito,
    users: {
      updateProfile: async p => {
        escrito.push(p);
        return {};
      },
    },
  };
};

describe('quem aceita o quê', () => {
  it('toda a gente aceita os Termos e a Privacidade', () => {
    for (const tipo of ['anunciante', 'visitante', 'prestador_de_servicos', null]) {
      expect(exigidosPara(tipo)).toEqual(
        expect.arrayContaining(['termos-de-servico', 'politica-de-privacidade'])
      );
    }
  });

  it('um anunciante aceita ainda os Termos do Anfitrião e de Pagamento', () => {
    const e = exigidosPara('anunciante');
    expect(e).toContain('termos-do-anfitriao');
    expect(e).toContain('termos-de-pagamento');
  });

  // Não faz sentido pedir a um visitante que aceite os Termos do Anfitrião.
  it('um visitante não aceita os termos de quem publica', () => {
    const e = exigidosPara('visitante');
    expect(e).toContain('termos-do-cliente');
    expect(e).not.toContain('termos-do-anfitriao');
  });

  it('não devolve documentos repetidos', () => {
    const e = exigidosPara('anunciante');
    expect(e.length).toBe(new Set(e).size);
  });

  // Os slugs exigidos têm de existir no catálogo, senão pedia-se a aceitação de
  // um documento que não está publicado em lado nenhum.
  it('todos os documentos exigidos existem no catálogo', () => {
    const slugs = CATALOGO.map(d => d.slug);
    for (const tipo of ['anunciante', 'visitante', 'prestador_de_servicos']) {
      for (const s of exigidosPara(tipo)) expect(slugs).toContain(s);
    }
  });
});

describe('o que falta aceitar', () => {
  it('uma conta nova tem tudo por aceitar', () => {
    const falta = emFalta(conta(), 'anunciante');
    expect(falta.map(f => f.slug).sort()).toEqual(exigidosPara('anunciante').sort());
    expect(falta.every(f => f.motivo === 'nunca-aceite')).toBe(true);
  });

  it('quem aceitou a versão em vigor não tem nada em falta', () => {
    const metadata = {
      [CHAVE]: exigidosPara('anunciante').map(slug => ({
        slug,
        versao: versaoEmVigor(slug),
        em: '2026-09-14T10:00:00.000Z',
        contexto: 'registo',
      })),
    };
    expect(emFalta(conta(metadata), 'anunciante')).toEqual([]);
  });

  // A razão de ser de tudo isto: quando um documento muda de versão, a
  // aceitação antiga deixa de cobrir o texto novo.
  it('uma versão antiga volta a ficar em falta', () => {
    const metadata = {
      [CHAVE]: [{ slug: 'termos-de-servico', versao: '0.9', em: '2026-01-01T00:00:00.000Z' }],
    };
    const falta = emFalta(conta(metadata), 'anunciante');
    const tos = falta.find(f => f.slug === 'termos-de-servico');
    expect(tos).toBeTruthy();
    expect(tos.motivo).toBe('versão-nova');
    expect(tos.versao).toBe(versaoEmVigor('termos-de-servico'));
  });
});

describe('gravar a aceitação', () => {
  it('grava slug, versão, momento e contexto', async () => {
    const sdk = sdkQueGrava();
    const r = await registar(sdk, conta(), ['termos-de-servico'], 'registo');

    expect(r.gravadas).toHaveLength(1);
    const gravada = sdk.escrito[0].metadata[CHAVE][0];
    expect(gravada.slug).toBe('termos-de-servico');
    expect(gravada.versao).toBe(versaoEmVigor('termos-de-servico'));
    expect(gravada.contexto).toBe('registo');
    expect(Date.parse(gravada.em)).not.toBeNaN();
  });

  // O histórico é o que permite dizer "aceitou a 1.0 em setembro e a 1.1 em
  // março". Substituir o registo perdia exactamente a informação que interessa.
  it('acrescenta ao histórico em vez de o substituir', async () => {
    const sdk = sdkQueGrava();
    const anterior = { slug: 'termos-de-servico', versao: '0.9', em: '2026-01-01T00:00:00.000Z' };
    await registar(sdk, conta({ [CHAVE]: [anterior] }), ['termos-de-servico'], 're-aceitacao');

    const lista = sdk.escrito[0].metadata[CHAVE];
    expect(lista).toHaveLength(2);
    expect(lista[0]).toEqual(anterior);
    expect(lista[1].versao).toBe(versaoEmVigor('termos-de-servico'));
  });

  it('não regrava o que já está aceite na versão em vigor', async () => {
    const sdk = sdkQueGrava();
    const metadata = {
      [CHAVE]: [
        { slug: 'termos-de-servico', versao: versaoEmVigor('termos-de-servico'), em: '2026-09-14T00:00:00.000Z' },
      ],
    };
    const r = await registar(sdk, conta(metadata), ['termos-de-servico'], 'registo');

    expect(r.gravadas).toHaveLength(0);
    expect(r.jaTinha).toHaveLength(1);
    expect(sdk.escrito).toHaveLength(0);
  });

  // Um slug que não existe no catálogo não pode entrar no registo: ficaria lá
  // uma aceitação de um documento que ninguém consegue mostrar.
  it('ignora slugs desconhecidos em vez de gravar lixo', async () => {
    const sdk = sdkQueGrava();
    const r = await registar(sdk, conta(), ['documento-que-nao-existe'], 'registo');
    expect(r.gravadas).toHaveLength(0);
    expect(sdk.escrito).toHaveLength(0);
  });

  it('rejeita uma conta sem id', async () => {
    await expect(registar(sdkQueGrava(), {}, ['termos-de-servico'], 'registo')).rejects.toThrow();
  });
});

describe('aceitacoesDe', () => {
  it('devolve lista vazia quando não há registo nenhum', () => {
    expect(aceitacoesDe(conta())).toEqual([]);
    expect(aceitacoesDe(null)).toEqual([]);
  });

  // Se a metadata vier corrompida, o pior que pode acontecer é pedir-se a
  // aceitação outra vez — nunca rebentar a página de quem tem sessão iniciada.
  it('aguenta metadata com o formato errado', () => {
    expect(aceitacoesDe(conta({ [CHAVE]: 'nao é uma lista' }))).toEqual([]);
  });
});
