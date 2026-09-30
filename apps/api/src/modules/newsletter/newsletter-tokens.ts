import { randomBytes } from 'node:crypto';

/**
 * Jeton des liens de confirmation et de désabonnement : 256 bits aléatoires,
 * en base64url (43 caractères) — impossible à deviner, sûr dans une URL.
 */
export function generateNewsletterToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Adresse masquée : « a•••@gmail.com ».
 *
 * Un lien de désabonnement peut avoir été transféré avec l'e-mail : la page
 * qu'il ouvre confirme de quelle adresse il s'agit sans l'afficher en entier.
 */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const visible = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${visible}${'•'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}
