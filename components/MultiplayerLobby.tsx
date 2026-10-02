import React, { useState, useEffect } from 'react';
import { CardId, CreatureType, GameState } from '../types';
import { CARDS } from '../constants';
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
  const [createdRoomCode, setCreatedRoomCode] = useState(generateRandomRoomCode());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [opponent, setOpponent] = useState<RemotePlayerInfo | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Supabase Configuration State
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [configSaved, setConfigSaved] = useState(false);
  const [isSupabaseReady, setIsSupabaseReady] = useState(false);

  // Load Supabase Config on mount
  useEffect(() => {
    const config = getStoredSupabaseConfig();
    setSupabaseUrl(config.url);
    setSupabaseKey(config.anonKey);
    setIsSupabaseReady(!!(config.url && config.anonKey));

    // Check URL parameters for ?room=CODE
    const searchParams = new URLSearchParams(window.location.search);
    const roomParam = searchParams.get('room');
    if (roomParam) {
      setRoomCodeInput(roomParam.trim().toUpperCase());
      setActiveTab('join');
    }
  }, []);

  // Cleanup multiplayer on unmount if not in game
  useEffect(() => {
    return () => {
      if (connectionStatus !== 'in_game') {
        multiplayerService.leaveRoom();
      }
    };
  }, [connectionStatus]);

  const handleSaveConfig = () => {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      alert('Please provide both Supabase Project URL and Anon API Key.');
      return;
    }
    saveSupabaseConfig(supabaseUrl, supabaseKey);
    setIsSupabaseReady(true);
    setConfigSaved(true);
    setTimeout(() => {
      setConfigSaved(false);
      setShowConfigModal(false);
    }, 1200);
  };

  const getEffectiveDeck = (): CardId[] => {
    if (customDeck && customDeck.length >= 10) {
      return customDeck;
    }
    return generateRandomAiDeck(creatureType, size);
  };

  const handleCreateRoom = () => {
    if (!isSupabaseReady) {
      setShowConfigModal(true);
      return;
    }

    const myId = `host_${Date.now().toString(36)}`;
    const localPlayer: RemotePlayerInfo = {
      id: myId,
      name: playerName || 'Host',
      creatureType,
      size,
      deckCards: getEffectiveDeck(),
    };

    multiplayerService.init(createdRoomCode, true, localPlayer, {
      onStatusChange: (status, msg) => {
        setConnectionStatus(status);
        if (msg) setStatusMessage(msg);
      },
      onOpponentJoined: (opp) => {
        setOpponent(opp);
      },
      onOpponentLeft: () => {
        setOpponent(null);
        setStatusMessage('Opponent has disconnected.');
      },
      onGameStarted: (initialState) => {
        onStartGame(initialState, myId, true);
      },
      onRemoteAction: () => {},
      onStateSync: () => {},
      onEmoteReceived: () => {},
      onRematchRequested: () => {},
    });
  };

  const handleJoinRoom = () => {
    if (!isSupabaseReady) {
      setShowConfigModal(true);
      return;
    }

    if (!roomCodeInput.trim()) {
      setStatusMessage('Please enter a room code.');
      return;
    }

    const myId = `guest_${Date.now().toString(36)}`;
    const localPlayer: RemotePlayerInfo = {
      id: myId,
      name: playerName || 'Challenger',
      creatureType,
      size,
      deckCards: getEffectiveDeck(),
    };

    multiplayerService.init(roomCodeInput.trim(), false, localPlayer, {
      onStatusChange: (status, msg) => {
        setConnectionStatus(status);
        if (msg) setStatusMessage(msg);
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
  };

  const handleStartHostBattle = () => {
    if (!opponent) return;
    multiplayerService.startHostGame();
  };

  const handleCopyInviteLink = () => {
    const code = activeTab === 'create' ? createdRoomCode : roomCodeInput;
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleCancel = () => {
    multiplayerService.leaveRoom();
    setConnectionStatus('idle');
    setOpponent(null);
    setStatusMessage('');
  };

  const isConnectedToRoom = connectionStatus === 'waiting_for_opponent' || connectionStatus === 'ready' || connectionStatus === 'connecting';

  return (
    <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-4 text-white relative">
      <div className="max-w-xl w-full bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl p-6 md:p-8 animate-fade-in relative z-10">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6 border-b border-stone-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🌐</span>
            <div>
              <h1 className="text-2xl font-black text-amber-500 uppercase tracking-wider">Online Multiplayer</h1>
              <p className="text-xs text-stone-400">Real-time PvP matches powered by Supabase Realtime</p>
            </div>
          </div>
          <button 
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg text-xs font-bold text-stone-300 transition cursor-pointer"
            title="Configure Supabase Project"
          >
            <span className={`w-2 h-2 rounded-full ${isSupabaseReady ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400 animate-pulse'}`} />
            <span>Supabase</span>
          </button>
        </div>

        {/* Supabase Missing Notice Banner */}
        {!isSupabaseReady && (
          <div className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="font-bold text-sm text-amber-400 mb-0.5">⚠️ Supabase Setup Required for Multiplayer</p>
              <p className="text-stone-300">Connect your free Supabase project to enable real-time WebSocket matchmaking across devices and Vercel.</p>
            </div>
            <button
              onClick={() => setShowConfigModal(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black rounded-lg text-xs transition whitespace-nowrap cursor-pointer"
            >
              Setup Supabase
            </button>
          </div>
        )}

        {/* Selected Creature Deck Info Bar */}
        <div className="mb-6 p-3.5 bg-black/40 border border-stone-800 rounded-xl flex items-center justify-between text-xs">
          <div>
            <span className="text-stone-400">Battle Profile: </span>
            <span className="font-black text-amber-400">{playerName || 'Player'}</span>
            <span className="text-stone-400"> ({creatureType}, {size}) • </span>
            <span className="text-emerald-400 font-bold">{customDeck?.length || 12}-Card Deck</span>
          </div>
          <button
            onClick={onOpenDeckBuilder}
            className="text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
          >
            Edit Deck
          </button>
        </div>

        {/* Main Content Area */}
        {!isConnectedToRoom ? (
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
                <div className="p-4 bg-stone-950/60 rounded-2xl border border-stone-800 text-center">
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-1.5">
                    Your Room Code
                  </label>
                  <div className="text-3xl font-black text-amber-400 tracking-widest font-mono">
                    {createdRoomCode}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">Share this code with your friend to battle</p>
                </div>

                <button
                  onClick={handleCreateRoom}
                  className="w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black text-lg rounded-xl shadow-lg transition transform hover:scale-[1.01] active:scale-95 border-b-4 border-orange-800 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>⚔️</span> CREATE ROOM & WAIT FOR PLAYER
                </button>
              </div>
            )}

            {/* Tab: Join Room */}
            {activeTab === 'join' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">
                    Enter 6-Character Room Code
                  </label>
                  <input
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. CLASH7"
                    maxLength={10}
                    className="w-full px-4 py-3.5 bg-black/60 rounded-xl border border-stone-700 text-amber-400 text-2xl font-black tracking-widest text-center uppercase focus:border-amber-500 outline-none font-mono"
                  />
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
          /* Waiting / Lobby State */
          <div className="space-y-6">
            <div className="p-4 bg-stone-950/80 rounded-2xl border border-stone-800 text-center">
              <div className="text-xs uppercase font-bold text-stone-400 tracking-wider mb-1">
                Room Code
              </div>
              <div className="text-3xl md:text-4xl font-black text-amber-400 tracking-widest font-mono select-all">
                {activeTab === 'create' ? createdRoomCode : roomCodeInput}
              </div>

              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  onClick={handleCopyInviteLink}
                  className="px-3.5 py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg text-xs font-bold text-stone-200 transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>{copySuccess ? '✓ Copied Link!' : '📋 Copy Invite Link'}</span>
                </button>
              </div>
            </div>

            {/* Players Status Cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* Local Player */}
              <div className="p-3 bg-stone-950/50 border border-amber-600/30 rounded-xl text-center">
                <span className="text-2xl block mb-1">👑</span>
                <div className="text-xs text-amber-400 font-bold uppercase">{playerName || 'You'}</div>
                <div className="text-[11px] text-stone-400">{creatureType} ({size})</div>
                <div className="mt-2 text-[10px] text-emerald-400 font-bold">READY (YOU)</div>
              </div>

              {/* Opponent */}
              <div className={`p-3 rounded-xl border text-center transition-all ${
                opponent
                  ? 'bg-stone-950/50 border-emerald-500/40 text-stone-200'
                  : 'bg-stone-950/20 border-dashed border-stone-800 text-stone-500'
              }`}>
                <span className="text-2xl block mb-1">{opponent ? '⚔️' : '⏳'}</span>
                <div className="text-xs font-bold uppercase">
                  {opponent ? opponent.name : 'Waiting...'}
                </div>
                <div className="text-[11px] text-stone-400">
                  {opponent ? `${opponent.creatureType} (${opponent.size})` : 'Challenger slot'}
                </div>
                <div className="mt-2 text-[10px] font-bold">
                  {opponent ? (
                    <span className="text-emerald-400 font-bold animate-pulse">CHALLENGER READY</span>
                  ) : (
                    <span className="text-stone-500">WAITING FOR PLAYER</span>
                  )}
                </div>
              </div>
            </div>

            {/* Status Message */}
            {statusMessage && (
              <div className="text-center text-xs text-stone-300 bg-stone-900/60 p-2.5 rounded-lg border border-stone-800">
                {statusMessage}
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
                <div className="text-center p-3 text-xs text-stone-400 italic">
                  Waiting for host to start the game...
                </div>
              )}

              <button
                onClick={handleCancel}
                className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs rounded-xl border border-stone-700 transition cursor-pointer"
              >
                Leave Room
              </button>
            </div>
          </div>
        )}

        {/* Back to Single Player */}
        <div className="mt-6 pt-4 border-t border-stone-800 flex justify-between items-center text-xs text-stone-500">
          <button
            onClick={onBack}
            className="hover:text-stone-300 font-bold transition cursor-pointer"
          >
            ← Back to Main Menu
          </button>
          <span>Vercel + Supabase Ready</span>
        </div>
      </div>

      {/* Supabase Project Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-stone-900 border border-stone-700 rounded-2xl p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-4 border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <h3 className="text-lg font-black text-amber-400">Supabase Connection</h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-stone-400 hover:text-white font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-300 mb-4 leading-relaxed">
              Enter your Supabase project credentials. These can be found in your{' '}
              <span className="text-amber-400 font-bold">Supabase Dashboard → Project Settings → API</span>.
              <br />
              <span className="text-stone-400 italic">
                When deploying to Vercel, set <code className="text-amber-300 bg-black/40 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> and <code className="text-amber-300 bg-black/40 px-1 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> in Environment Variables!
              </span>
            </p>

            <div className="space-y-3.5 mb-5">
              <div>
                <label className="block text-xs font-bold text-stone-400 mb-1">
                  Supabase Project URL
                </label>
                <input
                  type="text"
                  placeholder="https://your-project.supabase.co"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-black/60 rounded-lg border border-stone-700 text-white text-xs font-mono focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-400 mb-1">
                  Supabase Anon (Public) Key
                </label>
                <textarea
                  rows={3}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-black/60 rounded-lg border border-stone-700 text-white text-xs font-mono focus:border-amber-500 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSaveConfig}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-black text-sm rounded-xl transition cursor-pointer shadow-md"
              >
                {configSaved ? '✓ Config Saved!' : 'Save & Connect'}
              </button>
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-3 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-sm rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
