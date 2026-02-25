import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { TrainFront, Clock, AlertTriangle, ChevronDown, CheckCircle, ArrowRight } from 'lucide-react'; 
import './TrainTimeline.css';

const TrainTimeline = ({ journey }) => {
    const [isOpen, setIsOpen] = useState(false);

    const { leg1, leg2, connectionRisk, connectionWarning } = journey;
    
    const lastStopLeg1 = leg1.stops[leg1.stops.length - 1];
    const delayLeg1 = lastStopLeg1 ? lastStopLeg1.delay : 0;
    const isCanceledLeg1 = leg1.stops.some(s => s.canceled);
    
    let statusClass = 'green';
    if (isCanceledLeg1 || (leg2 && leg2.stops.some(s => s.canceled))) statusClass = 'red';
    else if (connectionRisk || delayLeg1 > 10) statusClass = 'red';
    else if (delayLeg1 > 0) statusClass = 'yellow';

    const depFromStart = leg1.stops[0];
    const finalLeg = leg2 || leg1;
    const arrAtEnd = finalLeg.stops[finalLeg.stops.length - 1];

    return (
        <div className={`journey-card status-${statusClass} ${isOpen ? 'expanded' : ''}`}>
            <div className="journey-header" onClick={() => setIsOpen(!isOpen)}>
                <div className="journey-main-info">
                    <div className="journey-time-row">
                        <span className="time big">
                            {format(parseISO(depFromStart.advertised_time), 'HH:mm')}
                        </span>
                        <ArrowRight size={16} />
                        <span className="time big">
                            {format(parseISO(arrAtEnd.advertised_time), 'HH:mm')}
                        </span>
                    </div>
                    <div className="journey-route-label">
                        {depFromStart.station_name} &rarr; {arrAtEnd.station_name}
                    </div>
                </div>

                <div className="journey-status-area">
                    {connectionRisk && <AlertTriangle className="warning-icon" size={20} />}
                    <div className={`status-badge ${statusClass}`}>
                        {statusClass === 'green' ? 'I tid' : (isCanceledLeg1 ? 'Inställt' : `+${delayLeg1} min`)}
                    </div>
                    <ChevronDown size={20} className={`chevron ${isOpen ? 'rotated' : ''}`} />
                </div>
            </div>

            {connectionRisk && (
                <div className="connection-warning">
                    <AlertTriangle size={16} />
                    {connectionWarning}
                </div>
            )}

            <div className={`journey-details ${isOpen ? 'open' : ''}`}>
                <section className="leg-section">
                    <h4>Etapp 1: {leg1.train_id}</h4>
                    <div className="timeline-v">
                        {leg1.stops.map((stop, idx) => (
                            <StopRow key={idx} stop={stop} isCurrent={stop.station_code === leg1.current_position} />
                        ))}
                    </div>
                </section>

                {leg2 ? (
                    <section className="leg-section">
                        <h4>Etapp 2: {leg2.train_id}</h4>
                        <div className="timeline-v">
                            {leg2.stops.map((stop, idx) => (
                                <StopRow key={idx} stop={stop} isCurrent={stop.station_code === leg2.current_position} />
                            ))}
                        </div>
                    </section>
                ) : leg1.stops.length > 2 && (
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
                        {format(parseISO(stop.actual_time || stop.advertised_time), 'HH:mm')}
                    </span>
                </div>
            </div>
            {isCurrent && <div className="current-label">Här nu</div>}
        </div>
    );
};

export default TrainTimeline;