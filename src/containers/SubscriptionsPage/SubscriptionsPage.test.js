import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';
import SubscriptionsPage from './SubscriptionsPage';

const { screen, userEvent } = testingLibrary;

jest.mock('../../ducks/subscriptions.duck', () => ({
  __esModule: true,
  ...jest.requireActual('../../ducks/subscriptions.duck'),
  fetchSubscriptionStatus: () => ({ type: 'noop' }),
  startCheckout: jest.fn(() => ({ type: 'noop' })),
  openBillingPortal: () => ({ type: 'noop' }),
}));
jest.mock('../TopbarContainer/TopbarContainer', () => () => null);
jest.mock('../FooterContainer/FooterContainer', () => () => null);

const { startCheckout } = require('../../ducks/subscriptions.duck');

// A configuração de testes tem resetMocks ligado, o que limpa a implementação
// definida na fábrica do mock antes de cada teste; sem isto o dispatch recebia
// undefined em vez de uma acção.
beforeEach(() => {
  startCheckout.mockReturnValue({ type: 'noop' });
});

// O mesmo formato que o servidor devolve em GET /api/subscriptions.
const catalogue = [
  { key: 'gratuito', label: 'Gratuito', labelEN: 'Free', monthly: 0, yearly: 0, purchasable: false },
  { key: 'pro', label: 'Pro', labelEN: 'Pro', monthly: 19, yearly: 190, purchasable: true },
  {
    key: 'business',
    label: 'Business',
    labelEN: 'Business',
    monthly: 59,
    yearly: 590,
    purchasable: true,
  },
  {
    key: 'enterprise',
    label: 'Enterprise',
    labelEN: 'Enterprise',
    monthly: null,
    yearly: null,
    purchasable: false,
  },
];

const renderPage = (over = {}) =>
  render(<SubscriptionsPage />, {
    initialState: {
      user: { currentUser: { id: { uuid: 'u1' }, attributes: { profile: {} } } },
      subscriptions: {
        fetched: true,
        loading: false,
        plan: 'gratuito',
        commissionModel: 'standard',
        subscription: null,
        catalogue,
        billingConfigured: false,
        redirecting: null,
        error: null,
        ...over,
      },
    },
  });

describe('os planos estão compráveis mesmo antes de o Stripe estar ligado', () => {
  it('não mostra "Brevemente" em lado nenhum', () => {
    renderPage();
    expect(screen.queryByText(/brevemente/i)).not.toBeInTheDocument();
  });

  it('mostra um botão Assinar por cada plano pago', () => {
    renderPage();
    expect(screen.getAllByRole('button', { name: 'Assinar' })).toHaveLength(2);
  });

  it('o plano actual não traz botão, e o Enterprise remete para contacto', () => {
    renderPage();
    expect(screen.getByText('Plano actual')).toBeInTheDocument();
    const contacto = screen.getByRole('link', { name: 'Falar connosco' });
    // /contacto não existe; a rota é /contact.
    expect(contacto).toHaveAttribute('href', '/contact');
  });
});

describe('periodicidade', () => {
  it('começa no mensal e mostra os preços mensais', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Mensal/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('19 €')).toBeInTheDocument();
    expect(screen.getByText('59 €')).toBeInTheDocument();
  });

  it('passar a anual troca os preços e anuncia a poupança', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Anual/ }));

    expect(screen.getByText('190 €')).toBeInTheDocument();
    expect(screen.getByText('590 €')).toBeInTheDocument();
    expect(screen.queryByText('19 €')).not.toBeInTheDocument();
    // 19x12 = 228 contra 190, e 59x12 = 708 contra 590: dois meses em ambos.
    expect(screen.getAllByText('Equivale a 2 meses oferecidos')).toHaveLength(2);
  });

  it('assinar envia a periodicidade escolhida', async () => {
    renderPage();
    startCheckout.mockClear();

    await userEvent.click(screen.getAllByRole('button', { name: 'Assinar' })[0]);
    expect(startCheckout).toHaveBeenCalledWith('pro', 'month', 'pt');

    await userEvent.click(screen.getByRole('button', { name: /Anual/ }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Assinar' })[1]);
    expect(startCheckout).toHaveBeenCalledWith('business', 'year', 'pt');
  });
});

describe('erros do servidor explicam-se', () => {
  it('diz que os pagamentos ainda não estão ligados', () => {
    renderPage({ error: 'billing-not-configured' });
    expect(screen.getByText(/pagamentos ainda não estão ligados/i)).toBeInTheDocument();
  });

  it('distingue a falta do preço de um plano', () => {
    renderPage({ error: 'price-not-configured' });
    expect(screen.getByText(/não tem preço configurado/i)).toBeInTheDocument();
  });
});

// O que o utilizador compra tem de ser o que o §8.3 promete.
describe('benefícios conforme o plano de negócios', () => {
  it.each([
    ['Calendário básico'],
    ['Sistema de mensagens'],
    ['Acesso ao marketplace'],
    ['Destaque moderado nas pesquisas'],
    ['Integração com Google Calendar'],
    ['Personalização do perfil'],
    ['Relatórios avançados'],
    ['Campanhas promocionais'],
    ['Integração com ferramentas externas'],
    ['Relatórios executivos'],
    ['Acordos de nível de serviço (SLA)'],
    ['Funcionalidades exclusivas'],
  ])('mostra "%s"', label => {
    renderPage();
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
