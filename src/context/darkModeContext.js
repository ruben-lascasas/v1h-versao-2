import { createContext, useContext } from 'react';

export const DarkModeContext = createContext({ isDark: false, toggleDark: () => {} });
export const useDarkMode = () => useContext(DarkModeContext);
