import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { FormattedMessage, useIntl } from '../../util/reactIntl';

import { H2, Page, LayoutSingleColumn, NamedLink, AvatarMedium } from '../../components';
import ReportUserModal from '../../components/ReportUserModal/ReportUserModal';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import { getMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import { selectFollowing, toggleFollowAndSync } from '../../ducks/follow.duck';
import {
  selectFollowingPageUserIds,
  selectFollowingPageInProgress,
} from './FollowingPage.duck';
import { triggerEmailVerificationModal } from '../../util/emailVerificationGate';

import css from './FollowingPage.module.css';

const formatLastOnline = isoString => {
  if (!isoString) return null;
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 120) return 'Online agora mesmo';
  if (diff < 3600) return `Online há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Online há ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `Online há ${Math.floor(diff / 86400)}d`;
  return null;
};


const FollowingPage = () => {
  const intl = useIntl();
  const dispatch = useDispatch();
  const history = useHistory();
  const currentUser = useSelector(state => state.user.currentUser);
  const scrollingDisabled = useSelector(isScrollingDisabled);
  const [reportUser, setReportUser] = useState(null);

  const following = useSelector(selectFollowing);
  // Map of optimistic follower-count overrides — keyed by target user id. We
  // read the whole map once so the .map() below can look up each user without
  // breaking React hook rules.
  const counts = useSelector(state => state.follow?.counts || {});
  const userIds = useSelector(selectFollowingPageUserIds);
  const inProgress = useSelector(selectFollowingPageInProgress);
  const users = useSelector(state =>
    getMarketplaceEntities(state, userIds.map(id => ({ type: 'user', id: { uuid: id } })))
  ).filter(u => following.includes(u?.id?.uuid));

  const title = intl.formatMessage({ id: 'FollowingPage.title' });

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled} className={css.root}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.content}>
          <div className={css.headingWrapper}>
            <H2 as="h1" className={css.heading}>
              <FormattedMessage id="FollowingPage.title" />
            </H2>
            <p className={css.count}>
              <FormattedMessage id="FollowingPage.count" values={{ count: following.length }} />
            </p>
          </div>

          <div>
            {inProgress ? (
                <div className={css.empty}>
                  <FormattedMessage id="FollowingPage.loading" />
                </div>
              ) : following.length === 0 ? (
                <div className={css.empty}>
                  <FormattedMessage id="FollowingPage.noFollowing" />
                </div>
              ) : (
                <ul className={css.list}>
                  {users.map(user => {
                    const id = user.id?.uuid;
                    const name = user.attributes?.profile?.displayName || '—';
                    const publicData = user.attributes?.profile?.publicData;
                    const lastOnlineText = formatLastOnline(publicData?.lastOnline);
                    const location = publicData?.Location || publicData?.location || null;
                    const overrideCount = counts?.[id];
                    const followersCount =
                      typeof overrideCount === 'number'
                        ? overrideCount
                        : publicData?.followersCount;
                    return (
                      <li key={id} className={css.item}>
                        <div className={css.cardTop}>
                          <div className={css.profileRow}>
                            <NamedLink name="ProfilePage" params={{ id }} className={css.avatarLink}>
                              <AvatarMedium user={user} disableProfileLink />
                            </NamedLink>
                            <div className={css.userInfo}>
                              <div className={css.nameRow}>
                                <NamedLink name="ProfilePage" params={{ id }} className={css.nameLink}>
                                  {name}
                                </NamedLink>
                                {location ? (
                                  <span className={css.userLocation}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" style={{ flexShrink: 0 }}><path fill="#e53935" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                                    {location}
                                  </span>
                                ) : null}
                              </div>
                              {lastOnlineText ? <span className={css.lastOnline}>{lastOnlineText}</span> : null}
                              {typeof followersCount === 'number' && followersCount > 0 ? (
                                <span className={css.followersCount}>
                                  <strong>{followersCount}</strong>{' '}
                                  {followersCount === 1 ? 'seguidor' : 'seguidores'}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className={css.cardActions}>
                          <button
                            type="button"
                            className={css.unfollowButton}
                            onClick={() => dispatch(toggleFollowAndSync(id))}
                          >
                            <FormattedMessage id="FollowingPage.unfollow" />
                          </button>
                          <button
                            type="button"
                            className={css.messageButton}
                            onClick={() => {
                              if (!currentUser?.attributes?.emailVerified) {
                                triggerEmailVerificationModal(() => history.push(`/conversa/${id}`));
                                return;
                              }
                              history.push(`/conversa/${id}`);
                            }}
                          >
                            <FormattedMessage id="FollowingPage.sendMessage" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className={css.reportLink}
                          onClick={() => setReportUser(user)}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginRight: 5, verticalAlign: 'middle' }}>
                            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                            <line x1="4" y1="22" x2="4" y2="15" />
                          </svg>
                          <FormattedMessage id="ReportUserModal.triggerLabel" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
        </div>
        <ReportUserModal
          isOpen={!!reportUser}
          onClose={() => setReportUser(null)}
          user={reportUser}
        />
      </LayoutSingleColumn>
    </Page>
  );
};

export default FollowingPage;
