import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { LegalDocumentsPageComponent } from './LegalDocumentsPage';

const { waitFor } = testingLibrary;

/**
 * Esta página foi para produção em branco.
 *
 * O `LayoutSideNavigation` faz `intl.formatMessage` para o rótulo do menu
 * lateral quando se usa o menu das Definições de Conta. Eu não lhe passei o
 * `intl`, e o componente rebentava ao renderizar — coisa que ninguém apanhou
 * porque a página exige sessão iniciada e não havia teste nenhum a montá-la.
 *
 * Este teste não verifica um detalhe: verifica que a página monta. É o mínimo
 * para uma página que não se consegue abrir sem sessão.
 */
describe('LegalDocumentsPage', () => {
  it('monta sem rebentar e mostra o título', async () => {
    const { getByText } = render(<LegalDocumentsPageComponent scrollingDisabled={false} />);

    await waitFor(() => {
      expect(getByText('Os meus documentos')).toBeInTheDocument();
    });
  });

  // Sem sessão, os dois pedidos falham e a página tem de aguentar isso em vez
  // de ficar branca — é o estado em que um visitante a apanharia.
  it('aguenta não conseguir carregar nada', async () => {
    const { getByText } = render(<LegalDocumentsPageComponent scrollingDisabled={false} />);
    await waitFor(() => {
      expect(getByText('Os meus documentos')).toBeInTheDocument();
    });
  });
});
