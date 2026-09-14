import React, { useState } from 'react';
import { useDispatch } from 'react-redux';

import { NamedLink } from '../../components';
import { fetchVerificationStatus } from '../../ducks/verification.duck';

import css from './VerificationPage.module.css';

/**
 * A Declaração de Conformidade do Host — o Legal Gate.
 *
 * A Declaração (documento n.º 15) diz que o anfitrião declara, antes de
 * publicar, que tem legitimidade sobre o espaço e que a utilização anunciada é
 * legal. Até aqui o documento dizia-o e o produto não pedia nada.
 *
 * É isto que sustenta a posição de intermediário: a Venue1Hub não visita os
 * espaços, e o que a protege é ter pedido e guardado esta declaração.
 *
 * Está nesta página, e não num sítio próprio, porque para quem espera publicar
 * o problema é um só — "o que é que me falta?" — e não dois.
 */

const t = (isEN, pt, en) => (isEN ? en : pt);

/** Rótulos das opções. O servidor guarda a chave; aqui mostra-se o texto. */
const TEXTO_OPCAO = {
  proprietario: { pt: 'Sou proprietário do espaço', en: 'I own the space' },
  arrendatario_com_autorizacao: {
    pt: 'Sou arrendatário e tenho autorização escrita para subarrendar',
    en: 'I am a tenant with written permission to sublet',
  },
  mandatario: {
    pt: 'Represento o proprietário, com poderes para o fazer',
    en: 'I represent the owner, with authority to do so',
  },
  outro: { pt: 'Outro título', en: 'Other basis' },
  particular: { pt: 'Particular', en: 'Private individual' },
  profissional: { pt: 'Profissional / empresa', en: 'Professional / company' },
};

const opcao = (chave, isEN) => {
  const o = TEXTO_OPCAO[chave];
  return o ? t(isEN, o.pt, o.en) : chave;
};

const DeclaracaoHost = ({ isEN, campos, declaracao, juridico }) => {
  const dispatch = useDispatch();
  const [valores, setValores] = useState(() => ({ ...(declaracao || {}) }));
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState(null);
  const [gravada, setGravada] = useState(false);

  if (!campos || campos.length === 0) return null;

  const jaFeita = juridico && juridico.declaracao.length === 0;
  const documentosEmFalta = (juridico && juridico.documentos) || [];

  const mudar = (chave, valor) => setValores(v => ({ ...v, [chave]: valor }));

  const submeter = async e => {
    e.preventDefault();
    setAGravar(true);
    setErro(null);
    try {
      const r = await fetch('/api/verification/declaracao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(valores),
      });
      const corpo = await r.json().catch(() => ({}));
      if (r.ok) {
        setGravada(true);
        // Recarregar o estado: quem acabou de declarar tem de ver o portão
        // abrir-se, e não ficar a olhar para o formulário que já preencheu.
        dispatch(fetchVerificationStatus());
      } else {
        setErro(corpo.error || 'nao-foi-possivel');
      }
    } catch (_) {
      setErro('rede');
    } finally {
      setAGravar(false);
    }
  };

  /** Aceitação dos documentos que faltam — o resto do portão. */
  const aceitarDocumentos = async () => {
    setAGravar(true);
    try {
      await fetch('/api/legal-acceptance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ documentos: 'todos', contexto: 're-aceitacao' }),
      });
      dispatch(fetchVerificationStatus());
    } finally {
      setAGravar(false);
    }
  };

  return (
    <section className={css.declaracao}>
      <h2 className={css.declaracaoTitulo}>
        {t(isEN, 'Declaração de Conformidade', 'Compliance Declaration')}
      </h2>
      <p className={css.declaracaoIntro}>
        {t(
          isEN,
          'Antes de publicar um espaço, precisamos da sua declaração. É o que nos permite funcionar como intermediário: não visitamos os espaços, e é esta declaração que responde por eles.',
          'Before publishing a space, we need your declaration. It is what allows us to act as an intermediary: we do not inspect spaces, and this declaration is what answers for them.'
        )}
      </p>

      {/* A segunda metade do portão: os documentos que esta conta tem de aceitar
          na versão em vigor. Resolve-se aqui, e não noutra página. */}
      {documentosEmFalta.length > 0 ? (
        <div className={css.porAceitar}>
          <p>
            {t(
              isEN,
              'Falta aceitar, na versão em vigor:',
              'Still to accept, in the version in force:'
            )}
          </p>
          <ul>
            {documentosEmFalta.map(d => (
              <li key={d.slug}>
                <NamedLink name="LegalPage" params={{ slug: d.slug }}>
                  {d.slug}
                </NamedLink>{' '}
                — {t(isEN, 'versão', 'version')} {d.versao}
              </li>
            ))}
          </ul>
          <button type="button" className={css.botaoSecundario} onClick={aceitarDocumentos} disabled={aGravar}>
            {t(isEN, 'Li e aceito estes documentos', 'I have read and accept these documents')}
          </button>
        </div>
      ) : null}

      {jaFeita && !gravada ? (
        <p className={css.declaracaoFeita}>
          {t(isEN, 'Declaração entregue. Obrigado.', 'Declaration submitted. Thank you.')}
        </p>
      ) : null}

      <form onSubmit={submeter} className={css.declaracaoForm}>
        {campos.map(campo => {
          const label = t(isEN, campo.label, campo.labelEN);
          if (campo.tipo === 'confirmacao') {
            return (
              <label key={campo.chave} className={css.confirmacao}>
                <input
                  type="checkbox"
                  checked={valores[campo.chave] === true}
                  onChange={e => mudar(campo.chave, e.target.checked)}
                />
                <span>{label}</span>
              </label>
            );
          }
          if (campo.tipo === 'escolha') {
            return (
              <label key={campo.chave} className={css.campoLabel}>
                {label}
                <select
                  className={css.campo}
                  value={valores[campo.chave] || ''}
                  onChange={e => mudar(campo.chave, e.target.value)}
                >
                  <option value="">{t(isEN, 'Escolher…', 'Choose…')}</option>
                  {campo.opcoes.map(o => (
                    <option key={o} value={o}>
                      {opcao(o, isEN)}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          return (
            <label key={campo.chave} className={css.campoLabel}>
              {label}
              <input
                className={css.campo}
                type="text"
                value={valores[campo.chave] || ''}
                onChange={e => mudar(campo.chave, e.target.value)}
              />
            </label>
          );
        })}

        {erro ? (
          <p className={css.declaracaoErro}>
            {erro === 'declaracao-incompleta'
              ? t(isEN, 'Falta preencher ou confirmar algum campo.', 'Some field is missing or unconfirmed.')
              : t(isEN, 'Não foi possível gravar. Tente novamente.', 'Could not save. Please try again.')}
          </p>
        ) : null}

        {gravada ? (
          <p className={css.declaracaoFeita}>
            {t(isEN, 'Declaração gravada.', 'Declaration saved.')}
          </p>
        ) : null}

        <button type="submit" className={css.botaoPrimario} disabled={aGravar}>
          {t(isEN, 'Entregar declaração', 'Submit declaration')}
        </button>
      </form>
    </section>
  );
};

export default DeclaracaoHost;
