// WebGL2 post-process: CRT curvature, scanlines, mask, glow, RGB fringe and vignette.
class CRTRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.source = document.createElement('canvas');
    this.ctx = this.source.getContext('2d', { alpha: false });
    this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
    if (!this.gl) throw new Error('WebGL2 is required for the CRT renderer.');
    this.program = this.createProgram();
    this.texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    const vertices = new Float32Array([
      -1, -1, 0, 0,  1, -1, 1, 0,  -1, 1, 0, 1,
      -1, 1, 0, 1,   1, -1, 1, 0,   1, 1, 1, 1,
    ]);
    const vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(vao);
    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, stride, 0);
    this.gl.enableVertexAttribArray(1);
    this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
    this.gl.useProgram(this.program);
    this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'uScreen'), 0);
    this.timeLocation = this.gl.getUniformLocation(this.program, 'uTime');
    this.resolutionLocation = this.gl.getUniformLocation(this.program, 'uResolution');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  createProgram() {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex = `#version 300 es
      layout(location=0) in vec2 position;
      layout(location=1) in vec2 uv;
      out vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
    `;
    const fragment = `#version 300 es
      precision highp float;
      in vec2 vUv;
      out vec4 outColor;
      uniform sampler2D uScreen;
      uniform vec2 uResolution;
      uniform float uTime;
      vec2 curve(vec2 uv) {
        vec2 p = uv * 2.0 - 1.0;
        p *= 1.0 + 0.075 * dot(p, p);
        return p * 0.5 + 0.5;
      }
      void main() {
        vec2 uv = curve(vUv);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          outColor = vec4(0.008, 0.012, 0.008, 1.0); return;
        }
        vec2 px = 1.0 / uResolution;
        float fringe = 1.25 * px.x;
        vec3 color;
        color.r = texture(uScreen, uv + vec2(fringe, 0.0)).r;
        color.g = texture(uScreen, uv).g;
        color.b = texture(uScreen, uv - vec2(fringe, 0.0)).b;
        vec3 glow = texture(uScreen, uv + vec2(px.x * 1.4, 0.0)).rgb
                  + texture(uScreen, uv - vec2(px.x * 1.4, 0.0)).rgb;
        color += glow * 0.11;
        float scan = 0.84 + 0.16 * sin(vUv.y * uResolution.y * 3.14159265);
        float mask = 0.94 + 0.06 * cos(vUv.x * uResolution.x * 3.14159265);
        vec2 d = vUv - 0.5;
        float vignette = 1.0 - 0.52 * dot(d, d);
        float flicker = 0.985 + 0.015 * sin(uTime * 12.0);
        float grain = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898,78.233))) * 43758.5453) - 0.5;
        color = (color * scan * mask * vignette * flicker) + grain * 0.018;
        outColor = vec4(max(color, vec3(0.0)), 1.0);
      }
    `;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    return program;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width * dpr));
    const height = Math.max(1, Math.round(bounds.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
      this.source.width = width; this.source.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  render(draw, time) {
    this.resize();
    draw(this.ctx, this.source.width, this.source.height);
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.timeLocation, time);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
