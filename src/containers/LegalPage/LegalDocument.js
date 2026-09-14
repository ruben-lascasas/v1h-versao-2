import React from 'react';
import css from './LegalPage.module.css';

/**
 * Renderiza um documento jurídico a partir dos blocos que o conversor produz.
 *
 * Um componente para os 38 documentos. O formato dos blocos está descrito em
 * scripts/converterJuridicos.js — é lá que se muda, se um dia for preciso.
 */

/** Um parágrafo pode ser texto simples ou partes com negrito e hiperligações. */
const Partes = ({ c }) => {
  if (typeof c === 'string') return <Texto valor={c} />;
  return (
    <>
      {c.map((parte, i) => {
        const conteudo = <Texto valor={parte.t} />;
        if (parte.href) {
          // `noopener` obrigatório: sem ele a página de destino ganha acesso a
          // window.opener e pode redirecionar a nossa.
          return (
            <a key={i} href={parte.href} target="_blank" rel="noopener noreferrer" className={css.link}>
              {conteudo}
            </a>
          );
        }
        return parte.b ? <strong key={i}>{conteudo}</strong> : <React.Fragment key={i}>{conteudo}</React.Fragment>;
      })}
    </>
  );
};

/**
 * As quebras de linha dentro de um parágrafo vêm do Word como `\n`.
 *
 * Aparecem em moradas e em blocos de identificação, onde a quebra é o que
 * separa a rua do código postal. Um `white-space: pre-line` no CSS resolveria,
 * mas mudava o comportamento do resto do texto — assim a quebra é explícita e
 * só acontece onde o documento a tem.
 */
const Texto = ({ valor }) => {
  if (!valor.includes('\n')) return <>{valor}</>;
  const linhas = valor.split('\n');
  return (
    <>
      {linhas.map((l, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {l}
        </React.Fragment>
      ))}
    </>
  );
};

/** Itens de lista, com os níveis de indentação que o documento define. */
const Lista = ({ itens }) => (
  <ul className={css.lista}>
    {itens.map((item, i) => (
      <li key={i} className={item.n > 0 ? css.itemNivel1 : undefined}>
        <Partes c={item.c} />
      </li>
    ))}
  </ul>
);

/**
 * Tabela. A primeira linha é sempre cabeçalho nestes documentos.
 *
 * Envolvida num contentor com scroll horizontal próprio: a tabela de cookies
 * tem cinco colunas e não cabe num telemóvel. Sem isto, era a página inteira a
 * deslizar para o lado.
 */
const Tabela = ({ linhas }) => {
  const [cabecalho, ...corpo] = linhas;
  return (
    <div className={css.tabelaScroll}>
      <table className={css.tabela}>
        <thead>
          <tr>
            {cabecalho.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {corpo.map((linha, i) => (
            <tr key={i}>
              {linha.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Âncora estável para o índice, derivada do texto do título. */
export const idDaSeccao = (texto, i) =>
  `s-${i}-${texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)}`;

const LegalDocument = ({ blocos }) => (
  <div className={css.documento}>
    {blocos.map((b, i) => {
      switch (b.tipo) {
        case 'h2':
          return (
            <h2 key={i} id={idDaSeccao(b.texto, i)} className={css.h2}>
              {b.texto}
            </h2>
          );
        case 'h3':
          return (
            <h3 key={i} id={idDaSeccao(b.texto, i)} className={css.h3}>
              {b.texto}
            </h3>
          );
        case 'h4':
          return (
            <h4 key={i} className={css.h4}>
              {b.texto}
            </h4>
          );
        case 'lista':
          return <Lista key={i} itens={b.itens} />;
        case 'tabela':
          return <Tabela key={i} linhas={b.linhas} />;
        default:
          return (
            <p key={i} className={css.p}>
              <Partes c={b.c} />
            </p>
          );
      }
    })}
  </div>
);

export default LegalDocument;
