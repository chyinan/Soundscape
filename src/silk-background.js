export class SilkBackground {
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
            [0.1, 0.1, 0.1],
            [0.2, 0.2, 0.2],
            [0.3, 0.3, 0.3],
            [0.4, 0.4, 0.4]
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

            void main() {
                vec2 uv = gl_FragCoord.xy / u_resolution.xy;
                
                // Slow down time
                float t = u_time * 0.15;
                
                // Create fluid distortion coordinates
                float n1 = snoise(uv * 1.5 + vec2(t * 0.2, t * 0.3));
                float n2 = snoise(uv * 2.0 - vec2(t * 0.4, t * 0.1));
                
                vec2 distortedUV = uv + vec2(n1, n2) * 0.2;
                
                // Create sine wave patterns for "silk" folds
                float wave = sin(distortedUV.x * 6.0 + t) * cos(distortedUV.y * 5.0 - t);
                wave += sin(distortedUV.x * 12.0 - t * 1.5) * 0.5;
                
                // Mix colors based on UV and waves
                vec3 color = mix(u_colors[0], u_colors[1], smoothstep(0.0, 1.0, uv.y + wave * 0.2));
                color = mix(color, u_colors[2], smoothstep(0.0, 1.0, uv.x + n1 * 0.3));
                color = mix(color, u_colors[3], smoothstep(0.0, 1.0, abs(wave)));
                
                // Add some subtle noise grain
                float grain = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) * 0.03;
                
                gl_FragColor = vec4(color + grain, 1.0);
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
            if (!hex) return [0.1, 0.1, 0.1];
            // Handle #RRGGBB
            let r = 0, g = 0, b = 0;
            if (hex.length === 7) {
                r = parseInt(hex.slice(1, 3), 16) / 255;
                g = parseInt(hex.slice(3, 5), 16) / 255;
                b = parseInt(hex.slice(5, 7), 16) / 255;
            } else if (hex.length === 4) { // Handle #RGB
                 r = parseInt(hex[1] + hex[1], 16) / 255;
                 g = parseInt(hex[2] + hex[2], 16) / 255;
                 b = parseInt(hex[3] + hex[3], 16) / 255;
            }
            return [r, g, b];
        });
        
        // Ensure we have 4 colors by cycling
        while (newColors.length < 4) {
            newColors.push(newColors[newColors.length % newColors.length]);
        }
        
        // Apply override if provided (Matches player panel adaptive color)
        if (overrideColor) {
            newColors[0] = [
                overrideColor.r / 255,
                overrideColor.g / 255,
                overrideColor.b / 255
            ];
        }

        // Slice to 4
        this.colors = newColors.slice(0, 4);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.startTime = performance.now();
        this.loop();
    }

    stop() {
        this.running = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    loop() {
        if (!this.running) return;
        
        const currentTime = (performance.now() - this.startTime) / 1000;
        
        this.gl.useProgram(this.program);
        
        // Update uniforms
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


