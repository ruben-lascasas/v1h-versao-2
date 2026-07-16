import { createContext, useContext } from 'react';

export const LocaleContext = createContext({ locale: 'pt', setLocale: () => {} });
export const useLocale = () => useContext(LocaleContext);
