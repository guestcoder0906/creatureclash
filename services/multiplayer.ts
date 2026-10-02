import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';
import { GameAction, GameState, CardId, CreatureType, Habitat } from '../types';
import { createCustomPlayer } from './gameEngine';
import { getRandomElement } from '../constants';

export interface RemotePlayerInfo {
  id: string;
  name: string;
  creatureType: CreatureType;
  size: 'Small' | 'Medium' | 'Big';
  deckCards: CardId[];
}

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'waiting_for_opponent'
  | 'ready'
  | 'in_game'
  | 'disconnected'
  | 'error';

export interface MultiplayerCallbacks {
  onStatusChange: (status: ConnectionStatus, message?: string) => void;
  onOpponentJoined: (opponent: RemotePlayerInfo) => void;
  onOpponentLeft: () => void;
  onGameStarted: (initialState: GameState) => void;
  onRemoteAction: (action: GameAction) => void;
  onStateSync: (state: GameState) => void;
  onEmoteReceived: (emote: string, senderName: string) => void;
  onRematchRequested: () => void;
}

export class MultiplayerManager {
  private channel: RealtimeChannel | null = null;
  private roomCode: string = '';
  private isHost: boolean = false;
  private localPlayer: RemotePlayerInfo | null = null;
  private opponentPlayer: RemotePlayerInfo | null = null;
  private callbacks: MultiplayerCallbacks | null = null;

  public init(
    roomCode: string,
    isHost: boolean,
    localPlayer: RemotePlayerInfo,
    callbacks: MultiplayerCallbacks
  ): boolean {
    const supabase = getSupabaseClient();
    if (!supabase) {
      callbacks.onStatusChange('error', 'Supabase credentials are not configured.');
      return false;
    }

    this.leaveRoom();

    this.roomCode = roomCode.trim().toUpperCase();
    this.isHost = isHost;
    this.localPlayer = localPlayer;
    this.callbacks = callbacks;

    callbacks.onStatusChange('connecting', `Connecting to room ${this.roomCode}...`);

    try {
      this.channel = supabase.channel(`clash_room_${this.roomCode}`, {
        config: {
          broadcast: { self: false },
          presence: { key: localPlayer.id },
        },
      });

      // 1. Listen for Broadcast Events
      this.channel
        .on('broadcast', { event: 'PLAYER_JOIN' }, (payload) => {
          this.handlePlayerJoin(payload.payload as RemotePlayerInfo);
        })
        .on('broadcast', { event: 'START_GAME' }, (payload) => {
          this.handleStartGame(payload.payload as { initialState: GameState });
        })
        .on('broadcast', { event: 'GAME_ACTION' }, (payload) => {
          this.handleGameAction(payload.payload as { action: GameAction });
        })
        .on('broadcast', { event: 'SYNC_STATE' }, (payload) => {
          this.handleSyncState(payload.payload as { state: GameState });
        })
        .on('broadcast', { event: 'EMOTE' }, (payload) => {
          this.handleEmote(payload.payload as { emote: string; senderName: string });
        })
        .on('broadcast', { event: 'REMATCH' }, () => {
          this.callbacks?.onRematchRequested();
        });

      // 2. Presence tracking
      this.channel
        .on('presence', { event: 'sync' }, () => {
          this.handlePresenceSync();
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
          const opponentLeft = leftPresences.some((p: any) => p.playerId !== this.localPlayer?.id);
          if (opponentLeft) {
            this.callbacks?.onOpponentLeft();
            if (this.isHost) {
              this.callbacks?.onStatusChange('waiting_for_opponent', 'Opponent disconnected.');
            }
          }
        });

      // 3. Subscribe to channel
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track our own presence
          await this.channel?.track({
            playerId: localPlayer.id,
            name: localPlayer.name,
            creatureType: localPlayer.creatureType,
            size: localPlayer.size,
            isHost: this.isHost,
            onlineAt: new Date().toISOString(),
          });

          if (this.isHost) {
            this.callbacks?.onStatusChange('waiting_for_opponent', `Room ${this.roomCode} created! Waiting for opponent...`);
          } else {
            // Guest tells host they have joined
            this.broadcastEvent('PLAYER_JOIN', this.localPlayer);
            this.callbacks?.onStatusChange('connecting', 'Joined room! Waiting for host to start...');
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.callbacks?.onStatusChange('error', 'Failed to connect to Supabase Realtime.');
        } else if (status === 'CLOSED') {
          this.callbacks?.onStatusChange('disconnected', 'Disconnected from room.');
        }
      });

      return true;
    } catch (err: any) {
      console.error('Multiplayer initialization error:', err);
      callbacks.onStatusChange('error', err?.message || 'Error connecting to room');
      return false;
    }
  }

  private handlePresenceSync() {
    if (!this.channel) return;
    const state = this.channel.presenceState();
    const allPresences: any[] = [];
    Object.values(state).forEach((presences: any) => {
      allPresences.push(...presences);
    });

    const opponent = allPresences.find((p) => p.playerId !== this.localPlayer?.id);
    if (opponent) {
      if (!this.isHost && this.localPlayer) {
        // If guest sees host, re-announce join in case host missed it
        this.broadcastEvent('PLAYER_JOIN', this.localPlayer);
      }
    }
  }

  private handlePlayerJoin(remotePlayer: RemotePlayerInfo) {
    if (!remotePlayer || remotePlayer.id === this.localPlayer?.id) return;
    this.opponentPlayer = remotePlayer;
    this.callbacks?.onOpponentJoined(remotePlayer);

    if (this.isHost) {
      this.callbacks?.onStatusChange('ready', `${remotePlayer.name} has joined! Ready to battle.`);
    }
  }

  // Host starts the match with synchronized initial state
  public startHostGame(): void {
    if (!this.isHost || !this.localPlayer || !this.opponentPlayer) return;

    const habitats = [Habitat.Forest, Habitat.Desert, Habitat.Water, Habitat.Arena];
    const selectedHabitat = getRandomElement(habitats);

    const p1 = createCustomPlayer(
      this.localPlayer.id,
      this.localPlayer.name,
      this.localPlayer.deckCards,
      this.localPlayer.creatureType,
      this.localPlayer.size
    );

    const p2 = createCustomPlayer(
      this.opponentPlayer.id,
      this.opponentPlayer.name,
      this.opponentPlayer.deckCards,
      this.opponentPlayer.creatureType,
      this.opponentPlayer.size
    );

    const firstPlayerId = Math.random() > 0.5 ? p1.id : p2.id;
    const firstPlayerName = firstPlayerId === p1.id ? p1.name : p2.name;

    const initialState: GameState = {
      gameId: `multi_${this.roomCode}_${Date.now()}`,
      habitat: selectedHabitat,
      turn: 1,
      currentPlayer: firstPlayerId,
      players: { [p1.id]: p1, [p2.id]: p2 },
      log: [
        `Live Multiplayer Match: Room ${this.roomCode}!`,
        `${p1.name} (${p1.creatureType}, ${p1.size}) vs ${p2.name} (${p2.creatureType}, ${p2.size})`,
        `Battlefield Habitat: ${selectedHabitat}`,
        `${firstPlayerName} goes first!`
      ],
      winner: null,
      phase: 'start',
      activeCoinFlip: null,
      pendingReaction: null,
      pendingChoice: null,
      notifications: []
    };

    // Broadcast to guest and invoke locally
    this.broadcastEvent('START_GAME', { initialState });
    this.callbacks?.onStatusChange('in_game');
    this.callbacks?.onGameStarted(initialState);
  }

  private handleStartGame(payload: { initialState: GameState }) {
    if (!payload?.initialState) return;
    this.callbacks?.onStatusChange('in_game');
    this.callbacks?.onGameStarted(payload.initialState);
  }

  // Send player action to remote peer
  public sendAction(action: GameAction): void {
    this.broadcastEvent('GAME_ACTION', { action });
  }

  private handleGameAction(payload: { action: GameAction }) {
    if (payload?.action) {
      this.callbacks?.onRemoteAction(payload.action);
    }
  }

  // Sync state fallback
  public sendStateSync(state: GameState): void {
    this.broadcastEvent('SYNC_STATE', { state });
  }

  private handleSyncState(payload: { state: GameState }) {
    if (payload?.state) {
      this.callbacks?.onStateSync(payload.state);
    }
  }

  // Send reaction emote
  public sendEmote(emote: string): void {
    if (!this.localPlayer) return;
    this.broadcastEvent('EMOTE', { emote, senderName: this.localPlayer.name });
  }

  private handleEmote(payload: { emote: string; senderName: string }) {
    if (payload?.emote) {
      this.callbacks?.onEmoteReceived(payload.emote, payload.senderName || 'Opponent');
    }
  }

  // Rematch request
  public requestRematch(): void {
    this.broadcastEvent('REMATCH', {});
    if (this.isHost) {
      this.startHostGame();
    }
  }

  private broadcastEvent(event: string, payload: any): void {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event,
      payload,
    }).catch((err) => {
      console.warn(`Failed to broadcast ${event}:`, err);
    });
  }

  public leaveRoom(): void {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.roomCode = '';
    this.opponentPlayer = null;
    this.callbacks?.onStatusChange('idle');
  }

  public getRoomCode(): string {
    return this.roomCode;
  }

  public isRoomHost(): boolean {
    return this.isHost;
  }

  public updateGameCallbacks(gameCallbacks: Partial<MultiplayerCallbacks>): void {
    if (this.callbacks) {
      this.callbacks = {
        ...this.callbacks,
        ...gameCallbacks,
      };
    }
  }
}

export const multiplayerService = new MultiplayerManager();
