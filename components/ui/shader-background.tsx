'use client'

import { useEffect, useRef } from 'react'

const VERTEX_SOURCE = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const FRAGMENT_SOURCE = `
  precision mediump float;
  uniform float u_time;
  uniform vec2 u_resolution;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot * p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float t = u_time * 0.15;

    vec2 q = vec2(fbm(uv * 3.0 + t * 0.3), fbm(uv * 3.0 + vec2(1.7, 9.2)));
    vec2 r = vec2(
      fbm(uv * 4.0 + q + vec2(1.7, 9.2) + t * 0.15),
      fbm(uv * 4.0 + q + vec2(8.3, 2.8) + t * 0.126)
    );
    float f = fbm(uv * 3.0 + r);

    vec3 navy = vec3(0.059, 0.122, 0.239);
    vec3 purple = vec3(0.25, 0.12, 0.45);
    vec3 blue = vec3(0.1, 0.2, 0.55);
    vec3 teal = vec3(0.05, 0.35, 0.35);

    vec3 color = mix(navy, purple, clamp(f * f * 2.0, 0.0, 1.0));
    color = mix(color, blue, clamp(length(q) * 0.8, 0.0, 1.0));
    color = mix(color, teal, clamp(length(r.x) * 0.3, 0.0, 1.0));

    float line1 = smoothstep(0.0, 0.02, abs(sin((uv.y + q.x * 0.5) * 12.0 + t) * 0.5));
    float line2 = smoothstep(0.0, 0.03, abs(sin((uv.x + r.y * 0.4) * 8.0 - t * 0.7) * 0.5));
    color += vec3(0.15, 0.05, 0.25) * (1.0 - line1) * 0.4;
    color += vec3(0.05, 0.1, 0.3) * (1.0 - line2) * 0.3;

    color *= 0.85 + 0.15 * f;

    gl_FragColor = vec4(color, 1.0);
  }
`

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

export function ShaderBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false })
    if (!gl) return

    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE)
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE)
    if (!vs || !fs) return

    const program = createProgram(gl, vs, fs)
    if (!program) return

    const positionLoc = gl.getAttribLocation(program, 'a_position')
    const timeLoc = gl.getUniformLocation(program, 'u_time')
    const resolutionLoc = gl.getUniformLocation(program, 'u_resolution')

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    let animationId: number
    const startTime = performance.now()

    function resize() {
      if (!canvas) return
      const dpr = Math.min(window.devicePixelRatio, 2)
      const w = canvas.clientWidth * dpr
      const h = canvas.clientHeight * dpr
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }

    function render() {
      if (!canvas || !gl || !program) return
      resize()
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(program)

      gl.enableVertexAttribArray(positionLoc)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

      gl.uniform1f(timeLoc, (performance.now() - startTime) / 1000)
      gl.uniform2f(resolutionLoc, canvas.width, canvas.height)

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      animationId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationId)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buffer)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
      aria-hidden="true"
    />
  )
}
