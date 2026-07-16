import React, { useEffect, useState } from 'react';
import { useLocale } from '../../context/localeContext';
import css from './PwaInstallButton.module.css';

const STORAGE_KEY = 'v1h_pwa_install_dismissed';
// Persist a flag once the PWA gets installed so subsequent visits in a
// regular browser tab also know the app is on the device. The browser only
// reports installed === true when the page is actually opened inside the
// PWA window, which is not the typical "user came back from Google" flow.
const INSTALLED_KEY = 'v1h_pwa_installed';

// Try to detect iOS Safari, where the native beforeinstallprompt event isn't
// supported. There the user has to manually use Share -> Add to Home Screen,
// so we display a short instruction modal instead of the install prompt.
const isIosSafari = () => {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
};

const isAndroid = () => {
  if (typeof window === 'undefined') return false;
  return /Android/i.test(window.navigator.userAgent || '');
};

// Firefox doesn't implement the PWA install API at all (any platform).
const isFirefox = () => {
  if (typeof window === 'undefined') return false;
  return /Firefox|FxiOS/i.test(window.navigator.userAgent || '');
};

// macOS Safari only supports "File > Add to Dock" manually — no programmatic install.
const isMacSafari = () => {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  const isMac = /Macintosh|Mac OS X/i.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|Edg|EdgiOS|Firefox|FxiOS/i.test(ua);
  return isMac && isSafari;
};

// Detect common in-app browsers (Instagram, Facebook, WhatsApp, TikTok, etc).
// These render with WKWebView/CustomTabs and don't support PWA installation.
const isInAppBrowser = () => {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line|WhatsApp|TikTok|Twitter|Snapchat|Pinterest|LinkedInApp|Messenger|MicroMessenger/i.test(ua);
};

// Best-effort incognito/private detection. The most reliable signal across
// modern Chromium (Chrome/Edge/Brave) is that the storage quota is capped at
// roughly 5% of device memory in incognito vs 60-80% of disk in normal mode.
// We compare against memory because disk varies wildly between machines.
const detectIncognito = async () => {
  if (typeof window === 'undefined') return false;

  // 1. Modern Chromium + Safari: storage quota relative to device memory.
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { quota } = await navigator.storage.estimate();
      const memoryGB = navigator.deviceMemory || 4;
      const memoryBytes = memoryGB * 1024 * 1024 * 1024;
      // In incognito quota is typically <10% of device memory; in normal mode
      // it's many times the memory. 25% is a safe middle threshold.
      if (quota && quota < memoryBytes * 0.25) return true;
    }
  } catch (_) { /* ignored */ }

  // 2. Legacy Chromium + Safari fallback: webkitRequestFileSystem rejects.
  const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
  if (fs) {
    const fsResult = await new Promise(resolve => {
      try {
        fs(
          window.TEMPORARY || 0,
          100,
          () => resolve(false),
          () => resolve(true)
        );
      } catch (_) {
        resolve(true);
      }
    });
    if (fsResult) return true;
  }

  // 3. Firefox private mode: service workers are blocked entirely.
  if (typeof navigator.serviceWorker === 'undefined') {
    return true;
  }

  return false;
};

const PWA_SESSION_KEY = 'v1h_pwa_session';

// Check if the page is already running as an installed PWA. Covers standalone,
// minimal-ui, fullscreen and window-controls-overlay display modes plus iOS.
// We also remember the result for the rest of the tab session (sessionStorage)
// so that navigating inside the PWA — which can drop the ?source=pwa query
// param — still keeps the button hidden.
const isAlreadyInstalled = () => {
  if (typeof window === 'undefined') return false;
  // sessionStorage flag from earlier in this PWA session.
  try {
    if (window.sessionStorage && sessionStorage.getItem(PWA_SESSION_KEY) === '1') {
      return true;
    }
  } catch (_) {
    // Ignored — session storage may be blocked.
  }
  const modes = ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'];
  const matchedDisplayMode =
    window.matchMedia &&
    modes.some(mode => window.matchMedia(`(display-mode: ${mode})`).matches);
  const iosStandalone = window.navigator.standalone === true;
  const launchedFromPwa = /[?&]source=pwa\b/.test(window.location.search);
  const inPwa = matchedDisplayMode || iosStandalone || launchedFromPwa;
  if (inPwa) {
    try {
      window.sessionStorage && sessionStorage.setItem(PWA_SESSION_KEY, '1');
    } catch (_) {
      // Ignored.
    }
  }
  return inPwa;
};

// Endpoint for the global install counter — lives in `server/api/pwa-counter.js`
// and is backed by a JSON file on the API server. Relative URLs work in every
// environment because src/setupProxy.js forwards /api/* to the API server in
// dev (also working via ngrok), and prod serves both from the same origin.
const COUNTER_GET_URL = '/api/pwa-counter';
const COUNTER_INC_URL = '/api/pwa-counter/increment';

const apiUrl = path => path;

const PwaInstallButton = ({ className }) => {
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  // `installed` = the PWA has ever been installed on this device. Used to
  // disable the popup's "Install now" button. Stays `true` even when the
  // user is browsing the site outside the PWA.
  const [installed, setInstalled] = useState(false);
  // `inPwa` = the current page is the installed PWA window. Used to hide
  // the footer button entirely (no point installing inside the app).
  const [inPwa, setInPwa] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [showAndroidManual, setShowAndroidManual] = useState(false);
  const [showIncognitoModal, setShowIncognitoModal] = useState(false);
  const [showFirefoxModal, setShowFirefoxModal] = useState(false);
  const [showMacSafariModal, setShowMacSafariModal] = useState(false);
  const [showInAppModal, setShowInAppModal] = useState(false);
  const [showUnsupportedModal, setShowUnsupportedModal] = useState(false);
  const [installCount, setInstallCount] = useState(null);

  useEffect(() => {
    // Detect the PWA window once on mount (and in response to display-mode
    // changes — some browsers fire those reactively).
    if (isAlreadyInstalled()) {
      setInPwa(true);
      setInstalled(true);
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(display-mode: standalone)');
      const listener = e => {
        if (e.matches) {
          setInPwa(true);
          setInstalled(true);
        }
      };
      if (mq.addEventListener) mq.addEventListener('change', listener);
      else mq.addListener(listener);
      // No need to attach the install listeners when we're already inside
      // the PWA window — they wouldn't be useful here.
    }
    // No localStorage flag here. We trust the live browser signals only
    // (display-mode standalone + appinstalled event) so that uninstalling
    // and trying to install again works without leftover state.
    if (isAlreadyInstalled()) {
      // If we're already in the PWA, skip wiring install listeners — they
      // don't apply.
      return undefined;
    }

    const onBeforeInstallPrompt = e => {
      // Stop Chrome from showing its own banner; we use ours.
      e.preventDefault();
      setDeferredPrompt(e);
      // The browser only fires this when the app is NOT installed.
      setInstalled(false);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      // Bump the global counter so the modal shows the new total.
      fetch(apiUrl(COUNTER_INC_URL), { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (typeof data?.count === 'number') setInstallCount(data.count);
        })
        .catch(() => {});
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    // Pull the current global install count once on mount.
    fetch(apiUrl(COUNTER_GET_URL))
      .then(r => r.json())
      .then(data => {
        if (typeof data?.count === 'number') setInstallCount(data.count);
      })
      .catch(() => {});

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // Hide the footer button only when the page is being viewed inside the
  // installed PWA window itself. On the regular browser site we keep it
  // visible — even after an install — so visitors can still find it and the
  // "already installed" state lives inside the popup (button stays clickable
  // there, but the "Install now" inside is disabled when already installed).
  if (inPwa || isAlreadyInstalled()) return null;

  const isIos = isIosSafari();
  const isInstallable = !!deferredPrompt || isIos;
  // The popup shows the "already installed" copy when:
  // - the appinstalled event fired during this session, OR
  // - we are on desktop and the browser hasn't offered an install prompt
  //   (most likely cause: the PWA is already installed in this browser).
  // On Android we don't make that assumption — the prompt may be late.
  const showAsInstalled = installed || (!deferredPrompt && !isIos && !isAndroid());

  const handleClick = async () => {
    // 1. Unsupported browser cases — show a helpful explanation modal first.
    if (isInAppBrowser()) {
      setShowInAppModal(true);
      return;
    }
    if (isFirefox()) {
      setShowFirefoxModal(true);
      return;
    }
    if (isMacSafari()) {
      setShowMacSafariModal(true);
      return;
    }
    // 2. Incognito/private mode — installation is blocked at OS level.
    if (await detectIncognito()) {
      setShowIncognitoModal(true);
      return;
    }
    // 3. iOS Safari (regular mode) — manual instructions modal.
    if (isIos) {
      setShowIosModal(true);
      return;
    }
    // 4. Normal path — show our branded intro before triggering native prompt.
    setShowIntroModal(true);
  };

  const triggerNativeInstall = async () => {
    setShowIntroModal(false);
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'dismissed') {
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch (_) {
        // Ignored — only used to skip showing the prompt next time.
      }
    }
    setDeferredPrompt(null);
  };

  return (
    <>
      <button
        type="button"
        className={`${css.button} ${className || ''}`}
        onClick={handleClick}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{ flexShrink: 0 }}
        >
          <line x1="12" y1="3" x2="12" y2="15" />
          <line x1="12" y1="15" x2="7" y2="10" />
          <line x1="12" y1="15" x2="17" y2="10" />
          <line x1="5" y1="20" x2="19" y2="20" />
        </svg>
        <span>{isEN ? 'Install our app' : 'Instalar a nossa app'}</span>
      </button>

      {showIntroModal && (
        <div
          className={css.modalBackdrop}
          onClick={() => setShowIntroModal(false)}
          role="dialog"
        >
          <div className={css.modal} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={css.modalClose}
              onClick={() => setShowIntroModal(false)}
              aria-label="Fechar"
            >
              ×
            </button>
            <h3 className={css.modalTitle}>
              {showAsInstalled
                ? (isEN ? 'You already installed the app' : 'Já instalaste a app')
                : (isEN ? 'Install Venue1Hub on your device' : 'Instala a Venue1Hub no teu dispositivo')}
            </h3>
            <p className={css.modalText}>
              {showAsInstalled
                ? (isEN
                    ? 'Open V1HUB from your taskbar, Start menu or home screen, it is already there.'
                    : 'Abre a V1HUB pela barra de tarefas, menu Iniciar ou ecrã principal, já lá está.')
                : (isEN
                    ? 'Open V1HUB straight from your home screen, faster and in fullscreen.'
                    : 'Abre a V1HUB direto do ecrã principal, mais rápida e em ecrã cheio.')}
            </p>
            {installCount !== null && (
              <p className={css.modalCounter}>
                {isEN
                  ? `Over ${installCount.toLocaleString('en-US')} ${installCount === 1 ? 'install' : 'installs'} so far`
                  : `Mais de ${installCount.toLocaleString('pt-PT')} ${installCount === 1 ? 'instalação' : 'instalações'} até agora`}
              </p>
            )}
            <div className={css.modalActions}>
              <button
                type="button"
                className={css.modalSecondary}
                onClick={() => setShowIntroModal(false)}
              >
                {showAsInstalled
                  ? (isEN ? 'Close' : 'Fechar')
                  : (isEN ? 'Maybe later' : 'Mais tarde')}
              </button>
              <button
                type="button"
                className={`${css.modalPrimary} ${showAsInstalled ? css.modalPrimaryDisabled : ''}`}
                onClick={() => {
                  if (showAsInstalled) return;
                  if (deferredPrompt) {
                    triggerNativeInstall();
                    return;
                  }
                  // Fallback path — browser hasn't fired the install prompt.
                  // Android users get the manual instructions; everyone else
                  // gets the generic "unsupported browser" message.
                  setShowIntroModal(false);
                  if (isAndroid()) {
                    setShowAndroidManual(true);
                  } else {
                    setShowUnsupportedModal(true);
                  }
                }}
                disabled={showAsInstalled}
                title={showAsInstalled ? (isEN ? 'Already installed' : 'Já instalada') : undefined}
              >
                {showAsInstalled
                  ? (isEN ? 'Already installed' : 'Já instalada')
                  : (isEN ? 'Install now' : 'Instalar agora')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAndroidManual && (
        <div
          className={css.modalBackdrop}
          onClick={() => setShowAndroidManual(false)}
          role="dialog"
        >
          <div className={css.modal} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={css.modalClose}
              onClick={() => setShowAndroidManual(false)}
              aria-label="Fechar"
            >
              ×
            </button>
            <h3 className={css.modalTitle}>
              {isEN ? 'Install V1HUB on Android' : 'Instalar V1HUB no Android'}
            </h3>
            <p className={css.modalText}>
              {isEN
                ? 'Your browser hasn\'t offered install yet. You can do it manually:'
                : 'O browser ainda não ofereceu instalação. Podes fazê-lo manualmente:'}
            </p>
            <ol className={css.modalSteps}>
              <li>
                {isEN
                  ? 'Tap the menu (⋮) in the top right of Chrome.'
                  : 'Toca no menu (⋮) no canto superior direito do Chrome.'}
              </li>
              <li>
                {isEN
                  ? 'Choose "Install app" or "Add to Home screen".'
                  : 'Escolhe "Instalar app" ou "Adicionar à página inicial".'}
              </li>
              <li>
                {isEN
                  ? 'Confirm "Install" — V1HUB shows up as an app icon.'
                  : 'Confirma "Instalar" — a V1HUB fica como ícone de app.'}
              </li>
            </ol>
          </div>
        </div>
      )}

      {showUnsupportedModal && (
        <div
          className={css.modalBackdrop}
          onClick={() => setShowUnsupportedModal(false)}
          role="dialog"
        >
          <div className={css.modal} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={css.modalClose}
              onClick={() => setShowUnsupportedModal(false)}
              aria-label="Fechar"
            >
              ×
            </button>
            <h3 className={css.modalTitle}>
              {isEN ? 'Your browser doesn\'t support install' : 'O teu navegador não suporta instalação'}
            </h3>
            <p className={css.modalText}>
              {isEN
                ? 'V1HUB can only be installed as an app from a browser with PWA support. Open this site in one of the supported browsers below:'
                : 'A V1HUB só pode ser instalada como app a partir de um navegador com suporte PWA. Abre este site num dos navegadores suportados em baixo:'}
            </p>
            <ul className={css.modalSteps}>
              <li>{isEN ? 'Chrome (Windows, Mac, Linux, Android)' : 'Chrome (Windows, Mac, Linux, Android)'}</li>
              <li>{isEN ? 'Microsoft Edge (Windows, Mac, Android)' : 'Microsoft Edge (Windows, Mac, Android)'}</li>
              <li>{isEN ? 'Safari (iPhone, iPad, Mac with Sonoma+)' : 'Safari (iPhone, iPad, Mac com Sonoma+)'}</li>
              <li>{isEN ? 'Brave or Samsung Internet (Android)' : 'Brave ou Samsung Internet (Android)'}</li>
            </ul>
          </div>
        </div>
      )}

      {showIncognitoModal && (
        <div
          className={css.modalBackdrop}
          onClick={() => setShowIncognitoModal(false)}
          role="dialog"
        >
          <div className={css.modal} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={css.modalClose}
              onClick={() => setShowIncognitoModal(false)}
              aria-label="Fechar"
            >
              ×
            </button>
            <h3 className={css.modalTitle}>
              {isEN ? 'Private mode blocks install' : 'Modo anónimo bloqueia a instalação'}
            </h3>
            <p className={css.modalText}>
              {isEN
                ? 'Browsers block installing apps in private/incognito windows for privacy reasons. Open this site in a regular window to install V1HUB.'
                : 'Os navegadores bloqueiam instalar apps em janelas privadas/anónimas por razões de privacidade. Abre este site numa janela normal para instalar a V1HUB.'}
            </p>
          </div>
        </div>
      )}

      {showFirefoxModal && (
        <div
          className={css.modalBackdrop}
          onClick={() => setShowFirefoxModal(false)}
          role="dialog"
        >
          <div className={css.modal} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={css.modalClose}
              onClick={() => setShowFirefoxModal(false)}
              aria-label="Fechar"
            >
              ×
            </button>
            <h3 className={css.modalTitle}>
              {isEN ? 'Firefox doesn\'t support app install' : 'Firefox não suporta instalação da app'}
            </h3>
            <p className={css.modalText}>
              {isEN
                ? 'Mozilla Firefox doesn\'t implement the install API. Open V1HUB in Chrome, Edge or Brave to install it as an app.'
                : 'O Mozilla Firefox não suporta a instalação da app. Abre a V1HUB em Chrome, Edge ou Brave para a instalares como aplicação.'}
            </p>
          </div>
        </div>
      )}

      {showMacSafariModal && (
        <div
          className={css.modalBackdrop}
          onClick={() => setShowMacSafariModal(false)}
          role="dialog"
        >
          <div className={css.modal} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={css.modalClose}
              onClick={() => setShowMacSafariModal(false)}
              aria-label="Fechar"
            >
              ×
            </button>
            <h3 className={css.modalTitle}>
              {isEN ? 'Install V1HUB on Mac (Safari)' : 'Instalar V1HUB no Mac (Safari)'}
            </h3>
            <ol className={css.modalSteps}>
              <li>
                {isEN
                  ? 'Open the Safari menu bar at the top.'
                  : 'Abre a barra de menu do Safari em cima.'}
              </li>
              <li>
                {isEN
                  ? 'Click "File" → "Add to Dock…".'
                  : 'Clica em "Ficheiro" → "Adicionar ao Dock…".'}
              </li>
              <li>
                {isEN
                  ? 'Confirm "Add" — V1HUB shows up in the Dock as an app.'
                  : 'Confirma "Adicionar" — a V1HUB fica no Dock como app.'}
              </li>
            </ol>
            <p className={css.modalText} style={{ marginTop: 12, fontSize: 13, opacity: 0.75 }}>
              {isEN
                ? 'Requires macOS Sonoma (14) or newer.'
                : 'Precisa de macOS Sonoma (14) ou mais recente.'}
            </p>
          </div>
        </div>
      )}

      {showInAppModal && (
        <div
          className={css.modalBackdrop}
          onClick={() => setShowInAppModal(false)}
          role="dialog"
        >
          <div className={css.modal} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={css.modalClose}
              onClick={() => setShowInAppModal(false)}
              aria-label="Fechar"
            >
              ×
            </button>
            <h3 className={css.modalTitle}>
              {isEN ? 'Open in your real browser' : 'Abre no teu navegador'}
            </h3>
            <p className={css.modalText}>
              {isEN
                ? 'You\'re viewing V1HUB inside another app (Instagram, Facebook, WhatsApp, TikTok…). These in-app browsers don\'t support app install.'
                : 'Estás a ver a V1HUB dentro de outra app (Instagram, Facebook, WhatsApp, TikTok…). Estes navegadores embutidos não suportam a instalação.'}
            </p>
            <ol className={css.modalSteps}>
              <li>
                {isEN
                  ? 'Tap the three dots (⋯) or menu icon at the top.'
                  : 'Toca nos três pontos (⋯) ou no ícone de menu em cima.'}
              </li>
              <li>
                {isEN
                  ? 'Choose "Open in Chrome", "Open in Safari" or "Open in browser".'
                  : 'Escolhe "Abrir no Chrome", "Abrir no Safari" ou "Abrir no navegador".'}
              </li>
              <li>
                {isEN
                  ? 'Once on the real browser, tap "Install our app" again.'
                  : 'Já no navegador real, clica outra vez em "Instalar a nossa app".'}
              </li>
            </ol>
          </div>
        </div>
      )}

      {showIosModal && (
        <div
          className={css.modalBackdrop}
          onClick={() => setShowIosModal(false)}
          role="dialog"
        >
          <div className={css.modal} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className={css.modalClose}
              onClick={() => setShowIosModal(false)}
              aria-label="Fechar"
            >
              ×
            </button>
            <h3 className={css.modalTitle}>
              {isEN ? 'Install V1HUB on iPhone' : 'Instalar V1HUB no iPhone'}
            </h3>
            <ol className={css.modalSteps}>
              <li>
                {isEN
                  ? 'Tap the Share button at the bottom of Safari.'
                  : 'Toca no botão Partilhar no fundo do Safari.'}
              </li>
              <li>
                {isEN
                  ? 'Choose “Add to Home Screen”.'
                  : 'Escolhe “Adicionar ao Ecrã Principal”.'}
              </li>
              <li>
                {isEN
                  ? 'Tap “Add” — V1HUB shows up as an app icon.'
                  : 'Toca em “Adicionar” — a V1HUB fica como ícone de app.'}
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
};

export default PwaInstallButton;
