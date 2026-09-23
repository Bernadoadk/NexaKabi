import { formatMoney } from '@nexakabi/utils';

/** Les champs d'une politique qui disent ce qu'elle prend. */
export interface PolicyRates {
  percentageBps: number;
  fixedAmountPerTicket: number;
  minFeePerOrder: number | null;
  maxFeePerOrder: number | null;
  buyerSharePercent: number;
  appliesToFreeTickets: boolean;
  payoutFeeBps: number;
  payoutFeeMax: number;
  minPayoutAmount: number;
}

/** 500 → « 5 % », 250 → « 2,5 % ». */
export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
}

/** Ce que prend la commission sur une vente, en une phrase. */
export function describeCommission(policy: PolicyRates): string {
  const parts = [formatBps(policy.percentageBps)];

  if (policy.fixedAmountPerTicket > 0) {
    parts.push(`+ ${formatMoney(policy.fixedAmountPerTicket)} par billet`);
  }
  if (policy.minFeePerOrder !== null && policy.minFeePerOrder > 0) {
    parts.push(`plancher ${formatMoney(policy.minFeePerOrder)} par commande`);
  }
  if (policy.maxFeePerOrder !== null) {
    parts.push(`plafond ${formatMoney(policy.maxFeePerOrder)}`);
  }

  const share =
    policy.buyerSharePercent === 100
      ? 'ajoutée au prix payé par l’acheteur'
      : policy.buyerSharePercent === 0
        ? 'prélevée sur l’organisateur'
        : `${policy.buyerSharePercent} % pour l’acheteur, le reste pour l’organisateur`;

  return `${parts.join(' · ')} — ${share}${policy.appliesToFreeTickets ? ', billets gratuits compris' : ''}`;
}

/** Ce que coûte un retrait, en une phrase. */
export function describePayout(policy: PolicyRates): string {
  return `Retrait : ${formatBps(policy.payoutFeeBps)} plafonné à ${formatMoney(policy.payoutFeeMax)}, minimum ${formatMoney(policy.minPayoutAmount)}`;
}
