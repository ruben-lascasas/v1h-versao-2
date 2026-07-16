import React, { Component } from 'react';
import { compose } from 'redux';
import { Form as FinalForm } from 'react-final-form';
import classNames from 'classnames';

import { FormattedMessage, injectIntl, intlShape } from '../../../util/reactIntl';
import { propTypes } from '../../../util/types';

import { Form, FieldTextInput, PrimaryButton } from '../../../components';

import css from './SendMessageForm.module.css';

const BLUR_TIMEOUT_MS = 100;
const MAX_MESSAGE_LENGTH = 3000;

const IconSendMessage = () => {
  return (
    <svg
      className={css.sendIcon}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      xmlns="http://www.w3.org/2000/svg"
      role="none"
    >
      <g className={css.strokeMatter} fill="none" fillRule="evenodd" strokeLinejoin="round">
        <path d="M12.91 1L0 7.003l5.052 2.212z" />
        <path d="M10.75 11.686L5.042 9.222l7.928-8.198z" />
        <path d="M5.417 8.583v4.695l2.273-2.852" />
      </g>
    </svg>
  );
};

/**
 * Send message form
 *
 * @component
 * @param {Object} props - The props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that extends the default class for the root element
 * @param {string} props.formId - The form id
 * @param {boolean} props.inProgress - Whether the form is in progress
 * @param {string} props.messagePlaceholder - The message placeholder
 * @param {Function} props.onSubmit - The on submit function
 * @param {Function} props.onFocus - The on focus function
 * @param {Function} props.onBlur - The on blur function
 * @param {propTypes.error} props.sendMessageError - The send message error
 * @param {intlShape} props.intl - The intl
 * @returns {JSX.Element} The SendMessageForm component
 */
const MAX_PENDING_IMAGES = 6;

class SendMessageFormComponent extends Component {
  constructor(props) {
    super(props);
    this.state = { pendingFiles: [], pendingPreviews: [], pendingError: null };
    this.handleFocus = this.handleFocus.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handleImageButtonClick = this.handleImageButtonClick.bind(this);
    this.handleImageChange = this.handleImageChange.bind(this);
    this.handleRemoveImage = this.handleRemoveImage.bind(this);
    this.clearPendingImages = this.clearPendingImages.bind(this);
    this.blurTimeoutId = null;
    this.fileInputRef = React.createRef();
  }

  componentWillUnmount() {
    this.state.pendingPreviews.forEach(url => URL.revokeObjectURL(url));
  }

  handleImageButtonClick() {
    if (this.fileInputRef.current) {
      this.fileInputRef.current.click();
    }
  }

  handleImageChange(e) {
    const incoming = Array.from(e.target.files || []);
    e.target.value = '';
    if (incoming.length === 0) return;
    const { pendingFiles, pendingPreviews } = this.state;
    const remaining = MAX_PENDING_IMAGES - pendingFiles.length;
    if (remaining <= 0) {
      this.setState({
        pendingError: `Só podes enviar até ${MAX_PENDING_IMAGES} imagens de cada vez.`,
      });
      return;
    }
    const wouldExceed = incoming.length > remaining;
    const accepted = incoming.slice(0, remaining);
    const newPreviews = accepted.map(f => URL.createObjectURL(f));
    this.setState({
      pendingFiles: [...pendingFiles, ...accepted],
      pendingPreviews: [...pendingPreviews, ...newPreviews],
      pendingError: wouldExceed ? `Só podes enviar até ${MAX_PENDING_IMAGES} imagens de cada vez.` : null,
    });
  }

  handleRemoveImage(idx) {
    const { pendingFiles, pendingPreviews } = this.state;
    const url = pendingPreviews[idx];
    if (url) URL.revokeObjectURL(url);
    this.setState({
      pendingFiles: pendingFiles.filter((_, i) => i !== idx),
      pendingPreviews: pendingPreviews.filter((_, i) => i !== idx),
      pendingError: null,
    });
  }

  clearPendingImages() {
    this.state.pendingPreviews.forEach(url => URL.revokeObjectURL(url));
    this.setState({ pendingFiles: [], pendingPreviews: [], pendingError: null });
  }

  handleFocus() {
    if (this.props.onFocus) {
      this.props.onFocus();
    }
    window.clearTimeout(this.blurTimeoutId);
  }

  handleBlur() {
    // We only trigger a blur if another focus event doesn't come
    // within a timeout. This enables keeping the focus synced when
    // focus is switched between the message area and the submit
    // button.
    this.blurTimeoutId = window.setTimeout(() => {
      if (this.props.onBlur) {
        this.props.onBlur();
      }
    }, BLUR_TIMEOUT_MS);
  }

  render() {
    return (
      <FinalForm
        {...this.props}
        render={formRenderProps => {
          const {
            rootClassName,
            className,
            messagePlaceholder,
            handleSubmit,
            inProgress = false,
            sendMessageError,
            invalid,
            form,
            formId,
          } = formRenderProps;

          const classes = classNames(rootClassName || css.root, className);
          const submitInProgress = inProgress;
          const submitDisabled = invalid || submitInProgress;
          const showImageButton = typeof this.props.onSendImage === 'function';
          const { pendingFiles, pendingPreviews, pendingError } = this.state;
          const hasPendingImages = pendingFiles.length > 0;
          const reachedMax = pendingFiles.length >= MAX_PENDING_IMAGES;
          const currentMessage = form.getState().values.message || '';
          const charCount = currentMessage.length;
          const charsLeft = MAX_MESSAGE_LENGTH - charCount;
          const showCounter = charCount >= MAX_MESSAGE_LENGTH - 200;
          const overLimit = charCount > MAX_MESSAGE_LENGTH;
          const handleFormSubmit = e => {
            if (hasPendingImages) {
              e.preventDefault();
              const caption = (form.getState().values.message || '').trim();
              const filesToSend = pendingFiles;
              this.props.onSendImage(filesToSend, caption);
              this.clearPendingImages();
              form.reset();
              return;
            }
            handleSubmit(e, form);
          };
          return (
            <Form className={classes} onSubmit={handleFormSubmit}>
              {sendMessageError ? (
                <p className={css.error}>
                  <FormattedMessage id="SendMessageForm.sendFailed" />
                </p>
              ) : null}
              {pendingError ? (
                <p className={css.error}>{pendingError}</p>
              ) : null}
              {hasPendingImages ? (
                <div className={css.imagePreviewRow}>
                  {pendingPreviews.map((url, idx) => (
                    <div key={url} className={css.imagePreview}>
                      <img src={url} alt={`preview ${idx + 1}`} className={css.imagePreviewImg} />
                      <button
                        type="button"
                        className={css.imagePreviewRemove}
                        onClick={() => this.handleRemoveImage(idx)}
                        aria-label="Remover imagem"
                        title="Remover"
                        disabled={submitInProgress}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18 6L6 18M6 6l12 12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className={css.chatBar}>
                {showImageButton ? (
                  <>
                    <input
                      ref={this.fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className={css.hiddenFileInput}
                      onChange={this.handleImageChange}
                    />
                    <button
                      type="button"
                      className={css.imageButton}
                      onClick={this.handleImageButtonClick}
                      disabled={submitInProgress}
                      aria-label="Enviar imagem"
                      title="Enviar imagem"
                    >
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                        <circle cx="8.5" cy="10.5" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.8"/>
                        <path d="M3 17l5-5 4 4 4-4 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </>
                ) : null}
                <FieldTextInput
                  inputRootClass={css.textarea}
                  type="textarea"
                  id={formId ? `${formId}.message` : 'message'}
                  name="message"
                  maxLength={MAX_MESSAGE_LENGTH}
                  placeholder={
                    hasPendingImages ? 'Adicionar legenda (opcional)…' : messagePlaceholder
                  }
                  onFocus={this.handleFocus}
                  onBlur={this.handleBlur}
                />
                <button
                  type="submit"
                  className={css.sendButton}
                  disabled={submitInProgress || overLimit}
                  onFocus={this.handleFocus}
                  onBlur={this.handleBlur}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </Form>
          );
        }}
      />
    );
  }
}

const SendMessageForm = compose(injectIntl)(SendMessageFormComponent);

SendMessageForm.displayName = 'SendMessageForm';

export default SendMessageForm;
