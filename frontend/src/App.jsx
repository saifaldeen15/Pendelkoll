import { useState, useEffect, useCallback } from 'react';
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

  const fetchTrains = useCallback(async () => {
    try {
      const result = await fetchTrainData();
      setData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
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
              <th>Från hållplats</th>
              <th>Till hållplats</th>
              <th>Avgång (Tabell)</th>
              <th>Ankomst (Tabell)</th>
              <th>Linje</th>
              <th>Byte vid</th>
              <th>Avgång (Verklig)</th>
              <th>Ankomst (Verklig)</th>
              <th>Vad gick fel?</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((j) => {
              const diff = Math.floor((new Date(j.actArr) - new Date(j.advArr)) / 60000);
              return (
                <tr key={j.id} className={diff > 15 ? 'row-delayed-critical' : diff > 0 ? 'row-delayed' : ''}>
                  <td>{j.date}</td>
                  <td>{j.fromName}</td>
                  <td>{j.toName}</td>
                  <td>{format(parseISO(j.advDep), 'HH:mm')}</td>
                  <td>{format(parseISO(j.advArr), 'HH:mm')}</td>
                  <td>{j.line}</td>
                  <td>{j.changeAt}</td>
                  <td className={new Date(j.actDep) > new Date(j.advDep) ? 'late' : ''}>
                    {format(parseISO(j.actDep), 'HH:mm')}
                  </td>
                  <td className={new Date(j.actArr) > new Date(j.advArr) ? 'late' : ''}>
                    {format(parseISO(j.actArr), 'HH:mm')}
                  </td>
                  <td className="reason-cell">{j.reason || (diff > 0 ? `Försenat ${diff} min` : '-')}</td>
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
