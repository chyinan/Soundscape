export class InkBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas with id ${canvasId} not found`);
            return;
        }
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        this.program = null;
        this.animationId = null;
        this.colors = [
            [0.1, 0.1, 0.15],
            [0.15, 0.15, 0.2],
            [0.2, 0.2, 0.25]
        ];
        this.startTime = 0;
        this.running = false;
        
        // Generate random offset for more varied patterns
        this.randomOffset = [Math.random() * 100, Math.random() * 100];
        
        this.init();
    }

    init() {
        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }

        const vertexShaderSource = `
            attribute vec2 a_position;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;

        const fragmentShaderSource = `
            precision mediump float;
            uniform vec2 u_resolution;
            uniform float u_time;
            uniform vec3 u_colors[3];
            uniform vec2 u_offset; // New random offset uniform

            // Random function
            float random(in vec2 _st) {
                return fract(sin(dot(_st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }

            // Noise function
            float noise(in vec2 _st) {
                vec2 i = floor(_st);
                vec2 f = fract(_st);

                // Four corners in 2D of a tile
                float a = random(i);
                float b = random(i + vec2(1.0, 0.0));
                float c = random(i + vec2(0.0, 1.0));
                float d = random(i + vec2(1.0, 1.0));

                vec2 u = f * f * (3.0 - 2.0 * f);

                return mix(a, b, u.x) +
                        (c - a)* u.y * (1.0 - u.x) +
                        (d - b) * u.x * u.y;
            }

            #define NUM_OCTAVES 5

            float fbm( in vec2 _st) {
                float v = 0.0;
                float a = 0.5;
                vec2 shift = vec2(100.0);
                // Rotate to reduce axial bias
                mat2 rot = mat2(cos(0.5), sin(0.5),
                                -sin(0.5), cos(0.50));
                for (int i = 0; i < NUM_OCTAVES; ++i) {
                    v += a * noise(_st);
                    _st = rot * _st * 2.0 + shift;
                    a *= 0.5;
                }
                return v;
            }

            void main() {
                vec2 st = gl_FragCoord.xy/u_resolution.xy;
                // Maintain aspect ratio
                st.x *= u_resolution.x/u_resolution.y;

                float t = u_time * 0.25; // Increased speed of flow (was 0.15)

                vec2 q = vec2(0.);
                q.x = fbm( st + u_offset + 0.00*t);
                q.y = fbm( st + u_offset + vec2(1.0));

                vec2 r = vec2(0.);
                r.x = fbm( st + u_offset + 1.0*q + vec2(1.7,9.2)+ 0.15*t );
                r.y = fbm( st + u_offset + 1.0*q + vec2(8.3,2.8)+ 0.126*t);

                float f = fbm(st + u_offset + r);

                // Mix colors based on the noise value f
                // Base dark color
                vec3 color = mix(u_colors[0], u_colors[1], clamp((f*f)*4.0,0.0,1.0));

                // Add the third color for highlights
                color = mix(color, u_colors[2], clamp(length(q),0.0,1.0));

                // Add a subtle vignette or smoke edge
                color = mix(color, vec3(0.0), clamp(length(r.x),0.0,1.0));

                // Output
                gl_FragColor = vec4((f*f*f+.6*f*f+.5*f)*color,1.);
            }
        `;

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

        this.program = this.createProgram(vertexShader, fragmentShader);
        this.gl.useProgram(this.program);

        // Set up quad
        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1,
        ]), this.gl.STATIC_DRAW);

        const positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.gl.enableVertexAttribArray(positionLocation);
        this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    createProgram(vertexShader, fragmentShader) {
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Program link error:', this.gl.getProgramInfoLog(program));
            this.gl.deleteProgram(program);
            return null;
        }
        return program;
    }

    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    }

    updateColors(hexColors, overrideColor = null) {
        if (!hexColors || hexColors.length === 0) return;
        
        // Convert hex to normalized RGB
        let newColors = hexColors.map(hex => {
            if (!hex) return [0.1, 0.1, 0.15];
            let r = 0, g = 0, b = 0;
            if (hex.length === 7) {
                r = parseInt(hex.slice(1, 3), 16) / 255;
                g = parseInt(hex.slice(3, 5), 16) / 255;
                b = parseInt(hex.slice(5, 7), 16) / 255;
            } else if (hex.length === 4) {
                 r = parseInt(hex[1] + hex[1], 16) / 255;
                 g = parseInt(hex[2] + hex[2], 16) / 255;
                 b = parseInt(hex[3] + hex[3], 16) / 255;
            }
            return [r, g, b];
        });
        
        // Ensure we have 3 colors
        while (newColors.length < 3) {
            newColors.push(newColors[newColors.length % newColors.length]);
        }
        
        // Apply override if provided (Matches player panel adaptive color)
        if (overrideColor) {
            newColors[0] = [
                overrideColor.r / 255,
                overrideColor.g / 255,
                overrideColor.b / 255
            ];
            // Optionally adjust other colors to be related to the override color
            // for a more cohesive look in Ink mode
        }

        // Slice to 3
        this.colors = newColors.slice(0, 3);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.canvas.style.opacity = '1';
        this.startTime = performance.now();
        this.loop();
    }

    stop() {
        this.running = false;
        this.canvas.style.opacity = '0'; // Fade out
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    loop() {
        if (!this.running) return;
        
        const currentTime = (performance.now() - this.startTime) / 1000;
        
        this.gl.useProgram(this.program);
        
        const resolutionLocation = this.gl.getUniformLocation(this.program, 'u_resolution');
        this.gl.uniform2f(resolutionLocation, this.canvas.width, this.canvas.height);
        
        const timeLocation = this.gl.getUniformLocation(this.program, 'u_time');
        this.gl.uniform1f(timeLocation, currentTime);
        
        const colorsLocation = this.gl.getUniformLocation(this.program, 'u_colors');
        const flatColors = this.colors.flat();
        this.gl.uniform3fv(colorsLocation, new Float32Array(flatColors));
        
        const offsetLocation = this.gl.getUniformLocation(this.program, 'u_offset');
        this.gl.uniform2f(offsetLocation, this.randomOffset[0], this.randomOffset[1]);
        
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
        
        this.animationId = requestAnimationFrame(() => this.loop());
    }
}

