import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Shield, Activity, Hash, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

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
        <div className="user-avatar">
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
  const [data, setData] = useState({ latest_posts: [], fallback_posts: [], history: [], summary: {}, trending: [], mode: 'mock' });
  const [loading, setLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const fetchData = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/snapshot`);
      setData(response.data);
      setServerStatus('online');
      if (loading) setLoading(false);
      setError(null);
    } catch (err) {
      setServerStatus('offline');
      setError("Lost connection to analysis engine. Checking status...");
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
      <div className="loading-screen">
        <Activity className="animate-pulse" size={32} color="#3b82f6" />
        <p>Initializing Optimized Dashboard</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
           <Shield size={24} color="#3b82f6" />
           <h1>POLITICSEYE</h1>
        </div>

        <div className={`server-status ${serverStatus}`}>
          <div className="status-dot"></div>
          <div className="status-text-stack">
            <span>Server: {serverStatus.toUpperCase()}</span>
            <small>{serverStatus === 'online' ? 'System Running' : 'Attempting to Connect'}</small>
          </div>
        </div>

        <div className="btn-group button-grid">
          <button onClick={() => toggleMode('mock')} className={`btn ${data.mode === 'mock' ? 'active' : ''}`}>MOCK</button>
          <button onClick={() => toggleMode('news')} className={`btn ${data.mode === 'news' ? 'active' : ''}`}>NEWS</button>
          <button onClick={() => toggleMode('rss')} className={`btn ${data.mode === 'rss' ? 'active' : ''}`}>REDDIT</button>
          <button onClick={() => toggleMode('live')} className={`btn ${data.mode === 'live' ? 'active' : ''}`}>LIVE</button>
        </div>

        <section className="stat-section" style={{ marginBottom: '30px' }}>
           <h2>Sentiment Average</h2>
           <div className="flex items-baseline">
              <span className={`big-number ${data.summary.avg_sentiment >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {data.summary.avg_sentiment?.toFixed(3) || "0.000"}
              </span>
              <span className="sentiment-range-label">-1 TO +1</span>
           </div>
        </section>

        <section className="stat-section">
           <h2>Sentiment Score Range</h2>
           <div className="range-container">
              <div className="range-track">
                 <div className="range-marker" style={{ left: `${((data.summary.avg_sentiment || 0) + 1) * 50}%` }}></div>
              </div>
              <div className="range-labels">
                 <span>-1.0</span>
                 <span>NEUTRAL</span>
                 <span>+1.0</span>
              </div>
           </div>
           <div className="sentiment-metrics">
              <span className="text-emerald-400">{((data.summary.pos_ratio || 0) * 100).toFixed(0)}% Pos</span>
              <span className="text-[#555]"> {((1 - (data.summary.pos_ratio || 0) - (data.summary.neg_ratio || 0)) * 100).toFixed(0)}% Neu</span>
              <span className="text-rose-400">{((data.summary.neg_ratio || 0) * 100).toFixed(0)}% Neg</span>
           </div>
        </section>

        <section className="stat-section">
           <h2>Top Keywords</h2>
           <div className="keyword-list">
              {data.trending?.map((t, i) => (
                <div key={i} className="keyword-row">
                   <span className="keyword-label">
                     <Hash size={14} color="#3b82f6" /> 
                     {t.name}
                   </span>
                   <span className="keyword-count">{t.count}</span>
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

         {error && (
            <div className="error-banner">
               <AlertCircle size={16} />
               {error}
            </div>
         )}

          <div className="feed-stream">
            <AnimatePresence mode="popLayout" initial={false}>
               {filteredPosts.length > 0 ? (
                 filteredPosts.map((post) => (
                   <PostCard key={post.id} post={post} />
                 ))
               ) : data.fallback_posts?.length > 0 ? (
                 <>
                   <div className="feed-info-banner">
                      <Activity className="animate-spin" size={16} color="#3b82f6" />
                      <span>{data.mode.toUpperCase()} stream warming up. Showing signal preview...</span>
                   </div>
                   {data.fallback_posts.map((post) => (
                     <PostCard key={post.id} post={post} />
                   ))}
                 </>
               ) : serverStatus === 'online' ? (
                 <div className="feed-loading">
                    <Activity className="animate-spin" size={24} color="#3b82f6" />
                    <p>Initializing analysis pipeline... Signal expected shortly.</p>
                 </div>
               ) : null}
            </AnimatePresence>
          </div>
      </main>
    </div>
  );
};

export default App;
