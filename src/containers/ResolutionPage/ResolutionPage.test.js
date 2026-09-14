import React from 'react';
import '@testing-library/jest-dom';

import { renderWithProviders as render, testingLibrary } from '../../util/testHelpers';

import { ResolutionPageComponent } from './ResolutionPage';

const { waitFor } = testingLibrary;

/** Teste de montagem — ver a nota em LegalDocumentsPage.test.js. */
describe('ResolutionPage', () => {
  it('monta e mostra o título', async () => {
    const { getByText } = render(
      <ResolutionPageComponent scrollingDisabled={false} params={{ id: 'tx-1' }} />
    );
    await waitFor(() => {
      expect(getByText('Centro de Resolução')).toBeInTheDocument();
    });
  });
});
