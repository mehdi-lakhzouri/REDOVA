import {
  checkMediaFile,
  formatMediaLimit,
  MEDIA_POLICIES,
  mediaAcceptAttribute,
  type MediaKind,
} from '@redova/contracts';

/** Upload rules come from `@redova/contracts`, the same source the API enforces. */
const formatList = (kind: MediaKind) => {
  const names = [
    ...new Set(MEDIA_POLICIES[kind].extensions.map((e) => (e === 'jpeg' ? 'jpg' : e))),
  ];
  const labels = names.map((name) => (name === 'webp' ? 'WebP' : name.toUpperCase()));
  return `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}`;
};

export const mediaAccept = (kind: MediaKind): string => mediaAcceptAttribute(kind);

/** "JPG, PNG or WebP · Max 5 MB" */
export const mediaRequirements = (kind: MediaKind): string =>
  `${formatList(kind)} · Max ${formatMediaLimit(MEDIA_POLICIES[kind].maxBytes)}`;

/** Actionable message, or `null` when the file can be sent to the API. */
export function mediaFileProblem(kind: MediaKind, file: File): string | null {
  switch (checkMediaFile(kind, file)) {
    case 'type':
      return `Use a ${formatList(kind)} image.`;
    case 'size':
      return `The image is larger than ${formatMediaLimit(MEDIA_POLICIES[kind].maxBytes)}.`;
    case 'empty':
      return 'The image is empty. Choose another file.';
    default:
      return null;
  }
}
