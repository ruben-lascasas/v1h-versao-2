import React from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useLocale } from '../../context/localeContext';
import { LEGAL_DOCUMENTS } from '../../config/legalDocuments';
import { OPERADOR } from '../../config/legalEntity';

import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import MinhasAceitacoes from './MinhasAceitacoes';
import css from './LegalCentrePage.module.css';

/**
 * Centro Jurídico e de Confiança.
 *
 * O guia interno é explícito quanto a isto: não pôr dezenas de links soltos no
 * rodapé, mas organizá-los num centro próprio. As categorias são as que ele
 * define, mais "A plataforma" para os documentos transversais — Termos de
 * Serviço, Aviso Legal, Acessibilidade e Ranking — que não pertencem a nenhuma
 * das outras.
 */
const CATEGORIAS = [
  {
    id: 'plataforma',
    pt: 'A plataforma',
    en: 'The platform',
    descPt: 'As regras gerais de utilização e quem responde por elas.',
    descEn: 'The general rules of use, and who answers for them.',
  },
  {
    id: 'reservar',
    pt: 'Reservar',
    en: 'Booking',
    descPt: 'O que se aplica a quem procura e reserva um espaço.',
    descEn: 'What applies to anyone searching for and booking a space.',
  },
  {
    id: 'espacos',
    pt: 'Disponibilizar um espaço',
    en: 'Listing a space',
    descPt: 'Para anfitriões, prestadores de serviços e parceiros.',
    descEn: 'For hosts, service providers and partners.',
  },
  {
    id: 'pagamentos',
    pt: 'Pagamentos',
    en: 'Payments',
    descPt: 'Como se cobra, quanto se cobra e como se recebe.',
    descEn: 'How payments are taken, what they cost and how payouts work.',
  },
  {
    id: 'seguranca',
    pt: 'Segurança',
    en: 'Trust & safety',
    descPt: 'Verificação, utilização aceitável e o que acontece quando há abuso.',
    descEn: 'Verification, acceptable use, and what happens when rules are broken.',
  },
  {
    id: 'privacidade',
    pt: 'Privacidade',
    en: 'Privacy',
    descPt: 'Que dados são tratados, para quê e com que fundamento.',
    descEn: 'What data is processed, why, and on what legal basis.',
  },
  {
    id: 'fiscalidade',
    pt: 'Fiscalidade',
    en: 'Tax',
    descPt: 'Obrigações fiscais, faturação e reporte DAC7.',
    descEn: 'Tax obligations, invoicing and DAC7 reporting.',
  },
  {
    id: 'conteudos',
    pt: 'Conteúdos',
    en: 'Content',
    descPt: 'Anúncios, avaliações, propriedade intelectual e conteúdo ilegal.',
    descEn: 'Listings, reviews, intellectual property and illegal content.',
  },
  {
    id: 'reclamacoes',
    pt: 'Reclamações',
    en: 'Claims',
    descPt: 'Danos, cauções e resolução de conflitos.',
    descEn: 'Damage, deposits and dispute resolution.',
  },
];

export const LegalCentrePageComponent = props => {
  const { scrollingDisabled } = props;
  const { locale } = useLocale();
  const isEN = locale === 'en';

  return (
    <Page
      title={isEN ? 'Legal & Trust Centre | Venue1Hub' : 'Centro Jurídico | Venue1Hub'}
      description={
        isEN
          ? 'All Venue1Hub terms, policies and legal information in one place.'
          : 'Todos os termos, políticas e informação jurídica da Venue1Hub num só lugar.'
      }
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn hideRecentlyViewed topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.content}>
          <header className={css.cabecalho}>
            <p className={css.etiqueta}>Venue1Hub</p>
            <h1 className={css.titulo}>
              {isEN ? 'Legal & Trust Centre' : 'Centro Jurídico e de Confiança'}
            </h1>
            <p className={css.intro}>
              {isEN
                ? 'Every term, policy and notice that governs Venue1Hub, grouped by what you are trying to do. All documents are in Portuguese; the Portuguese version is the binding one.'
                : 'Todos os termos, políticas e avisos que regem a Venue1Hub, agrupados pelo que está a tentar fazer. São 38 documentos — o índice abaixo evita ter de os percorrer todos.'}
            </p>
          </header>

          {/* Só aparece a quem tem sessão iniciada e já aceitou alguma coisa. */}
          <MinhasAceitacoes isEN={isEN} />

          {CATEGORIAS.map(cat => {
            const docs = LEGAL_DOCUMENTS.filter(d => d.categoria === cat.id);
            if (docs.length === 0) return null;
            return (
              <section key={cat.id} className={css.categoria}>
                <h2 className={css.categoriaTitulo}>{isEN ? cat.en : cat.pt}</h2>
                <p className={css.categoriaDesc}>{isEN ? cat.descEn : cat.descPt}</p>
                <ul className={css.grelha}>
                  {docs.map(d => (
                    <li key={d.slug}>
                      <NamedLink
                        name="LegalPage"
                        params={{ slug: d.slug }}
                        className={css.cartao}
                      >
                        <span className={css.cartaoTitulo}>{d.curto}</span>
                        <span className={css.cartaoMeta}>
                          {isEN ? 'Version' : 'Versão'} {d.versao}
                        </span>
                      </NamedLink>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {/* Identificação do operador, como o guia exige que apareça no fundo
              do site. Sai da mesma fonte que o rodapé usa, para não haver duas
              moradas diferentes em dois sítios. */}
          <footer className={css.operador}>
            <h2 className={css.operadorTitulo}>{isEN ? 'Operator' : 'Entidade operadora'}</h2>
            <p className={css.operadorTexto}>
              <strong>{OPERADOR.nome}</strong>
              <br />
              {isEN ? 'Registry code' : 'Número de registo'}: {OPERADOR.registo}
              <br />
              {OPERADOR.morada}
              <br />
              <a href={`mailto:${OPERADOR.email}`} className={css.link}>
                {OPERADOR.email}
              </a>
            </p>
          </footer>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({ scrollingDisabled: isScrollingDisabled(state) });

const LegalCentrePage = compose(connect(mapStateToProps))(LegalCentrePageComponent);

export default LegalCentrePage;
