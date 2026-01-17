import React, { useState, useEffect, useRef } from 'react';
import Game from './components/Game';
import { GameState } from './types';

const TRANSLATIONS = {
  en: {
    op: "By__LicseL",
    title: "PIXEL SAMURAI",
    kills: "DATA_CORRUPTED",
    init: "START MISSION",
    died: "DISCONNECTED",
    honor: "Connection Terminated",
    retry: "RESTORE HONOR",
    menu: "BACK TO MENU",
    guide: "GUIDE",
    subtitle: "By__LicseL",
    lang: "中文",
    bgmOn: "BGM: ON",
    bgmOff: "BGM: OFF"
  },
  zh: {
    op: "By__LicseL",
    title: "像素武士",
    kills: "数据清除数",
    init: "启动任务",
    died: "链接断开",
    honor: "武士荣誉已丧失",
    retry: "重拾荣誉",
    menu: "返回主菜单",
    guide: "搓招表",
    subtitle: "By__LicseL",
    lang: "EN",
    bgmOn: "音乐: 开",
    bgmOff: "音乐: 关"
  }
};

const IconLeft = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
);
const IconRight = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);
const IconSlowMo = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);
const IconDodge = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 3l-4 9h8l-4 9"/>
  </svg>
);

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [score, setScore] = useState(0);
  const [lang, setLang] = useState<'en' | 'zh'>('zh');
  const [isMusicOn, setIsMusicOn] = useState(true);
  const [gameKey, setGameKey] = useState(0);

  const jStartRef = useRef<{ x: number, y: number } | null>(null);
  const swipeTriggeredRef = useRef<boolean>(false);

  const t = TRANSLATIONS[lang];

  const handleRestart = () => {
    setScore(0);
    setGameKey(prev => prev + 1);
    setGameState(GameState.PLAYING);
  };

  const handleBackToMenu = () => {
    setGameState(GameState.START);
    setScore(0);
    setGameKey(prev => prev + 1);
  };

  const triggerKey = (code: string, isDown: boolean) => {
    const event = new KeyboardEvent(isDown ? 'keydown' : 'keyup', { 
      code, 
      key: code.replace('Key', '').toLowerCase(),
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(event);
  };

  const handleAttackAreaDown = (e: React.PointerEvent) => {
    jStartRef.current = { x: e.clientX, y: e.clientY };
    swipeTriggeredRef.current = false;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    triggerKey('KeyJ', true);
  };

  const handleAttackAreaMove = (e: React.PointerEvent) => {
    if (!jStartRef.current || swipeTriggeredRef.current) return;
    const dy = e.clientY - jStartRef.current.y;
    const swipeThreshold = 12;
    if (Math.abs(dy) > swipeThreshold) {
      swipeTriggeredRef.current = true;
      const key = dy < 0 ? 'KeyW' : 'KeyS';
      triggerKey(key, true);
      triggerKey('KeyJ', false);
      setTimeout(() => {
        triggerKey('KeyJ', true);
        setTimeout(() => {
          triggerKey('KeyJ', false);
          triggerKey(key, false);
        }, 80);
      }, 15);
    }
  };

  const handleAttackAreaUp = (e: React.PointerEvent) => {
    if (!jStartRef.current) return;
    if (!swipeTriggeredRef.current) triggerKey('KeyJ', false);
    jStartRef.current = null;
    swipeTriggeredRef.current = false;
    const target = e.currentTarget as HTMLElement;
    try { target.releasePointerCapture(e.pointerId); } catch(err) {}
  };

  return (
    <div className="relative w-screen h-screen flex flex-col items-center justify-center bg-[#030308] overflow-hidden crt select-none touch-none">
      {/* HUD (仅在非主菜单状态显示) */}
      {gameState !== GameState.START && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-full max-w-6xl flex justify-between px-6 z-20 pointer-events-none">
          <div className="flex flex-col items-start border-l-4 border-cyan-500 pl-4">
            <div className="text-white text-[8px] tracking-[0.3em] font-bold opacity-60 italic">{t.op}</div>
            <div className="text-cyan-400 text-xl font-black italic">{t.title}</div>
          </div>
          <div className="flex flex-col items-end border-r-4 border-red-500 pr-4">
            <div className="text-white text-[8px] tracking-[0.3em] font-bold opacity-60 italic">{t.kills}</div>
            <div className="text-red-500 text-2xl font-black italic">{score}</div>
          </div>
        </div>
      )}

      <Game 
        key={gameKey}
        currentGameState={gameState}
        onStateChange={setGameState} 
        onScoreUpdate={(s) => setScore(s)} 
        language={lang}
        isMusicOn={isMusicOn}
      />

      {/* 战斗操作覆盖层 */}
      {(gameState === GameState.PLAYING || gameState === GameState.CLASHING) && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          <div className="absolute bottom-10 left-10 flex gap-8 pointer-events-auto">
             <button onPointerDown={() => triggerKey('KeyA', true)} onPointerUp={() => triggerKey('KeyA', false)} onPointerLeave={() => triggerKey('KeyA', false)} className="w-24 h-24 bg-white/5 border-2 border-white/20 rounded-xl flex items-center justify-center active:bg-cyan-500/30 active:border-cyan-400 transition-colors text-white/40 active:text-cyan-400"><IconLeft /></button>
             <button onPointerDown={() => triggerKey('KeyD', true)} onPointerUp={() => triggerKey('KeyD', false)} onPointerLeave={() => triggerKey('KeyD', false)} className="w-24 h-24 bg-white/5 border-2 border-white/20 rounded-xl flex items-center justify-center active:bg-cyan-500/30 active:border-cyan-400 transition-colors text-white/40 active:text-cyan-400"><IconRight /></button>
          </div>
          <button onPointerDown={handleAttackAreaDown} onPointerMove={handleAttackAreaMove} onPointerUp={handleAttackAreaUp} onPointerCancel={handleAttackAreaUp} style={{ left: '50%', width: '50%' }} className="absolute top-0 h-full z-10 pointer-events-auto bg-transparent border-none outline-none appearance-none cursor-default opacity-0" aria-label="Attack Area" />
          <div className="absolute bottom-12 right-12 flex flex-col gap-6 items-end pointer-events-auto z-20">
             <button onPointerDown={() => triggerKey('KeyK', true)} onPointerUp={() => triggerKey('KeyK', false)} className="w-20 h-20 rounded-full border-2 border-cyan-400/30 bg-cyan-950/10 flex items-center justify-center text-cyan-400/40 active:scale-90 transition-transform active:text-cyan-400 active:border-cyan-400"><IconSlowMo /></button>
             <button onPointerDown={() => triggerKey('KeyL', true)} onPointerUp={() => triggerKey('KeyL', false)} className="w-16 h-16 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/20 active:bg-white/20 active:text-white/60 transition-colors"><IconDodge /></button>
          </div>
        </div>
      )}

      {/* 主菜单 */}
      {gameState === GameState.START && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/95 text-white backdrop-blur-xl p-6 overflow-hidden">
          {/* 左上角设置项：音乐与语言 */}
          <div className="absolute top-10 left-10 flex flex-col gap-4 z-50">
             <button onClick={() => setIsMusicOn(!isMusicOn)} className="px-6 py-4 border-2 border-cyan-500/40 text-[10px] text-cyan-400 font-bold tracking-widest uppercase active:bg-cyan-500/10 w-44 text-left">
               {isMusicOn ? 'MUSIC: ON' : 'MUSIC: OFF'}
             </button>
             <button onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')} className="px-6 py-4 border-2 border-white/20 text-[10px] text-white/60 font-bold tracking-widest uppercase active:bg-white/10 w-44 text-left">
               {t.lang}
             </button>
          </div>

          {/* 右边边缘：搓招表按钮 (贴边显示，避免遮挡中心标题) */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-end z-50">
             <button onClick={() => setGameState(GameState.GUIDE)} className="px-10 py-16 border-l-4 border-y-2 border-white/20 text-white/60 text-lg font-black tracking-widest active:scale-95 transition-all hover:bg-white/5 active:bg-white/10 shadow-[0_0_40px_rgba(255,255,255,0.05)] bg-black/40 backdrop-blur-sm">
               <span className="vertical-text">{t.guide}</span>
             </button>
          </div>

          {/* 画面中心内容：LOGO与标题 */}
          <div className="relative z-20 mb-12 text-center">
            <h1 className="text-7xl mb-1 font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-cyan-500 animate-pulse drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">{t.title}</h1>
            <p className="text-cyan-600/60 text-[10px] tracking-[0.6em] uppercase font-bold">{t.subtitle}</p>
          </div>

          {/* 启动任务按钮 */}
          <button onClick={() => setGameState(GameState.PLAYING)} className="group relative z-20 px-28 py-14 flex items-center justify-center overflow-hidden border-4 border-cyan-400 text-cyan-400 text-5xl font-black tracking-[0.4em] active:scale-95 transition-all shadow-[0_0_80px_rgba(34,211,238,0.25)] bg-black/40 backdrop-blur-sm">
            <span className="relative z-10 text-center">{t.init}</span>
            <div className="absolute inset-0 bg-cyan-400 translate-y-full group-active:translate-y-0 transition-transform"></div>
          </button>
        </div>
      )}

      {/* 搓招表界面 */}
      {gameState === GameState.GUIDE && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black text-white backdrop-blur-xl p-6 overflow-hidden">
           <div className="text-[10px] leading-relaxed bg-zinc-900/60 p-10 border-t border-b border-cyan-500/20 w-full max-w-3xl transform shadow-[0_0_100px_rgba(34,211,238,0.1)]">
            {lang === 'zh' ? (
              <div className="space-y-4 text-center">
                <p className="text-cyan-400 font-bold text-2xl tracking-[0.5em] mb-6">- 搓招表 -</p>
                <div className="grid grid-cols-1 gap-3 text-lg opacity-90 font-bold">
                  <p>↑ + 攻击 === 上挑</p>
                  <p>←← / →→ + 攻击 === 突刺</p>
                  <p>长按攻击 === 力场展开</p>
                  <p>空中时 ↓ + 攻击 === 下砸</p>
                  <p>长按闪避 === 释放分身</p>
                  <div className="h-4"></div>
                  <p className="text-red-400">• 回血机制：每杀死一人回血 15%</p>
                  <p className="text-yellow-400">• 弹反：成功弹反飞镖评估等级 +1</p>
                  <p className="text-cyan-400">• 拼刀：成功等级 +2 | 失败等级 -2</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-center uppercase">
                <p className="text-cyan-400 font-bold text-2xl tracking-[0.5em] mb-6">- COMBAT GUIDE -</p>
                <div className="grid grid-cols-1 gap-3 text-sm opacity-90 font-bold">
                  <p>UP + J === LAUNCHER</p>
                  <p>AA / DD + J === DASH ATTACK / PIERCE</p>
                  <p>HOLD J === FORCE FIELD SPIN</p>
                  <p>AIR + DOWN + J === DOWNWARD SLAM</p>
                  <p>HOLD L === RELEASE DECOY</p>
                  <div className="h-4"></div>
                  <p className="text-red-400">• HEALING: 15% HP PER KILL</p>
                  <p className="text-yellow-400">• PARRY: +1 STYLE RANK</p>
                  <p className="text-cyan-400">• CLASH: WIN +2 | LOSE -2 RANKS</p>
                </div>
              </div>
            )}
          </div>
          <button onClick={handleBackToMenu} className="mt-12 px-12 py-6 border-2 border-white/40 text-lg font-black active:bg-white active:text-black transition-all hover:bg-white/5 uppercase tracking-widest">
            {t.menu}
          </button>
        </div>
      )}

      {/* 游戏结束界面 */}
      {gameState === GameState.GAME_OVER && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-red-950/95 text-white backdrop-blur-xl p-6">
          <h1 className="text-7xl font-black italic tracking-tighter uppercase text-red-600 mb-2 animate-pulse">{t.died}</h1>
          <p className="text-lg mb-12 text-red-400/80 uppercase tracking-[0.4em] font-light">{t.honor}</p>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <button onClick={handleRestart} className="px-10 py-6 border-4 border-red-600 text-2xl font-black active:bg-red-600 active:text-white transition-all shadow-[0_0_50px_rgba(220,38,38,0.3)]">{t.retry}</button>
            <button onClick={handleBackToMenu} className="px-10 py-4 border-2 border-white/40 text-sm font-bold active:bg-white active:text-black transition-all">{t.menu}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
