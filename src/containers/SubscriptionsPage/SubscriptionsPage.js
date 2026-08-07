import React, { useEffect, useState } from 'react';
import { compose } from 'redux';
import { connect, useDispatch, useSelector } from 'react-redux';
import classNames from 'classnames';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useLocale } from '../../context/localeContext';
import {
  fetchSubscriptionStatus,
  startCheckout,
  openBillingPortal,
  selectSubscriptions,
} from '../../ducks/subscriptions.duck';
import { Page, LayoutSingleColumn, H2 } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './SubscriptionsPage.module.css';

/**
 * Planos de subscrição do anfitrião (§8.3 do plano de negócios).
 *
 * O catálogo, os preços e a disponibilidade vêm todos do servidor. Esta página
 * não sabe quanto custa nada nem que planos existem — só os desenha.
 */

const t = (isEN, pt, en) => (isEN ? en : pt);

const money = (value, isEN) =>
  new Intl.NumberFormat(isEN ? 'en-GB' : 'pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
  }).format(value);

// Transcrito do §8.3 do plano de negócios, item a item e pela mesma ordem.
// Fica no frontend por ser texto comercial; os preços vêm todos do servidor.
const BENEFITS = {
  gratuito: {
    pt: [
      'Publicação de espaços',
      'Gestão de reservas',
      'Calendário básico',
      'Sistema de mensagens',
      'Pagamentos integrados',
      'Acesso ao marketplace',
    ],
    en: [
      'Listing publication',
      'Booking management',
      'Basic calendar',
      'Messaging system',
      'Integrated payments',
      'Marketplace access',
    ],
  },
  pro: {
    pt: [
      'Tudo do plano Gratuito',
      'Destaque moderado nas pesquisas',
      'Estatísticas detalhadas',
      'Relatórios mensais',
      'Integração com Google Calendar',
      'Personalização do perfil',
      'Apoio prioritário',
    ],
    en: [
      'Everything in Free',
      'Moderate search highlighting',
      'Detailed statistics',
      'Monthly reports',
      'Google Calendar integration',
      'Profile customisation',
      'Priority support',
    ],
  },
  business: {
    pt: [
      'Gestão multi-espaço',
      'Relatórios avançados',
      'Dashboard comercial',
      'Gestão de equipas',
      'Ferramentas de marketing',
      'Campanhas promocionais',
      'Integração com ferramentas externas',
    ],
    en: [
      'Multi-venue management',
      'Advanced reports',
      'Commercial dashboard',
      'Team management',
      'Marketing tools',
      'Promotional campaigns',
      'External tool integrations',
    ],
  },
  enterprise: {
    pt: [
      'Soluções personalizadas',
      'Gestão de múltiplas localizações',
      'Relatórios executivos',
      'Integrações específicas',
      'Suporte dedicado',
      'Acordos de nível de serviço (SLA)',
      'Funcionalidades exclusivas',
    ],
    en: [
      'Custom solutions',
      'Multiple location management',
      'Executive reports',
      'Specific integrations',
      'Dedicated support',
      'Service level agreements (SLA)',
      'Exclusive features',
    ],
  },
};

/** Quanto se poupa ao pagar o ano de uma vez, em meses oferecidos. */
const monthsSaved = plan =>
  plan.monthly && plan.yearly ? Math.round((plan.monthly * 12 - plan.yearly) / plan.monthly) : 0;

const PlanCard = ({ plan, isCurrent, isEN, interval, redirecting, onSubscribe }) => {
  const label = isEN ? plan.labelEN : plan.label;
  const benefits = BENEFITS[plan.key]?.[isEN ? 'en' : 'pt'] || [];
  const isQuoteOnly = plan.monthly === null;
  const isYear = interval === 'year';
  const amount = isYear ? plan.yearly : plan.monthly;
  const saved = monthsSaved(plan);

  return (
    <li className={classNames(css.card, { [css.cardCurrent]: isCurrent })}>
      {isCurrent ? (
        <span className={css.currentBadge}>{t(isEN, 'Plano actual', 'Current plan')}</span>
      ) : null}

      <h3 className={css.cardTitle}>{label}</h3>

      <p className={css.price}>
        {isQuoteOnly ? (
          <span className={css.priceQuote}>{t(isEN, 'Sob consulta', 'On request')}</span>
        ) : (
          <>
            <span className={css.priceValue}>{money(amount, isEN)}</span>
            <span className={css.pricePeriod}>
              {' '}
              {isYear ? t(isEN, '/ ano', '/ year') : t(isEN, '/ mês', '/ month')}
            </span>
          </>
        )}
      </p>

      {isQuoteOnly ? null : isYear && saved > 0 ? (
        <p className={css.priceYearly}>
          {t(
            isEN,
            `Equivale a ${saved} ${saved === 1 ? 'mês' : 'meses'} oferecidos`,
            `That is ${saved} ${saved === 1 ? 'month' : 'months'} free`
          )}
        </p>
      ) : plan.yearly ? (
        <p className={css.priceYearly}>
          {t(isEN, `ou ${money(plan.yearly, isEN)} / ano`, `or ${money(plan.yearly, isEN)} / year`)}
        </p>
      ) : null}

      <ul className={css.benefits}>
        {benefits.map(b => (
          <li key={b} className={css.benefit}>
            {b}
          </li>
        ))}
      </ul>

      <div className={css.cardFooter}>
        {isCurrent ? null : isQuoteOnly ? (
          <a className={css.buttonSecondary} href="/contact">
            {t(isEN, 'Falar connosco', 'Contact us')}
          </a>
        ) : (
          // O botão está sempre presente, mesmo antes de o Stripe estar
          // configurado: o percurso completo já existe e passa a funcionar
          // assim que as chaves e os Prices entrarem, sem alterar código. Sem
          // configuração, o servidor recusa e a página explica porquê, em vez
          // de haver aqui um botão morto a dizer "brevemente".
          <button
            type="button"
            className={css.button}
            disabled={Boolean(redirecting)}
            onClick={() => onSubscribe(plan.key)}
          >
            {redirecting === plan.key
              ? t(isEN, 'A abrir…', 'Opening…')
              : t(isEN, 'Assinar', 'Subscribe')}
          </button>
        )}
      </div>
    </li>
  );
};

const SubscriptionsPage = props => {
  const { scrollingDisabled } = props;
  const dispatch = useDispatch();
  const { locale } = useLocale();
  const isEN = locale === 'en';

  const currentUser = useSelector(state => state.user?.currentUser);
  const {
    fetched,
    loading,
    plan,
    subscription,
    catalogue,
    redirecting,
    error,
  } = useSelector(selectSubscriptions);

  useEffect(() => {
    if (currentUser?.id) dispatch(fetchSubscriptionStatus());
  }, [currentUser?.id?.uuid, dispatch]);

  const title = t(isEN, 'Planos | Venue1Hub', 'Plans | Venue1Hub');

  // O Checkout devolve o utilizador com ?checkout=sucesso, mas o plano só muda
  // quando o webhook chegar — que pode ser depois deste render.
  const checkoutResult =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('checkout') : null;

  const [interval, setInterval] = useState('month');
  const handleSubscribe = key => dispatch(startCheckout(key, interval, locale));

  // O servidor distingue "não há chave nenhuma" de "falta o Price deste plano";
  // a segunda é a que acontece se alguém criar uns Prices e esquecer outros.
  const errorText = code => {
    switch (code) {
      case 'billing-not-configured':
        return t(
          isEN,
          'Os pagamentos ainda não estão ligados. Assim que a configuração estiver feita, este botão passa a funcionar.',
          'Payments are not connected yet. This button will work as soon as the configuration is in place.'
        );
      case 'price-not-configured':
        return t(
          isEN,
          'Este plano ainda não tem preço configurado no Stripe.',
          'This plan has no price configured in Stripe yet.'
        );
      case 'plan-not-purchasable':
        return t(
          isEN,
          'Este plano não se assina aqui — fale connosco.',
          'This plan is not purchased here — please contact us.'
        );
      default:
        return t(
          isEN,
          'Não foi possível abrir a página de pagamento. Tente novamente.',
          'Could not open the payment page. Please try again.'
        );
    }
  };

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn hideRecentlyViewed topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.root}>
          <H2 as="h1" className={css.title}>
            {t(isEN, 'Planos', 'Plans')}
          </H2>
          <p className={css.intro}>
            {t(
              isEN,
              'Escolha o plano que melhor se ajusta ao seu volume de reservas. Pode mudar ou cancelar quando quiser.',
              'Choose the plan that fits your booking volume. You can change or cancel at any time.'
            )}
          </p>

          {checkoutResult === 'sucesso' ? (
            <p className={css.notice}>
              {t(
                isEN,
                'Pagamento recebido. O plano fica activo assim que o Stripe confirmar — normalmente em segundos. Actualize a página se ainda não o vir.',
                'Payment received. Your plan activates as soon as Stripe confirms — usually within seconds. Refresh if you do not see it yet.'
              )}
            </p>
          ) : null}
          {checkoutResult === 'cancelado' ? (
            <p className={css.notice}>
              {t(isEN, 'Assinatura cancelada. Nada foi cobrado.', 'Checkout cancelled. Nothing was charged.')}
            </p>
          ) : null}

          {error ? <p className={css.error}>{errorText(error)}</p> : null}

          <div className={css.intervalToggle} role="group" aria-label={t(isEN, 'Periodicidade', 'Billing period')}>
            <button
              type="button"
              className={classNames(css.intervalOption, { [css.intervalActive]: interval === 'month' })}
              aria-pressed={interval === 'month'}
              onClick={() => setInterval('month')}
            >
              {t(isEN, 'Mensal', 'Monthly')}
            </button>
            <button
              type="button"
              className={classNames(css.intervalOption, { [css.intervalActive]: interval === 'year' })}
              aria-pressed={interval === 'year'}
              onClick={() => setInterval('year')}
            >
              {t(isEN, 'Anual', 'Yearly')}
              <span className={css.intervalHint}>{t(isEN, '2 meses grátis', '2 months free')}</span>
            </button>
          </div>

          {!fetched && loading ? <p className={css.muted}>{t(isEN, 'A carregar…', 'Loading…')}</p> : null}

          {fetched && catalogue.length > 0 ? (
            <ul className={css.grid}>
              {catalogue.map(p => (
                <PlanCard
                  key={p.key}
                  plan={p}
                  isCurrent={p.key === plan}
                  isEN={isEN}
                  interval={interval}
                  redirecting={redirecting}
                  onSubscribe={handleSubscribe}
                />
              ))}
            </ul>
          ) : null}

          {subscription?.id ? (
            <div className={css.manage}>
              <p className={css.manageText}>
                {subscription.cancelAtPeriodEnd
                  ? t(
                      isEN,
                      'A sua subscrição termina no fim do período actual.',
                      'Your subscription ends at the end of the current period.'
                    )
                  : t(
                      isEN,
                      'Pode mudar o cartão, ver recibos ou cancelar no portal de faturação.',
                      'You can change your card, view receipts or cancel in the billing portal.'
                    )}
              </p>
              <button
                type="button"
                className={css.buttonSecondary}
                disabled={redirecting === 'portal'}
                onClick={() => dispatch(openBillingPortal())}
              >
                {redirecting === 'portal'
                  ? t(isEN, 'A abrir…', 'Opening…')
                  : t(isEN, 'Gerir subscrição', 'Manage subscription')}
              </button>
            </div>
          ) : null}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({ scrollingDisabled: isScrollingDisabled(state) });

export default compose(connect(mapStateToProps))(SubscriptionsPage);
