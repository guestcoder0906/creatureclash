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
  onOpponentDisconnected?: () => void;
  onRequestSync?: () => void;
  onGameStarted: (initialState: GameState) => void;
  onRemoteAction: (action: GameAction, state?: GameState) => void;
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
  private disconnectGraceTimeout: ReturnType<typeof setTimeout> | null = null;
  private gameStarted: boolean = false;
  private isLeaving: boolean = false;
  private beforeUnloadHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;

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
    this.isLeaving = false;

    this.roomCode = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.isHost = isHost;
    this.localPlayer = localPlayer;
    this.opponentPlayer = null;
    this.callbacks = callbacks;
    this.gameStarted = false;

    callbacks.onStatusChange('connecting', `Connecting to room ${this.roomCode}...`);

    try {
      const channelTopic = `room_${this.roomCode}`;
      // Use standard fire-and-forget broadcast (ack: false) for instant low-latency peer messaging
      this.channel = supabase.channel(channelTopic, {
        config: {
          broadcast: { ack: false, self: false },
          presence: { key: localPlayer.id },
        },
      });

      // 1. Listen for Realtime Broadcast Events
      this.channel
        .on('broadcast', { event: 'PLAYER_ANNOUNCE' }, (payload) => {
          this.clearDisconnectGrace();
          const remotePlayer = payload.payload as RemotePlayerInfo;
          if (remotePlayer && remotePlayer.id !== this.localPlayer?.id) {
            this.handleOpponentFound(remotePlayer);
            if (this.localPlayer) {
              this.broadcastEvent('PLAYER_ANNOUNCE', this.localPlayer);
            }
          }
        })
        .on('broadcast', { event: 'START_GAME' }, (payload) => {
          this.clearDisconnectGrace();
          this.handleStartGame(payload.payload as { initialState: GameState });
        })
        .on('broadcast', { event: 'START_GAME_ACK' }, () => {
          this.clearDisconnectGrace();
          if (this.startGameTimeout) {
            clearTimeout(this.startGameTimeout);
            this.startGameTimeout = null;
          }
        })
        .on('broadcast', { event: 'GAME_ACTION' }, (payload) => {
          this.clearDisconnectGrace();
          const action = payload?.payload?.action;
          const state = payload?.payload?.state;
          if (action) {
            this.callbacks?.onRemoteAction(action, state);
          } else if (state) {
            this.callbacks?.onStateSync(state);
          }
        })
        .on('broadcast', { event: 'SYNC_STATE' }, (payload) => {
          this.clearDisconnectGrace();
          if (payload?.payload?.state) {
            this.callbacks?.onStateSync(payload.payload.state);
          }
        })
        .on('broadcast', { event: 'REQUEST_SYNC' }, () => {
          this.clearDisconnectGrace();
          this.callbacks?.onRequestSync?.();
        })
        .on('broadcast', { event: 'PLAYER_DISCONNECTED' }, (payload) => {
          // ONLY trigger disconnect if the player explicitly closed/reloaded the window
          if (payload?.payload?.explicitClose) {
            this.handleOpponentDisconnected();
          }
        })
        .on('broadcast', { event: 'EMOTE' }, (payload) => {
          this.clearDisconnectGrace();
          if (payload?.payload?.emote) {
            this.callbacks?.onEmoteReceived(payload.payload.emote, payload.payload.senderName || 'Opponent');
          }
        })
        .on('broadcast', { event: 'REMATCH' }, () => {
          this.clearDisconnectGrace();
          this.callbacks?.onRematchRequested();
        });

      // 2. Realtime Presence Tracking
      this.channel
        .on('presence', { event: 'sync' }, () => {
          this.clearDisconnectGrace();
          this.handlePresenceSync();
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
          this.clearDisconnectGrace();
          this.processPresences(newPresences);
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
          const oppLeft = leftPresences.some((p: any) => p.playerId !== this.localPlayer?.id);
          if (oppLeft) {
            if (this.gameStarted) {
              // During a match, DO NOT drop the game immediately if the player is just backgrounding the tab
              // Give a 20-second grace period for background tab reconnects
              this.startDisconnectGrace();
            } else {
              this.handleOpponentLeft();
            }
          }
        });

      // 3. Subscribe to Realtime Channel
      this.channel.subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          await this.channel?.track({
            playerId: localPlayer.id,
            name: localPlayer.name,
            creatureType: localPlayer.creatureType,
            size: localPlayer.size,
            deckCards: localPlayer.deckCards,
            isHost: this.isHost,
            timestamp: Date.now(),
          });

          this.broadcastEvent('PLAYER_ANNOUNCE', this.localPlayer);

          if (this.isHost) {
            this.callbacks?.onStatusChange('waiting_for_opponent', `Room ${this.roomCode} created! Waiting for challenger...`);
          } else {
            this.callbacks?.onStatusChange('connecting', `Joined room ${this.roomCode}! Waiting for host...`);
          }

          this.startAnnounceLoop();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Supabase channel subscription failed:', status, err);
          this.callbacks?.onStatusChange(
            'error',
            `Connection failed (${status}). Please check network connection.`
          );
        } else if (status === 'CLOSED') {
          if (!this.isLeaving) {
            this.callbacks?.onStatusChange('disconnected', 'Disconnected from room.');
          }
        }
      });

      // 4. Attach window beforeunload and pagehide ONLY to catch actual tab close or reload
      this.beforeUnloadHandler = () => {
        if (this.channel) {
          // Explicit close/reload signal
          this.broadcastEvent('PLAYER_DISCONNECTED', { playerId: this.localPlayer?.id, explicitClose: true });
        }
      };
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
      window.addEventListener('pagehide', this.beforeUnloadHandler);

      // 5. When player returns to the tab after backgrounding, immediately request state sync
      this.visibilityHandler = () => {
        if (!document.hidden && this.channel && this.gameStarted) {
          // Announce presence & request authoritative state from peer
          this.broadcastEvent('REQUEST_SYNC', { requesterId: this.localPlayer?.id });
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);

      return true;
    } catch (err: any) {
      console.error('Multiplayer initialization exception:', err);
      callbacks.onStatusChange('error', err?.message || 'Error connecting to room');
      return false;
    }
  }

  private startDisconnectGrace() {
    if (!this.disconnectGraceTimeout) {
      this.disconnectGraceTimeout = setTimeout(() => {
        this.handleOpponentDisconnected();
        this.disconnectGraceTimeout = null;
      }, 20000); // 20-second grace window for background tabs or temporary socket hiccups
    }
  }

  private clearDisconnectGrace() {
    if (this.disconnectGraceTimeout) {
      clearTimeout(this.disconnectGraceTimeout);
      this.disconnectGraceTimeout = null;
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
      this.clearDisconnectGrace();
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

  private handleOpponentDisconnected() {
    this.clearDisconnectGrace();
    this.opponentPlayer = null;
    this.callbacks?.onOpponentDisconnected?.();
    this.callbacks?.onStatusChange('disconnected', 'The other player has closed or reloaded the game.');
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

  // Send player action to remote peer along with authoritative resulting state
  public sendAction(action: GameAction, resultingState?: GameState): void {
    this.broadcastEvent('GAME_ACTION', { action, state: resultingState });
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
    this.isLeaving = true;
    this.stopAnnounceLoop();
    this.clearDisconnectGrace();

    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      window.removeEventListener('pagehide', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }

    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    if (this.startGameTimeout) {
      clearTimeout(this.startGameTimeout);
      this.startGameTimeout = null;
    }

    if (this.channel) {
      const channelToClose = this.channel;
      this.channel = null;

      // Broadcast explicit close signal if we were in a game
      if (this.gameStarted) {
        channelToClose.send({
          type: 'broadcast',
          event: 'PLAYER_DISCONNECTED',
          payload: { playerId: this.localPlayer?.id, explicitClose: true },
        }).catch(() => {});
      }

      const supabase = getSupabaseClient();
      if (supabase) {
        supabase.removeChannel(channelToClose);
      } else {
        channelToClose.unsubscribe();
      }
    }

    this.roomCode = '';
    this.opponentPlayer = null;
    this.gameStarted = false;
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
