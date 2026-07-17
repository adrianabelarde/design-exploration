import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { traceBell } from './bell';

/**
 * Chads: the actual punched-out pieces, behaving exactly like the RSVP
 * card's. Each punch ejects one disc cut to the die shape, UV-mapped to the
 * precise patch of artwork it was punched from (a true 1:1 cutout), and it
 * falls the way the card's chads do: flat, facing the viewer, straight down
 * under gravity with a little drift and in-plane spin — no fade, no tumble.
 * Deliberately NOT a confetti burst; this is a byproduct of the tool.
 */

// The GOING sequence punches ~60 holes at 40ms while each disc takes ~2s to
// fall out of frame, so the pool must hold a full curtain of them.
const CHAD_CAP = 96;

export interface ChadSpec {
  shape: 'circle' | 'bell';
  rWorld: number;
  /** Ticket UV the piece was punched from. */
  uvCenter: [number, number];
}

export interface ConfettiHandle {
  chad(pos: THREE.Vector3, spec: ChadSpec): void;
  clear(): void;
}

interface ChadState {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  /** In-plane spin (rad/s), like the card chad's rotate-while-falling. */
  spinZ: number;
  life: number;
}

function makeChadState(): ChadState {
  return {
    alive: false,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    rot: new THREE.Euler(),
    spinZ: 0,
    life: 0,
  };
}

// Camera (fov 28 @ z 12.5) sees to about y -3.1 at the ticket plane; below
// this a disc is safely off-screen and can be recycled. No fade on the way.
const KILL_Y = -5;

interface ConfettiProps {
  /** Front albedo, so the cutout carries the artwork it was punched from. */
  albedo: THREE.Texture;
  /** Ticket world size [W, H] for chad UV mapping. */
  worldSize: [number, number];
}

function makeChadGeometry(spec: ChadSpec, worldSize: [number, number]): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;
  if (spec.shape === 'bell') {
    const shape = new THREE.Shape();
    // Bell is authored y-down (canvas convention); THREE.Shape is y-up.
    traceBell({
      moveTo: (x, y) => shape.moveTo(x, -y),
      bezierCurveTo: (x1, y1, x2, y2, x, y) => shape.bezierCurveTo(x1, -y1, x2, -y2, x, -y),
      lineTo: (x, y) => shape.lineTo(x, -y),
      closePath: () => shape.closePath(),
    });
    geo = new THREE.ShapeGeometry(shape, 6);
    geo.scale(spec.rWorld * 1.12, spec.rWorld * 1.12, 1);
  } else {
    geo = new THREE.CircleGeometry(spec.rWorld, 18);
  }

  // UV = punch UV + world offset / ticket size: the piece keeps its print,
  // the same way the card chad shows the exact content under the die.
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = spec.uvCenter[0] + pos.getX(i) / worldSize[0];
    uv[i * 2 + 1] = spec.uvCenter[1] + pos.getY(i) / worldSize[1];
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export const ConfettiField = forwardRef<ConfettiHandle, ConfettiProps>(
  function ConfettiField({ albedo, worldSize }, ref) {
    const chadMaterial = useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          map: albedo,
          metalness: 0.85,
          roughness: 0.4,
          side: THREE.DoubleSide,
        }),
      [albedo],
    );
    const chads = useMemo(
      () =>
        Array.from({ length: CHAD_CAP }, () => {
          const m = new THREE.Mesh(new THREE.BufferGeometry(), chadMaterial);
          m.visible = false;
          return m;
        }),
      [chadMaterial],
    );
    const chadState = useMemo(() => Array.from({ length: CHAD_CAP }, makeChadState), []);
    const nextChad = useRef(0);

    useImperativeHandle(ref, () => ({
      chad(pos, spec) {
        const i = nextChad.current;
        nextChad.current = (nextChad.current + 1) % CHAD_CAP;
        const mesh = chads[i];
        mesh.geometry.dispose();
        mesh.geometry = makeChadGeometry(spec, worldSize);
        mesh.visible = true;
        const p = chadState[i];
        p.alive = true;
        p.life = 0;
        p.pos.copy(pos);
        // Card-style fall: starts at rest with a touch of sideways drift;
        // gravity does the rest.
        p.vel.set((Math.random() - 0.5) * 0.5, 0, 0);
        p.rot.set(0, 0, Math.random() * Math.PI * 2);
        p.spinZ = (Math.random() - 0.5) * 7;
      },

      clear() {
        for (let i = 0; i < CHAD_CAP; i++) {
          chadState[i].alive = false;
          chads[i].visible = false;
        }
      },
    }));

    useFrame((_, rawDt) => {
      const dt = Math.min(rawDt, 0.05);
      for (let i = 0; i < CHAD_CAP; i++) {
        const p = chadState[i];
        const mesh = chads[i];
        if (!p.alive) continue;
        p.life += dt;
        if (p.pos.y < KILL_Y) {
          p.alive = false;
          mesh.visible = false;
          continue;
        }
        // Same law as the card chad: constant gravity, no drag, no fade —
        // accelerates cleanly out of the bottom of the frame.
        p.vel.y -= 6.0 * dt;
        p.pos.addScaledVector(p.vel, dt);
        p.rot.z += p.spinZ * dt;
        mesh.position.copy(p.pos);
        mesh.rotation.copy(p.rot);
      }
    });

    return (
      <group>
        {chads.map((m, i) => (
          <primitive key={i} object={m} />
        ))}
      </group>
    );
  },
);
