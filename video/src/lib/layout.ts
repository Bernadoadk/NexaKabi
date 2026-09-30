import { useVideoConfig } from 'remotion';

/** Le format en cours : 16:9 (paysage) ou 9:16 (portrait). */
export function useFormat() {
  const { width, height } = useVideoConfig();
  return { portrait: height > width, width, height };
}

/** Assemble des classes en ignorant les valeurs vides. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
