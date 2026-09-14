import React, { useEffect, useState } from 'react';

import { NamedLink } from '../../components';
import { documentoPorSlug } from '../../config/legalDocuments';
import css from './LegalCentrePage.module.css';

/**
 * Os documentos que esta conta aceitou.
 *
 * Responde à pergunta "onde é que eu vejo o que aceitei?" sem duplicar os
 * documentos por utilizador: guarda-se o ponteiro — slug, versão, momento — e
 * o texto continua a ser um só, na sua página.
 *
 * Só aparece a quem tem sessão iniciada. Para um visitante anónimo, o endpoint
 * responde 401 e este bloco simplesmente não se mostra.
 */

const dataCurta = iso => {
  // Formatada à mão, e não com toLocaleDateString, pela mesma razão de sempre
  // neste projeto: a página é pré-renderizada no servidor e uma formatação
  // dependente do ICU dá divergência na hidratação.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};

const MinhasAceitacoes = ({ isEN }) => {
  const [estado, setEstado] = useState(null);

  useEffect(() => {
    let vivo = true;
    fetch('/api/legal-acceptance', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (vivo) setEstado(d);
      })
      .catch(() => {
        // Sem sessão, ou falha de rede. Não há nada a mostrar e não há nada a
        // explicar a quem nem sequer tem conta.
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!estado || !Array.isArray(estado.aceites) || estado.aceites.length === 0) return null;

  // Do histórico completo mostra-se a aceitação mais recente de cada documento:
  // é essa que está em vigor. O histórico inteiro fica guardado para prova.
  const porDocumento = new Map();
  estado.aceites.forEach(a => porDocumento.set(a.slug, a));

  const emFalta = Array.isArray(estado.emFalta) ? estado.emFalta : [];

  return (
    <section className={css.categoria}>
      <h2 className={css.categoriaTitulo}>{isEN ? 'What you accepted' : 'O que aceitou'}</h2>
      <p className={css.categoriaDesc}>
        {isEN
          ? 'The documents tied to your account, and the version in force when you accepted them.'
          : 'Os documentos associados à sua conta, e a versão que estava em vigor quando os aceitou.'}
      </p>

      <ul className={css.aceitacoes}>
        {[...porDocumento.values()].map(a => {
          const meta = documentoPorSlug(a.slug);
          const desatualizado = emFalta.some(f => f.slug === a.slug);
          return (
            <li key={a.slug} className={css.aceitacao}>
              <NamedLink name="LegalPage" params={{ slug: a.slug }} className={css.aceitacaoNome}>
                {meta ? meta.curto : a.slug}
              </NamedLink>
              <span className={css.aceitacaoMeta}>
                {isEN ? 'Version' : 'Versão'} {a.versao} · {dataCurta(a.em)}
                {desatualizado ? (
                  <strong className={css.aceitacaoAviso}>
                    {' '}
                    · {isEN ? 'a newer version is in force' : 'há uma versão mais recente em vigor'}
                  </strong>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default MinhasAceitacoes;
