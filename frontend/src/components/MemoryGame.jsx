import React, { useState, useEffect } from 'react';
import { RefreshCw, ArrowLeft, Trophy, Timer, Brain, Play } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../config';

const DIFFICULTY_MODE_LABEL = { easy: 'KOLAY', medium: 'ORTA', hard: 'ZOR' };

const icons = [
  'heart_plus', 'brain', 'medical_services', 'local_hospital', 
  'radiology', 'biotech', 'clinical_notes', 'stethoscope',
  'dentistry', 'microbiology', 'pulmonology', 'cardiology',
  'neurology', 'urology', 'ophthalmology', 'gastroenterology',
  'dermatology', 'psychology', 'emergency', 'vaccines',
  'blood_pressure', 'skeleton', 'dna', 'pill'
];

const MemoryGame = ({ onBack, token }) => {
  const [difficulty, setDifficulty] = useState(null);
  const [cards, setCards] = useState([]);
  const [flipped, setFlipped] = useState([]);
  const [solved, setSolved] = useState([]);
  const [moves, setMoves] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    if (difficulty) initializeGame();
  }, [difficulty]);

  useEffect(() => {
    let interval;
    if (startTime && !gameOver) {
      interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [startTime, gameOver]);

  const initializeGame = () => {
    let pairCount = 8;
    if (difficulty === 'medium') pairCount = 18;
    if (difficulty === 'hard') pairCount = 32;

    const gameIcons = icons.slice(0, pairCount);
    const shuffled = [...gameIcons, ...gameIcons]
      .sort(() => Math.random() - 0.5)
      .map((icon, index) => ({ id: index, icon }));
    
    setCards(shuffled);
    setFlipped([]);
    setSolved([]);
    setMoves(0);
    setElapsed(0);
    setStartTime(null);
    setGameOver(false);
  };

  const handleFlip = (index) => {
    if (flipped.length === 2 || flipped.includes(index) || solved.includes(index) || gameOver) return;

    if (!startTime) setStartTime(Date.now());

    const newFlipped = [...flipped, index];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMoves(m => m + 1);
      const [first, second] = newFlipped;
      if (cards[first].icon === cards[second].icon) {
        const nextSolved = [...solved, first, second];
        setSolved(nextSolved);
        setFlipped([]);
        if (nextSolved.length === cards.length) {
          setGameOver(true);
          saveScore(nextSolved.length / 2);
        }
      } else {
        setTimeout(() => setFlipped([]), 1000);
      }
    }
  };

  const saveScore = async (pairs) => {
    try {
      await axios.post(`${API_URL}/games/save-score`, {
        gameType: 'memory',
        difficulty: difficulty,
        moves: moves + 1,
        timeSeconds: Math.floor((Date.now() - startTime) / 1000),
        comment: `[Analiz: ${DIFFICULTY_MODE_LABEL[difficulty] || difficulty} modunda ${moves + 1} hamle ile zihin jimnastiği tamamlandı.]`
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) { console.error('Score saving error:', err); }
  };

  if (!difficulty) {
    return (
      <div className="max-w-4xl mx-auto space-y-12 py-10 animate-in fade-in zoom-in-95 duration-700">
        <div className="text-center space-y-4">
           <h2 className="text-5xl font-black font-headline tracking-tighter uppercase italic">Klinik Hafıza Testi</h2>
           <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.4em]">Zihinsel Hız ve Görsel Analiz Seviyesi</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           <DifficultyCard 
             title="Stajyer" 
             level="easy" 
             desc="4x4 Izgara (8 Çift)" 
             icon="medical_information"
             color="bg-slate-100"
             onClick={() => setDifficulty('easy')} 
           />
           <DifficultyCard 
             title="Uzman" 
             level="medium" 
             desc="6x6 Izgara (18 Çift)" 
             icon="biotech"
             color="bg-slate-900 text-white"
             onClick={() => setDifficulty('medium')} 
           />
           <DifficultyCard 
             title="Profesör" 
             level="hard" 
             desc="8x8 Izgara (32 Çift)" 
             icon="neurology"
             color="bg-emerald-500 text-white"
             onClick={() => setDifficulty('hard')} 
           />
        </div>

        <button 
          onClick={onBack}
          className="mx-auto block text-slate-400 hover:text-slate-900 transition-colors font-bold uppercase text-[10px] tracking-widest border-b border-transparent hover:border-slate-900"
        >
          Kütüphaneye Dön
        </button>
      </div>
    );
  }

  const gridCols = difficulty === 'easy' ? 'grid-cols-4' : difficulty === 'medium' ? 'grid-cols-6' : 'grid-cols-8';
  const cardSizeClass = difficulty === 'easy' ? 'rounded-[2rem]' : difficulty === 'medium' ? 'rounded-2xl' : 'rounded-xl';
  const iconSizeClass = difficulty === 'easy' ? 'text-4xl md:text-5xl lg:text-6xl' : difficulty === 'medium' ? 'text-2xl md:text-3xl lg:text-4xl' : 'text-xl md:text-2xl lg:text-3xl';
  const gapClass = difficulty === 'easy' ? 'gap-6' : difficulty === 'medium' ? 'gap-3 md:gap-4' : 'gap-2';

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex items-center justify-between bg-white/80 backdrop-blur-xl p-6 rounded-[2.5rem] border border-slate-50 shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-6">
           <button 
             onClick={() => { setDifficulty(null); setGameOver(false); }}
             className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform"
           >
             <ArrowLeft size={20} />
           </button>
           <div className="hidden md:block">
              <h3 className="font-black text-slate-900 uppercase italic tracking-tighter text-xl leading-none">Hafıza Testi</h3>
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-1 italic">{DIFFICULTY_MODE_LABEL[difficulty]} MODU</p>
           </div>
        </div>
        
        <div className="flex gap-6">
          <div className="bg-white px-8 py-3 rounded-2xl shadow-sm border border-slate-50 flex items-center gap-4">
             <Timer size={20} className="text-slate-300" />
             <div className="text-right">
                <p className="text-[8px] font-black text-slate-300 uppercase italic">Süre</p>
                <p className="font-black text-slate-900 leading-none">{elapsed}s</p>
             </div>
          </div>
          <div className="bg-white px-8 py-3 rounded-2xl shadow-sm border border-slate-50 flex items-center gap-4">
             <Brain size={20} className="text-slate-300" />
             <div className="text-right">
                <p className="text-[8px] font-black text-slate-300 uppercase italic">Hamle</p>
                <p className="font-black text-slate-900 leading-none">{moves}</p>
             </div>
          </div>
        </div>
      </div>

      <div className={`max-w-5xl mx-auto grid ${gridCols} ${gapClass}`}>
        {cards.map((card, index) => {
          const isFlipped = flipped.includes(index) || solved.includes(index);
          const isSolved = solved.includes(index);
          return (
            <div 
              key={card.id}
              onClick={() => handleFlip(index)}
              className={`relative cursor-pointer transition-all duration-500 preserve-3d aspect-square ${isFlipped ? 'rotate-y-180' : ''}`}
            >
              <div className={`absolute inset-0 bg-slate-900 ${cardSizeClass} flex items-center justify-center text-white shadow-xl backface-hidden ${isFlipped ? 'opacity-0' : 'opacity-100'}`}>
                 <span className="material-symbols-outlined text-xl opacity-10">clinical_notes</span>
              </div>
              
              <div className={`absolute inset-0 bg-white ${cardSizeClass} flex items-center justify-center text-slate-900 shadow-xl border-2 ${isSolved ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100'} backface-hidden rotate-y-180 ${isFlipped ? 'opacity-100' : 'opacity-0'}`}>
                 <span className={`material-symbols-outlined ${iconSizeClass} ${isSolved ? 'text-emerald-500 scale-110' : 'text-slate-900'}`}>{card.icon}</span>
              </div>
            </div>
          );
        })}
      </div>

      {gameOver && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="bg-white rounded-[3rem] p-12 text-center shadow-2xl border border-slate-100 max-w-sm w-full space-y-8 scale-100 animate-in zoom-in-95 duration-500">
             <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-2xl mx-auto">
                <Trophy size={48} />
             </div>
             <div className="space-y-2">
                <h3 className="text-3xl font-black font-headline uppercase tracking-tighter italic">Harika Performans!</h3>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em]">Sonuçlar Profiline Kaydedildi</p>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl">
                   <p className="text-[10px] font-black text-slate-300 uppercase italic mb-1">Süre</p>
                   <p className="text-2xl font-black text-slate-900">{elapsed}s</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl">
                   <p className="text-[10px] font-black text-slate-300 uppercase italic mb-1">Hamle</p>
                   <p className="text-2xl font-black text-slate-900">{moves}</p>
                </div>
             </div>
             <div className="flex flex-col gap-3">
                <button 
                  onClick={initializeGame}
                  className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl shadow-xl hover:bg-slate-800 transition-all uppercase tracking-widest text-[11px] flex items-center justify-center gap-3"
                >
                  <RefreshCw size={16} /> Tekrar Dene
                </button>
                <button 
                  onClick={() => setDifficulty(null)}
                  className="w-full py-4 text-slate-400 font-black hover:text-slate-900 transition-colors uppercase tracking-[0.2em] text-[10px]"
                >
                  Zorluk Değiştir
                </button>
             </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
};

const DifficultyCard = ({ title, level, desc, icon, color, onClick }) => (
  <button 
    onClick={onClick}
    className={`${color} p-10 rounded-[3rem] border border-transparent shadow-xl hover:shadow-2xl hover:scale-105 transition-all text-center space-y-6 group`}
  >
     <div className={`w-20 h-20 bg-white/10 ${level === 'easy' ? 'bg-slate-900/10' : 'bg-white/20'} rounded-3xl flex items-center justify-center mx-auto shadow-2xl`}>
        <span className="material-symbols-outlined text-4xl">{icon}</span>
     </div>
     <div className="space-y-1">
        <h4 className="text-2xl font-black font-headline uppercase italic tracking-tighter">{title}</h4>
        <p className="text-[10px] font-black uppercase tracking-widest opacity-60 italic">{desc}</p>
     </div>
     <div className="flex items-center justify-center gap-2 pt-4">
        <div className={`w-3 h-3 rounded-full ${level === 'easy' ? 'bg-slate-900' : 'bg-white'}`}></div>
        <div className={`w-3 h-3 rounded-full ${level === 'easy' ? 'bg-slate-200' : (level === 'medium' ? 'bg-white' : 'bg-white/40')}`}></div>
        <div className={`w-3 h-3 rounded-full ${level === 'easy' ? 'bg-slate-200' : (level === 'hard' ? 'bg-white' : 'bg-white/40')}`}></div>
     </div>
  </button>
);

export default MemoryGame;
