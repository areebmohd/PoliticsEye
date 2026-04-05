import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Shield, Activity, Hash, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://localhost:5000/api';

// Memoized Post Component to prevent re-rendering existing items
const PostCard = React.memo(({ post }) => (
  <motion.div 
    layout
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    className="post-card"
  >
    <div className="post-header">
      <div className="user-info">
        <div className="w-8 h-8 rounded-full bg-[#222] border border-[#333] flex items-center justify-center text-[10px] font-bold text-[#555]">
          {post.author[post.author.startsWith('u/') ? 2 : 0].toUpperCase()}
        </div>
        <div>
          <p className="username">{post.author}</p>
          <p className="timestamp">{post.source} • {new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
      <div className={`badge ${post.sentiment === 'positive' ? 'badge-pos' : post.sentiment === 'negative' ? 'badge-neg' : 'badge-neu'}`}>
        {post.sentiment.toUpperCase()}
      </div>
    </div>
    <p className="content">{post.text}</p>
  </motion.div>
));

const App = () => {
  const [data, setData] = useState({ latest_posts: [], history: [], summary: {}, trending: [], mode: 'mock' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/snapshot`);
      setData(response.data);
      if (loading) setLoading(false);
      setError(null);
    } catch (err) {
      setError("Lost connection to analysis engine.");
    }
  }, [loading]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const chartData = useMemo(() => {
    return data.history.map(h => ({
      ...h,
      time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));
  }, [data.history]);

  const filteredPosts = useMemo(() => {
    if (filter === 'all') return data.latest_posts;
    return data.latest_posts.filter(p => p.sentiment === filter);
  }, [data.latest_posts, filter]);

  const toggleMode = useCallback(async (newMode) => {
    try {
      await axios.post(`${API_BASE}/toggle-mode`, { mode: newMode });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to switch mode");
    }
  }, [fetchData]);

  if (loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a]">
        <Activity className="w-8 h-8 text-blue-500 animate-pulse mb-4" />
        <p className="text-sm font-bold uppercase tracking-widest text-[#555]">Initializing Optimized Dashboard</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="flex items-center gap-3 mb-8">
           <Shield className="w-6 h-6 text-blue-500" />
           <h1>POLITICSEYE</h1>
        </div>

        <div className="btn-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <button onClick={() => toggleMode('mock')} className={`btn ${data.mode === 'mock' ? 'active' : ''}`}>MOCK</button>
          <button onClick={() => toggleMode('news')} className={`btn ${data.mode === 'news' ? 'active' : ''}`}>NEWS</button>
          <button onClick={() => toggleMode('rss')} className={`btn ${data.mode === 'rss' ? 'active' : ''}`}>REDDIT</button>
          <button onClick={() => toggleMode('live')} className={`btn ${data.mode === 'live' ? 'active' : ''}`}>LIVE</button>
        </div>

        <section className="stat-section">
           <h2>Sentiment Average</h2>
           <div className="flex items-baseline gap-2">
              <span className={`big-number ${data.summary.avg_sentiment >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {data.summary.avg_sentiment?.toFixed(3) || "0.000"}
              </span>
           </div>
        </section>

        <section className="stat-section">
           <h2>Stream Velocity</h2>
           <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={chartData}>
                    <defs>
                       <linearGradient id="colorWave" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                       </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#222" />
                    <XAxis dataKey="time" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Area type="monotone" dataKey="volume" stroke="#3b82f6" fill="url(#colorWave)" strokeWidth={2} isAnimationActive={false} />
                 </AreaChart>
              </ResponsiveContainer>
           </div>
        </section>

        <section className="stat-section">
           <h2>Top Keywords</h2>
           <div className="space-y-3 mt-4">
              {data.trending?.map((t, i) => (
                <div key={i} className="flex justify-between items-center text-[13px]">
                   <span className="flex items-center gap-2 text-[#ccc]">
                     <Hash className="w-3.5 h-3.5 text-blue-500" style={{ transform: 'translateY(2.5px)' }} /> 
                     {t.name}
                   </span>
                   <span className="font-bold text-[#555]">{t.count}</span>
                </div>
              ))}
           </div>
        </section>
      </aside>

      {/* FEED */}
      <main className="main-feed">
        <div className="feed-header">
           <h2 className="border-0 mb-0">Incoming Signal Stream</h2>
           <div className="filter-group">
              <button onClick={() => setFilter('all')} className={`btn ${filter === 'all' ? 'active' : ''}`}>All</button>
              <button onClick={() => setFilter('positive')} className={`btn ${filter === 'positive' ? 'active' : ''}`} style={filter === 'positive' ? {backgroundColor: '#10b981'} : {}}>Positive</button>
              <button onClick={() => setFilter('negative')} className={`btn ${filter === 'negative' ? 'active' : ''}`} style={filter === 'negative' ? {backgroundColor: '#ef4444'} : {}}>Negative</button>
           </div>
        </div>

        {error && <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 text-sm flex items-center gap-3"><AlertCircle className="w-4 h-4"/>{error}</div>}

        <div className="space-y-4">
           <AnimatePresence mode="popLayout" initial={false}>
              {filteredPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
           </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default App;
