import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';
import VerificationPage from './VerificationPage';

const { screen } = testingLibrary;

// A página vai buscar o estado ao montar; aqui o estado já vem posto, e a
// chamada real só ia falhar no jsdom.
jest.mock('../../ducks/verification.duck', () => ({
  // __esModule para o default (o reducer) continuar a ser o reducer real.
  __esModule: true,
  ...jest.requireActual('../../ducks/verification.duck'),
  fetchVerificationStatus: () => ({ type: 'noop' }),
  uploadVerificationDoc: () => ({ type: 'noop' }),
}));
jest.mock('../TopbarContainer/TopbarContainer', () => () => null);
jest.mock('../FooterContainer/FooterContainer', () => () => null);

const initialStateWith = limits => ({
  user: { currentUser: { id: { uuid: 'u1' }, attributes: { profile: {} } } },
  verification: {
    fetched: true,
    loading: false,
    required: true,
    status: 'nao_iniciado',
    docs: [
      { key: 'identificacao', label: 'Documento de identificação', hint: '', status: 'em_falta' },
    ],
    limits,
    uploadingDocKey: null,
    uploadError: null,
  },
});

const renderWith = limits =>
  render(<VerificationPage />, {
    initialState: initialStateWith(limits),
  });

const PDF_ONLY = { accept: 'application/pdf', formats: ['PDF'], maxMb: 20 };
const ALL = {
  accept: 'application/pdf,image/jpeg,image/png,image/webp',
  formats: ['PDF', 'JPG', 'PNG', 'WEBP'],
  maxMb: 8,
};

describe('VerificationPage — formatos aceites', () => {
  it('mostra os formatos e o tamanho que o servidor enviou', () => {
    renderWith(ALL);
    expect(
      screen.getByText(
        'Formatos aceites: PDF, JPG, PNG ou WEBP. Tamanho máximo: 8 MB por ficheiro.'
      )
    ).toBeInTheDocument();
  });

  it('passa o accept do servidor para o seletor de ficheiros', () => {
    const { container } = renderWith(ALL);
    expect(container.querySelector('input[type="file"]').getAttribute('accept')).toBe(ALL.accept);
  });

  // O ponto de todo o exercício: mudar a regra no servidor tem de mudar o que o
  // anunciante lê, sem tocar nesta página.
  it('acompanha o servidor quando os limites mudam', () => {
    const { container } = renderWith(PDF_ONLY);
    expect(
      screen.getByText('Formatos aceites: PDF. Tamanho máximo: 20 MB por ficheiro.')
    ).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]').getAttribute('accept')).toBe(
      PDF_ONLY.accept
    );
  });

  it('usa os limites de reserva enquanto a resposta não chega', () => {
    const { container } = renderWith(null);
    expect(
      screen.getByText(
        'Formatos aceites: PDF, JPG, PNG ou WEBP. Tamanho máximo: 8 MB por ficheiro.'
      )
    ).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]').getAttribute('accept')).toBe(ALL.accept);
  });
});
