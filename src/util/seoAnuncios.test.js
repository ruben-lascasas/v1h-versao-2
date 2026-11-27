import {
  cidadeDaMorada,
  rotuloCategoria,
  dadosDoAnuncio,
  aplicarModelo,
  tituloDoModelo,
  seoDoAnuncio,
  ANUNCIO_EXEMPLO,
  CAMINHO_MODELO_ANUNCIOS,
  paginaModeloAnuncios,
} from './seoAnuncios';
import { analisarSeo, nivelGeral, LIMITES_SEO } from './seoAnalise';
import { seoParaEndereco } from './seoOverrides';

const categorias = {
  key: 'categoryLevel',
  categories: [
    {
      id: 'trabalho-reunioes',
      name: 'Trabalho & Reuniões',
      subcategories: [{ id: 'salas-reuniao', name: 'Salas de Reunião' }],
    },
  ],
};

const anuncio = (extra = {}) => ({
  attributes: {
    title: 'Sala de Eventos',
    description: 'No FeelViana, os seus eventos ganham um cenário único entre o pinhal e o mar.',
    publicData: {
      location: { address: 'Rua Brás de Abreu Soares 222, 4935-158 Darque, Viana do Castelo, Portugal' },
      categoryLevel1: 'trabalho-reunioes',
      categoryLevel2: 'salas-reuniao',
      numero_pessoas: 150,
      unitType: 'day',
      ...extra,
    },
  },
});

describe('seoAnuncios', () => {
  it('tira a cidade da morada, e na dúvida não inventa', () => {
    expect(
      cidadeDaMorada('Rua Brás de Abreu Soares 222, 4935-158 Darque, Viana do Castelo, Portugal')
    ).toBe('Viana do Castelo');
    expect(cidadeDaMorada('Avenida da Liberdade 10, 1250-145 Lisboa, Portugal')).toBe('Lisboa');
    expect(cidadeDaMorada('Porto, Portugal')).toBe('Porto');
    expect(cidadeDaMorada('Rua Sem Vírgulas 12')).toBe('');
    expect(cidadeDaMorada('')).toBe('');
  });

  it('usa a categoria mais específica', () => {
    expect(rotuloCategoria(anuncio().attributes.publicData, categorias)).toBe('Salas de Reunião');
    expect(rotuloCategoria({ categoryLevel1: 'trabalho-reunioes' }, categorias)).toBe('Trabalho & Reuniões');
    expect(rotuloCategoria({}, categorias)).toBe('');
  });

  it('monta o preço com a unidade, sem cêntimos a zero', () => {
    expect(dadosDoAnuncio(anuncio(), { precoFormatado: '500,00 €' }).preco).toBe('500 €/dia');
    expect(dadosDoAnuncio(anuncio({ unitType: 'hour' }), { lingua: 'en', precoFormatado: '€25.50' }).preco).toBe(
      '€25.50/hour'
    );
  });

  it('os blocos [ ] desaparecem quando falta o dado', () => {
    const modelo = 'Reserve {titulo}[ em {cidade}][, até {capacidade} pessoas]. {descricao}';
    expect(aplicarModelo(modelo, { titulo: 'Sala', cidade: 'Porto', capacidade: '', descricao: 'Boa.' })).toBe(
      'Reserve Sala em Porto. Boa.'
    );
    expect(aplicarModelo(modelo, { titulo: 'Sala', cidade: '', capacidade: '20', descricao: '' })).toBe(
      'Reserve Sala, até 20 pessoas.'
    );
  });

  it('um título longo perde primeiro os blocos opcionais', () => {
    const dados = { titulo: 'Auditório principal com vista para o rio e terraço', cidade: 'Vila Nova de Gaia' };
    expect(tituloDoModelo('{titulo}[ em {cidade}] | Venue1Hub', dados)).toBe(
      'Auditório principal com vista para o rio e terraço | Venue1Hub'
    );
  });

  it('com o modelo sugerido, um anúncio real sai com título e descrição prontos', () => {
    const seo = seoDoAnuncio({
      listing: anuncio(),
      lingua: 'pt',
      paginasGravadas: {},
      categoryConfiguration: categorias,
      precoFormatado: '500,00 €',
    });
    expect(seo.title).toBe('Sala de Eventos em Viana do Castelo | Venue1Hub');
    expect(seo.description.startsWith(
      'Reserve Sala de Eventos em Viana do Castelo, até 150 pessoas, desde 500 €/dia. No FeelViana'
    )).toBe(true);
    expect(seo.description.length).toBeLessThanOrEqual(LIMITES_SEO.descricaoMax + 2);
  });

  it('o modelo gravado no painel manda', () => {
    const seo = seoDoAnuncio({
      listing: anuncio(),
      lingua: 'pt',
      paginasGravadas: { [CAMINHO_MODELO_ANUNCIOS]: { pt: { title: '{categoria}: {titulo} | V1H' } } },
      categoryConfiguration: categorias,
    });
    expect(seo.title).toBe('Salas de Reunião: Sala de Eventos | V1H');
  });

  it('o modelo sugerido passa a análise no anúncio de exemplo, nas duas línguas', () => {
    const p = paginaModeloAnuncios();
    ['pt', 'en'].forEach(l => {
      const s = p.sugestao[l];
      const r = analisarSeo(
        { title: tituloDoModelo(s.title, ANUNCIO_EXEMPLO), description: aplicarModelo(s.description, ANUNCIO_EXEMPLO).slice(0, 160) },
        [],
        { semPalavraChave: true }
      );
      expect({ l, r: nivelGeral(r) }).toEqual({ l, r: 'bom' });
    });
  });

  it('o endereço de um anúncio nunca cai numa página fixa', () => {
    expect(seoParaEndereco('/l/sala-de-eventos/6afc8cf7', 'pt', {})).toBeNull();
    expect(seoParaEndereco(CAMINHO_MODELO_ANUNCIOS, 'pt', {})).not.toBeNull();
  });
});
