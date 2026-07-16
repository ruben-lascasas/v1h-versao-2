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

import css from './TermsOfServicePage.module.css';

const TermsOfServiceContentPT = () => (
  <div>
    <div className={css.section}>
      <h2 className={css.sectionTitle}>1. Identificação e Enquadramento</h2>
      <p className={css.text}>A Venue1Hub (doravante "V1H" ou "Plataforma") é uma plataforma digital de intermediação dedicada ao arrendamento de curta duração de espaços comerciais para fins profissionais, artísticos e sociais. A sociedade está constituída como sociedade por quotas (Lda.), com sede em Edifício Mira Center, Rua do Matadouro, 3070-436 Mira, Portugal, registada sob o CAE 68200 (Arrendamento de Bens Imobiliários).</p>
      <p className={css.text}>A marca V1H (Venue1Hub) encontra-se legalmente protegida pelo registo de marca nacional n.º 716152, registado no Instituto Nacional da Propriedade Industrial (INPI) a 6 de dezembro de 2023, ao abrigo das Classes de Nice 42 e 43.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>2. Aceitação dos Termos</h2>
      <p className={css.text}>O acesso e utilização da Plataforma Venue1Hub implica a aceitação plena e incondicional dos presentes Termos de Serviço. Caso o utilizador não concorde com alguma das disposições aqui previstas, deverá abster-se de utilizar a Plataforma.</p>
      <p className={css.text}>Estes Termos regulam a relação entre a Venue1Hub e todos os utilizadores registados, sejam Anfitriões (proprietários ou gestores de espaços) ou Hóspedes (arrendatários), e são complementados pela Política de Privacidade e pelo Contrato de Arrendamento de Curta Duração integrado no processo de reserva.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>3. Descrição do Serviço</h2>
      <p className={css.text}>A Venue1Hub actua exclusivamente como intermediário digital entre Anfitriões e Hóspedes, não sendo parte no contrato de arrendamento celebrado entre estes. A Plataforma disponibiliza:</p>
      <ul className={css.list}>
        <li>Listagem e promoção de espaços comerciais disponíveis para arrendamento temporário;</li>
        <li>Motor de pesquisa com filtros por tipo de espaço, localização, datas e comodidades;</li>
        <li>Sistema de reservas com processamento de pagamentos seguro;</li>
        <li>Contratos de arrendamento de curta duração pré-aprovados e com validade legal, aceites digitalmente por ambas as partes;</li>
        <li>Painel de gestão para Anfitriões, com calendário de disponibilidade, análise de desempenho e ferramentas de faturação;</li>
        <li>Serviços complementares opcionais (catering, equipamento técnico, decoração, seguros temporários).</li>
      </ul>
      <p className={css.text}>Os espaços disponíveis incluem, entre outros: salas de reunião, escritórios e consultórios, restaurantes e auditórios, galerias e espaços para eventos, estúdios e salas de ensaio.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>4. Registo e Conta de Utilizador</h2>
      <p className={css.text}>Para aceder às funcionalidades da Plataforma, o utilizador deve criar uma conta, comprometendo-se a:</p>
      <ul className={css.list}>
        <li>Fornecer informações verdadeiras, precisas, actualizadas e completas;</li>
        <li>Manter a confidencialidade das suas credenciais de acesso;</li>
        <li>Notificar imediatamente a Venue1Hub de qualquer utilização não autorizada da sua conta;</li>
        <li>Ser integralmente responsável por todas as actividades realizadas através da sua conta.</li>
      </ul>
      <p className={css.text}>A Venue1Hub reserva-se o direito de suspender ou encerrar contas que violem os presentes Termos, sem prejuízo de outras medidas legalmente previstas.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>5. Obrigações dos Anfitriões</h2>
      <p className={css.text}>Os Anfitriões que publiquem espaços na Plataforma comprometem-se a:</p>
      <ul className={css.list}>
        <li>Garantir que detêm legitimidade legal para arrendar o espaço listado;</li>
        <li>Fornecer informações precisas, completas e actualizadas sobre o espaço (descrição, fotografias, regras, preços e disponibilidade);</li>
        <li>Cumprir todas as obrigações legais aplicáveis, incluindo licenciamentos, alvarás e seguros obrigatórios;</li>
        <li>Manter o espaço nas condições descritas no anúncio e garantir o acesso ao Hóspede nas datas reservadas;</li>
        <li>Responder atempadamente aos pedidos de reserva e comunicações através da Plataforma.</li>
      </ul>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>6. Obrigações dos Hóspedes</h2>
      <p className={css.text}>Os Hóspedes que efectuem reservas através da Plataforma comprometem-se a:</p>
      <ul className={css.list}>
        <li>Utilizar o espaço exclusivamente para os fins indicados na reserva e de acordo com as regras definidas pelo Anfitrião;</li>
        <li>Respeitar o período de reserva acordado e abandonar o espaço na hora prevista;</li>
        <li>Deixar o espaço nas condições em que o encontraram, sendo responsáveis por qualquer dano causado;</li>
        <li>Pagar a totalidade do valor da reserva conforme acordado e nos prazos estabelecidos.</li>
      </ul>
      <p className={css.text}>
        <strong>Suspensão e encerramento de contas.</strong> A Venue1Hub poderá
        suspender temporariamente, restringir funcionalidades ou encerrar
        definitivamente a conta de um utilizador (Anfitrião ou Hóspede) nos seguintes
        casos, sem direito a indemnização ou reembolso de comissões já cobradas:
      </p>
      <ul className={css.list}>
        <li>Fornecimento de informação falsa, enganosa ou desactualizada no registo ou nos anúncios;</li>
        <li>Tentativa de fraude, lavagem de capitais ou utilização indevida do sistema de pagamentos;</li>
        <li>Violação repetida das obrigações enquanto Anfitrião ou Hóspede;</li>
        <li>Utilização do espaço para fins ilícitos, contrários à ordem pública ou aos bons costumes;</li>
        <li>Discriminação, assédio, linguagem ofensiva ou discurso de ódio dirigido a outros utilizadores;</li>
        <li>Múltiplas reclamações fundamentadas de outros utilizadores ou de autoridades públicas;</li>
        <li>Tentativa de evasão da Plataforma para concretizar a reserva fora do sistema (off-platform booking);</li>
        <li>Violação de direitos de propriedade intelectual de terceiros ou da Venue1Hub;</li>
        <li>Tentativas de exploração de vulnerabilidades técnicas, abuso de APIs ou utilização automatizada não autorizada.</li>
      </ul>
      <p className={css.text}>
        Sempre que possível, o utilizador será notificado da suspensão e poderá
        responder no prazo de 7 dias úteis. Em casos graves ou de risco iminente, a
        suspensão pode ser imediata, sem aviso prévio.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>7. Comissões, Pagamentos e Faturação</h2>
      <p className={css.text}>A Venue1Hub cobra uma comissão sobre cada reserva confirmada através da Plataforma, podendo esta ser repartida entre o Anfitrião e o Hóspede. O valor da comissão aplicável é apresentado de forma transparente antes da confirmação de cada reserva.</p>
      <p className={css.text}>Os pagamentos são processados de forma segura através do Stripe, parceiro certificado de processamento de pagamentos. A Venue1Hub emitirá fatura relativa às suas comissões e serviços premium, em conformidade com a legislação fiscal portuguesa e as obrigações de IVA aplicáveis.</p>
      <p className={css.text}>Estão igualmente disponíveis subscrições premium para Anfitriões, com funcionalidades de destaque de listagem, acesso a análises avançadas e integrações de calendário externo.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>8. Contratos de Arrendamento</h2>
      <p className={css.text}>Todas as reservas concluídas através da Plataforma são formalizadas mediante contrato de arrendamento de curta duração, de natureza não residencial, em conformidade com os artigos 1022.º e seguintes do Código Civil Português. Os contratos são pré-aprovados, aceites digitalmente por ambas as partes e incluem cláusulas relativas a duração, responsabilidades, cancelamento e jurisdição.</p>
      <p className={css.text}>A Venue1Hub actua como intermediário digital e não é parte contratante nos arrendamentos celebrados entre Anfitriões e Hóspedes.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>9. Cancelamentos e Reembolsos</h2>
      <p className={css.text}>As políticas de cancelamento são definidas por cada Anfitrião e apresentadas claramente no respectivo anúncio. O Hóspede deverá consultar a política de cancelamento aplicável antes de efectuar a reserva. A Venue1Hub reserva-se o direito de cancelar reservas em casos de violação dos presentes Termos, sem obrigação de reembolso.</p>
      <p className={css.text}>
        <strong>Direito de livre resolução (DL 24/2014):</strong> os contratos
        celebrados à distância entre profissionais e consumidores estão, em regra,
        sujeitos a um prazo de 14 dias para livre resolução. Contudo, nos termos do
        artigo 17.º, n.º 1, alínea l) do Decreto-Lei n.º 24/2014, este direito
        <strong> não é aplicável</strong> à prestação de serviços de alojamento e
        utilização de espaços para fins não residenciais quando o contrato indique uma
        data ou período de execução específicos. Quando aplicável, a livre resolução
        deve ser comunicada por meio do formulário disponibilizado na página de
        Contacto, no prazo de 14 dias contados a partir da celebração do contrato e
        antes do início da prestação do serviço.
      </p>
      <p className={css.text}>
        <strong>Livro de Reclamações Eletrónico:</strong> nos termos do Decreto-Lei n.º
        74/2017, está disponível para os utilizadores o Livro de Reclamações
        Eletrónico em{' '}
        <a
          href="https://www.livroreclamacoes.pt"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#7C6350', fontWeight: 700, textDecoration: 'underline' }}
        >
          www.livroreclamacoes.pt
        </a>
        . As reclamações apresentadas serão respondidas no prazo legal de 15 dias
        úteis.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>10. Responsabilidade da Plataforma</h2>
      <p className={css.text}>Na qualidade de intermediário digital, ao abrigo do Decreto-Lei n.º 7/2004, de 7 de janeiro, na redacção dada pelo Decreto-Lei n.º 41/2021, a Venue1Hub não se responsabiliza por:</p>
      <ul className={css.list}>
        <li>Danos ocorridos durante a utilização dos espaços arrendados;</li>
        <li>Incumprimento contratual por parte de Anfitriões ou Hóspedes;</li>
        <li>Informações incorrectas ou desactualizadas fornecidas pelos utilizadores;</li>
        <li>Indisponibilidade temporária da Plataforma por razões técnicas ou de força maior.</li>
      </ul>
      <p className={css.text}>Os utilizadores são responsáveis pela contratação dos seguros adequados à utilização dos espaços. A Venue1Hub poderá disponibilizar seguros temporários como serviço complementar opcional.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>11. Denúncia de Conteúdos e Moderação</h2>
      <p className={css.text}>Qualquer utilizador (registado ou visitante) pode denunciar um anúncio que considere inadequado, fraudulento, enganoso ou que viole os presentes Termos, através do botão <strong>"Denunciar este anúncio"</strong> disponível em cada página de anúncio ou contactando directamente <strong>admin@v1h.net</strong>.</p>
      <p className={css.text}>São motivos válidos para denúncia, nomeadamente:</p>
      <ul className={css.list}>
        <li>Conteúdo enganoso, falso ou que induza em erro o consumidor;</li>
        <li>Fotografias inadequadas, ofensivas ou não correspondentes ao espaço;</li>
        <li>Anúncios de espaços inexistentes ou tentativas de fraude;</li>
        <li>Discriminação, linguagem ofensiva ou discurso de ódio;</li>
        <li>Spam, conteúdo duplicado ou utilização indevida da Plataforma.</li>
      </ul>
      <p className={css.text}>A Venue1Hub compromete-se a analisar todas as denúncias recebidas em prazo razoável e reserva-se o direito de, sem aviso prévio:</p>
      <ul className={css.list}>
        <li>Suspender temporariamente o anúncio durante a análise;</li>
        <li>Solicitar ao Anfitrião esclarecimentos ou alterações;</li>
        <li>Remover definitivamente o anúncio em caso de violação confirmada;</li>
        <li>Encerrar a conta do utilizador em caso de incumprimento grave ou reincidente.</li>
      </ul>
      <p className={css.text}>O denunciante é informado, sempre que possível, do desfecho da análise. A Plataforma protege a identidade do denunciante e cumpre o RGPD no tratamento dos dados associados às denúncias.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>12. Propriedade Intelectual</h2>
      <p className={css.text}>Todo o conteúdo da Plataforma Venue1Hub (incluindo logótipos, interface, textos, design e arquitectura tecnológica) é propriedade exclusiva da Venue1Hub e encontra-se protegido pela legislação aplicável em matéria de propriedade intelectual e industrial.</p>
      <p className={css.text}>A Venue1Hub detém igualmente uma candidatura a Patente Europeia, registada sob o n.º 20242006440889 (INPI Portugal), de 2 de setembro de 2024, relativa ao sistema inovador de reserva online de espaços comerciais que suporta a Plataforma.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>13. Resolução de Litígios</h2>
      <p className={css.text}>Em caso de conflito entre utilizadores, a Venue1Hub disponibiliza um sistema interno de mediação, suportado pelos registos e histórico da Plataforma. Os utilizadores podem igualmente recorrer a:</p>
      <ul className={css.list}>
        <li>Centros de arbitragem e mediação oficialmente reconhecidos em Portugal (ex.: CACCL, Centro de Arbitragem de Conflitos de Consumo de Lisboa);</li>
        <li>Plataforma Europeia de Resolução de Litígios em Linha (ODR): <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" style={{ color: '#7C6350', fontWeight: 700, textDecoration: 'underline' }}>https://ec.europa.eu/consumers/odr</a></li>
      </ul>
      <p className={css.text}>Salvo acordo em contrário entre as partes, o tribunal competente para dirimir litígios emergentes dos presentes Termos é o Tribunal da Comarca de Coimbra.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>14. Alterações aos Termos</h2>
      <p className={css.text}>A Venue1Hub reserva-se o direito de alterar os presentes Termos de Serviço a qualquer momento, com comunicação prévia aos utilizadores com antecedência razoável. A utilização continuada da Plataforma após a entrada em vigor das alterações implica a aceitação dos novos termos.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>15. Lei Aplicável</h2>
      <p className={css.text}>Os presentes Termos de Serviço são regidos pela lei portuguesa, nomeadamente pelo Código Civil, pelo Decreto-Lei n.º 7/2004 (Comércio Electrónico) e demais legislação aplicável.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>16. Contacto</h2>
      <p className={css.text}>Para qualquer questão relacionada com os presentes Termos de Serviço, contacte a Venue1Hub através dos meios disponíveis na página de Contacto da Plataforma.</p>
    </div>

    <p className={css.updated}>Última atualização: Abril de 2026</p>
  </div>
);

const TermsOfServiceContentEN = () => (
  <div>
    <div className={css.section}>
      <h2 className={css.sectionTitle}>1. Identification and Background</h2>
      <p className={css.text}>Venue1Hub (hereinafter "V1H" or "Platform") is a digital intermediation platform dedicated to the short-term rental of commercial spaces for professional, artistic and social purposes. The company is incorporated as a private limited company (Lda.), headquartered at Edifício Mira Center, Rua do Matadouro, 3070-436 Mira, Portugal, registered under CAE 68200 (Rental of Real Estate).</p>
      <p className={css.text}>The V1H (Venue1Hub) trademark is legally protected by national trademark registration no. 716152, registered at the Instituto Nacional da Propriedade Industrial (INPI) on 6 December 2023, under Nice Classes 42 and 43.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>2. Acceptance of Terms</h2>
      <p className={css.text}>Accessing and using the Venue1Hub Platform implies full and unconditional acceptance of these Terms of Service. If the user does not agree with any of the provisions set out herein, they should refrain from using the Platform.</p>
      <p className={css.text}>These Terms govern the relationship between Venue1Hub and all registered users, whether Hosts (space owners or managers) or Guests (tenants), and are complemented by the Privacy Policy and the Short-Term Rental Agreement integrated into the booking process.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>3. Description of Service</h2>
      <p className={css.text}>Venue1Hub acts exclusively as a digital intermediary between Hosts and Guests and is not a party to the rental agreement concluded between them. The Platform provides:</p>
      <ul className={css.list}>
        <li>Listing and promotion of commercial spaces available for temporary rental;</li>
        <li>Search engine with filters by space type, location, dates and amenities;</li>
        <li>Booking system with secure payment processing;</li>
        <li>Pre-approved, legally valid short-term rental agreements, digitally accepted by both parties;</li>
        <li>Management dashboard for Hosts, with availability calendar, performance analytics and invoicing tools;</li>
        <li>Optional complementary services (catering, technical equipment, decoration, temporary insurance).</li>
      </ul>
      <p className={css.text}>Available spaces include, among others: meeting rooms, offices and consulting rooms, restaurants and auditoriums, galleries and event spaces, studios and rehearsal rooms.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>4. Registration and User Account</h2>
      <p className={css.text}>To access the Platform's features, the user must create an account and agrees to:</p>
      <ul className={css.list}>
        <li>Provide true, accurate, up-to-date and complete information;</li>
        <li>Maintain the confidentiality of their access credentials;</li>
        <li>Immediately notify Venue1Hub of any unauthorised use of their account;</li>
        <li>Be fully responsible for all activities carried out through their account.</li>
      </ul>
      <p className={css.text}>Venue1Hub reserves the right to suspend or close accounts that violate these Terms, without prejudice to other legally provided measures.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>5. Host Obligations</h2>
      <p className={css.text}>Hosts who publish spaces on the Platform agree to:</p>
      <ul className={css.list}>
        <li>Ensure they have legal authority to rent out the listed space;</li>
        <li>Provide accurate, complete and up-to-date information about the space (description, photographs, rules, prices and availability);</li>
        <li>Comply with all applicable legal obligations, including licences, permits and mandatory insurance;</li>
        <li>Maintain the space in the conditions described in the listing and ensure access for the Guest on the booked dates;</li>
        <li>Respond promptly to booking requests and communications through the Platform.</li>
      </ul>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>6. Guest Obligations</h2>
      <p className={css.text}>Guests who make bookings through the Platform agree to:</p>
      <ul className={css.list}>
        <li>Use the space exclusively for the purposes stated in the booking and in accordance with the rules set by the Host;</li>
        <li>Respect the agreed booking period and vacate the space at the scheduled time;</li>
        <li>Leave the space in the condition in which it was found, being responsible for any damage caused;</li>
        <li>Pay the full booking amount as agreed and within the established deadlines.</li>
      </ul>
      <p className={css.text}>
        <strong>Account suspension and termination.</strong> Venue1Hub may temporarily
        suspend, restrict features of, or permanently close a user account (Host or
        Guest) in the following cases, without entitlement to compensation or refund of
        commissions already charged:
      </p>
      <ul className={css.list}>
        <li>Provision of false, misleading or outdated information at registration or in listings;</li>
        <li>Attempted fraud, money laundering or misuse of the payment system;</li>
        <li>Repeated breach of Host or Guest obligations;</li>
        <li>Use of the space for unlawful purposes or against public order or morality;</li>
        <li>Discrimination, harassment, offensive language or hate speech towards other users;</li>
        <li>Multiple substantiated complaints from other users or public authorities;</li>
        <li>Attempts to bypass the Platform to complete a booking off-platform;</li>
        <li>Infringement of third-party or Venue1Hub intellectual property rights;</li>
        <li>Attempts to exploit technical vulnerabilities, API abuse or unauthorised automated use.</li>
      </ul>
      <p className={css.text}>
        Where possible, the user will be notified of the suspension and may respond
        within 7 working days. In serious cases or where there is imminent risk,
        suspension may be immediate without prior notice.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>7. Commissions, Payments and Invoicing</h2>
      <p className={css.text}>Venue1Hub charges a commission on each booking confirmed through the Platform, which may be split between the Host and the Guest. The applicable commission amount is presented transparently before the confirmation of each booking.</p>
      <p className={css.text}>Payments are processed securely through Stripe, a certified payment processing partner. Venue1Hub will issue invoices for its commissions and premium services, in accordance with Portuguese tax legislation and applicable VAT obligations.</p>
      <p className={css.text}>Premium subscriptions are also available for Hosts, with listing highlight features, access to advanced analytics and external calendar integrations.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>8. Rental Agreements</h2>
      <p className={css.text}>All bookings completed through the Platform are formalised by a short-term, non-residential rental agreement, in accordance with Articles 1022 et seq. of the Portuguese Civil Code. Agreements are pre-approved, digitally accepted by both parties and include clauses relating to duration, responsibilities, cancellation and jurisdiction.</p>
      <p className={css.text}>Venue1Hub acts as a digital intermediary and is not a contracting party to the rental agreements concluded between Hosts and Guests.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>9. Cancellations and Refunds</h2>
      <p className={css.text}>Cancellation policies are defined by each Host and clearly presented in their listing. Guests should review the applicable cancellation policy before making a booking. Venue1Hub reserves the right to cancel bookings in cases of breach of these Terms, without obligation to provide a refund.</p>
      <p className={css.text}>
        <strong>Right of withdrawal (Decree-Law 24/2014):</strong> distance contracts
        between professionals and consumers are generally subject to a 14-day
        withdrawal right. However, under Article 17(1)(l) of Decree-Law 24/2014, this
        right <strong>does not apply</strong> to accommodation services or use of
        spaces for non-residential purposes when the contract specifies a particular
        date or period of performance. Where applicable, withdrawal must be
        communicated using the form available on the Contact page, within 14 days of
        contract conclusion and before the start of the service.
      </p>
      <p className={css.text}>
        <strong>Electronic Complaints Book:</strong> under Decree-Law 74/2017, the
        Electronic Complaints Book is available to users at{' '}
        <a
          href="https://www.livroreclamacoes.pt"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#7C6350', fontWeight: 700, textDecoration: 'underline' }}
        >
          www.livroreclamacoes.pt
        </a>
        . Submitted complaints will be answered within the legal deadline of 15
        working days.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>10. Platform Liability</h2>
      <p className={css.text}>As a digital intermediary, under Decree-Law no. 7/2004 of 7 January, as amended by Decree-Law no. 41/2021, Venue1Hub is not liable for:</p>
      <ul className={css.list}>
        <li>Damage occurring during the use of rented spaces;</li>
        <li>Breach of contract by Hosts or Guests;</li>
        <li>Incorrect or outdated information provided by users;</li>
        <li>Temporary unavailability of the Platform for technical or force majeure reasons.</li>
      </ul>
      <p className={css.text}>Users are responsible for taking out appropriate insurance for the use of spaces. Venue1Hub may offer temporary insurance as an optional complementary service.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>11. Reporting Content and Moderation</h2>
      <p className={css.text}>Any user (registered or visitor) may report a listing they consider inappropriate, fraudulent, misleading or in breach of these Terms, via the <strong>"Report this listing"</strong> button available on each listing page or by contacting <strong>admin@v1h.net</strong> directly.</p>
      <p className={css.text}>Valid reasons for reporting include, in particular:</p>
      <ul className={css.list}>
        <li>Misleading, false or consumer-deceiving content;</li>
        <li>Inappropriate, offensive photos or photos that do not match the space;</li>
        <li>Listings of non-existent spaces or fraud attempts;</li>
        <li>Discrimination, offensive language or hate speech;</li>
        <li>Spam, duplicate content or misuse of the Platform.</li>
      </ul>
      <p className={css.text}>Venue1Hub commits to reviewing all reports within a reasonable timeframe and reserves the right, without prior notice, to:</p>
      <ul className={css.list}>
        <li>Temporarily suspend the listing during the review;</li>
        <li>Request clarification or amendments from the Host;</li>
        <li>Permanently remove the listing in case of confirmed breach;</li>
        <li>Close the user's account in case of serious or repeated non-compliance.</li>
      </ul>
      <p className={css.text}>The reporter is, where possible, informed of the outcome of the review. The Platform protects the reporter's identity and complies with the GDPR in the processing of report-related data.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>12. Intellectual Property</h2>
      <p className={css.text}>All content on the Venue1Hub Platform (including logos, interface, texts, design and technological architecture) is the exclusive property of Venue1Hub and is protected by applicable intellectual and industrial property legislation.</p>
      <p className={css.text}>Venue1Hub also holds a European Patent application, registered under no. 20242006440889 (INPI Portugal), dated 2 September 2024, relating to the innovative online booking system for commercial spaces that underpins the Platform.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>13. Dispute Resolution</h2>
      <p className={css.text}>In the event of a dispute between users, Venue1Hub provides an internal mediation system supported by the Platform's records and history. Users may also have recourse to:</p>
      <ul className={css.list}>
        <li>Officially recognised arbitration and mediation centres in Portugal (e.g. CACCL, Lisbon Consumer Dispute Arbitration Centre);</li>
        <li>European Online Dispute Resolution (ODR) Platform: <strong>https://ec.europa.eu/consumers/odr</strong></li>
      </ul>
      <p className={css.text}>Unless otherwise agreed between the parties, the competent court for resolving disputes arising from these Terms is the Court of the District of Coimbra.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>14. Changes to the Terms</h2>
      <p className={css.text}>Venue1Hub reserves the right to amend these Terms of Service at any time, with prior notice to users with reasonable advance notice. Continued use of the Platform after the changes take effect implies acceptance of the new terms.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>15. Governing Law</h2>
      <p className={css.text}>These Terms of Service are governed by Portuguese law, in particular the Civil Code, Decree-Law no. 7/2004 (Electronic Commerce) and other applicable legislation.</p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>16. Contact</h2>
      <p className={css.text}>For any questions related to these Terms of Service, please contact Venue1Hub through the means available on the Platform's Contact page.</p>
    </div>

    <p className={css.updated}>Last updated: April 2026</p>
  </div>
);

export const TermsOfServiceContent = () => {
  const { locale } = useLocale();
  return locale === 'en' ? <TermsOfServiceContentEN /> : <TermsOfServiceContentPT />;
};

const TermsOfServicePageComponent = props => {
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
      title={isEN ? 'Terms of Service | Venue1Hub' : 'Termos de Serviço | Venue1Hub'}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn
        hideRecentlyViewed
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.content}>
          <h1 className={css.title}>{isEN ? 'Terms of Service' : 'Termos de Serviço'}</h1>
          <TermsOfServiceContent />
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

const TermsOfServicePage = compose(connect(mapStateToProps))(TermsOfServicePageComponent);

const TOS_ASSET_NAME = 'terms-of-service';
export { TOS_ASSET_NAME, TermsOfServicePageComponent };
export default TermsOfServicePage;
