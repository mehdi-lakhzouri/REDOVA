'use client';

import { motion, useReducedMotion } from 'motion/react';
import { authMotion } from './auth-motion';
import styles from './auth.module.css';

/** Characters stay in normal flow from the first render; only their opacity changes. */
export function TypewriterHeading({ id, lines }: { id: string; lines: readonly [string, string] }) {
  const reducedMotion = useReducedMotion();
  const secondLineDelay =
    authMotion.typing.delay +
    lines[0].length * authMotion.typing.character +
    authMotion.typing.linePause;
  const finish = secondLineDelay + lines[1].length * authMotion.typing.character;
  return (
    <h1 id={id} className={styles.heroTitle} data-auth-typewriter>
      <span className="sr-only">{lines.join(' ')}</span>
      {lines.map((line, lineIndex) => (
        <span
          key={line}
          aria-hidden="true"
          className={`${styles.typewriterLine} ${lineIndex === 1 ? styles.heroAccent : ''}`}
        >
          {Array.from(line).map((character, index) => (
            <motion.span
              key={`${index}-${character}`}
              data-auth-letter
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: 0,
                delay: reducedMotion
                  ? 0
                  : (lineIndex === 0 ? authMotion.typing.delay : secondLineDelay) +
                    index * authMotion.typing.character,
              }}
            >
              {character}
            </motion.span>
          ))}
          {lineIndex === 1 && (
            <motion.span
              data-auth-cursor
              className={styles.typewriterCaret}
              initial={{ opacity: 0 }}
              animate={{ opacity: reducedMotion ? 0 : [0, 1, 0, 1, 0] }}
              transition={{
                duration: reducedMotion ? 0 : 0.8,
                delay: reducedMotion ? 0 : finish,
                ease: 'linear',
              }}
            />
          )}
        </span>
      ))}
    </h1>
  );
}
