/** One entrance timeline for the hero and sign-in card; seconds, deliberately without loops. */
export const authMotion = {
  ease: [0.22, 1, 0.36, 1] as const,
  revealDuration: 0.48,
  card: { delay: 0.12, duration: 0.6 },
  eyebrow: 0.08,
  typing: { delay: 0.28, character: 0.034, linePause: 0.14 },
  description: 0.72,
  features: { delay: 0.9, stagger: 0.12 },
  fields: { delay: 0.32, stagger: 0.08 },
  footer: 0.72,
};
