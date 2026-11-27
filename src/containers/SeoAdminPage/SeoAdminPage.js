import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import classNames from 'classnames';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { setSeoPaginas } from '../../ducks/seo.duck';
import { useConfiguration } from '../../context/configurationContext';
import { Page, LayoutSingleColumn, H2 } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import { PAGINAS_SEO, LINGUAS_SEO, valoresEmVigor } from '../../util/seoOverrides';
import {
  LIMITES_SEO,
  analisarSeo,
  nivelGeral,
  cortarParaGoogle,
} from '../../util/seoAnalise';
import {
  VARIAVEIS_ANUNCIO,
  ANUNCIO_EXEMPLO,
  tituloDoModelo,
  descricaoDoModelo,
} from '../../util/seoAnuncios';

import css from './SeoAdminPage.module.css';

/**
 * Painel SEO: título, meta description e palavras-chave das páginas fixas do
 * site, com pré-visualização no Google e uma análise ao estilo do Yoast.
 *
 * Quem pode entrar decide o servidor (ADMIN_EMAILS), como no painel de
 * verificações. As páginas e os textos sugeridos estão em
 * src/config/seoPages.json; o que se grava aqui vale por cima da sugestão.
 */

const NOME_LINGUA = { pt: 'Português', en: 'English' };

const formatarData = iso => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('pt-PT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return null;
  }
};

/** O formulário de uma página parte sempre do que está em vigor. */
const formularioInicial = (pagina, gravado) => ({
  noIndex: Boolean(gravado?.noIndex),
  ...LINGUAS_SEO.reduce((acc, l) => {
    const { noIndex, ...campos } = valoresEmVigor(pagina, gravado, l);
    return { ...acc, [l]: campos };
  }, {}),
});

const formulariosIniciais = gravadas =>
  PAGINAS_SEO.reduce(
    (acc, p) => ({ ...acc, [p.path]: formularioInicial(p, gravadas?.[p.path]) }),
    {}
  );

/** Num modelo, o que se analisa e mostra é o resultado num anúncio de exemplo. */
const exemploDoModelo = valores => ({
  title: tituloDoModelo(valores.title, ANUNCIO_EXEMPLO),
  description: descricaoDoModelo(valores.description, ANUNCIO_EXEMPLO),
});

const analiseDe = (formularios, caminho, lingua) => {
  const f = formularios[caminho];
  const pagina = PAGINAS_SEO.find(p => p.path === caminho);
  if (pagina?.modelo) {
    return analisarSeo(exemploDoModelo(f[lingua]), [], { semPalavraChave: true });
  }
  const outras = PAGINAS_SEO.filter(p => p.path !== caminho && !p.modelo).map(p => ({
    nome: p.nome,
    valores: formularios[p.path]?.[lingua] || {},
  }));
  return analisarSeo({ ...f[lingua], noIndex: f.noIndex }, outras);
};

const Contador = ({ valor, min, max }) => {
  const n = String(valor || '').length;
  const estado = n === 0 ? 'mau' : n < min || n > max ? 'aviso' : 'bom';
  return (
    <span className={classNames(css.contador, css[`nivel_${estado}`])}>
      {n} / {max}
    </span>
  );
};

const Campo = ({ id, rotulo, ajuda, children, contador }) => (
  <div className={css.campo}>
    <div className={css.campoTopo}>
      <label htmlFor={id} className={css.rotulo}>
        {rotulo}
      </label>
      {contador}
    </div>
    {children}
    {ajuda ? <p className={css.ajuda}>{ajuda}</p> : null}
  </div>
);

const PreviewGoogle = ({ url, titulo, descricao, noIndex }) => {
  let endereco = url;
  try {
    const u = new URL(url);
    endereco = [u.host, ...u.pathname.split('/').filter(Boolean)].join(' › ');
  } catch (_) {
    // fica o endereço tal como veio
  }
  return (
    <div className={css.preview} aria-label="Pré-visualização no Google">
      <p className={css.previewRotulo}>Como deve aparecer no Google</p>
      {noIndex ? (
        <p className={css.previewEscondida}>Esta página não vai aparecer no Google.</p>
      ) : (
        <div className={css.previewCaixa}>
          <p className={css.previewUrl}>{endereco}</p>
          <p className={css.previewTitulo}>{cortarParaGoogle(titulo, LIMITES_SEO.tituloMax) || '(sem título)'}</p>
          <p className={css.previewDescricao}>
            {cortarParaGoogle(descricao, LIMITES_SEO.descricaoMax) || '(sem descrição)'}
          </p>
        </div>
      )}
    </div>
  );
};

export const SeoAdminPageComponent = props => {
  const { scrollingDisabled, onGravado } = props;
  const config = useConfiguration();
  const raiz = (config?.marketplaceRootURL || 'https://venue1hub.com').replace(/\/$/, '');

  const [estado, setEstado] = useState({ loading: true, error: null, armazenamento: null });
  const [gravadas, setGravadas] = useState({});
  const [formularios, setFormularios] = useState(() => formulariosIniciais({}));
  const [caminho, setCaminho] = useState(PAGINAS_SEO[0].path);
  const [lingua, setLingua] = useState('pt');
  const [aGravar, setAGravar] = useState(false);
  const [mensagem, setMensagem] = useState(null);

  const carregar = useCallback(async () => {
    setEstado(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch('/api/seo-admin', { credentials: 'include' });
      if (res.status === 403) {
        setEstado({ loading: false, error: 'forbidden', armazenamento: null });
        return;
      }
      if (!res.ok) throw new Error('falhou');
      const dados = await res.json();
      setGravadas(dados.paginas || {});
      setFormularios(formulariosIniciais(dados.paginas || {}));
      setEstado({ loading: false, error: null, armazenamento: dados.armazenamento });
    } catch (_) {
      setEstado({ loading: false, error: 'failed', armazenamento: null });
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const pagina = PAGINAS_SEO.find(p => p.path === caminho);
  const form = formularios[caminho];
  const valores = form[lingua];
  const inicial = useMemo(() => formularioInicial(pagina, gravadas[caminho]), [pagina, gravadas, caminho]);
  const alterada = p =>
    JSON.stringify(formularios[p]) !== JSON.stringify(formularioInicial(PAGINAS_SEO.find(x => x.path === p), gravadas[p]));
  const temAlteracoes = JSON.stringify(form) !== JSON.stringify(inicial);

  const analise = analiseDe(formularios, caminho, lingua);

  const mudar = (campo, valor) => {
    setMensagem(null);
    setFormularios(fs => ({
      ...fs,
      [caminho]: { ...fs[caminho], [lingua]: { ...fs[caminho][lingua], [campo]: valor } },
    }));
  };

  const mudarNoIndex = valor => {
    setMensagem(null);
    setFormularios(fs => ({ ...fs, [caminho]: { ...fs[caminho], noIndex: valor } }));
  };

  const reporSugestao = () => {
    setMensagem(null);
    setFormularios(fs => ({
      ...fs,
      [caminho]: {
        ...fs[caminho],
        [lingua]: {
          ...fs[caminho][lingua],
          keywords: '',
          socialTitle: '',
          socialDescription: '',
          ...pagina.sugestao[lingua],
        },
      },
    }));
  };

  const descartar = () => {
    setMensagem(null);
    setFormularios(fs => ({ ...fs, [caminho]: inicial }));
  };

  const gravar = async () => {
    setAGravar(true);
    setMensagem(null);
    try {
      const res = await fetch('/api/seo-admin/pagina', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caminho, valores: form }),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok) {
        const motivo = dados?.error || '';
        setMensagem({
          tipo: 'erro',
          texto: motivo.endsWith('demasiado-longo')
            ? 'Há um campo demasiado longo. Encurte-o e volte a gravar.'
            : res.status === 403
            ? 'Sem permissão. Inicie sessão com uma conta de administrador.'
            : 'Não foi possível gravar. Tente outra vez.',
        });
        return;
      }
      setGravadas(dados.paginas || {});
      setFormularios(fs => ({
        ...fs,
        [caminho]: formularioInicial(pagina, dados.paginas?.[caminho]),
      }));
      if (onGravado) onGravado(dados.paginas || {});
      setMensagem({ tipo: 'ok', texto: 'Gravado. Já está em vigor no site.' });
    } catch (_) {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível gravar. Verifique a ligação e tente outra vez.' });
    } finally {
      setAGravar(false);
    }
  };

  const gravado = gravadas[caminho];
  const idCampo = nome => `seo-${nome}-${lingua}`;
  const eModelo = Boolean(pagina.modelo);
  const mostrado = eModelo ? exemploDoModelo(valores) : valores;

  // Onde as variáveis entram: no último campo de texto em que se clicou.
  const ultimoCampo = useRef({ campo: 'title', el: null });
  const lembrarCampo = campo => e => {
    ultimoCampo.current = { campo, el: e.target };
  };
  const inserirVariavel = nome => {
    const { campo, el } = ultimoCampo.current;
    const atual = String(valores[campo] || '');
    const noCampo = el && el.id === idCampo(campo);
    const inicio = noCampo ? el.selectionStart ?? atual.length : atual.length;
    const fim = noCampo ? el.selectionEnd ?? atual.length : atual.length;
    mudar(campo, `${atual.slice(0, inicio)}{${nome}}${atual.slice(fim)}`);
  };

  return (
    <Page title="SEO | Venue1Hub" scrollingDisabled={scrollingDisabled} noIndex>
      <LayoutSingleColumn hideRecentlyViewed topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.root}>
          <H2 as="h1" className={css.title}>
            SEO
          </H2>
          <p className={css.intro}>
            O título e a descrição que o Google mostra para cada página do site. Os anúncios usam
            automaticamente o título e o texto do próprio anúncio.
          </p>

          {estado.error === 'forbidden' ? (
            <p className={css.notice}>Esta página é restrita. Inicie sessão com uma conta autorizada.</p>
          ) : estado.error ? (
            <p className={css.notice}>Não foi possível carregar. Recarregue a página.</p>
          ) : estado.loading ? (
            <p className={css.notice}>A carregar…</p>
          ) : (
            <>
              {estado.armazenamento === 'local' ? (
                <p className={css.alerta}>
                  O armazenamento R2 não está configurado neste servidor. O que gravar fica só aqui e
                  perde-se no próximo deploy.
                </p>
              ) : null}

              <div className={css.grelha}>
                <nav className={css.lista} aria-label="Páginas">
                  {PAGINAS_SEO.map(p => {
                    const nivel = nivelGeral(analiseDe(formularios, p.path, 'pt'));
                    return (
                      <button
                        key={p.path}
                        type="button"
                        className={classNames(css.itemLista, { [css.itemListaAtivo]: p.path === caminho })}
                        onClick={() => {
                          setCaminho(p.path);
                          setMensagem(null);
                        }}
                        aria-current={p.path === caminho ? 'page' : undefined}
                      >
                        <span className={classNames(css.ponto, css[`ponto_${nivel}`])} aria-hidden="true" />
                        <span className={css.itemTexto}>
                          <span className={css.itemNome}>
                            {p.nome}
                            {alterada(p.path) ? <span className={css.porGravar}> · por gravar</span> : null}
                          </span>
                          <span className={css.itemCaminho}>{p.path}</span>
                        </span>
                      </button>
                    );
                  })}
                </nav>

                <section className={css.editor}>
                  <div className={css.editorTopo}>
                    <div>
                      <h2 className={css.editorTitulo}>{pagina.nome}</h2>
                      {eModelo ? (
                        <span className={css.editorLink}>Vale para todos os anúncios</span>
                      ) : (
                        <a className={css.editorLink} href={pagina.path} target="_blank" rel="noopener noreferrer">
                          {raiz}
                          {pagina.path === '/' ? '' : pagina.path}
                        </a>
                      )}
                    </div>
                    <div className={css.linguas} role="tablist" aria-label="Língua">
                      {LINGUAS_SEO.map(l => (
                        <button
                          key={l}
                          type="button"
                          role="tab"
                          aria-selected={l === lingua}
                          className={classNames(css.lingua, { [css.linguaAtiva]: l === lingua })}
                          onClick={() => setLingua(l)}
                        >
                          {NOME_LINGUA[l]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {eModelo ? (
                    <div className={css.modelo}>
                      <p className={css.ajuda}>
                        Cada anúncio troca as variáveis pelos seus dados. Um bloco entre{' '}
                        <code>[ ]</code> desaparece se o anúncio não tiver esse dado, e se o título
                        passar dos {LIMITES_SEO.tituloMax} caracteres tiram-se os blocos{' '}
                        <code>[ ]</code> antes de o Google o cortar. A descrição é cortada a{' '}
                        {LIMITES_SEO.descricaoMax}.
                      </p>
                      <div className={css.variaveis}>
                        {VARIAVEIS_ANUNCIO.map(v => (
                          <button
                            key={v.nome}
                            type="button"
                            className={css.variavel}
                            title={v.descricao}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => inserirVariavel(v.nome)}
                          >
                            {`{${v.nome}}`}
                          </button>
                        ))}
                      </div>
                      <p className={css.ajuda}>
                        Clique numa variável para a pôr onde está o cursor. Pré-visualização com um
                        anúncio de exemplo: “{ANUNCIO_EXEMPLO.titulo}”, em {ANUNCIO_EXEMPLO.cidade}.
                      </p>
                    </div>
                  ) : null}

                  <PreviewGoogle
                    url={eModelo ? `${raiz}/l/sala-de-eventos` : `${raiz}${pagina.path === '/' ? '/' : pagina.path}`}
                    titulo={mostrado.title}
                    descricao={mostrado.description}
                    noIndex={!eModelo && form.noIndex}
                  />

                  {eModelo ? null : (
                  <Campo
                    id={idCampo('focusKeyword')}
                    rotulo="Palavra-chave principal"
                    ajuda="A pesquisa no Google por que quer que esta página apareça. Serve para a análise em baixo."
                  >
                    <input
                      id={idCampo('focusKeyword')}
                      className={css.input}
                      value={valores.focusKeyword}
                      maxLength={100}
                      onChange={e => mudar('focusKeyword', e.target.value)}
                    />
                  </Campo>
                  )}

                  <Campo
                    id={idCampo('title')}
                    rotulo="Título"
                    contador={<Contador valor={mostrado.title} min={LIMITES_SEO.tituloMin} max={LIMITES_SEO.tituloMax} />}
                  >
                    <input
                      id={idCampo('title')}
                      className={css.input}
                      value={valores.title}
                      maxLength={200}
                      onFocus={lembrarCampo('title')}
                      onSelect={lembrarCampo('title')}
                      onChange={e => mudar('title', e.target.value)}
                    />
                  </Campo>

                  <Campo
                    id={idCampo('description')}
                    rotulo="Meta description"
                    contador={
                      <Contador
                        valor={mostrado.description}
                        min={LIMITES_SEO.descricaoMin}
                        max={LIMITES_SEO.descricaoMax}
                      />
                    }
                  >
                    <textarea
                      id={idCampo('description')}
                      className={css.textarea}
                      rows={3}
                      value={valores.description}
                      maxLength={400}
                      onFocus={lembrarCampo('description')}
                      onSelect={lembrarCampo('description')}
                      onChange={e => mudar('description', e.target.value)}
                    />
                  </Campo>

                  {eModelo ? null : (
                  <Campo
                    id={idCampo('keywords')}
                    rotulo="Outras palavras-chave"
                    ajuda="Separadas por vírgulas. Vão para a meta tag keywords, com a principal. O Google ignora essa tag; outros motores podem usá-la."
                  >
                    <input
                      id={idCampo('keywords')}
                      className={css.input}
                      value={valores.keywords}
                      maxLength={400}
                      placeholder="ex.: sala de reuniões Lisboa, espaço para eventos"
                      onChange={e => mudar('keywords', e.target.value)}
                    />
                  </Campo>
                  )}

                  <details className={css.social}>
                    <summary>Partilha em redes sociais (opcional)</summary>
                    <p className={css.ajuda}>
                      O que aparece ao partilhar a página no WhatsApp, Facebook ou LinkedIn. Vazio usa o
                      título e a descrição de cima.
                    </p>
                    <Campo id={idCampo('socialTitle')} rotulo="Título para partilha">
                      <input
                        id={idCampo('socialTitle')}
                        className={css.input}
                        value={valores.socialTitle}
                        maxLength={200}
                        placeholder={valores.title}
                        onChange={e => mudar('socialTitle', e.target.value)}
                      />
                    </Campo>
                    <Campo id={idCampo('socialDescription')} rotulo="Descrição para partilha">
                      <textarea
                        id={idCampo('socialDescription')}
                        className={css.textarea}
                        rows={2}
                        value={valores.socialDescription}
                        maxLength={400}
                        placeholder={valores.description}
                        onChange={e => mudar('socialDescription', e.target.value)}
                      />
                    </Campo>
                  </details>

                  {eModelo ? null : (
                  <label className={css.noIndex}>
                    <input type="checkbox" checked={form.noIndex} onChange={e => mudarNoIndex(e.target.checked)} />
                    <span>
                      Esconder esta página do Google (noindex). Vale para as duas línguas.
                    </span>
                  </label>
                  )}

                  <div className={css.analise}>
                    <p className={css.analiseTitulo}>Análise ({NOME_LINGUA[lingua]})</p>
                    <ul className={css.analiseLista}>
                      {analise.map((a, i) => (
                        <li key={i} className={css.analiseItem}>
                          <span className={classNames(css.ponto, css[`ponto_${a.nivel}`])} aria-hidden="true" />
                          <span>{a.texto}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className={css.acoes}>
                    <button
                      type="button"
                      className={css.botaoPrincipal}
                      onClick={gravar}
                      disabled={aGravar || !temAlteracoes}
                    >
                      {aGravar ? 'A gravar…' : 'Gravar'}
                    </button>
                    {temAlteracoes ? (
                      <button type="button" className={css.botaoSecundario} onClick={descartar} disabled={aGravar}>
                        Descartar alterações
                      </button>
                    ) : null}
                    <button type="button" className={css.botaoLink} onClick={reporSugestao} disabled={aGravar}>
                      Repor o texto sugerido ({NOME_LINGUA[lingua]})
                    </button>
                  </div>
                  {mensagem ? (
                    <p className={mensagem.tipo === 'ok' ? css.mensagemOk : css.mensagemErro} role="status">
                      {mensagem.texto}
                    </p>
                  ) : null}
                  <p className={css.meta}>
                    {gravado?.updatedAt
                      ? `Última alteração: ${formatarData(gravado.updatedAt)}${gravado.updatedBy ? ` por ${gravado.updatedBy}` : ''}.`
                      : 'Ainda não foi alterada no painel: está em vigor o texto sugerido.'}
                  </p>
                </section>
              </div>
            </>
          )}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
});

const mapDispatchToProps = dispatch => ({
  onGravado: paginas => dispatch(setSeoPaginas(paginas)),
});

export default compose(connect(mapStateToProps, mapDispatchToProps))(SeoAdminPageComponent);
