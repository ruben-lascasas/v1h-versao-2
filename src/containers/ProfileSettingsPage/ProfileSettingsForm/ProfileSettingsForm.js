import React, { Component } from 'react';
import { compose } from 'redux';
import { Field, Form as FinalForm } from 'react-final-form';
import isEqual from 'lodash/isEqual';
import classNames from 'classnames';
import arrayMutators from 'final-form-arrays';

import { FormattedMessage, injectIntl, intlShape } from '../../../util/reactIntl';
import { ensureCurrentUser } from '../../../util/data';
import { propTypes } from '../../../util/types';
import * as validators from '../../../util/validators';
import { isUploadImageOverLimitError } from '../../../util/errors';
import { getPropsForCustomUserFieldInputs } from '../../../util/userHelpers';

import {
  Form,
  Avatar,
  Button,
  ImageFromFile,
  IconSpinner,
  FieldTextInput,
  H4,
  CustomExtendedDataField,
  FieldLocationAutocompleteInput,
} from '../../../components';
import LanguagesField from '../../../components/LanguagesField/LanguagesField';
import SocialLinksField from '../../../components/SocialLinksField/SocialLinksField';

import css from './ProfileSettingsForm.module.css';

const ACCEPT_IMAGES = 'image/*';
const UPLOAD_CHANGE_DELAY = 2000; // Show spinner so that browser has time to load img srcset

// Field limits
const NAME_MAX_LENGTH = 50;
const DISPLAY_NAME_MAX_LENGTH = 60;
const BIO_MAX_LENGTH = 500;

// Allowed format for first/last name: letters (incl. accented), spaces,
// hyphens and apostrophes (e.g. "O'Brien", "Jean-Marc"). No digits, no symbols.
const NAME_ALLOWED_REGEX = /^[\p{L}\s'\-]+$/u;
const nameFormatValid = msg => value =>
  !value || NAME_ALLOWED_REGEX.test(value) ? undefined : msg;

// Display name allows letters, digits, spaces, dots, hyphens, apostrophes, underscores.
const DISPLAY_NAME_ALLOWED_REGEX = /^[\p{L}\p{N}\s'\-._]+$/u;
const displayNameFormatValid = msg => value =>
  !value || DISPLAY_NAME_ALLOWED_REGEX.test(value) ? undefined : msg;

const DisplayNameMaybe = props => {
  const { userTypeConfig, intl } = props;

  const isDisabled = userTypeConfig?.defaultUserFields?.displayName === false;
  if (isDisabled) {
    return null;
  }

  const { required } = userTypeConfig?.displayNameSettings || {};
  const isRequired = required === true;

  const lengthValidator = validators.maxLength(
    intl.formatMessage(
      { id: 'ProfileSettingsForm.displayNameTooLong' },
      { maxLength: DISPLAY_NAME_MAX_LENGTH }
    ),
    DISPLAY_NAME_MAX_LENGTH
  );
  const formatValidator = displayNameFormatValid(
    intl.formatMessage({ id: 'ProfileSettingsForm.displayNameInvalidFormat' })
  );
  const validate = isRequired
    ? validators.composeValidators(
        validators.required(
          intl.formatMessage({ id: 'ProfileSettingsForm.displayNameRequired' })
        ),
        lengthValidator,
        formatValidator
      )
    : validators.composeValidators(lengthValidator, formatValidator);

  return (
    <div className={css.sectionContainer}>
      <FieldTextInput
        className={css.row}
        type="text"
        id="displayName"
        name="displayName"
        label={intl.formatMessage({
          id: 'ProfileSettingsForm.displayNameLabel',
        })}
        placeholder={intl.formatMessage({
          id: 'ProfileSettingsForm.displayNamePlaceholder',
        })}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        validate={validate}
      />
    </div>
  );
};

/**
 * ProfileSettingsForm
 * TODO: change to functional component
 *
 * @component
 * @param {Object} props
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.formId] - The form id
 * @param {propTypes.currentUser} props.currentUser - The current user
 * @param {Object} props.userTypeConfig - The user type config
 * @param {string} props.userTypeConfig.userType - The user type
 * @param {Array<Object>} props.userFields - The user fields
 * @param {Object} [props.profileImage] - The profile image
 * @param {string} props.marketplaceName - The marketplace name
 * @param {Function} props.onImageUpload - The function to handle image upload
 * @param {Function} props.onSubmit - The function to handle form submission
 * @param {boolean} props.uploadInProgress - Whether the upload is in progress
 * @param {propTypes.error} [props.uploadImageError] - The upload image error
 * @param {boolean} props.updateInProgress - Whether the update is in progress
 * @param {propTypes.error} [props.updateProfileError] - The update profile error
 * @param {intlShape} props.intl - The intl object
 * @returns {JSX.Element}
 */
class ProfileSettingsFormComponent extends Component {
  constructor(props) {
    super(props);

    this.uploadDelayTimeoutId = null;
    this.state = { uploadDelay: false };
    this.submittedValues = {};
  }

  componentDidUpdate(prevProps) {
    // Upload delay is additional time window where Avatar is added to the DOM,
    // but not yet visible (time to load image URL from srcset)
    if (prevProps.uploadInProgress && !this.props.uploadInProgress) {
      this.setState({ uploadDelay: true });
      this.uploadDelayTimeoutId = window.setTimeout(() => {
        this.setState({ uploadDelay: false });
      }, UPLOAD_CHANGE_DELAY);
    }
  }

  componentWillUnmount() {
    window.clearTimeout(this.uploadDelayTimeoutId);
  }

  render() {
    return (
      <FinalForm
        {...this.props}
        mutators={{ ...arrayMutators }}
        render={fieldRenderProps => {
          const {
            className,
            currentUser,
            handleSubmit,
            intl,
            invalid,
            onImageUpload,
            pristine,
            profileImage,
            rootClassName,
            updateInProgress,
            updateProfileError,
            uploadImageError,
            uploadInProgress,
            form,
            formId,
            marketplaceName,
            values,
            userFields,
            userTypeConfig,
          } = fieldRenderProps;

          const user = ensureCurrentUser(currentUser);

          // First name
          const firstNameLabel = intl.formatMessage({
            id: 'ProfileSettingsForm.firstNameLabel',
          });
          const firstNamePlaceholder = intl.formatMessage({
            id: 'ProfileSettingsForm.firstNamePlaceholder',
          });
          const firstNameRequiredMessage = intl.formatMessage({
            id: 'ProfileSettingsForm.firstNameRequired',
          });
          const firstNameRequired = validators.required(firstNameRequiredMessage);

          // Last name
          const lastNameLabel = intl.formatMessage({
            id: 'ProfileSettingsForm.lastNameLabel',
          });
          const lastNamePlaceholder = intl.formatMessage({
            id: 'ProfileSettingsForm.lastNamePlaceholder',
          });
          const lastNameRequiredMessage = intl.formatMessage({
            id: 'ProfileSettingsForm.lastNameRequired',
          });
          const lastNameRequired = validators.required(lastNameRequiredMessage);

          // Bio
          const bioLabel = intl.formatMessage({
            id: 'ProfileSettingsForm.bioLabel',
          });
          const bioPlaceholder = intl.formatMessage({
            id: 'ProfileSettingsForm.bioPlaceholder',
          });

          const uploadingOverlay =
            uploadInProgress || this.state.uploadDelay ? (
              <div className={css.uploadingImageOverlay}>
                <IconSpinner />
              </div>
            ) : null;

          const hasUploadError = !!uploadImageError && !uploadInProgress;
          const errorClasses = classNames({ [css.avatarUploadError]: hasUploadError });
          const transientUserProfileImage = profileImage.uploadedImage || user.profileImage;
          const transientUser = { ...user, profileImage: transientUserProfileImage };

          // Ensure that file exists if imageFromFile is used
          const fileExists = !!profileImage.file;
          const fileUploadInProgress = uploadInProgress && fileExists;
          const delayAfterUpload = profileImage.imageId && this.state.uploadDelay;
          const imageFromFile =
            fileExists && (fileUploadInProgress || delayAfterUpload) ? (
              <ImageFromFile
                id={profileImage.id}
                className={errorClasses}
                rootClassName={css.uploadingImage}
                aspectWidth={1}
                aspectHeight={1}
                file={profileImage.file}
              >
                {uploadingOverlay}
              </ImageFromFile>
            ) : null;

          // Avatar is rendered in hidden during the upload delay
          // Upload delay smoothes image change process:
          // responsive img has time to load srcset stuff before it is shown to user.
          const avatarClasses = classNames(errorClasses, css.avatar, {
            [css.avatarInvisible]: this.state.uploadDelay,
          });
          const avatarComponent =
            !fileUploadInProgress && profileImage.imageId ? (
              <Avatar
                className={avatarClasses}
                renderSizes="(max-width: 767px) 96px, 240px"
                user={transientUser}
                disableProfileLink
              />
            ) : null;

          const chooseAvatarLabel =
            profileImage.imageId || fileUploadInProgress ? (
              <div className={css.avatarContainer}>
                {imageFromFile}
                {avatarComponent}
                <div className={css.changeAvatar}>
                  <FormattedMessage id="ProfileSettingsForm.changeAvatar" />
                </div>
              </div>
            ) : (
              <div className={css.avatarPlaceholder}>
                <div className={css.avatarPlaceholderText}>
                  <FormattedMessage id="ProfileSettingsForm.addYourProfilePicture" />
                </div>
                <div className={css.avatarPlaceholderTextMobile}>
                  <FormattedMessage id="ProfileSettingsForm.addYourProfilePictureMobile" />
                </div>
              </div>
            );

          const submitError = updateProfileError ? (
            <div className={css.error}>
              <FormattedMessage id="ProfileSettingsForm.updateProfileFailed" />
            </div>
          ) : null;

          const classes = classNames(rootClassName || css.root, className);
          const submitInProgress = updateInProgress;
          const submittedOnce = Object.keys(this.submittedValues).length > 0;
          const pristineSinceLastSubmit = submittedOnce && isEqual(values, this.submittedValues);
          const hasNewImage = !!(profileImage?.file && profileImage?.imageId);
          const submitDisabled =
            invalid || ((pristine || pristineSinceLastSubmit) && !hasNewImage) || uploadInProgress || submitInProgress;

          const userFieldProps = getPropsForCustomUserFieldInputs(
            userFields,
            userTypeConfig?.userType,
            false
          ).filter(({ key }) => key !== 'pub_Location' && key !== 'pub_location');

          return (
            <Form
              className={classes}
              onSubmit={e => {
                this.submittedValues = values;
                handleSubmit(e);
              }}
            >
              <div className={css.sectionContainer}>
                <div className={css.nameContainer}>
                  <FieldTextInput
                    className={css.firstName}
                    type="text"
                    id="firstName"
                    name="firstName"
                    label={firstNameLabel}
                    placeholder={firstNamePlaceholder}
                    maxLength={NAME_MAX_LENGTH}
                    validate={validators.composeValidators(
                      firstNameRequired,
                      validators.maxLength(
                        intl.formatMessage(
                          { id: 'ProfileSettingsForm.nameTooLong' },
                          { maxLength: NAME_MAX_LENGTH }
                        ),
                        NAME_MAX_LENGTH
                      ),
                      nameFormatValid(
                        intl.formatMessage({ id: 'ProfileSettingsForm.nameInvalidFormat' })
                      )
                    )}
                  />
                  <FieldTextInput
                    className={css.lastName}
                    type="text"
                    id="lastName"
                    name="lastName"
                    label={lastNameLabel}
                    placeholder={lastNamePlaceholder}
                    maxLength={NAME_MAX_LENGTH}
                    validate={validators.composeValidators(
                      lastNameRequired,
                      validators.maxLength(
                        intl.formatMessage(
                          { id: 'ProfileSettingsForm.nameTooLong' },
                          { maxLength: NAME_MAX_LENGTH }
                        ),
                        NAME_MAX_LENGTH
                      ),
                      nameFormatValid(
                        intl.formatMessage({ id: 'ProfileSettingsForm.nameInvalidFormat' })
                      )
                    )}
                  />
                </div>
              </div>

              <DisplayNameMaybe userTypeConfig={userTypeConfig} intl={intl} />

              <div className={classNames(css.sectionContainer)}>
                <div className={css.locationWrapper}>
                  <FieldLocationAutocompleteInput
                    name="profileLocation"
                    label="Localização"
                    placeholder="Cidade, País..."
                    useDefaultPredictions={false}
                    suggestCurrentLocation={false}
                    hideSearchHistory
                    hideExtras
                    format={v => v}
                    valueFromForm={values.profileLocation}
                  />
                </div>
                {userFieldProps.length > 0 && userFieldProps.map(({ key, ...fieldProps }) => (
                  <CustomExtendedDataField key={key} {...fieldProps} formId={formId} />
                ))}
              </div>
              <div className={css.sectionContainer}>
                <FieldTextInput
                  type="textarea"
                  id="bio"
                  name="bio"
                  label={bioLabel}
                  placeholder={bioPlaceholder}
                  maxLength={BIO_MAX_LENGTH}
                  validate={validators.maxLength(
                    intl.formatMessage(
                      { id: 'ProfileSettingsForm.bioTooLong' },
                      { maxLength: BIO_MAX_LENGTH }
                    ),
                    BIO_MAX_LENGTH
                  )}
                />
              </div>

              <div className={css.sectionContainer}>
                <LanguagesField name="languagesSpoken" />
              </div>

              <div className={classNames(css.sectionContainer, css.lastSection)}>
                <SocialLinksField name="socialLinks" />
              </div>
              {submitError}
              {(() => {
                const loc = values.profileLocation;
                const hasSearch = !!loc?.search;
                const hasSelectedPlace = !!loc?.selectedPlace;
                const locationIncomplete = hasSearch && !hasSelectedPlace;
                return (
                  <Button
                    className={css.submitButton}
                    type="submit"
                    inProgress={submitInProgress}
                    disabled={submitInProgress || invalid || uploadInProgress || locationIncomplete}
                    ready={pristineSinceLastSubmit}
                  >
                    <FormattedMessage id="ProfileSettingsForm.saveChanges" />
                  </Button>
                );
              })()}
            </Form>
          );
        }}
      />
    );
  }
}

const ProfileSettingsForm = compose(injectIntl)(ProfileSettingsFormComponent);

ProfileSettingsForm.displayName = 'ProfileSettingsForm';

export default ProfileSettingsForm;
