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
  private announceInterval: ReturnType<typeof setInterval> | null = null;
  private startGameTimeout: ReturnType<typeof setTimeout> | null = null;
  private gameStarted: boolean = false;

  public init(
    roomCode: string,
    isHost: boolean,
    localPlayer: RemotePlayerInfo,
    callbacks: MultiplayerCallbacks
  ): boolean {
    const supabase = getSupabaseClient();
    if (!supabase) {
      callbacks.onStatusChange(
        'error',
        'Supabase environment variables not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      );
      return false;
    }

    this.leaveRoom();

    this.roomCode = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.isHost = isHost;
    this.localPlayer = localPlayer;
    this.opponentPlayer = null;
    this.callbacks = callbacks;
    this.gameStarted = false;

    callbacks.onStatusChange('connecting', `Connecting to room ${this.roomCode}...`);

    try {
      const channelTopic = `room_${this.roomCode}`;
      this.channel = supabase.channel(channelTopic, {
        config: {
          broadcast: { ack: true, self: false },
          presence: { key: localPlayer.id },
        },
      });

      // 1. Listen for Realtime Broadcast Events
      this.channel
        .on('broadcast', { event: 'PLAYER_ANNOUNCE' }, (payload) => {
          const remotePlayer = payload.payload as RemotePlayerInfo;
          if (remotePlayer && remotePlayer.id !== this.localPlayer?.id) {
            this.handleOpponentFound(remotePlayer);
            // Respond back so sender also has our info
            if (this.localPlayer) {
              this.broadcastEvent('PLAYER_ANNOUNCE', this.localPlayer);
            }
          }
        })
        .on('broadcast', { event: 'START_GAME' }, (payload) => {
          this.handleStartGame(payload.payload as { initialState: GameState });
        })
        .on('broadcast', { event: 'START_GAME_ACK' }, () => {
          if (this.startGameTimeout) {
            clearTimeout(this.startGameTimeout);
            this.startGameTimeout = null;
          }
        })
        .on('broadcast', { event: 'GAME_ACTION' }, (payload) => {
          if (payload?.payload?.action) {
            this.callbacks?.onRemoteAction(payload.payload.action);
          }
        })
        .on('broadcast', { event: 'SYNC_STATE' }, (payload) => {
          if (payload?.payload?.state) {
            this.callbacks?.onStateSync(payload.payload.state);
          }
        })
        .on('broadcast', { event: 'EMOTE' }, (payload) => {
          if (payload?.payload?.emote) {
            this.callbacks?.onEmoteReceived(payload.payload.emote, payload.payload.senderName || 'Opponent');
          }
        })
        .on('broadcast', { event: 'REMATCH' }, () => {
          this.callbacks?.onRematchRequested();
        });

      // 2. Realtime Presence Tracking
      this.channel
        .on('presence', { event: 'sync' }, () => {
          this.handlePresenceSync();
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
          this.processPresences(newPresences);
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
          const oppLeft = leftPresences.some((p: any) => p.playerId !== this.localPlayer?.id);
          if (oppLeft) {
            this.handleOpponentLeft();
          }
        });

      // 3. Subscribe to Realtime Channel
      this.channel.subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          // Track local player presence with full profile
          await this.channel?.track({
            playerId: localPlayer.id,
            name: localPlayer.name,
            creatureType: localPlayer.creatureType,
            size: localPlayer.size,
            deckCards: localPlayer.deckCards,
            isHost: this.isHost,
            timestamp: Date.now(),
          });

          // Immediate broadcast announcement
          this.broadcastEvent('PLAYER_ANNOUNCE', this.localPlayer);

          // Update initial status
          if (this.isHost) {
            this.callbacks?.onStatusChange('waiting_for_opponent', `Room ${this.roomCode} created! Waiting for challenger...`);
          } else {
            this.callbacks?.onStatusChange('connecting', `Joined room ${this.roomCode}! Waiting for host...`);
          }

          // Periodic handshake until opponent is discovered
          this.startAnnounceLoop();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Supabase channel subscription failed:', status, err);
          this.callbacks?.onStatusChange(
            'error',
            `Connection failed (${status}). Please check network connection.`
          );
        } else if (status === 'CLOSED') {
          this.callbacks?.onStatusChange('disconnected', 'Disconnected from room.');
        }
      });

      return true;
    } catch (err: any) {
      console.error('Multiplayer initialization exception:', err);
      callbacks.onStatusChange('error', err?.message || 'Error connecting to room');
      return false;
    }
  }

  private startAnnounceLoop() {
    this.stopAnnounceLoop();
    this.announceInterval = setInterval(() => {
      if (!this.opponentPlayer && this.channel && this.localPlayer) {
        this.broadcastEvent('PLAYER_ANNOUNCE', this.localPlayer);
        this.handlePresenceSync();
      } else {
        this.stopAnnounceLoop();
      }
    }, 2000);
  }

  private stopAnnounceLoop() {
    if (this.announceInterval) {
      clearInterval(this.announceInterval);
      this.announceInterval = null;
    }
  }

  private handlePresenceSync() {
    if (!this.channel) return;
    const state = this.channel.presenceState();
    const allPresences: any[] = [];
    Object.values(state).forEach((presences: any) => {
      if (Array.isArray(presences)) {
        allPresences.push(...presences);
      }
    });
    this.processPresences(allPresences);
  }

  private processPresences(presences: any[]) {
    if (!presences || !this.localPlayer) return;
    const opp = presences.find((p) => p.playerId && p.playerId !== this.localPlayer?.id);
    if (opp) {
      const oppInfo: RemotePlayerInfo = {
        id: opp.playerId,
        name: opp.name || 'Opponent',
        creatureType: opp.creatureType || CreatureType.Mammal,
        size: opp.size || 'Medium',
        deckCards: Array.isArray(opp.deckCards) ? opp.deckCards : [],
      };
      this.handleOpponentFound(oppInfo);
    }
  }

  private handleOpponentFound(remotePlayer: RemotePlayerInfo) {
    if (!remotePlayer || remotePlayer.id === this.localPlayer?.id) return;
    this.opponentPlayer = remotePlayer;
    this.stopAnnounceLoop();
    this.callbacks?.onOpponentJoined(remotePlayer);

    if (this.isHost) {
      this.callbacks?.onStatusChange('ready', `${remotePlayer.name} has joined! Ready to battle.`);
    } else {
      this.callbacks?.onStatusChange('ready', `Connected to Host ${remotePlayer.name}! Waiting for battle to start.`);
    }
  }

  private handleOpponentLeft() {
    this.opponentPlayer = null;
    this.callbacks?.onOpponentLeft();
    if (this.isHost && !this.gameStarted) {
      this.callbacks?.onStatusChange('waiting_for_opponent', 'Opponent disconnected. Waiting for challenger...');
      this.startAnnounceLoop();
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

    this.gameStarted = true;
    this.stopAnnounceLoop();

    // Broadcast to guest
    this.broadcastEvent('START_GAME', { initialState });

    // Retry once after 600ms if guest hasn't acknowledged
    this.startGameTimeout = setTimeout(() => {
      this.broadcastEvent('START_GAME', { initialState });
    }, 600);

    this.callbacks?.onStatusChange('in_game');
    this.callbacks?.onGameStarted(initialState);
  }

  private handleStartGame(payload: { initialState: GameState }) {
    if (!payload?.initialState || this.gameStarted) return;
    this.gameStarted = true;
    this.stopAnnounceLoop();

    // Send ACK back to host
    this.broadcastEvent('START_GAME_ACK', {});

    this.callbacks?.onStatusChange('in_game');
    this.callbacks?.onGameStarted(payload.initialState);
  }

  // Send player action to remote peer
  public sendAction(action: GameAction): void {
    this.broadcastEvent('GAME_ACTION', { action });
  }

  // State reconciliation
  public sendStateSync(state: GameState): void {
    this.broadcastEvent('SYNC_STATE', { state });
  }

  // Send emote
  public sendEmote(emote: string): void {
    if (!this.localPlayer) return;
    this.broadcastEvent('EMOTE', { emote, senderName: this.localPlayer.name });
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
    this.stopAnnounceLoop();
    if (this.startGameTimeout) {
      clearTimeout(this.startGameTimeout);
      this.startGameTimeout = null;
    }
    if (this.channel) {
      const supabase = getSupabaseClient();
      if (supabase) {
        supabase.removeChannel(this.channel);
      } else {
        this.channel.unsubscribe();
      }
      this.channel = null;
    }
    this.roomCode = '';
    this.opponentPlayer = null;
    this.gameStarted = false;
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
