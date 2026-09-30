import React from 'react';
import { config } from '../config';
import { InkBackground } from '../components/motion/Backgrounds';
import { Cursor, pressAt } from '../components/motion/Cursor';
import { Eyebrow, KineticText } from '../components/motion/KineticText';
import { PaymentLogo } from '../components/ui/Basics';
import { inOut, keyframes, ramp, SPRINGS, sp } from '../lib/anim';
import { useTime } from '../lib/time';
import { ConfirmationScreen } from '../screens/ConfirmationScreen';
import { EventScreen, TicketSheet } from '../screens/EventScreen';
import { PaymentScreen } from '../screens/PaymentScreen';
import { BeatStack, PhoneRig, Scene, ScreenSwap, TextColumn, useStage } from './common';

const CHECKOUT_DESIGN = 8.5;

const T = {
  buyClick: 20,
  sheetOpen: 23,
  plus1: 42,
  plus2: 54,
  continueClick: 86,
  toPayment: 94,
  mtnClick: 132,
  payClick: 160,
  toConfirmation: 176,
  confirmationAppear: 182,
};

/** Cibles du curseur, en pixels de l'écran du téléphone. */
const TARGET = {
  buy: { x: 252, y: 709 },
  plus1: { x: 322, y: 496 },
  plus2: { x: 322, y: 360 },
  continue: { x: 180, y: 708 },
  mtn: { x: 180, y: 317 },
  pay: { x: 180, y: 511 },
};

/**
 * 4 · Réserver et payer : page de l'événement → feuille « Billets » (frais
 * affichés dès la sélection) → paiement MTN MoMo → confirmation.
 */
export const S4Checkout: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={CHECKOUT_DESIGN} durationInFrames={durationInFrames}>
    <InkBackground>
      <Phone />
      <Texts />
    </InkBackground>
  </Scene>
);

const Texts: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const scene = config.scenes.checkout;
  const align = stage.portrait ? 'center' : 'left';
  const width = stage.portrait ? 940 : 700;
  const logos = inOut(time, 96, 110, 160, 170);

  return (
    <TextColumn>
      <Eyebrow text={scene.eyebrow} start={2} align={align} />
      <BeatStack align={align}>
        <KineticText
          text={scene.beats[0]}
          start={6}
          exit={80}
          size={stage.titleSize}
          align={align}
          maxWidth={width}
        />
        <KineticText
          text={scene.beats[1]}
          start={88}
          exit={170}
          size={stage.titleSize}
          align={align}
          maxWidth={width}
        />
        <KineticText
          text={scene.beats[2]}
          start={180}
          size={stage.titleSize}
          align={align}
          maxWidth={width}
        />
      </BeatStack>
      <div style={{ display: 'flex', gap: 22, opacity: logos, height: stage.portrait ? 88 : 96 }}>
        {(['mtn', 'moov', 'card'] as const).map((logo, index) => {
          const pop = sp(time, 98 + index * 4, SPRINGS.pop);
          return (
            <PaymentLogo
              key={logo}
              logo={logo}
              size="xl"
              style={{
                transform: `scale(${pop}) rotate(${(1 - pop) * -12}deg)`,
                boxShadow: '0 20px 40px -18px rgba(4,3,12,0.8)',
              }}
            />
          );
        })}
      </div>
    </TextColumn>
  );
};

const Phone: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const base = stage.phone.scale;

  // Feuille des billets
  const open = sp(time, T.sheetOpen, SPRINGS.smooth);
  const quantity = time < T.plus1 ? 0 : time < T.plus2 ? 1 : 2;
  const lastClick = time < T.plus2 ? T.plus1 : T.plus2;
  const amountProgress = ramp(time, lastClick, lastClick + 10);

  // Paiement
  const scroll = keyframes(time, [
    { at: 104, value: 0 },
    { at: 124, value: 330 },
    { at: 136, value: 330 },
    { at: 152, value: 520 },
  ]);
  const steps = ramp(time, T.toPayment + 4, T.toPayment + 16);

  // Caméra : zoom sur le total (A), sur les moyens de paiement (B), puis
  // léger rapprochement sur la confirmation (C).
  const zoomA = keyframes(time, [
    { at: 58, value: 0 },
    { at: 70, value: 1 },
    { at: 80, value: 1 },
    { at: 90, value: 0 },
  ]);
  const zoomB = keyframes(time, [
    { at: 112, value: 0 },
    { at: 124, value: 1 },
    { at: 148, value: 1 },
    { at: 160, value: 0 },
  ]);
  const zoomC = keyframes(time, [
    { at: 188, value: 0 },
    { at: 212, value: 1 },
  ]);
  const boost = stage.portrait ? 0.25 : 0.5;
  const scale = base * (1 + (zoomA + zoomB) * boost + zoomC * 0.1);
  const fy = 380 + zoomA * (612 - 380) + zoomB * (330 - 380) + zoomC * (330 - 380);

  return (
    <PhoneRig
      x={stage.phone.x}
      y={stage.phone.y + (stage.portrait ? zoomA * 230 : 0)}
      scale={scale}
      fx={180}
      fy={fy}
    >
      <ScreenSwap
        at={T.toPayment}
        from={
          <EventScreen buyPress={pressAt(time, T.buyClick)}>
            {time >= T.sheetOpen ? (
              <TicketSheet
                open={open}
                quantity={quantity}
                previousQuantity={Math.max(0, quantity - 1)}
                amountProgress={amountProgress}
                plusPress={Math.max(pressAt(time, T.plus1), pressAt(time, T.plus2))}
                continuePress={pressAt(time, T.continueClick)}
                continueLoading={time >= T.continueClick + 2}
              />
            ) : null}
          </EventScreen>
        }
        to={
          <ScreenSwap
            at={T.toConfirmation}
            duration={14}
            direction="up"
            from={
              <PaymentScreen
                scroll={scroll}
                steps={steps}
                selected={time >= T.mtnClick ? 'mtn' : null}
                selectPress={pressAt(time, T.mtnClick)}
                payPress={pressAt(time, T.payClick)}
                paying={time >= T.payClick + 2}
              />
            }
            to={
              <ConfirmationScreen
                appear={T.confirmationAppear}
                scroll={keyframes(time, [
                  { at: 228, value: 0 },
                  { at: 250, value: 60 },
                ])}
              />
            }
          />
        }
      />

      <Cursor
        appear={6}
        disappear={92}
        clicks={[T.buyClick, T.plus1, T.plus2, T.continueClick]}
        path={[
          { at: 6, value: { x: 270, y: 590 } },
          { at: 18, value: TARGET.buy },
          { at: 30, value: { x: 300, y: 600 } },
          { at: 40, value: TARGET.plus1 },
          { at: 52, value: TARGET.plus2 },
          { at: 66, value: { x: 348, y: 742 } },
          { at: 84, value: TARGET.continue },
          { at: 92, value: { x: 230, y: 640 } },
        ]}
      />
      <Cursor
        appear={116}
        disappear={172}
        clicks={[T.mtnClick, T.payClick]}
        path={[
          { at: 116, value: { x: 300, y: 540 } },
          { at: 130, value: TARGET.mtn },
          { at: 144, value: { x: 262, y: 430 } },
          { at: 158, value: TARGET.pay },
          { at: 172, value: { x: 240, y: 600 } },
        ]}
      />
    </PhoneRig>
  );
};
