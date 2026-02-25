import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { fetchTrainData } from './services/api';
import TrainTimeline from './TrainTimeline';

import './App.css';
import './index.css';

function App() {
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const notifiedIds = useRef(new Set());

  const sendNotification = (title, body) => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/vite.svg' });
    }
  };

  const checkNotifications = useCallback((newJourneys) => {
    newJourneys.forEach(j => {
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
      setError(null);
      const data = await fetchTrainData();
      setJourneys(data);
      checkNotifications(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error fetching train data:", err);
      setError("Misslyckades att hämta tågdata. Kontrollera din anslutning.");
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

  if (loading && journeys.length === 0) {
    return (
      <div className="container">
        <div className="loading-spinner">Laddar tågdata...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <h1>Pendelkoll</h1>
        <div className="status-bar">
          <p className="last-updated">Uppdaterad: {format(lastUpdated, 'HH:mm:ss')}</p>
          {loading && <span className="refreshing">Uppdaterar...</span>}
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      {journeys.length === 0 ? (
        <div className="no-data">Inga kommande resor hittades just nu.</div>
      ) : (
        <div className="journeys-list">
          {journeys.map((journey) => (
            <TrainTimeline key={journey.id} journey={journey} />
          ))}
        </div>
      )}
    </div>
  );
}

export default App;