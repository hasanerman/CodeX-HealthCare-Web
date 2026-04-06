import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Loader2, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Pill, CalendarDays, Bell } from 'lucide-react';

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toYmd(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function mondayIndexFromSunday(jsDay) {
  return (jsDay + 6) % 7;
}

function formatTimeForInput(t) {
  if (t == null || t === '') return '';
  const s = String(t);
  if (s.length >= 5) return s.slice(0, 5);
  return s;
}

export default function CalendarPlanner({ apiUrl, token }) {
  const today = new Date();
  const [cursor, setCursor] = useState({
    y: today.getFullYear(),
    m: today.getMonth() + 1,
  });
  const [events, setEvents] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filterKind, setFilterKind] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: '',
    notes: '',
    kind: 'event',
    event_date: toYmd(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    event_time: '',
  });

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const loadEvents = useCallback(async () => {
    setFetching(true);
    try {
      const { data } = await axios.get(`${apiUrl}/calendar/events`, {
        params: { year: cursor.y, month: cursor.m },
        headers: authHeaders,
      });
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      setEvents([]);
    } finally {
      setFetching(false);
    }
  }, [apiUrl, authHeaders, cursor.y, cursor.m]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    const list = filterKind === 'all' ? events : events.filter((e) => e.kind === filterKind);
    for (const e of list) {
      const key = e.event_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        const ta = a.event_time || '';
        const tb = b.event_time || '';
        if (ta !== tb) return ta.localeCompare(tb);
        return a.id - b.id;
      });
    }
    return map;
  }, [events, filterKind]);

  const { gridWeeks, monthLabel } = useMemo(() => {
    const y = cursor.y;
    const m = cursor.m;
    const first = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0).getDate();
    const lead = mondayIndexFromSunday(first.getDay());
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= lastDay; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return { gridWeeks: weeks, monthLabel: `${MONTHS_TR[m - 1]} ${y}` };
  }, [cursor.y, cursor.m]);

  const isTodayCell = (day) => {
    if (day == null) return false;
    return (
      cursor.y === today.getFullYear() &&
      cursor.m === today.getMonth() + 1 &&
      day === today.getDate()
    );
  };

  const openNew = (day) => {
    const d = day ?? today.getDate();
    const y = cursor.y;
    const m = cursor.m;
    setEditingId(null);
    setForm({
      title: '',
      notes: '',
      kind: 'event',
      event_date: toYmd(y, m, d),
      event_time: '',
    });
    setModalOpen(true);
  };

  const openEdit = (ev) => {
    setEditingId(ev.id);
    setForm({
      title: ev.title || '',
      notes: ev.notes || '',
      kind: ev.kind || 'event',
      event_date: ev.event_date,
      event_time: formatTimeForInput(ev.event_time),
    });
    setModalOpen(true);
  };

  const saveEvent = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        notes: form.notes.trim() || null,
        kind: form.kind,
        event_date: form.event_date,
        event_time: form.event_time && form.event_time.trim() ? `${form.event_time.trim()}:00` : null,
      };
      if (editingId) {
        await axios.put(`${apiUrl}/calendar/events/${editingId}`, payload, { headers: authHeaders });
      } else {
        await axios.post(`${apiUrl}/calendar/events`, payload, { headers: authHeaders });
      }
      setModalOpen(false);
      await loadEvents();
    } catch (err) {
      alert(err.response?.data?.error || 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const deleteEvent = async (id) => {
    if (!window.confirm('Bu kaydı silmek istiyor musunuz?')) return;
    setBusy(true);
    try {
      await axios.delete(`${apiUrl}/calendar/events/${id}`, { headers: authHeaders });
      setModalOpen(false);
      await loadEvents();
    } catch {
      alert('Silinemedi');
    } finally {
      setBusy(false);
    }
  };

  const prevMonth = () => {
    setCursor((c) => {
      let { y, m } = c;
      m -= 1;
      if (m < 1) {
        m = 12;
        y -= 1;
      }
      return { y, m };
    });
  };

  const nextMonth = () => {
    setCursor((c) => {
      let { y, m } = c;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      return { y, m };
    });
  };

  const kindDot = (kind) => {
    if (kind === 'medication') return 'bg-amber-500';
    if (kind === 'reminder') return 'bg-sky-500';
    return 'bg-blue-600';
  };

  const KindIcon = ({ k, className }) => {
    if (k === 'medication') return <Pill className={className} />;
    if (k === 'reminder') return <Bell className={className} />;
    return <CalendarDays className={className} />;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl md:text-4xl font-black font-headline tracking-tighter text-slate-900">Takvim</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Güne tıklayarak veya &quot;Yeni etkinlik&quot; ile kayıt ekleyin — etkinlik, ilaç veya hatırlatıcı.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
            className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-xs font-black uppercase tracking-widest text-slate-700 shadow-sm"
          >
            <option value="all">Tümü</option>
            <option value="event">Etkinlik</option>
            <option value="medication">İlaç</option>
            <option value="reminder">Hatırlatıcı</option>
          </select>
          <button
            type="button"
            onClick={() => openNew(null)}
            className="px-6 py-3 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus size={18} /> Yeni etkinlik
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/80">
          <button
            type="button"
            onClick={prevMonth}
            className="flex items-center gap-1 text-sm font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest"
          >
            <ChevronLeft size={20} /> Önceki
          </button>
          <div className="flex items-center gap-3">
            {fetching && <Loader2 className="animate-spin text-blue-500" size={22} />}
            <h3 className="text-xl font-black text-slate-900 tracking-tight">{monthLabel}</h3>
          </div>
          <button
            type="button"
            onClick={nextMonth}
            className="flex items-center gap-1 text-sm font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest"
          >
            Sonraki <ChevronRight size={20} />
          </button>
        </div>

        <div className="p-2 md:p-4">
            <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-2xl overflow-hidden border border-slate-200">
              {WEEKDAYS.map((wd) => (
                <div
                  key={wd}
                  className="bg-slate-100 text-center text-[10px] font-black uppercase tracking-widest text-slate-500 py-3"
                >
                  {wd}
                </div>
              ))}
              {gridWeeks.map((week, wi) =>
                week.map((day, di) => {
                  const key = `${wi}-${di}`;
                  if (day == null) {
                    return <div key={key} className="min-h-[100px] md:min-h-[120px] bg-slate-50/80" />;
                  }
                  const ymd = toYmd(cursor.y, cursor.m, day);
                  const dayEvents = eventsByDay.get(ymd) || [];
                  const todayH = isTodayCell(day);
                  return (
                    <div
                      key={key}
                      className={`min-h-[100px] md:min-h-[120px] bg-white p-1.5 md:p-2 flex flex-col border-t border-l border-slate-100 first:border-l-0 ${wi === 0 ? 'border-t-0' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => openNew(day)}
                        className={`text-left font-black text-sm mb-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          todayH
                            ? 'bg-blue-700 text-white shadow-md'
                            : dayEvents.length
                              ? 'text-blue-600 hover:bg-blue-50'
                              : 'text-slate-800 hover:bg-slate-100'
                        }`}
                      >
                        {day}
                      </button>
                      <div className="flex-1 space-y-1 overflow-y-auto max-h-[72px] md:max-h-[88px]">
                        {dayEvents.map((ev) => (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(ev);
                            }}
                            className="w-full text-left flex items-start gap-1.5 rounded-lg px-1 py-0.5 hover:bg-slate-50 group"
                          >
                            <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${kindDot(ev.kind)}`} />
                            <span className="text-[10px] md:text-[11px] font-bold text-slate-700 leading-tight line-clamp-2 group-hover:text-blue-700">
                              {ev.event_time ? `${formatTimeForInput(ev.event_time)} ` : ''}
                              {ev.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-5 text-sm text-slate-500 font-medium">
        <span className="font-black text-slate-700 uppercase text-[10px] tracking-widest block mb-1">Yakında</span>
        Gmail ile e-posta hatırlatıcı entegrasyonu bu takvime bağlanacak; şu an yalnızca uygulama içi kayıt tutulur.
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <h4 className="text-lg font-black uppercase italic tracking-tight text-slate-900">
                {editingId ? 'Düzenle' : 'Yeni kayıt'}
              </h4>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-900 font-black text-xs uppercase"
              >
                Kapat
              </button>
            </div>
            <form onSubmit={saveEvent} className="p-8 space-y-5">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Tür</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { v: 'event', label: 'Etkinlik', Icon: CalendarDays },
                    { v: 'medication', label: 'İlaç', Icon: Pill },
                    { v: 'reminder', label: 'Hatırlatıcı', Icon: Bell },
                  ].map(({ v, label, Icon }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, kind: v }))}
                      className={`py-3 rounded-xl border-2 text-[10px] font-black uppercase flex flex-col items-center gap-1 transition-all ${
                        form.kind === v ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 text-slate-600 hover:border-slate-200'
                      }`}
                    >
                      <Icon size={18} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Başlık</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-2 w-full px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="Örn. Aspirin, Kontrol randevusu…"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Tarih</label>
                  <input
                    type="date"
                    required
                    value={form.event_date}
                    onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
                    className="mt-2 w-full px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Saat (isteğe bağlı)</label>
                  <input
                    type="time"
                    value={form.event_time}
                    onChange={(e) => setForm((f) => ({ ...f, event_time: e.target.value }))}
                    className="mt-2 w-full px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Notlar</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="mt-2 w-full px-4 py-3 rounded-xl border border-slate-200 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-slate-200 resize-none"
                  placeholder="Doz, doktor notu, adres…"
                />
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 min-w-[140px] py-4 rounded-xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="animate-spin" size={18} /> : <Pencil size={16} />}
                  Kaydet
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => deleteEvent(editingId)}
                    disabled={busy}
                    className="py-4 px-6 rounded-xl border-2 border-rose-200 text-rose-600 font-black text-xs uppercase tracking-widest hover:bg-rose-50 flex items-center gap-2"
                  >
                    <Trash2 size={16} /> Sil
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
