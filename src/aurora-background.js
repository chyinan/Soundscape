export class AuroraBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas with id ${canvasId} not found`);
            return;
        }
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        this.program = null;
        this.animationId = null;
        // Default aurora colors (greens, purples, blues)
        this.colors = [
            [0.0, 0.8, 0.6],  // Teal/Green
            [0.5, 0.0, 0.8],  // Purple
            [0.0, 0.4, 0.9],  // Blue
            [0.1, 0.1, 0.3]   // Dark background
        ];
        this.startTime = 0;
        this.running = false;
        
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

        // Fragment shader for diffuse aurora/halo effect
        const fragmentShaderSource = `
            precision mediump float;
            uniform vec2 u_resolution;
            uniform float u_time;
            uniform vec3 u_colors[4];

            // Simplex 2D noise
            vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
            float snoise(vec2 v){
                const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
                vec2 i  = floor(v + dot(v, C.yy) );
                vec2 x0 = v -   i + dot(i, C.xx);
                vec2 i1;
                i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
                vec4 x12 = x0.xyxy + C.xxzz;
                x12.xy -= i1;
                i = mod(i, 289.0);
                vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
                + i.x + vec3(0.0, i1.x, 1.0 ));
                vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
                m = m*m ;
                m = m*m ;
                vec3 x = 2.0 * fract(p * C.www) - 1.0;
                vec3 h = abs(x) - 0.5;
                vec3 ox = floor(x + 0.5);
                vec3 a0 = x - ox;
                m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
                vec3 g;
                g.x  = a0.x  * x0.x  + h.x  * x0.y;
                g.yz = a0.yz * x12.xz + h.yz * x12.yw;
                return 130.0 * dot(m, g);
            }

            // FBM (Fractal Brownian Motion) for cloudiness
            float fbm(vec2 st) {
                float value = 0.0;
                float amplitude = 0.5;
                float frequency = 0.0;
                
                // Octaves
                for (int i = 0; i < 3; i++) {
                    value += amplitude * snoise(st);
                    st *= 2.0;
                    amplitude *= 0.5;
                }
                return value;
            }

            void main() {
                vec2 uv = gl_FragCoord.xy / u_resolution.xy;
                
                // Slow time for relaxing effect
                float t = u_time * 0.08;
                
                // Base noise for large movements
                float n1 = fbm(uv * 1.5 + vec2(t * 0.1, t * 0.05));
                
                // Secondary noise for detail and flow
                float n2 = fbm(uv * 2.5 - vec2(t * 0.05, t * 0.1) + n1);
                
                // Distort UVs for the fluid look
                vec2 distortedUV = uv + vec2(n1, n2) * 0.4;
                
                // Create soft, diffuse mixing of colors
                // We use the distorted UVs to sample/mix colors
                
                // Layer 1: Bottom/Main flow
                float layer1 = smoothstep(-0.5, 1.0, distortedUV.y + snoise(distortedUV * 2.0 + t) * 0.5);
                
                // Layer 2: Top/Highlight flow
                float layer2 = smoothstep(-0.2, 1.2, distortedUV.x + snoise(distortedUV * 3.0 - t) * 0.5);
                
                // Layer 3: Detail spots
                float layer3 = fbm(distortedUV * 4.0 + t);
                
                // Mix colors
                // Base is color 3 (Dark background usually)
                vec3 color = u_colors[3];
                
                // Mix in color 0 (Main accent 1)
                color = mix(color, u_colors[0], layer1 * 0.8);
                
                // Mix in color 1 (Main accent 2)
                color = mix(color, u_colors[1], layer2 * 0.7);
                
                // Mix in color 2 (Highlight) based on noise peaks
                color = mix(color, u_colors[2], smoothstep(0.3, 0.8, layer3) * 0.5);
                
                // Add soft glow/vignette
                float vignette = 1.0 - length(uv - 0.5) * 0.5;
                color *= vignette;
                
                // Dither to prevent banding
                float dither = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) * 0.01;
                
                gl_FragColor = vec4(color + dither, 1.0);
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
        let parsedColors = hexColors.map(hex => {
            if (!hex) return [0.1, 0.1, 0.3];
            let r = 0, g = 0, b = 0;
            if (hex.length === 7) {
                r = parseInt(hex.slice(1, 3), 16) / 255;
                g = parseInt(hex.slice(3, 5), 16) / 255;
                b = parseInt(hex.slice(5, 7), 16) / 255;
            }
            return [r, g, b];
        });

        // Ensure we have 4 colors by cycling or generating variations
        // 0: Main accent 1
        // 1: Main accent 2
        // 2: Highlight
        // 3: Background
        
        if (parsedColors.length === 1) {
            // Monochromatic variations
            const base = parsedColors[0];
            this.colors[0] = base;
            this.colors[1] = [base[0]*0.7, base[1]*0.7, base[2]*0.7]; // Darker
            this.colors[2] = [Math.min(1, base[0]*1.3), Math.min(1, base[1]*1.3), Math.min(1, base[2]*1.3)]; // Lighter
            this.colors[3] = [base[0]*0.2, base[1]*0.2, base[2]*0.2]; // Very dark bg
        } else {
             // Use provided colors, filling gaps if needed
             for (let i = 0; i < 4; i++) {
                 this.colors[i] = parsedColors[i % parsedColors.length];
             }
             // Make the last color (background) darker if it's too bright, or just use the darkest from the set
             // Simple heuristic: force index 3 to be dark version of index 0 if we ran out of unique colors
             if (parsedColors.length < 4) {
                 this.colors[3] = [this.colors[0][0]*0.2, this.colors[0][1]*0.2, this.colors[0][2]*0.2];
             }
        }

        // Apply override if provided (Matches player panel adaptive color)
        if (overrideColor) {
            const override = [
                overrideColor.r / 255,
                overrideColor.g / 255,
                overrideColor.b / 255
            ];
            // Replace the background color or primary accent
            this.colors[0] = override;
            this.colors[3] = [override[0]*0.2, override[1]*0.2, override[2]*0.2]; // Darker version for bg
        }
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
        this.canvas.style.opacity = '0';
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
        
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
        
        this.animationId = requestAnimationFrame(() => this.loop());
    }
}
