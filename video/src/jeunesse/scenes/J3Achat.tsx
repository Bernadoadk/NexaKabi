import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Sfx } from '../../components/audio/Sfx';
import { InkBackground } from '../../components/motion/Backgrounds';
import { Cursor, pressAt } from '../../components/motion/Cursor';
import { Eyebrow, KineticText } from '../../components/motion/KineticText';
import { PaymentLogo } from '../../components/ui/Basics';
import { EASE_IN, inOut, keyframes, ramp, SPRINGS, sp } from '../../lib/anim';
import { useTime } from '../../lib/time';
import { ConfirmationScreen } from '../../screens/ConfirmationScreen';
import { EventScreen, TicketSheet } from '../../screens/EventScreen';
import { PaymentScreen } from '../../screens/PaymentScreen';
import { BeatStack, PhoneRig, Scene, ScreenSwap, TextColumn, useStage } from '../../scenes/common';
import { ChatStack, EventLinkPreview, linkPreviewHeight, type StackItem } from '../components/Chat';
import { jeunesse } from '../config';
import { bandTickets } from '../data';

/**
 * Repères (images, temps de la scène), sur les temps de la musique
 * (16,36 images) : chaque réponse, chaque « + » et chaque paiement tombe
 * sur un temps.
 */
const T = {
  share: 6,
  replies: [22, 38, 55, 71],
  chatOut: 88,
  priceRing: 40,
  buyClick: 105,
  sheetOpen: 108,
  plus: [121, 137, 154, 170],
  continueClick: 203,
  toPayment: 210,
  logos: 214,
  mtnClick: 236,
  payClick: 252,
  toConfirmation: 258,
  confirmationAppear: 264,
};

/** Cibles du curseur, en pixels de l'écran (voir `S4Checkout.tsx`). */
const TARGET = {
  buy: { x: 252, y: 709 },
  /** Premier « + » ; ensuite le récapitulatif apparaît et la feuille grandit. */
  plusFirst: { x: 322, y: 496 },
  plus: { x: 322, y: 360 },
  continue: { x: 180, y: 708 },
  mtn: { x: 180, y: 317 },
  pay: { x: 180, y: 511 },
};

/**
 * 3 · La bande dit oui (« 5 000 ? Ça passe »), Aïcha prend quatre Pass
 * Standard : le total, frais compris, s'affiche dès le choix ; paiement
 * MTN MoMo ; « C'est confirmé ».
 */
export const J3Achat: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => (
  <Scene design={jeunesse.scenes.achat.seconds} durationInFrames={durationInFrames}>
    <InkBackground>
      <Phone />
      <Thread />
      <Texts />
    </InkBackground>
    <Sounds />
  </Scene>
);

const Sounds: React.FC = () => (
  <>
    <Sfx at={T.share} sound="send" volume={0.5} />
    {T.replies.map((at, index) => (
      <Sfx
        key={at}
        at={at + 1}
        sound={index === T.replies.length - 1 ? 'send' : 'message'}
        volume={0.45}
      />
    ))}
    <Sfx at={T.chatOut} sound="swish" volume={0.25} />
    <Sfx at={T.buyClick} sound="tap" />
    <Sfx at={T.sheetOpen} sound="swish" volume={0.3} />
    {T.plus.map((at) => (
      <Sfx key={at} at={at} sound="tap" />
    ))}
    <Sfx at={T.continueClick} sound="tap" />
    <Sfx at={T.toPayment} sound="swish" volume={0.35} />
    {[0, 1, 2].map((index) => (
      <Sfx key={index} at={T.logos + index * 4 + 1} sound="pop-high" volume={0.35} />
    ))}
    <Sfx at={T.mtnClick} sound="tap" />
    <Sfx at={T.payClick} sound="tap" />
    <Sfx at={T.toConfirmation} sound="swish" volume={0.35} />
    <Sfx at={T.confirmationAppear + 5} sound="ding" volume={0.75} />
  </>
);

/** La discussion reprend à côté du téléphone : la bande dit oui. */
const Thread: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const scene = jeunesse.scenes.achat;
  const size = stage.portrait ? 34 : 31;
  const items: StackItem[] = [
    {
      key: 'share',
      line: { text: scene.share },
      at: T.share,
      extra: { node: <EventLinkPreview size={size} />, height: linkPreviewHeight(size) },
    },
    ...scene.replies.map((line, index) => ({
      key: `r${index}`,
      line,
      at: T.replies[index],
    })),
  ];
  const out = ramp(time, T.chatOut, T.chatOut + 12, [0, 1], EASE_IN);
  if (out >= 1) return null;
  return (
    <AbsoluteFill style={{ opacity: 1 - out, transform: `translateY(${-out * 80}px)` }}>
      {stage.portrait ? (
        <div
          style={{
            position: 'absolute',
            inset: '0 0 auto 0',
            height: 700,
            background:
              'linear-gradient(to bottom, rgba(11, 9, 24, 0.94) 0%, rgba(11, 9, 24, 0.85) 75%, rgba(11, 9, 24, 0) 100%)',
          }}
        />
      ) : null}
      <ChatStack
        items={items}
        size={size}
        left={stage.portrait ? 70 : 150}
        width={stage.portrait ? 880 : 720}
        bottom={stage.portrait ? 640 : 930}
      />
    </AbsoluteFill>
  );
};

const Texts: React.FC = () => {
  const time = useTime();
  const stage = useStage();
  const scene = jeunesse.scenes.achat;
  const align = stage.portrait ? 'center' : 'left';
  const width = stage.portrait ? 940 : 700;
  const logos = inOut(time, T.logos - 2, T.logos + 12, 262, 272);
  if (time < T.chatOut + 6) return null;
  return (
    <TextColumn>
      <Eyebrow text={scene.eyebrow} start={T.chatOut + 8} align={align} />
      <BeatStack align={align}>
        <KineticText
          text={scene.beats[0]}
          start={T.chatOut + 12}
          exit={T.toPayment - 6}
          size={stage.titleSize}
          align={align}
          maxWidth={width}
        />
        <KineticText
          text={scene.beats[1]}
          start={T.toPayment + 2}
          size={stage.titleSize}
          align={align}
          maxWidth={width}
        />
      </BeatStack>
      <div style={{ display: 'flex', gap: 22, opacity: logos, height: stage.portrait ? 88 : 96 }}>
        {(['mtn', 'moov', 'card'] as const).map((logo, index) => {
          const pop = sp(time, T.logos + index * 4, SPRINGS.pop);
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
  const quantity = jeunesse.data.quantity;

  // Feuille des billets : quatre « + », un par temps.
  const open = sp(time, T.sheetOpen, SPRINGS.smooth);
  const count = T.plus.filter((at) => time >= at).length;
  const lastPlus = [...T.plus].reverse().find((at) => time >= at) ?? T.plus[0];
  const amountProgress = ramp(time, lastPlus, lastPlus + 8);
  const plusPress = Math.max(...T.plus.map((at) => pressAt(time, at)));

  // Paiement
  const scroll = keyframes(time, [
    { at: T.toPayment + 4, value: 0 },
    { at: T.toPayment + 18, value: 330 },
    { at: T.mtnClick + 4, value: 330 },
    { at: T.mtnClick + 14, value: 520 },
  ]);
  const steps = ramp(time, T.toPayment + 4, T.toPayment + 14);

  // Caméra : le prix de la barre d'achat (A), le total (B), les moyens de
  // paiement (C), la confirmation (D).
  const zoomA = keyframes(time, [
    { at: T.priceRing - 6, value: 0 },
    { at: T.priceRing + 6, value: 1 },
    { at: T.chatOut, value: 1 },
    { at: T.chatOut + 12, value: 0 },
  ]);
  const zoomB = keyframes(time, [
    { at: T.plus[3] + 4, value: 0 },
    { at: T.plus[3] + 16, value: 1 },
    { at: T.continueClick - 6, value: 1 },
    { at: T.continueClick + 4, value: 0 },
  ]);
  const zoomC = keyframes(time, [
    { at: T.toPayment + 12, value: 0 },
    { at: T.toPayment + 22, value: 1 },
    { at: T.payClick - 8, value: 1 },
    { at: T.payClick + 2, value: 0 },
  ]);
  const zoomD = keyframes(time, [
    { at: T.confirmationAppear, value: 0 },
    { at: T.confirmationAppear + 16, value: 1 },
  ]);
  const boost = stage.portrait ? 0.22 : 0.45;
  // En 9:16, la discussion est au-dessus du téléphone : pas de zoom sur le prix.
  const priceZoom = stage.portrait ? 0 : 0.6;
  const scale = base * (1 + (zoomA * priceZoom + zoomB + zoomC) * boost + zoomD * 0.06);
  const fy =
    380 +
    zoomA * priceZoom * ((700 - 380) / 0.6) +
    zoomB * (612 - 380) +
    zoomC * (330 - 380) +
    zoomD * (300 - 380);
  const fx = 180 + zoomA * priceZoom * ((110 - 180) / 0.6);

  // Le prix « 5 000 FCFA + 250 de frais » souligné quand Sèna répond.
  const ring = inOut(time, T.priceRing, T.priceRing + 8, T.chatOut - 4, T.chatOut + 4);

  return (
    <PhoneRig
      x={stage.phone.x}
      y={stage.phone.y + (stage.portrait ? zoomB * 230 : 0)}
      scale={scale}
      fx={fx}
      fy={fy}
      clock={jeunesse.data.clockSearch}
    >
      <ScreenSwap
        at={T.toPayment}
        from={
          <EventScreen buyPress={pressAt(time, T.buyClick)}>
            {time >= T.sheetOpen ? (
              <TicketSheet
                open={open}
                quantity={count}
                previousQuantity={Math.max(0, count - 1)}
                amountProgress={amountProgress}
                plusPress={plusPress}
                continuePress={pressAt(time, T.continueClick)}
                continueLoading={time >= T.continueClick + 2}
              />
            ) : null}
          </EventScreen>
        }
        to={
          <ScreenSwap
            at={T.toConfirmation}
            duration={12}
            direction="up"
            from={
              <PaymentScreen
                scroll={scroll}
                steps={steps}
                quantity={quantity}
                orderReference={jeunesse.data.orderReference}
                selected={time >= T.mtnClick ? 'mtn' : null}
                selectPress={pressAt(time, T.mtnClick)}
                payPress={pressAt(time, T.payClick)}
                paying={time >= T.payClick + 2}
              />
            }
            to={
              <ConfirmationScreen
                appear={T.confirmationAppear}
                tickets={bandTickets()}
                orderReference={jeunesse.data.orderReference}
              />
            }
          />
        }
      />

      {ring > 0 ? (
        <div
          className="absolute rounded-[12px] border-[3px] border-coral"
          style={{
            // Autour de « 5 000 FCFA + 250 de frais », sans toucher au bouton.
            left: 8,
            top: 686,
            width: 162,
            height: 48,
            zIndex: 45,
            opacity: ring,
            transform: `scale(${1 + (1 - ring) * 0.15})`,
          }}
        />
      ) : null}

      <Cursor
        appear={T.chatOut + 2}
        disappear={T.toPayment - 2}
        clicks={[T.buyClick, ...T.plus, T.continueClick]}
        path={[
          { at: T.chatOut + 2, value: { x: 280, y: 600 } },
          { at: T.buyClick - 2, value: TARGET.buy },
          { at: T.plus[0] - 3, value: TARGET.plusFirst },
          { at: T.plus[1] - 3, value: TARGET.plus },
          { at: T.plus[3] + 6, value: TARGET.plus },
          { at: T.continueClick - 2, value: TARGET.continue },
          { at: T.toPayment, value: { x: 230, y: 640 } },
        ]}
      />
      <Cursor
        appear={T.toPayment + 10}
        disappear={T.toConfirmation + 4}
        clicks={[T.mtnClick, T.payClick]}
        path={[
          { at: T.toPayment + 10, value: { x: 300, y: 540 } },
          { at: T.mtnClick - 2, value: TARGET.mtn },
          { at: T.mtnClick + 6, value: { x: 262, y: 430 } },
          { at: T.payClick - 2, value: TARGET.pay },
          { at: T.toConfirmation + 4, value: { x: 240, y: 600 } },
        ]}
      />
    </PhoneRig>
  );
};
