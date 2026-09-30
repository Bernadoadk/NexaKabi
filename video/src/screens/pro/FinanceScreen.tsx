import React from 'react';
import { ChevronDown } from 'lucide-react';
import { config } from '../../config';
import { Button } from '../../components/ui/Button';
import { Money } from '../../components/ui/Money';
import { Stat } from '../../components/ui/Stat';
import { ramp } from '../../lib/anim';
import { formatMoney } from '../../lib/format';
import { cn } from '../../lib/layout';
import { useTime } from '../../lib/time';
import { ConsoleShell, FieldMock, type ConsoleLayout } from './Console';

/**
 * Finances de l'organisation (`pro/finances`, écran O11) : solde disponible,
 * d'où vient le montant, puis la demande de retrait vers Mobile Money.
 */
export const FinanceScreen: React.FC<{
  layout: ConsoleLayout;
  start: number;
  scroll?: number;
  payPress?: number;
  paying?: boolean;
}> = ({ layout, start, scroll = 0, payPress = 0, paying = false }) => {
  const time = useTime();
  const count = ramp(time, start, start + 34);
  const finance = config.data.finance;
  const platformFees = finance.grossSales - (finance.available + finance.pending) - providerFees();

  return (
    <ConsoleShell layout={layout} section="Finances" scroll={scroll}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="m-0 font-display text-h1 font-bold tracking-[-0.02em]">Finances</h1>
          <p className="m-0 text-body-s text-text-2">
            Chaque montant est adossé à des écritures détaillées, consultables ci-dessous.
          </p>
        </header>

        <div className="flex flex-col gap-5 rounded-panel border border-border bg-surface p-6">
          <div className="flex flex-col gap-1">
            <p className="eyebrow m-0 text-text-3">Solde disponible</p>
            <Money amount={Math.round(finance.available * count)} size="large" />
          </div>
          <div className={cn('grid gap-4', layout === 'desktop' ? 'grid-cols-3' : 'grid-cols-1')}>
            <Stat
              label="En attente de déblocage"
              value={<Money amount={Math.round(finance.pending * count)} size="medium" />}
            />
            <Stat
              label="Total encaissé"
              value={<Money amount={Math.round(finance.grossSales * count)} size="medium" />}
            />
            <Stat label="Déjà retiré" value={<Money amount={finance.paidOut} size="medium" />} />
          </div>
        </div>

        <div className="overflow-hidden rounded-panel border border-border bg-surface">
          <div className="border-b border-border-subtle px-5 py-3">
            <h2 className="m-0 text-body font-bold">D’où vient ce montant</h2>
          </div>
          <dl className="m-0 flex flex-col gap-2 px-5 py-4">
            <Line label="Encaissé auprès des participants">
              <Money amount={finance.grossSales} size="small" />
            </Line>
            <Line label={`Commission ${config.brand.name}`}>
              <Money amount={-platformFees} size="small" />
            </Line>
            <Line label="Frais opérateur Mobile Money">
              <Money amount={-providerFees()} size="small" />
            </Line>
            <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
              <dt className="text-body font-bold">Solde total</dt>
              <dd className="m-0">
                <Money amount={finance.available + finance.pending} size="default" />
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-panel border border-border bg-surface p-6">
          <div className="flex flex-col gap-4">
            <h2 className="m-0 text-h3 font-bold">Demander un retrait</h2>
            <FieldMock
              label="Compte de réception"
              value={
                <span className="flex items-center justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="font-semibold">{finance.account.method}</span>
                    <span className="text-micro text-text-3">
                      {finance.account.masked} · {config.data.organizer.name}
                    </span>
                  </span>
                  <ChevronDown className="size-4 text-text-3" />
                </span>
              }
            />
            <div className="flex flex-col gap-1.5">
              <FieldMock
                label="Montant"
                value={formatMoney(finance.available).replace(/ FCFA$/, '')}
                suffix="FCFA"
              />
              <span className="text-micro text-text-3">
                Disponible : {formatMoney(finance.available)}
              </span>
            </div>
            <dl className="m-0 flex flex-col gap-2 rounded-card bg-surface-alt px-4 py-3">
              <Line label="Montant demandé">
                <Money amount={finance.available} size="small" />
              </Line>
              <Line label="Frais de retrait">
                <Money amount={-finance.payoutFee} size="small" />
              </Line>
              <div className="mt-1 flex items-baseline justify-between border-t border-border-subtle pt-2">
                <dt className="text-body font-bold">Tu recevras</dt>
                <dd className="m-0">
                  <Money amount={finance.available - finance.payoutFee} size="default" />
                </dd>
              </div>
            </dl>
            <Button variant="ink" size="primary" block press={payPress} loading={paying}>
              Demander le retrait
            </Button>
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
};

/** Frais opérateur : ce qui sépare le total encaissé, hors commission, du solde. */
function providerFees(): number {
  const { grossSales, available, pending } = config.data.finance;
  const commission = Math.round((grossSales / 1.05) * 0.05);
  return grossSales - commission - (available + pending);
}

const Line: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-body-s text-text-2">{label}</dt>
    <dd className="m-0">{children}</dd>
  </div>
);
