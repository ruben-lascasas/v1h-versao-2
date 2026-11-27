import {
  PAGINAS_SEO,
  normalizarCaminho,
  paginaSeo,
  valoresEmVigor,
  metaKeywords,
  seoParaEndereco,
} from './seoOverrides';
import { analisarSeo, nivelGeral, cortarParaGoogle, LIMITES_SEO } from './seoAnalise';

describe('seoOverrides', () => {
  it('trata o endereço com barra final e com query como a mesma página', () => {
    expect(normalizarCaminho('/como-funciona/')).toBe('/como-funciona');
    expect(normalizarCaminho('/s?pub_categoria=x')).toBe('/s');
    expect(normalizarCaminho('/')).toBe('/');
    expect(paginaSeo('/s?address=Lisboa').path).toBe('/s');
  });

  it('não mexe em páginas que o painel não gere', () => {
    expect(seoParaEndereco('/l/sala/123', 'pt', {})).toBeNull();
    expect(seoParaEndereco('/s/servicos', 'pt', {})).toBeNull();
  });

  it('sem nada gravado, vale a sugestão da língua', () => {
    const pt = seoParaEndereco('/contact', 'pt', {});
    const en = seoParaEndereco('/contact', 'en', {});
    expect(pt.title).toBe('Contacto e apoio ao cliente | Venue1Hub');
    expect(en.title).toBe('Contact and customer support | Venue1Hub');
    expect(pt.noIndex).toBe(false);
  });

  it('o que foi gravado manda, e um campo vazio volta à sugestão', () => {
    const gravadas = {
      '/contact': { noIndex: true, pt: { title: 'Fale connosco', description: '   ' } },
    };
    const v = seoParaEndereco('/contact', 'pt', gravadas);
    expect(v.title).toBe('Fale connosco');
    expect(v.description).toBe(PAGINAS_SEO.find(p => p.path === '/contact').sugestao.pt.description);
    expect(v.noIndex).toBe(true);
  });

  it('junta as palavras-chave sem repetir a principal', () => {
    expect(
      metaKeywords({ focusKeyword: 'Sala de reuniões', keywords: 'sala de reuniões, auditório , ,Lisboa' })
    ).toBe('Sala de reuniões, auditório, Lisboa');
    expect(metaKeywords({ focusKeyword: '', keywords: '' })).toBe('');
  });

  it('todas as páginas têm sugestão completa nas duas línguas, dentro dos limites', () => {
    PAGINAS_SEO.filter(p => !p.modelo).forEach(p => {
      ['pt', 'en'].forEach(l => {
        const v = valoresEmVigor(p, null, l);
        expect(v.title).toBeTruthy();
        expect(v.description).toBeTruthy();
        expect(v.focusKeyword).toBeTruthy();
        expect(v.title.length).toBeLessThanOrEqual(LIMITES_SEO.tituloMax);
        expect(v.description.length).toBeLessThanOrEqual(LIMITES_SEO.descricaoMax);
      });
    });
  });

  it('as sugestões passam a análise do próprio painel, sem avisos', () => {
    ['pt', 'en'].forEach(l => {
      PAGINAS_SEO.filter(p => !p.modelo).forEach(p => {
        const outras = PAGINAS_SEO.filter(o => o.path !== p.path && !o.modelo).map(o => ({
          nome: o.nome,
          valores: o.sugestao[l],
        }));
        const naoBons = analisarSeo(p.sugestao[l], outras).filter(a => a.nivel !== 'bom');
        expect({ pagina: p.path, lingua: l, naoBons }).toEqual({ pagina: p.path, lingua: l, naoBons: [] });
      });
    });
  });

  it('as sugestões não repetem títulos nem descrições entre páginas', () => {
    ['pt', 'en'].forEach(l => {
      const titulos = PAGINAS_SEO.map(p => p.sugestao[l].title);
      const descricoes = PAGINAS_SEO.map(p => p.sugestao[l].description);
      expect(new Set(titulos).size).toBe(titulos.length);
      expect(new Set(descricoes).size).toBe(descricoes.length);
    });
  });
});

describe('seoAnalise', () => {
  const bom = {
    focusKeyword: 'espaço para eventos',
    title: 'Espaço para eventos em Lisboa e Porto | Venue1Hub',
    description:
      'Reserve um espaço para eventos em Lisboa ou no Porto, por hora ou por dia, com pagamento seguro e confirmação imediata.',
  };

  it('dá tudo verde a uma página bem preenchida', () => {
    const a = analisarSeo(bom, []);
    expect(nivelGeral(a)).toBe('bom');
  });

  it('ignora acentos e maiúsculas ao procurar a palavra-chave', () => {
    const a = analisarSeo({ ...bom, focusKeyword: 'ESPACO PARA EVENTOS' }, []);
    expect(a.filter(x => x.texto.includes('palavra-chave')).every(x => x.nivel === 'bom')).toBe(true);
  });

  it('avisa quando o título é longo e quando falta a descrição', () => {
    const a = analisarSeo({ ...bom, title: 'x'.repeat(70), description: '' }, []);
    expect(a.some(x => x.nivel === 'aviso' && x.texto.includes('70 caracteres'))).toBe(true);
    expect(a.some(x => x.nivel === 'mau' && x.texto.includes('meta description'))).toBe(true);
    expect(nivelGeral(a)).toBe('mau');
  });

  it('apanha título repetido noutra página', () => {
    const a = analisarSeo(bom, [{ nome: 'Contacto', valores: { title: bom.title.toUpperCase() } }]);
    expect(a.some(x => x.nivel === 'mau' && x.texto.includes('"Contacto"'))).toBe(true);
  });

  it('marca a página escondida do Google', () => {
    expect(nivelGeral(analisarSeo({ ...bom, noIndex: true }, []))).toBe('mau');
  });

  it('corta como o Google, no fim de uma palavra', () => {
    expect(cortarParaGoogle('curto', 60)).toBe('curto');
    const cortado = cortarParaGoogle('palavra '.repeat(20), 60);
    expect(cortado.endsWith(' …')).toBe(true);
    expect(cortado.length).toBeLessThanOrEqual(62);
  });
});
