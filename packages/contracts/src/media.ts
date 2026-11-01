import type { ErrorCode } from './errors';

/**
 * Upload policies shared by the API (enforcement) and the web app (early feedback). The API
 * additionally decodes every file: the MIME type and extension are only a first filter.
 */
export const MEDIA_FORMATS = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
} as const;

export type MediaMimeType = keyof typeof MEDIA_FORMATS;

export interface MediaPolicy {
  /** Upload limit in bytes, enforced before decoding. */
  maxBytes: number;
  mimeTypes: readonly MediaMimeType[];
  /** Lowercase file extensions without the dot, derived from `mimeTypes`. */
  extensions: readonly string[];
  /** Decompression bomb guard: width × height of the decoded source. */
  maxInputPixels: number;
  /** Every upload is re-encoded; source metadata (EXIF, GPS) is dropped. */
  output: {
    format: 'webp';
    width: number;
    height: number;
    /** `cover` crops to the exact box, `inside` keeps the aspect ratio. */
    fit: 'cover' | 'inside';
    quality: number;
  };
  errors: { invalid: ErrorCode; tooLarge: ErrorCode; notFound: ErrorCode };
}

const MiB = 1024 * 1024;
const RASTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const policy = (
  input: Omit<MediaPolicy, 'mimeTypes' | 'extensions'> & { mimeTypes: readonly MediaMimeType[] },
): MediaPolicy => ({
  ...input,
  extensions: input.mimeTypes.flatMap((type) => MEDIA_FORMATS[type]),
});

/** One entry per kind of stored image. Adding a kind starts here. */
export const MEDIA_POLICIES = {
  avatar: policy({
    maxBytes: 5 * MiB,
    mimeTypes: RASTER_TYPES,
    maxInputPixels: 16_000_000,
    output: { format: 'webp', width: 512, height: 512, fit: 'cover', quality: 80 },
    errors: {
      invalid: 'AVATAR_INVALID',
      tooLarge: 'AVATAR_TOO_LARGE',
      notFound: 'AVATAR_NOT_FOUND',
    },
  }),
  organizationLogo: policy({
    maxBytes: 2 * MiB,
    mimeTypes: RASTER_TYPES,
    maxInputPixels: 16_000_000,
    output: { format: 'webp', width: 512, height: 512, fit: 'inside', quality: 85 },
    errors: {
      invalid: 'ORG_LOGO_INVALID',
      tooLarge: 'ORG_LOGO_TOO_LARGE',
      notFound: 'ORG_LOGO_NOT_FOUND',
    },
  }),
} as const satisfies Record<string, MediaPolicy>;

export type MediaKind = keyof typeof MEDIA_POLICIES;
export const MEDIA_KINDS = Object.keys(MEDIA_POLICIES) as MediaKind[];

/** Value for an `<input type="file" accept>` attribute. */
export const mediaAcceptAttribute = (kind: MediaKind): string => {
  const { mimeTypes, extensions } = MEDIA_POLICIES[kind];
  return [...mimeTypes, ...extensions.map((extension) => `.${extension}`)].join(',');
};

/** Lowercase extension of a client file name, or `null` when it has none. */
export const fileExtension = (name: string): string | null => {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : null;
};

export type MediaRejection = 'type' | 'size' | 'empty';

/** Client-side pre-check mirroring the API filter. A file without extension is judged by type. */
export const checkMediaFile = (
  kind: MediaKind,
  file: { name: string; type: string; size: number },
): MediaRejection | null => {
  const { mimeTypes, extensions, maxBytes } = MEDIA_POLICIES[kind];
  const extension = fileExtension(file.name);
  if (!(mimeTypes as readonly string[]).includes(file.type)) return 'type';
  if (extension !== null && !extensions.includes(extension)) return 'type';
  if (file.size === 0) return 'empty';
  if (file.size > maxBytes) return 'size';
  return null;
};

/** "5 MB" style label for limits that are whole mebibytes. */
export const formatMediaLimit = (bytes: number): string => `${Math.round(bytes / MiB)} MB`;
