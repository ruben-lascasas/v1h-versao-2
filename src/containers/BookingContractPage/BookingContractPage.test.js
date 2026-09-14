import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { BookingContractPageComponent } from './BookingContractPage';

const { waitFor } = testingLibrary;

/** Teste de montagem — ver a nota em LegalDocumentsPage.test.js. */
describe('BookingContractPage', () => {
  it('monta sem rebentar quando o contrato não carrega', async () => {
    const { container } = render(
      <BookingContractPageComponent scrollingDisabled={false} params={{ id: 'tx-1' }} />
    );
    await waitFor(() => {
      expect(container.querySelector('#page')).toBeInTheDocument();
    });
  });

  // Sem sessão não se confirma nem desmente que a reserva existe — só se diz
  // que é preciso iniciar sessão.
  it('não rebenta sem id nenhum', async () => {
    const { container } = render(<BookingContractPageComponent scrollingDisabled={false} />);
    await waitFor(() => {
      expect(container.querySelector('#page')).toBeInTheDocument();
    });
  });
});
