/**
 * O armazenamento do painel SEO. O R2 é simulado: o que interessa é o que se
 * grava, o que se recusa, e que uma falha de leitura não apaga o que estava.
 */

jest.mock('./r2', () => ({
  isConfigured: () => true,
  getSignedUrl: key => `https://r2.example/${key}`,
  putObject: jest.fn(async key => key),
}));

const r2 = require('./r2');
const seo = require('./seoSettings');

const respostaJson = (status, corpo) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => corpo,
});

describe('seoSettings', () => {
  let noBucket;

  beforeEach(() => {
    noBucket = null;
    r2.putObject.mockClear();
    r2.putObject.mockImplementation(async (key, body) => {
      noBucket = JSON.parse(body.toString('utf8'));
      return key;
    });
    global.fetch = jest.fn(async () =>
      noBucket ? respostaJson(200, noBucket) : respostaJson(404, null)
    );
  });

  it('sem objeto no bucket, não há nada gravado', async () => {
    expect(await seo.recarregar()).toBe(true);
    expect(seo.obterPaginas()).toEqual({});
  });

  it('grava uma página e fica logo em memória', async () => {
    const r = await seo.gravarPagina(
      '/contact',
      { noIndex: false, pt: { title: '  Fale   connosco ', description: 'Texto' }, en: {} },
      'admin@venue1hub.com'
    );
    expect(r.ok).toBe(true);
    expect(r2.putObject).toHaveBeenCalledWith(seo.CHAVE_R2, expect.any(Buffer), 'application/json');
    const pagina = seo.obterPaginas()['/contact'];
    expect(pagina.pt.title).toBe('Fale connosco');
    expect(pagina.updatedBy).toBe('admin@venue1hub.com');
    expect(pagina.en).toEqual({});
  });

  it('não apaga outra página gravada entretanto', async () => {
    await seo.gravarPagina('/contact', { pt: { title: 'A' } }, 'a@x.pt');
    await seo.gravarPagina('/sobre-nos', { pt: { title: 'B' } }, 'b@x.pt');
    expect(Object.keys(noBucket.paginas).sort()).toEqual(['/contact', '/sobre-nos']);
  });

  it('recusa páginas desconhecidas e textos demasiado longos', async () => {
    expect(await seo.gravarPagina('/l/qualquer', { pt: { title: 'x' } })).toEqual({
      ok: false,
      erro: 'pagina-desconhecida',
    });
    const longo = await seo.gravarPagina('/contact', { pt: { title: 'x'.repeat(201) } });
    expect(longo).toEqual({ ok: false, erro: 'title-pt-demasiado-longo' });
    expect(r2.putObject).not.toHaveBeenCalled();
  });

  it('ignora o que no bucket não corresponde a nenhuma página', () => {
    const f = seo.filtrarGuardado({
      paginas: { '/nao-existe': { pt: { title: 'x' } }, '/': { pt: { title: 'Início', lixo: 1 } } },
    });
    expect(Object.keys(f)).toEqual(['/']);
    expect(f['/'].pt).toEqual({ title: 'Início' });
  });

  it('se a leitura falhar, fica o que estava', async () => {
    await seo.gravarPagina('/contact', { pt: { title: 'Guardado' } }, 'a@x.pt');
    global.fetch = jest.fn(async () => respostaJson(500, null));
    expect(await seo.recarregar()).toBe(false);
    expect(seo.obterPaginas()['/contact'].pt.title).toBe('Guardado');
  });
});
