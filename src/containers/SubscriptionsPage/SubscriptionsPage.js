import React, { useEffect } from 'react';
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

// O que cada plano dá, do §8.3. Fica no frontend por ser texto de marketing;
// os números todos vêm do servidor.
const BENEFITS = {
  gratuito: {
    pt: ['Publicação de espaços', 'Gestão de reservas', 'Calendário e mensagens', 'Pagamentos integrados'],
    en: ['Listing publication', 'Booking management', 'Calendar and messaging', 'Integrated payments'],
  },
  pro: {
    pt: ['Tudo do plano Gratuito', 'Destaque nas pesquisas', 'Estatísticas detalhadas', 'Relatórios mensais', 'Apoio prioritário'],
    en: ['Everything in Free', 'Search highlighting', 'Detailed statistics', 'Monthly reports', 'Priority support'],
  },
  business: {
    pt: ['Tudo do plano Pro', 'Gestão multi-espaço', 'Comissão reduzida', 'Painel comercial', 'Gestão de equipas'],
    en: ['Everything in Pro', 'Multi-venue management', 'Reduced commission', 'Commercial dashboard', 'Team management'],
  },
  enterprise: {
    pt: ['Soluções personalizadas', 'Múltiplas localizações', 'Comissão negociada', 'Gestor de conta dedicado', 'Acordos de nível de serviço'],
    en: ['Custom solutions', 'Multiple locations', 'Negotiated commission', 'Dedicated account manager', 'Service level agreements'],
  },
};

const PlanCard = ({ plan, isCurrent, isEN, redirecting, onSubscribe }) => {
  const label = isEN ? plan.labelEN : plan.label;
  const benefits = BENEFITS[plan.key]?.[isEN ? 'en' : 'pt'] || [];
  const isQuoteOnly = plan.monthly === null;

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
            <span className={css.priceValue}>{money(plan.monthly, isEN)}</span>
            <span className={css.pricePeriod}> {t(isEN, '/ mês', '/ month')}</span>
          </>
        )}
      </p>

      {plan.yearly ? (
        <p className={css.priceYearly}>
          {t(
            isEN,
            `ou ${money(plan.yearly, isEN)} / ano`,
            `or ${money(plan.yearly, isEN)} / year`
          )}
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
          <a className={css.buttonSecondary} href="/contacto">
            {t(isEN, 'Falar connosco', 'Contact us')}
          </a>
        ) : plan.available ? (
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
        ) : (
          <span className={css.unavailable}>{t(isEN, 'Brevemente', 'Coming soon')}</span>
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
    billingConfigured,
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

  const handleSubscribe = key => dispatch(startCheckout(key, 'month', locale));

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

          {error ? (
            <p className={css.error}>
              {t(
                isEN,
                'Não foi possível falar com o serviço de pagamentos. Tente novamente.',
                'Could not reach the payment service. Please try again.'
              )}
            </p>
          ) : null}

          {!fetched && loading ? <p className={css.muted}>{t(isEN, 'A carregar…', 'Loading…')}</p> : null}

          {fetched && !billingConfigured ? (
            <p className={css.notice}>
              {t(
                isEN,
                'As subscrições ainda não estão activas nesta instalação.',
                'Subscriptions are not enabled on this installation yet.'
              )}
            </p>
          ) : null}

          {fetched && catalogue.length > 0 ? (
            <ul className={css.grid}>
              {catalogue.map(p => (
                <PlanCard
                  key={p.key}
                  plan={p}
                  isCurrent={p.key === plan}
                  isEN={isEN}
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
