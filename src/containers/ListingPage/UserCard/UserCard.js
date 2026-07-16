import React, { useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import truncate from 'lodash/truncate';
import classNames from 'classnames';
import { useDispatch, useSelector } from 'react-redux';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { richText } from '../../../util/richText';
import { ensureUser, ensureCurrentUser } from '../../../util/data';
import { propTypes } from '../../../util/types';

import { AvatarLarge, InlineTextButton } from '../../../components';
import {
  selectIsFollowing,
  toggleFollowAndSync,
  selectFollowerCountOverride,
} from '../../../ducks/follow.duck';
import {
  fetchUserRating,
  selectUserRating,
  selectUserReviewCount,
} from '../../../ducks/ratings.duck';
import { formatResponseTime } from '../../../util/responseTime';

import css from './UserCard.module.css';

const BIO_COLLAPSED_LENGTH = 170;
const MIN_LENGTH_FOR_LONG_WORDS = 20;

const truncated = s =>
  truncate(s, {
    length: BIO_COLLAPSED_LENGTH,
    separator: /\s|,|\.|:|;/,
    omission: '…',
  });

const ExpandableBio = props => {
  const [expand, setExpand] = useState(false);
  const { className, bio } = props;
  const bioWithLinks = richText(bio, {
    linkify: true,
    longWordMinLength: MIN_LENGTH_FOR_LONG_WORDS,
    longWordClass: css.longWord,
  });
  const truncatedBio = richText(truncated(bio), {
    linkify: true,
    longWordMinLength: MIN_LENGTH_FOR_LONG_WORDS,
    longWordClass: css.longWord,
    breakChars: '/',
  });

  return (
    <p className={className}>
      {expand ? bioWithLinks : truncatedBio}
      {bio.length >= BIO_COLLAPSED_LENGTH && !expand ? (
        <InlineTextButton rootClassName={css.showMore} onClick={() => setExpand(true)}>
          <FormattedMessage id="UserCard.showFullBioLink" />
        </InlineTextButton>
      ) : null}
    </p>
  );
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

const UserCard = props => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const intl = useIntl();
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();

  const {
    rootClassName,
    className,
    user,
    currentUser,
    onContactUser,
    showContact = true,
    contactLinkId = 'contactUserLink',
  } = props;

  const userIsCurrentUser = user && user.type === 'currentUser';
  const ensuredUser = userIsCurrentUser ? ensureCurrentUser(user) : ensureUser(user);
  const ensuredCurrentUser = ensureCurrentUser(currentUser);
  const isCurrentUser =
    ensuredUser.id && ensuredCurrentUser.id && ensuredUser.id.uuid === ensuredCurrentUser.id.uuid;

  // When author is current user, use Redux currentUser data (has full publicData)
  const profileSource = isCurrentUser ? ensuredCurrentUser : ensuredUser;
  const { displayName, bio, publicData: authorPublicData } = profileSource.attributes.profile;
  const lastOnlineText = mounted ? formatLastOnline(authorPublicData?.lastOnline, intl) : null;
  const authorLocation = authorPublicData?.location?.address || authorPublicData?.location || authorPublicData?.Location?.address || authorPublicData?.Location || null;
  const authorId = ensuredUser.id?.uuid;
  const followerCountOverride = useSelector(state =>
    selectFollowerCountOverride(state, authorId)
  );
  const followersCount =
    followerCountOverride != null
      ? followerCountOverride
      : authorPublicData?.followersCount;
  // Aggregated user rating (host + customer reviews combined). Fetched once
  // per author per session via the ratings duck.
  const userRating = useSelector(state => selectUserRating(state, authorId));
  const userReviewCount = useSelector(state => selectUserReviewCount(state, authorId));
  useEffect(() => {
    if (authorId) dispatch(fetchUserRating(authorId));
  }, [authorId, dispatch]);

  const isFollowing = useSelector(state => selectIsFollowing(state, authorId));
  const isAuthenticated = useSelector(state => state.auth?.isAuthenticated);

  const hasBio = !!bio;
  const classes = classNames(rootClassName || css.root, className);

  const handleFollow = () => {
    if (!isAuthenticated) {
      history.push({
        pathname: '/login',
        state: { from: location.pathname + location.search },
      });
      return;
    }
    if (authorId) dispatch(toggleFollowAndSync(authorId));
  };

  const useOutlinedStyle = !isAuthenticated || isFollowing;
  const followButton =
    mounted && !isCurrentUser && authorId ? (
      <button
        type="button"
        className={useOutlinedStyle ? css.followingButton : css.followButton}
        onClick={handleFollow}
      >
        {isFollowing
          ? <FormattedMessage id="UserCard.following" />
          : <FormattedMessage id="UserCard.follow" />}
      </button>
    ) : null;

  return (
    <div className={classes}>
      <div className={css.content}>
        <AvatarLarge className={css.avatar} user={user} />
        <div className={css.info}>
          <div className={css.headingRow}>
            {isCurrentUser ? displayName : (
              <FormattedMessage id="UserCard.heading" values={{ name: displayName }} />
            )}
            {authorLocation ? (
              <div className={css.authorLocation}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="13" height="13" style={{ flexShrink: 0, marginTop: 5.5 }}><path fill="#e53935" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                {authorLocation}
              </div>
            ) : null}
          </div>
          <div className={css.actionsDesktop}>
            {followButton}
          </div>
        </div>
      </div>
      {followButton ? (
        <div className={css.actionsMobile}>{followButton}</div>
      ) : null}
      {(() => {
        const isPt = !intl?.locale || String(intl.locale).toLowerCase().startsWith('pt');
        const responseLabel = formatResponseTime(authorPublicData?.responseStats, !isPt);
        const followersDisplay =
          typeof followersCount === 'number' && followersCount > 0
            ? followersCount
            : null;
        // Render the three meta bits inline (online · response time · followers)
        // so they read like a single status line instead of a vertical stack.
        const items = [];
        if (lastOnlineText && !isCurrentUser) items.push({ key: 'online', node: <span className={css.metaOnline}>{lastOnlineText}</span> });
        if (responseLabel) items.push({ key: 'reply', node: <span className={css.metaReply}>{responseLabel}</span> });
        if (followersDisplay) {
          items.push({
            key: 'followers',
            node: (
              <span className={css.metaFollowers}>
                <strong>{followersDisplay}</strong>{' '}
                {followersDisplay === 1 ? 'seguidor' : 'seguidores'}
              </span>
            ),
          });
        }
        if (userRating != null && userReviewCount > 0) {
          items.push({
            key: 'rating',
            node: (
              <span className={css.metaRating}>
                <svg className={css.metaRatingStar} viewBox="0 0 24 24" aria-hidden>
                  <polygon points="12,2 15,9 22,9.5 17,14.5 18.5,22 12,18 5.5,22 7,14.5 2,9.5 9,9" />
                </svg>
                <strong>{userRating.toFixed(1)}</strong>{' '}
                <span className={css.metaRatingCount}>
                  ({userReviewCount})
                </span>
              </span>
            ),
          });
        }
        if (items.length === 0) return null;
        return (
          <div className={css.authorMeta}>
            {items.map((it, i) => (
              <React.Fragment key={it.key}>
                {i > 0 ? <span className={css.metaSeparator} aria-hidden>·</span> : null}
                {it.node}
              </React.Fragment>
            ))}
          </div>
        );
      })()}
    </div>
  );
};

export default UserCard;
