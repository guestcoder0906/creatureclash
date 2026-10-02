import React, { useState, useEffect, useRef } from 'react';
import { CardId, CreatureType, GameState } from '../types';
import { CARDS, getRandomElement } from '../constants';
import { generateRandomAiDeck } from '../services/gameEngine';
import { getStoredSupabaseConfig, saveSupabaseConfig, getSupabaseClient } from '../services/supabase';
import { multiplayerService, RemotePlayerInfo, ConnectionStatus } from '../services/multiplayer';

interface MultiplayerLobbyProps {
  playerName: string;
  onStartGame: (initialState: GameState, myId: string, isHost: boolean) => void;
  onBack: () => void;
  onOpenDeckBuilder: () => void;
  customDeck: CardId[];
  creatureType: CreatureType;
  size: 'Small' | 'Medium' | 'Big';
}

const CREATURE_ICONS: Record<CreatureType, string> = {
  [CreatureType.Mammal]: '🐻 Mammal',
  [CreatureType.Reptile]: '🦎 Reptile',
  [CreatureType.Avian]: '🦅 Avian',
  [CreatureType.Amphibian]: '🐸 Amphibian',
};

const generateRandomRoomCode = (): string => {
  const words = ['CLASH', 'FANG', 'ROAR', 'BEAST', 'CLAW', 'VIPER', 'HAWK', 'WOLF', 'BEAR', 'SHARK', 'APEX'];
  const prefix = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${prefix}${num}`;
};

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  playerName,
  onStartGame,
  onBack,
  onOpenDeckBuilder,
  customDeck,
  creatureType,
  size,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [createdRoomCode] = useState(generateRandomRoomCode());
  const [inRoom, setInRoom] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [opponent, setOpponent] = useState<RemotePlayerInfo | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Fallback dev input toggle if env vars are missing in local preview
  const [showDevConfig, setShowDevConfig] = useState(false);
  const [devUrl, setDevUrl] = useState('');
  const [devKey, setDevKey] = useState('');

  // Deck mode: 'custom' or 'random'
  const hasCustomDeck = customDeck && customDeck.length >= 10;
  const [deckMode, setDeckMode] = useState<'custom' | 'random'>(hasCustomDeck ? 'custom' : 'random');

  // Random setup generated on demand
  const [randomSetup, setRandomSetup] = useState(() => {
    const types = [CreatureType.Mammal, CreatureType.Reptile, CreatureType.Avian, CreatureType.Amphibian];
    const sizes: ('Small' | 'Medium' | 'Big')[] = ['Small', 'Medium', 'Big'];
    const rType = getRandomElement(types);
    const rSize = getRandomElement(sizes);
    return {
      type: rType,
      size: rSize,
      deck: generateRandomAiDeck(rType, rSize),
    };
  });

  const rollNewRandomDeck = () => {
    const types = [CreatureType.Mammal, CreatureType.Reptile, CreatureType.Avian, CreatureType.Amphibian];
    const sizes: ('Small' | 'Medium' | 'Big')[] = ['Small', 'Medium', 'Big'];
    const rType = getRandomElement(types);
    const rSize = getRandomElement(sizes);
    setRandomSetup({
      type: rType,
      size: rSize,
      deck: generateRandomAiDeck(rType, rSize),
    });
  };

  const activeCreatureType = deckMode === 'custom' && hasCustomDeck ? creatureType : randomSetup.type;
  const activeSize = deckMode === 'custom' && hasCustomDeck ? size : randomSetup.size;
  const activeDeck = deckMode === 'custom' && hasCustomDeck ? customDeck : randomSetup.deck;

  // Check URL parameters for ?room=CODE
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const roomParam = searchParams.get('room');
    if (roomParam) {
      setRoomCodeInput(roomParam.trim().toUpperCase());
      setActiveTab('join');
    }

    const cfg = getStoredSupabaseConfig();
    if (cfg.url) setDevUrl(cfg.url);
    if (cfg.anonKey) setDevKey(cfg.anonKey);
  }, []);

  // Cleanup multiplayer ONLY when unmounting the entire lobby without entering a game
  useEffect(() => {
    return () => {
      // NEVER tear down channel if the match has started!
      if (!multiplayerService.isGameStarted()) {
        multiplayerService.leaveRoom();
      }
    };
  }, []); // Run ONLY on unmount!

  const handleSaveDevConfig = () => {
    if (!devUrl.trim() || !devKey.trim()) return;
    saveSupabaseConfig(devUrl.trim(), devKey.trim());
    setErrorMessage('');
    setShowDevConfig(false);
  };

  const handleCreateRoom = () => {
    setErrorMessage('');
    const client = getSupabaseClient();
    if (!client) {
      setErrorMessage(
        'Supabase credentials not found. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured in your Vercel project settings or set them below.'
      );
      setShowDevConfig(true);
      return;
    }

    const myId = `host_${Date.now().toString(36)}`;
    const localPlayer: RemotePlayerInfo = {
      id: myId,
      name: playerName || 'Host',
      creatureType: activeCreatureType,
      size: activeSize,
      deckCards: activeDeck,
    };

    setInRoom(true);
    setConnectionStatus('connecting');
    setStatusMessage('Connecting to Supabase Realtime Live...');

    const success = multiplayerService.init(createdRoomCode, true, localPlayer, {
      onStatusChange: (status, msg) => {
        setConnectionStatus(status);
        if (msg) setStatusMessage(msg);
        if (status === 'error' && msg) {
          setErrorMessage(msg);
        }
      },
      onOpponentJoined: (opp) => {
        setOpponent(opp);
      },
      onOpponentLeft: () => {
        setOpponent(null);
        setStatusMessage('Opponent has left. Waiting for challenger...');
      },
      onGameStarted: (initialState) => {
        onStartGame(initialState, myId, true);
      },
      onRemoteAction: () => {},
      onStateSync: () => {},
      onEmoteReceived: () => {},
      onRematchRequested: () => {},
    });

    if (!success) {
      setInRoom(false);
    }
  };

  const handleJoinRoom = () => {
    setErrorMessage('');
    const trimmedCode = roomCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!trimmedCode) {
      setErrorMessage('Please enter a valid room code.');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setErrorMessage(
        'Supabase credentials not found. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured in your Vercel project settings or set them below.'
      );
      setShowDevConfig(true);
      return;
    }

    const myId = `guest_${Date.now().toString(36)}`;
    const localPlayer: RemotePlayerInfo = {
      id: myId,
      name: playerName || 'Challenger',
      creatureType: activeCreatureType,
      size: activeSize,
      deckCards: activeDeck,
    };

    setInRoom(true);
    setConnectionStatus('connecting');
    setStatusMessage(`Connecting to room ${trimmedCode}...`);

    const success = multiplayerService.init(trimmedCode, false, localPlayer, {
      onStatusChange: (status, msg) => {
        setConnectionStatus(status);
        if (msg) setStatusMessage(msg);
        if (status === 'error' && msg) {
          setErrorMessage(msg);
        }
      },
      onOpponentJoined: (opp) => {
        setOpponent(opp);
      },
      onOpponentLeft: () => {
        setOpponent(null);
        setStatusMessage('Host has disconnected.');
      },
      onGameStarted: (initialState) => {
        onStartGame(initialState, myId, false);
      },
      onRemoteAction: () => {},
      onStateSync: () => {},
      onEmoteReceived: () => {},
      onRematchRequested: () => {},
    });

    if (!success) {
      setInRoom(false);
    }
  };

  const handleStartHostBattle = () => {
    if (!opponent) return;
    multiplayerService.startHostGame();
  };

  const handleCopyInviteLink = () => {
    const code = activeTab === 'create' ? createdRoomCode : roomCodeInput.trim().toUpperCase();
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleLeaveRoom = () => {
    multiplayerService.leaveRoom();
    setInRoom(false);
    setConnectionStatus('idle');
    setOpponent(null);
    setStatusMessage('');
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-4 text-white relative">
      <div className="max-w-xl w-full bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl p-6 md:p-8 animate-fade-in relative z-10">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-5 border-b border-stone-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌐</span>
            <div>
              <h1 className="text-2xl font-black text-amber-500 uppercase tracking-wider">Online Multiplayer</h1>
              <p className="text-xs text-stone-400">Powered by Supabase Realtime Live • Vercel Ready</p>
            </div>
          </div>
          <button
            onClick={inRoom ? handleLeaveRoom : onBack}
            className="text-stone-400 hover:text-white text-xs font-bold px-3 py-1.5 bg-stone-800 rounded-lg border border-stone-700 transition cursor-pointer"
          >
            {inRoom ? 'Leave Room' : '← Menu'}
          </button>
        </div>

        {/* Global Error Banner if any */}
        {errorMessage && (
          <div className="mb-4 p-3.5 bg-red-950/60 border border-red-500/50 rounded-xl text-red-200 text-xs flex flex-col gap-2 animate-fade-in">
            <div className="flex items-start gap-2">
              <span className="text-base">⚠️</span>
              <span className="flex-1 font-medium">{errorMessage}</span>
            </div>
            {!showDevConfig && (
              <button
                onClick={() => setShowDevConfig(true)}
                className="self-start text-[11px] text-amber-400 hover:underline font-bold"
              >
                Set / Check Supabase Credentials →
              </button>
            )}
          </div>
        )}

        {/* Optional Dev / Preview Credentials form if needed */}
        {showDevConfig && (
          <div className="mb-5 p-4 bg-stone-950 border border-stone-700 rounded-2xl space-y-3 animate-fade-in">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Supabase Credentials (Vercel / Local)
              </span>
              <button
                onClick={() => setShowDevConfig(false)}
                className="text-stone-400 hover:text-white text-xs"
              >
                ✕ Close
              </button>
            </div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              If deploying on Vercel, set these in <span className="text-white font-mono">Project Settings → Environment Variables</span>. For local preview, enter them here:
            </p>
            <input
              type="text"
              placeholder="https://xyz.supabase.co"
              value={devUrl}
              onChange={(e) => setDevUrl(e.target.value)}
              className="w-full px-3 py-2 bg-black/60 rounded-lg border border-stone-700 text-xs font-mono text-white outline-none focus:border-amber-500"
            />
            <input
              type="text"
              placeholder="anon-public-key"
              value={devKey}
              onChange={(e) => setDevKey(e.target.value)}
              className="w-full px-3 py-2 bg-black/60 rounded-lg border border-stone-700 text-xs font-mono text-white outline-none focus:border-amber-500"
            />
            <button
              onClick={handleSaveDevConfig}
              className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg transition"
            >
              Save Credentials
            </button>
          </div>
        )}

        {/* Deck Selection & Chosen Creature Display Bar */}
        <div className="mb-6 p-4 bg-stone-950/80 border border-stone-800 rounded-2xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-800/80 pb-3">
            <div>
              <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Your Battler: </span>
              <span className="font-black text-amber-400 text-sm ml-1">{playerName || 'Player'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400">Chosen Creature:</span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-1">
                {CREATURE_ICONS[activeCreatureType]}
                <span className="text-stone-300 font-normal">({activeSize})</span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex gap-2">
              {hasCustomDeck && (
                <button
                  onClick={() => setDeckMode('custom')}
                  disabled={inRoom}
                  className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer disabled:opacity-50 ${
                    deckMode === 'custom'
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  My Custom Deck ({CREATURE_ICONS[creatureType]})
                </button>
              )}
              <button
                onClick={() => setDeckMode('random')}
                disabled={inRoom}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer disabled:opacity-50 ${
                  deckMode === 'random'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                🎲 Random Deck ({CREATURE_ICONS[randomSetup.type]}, {randomSetup.size})
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {deckMode === 'random' && !inRoom && (
                <button
                  onClick={rollNewRandomDeck}
                  className="text-stone-400 hover:text-amber-400 font-bold underline cursor-pointer text-[11px]"
                  title="Re-roll a new random creature type and size"
                >
                  🔄 Re-roll Creature
                </button>
              )}
              {!inRoom && (
                <button
                  onClick={onOpenDeckBuilder}
                  className="text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer text-[11px]"
                >
                  Deck Builder
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        {!inRoom ? (
          <div>
            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 mb-6 p-1 bg-stone-950 rounded-xl border border-stone-800">
              <button
                onClick={() => setActiveTab('create')}
                className={`py-2.5 rounded-lg font-black text-sm tracking-wide transition cursor-pointer ${
                  activeTab === 'create'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                CREATE ROOM
              </button>
              <button
                onClick={() => setActiveTab('join')}
                className={`py-2.5 rounded-lg font-black text-sm tracking-wide transition cursor-pointer ${
                  activeTab === 'join'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                JOIN ROOM
              </button>
            </div>

            {/* Tab: Create Room */}
            {activeTab === 'create' && (
              <div className="space-y-4">
                <div className="p-5 bg-stone-950/70 rounded-2xl border border-stone-800 text-center">
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-1.5">
                    Your Room Code
                  </label>
                  <div className="text-4xl font-black text-amber-400 tracking-widest font-mono">
                    {createdRoomCode}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-2">
                    Playing as <span className="font-bold text-amber-300">{CREATURE_ICONS[activeCreatureType]} ({activeSize})</span> with {activeDeck.length} cards
                  </p>
                </div>

                <button
                  onClick={handleCreateRoom}
                  className="w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black text-lg rounded-xl shadow-lg transition transform hover:scale-[1.01] active:scale-95 border-b-4 border-orange-800 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>⚔️</span> CREATE ROOM & WAIT FOR CHALLENGER
                </button>
              </div>
            )}

            {/* Tab: Join Room */}
            {activeTab === 'join' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">
                    Enter Room Code
                  </label>
                  <input
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. CLASH72"
                    maxLength={10}
                    className="w-full px-4 py-3.5 bg-black/60 rounded-xl border border-stone-700 text-amber-400 text-2xl font-black tracking-widest text-center uppercase focus:border-amber-500 outline-none font-mono"
                  />
                  <p className="text-center text-[11px] text-stone-500 mt-1.5">
                    Entering as <span className="font-bold text-amber-300">{CREATURE_ICONS[activeCreatureType]} ({activeSize})</span>
                  </p>
                </div>

                <button
                  onClick={handleJoinRoom}
                  disabled={!roomCodeInput.trim()}
                  className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:hover:scale-100 text-white font-black text-lg rounded-xl shadow-lg transition transform hover:scale-[1.01] active:scale-95 border-b-4 border-emerald-800 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🔗</span> JOIN ROOM
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Waiting / Room Lobby State */
          <div className="space-y-6">
            <div className="p-4 bg-stone-950/80 rounded-2xl border border-stone-800 text-center">
              <div className="text-xs uppercase font-bold text-stone-400 tracking-wider mb-1 flex items-center justify-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'ready' 
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' 
                    : connectionStatus === 'connecting'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-emerald-400 animate-pulse'
                }`} />
                <span>Room Code</span>
              </div>
              <div className="text-4xl font-black text-amber-400 tracking-widest font-mono select-all">
                {activeTab === 'create' ? createdRoomCode : roomCodeInput.trim().toUpperCase()}
              </div>

              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  onClick={handleCopyInviteLink}
                  className="px-4 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg text-xs font-bold text-stone-200 transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>{copySuccess ? '✓ Copied Link!' : '📋 Copy Invite Link'}</span>
                </button>
              </div>
            </div>

            {/* Players Status Cards displaying each player's chosen creature type */}
            <div className="grid grid-cols-2 gap-3">
              {/* Local Player */}
              <div className="p-4 bg-stone-950/70 border-2 border-amber-500/40 rounded-2xl text-center shadow-lg">
                <span className="text-2xl block mb-1">👑</span>
                <div className="text-xs text-amber-400 font-black uppercase tracking-wider truncate">
                  {playerName || 'You'} {activeTab === 'create' ? '(HOST)' : ''}
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-850 rounded-full border border-stone-700 text-xs font-bold text-amber-300 my-2">
                  <span>{CREATURE_ICONS[activeCreatureType]}</span>
                  <span className="text-stone-400 font-normal">({activeSize})</span>
                </div>
                <div className="text-[11px] text-stone-400 font-mono">
                  {activeDeck.length} Cards in Deck
                </div>
                <div className="mt-2 text-[10px] text-emerald-400 font-black tracking-wider uppercase">
                  READY (YOU)
                </div>
              </div>

              {/* Opponent Player */}
              <div className={`p-4 rounded-2xl border-2 text-center shadow-lg transition-all ${
                opponent
                  ? 'bg-stone-950/70 border-emerald-500/50 text-stone-200'
                  : 'bg-stone-950/30 border-dashed border-stone-800 text-stone-500'
              }`}>
                <span className="text-2xl block mb-1">{opponent ? '⚔️' : '⏳'}</span>
                <div className="text-xs font-black uppercase tracking-wider truncate">
                  {opponent ? opponent.name : 'Waiting...'}
                </div>
                {opponent ? (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-850 rounded-full border border-stone-700 text-xs font-bold text-emerald-300 my-2">
                      <span>{CREATURE_ICONS[opponent.creatureType]}</span>
                      <span className="text-stone-400 font-normal">({opponent.size})</span>
                    </div>
                    <div className="text-[11px] text-stone-400 font-mono">
                      {opponent.deckCards.length} Cards in Deck
                    </div>
                    <div className="mt-2 text-[10px] text-emerald-400 font-black tracking-wider uppercase animate-pulse">
                      CHALLENGER READY
                    </div>
                  </>
                ) : (
                  <div className="py-4 text-xs text-stone-500 italic">
                    Waiting for someone to join...
                  </div>
                )}
              </div>
            </div>

            {/* Status Message */}
            {statusMessage && (
              <div className="text-center text-xs text-stone-300 bg-stone-900/80 p-2.5 rounded-lg border border-stone-800 flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2">
              {activeTab === 'create' ? (
                <button
                  onClick={handleStartHostBattle}
                  disabled={!opponent}
                  className="w-full py-4 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 disabled:opacity-40 disabled:hover:scale-100 text-white font-black text-lg rounded-xl shadow-[0_0_25px_rgba(220,38,38,0.4)] transition transform hover:scale-[1.01] active:scale-95 border-b-4 border-red-800 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>⚔️</span> START BATTLE
                </button>
              ) : (
                <div className="text-center p-3 text-xs text-stone-400 italic bg-black/30 rounded-xl border border-white/5">
                  {opponent 
                    ? `Connected to Host (${opponent.name}). Waiting for Host to start battle...` 
                    : 'Connecting to room channel via Supabase Realtime...'}
                </div>
              )}

              <button
                onClick={handleLeaveRoom}
                className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs rounded-xl border border-stone-700 transition cursor-pointer"
              >
                Leave Room
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-stone-800 flex justify-between items-center text-xs text-stone-500">
          <button
            onClick={inRoom ? handleLeaveRoom : onBack}
            className="hover:text-stone-300 font-bold transition cursor-pointer"
          >
            ← Back to Main Menu
          </button>
          <span>Supabase Realtime Live</span>
        </div>
      </div>
    </div>
  );
};
