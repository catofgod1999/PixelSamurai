
import React, { useRef, useEffect, useCallback } from 'react';
import {
    EntityType, GameState, Entity, Bullet, Particle, GorePart, WallSplatter, StickingBlood, ActionRecord, Vector2, Bird
} from '../types';
import {
    CANVAS_WIDTH, CANVAS_HEIGHT, COLORS, GRAVITY, FRICTION,
    PLAYER_SPEED, JUMP_FORCE, ATTACK_DURATION, BULLET_SPEED, STYLE_DECAY,
    SLOW_MO_FACTOR, SLOW_MO_DRAIN_PER_SEC, CLASH_DRAIN_RATE, CLASH_GAIN_PER_TAP, CLASH_WIN_THRESHOLD
} from '../constants';

const STYLE_RANKS = [
    { name: 'D', threshold: 0 },
    { name: 'C', threshold: 1000 },
    { name: 'B', threshold: 2500 },
    { name: 'A', threshold: 5000 },
    { name: 'S', threshold: 8500 },
    { name: 'SS', threshold: 13000 },
    { name: 'SSS', threshold: 19000 },
    { name: 'OMG', threshold: 27000 },
    { name: 'GOD', threshold: 38000 }
];

interface Graffiti {
    x: number;
    y: number;
    text?: string;
    type: 'text' | 'shape';
    color: string;
    rotation: number;
    scale: number;
}

class AudioEngine {
    ctx: AudioContext | null = null;
    assets: { [key: string]: AudioBuffer } = {};
    activeLoops: { [key: string]: { source: AudioBufferSourceNode, gain: GainNode } } = {};
    isInitialized = false;

    masterLimiter: DynamicsCompressorNode | null = null;
    masterGain: GainNode | null = null;
    noiseBuffer: AudioBuffer | null = null;

    lastPlayedTimes: { [key: string]: number } = {};
    spamDetection: { [key: string]: { count: number, lastTime: number } } = {};

    playHistory: { [key: string]: number[] } = {
        'enemy_hit': [],
        'enemy_death': [],
        'whoosh': []
    };

    async init() {
        if (this.isInitialized) return;
        if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1.0;
        this.masterLimiter = this.ctx.createDynamicsCompressor();
        this.masterLimiter.threshold.setValueAtTime(-1, this.ctx.currentTime);
        this.masterLimiter.knee.setValueAtTime(0, this.ctx.currentTime);
        this.masterLimiter.ratio.setValueAtTime(20, this.ctx.currentTime);
        this.masterLimiter.attack.setValueAtTime(0, this.ctx.currentTime);
        this.masterLimiter.release.setValueAtTime(0.1, this.ctx.currentTime);

        this.masterGain.connect(this.masterLimiter);
        this.masterLimiter.connect(this.ctx.destination);

        const bufferSize = this.ctx.sampleRate * 0.1;
        this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const sfxFiles = [
            'atk_1', 'atk_2', 'atk_3', 'launch', 'slam', 'slam_hit', 'field_release', 'dodge', 'dash_attack',
            'focus_enter', 'focus_exit', 'focus_loop',
            'clash_loop', 'clash_win', 'clash_lose',
            'hit_enemy_1', 'hit_enemy_2', 'hit_enemy_3',
            'die_enemy_1', 'die_enemy_2', 'die_enemy_3',
            'die_player', 'reflect', 'explosion', 'boss_spawn', 'boss_death'
        ];

        // 使用相对根路径确保在 Vercel 这种 CDN 环境下也能准确定位
        const loadPromises = sfxFiles.map(name => this.loadAsset(name, `assets/audio/sfx/${name}.mp3`));
        loadPromises.push(this.loadAsset('bgm', `assets/audio/bgm/battle_loop.mp3`));

        await Promise.all(loadPromises);
        this.isInitialized = true;
    }

    private canPlay(category: string, limit: number, window: number): boolean {
        const now = Date.now();
        const history = this.playHistory[category] || [];
        const validHistory = history.filter(time => now - time < window * 1000);
        this.playHistory[category] = validHistory;
        if (validHistory.length >= limit) return false;
        this.playHistory[category].push(now);
        return true;
    }

    async loadAsset(name: string, url: string) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
            this.assets[name] = audioBuffer;
        } catch (e) {
            console.warn(`Audio source error: ${name} @ ${url}`, e);
        }
    }

    playAsset(name: string, volume = 0.3, pitch = 1) {
        if (!this.ctx || !this.assets[name] || !this.masterGain) return null;
        const now = Date.now();
        if (!this.spamDetection[name]) this.spamDetection[name] = { count: 0, lastTime: 0 };
        if (now - this.spamDetection[name].lastTime < 160) {
            this.spamDetection[name].count++;
            if (this.spamDetection[name].count > 1) return null;
        } else {
            this.spamDetection[name].count = 0;
            this.spamDetection[name].lastTime = now;
        }
        const source = this.ctx.createBufferSource();
        source.buffer = this.assets[name];
        source.playbackRate.value = pitch;
        const gain = this.ctx.createGain();
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(this.masterGain);
        source.start();
        return source;
    }

    playEnemyHit(isFieldActive: boolean) {
        if (isFieldActive) return;
        if (!this.canPlay('enemy_hit', 4, 0.3)) return;
        const pick = ['hit_enemy_1', 'hit_enemy_2', 'hit_enemy_3'][Math.floor(Math.random() * 3)];
        this.assets[pick] ? this.playAsset(pick, 0.22) : this.playProceduralHit('hit_flesh');
    }

    playEnemyDeath() {
        if (!this.canPlay('enemy_death', 3, 0.5)) return;
        const pick = ['die_enemy_1', 'die_enemy_2', 'die_enemy_3'][Math.floor(Math.random() * 3)];
        this.assets[pick] ? this.playAsset(pick, 0.35) : this.playProceduralHit('explosion');
    }

    playProceduralWhoosh(pitch = 1) {
        if (!this.ctx || !this.noiseBuffer || !this.masterGain) return;
        const nowMs = Date.now();
        if (this.lastPlayedTimes['whoosh_proc'] && nowMs - this.lastPlayedTimes['whoosh_proc'] < 160) return;
        this.lastPlayedTimes['whoosh_proc'] = nowMs;
        const now = this.ctx.currentTime;
        const gain = this.ctx.createGain();
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000 * pitch, now);
        filter.frequency.exponentialRampToValueAtTime(10, now + 0.1);
        noise.connect(filter); filter.connect(gain); gain.connect(this.masterGain);
        gain.gain.setValueAtTime(0.012, now); gain.gain.linearRampToValueAtTime(0, now + 0.1);
        noise.start();
    }

    playProceduralHit(type: string) {
        if (!this.ctx || !this.masterGain) return;
        const now = this.ctx.currentTime;
        const gain = this.ctx.createGain(); gain.connect(this.masterGain);
        const osc = this.ctx.createOscillator();
        if (type === 'hit_flesh') {
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(80, now); osc.frequency.linearRampToValueAtTime(10, now + 0.15);
            gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.15);
        } else {
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(60, now); osc.frequency.exponentialRampToValueAtTime(1, now + 0.5);
            gain.gain.setValueAtTime(0.25, now); gain.gain.linearRampToValueAtTime(0, now + 0.5);
        }
        osc.start(); osc.stop(now + 0.5);
    }

    playPlayerAttack() {
        const pick = ['atk_1', 'atk_2', 'atk_3'][Math.floor(Math.random() * 3)];
        this.assets[pick] ? this.playAsset(pick, 0.2) : this.playProceduralWhoosh(1.2);
    }

    startLoop(name: string, volume = 0.2) {
        if (!this.ctx || !this.assets[name] || this.activeLoops[name] || !this.masterGain) return;
        const source = this.ctx.createBufferSource();
        source.buffer = this.assets[name];
        source.loop = true;
        const gain = this.ctx.createGain();
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(this.masterGain);
        source.start();
        this.activeLoops[name] = { source, gain };
    }

    updateLoopVolume(name: string, volume: number) {
        if (this.activeLoops[name]) {
            const now = this.ctx?.currentTime || 0;
            this.activeLoops[name].gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), now + 0.2);
        }
    }

    stopLoop(name: string) {
        if (this.activeLoops[name]) {
            try { this.activeLoops[name].source.stop(); this.activeLoops[name].source.disconnect(); this.activeLoops[name].gain.disconnect(); } catch (e) { }
            delete this.activeLoops[name];
        }
    }

    playBGM() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        this.startLoop('bgm', 0.15);
    }
    stopBGM() { this.stopLoop('bgm'); }
}

const audio = new AudioEngine();

interface GameProps {
    currentGameState: GameState;
    onStateChange: (state: GameState) => void;
    onScoreUpdate: (score: number) => void;
    language: 'en' | 'zh';
    isMusicOn: boolean;
}

const Game: React.FC<GameProps> = ({ currentGameState, onStateChange, onScoreUpdate, language, isMusicOn }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(undefined);
    const cameraXRef = useRef(0);
    const cameraYRef = useRef(0);
    const wallSplattersRef = useRef<WallSplatter[]>([]);
    const gorePartsRef = useRef<GorePart[]>([]);
    const particlesRef = useRef<Particle[]>([]);
    const bulletsRef = useRef<Bullet[]>([]);
    const enemiesRef = useRef<Entity[]>([]);
    const birdsRef = useRef<Bird[]>([]);
    const stylePointsRef = useRef(0);
    const lastSkillUsedRef = useRef<string | null>(null);
    
    // --- CAMERA INITIALIZATION ---
    const cameraZoomRef = useRef(0.4);
    const cameraTargetZoomRef = useRef(0.4);
    const userZoomRef = useRef(0.4); 

    const lastAttackTimeRef = useRef(Date.now());
    const prevHealthRef = useRef(100);
    const clashProgressRef = useRef(40);
    const clashTimerRef = useRef(300);
    const clashTargetIdRef = useRef<string | null>(null);
    const clashCooldownRef = useRef(0);
    const killComboRef = useRef(0);
    const lastKillTimeRef = useRef(0);
    
    // --- NEW SPAWN MECHANICS ---
    const enemySpawnCountInCycleRef = useRef(0);
    const bossIndicesInCycleRef = useRef<number[]>([]);
    
    const inputHistoryRef = useRef<{ key: string, time: number }[]>([]);
    const jDownTimeRef = useRef<number | null>(null);
    const lDownTimeRef = useRef<number | null>(null);
    const graffitiRef = useRef<Graffiti[]>([]);
    const actionHistoryRef = useRef<ActionRecord[]>([]);
    const decoyRef = useRef<Entity | null>(null);

    // --- CAPE MUCH SMALLER (Final refinement) ---
    const initCapePoints = (x: number, y: number): Vector2[] => {
        const points: Vector2[] = [];
        for (let i = 0; i < 4; i++) points.push({ x: x - i * 1.5, y: y + i * 1.5 });
        return points;
    };

    const playerRef = useRef<Entity>({
        id: 'player', type: EntityType.PLAYER, pos: { x: 200, y: 300 }, vel: { x: 0, y: 0 },
        width: 45, height: 85, health: 100, maxHealth: 100, facing: 1, state: 'idle',
        stateTimer: 0, canAttack: true, attackCooldown: 0, comboIndex: 0, comboResetTimer: 0, windup: 0,
        bloodOnBody: [], lastTapTime: {}, airComboCount: 0, dodgeCooldown: 0,
        slowMoEnergy: 300, isSlowMoActive: false,
        capePoints: initCapePoints(200, 300)
    });

    const keysRef = useRef<{ [key: string]: boolean }>({});
    const processedKeysRef = useRef<{ [key: string]: boolean }>({});
    const scoreRef = useRef(0);
    const spawnTimerRef = useRef(80);
    const cameraShakeRef = useRef(0);
    const hitStopRef = useRef(0);

    const generateBossIndices = () => {
        const indices: number[] = [];
        while (indices.length < 2) {
            const idx = Math.floor(Math.random() * 15) + 1;
            if (!indices.includes(idx)) indices.push(idx);
        }
        bossIndicesInCycleRef.current = indices;
    };

    const generateInitialGraffiti = useCallback(() => {
        const graffiti: Graffiti[] = [];
        const words = ['NEVER DIE', 'PUNK', 'SAMURAI', 'REBEL', 'FUCK CAPITAL', 'METAL', 'CLASH', 'ZERO', 'SHINOBI', 'REVOLUTION', 'CHAOS', 'RISE UP', 'RESIST', 'ANARCHY', 'NO MASTERS', 'FUTURE IS DEAD', 'LIBERTY', 'WAKE UP', 'DESTROY', 'FIGHT SYSTEM'];
        for (let i = -150; i < 300; i++) {
            const segmentX = i * 400;
            if (Math.random() > 0.4) {
                graffiti.push({
                    x: segmentX + Math.random() * 200,
                    y: 150 + Math.random() * 150,
                    text: words[Math.floor(Math.random() * words.length)],
                    type: 'text',
                    color: COLORS.GRAFFITI[Math.floor(Math.random() * COLORS.GRAFFITI.length)],
                    rotation: (Math.random() - 0.5) * 0.4,
                    scale: 0.8 + Math.random() * 1.5
                });
            }
            if (Math.random() > 0.6) {
                graffiti.push({
                    x: segmentX + Math.random() * 200,
                    y: 150 + Math.random() * 150,
                    type: 'shape',
                    color: COLORS.GRAFFITI[Math.floor(Math.random() * COLORS.GRAFFITI.length)],
                    rotation: Math.random() * Math.PI * 2,
                    scale: 1 + Math.random() * 2
                });
            }
        }
        graffitiRef.current = graffiti;
    }, []);

    const resetGame = useCallback(() => {
        playerRef.current = {
            id: 'player', type: EntityType.PLAYER, pos: { x: 200, y: 300 }, vel: { x: 0, y: 0 },
            width: 45, height: 85, health: 100, maxHealth: 100, facing: 1, state: 'idle',
            stateTimer: 0, canAttack: true, attackCooldown: 0, comboIndex: 0, comboResetTimer: 0, windup: 0,
            bloodOnBody: [], lastTapTime: {}, airComboCount: 0, dodgeCooldown: 0,
            slowMoEnergy: 300, isSlowMoActive: false,
            capePoints: initCapePoints(200, 300)
        };
        enemiesRef.current = []; bulletsRef.current = []; particlesRef.current = []; birdsRef.current = [];
        gorePartsRef.current = []; wallSplattersRef.current = []; scoreRef.current = 0; stylePointsRef.current = 0;
        killComboRef.current = 0; lastKillTimeRef.current = 0;
        enemySpawnCountInCycleRef.current = 0;
        generateBossIndices();
        clashProgressRef.current = 40; clashTargetIdRef.current = null;
        clashCooldownRef.current = 0; lastSkillUsedRef.current = null;
        lastAttackTimeRef.current = Date.now();
        prevHealthRef.current = 100;
        decoyRef.current = null;
        actionHistoryRef.current = [];
        generateInitialGraffiti();
        onScoreUpdate(0);
    }, [generateInitialGraffiti, onScoreUpdate]);

    useEffect(() => {
        if (currentGameState === GameState.PLAYING) {
            if (isMusicOn) { audio.init().then(() => audio.playBGM()); } else { audio.stopBGM(); }
        } else if (currentGameState === GameState.GAME_OVER || currentGameState === GameState.START || currentGameState === GameState.GUIDE) {
            audio.stopBGM();
        }
    }, [isMusicOn, currentGameState]);

    const prevGameStateRef = useRef<GameState>(currentGameState);

    useEffect(() => {
        if (currentGameState === GameState.PLAYING) {
            if (graffitiRef.current.length === 0) generateInitialGraffiti();
            if (prevGameStateRef.current === GameState.GAME_OVER || prevGameStateRef.current === GameState.START) resetGame();
        }
        if (currentGameState === GameState.GAME_OVER) { audio.stopLoop('focus_loop'); audio.playAsset('die_player', 0.6); }
        if (currentGameState === GameState.CLASHING) { audio.updateLoopVolume('bgm', 0.05); audio.startLoop('clash_loop', 0.4); } 
        else if (prevGameStateRef.current === GameState.CLASHING) { audio.updateLoopVolume('bgm', 0.15); audio.stopLoop('clash_loop'); }
        prevGameStateRef.current = currentGameState;
    }, [currentGameState, resetGame, generateInitialGraffiti]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'KeyJ' && !keysRef.current[e.code]) jDownTimeRef.current = Date.now();
            if (e.code === 'KeyL' && !keysRef.current[e.code]) lDownTimeRef.current = Date.now();
            if (!keysRef.current[e.code]) {
                inputHistoryRef.current.push({ key: e.code, time: Date.now() });
                if (inputHistoryRef.current.length > 10) inputHistoryRef.current.shift();
            }
            keysRef.current[e.code] = true;
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'KeyJ') { 
                jDownTimeRef.current = null; 
                if (playerRef.current.state === 'spin_attack') { 
                    playerRef.current.state = 'idle'; 
                    playerRef.current.stateTimer = 0; 
                    audio.stopLoop('focus_loop'); 
                } 
            }
            if (e.code === 'KeyL') {
                const holdTime = lDownTimeRef.current ? Date.now() - lDownTimeRef.current : 0;
                const p = playerRef.current;
                if (holdTime < 300 && p.dodgeCooldown <= 0 && p.state !== 'hurt') {
                    p.state = 'dodge'; 
                    p.stateTimer = 16; 
                    p.vel.x = p.facing * 63; 
                    p.dodgeCooldown = 35; 
                    audio.playAsset('dodge', 0.4);
                } else if (holdTime >= 300 && p.dodgeCooldown <= 0 && (p.slowMoEnergy || 0) > 30) {
                    if (!decoyRef.current) {
                        decoyRef.current = { 
                            ...p, 
                            id: 'decoy-' + Date.now(), 
                            type: EntityType.DECOY, 
                            bloodOnBody: [],
                            pos: { ...p.pos }
                        };
                        audio.playAsset('field_release', 0.4);
                    }
                }
                lDownTimeRef.current = null;
            }
            keysRef.current[e.code] = false;
            processedKeysRef.current[e.code] = false;
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const handlePointer = (e: PointerEvent) => {
            if (currentGameState !== GameState.PLAYING) return;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height;
            const cx = (e.clientX - rect.left) * scaleX; const cy = (e.clientY - rect.top) * scaleY;
            const sx = 330, sy = 40, sw = 140, sh = 30;
            if (cx >= sx && cx <= sx + sw && cy >= sy && cy <= sy + sh) {
                const ratio = Math.max(0, Math.min(1, (cx - sx - 10) / (sw - 20)));
                userZoomRef.current = 0.4 + ratio * (1.5 - 0.4);
            }
        };
        const onMove = (e: PointerEvent) => { if (e.buttons > 0) handlePointer(e); };
        canvas.addEventListener('pointerdown', handlePointer);
        canvas.addEventListener('pointermove', onMove);
        return () => { canvas.removeEventListener('pointerdown', handlePointer); canvas.removeEventListener('pointermove', onMove); };
    }, [currentGameState]);

    const getStyleData = () => { 
        const p = stylePointsRef.current; 
        let current = STYLE_RANKS[0];
        let next = STYLE_RANKS[1];
        let index = 0;
        for (let i = 0; i < STYLE_RANKS.length; i++) {
            if (p >= STYLE_RANKS[i].threshold) {
                current = STYLE_RANKS[i];
                next = STYLE_RANKS[i+1] || STYLE_RANKS[i];
                index = i;
            }
        }
        const range = next.threshold - current.threshold;
        const progress = range === 0 ? 1.0 : (p - current.threshold) / range;
        return { current, progress, index };
    };

    const addStyle = (amount: number, skillName: string) => { 
        const p = playerRef.current;
        const groundY = CANVAS_HEIGHT - 40;
        const isInAir = p.pos.y < groundY - p.height - 5;
        if (skillName === 'parry') {
            const currentRankData = getStyleData();
            const nextLevelIdx = currentRankData.index + 1;
            const nextLevelThreshold = STYLE_RANKS[Math.min(nextLevelIdx, STYLE_RANKS.length - 1)].threshold;
            stylePointsRef.current = Math.max(stylePointsRef.current, nextLevelThreshold);
        }
        let multiplier = skillName === lastSkillUsedRef.current ? 1.0 : 2.5;
        if (isInAir) multiplier *= 2.0;
        if (p.isSlowMoActive) multiplier *= 2.0;
        const gain = (amount * multiplier) * 0.1;
        stylePointsRef.current = Math.min(45000, stylePointsRef.current + gain); 
        lastAttackTimeRef.current = Date.now();
        lastSkillUsedRef.current = skillName;
    };
    
    const addParticles = (x: number, y: number, color: string, count: number, isBlood = false, force = 1) => {
        if (particlesRef.current.length > 2500) particlesRef.current.splice(0, count);
        for (let i = 0; i < count; i++) {
            const isLiquid = isBlood && Math.random() > 0.45;
            particlesRef.current.push({
                id: Math.random().toString(), pos: { x, y },
                vel: { x: (Math.random() - 0.5) * (isBlood ? 20 : 8) * force, y: (Math.random() - 1.5) * (isBlood ? 38 : 8) * force },
                life: isLiquid ? (50 + Math.random() * 80) : (25 + Math.random() * 35), maxLife: isLiquid ? 120 : 60, color,
                size: isLiquid ? (10 + Math.random() * 15) : ((isBlood ? 6 : 2) + Math.random() * 5), isBlood, isLiquid
            });
        }
    };

    const addSwordPetals = (x: number, y: number) => {
        addShockwave(x, y, 600);
        for (let i = 0; i < 90; i++) {
            const angle = (Math.PI * 2 / 90) * i; const speed = 40 + Math.random() * 30; const color = i % 2 === 0 ? '#fff' : (i % 3 === 0 ? '#f0f' : '#0ff');
            particlesRef.current.push({ id: `petal-${Date.now()}-${i}`, pos: { x, y }, vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, life: 60, maxLife: 60, color, size: 35, isStreak: true });
        }
        for (let k = 0; k < 12; k++) { const rot = Math.random() * Math.PI * 2; addStreak(x, y, Math.cos(rot) * 60, Math.sin(rot) * 60, '#fff', 3); }
        addParticles(x, y, '#ffffff', 80, false, 5.0);
    };

    const addShockwave = (x: number, y: number, size = 100) => {
        particlesRef.current.push({ id: `sw-${Date.now()}-${Math.random()}`, pos: { x, y }, vel: { x: 0, y: 0 }, life: 25, maxLife: 25, color: 'rgba(255,255,255,0.9)', size: size, isShockwave: true });
    };

    const addStreak = (x: number, y: number, vx: number, vy: number, color = '#fff', sizeMod = 1) => {
        particlesRef.current.push({ id: `st-${Date.now()}-${Math.random()}`, pos: { x, y }, vel: { x: vx, y: vy }, life: 18, maxLife: 18, color: color, size: (6 + Math.random() * 10) * sizeMod, isStreak: true });
    };

    const addBloodToPlayer = () => {
        const p = playerRef.current;
        for (let i = 0; i < 12; i++) { p.bloodOnBody.push({ id: Math.random().toString(), relX: (Math.random() - 0.5) * p.width, relY: -Math.random() * p.height, life: 240, maxLife: 240 }); }
    };

    const spawnGore = (entity: Entity, scale = 1.0) => {
        const parts: GorePart['type'][] = ['head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
        const colors = entity.id === 'player' ? [COLORS.PLAYER, COLORS.PLAYER_SCARF] : [entity.colorVariant || COLORS.ENEMY, '#ff0044'];
        parts.forEach(type => {
            gorePartsRef.current.push({
                pos: { x: entity.pos.x + entity.width / 2, y: entity.pos.y + entity.height / 2 },
                vel: { x: (Math.random() - 0.5) * 20, y: -Math.random() * 28 - 10 },
                rotation: Math.random() * Math.PI * 2, rotVel: (Math.random() - 0.5) * 0.5,
                width: (type === 'torso' ? 24 : (type === 'head' ? 16 : 10)) * scale, height: (type === 'torso' ? 30 : (type === 'head' ? 16 : 22)) * scale,
                type, color: colors[Math.floor(Math.random() * colors.length)],
                isBleeding: true, bleedTimer: 180, sprayTimer: 0, isGrounded: false, offscreenTimer: 0
            });
        });
    };

    const addWallSplatter = (x: number, y: number, isMassive = false) => {
        const density = wallSplattersRef.current.filter(s => Math.abs(s.x - x) < 120 && Math.abs(s.y - y) < 120).length;
        if (density > 10) return; 

        if (wallSplattersRef.current.length > 200) wallSplattersRef.current.shift();
        const count = isMassive ? 18 : 8; const spread = isMassive ? 350 : 200; const sizeBase = isMassive ? 100 : 60; const opacityBase = isMassive ? 0.6 : 0.9;
        for (let i = 0; i < count; i++) {
            const size = sizeBase + Math.random() * sizeBase; const dots = []; const dotCount = isMassive ? 30 : 20;
            for (let j = 0; j < dotCount; j++) { const ang = Math.random() * Math.PI * 2; const rad = Math.random() * size; dots.push({ dx: Math.cos(ang) * rad, dy: Math.sin(ang) * rad * 0.8, size: 2 + Math.random() * 4 }); }
            wallSplattersRef.current.push({ x: x + (Math.random() - 0.5) * spread, y: y - Math.random() * spread - 100, size, opacity: opacityBase, rotation: Math.random() * Math.PI * 2, dots, offscreenTimer: 0 });
        }
    };

    const spawnEnemy = () => {
        if (enemiesRef.current.length >= 6) return; 
        enemySpawnCountInCycleRef.current++;
        if (bossIndicesInCycleRef.current.includes(enemySpawnCountInCycleRef.current)) { spawnBoss(); }
        const rand = Math.random();
        let type = EntityType.ENEMY_SWORD; let hp = 100; let variant = '#111'; let w = 45, h = 85;
        if (rand < 0.35) type = EntityType.ENEMY_GUN;
        else if (rand < 0.5) { type = EntityType.ENEMY_STRIKER; hp = 60; variant = '#3b0a45'; }
        else if (rand < 0.7) { type = EntityType.ENEMY_DEFENDER; hp = 220; variant = '#2a3b4c'; w = 55; h = 95; }
        else if (rand < 0.85) { type = EntityType.ENEMY_LANCER; hp = 110; variant = '#0a452a'; }
        const side = Math.random() > 0.5 ? 1 : -1; 
        const spawnX = playerRef.current.pos.x + side * (CANVAS_WIDTH * 0.75);
        enemiesRef.current.push({
            id: Math.random().toString(), type, pos: { x: spawnX, y: CANVAS_HEIGHT - 40 - h }, vel: { x: 0, y: 0 }, width: w, height: h, 
            health: hp, maxHealth: hp, facing: -side, state: 'idle', stateTimer: 0, canAttack: true, 
            attackCooldown: 60 + Math.random() * 60, comboIndex: 0, comboResetTimer: 0, windup: 0, 
            bloodOnBody: [], lastTapTime: {}, airComboCount: 0, dodgeCooldown: 0, colorVariant: variant 
        });
        if (enemySpawnCountInCycleRef.current >= 15) { enemySpawnCountInCycleRef.current = 0; generateBossIndices(); }
    };

    const spawnBoss = () => {
        const side = Math.random() > 0.5 ? 1 : -1;
        const spawnX = playerRef.current.pos.x + side * (CANVAS_WIDTH * 0.9);
        enemiesRef.current.push({ id: `boss-${Date.now()}`, type: EntityType.BOSS, pos: { x: spawnX, y: CANVAS_HEIGHT - 40 - 210 }, vel: { x: 0, y: 0 }, width: 110, height: 210, health: 1400, maxHealth: 1400, facing: -side, state: 'idle', stateTimer: 0, canAttack: true, attackCooldown: 120, comboIndex: 0, comboResetTimer: 0, windup: 0, bloodOnBody: [], lastTapTime: {}, airComboCount: 0, dodgeCooldown: 0, colorVariant: '#1a0505' });
        audio.playAsset('boss_spawn', 0.5);
    };

    const spawnBird = () => {
        const side = Math.random() > 0.5 ? 1 : -1; const spawnX = playerRef.current.pos.x + side * (CANVAS_WIDTH * 1.5); const spawnY = 50 + Math.random() * 150;
        birdsRef.current.push({ id: Math.random().toString(), pos: { x: spawnX, y: spawnY }, vel: { x: -side * (1.5 + Math.random() * 2.5), y: (Math.random() - 0.5) * 0.5 }, flapPhase: Math.random() * Math.PI * 2, flapSpeed: 0.15 + Math.random() * 0.1, size: 4 + Math.random() * 4 });
    };

    const updateCape = (p: Entity, dt: number) => {
        if (!p.capePoints) p.capePoints = initCapePoints(p.pos.x, p.pos.y);
        const anchorX = p.pos.x + (p.facing === 1 ? 5 : p.width - 5); const anchorY = p.pos.y + 25;
        p.capePoints[0] = { x: anchorX, y: anchorY };
        for (let i = 1; i < p.capePoints.length; i++) {
            const target = p.capePoints[i - 1]; const current = p.capePoints[i]; const dx = target.x - current.x; const dy = target.y - current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const targetDist = 4;
            const stiffness = 0.55;
            const force = (dist - targetDist) * stiffness;
            current.x += (dx / dist) * force * dt; current.y += (dy / dist) * force * dt;
            current.y += 0.45 * dt; current.x -= p.vel.x * 0.1 * dt;
        }
    };

    const update = () => {
        if (currentGameState !== GameState.PLAYING && currentGameState !== GameState.CLASHING) return;
        if (hitStopRef.current > 0) { hitStopRef.current--; return; }

        const p = playerRef.current; const now = Date.now(); const dt = p.isSlowMoActive ? SLOW_MO_FACTOR : 1.0; const groundY = CANVAS_HEIGHT - 40;
        updateCape(p, dt);
        actionHistoryRef.current.push({ pos: { ...p.pos }, state: p.state, stateTimer: p.stateTimer, facing: p.facing, time: now });
        if (actionHistoryRef.current.length > 300) actionHistoryRef.current.shift();

        const styleData = getStyleData();
        let recoveryRate = 3; 
        if (styleData.index >= 4) recoveryRate = 15; 
        else recoveryRate = 3 + (styleData.index * 3); 

        let dmgMult = 1.0;
        if (styleData.index >= 7) dmgMult = 2.0; 
        else if (styleData.index >= 4) dmgMult = 1.5; 

        if (decoyRef.current) {
            p.slowMoEnergy = Math.max(0, (p.slowMoEnergy || 0) - (9 / 60) * dt);
            if (p.slowMoEnergy <= 0) decoyRef.current = null;
            else {
                const targetTime = now - 600; 
                let record: ActionRecord | null = null;
                for (let i = actionHistoryRef.current.length - 1; i >= 0; i--) { if (actionHistoryRef.current[i].time <= targetTime) { record = actionHistoryRef.current[i]; break; } }
                if (record) { decoyRef.current.pos = { ...record.pos }; decoyRef.current.state = record.state; decoyRef.current.stateTimer = record.stateTimer; decoyRef.current.facing = record.facing; }
            }
        } else { p.slowMoEnergy = Math.min(300, (p.slowMoEnergy || 0) + (recoveryRate / 60) * dt); }

        if (p.bloodOnBody.length > 0) {
            const healTotal = p.maxHealth * 0.05; const healPerFrame = (healTotal / 240) * dt;
            p.bloodOnBody = p.bloodOnBody.filter(b => { p.health = Math.min(p.maxHealth, p.health + (healPerFrame / p.bloodOnBody.length)); b.life -= dt; return b.life > 0; });
        }

        if (clashCooldownRef.current > 0) clashCooldownRef.current--;
        
        if (currentGameState === GameState.CLASHING) {
            p.isSlowMoActive = true; clashTimerRef.current -= 1; clashProgressRef.current -= CLASH_DRAIN_RATE;
            const target = enemiesRef.current.find(e => e.id === clashTargetIdRef.current);
            if (target) { const midX = (p.pos.x + target.pos.x) / 2; const midY = (p.pos.y + target.pos.y) / 2; cameraXRef.current += (midX - CANVAS_WIDTH / 2 - cameraXRef.current) * 0.15; cameraYRef.current += (midY - CANVAS_HEIGHT / 2 - cameraYRef.current) * 0.15; cameraTargetZoomRef.current = 1.6; }
            if (keysRef.current['KeyJ'] && !processedKeysRef.current['KeyJ_Clash']) { processedKeysRef.current['KeyJ_Clash'] = true; clashProgressRef.current += CLASH_GAIN_PER_TAP; cameraShakeRef.current = 4; audio.playEnemyHit(false); addParticles(p.pos.x + p.facing * 80, p.pos.y + 40, '#fff', 4); }
            if (!keysRef.current['KeyJ']) processedKeysRef.current['KeyJ_Clash'] = false;
            
            if (clashProgressRef.current >= CLASH_WIN_THRESHOLD) { 
                onStateChange(GameState.PLAYING); audio.playAsset('clash_win', 0.6); audio.playAsset('explosion', 0.4); 
                cameraShakeRef.current = 20; addSwordPetals(p.pos.x + p.facing * 80, p.pos.y + p.height / 2); 
                enemiesRef.current.forEach(e => { if (e.id === clashTargetIdRef.current || e.type !== EntityType.BOSS) { e.health = 0; } }); 
                const rankInfo = getStyleData();
                const targetIdx = Math.min(rankInfo.index + 2, STYLE_RANKS.length - 1);
                stylePointsRef.current = STYLE_RANKS[targetIdx].threshold;
                addStyle(4000, 'clash_win'); 
                p.isSlowMoActive = false; hitStopRef.current = 40; clashCooldownRef.current = 45; p.vel.x = -p.facing * 6; 
            } else if (clashProgressRef.current <= 0 || clashTimerRef.current <= 0) { 
                onStateChange(GameState.PLAYING); audio.playAsset('clash_lose', 0.6); p.health = 1; p.state = 'hurt'; p.stateTimer = 30; p.vel.x = -p.facing * 25; p.isSlowMoActive = false; 
                cameraShakeRef.current = 8; clashCooldownRef.current = 60; 
                const rankInfo = getStyleData();
                const targetIdx = Math.max(rankInfo.index - 2, 0);
                stylePointsRef.current = STYLE_RANKS[targetIdx].threshold;
            }
            return;
        }

        if (now - lastAttackTimeRef.current > 4000) {
            const drop = ((STYLE_RANKS[styleData.index + 1]?.threshold || 1000) - STYLE_RANKS[styleData.index].threshold) * 0.5 / 60;
            stylePointsRef.current = Math.max(0, stylePointsRef.current - drop * dt);
        }
        if (p.health < prevHealthRef.current) {
            const penalty = ((STYLE_RANKS[styleData.index + 1]?.threshold || 1000) - STYLE_RANKS[styleData.index].threshold) * 0.7;
            stylePointsRef.current = Math.max(0, stylePointsRef.current - penalty);
        }
        prevHealthRef.current = p.health;

        if (cameraShakeRef.current > 0) cameraShakeRef.current -= 1.0;
        if (killComboRef.current > 0 && Date.now() - lastKillTimeRef.current > 5000) killComboRef.current = 0;
        
        cameraZoomRef.current += (cameraTargetZoomRef.current - cameraZoomRef.current) * 0.1; cameraXRef.current += (p.pos.x - CANVAS_WIDTH / 2 - cameraXRef.current) * 0.1; cameraYRef.current += (p.pos.y - CANVAS_HEIGHT / 2 - cameraYRef.current) * 0.08;

        const isOnGround = p.pos.y >= groundY - p.height - 2;
        
        if (p.state === 'downward_strike' && isOnGround && !processedKeysRef.current['slam_hit_triggered']) { 
          processedKeysRef.current['slam_hit_triggered'] = true;
          cameraShakeRef.current = 45; 
          for (let i = 0; i < 60; i++) {
              const rockColor = Math.random() > 0.6 ? '#4b5563' : (Math.random() > 0.5 ? '#374151' : '#1f2937');
              particlesRef.current.push({ id: `rock-${Math.random()}`, pos: { x: p.pos.x + p.width/2, y: groundY }, vel: { x: (Math.random() - 0.5) * 65, y: -Math.random() * 55 - 25 }, life: 80 + Math.random() * 60, maxLife: 140, color: rockColor, size: 10 + Math.random() * 20 });
          }
          addShockwave(p.pos.x + p.width/2, groundY, 900); addShockwave(p.pos.x + p.width/2, groundY, 600); addShockwave(p.pos.x + p.width/2, groundY, 350); addParticles(p.pos.x + p.width/2, groundY, '#fbbf24', 350, false, 8.0); 
          for(let i=0; i<50; i++) { addStreak(p.pos.x+p.width/2, groundY, (Math.random()-0.5)*180, -Math.random()*85, '#fff', 7.0); }
          audio.playAsset('explosion', 1.0); audio.playAsset('slam_hit', 1.4); 
        } else if (p.state !== 'downward_strike') { processedKeysRef.current['slam_hit_triggered'] = false; }
        
        if (isOnGround) p.airComboCount = 0;

        if (keysRef.current['KeyK'] && !processedKeysRef.current['KeyK']) { processedKeysRef.current['KeyK'] = true; if (!p.isSlowMoActive && (p.slowMoEnergy || 0) > 5) { p.isSlowMoActive = true; audio.playAsset('focus_enter', 0.4); audio.startLoop('focus_loop', 0.3); } else { p.isSlowMoActive = false; audio.playAsset('focus_exit', 0.4); audio.stopLoop('focus_loop'); } }
        const jPressed = keysRef.current['KeyJ'] && !processedKeysRef.current['KeyJ']; if (jPressed) processedKeysRef.current['KeyJ'] = true;
        const isDirectionalActive = keysRef.current['KeyW'] || keysRef.current['KeyS'];
        
        if (jDownTimeRef.current && (Date.now() - jDownTimeRef.current > 450) && !isDirectionalActive && p.state !== 'spin_attack' && p.state !== 'hurt' && (p.slowMoEnergy || 0) > 0) {
            const specStates = ['launcher', 'downward_strike', 'dash_attack']; if (!specStates.includes(p.state)) { p.state = 'spin_attack'; audio.playAsset('field_release', 0.5); audio.startLoop('focus_loop', 0.3); }
        }
        
        const isSpec = ['launcher', 'dash_attack', 'downward_strike', 'air_attack', 'spin_attack'].includes(p.state); 
        const baseZ = userZoomRef.current;
        cameraTargetZoomRef.current = (isSpec || p.state === 'clash' || p.isSlowMoActive) ? baseZ * 1.3 : baseZ;

        if (p.state !== 'hurt' && p.state !== 'clash') {
            if (p.state === 'spin_attack') {
                p.slowMoEnergy = Math.max(0, (p.slowMoEnergy || 0) - 1.5); if (p.slowMoEnergy <= 0 || !keysRef.current['KeyJ']) { p.state = 'idle'; p.stateTimer = 0; audio.stopLoop('focus_loop'); }
                else {
                    p.vel.x *= Math.pow(FRICTION, dt); if (Math.floor(Date.now() / 150) % 2 === 0 && !processedKeysRef.current['spin_sound']) { audio.playProceduralWhoosh(1.4); processedKeysRef.current['spin_sound'] = true; } else if (Math.floor(Date.now() / 150) % 2 !== 0) { processedKeysRef.current['spin_sound'] = false; }
                    gorePartsRef.current.forEach(g => { const dx = g.pos.x - (p.pos.x + p.width/2); const dy = g.pos.y - (p.pos.y + p.height/2); if (Math.sqrt(dx*dx + dy*dy) < 320) { if (!g.floatTimer || g.floatTimer <= 0) g.floatOriginY = g.pos.y; g.floatTimer = 60; g.isGrounded = false; } });
                    if(Math.random() < 0.6) addStreak(p.pos.x+p.width/2, p.pos.y+p.height/2, (Math.random()-0.5)*150, (Math.random()-0.5)*150, '#fbbf24', 2.2);
                }
            } else {
                if (!isSpec && p.state !== 'attack' && p.state !== 'dodge') {
                    if (keysRef.current['KeyA']) { p.vel.x = -PLAYER_SPEED; p.facing = -1; p.state = 'run'; } else if (keysRef.current['KeyD']) { p.vel.x = PLAYER_SPEED; p.facing = 1; p.state = 'run'; } else { p.vel.x *= Math.pow(FRICTION, dt); p.state = isOnGround ? 'idle' : 'jump'; }
                    if ((keysRef.current['Space'] || keysRef.current['KeyW']) && !processedKeysRef.current['JumpKey'] && isOnGround) { p.vel.y = JUMP_FORCE; p.state = 'jump'; processedKeysRef.current['JumpKey'] = true; }
                } else p.vel.x *= (p.state === 'dash_attack' ? Math.pow(0.95, dt) : (p.state === 'downward_strike' ? Math.pow(0.85, dt) : Math.pow(FRICTION, dt)));
                if (!(keysRef.current['Space'] || keysRef.current['KeyW'])) processedKeysRef.current['JumpKey'] = false;
            }
            if (jPressed && p.state !== 'dodge') {
                const now = Date.now(); const history = inputHistoryRef.current; let leftDash = false, rightDash = false;
                if (history.length >= 3) { const [h1, h2, h3] = history.slice(-3); if (now - h1.time < 1200) { if (h1.key === 'KeyA' && h2.key === 'KeyA' && h3.key === 'KeyJ') leftDash = true; if (h1.key === 'KeyD' && h2.key === 'KeyD' && h3.key === 'KeyJ') rightDash = true; } }
                if (leftDash || rightDash) { 
                    p.facing = leftDash ? -1 : 1; p.state = 'dash_attack'; p.stateTimer = 22; p.vel.x = p.facing * 55; audio.playAsset('dash_attack', 0.7); cameraShakeRef.current = 15; addShockwave(p.pos.x, p.pos.y + p.height/2, 380); 
                    for (let i = 0; i < 70; i++) { addStreak(p.pos.x, p.pos.y + Math.random() * p.height, -p.facing * (60 + Math.random() * 150), (Math.random() - 0.5) * 35, '#fff', 3.5); }
                } 
                else if (keysRef.current['KeyW']) { p.state = 'launcher'; p.stateTimer = 35; p.vel.y = -14.0; audio.playAsset('launch', 0.5); for(let i=0; i<25; i++) addStreak(p.pos.x+p.width/2, p.pos.y+40, (Math.random()-0.5)*30, -35-Math.random()*45, '#fbbf24', 2.8); }
                else if (!isOnGround) { if (keysRef.current['KeyS'] || p.airComboCount >= 3) { p.state = 'downward_strike'; p.stateTimer = 40; p.vel.y = 28; audio.playAsset('slam', 0.7); } else { p.state = 'air_attack'; p.stateTimer = 22; p.vel.y = -1.0; p.airComboCount++; audio.playPlayerAttack(); } } 
                else { p.state = 'attack'; p.stateTimer = ATTACK_DURATION; p.comboIndex = (p.comboIndex + 1) % 5; p.vel.x = p.facing * 4.0; audio.playPlayerAttack(); }
            }
        }

        const effectiveDt = p.state === 'dash_attack' ? 1.0 : dt; p.pos.x += p.vel.x * effectiveDt; p.pos.y += p.vel.y * effectiveDt; p.vel.y += GRAVITY * dt;
        if (p.pos.y > groundY - p.height) { p.pos.y = groundY - p.height; p.vel.y = 0; }
        if (p.stateTimer > 0) { const timerDecay = p.state === 'dash_attack' ? 1.0 : dt; p.stateTimer -= timerDecay; if (p.stateTimer <= 0) p.state = isOnGround ? 'idle' : 'jump'; }
        if (p.dodgeCooldown > 0) p.dodgeCooldown -= dt;

        const isPAttacking = ['attack', 'launcher', 'dash_attack', 'downward_strike', 'air_attack', 'spin_attack'].includes(p.state);

        enemiesRef.current = enemiesRef.current.filter(e => {
            const pCenter = p.pos.x + p.width / 2, eCenter = e.pos.x + e.width / 2; const distAbs = Math.abs(pCenter - eCenter), verticalDist = Math.abs(p.pos.y - e.pos.y); const isBoss = e.type === EntityType.BOSS;
            if (e.state === 'hurt' && e.pos.y < groundY - e.height - 10) { const dx = pCenter - eCenter; e.vel.x += Math.sign(dx) * 0.22 * dt; e.vel.x *= Math.pow(0.95, dt); }
            if (p.state === 'spin_attack' && distAbs < (isBoss ? 380 : 280) && verticalDist < (isBoss ? 200 : 150)) { e.pos.x += (pCenter > eCenter ? 1 : -1) * (isBoss ? 1.8 : 6) * dt; if (Math.floor(Date.now() / 60) % 4 === 0) { e.health -= 12 * dmgMult; e.state = 'hurt'; e.stateTimer = 10; audio.playEnemyHit(true); addParticles(eCenter, e.pos.y + e.height / 2, COLORS.BLOOD, 4, true, 1.4); addStyle(80, 'spin'); } }
            if (e.state !== 'attack' && e.state !== 'hurt' && e.state !== 'clash' && e.windup <= 0) { e.facing = pCenter > eCenter ? 1 : -1; let range = isBoss ? 200 : (e.type === EntityType.ENEMY_SWORD ? 95 : 450); if (e.type === EntityType.ENEMY_STRIKER) range = 120; if (e.type === EntityType.ENEMY_LANCER) range = 240; if (e.type === EntityType.ENEMY_DEFENDER) range = 100; if (distAbs > range) { e.vel.x = e.facing * (isBoss ? 1.2 : (e.type === EntityType.ENEMY_STRIKER ? 3.8 : (e.type === EntityType.ENEMY_DEFENDER ? 1.2 : 2.1))); e.state = 'run'; } else { e.vel.x = 0; e.state = 'idle'; if (e.attackCooldown-- <= 0) { e.windup = e.type === EntityType.ENEMY_GUN ? 70 : (isBoss ? 50 : 16); } } }
            if (e.windup > 0) { e.windup -= dt; if (e.windup <= 0) { e.state = 'attack'; e.stateTimer = isBoss ? 50 : 40; e.attackCooldown = isBoss ? 160 : (e.type === EntityType.ENEMY_STRIKER ? 60 : 140); if (e.type === EntityType.ENEMY_GUN) bulletsRef.current.push({ id: Math.random().toString(), pos: { x: e.pos.x + e.facing * 50, y: e.pos.y + 40 }, vel: { x: e.facing * BULLET_SPEED, y: 0 }, owner: 'enemy', radius: 15, isReflected: false, hitList: [] }); } }
            const isEAttacking = e.state === 'attack' && (e.type !== EntityType.ENEMY_GUN) && e.stateTimer > 12;
            if (isPAttacking && isEAttacking && distAbs < (isBoss ? 340 : 240) && verticalDist < (isBoss ? 200 : 120) && p.state !== 'spin_attack' && clashCooldownRef.current <= 0) { onStateChange(GameState.CLASHING); clashProgressRef.current = 40; clashTargetIdRef.current = e.id; hitStopRef.current = 8; } 
            else if (isPAttacking && distAbs < (isBoss ? 200 : 150) && verticalDist < (isBoss ? 180 : 120) && (e.state !== 'hurt' || e.stateTimer < 12) && p.state !== 'spin_attack') {
                const isLauncherHit = p.state === 'launcher'; const isSlamHit = p.state === 'downward_strike';
                let baseDamage = 45; if (e.type === EntityType.ENEMY_DEFENDER && !isLauncherHit && !isSlamHit && e.facing !== p.facing) baseDamage = 5;
                e.health -= baseDamage * dmgMult; e.state = 'hurt'; e.stateTimer = isLauncherHit ? 45 : 20; if (isLauncherHit) { e.vel.y = -12.5; } else if (isSlamHit) { e.vel.y = 15; cameraShakeRef.current = 15; } else { e.vel.x = p.facing * (isBoss ? 0.6 : 3.5); } hitStopRef.current = isBoss ? 12 : 10; audio.playEnemyHit(false); 
                // LAG FIX: Throttled hit effects for Bosses to prevent frame drops
                const hitParticles = isBoss ? 18 : 30; 
                addParticles(eCenter, e.pos.y + e.height / 2, COLORS.BLOOD, hitParticles, true, isBoss ? 2.5 : 2.2); 
                if (!isBoss || Math.random() < 0.3) addWallSplatter(eCenter, e.pos.y + e.height / 2, isBoss); 
                addStyle(isLauncherHit ? 600 : (isSlamHit ? 800 : 250), p.state);
            } else if (isEAttacking && distAbs < (isBoss ? 180 : (e.type === EntityType.ENEMY_LANCER ? 260 : 100)) && verticalDist < (isBoss ? 150 : 100) && p.state !== 'hurt' && p.state !== 'dodge') { p.health -= isBoss ? 35 : (e.type === EntityType.ENEMY_DEFENDER ? 25 : 12); p.state = 'hurt'; p.stateTimer = 18; p.vel.x = e.facing * 12; audio.playEnemyHit(false); cameraShakeRef.current = isBoss ? 10 : 4; }
            e.pos.x += e.vel.x * dt; e.pos.y += e.vel.y * dt; e.vel.y += GRAVITY * dt;
            if (e.pos.y > groundY - e.height) { e.pos.y = groundY - e.height; e.vel.y = 0; }
            if (e.stateTimer > 0) { e.stateTimer -= dt; if (e.stateTimer <= 0) e.state = 'idle'; }
            if (e.health <= 0) { 
                const rankHeals = [15, 17, 19, 21, 23, 25, 26, 28, 30];
                const healPercent = isBoss ? 25 : (rankHeals[styleData.index] || 15);
                p.health = Math.min(p.maxHealth, p.health + healPercent); 
                
                scoreRef.current += isBoss ? 10 : 1; killComboRef.current++; lastKillTimeRef.current = Date.now(); onScoreUpdate(scoreRef.current); if (isBoss) { const currentRankData = getStyleData(); const nextLevelIdx = currentRankData.index + 1; const nextLevelThreshold = STYLE_RANKS[Math.min(nextLevelIdx, STYLE_RANKS.length - 1)].threshold; stylePointsRef.current = Math.max(stylePointsRef.current, nextLevelThreshold); addStyle(500, 'boss_kill_bonus'); } else { addStyle(1500, 'kill'); } cameraShakeRef.current = isBoss ? 30 : 6; 
                // BOSS DEATH: Explosive blood explosion
                addParticles(eCenter, e.pos.y + e.height / 2, COLORS.BLOOD, isBoss ? 380 : 70, true, isBoss ? 5.5 : 4.0); 
                addWallSplatter(eCenter, e.pos.y - 100, isBoss); 
                // BOSS DEATH: Scaled gore parts
                spawnGore(e, isBoss ? 2.5 : 1.0); 
                addBloodToPlayer(); isBoss ? audio.playAsset('boss_death', 0.6) : audio.playEnemyDeath(); return false; 
            }
            return true;
        });

        bulletsRef.current = bulletsRef.current.filter(b => { 
            b.pos.x += b.vel.x * dt; const bDistP = Math.sqrt(Math.pow(b.pos.x - (p.pos.x + 22), 2) + Math.pow(b.pos.y - (p.pos.y + 42), 2)); 
            if (b.owner === 'enemy') { if (isPAttacking && bDistP < 150) { b.owner = 'player'; b.vel.x *= -5.2; b.isReflected = true; audio.playAsset('reflect', 0.6); hitStopRef.current = 14; cameraShakeRef.current = 10; addStyle(500, 'parry'); return true; } else if (bDistP < 50 && p.state !== 'dodge' && p.state !== 'hurt') { p.health -= 20; p.state = 'hurt'; p.stateTimer = 20; return false; } } 
            else if (b.owner === 'player' && b.isReflected) { enemiesRef.current.forEach(e => { if (b.hitList.includes(e.id)) return; const eCenter = e.pos.x + e.width / 2; const eMidY = e.pos.y + e.height / 2; const d = Math.sqrt(Math.pow(b.pos.x - eCenter, 2) + Math.pow(b.pos.y - eMidY, 2)); if (d < 75) { if (e.type !== EntityType.BOSS) e.health = 0; else e.health -= 400 * dmgMult; b.hitList.push(e.id); addParticles(eCenter, eMidY, COLORS.BLOOD, 50, true, 3.2); addStyle(200, 'reflect_hit'); } }); }
            return Math.abs(b.pos.x - p.pos.x) < 2000; 
        });

        birdsRef.current = birdsRef.current.filter(b => { b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt; b.flapPhase += b.flapSpeed * dt; return Math.abs(b.pos.x - p.pos.x) < CANVAS_WIDTH * 2; });
        gorePartsRef.current = gorePartsRef.current.filter(g => { const isOffArea = Math.abs(g.pos.x - p.pos.x) > CANVAS_WIDTH * 2; if (isOffArea) { g.offscreenTimer += dt; if (g.offscreenTimer > 480) return false; } else { g.offscreenTimer = 0; } if (g.floatTimer && g.floatTimer > 0) { g.floatTimer -= dt; g.pos.y = (g.floatOriginY || g.pos.y) - 40 + Math.sin(Date.now() / 200) * 10; g.vel.y = 0; g.vel.x *= 0.95; } else { if (!g.isGrounded) { g.pos.x += g.vel.x * dt; g.pos.y += g.vel.y * dt; g.vel.y += GRAVITY * dt; g.rotation += g.rotVel * dt; if (g.pos.y > groundY - g.height) { g.pos.y = groundY - g.height; g.vel.y *= -0.35; g.vel.x *= 0.7; if (Math.abs(g.vel.y) < 1.0) { g.isGrounded = true; g.vel.y = 0; g.vel.x = 0; g.rotVel = 0; } } } } return true; });
        particlesRef.current = particlesRef.current.filter(prt => { prt.pos.x += prt.vel.x * dt; prt.pos.y += prt.vel.y * dt; if (prt.isLiquid) { prt.vel.y += GRAVITY * 2.5 * dt; if (prt.pos.y >= groundY) { prt.pos.y = groundY; prt.vel.x *= 0.3; prt.vel.y = 0; prt.size *= 1.08; } } else if (!prt.isShockwave) { prt.vel.y += GRAVITY * dt; } prt.life -= dt; return prt.life > 0 && Math.abs(prt.pos.x - p.pos.x) < 2000; });

        if (spawnTimerRef.current-- <= 0) { spawnEnemy(); spawnTimerRef.current = 140 + Math.random() * 50; }
        if (Math.random() < 0.005) { spawnBird(); }
        if (p.health <= 0) onStateChange(GameState.GAME_OVER);
    };

    const drawCharacter = (ctx: CanvasRenderingContext2D, ent: Entity) => {
        ctx.save();
        const isP = ent.type === EntityType.PLAYER, isBoss = ent.type === EntityType.BOSS, isDecoy = ent.type === EntityType.DECOY;
        const scale = isBoss ? 2.5 : 1.0;
        ctx.translate(ent.pos.x + ent.width / 2, ent.pos.y + ent.height / 2); ctx.scale(ent.facing * scale, scale);
        if (isP && ['attack', 'launcher', 'air_attack'].includes(ent.state)) { const stretch = 1.0 + (ent.stateTimer / ATTACK_DURATION) * 0.5; ctx.scale(stretch, 1.0 / stretch); }
        if (isDecoy) ctx.globalAlpha = 0.5;
        const bob = (ent.state === 'run' || ent.state === 'spin_attack') ? Math.sin(Date.now() / 60) * 6 : 0;
        const bodyColor = (isP || isDecoy) ? COLORS.PLAYER : (ent.colorVariant || COLORS.ENEMY);
        ctx.save(); ctx.strokeStyle = '#000'; ctx.lineWidth = (isP || isDecoy) ? 16 : 14; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(0, -30 + bob); ctx.lineTo(0, 25 + bob); ctx.stroke(); ctx.fillStyle = (isP || isDecoy) ? '#000' : (isBoss ? '#000' : COLORS.ENEMY_OUTLINE); ctx.fillRect(-22, -74 + bob, 44, 46); ctx.restore();
        ctx.strokeStyle = bodyColor; ctx.lineWidth = (isP || isDecoy) ? 12 : 10; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(0, -30 + bob); ctx.lineTo(0, 25 + bob); ctx.stroke(); ctx.fillStyle = bodyColor; ctx.fillRect(-18, -70 + bob, 36, 38);
        const headY = -74 + bob;
        ctx.save();
        if (isP || isDecoy) {
            ctx.fillStyle = '#fbbf24'; 
            if (['attack', 'launcher', 'dash_attack', 'downward_strike', 'spin_attack'].includes(ent.state)) { ctx.beginPath(); ctx.moveTo(5, headY+12); ctx.lineTo(11, headY+16); ctx.lineTo(11, headY+13); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(21, headY+12); ctx.lineTo(15, headY+16); ctx.lineTo(15, headY+13); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(8, headY+26, 10, 1); } 
            else if (ent.state === 'hurt') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(5, headY+12); ctx.lineTo(10, headY+17); ctx.moveTo(10, headY+12); ctx.lineTo(5, headY+17); ctx.stroke(); ctx.beginPath(); ctx.moveTo(16, headY+12); ctx.lineTo(21, headY+17); ctx.moveTo(21, headY+12); ctx.lineTo(16, headY+17); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(8, headY+26, 10, 3); } 
            else { ctx.fillRect(5, headY+14, 6, 3); ctx.fillRect(15, headY+14, 6, 3); ctx.fillStyle = '#fff'; ctx.fillRect(9, headY+28, 8, 1); }
        } else {
            const eyeColor = isBoss ? '#ffea00' : '#f43f5e';
            if (ent.state === 'attack' || ent.windup > 0) { ctx.strokeStyle = eyeColor; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(4, headY+10); ctx.lineTo(12, headY+18); ctx.stroke(); ctx.beginPath(); ctx.moveTo(22, headY+10); ctx.lineTo(14, headY+18); ctx.stroke(); ctx.fillStyle = '#000'; ctx.fillRect(6, headY+26, 12, 4); } 
            else if (ent.state === 'hurt') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8, headY+14, 3, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(18, headY+14, 3, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(13, headY+26, 6, 0, Math.PI*2); ctx.fill(); } 
            else { ctx.fillStyle = '#000'; ctx.fillRect(5, headY+16, 6, 2); ctx.fillRect(15, headY+16, 6, 2); ctx.fillRect(8, headY+28, 10, 2); }
        }
        ctx.restore();
        if (isP) { ent.bloodOnBody.forEach(b => { ctx.save(); ctx.globalAlpha = (b.life / b.maxLife) * 0.7; ctx.fillStyle = COLORS.BLOOD; ctx.fillRect(b.relX, b.relY, 6, 6); ctx.restore(); }); }
        const s = ent.state === 'run' ? Math.sin(Date.now() / 60) : 0; ctx.beginPath(); ctx.moveTo(0, 25 + bob); ctx.lineTo(s * 25, 55); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 25 + bob); ctx.lineTo(-s * 25, 55); ctx.stroke();
        const isAttackingState = ['attack', 'launcher', 'dash_attack', 'downward_strike', 'air_attack', 'spin_attack'].includes(ent.state);
        ctx.save(); 
        if (isAttackingState) {
            if (ent.state === 'dash_attack') {
                const opacity = ent.stateTimer / 22; 
                ctx.fillStyle = (isP||isDecoy) ? `rgba(255, 255, 255, ${opacity * 0.9})` : `rgba(37, 99, 235, ${opacity * 0.6})`;
                ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(450, -2); ctx.lineTo(460, 0); ctx.lineTo(450, 2); ctx.lineTo(10, 10); ctx.fill();

                // SPACE SHATTERING TIP EFFECT
                ctx.save();
                ctx.translate(460, 0);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2.5;
                ctx.globalAlpha = opacity;
                for(let i=0; i<10; i++) {
                    const ang = (i / 10) * Math.PI * 2 + (Math.random()-0.5) * 0.8;
                    const l = 20 + Math.random() * 35;
                    ctx.beginPath(); 
                    ctx.moveTo(0,0);
                    // Jagged spatial cracks
                    const midX = Math.cos(ang) * l * 0.5;
                    const midY = Math.sin(ang) * l * 0.5 + (Math.random()-0.5)*15;
                    ctx.lineTo(midX, midY);
                    ctx.lineTo(Math.cos(ang)*l, Math.sin(ang)*l);
                    ctx.stroke();
                }
                ctx.fillStyle = '#fff';
                for(let i=0; i<8; i++) {
                    const sx = (Math.random()-0.5)*60; const sy = (Math.random()-0.5)*60;
                    ctx.fillRect(sx, sy, 4, 4); 
                }
                ctx.restore();

                ctx.strokeStyle = (isP||isDecoy) ? `rgba(251, 191, 36, ${opacity})` : `rgba(168, 85, 247, ${opacity})`;
                ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -35); ctx.lineTo(120, 0); ctx.lineTo(0, 35); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(40, -25); ctx.lineTo(160, 0); ctx.lineTo(40, 25); ctx.stroke();
            } else if (ent.state === 'spin_attack') {
                ctx.restore(); ctx.save(); const layers = 10; 
                for(let i=0; i<layers; i++) { 
                    const layerSize = 100 + i * 18 + Math.sin(Date.now() / 25 + i) * 12; 
                    ctx.strokeStyle = i % 2 === 0 ? `rgba(251, 191, 36, 0.8)` : `rgba(255, 255, 255, 0.45)`; 
                    ctx.lineWidth = 8 + i; ctx.beginPath(); 
                    for(let a=0; a<12; a++) { const angle = (Math.PI / 6) * a + (Date.now() * 0.04); const px = Math.cos(angle) * layerSize; const py = Math.sin(angle) * layerSize; if(a===0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } 
                    ctx.closePath(); ctx.stroke(); 
                }
            } else if (ent.state === 'downward_strike') {
                const slamAlpha = ent.stateTimer / 40; 
                ctx.fillStyle = `rgba(255, 255, 255, ${slamAlpha * 0.95})`; ctx.fillRect(-45, -800, 90, 800); 
                ctx.fillStyle = `rgba(251, 191, 36, ${slamAlpha * 0.45})`; ctx.fillRect(-70, -800, 140, 800);
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(-45, -800, 90, 800);
                ctx.save(); ctx.rotate(Math.PI/2); ctx.fillStyle='rgba(251,191,36,0.3)'; ctx.beginPath(); ctx.moveTo(0,-120); ctx.lineTo(400,0); ctx.lineTo(0,120); ctx.fill(); ctx.restore();
            } else {
                let rot = -1.2 + (1 - ent.stateTimer / (isBoss ? 50 : ATTACK_DURATION)) * 6.0; 
                if (ent.state === 'launcher') rot = -2.8 - (1 - ent.stateTimer / 35) * 4.5; 
                ctx.rotate(rot); ctx.fillStyle = (isP||isDecoy) ? 'rgba(251, 191, 36, 0.5)' : 'rgba(168, 85, 247, 0.55)'; 
                ctx.beginPath(); ctx.moveTo(0, -220); ctx.quadraticCurveTo(550, 0, 0, 220); ctx.fill();
                ctx.fillStyle = (isP||isDecoy) ? 'rgba(255, 255, 255, 0.9)' : 'rgba(37, 99, 235, 0.55)';
                ctx.beginPath(); ctx.moveTo(0, -170); ctx.quadraticCurveTo(420, 0, 0, 170); ctx.fill();
                if (ent.state !== 'attack' && Math.random() < 0.5) addStreak(ent.pos.x, ent.pos.y, (Math.random()-0.5)*50, (Math.random()-0.5)*50, '#fff', 1.5);
            }
        } else if (currentGameState === GameState.CLASHING) { ctx.rotate(0.5); ctx.translate(25, 0); } else { ctx.rotate(-0.8); ctx.translate(15, 0); }
        if (isP || isDecoy) { ctx.fillStyle = COLORS.PLAYER_SWORD_BLADE; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(130, -6); ctx.lineTo(155, 0); ctx.lineTo(130, 6); ctx.lineTo(0, 6); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fbbf24'; ctx.fillRect(-5, -10, 15, 20); } 
        else if (isBoss) { ctx.fillStyle = '#444'; ctx.fillRect(0, -6, 180, 12); ctx.fillStyle = '#222'; ctx.fillRect(140, -60, 70, 120); ctx.strokeStyle = '#f00'; ctx.lineWidth = 4; ctx.strokeRect(145, -55, 60, 110); ctx.fillStyle = '#111'; ctx.fillRect(150, -40, 50, 80); } 
        else if (ent.type === EntityType.ENEMY_SWORD || ent.type === EntityType.ENEMY_STRIKER || ent.type === EntityType.ENEMY_DEFENDER) { ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(130, -8); ctx.lineTo(135, 0); ctx.lineTo(130, 8); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(-5, -8, 12, 16); } 
        else if (ent.type === EntityType.ENEMY_LANCER) { ctx.fillStyle = '#4a2c10'; ctx.fillRect(0, -3, 220, 6); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(220, -10); ctx.lineTo(260, 0); ctx.lineTo(220, 10); ctx.closePath(); ctx.fill(); } 
        else if (ent.type === EntityType.ENEMY_GUN) { ctx.fillStyle = COLORS.ENEMY_METAL; ctx.fillRect(-8, -8, 16, 16); ctx.fillRect(0, -2, 25, 4); }
        ctx.restore(); ctx.restore();
    };

    const drawBackground = (ctx: CanvasRenderingContext2D) => {
        const p = playerRef.current; const groundY = CANVAS_HEIGHT - 40; const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT); skyGrad.addColorStop(0, COLORS.SKY); skyGrad.addColorStop(1, '#7dd3fc');
        ctx.fillStyle = skyGrad; ctx.fillRect(cameraXRef.current - 1200, cameraYRef.current - 1200, CANVAS_WIDTH + 2400, CANVAS_HEIGHT + 2400);
        ctx.save(); ctx.translate(cameraXRef.current + CANVAS_WIDTH * 0.8, cameraYRef.current + 100); ctx.fillStyle = COLORS.SUN; ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        for (let i = -10; i < 28; i++) { const bx = i * 450 + cameraXRef.current * 0.4; const baseH = 600 + (Math.abs(i) * 160) % 800; drawBuilding(ctx, bx, groundY - baseH - 80, 200, baseH, Math.abs(i)); }
        ctx.fillStyle = COLORS.WALL; ctx.fillRect(cameraXRef.current - 2000, 0, 40000, groundY); ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; const blockSizeX = 80, blockSizeY = 40; const startX = Math.floor((cameraXRef.current - 2000) / blockSizeX) * blockSizeX; for(let tx = startX; tx < cameraXRef.current + CANVAS_WIDTH + 2000; tx += blockSizeX) { ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, groundY); ctx.stroke(); } for(let ty = 0; ty < groundY; ty += blockSizeY) { ctx.beginPath(); ctx.moveTo(cameraXRef.current - 2000, ty); ctx.lineTo(cameraXRef.current + CANVAS_WIDTH + 2000, ty); ctx.stroke(); }
        graffitiRef.current.forEach(g => { if (Math.abs(g.x - p.pos.x) > 1500) return; ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.rotation); ctx.scale(g.scale, g.scale); ctx.globalAlpha = 0.85; if (g.type === 'text') { ctx.fillStyle = g.color; ctx.font = 'bold 24px "Press Start 2P"'; ctx.fillText(g.text || '', 0, 0); } else { ctx.fillStyle = g.color; ctx.fillRect(-10, -10, 20, 20); } ctx.restore(); });
    };

    const drawBuilding = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number) => { 
        ctx.save(); ctx.translate(x, y); ctx.fillStyle = COLORS.BUILDING[seed % COLORS.BUILDING.length]; const type = seed % 6;
        if (type === 0) { ctx.fillRect(w*0.42, 0, w*0.16, h); ctx.beginPath(); ctx.arc(w/2, h*0.2, w*0.5, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(w/2, h*0.6, w*0.4, 0, Math.PI*2); ctx.fill(); ctx.fillRect(w*0.48, -160, 4, 160); } 
        else if (type === 1) { for(let k=0; k<7; k++) { const stepW = w * (1 - k*0.14); const stepH = h/7; ctx.fillRect((w-stepW)/2, k*stepH, stepW, stepH); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.strokeRect((w-stepW)/2, k*stepH, stepW, stepH); } ctx.fillRect(w*0.48, -120, 6, 120); } 
        else if (type === 2) { ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w/2, 0); ctx.lineTo(w, h); ctx.closePath(); ctx.fill(); ctx.fillRect(w*0.45, -150, 12, 150); } 
        else if (type === 3) { ctx.fillRect(0, 0, w*0.3, h); ctx.fillRect(w*0.7, 50, w*0.3, h-50); ctx.fillRect(w*0.3, h*0.2, w*0.4, 25); } 
        else { ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,0.12)'; for(let r=0; r<h; r+=45) for(let c=15; c<w; c+=30) ctx.fillRect(c, r+12, 15, 18); } ctx.restore(); 
    };

    const drawBird = (ctx: CanvasRenderingContext2D, b: Bird) => { ctx.save(); ctx.translate(b.pos.x, b.pos.y); ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; const wingY = Math.sin(b.flapPhase) * b.size; ctx.beginPath(); ctx.moveTo(-b.size, wingY); ctx.lineTo(0, 0); ctx.lineTo(b.size, wingY); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.restore(); };

    const drawCape = (ctx: CanvasRenderingContext2D, p: Entity) => {
        if (!p.capePoints) return;
        ctx.save();
        let totalLen = 0; for(let i=1; i<p.capePoints.length; i++){ totalLen += Math.sqrt(Math.pow(p.capePoints[i].x - p.capePoints[i-1].x, 2) + Math.pow(p.capePoints[i].y - p.capePoints[i-1].y, 2)); }
        ctx.shadowBlur = 8; ctx.shadowColor = '#fbbf24';
        const stretchFactor = totalLen / 15; const baseHue = 45; const hueRange = Math.max(0, (stretchFactor - 1.1) * 360); 
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let s = 0; s < 3; s++) { 
            ctx.beginPath(); ctx.lineWidth = (6 - s * 1.5) * (1 + stretchFactor * 0.1); ctx.moveTo(p.capePoints[0].x, p.capePoints[0].y);
            for (let i = 1; i < p.capePoints.length; i++) {
                const pt = p.capePoints[i]; let pointHue = baseHue;
                if (hueRange > 0) { pointHue = (baseHue + (i / p.capePoints.length) * hueRange + Date.now()/15) % 360; }
                ctx.strokeStyle = `hsla(${pointHue}, 100%, ${Math.min(100, 60 + stretchFactor * 25)}%, ${0.9 - s * 0.2})`;
                ctx.lineTo(pt.x, pt.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(pt.x, pt.y);
            }
        }
        ctx.restore();
    };

    const draw = (ctx: CanvasRenderingContext2D) => {
        const groundY = CANVAS_HEIGHT - 40; ctx.save();
        if (cameraShakeRef.current > 0) ctx.translate((Math.random() - 0.5) * cameraShakeRef.current, (Math.random() - 0.5) * cameraShakeRef.current);
        ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2); ctx.scale(cameraZoomRef.current, cameraZoomRef.current); ctx.translate(-CANVAS_WIDTH / 2 - cameraXRef.current, -CANVAS_HEIGHT / 2 - cameraYRef.current);
        drawBackground(ctx);
        ctx.fillStyle = COLORS.GROUND; ctx.fillRect(cameraXRef.current - 2000, groundY, 40000, 400); 
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.0;
        const gStartX = Math.floor((cameraXRef.current - 2500) / 100) * 100;
        for(let gx = gStartX; gx < cameraXRef.current + CANVAS_WIDTH + 2500; gx += 160) { ctx.beginPath(); ctx.moveTo(gx, groundY); ctx.lineTo(gx + 150, groundY + 400); ctx.stroke(); if (gx % 480 === 0) { ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.beginPath(); ctx.moveTo(gx + 400, groundY); ctx.lineTo(gx - 200, groundY + 400); ctx.stroke(); } }
        ctx.restore();
        wallSplattersRef.current.forEach(s => { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rotation); ctx.fillStyle = COLORS.BLOOD; ctx.globalAlpha = s.opacity; s.dots.forEach(dot => { ctx.fillRect(dot.dx, dot.dy, dot.size, dot.size); }); ctx.restore(); });
        gorePartsRef.current.forEach(g => { ctx.save(); ctx.translate(g.pos.x, g.pos.y); ctx.rotate(g.rotation); ctx.fillStyle = g.color; ctx.fillRect(-g.width / 2, -g.height / 2, g.width, g.height); ctx.restore(); });
        enemiesRef.current.forEach(e => drawCharacter(ctx, e));
        if (decoyRef.current) drawCharacter(ctx, decoyRef.current);
        drawCape(ctx, playerRef.current); drawCharacter(ctx, playerRef.current);
        if (playerRef.current.state === 'dash_attack') { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3; for(let i=0; i<25; i++) { const ly = Math.random() * CANVAS_HEIGHT; const lx = cameraXRef.current + Math.random() * CANVAS_WIDTH; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 250, ly); ctx.stroke(); } ctx.restore(); }
        bulletsRef.current.forEach(b => { ctx.save(); ctx.translate(b.pos.x, b.pos.y); ctx.rotate(Date.now()/25); ctx.fillStyle = b.isReflected ? '#fff' : '#fbbf24'; ctx.shadowBlur = b.isReflected ? 30 : 0; ctx.shadowColor = '#fff'; ctx.beginPath(); for(let i=0; i<4; i++){ ctx.rotate(Math.PI/2); ctx.moveTo(0,0); ctx.lineTo(-9, 18); ctx.lineTo(0, 28); ctx.lineTo(9, 18); ctx.closePath(); ctx.fill(); } ctx.restore(); });
        particlesRef.current.forEach(p => { ctx.save(); ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color; if (p.isShockwave) { const currentSize = p.size * (1 - p.life / p.maxLife); ctx.strokeStyle = `rgba(251, 191, 36, ${p.life / p.maxLife})`; ctx.lineWidth = 12; ctx.beginPath(); ctx.ellipse(p.pos.x, p.pos.y, currentSize, currentSize * 0.52, 0, 0, Math.PI * 2); ctx.stroke(); } else { ctx.fillRect(p.pos.x - p.size / 2, p.pos.y - p.size / 2, p.size, p.size); } ctx.restore(); });
        ctx.restore();
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(40, 40, 270, 30); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(40, 40, 270, 30); const hpW = Math.max(0, (playerRef.current.health / 100) * 264); ctx.fillStyle = '#ef4444'; ctx.fillRect(43, 43, hpW, 24); const energyW = Math.max(0, ((playerRef.current.slowMoEnergy || 0) / 300) * 266); ctx.fillStyle = COLORS.PLAYER_ENERGY; ctx.fillRect(42, 82, energyW, 12); const zx = 330, zy = 40, zw = 140, zh = 30; ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(zx, zy, zw, zh); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(zx, zy, zw, zh); const knobRatio = (userZoomRef.current - 0.4) / (1.5 - 0.4); ctx.fillStyle = '#fbbf24'; ctx.fillRect(zx + 10 + knobRatio * (zw - 20) - 5, zy + 5, 10, 20); ctx.fillStyle = '#fff'; ctx.font = '8px "Press Start 2P"'; ctx.fillText('ZOOM', zx + 5, zy - 8); const styleData = getStyleData(); ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '14px "Press Start 2P"'; ctx.fillText('STYLE', CANVAS_WIDTH - 40, 50); ctx.font = '52px "Press Start 2P"'; ctx.fillStyle = COLORS.PLAYER_GLOW; ctx.shadowBlur = 30; ctx.shadowColor = '#fff'; ctx.fillText(styleData.current.name, CANVAS_WIDTH - 40, 115); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(CANVAS_WIDTH - 200, 125, 160, 16); ctx.fillStyle = '#fbbf24'; ctx.fillRect(CANVAS_WIDTH - 200, 125, 160 * styleData.progress, 16); if (currentGameState === GameState.CLASHING) { ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(CANVAS_WIDTH / 2 - 200, CANVAS_HEIGHT / 2 + 80, 400, 25); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(CANVAS_WIDTH / 2 - 200, CANVAS_HEIGHT / 2 + 80, 400, 25); const cw = (clashProgressRef.current / CLASH_WIN_THRESHOLD) * 394; ctx.fillStyle = '#ff0'; ctx.fillRect(CANVAS_WIDTH / 2 - 197, CANVAS_HEIGHT / 2 + 83, cw, 19); ctx.fillStyle = '#fff'; ctx.font = '18px "Press Start 2P"'; ctx.textAlign = 'center'; ctx.fillText('MASH J!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60); } ctx.restore();
    };

    const loop = useCallback(() => { const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; update(); draw(ctx); requestRef.current = requestAnimationFrame(loop); }, [currentGameState, language]);
    useEffect(() => { requestRef.current = requestAnimationFrame(loop); return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); }; }, [loop]);
    return (
        <div className="relative w-full h-full flex items-center justify-center bg-black">
            <div className="relative w-full h-full max-w-[100vw] max-h-[100vh] overflow-hidden">
                <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="w-full h-full object-contain image-pixelated" />
            </div>
        </div>
    );
};
export default Game;
