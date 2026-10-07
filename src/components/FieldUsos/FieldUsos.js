import React, { useState } from 'react';
import classNames from 'classnames';
import { FieldArray } from 'react-final-form-arrays';
import { useFormState } from 'react-final-form';

import { FieldCheckbox, ValidationError } from '../../components';
import { idDeUso, nomeDaSubcategoria } from '../../util/categorias';

import css from './FieldUsos.module.css';

/**
 * "Usos do espaço" — onde o anfitrião diz para que mais serve o seu espaço.
 *
 * PORQUE É QUE ISTO NÃO É O CAMPO NORMAL
 *
 * Um campo de múltipla escolha é desenhado, por omissão, como uma lista plana
 * de caixas. Com as nossas 60 subcategorias isso eram 60 linhas seguidas, sem
 * dizer onde acaba "Trabalho & Reuniões" e começa "Educação & Cultura" — e no
 * telemóvel um ecrã inteiro a passar por baixo do dedo.
 *
 * Aqui as opções vêm agrupadas pelas 9 categorias principais, cada grupo
 * fechado até alguém lhe pegar, com o número de usos marcados à vista. Nove
 * linhas em vez de sessenta, e a mesma árvore que o anfitrião acabou de usar
 * lá em cima para escolher a categoria principal.
 *
 * A CATEGORIA PRINCIPAL NÃO APARECE NA LISTA
 *
 * Ela é acrescentada aos usos quando o anúncio é gravado — é isso que permite
 * à pesquisa fazer uma pergunta só (ver util/categorias.js). Se ficasse aqui
 * como caixa, o anfitrião podia desmarcá-la e nada aconteceria: um controlo
 * que ignora quem lhe toca é pior do que não existir. Fica dita por palavras,
 * em cima, onde se percebe que já conta.
 */
const Grupo = props => {
  const { categoria, opcoes, name, formId, selecionados, aberto, onToggle } = props;

  const marcados = opcoes.filter(o => selecionados.includes(o.key)).length;
  const idPainel = `${formId || 'usos'}-grupo-${categoria.id}`;

  return (
    <li className={css.grupo}>
      <button
        type="button"
        className={classNames(css.cabecalho, { [css.cabecalhoAberto]: aberto })}
        aria-expanded={aberto}
        aria-controls={idPainel}
        onClick={onToggle}
      >
        <span className={css.nomeDoGrupo}>{categoria.name}</span>
        {marcados > 0 ? <span className={css.contador}>{marcados}</span> : null}
        <span className={css.seta} aria-hidden="true" />
      </button>

      <div id={idPainel} className={css.painel} hidden={!aberto}>
        <ul className={css.opcoes}>
          {opcoes.map(opcao => (
            <li key={opcao.key} className={css.opcao}>
              <FieldCheckbox
                id={`${formId ? `${formId}.` : ''}${name}.${opcao.key}`}
                name={name}
                label={opcao.label}
                value={opcao.key}
              />
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
};

const FieldUsos = props => {
  const { name, formId, label, categories = [], enumOptions = [], className, validate } = props;

  // A categoria principal vem do próprio formulário: é a que o anfitrião
  // acabou de escolher na árvore, uns campos acima.
  const { values } = useFormState({ subscription: { values: true } });
  const categoriaPrincipal = values?.categoryLevel2 || null;
  const principalComoUso = categoriaPrincipal ? idDeUso(categoriaPrincipal) : null;
  const nomeDaPrincipal = categoriaPrincipal
    ? nomeDaSubcategoria(categories, categoriaPrincipal)
    : null;

  const opcoesValidas = new Set(enumOptions.map(o => o.option));

  // Cada grupo leva as suas subcategorias, traduzidas para os ids do campo e
  // sem a categoria principal. Grupos que fiquem vazios não aparecem.
  const grupos = categories
    .map(categoria => ({
      categoria,
      opcoes: (categoria.subcategories || [])
        .map(sub => ({ key: idDeUso(sub.id), label: sub.name }))
        .filter(o => opcoesValidas.has(o.key) && o.key !== principalComoUso),
    }))
    .filter(g => g.opcoes.length > 0);

  return (
    <FieldArray name={name} validate={validate}>
      {({ fields, meta }) => {
        const selecionados = fields.value || [];
        const total = selecionados.filter(v => v !== principalComoUso).length;

        return (
          <Corpo
            className={className}
            label={label}
            formId={formId}
            nomeDaPrincipal={nomeDaPrincipal}
            grupos={grupos}
            nomeDoCampo={fields.name}
            selecionados={selecionados}
            total={total}
            meta={meta}
          />
        );
      }}
    </FieldArray>
  );
};

/**
 * Separado do FieldUsos por causa do estado "secção aberta": ele depende do
 * número de usos já marcados, que só se conhece dentro do FieldArray.
 */
const Corpo = props => {
  const {
    className,
    label,
    formId,
    nomeDaPrincipal,
    grupos,
    nomeDoCampo,
    selecionados,
    total,
    meta,
  } = props;

  /**
   * Os grupos onde já há escolhas começam abertos.
   *
   * Senão, abrir a secção de um anúncio já preenchido dava nove linhas fechadas
   * e um número num cantinho: o anfitrião tinha de ir à caça do que ele próprio
   * tinha marcado. Só o estado inicial é que se decide aqui — a partir daí
   * manda quem clica, e marcar uma opção não anda com a lista por baixo do dedo.
   */
  const [abertos, setAbertos] = useState(() =>
    grupos.reduce(
      (acc, g) =>
        g.opcoes.some(o => selecionados.includes(o.key)) ? { ...acc, [g.categoria.id]: true } : acc,
      {}
    )
  );
  const alternar = id => setAbertos(a => ({ ...a, [id]: !a[id] }));

  /**
   * FECHADO POR OMISSÃO, E PORQUÊ
   *
   * Uns campos acima o anfitrião escolheu a categoria numa árvore. Se logo a
   * seguir aparecessem as nove categorias outra vez, em lista, ninguém lê isto
   * como uma pergunta nova — lê como repetição, e repetição num formulário
   * parece erro. Fechado, é uma linha só: uma pergunta de seguimento, que quem
   * não quiser ignora.
   *
   * A editar um anúncio que já tem usos marcados abre sozinho: aí não é uma
   * pergunta nova, é o que ele escolheu da última vez, e esconder isso obrigava
   * a procurar.
   */
  const [aberto, setAberto] = useState(total > 0);
  const idSeccao = `${formId || 'usos'}-usos-seccao`;

  const resumo =
    total === 0
      ? 'Nenhum uso adicional marcado.'
      : total === 1
      ? '1 uso adicional marcado.'
      : `${total} usos adicionais marcados.`;

  return (
    <fieldset className={classNames(css.root, className)}>
      <legend className={css.titulo}>{label}</legend>

      <button
        type="button"
        className={classNames(css.convite, { [css.conviteAberto]: aberto })}
        aria-expanded={aberto}
        aria-controls={idSeccao}
        onClick={() => setAberto(a => !a)}
      >
        <span className={css.convitePergunta}>
          {nomeDaPrincipal ? (
            <>
              Este espaço também serve para outra coisa além de <strong>{nomeDaPrincipal}</strong>?
            </>
          ) : (
            <>Este espaço serve para mais do que uma coisa?</>
          )}
        </span>
        <span className={css.conviteEstado}>
          {total > 0 ? `${total} marcado${total === 1 ? '' : 's'}` : 'Opcional'}
        </span>
        <span className={css.seta} aria-hidden="true" />
      </button>

      <div id={idSeccao} className={css.seccao} hidden={!aberto}>
        <p className={css.explicacao}>
          {nomeDaPrincipal ? (
            <>
              Já aparece nas pesquisas de <strong>{nomeDaPrincipal}</strong> — isso está tratado.
              Marque aqui os outros usos e ele passa a aparecer também nessas.
            </>
          ) : (
            <>
              Marque tudo aquilo para que o espaço serve. Ele passa a aparecer nas pesquisas de cada
              um desses usos.
            </>
          )}
        </p>

        <ul className={css.grupos}>
          {grupos.map(g => (
            <Grupo
              key={g.categoria.id}
              categoria={g.categoria}
              opcoes={g.opcoes}
              name={nomeDoCampo}
              formId={formId}
              selecionados={selecionados}
              aberto={!!abertos[g.categoria.id]}
              onToggle={() => alternar(g.categoria.id)}
            />
          ))}
        </ul>

        <p className={css.resumo} aria-live="polite">
          {resumo}
        </p>
      </div>

      <ValidationError fieldMeta={{ ...meta }} />
    </fieldset>
  );
};

export default FieldUsos;
