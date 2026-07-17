import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import CustomShaderMaterial from 'three-custom-shader-material';
import { damp } from 'maath/easing';
import type { TicketArt } from './art';
import { ticketAudio } from './audio';
import type { ConfettiHandle } from './Confetti';
import { PunchMask } from './punchMask';
import { ticketFragmentShader, ticketVertexShader } from './shaders';
import { layoutWord } from './words';

/** Ticket width in world units; height follows the artwork's aspect. */
export const TICKET_W = 4.8;

const NORMAL_SCALE = new THREE.Vector2(0.8, 0.8);

export interface TicketHandle {
  punchWord(word: string): Promise<void>;
  reset(): void;
}

export type TicketPresentationStage = 'material' | 'drop' | 'interactive' | 'bend';

interface TicketProps {
  art: TicketArt;
  confetti: React.RefObject<ConfettiHandle | null>;
  presentationStage?: TicketPresentationStage;
  loopEntry?: boolean;
  punchable?: boolean;
  /** Screen position of each auto-punched hole, for the DOM punch tool. */
  onHoleScreen?: (pt: { x: number; y: number } | null) => void;
  onWordDone?: () => void;
}

interface PunchOpts {
  shape: 'circle' | 'bell';
  rFrac: number;
  intensity: number;
  chad: boolean;
  /** Playback rate for the punch sample; rapid-fire runs sped up. */
  soundRate?: number;
  /** Skip the sound entirely (rapid-fire only voices every few holes). */
  silent?: boolean;
}

/**
 * One plane, two meshes: the FrontSide material carries the front art, the
 * BackSide material the (pre-mirrored) back art. Same geometry, same UVs,
 * same displacement uniforms, so the two faces can never drift apart and a
 * punched hole pierces both at the identical physical spot.
 */
export const Ticket = forwardRef<TicketHandle, TicketProps>(function Ticket(
  {
    art,
    confetti,
    presentationStage = 'bend',
    loopEntry = false,
    punchable = true,
    onHoleScreen,
    onWordDone,
  },
  ref,
) {
  const ticketH = TICKET_W / art.aspect;
  const group = useRef<THREE.Group>(null);
  const entryGroup = useRef<THREE.Group>(null);
  const frontMesh = useRef<THREE.Mesh>(null);
  const { camera, gl } = useThree();

  const reduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const mask = useMemo(
    () => new PunchMask(art.aspect, art.silhouette),
    [art.aspect, art.silhouette],
  );
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(TICKET_W, ticketH, 150, 70),
    [ticketH],
  );
  const entryEnabled = presentationStage !== 'material';
  const pointerEnabled = presentationStage === 'interactive' || presentationStage === 'bend';
  const bendEnabled = presentationStage === 'bend';
  const environmentIntensity = presentationStage === 'material' ? 1.35 : 0.7;

  const shared = useMemo(
    () => ({
      uTime: { value: 0 },
      uLightSweep: { value: presentationStage === 'material' ? 1 : 0 },
      uPresentationAlpha: { value: 1 },
      uSize: { value: new THREE.Vector2(TICKET_W, ticketH) },
      // Stiffer card stock: less resting curl, twist, and idle flutter than
      // plain paper — the ticket holds its shape between punches.
      uCurl: { value: 0.021 },
      uCornerLift: { value: 0.042 },
      uTwist: { value: 0.006 },
      uFlutter: { value: reduced || !bendEnabled ? 0 : 0.008 },
      uFallBend: { value: 0 },
      // Entry rail: ticket center travels 6.0 arc units, starting well past
      // the top of the frame even at the far rail depth. The rail is fixed
      // in space (world y = 6 - s) and shaped per the side-view diagram:
      // a long straight drop (~40% of travel), then a COMPACT S-jog of two
      // quarter-arc turns shifting ~27% of the travel in depth, then a
      // straight run to rest. Bend at s in [2.4, 4.0] = world y in
      // [2.0, 3.6]: the jog plays crisply near the top of the screen and
      // the ticket is dead flat long before landing.
      uPathS: { value: 0 },
      uPathAmp: { value: bendEnabled ? (loopEntry ? 2.6 : 1.6) : 0 },
      uPathBend: {
        value: loopEntry
          ? new THREE.Vector2(2.0, 4.4)
          : new THREE.Vector2(2.4, 4.0),
      },
      uRipples: {
        value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -10, 0)),
      },
      // Stiff plates carry longer bending wavelengths (lower k), the wave
      // travels faster (higher omega) and dies quicker (shorter tau): one
      // big swell whips across the whole card and the card snaps back flat.
      // Lower sigma lets the swell reach the far corner at strength.
      uRippleK: { value: 1.9 },
      uRippleW: { value: 28 },
      uRippleSigma: { value: 0.16 },
      uRippleTau: { value: 0.5 },
      uPunch: { value: mask.texture },
      uPunchTexel: { value: new THREE.Vector2(2.4 / mask.width, 2.4 / mask.height) },
      uPaperColor: { value: new THREE.Color('#f3ecd6') },
    }),
    [ticketH, reduced, mask, bendEnabled, presentationStage, loopEntry],
  );
  const frontUniforms = useMemo(
    () => ({
      ...shared,
      uAlbedo: { value: art.front.map },
      uRoughnessSource: { value: art.front.roughnessMap },
    }),
    [shared, art],
  );
  const backUniforms = useMemo(
    () => ({
      ...shared,
      uAlbedo: { value: art.back.map },
      uRoughnessSource: { value: art.back.roughnessMap },
    }),
    [shared, art],
  );

  const timeRef = useRef(0);
  const rippleIdx = useRef(0);
  const kick = useRef({ x: 0, y: 0 });
  const seqTimer = useRef<number | null>(null);
  const entryT = useRef(0);

  const punchAt = useCallback(
    (u: number, v: number, opts: PunchOpts) => {
      mask.punch(u, v, opts.rFrac, opts.shape, (Math.random() - 0.5) * 0.5);

      const slot = shared.uRipples.value[rippleIdx.current];
      rippleIdx.current = (rippleIdx.current + 1) % 6;
      const amp = (opts.shape === 'bell' ? 0.17 : 0.12) * (reduced ? 0.35 : 1);
      slot.set(u, v, timeRef.current, amp);

      if (!opts.silent) ticketAudio.kachunk(opts.intensity, opts.soundRate ?? 1);
      kick.current.x += (0.5 + Math.random() * 0.5) * 0.013 * opts.intensity;
      kick.current.y += (Math.random() - 0.5) * 0.018 * opts.intensity;

      const mesh = frontMesh.current;
      if (mesh) {
        const world = new THREE.Vector3(
          (u - 0.5) * TICKET_W,
          (v - 0.5) * ticketH,
          0.04,
        );
        mesh.localToWorld(world);
        if (opts.chad) {
          confetti.current?.chad(world, {
            shape: opts.shape,
            rWorld: opts.rFrac * TICKET_W,
            uvCenter: [u, v],
          });
        }
      }
    },
    [mask, shared, reduced, confetti, ticketH],
  );

  const screenPointFor = useCallback(
    (u: number, v: number) => {
      const mesh = frontMesh.current;
      if (!mesh) return null;
      const p = new THREE.Vector3((u - 0.5) * TICKET_W, (v - 0.5) * ticketH, 0.04);
      mesh.localToWorld(p);
      p.project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return {
        x: rect.left + (p.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-p.y * 0.5 + 0.5) * rect.height,
      };
    },
    [camera, gl, ticketH],
  );

  const cancelSeq = useCallback(() => {
    if (seqTimer.current !== null) {
      window.clearTimeout(seqTimer.current);
      seqTimer.current = null;
    }
    onHoleScreen?.(null);
  }, [onHoleScreen]);

  useEffect(() => cancelSeq, [cancelSeq]);

  useImperativeHandle(
    ref,
    () => ({
      /** The conductor moment: rapid-fire punch the word, movie style. */
      punchWord(word: string) {
        cancelSeq();
        const { holes } = layoutWord(word, art.aspect, 0.44);
        return new Promise<void>((resolve) => {
          let i = 0;
          const step = () => {
            if (i >= holes.length) {
              seqTimer.current = null;
              onHoleScreen?.(null);
              onWordDone?.();
              resolve();
              return;
            }
            const hole = holes[i];
            const last = i === holes.length - 1;
            const pt = screenPointFor(hole.u, hole.v);
            if (pt) onHoleScreen?.(pt);
            punchAt(hole.u, hole.v, {
              shape: 'circle',
              rFrac: hole.r,
              intensity: last ? 1 : 0.6,
              // Every hole ejects its actual cutout — a white paper disc,
              // not celebration confetti.
              chad: true,
              // Sped up so each recorded spike sits tight on the cadence.
              soundRate: last ? 1.15 : 1.5,
              // At 40ms per hole nobody can count the hits: voicing every
              // third punch keeps the machine-gun feel at a sane volume.
              silent: !last && i % 3 !== 0,
            });
            i += 1;
            seqTimer.current = window.setTimeout(step, reduced ? 10 : 40);
          };
          seqTimer.current = window.setTimeout(step, 320);
        });
      },
      reset() {
        cancelSeq();
        mask.reset();
        confetti.current?.clear();
      },
    }),
    [art.aspect, cancelSeq, punchAt, screenPointFor, mask, confetti, onWordDone, onHoleScreen, reduced],
  );

  // Press-and-hold, like the card: the die bites on pointerdown and the
  // hole (plus chad, ripple, spring-back sound) lands when the jaws let go.
  const heldUv = useRef<{ u: number; v: number } | null>(null);

  const onPunch = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      ticketAudio.unlock();
      if (!e.uv) return;
      // The plane is rectangular but the die-cut ticket is not: ignore
      // clicks in the notch voids and anywhere already punched through.
      if (!mask.isSolid(e.uv.x, e.uv.y)) return;
      ticketAudio.press(1, 1);
      heldUv.current = { u: e.uv.x, v: e.uv.y };
    },
    [mask],
  );

  useEffect(() => {
    const onUp = () => {
      const held = heldUv.current;
      if (!held) return;
      heldUv.current = null;
      ticketAudio.release(1, 1);
      punchAt(held.u, held.v, {
        shape: 'circle',
        rFrac: 0.018,
        intensity: 1,
        chad: true,
        silent: true,
      });
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [punchAt]);

  useFrame((state, dt) => {
    timeRef.current = state.clock.elapsedTime;
    shared.uTime.value = timeRef.current;
    const g = group.current;
    const eg = entryGroup.current;
    if (!g || !eg) return;

    // Entry: the ticket rides a rail. Vertically it is a rigid slide (the
    // sheet is inextensible along its length), but depth is evaluated PER
    // SLICE in the vertex shader at each slice's own arc position, so the
    // sheet snakes through the S-bend, conforming to the curve.
    //
    // Progress advances by CLAMPED frame time, not wall clock: if an early
    // frame stalls (shader compile, texture upload), the animation waits
    // instead of skipping ahead, so the entry can never visibly jump.
    entryT.current += Math.min(dt, 1 / 30);
    const loopedEntry = loopEntry && entryEnabled && !reduced;
    const entryDelay = loopedEntry ? 0.3 : 0.35;
    const entryDuration = loopedEntry ? (bendEnabled ? 2.6 : 2.15) : 1.35;
    const holdDuration = loopedEntry ? 1.4 : 0;
    const fadeDuration = loopedEntry ? 0.32 : 0;
    const cycleDuration = entryDelay + entryDuration + holdDuration + fadeDuration;
    const timeline = loopedEntry
      ? entryT.current % cycleDuration
      : entryT.current;
    const p = reduced || !entryEnabled
      ? 1
      : THREE.MathUtils.clamp((timeline - entryDelay) / entryDuration, 0, 1);
    const drop = loopedEntry
      ? p * p * (3 - 2 * p)
      : 1 - Math.pow(1 - p, 3);
    const sCenter = drop * 6.0;
    eg.position.y = 6.0 - sCenter;
    shared.uPathS.value = sCenter;
    if (loopedEntry) {
      const fadeStart = entryDelay + entryDuration + holdDuration;
      shared.uPresentationAlpha.value = timeline < entryDelay
        ? 0
        : timeline < fadeStart
          ? 1
          : 1 - THREE.MathUtils.clamp((timeline - fadeStart) / fadeDuration, 0, 1);
    } else {
      shared.uPresentationAlpha.value = 1;
    }

    // Live flutter wobble while falling (falling cards oscillate, they
    // never drop rigid). Amplitude follows the actual falling SPEED
    // ((1-p)^2, the ease-out's velocity profile), so the wobble dies with
    // the motion instead of wiggling the sheet as it parks.
    shared.uFallBend.value = bendEnabled
      ? (1 - p) * (1 - p) * 0.045 * Math.sin(timeRef.current * 9.5)
      : 0;

    kick.current.x *= Math.exp(-7 * dt);
    kick.current.y *= Math.exp(-7 * dt);

    // The ticket leans toward the pointer; the environment stays put, so the
    // glint travels across the engraving. Punches kick the lean momentarily.
    // Pointer-follow runs during the slide too, so the landing pose already
    // matches the cursor and nothing shifts once the entry finishes.
    const targetRotationX = pointerEnabled ? -state.pointer.y * 0.36 : 0.02;
    const targetRotationY = pointerEnabled ? state.pointer.x * 0.55 : -0.05;
    const idleY = reduced || !pointerEnabled ? 0 : Math.sin(timeRef.current * 0.7) * 0.045;
    damp(g.rotation, 'x', targetRotationX + kick.current.x, 0.16, dt);
    damp(g.rotation, 'y', targetRotationY + kick.current.y, 0.16, dt);
    damp(g.position, 'x', pointerEnabled ? state.pointer.x * 0.16 : 0, 0.18, dt);
    damp(g.position, 'y', (pointerEnabled ? state.pointer.y * 0.1 : 0) + idleY, 0.18, dt);
    g.rotation.z = pointerEnabled ? Math.sin(timeRef.current * 0.33) * 0.018 : 0;
  });

  return (
    <group ref={entryGroup}>
      <group ref={group}>
        <mesh
          ref={frontMesh}
          geometry={geometry}
          onPointerDown={punchable ? onPunch : undefined}
        >
        <CustomShaderMaterial
          baseMaterial={THREE.MeshPhysicalMaterial}
          vertexShader={ticketVertexShader}
          fragmentShader={ticketFragmentShader}
          uniforms={frontUniforms}
          normalMap={art.front.normalMap}
          normalScale={NORMAL_SCALE}
          roughnessMap={art.front.roughnessMap}
          roughness={1}
          metalness={1}
          envMapIntensity={environmentIntensity}
          clearcoat={0.1}
          clearcoatRoughness={0.6}
          iridescence={0.05}
          transparent={loopEntry}
          depthWrite={!loopEntry}
          side={THREE.FrontSide}
        />
      </mesh>
      <mesh geometry={geometry} onPointerDown={punchable ? onPunch : undefined}>
        <CustomShaderMaterial
          baseMaterial={THREE.MeshPhysicalMaterial}
          vertexShader={ticketVertexShader}
          fragmentShader={ticketFragmentShader}
          uniforms={backUniforms}
          normalMap={art.back.normalMap}
          normalScale={NORMAL_SCALE}
          roughnessMap={art.back.roughnessMap}
          roughness={1}
          metalness={1}
          envMapIntensity={environmentIntensity}
          clearcoat={0.1}
          clearcoatRoughness={0.6}
          iridescence={0.05}
          transparent={loopEntry}
          depthWrite={!loopEntry}
          side={THREE.BackSide}
        />
      </mesh>
      </group>
    </group>
  );
});
