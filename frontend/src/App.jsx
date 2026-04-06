import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Loader2, Menu, X, ChevronDown, LogOut, Search, Camera, Upload,
  Info, AlertTriangle, ChevronRight, UserCircle, MapPin, Activity, Navigation,
  Gamepad2, Trophy, Play, Brain, Zap, History, ArrowLeft, Stethoscope
} from 'lucide-react';
import MemoryGame from './components/MemoryGame';
import ReactionTest from './components/ReactionTest';
import CalendarPlanner from './components/CalendarPlanner';
import NobetciGenTrEmbed from './components/NobetciGenTrEmbed';
import { API_URL } from './config';

function normalizeLabReportResponse(data) {
  if (!data || typeof data !== 'object') return data;
  const list = data.critical_values;
  if (!Array.isArray(list)) return data;

  const pickName = (v) =>
    [v.name, v.parameter, v.parametre, v.test_name, v.test, v.metric, v.analyte, v.label, v.bilesen, v.madde]
      .find((x) => typeof x === 'string' && x.trim())
      ?.trim() ?? '';

  return {
    ...data,
    critical_values: list.map((raw) => {
      const v = raw && typeof raw === 'object' ? { ...raw } : {};
      const paramName = pickName(v);
      const displayName = paramName || 'Tanımlanmamış parametre';
      const unit =
        [v.unit, v.birim, v.units].find((x) => typeof x === 'string' && x.trim())?.trim() || 'mg/dL';
      let meaning =
        [v.meaning, v.analysis, v.comment, v.aciklama, v.description, v.interpretation]
          .find((x) => typeof x === 'string' && x.trim())
          ?.trim() ?? '';

      const statusStr = typeof v.status === 'string' ? v.status : '';
      const valueStr = v.value != null && String(v.value).trim() !== '' ? String(v.value) : '—';
      const referenceRange =
        [
          v.reference_range,
          v.referenceRange,
          v.normal_range,
          v.ref_range,
          v.expected_range,
          v.referans_araligi,
          v.referans,
          v.olmasi_gereken_aralik,
        ]
          .find((x) => typeof x === 'string' && x.trim())
          ?.trim() ?? '';

      if (!meaning) {
        const refPart = referenceRange ? ` Referans: ${referenceRange}.` : '';
        meaning = `${displayName}: Ölçülen değer ${valueStr} ${unit}.${refPart} Klinik durum: ${statusStr || 'belirtilmedi'}.`;
      } else if (paramName && !meaning.toLowerCase().includes(paramName.toLowerCase())) {
        meaning = `${paramName}: ${meaning}`;
      }

      return { ...v, name: displayName, unit, meaning, reference_range: referenceRange };
    }),
  };
}

function reportValueIsHigh(status) {
  return typeof status === 'string' && (status.includes('Yüksek') || status.includes('High'));
}
function reportValueIsNormal(status) {
  return status === 'Normal' || (typeof status === 'string' && status.toLowerCase() === 'normal');
}

async function fetchGeoFromPublicHttps() {
  const tryOne = async (url, parse) => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) return null;
      const j = await r.json();
      const out = parse(j);
      return out?.lat != null && out?.lon != null ? out : null;
    } catch {
      return null;
    } finally {
      clearTimeout(tid);
    }
  };

  let coords = await tryOne('https://ipwho.is/', (j) =>
    j?.success !== false && j?.latitude != null && j?.longitude != null
      ? { lat: Number(j.latitude), lon: Number(j.longitude) }
      : null
  );
  if (coords) return { ...coords, source: 'ip-public' };

  coords = await tryOne('https://get.geojs.io/v1/ip/geo.json', (j) =>
    j?.latitude != null && j?.longitude != null
      ? { lat: Number(j.latitude), lon: Number(j.longitude) }
      : null
  );
  if (coords) return { ...coords, source: 'ip-public' };

  return null;
}

const SUPPORT_EMAIL = 'codexhealthcareapp@gmail.com';


const SidebarItem = ({ id, label, icon, active, onClick, materialIcon = true }) => (
  <button
    onClick={() => onClick(id)}
    className={`flex items-center gap-3 px-3 py-2.5 w-full rounded-xl font-manrope tracking-tight text-xs font-semibold transition-all duration-300 ease-in-out ${active
        ? 'bg-slate-900 text-white shadow-lg'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
      }`}
  >
    {materialIcon ? (
      <span className="material-symbols-outlined" style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>{icon}</span>
    ) : icon}
    {label}
  </button>
);

const SectionHeader = ({ title, subtitle }) => (
  <div className="space-y-1 mb-6">
    <h2 className="text-2xl md:text-3xl font-extrabold font-headline tracking-tighter text-slate-900">
      {title}
    </h2>
    {subtitle && <div className="text-slate-500 text-sm font-medium">{subtitle}</div>}
  </div>
);

function gameDifficultyLabel(d) {
  if (d == null || d === '') return '—';
  const key = String(d).toLowerCase();
  const map = { easy: 'Kolay', medium: 'Orta', hard: 'Zor', standard: 'Standart' };
  return map[key] || d;
}


const NearbyMapView = ({ userLocation }) => {
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const [map, setMap] = useState(null);
  const [markerLayer, setMarkerLayer] = useState(null);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [showFinderMode, setShowFinderMode] = useState(false);

  useEffect(() => {
    if (!mapRef.current || map) return;

    const initialLat = userLocation?.lat || 41.0082;
    const initialLon = userLocation?.lon || 28.9784;

    const leafletMap = window.L.map(mapRef.current).setView([initialLat, initialLon], 14);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap katkıcıları'
    }).addTo(leafletMap);

    const lGroup = window.L.layerGroup().addTo(leafletMap);
    setMarkerLayer(lGroup);
    setMap(leafletMap);

    return () => {
      leafletMap.remove();
    };
  }, []);

  useEffect(() => {
    if (!map || !userLocation) return;

    map.setView([userLocation.lat, userLocation.lon], 14);

    if (userMarkerRef.current) {
      try {
        map.removeLayer(userMarkerRef.current);
      } catch {
      }
      userMarkerRef.current = null;
    }

    const m = window.L.circleMarker([userLocation.lat, userLocation.lon], {
      radius: 10,
      fillColor: '#3b82f6',
      color: '#fff',
      weight: 3,
      opacity: 1,
      fillOpacity: 0.8,
    })
      .addTo(map)
      .bindPopup('Sizin Konumunuz');
    userMarkerRef.current = m;

    fetchNearbyPlaces(userLocation.lat, userLocation.lon);
  }, [map, userLocation]);

  useEffect(() => {
    if (map && markerLayer) {
      renderMarkers();
    }
  }, [places, filterType]);

  const fetchNearbyPlaces = async (lat, lon) => {
    setLoading(true);
    try {
      const query = `[out:json];
        (
          nwr["amenity"="hospital"](around:5000,${lat},${lon});
          nwr["amenity"="pharmacy"](around:5000,${lat},${lon});
        );
        out center;`;
      const response = await axios.get(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      setPlaces(response.data.elements);
    } catch (err) {
      console.error("Overpass error:", err);
    } finally {
      setLoading(false);
    }
  };

  const renderMarkers = () => {
    markerLayer.clearLayers();

    const filtered = places.filter(p => {
      if (filterType === 'all') return true;
      return p.tags.amenity === filterType;
    });

    filtered.forEach(place => {
      const isHospital = place.tags.amenity === 'hospital';
      const color = isHospital ? '#1e293b' : '#10b981';
      const lat = place.lat || place.center?.lat;
      const lon = place.lon || place.center?.lon;

      if (!lat || !lon) return;

      const marker = window.L.marker([lat, lon], {
        icon: window.L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color:${color}; width:30px; height:30px; border-radius:50%; border:3px solid white; display:flex; align-items:center; justify-center; color:white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <span class="material-symbols-outlined" style="font-size:18px; margin: auto;">${isHospital ? 'local_hospital' : 'medical_services'}</span>
          </div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })
      }).addTo(markerLayer);

      marker.bindPopup(`
        <div style="font-family: 'Inter', sans-serif; padding: 5px;">
          <b style="color: #1e293b; font-size: 14px;">${place.tags.name || (isHospital ? 'Hastane' : 'Eczane')}</b><br/>
          <span style="color: #64748b; font-size: 11px;">${isHospital ? '🏥 Sağlık Merkezi' : '💊 Eczane'}</span>
          <div style="margin-top: 10px;">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}" target="_blank" style="background: #1e293b; color: white; padding: 6px 12px; border-radius: 8px; text-decoration: none; font-size: 10px; font-weight: bold; display: inline-block;">Yol Tarifi</a>
          </div>
        </div>
      `);
    });
  };

  const calculateDistance = (place, loc) => {
    if (!loc) return Infinity;
    const lat = place.lat || place.center?.lat;
    const lon = place.lon || place.center?.lon;
    if (!lat || !lon) return Infinity;
    return Math.sqrt(Math.pow(lat - loc.lat, 2) + Math.pow(lon - loc.lon, 2));
  };

  const findClosest = (type) => {
    if (!userLocation || places.length === 0) return;

    const filtered = places.filter(p => p.tags.amenity === type);
    if (filtered.length === 0) {
      alert(`Yakınlarda ${type === 'hospital' ? 'hastane' : 'eczane'} bulunamadı.`);
      return;
    }

    const closest = filtered.reduce((prev, curr) => {
      const getCoords = (p) => ({ lat: p.lat || p.center?.lat, lon: p.lon || p.center?.lon });
      const p1 = getCoords(prev);
      const p2 = getCoords(curr);

      const d1 = Math.sqrt(Math.pow(p1.lat - userLocation.lat, 2) + Math.pow(p1.lon - userLocation.lon, 2));
      const d2 = Math.sqrt(Math.pow(p2.lat - userLocation.lat, 2) + Math.pow(p2.lon - userLocation.lon, 2));

      return (d1 < d2) ? prev : curr;
    });

    const lat = closest.lat || closest.center?.lat;
    const lon = closest.lon || closest.center?.lon;

    if (lat && lon) {
      window.open(`https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lon}&destination=${lat},${lon}`, '_blank');
    }

    setShowFinderMode(false);
  };

  const sortedPlaces = [...places]
    .filter(p => {
      if (filterType === 'all') return true;
      return p.tags.amenity === filterType;
    })
    .sort((a, b) => calculateDistance(a, userLocation) - calculateDistance(b, userLocation));

  return (
    <div className="space-y-6">
      <div className="flex gap-2 p-1 bg-slate-100 w-fit rounded-2xl border border-slate-200 shadow-sm">
        <button onClick={() => setFilterType('all')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'all' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Hepsi</button>
        <button onClick={() => setFilterType('hospital')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'hospital' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Hastaneler</button>
        <button onClick={() => setFilterType('pharmacy')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterType === 'pharmacy' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Eczaneler</button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 h-[600px]">
        <div className="flex-1 bg-white rounded-3xl overflow-hidden shadow-xl border border-slate-100 relative">
          <div ref={mapRef} className="w-full h-full z-0" />
          {loading && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-10">
              <Loader2 className="animate-spin text-slate-900" size={32} />
            </div>
          )}
        </div>
        <div className="w-full lg:w-72 flex flex-col gap-3 overflow-y-auto pr-2">
          <div className="px-1 mb-1">
            {!showFinderMode ? (
              <button
                onClick={() => setShowFinderMode(true)}
                className="w-full py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-[0.15em] shadow-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <span className="material-symbols-outlined text-base">near_me</span>
                En Yakını Bul
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 animate-in slide-in-from-top-2">
                <button onClick={() => findClosest('hospital')} className="py-4 bg-slate-800 text-white rounded-2xl font-black uppercase text-[9px] tracking-widest flex flex-col items-center gap-1 hover:bg-slate-700 transition-all">
                  <span className="material-symbols-outlined text-xl">local_hospital</span>
                  Hastane
                </button>
                <button onClick={() => findClosest('pharmacy')} className="py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[9px] tracking-widest flex flex-col items-center gap-1 hover:bg-emerald-500 transition-all text-center">
                  <span className="material-symbols-outlined text-xl">medical_services</span>
                  Eczane
                </button>
                <button onClick={() => setShowFinderMode(false)} className="col-span-2 py-2 text-slate-400 font-bold text-[9px] uppercase tracking-widest hover:text-slate-600">Vazgeç</button>
              </div>
            )}
          </div>

          <h3 className="font-black text-slate-900 uppercase italic tracking-tighter text-xl px-2">Yakındaki Merkezler ({sortedPlaces.length})</h3>
          {sortedPlaces.length === 0 && !loading && (
            <div className="p-8 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
              <p className="text-slate-400 font-bold italic text-sm">Araman bir sonuç vermedi.</p>
            </div>
          )}
          {sortedPlaces.map((place, i) => {
            const isH = place.tags.amenity === 'hospital';
            const lat = place.lat || place.center?.lat;
            const lon = place.lon || place.center?.lon;
            const dist = calculateDistance(place, userLocation);
            const km = (dist * 111).toFixed(1);
            return (
              <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-50 hover:shadow-md transition-all group">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 ${isH ? 'bg-slate-800' : 'bg-emerald-500'}`}>
                    <span className="material-symbols-outlined text-xl">{isH ? 'local_hospital' : 'medical_services'}</span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-slate-900 text-sm truncate pr-2">{place.tags.name || (isH ? 'Hastane' : 'Eczane')}</h4>
                      <span className="text-[9px] font-black text-slate-400 shrink-0 uppercase">{km} km</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{isH ? 'Sağlık Kurumu' : 'Eczane'}</p>
                    <div className="flex gap-2 mt-3">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&origin=${userLocation?.lat},${userLocation?.lon}&destination=${lat},${lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-slate-900 text-white rounded-lg py-2.5 text-[10px] font-black uppercase tracking-widest text-center shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-sm">navigation</span>
                        Git
                      </a>
                      <button
                        onClick={() => {
                          map.setView([lat, lon], 17);
                          if (place._marker) place._marker.openPopup();
                        }}
                        className="px-4 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-all active:scale-95 flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-base">visibility</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};



function App() {
  const [nearbySubTab, setNearbySubTab] = useState('yakin');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [supportPanelOpen, setSupportPanelOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [user, setUser] = useState(JSON.parse(localStorage.getItem('codex_user')));
  const [token, setToken] = useState(localStorage.getItem('codex_token'));
  const [authView, setAuthView] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });

  const [lastReport, setLastReport] = useState(null);

  const [profileForm, setProfileForm] = useState({
    height: user?.height || '',
    weight: user?.weight || '',
    age: user?.age || '',
    gender: user?.gender || 'erkek'
  });

  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [reportResult, setReportResult] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameHistory, setGameHistory] = useState([]);

  const [screeningConditions, setScreeningConditions] = useState([]);
  const [screeningPack, setScreeningPack] = useState(null);
  const [screeningAnswers, setScreeningAnswers] = useState({});
  const [screeningStep, setScreeningStep] = useState(0);
  const [screeningResult, setScreeningResult] = useState(null);

  useEffect(() => {
    if (token) {
      fetchLastReport();
    }
  }, [token, activeTab]);

  useEffect(() => {
    if (!token || activeTab !== 'screening') return;
    axios
      .get(`${API_URL}/screening/conditions`)
      .then((r) => setScreeningConditions(r.data || []))
      .catch(() => setScreeningConditions([]));
  }, [token, activeTab]);

  useEffect(() => {
    if (token) {
      void detectLocation();
    }
  }, [token]);

  const fetchLastReport = async () => {
    try {
      const res = await axios.get(`${API_URL}/user/last-report`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) setLastReport(JSON.parse(res.data.response));
    } catch (err) { console.error('Report fetch error:', err); }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = authView === 'login' ? 'auth/login' : 'auth/register';
      const response = await axios.post(`${API_URL}/${endpoint}`, authForm);
      if (authView === 'login') {
        const { token, user } = response.data;
        localStorage.setItem('codex_token', token);
        localStorage.setItem('codex_user', JSON.stringify(user));
        setToken(token);
        setUser(user);
        setProfileForm({ height: user.height || '', weight: user.weight || '', age: user.age || '', gender: user.gender || 'erkek' });
      } else {
        setAuthView('login');
      }
    } catch (err) { alert('Hata oluştu'); } finally { setLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem('codex_token');
    localStorage.removeItem('codex_user');
    setToken(null);
    setUser(null);
    setIsProfileMenuOpen(false);
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/user/profile`, profileForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const updatedUser = { ...user, ...profileForm, bmi_interpretation: res.data.interpretation };
      localStorage.setItem('codex_user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      alert('Profil ve CodeX analizi başarıyla güncellendi!');
    } catch (err) { 
      console.error(err);
      alert('Profil güncellenirken bir hata oluştu.'); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query) return;
    performSearch({ drugName: query, userId: user?.id }, 'drug/search');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    formData.append('userId', user?.id);
    performSearch(formData, 'drug/analyze-image');
  };

  const performSearch = async (data, endpoint) => {
    setLoading(true);
    setResult(null);
    try {
      const isFormData = data instanceof FormData;
      const response = await axios.post(`${API_URL}/${endpoint}`, data, {
        headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {}
      });
      setResult(response.data);
    } catch (err) { alert('Hata oluştu'); } finally { setLoading(false); }
  };

  const handleReportUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setReportResult(null);
    const formData = new FormData();
    formData.append('report', file);
    formData.append('userId', user?.id);
    try {
      const res = await axios.post(`${API_URL}/analyze-report`, formData);
      setReportResult(normalizeLabReportResponse(res.data));
      fetchLastReport();
    } catch (err) { alert('Rapor hatası'); } finally { setLoading(false); }
  };

  const detectLocation = async () => {
    const host = window.location.hostname;
    const onLocalhost = host === 'localhost' || host === '127.0.0.1';
    const canUseGps = navigator.geolocation && (window.isSecureContext || onLocalhost);

    if (canUseGps) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 60000,
          });
        });
        setUserLocation({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          source: 'gps',
        });
        return;
      } catch {
      }
    }

    try {
      const { data } = await axios.get(`${API_URL}/geo/ip-hint`, { timeout: 12000 });
      if (data?.lat != null && data?.lon != null) {
        setUserLocation({
          lat: Number(data.lat),
          lon: Number(data.lon),
          source: data.source || 'ip',
        });
        return;
      }
    } catch {
    }

    const pub = await fetchGeoFromPublicHttps();
    if (pub) {
      setUserLocation(pub);
      return;
    }

    alert(
      'Konum alınamadı (ağ engeli veya üçüncü taraf IP servisleri yanıt vermedi). İsterseniz HTTPS ile yayınlayın; GPS o zaman kullanılabilir.'
    );
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
        <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl p-10 border border-slate-100 flex flex-col gap-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white text-3xl font-black shadow-lg">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>clinical_notes</span>
            </div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tighter uppercase mb-1">CodeX <span className="text-slate-500 font-black">SAĞLIK</span></h2>
            <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-slate-400 italic">{authView === 'login' ? 'Klinik giriş' : 'Üye kaydı'}</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authView === 'register' && (
              <div className="bg-slate-50 p-4 rounded-xl flex items-center gap-3 border border-slate-100">
                <span className="material-symbols-outlined text-slate-400 text-xl">person</span>
                <input type="text" placeholder="Ad Soyad" className="bg-transparent w-full outline-none font-semibold text-sm" required onChange={e => setAuthForm({ ...authForm, name: e.target.value })} />
              </div>
            )}
            <div className="bg-slate-50 p-4 rounded-xl flex items-center gap-3 border border-slate-100">
              <span className="material-symbols-outlined text-slate-400 text-xl">alternate_email</span>
              <input type="email" placeholder="E-posta" className="bg-transparent w-full outline-none font-semibold text-sm" required onChange={e => setAuthForm({ ...authForm, email: e.target.value })} />
            </div>
            <div className="bg-slate-50 p-4 rounded-xl flex items-center gap-3 border border-slate-100">
              <span className="material-symbols-outlined text-slate-400 text-xl">lock</span>
              <input type="password" placeholder="Şifre" className="bg-transparent w-full outline-none font-semibold text-sm" required onChange={e => setAuthForm({ ...authForm, password: e.target.value })} />
            </div>
            <button disabled={loading} className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl shadow-lg hover:bg-slate-800 transition-all uppercase tracking-widest text-xs mt-4">
              {loading ? <Loader2 className="animate-spin mx-auto" /> : (authView === 'login' ? 'Giriş Yap' : 'Kayıt Ol')}
            </button>
          </form>

          <div className="text-center pt-4 border-t border-slate-50">
            <button className="text-slate-400 font-bold text-xs uppercase tracking-widest" onClick={() => setAuthView(authView === 'login' ? 'register' : 'login')}>
              {authView === 'login' ? 'Hesap Oluştur' : 'Giriş Yap'}
            </button>
          </div>
        </div>
        <p className="mt-8 text-[10px] text-slate-300 font-bold italic uppercase tracking-widest">© 2026 CodeX - GDG Hackathon</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-body overflow-hidden flex">

      <aside className={`bg-white/90 backdrop-blur-xl rounded-r-[32px] h-screen w-64 fixed left-0 top-0 flex flex-col p-6 space-y-8 shadow-[40px_0_40px_-20px_rgba(0,0,0,0.03)] z-50 transition-all duration-500 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="border-b border-slate-100/50 pb-8 mb-4">
          <div className="w-full h-32 overflow-hidden flex items-center justify-center">
            <img src="/logo.jpeg" alt="CodeX logosu" className="w-full h-full object-contain transition-all hover:scale-105 duration-700 drop-shadow-2xl" />
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarItem id="dashboard" label="Panel" icon="dashboard" active={activeTab === 'dashboard'} onClick={setActiveTab} />
          <SidebarItem id="drugs" label="İlaç arama" icon="search_check" active={activeTab === 'drugs'} onClick={setActiveTab} />
          <SidebarItem id="reports" label="Tahlil raporları" icon="biotech" active={activeTab === 'reports'} onClick={setActiveTab} />
          <SidebarItem id="screening" label="Şüphe taraması" icon="stethoscope" active={activeTab === 'screening'} onClick={setActiveTab} />
          <SidebarItem id="calendar" label="Takvim" icon="calendar_month" active={activeTab === 'calendar'} onClick={setActiveTab} />
          <SidebarItem id="nearby" label="Yakındaki sağlık" icon="explore_nearby" active={activeTab === 'nearby'} onClick={setActiveTab} />
          <SidebarItem id="games" label="Oyunlar" icon="sports_esports" active={activeTab === 'games'} onClick={setActiveTab} />
        </nav>

        <div className="pt-6 border-t border-slate-100 space-y-2">
          <button onClick={() => setActiveTab('profile')} className={`flex items-center gap-3 px-3 py-2.5 w-full rounded-xl font-manrope tracking-tight text-xs font-semibold transition-all duration-300 ease-in-out ${activeTab === 'profile' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
            <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'profile' ? "'FILL' 1" : "'FILL' 0" }}>person</span>
            Profil
          </button>
          <button className="flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-slate-900 transition-all font-manrope tracking-tight text-xs font-semibold">
            <span className="material-symbols-outlined text-lg">settings</span>
            Ayarlar
          </button>
          <div className="mt-4 p-4 rounded-lg bg-slate-100 text-center space-y-3">
            <button
              type="button"
              onClick={() => setSupportPanelOpen((o) => !o)}
              className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-tighter shadow-md hover:scale-[0.98] transition-transform"
            >
              Destek
            </button>
            {supportPanelOpen && (
              <div className="text-left rounded-xl bg-white border border-slate-200 p-3 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Destek e-postası</p>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-xs font-bold text-emerald-700 break-all hover:underline block"
                >
                  {SUPPORT_EMAIL}
                </a>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-500 ${isSidebarOpen ? 'ml-64' : 'ml-0'}`}>

        <header className="w-full h-20 sticky top-0 z-40 flex justify-between items-center px-8 bg-white/50 backdrop-blur-md">
          <div className="flex-1 max-w-xl">
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors">search</span>
              <input
                className="w-full pl-12 pr-4 py-2.5 bg-slate-100 border-none rounded-full focus:ring-2 focus:ring-slate-200 transition-all font-manrope text-sm"
                placeholder="Tıbbi veritabanında ara…"
                type="text"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button type="button" className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <div className="flex items-center gap-3 pl-6 border-l border-slate-100 relative">
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="flex items-center gap-3 text-right group"
              >
                <div className="hidden sm:block">
                  <p className="text-sm font-bold font-headline leading-tight">{user.name}</p>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest leading-none">Klinik üye</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-black text-lg ring-2 ring-slate-100 group-hover:scale-105 transition-transform uppercase">
                  {user.name.charAt(0)}
                </div>
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 mt-20 top-0 w-64 bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 z-[100] animate-in fade-in slide-in-from-top-4">
                  <button onClick={() => { setActiveTab('profile'); setIsProfileMenuOpen(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-all text-sm font-bold text-slate-900">
                    <span className="material-symbols-outlined text-slate-400">person</span> Profilimi Gör
                  </button>
                  <button onClick={handleLogout} className="mt-4 w-full flex items-center gap-3 p-3 hover:bg-rose-50 rounded-xl transition-all text-sm font-bold text-rose-500 border-t border-slate-50 pt-4">
                    <span className="material-symbols-outlined text-rose-400">logout</span> Oturumu Kapat
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="px-6 md:px-12 lg:px-20 py-12 flex-grow overflow-y-auto w-full">
          <div className="w-full">

            {activeTab === 'dashboard' && (
              <div className="space-y-12 animate-in fade-in duration-700">
                <SectionHeader title={<>Hoş geldin, <span className="text-slate-500 italic">{user.name}</span></>} subtitle={
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-slate-900"></span>
                    <span className="font-bold uppercase text-[12px] tracking-widest text-slate-400">Sağlık durumu stabil • CodeX izleme aktif</span>
                  </div>
                } />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-4 bg-white rounded-3xl p-8 shadow-xl border border-slate-100 flex flex-col gap-8 relative overflow-hidden group">
                    <span className="material-symbols-outlined text-slate-50 absolute -top-10 -right-10 text-[200px] group-hover:rotate-12 transition-transform duration-1000">biotech</span>
                    <div className="relative z-10 space-y-1">
                      <h3 className="text-xl font-bold font-headline tracking-tight uppercase">Tahlil Analiz Özeti</h3>
                      <p className="text-xs text-slate-400 font-black uppercase tracking-widest italic">Son İşlem Kaydı</p>
                    </div>

                    <div className="relative z-10 space-y-4 flex-1">
                      {lastReport ? (
                        <>
                          <div className="flex justify-between items-center p-6 rounded-3xl bg-slate-50 transition-all hover:bg-white border border-transparent hover:border-slate-100 hover:shadow-xl">
                            <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Durum</p>
                              <p className="text-xl font-black font-headline truncate max-w-[200px] text-slate-900">{lastReport.summary}</p>
                            </div>
                            <span className="material-symbols-outlined text-slate-900 text-4xl">check_circle</span>
                          </div>
                          <div className="p-8 bg-slate-900 rounded-3xl italic text-sm text-slate-400 leading-relaxed border-l-8 border-slate-700 shadow-lg">
                            <div className="flex items-center gap-2 mb-3 not-italic">
                              <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">CodeX analitik özet</span>
                            </div>
                            "{lastReport.medication_suggestions || lastReport.summary}"
                          </div>
                        </>
                      ) : user.bmi_interpretation ? (
                        <>
                          <div className="flex justify-between items-center p-6 rounded-3xl bg-emerald-50 transition-all hover:bg-white border border-transparent hover:border-emerald-100 hover:shadow-xl group">
                            <div>
                              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1 italic">Profil Analizi</p>
                              <p className="text-xl font-black font-headline text-emerald-900">Aktif & Güncel</p>
                            </div>
                            <span className="material-symbols-outlined text-emerald-600 text-4xl group-hover:scale-110 transition-transform">verified</span>
                          </div>
                          <div className="p-8 bg-slate-900 rounded-3xl italic text-sm text-slate-100/90 leading-relaxed border-l-8 border-emerald-500 shadow-lg">
                            <div className="flex items-center gap-2 mb-3 not-italic">
                              <span className="material-symbols-outlined text-emerald-400 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>health_metrics</span>
                              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/50">CodeX genel sağlık analizi</span>
                            </div>
                            "{user.bmi_interpretation}"
                          </div>
                        </>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300 py-24 font-black italic uppercase tracking-[0.3em] text-center">
                          <span className="material-symbols-outlined text-6xl mb-4 text-slate-200">manage_accounts</span>
                          Profilinizi Tamamlayın
                          <p className="text-[8px] mt-2 normal-case font-bold tracking-widest text-slate-400">Genel sağlık analiziniz için verilerinizi doldurun.</p>
                        </div>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-300 font-bold italic uppercase tracking-widest border-t border-slate-50 pt-6">
                      CodeX güvenli kalkan • Klinik veri koruması
                    </p>
                  </div>

                  <div className="lg:col-span-8 flex flex-col gap-10">
                    <div className="bg-white rounded-3xl p-10 shadow-xl border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-10">
                      <div className="flex items-center gap-8">
                        <div className="relative group">
                          <div className="w-24 h-24 rounded-full bg-slate-900 border-4 border-white shadow-2xl flex items-center justify-center text-white font-black text-4xl uppercase overflow-hidden group-hover:scale-105 transition-transform">
                            {user.name.charAt(0)}
                          </div>
                          <div className="absolute -bottom-1 -right-1 bg-white w-8 h-8 rounded-full border-2 border-slate-900 flex items-center justify-center shadow-lg">
                            <span className="material-symbols-outlined text-[14px] text-slate-900" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-3xl font-black font-headline tracking-tighter italic uppercase text-slate-900">{user.name}</h4>
                          <p className="text-slate-400 font-black uppercase text-[10px] tracking-[0.2em] italic">Standart üye profili</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-8 md:gap-14 border-t md:border-t-0 md:border-l border-slate-100 pt-8 md:pt-0 md:pl-14 w-full md:w-auto">
                        <div className="text-center">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Boy</p>
                          <p className="text-2xl font-black font-headline tracking-tighter text-slate-900">{user.height || "-"}<span className="text-xs font-normal ml-1">cm</span></p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Kilo</p>
                          <p className="text-2xl font-black font-headline tracking-tighter text-slate-900">{user.weight || "-"}<span className="text-xs font-normal ml-1">kg</span></p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Yaş</p>
                          <p className="text-2xl font-black font-headline tracking-tighter text-slate-900">{user.age || "-"}<span className="text-xs font-normal ml-1">yıl</span></p>
                        </div>
                      </div>
                    </div>

                    <div className="p-10 bg-white rounded-[40px] border border-slate-100 shadow-xl relative overflow-hidden group min-h-[220px] flex flex-col justify-center">
                      <span className="material-symbols-outlined absolute -top-10 -right-10 text-[200px] text-slate-50 transition-transform group-hover:rotate-12 duration-1000">psychology</span>
                      <div className="relative z-10">
                        <h5 className="font-black text-xl mb-4 italic tracking-tighter uppercase text-slate-900 border-l-8 border-slate-900 pl-4">CodeX Vücut İndeks Analizi</h5>
                        <p className="text-slate-500 text-lg leading-relaxed italic font-medium">
                          {user.bmi_interpretation || "Profil verilerinizi girdiğinizde burada derinlemesine bir sağlık analizi oluşacak."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'drugs' && (
              <div className="space-y-12 animate-in slide-in-from-bottom-8 duration-700">
                <SectionHeader title="Klinik ilaç arama" subtitle="İlaç adı veya görüntü ile yüksek doğrulukta farmakoloji bilgisine erişin." />

                <section className="relative max-w-5xl">
                  <div className="flex items-center bg-white shadow-2xl rounded-[32px] p-4 gap-4 border border-slate-100">
                    <div className="flex-grow relative flex items-center">
                      <span className="material-symbols-outlined absolute left-6 text-slate-500 text-3xl">search</span>
                      <input
                        className="w-full pl-20 pr-6 py-6 text-2xl font-headline font-semibold text-slate-900 border-none focus:ring-0 placeholder:text-slate-200"
                        placeholder="İlaç adı veya etken madde girin..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                      />
                    </div>
                    <div className="h-12 w-px bg-slate-100 mx-2"></div>
                    <label className="p-6 flex items-center justify-center text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all group cursor-pointer border border-slate-50">
                      <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">camera_enhance</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                    </label>
                    <button onClick={handleSearch} disabled={loading} className="px-12 py-6 bg-slate-900 text-white font-headline font-black text-xl rounded-2xl shadow-xl hover:bg-slate-800 transition-all active:scale-95">
                      {loading ? <Loader2 className="animate-spin" /> : 'Sorgula'}
                    </button>
                  </div>
                </section>

                {result && (
                  <section className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-6">
                      <h3 className="text-2xl font-black font-headline text-slate-900 uppercase italic tracking-tighter">Analiz Sonuçları</h3>
                      <div className="flex gap-3">
                        <span className="px-6 py-2.5 bg-slate-50 text-slate-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200">Onaylı tıbbi veri</span>
                        <span className="px-6 py-2.5 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-800 uppercase italic">{result.source}</span>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-100 p-12 rounded-[48px] shadow-2xl flex flex-col lg:flex-row gap-14 hover:shadow-slate-100/50 transition-all duration-700 relative overflow-hidden group">
                      <div className="flex-grow space-y-12 relative z-10">
                        <div className="flex flex-wrap justify-between items-start gap-6 border-b border-slate-50 pb-8">
                          <div className="space-y-2">
                            <h4 className="text-6xl font-black font-headline text-slate-900 tracking-tighter italic uppercase leading-none">{result.name}</h4>
                            <p className="text-xl text-slate-400 font-bold italic tracking-wide">{result.active_ingredient}</p>
                          </div>
                          <div className="px-8 py-4 bg-slate-900 text-white rounded-[20px] flex items-center gap-4 shadow-xl transition-all group-hover:rotate-1">
                            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>science</span>
                            <span className="text-xs font-black uppercase tracking-[0.2em] italic">CodeX onaylı</span>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-12">
                          <div className="space-y-8">
                            <div>
                              <label className="text-[11px] font-black uppercase text-slate-300 tracking-[0.3em] mb-3 block italic">Tıbbi Açıklama</label>
                              <p className="text-slate-600 font-bold leading-relaxed text-xl">{result.description}</p>
                            </div>
                            <div className="p-8 bg-slate-50 border border-slate-100 rounded-[32px] group hover:bg-white transition-all shadow-sm">
                              <label className="text-[11px] font-black uppercase text-slate-900 tracking-[0.3em] mb-3 block italic">Kullanım & Dozaj</label>
                              <p className="text-slate-500 font-medium italic leading-relaxed text-lg">{result.usage_info}</p>
                            </div>
                          </div>
                          <div className="space-y-8">
                            <div className="bg-slate-900 p-10 rounded-[32px] space-y-4 shadow-2xl border-l-[12px] border-slate-700">
                              <div className="flex items-center gap-4 text-white">
                                <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                                <span className="font-black font-headline uppercase tracking-[0.2em] text-xs">Kritik Güvenlik Uyarısı</span>
                              </div>
                              <p className="text-sm text-slate-300 font-bold italic leading-relaxed leading-7">
                                {result.warnings || "İlacı doktor kontrolünde kullanınız."}
                              </p>
                            </div>
                            <div className="p-8 bg-white border border-slate-100 rounded-[32px] text-slate-400 shadow-sm">
                              <label className="text-[11px] font-black uppercase text-slate-300 tracking-[0.3em] mb-3 block italic">Olası Yan Etkiler</label>
                              <p className="text-sm font-medium italic leading-relaxed leading-7">{result.side_effects || "Belirtilmemiş."}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="space-y-12 animate-in fade-in duration-700">
                <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                  <SectionHeader title="Tahlil raporu analizi" subtitle="CodeX ile klinik değerleri hassas şekilde yorumlama." />
                  <div className="flex gap-4 mb-8">
                    <button className="px-10 py-5 bg-white shadow-xl border border-slate-50 text-slate-900 rounded-[20px] font-black text-[12px] uppercase tracking-widest flex items-center gap-4 hover:bg-slate-50 transition-all group">
                      <span className="material-symbols-outlined text-lg opacity-40 group-hover:opacity-100 transition-opacity">history</span>
                      Analiz Geçmişi
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
                  {!reportResult && (
                    <div className="lg:col-span-12 space-y-6">
                      <label className="bg-white/80 backdrop-blur-xl flex flex-row items-center justify-between rounded-3xl p-6 shadow-xl border border-slate-100 hover:border-slate-300 transition-all cursor-pointer group gap-8">
                        <div className="flex items-center gap-6">
                          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl group-hover:scale-105 transition-transform">
                            <span className="material-symbols-outlined text-3xl">cloud_upload</span>
                          </div>
                          <div>
                            <h3 className="text-xl font-black font-headline text-slate-900 uppercase italic tracking-tight">Yeni Analiz Başlat</h3>
                            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest italic">PDF • Görsel • DICOM</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 border-l border-slate-100 pl-8">
                           <div className="hidden md:block text-right">
                              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest leading-none mb-1">CodeX güvenli protokol</p>
                              <p className="text-[9px] text-slate-400 font-bold italic">Uçtan uca şifreli veri işleme</p>
                           </div>
                           <div className="px-8 py-3.5 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg group-hover:bg-slate-800 transition-colors">Dosya Seç</div>
                        </div>
                        <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleReportUpload} />
                      </label>
                    </div>
                  )}

                  {loading && (
                    <div className="lg:col-span-12 py-40 flex flex-col items-center">
                      <div className="relative mb-8">
                        <Loader2 className="animate-spin text-slate-900" size={100} />
                        <span className="material-symbols-outlined absolute inset-0 m-auto w-10 h-10 flex items-center justify-center text-slate-900 text-3xl font-black">biotech</span>
                      </div>
                      <p className="text-slate-400 font-black italic uppercase tracking-[0.5em] animate-pulse">Analitik Veriler Hazırlanıyor...</p>
                    </div>
                  )}

                  {reportResult && (
                    <div className="lg:col-span-12 space-y-12 animate-in fade-in slide-in-from-bottom-10">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-8">
                        <h3 className="text-4xl font-black font-headline text-slate-900 uppercase italic tracking-tighter">İşlenmiş Veriler</h3>
                        <span className="text-[11px] font-black px-6 py-3 bg-slate-900 text-white rounded-full uppercase tracking-widest">Tıbbi kayıt: CX-{Math.floor(Math.random() * 9000) + 1000}</span>
                      </div>

                      <div className="space-y-8">
                        <div className="px-8 mb-2 text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 flex items-center gap-4">
                           <span className="w-12 h-[1px] bg-slate-200"></span>
                           Laboratuvar Parametreleri & Klinik Analiz
                        </div>

                        <div className="space-y-6">
                            {reportResult.critical_values?.map((val, idx) => {
                              const st = val.status ?? '';
                              const stLower = typeof st === 'string' ? st.toLowerCase() : '';
                              const isLow = stLower.includes('düşük') || stLower.includes('low');
                              const isHigh = reportValueIsHigh(st);
                              const isNormal = reportValueIsNormal(st);
                              const meterCaption = isLow
                                ? `Düşük / eksik: ${val.name}`
                                : isHigh
                                  ? `Yüksek: ${val.name}`
                                  : isNormal
                                    ? `Normal aralık: ${val.name}`
                                    : (st ? `${val.name} — ${st}` : val.name);

                              return (
                              <div key={idx} className="bg-white group hover:bg-slate-50 transition-all duration-500 rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 relative overflow-hidden">
                                <div className={`absolute top-0 left-0 h-full w-2.5 ${
                                  isNormal ? 'bg-emerald-500' : isHigh ? 'bg-rose-500' : 'bg-amber-500'
                                }`}></div>
                                
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-10">
                                  <div className="flex items-center gap-6 flex-1">
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-xl ${
                                      isNormal ? 'bg-emerald-500' : isHigh ? 'bg-rose-500' : 'bg-amber-500'
                                    }`}>
                                      <span className="material-symbols-outlined text-3xl">biotech</span>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400 mb-1">Parametre</p>
                                      <h4 className="font-black text-slate-900 text-2xl uppercase tracking-tighter italic leading-none mb-2">{val.name}</h4>
                                      <div className="flex items-center gap-3">
                                        <span className={`px-4 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest shadow-sm border-2 ${
                                          isNormal ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                          isHigh ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                                        }`}>
                                          {st || 'Durum belirtilmedi'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex flex-col items-center md:items-end bg-slate-50 p-6 rounded-3xl border border-slate-100 min-w-[200px] max-w-full">
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-5xl font-black font-headline tracking-tighter text-slate-950">{val.value ?? '—'}</span>
                                      <span className="text-sm text-slate-900 font-black uppercase italic tracking-widest">{val.unit}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 italic">Laboratuvar Sonucu</p>
                                    <div className="mt-5 pt-5 border-t border-slate-200/80 w-full text-center md:text-right space-y-1">
                                      <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">Olması gereken aralık</p>
                                      <p className={`text-sm font-black leading-snug ${val.reference_range ? 'text-slate-800' : 'text-slate-400 italic font-bold'}`}>
                                        {val.reference_range || 'Raporda veya analizde belirtilmedi'}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-10 p-8 bg-slate-900 rounded-[2rem] text-white shadow-2xl relative overflow-hidden group/box">
                                   <div className="relative z-10 space-y-4">
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-emerald-400">
                                         <div className="flex items-center gap-3">
                                           <span className="material-symbols-outlined text-xl">troubleshoot</span>
                                           <h5 className="text-[11px] font-black uppercase tracking-[0.4em] italic">Klinik Analiz & Eksiklik Tespiti</h5>
                                         </div>
                                         <span className="text-[10px] font-black uppercase tracking-widest text-white/80 sm:text-right max-sm:pl-8">{val.name}</span>
                                      </div>
                                      <p className="text-lg text-slate-100 font-bold italic leading-relaxed pl-4 border-l-4 border-emerald-500">
                                         {val.meaning}
                                      </p>
                                   </div>
                                   <span className="material-symbols-outlined absolute -right-8 -bottom-8 text-[120px] text-white/5 group-hover/box:rotate-12 transition-transform duration-700">clinical_notes</span>
                                </div>

                                <div className="mt-10 space-y-4">
                                  <div className="flex justify-between gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-900 px-1 italic">
                                    <span className="min-w-0 shrink text-left leading-tight">{meterCaption}</span>
                                    <span className="text-emerald-700 hidden sm:inline">İdeal</span>
                                    <span className="text-rose-700 hidden sm:inline">Kritik</span>
                                  </div>
                                  <div className="h-2.5 w-full bg-slate-100 rounded-full relative overflow-hidden border border-slate-200">
                                     <div className="absolute inset-0 flex opacity-40">
                                        <div className="h-full w-1/4 bg-slate-300"></div>
                                        <div className="h-full w-1/2 bg-emerald-100"></div>
                                        <div className="h-full w-1/4 bg-rose-100"></div>
                                     </div>
                                     <div 
                                        className={`absolute top-0 h-full transition-all duration-1000 ease-out border-r-4 border-white shadow-2xl ${
                                          isNormal ? 'bg-emerald-500' : isHigh ? 'bg-rose-500' : 'bg-amber-500'
                                        }`} 
                                        style={{ width: isNormal ? '50%' : (isHigh ? '85%' : '15%') }}
                                     ></div>
                                  </div>
                                </div>
                              </div>
                              );
                            })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                         <div className="lg:col-span-12 bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden group">
                             <span className="material-symbols-outlined absolute -top-12 -right-12 text-[300px] text-white/5 transition-transform group-hover:rotate-12 duration-1000" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
                             <div className="relative z-10 flex flex-col md:flex-row items-start gap-12">
                                <div className="flex-1 space-y-8">
                                   <div className="flex items-center gap-5">
                                      <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10 backdrop-blur-xl shadow-xl">
                                         <span className="material-symbols-outlined text-4xl">clinical_notes</span>
                                      </div>
                                      <h4 className="font-black text-3xl italic tracking-tight uppercase leading-none">CodeX Klinik Rapor Özeti</h4>
                                   </div>
                                   <p className="text-xl text-slate-100 italic leading-relaxed font-medium border-l-8 border-emerald-500 pl-10">
                                      {reportResult.summary}
                                   </p>
                                </div>
                                {reportResult.medication_suggestions && (
                                   <div className="w-full md:w-96 bg-emerald-500/10 rounded-[2.5rem] p-10 border border-emerald-500/20 shadow-inner">
                                      <p className="text-[11px] font-black uppercase tracking-[0.4em] text-emerald-400 mb-5 italic flex items-center gap-3">
                                         <span className="material-symbols-outlined text-base">auto_awesome</span>
                                         CodeX Protokol Notu
                                      </p>
                                      <p className="text-lg text-slate-100 italic leading-relaxed font-black">"{reportResult.medication_suggestions}"</p>
                                   </div>
                                )}
                             </div>
                         </div>

                         <div className="lg:col-span-4 bg-white rounded-[2.5rem] p-10 shadow-xl border border-blue-50">
                            <h5 className="text-[14px] font-black uppercase tracking-[0.4em] text-blue-600 mb-8 italic flex items-center gap-4">
                               <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg"><span className="material-symbols-outlined">local_drink</span></div>
                               Kritik İçecekler
                            </h5>
                            <div className="space-y-4">
                               {reportResult.recommendations?.drinks?.map((d, i) => (
                                  <div key={i} className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 flex items-start gap-4">
                                     <span className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-2 flex-shrink-0 animate-pulse"></span>
                                     <span className="text-sm font-black italic text-blue-900 leading-relaxed">{d}</span>
                                  </div>
                               ))}
                            </div>
                         </div>

                         <div className="lg:col-span-4 bg-white rounded-[2.5rem] p-10 shadow-xl border border-emerald-50">
                            <h5 className="text-[14px] font-black uppercase tracking-[0.4em] text-emerald-700 mb-8 italic flex items-center gap-4">
                               <div className="w-12 h-12 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg"><span className="material-symbols-outlined">restaurant</span></div>
                               Gerekli Yiyecekler
                            </h5>
                            <div className="space-y-4">
                               {reportResult.recommendations?.foods?.map((f, i) => (
                                  <div key={i} className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 flex items-start gap-4">
                                     <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-2 flex-shrink-0 animate-pulse"></span>
                                     <span className="text-sm font-black italic text-emerald-900 leading-relaxed">{f}</span>
                                  </div>
                               ))}
                            </div>
                         </div>

                         <div className="lg:col-span-4 bg-white rounded-[2.5rem] p-10 shadow-xl border border-rose-50">
                            <h5 className="text-[14px] font-black uppercase tracking-[0.4em] text-rose-600 mb-8 italic flex items-center gap-4">
                               <div className="w-12 h-12 bg-rose-600 text-white rounded-xl flex items-center justify-center shadow-lg"><span className="material-symbols-outlined">pill</span></div>
                               Klinik & İlaçlar
                            </h5>
                            <div className="space-y-4">
                               {reportResult.recommendations?.medications?.map((m, i) => (
                                  <div key={i} className="bg-rose-50/50 p-5 rounded-2xl border border-rose-100 flex items-start gap-4">
                                     <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-2 flex-shrink-0 animate-pulse"></span>
                                     <span className="text-sm font-black italic text-rose-900 leading-relaxed">{m}</span>
                                  </div>
                               ))}
                            </div>
                         </div>
                      </div>

                      <button onClick={() => setReportResult(null)} className="w-full py-12 text-slate-300 font-black uppercase italic tracking-[0.6em] hover:text-slate-900 transition-all border-b border-slate-100 hover:bg-slate-50 rounded-3xl mt-12">Raporu Kapat & Yeni Analiz Başlat</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'nearby' && (
              <div className="space-y-8 animate-in fade-in duration-700">
                <SectionHeader
                  title="Yakındaki sağlık"
                  subtitle={
                    nearbySubTab === 'yakin'
                      ? 'Konum ve OpenStreetMap verisiyle hastane ve eczaneleri bulun.'
                      : 'Güncel nöbetçi listesi eczaneler.gen.tr üzerinden; aşağıda gömülü görünüm veya sitede açın.'
                  }
                />
                <div className="flex flex-wrap gap-2 p-1 bg-slate-100 w-fit rounded-2xl border border-slate-200 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setNearbySubTab('yakin')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      nearbySubTab === 'yakin'
                        ? 'bg-slate-900 text-white shadow-lg'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Yakındaki merkezler
                  </button>
                  <button
                    type="button"
                    onClick={() => setNearbySubTab('nobetci')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      nearbySubTab === 'nobetci'
                        ? 'bg-emerald-700 text-white shadow-lg'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    Nöbetçi eczane
                  </button>
                </div>
                {nearbySubTab === 'yakin' && <NearbyMapView userLocation={userLocation} />}
                {nearbySubTab === 'nobetci' && <NobetciGenTrEmbed />}
              </div>
            )}

            {activeTab === 'screening' && (
              <div className="space-y-10 animate-in fade-in duration-700 max-w-4xl">
                <SectionHeader
                  title="Hastalık şüphe taraması"
                  subtitle="Önceden tanımlı senaryolarda çoktan seçmeli sorular; sonuçlar CodeX ile yorumlanır. Teşhis değildir — mutlaka hekime danışın."
                />

                {!screeningPack && !screeningResult && (
                  <div className="grid gap-4">
                    {screeningConditions.length === 0 && !loading && (
                      <p className="text-sm text-slate-500 font-medium">
                        Liste yüklenemedi veya veritabanında tarama kaydı yok. Sunucuda{' '}
                        <code className="text-xs bg-slate-100 px-1 rounded">database/symptom_screening.sql</code> dosyasını içe aktarın.
                      </p>
                    )}
                    <div className="grid sm:grid-cols-2 gap-4">
                      {screeningConditions.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={async () => {
                            setLoading(true);
                            setScreeningResult(null);
                            try {
                              const { data } = await axios.get(`${API_URL}/screening/conditions/${c.slug}/questions`);
                              setScreeningPack(data);
                              setScreeningAnswers({});
                              setScreeningStep(0);
                            } catch {
                              alert('Sorular yüklenemedi');
                            } finally {
                              setLoading(false);
                            }
                          }}
                          className="text-left p-6 rounded-3xl border border-slate-100 bg-white shadow-sm hover:shadow-xl hover:border-slate-200 transition-all"
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                              <Stethoscope className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="font-black text-slate-900 uppercase italic tracking-tight text-lg">{c.title}</h3>
                              {c.description && <p className="text-xs text-slate-500 mt-2 leading-relaxed font-medium">{c.description}</p>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {screeningPack && !screeningResult && (
                  <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl p-8 md:p-10 space-y-8">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <button
                        type="button"
                        className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-900"
                        onClick={() => {
                          setScreeningPack(null);
                          setScreeningAnswers({});
                          setScreeningStep(0);
                        }}
                      >
                        ← Şüphe türü seçimine dön
                      </button>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {screeningPack.condition?.title} — Soru {screeningStep + 1} / {screeningPack.questions?.length || 0}
                      </span>
                    </div>

                    {(() => {
                      const qs = screeningPack.questions || [];
                      const q = qs[screeningStep];
                      if (!q) return null;
                      const answered = screeningAnswers[q.id];
                      return (
                        <div className="space-y-6">
                          <h4 className="text-xl md:text-2xl font-black text-slate-900 leading-snug">{q.prompt}</h4>
                          <div className="space-y-3">
                            {(q.options || []).map((o) => (
                              <button
                                key={o.id}
                                type="button"
                                onClick={() => setScreeningAnswers((prev) => ({ ...prev, [q.id]: o.id }))}
                                className={`w-full text-left p-4 rounded-2xl border-2 transition-all font-bold text-sm ${
                                  answered === o.id
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-slate-100 bg-slate-50 text-slate-700 hover:border-slate-200'
                                }`}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-3 pt-4">
                            {screeningStep > 0 && (
                              <button
                                type="button"
                                onClick={() => setScreeningStep((s) => Math.max(0, s - 1))}
                                className="px-6 py-3 rounded-xl border border-slate-200 font-black text-xs uppercase tracking-widest"
                              >
                                Geri
                              </button>
                            )}
                            {screeningStep < qs.length - 1 && (
                              <button
                                type="button"
                                disabled={answered == null}
                                onClick={() => answered != null && setScreeningStep((s) => s + 1)}
                                className="px-8 py-3 rounded-xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest disabled:opacity-40"
                              >
                                İleri
                              </button>
                            )}
                            {screeningStep === qs.length - 1 && (
                              <button
                                type="button"
                                disabled={answered == null || loading}
                                onClick={async () => {
                                  const missing = qs.some((qq) => screeningAnswers[qq.id] == null);
                                  if (missing) {
                                    alert('Lütfen tüm soruları yanıtlayın.');
                                    return;
                                  }
                                  setLoading(true);
                                  try {
                                    const answers = qs.map((qq) => ({
                                      questionId: qq.id,
                                      optionId: screeningAnswers[qq.id],
                                    }));
                                    const { data } = await axios.post(`${API_URL}/screening/submit`, {
                                      slug: screeningPack.condition.slug,
                                      answers,
                                      lat: userLocation?.lat,
                                      lon: userLocation?.lon,
                                      userId: user?.id,
                                    });
                                    setScreeningResult(data);
                                  } catch (e) {
                                    alert(e.response?.data?.error || 'Sonuç oluşturulamadı');
                                  } finally {
                                    setLoading(false);
                                  }
                                }}
                                className="px-8 py-3 rounded-xl bg-rose-600 text-white font-black text-xs uppercase tracking-widest disabled:opacity-40"
                              >
                                {loading ? 'Gönderiliyor…' : 'Sonucu oluştur'}
                              </button>
                            )}
                          </div>
                          {!userLocation && (
                            <p className="text-[10px] text-amber-700 font-bold bg-amber-50 border border-amber-100 rounded-xl p-3">
                              Konum yok; yakın hastane önerisi için &quot;Yakındaki sağlık&quot; sekmesinden konum izni verin veya sayfayı yenileyin.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {screeningResult && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <button
                      type="button"
                      className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-900"
                      onClick={() => {
                        setScreeningResult(null);
                        setScreeningPack(null);
                        setScreeningAnswers({});
                        setScreeningStep(0);
                      }}
                    >
                      ← Yeni tarama
                    </button>

                    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl p-8 md:p-10 space-y-8">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="px-4 py-2 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
                          {screeningResult.condition?.title}
                        </span>
                        <span className="text-sm text-slate-500 font-bold">
                          Özet skor: {screeningResult.score} / {screeningResult.maxScore} (bilgilendirme amaçlı)
                        </span>
                      </div>

                      {screeningResult.ai?.emergency_note && (
                        <div className="p-6 rounded-2xl bg-rose-50 border-2 border-rose-200 text-rose-900 font-bold text-sm">
                          {screeningResult.ai.emergency_note}
                        </div>
                      )}

                      <div className="prose prose-slate max-w-none">
                        <h5 className="text-lg font-black uppercase italic tracking-tight text-slate-900">Yorum</h5>
                        <p className="text-slate-600 font-medium leading-relaxed whitespace-pre-wrap">{screeningResult.ai?.interpretation}</p>
                        <p className="text-sm font-black text-slate-800 mt-4">Şüphe düzeyi (bilgilendirme): {screeningResult.ai?.suspicion_level_label}</p>
                      </div>

                      {Array.isArray(screeningResult.ai?.natural_methods) && screeningResult.ai.natural_methods.length > 0 && (
                        <div>
                          <h5 className="text-lg font-black uppercase italic tracking-tight text-slate-900 mb-3">Doğal / yaşam tarzı önerileri</h5>
                          <ul className="list-disc pl-5 space-y-2 text-slate-600 font-medium text-sm">
                            {screeningResult.ai.natural_methods.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="p-6 rounded-2xl bg-slate-900 text-white">
                        <h5 className="text-xs font-black uppercase tracking-widest text-white/60 mb-2">Hekim önceliği</h5>
                        <p className="text-sm font-medium leading-relaxed">{screeningResult.ai?.doctor_importance}</p>
                      </div>

                      {screeningResult.nearestHospital && (
                        <div className="p-6 rounded-2xl border-2 border-emerald-200 bg-emerald-50/80">
                          <h5 className="text-xs font-black uppercase tracking-widest text-emerald-800 mb-2 flex items-center gap-2">
                            <MapPin size={16} /> Yakın hastane (tahmini)
                          </h5>
                          <p className="font-black text-slate-900 text-lg">{screeningResult.nearestHospital.name}</p>
                          <p className="text-sm text-slate-600 font-bold mt-1">
                            ~{screeningResult.nearestHospital.distanceKm} km (kuş uçuşu)
                          </p>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&origin=${userLocation?.lat ?? ''},${userLocation?.lon ?? ''}&destination=${screeningResult.nearestHospital.lat},${screeningResult.nearestHospital.lon}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest"
                          >
                            <Navigation size={14} /> Yol tarifi
                          </a>
                        </div>
                      )}

                      <p className="text-[10px] text-slate-400 font-bold leading-relaxed border-t border-slate-100 pt-6">
                        {screeningResult.ai?.disclaimer}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'calendar' && (
              <CalendarPlanner apiUrl={API_URL} token={token} />
            )}

            {activeTab === 'profile' && (
              <div className="space-y-12 animate-in fade-in duration-700">
                <SectionHeader title="Klinik profil paneli" subtitle="Kişisel metriklerinizi yönetin ve CodeX tabanlı sağlık analizlerinizi takip edin." />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-12 bg-white rounded-3xl p-8 shadow-xl border border-slate-100 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden group">
                    <div className="w-32 h-32 rounded-full bg-slate-900 border-4 border-slate-50 flex items-center justify-center text-white font-black text-4xl uppercase shadow-inner group-hover:scale-105 transition-transform duration-700">
                      {user.name.charAt(0)}
                    </div>
                    <div className="relative z-10 flex-1 space-y-4">
                      <div className="space-y-1 text-center md:text-left">
                        <h3 className="text-3xl font-black font-headline tracking-tighter italic uppercase text-slate-900">{user.name}</h3>
                        <p className="text-slate-400 font-black uppercase text-[10px] tracking-[0.4em] italic">Doğrulanmış klinik üye • CodeX ID: CX-{user.id}</p>
                      </div>
                      <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                        <span className="px-5 py-2.5 bg-slate-50 text-slate-700 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-100 flex items-center gap-2">
                          <span className="material-symbols-outlined text-base">alternate_email</span> {user.email}
                        </span>
                        <span className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                          <span className="material-symbols-outlined text-base">calendar_today</span> Nisan 2026 Katılım
                        </span>
                      </div>
                    </div>
                    <span className="material-symbols-outlined absolute -right-16 -top-16 text-[200px] text-slate-50 opacity-40 group-hover:rotate-12 transition-transform duration-1000">verified</span>
                  </div>

                  <div className="lg:col-span-5 bg-white rounded-3xl p-8 shadow-xl border border-slate-100">
                    <div className="flex items-center gap-4 mb-10 border-b border-slate-50 pb-8">
                      <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-lg"><Activity size={18} /></div>
                      <h4 className="text-xl font-black font-headline uppercase italic tracking-tighter">Vücut Metrikleri</h4>
                    </div>
                    <form onSubmit={handleProfileUpdate} className="space-y-10">
                      <div className="grid grid-cols-2 gap-x-12 gap-y-10">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-300 tracking-widest italic ml-1">Boy (cm)</label>
                          <input type="number" placeholder="000" className="bg-transparent border-b-2 border-slate-100 p-2 w-full outline-none font-black text-3xl text-slate-900 focus:border-slate-900 focus:bg-slate-50/50 transition-all rounded-none" value={profileForm.height} onChange={e => setProfileForm({ ...profileForm, height: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-300 tracking-widest italic ml-1">Kilo (kg)</label>
                          <input type="number" placeholder="00" className="bg-transparent border-b-2 border-slate-100 p-2 w-full outline-none font-black text-3xl text-slate-900 focus:border-slate-900 focus:bg-slate-50/50 transition-all rounded-none" value={profileForm.weight} onChange={e => setProfileForm({ ...profileForm, weight: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-12 gap-y-10">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-300 tracking-widest italic ml-1">Yaş</label>
                          <input type="number" placeholder="00" className="bg-transparent border-b-2 border-slate-100 p-2 w-full outline-none font-black text-3xl text-slate-900 focus:border-slate-900 focus:bg-slate-50/50 transition-all rounded-none" value={profileForm.age} onChange={e => setProfileForm({ ...profileForm, age: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase text-slate-300 tracking-widest italic ml-1">Cinsiyet</label>
                          <select className="bg-transparent border-b-2 border-slate-100 p-2 w-full outline-none font-black text-xl text-slate-900 focus:border-slate-900 focus:bg-slate-50/50 transition-all appearance-none rounded-none cursor-pointer" value={profileForm.gender} onChange={e => setProfileForm({ ...profileForm, gender: e.target.value })}>
                            <option value="erkek">Erkek</option>
                            <option value="kadin">Kadın</option>
                          </select>
                        </div>
                      </div>
                      <button disabled={loading} className="w-full py-5 bg-slate-900 text-white font-black rounded-xl hover:bg-slate-800 transition-all text-[11px] uppercase tracking-[0.3em] mt-8 shadow-2xl flex items-center justify-center gap-4 group">
                        {loading ? <Loader2 className="animate-spin" /> : <>Profil Bilgilerini Onayla <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" /></>}
                      </button>
                    </form>
                  </div>

                  <div className="lg:col-span-7 space-y-6">
                    <div className="bg-slate-900 rounded-[2rem] p-8 text-white shadow-xl relative overflow-hidden group min-h-[250px] flex flex-col justify-center border-l-[12px] border-slate-700">
                      <span className="material-symbols-outlined absolute -top-12 -right-12 text-[200px] text-white/5 group-hover:rotate-12 transition-transform duration-1000">psychology</span>
                      <div className="relative z-10 space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-xl border border-white/10"><Activity size={20} className="text-white" /></div>
                          <h5 className="font-black text-xl italic tracking-tighter uppercase leading-none text-slate-100">Klinik CodeX Analizi</h5>
                        </div>
                        <p className="text-slate-300 text-lg leading-relaxed italic font-medium border-l-2 border-slate-700 pl-6">
                          {user.bmi_interpretation || "Profil verilerinizi girdiğinizde burada derinlemesine bir sağlık analizi oluşacak."}
                        </p>
                        <div className="flex gap-4 border-t border-white/5 pt-6">
                          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 italic">CodeX motoru: Gemini-2.5-Clinical</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-6 rounded-3xl border border-slate-50 shadow-sm transition-all hover:shadow-lg group">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Hesap Durumu</p>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span className="font-black text-slate-900 uppercase italic text-base">Aktif / Klinik Üye</span>
                        </div>
                      </div>
                      <div className="bg-white p-6 rounded-3xl border border-slate-50 shadow-sm transition-all hover:shadow-lg group flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Dil / Bölge</p>
                          <span className="font-black text-slate-900 uppercase italic text-base">TR / Avrupa</span>
                        </div>
                        <span className="material-symbols-outlined text-slate-200 text-3xl">language</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'games' && (
              <div className="space-y-12 animate-in fade-in duration-700">
                {!selectedGame ? (
                  <div className="space-y-16">
                    <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                      <SectionHeader title="Klinik oyunlar" subtitle="Bilişsel sağlık egzersizleri ve tıbbi eğitim odaklı simülasyonlar." />
                      <button
                        onClick={async () => {
                          const res = await axios.get(`${API_URL}/user/game-history`, { headers: { Authorization: `Bearer ${token}` } });
                          setGameHistory(res.data);
                          setSelectedGame('history');
                        }}
                        className="px-8 py-4 bg-white shadow-xl border border-slate-50 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:bg-slate-50 transition-all group"
                      >
                        <History size={16} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                        Oyun Geçmişim
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                      <div className="bg-white rounded-[3rem] p-12 border border-slate-50 shadow-xl hover:shadow-2xl transition-all group relative overflow-hidden flex flex-col h-[500px]">
                        <span className="material-symbols-outlined absolute -top-10 -right-10 text-[220px] text-slate-50 transition-transform group-hover:rotate-12 duration-1000">psychology</span>
                        <div className="relative z-10 flex-1 space-y-8">
                          <div className="w-20 h-20 bg-slate-900 text-white rounded-3xl flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                            <Brain size={40} />
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-4xl font-black font-headline tracking-tighter italic uppercase">Hafıza Oyunu</h4>
                            <p className="text-slate-400 font-bold uppercase text-[11px] tracking-[0.3em] italic underline decoration-slate-200">Klinik Tanı & Görsel Hafıza</p>
                          </div>
                          <p className="text-slate-500 font-bold italic text-lg leading-relaxed border-l-8 border-slate-100 pl-8">
                            Tıbbi sembolleri eşleştirerek zihinsel hızınızı artırın. 3 farklı zorluk seviyesi mevcuttur.
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedGame('memory')}
                          className="w-full py-6 bg-slate-900 text-white font-black rounded-[2rem] shadow-xl hover:bg-slate-800 transition-all uppercase tracking-widest text-[12px] flex items-center justify-center gap-4 active:scale-95 mt-auto"
                        >
                          <Play size={18} fill="white" /> Oyunu Başlat
                        </button>
                      </div>

                      <div className="bg-white rounded-[3rem] p-12 border border-slate-50 shadow-xl hover:shadow-2xl transition-all group relative overflow-hidden flex flex-col h-[500px]">
                        <span className="material-symbols-outlined absolute -top-10 -right-10 text-[220px] text-slate-50 transition-transform group-hover:rotate-12 duration-1000">bolt</span>
                        <div className="relative z-10 flex-1 space-y-8">
                          <div className="w-20 h-20 bg-emerald-500 text-white rounded-3xl flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform border-4 border-white">
                            <Zap size={40} fill="white" />
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-4xl font-black font-headline tracking-tighter italic uppercase">Tepki Testi</h4>
                            <p className="text-slate-400 font-bold uppercase text-[11px] tracking-[0.3em] italic underline decoration-slate-200">Refleks & Odaklanma</p>
                          </div>
                          <p className="text-emerald-600/70 font-bold italic text-lg leading-relaxed border-l-8 border-emerald-50 pl-8">
                            Beklenmedik klinik durumlara ne kadar hızlı yanıt verebildiğinizi milisaniye cinsinden ölçün.
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedGame('reaction')}
                          className="w-full py-6 bg-emerald-600 text-white font-black rounded-[2rem] shadow-xl hover:bg-emerald-500 transition-all uppercase tracking-widest text-[12px] flex items-center justify-center gap-4 active:scale-95 mt-auto"
                        >
                          <Zap size={18} fill="white" /> Teste Başla
                        </button>
                      </div>

                      <div className="bg-slate-50 rounded-[3rem] p-12 border-4 border-dashed border-slate-100 flex flex-col items-center justify-center gap-8 opacity-40 grayscale group hover:grayscale-0 transition-all">
                        <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-4xl text-slate-400">lock</span>
                        </div>
                        <p className="text-slate-400 font-black uppercase text-[11px] tracking-[0.5em] text-center italic">Yeni Görev Yükleniyor</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="animate-in slide-in-from-bottom-8 duration-700">
                    {selectedGame === 'memory' && <MemoryGame onBack={() => setSelectedGame(null)} token={token} />}
                    {selectedGame === 'reaction' && <ReactionTest onBack={() => setSelectedGame(null)} token={token} />}
                    {selectedGame === 'history' && (
                      <div className="space-y-10">
                        <button onClick={() => setSelectedGame(null)} className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors font-bold uppercase text-[10px] tracking-widest">
                          <ArrowLeft size={16} /> Geri Dön
                        </button>
                        <SectionHeader title="Oyun Geçmişim" subtitle="Klinik performans verileriniz ve zihinsel gelişim grafiğiniz." />

                        <div className="bg-white rounded-[3rem] overflow-hidden shadow-2xl border border-slate-100">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-900 text-white">
                                <th className="px-10 py-6 text-[11px] font-black uppercase tracking-widest italic">Oyun</th>
                                <th className="px-10 py-6 text-[11px] font-black uppercase tracking-widest italic">Zorluk</th>
                                <th className="px-10 py-6 text-[11px] font-black uppercase tracking-widest italic">Skor (Hamle)</th>
                                <th className="px-10 py-6 text-[11px] font-black uppercase tracking-widest italic">Süre</th>
                                <th className="px-10 py-6 text-[11px] font-black uppercase tracking-widest italic">Analiz / Not</th>
                                <th className="px-10 py-6 text-[11px] font-black uppercase tracking-widest italic">Tarih</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {gameHistory.length === 0 ? (
                                <tr>
                                  <td colSpan="6" className="px-10 py-20 text-center text-slate-300 font-black italic uppercase tracking-[0.2em]">Henüz bir oyun verisi bulunmuyor.</td>
                                </tr>
                              ) : gameHistory.map((h, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-10 py-6">
                                    <div className="flex items-center gap-4">
                                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${h.game_type === 'memory' ? 'bg-slate-100 text-slate-900' : 'bg-emerald-50 text-emerald-600'}`}>
                                        {h.game_type === 'memory' ? <Brain size={20} /> : <Zap size={20} />}
                                      </div>
                                      <span className="font-black text-slate-900 uppercase italic text-sm">{h.game_type === 'memory' ? 'Hafıza Testi' : 'Tepki Testi'}</span>
                                    </div>
                                  </td>
                                  <td className="px-10 py-6">
                                    <span className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase italic tracking-widest">{gameDifficultyLabel(h.difficulty)}</span>
                                  </td>
                                  <td className="px-10 py-6 font-black text-slate-900">{h.moves} Hamle</td>
                                  <td className="px-10 py-6 font-black text-slate-900">{h.game_type === 'reaction' ? h.time_seconds * 1000 : h.time_seconds}{h.game_type === 'reaction' ? 'ms' : 's'}</td>
                                  <td className="px-10 py-6 text-slate-500 italic font-medium text-xs max-w-md truncate" title={h.comment}>{h.comment || '-'}</td>
                                  <td className="px-10 py-6 text-slate-400 font-bold text-xs">{new Date(h.created_at).toLocaleDateString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        </main>

        <footer className="py-16 px-16 border-t border-slate-50 flex flex-col items-center bg-white text-center space-y-6">
          <div className="flex items-center gap-10 text-[12px] font-black uppercase tracking-[0.4em] text-slate-300">
            <span className="text-slate-900 italic">CodeX Sağlık</span>
            <span className="hidden md:inline">© 2026 CodeX - GDG Hackathon</span>
            <div className="flex gap-8">
              <a href="#" className="hover:text-slate-900 transition-colors underline decoration-slate-200">Gizlilik</a>
              <a href="#" className="hover:text-slate-900 transition-colors">Şartlar</a>
            </div>
          </div>
          <p className="max-w-3xl text-[10px] text-slate-200 font-bold italic leading-relaxed uppercase tracking-widest">
            CodeX Sağlık, verilerinizi güvenli protokollerle işleyen bir CodeX simülasyonudur ve resmi tıbbi teşhis koyma amacı gütmez.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
