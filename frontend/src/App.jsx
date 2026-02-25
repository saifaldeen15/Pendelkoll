import { useState, useEffect, useCallback, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { fetchTrainData } from './services/api';
import TrainTimeline from './TrainTimeline';

import './App.css';
import './index.css';

function App() {
  const [data, setData] = useState({ toKarlskrona: [], toLessebo: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeTab, setActiveTab] = useState('outbound'); 
  const notifiedIds = useRef(new Set());

  const fetchTrains = useCallback(async () => {
    try {
      const result = await fetchTrainData();
      setData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error("Error fetching train data:", err);
      setError("Misslyckades att hämta tågdata.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrains();
    const intervalId = setInterval(fetchTrains, 30000);
    return () => clearInterval(intervalId);
  }, [fetchTrains]);

  const renderHistoryTable = () => (
    <div className="history-container">
      <div className="table-wrapper">
        <table className="history-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Rutt</th>
              <th>Tabelltid</th>
              <th>Verklig tid</th>
              <th>Diff</th>
              <th>Anledning</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((j) => {
              const depTime = parseISO(j.departureTime);
              const leg1LastStop = j.leg1.stops[j.leg1.stops.length - 1];
              const totalDelay = leg1LastStop.delay;
              
              return (
                <tr key={j.id} className={totalDelay > 5 ? 'row-delayed' : ''}>
                  <td>{format(depTime, 'dd MMM')}</td>
                  <td>{j.fromName} → {j.toName}</td>
                  <td>{format(depTime, 'HH:mm')}</td>
                  <td className={totalDelay > 0 ? 'late' : ''}>
                    {format(parseISO(j.leg1.stops[0].actual_time), 'HH:mm')}
                  </td>
                  <td>{totalDelay > 0 ? `+${totalDelay} min` : 'I tid'}</td>
                  <td className="reason-cell" title={j.reason}>{j.reason || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

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
        <button className={activeTab === 'outbound' ? 'active' : ''} onClick={() => setActiveTab('outbound')}>Jobb</button>
        <button className={activeTab === 'inbound' ? 'active' : ''} onClick={() => setActiveTab('inbound')}>Hem</button>
        <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>Historik</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="content-area">
        {activeTab === 'history' ? (
          renderHistoryTable()
        ) : (
          <div className="journeys-list">
            {(activeTab === 'outbound' ? data.toKarlskrona : data.toLessebo).map((journey) => (
              <TrainTimeline key={journey.id} journey={journey} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
