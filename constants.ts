
export const CANVAS_WIDTH = 854;
export const CANVAS_HEIGHT = 480;
export const GRAVITY = 0.08; 
export const FRICTION = 0.88;
export const PLAYER_SPEED = 4.2;
export const JUMP_FORCE = -7.2; 
export const BULLET_SPEED = 5.5;

export const COLORS = {
  SKY: '#0ea5e9', // Cyberpunk bright sky
  CITY_NEON: ['#ff00ff', '#00ffff', '#ffff00'],
  WALL: '#6b7280', // Medium cool grey - better for contrast
  WALL_TEXT: '#4b5563',
  GROUND: '#2a2a30',
  MARBLE_VEIN: 'rgba(255, 255, 255, 0.04)',
  PLAYER: '#ffffff',
  PLAYER_OUTLINE: '#000000',
  PLAYER_GLOW: '#fbbf24', // Golden Glow
  PLAYER_ENERGY: '#38bdf8', 
  PLAYER_SWORD_HILT: '#fbbf24',
  PLAYER_SWORD_BLADE: '#ffffff',
  PLAYER_SCARF: '#ff00ff',
  PLAYER_CAPE: '#fbbf24', // Default Gold
  ENEMY: '#111111', 
  ENEMY_OUTLINE: '#aaaaaa', 
  ENEMY_CORE: '#ff0044',
  ENEMY_METAL: '#8a8a9a',
  BLOOD: '#ff0000', 
  BLOOD_LIGHT: '#ff5500', 
  BULLET: '#ffdd00',
  SWORD_ARC: 'rgba(251, 191, 36, 0.7)', // Golden Sword Light
  PIERCE_ARC: 'rgba(255, 255, 255, 1.0)',
  PLATFORM: '#555566',
  GRAFFITI: ['#ff0055', '#00ffcc', '#ffff00', '#cc00ff'],
  SUN: '#fff9c4',
  SUN_GLOW: 'rgba(255, 249, 196, 0.4)',
  BUILDING: ['#1a1a2e', '#16213e', '#0f3460']
};

export const ATTACK_DURATION = 30; 
export const COMBO_RESET_TIME = 60;
export const DASH_DURATION = 15;
export const HURT_DURATION = 20;
export const STYLE_DECAY = 0.8;

// Slow Mo Settings
export const SLOW_MO_DRAIN_PER_SEC = 5; 
export const SLOW_MO_FACTOR = 0.1; 

// Clash Settings (Lowered Difficulty: 6 taps in 5 seconds)
export const CLASH_DRAIN_RATE = 0.1; 
export const CLASH_GAIN_PER_TAP = 25; 
export const CLASH_WIN_THRESHOLD = 100;
