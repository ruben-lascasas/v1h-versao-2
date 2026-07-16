import React from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { useConfiguration } from '../../context/configurationContext';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { propTypes } from '../../util/types';
import { PROFILE_PAGE_PENDING_APPROVAL_VARIANT } from '../../util/urlHelpers';
import { ensureCurrentUser } from '../../util/data';
import {
  initialValuesForUserFields,
  isUserAuthorized,
  pickUserFieldsData,
  showCreateListingLinkForUser,
} from '../../util/userHelpers';
import { isScrollingDisabled } from '../../ducks/ui.duck';

import { Page, NamedLink, LayoutSingleColumn, Avatar, ImageFromFile, IconSpinner } from '../../components';

import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';

import ProfileSettingsForm from './ProfileSettingsForm/ProfileSettingsForm';

import { updateProfile, uploadImage, removeProfileImage } from './ProfileSettingsPage.duck';
import css from './ProfileSettingsPage.module.css';

const onImageUploadHandler = (values, fn) => {
  const { id, imageId, file } = values;
  if (file) {
    fn({ id, imageId, file });
  }
};

const ViewProfileLink = props => {
  const { userUUID, isUnauthorizedUser } = props;
  return userUUID && isUnauthorizedUser ? (
    <NamedLink className={css.profileLink} name="ProfilePageVariant"
      params={{ id: userUUID, variant: PROFILE_PAGE_PENDING_APPROVAL_VARIANT }}>
      <FormattedMessage id="ProfileSettingsPage.viewProfileLink" />
    </NamedLink>
  ) : userUUID ? (
    <NamedLink className={css.profileLink} name="ProfilePage" params={{ id: userUUID }}>
      <FormattedMessage id="ProfileSettingsPage.viewProfileLink" />
    </NamedLink>
  ) : null;
};

const ACCEPT_IMAGES = 'image/*';

const AvatarSection = ({ user, profileImage, uploadInProgress, onImageUpload, onRemoveImage, userUUID, isUnauthorizedUser, inputId }) => {
  const intl = useIntl();
  const removeLabel = intl.formatMessage({ id: 'ProfileSettingsPage.removeAvatar' });
  const transientUserProfileImage = profileImage?.uploadedImage || user?.profileImage;
  const transientUser = { ...user, profileImage: transientUserProfileImage };
  const fileExists = !!profileImage?.file;
  const fileUploadInProgress = uploadInProgress && fileExists;
  const hasStoredAvatar = !!user?.profileImage?.id;
  const hasAnyAvatar = hasStoredAvatar || !!profileImage?.imageId;

  const avatarEl = !fileUploadInProgress && profileImage?.imageId ? (
    <Avatar
      className={css.avatar}
      renderSizes="(max-width: 767px) 96px, 240px"
      user={transientUser}
      disableProfileLink
    />
  ) : null;

  const imageFromFile = fileExists && fileUploadInProgress ? (
    <ImageFromFile
      id={profileImage.id}
      className={css.avatarContainer}
      rootClassName={css.uploadingImage}
      aspectWidth={1}
      aspectHeight={1}
      file={profileImage.file}
    >
      <div className={css.uploadingImageOverlay}><IconSpinner /></div>
    </ImageFromFile>
  ) : null;

  const handleChange = e => {
    const file = e.target.files[0];
    if (file) {
      const tempId = `${file.name}_${Date.now()}`;
      onImageUpload({ id: tempId, file });
    }
  };

  return (
    <div className={css.avatarSection}>
      <p className={css.avatarLabel}>
        <FormattedMessage id="ProfileSettingsPage.avatarLabel" />
      </p>
      <input
        id={inputId}
        type="file"
        accept={ACCEPT_IMAGES}
        className={css.uploadAvatarInput}
        onChange={handleChange}
        disabled={uploadInProgress}
      />
      <div className={css.avatarPositioner}>
        <label htmlFor={inputId} className={css.avatarLabel}>
          <div className={css.avatarContainer}>
            {imageFromFile}
            {avatarEl}
            {!imageFromFile && !avatarEl && (
              <div className={css.avatarPlaceholder}>
                <span><FormattedMessage id="ProfileSettingsForm.addYourProfilePictureMobile" /></span>
              </div>
            )}
            <div className={css.changeAvatar}>
              <FormattedMessage id="ProfileSettingsForm.changeAvatar" />
            </div>
          </div>
        </label>
        {hasAnyAvatar && !uploadInProgress ? (
          <button
            type="button"
            className={css.removeAvatarBadge}
            onClick={onRemoveImage}
            aria-label={removeLabel}
            title={removeLabel}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        ) : null}
      </div>
      <p className={css.avatarHint}>
        <FormattedMessage id="ProfileSettingsPage.avatarHint" />
      </p>
      <p className={css.avatarHintSub}>
        <FormattedMessage id="ProfileSettingsForm.fileInfo" />
      </p>
      <div className={css.viewProfileDesktopWrapper}>
        <ViewProfileLink userUUID={userUUID} isUnauthorizedUser={isUnauthorizedUser} />
      </div>
    </div>
  );
};

const ProfileSideInfo = ({ user, profileImage, uploadInProgress, uploadImageError, onImageUpload, onRemoveImage, userUUID, isUnauthorizedUser }) => {
  return (
    <div className={css.info}>
      <h2 className={`${css.infoTitle} ${css.infoTitleDesktop}`}>
        <FormattedMessage id="ProfileSettingsPage.sideInfoTitle" />
      </h2>
      <p className={`${css.infoText} ${css.infoTextDesktop}`}>
        <FormattedMessage id="ProfileSettingsPage.sideInfoDescription" />
      </p>

      <AvatarSection
        user={user}
        profileImage={profileImage}
        uploadInProgress={uploadInProgress}
        onImageUpload={onImageUpload}
        onRemoveImage={onRemoveImage}
        userUUID={userUUID}
        isUnauthorizedUser={isUnauthorizedUser}
        inputId="profileImageSideDesktop"
      />
    </div>
  );
};

export const ProfileSettingsPageComponent = props => {
  const config = useConfiguration();
  const intl = useIntl();
  const history = useHistory();
  const {
    currentUser, image, onImageUpload, onUpdateProfile, onRemoveImage,
    scrollingDisabled, updateInProgress, updateProfileError,
    uploadImageError, uploadInProgress,
  } = props;

  const { userFields, userTypes = [] } = config.user;
  const publicUserFields = userFields.filter(uf => uf.scope === 'public');

  const handleSubmit = (values, userType) => {
    const {
      firstName,
      lastName,
      displayName,
      bio: rawBio,
      profileLocation,
      languagesSpoken,
      socialLinks: rawSocialLinks,
      ...rest
    } = values;
    const displayNameMaybe = displayName ? { displayName: displayName.trim() } : { displayName: null };
    const bio = rawBio || '';
    const locationAddress = profileLocation?.selectedPlace?.address || profileLocation?.search || null;
    // Strip empty strings so we don't store useless keys, and let the field
    // know what each platform stored verbatim — the URL is normalised on the
    // display side (so users can paste either "instagram.com/x" or "@x").
    const socialLinks = rawSocialLinks && typeof rawSocialLinks === 'object'
      ? Object.fromEntries(
          Object.entries(rawSocialLinks)
            .map(([k, v]) => [k, String(v || '').trim()])
            .filter(([, v]) => v.length > 0)
        )
      : {};
    const profile = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      ...displayNameMaybe,
      bio,
      publicData: {
        ...pickUserFieldsData(rest, 'public', userType, userFields),
        ...(locationAddress !== null ? { Location: locationAddress } : {}),
        languagesSpoken: Array.isArray(languagesSpoken) ? languagesSpoken : [],
        socialLinks,
      },
    };
    const uploadedImage = props.image;
    const updatedValues =
      uploadedImage && uploadedImage.imageId && uploadedImage.file
        ? { ...profile, profileImageId: uploadedImage.imageId }
        : profile;
    // Navigate to the public profile after a successful save so the user
    // sees the changes live. We resolve the dispatched async thunk via
    // `.unwrap()` so the catch only fires on real errors.
    const result = onUpdateProfile(updatedValues);
    const promise =
      result && typeof result.unwrap === 'function' ? result.unwrap() : Promise.resolve(result);
    promise
      .then(() => {
        const userId = currentUser?.id?.uuid;
        if (userId) history.push(`/u/${userId}`);
      })
      .catch(() => {
        // Stay on the form so the user can fix the error — the form already
        // surfaces updateProfileError in the UI.
      });
  };

  const user = ensureCurrentUser(currentUser);
  const { firstName, lastName, displayName, bio, publicData } = user?.attributes.profile;
  const isUnauthorizedUser = currentUser && !isUserAuthorized(currentUser);
  const { userType } = publicData || {};
  const profileImageId = user.profileImage ? user.profileImage.id : null;
  const profileImage = image || { imageId: profileImageId };
  const userTypeConfig = userTypes.find(c => c.userType === userType);
  const isDisplayNameIncluded = userTypeConfig?.defaultUserFields?.displayName !== false;
  const displayNameMaybe = isDisplayNameIncluded && displayName ? { displayName } : {};

  const profileSettingsForm = user.id ? (
    <ProfileSettingsForm
      className={css.form}
      currentUser={currentUser}
      initialValues={{
        firstName, lastName, ...displayNameMaybe, bio,
        profileImage: user.profileImage,
        ...initialValuesForUserFields(publicData, 'public', userType, userFields),
        profileLocation: publicData?.Location
          ? { search: publicData.Location, selectedPlace: { address: publicData.Location } }
          : null,
        languagesSpoken: Array.isArray(publicData?.languagesSpoken) ? publicData.languagesSpoken : [],
        socialLinks: publicData?.socialLinks && typeof publicData.socialLinks === 'object'
          ? publicData.socialLinks
          : {},
      }}
      profileImage={profileImage}
      onImageUpload={e => onImageUploadHandler(e, onImageUpload)}
      uploadInProgress={uploadInProgress}
      updateInProgress={updateInProgress}
      uploadImageError={uploadImageError}
      updateProfileError={updateProfileError}
      onSubmit={values => handleSubmit(values, userType)}
      marketplaceName={config.marketplaceName}
      userFields={publicUserFields}
      userTypeConfig={userTypeConfig}
    />
  ) : null;

  const title = intl.formatMessage({ id: 'ProfileSettingsPage.title' });

  return (
    <Page className={css.root} title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.root}>
          <div className={css.container}>
            <div className={css.card}>
              <ProfileSideInfo
                user={user}
                profileImage={profileImage}
                uploadInProgress={uploadInProgress}
                uploadImageError={uploadImageError}
                userUUID={user?.id?.uuid}
                isUnauthorizedUser={isUnauthorizedUser}
                onImageUpload={e => onImageUploadHandler(e, onImageUpload)}
                onRemoveImage={onRemoveImage}
              />

              <div className={css.divider} />

              <div className={css.formWrapper}>
                <div className={css.header}>
                  <h1 className={css.pageTitle}>
                    <FormattedMessage id="ProfileSettingsPage.formTitle" />
                  </h1>
                  <p className={`${css.pageSubtitle} ${css.pageSubtitleDesktop}`}>
                    <FormattedMessage id="ProfileSettingsPage.formSubtitle" />
                  </p>
                  <p className={`${css.pageSubtitle} ${css.pageSubtitleMobile}`}>
                    <FormattedMessage id="ProfileSettingsPage.sideInfoDescription" />
                  </p>
                </div>

                <div className={css.mobileAvatarBlock}>
                  <AvatarSection
                    user={user}
                    profileImage={profileImage}
                    uploadInProgress={uploadInProgress}
                    onImageUpload={e => onImageUploadHandler(e, onImageUpload)}
                    onRemoveImage={onRemoveImage}
                    userUUID={user?.id?.uuid}
                    isUnauthorizedUser={isUnauthorizedUser}
                    inputId="profileImageSideMobile"
                  />
                </div>

                {profileSettingsForm}

                {user?.id?.uuid ? (
                  <NamedLink
                    className={css.viewProfileMobileButton}
                    name={isUnauthorizedUser ? 'ProfilePageVariant' : 'ProfilePage'}
                    params={
                      isUnauthorizedUser
                        ? { id: user.id.uuid, variant: PROFILE_PAGE_PENDING_APPROVAL_VARIANT }
                        : { id: user.id.uuid }
                    }
                  >
                    <FormattedMessage id="ProfileSettingsPage.viewProfileLink" />
                  </NamedLink>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => {
  const { currentUser } = state.user;
  const { image, uploadImageError, uploadInProgress, updateInProgress, updateProfileError } = state.ProfileSettingsPage;
  return { currentUser, image, scrollingDisabled: isScrollingDisabled(state), updateInProgress, updateProfileError, uploadImageError, uploadInProgress };
};

const mapDispatchToProps = dispatch => ({
  onImageUpload: data => dispatch(uploadImage(data)),
  onUpdateProfile: data => dispatch(updateProfile(data)),
  onRemoveImage: () => dispatch(removeProfileImage()),
});

const ProfileSettingsPage = compose(connect(mapStateToProps, mapDispatchToProps))(ProfileSettingsPageComponent);
export default ProfileSettingsPage;
