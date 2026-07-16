import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import classNames from 'classnames';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { types as sdkTypes } from '../../../util/sdkLoader';
import { useConfiguration } from '../../../context/configurationContext';
import { formatMoney } from '../../../util/currency';
import { richText } from '../../../util/richText';
import { formatDateWithProximity } from '../../../util/dates';
import { propTypes } from '../../../util/types';
import {
  getProcess,
  getUserTxRole,
  TX_TRANSITION_ACTOR_PROVIDER,
  TX_TRANSITION_ACTOR_OPERATOR,
  TX_TRANSITION_ACTOR_SYSTEM,
} from '../../../transactions/transaction';

import { Avatar, InlineTextButton, ReviewRating, UserDisplayName } from '../../../components';

import { stateDataShape } from '../TransactionPage.stateData';

import css from './ActivityFeed.module.css';

const { Money } = sdkTypes;

const MIN_LENGTH_FOR_LONG_WORDS = 20;

// Detects an image-gallery message. New format (email-friendly):
//   📷
//   URL1
//   URL2
//
//   caption
// Also supports legacy [images:URL1|URL2|...] and [image:URL].
const parseImageContent = content => {
  if (typeof content !== 'string') return null;
  const isImgUrl = u => /^https:\/\/sharetribe\.imgix\.net\//.test(u);

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

  const multi = content.match(/^\[images:([^\]]+)\](?:\n([\s\S]*))?$/);
  if (multi) {
    const urls = multi[1]
      .split('|')
      .map(u => u.trim())
      .filter(u => /^https?:\/\//.test(u));
    if (urls.length > 0) {
      return { urls, caption: (multi[2] || '').trim() };
    }
  }
  const single = content.match(/^\[image:(https?:\/\/[^\]]+)\]$/);
  if (single) return { urls: [single[1]], caption: '' };
  return null;
};

/**
 * Formats the content and format of the message for display. Replaces message content
 * with a marketplace text item if the sender is banned.
 * @param {Object} message The message to format
 * @param {Object} transaction The transaction where the message was sent
 * @param {Object} intl Intl
 * @returns A rich text version of the message content
 */
const getMessageContent = (message, transaction, intl, richTextOptions = {}) => {
  const { customer, provider } = transaction;
  const customerBannedUuid = customer?.attributes.banned ? customer?.id.uuid : '';
  const providerBannedUuid = provider?.attributes.banned ? provider?.id.uuid : '';

  const isBannedSender = [customerBannedUuid, providerBannedUuid].includes(message.sender.id.uuid);
  const content = isBannedSender
    ? intl.formatMessage({
        id: 'TransactionPage.messageSenderBanned',
      })
    : message.attributes.content;

  return richText(content, {
    linkify: true,
    longWordMinLength: MIN_LENGTH_FOR_LONG_WORDS,
    longWordClass: css.longWord,
    ...richTextOptions,
  });
};

/**
 * @component
 * @param {Object} props - The props
 * @param {propTypes.message} props.message - The message
 * @param {string} props.formattedDate - The formatted date
 * @returns {JSX.Element} The Message component
 */
const ImageGallery = ({ urls, onOpenImage, isOwn }) => {
  const sizeClass =
    urls.length === 1 ? css.gallerySingle : urls.length === 2 ? css.galleryTwo : css.galleryMany;
  return (
    <div className={classNames(css.gallery, sizeClass)}>
      {urls.map((url, i) => (
        <button
          key={`${url}-${i}`}
          type="button"
          className={css.galleryImageButton}
          onClick={() => onOpenImage(url)}
          aria-label={`Abrir imagem ${i + 1}`}
        >
          <img src={url} alt={`imagem ${i + 1}`} className={css.galleryImage} loading="lazy" />
        </button>
      ))}
    </div>
  );
};

const Message = props => {
  const { message, formattedDate, transaction, intl, onOpenImage } = props;
  const rawContent = message.attributes?.content || '';
  const imageData = parseImageContent(rawContent);
  const content = imageData ? null : getMessageContent(message, transaction, intl);

  return (
    <div className={css.message}>
      <Avatar className={css.avatar} user={message.sender} />
      <div className={css.messageContent}>
        {imageData ? (
          <>
            <ImageGallery urls={imageData.urls} onOpenImage={onOpenImage} isOwn={false} />
            {imageData.caption ? <p className={css.messageText}>{imageData.caption}</p> : null}
          </>
        ) : (
          <p className={css.messageText}>{content}</p>
        )}
        <span className={css.messageDate}>{formattedDate}</span>
      </div>
    </div>
  );
};

/**
 * @component
 * @param {Object} props - The props
 * @param {propTypes.message} props.message - The message
 * @param {string} props.formattedDate - The formatted date
 * @returns {JSX.Element} The OwnMessage component
 */
const OwnMessage = props => {
  const { message, formattedDate, transaction, intl, onOpenImage } = props;
  const rawContent = message.attributes?.content || '';
  const imageData = parseImageContent(rawContent);
  const content = imageData
    ? null
    : getMessageContent(message, transaction, intl, { linkClass: css.ownMessageContentLink });

  return (
    <div className={css.ownMessage}>
      <div className={css.ownMessageContent}>
        {imageData ? (
          <>
            <ImageGallery urls={imageData.urls} onOpenImage={onOpenImage} isOwn={true} />
            {imageData.caption ? (
              <p className={css.ownMessageText}>{imageData.caption}</p>
            ) : null}
          </>
        ) : (
          <p className={css.ownMessageText}>{content}</p>
        )}
        <span className={css.ownMessageDate}>{formattedDate}</span>
      </div>
    </div>
  );
};

/**
 * @component
 * @param {Object} props - The props
 * @param {string} props.content - The content
 * @param {number} props.rating - The rating
 * @returns {JSX.Element} The Review component
 */
const Review = props => {
  const { content, rating } = props;
  return (
    <div>
      <p className={css.reviewContent}>{content}</p>
      {rating ? (
        <ReviewRating
          reviewStarClassName={css.reviewStar}
          className={css.reviewStars}
          rating={rating}
        />
      ) : null}
    </div>
  );
};

const TransitionMessage = props => {
  const {
    transition,
    nextState,
    stateData,
    deliveryMethod,
    listingTitle,
    negotiationOffer = '-',
    ownRole,
    otherUsersName,
    onOpenReviewModal,
    intl,
  } = props;
  const { processName, processState, showReviewAsFirstLink, showReviewAsSecondLink } = stateData;
  const stateStatus = nextState === processState ? 'current' : 'past';
  const transitionName = transition.transition;

  // actor: 'you', 'system', 'operator', or display name of the other party
  const actor =
    transition.by === ownRole
      ? 'you'
      : [TX_TRANSITION_ACTOR_SYSTEM, TX_TRANSITION_ACTOR_OPERATOR].includes(transition.by)
      ? transition.by
      : otherUsersName;

  const reviewLink = showReviewAsFirstLink ? (
    <InlineTextButton onClick={onOpenReviewModal} rootClassName={css.reviewLink}>
      <FormattedMessage id="TransactionPage.ActivityFeed.reviewLink" values={{ otherUsersName }} />
    </InlineTextButton>
  ) : showReviewAsSecondLink ? (
    <InlineTextButton onClick={onOpenReviewModal} rootClassName={css.reviewLink}>
      <FormattedMessage
        id="TransactionPage.ActivityFeed.reviewAsSecondLink"
        values={{ otherUsersName }}
      />
    </InlineTextButton>
  ) : null;

  // If there is a transition specific message, use it.
  const messageConfig = stateData.transitionMessages?.find(m => m.transition === transitionName);
  const transitionMessage = messageConfig
    ? intl.formatMessage(
        { id: messageConfig.translationId },
        {
          actor,
          otherUsersName,
          listingTitle,
          reviewLink,
          deliveryMethod,
          stateStatus,
          negotiationOffer,
        }
      )
    : '';

  // ActivityFeed messages are tied to transaction process and transitions.
  // However, in practice, transitions leading to same state have had the same message.
  const defaultMessage = intl.formatMessage(
    { id: `TransactionPage.ActivityFeed.${processName}.${nextState}` },
    {
      actor,
      otherUsersName,
      listingTitle,
      reviewLink,
      deliveryMethod,
      stateStatus,
      negotiationOffer,
    }
  );

  return messageConfig ? transitionMessage : defaultMessage;
};

/**
 * @component
 * @param {Object} props - The props
 * @param {string} props.transitionMessageComponent - The transition message component
 * @param {string} props.formattedDate - The formatted date
 * @param {React.Component} props.reviewComponent - The review component
 * @returns {JSX.Element} The Transition component
 */
const Transition = props => {
  const { transitionMessageComponent, formattedDate, reviewComponent } = props;
  return (
    <div className={css.transition}>
      <div className={css.bullet}>
        <p className={css.transitionContent}>•</p>
      </div>
      <div>
        <p className={css.transitionContent}>{transitionMessageComponent}</p>
        <p className={css.transitionDate}>{formattedDate}</p>
        {reviewComponent}
      </div>
    </div>
  );
};

const reviewByAuthorId = (transaction, userId) => {
  return transaction.reviews.filter(
    r => !r.attributes.deleted && r.author.id.uuid === userId.uuid
  )[0];
};

const ReviewComponentMaybe = props => {
  const { showReviews, isRelevantTransition, reviewEntity, intl } = props;
  if (showReviews && isRelevantTransition) {
    const deletedReviewContent = intl.formatMessage({
      id: 'TransactionPage.ActivityFeed.deletedReviewContent',
    });
    const content = reviewEntity?.attributes?.deleted
      ? deletedReviewContent
      : reviewEntity?.attributes?.content;
    const rating = reviewEntity?.attributes?.rating;
    const ratingMaybe = rating ? { rating } : {};
    return <Review content={content} {...ratingMaybe} />;
  }
  return null;
};

const isMessage = item => item && item.type === 'message';

// Compare function for sorting an array containing messages and transitions
const compareItems = (a, b) => {
  const itemDate = item => (isMessage(item) ? item.attributes.createdAt : item.createdAt);
  return itemDate(a) - itemDate(b);
};

const organizedItems = (messages, transitions, hideOldTransitions) => {
  const items = messages.concat(transitions).sort(compareItems);
  if (hideOldTransitions) {
    // Hide transitions that happened before the oldest message. Since
    // we have older items (messages) that we are not showing, seeing
    // old transitions would be confusing.
    const firstMessageIndex = items.findIndex(i => isMessage(i));
    return firstMessageIndex >= 0 ? items.slice(firstMessageIndex) : [];
  } else {
    return items;
  }
};

/**
 * @component
 * @param {Object} props - The props
 * @param {string} [props.rootClassName] - Custom class that extends the default class for the root element
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {Array<propTypes.message>} props.messages - The messages
 * @param {propTypes.transaction} props.transaction - The transaction
 * @param {stateDataShape} props.stateData - The state data
 * @param {propTypes.currentUser} props.currentUser - The current user
 * @param {boolean} props.hasOlderMessages - Whether there are older messages
 * @param {boolean} props.fetchMessagesInProgress - Whether the fetch messages is in progress
 * @param {Function} props.onOpenReviewModal - The on open review modal function
 * @param {Function} props.onShowOlderMessages - The on show older messages function
 * @returns {JSX.Element} The ActivityFeed component
 */
export const ActivityFeed = props => {
  const intl = props.intl || useIntl();
  const config = useConfiguration();
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const {
    rootClassName,
    className,
    messages,
    transaction = {},
    stateData = {},
    currentUser,
    hasOlderMessages,
    fetchMessagesInProgress,
    onOpenReviewModal,
    onShowOlderMessages,
  } = props;

  // Collect all image URLs across the conversation, in chronological order.
  const allImageUrls = (messages || []).reduce((acc, msg) => {
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
  const classes = classNames(rootClassName || css.root, className);
  const processName = stateData.processName;

  // If stateData doesn't have processName, full tx data has not been fetched.
  if (!processName) {
    return null;
  }
  const process = getProcess(processName);
  const transitions = transaction?.attributes?.transitions || [];
  const offers = transaction?.attributes?.metadata?.offers;

  const enhancedTransitions =
    offers && process.getTransitionsWithMatchingOffers
      ? process.getTransitionsWithMatchingOffers(transitions, offers)
      : transitions;
  // Check currency primarily from tx, secondarily from listing, the fallback is marketplace currency
  const currency =
    transaction?.attributes?.payinTotal?.currency ||
    transaction?.listing?.attributes?.price?.currency ||
    config.currency;
  const relevantTransitions = enhancedTransitions.filter(t =>
    process.isRelevantPastTransition(t.transition)
  );
  const todayString = intl.formatMessage({ id: 'TransactionPage.ActivityFeed.today' });

  // combine messages and transaction transitions
  const hideOldTransitions = hasOlderMessages || fetchMessagesInProgress;
  const items = organizedItems(messages, relevantTransitions, hideOldTransitions);

  const messageListItem = message => {
    const formattedDate = formatDateWithProximity(message.attributes.createdAt, intl, todayString);
    const isOwnMessage = currentUser?.id && message?.sender?.id?.uuid === currentUser.id?.uuid;
    const messageComponent = isOwnMessage ? (
      <OwnMessage
        message={message}
        formattedDate={formattedDate}
        transaction={transaction}
        intl={intl}
        onOpenImage={openLightboxByUrl}
      />
    ) : (
      <Message
        message={message}
        formattedDate={formattedDate}
        transaction={transaction}
        intl={intl}
        onOpenImage={openLightboxByUrl}
      />
    );

    return (
      <li id={`msg-${message.id.uuid}`} key={message.id.uuid} className={css.messageItem}>
        {messageComponent}
      </li>
    );
  };

  const transitionListItem = transition => {
    const formattedDate = formatDateWithProximity(transition.createdAt, intl, todayString);
    const { customer, provider, listing } = transaction || {};

    // Initially transition component is empty;
    let transitionComponent = <Transition />;

    if (currentUser?.id && customer?.id && provider?.id && listing?.id) {
      const transitionName = transition.transition;
      const nextState = process.getStateAfterTransition(transition.transition);
      const isCustomerReview = process.isCustomerReview(transitionName);
      const isProviderRieview = process.isProviderReview(transitionName);
      const reviewEntity = isCustomerReview
        ? reviewByAuthorId(transaction, customer.id)
        : isProviderRieview
        ? reviewByAuthorId(transaction, provider.id)
        : null;

      const listingTitle = listing.attributes.deleted
        ? intl.formatMessage({ id: 'TransactionPage.ActivityFeed.deletedListing' })
        : listing.attributes.title;

      const ownRole = getUserTxRole(currentUser.id, transaction);
      const otherUser = ownRole === TX_TRANSITION_ACTOR_PROVIDER ? customer : provider;

      const offerInSubunits = transition.offerInSubunits;
      const negotiationOffer = offerInSubunits
        ? formatMoney(intl, new Money(offerInSubunits, currency))
        : null;

      transitionComponent = (
        <Transition
          formattedDate={formattedDate}
          transitionMessageComponent={
            <TransitionMessage
              transition={transition}
              nextState={nextState}
              stateData={stateData}
              deliveryMethod={transaction.attributes?.protectedData?.deliveryMethod || 'none'}
              listingTitle={listingTitle}
              negotiationOffer={negotiationOffer}
              ownRole={ownRole}
              otherUsersName={<UserDisplayName user={otherUser} intl={intl} />}
              onOpenReviewModal={onOpenReviewModal}
              intl={intl}
            />
          }
          reviewComponent={
            <ReviewComponentMaybe
              showReviews={stateData.showReviews}
              isRelevantTransition={isCustomerReview || isProviderRieview}
              reviewEntity={reviewEntity}
              intl={intl}
            />
          }
        />
      );
    }
    return (
      <li key={`${transition.transition}-${transition.createdAt}`} className={css.transitionItem}>
        {transitionComponent}
      </li>
    );
  };

  return (
    <>
      <ul className={classes}>
        {hasOlderMessages ? (
          <li className={css.showOlderWrapper} key="show-older-messages">
            <InlineTextButton className={css.showOlderButton} onClick={onShowOlderMessages}>
              <FormattedMessage id="TransactionPage.ActivityFeed.showOlderMessages" />
            </InlineTextButton>
          </li>
        ) : null}
        {items.filter(isMessage).map(item => messageListItem(item))}
      </ul>

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
                onClick={e => {
                  e.stopPropagation();
                  closeLightbox();
                }}
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
                  onClick={e => {
                    e.stopPropagation();
                    showPrev();
                  }}
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
                  onClick={e => {
                    e.stopPropagation();
                    showNext();
                  }}
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
          )
        : null}
    </>
  );
};

export default ActivityFeed;
