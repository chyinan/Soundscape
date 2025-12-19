export class CausticsBackground {
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
            [0.0, 0.1, 0.2],   // Deep blue
            [0.0, 0.4, 0.5]    // Cyan highlight
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

        const fragmentShaderSource = `
            precision mediump float;
            uniform vec2 u_resolution;
            uniform float u_time;
            uniform vec3 u_colors[2];

            #define TAU 6.28318530718
            #define MAX_ITER 3
            
            void main() {
                // Slower time for more relaxed motion
                float time = u_time * .1 + 23.0;
                
                vec2 uv = gl_FragCoord.xy / u_resolution.xy;
                
                // Aspect ratio correction with larger scale (Zoomed in)
                // Using 0.5 * TAU instead of TAU makes pattern larger
                vec2 p = mod(uv * TAU * 0.5, TAU) - 250.0;
                vec2 i = vec2(p);
                float c = 1.0;
                float inten = .005;

                for (int n = 0; n < MAX_ITER; n++) {
                    float t = time * (1.0 - (3.5 / float(n + 1)));
                    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
                    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
                }
                c /= float(MAX_ITER);
                
                // Softer falloff for less harsh lines
                // Lower power = softer gradient
                c = 1.17 - pow(c, 1.2); 
                
                // Less extreme power for final color intensity = fewer sharp highlights
                vec3 color = vec3(pow(abs(c), 6.0));
                
                // Mix with our dynamic colors
                // Base: Deep ocean color (u_colors[0])
                // Light: Caustics light (u_colors[1])
                
                vec3 baseColor = u_colors[0];
                vec3 lightColor = u_colors[1];
                
                vec3 finalColor = clamp(color + baseColor, 0.0, 1.0);
                finalColor = mix(finalColor, lightColor, clamp(color, 0.0, 0.5));
                
                // Vignette
                float vignette = smoothstep(1.5, 0.5, length(uv - 0.5));
                finalColor *= vignette;

                gl_FragColor = vec4(finalColor, 1.0);
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

    updateColors(hexColors, overrideBaseColor = null) {
        if (!hexColors || hexColors.length === 0) return;
        
        // Convert hex to normalized RGB
        let colors = hexColors.map(hex => {
            if (!hex) return [0.0, 0.1, 0.2];
            let r = 0, g = 0, b = 0;
            if (hex.length === 7) {
                r = parseInt(hex.slice(1, 3), 16) / 255;
                g = parseInt(hex.slice(3, 5), 16) / 255;
                b = parseInt(hex.slice(5, 7), 16) / 255;
            }
            return [r, g, b];
        });
        
        // Strategy for Caustics:
        // Color 0: Darkest/Base color (Deep ocean)
        // Color 1: Lighter/Highlight color (Light rays)
        
        // Sort by luminance to find dark and light
        colors.sort((a, b) => {
            const lumA = 0.2126*a[0] + 0.7152*a[1] + 0.0722*a[2];
            const lumB = 0.2126*b[0] + 0.7152*b[1] + 0.0722*b[2];
            return lumA - lumB; // Ascending: dark first
        });

        if (colors.length >= 2) {
             // Make the base color even darker for depth
             this.colors[0] = colors[0].map(c => c * 0.5);
             // Use the lightest color for highlights
             this.colors[1] = colors[colors.length-1];
        } else if (colors.length === 1) {
             this.colors[0] = colors[0].map(c => c * 0.3);
             this.colors[1] = colors[0];
        }

        // Apply override if provided (Matches player panel adaptive color)
        if (overrideBaseColor) {
            this.colors[0] = [
                overrideBaseColor.r / 255, 
                overrideBaseColor.g / 255, 
                overrideBaseColor.b / 255
            ];
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


