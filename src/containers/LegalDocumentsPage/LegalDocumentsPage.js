import React, { useEffect, useState } from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useLocale } from '../../context/localeContext';
import { useIntl } from '../../util/reactIntl';
import { documentoPorSlug } from '../../config/legalDocuments';

import { useConfiguration } from '../../context/configurationContext';
import { showPaymentDetailsForUser } from '../../util/userHelpers';
import { userHasPassword } from '../../util/data';

import { Page, LayoutSideNavigation, NamedLink, H3 } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './LegalDocumentsPage.module.css';

/**
 * "Os meus documentos" — dentro das Definições de Conta.
 *
 * Esta informação existia, mas no Centro Jurídico. O Rúben foi procurá-la às
 * Definições de Conta, que é onde qualquer pessoa a procuraria: são os
 * documentos *dela*, não os do site. Estar no sítio certo vale mais do que
 * estar num sítio defensável.
 *
 * Mostra o ponteiro — documento, versão, data — e não uma cópia do texto. É o
 * mesmo princípio de todo o resto: guardar que versão se aceitou, e ir buscar o
 * texto a um sítio só.
 */

const t = (isEN, pt, en) => (isEN ? en : pt);

const dataCurta = iso => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};

const dataHora = iso => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  return `${dataCurta(iso)} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Rótulos das escolhas da declaração — o servidor guarda a chave. */
const TEXTO = {
  proprietario: { pt: 'Proprietário do espaço', en: 'Owner of the space' },
  arrendatario_com_autorizacao: {
    pt: 'Arrendatário com autorização escrita',
    en: 'Tenant with written permission',
  },
  mandatario: { pt: 'Represento o proprietário', en: 'Acting for the owner' },
  outro: { pt: 'Outro título', en: 'Other basis' },
  particular: { pt: 'Particular', en: 'Private individual' },
  profissional: { pt: 'Profissional / empresa', en: 'Professional / company' },
};
const legivel = (chave, isEN) => {
  const v = TEXTO[chave];
  return v ? t(isEN, v.pt, v.en) : chave;
};

export const LegalDocumentsPageComponent = props => {
  const { scrollingDisabled, currentUser } = props;
  const { locale } = useLocale();
  const intl = useIntl();
  const config = useConfiguration();
  const isEN = locale === 'en';

  // Os mesmos separadores que as outras páginas de definições mostram — senão
  // esta abria sem o menu lateral e parecia outro sítio.
  const { showPayoutDetails, showPaymentMethods } = showPaymentDetailsForUser(config, currentUser);
  const accountSettingsNavProps = {
    currentPage: 'LegalDocumentsPage',
    showPaymentMethods,
    showPayoutDetails,
    showPasswordChange: userHasPassword(currentUser),
  };

  const [aceitacoes, setAceitacoes] = useState(null);
  const [verificacao, setVerificacao] = useState(null);

  useEffect(() => {
    let vivo = true;
    // Dois pedidos porque são duas coisas distintas: o que se aceitou, e a
    // declaração que se fez enquanto anfitrião. Quem não é anfitrião só tem a
    // primeira.
    fetch('/api/legal-acceptance', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => vivo && setAceitacoes(d))
      .catch(() => {});
    fetch('/api/verification', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => vivo && setVerificacao(d))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [currentUser?.id?.uuid]);

  const aceites = aceitacoes?.aceites || [];
  const emFalta = aceitacoes?.emFalta || [];
  const declaracao = verificacao?.declaracao || null;
  const temDeclaracao = declaracao && Object.keys(declaracao).length > 0;

  // Do histórico completo mostra-se a aceitação mais recente de cada documento:
  // é essa que está em vigor. O histórico inteiro fica guardado como prova.
  const porDocumento = new Map();
  aceites.forEach(a => porDocumento.set(a.slug, a));

  const title = t(isEN, 'Os meus documentos | Venue1Hub', 'My documents | Venue1Hub');

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSideNavigation
        topbar={<TopbarContainer />}
        sideNav={null}
        useAccountSettingsNav
        accountSettingsNavProps={accountSettingsNavProps}
        footer={<FooterContainer />}
        // Obrigatório: o LayoutSideNavigation faz `intl.formatMessage` para o
        // rótulo do menu lateral. Sem isto, rebenta e a página fica em branco —
        // foi exactamente o que aconteceu em produção.
        intl={intl}
      >
        <div className={css.content}>
          <H3 as="h1" className={css.titulo}>
            {t(isEN, 'Os meus documentos', 'My documents')}
          </H3>
          <p className={css.intro}>
            {t(
              isEN,
              'O que aceitou, em que versão e quando. Guardamos o registo da aceitação, não uma cópia do texto — o documento está sempre disponível na sua versão atual.',
              'What you accepted, in which version and when. We keep the record of acceptance, not a copy of the text — the document is always available in its current version.'
            )}
          </p>

          {aceitacoes === null ? <p className={css.vazio}>…</p> : null}

          {aceitacoes && porDocumento.size === 0 ? (
            <p className={css.vazio}>
              {t(
                isEN,
                'Ainda não há aceitações registadas nesta conta.',
                'No acceptances recorded on this account yet.'
              )}
            </p>
          ) : null}

          {porDocumento.size > 0 ? (
            <ul className={css.lista}>
              {[...porDocumento.values()].map(a => {
                const meta = documentoPorSlug(a.slug);
                const desatualizado = emFalta.some(f => f.slug === a.slug);
                return (
                  <li key={a.slug} className={css.item}>
                    <NamedLink name="LegalPage" params={{ slug: a.slug }} className={css.nome}>
                      {meta ? meta.curto : a.slug}
                    </NamedLink>
                    <span className={css.meta}>
                      {t(isEN, 'Versão', 'Version')} {a.versao} · {dataHora(a.em)}
                    </span>
                    {desatualizado ? (
                      <span className={css.desatualizado}>
                        {t(
                          isEN,
                          'Há uma versão mais recente em vigor. Terá de a aceitar.',
                          'A newer version is in force. You will need to accept it.'
                        )}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {/* A declaração do anfitrião. Só aparece a quem a fez — um visitante
              não tem nada disto. */}
          {temDeclaracao ? (
            <>
              <h2 className={css.seccao}>
                {t(isEN, 'Declaração de Conformidade', 'Compliance Declaration')}
              </h2>
              <ul className={css.lista}>
                <li className={css.item}>
                  <span className={css.nomeSimples}>
                    {t(isEN, 'A que título disponibiliza o espaço', 'Basis for offering the space')}
                  </span>
                  <span className={css.meta}>{legivel(declaracao.titulo, isEN)}</span>
                </li>
                <li className={css.item}>
                  <span className={css.nomeSimples}>{t(isEN, 'Atua como', 'Acting as')}</span>
                  <span className={css.meta}>{legivel(declaracao.classificacao, isEN)}</span>
                </li>
                <li className={css.item}>
                  <span className={css.nomeSimples}>NIF / VAT</span>
                  <span className={css.meta}>{declaracao.nif}</span>
                </li>
                <li className={css.item}>
                  <span className={css.nomeSimples}>
                    {t(isEN, 'Residência fiscal', 'Tax residence')}
                  </span>
                  <span className={css.meta}>{declaracao.residenciaFiscal}</span>
                </li>
                <li className={css.item}>
                  <span className={css.nomeSimples}>{t(isEN, 'Entregue em', 'Submitted on')}</span>
                  <span className={css.meta}>{dataHora(declaracao.em)}</span>
                </li>
              </ul>
              <p className={css.nota}>
                {t(
                  isEN,
                  'Para corrigir estes dados, volte à página de verificação.',
                  'To correct this information, go back to the verification page.'
                )}{' '}
                <NamedLink name="VerificationPage" className={css.ligacao}>
                  {t(isEN, 'Verificação da conta', 'Account verification')}
                </NamedLink>
              </p>
            </>
          ) : null}

          <p className={css.nota}>
            <NamedLink name="LegalCentrePage" className={css.ligacao}>
              {t(isEN, 'Ver todos os documentos da plataforma', 'See all platform documents')}
            </NamedLink>
          </p>
        </div>
      </LayoutSideNavigation>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
  currentUser: state.user?.currentUser,
});

const LegalDocumentsPage = compose(connect(mapStateToProps))(LegalDocumentsPageComponent);

export default LegalDocumentsPage;
