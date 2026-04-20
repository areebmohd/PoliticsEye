import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Shield, Activity, Hash, AlertCircle, Search, TrendingUp, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const PostCard = React.memo(({ post, isRelated, isActive, onFindRelated }) => (
  <motion.div 
    layout
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ 
      opacity: 1, 
      scale: isActive ? 1.05 : isRelated ? 1.02 : 1,
      boxShadow: isActive ? '0 0 0 2px var(--accent), 0 20px 25px -5px rgba(59, 130, 246, 0.4)' : 
                 isRelated ? '0 0 0 2px #3b82f6, 0 10px 15px -3px rgba(59, 130, 246, 0.2)' : 'none'
    }}
    transition={{ type: "tween", ease: "easeOut", duration: 0.15 }}
    className={`post-card ${isRelated ? 'related' : ''} ${isActive ? 'active-signal' : ''}`}
  >
    <div className="post-header">
      <div className="user-info">
        <div className="user-avatar" style={isRelated ? {background: '#3b82f6'} : {}}>
          {post.author[post.author.startsWith('u/') ? 2 : 0].toUpperCase()}
        </div>
        <div>
          <p className="username">{post.author}</p>
          <p className="timestamp">{post.source} • {new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
      <div className="badge-stack">
        <button className="btn-related" onClick={() => onFindRelated(post.id)} title="Find Related Signals">
          Related
        </button>
        <div className={`badge ${post.sentiment === 'positive' ? 'badge-pos' : post.sentiment === 'negative' ? 'badge-neg' : 'badge-neu'}`}>
          {post.sentiment.toUpperCase()}
        </div>
        {post.ai_meta && (
          <div className="badge badge-ai" title={`Confidence: ${post.ai_meta.confidence}`}>
            AI {Math.round(post.ai_meta.confidence * 100)}%
          </div>
        )}
      </div>
    </div>
    <p className="content">{post.text}</p>
  </motion.div>
));

const SentimentChart = React.memo(({ chartData, title, height = "220px" }) => (
  <section className="chart-section" style={{ height, marginBottom: '20px', padding: '15px' }}>
     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>{title}</h3>
     </div>
     <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
           <defs>
              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                 <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                 <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
           </defs>
           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#222" />
           <XAxis dataKey="time" hide />
           <YAxis domain={[-1, 1]} hide />
           <Tooltip 
              contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', fontSize: '10px' }}
              itemStyle={{ color: '#3b82f6' }}
           />
           <Area 
              type="monotone" 
              dataKey="score" 
              stroke="#3b82f6" 
              fillOpacity={1} 
              fill="url(#colorScore)" 
              isAnimationActive={false}
           />
        </AreaChart>
     </ResponsiveContainer>
  </section>
));

const App = () => {
  const [data, setData] = useState({ latest_posts: [], fallback_posts: [], history: [], summary: {}, trending: [], mode: 'mock' });
  const [loading, setLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [relatedIds, setRelatedIds] = useState([]);
  const [activePostId, setActivePostId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [historicalData, setHistoricalData] = useState([]);
  const [period, setPeriod] = useState('daily');
  const [historicalAggData, setHistoricalAggData] = useState([]);
  const [fetchingPeriod, setFetchingPeriod] = useState(false);

  const fetchHistorical = useCallback(async (p) => {
    setFetchingPeriod(true);
    try {
      const res = await axios.get(`${API_BASE}/analytics/historical?period=${p}`);
      setHistoricalAggData(res.data);
    } catch (err) {
      console.error("Historical fetch failed", err);
    } finally {
      setFetchingPeriod(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/snapshot`);
      setData(response.data);
      setServerStatus('online');
      if (loading) setLoading(false);
      setError(null);

      // Fetch the last 100 points for the "Session" chart (already sorted chronologically by backend)
      const historyRes = await axios.get(`${API_BASE}/analytics/timeseries?limit=100`);
      setHistoricalData(historyRes.data);
    } catch (err) {
      setServerStatus('offline');
      setError("Lost connection to analysis engine. Checking status...");
    }
  }, [loading]);

  useEffect(() => {
    fetchData();
    fetchHistorical(period);
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData, fetchHistorical, period]);

  const chartData = useMemo(() => {
    // historicalData from MongoDB already has a 'time' field formatted as HH:MM
    if (historicalData.length > 0) return historicalData;
    // Fallback: session buffer from snapshot
    return (data.history || []).map(h => ({
      ...h,
      time: new Date(h.dt || h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));
  }, [data.history, historicalData]);

  const filteredPosts = useMemo(() => {
    if (filter === 'all') return data.latest_posts;
    return data.latest_posts.filter(p => p.sentiment === filter);
  }, [data.latest_posts, filter]);

  const toggleMode = useCallback(async (newMode) => {
    try {
      await axios.post(`${API_BASE}/toggle-mode`, { mode: newMode });
      setRelatedIds([]);
      setActivePostId(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to switch mode");
    }
  }, [fetchData]);

  const findRelated = useCallback(async (postId) => {
    // Optimistic UI update: Mark active immediately for "fast" feel
    setActivePostId(postId);
    setRelatedIds([]); 

    try {
      const response = await axios.get(`${API_BASE}/related/${postId}`);
      setRelatedIds(response.data.related_ids || []);
    } catch (err) {
      console.error("Failed to fetch related posts", err);
    }
  }, []);

  const handleSearch = async (e, forcedTerm = null) => {
    if (e) e.preventDefault();
    const term = forcedTerm || searchTerm;
    if (!term.trim()) return;
    
    setSearching(true);
    try {
      const res = await axios.get(`${API_BASE}/analytics/search?keyword=${encodeURIComponent(term)}`);
      setSearchResult(res.data);
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
    setSearchResult(null);
  };



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
          <button onClick={() => toggleMode('youtube')} className={`btn ${data.mode === 'youtube' ? 'active' : ''}`}>YOUTUBE</button>
          <button onClick={() => toggleMode('twitter')} className={`btn ${data.mode === 'twitter' ? 'active' : ''}`}>TWITTER</button>
                    <button onClick={() => toggleMode('mastodon')} className={`btn ${data.mode === 'mastodon' ? 'active' : ''}`}>MASTODON</button>
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
           <h2>Global Keyword Analysis</h2>
           <form onSubmit={handleSearch} className="search-box">
              <input 
                type="text" 
                placeholder="Search keywords..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchResult ? (
                <button type="button" className="btn-clear" onClick={clearSearch}>
                   <X size={16} />
                </button>
              ) : (
                <button type="submit" disabled={searching}>
                  {searching ? <Activity size={16} className="animate-spin" /> : <Search size={16} />}
                </button>
              )}
           </form>
           
           {searchResult && (
             <motion.div 
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               className="search-result-card"
             >
                <p>Found <strong>{searchResult.count}</strong> mentions</p>
                <div className="sentiment-insight">
                   <TrendingUp size={16} color={searchResult.avg_sentiment >= 0 ? "#10b981" : "#ef4444"} />
                   <span style={{color: searchResult.avg_sentiment >= 0 ? "#10b981" : "#ef4444"}}>
                     Avg: {searchResult.avg_sentiment}
                   </span>
                </div>

                {searchResult.time_series?.length > 1 && (
                  <div className="keyword-mini-chart" style={{ height: '60px', marginTop: '12px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={searchResult.time_series.map(t => ({ 
                        score: t.score, 
                        time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                      }))}>
                        <Area 
                          type="monotone" 
                          dataKey="score" 
                          stroke={searchResult.avg_sentiment >= 0 ? "#10b981" : "#ef4444"} 
                          fill={searchResult.avg_sentiment >= 0 ? "#10b981" : "#ef4444"} 
                          fillOpacity={0.1}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
             </motion.div>
           )}
        </section>

        <section className="stat-section">
           <h2>Top Session Keywords</h2>
           <div className="keyword-list">
              {data.trending?.map((t, i) => (
                <div key={i} className="keyword-row" onClick={() => { 
                  setSearchTerm(t.name); 
                  setSearchResult(null);
                  handleSearch({ preventDefault: () => {}, target: { value: t.name } }, t.name);
                }} style={{cursor: 'pointer'}}>
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
           <h2 className="border-0 mb-0">Political Intelligence Stream</h2>
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
                <PostCard 
                  key={post.id} 
                  post={post} 
                  isRelated={relatedIds.includes(post.id)}
                  isActive={activePostId === post.id}
                  onFindRelated={findRelated}
                />
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

      {/* ANALYTICS PANEL */}
      <aside className="analytics-panel">
         {/* Panel Header */}
         <div className="ap-header">
            <div className="ap-title">
               <Activity size={16} color="#3b82f6" />
               <span>Analytics</span>
            </div>
            <span className="ap-live-badge">LIVE</span>
         </div>

         {/* Stats Row */}
         <div className="ap-stats-row">
            <div className="ap-stat">
               <span className="ap-stat-value" style={{color: (data.summary.avg_sentiment || 0) >= 0 ? '#10b981' : '#ef4444'}}>
                  {data.summary.avg_sentiment?.toFixed(3) || '0.000'}
               </span>
               <span className="ap-stat-label">Avg Score</span>
            </div>
            <div className="ap-stat-divider" />
            <div className="ap-stat">
               <span className="ap-stat-value" style={{color: '#10b981'}}>{data.summary.pos_count || 0}</span>
               <span className="ap-stat-label">Positive</span>
            </div>
            <div className="ap-stat-divider" />
            <div className="ap-stat">
               <span className="ap-stat-value" style={{color: '#ef4444'}}>{data.summary.neg_count || 0}</span>
               <span className="ap-stat-label">Negative</span>
            </div>
         </div>

         {/* Combined Charts Block */}
         <div className="ap-chart-block">
            {/* Session Chart Section */}
            <div className="ap-chart-section">
                <div className="ap-chart-label">
                   <TrendingUp size={11} color="#3b82f6" />
                   <span>Session Pulse</span>
                </div>
                <SentimentChart chartData={chartData} title="" height="155px" />
            </div>

            <div className="ap-chart-divider" />

            {/* Historical Chart Section */}
            <div className="ap-chart-section">
                <div className="ap-chart-header">
                   <div className="ap-chart-label">
                      <TrendingUp size={11} color="#8b5cf6" />
                      <span>Historical Trends</span>
                   </div>

               <div className="period-toggle">
                  {[['daily','24H'], ['weekly','7D'], ['monthly','30D']].map(([p, label]) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`period-btn ${period === p ? 'active' : ''}`}
                    >
                      {label}
                    </button>
                  ))}
               </div>
            </div>

            {fetchingPeriod ? (
               <div className="ap-loading">
                  <Activity className="animate-spin" size={18} color="#8b5cf6" />
                  <span>Loading {period} data...</span>
               </div>
            ) : historicalAggData.length === 0 ? (
               <div className="ap-empty">
                  <TrendingUp size={24} color="#333" />
                  <p>No {period} data yet.</p>
                  <small>Keep the stream running to accumulate historical data.</small>
               </div>
            ) : (
               <SentimentChart chartData={historicalAggData} title="" height="190px" />
            )}
            </div>
         </div>
      </aside>
    </div>
  );
};

export default App;
