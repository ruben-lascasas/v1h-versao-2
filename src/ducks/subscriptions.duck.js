import { createSlice } from '@reduxjs/toolkit';

/**
 * Planos de subscrição do anfitrião, lado do cliente.
 *
 * O catálogo nunca é escrito aqui: vem do servidor com o estado, para que
 * mudar preços ou acrescentar um plano não obrigue a tocar no frontend. Também
 * é o servidor que diz se o Stripe está sequer configurado — sem isso os botões
 * de assinatura não aparecem, em vez de aparecerem e falharem.
 */

const initialState = {
  fetched: false,
  loading: false,
  plan: 'gratuito',
  commissionModel: null,
  subscription: null,
  catalogue: [],
  billingConfigured: false,
  // Plano cujo botão está a aguardar resposta, para desactivar só esse.
  redirecting: null,
  error: null,
};

const slice = createSlice({
  name: 'subscriptions',
  initialState,
  reducers: {
    statusRequested: state => {
      state.loading = true;
      state.error = null;
    },
    statusReceived: (state, action) => {
      state.loading = false;
      state.fetched = true;
      state.plan = action.payload.plan || 'gratuito';
      state.commissionModel = action.payload.commissionModel || null;
      state.subscription = action.payload.subscription || null;
      state.catalogue = action.payload.catalogue || [];
      state.billingConfigured = Boolean(action.payload.billingConfigured);
    },
    statusFailed: (state, action) => {
      state.loading = false;
      state.fetched = true;
      state.error = action.payload || 'status-failed';
    },
    redirectStarted: (state, action) => {
      state.redirecting = action.payload;
      state.error = null;
    },
    redirectFailed: (state, action) => {
      state.redirecting = null;
      state.error = action.payload || 'redirect-failed';
    },
  },
});

export const {
  statusRequested,
  statusReceived,
  statusFailed,
  redirectStarted,
  redirectFailed,
} = slice.actions;

export default slice.reducer;

// ================ Selectors ================ //

export const selectSubscriptions = state => state.subscriptions;

// ================ Thunks ================ //

export const fetchSubscriptionStatus = () => async dispatch => {
  dispatch(statusRequested());
  try {
    const response = await fetch('/api/subscriptions', { credentials: 'include' });
    if (!response.ok) throw new Error(String(response.status));
    dispatch(statusReceived(await response.json()));
  } catch (e) {
    dispatch(statusFailed(e.message));
  }
};

/**
 * Pede uma sessão ao Stripe e encaminha o browser para lá.
 *
 * O plano não muda aqui nem no regresso: quem o muda é o webhook, depois de o
 * Stripe confirmar a cobrança. Ao voltar, a página relê o estado.
 */
const goToStripe = (endpoint, body, key) => async dispatch => {
  dispatch(redirectStarted(key));
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) throw new Error(data.error || String(response.status));
    window.location.assign(data.url);
  } catch (e) {
    dispatch(redirectFailed(e.message));
  }
};

export const startCheckout = (plan, interval, locale) =>
  goToStripe('/api/subscriptions/checkout', { plan, interval, locale }, plan);

export const openBillingPortal = () =>
  goToStripe('/api/subscriptions/portal', {}, 'portal');
