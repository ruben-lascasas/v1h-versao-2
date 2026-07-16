import React from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { useIntl } from '../../util/reactIntl';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useLocale } from '../../context/localeContext';

import { Page, LayoutSingleColumn } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './PrivacyPolicyPage.module.css';

const PrivacyPolicyContentPT = () => (
  <div>
    <div className={css.section}>
      <h2 className={css.sectionTitle}>1. Responsável pelo Tratamento</h2>
      <p className={css.text}>A Venue1Hub (V1H, Venue1Hub, Lda.), com sede em Edifício Mira Center, Rua do Matadouro, 3070-436 Mira, Portugal, é a entidade responsável pelo tratamento dos dados pessoais recolhidos através da Plataforma, em conformidade com o Regulamento Geral sobre a Proteção de Dados (RGPD, Regulamento UE 2016/679) e a legislação portuguesa aplicável.</p>
      <p className={css.text}>
        <strong>Encarregado de Proteção de Dados (DPO):</strong> contacto provisório
        através do email <em>admin@v1h.net</em>. Após o lançamento público será
        publicada a identificação completa do DPO nesta secção. O utilizador pode dirigir
        ao DPO qualquer questão sobre o exercício dos seus direitos ou sobre o
        cumprimento do RGPD por parte da Plataforma.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>2. Dados Pessoais Recolhidos</h2>
      <p className={css.text}>A Venue1Hub recolhe os seguintes tipos de dados pessoais, consoante a interação do utilizador com a Plataforma:</p>
      <p className={css.text}><strong>Dados de registo e identificação:</strong> nome completo, endereço de email, password (armazenada de forma encriptada), e, quando aplicável, dados de perfil profissional.</p>
      <p className={css.text}><strong>Dados transacionais:</strong> histórico de reservas, valores pagos, comissões aplicadas e dados de faturação.</p>
      <p className={css.text}><strong>Dados de utilização da Plataforma:</strong> listagens publicadas, comunicações realizadas entre utilizadores, avaliações e comentários submetidos.</p>
      <p className={css.text}><strong>Dados técnicos:</strong> endereço IP, tipo de dispositivo e browser, páginas visitadas, duração das sessões e dados de navegação.</p>
      <p className={css.text}><strong>Dados de pagamento:</strong> processados de forma segura pelo Stripe, parceiro certificado de processamento de pagamentos. A Venue1Hub não armazena dados de cartão bancário.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>3. Finalidade e Base Legal do Tratamento</h2>
      <p className={css.text}>Os dados pessoais são tratados para as seguintes finalidades e com as respetivas bases legais:</p>
      <ul className={css.list}>
        <li><strong>Execução contratual (Art. 6.º/1/b RGPD):</strong> gestão do registo, autenticação, processamento de reservas e pagamentos, e emissão de contratos de arrendamento;</li>
        <li><strong>Interesse legítimo (Art. 6.º/1/f RGPD):</strong> prevenção de fraude, segurança da Plataforma, melhoria dos serviços e personalização da experiência do utilizador;</li>
        <li><strong>Consentimento (Art. 6.º/1/a RGPD):</strong> envio de comunicações de marketing e newsletters (quando expressamente autorizado pelo utilizador);</li>
        <li><strong>Obrigação legal (Art. 6.º/1/c RGPD):</strong> cumprimento de requisitos fiscais, contabilísticos e regulatórios aplicáveis à Venue1Hub enquanto sociedade portuguesa.</li>
      </ul>
      <p className={css.text}>
        <strong>Avaliação do interesse legítimo:</strong> sempre que invoca o interesse
        legítimo como fundamento do tratamento, a Venue1Hub realiza uma avaliação prévia
        de proporcionalidade entre os interesses prosseguidos e os direitos e liberdades
        do titular dos dados, dando preferência ao princípio da minimização e adoptando
        salvaguardas adequadas (encriptação, pseudonimização, controlos de acesso). O
        utilizador pode opor-se a este tratamento exercendo os direitos previstos na
        secção 7.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>4. Partilha de Dados com Terceiros</h2>
      <p className={css.text}>A Venue1Hub não vende dados pessoais a terceiros. Os dados poderão ser partilhados nas seguintes circunstâncias:</p>
      <ul className={css.list}>
        <li><strong>Entre utilizadores:</strong> as informações necessárias à concretização de uma reserva (nome, avaliações, perfil público) são partilhadas entre Anfitrião e Hóspede;</li>
        <li><strong>Prestadores de serviços tecnológicos:</strong> Stripe (pagamentos), Sharetribe (infraestrutura da plataforma na fase inicial), serviços de cloud hosting (AWS, Google Cloud ou Azure), ferramentas de apoio ao cliente e comunicação interna;</li>
        <li><strong>Parceiros de serviços complementares:</strong> mediante consentimento do utilizador, para serviços opcionais como catering, seguros temporários ou verificação de identidade;</li>
        <li><strong>Autoridades competentes:</strong> quando legalmente exigido ou necessário para proteger os direitos da Venue1Hub e dos seus utilizadores.</li>
      </ul>
      <p className={css.text}>Todos os subcontratantes da Venue1Hub estão sujeitos a acordos de tratamento de dados em conformidade com o RGPD. A Sharetribe é um fornecedor certificado RGPD, com infraestrutura alojada na União Europeia.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>5. Transferências Internacionais de Dados</h2>
      <p className={css.text}>Os dados pessoais são preferencialmente tratados dentro do Espaço Económico Europeu (EEE). Caso sejam necessárias transferências para países terceiros, a Venue1Hub assegurará a adopção das salvaguardas adequadas previstas no RGPD, nomeadamente cláusulas contratuais-tipo aprovadas pela Comissão Europeia.</p>
      <p className={css.text}>
        <strong>Sharetribe:</strong> a Sharetribe Oy é uma sociedade finlandesa com
        infraestrutura alojada na União Europeia (Frankfurt, Alemanha). Algumas operações
        de suporte podem ser realizadas a partir de outras jurisdições europeias. A
        Venue1Hub mantém um Acordo de Tratamento de Dados (DPA) com a Sharetribe nos
        termos do Artigo 28.º do RGPD.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>6. Conservação dos Dados</h2>
      <p className={css.text}>Os dados pessoais são conservados pelo período estritamente necessário à prestação dos serviços e ao cumprimento de obrigações legais e contratuais. Após o encerramento da conta, os dados são eliminados ou anonimizados, salvo quando a sua conservação seja legalmente exigida (por exemplo, para efeitos fiscais ou contabilísticos).</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>7. Direitos dos Titulares dos Dados</h2>
      <p className={css.text}>Nos termos do RGPD, o utilizador tem os seguintes direitos relativamente aos seus dados pessoais:</p>
      <ul className={css.list}>
        <li><strong>Acesso:</strong> obter confirmação sobre se os seus dados são tratados e solicitar uma cópia dos mesmos;</li>
        <li><strong>Retificação:</strong> corrigir dados incorretos, incompletos ou desatualizados;</li>
        <li><strong>Eliminação:</strong> solicitar o apagamento dos dados ("direito a ser esquecido"), quando aplicável;</li>
        <li><strong>Portabilidade:</strong> receber os seus dados num formato estruturado e legível por máquina;</li>
        <li><strong>Oposição:</strong> opor-se ao tratamento baseado em interesse legítimo ou para fins de marketing direto;</li>
        <li><strong>Limitação:</strong> solicitar a suspensão temporária do tratamento em determinadas circunstâncias;</li>
        <li><strong>Retirada do consentimento:</strong> retirar o consentimento a qualquer momento, sem que tal afecte a licitude do tratamento anterior.</li>
      </ul>
      <p className={css.text}>Para exercer qualquer destes direitos, o utilizador deve contactar a Venue1Hub através dos meios disponíveis na página de Contacto.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>8. Segurança dos Dados</h2>
      <p className={css.text}>A Venue1Hub adopta medidas técnicas e organizacionais adequadas para proteger os dados pessoais contra acesso não autorizado, perda, destruição ou divulgação indevida. Estas medidas incluem encriptação de dados em trânsito e em repouso, controlo de acessos, autenticação segura e monitorização contínua da infraestrutura tecnológica.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>9. Cookies e Tecnologias de Rastreio</h2>
      <p className={css.text}>A Plataforma Venue1Hub utiliza cookies e tecnologias semelhantes para garantir o funcionamento correto do serviço, melhorar a experiência do utilizador e, mediante consentimento, suportar funcionalidades de análise e marketing. Os cookies essenciais são necessários para o funcionamento da Plataforma e não podem ser desativados. O utilizador pode gerir as suas preferências de cookies não essenciais nas definições do seu browser.</p>
      <p className={css.text}>A Plataforma também regista um contador agregado e anónimo do número total de instalações da aplicação Venue1Hub (Progressive Web App) no dispositivo do utilizador, para mostrar prova social no convite de instalação. Este contador não recolhe identificadores pessoais e não é associado a contas de utilizador.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>10. Decisões Automatizadas e Definição de Perfis</h2>
      <p className={css.text}>
        A Venue1Hub não toma decisões com efeitos jurídicos ou efeitos
        significativamente similares baseadas exclusivamente em tratamento automatizado
        de dados, nos termos do Artigo 22.º do RGPD. As funcionalidades de recomendação
        e ordenação de listagens existentes na Plataforma têm fins informativos e podem
        ser influenciadas pelo utilizador através das opções de pesquisa e filtros
        disponíveis. Caso esta política venha a ser alterada com a introdução de
        decisões automatizadas com impacto relevante, o utilizador será informado de
        forma clara e da lógica subjacente, podendo opor-se à decisão e solicitar
        intervenção humana.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>11. Notificação de Violações de Dados</h2>
      <p className={css.text}>
        A Venue1Hub mantém um procedimento interno de deteção, contenção e resposta a
        violações de segurança que possam comprometer dados pessoais. Em caso de
        violação que represente risco para os direitos e liberdades dos titulares, a
        Venue1Hub notificará a Comissão Nacional de Proteção de Dados (CNPD) no prazo
        máximo de 72 horas após o conhecimento da ocorrência, nos termos do Artigo
        33.º do RGPD. Quando a violação represente um risco elevado, os titulares
        afetados serão também informados sem demora injustificada (Artigo 34.º).
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>12. Menores</h2>
      <p className={css.text}>
        A Plataforma destina-se exclusivamente a maiores de 18 anos. A Venue1Hub não
        recolhe conscientemente dados pessoais de menores. Caso seja detetado o registo
        de um utilizador menor, a conta será imediatamente desativada e os dados
        eliminados, salvo se existir consentimento expresso e verificável dos titulares
        das responsabilidades parentais nos termos do Artigo 8.º do RGPD.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>13. Autoridade de Controlo</h2>
      <p className={css.text}>Sem prejuízo de qualquer outra via de recurso administrativo ou judicial, o utilizador tem o direito de apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD), autoridade de controlo portuguesa, caso considere que o tratamento dos seus dados pessoais viola o RGPD.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>14. Alterações à Política de Privacidade</h2>
      <p className={css.text}>A presente Política de Privacidade pode ser atualizada periodicamente, em função de alterações legais, tecnológicas ou operacionais. As alterações significativas serão comunicadas aos utilizadores por email ou mediante aviso destacado na Plataforma, com antecedência razoável antes da sua entrada em vigor.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>15. Contacto</h2>
      <p className={css.text}>Para exercer os seus direitos, apresentar reclamações ou obter esclarecimentos sobre o tratamento de dados pessoais, contacte a Venue1Hub através dos meios disponíveis na página de Contacto da Plataforma.</p>
    </div>

    <p className={css.updated}>Última atualização: Abril de 2026</p>
  </div>
);

const PrivacyPolicyContentEN = () => (
  <div>
    <div className={css.section}>
      <h2 className={css.sectionTitle}>1. Data Controller</h2>
      <p className={css.text}>Venue1Hub (V1H, Venue1Hub, Lda.), headquartered at Edifício Mira Center, Rua do Matadouro, 3070-436 Mira, Portugal, is the entity responsible for processing personal data collected through the Platform, in accordance with the General Data Protection Regulation (GDPR, EU Regulation 2016/679) and applicable Portuguese legislation.</p>
      <p className={css.text}>
        <strong>Data Protection Officer (DPO):</strong> provisional contact at
        <em> admin@v1h.net</em>. Full DPO identification will be published in this
        section following the public launch. Users may contact the DPO with any
        question regarding the exercise of their rights or the Platform's GDPR
        compliance.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>2. Personal Data Collected</h2>
      <p className={css.text}>Venue1Hub collects the following types of personal data, depending on the user's interaction with the Platform:</p>
      <p className={css.text}><strong>Registration and identification data:</strong> full name, email address, password (stored in encrypted form), and, where applicable, professional profile data.</p>
      <p className={css.text}><strong>Transactional data:</strong> booking history, amounts paid, commissions applied and billing information.</p>
      <p className={css.text}><strong>Platform usage data:</strong> published listings, communications between users, reviews and comments submitted.</p>
      <p className={css.text}><strong>Technical data:</strong> IP address, device and browser type, pages visited, session duration and browsing data.</p>
      <p className={css.text}><strong>Payment data:</strong> processed securely by Stripe, a certified payment processing partner. Venue1Hub does not store bank card data.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>3. Purpose and Legal Basis for Processing</h2>
      <p className={css.text}>Personal data is processed for the following purposes and with the respective legal bases:</p>
      <ul className={css.list}>
        <li><strong>Contractual performance (Art. 6(1)(b) GDPR):</strong> managing registration, authentication, processing bookings and payments, and issuing rental agreements;</li>
        <li><strong>Legitimate interest (Art. 6(1)(f) GDPR):</strong> fraud prevention, Platform security, service improvement and personalisation of the user experience;</li>
        <li><strong>Consent (Art. 6(1)(a) GDPR):</strong> sending marketing communications and newsletters (when expressly authorised by the user);</li>
        <li><strong>Legal obligation (Art. 6(1)(c) GDPR):</strong> compliance with tax, accounting and regulatory requirements applicable to Venue1Hub as a Portuguese company.</li>
      </ul>
      <p className={css.text}>
        <strong>Legitimate interest assessment:</strong> whenever Venue1Hub relies on
        legitimate interest as the lawful basis for processing, a prior balancing test
        is performed weighing the pursued interests against the rights and freedoms of
        the data subject, prioritising the principle of data minimisation and adopting
        appropriate safeguards (encryption, pseudonymisation, access controls). Users
        may object to such processing by exercising the rights set out in section 7.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>4. Sharing Data with Third Parties</h2>
      <p className={css.text}>Venue1Hub does not sell personal data to third parties. Data may be shared in the following circumstances:</p>
      <ul className={css.list}>
        <li><strong>Between users:</strong> information necessary to complete a booking (name, reviews, public profile) is shared between Host and Guest;</li>
        <li><strong>Technology service providers:</strong> Stripe (payments), Sharetribe (platform infrastructure in the initial phase), cloud hosting services (AWS, Google Cloud or Azure), customer support and internal communication tools;</li>
        <li><strong>Complementary service partners:</strong> with the user's consent, for optional services such as catering, temporary insurance or identity verification;</li>
        <li><strong>Competent authorities:</strong> when legally required or necessary to protect the rights of Venue1Hub and its users.</li>
      </ul>
      <p className={css.text}>All Venue1Hub subcontractors are subject to data processing agreements in compliance with the GDPR. Sharetribe is a GDPR-certified provider with infrastructure hosted within the European Union.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>5. International Data Transfers</h2>
      <p className={css.text}>Personal data is preferably processed within the European Economic Area (EEA). Should transfers to third countries be necessary, Venue1Hub will ensure the adoption of appropriate safeguards provided for under the GDPR, in particular standard contractual clauses approved by the European Commission.</p>
      <p className={css.text}>
        <strong>Sharetribe:</strong> Sharetribe Oy is a Finnish company with
        infrastructure hosted within the European Union (Frankfurt, Germany). Some
        support operations may be performed from other European jurisdictions.
        Venue1Hub maintains a Data Processing Agreement (DPA) with Sharetribe pursuant
        to Article 28 GDPR.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>6. Data Retention</h2>
      <p className={css.text}>Personal data is retained for the period strictly necessary for the provision of services and compliance with legal and contractual obligations. Following account closure, data is deleted or anonymised, unless its retention is legally required (for example, for tax or accounting purposes).</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>7. Rights of Data Subjects</h2>
      <p className={css.text}>Under the GDPR, users have the following rights regarding their personal data:</p>
      <ul className={css.list}>
        <li><strong>Access:</strong> obtain confirmation as to whether their data is being processed and request a copy thereof;</li>
        <li><strong>Rectification:</strong> correct inaccurate, incomplete or outdated data;</li>
        <li><strong>Erasure:</strong> request the deletion of data ("right to be forgotten"), where applicable;</li>
        <li><strong>Portability:</strong> receive their data in a structured, machine-readable format;</li>
        <li><strong>Objection:</strong> object to processing based on legitimate interest or for direct marketing purposes;</li>
        <li><strong>Restriction:</strong> request the temporary suspension of processing in certain circumstances;</li>
        <li><strong>Withdrawal of consent:</strong> withdraw consent at any time, without affecting the lawfulness of prior processing.</li>
      </ul>
      <p className={css.text}>To exercise any of these rights, users should contact Venue1Hub through the means available on the Contact page.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>8. Data Security</h2>
      <p className={css.text}>Venue1Hub adopts appropriate technical and organisational measures to protect personal data against unauthorised access, loss, destruction or improper disclosure. These measures include encryption of data in transit and at rest, access controls, secure authentication and continuous monitoring of the technological infrastructure.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>9. Cookies and Tracking Technologies</h2>
      <p className={css.text}>The Venue1Hub Platform uses cookies and similar technologies to ensure the correct operation of the service, improve the user experience and, with consent, support analytics and marketing functionality. Essential cookies are necessary for the Platform to function and cannot be disabled. Users may manage their non-essential cookie preferences in their browser settings.</p>
      <p className={css.text}>The Platform also records an aggregate, anonymous counter of the total number of installations of the Venue1Hub application (Progressive Web App) on user devices, in order to display social proof on the install invitation. This counter does not collect any personal identifiers and is not linked to user accounts.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>10. Automated Decision-Making and Profiling</h2>
      <p className={css.text}>
        Venue1Hub does not make decisions producing legal or similarly significant
        effects based solely on automated processing, in line with Article 22 GDPR. The
        recommendation and listing-ranking features available on the Platform are
        informational and can be influenced by users via the available search options
        and filters. Should this policy change with the introduction of automated
        decisions of significant impact, users will be clearly informed of the
        underlying logic, may object to the decision and request human intervention.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>11. Data Breach Notification</h2>
      <p className={css.text}>
        Venue1Hub maintains an internal procedure for the detection, containment and
        response to security breaches that could compromise personal data. In the event
        of a breach posing a risk to the rights and freedoms of data subjects,
        Venue1Hub will notify the Comissão Nacional de Proteção de Dados (CNPD) within
        a maximum of 72 hours after becoming aware of the incident, in accordance with
        Article 33 GDPR. Where the breach poses a high risk, affected data subjects
        will also be informed without undue delay (Article 34).
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>12. Minors</h2>
      <p className={css.text}>
        The Platform is intended exclusively for users aged 18 or over. Venue1Hub does
        not knowingly collect personal data from minors. Should a minor user be
        detected, the account will be immediately deactivated and the data deleted,
        unless explicit and verifiable consent has been given by the holders of
        parental responsibility under Article 8 GDPR.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>13. Supervisory Authority</h2>
      <p className={css.text}>Without prejudice to any other administrative or judicial remedy, users have the right to lodge a complaint with the Comissão Nacional de Proteção de Dados (CNPD), the Portuguese supervisory authority, if they consider that the processing of their personal data infringes the GDPR.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>14. Changes to the Privacy Policy</h2>
      <p className={css.text}>This Privacy Policy may be updated periodically in response to legal, technological or operational changes. Significant changes will be communicated to users by email or by a prominent notice on the Platform, with reasonable advance notice before they take effect.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>15. Contact</h2>
      <p className={css.text}>To exercise your rights, submit complaints or obtain clarification regarding the processing of personal data, please contact Venue1Hub through the means available on the Platform's Contact page.</p>
    </div>

    <p className={css.updated}>Last updated: April 2026</p>
  </div>
);

export const PrivacyPolicyContent = () => {
  const { locale } = useLocale();
  return locale === 'en' ? <PrivacyPolicyContentEN /> : <PrivacyPolicyContentPT />;
};

const PrivacyPolicyPageComponent = props => {
  const { scrollingDisabled } = props;
  const intl = useIntl();
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const history = useHistory();

  const handleBack = () => {
    if (history.length > 1) {
      history.goBack();
    } else {
      history.push('/');
    }
  };

  return (
    <Page
      title={isEN ? 'Privacy Policy | Venue1Hub' : 'Política de Privacidade | Venue1Hub'}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn
        hideRecentlyViewed
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.content}>
          <h1 className={css.title}>{isEN ? 'Privacy Policy' : 'Política de Privacidade'}</h1>
          <PrivacyPolicyContent />
          <div className={css.backButtonRow}>
            <button type="button" className={css.backButton} onClick={handleBack}>
              {isEN ? 'BACK' : 'VOLTAR'}
            </button>
          </div>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
});

const PrivacyPolicyPage = compose(connect(mapStateToProps))(PrivacyPolicyPageComponent);

const PRIVACY_POLICY_ASSET_NAME = 'privacy-policy';
export { PRIVACY_POLICY_ASSET_NAME, PrivacyPolicyPageComponent };
export default PrivacyPolicyPage;
