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

import css from './CookiePolicyPage.module.css';

const CookiePolicyContentPT = () => (
  <div>
    <div className={css.section}>
      <h2 className={css.sectionTitle}>1. O que são cookies</h2>
      <p className={css.text}>
        Cookies são pequenos ficheiros de texto que o seu browser armazena no seu dispositivo
        quando visita um site. Servem para que o site se "lembre" de informações entre páginas
        ou visitas, por exemplo, manter a sessão de login, guardar preferências de idioma ou
        recolher estatísticas anónimas de utilização. Tecnologias semelhantes (web beacons,
        local storage) são tratadas, para os efeitos da presente Política, da mesma forma que
        os cookies.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>2. Tipos de cookies utilizados</h2>
      <p className={css.text}>A Plataforma Venue1Hub utiliza as seguintes categorias de cookies:</p>
      <p className={css.text}>
        <strong>Cookies essenciais (estritamente necessários):</strong> indispensáveis ao
        funcionamento da Plataforma. Sem eles, funcionalidades básicas como autenticação,
        carrinho de reservas ou navegação segura não funcionariam. Estes cookies não exigem
        consentimento prévio nos termos do Artigo 5.º, n.º 3 da Diretiva ePrivacy.
      </p>
      <p className={css.text}>
        <strong>Cookies de preferências:</strong> guardam escolhas do utilizador (idioma,
        moeda, filtros de pesquisa recentes) para melhorar a experiência em visitas seguintes.
      </p>
      <p className={css.text}>
        <strong>Cookies analíticos:</strong> recolhem informação agregada e anónima sobre como
        os utilizadores interagem com a Plataforma (páginas mais visitadas, tempo de
        permanência, dispositivos utilizados). Permitem identificar problemas e melhorar o
        serviço. São ativados mediante consentimento.
      </p>
      <p className={css.text}>
        <strong>Cookies de marketing:</strong> utilizados para personalizar conteúdo,
        comunicações e anúncios relevantes para o utilizador. São ativados apenas mediante
        consentimento expresso.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>3. Cookies em utilização na Plataforma</h2>
      <p className={css.text}>
        A tabela seguinte indica os principais cookies que podem ser definidos durante a
        utilização da Plataforma. A lista pode evoluir ao longo do tempo; consulte esta página
        regularmente para a versão atual.
      </p>
      <table className={css.cookieTable}>
        <thead>
          <tr>
            <th>Nome / Domínio</th>
            <th>Categoria</th>
            <th>Finalidade</th>
            <th>Duração</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>st-authinfo / st-* (sharetribe.com)</td>
            <td>Essencial</td>
            <td>Sessão autenticada do utilizador na Plataforma</td>
            <td>Sessão / até 7 dias</td>
          </tr>
          <tr>
            <td>locale (venue1hub.com)</td>
            <td>Preferências</td>
            <td>Memorizar o idioma escolhido (PT/EN)</td>
            <td>1 ano</td>
          </tr>
          <tr>
            <td>locationSearchHistory (localStorage)</td>
            <td>Preferências</td>
            <td>Guardar pesquisas recentes na barra de pesquisa</td>
            <td>Persistente até ser limpo pelo utilizador</td>
          </tr>
          <tr>
            <td>v1h_category_counts (sessionStorage)</td>
            <td>Essencial</td>
            <td>
              Cache temporária do número de anúncios por categoria, para reduzir chamadas
              à API e evitar limites de utilização durante a sessão
            </td>
            <td>Sessão (limpo ao fechar o browser)</td>
          </tr>
          <tr>
            <td>v1h_pwa_installed / v1h_pwa_install_dismissed (localStorage)</td>
            <td>Preferências</td>
            <td>
              Memorizar se o utilizador instalou a aplicação V1HUB no dispositivo (Progressive
              Web App) ou se já dispensou o convite de instalação, para não repetir o pedido.
            </td>
            <td>Persistente até ser limpo pelo utilizador</td>
          </tr>
          <tr>
            <td>v1h_welcome_pending (localStorage)</td>
            <td>Preferências</td>
            <td>
              Sinalizar que o pop-up de boas-vindas deve aparecer uma vez após o registo
              do utilizador.
            </td>
            <td>Sessão (removido após o pop-up ser mostrado)</td>
          </tr>
          <tr>
            <td>recently_viewed_session (sessionStorage)</td>
            <td>Funcional</td>
            <td>
              Guardar os anúncios visualizados recentemente, para mostrar a secção
              &quot;Vistos recentemente&quot; durante a navegação.
            </td>
            <td>Sessão (limpo ao fechar o browser)</td>
          </tr>
          <tr>
            <td>following_* / favorites_* (localStorage)</td>
            <td>Funcional</td>
            <td>
              Guardar a lista de anfitriões seguidos e anúncios marcados como favoritos para
              acesso rápido entre sessões.
            </td>
            <td>Persistente até ser limpo pelo utilizador</td>
          </tr>
          <tr>
            <td>__stripe_mid / __stripe_sid (stripe.com)</td>
            <td>Essencial</td>
            <td>
              Prevenção de fraude no processamento de pagamentos. Base legal: execução
              de contrato (Art. 6.º/1/b RGPD). Sem estes cookies o pagamento não pode
              ser processado em segurança.
            </td>
            <td>1 ano / 30 minutos</td>
          </tr>
          <tr>
            <td>mapbox.eventData / mapbox-gl (mapbox.com)</td>
            <td>Essencial</td>
            <td>
              Renderização de mapas, geocodificação de moradas e medição de utilização
              da API
            </td>
            <td>Sessão / persistente até 1 ano</td>
          </tr>
          <tr>
            <td>_ga / _ga_* (Google Analytics)</td>
            <td>Analítico</td>
            <td>Estatísticas agregadas de utilização (quando ativado)</td>
            <td>2 anos</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>4. Cookies de terceiros</h2>
      <p className={css.text}>
        Alguns cookies podem ser definidos por serviços de terceiros que ajudam a operar a
        Plataforma:
      </p>
      <ul className={css.list}>
        <li>
          <strong>Stripe</strong>: processamento de pagamentos e prevenção de fraude.
          Política: stripe.com/privacy
        </li>
        <li>
          <strong>Sharetribe</strong>: infraestrutura da Plataforma na fase inicial.
          Política: sharetribe.com/privacy-policy
        </li>
        <li>
          <strong>Mapbox</strong>: apresentação de mapas e geocodificação de moradas.
          Política: mapbox.com/legal/privacy
        </li>
        <li>
          <strong>Google</strong>: autenticação social ("Continuar com Google") e, quando
          ativado, Google Analytics. Política: policies.google.com/privacy
        </li>
      </ul>
      <p className={css.text}>
        A Venue1Hub não controla diretamente os cookies definidos por estes terceiros. Para
        mais informações, consulte as respetivas políticas de privacidade.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>5. Como gerir os cookies</h2>
      <p className={css.text}>
        O utilizador pode aceitar, recusar ou eliminar cookies a qualquer momento das seguintes
        formas:
      </p>
      <ul className={css.list}>
        <li>
          <strong>No browser:</strong> todas as configurações de cookies (eliminar, bloquear,
          ser avisado) estão disponíveis nas definições do browser. Consulte as instruções
          específicas em Chrome, Firefox, Safari, Edge ou outro browser que utilize;
        </li>
        <li>
          <strong>Modo privado/anónimo:</strong> abrir a Plataforma em modo privado impede o
          armazenamento persistente da maioria dos cookies;
        </li>
        <li>
          <strong>Painel de consentimento:</strong> a Plataforma disponibiliza um banner
          de consentimento à primeira visita, permitindo aceitar ou recusar categorias
          específicas de cookies não essenciais. A escolha pode ser revertida a qualquer
          momento através do link <em>"Definições de cookies"</em> presente no rodapé do
          site.
        </li>
        <li>
          <strong>Armazenamento local (localStorage / sessionStorage):</strong> as
          tecnologias de armazenamento local sujeitam-se ao mesmo regime jurídico dos
          cookies nos termos do Artigo 5.º, n.º 3 da Diretiva ePrivacy. Estão listadas
          na tabela acima sempre que armazenem informação não estritamente necessária ao
          serviço solicitado.
        </li>
      </ul>
      <p className={css.text}>
        Bloquear todos os cookies, incluindo os essenciais, pode impedir o funcionamento de
        partes importantes da Plataforma (como manter o login).
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>6. Base legal e consentimento</h2>
      <p className={css.text}>
        A utilização de cookies essenciais baseia-se no interesse legítimo da Venue1Hub em
        prestar o serviço solicitado pelo utilizador. A utilização de cookies não essenciais
        (analíticos, marketing, preferências avançadas) baseia-se no consentimento do
        utilizador, podendo ser retirado a qualquer momento sem afetar a licitude do tratamento
        anterior.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>7. Alterações a esta Política</h2>
      <p className={css.text}>
        A presente Política de Cookies pode ser atualizada periodicamente, em função de
        alterações tecnológicas, de fornecedores ou regulatórias. A data da última atualização
        está indicada no fim do documento.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>8. Contacto</h2>
      <p className={css.text}>
        Para questões relativas à utilização de cookies ou ao tratamento de dados pessoais,
        contacte a Venue1Hub através dos meios disponíveis na página de Contacto da Plataforma.
        Para a Política de Privacidade completa, consulte o documento próprio acessível no
        rodapé do site.
      </p>
    </div>

    <p className={css.updated}>Última atualização: Abril de 2026</p>
  </div>
);

const CookiePolicyContentEN = () => (
  <div>
    <div className={css.section}>
      <h2 className={css.sectionTitle}>1. What cookies are</h2>
      <p className={css.text}>
        Cookies are small text files that your browser stores on your device when you visit a
        website. They allow a site to "remember" information across pages or visits, for
        example, keeping you logged in, saving language preferences, or collecting anonymous
        usage statistics. Similar technologies (web beacons, local storage) are treated, for
        the purposes of this Policy, the same as cookies.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>2. Categories of cookies used</h2>
      <p className={css.text}>The Venue1Hub Platform uses the following cookie categories:</p>
      <p className={css.text}>
        <strong>Essential cookies (strictly necessary):</strong> indispensable for the
        Platform to function. Without them, basic features such as authentication, booking
        cart and secure browsing would not work. These cookies do not require prior consent
        under Article 5(3) of the ePrivacy Directive.
      </p>
      <p className={css.text}>
        <strong>Preference cookies:</strong> store user choices (language, currency, recent
        search filters) to improve the experience on subsequent visits.
      </p>
      <p className={css.text}>
        <strong>Analytics cookies:</strong> collect aggregated and anonymous information about
        how users interact with the Platform (most-visited pages, time on site, devices). They
        help identify issues and improve the service. They are activated subject to consent.
      </p>
      <p className={css.text}>
        <strong>Marketing cookies:</strong> used to personalise content, communications and
        ads relevant to the user. Activated only with explicit consent.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>3. Cookies in use on the Platform</h2>
      <p className={css.text}>
        The table below lists the main cookies that may be set while using the Platform. The
        list may change over time; please check this page regularly for the current version.
      </p>
      <table className={css.cookieTable}>
        <thead>
          <tr>
            <th>Name / Domain</th>
            <th>Category</th>
            <th>Purpose</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>st-authinfo / st-* (sharetribe.com)</td>
            <td>Essential</td>
            <td>Authenticated user session on the Platform</td>
            <td>Session / up to 7 days</td>
          </tr>
          <tr>
            <td>locale (venue1hub.com)</td>
            <td>Preference</td>
            <td>Remember the chosen language (PT/EN)</td>
            <td>1 year</td>
          </tr>
          <tr>
            <td>locationSearchHistory (localStorage)</td>
            <td>Preference</td>
            <td>Save recent searches in the search bar</td>
            <td>Persistent until cleared by the user</td>
          </tr>
          <tr>
            <td>v1h_category_counts (sessionStorage)</td>
            <td>Essential</td>
            <td>
              Temporary cache of listing counts per category, used to reduce API calls
              and avoid rate limits during the session
            </td>
            <td>Session (cleared when the browser is closed)</td>
          </tr>
          <tr>
            <td>__stripe_mid / __stripe_sid (stripe.com)</td>
            <td>Essential</td>
            <td>
              Fraud prevention in payment processing. Legal basis: contract performance
              (Art. 6(1)(b) GDPR). Without these cookies the payment cannot be securely
              processed.
            </td>
            <td>1 year / 30 minutes</td>
          </tr>
          <tr>
            <td>mapbox.eventData / mapbox-gl (mapbox.com)</td>
            <td>Essential</td>
            <td>
              Map rendering, address geocoding, and API usage measurement
            </td>
            <td>Session / persistent up to 1 year</td>
          </tr>
          <tr>
            <td>_ga / _ga_* (Google Analytics)</td>
            <td>Analytics</td>
            <td>Aggregated usage statistics (when enabled)</td>
            <td>2 years</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>4. Third-party cookies</h2>
      <p className={css.text}>
        Some cookies may be set by third-party services that help operate the Platform:
      </p>
      <ul className={css.list}>
        <li>
          <strong>Stripe</strong>: payment processing and fraud prevention. Policy:
          stripe.com/privacy
        </li>
        <li>
          <strong>Sharetribe</strong>: Platform infrastructure during the initial phase.
          Policy: sharetribe.com/privacy-policy
        </li>
        <li>
          <strong>Mapbox</strong>: map display and address geocoding. Policy:
          mapbox.com/legal/privacy
        </li>
        <li>
          <strong>Google</strong>: social authentication ("Continue with Google") and, when
          enabled, Google Analytics. Policy: policies.google.com/privacy
        </li>
      </ul>
      <p className={css.text}>
        Venue1Hub does not directly control cookies set by these third parties. For more
        information, please consult the respective privacy policies.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>5. How to manage cookies</h2>
      <p className={css.text}>
        Users may accept, refuse or delete cookies at any time in the following ways:
      </p>
      <ul className={css.list}>
        <li>
          <strong>In your browser:</strong> all cookie settings (delete, block, alert before
          storing) are available in your browser preferences. Check the specific instructions
          for Chrome, Firefox, Safari, Edge or whichever browser you use;
        </li>
        <li>
          <strong>Private/incognito mode:</strong> opening the Platform in private mode
          prevents persistent storage of most cookies;
        </li>
        <li>
          <strong>Consent banner:</strong> the Platform displays a consent banner on first
          visit, allowing users to accept or refuse specific categories of non-essential
          cookies. The choice can be reversed at any time via the <em>"Cookie settings"</em>
          link in the website footer.
        </li>
        <li>
          <strong>Local storage (localStorage / sessionStorage):</strong> local storage
          technologies are subject to the same legal regime as cookies under Article 5(3)
          of the ePrivacy Directive. They are listed in the table above whenever they
          store information that is not strictly necessary to the requested service.
        </li>
      </ul>
      <p className={css.text}>
        Blocking all cookies, including essential ones, may prevent important parts of the
        Platform from working (such as keeping you logged in).
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>6. Legal basis and consent</h2>
      <p className={css.text}>
        The use of essential cookies is based on Venue1Hub's legitimate interest in providing
        the service requested by the user. The use of non-essential cookies (analytics,
        marketing, advanced preferences) is based on the user's consent, which may be
        withdrawn at any time without affecting the lawfulness of prior processing.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>7. Changes to this Policy</h2>
      <p className={css.text}>
        This Cookie Policy may be updated periodically due to technological, supplier or
        regulatory changes. The date of the last update is shown at the end of this document.
      </p>
    </div>

    <div className={css.section}>
      <h2 className={css.sectionTitle}>8. Contact</h2>
      <p className={css.text}>
        For questions regarding the use of cookies or the processing of personal data, please
        contact Venue1Hub through the means available on the Contact page. For the full
        Privacy Policy, see the dedicated document available in the site footer.
      </p>
    </div>

    <p className={css.updated}>Last updated: April 2026</p>
  </div>
);

export const CookiePolicyContent = () => {
  const { locale } = useLocale();
  return locale === 'en' ? <CookiePolicyContentEN /> : <CookiePolicyContentPT />;
};

const CookiePolicyPageComponent = props => {
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
      title={isEN ? 'Cookie Policy | Venue1Hub' : 'Política de Cookies | Venue1Hub'}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn
        hideRecentlyViewed
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.content}>
          <h1 className={css.title}>{isEN ? 'Cookie Policy' : 'Política de Cookies'}</h1>
          <CookiePolicyContent />
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

const CookiePolicyPage = compose(connect(mapStateToProps))(CookiePolicyPageComponent);

const COOKIE_POLICY_ASSET_NAME = 'cookie-policy';
export { COOKIE_POLICY_ASSET_NAME, CookiePolicyPageComponent };
export default CookiePolicyPage;
