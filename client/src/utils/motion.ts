import type { Transition } from 'framer-motion';

/**
 * Springs, in Apple's two designer-facing terms: bounce (how much it
 * overshoots; 0 is critically damped) and duration (roughly how quickly it
 * reaches the target). A spring starts from wherever the element is on screen
 * and carries its velocity when retargeted, so anything can be interrupted and
 * reversed mid-flight without a jump.
 */

/** The default for everything: settles without overshoot. */
export const spring: Transition = { type: 'spring', bounce: 0, duration: 0.4 };

/** Small, quick changes — a chip, a toggle, a row settling. */
export const springSnappy: Transition = { type: 'spring', bounce: 0, duration: 0.28 };

/**
 * Only where a gesture carried momentum into the motion — a dragged row let go,
 * a sheet flicked. Overshoot on something that merely appeared feels wrong.
 */
export const springMomentum: Transition = { type: 'spring', bounce: 0.18, duration: 0.35 };
