import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import classNames from 'classnames';
import { connect } from 'react-redux';
import { compose } from 'redux';
import { useIntl } from '../../util/reactIntl';
import { useDispatch, useSelector } from 'react-redux';
import { selectIsFollowing, toggleFollowAndSync } from '../../ducks/follow.duck';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { getMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { useLocale } from '../../context/localeContext';

import { Page, Avatar, NamedLink, IconSpinner } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import SendMessageForm from '../TransactionPage/SendMessageForm/SendMessageForm';
import RecentlyViewedSection from '../../components/RecentlyViewedSection/RecentlyViewedSection';

import {
  selectDMTransactionId,
  selectDMAllTransactionIds,
  selectDMLastTransitionedAt,
  selectDMMessages,
  selectDMOtherUserId,
  selectDMFetchInProgress,
  selectDMSendInProgress,
  selectDMSendError,
  pollMessages,
  sendMessage as sendMessageThunk,
  sendImage as sendImageThunk,
} from './DirectMessagePage.duck';
import { markTransactionSeen } from '../../util/seenTransactions';
import { fetchCurrentUserNotifications, invalidateNotificationCache } from '../../ducks/user.duck';

import css from './DirectMessagePage.module.css';

const POLL_INTERVAL = 15000;

const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';

const translateText = async (text, target) => {
  if (!text || typeof text !== 'string' || !text.trim()) return '';
  const url =
    GOOGLE_TRANSLATE_URL +
    `?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text.trim())}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('upstream-failed');
  const data = await res.json();
  return data?.[0]?.map(chunk => chunk?.[0] || '').join('') || '';
};

const formatLastOnline = (isoString, intl) => {
  if (!isoString) return null;
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 120) return intl.formatMessage({ id: 'UserCard.onlineJustNow' });
  if (diff < 3600) return intl.formatMessage({ id: 'UserCard.onlineMinutes' }, { minutes: Math.floor(diff / 60) });
  if (diff < 86400) return intl.formatMessage({ id: 'UserCard.onlineHours' }, { hours: Math.floor(diff / 3600) });
  if (diff < 604800) return intl.formatMessage({ id: 'UserCard.onlineDays' }, { days: Math.floor(diff / 86400) });
  return null;
};

const DirectMessagePageComponent = props => {
  const {
    currentUser,
    otherUser,
    transactionId,
    allTransactionIds,
    messages,
    fetchInProgress,
    sendInProgress,
    sendError,
    scrollingDisabled,
    params,
    dispatch,
  } = props;

  const intl = useIntl();
  const reduxDispatch = useDispatch();
  const { locale } = useLocale();
  const translateTarget = locale === 'en' ? 'en' : 'pt';
  const isEN = translateTarget === 'en';
  const [mounted, setMounted] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  // Map of message uuid -> { text?, caption? } translated strings. Empty
  // map means we're showing originals.
  const [translations, setTranslations] = useState({});
  const [showingTranslated, setShowingTranslated] = useState(false);
  const [translateBusy, setTranslateBusy] = useState(false);
  const [translateError, setTranslateError] = useState(null);
  const pollRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const isFollowing = useSelector(state => selectIsFollowing(state, params.id));
  const isAuthenticated = useSelector(state => state.auth?.isAuthenticated);
  const isCurrentUser = currentUser?.id?.uuid === params.id;
  const lastTransitionedAt = useSelector(selectDMLastTransitionedAt);

  useEffect(() => { setMounted(true); }, []);

  // Update last-read time when messages load or arrive, then refresh badge
  useEffect(() => {
    if (!transactionId || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    const latestTime = latest?.attributes?.createdAt;
    if (!latestTime) return;
    try {
      const stored = JSON.parse(localStorage.getItem('v1hub_dmLastRead') || '{}');
      // Use Date.now() + 1s so own sent messages never trigger self-notification
      const stampIso = new Date(Date.now() + 1000).toISOString();
      const idsToMark =
        allTransactionIds && allTransactionIds.length > 0 ? allTransactionIds : [transactionId];
      idsToMark.forEach(id => {
        stored[id] = stampIso;
      });
      localStorage.setItem('v1hub_dmLastRead', JSON.stringify(stored));
    } catch {}
    invalidateNotificationCache();
    reduxDispatch(fetchCurrentUserNotifications());
  }, [transactionId, messages.length]);

  const otherName = otherUser?.attributes?.profile?.displayName || '—';
  const currentUserId = currentUser?.id?.uuid;
  const otherPublicData = otherUser?.attributes?.profile?.publicData || {};
  const lastOnlineText = mounted ? formatLastOnline(otherPublicData?.lastOnline, intl) : null;
  const locationText =
    otherPublicData?.location?.address ||
    (typeof otherPublicData?.location === 'string' ? otherPublicData.location : null) ||
    otherPublicData?.Location?.address ||
    (typeof otherPublicData?.Location === 'string' ? otherPublicData.Location : null) ||
    null;

  // Scroll to bottom when messages first load
  useEffect(() => {
    if (messages.length > 0 && messagesAreaRef.current) {
      messagesAreaRef.current.scrollTop = messagesAreaRef.current.scrollHeight;
    }
  }, [fetchInProgress]);

  // Poll for new messages every 5 seconds
  useEffect(() => {
    if (!transactionId) return;
    pollRef.current = setInterval(() => {
      dispatch(pollMessages(transactionId));
    }, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [transactionId, dispatch]);

  const handleSend = useCallback(
    (values, form) => {
      const content = (values.message || '').trim();
      if (!content || sendInProgress) return;
      // Mark as read slightly ahead of now so own sent message doesn't trigger badge
      // (server-assigned createdAt can be later than client Date.now()).
      const idsToMark =
        allTransactionIds && allTransactionIds.length > 0
          ? allTransactionIds
          : transactionId
          ? [transactionId]
          : [];
      if (idsToMark.length > 0) {
        try {
          const stored = JSON.parse(localStorage.getItem('v1hub_dmLastRead') || '{}');
          const stampIso = new Date(Date.now() + 1000).toISOString();
          idsToMark.forEach(id => {
            stored[id] = stampIso;
          });
          localStorage.setItem('v1hub_dmLastRead', JSON.stringify(stored));
        } catch {}
      }
      dispatch(sendMessageThunk({ content, otherUserId: params.id }));
      form.reset();
    },
    [sendInProgress, params.id, transactionId, allTransactionIds, dispatch]
  );

  const handleSendImage = useCallback(
    (filesOrFile, caption) => {
      if (!filesOrFile || sendInProgress) return;
      const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
      if (files.length === 0) return;
      dispatch(sendImageThunk({ files, caption, otherUserId: params.id }));
    },
    [sendInProgress, params.id, dispatch]
  );

  // Returns { urls: string[], caption: string } when the message is an image
  // gallery (or single legacy image), otherwise null.
  const parseImageContent = content => {
    if (typeof content !== 'string') return null;
    const isImgUrl = u => /^https:\/\/sharetribe\.imgix\.net\//.test(u);

    // New email-friendly format: starts with "📷" then one URL per line,
    // blank line, optional caption.
    if (content.trimStart().startsWith('📷')) {
      const lines = content.split('\n');
      const startIdx = lines.findIndex(l => l.trim() === '📷');
      if (startIdx >= 0) {
        const urls = [];
        let captionStart = lines.length;
        for (let i = startIdx + 1; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (isImgUrl(trimmed)) {
            urls.push(trimmed);
          } else if (trimmed !== '') {
            captionStart = i;
            break;
          }
        }
        if (urls.length > 0) {
          const caption = lines.slice(captionStart).join('\n').trim();
          return { urls, caption };
        }
      }
    }

    // Legacy multi-image format: [images:URL1|URL2|URL3]\n<optional caption>
    const multiMatch = content.match(/^\[images:([^\]]+)\](?:\n([\s\S]*))?$/);
    if (multiMatch) {
      const urls = multiMatch[1]
        .split('|')
        .map(u => u.trim())
        .filter(u => /^https?:\/\//.test(u));
      if (urls.length > 0) {
        return { urls, caption: (multiMatch[2] || '').trim() };
      }
    }

    // Legacy single-image format: [image:URL]
    const singleMatch = content.match(/^\[image:(https?:\/\/[^\]]+)\]$/);
    if (singleMatch) {
      return { urls: [singleMatch[1]], caption: '' };
    }

    return null;
  };

  // Collect all image URLs across the entire conversation, in chronological order
  const allImageUrls = messages.reduce((acc, msg) => {
    const data = parseImageContent(msg.attributes?.content || '');
    if (data) acc.push(...data.urls);
    return acc;
  }, []);

  const lightboxOpen = lightboxIndex !== null && allImageUrls[lightboxIndex];
  const lightboxUrl = lightboxOpen ? allImageUrls[lightboxIndex] : null;
  const canPrev = lightboxOpen && lightboxIndex > 0;
  const canNext = lightboxOpen && lightboxIndex < allImageUrls.length - 1;

  const openLightboxByUrl = url => {
    const idx = allImageUrls.indexOf(url);
    if (idx >= 0) setLightboxIndex(idx);
  };
  const resetZoom = () => {
    setZoom(1);
    setOrigin({ x: 50, y: 50 });
  };
  const closeLightbox = () => {
    setLightboxIndex(null);
    resetZoom();
  };
  const showPrev = () => {
    setLightboxIndex(i => (i !== null && i > 0 ? i - 1 : i));
    resetZoom();
  };
  const showNext = () => {
    setLightboxIndex(i =>
      i !== null && i < allImageUrls.length - 1 ? i + 1 : i
    );
    resetZoom();
  };
  const handleWheelZoom = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin({ x, y });
    setZoom(z => {
      const next = z - e.deltaY * 0.005;
      return Math.max(1, Math.min(6, next));
    });
  };

  // Lightbox keyboard handling + body scroll lock
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = e => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') showPrev();
      else if (e.key === 'ArrowRight') showNext();
    };
    window.addEventListener('keydown', onKey);
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlGutter: html.style.scrollbarGutter,
      bodyOverflow: body.style.overflow,
    };
    // The site sets `scrollbar-gutter: stable` globally on <html>, which
    // reserves a permanent ~16px white strip on the right even when the
    // scrollbar is hidden. Override it so the lightbox covers full viewport.
    html.style.overflow = 'hidden';
    html.style.scrollbarGutter = 'auto';
    body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      html.style.overflow = prev.htmlOverflow;
      html.style.scrollbarGutter = prev.htmlGutter;
      body.style.overflow = prev.bodyOverflow;
    };
  }, [lightboxOpen, allImageUrls.length]);

  const formatTime = dateVal => {
    if (!dateVal) return '';
    return new Date(dateVal).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDay = dateVal => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return intl.formatMessage({ id: 'DirectMessagePage.today' });
    if (d.toDateString() === yesterday.toDateString()) return intl.formatMessage({ id: 'DirectMessagePage.yesterday' });
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handleTranslateConversation = async () => {
    setTranslateError(null);
    if (showingTranslated) {
      setShowingTranslated(false);
      return;
    }
    if (Object.keys(translations).length > 0) {
      setShowingTranslated(true);
      return;
    }
    if (messages.length === 0) return;
    setTranslateBusy(true);
    try {
      const tasks = messages.map(async msg => {
        const uuid = msg.id?.uuid;
        const content = msg.attributes?.content || '';
        const imageData = parseImageContent(content);
        if (imageData) {
          if (imageData.caption) {
            const caption = await translateText(imageData.caption, translateTarget);
            return [uuid, { caption }];
          }
          return [uuid, null];
        }
        if (!content.trim()) return [uuid, null];
        const text = await translateText(content, translateTarget);
        return [uuid, { text }];
      });
      const entries = await Promise.all(tasks);
      const map = {};
      entries.forEach(([uuid, value]) => {
        if (uuid && value) map[uuid] = value;
      });
      setTranslations(map);
      setShowingTranslated(true);
    } catch (_) {
      setTranslateError(
        isEN ? 'Translation failed. Try again.' : 'Tradução falhou. Tenta de novo.'
      );
    } finally {
      setTranslateBusy(false);
    }
  };

  // Invalidate cached translations when new messages arrive so the next
  // toggle re-fetches the full set including the new bubbles.
  useEffect(() => {
    if (Object.keys(translations).length === 0) return;
    const allCached = messages.every(msg => {
      const uuid = msg.id?.uuid;
      const content = msg.attributes?.content || '';
      const imageData = parseImageContent(content);
      if (imageData && !imageData.caption) return true;
      if (!imageData && !content.trim()) return true;
      return !!translations[uuid];
    });
    if (!allCached) {
      setTranslations({});
      setShowingTranslated(false);
    }
  }, [messages.length]);

  // Group messages by day
  const groupedMessages = messages.reduce((groups, msg) => {
    const day = formatDay(msg.attributes?.createdAt);
    const last = groups[groups.length - 1];
    if (!last || last.day !== day) {
      groups.push({ day, messages: [msg] });
    } else {
      last.messages.push(msg);
    }
    return groups;
  }, []);

  return (
    <Page title={intl.formatMessage({ id: 'DirectMessagePage.pageTitle' }, { name: otherName })} scrollingDisabled={scrollingDisabled} className={css.root}>
      <TopbarContainer />

      <div className={css.pageTitle}>
        <h1 className={css.title}>{intl.formatMessage({ id: 'DirectMessagePage.title' })}</h1>
        <p className={css.subtitle}>{intl.formatMessage({ id: 'DirectMessagePage.subtitle' }, { name: otherName })}</p>
      </div>

      <div className={css.chatLayout}>

        {/* ── Chat header ── */}
        <div className={css.chatHeader}>
          {otherUser ? (
            <>
              <NamedLink name="ProfilePage" params={{ id: params.id }} className={css.headerUser}>
                <Avatar user={otherUser} className={css.headerAvatar} disableProfileLink />
                <div className={css.headerText}>
                  <span className={css.headerName}>
                    {otherName}
                    {locationText && (
                      <span className={css.headerLocation}>
                        <svg className={css.locationIcon} viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                          <path fill="#e53e3e" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                        {locationText}
                      </span>
                    )}
                  </span>
                  {lastOnlineText && (
                    <span className={css.headerMeta}>
                      <span className={css.headerOnline}>{lastOnlineText}</span>
                    </span>
                  )}
                </div>
              </NamedLink>
              {mounted && !isCurrentUser && isAuthenticated ? (
                <button
                  type="button"
                  className={isFollowing ? css.followingBtn : css.followBtn}
                  onClick={() => reduxDispatch(toggleFollowAndSync(params.id))}
                >
                  {isFollowing ? intl.formatMessage({ id: 'DirectMessagePage.following' }) : intl.formatMessage({ id: 'DirectMessagePage.follow' })}
                </button>
              ) : null}
            </>
          ) : (
            <div className={css.headerUser}>
              <div className={css.headerAvatarPlaceholder} />
              <div className={css.headerText}>
                <span className={css.headerName}>{otherName}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Messages area ── */}
        <div className={css.messagesArea} ref={messagesAreaRef}>
          {fetchInProgress && messages.length === 0 ? (
            <div className={css.centerState}>
              <IconSpinner />
            </div>
          ) : messages.length === 0 ? (
            <div className={css.centerState}>
              <p className={css.emptyText}>{intl.formatMessage({ id: 'DirectMessagePage.emptyText' }, { name: otherName })}</p>
              <p className={css.emptySubText}>{intl.formatMessage({ id: 'DirectMessagePage.emptySubText' })}</p>
            </div>
          ) : (
            groupedMessages.map(group => (
              <div key={group.day}>
                <div className={css.dayDivider}>
                  <span>{group.day}</span>
                </div>
                {group.messages.map(msg => {
                  const isMine =
                    msg.sender?.id?.uuid === currentUserId ||
                    msg.relationships?.sender?.data?.id?.uuid === currentUserId;
                  const content = msg.attributes?.content || '';
                  const time = formatTime(msg.attributes?.createdAt);
                  const imageData = parseImageContent(content);
                  const tr = showingTranslated ? translations[msg.id?.uuid] : null;
                  const displayText = tr?.text || content;
                  const displayCaption = tr?.caption || (imageData ? imageData.caption : '');

                  return (
                    <div
                      key={msg.id?.uuid}
                      className={isMine ? css.bubbleRowMine : css.bubbleRowOther}
                    >
                      {!isMine && (
                        <div className={css.bubbleAvatar}>
                          {otherUser ? (
                            <Avatar user={otherUser} className={css.smallAvatar} />
                          ) : (
                            <div className={css.smallAvatarFallback}>
                              {otherName.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                      )}
                      <div
                        className={classNames(
                          isMine ? css.bubbleMine : css.bubbleOther,
                          imageData ? css.bubbleImage : null
                        )}
                      >
                        {imageData ? (
                          <>
                            <div
                              className={classNames(
                                css.bubbleGallery,
                                imageData.urls.length === 1 && css.bubbleGallerySingle,
                                imageData.urls.length === 2 && css.bubbleGalleryTwo,
                                imageData.urls.length >= 3 && css.bubbleGalleryMany
                              )}
                            >
                              {imageData.urls.map((url, i) => (
                                <button
                                  key={`${url}-${i}`}
                                  type="button"
                                  className={css.bubbleImageLink}
                                  onClick={() => openLightboxByUrl(url)}
                                  aria-label={`Abrir imagem ${i + 1}`}
                                >
                                  <img
                                    src={url}
                                    alt={`imagem ${i + 1}`}
                                    className={css.bubbleImageImg}
                                    loading="lazy"
                                  />
                                </button>
                              ))}
                            </div>
                            {displayCaption ? (
                              <p className={css.bubbleCaption}>{displayCaption}</p>
                            ) : null}
                          </>
                        ) : (
                          <p className={css.bubbleText}>{displayText}</p>
                        )}
                        <span className={css.bubbleTime}>{time}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
          {messages.length > 0 ? (
            <div className={css.translateBar}>
              <button
                type="button"
                className={css.translateBarBtn}
                onClick={handleTranslateConversation}
                disabled={translateBusy}
                title={translateError || undefined}
              >
                {translateBusy
                  ? isEN ? 'Translating…' : 'A traduzir…'
                  : showingTranslated
                    ? isEN ? 'See original' : 'Ver original'
                    : isEN ? 'Translate this conversation' : 'Traduzir esta conversa'}
              </button>
            </div>
          ) : null}
        </div>

        {/* ── Input area ── */}
        <div className={css.inputArea}>
          {sendError ? <p className={css.sendError}>{sendError}</p> : null}
          <SendMessageForm
            formId="DirectMessagePage.SendMessageForm"
            rootClassName={css.sendMessageForm}
            messagePlaceholder={intl.formatMessage({ id: 'DirectMessagePage.messagePlaceholder' }, { name: otherName })}
            inProgress={sendInProgress}
            sendMessageError={null}
            onSubmit={handleSend}
            onSendImage={handleSendImage}
          />
        </div>

      </div>

      <div className={css.recentlyViewed}>
        <RecentlyViewedSection />
      </div>
      <FooterContainer />

      {lightboxOpen && typeof document !== 'undefined'
        ? ReactDOM.createPortal(
        <div
          className={css.lightboxBackdrop}
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
            margin: 0,
            transform: 'none',
            zIndex: 2147483646,
          }}
        >
          <button
            type="button"
            className={css.lightboxClose}
            onClick={e => { e.stopPropagation(); closeLightbox(); }}
            aria-label="Fechar"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
            </svg>
          </button>

          {canPrev ? (
            <button
              type="button"
              className={`${css.lightboxNav} ${css.lightboxNavPrev}`}
              onClick={e => { e.stopPropagation(); showPrev(); }}
              aria-label="Imagem anterior"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : null}

          {canNext ? (
            <button
              type="button"
              className={`${css.lightboxNav} ${css.lightboxNavNext}`}
              onClick={e => { e.stopPropagation(); showNext(); }}
              aria-label="Próxima imagem"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : null}

          {allImageUrls.length > 1 ? (
            <span className={css.lightboxCounter}>
              {lightboxIndex + 1} / {allImageUrls.length}
            </span>
          ) : null}

          <img
            src={lightboxUrl}
            alt="imagem ampliada"
            className={css.lightboxImg}
            onClick={e => e.stopPropagation()}
            onWheel={handleWheelZoom}
            onDoubleClick={resetZoom}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: `${origin.x}% ${origin.y}%`,
              transition: 'transform 0.05s linear',
              cursor: zoom > 1 ? 'zoom-out' : 'zoom-in',
            }}
          />
        </div>,
        document.body
      ) : null}
    </Page>
  );
};

const mapStateToProps = (state, ownProps) => {
  const otherUserId = selectDMOtherUserId(state);
  const otherUserRef = otherUserId ? [{ type: 'user', id: { uuid: otherUserId } }] : [];
  const [otherUser] = getMarketplaceEntities(state, otherUserRef);

  return {
    currentUser: state.user.currentUser,
    otherUser,
    transactionId: selectDMTransactionId(state),
    allTransactionIds: selectDMAllTransactionIds(state),
    messages: selectDMMessages(state),
    fetchInProgress: selectDMFetchInProgress(state),
    sendInProgress: selectDMSendInProgress(state),
    sendError: selectDMSendError(state),
    scrollingDisabled: isScrollingDisabled(state),
    params: ownProps.params,
  };
};

const mapDispatchToProps = dispatch => ({ dispatch });

const DirectMessagePage = compose(
  connect(mapStateToProps, mapDispatchToProps)
)(DirectMessagePageComponent);

export default DirectMessagePage;
