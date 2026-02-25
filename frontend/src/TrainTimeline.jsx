import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { TrainFront, Clock, AlertTriangle, ChevronDown, CheckCircle, ArrowRight, Calendar } from 'lucide-react'; 
import './TrainTimeline.css';

const TrainTimeline = ({ journey }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { leg1, leg2, connectionRisk, connectionWarning, reason, advDep, advArr, actDep, actArr } = journey;
    
    const diff = Math.floor((new Date(actArr) - new Date(advArr)) / 60000);
    
    let statusClass = 'green';
    if (connectionRisk || diff > 15) statusClass = 'red';
    else if (diff > 0) statusClass = 'yellow';

    return (
        <div className={`journey-card status-${statusClass} ${isOpen ? 'expanded' : ''}`}>
            <div className="journey-header" onClick={() => setIsOpen(!isOpen)}>
                <div className="journey-main-info">
                    <div className="journey-date">
                        <Calendar size={12} /> {journey.date}
                    </div>
                    <div className="journey-time-row">
                        <span className="time big">{format(parseISO(advDep), 'HH:mm')}</span>
                        <ArrowRight size={16} />
                        <span className="time big">{format(parseISO(advArr), 'HH:mm')}</span>
                    </div>
                    <div className="journey-route-label">
                        {journey.fromName} &rarr; {journey.toName}
                    </div>
                </div>

                <div className="journey-status-area">
                    {connectionRisk && <AlertTriangle className="warning-icon" size={20} />}
                    <div className={`status-badge ${statusClass}`}>
                        {diff > 0 ? `+${diff} min` : 'I tid'}
                    </div>
                    <ChevronDown size={20} className={`chevron ${isOpen ? 'rotated' : ''}`} />
                </div>
            </div>

            {reason && <div className="delay-reason-box"><strong>Orsak:</strong> {reason}</div>}

            {connectionRisk && (
                <div className="connection-warning">
                    <AlertTriangle size={16} /> {connectionWarning}
                </div>
            )}

            <div className={`journey-details ${isOpen ? 'open' : ''}`}>
                <section className="leg-section">
                    <h4>{journey.leg1.train_id} ({journey.fromName} start)</h4>
                    <div className="timeline-v">
                        {leg1.stops.map((stop, idx) => (
                            <StopRow key={idx} stop={stop} isCurrent={stop.station_code === leg1.current_position} />
                        ))}
                    </div>
                </section>

                {leg2 ? (
                    <section className="leg-section">
                        <h4>{leg2.train_id} (Anslutning)</h4>
                        <div className="timeline-v">
                            {leg2.stops.map((stop, idx) => (
                                <StopRow key={idx} stop={stop} isCurrent={stop.station_code === leg2.current_position} />
                            ))}
                        </div>
                    </section>
                ) : (
                    <div className="direct-info">Direktresa (inget byte)</div>
                )}
            </div>
        </div>
    );
};

const StopRow = ({ stop, isCurrent }) => {
    const isDelayed = stop.delay > 0;
    return (
        <div className={`stop-row ${stop.passed ? 'passed' : ''} ${isCurrent ? 'current' : ''} ${stop.canceled ? 'canceled' : ''}`}>
            <div className="stop-marker">
                <div className="dot"></div>
                <div className="line"></div>
            </div>
            <div className="stop-info">
                <span className="stop-name">{stop.station_name}</span>
                <div className="stop-times">
                    {isDelayed && <span className="old-time">{format(parseISO(stop.advertised_time), 'HH:mm')}</span>}
                    <span className={`time ${isDelayed ? 'delayed' : ''}`}>
                        {format(parseISO(stop.actual_time), 'HH:mm')}
                    </span>
                </div>
            </div>
            {isCurrent && <div className="current-label">Här nu</div>}
        </div>
    );
};

export default TrainTimeline;
