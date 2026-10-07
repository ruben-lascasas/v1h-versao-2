import {
  subcategoriasDe,
  ramoDe,
  nomeDaSubcategoria,
  construirUsos,
  usosDoAnuncio,
  campoUsosConfigurado,
  usosParaFiltrar,
  listaDeIds,
  idDeUso,
  idDeCategoria,
} from './categorias';

const CATEGORIAS = [
  {
    id: 'gastronomia-convivio',
    name: 'Gastronomia & Convívio',
    subcategories: [
      { id: 'restaurantes-privados', name: 'Restaurantes Privados' },
      { id: 'salas-showcooking', name: 'Salas para Showcooking' },
    ],
  },
  {
    id: 'educacao-cultura',
    name: 'Educação & Cultura',
    subcategories: [
      { id: 'sala-formacao', name: 'Salas de Formação' },
      { id: 'auditorios', name: 'Auditórios' },
    ],
  },
];

describe('ler a árvore de categorias', () => {
  it('dá as subcategorias de um ramo', () => {
    expect(subcategoriasDe(CATEGORIAS, 'educacao-cultura')).toEqual(['sala-formacao', 'auditorios']);
  });

  it('dá o ramo de uma subcategoria', () => {
    expect(ramoDe(CATEGORIAS, 'salas-showcooking')).toBe('gastronomia-convivio');
  });

  it('dá o nome legível, que é o que se mostra a quem lê', () => {
    expect(nomeDaSubcategoria(CATEGORIAS, 'auditorios')).toBe('Auditórios');
  });

  it('aguenta ids que não existem e árvore em falta', () => {
    expect(subcategoriasDe(CATEGORIAS, 'nao-existe')).toEqual([]);
    expect(ramoDe(null, 'seja-o-que-for')).toBeNull();
    expect(nomeDaSubcategoria(CATEGORIAS, 'nao-existe')).toBeNull();
  });
});

describe('o que se grava no anúncio', () => {
  /**
   * A categoria principal entra sempre nos usos. É isso que permite ao filtro
   * fazer uma pergunta só — a API da Sharetribe não sabe cruzar dois campos
   * com "ou".
   */
  it('a categoria principal vai à frente, e só uma vez', () => {
    expect(construirUsos('restaurantes-privados', ['sala-formacao'])).toEqual([
      'restaurantes-privados',
      'sala-formacao',
    ]);
  });

  it('não duplica quando o anfitrião marca a principal como uso extra', () => {
    expect(construirUsos('restaurantes-privados', ['restaurantes-privados', 'auditorios'])).toEqual([
      'restaurantes-privados',
      'auditorios',
    ]);
  });

  it('sem usos extra, fica só a principal', () => {
    expect(construirUsos('auditorios')).toEqual(['auditorios']);
    expect(construirUsos('auditorios', [])).toEqual(['auditorios']);
  });

  it('sem categoria nenhuma, devolve lista vazia em vez de lixo', () => {
    expect(construirUsos(undefined, [])).toEqual([]);
    expect(construirUsos(null, [null, ''])).toEqual([]);
  });
});

describe('o que se lê de um anúncio', () => {
  it('lê os usos quando lá estão', () => {
    expect(usosDoAnuncio({ usos: ['a', 'b'], categoryLevel2: 'a' })).toEqual(['a', 'b']);
  });

  /**
   * Um anúncio criado antes deste campo existir não tem `usos`. Vale a
   * categoria principal — senão desaparecia da pesquisa no dia em que o filtro
   * mudasse, e só se daria por isso pela falta de reservas.
   */
  it('um anúncio antigo vale pela categoria principal', () => {
    expect(usosDoAnuncio({ categoryLevel2: 'auditorios' })).toEqual(['auditorios']);
    expect(usosDoAnuncio({ usos: [], categoryLevel2: 'auditorios' })).toEqual(['auditorios']);
  });

  it('um anúncio sem nada devolve lista vazia', () => {
    expect(usosDoAnuncio({})).toEqual([]);
    expect(usosDoAnuncio(undefined)).toEqual([]);
  });
});

describe('traduzir a escolha de quem procura', () => {
  it('escolher um ramo é escolher as subcategorias dele', () => {
    expect(usosParaFiltrar(CATEGORIAS, ['educacao-cultura'], [])).toEqual([
      'sala-formacao',
      'auditorios',
    ]);
  });

  it('junta ramos e subcategorias soltas sem repetir', () => {
    const r = usosParaFiltrar(CATEGORIAS, ['educacao-cultura'], ['auditorios', 'salas-showcooking']);
    expect(r).toEqual(['sala-formacao', 'auditorios', 'salas-showcooking']);
  });

  it('sem escolha nenhuma não filtra nada', () => {
    expect(usosParaFiltrar(CATEGORIAS, [], [])).toEqual([]);
  });
});

/**
 * Um filtro por um campo que a Console não conhece não dá erro: é ignorado, e
 * a pesquisa devolve o catálogo inteiro. Verificado contra a API. Por isso o
 * código pergunta se o campo existe antes de mudar de filtro.
 */
describe('saber se o campo já existe na Console', () => {
  it('reconhece o campo configurado', () => {
    expect(campoUsosConfigurado([{ key: 'usos', schemaType: 'multi-enum' }])).toBe(true);
  });

  it('um campo com o nome certo mas do tipo errado não serve', () => {
    expect(campoUsosConfigurado([{ key: 'usos', schemaType: 'enum' }])).toBe(false);
  });

  it('sem o campo, responde que não', () => {
    expect(campoUsosConfigurado([{ key: 'comodidades', schemaType: 'multi-enum' }])).toBe(false);
    expect(campoUsosConfigurado([])).toBe(false);
    expect(campoUsosConfigurado(undefined)).toBe(false);
  });
});

describe('listaDeIds', () => {
  it('parte a lista que vem no endereço', () => {
    expect(listaDeIds('a, b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('aguenta vazio', () => {
    expect(listaDeIds('')).toEqual([]);
    expect(listaDeIds(undefined)).toEqual([]);
  });
});

/**
 * A Sharetribe não aceita ids de opção com mais de 32 caracteres. Duas
 * subcategorias passavam disso e ficaram encurtadas na Console — deixando de
 * ser iguais às da árvore. Sem tradução, dois ramos ficavam partidos em
 * silêncio: a pesquisa perguntaria por um id que nenhum anúncio tem, e não
 * daria erro nenhum.
 */
describe('os dois ids que não couberam', () => {
  const COWORKING_ARVORE = 'escritorios-partilhados-coworking';
  const COWORKING_CAMPO = 'escritorios-partilhados-cowork';
  const ACUPUNCTURA_ARVORE = 'sala-acunpuctura-terapidaholistica';
  const ACUPUNCTURA_CAMPO = 'sala-acunpuctura-terapholistica';

  it('traduz da árvore para o campo', () => {
    expect(idDeUso(COWORKING_ARVORE)).toBe(COWORKING_CAMPO);
    expect(idDeUso(ACUPUNCTURA_ARVORE)).toBe(ACUPUNCTURA_CAMPO);
  });

  it('traduz de volta', () => {
    expect(idDeCategoria(COWORKING_CAMPO)).toBe(COWORKING_ARVORE);
    expect(idDeCategoria(ACUPUNCTURA_CAMPO)).toBe(ACUPUNCTURA_ARVORE);
  });

  it('os outros 58 passam incólumes', () => {
    expect(idDeUso('auditorios')).toBe('auditorios');
    expect(idDeCategoria('auditorios')).toBe('auditorios');
  });

  // O limite é da API: um id com mais de 32 caracteres é recusado na Console.
  it('o id traduzido cabe no limite da Sharetribe', () => {
    expect(COWORKING_ARVORE.length).toBeGreaterThan(32);
    expect(idDeUso(COWORKING_ARVORE).length).toBeLessThanOrEqual(32);
    expect(ACUPUNCTURA_ARVORE.length).toBeGreaterThan(32);
    expect(idDeUso(ACUPUNCTURA_ARVORE).length).toBeLessThanOrEqual(32);
  });

  it('a categoria principal é gravada com o id que o campo conhece', () => {
    expect(construirUsos(COWORKING_ARVORE, ['auditorios'])).toEqual([
      COWORKING_CAMPO,
      'auditorios',
    ]);
  });

  it('um anúncio antigo, sem usos, também é traduzido ao ser lido', () => {
    expect(usosDoAnuncio({ categoryLevel2: COWORKING_ARVORE })).toEqual([COWORKING_CAMPO]);
  });

  it('e o filtro pergunta pelo id do campo, não pelo da árvore', () => {
    const arvore = [
      {
        id: 'trabalho-reunioes',
        subcategories: [{ id: COWORKING_ARVORE }, { id: 'salas-reuniao' }],
      },
    ];
    expect(usosParaFiltrar(arvore, ['trabalho-reunioes'], [])).toEqual([
      COWORKING_CAMPO,
      'salas-reuniao',
    ]);
  });
});
