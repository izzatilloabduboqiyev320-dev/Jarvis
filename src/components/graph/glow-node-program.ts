import { NodeCircleProgram } from "sigma/rendering";

/**
 * Circle node with a soft halo ("bloom") rendered in a single WebGL pass.
 * The triangle is drawn twice as large as sigma's default circle; the inner
 * half is the solid node, the outer half a quadratic falloff glow. Picking
 * (hover/click hit-testing) only uses the solid core.
 */

const VERTEX = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

const float bias = 255.0 / 254.0;

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  #ifdef PICKING_MODE
  float scale = 1.0;
  #else
  float scale = 2.2;
  #endif
  vec2 diffVector = size * scale * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector;
  gl_Position = vec4((u_matrix * vec3(position, 1)).xy, 0, 1);

  v_diffVector = diffVector;
  v_radius = size / 2.0;

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif

  v_color.a *= bias;
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

uniform float u_correctionRatio;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  float dist = length(v_diffVector);

  #ifdef PICKING_MODE
  if (dist > v_radius)
    gl_FragColor = transparent;
  else
    gl_FragColor = v_color;
  #else
  float border = u_correctionRatio * 2.0;
  float a = v_color.a;
  // Solid core with antialiased edge and a slightly brighter centre.
  float core = 1.0 - smoothstep(v_radius - border, v_radius, dist);
  float centre = 1.0 - smoothstep(0.0, v_radius, dist);
  vec3 coreColor = mix(v_color.rgb, vec3(1.0), 0.18 * centre);
  // Halo: quadratic falloff out to 2.2x the radius, strength scales with alpha.
  float g = 1.0 - smoothstep(v_radius * 0.9, v_radius * 2.2, dist);
  float glow = g * g * 0.32;
  float alpha = max(core, glow) * a;
  vec3 rgb = mix(v_color.rgb, coreColor, core);
  gl_FragColor = vec4(rgb * alpha, alpha);
  #endif
}
`;

export default class GlowNodeProgram extends NodeCircleProgram {
  getDefinition() {
    return {
      ...super.getDefinition(),
      VERTEX_SHADER_SOURCE: VERTEX,
      FRAGMENT_SHADER_SOURCE: FRAGMENT,
    };
  }
}
