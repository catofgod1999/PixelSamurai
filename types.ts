
export enum EntityType {
  PLAYER,
  ENEMY_SWORD,
  ENEMY_GUN,
  ENEMY_STRIKER, // Fast, agile
  ENEMY_DEFENDER, // Shielded, heavy
  ENEMY_LANCER,   // Reach weapon
  BOSS,
  DECOY 
}

export enum GameState {
  START,
  PLAYING,
  CLASHING,
  GAME_OVER,
  VICTORY,
  GUIDE
}

export interface Vector2 {
  x: number;
  y: number;
}

export type ActionState = 'idle' | 'run' | 'jump' | 'attack' | 'dodge' | 'hurt' | 'clash' | 'dash_attack' | 'launcher' | 'downward_strike' | 'air_attack' | 'spin_attack';

export interface Entity {
  id: string;
  type: EntityType;
  pos: Vector2;
  vel: Vector2;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  facing: number;
  state: ActionState;
  stateTimer: number;
  canAttack: boolean;
  attackCooldown: number;
  comboIndex: number;
  comboResetTimer: number;
  windup: number;
  bloodOnBody: StickingBlood[];
  lastTapTime: { [key: string]: number };
  airComboCount: number;
  dodgeCooldown: number;
  colorVariant?: string;
  slowMoEnergy?: number; // 0 - 100
  isSlowMoActive?: boolean;
  capePoints?: Vector2[]; // For physical cape simulation
}

export interface ActionRecord {
  pos: Vector2;
  state: ActionState;
  stateTimer: number;
  facing: number;
  time: number;
}

export interface StickingBlood {
  id: string;
  relX: number;
  relY: number;
  life: number;
  maxLife: number;
}

export interface WallSplatter {
  x: number;
  y: number;
  size: number;
  opacity: number;
  rotation: number;
  dots: { dx: number, dy: number, size: number }[];
  offscreenTimer: number; 
}

export interface GorePart {
  pos: Vector2;
  vel: Vector2;
  rotation: number;
  rotVel: number;
  width: number;
  height: number;
  type: 'head' | 'torso' | 'left_arm' | 'right_arm' | 'left_leg' | 'right_leg';
  color: string;
  isBleeding: boolean;
  bleedTimer: number;
  sprayTimer: number;
  isGrounded: boolean; 
  offscreenTimer: number;
  floatTimer?: number; 
  floatOriginY?: number; // Store origin to prevent teleport flickers
}

export interface Bullet {
  id: string;
  pos: Vector2;
  vel: Vector2;
  owner: 'player' | 'enemy';
  radius: number;
  isReflected: boolean;
  hitList: string[]; 
}

export interface Particle {
  id: string;
  pos: Vector2;
  vel: Vector2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  isBlood?: boolean;
  isLiquid?: boolean;
  isShockwave?: boolean; 
  isStreak?: boolean;    
}

export interface MapObject {
  id: string;
  pos: Vector2;
  width: number;
  height: number;
  type: 'platform' | 'plant';
  isBroken?: boolean;
}

export interface Bird {
  id: string;
  pos: Vector2;
  vel: Vector2;
  flapPhase: number;
  flapSpeed: number;
  size: number;
}
