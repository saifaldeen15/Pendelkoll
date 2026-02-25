import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { fetchTrainData } from './services/api';
import TrainTimeline from './TrainTimeline';

import './App.css';
import './index.css';

function App() {
  const [data, setData] = useState({ toKarlskrona: [], toLessebo: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeTab, setActiveTab] = useState('outbound'); // 'outbound' or 'inbound'
  const notifiedIds = useRef(new Set());

  const sendNotification = (title, body) => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/vite.svg' });
    }
  };

  const checkNotifications = useCallback((allData) => {
    const allJourneys = [...allData.toKarlskrona, ...allData.toLessebo];
    allJourneys.forEach(j => {
      const isCritical = j.connectionRisk || j.leg1.stops.some(s => s.canceled) || (j.leg1.stops[j.leg1.stops.length-1]?.delay > 10);
      if (isCritical && !notifiedIds.current.has(j.id)) {
        const title = j.connectionRisk ? "⚠️ Anslutningsrisk!" : "❌ Tågstörning!";
        const body = j.connectionRisk ? j.connectionWarning : `Tåg ${j.id} är försenat eller inställt.`;
        sendNotification(title, body);
        notifiedIds.current.add(j.id);
      }
    });
  }, []);

  const fetchTrains = useCallback(async () => {
    try {
      const result = await fetchTrainData();
      setData(result);
      checkNotifications(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error("Error fetching train data:", err);
      setError("Misslyckades att hämta tågdata.");
    } finally {
      setLoading(false);
    }
  }, [checkNotifications]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    fetchTrains();
    const intervalId = setInterval(fetchTrains, 30000);
    return () => clearInterval(intervalId);
  }, [fetchTrains]);

  const currentJourneys = activeTab === 'outbound' ? data.toKarlskrona : data.toLessebo;

  return (
    <div className="container">
      <header>
        <h1>Pendelkoll</h1>
        <div className="status-bar">
          <p className="last-updated">Uppdaterad: {format(lastUpdated, 'HH:mm:ss')}</p>
          {loading && <span className="refreshing">...</span>}
        </div>
      </header>

      <div className="tabs">
        <button 
          className={activeTab === 'outbound' ? 'active' : ''} 
          onClick={() => setActiveTab('outbound')}
        >
          Till Karlskrona
        </button>
        <button 
          className={activeTab === 'inbound' ? 'active' : ''} 
          onClick={() => setActiveTab('inbound')}
        >
          Hem till Lessebo
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="journeys-list">
        {currentJourneys.length === 0 && !loading ? (
          <div className="no-data">Inga kommande resor hittades.</div>
        ) : (
          currentJourneys.map((journey) => (
            <TrainTimeline key={journey.id} journey={journey} />
          ))
        )}
      </div>
    </div>
  );
}

export default App;
