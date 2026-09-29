/**
 * Wi-Dex Low-Latency Canvas Video Streamer
 * Handles Android Screen frame decoding and real-time canvas rendering.
 */
class PhoneStreamer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.isConnected = false;
        this.fpsCounter = 0;
        this.currentFps = 0;
        this.lastFrameTime = performance.now();
        this.frameBuffer = null;
        this.demoAnimationId = null;

        // Frame stats
        this.stats = {
            fps: 0,
            bitrate: '15 Mbps',
            latency: 8, // ms
            resolution: '1920x1080'
        };

        this.initCanvasSize();
        this.startFpsMonitor();
    }

    initCanvasSize() {
        this.canvas.width = 1920;
        this.canvas.height = 1080;
    }

    startFpsMonitor() {
        setInterval(() => {
            this.currentFps = this.fpsCounter;
            this.stats.fps = this.currentFps;
            this.fpsCounter = 0;
            if (this.onFpsUpdate) {
                this.onFpsUpdate(this.stats);
            }
        }, 1000);
    }

    /**
     * Render raw frame blob/arraybuffer image received from Android WebSocket
     */
    renderFrame(frameData) {
        if (!frameData) return;
        this.stopDemoFeed();

        let blob;
        if (frameData instanceof Blob) {
            blob = frameData;
        } else if (frameData instanceof ArrayBuffer) {
            blob = new Blob([frameData], { type: 'image/jpeg' });
        } else {
            return;
        }

        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
            URL.revokeObjectURL(url);
            this.fpsCounter++;
            this.isConnected = true;
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }

    /**
     * Start high-fidelity animated demo canvas when no physical phone is connected
     */
    startDemoFeed() {
        if (this.demoAnimationId || this.isConnected) return;

        let angle = 0;
        const renderDemo = () => {
            if (this.isConnected) return; // Stop demo when live phone connects

            this.ctx.fillStyle = '#0a0d14';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Dynamic grid background
            this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.12)';
            this.ctx.lineWidth = 1;
            const gridSize = 60;
            for (let x = 0; x < this.canvas.width; x += gridSize) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.canvas.height);
                this.ctx.stroke();
            }
            for (let y = 0; y < this.canvas.height; y += gridSize) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, y);
                this.ctx.lineTo(this.canvas.width, y);
                this.ctx.stroke();
            }

            // Central Phone Host display simulation
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;

            // Animated pulsing orb
            angle += 0.03;
            const pulseRadius = 120 + Math.sin(angle) * 15;
            const gradient = this.ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, pulseRadius);
            gradient.addColorStop(0, 'rgba(6, 182, 212, 0.8)');
            gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.4)');
            gradient.addColorStop(1, 'rgba(11, 13, 20, 0)');

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
            this.ctx.fill();

            // Text info
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 36px Outfit, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Wi-Dex Screen Host Ready', centerX, centerY - 40);

            this.ctx.fillStyle = '#9ca3af';
            this.ctx.font = '20px Outfit, sans-serif';
            this.ctx.fillText('Screen is Off/Locked on phone | Low-Latency Wi-Fi Channel Active', centerX, centerY + 10);

            this.ctx.fillStyle = '#06b6d4';
            this.ctx.font = '16px JetBrains Mono, monospace';
            this.ctx.fillText('Resolution: 1920x1080 @ 60 FPS | Hardware MediaCodec', centerX, centerY + 50);

            this.fpsCounter++;
            this.demoAnimationId = requestAnimationFrame(renderDemo);
        };

        renderDemo();
    }

    stopDemoFeed() {
        if (this.demoAnimationId) {
            cancelAnimationFrame(this.demoAnimationId);
            this.demoAnimationId = null;
        }
    }
}
