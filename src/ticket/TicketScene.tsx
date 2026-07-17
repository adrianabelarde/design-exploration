import { useEffect, useRef, type Ref } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, Preload } from '@react-three/drei';
import * as THREE from 'three';
import type { TicketArt } from './art';
import { ticketAudio } from './audio';
import { ConfettiField, type ConfettiHandle } from './Confetti';
import {
  Ticket,
  TICKET_W,
  type TicketHandle,
  type TicketPresentationStage,
} from './Ticket';

interface TicketSceneProps {
  art: TicketArt;
  ticketRef: Ref<TicketHandle>;
  cameraZ?: number;
  movingLight?: boolean;
  presentationStage?: TicketPresentationStage;
  loopEntry?: boolean;
  punchable?: boolean;
  onHoleScreen?: (pt: { x: number; y: number } | null) => void;
  onWordDone?: () => void;
}

function MovingStudioLight() {
  const { scene } = useThree();
  const light = useRef<THREE.RectAreaLight>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime * 0.5;
    scene.environmentRotation.set(
      Math.sin(time * 0.7) * 0.13,
      Math.sin(time) * 0.55,
      Math.cos(time * 0.8) * 0.05,
    );
    light.current?.position.set(
      Math.sin(time * 1.25) * 4.2,
      Math.cos(time * 0.8) * 0.8,
      3.6,
    );
    light.current?.lookAt(0, 0, 0);
  });

  useEffect(() => () => {
    scene.environmentRotation.set(0, 0, 0);
  }, [scene]);

  return (
    <rectAreaLight
      ref={light}
      color="#fff1ce"
      intensity={46}
      width={1.2}
      height={4.2}
      position={[0, 0, 3.6]}
    />
  );
}

/**
 * Metal is only as good as what it reflects: the environment is a dark room
 * with a few bright softbox strips. The ticket tilts, the strips stay put,
 * and the glint sweeps across the engraving.
 */
export function TicketScene({
  art,
  ticketRef,
  cameraZ = 12.5,
  movingLight = false,
  presentationStage,
  loopEntry,
  punchable,
  onHoleScreen,
  onWordDone,
}: TicketSceneProps) {
  const confetti = useRef<ConfettiHandle>(null);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 28, position: [0, 0, cameraZ] }}
      gl={{ alpha: true, antialias: true, toneMappingExposure: 1.35 }}
      onPointerDown={() => ticketAudio.unlock()}
    >
      {/* A lighter room lifts the reflection floor: metal shows the room
          everywhere, so ambient brightness is what controls its contrast. */}
      <Environment resolution={256}>
        <color attach="background" args={['#66646e']} />
        <Lightformer form="rect" intensity={2} color="#fff3da" position={[0, 3, 5]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#dde8ff" position={[-5, -2, 3]} rotation-z={0.9} scale={[7, 0.8, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#ffffff" position={[5, 2, 3]} rotation-z={-0.7} scale={[6, 0.6, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffe6bd" position={[0, -4, 4]} scale={[10, 2, 1]} />
      </Environment>
      {movingLight && <MovingStudioLight />}

      <group position={[0, 0.12, 0]}>
        <Ticket
          ref={ticketRef}
          art={art}
          confetti={confetti}
          presentationStage={presentationStage}
          loopEntry={loopEntry}
          punchable={punchable}
          onHoleScreen={onHoleScreen}
          onWordDone={onWordDone}
        />
      </group>

      <ConfettiField
        ref={confetti}
        albedo={art.front.map}
        worldSize={[TICKET_W, TICKET_W / art.aspect]}
      />

      <ContactShadows position={[0, -1.55, 0]} opacity={0.32} scale={9} blur={2.6} far={2.6} />
      {/* Compile shaders + upload all textures on mount, while the ticket is
          still parked off-screen, so no stall lands on the entry frames. */}
      <Preload all />
    </Canvas>
  );
}
