import React, { useState, useEffect, useRef } from "react";
import "./App.css";

const DEFAULT_PRICE = 30000;
const ALARM_WARNING = 10 * 60;
const STORAGE_KEYS = {
  UNITS: "playbox_units",
  USERS: "playbox_users",
  SESSION: "playbox_session",
  LOGS: "playbox_logs",
  THEME: "playbox_theme",
};

const uid = () => Math.random().toString(36).substring(2, 9);
const formatTime = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
};

export default function App() {
  const [units, setUnits] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.UNITS);
    return saved
      ? JSON.parse(saved)
      : [
          { id: uid(), name: "Unit 1", remaining: 0, running: false, color: "#3498db", price: DEFAULT_PRICE, volume: 1, muted: false },
          { id: uid(), name: "Unit 2", remaining: 0, running: false, color: "#3498db", price: DEFAULT_PRICE, volume: 1, muted: false },
        ];
  });

  const [users, setUsers] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.USERS);
    return saved
      ? JSON.parse(saved)
      : [
          { id: uid(), username: "admin", password: "1234", role: "admin" },
          { id: uid(), username: "operator", password: "0000", role: "operator" },
        ];
  });

  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SESSION);
    return saved ? JSON.parse(saved) : null;
  });

  const [theme, setTheme] = useState(
    () => localStorage.getItem(STORAGE_KEYS.THEME) || "dark"
  );
  const [logs, setLogs] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LOGS);
    return saved ? JSON.parse(saved) : [];
  });

  const [confirmData, setConfirmData] = useState(null); // modal konfirmasi custom
  const audioRef = useRef(null);

  const playAlarm = (count = 3) => {
    const ctx =
      audioRef.current || new (window.AudioContext || window.webkitAudioContext)();
    audioRef.current = ctx;
    const beep = (freq, dur) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.setValueAtTime(0.1, ctx.currentTime);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur / 1000);
    };
    for (let i = 0; i < count; i++) {
      setTimeout(() => beep(600 + i * 100, 300), i * 600);
    }
  };

  useEffect(() => localStorage.setItem(STORAGE_KEYS.UNITS, JSON.stringify(units)), [units]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users)), [users]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session)), [session]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.THEME, theme), [theme]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs)), [logs]);

  useEffect(() => {
    const interval = setInterval(() => {
      setUnits((prev) =>
        prev.map((u) => {
          if (!u.running || u.remaining <= 0) return u;
          const newTime = u.remaining - 1;
          if (newTime === ALARM_WARNING) playAlarm(1);
          if (newTime === 0) playAlarm(3);
          const progress = newTime / (u.initial || newTime + 1);
          const red = Math.floor(255 * (1 - progress));
          const blue = Math.floor(255 * progress);
          return {
            ...u,
            remaining: newTime,
            color: `rgb(${red},0,${blue})`,
            running: newTime > 0,
          };
        })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = (username, password) => {
    const found = users.find((u) => u.username === username && u.password === password);
    if (found) setSession(found);
    else alert("Username atau password salah!");
  };

  const handleLogout = () => setSession(null);

  const startTimer = (id, hours, minutes) => {
    const total = hours * 3600 + minutes * 60;
    if (!total) return alert("Durasi tidak boleh 0!");
    setUnits((prev) =>
      prev.map((u) =>
        u.id === id
          ? { ...u, remaining: total, initial: total, running: true, color: "#3498db" }
          : u
      )
    );
    setLogs((l) => [
      ...l,
      { id: uid(), unit: id, action: "start", time: new Date().toLocaleString() },
    ]);
  };

  const stopTimer = (id) =>
    setUnits((prev) =>
      prev.map((u) =>
        u.id === id ? { ...u, running: false, color: "#999" } : u
      )
    );

  const deleteUnit = (id) => {
    setConfirmData({
      message: "Yakin hapus unit ini?",
      onConfirm: () => {
        setUnits((prev) => prev.filter((u) => u.id !== id));
        setConfirmData(null);
      },
    });
  };

  const toggleMute = (id) =>
    setUnits((prev) =>
      prev.map((u) => (u.id === id ? { ...u, muted: !u.muted } : u))
    );

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  if (!session)
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center ${
          theme === "dark" ? "bg-gray-900 text-white" : "bg-white text-black"
        }`}
      >
        <h1 className="text-2xl font-bold mb-3">Playbox Login</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const user = e.target.username.value;
            const pass = e.target.password.value;
            handleLogin(user, pass);
          }}
          className="flex flex-col gap-2 w-60"
        >
          <input name="username" placeholder="Username" className="border p-2 rounded" />
          <input name="password" type="password" placeholder="Password" className="border p-2 rounded" />
          <button className="bg-blue-600 text-white rounded py-1">Login</button>
        </form>
        <button onClick={toggleTheme} className="mt-4 text-sm opacity-60 hover:opacity-100">
          {theme === "dark" ? "🌙" : "☀️"} Mode
        </button>
      </div>
    );

  return (
    <div
      className={`min-h-screen p-6 transition-colors ${
        theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-black"
      }`}
    >
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Playbox Timer</h1>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className="px-2 py-1 rounded border opacity-80 hover:opacity-100">
            {theme === "dark" ? "🌙" : "☀️"}
          </button>
          <span>{session.username}</span>
          <button onClick={handleLogout} className="text-red-500 text-sm">Logout</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {units.map((u) => (
          <div
            key={u.id}
            className="p-4 rounded-2xl shadow-md transition-colors"
            style={{
              backgroundColor: u.color,
              color: "white",
              opacity: u.running ? 1 : 0.6,
            }}
          >
            <h2 className="font-bold text-lg mb-2">{u.name}</h2>
            <div className="text-3xl mb-2 font-mono">{formatTime(u.remaining)}</div>
            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={() => startTimer(u.id, 0, 30)} className="bg-green-600 px-2 py-1 rounded text-sm">
                ▶️ 30m
              </button>
              <button onClick={() => stopTimer(u.id)} className="bg-yellow-600 px-2 py-1 rounded text-sm">
                ⏸ Stop
              </button>
              <button onClick={() => deleteUnit(u.id)} className="bg-red-600 px-2 py-1 rounded text-sm">
                ❌ Hapus
              </button>
              <button onClick={() => toggleMute(u.id)} className="bg-blue-800 px-2 py-1 rounded text-sm">
                {u.muted ? "🔇" : "🔊"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <h3 className="mt-8 mb-2 font-semibold text-lg">📒 Pembukuan</h3>
      <ul className="text-sm bg-gray-800 text-white rounded-lg p-3 max-h-48 overflow-y-auto">
        {logs.slice(-10).map((l) => (
          <li key={l.id}>
            [{l.time}] Unit: {l.unit} → {l.action}
          </li>
        ))}
      </ul>

      {/* Modal Konfirmasi */}
      {confirmData && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white text-black p-4 rounded-lg shadow-lg">
            <p className="mb-4">{confirmData.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  confirmData.onConfirm();
                }}
                className="bg-red-600 text-white px-3 py-1 rounded"
              >
                Ya
              </button>
              <button
                onClick={() => setConfirmData(null)}
                className="bg-gray-400 text-white px-3 py-1 rounded"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
