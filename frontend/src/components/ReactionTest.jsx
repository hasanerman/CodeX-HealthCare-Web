import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Zap, Play, RotateCcw, Timer, History } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../config';

const ReactionTest = ({ onBack, token }) => {
  const [gameState, setGameState] = useState('idle');
  const [startTime, setStartTime] = useState(0);
  const [reactionTime, setReactionTime] = useState(null);
  const [bestTime, setBestTime] = useState(null);
  const [history, setHistory] = useState([]);
  const [userComment, setUserComment] = useState('');
  const timeoutRef = useRef(null);

  const getClinicalFeedback = (time) => {
    if (time < 200) return "OLAĞANÜSTÜ REFLEKS: Cerrah hassasiyetinde bir odaklanma düzeyindesiniz.";
    if (time < 280) return "HARİKA: Standart klinik reaksiyon sürelerinin üzerindesiniz. Odaklanma çok iyi.";
    if (time < 350) return "İYİ: Normal bir klinik tepki süresi. Rutin işlemler için yeterli odaklanma.";
    if (time < 450) return "DİKKAT: Tepki süreniz ortalamanın biraz altında. Belki biraz dinlenmelisiniz.";
    return "YORGUNLUK BELİRTİSİ: Tepki süreniz yavaş. Dikkat gerektiren işlerden önce mola vermeniz önerilir.";
  };

  const startTest = () => {
    setGameState('waiting');
    setUserComment('');
    const delay = Math.floor(Math.random() * 3000) + 2000;
    timeoutRef.current = setTimeout(() => {
      setGameState('ready');
      setStartTime(Date.now());
    }, delay);
  };

  const handleClick = () => {
    if (gameState === 'waiting') {
      clearTimeout(timeoutRef.current);
      setGameState('idle');
      alert('Çok erken! Hazır olduğunda tıkla.');
    } else if (gameState === 'ready') {
      const time = Date.now() - startTime;
      setReactionTime(time);
      setBestTime(prev => (prev === null || time < prev ? time : prev));
      setHistory(prev => [time, ...prev].slice(0, 5));
      setGameState('result');
    }
  };

  const handleSave = async () => {
    const feedback = getClinicalFeedback(reactionTime);
    const finalComment = userComment ? `[Analiz: ${feedback}] - [Not: ${userComment}]` : `[Analiz: ${feedback}]`;
    
    try {
      await axios.post(`${API_URL}/games/save-score`, {
        gameType: 'reaction',
        difficulty: 'standard',
        timeSeconds: reactionTime / 1000,
        moves: 1,
        comment: finalComment
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Sonuç ve yorumun başarıyla kaydedildi!');
      setGameState('idle');
    } catch (err) { alert('Kaydetme hatası oluştu.'); }
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      <div className="flex items-center justify-between">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors font-bold uppercase text-[10px] tracking-widest"
        >
          <ArrowLeft size={16} /> Kütüphaneye Dön
        </button>
        <div className="flex gap-4">
           {bestTime && (
             <div className="bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3">
                <Zap size={18} className="text-yellow-400" fill="currentColor" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">En İyi:</span>
                <span className="font-black">{bestTime}ms</span>
             </div>
           )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto text-center space-y-8">
        <div className="space-y-2">
           <h2 className="text-4xl font-black font-headline tracking-tighter uppercase italic">Tepki Testi</h2>
           <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em]">Refleks ve Odak Analizi</p>
        </div>

        <div 
          onClick={gameState === 'idle' || gameState === 'result' ? (gameState === 'result' ? null : startTest) : handleClick}
          className={`h-[400px] rounded-[3rem] shadow-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group ${
            gameState === 'idle' ? 'bg-white border-4 border-slate-100 hover:border-slate-300' :
            gameState === 'waiting' ? 'bg-rose-500 text-white' :
            gameState === 'ready' ? 'bg-emerald-500 text-white scale-[1.02]' :
            'bg-slate-900 text-white'
          }`}
        >
           {gameState === 'idle' && (
             <div className="space-y-6 animate-in zoom-in-95">
                <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center text-white mx-auto shadow-2xl group-hover:scale-110 transition-transform">
                   <Play size={32} fill="currentColor" />
                </div>
                <p className="font-black uppercase tracking-[0.2em] text-slate-400 text-xs">Başlamak İçin Tıkla</p>
                <p className="text-slate-300 italic text-[10px] font-medium max-w-xs mx-auto text-center">
                   Renk <span className="text-emerald-500 font-black">YEŞİL</span> olduğunda en hızlı şekilde dokun!
                </p>
             </div>
           )}

           {gameState === 'waiting' && (
             <div className="space-y-4 animate-in fade-in">
                <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
                <p className="text-2xl font-black font-headline uppercase tracking-widest">BEKLE...</p>
             </div>
           )}

           {gameState === 'ready' && (
             <div className="space-y-4 animate-bounce">
                <Zap size={80} fill="currentColor" />
                <p className="text-5xl font-black font-headline tracking-tighter uppercase">TIKLA!</p>
             </div>
           )}

           {gameState === 'result' && (
             <div className="space-y-6 animate-in zoom-in-95 px-10 w-full">
                <div className="space-y-1">
                   <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Tepki Süren</p>
                   <p className="text-8xl font-black font-headline tracking-tighter">{reactionTime}ms</p>
                </div>
                
                <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/10 space-y-4">
                   <p className="text-emerald-400 font-bold italic text-sm">"{getClinicalFeedback(reactionTime)}"</p>
                   <textarea
                     value={userComment}
                     onChange={(e) => setUserComment(e.target.value)}
                     placeholder="Sonucun hakkında bir not ekle... (Örn: Uykusuzluk, kahve sonrası, vb.)"
                     className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl p-4 text-white text-sm focus:outline-none focus:border-emerald-500 transition-colors h-24"
                   />
                   <div className="flex gap-3">
                      <button 
                        onClick={handleSave}
                        className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-emerald-400 transition-all"
                      >
                        Kaydet & Bitir
                      </button>
                      <button 
                        onClick={() => { setGameState('idle'); setReactionTime(null); }}
                        className="px-6 py-4 bg-slate-800 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:text-white transition-all"
                      >
                        İptal
                      </button>
                   </div>
                </div>
             </div>
           )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
           {history.map((t, i) => (
             <div key={i} className="bg-white p-6 rounded-3xl border border-slate-50 shadow-sm flex flex-col items-center gap-2 group hover:shadow-md transition-all">
                <Timer size={16} className="text-slate-200 group-hover:text-slate-900 transition-colors" />
                <span className="font-black text-slate-900">{t}ms</span>
                <span className="text-[9px] font-black uppercase text-slate-300 italic">{i === 0 ? 'Son' : `${i+1}. Önceki`}</span>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
};

export default ReactionTest;
