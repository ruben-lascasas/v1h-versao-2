import { anychatScriptSrc } from './configChat';

/**
 * O AnyChat quer o endereço da página no parâmetro `r`. Se não for codificado,
 * a query string do site (`/s?address=Lisboa&bounds=…`) entra no meio do
 * endereço do script e parte-o ao meio.
 */
describe('anychatScriptSrc', () => {
  it('leva o id do widget no caminho', () => {
    expect(anychatScriptSrc('abc-123', 'https://venue1hub.eu/')).toContain(
      'https://api.anychat.one/widget/abc-123?r='
    );
  });

  it('codifica o endereço da página, com query string e tudo', () => {
    const src = anychatScriptSrc('abc-123', 'https://venue1hub.eu/s?address=Lisboa&bounds=1,2,3,4');

    expect(src).toContain('r=https%3A%2F%2Fvenue1hub.eu%2Fs%3Faddress%3DLisboa%26bounds%3D1%2C2%2C3%2C4');
    // Uma única query string: a do script. A da página vai codificada dentro.
    expect(src.split('?').length).toBe(2);
  });

  it('aguenta não haver endereço nenhum', () => {
    expect(anychatScriptSrc('abc-123', undefined)).toBe(
      'https://api.anychat.one/widget/abc-123?r='
    );
  });
});
