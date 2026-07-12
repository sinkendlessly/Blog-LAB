import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './Hyperspeed.css';

const DEFAULT_EFFECT_OPTIONS = {
  onSpeedUp: () => {},
  onSlowDown: () => {},
  distortion: 'turbulentDistortion',
  length: 400,
  roadWidth: 10,
  islandWidth: 2,
  lanesPerRoad: 4,
  fov: 90,
  fovSpeedUp: 150,
  speedUp: 2,
  carLightsFade: 0.4,
  totalSideLightSticks: 20,
  lightPairsPerRoadWay: 40,
  shoulderLinesWidthPercentage: 0.05,
  brokenLinesWidthPercentage: 0.1,
  brokenLinesLengthPercentage: 0.5,
  lightStickWidth: [0.12, 0.5],
  lightStickHeight: [1.3, 1.7],
  movingAwaySpeed: [60, 80],
  movingCloserSpeed: [-120, -160],
  carLightsLength: [12, 80],
  carLightsRadius: [0.05, 0.14],
  carWidthPercentage: [0.3, 0.5],
  carShiftX: [-0.8, 0.8],
  carFloorSeparation: [0, 5],
  colors: {
    roadColor: 0x080808,
    islandColor: 0x0a0a0a,
    background: 0x000000,
    shoulderLines: 0xffffff,
    brokenLines: 0xffffff,
    leftCars: [0xd856bf, 0x6750a2, 0xc247ac],
    rightCars: [0x03b3c3, 0x0e5ea5, 0x324555],
    sticks: 0x03b3c3
  }
};

const Hyperspeed = ({ effectOptions = DEFAULT_EFFECT_OPTIONS }: { effectOptions?: any }) => {
  const hyperspeed = useRef<HTMLDivElement>(null);
  const appRef = useRef<any>(null);

  useEffect(() => {
    if (appRef.current) {
      appRef.current.dispose();
      appRef.current = null;
      const container = hyperspeed.current;
      if (container) { while (container.firstChild) container.removeChild(container.firstChild); }
    }

    const nsin = (val: number) => Math.sin(val) * 0.5 + 0.5;

    const mountainUniforms = { uFreq: { value: new THREE.Vector3(3, 6, 10) }, uAmp: { value: new THREE.Vector3(30, 30, 20) } };
    const xyUniforms = { uFreq: { value: new THREE.Vector2(5, 2) }, uAmp: { value: new THREE.Vector2(25, 15) } };
    const LongRaceUniforms = { uFreq: { value: new THREE.Vector2(2, 3) }, uAmp: { value: new THREE.Vector2(35, 10) } };
    const turbulentUniforms = { uFreq: { value: new THREE.Vector4(4, 8, 8, 1) }, uAmp: { value: new THREE.Vector4(25, 5, 10, 10) } };
    const distortions: any = {
      mountainDistortion: {
        uniforms: mountainUniforms,
        getDistortion: `
          uniform vec3 uAmp; uniform vec3 uFreq;
          #define PI 3.14159265358979
          float nsin(float val){ return sin(val) * 0.5 + 0.5; }
          vec3 getDistortion(float progress){
            float movementProgressFix = 0.02;
            return vec3(
              cos(progress * PI * uFreq.x + uTime) * uAmp.x - cos(movementProgressFix * PI * uFreq.x + uTime) * uAmp.x,
              nsin(progress * PI * uFreq.y + uTime) * uAmp.y - nsin(movementProgressFix * PI * uFreq.y + uTime) * uAmp.y,
              nsin(progress * PI * uFreq.z + uTime) * uAmp.z - nsin(movementProgressFix * PI * uFreq.z + uTime) * uAmp.z
            );
          }`,
        getJS: (progress: number, time: number) => {
          const f = mountainUniforms.uFreq.value;
          const a = mountainUniforms.uAmp.value;
          return new THREE.Vector3(
            Math.cos(progress * Math.PI * f.x + time) * a.x - Math.cos(0.02 * Math.PI * f.x + time) * a.x,
            nsin(progress * Math.PI * f.y + time) * a.y - nsin(0.02 * Math.PI * f.y + time) * a.y,
            nsin(progress * Math.PI * f.z + time) * a.z - nsin(0.02 * Math.PI * f.z + time) * a.z
          ).multiply(new THREE.Vector3(2, 2, 2)).add(new THREE.Vector3(0, 0, -5));
        }
      },
      xyDistortion: {
        uniforms: xyUniforms,
        getDistortion: `
          uniform vec2 uFreq; uniform vec2 uAmp;
          #define PI 3.14159265358979
          vec3 getDistortion(float progress){
            float movementProgressFix = 0.02;
            return vec3(
              cos(progress * PI * uFreq.x + uTime) * uAmp.x - cos(movementProgressFix * PI * uFreq.x + uTime) * uAmp.x,
              sin(progress * PI * uFreq.y + PI/2. + uTime) * uAmp.y - sin(movementProgressFix * PI * uFreq.y + PI/2. + uTime) * uAmp.y, 0.);
          }`,
        getJS: (progress: number, time: number) => {
          const f = xyUniforms.uFreq.value;
          const a = xyUniforms.uAmp.value;
          return new THREE.Vector3(
            Math.cos(progress * Math.PI * f.x + time) * a.x - Math.cos(0.02 * Math.PI * f.x + time) * a.x,
            Math.sin(progress * Math.PI * f.y + time + Math.PI / 2) * a.y - Math.sin(0.02 * Math.PI * f.y + time + Math.PI / 2) * a.y, 0
          ).multiply(new THREE.Vector3(2, 0.4, 1)).add(new THREE.Vector3(0, 0, -3));
        }
      },
      LongRaceDistortion: {
        uniforms: LongRaceUniforms,
        getDistortion: `
          uniform vec2 uFreq; uniform vec2 uAmp;
          #define PI 3.14159265358979
          vec3 getDistortion(float progress){
            float camProgress = 0.0125;
            return vec3(
              sin(progress * PI * uFreq.x + uTime) * uAmp.x - sin(camProgress * PI * uFreq.x + uTime) * uAmp.x,
              sin(progress * PI * uFreq.y + uTime) * uAmp.y - sin(camProgress * PI * uFreq.y + uTime) * uAmp.y, 0.);
          }`,
        getJS: (progress: number, time: number) => {
          const f = LongRaceUniforms.uFreq.value;
          const a = LongRaceUniforms.uAmp.value;
          return new THREE.Vector3(
            Math.sin(progress * Math.PI * f.x + time) * a.x - Math.sin(0.0125 * Math.PI * f.x + time) * a.x,
            Math.sin(progress * Math.PI * f.y + time) * a.y - Math.sin(0.0125 * Math.PI * f.y + time) * a.y, 0
          ).multiply(new THREE.Vector3(1, 1, 0)).add(new THREE.Vector3(0, 0, -5));
        }
      },
      turbulentDistortion: {
        uniforms: turbulentUniforms,
        getDistortion: `
          uniform vec4 uFreq; uniform vec4 uAmp;
          float nsin(float val){ return sin(val) * 0.5 + 0.5; }
          #define PI 3.14159265358979
          float getDistortionX(float p){ return cos(PI * p * uFreq.r + uTime) * uAmp.r + pow(cos(PI * p * uFreq.g + uTime * (uFreq.g / uFreq.r)), 2.) * uAmp.g; }
          float getDistortionY(float p){ return -nsin(PI * p * uFreq.b + uTime) * uAmp.b - pow(nsin(PI * p * uFreq.a + uTime / (uFreq.b / uFreq.a)), 5.) * uAmp.a; }
          vec3 getDistortion(float progress){ return vec3(getDistortionX(progress) - getDistortionX(0.0125), getDistortionY(progress) - getDistortionY(0.0125), 0.); }
        `,
        getJS: (progress: number, time: number) => {
          const f = turbulentUniforms.uFreq.value;
          const a = turbulentUniforms.uAmp.value;
          const gX = (p: number) => Math.cos(Math.PI * p * f.x + time) * a.x + Math.pow(Math.cos(Math.PI * p * f.y + time * (f.y / f.x)), 2) * a.y;
          const gY = (p: number) => -nsin(Math.PI * p * f.z + time) * a.z - Math.pow(nsin(Math.PI * p * f.w + time / (f.z / f.w)), 5) * a.w;
          return new THREE.Vector3(gX(progress) - gX(0.0195), gY(progress) - gY(0.0195), 0).multiply(new THREE.Vector3(-2, -5, 0)).add(new THREE.Vector3(0, 0, -10));
        }
      },
      turbulentDistortionStill: {
        uniforms: turbulentUniforms,
        getDistortion: `
          uniform vec4 uFreq; uniform vec4 uAmp;
          float nsin(float val){ return sin(val) * 0.5 + 0.5; }
          #define PI 3.14159265358979
          float getDistortionX(float p){ return cos(PI * p * uFreq.r) * uAmp.r + pow(cos(PI * p * uFreq.g * (uFreq.g / uFreq.r)), 2.) * uAmp.g; }
          float getDistortionY(float p){ return -nsin(PI * p * uFreq.b) * uAmp.b - pow(nsin(PI * p * uFreq.a / (uFreq.b / uFreq.a)), 5.) * uAmp.a; }
          vec3 getDistortion(float progress){ return vec3(getDistortionX(progress) - getDistortionX(0.02), getDistortionY(progress) - getDistortionY(0.02), 0.); }
        `
      }
    };

    class CarLights {
      webgl: any; options: any; colors: any; speed: any; fade: any; mesh: any;
      constructor(webgl: any, options: any, colors: any, speed: any, fade: any) {
        this.webgl = webgl; this.options = options; this.colors = colors; this.speed = speed; this.fade = fade;
      }
      init() {
        const opts = this.options;
        const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));
        const geometry = new THREE.TubeGeometry(curve, 40, 1, 8, false);
        const instanced = new THREE.InstancedBufferGeometry();
        (instanced as any).copy(geometry as any);
        instanced.instanceCount = opts.lightPairsPerRoadWay * 2;
        const laneWidth = opts.roadWidth / opts.lanesPerRoad;
        const aOffset: number[] = [];
        const aMetrics: number[] = [];
        const aColor: number[] = [];
        let colors = this.colors.map ? this.colors.map((c: number) => new THREE.Color(c)) : [new THREE.Color(this.colors)];

        for (let i = 0; i < opts.lightPairsPerRoadWay; i++) {
          const radius = opts.carLightsRadius[0] + Math.random() * (opts.carLightsRadius[1] - opts.carLightsRadius[0]);
          const length = opts.carLightsLength[0] + Math.random() * (opts.carLightsLength[1] - opts.carLightsLength[0]);
          const spd = this.speed[0] + Math.random() * (this.speed[1] - this.speed[0]);
          const carLane = i % opts.lanesPerRoad;
          let laneX = carLane * laneWidth - opts.roadWidth / 2 + laneWidth / 2;
          const carW = (opts.carWidthPercentage[0] + Math.random() * (opts.carWidthPercentage[1] - opts.carWidthPercentage[0])) * laneWidth;
          laneX += opts.carShiftX[0] + Math.random() * (opts.carShiftX[1] - opts.carShiftX[0]);
          const offY = opts.carFloorSeparation[0] + Math.random() * (opts.carFloorSeparation[1] - opts.carFloorSeparation[0]) + radius * 1.3;
          const offZ = -Math.random() * opts.length;
          for (let s = 0; s < 2; s++) {
            aOffset.push(laneX + (s ? 1 : -1) * carW / 2, offY, offZ);
            aMetrics.push(radius, length, spd);
            const c = Array.isArray(colors) ? colors[Math.floor(Math.random() * colors.length)] : colors;
            aColor.push(c.r, c.g, c.b);
          }
        }
        instanced.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(aOffset), 3, false));
        instanced.setAttribute('aMetrics', new THREE.InstancedBufferAttribute(new Float32Array(aMetrics), 3, false));
        instanced.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(aColor), 3, false));

        const material = new THREE.ShaderMaterial({
          fragmentShader: carLightsFragment, vertexShader: carLightsVertex,
          transparent: true,
          uniforms: { uTime: { value: 0 }, uTravelLength: { value: opts.length }, uFade: { value: this.fade }, ...this.webgl.fogUniforms, ...opts.distortion.uniforms }
        });
        material.onBeforeCompile = (shader: any) => { shader.vertexShader = shader.vertexShader.replace('#include <getDistortion_vertex>', opts.distortion.getDistortion); };
        const mesh = new THREE.Mesh(instanced, material);
        mesh.frustumCulled = false;
        this.webgl.scene.add(mesh);
        this.mesh = mesh;
      }
      update(time: number) { if (this.mesh) this.mesh.material.uniforms.uTime.value = time; }
    }

    const carLightsFragment = `
      varying vec3 vColor; varying vec2 vUv;
      uniform vec2 uFade;
      void main() {
        vec3 color = vec3(vColor);
        float alpha = smoothstep(uFade.x, uFade.y, vUv.x);
        gl_FragColor = vec4(color, alpha);
        if (gl_FragColor.a < 0.0001) discard;
      }`;
    const carLightsVertex = `
      attribute vec3 aOffset; attribute vec3 aMetrics; attribute vec3 aColor;
      uniform float uTravelLength; uniform float uTime;
      varying vec2 vUv; varying vec3 vColor;
      #include <getDistortion_vertex>
      void main() {
        vec3 t = position.xyz; float r = aMetrics.x, mL = aMetrics.y, spd = aMetrics.b;
        t.xy *= r; t.z *= mL; t.z += mL - mod(uTime * spd + aOffset.z, uTravelLength);
        t.xy += aOffset.xy;
        float progress = abs(t.z / uTravelLength);
        t.xyz += getDistortion(progress);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(t, 1.);
        vUv = uv; vColor = aColor;
      }`;

    class LightsSticks {
      webgl: any; options: any; mesh: any;
      constructor(webgl: any, options: any) { this.webgl = webgl; this.options = options; }
      init() {
        const opts = this.options;
        const geometry = new THREE.PlaneGeometry(1, 1);
        const instanced = new THREE.InstancedBufferGeometry();
        (instanced as any).copy(geometry as any);
        const total = opts.totalSideLightSticks;
        instanced.instanceCount = total;
        const aOffset: number[] = [];
        const aColor: number[] = [];
        const aMetrics: number[] = [];
        const stickOffset = opts.length / (total - 1);
        const colors = Array.isArray(opts.colors.sticks) ? opts.colors.sticks.map((c: number) => new THREE.Color(c)) : [new THREE.Color(opts.colors.sticks)];

        for (let i = 0; i < total; i++) {
          const w = opts.lightStickWidth[0] + Math.random() * (opts.lightStickWidth[1] - opts.lightStickWidth[0]);
          const h = opts.lightStickHeight[0] + Math.random() * (opts.lightStickHeight[1] - opts.lightStickHeight[0]);
          aOffset.push((i - 1) * stickOffset * 2 + stickOffset * Math.random());
          const c = Array.isArray(colors) ? colors[Math.floor(Math.random() * colors.length)] : colors;
          aColor.push(c.r, c.g, c.b);
          aMetrics.push(w, h);
        }
        instanced.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(aOffset), 1, false));
        instanced.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(aColor), 3, false));
        instanced.setAttribute('aMetrics', new THREE.InstancedBufferAttribute(new Float32Array(aMetrics), 2, false));

        const material = new THREE.ShaderMaterial({
          fragmentShader: `varying vec3 vColor; void main(){ gl_FragColor = vec4(vColor,1.); }`,
          vertexShader: `
            attribute float aOffset; attribute vec3 aColor; attribute vec2 aMetrics;
            uniform float uTravelLength; uniform float uTime;
            varying vec3 vColor;
            mat4 rotationY(float a) { return mat4(cos(a),0,sin(a),0, 0,1,0,0, -sin(a),0,cos(a),0, 0,0,0,1); }
            #include <getDistortion_vertex>
            void main() {
              vec3 t = position.xyz; t.xy *= vec2(aMetrics.x, aMetrics.y);
              t = (rotationY(3.14/2.) * vec4(t,1.)).xyz;
              t.z += -uTravelLength + mod(uTime * 60. * 2. + aOffset, uTravelLength);
              float p = abs(t.z / uTravelLength);
              t.xyz += getDistortion(p); t.y += aMetrics.y/2.; t.x += -aMetrics.x/2.;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(t,1.);
              vColor = aColor;
            }`,
          side: THREE.DoubleSide,
          uniforms: { uTravelLength: { value: opts.length }, uTime: { value: 0 }, ...this.webgl.fogUniforms, ...opts.distortion.uniforms }
        });
        material.onBeforeCompile = (shader: any) => { shader.vertexShader = shader.vertexShader.replace('#include <getDistortion_vertex>', opts.distortion.getDistortion); };
        const mesh = new THREE.Mesh(instanced, material);
        mesh.frustumCulled = false;
        this.webgl.scene.add(mesh);
        this.mesh = mesh;
      }
      update(time: number) { if (this.mesh) this.mesh.material.uniforms.uTime.value = time; }
    }

    class Road {
      webgl: any; options: any; uTime: any; leftRoadWay: any; rightRoadWay: any; island: any;
      constructor(webgl: any, options: any) { this.webgl = webgl; this.options = options; this.uTime = { value: 0 }; }
      createPlane(side: number, _width: number, isRoad: boolean) {
        const opts = this.options;
        const segs = 100;
        const geometry = new THREE.PlaneGeometry(isRoad ? opts.roadWidth : opts.islandWidth, opts.length, 20, segs);
        const uniforms: any = { uTravelLength: { value: opts.length }, uColor: { value: new THREE.Color(isRoad ? opts.colors.roadColor : opts.colors.islandColor) }, uTime: this.uTime };
        if (isRoad) Object.assign(uniforms, {
          uLanes: { value: opts.lanesPerRoad }, uBrokenLinesColor: { value: new THREE.Color(opts.colors.brokenLines) },
          uShoulderLinesColor: { value: new THREE.Color(opts.colors.shoulderLines) },
          uShoulderLinesWidthPercentage: { value: opts.shoulderLinesWidthPercentage },
          uBrokenLinesLengthPercentage: { value: opts.brokenLinesLengthPercentage },
          uBrokenLinesWidthPercentage: { value: opts.brokenLinesWidthPercentage }
        });
        const material = new THREE.ShaderMaterial({
          fragmentShader: isRoad ? roadFragment : islandFragment, vertexShader: roadVertex,
          side: THREE.DoubleSide, uniforms: { ...uniforms, ...this.webgl.fogUniforms, ...opts.distortion.uniforms }
        });
        material.onBeforeCompile = (shader: any) => { shader.vertexShader = shader.vertexShader.replace('#include <getDistortion_vertex>', opts.distortion.getDistortion); };
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.z = -opts.length / 2;
        mesh.position.x += (opts.islandWidth / 2 + opts.roadWidth / 2) * side;
        this.webgl.scene.add(mesh);
        return mesh;
      }
      init() { this.leftRoadWay = this.createPlane(-1, this.options.roadWidth, true); this.rightRoadWay = this.createPlane(1, this.options.roadWidth, true); this.island = this.createPlane(0, this.options.islandWidth, false); }
      update(time: number) { this.uTime.value = time; }
    }

    const roadBaseFragment = `
      varying vec2 vUv; uniform vec3 uColor;
      void main() { vec2 uv = vUv; vec3 color = vec3(uColor); gl_FragColor = vec4(color, 1.); }`;
    const islandFragment = roadBaseFragment;
    const roadMarkings_fragment = `
      uv.y = mod(uv.y + uTime * 0.05, 1.);
      float laneWidth = 1.0 / uLanes;
      float brokenLineWidth = laneWidth * uBrokenLinesWidthPercentage;
      float laneEmptySpace = 1. - uBrokenLinesLengthPercentage;
      float brokenLines = step(1.0 - brokenLineWidth, fract(uv.x * 2.0)) * step(laneEmptySpace, fract(uv.y * 10.0));
      float sideLines = step(1.0 - brokenLineWidth, fract((uv.x - laneWidth * (uLanes - 1.0)) * 2.0)) + step(brokenLineWidth, uv.x);
      brokenLines = mix(brokenLines, sideLines, uv.x);
    `;
    const roadFragment = `
      varying vec2 vUv; uniform vec3 uColor; uniform float uTime;
      uniform float uLanes; uniform vec3 uBrokenLinesColor; uniform vec3 uShoulderLinesColor;
      uniform float uShoulderLinesWidthPercentage; uniform float uBrokenLinesWidthPercentage;
      uniform float uBrokenLinesLengthPercentage;
      void main() {
        vec2 uv = vUv; vec3 color = vec3(uColor);
        ${roadMarkings_fragment}
        vec3 markings = mix(uShoulderLinesColor, uBrokenLinesColor, brokenLines);
        color = mix(color, markings, brokenLines);
        gl_FragColor = vec4(color, 1.);
      }`;
    const roadVertex = `
      uniform float uTravelLength; uniform float uTime;
      varying vec2 vUv;
      #include <getDistortion_vertex>
      void main() {
        vec3 t = position.xyz;
        vec3 d = getDistortion((t.y + uTravelLength / 2.) / uTravelLength);
        t.x += d.x; t.z += d.y; t.y += -1. * d.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(t, 1.);
        vUv = uv;
      }`;

    class App {
      container: any; options: any; renderer: any; composer: any; camera: any; scene: any; clock: any;
      road: any; leftCarLights: any; rightCarLights: any; leftSticks: any;
      fovTarget: number; speedUpTarget: number; speedUp: number; timeOffset: number;
      fogUniforms: any; disposed: boolean; hasValidSize: boolean;
      renderPass: any; bloomPass: any; smaaPass: any;

      constructor(container: any, options: any) {
        this.options = options;
        this.container = container;
        this.disposed = false;
        this.hasValidSize = false;

        const initW = Math.max(1, container.offsetWidth);
        const initH = Math.max(1, container.offsetHeight);

        this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
        this.renderer.setSize(initW, initH, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.composer = new EffectComposer(this.renderer);
        container.append(this.renderer.domElement);

        this.camera = new THREE.PerspectiveCamera(options.fov, initW / initH, 0.1, 10000);
        this.camera.position.z = -5; this.camera.position.y = 8;
        this.scene = new THREE.Scene();
        this.scene.background = null;

        const fog = new THREE.Fog(options.colors.background, options.length * 0.2, options.length * 500);
        this.scene.fog = fog;
        this.fogUniforms = { fogColor: { value: fog.color }, fogNear: { value: fog.near }, fogFar: { value: fog.far } };
        this.clock = new THREE.Clock();

        this.road = new Road(this, options);
        this.leftCarLights = new CarLights(this, options, options.colors.leftCars, options.movingAwaySpeed, new THREE.Vector2(0, 1 - options.carLightsFade));
        this.rightCarLights = new CarLights(this, options, options.colors.rightCars, options.movingCloserSpeed, new THREE.Vector2(1, 0 + options.carLightsFade));
        this.leftSticks = new LightsSticks(this, options);

        this.fovTarget = options.fov; this.speedUpTarget = 0; this.speedUp = 0; this.timeOffset = 0;
        this.tick = this.tick.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchEnd = this.onTouchEnd.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
        window.addEventListener('resize', this.onWindowResize);
        if (container.offsetWidth > 0 && container.offsetHeight > 0) this.hasValidSize = true;
      }

      onWindowResize() {
        const w = this.container.offsetWidth, h = this.container.offsetHeight;
        if (w <= 0 || h <= 0) { this.hasValidSize = false; return; }
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
        this.composer.setSize(w, h);
        this.hasValidSize = true;
      }

      initPasses() {
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.bloomPass = new EffectPass(this.camera, new BloomEffect({ luminanceThreshold: 0.2, luminanceSmoothing: 0, resolutionScale: 1 }));
        this.bloomPass.renderToScreen = true;
        this.composer.addPass(this.renderPass);
        this.composer.addPass(this.bloomPass);
      }

      loadAssets() { return Promise.resolve(); }

      init() {
        this.initPasses();
        const o = this.options;
        this.road.init();
        this.leftCarLights.init(); this.leftCarLights.mesh.position.setX(-o.roadWidth / 2 - o.islandWidth / 2);
        this.rightCarLights.init(); this.rightCarLights.mesh.position.setX(o.roadWidth / 2 + o.islandWidth / 2);
        this.leftSticks.init(); this.leftSticks.mesh.position.setX(-(o.roadWidth + o.islandWidth / 2));
        this.container.addEventListener('mousedown', this.onMouseDown);
        this.container.addEventListener('mouseup', this.onMouseUp);
        this.container.addEventListener('touchstart', this.onTouchStart, { passive: true });
        this.container.addEventListener('touchend', this.onTouchEnd, { passive: true });
        this.tick();
      }

      onMouseDown() { this.fovTarget = this.options.fovSpeedUp; this.speedUpTarget = this.options.speedUp; }
      onMouseUp() { this.fovTarget = this.options.fov; this.speedUpTarget = 0; }
      onTouchStart() { this.fovTarget = this.options.fovSpeedUp; this.speedUpTarget = this.options.speedUp; }
      onTouchEnd() { this.fovTarget = this.options.fov; this.speedUpTarget = 0; }

      lerp(c: number, t: number, s = 0.1, l = 0.001) { let ch = (t - c) * s; if (Math.abs(ch) < l) ch = t - c; return ch; }

      update(delta: number) {
        const lp = Math.exp(-(-60 * Math.log2(0.9)) * delta);
        this.speedUp += this.lerp(this.speedUp, this.speedUpTarget, lp, 0.00001);
        this.timeOffset += this.speedUp * delta;
        const time = this.clock.elapsedTime + this.timeOffset;
        this.rightCarLights.update(time);
        this.leftCarLights.update(time);
        this.leftSticks.update(time);
        this.road.update(time);
        let updateCamera = false;
        const fovCh = this.lerp(this.camera.fov, this.fovTarget, lp);
        if (fovCh !== 0) { this.camera.fov += fovCh * delta * 6; updateCamera = true; }
        if (this.options.distortion.getJS) {
          const d = this.options.distortion.getJS(0.025, time);
          this.camera.lookAt(new THREE.Vector3(this.camera.position.x + d.x, this.camera.position.y + d.y, this.camera.position.z + d.z));
          updateCamera = true;
        }
        if (updateCamera) this.camera.updateProjectionMatrix();
      }

      render(delta: number) { this.composer.render(delta); }

      dispose() {
        this.disposed = true;
        if (this.scene) { this.scene.traverse((o: any) => { if (o.isMesh) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose()); else o.material.dispose(); } } }); this.scene.clear(); }
        if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); if (this.renderer.domElement && this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement); }
        if (this.composer) this.composer.dispose();
        window.removeEventListener('resize', this.onWindowResize);
        window.removeEventListener('mousedown', this.onMouseDown);
        [this.container].forEach(c => { if (c) { c.removeEventListener('mousedown', c._md); c.removeEventListener('mouseup', c._mu); c.removeEventListener('touchstart', c._ts); c.removeEventListener('touchend', c._te); } });
      }

      tick() {
        if (this.disposed) return;
        if (!this.hasValidSize) {
          const w = this.container.offsetWidth, h = this.container.offsetHeight;
          if (w > 0 && h > 0) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.composer.setSize(w, h); this.hasValidSize = true; }
          else { requestAnimationFrame(this.tick.bind(this)); return; }
        }
        const canvas = this.renderer.domElement;
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
          this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
          if (this.hasValidSize) { this.camera.aspect = canvas.clientWidth / canvas.clientHeight; this.camera.updateProjectionMatrix(); }
        }
        if (this.hasValidSize) { const d = this.clock.getDelta(); this.render(d); this.update(d); }
        requestAnimationFrame(this.tick.bind(this));
      }
    }

    const container = hyperspeed.current;
    if (!container) return;

    const options = { ...DEFAULT_EFFECT_OPTIONS, ...effectOptions, colors: { ...DEFAULT_EFFECT_OPTIONS.colors, ...effectOptions.colors } };
    options.distortion = distortions[options.distortion];

    const myApp = new App(container, options);
    appRef.current = myApp;
    myApp.loadAssets().then(() => myApp.init());

    return () => { if (appRef.current) { appRef.current.dispose(); appRef.current = null; } };
  }, [effectOptions]);

  return <div id="lights" ref={hyperspeed} />;
};

export default Hyperspeed;
