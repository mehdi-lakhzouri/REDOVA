'use client';

import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { ImagePlus, Image as ImageIcon, RefreshCw, Trash2 } from 'lucide-react';
import { AVATAR_ACCEPT_ATTRIBUTE, validateAvatarFile } from '@/lib/avatar/avatar-policy';
import { cn } from '@/lib/utils';
import styles from './avatar-picker.module.css';

type AvatarPickerProps = {
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  error?: string;
  className?: string;
};

/** Optional profile picture: click, keyboard or drag-and-drop, validated before it is kept. */
export function AvatarPicker({ value, onChange, disabled, error, className }: AvatarPickerProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Object URLs are created on selection and revoked on replace, remove and unmount.
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  useEffect(() => () => revoke(previewRef.current), []);
  const previewUrl = preview && preview.file === value ? preview.url : null;
  const message = localError ?? error;

  function revoke(current: { url: string } | null) {
    if (current) URL.revokeObjectURL(current.url);
  }

  function accept(file: File | undefined) {
    if (!file) return;
    const problem = validateAvatarFile(file);
    setLocalError(problem);
    if (problem) return;
    revoke(preview);
    setPreview({ file, url: URL.createObjectURL(file) });
    onChange(file);
  }

  function browse() {
    if (!disabled) inputRef.current?.click();
  }

  function remove() {
    revoke(preview);
    setPreview(null);
    setLocalError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) accept(event.dataTransfer.files[0]);
  }

  return (
    <div className={className}>
      <div
        className={cn(styles.zone, dragging && styles.dragging, message && styles.invalid)}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        data-disabled={disabled || undefined}
      >
        <button
          type="button"
          className={styles.tile}
          onClick={browse}
          disabled={disabled}
          aria-describedby={`${id}-hint${message ? ` ${id}-error` : ''}`}
          aria-label={value ? 'Change profile picture' : 'Add a profile picture'}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimizable asset
            <img src={previewUrl} alt="" className={styles.preview} />
          ) : (
            <ImagePlus aria-hidden className={styles.tileIcon} strokeWidth={1.6} />
          )}
        </button>
        <div className={styles.copy}>
          <p className={styles.title}>{value ? 'Profile picture' : 'Add a profile picture'}</p>
          {value ? (
            <div className={styles.actions}>
              <span className={styles.filename}>{value.name}</span>
              <button type="button" onClick={browse} disabled={disabled}>
                <RefreshCw aria-hidden /> Replace
              </button>
              <button type="button" onClick={remove} disabled={disabled}>
                <Trash2 aria-hidden /> Remove
              </button>
            </div>
          ) : (
            <p className={styles.description}>Drag and drop an image here, or click to browse</p>
          )}
          <p id={`${id}-hint`} className={styles.meta}>
            <ImageIcon aria-hidden />
            JPG, PNG or WebP · Max 5 MB · Recommended: 512 × 512
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          disabled={disabled}
          onChange={(event) => accept(event.target.files?.[0])}
        />
      </div>
      {message && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
