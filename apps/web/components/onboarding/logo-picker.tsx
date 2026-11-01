'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, X } from 'lucide-react';
import { ORGANIZATION_LOGO_TYPES } from '@redova/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logoProblem, type LogoSelection } from '@/lib/onboarding/policy';
import styles from './onboarding.module.css';

export function LogoPicker({
  value,
  onChange,
  existingLogo,
  disabled,
  error,
}: {
  value: LogoSelection;
  onChange: (value: LogoSelection) => void;
  existingLogo?: string | null;
  disabled: boolean;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const previewRef = useRef<{ file: File; url: string } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const file = value.kind === 'file' ? value.file : null;
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current.url);
    },
    [],
  );
  function clearPreview() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current.url);
    previewRef.current = null;
    setPreview(null);
  }
  function choose(file?: File) {
    if (!file || disabled) return;
    const next: LogoSelection = { kind: 'file', file };
    const problem = logoProblem(next);
    setLocalError(problem);
    if (!problem) {
      clearPreview();
      const nextPreview = { file, url: URL.createObjectURL(file) };
      previewRef.current = nextPreview;
      setPreview(nextPreview);
      onChange(next);
    }
  }
  const displayed = file
    ? preview?.file === file
      ? preview.url
      : null
    : value.kind === 'keep'
      ? existingLogo
      : null;
  const src = displayed?.includes('/api/v1/organizations/')
    ? new URL(displayed, 'http://localhost').pathname
    : displayed;
  return (
    <div className={styles.logoPicker}>
      <input
        ref={input}
        type="file"
        accept={ORGANIZATION_LOGO_TYPES.join(',')}
        hidden
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <div
        className={styles.dropzone}
        data-drag-disabled={disabled}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          choose(event.dataTransfer.files[0]);
        }}
      >
        {displayed && src ? (
          <Image
            src={src}
            alt="Selected organization logo"
            width={64}
            height={64}
            unoptimized
            className={styles.logoPreview}
          />
        ) : (
          <ImagePlus className={styles.uploadIcon} aria-hidden />
        )}
        <div>
          <button
            type="button"
            disabled={disabled}
            className={styles.browseButton}
            onClick={() => input.current?.click()}
          >
            {file
              ? file.name
              : displayed
                ? 'Replace your organization logo'
                : 'Drag & drop your logo here, or click to browse'}
          </button>
          <p>
            PNG, JPG or WebP · Max 2 MB ·{' '}
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setLocalError(null);
                clearPreview();
                onChange({ kind: 'url', url: '' });
              }}
            >
              Use HTTPS URL
            </button>
          </p>
        </div>
        {(file || displayed || value.kind === 'url') && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={styles.removeLogo}
            disabled={disabled}
            aria-label="Remove organization logo"
            onClick={() => {
              setLocalError(null);
              clearPreview();
              onChange({ kind: 'none' });
            }}
          >
            <X aria-hidden />
          </Button>
        )}
      </div>
      {value.kind === 'url' && (
        <Input
          aria-label="Organization logo HTTPS URL"
          className={styles.input}
          type="url"
          value={value.url}
          placeholder="https://example.com/logo.png"
          maxLength={2048}
          disabled={disabled}
          onChange={(event) => onChange({ kind: 'url', url: event.target.value })}
        />
      )}
      {(localError || error) && (
        <p className={styles.error} role="alert">
          {localError || error}
        </p>
      )}
    </div>
  );
}
