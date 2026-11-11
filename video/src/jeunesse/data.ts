import { jeunesse } from './config';
import type { FriendId } from './config.types';

/** La bande, dans l'ordre des billets : Aïcha (l'acheteuse), puis ses amis. */
export const BAND: FriendId[] = ['aicha', 'koffi', 'sena', 'yann'];

/** Les amis qui reçoivent leur billet par lien. */
export const RECIPIENTS: Array<Exclude<FriendId, 'aicha'>> = ['koffi', 'sena', 'yann'];

/** Référence du billet n° `index` (0 = le premier) de la commande. */
export const ticketReference = (index: number) =>
  `${jeunesse.data.orderReference}-${String(index + 1).padStart(2, '0')}`;

/** Les billets émis : un par membre de la bande, au nom de chacun. */
export const bandTickets = () =>
  BAND.slice(0, jeunesse.data.quantity).map((id, index) => ({
    name: jeunesse.friends[id].fullName,
    reference: ticketReference(index),
  }));
