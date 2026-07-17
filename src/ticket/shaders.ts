/**
 * Injected into MeshPhysicalMaterial via three-custom-shader-material, so
 * all PBR machinery (env reflections, clearcoat, iridescence) is kept.
 *
 * Vertex: paper is inextensible, so its Gaussian curvature stays ~0 — it
 * bends around one axis at a time (a developable surface). The base shape is
 * a gentle cylinder plus handled-corner lift and a whisper of twist. Punch
 * impacts add damped flexural ripples. Normals are recomputed by finite
 * differences of the full displacement field; without that, the curl is
 * invisible to lighting.
 */
export const ticketVertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uSize;
  uniform float uCurl;
  uniform float uCornerLift;
  uniform float uTwist;
  uniform float uFlutter;
  uniform float uFallBend;
  uniform float uPathS;
  uniform float uPathAmp;
  uniform vec2 uPathBend;
  uniform vec4 uRipples[6];
  uniform float uRippleK;
  uniform float uRippleW;
  uniform float uRippleSigma;
  uniform float uRippleTau;

  varying vec2 vTicketUv;

  float displace(vec2 p, float t) {
    float hw = uSize.x * 0.5;
    float hh = uSize.y * 0.5;

    // Developable base curl: shallow cylinder about the short axis.
    float z = uCurl * p.x * p.x;

    // Corner lift: plastic deformation from being handled.
    float ex = smoothstep(hw * 0.45, hw, abs(p.x));
    float ey = smoothstep(hh * 0.2, hh, abs(p.y));
    z += uCornerLift * ex * ey;

    // Slight diagonal twist.
    z += uTwist * p.x * p.y;

    // Falling-paper flutter wobble, driven per-frame during the entry.
    z += uFallBend * p.y * p.y;

    // Entry path, train-on-rails style: the path (side view) is straight
    // down at depth -uPathAmp, an S-bend forward between uPathBend.x and
    // uPathBend.y, then straight down at 0. Each horizontal slice of the
    // ticket evaluates the path at its OWN arc position (bottom edge is
    // the head, top edge the tail, like a snake), so the sheet visibly
    // bends to conform to the curve exactly where the path curves.
    float sv = uPathS - p.y;
    z -= uPathAmp * (1.0 - smoothstep(uPathBend.x, uPathBend.y, sv));

    // Idle flutter: one slow traveling wave, strongest near the free ends.
    z += uFlutter * sin(p.x * 2.2 + t * 1.4) * (0.35 + 0.65 * ex);

    // Punch ripples: damped flexural waves radiating from each impact.
    for (int i = 0; i < 6; i++) {
      vec4 rp = uRipples[i];
      float age = t - rp.z;
      if (rp.w > 0.0 && age > 0.0 && age < 2.5) {
        vec2 c = (rp.xy - 0.5) * uSize;
        float r = length(p - c);
        z += rp.w
          * sin(uRippleK * r - uRippleW * age)
          * exp(-uRippleSigma * r)
          * exp(-age / uRippleTau);
      }
    }
    return z;
  }

  void main() {
    vTicketUv = uv;
    vec2 p = position.xy;
    float h = 0.02;
    float z0 = displace(p, uTime);
    float zx = displace(p + vec2(h, 0.0), uTime);
    float zy = displace(p + vec2(0.0, h), uTime);
    csm_Position = vec3(p, position.z + z0);
    csm_Normal = normalize(vec3(-(zx - z0) / h, -(zy - z0) / h, 1.0));
  }
`;

/**
 * Fragment: the punch mask carves holes with discard (no blending, so no
 * transparency sorting artifacts). Gold "foil" is really foil laminated on
 * card, so a cut edge exposes the paper core: a thin matte, non-metallic
 * paper-colored rim ringing every hole.
 */
export const ticketFragmentShader = /* glsl */ `
  uniform sampler2D uAlbedo;
  uniform sampler2D uPunch;
  uniform vec2 uPunchTexel;
  uniform vec3 uPaperColor;

  varying vec2 vTicketUv;

  void main() {
    float mask = texture2D(uPunch, vTicketUv).r;
    if (mask < 0.5) discard;

    // Distance-free edge detection: any punched neighbor marks the rim.
    float hole = 0.0;
    vec2 o = uPunchTexel;
    hole = max(hole, 1.0 - texture2D(uPunch, vTicketUv + vec2( o.x,  0.0)).r);
    hole = max(hole, 1.0 - texture2D(uPunch, vTicketUv + vec2(-o.x,  0.0)).r);
    hole = max(hole, 1.0 - texture2D(uPunch, vTicketUv + vec2( 0.0,  o.y)).r);
    hole = max(hole, 1.0 - texture2D(uPunch, vTicketUv + vec2( 0.0, -o.y)).r);
    hole = max(hole, 1.0 - texture2D(uPunch, vTicketUv + vec2( o.x,  o.y) * 0.707).r);
    hole = max(hole, 1.0 - texture2D(uPunch, vTicketUv + vec2(-o.x,  o.y) * 0.707).r);
    hole = max(hole, 1.0 - texture2D(uPunch, vTicketUv + vec2( o.x, -o.y) * 0.707).r);
    hole = max(hole, 1.0 - texture2D(uPunch, vTicketUv + vec2(-o.x, -o.y) * 0.707).r);
    float rim = clamp(hole, 0.0, 1.0);

    vec4 art = texture2D(uAlbedo, vTicketUv);
    csm_DiffuseColor = vec4(mix(art.rgb, uPaperColor, rim * 0.9), 1.0);
    // Exposed paper core is dielectric.
    csm_Metalness = 1.0 - rim;
  }
`;
