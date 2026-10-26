import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import ListingsPorAprovar, { diasAEspera, fraseDaEspera } from './ListingsPorAprovar';

const { screen, waitFor, userEvent } = testingLibrary;

/**
 * A FILA DOS ANÚNCIOS À ESPERA.
 *
 * Existe porque a aprovação dependia inteiramente de um email chegar ao
 * administrador, e em Outubro de 2026 os emails deste marketplace não eram
 * entregues de todo — um anúncio de uma cliente real ficou invisível 13 dias.
 *
 * O que se verifica aqui é sobretudo que a página NÃO esconde nada: um anúncio
 * à espera tem de aparecer, e tem de dizer há quanto tempo espera.
 */

const respostaCom = listings => (url, opcoes) => {
  if (String(url).includes('/listing-decision')) {
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
  }
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ listings }) });
};

const anuncio = (extra = {}) => ({
  id: 'l-1',
  title: 'sala teste',
  createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  estado: 'a_espera',
  autor: { id: 'u-1', nome: 'Rafael', email: 'rafael@exemplo.pt' },
  ...extra,
});

beforeEach(() => {
  global.fetch = jest.fn(respostaCom([anuncio()]));
});
afterEach(() => {
  jest.restoreAllMocks();
  delete global.fetch;
});

describe('diasAEspera', () => {
  const agora = Date.parse('2026-10-26T12:00:00Z');

  it('conta os dias inteiros desde que foi submetido', () => {
    expect(diasAEspera('2026-10-13T12:00:00Z', agora)).toBe(13);
    expect(diasAEspera('2026-10-26T09:00:00Z', agora)).toBe(0);
  });

  it('não devolve negativos nem rebenta com lixo', () => {
    expect(diasAEspera('2026-10-27T12:00:00Z', agora)).toBe(0);
    expect(diasAEspera('nao e uma data', agora)).toBe(null);
    expect(diasAEspera(undefined, agora)).toBe(null);
  });
});

describe('fraseDaEspera', () => {
  it('fala no singular quando é um dia só', () => {
    expect(fraseDaEspera(1)).toBe('à espera há 1 dia');
    expect(fraseDaEspera(13)).toBe('à espera há 13 dias');
  });

  it('no próprio dia não diz "há 0 dias"', () => {
    expect(fraseDaEspera(0)).toBe('submetido hoje');
  });
});

describe('a fila', () => {
  it('mostra o anúncio, quem o publicou e há quanto tempo espera', async () => {
    render(<ListingsPorAprovar />);

    await waitFor(() => expect(screen.getByText('sala teste')).toBeInTheDocument());
    expect(screen.getByText(/Rafael/)).toBeInTheDocument();
    expect(screen.getByText(/à espera há 3 dias/)).toBeInTheDocument();
  });

  it('diz quantos estão à espera', async () => {
    render(<ListingsPorAprovar />);

    await waitFor(() =>
      expect(screen.getByText('1 anúncio à espera de decisão.')).toBeInTheDocument()
    );
  });

  it('quando não há nada, diz que não há — e não finge uma lista', async () => {
    global.fetch = jest.fn(respostaCom([]));
    render(<ListingsPorAprovar />);

    await waitFor(() =>
      expect(screen.getByText('Nenhum anúncio à espera de decisão.')).toBeInTheDocument()
    );
  });

  /**
   * Quem não é administrador já vê o aviso na secção dos documentos. Repetir
   * aqui o mesmo "não tem acesso" seria dizer duas vezes a mesma coisa na
   * mesma página.
   */
  it('a quem não é administrador não mostra nada', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) })
    );
    const { container } = render(<ListingsPorAprovar />);

    await waitFor(() => expect(container.textContent).not.toMatch(/Anúncios à espera/));
  });
});

describe('decidir', () => {
  it('aprovar tira o anúncio da fila', async () => {
    const user = userEvent.setup();
    render(<ListingsPorAprovar />);
    await waitFor(() => expect(screen.getByText('sala teste')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));

    await waitFor(() => expect(screen.queryByText('sala teste')).not.toBeInTheDocument());
  });

  /**
   * Recusar manda um email ao anfitrião a dizer que o anúncio dele precisa de
   * alterações. Não pode acontecer com um clique enganado.
   */
  it('recusar pede confirmação antes de fazer seja o que for', async () => {
    const user = userEvent.setup();
    render(<ListingsPorAprovar />);
    await waitFor(() => expect(screen.getByText('sala teste')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Recusar' }));

    // Nada foi decidido ainda — só apareceu a confirmação.
    const decisoes = global.fetch.mock.calls.filter(c => String(c[0]).includes('listing-decision'));
    expect(decisoes).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Confirmar recusa' })).toBeInTheDocument();
  });

  it('e leva o motivo escrito ao servidor', async () => {
    const user = userEvent.setup();
    render(<ListingsPorAprovar />);
    await waitFor(() => expect(screen.getByText('sala teste')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Recusar' }));
    await user.type(screen.getByLabelText('Motivo da recusa'), 'fotos ilegíveis');
    await user.click(screen.getByRole('button', { name: 'Confirmar recusa' }));

    await waitFor(() => {
      const chamada = global.fetch.mock.calls.find(c => String(c[0]).includes('listing-decision'));
      expect(chamada).toBeTruthy();
      const corpo = JSON.parse(chamada[1].body);
      expect(corpo).toMatchObject({ listingId: 'l-1', action: 'reject', reason: 'fotos ilegíveis' });
    });
  });

  it('se a decisão falhar, o anúncio fica na fila e diz-se que falhou', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(url =>
      String(url).includes('/listing-decision')
        ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
        : Promise.resolve({ ok: true, status: 200, json: async () => ({ listings: [anuncio()] }) })
    );
    render(<ListingsPorAprovar />);
    await waitFor(() => expect(screen.getByText('sala teste')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));

    await waitFor(() => expect(screen.getByText(/Não resultou/)).toBeInTheDocument());
    expect(screen.getByText('sala teste')).toBeInTheDocument();
  });
});
