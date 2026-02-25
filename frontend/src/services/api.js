import axios from 'axios';
import { set, formatISO } from 'date-fns';

const API_KEY = "b6565dadae6b48999f016edb0f5ebff2";

const STATION_NAMES = {
    "Hie": "Hyllie",
    "Mc": "Malmö C",
    "Lu": "Lund C",
    "Hm": "Hässleholm",
    "Av": "Alvesta",
    "Vö": "Växjö",
    "Lo": "Lessebo",
    "Em": "Emmaboda",
    "Nyb": "Nybro",
    "Kac": "Kalmar C",
    "Ck": "Karlskrona C",
    "Rnb": "Ronneby",
    "Bkb": "Bräkne-Hoby",
    "Khn": "Karlshamn"
};

const RELEVANT_STATIONS = ["Mc", "Lu", "Hm", "Av", "Vö", "Lo", "Em", "Nyb", "Kac", "Ck", "Rnb", "Bkb", "Khn"];

export const fetchTrainData = async () => {
    const url = "https://api.trafikinfo.trafikverket.se/v2/data.json";
    const now = new Date();
    const startTime = set(now, { hours: 4, minutes: 0, seconds: 0, milliseconds: 0 });
    const endTime = set(now, { hours: 23, minutes: 59, seconds: 0, milliseconds: 0 });

    const xmlQuery = `
    <REQUEST>
        <LOGIN authenticationkey="${API_KEY}" />
        <QUERY objecttype="TrainAnnouncement" orderby="AdvertisedTimeAtLocation" schemaversion="1.9">
            <FILTER>
                <AND>
                    <OR>
                        ${RELEVANT_STATIONS.map(s => `<EQ name="LocationSignature" value="${s}" />`).join('')}
                    </OR>
                    <GT name="AdvertisedTimeAtLocation" value="${formatISO(startTime)}" />
                    <LT name="AdvertisedTimeAtLocation" value="${formatISO(endTime)}" />
                </AND>
            </FILTER>
             <INCLUDE>AdvertisedTrainIdent</INCLUDE>
             <INCLUDE>LocationSignature</INCLUDE>
             <INCLUDE>ToLocation</INCLUDE>
             <INCLUDE>FromLocation</INCLUDE>
             <INCLUDE>ProductInformation</INCLUDE>
             <INCLUDE>AdvertisedTimeAtLocation</INCLUDE>
             <INCLUDE>TimeAtLocation</INCLUDE>
             <INCLUDE>EstimatedTimeAtLocation</INCLUDE>
             <INCLUDE>Canceled</INCLUDE>
             <INCLUDE>Deviation</INCLUDE>
             <INCLUDE>ActivityType</INCLUDE>
        </QUERY>
    </REQUEST>
    `;

    try {
        const response = await axios.post(url, xmlQuery, { headers: { 'Content-Type': 'text/xml' } });
        const result = response.data?.RESPONSE?.RESULT?.[0]?.TrainAnnouncement || [];
        return processAllJourneys(result);
    } catch (error) {
        console.error("Error fetching data:", error);
        throw error;
    }
};

const processAllJourneys = (rawData) => {
    const trains = {};
    rawData.forEach(entry => {
        const nr = entry.AdvertisedTrainIdent;
        if (!trains[nr]) {
            trains[nr] = {
                train_id: nr,
                destination: entry.ToLocation?.[0]?.LocationName,
                stops: {}
            };
        }
        const stationCode = entry.LocationSignature;
        const stop_data = {
            station_code: stationCode,
            station_name: STATION_NAMES[stationCode] || stationCode,
            advertised_time: entry.AdvertisedTimeAtLocation,
            actual_time: entry.TimeAtLocation || entry.EstimatedTimeAtLocation,
            delay: 0,
            passed: !!entry.TimeAtLocation,
            canceled: entry.Canceled || false,
            deviations: entry.Deviation || []
        };
        
        if (stop_data.actual_time) {
            const adv = new Date(stop_data.advertised_time);
            const act = new Date(stop_data.actual_time);
            stop_data.delay = Math.max(0, Math.floor((act - adv) / 60000));
        }

        if (!trains[nr].stops[stationCode] || entry.ActivityType === "Avgang") {
            trains[nr].stops[stationCode] = stop_data;
        }
    });

    const trainList = Object.values(trains).map(t => ({
        ...t,
        stops: Object.values(t.stops).sort((a, b) => new Date(a.advertised_time) - new Date(b.advertised_time))
    }));

    const outbound = findConnections(trainList, "Lo", "Em", "Ck"); // Lessebo -> Karlskrona
    const inbound = findConnections(trainList, "Ck", "Em", "Lo");  // Karlskrona -> Lessebo
    const fromKalmar = findDirect(trainList, "Kac", "Lo");         // Kalmar -> Lessebo (Direkt)

    return {
        toKarlskrona: outbound,
        toLessebo: [...inbound, ...fromKalmar].sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime))
    };
};

const findDirect = (trains, from, to) => {
    const journeys = [];
    trains.forEach(t => {
        const start = t.stops.find(s => s.station_code === from);
        const end = t.stops.find(s => s.station_code === to);
        if (start && end && new Date(start.advertised_time) < new Date(end.advertised_time)) {
            journeys.push({
                id: t.train_id,
                departureTime: start.advertised_time,
                direction: "inbound",
                leg1: { ...t, stops: t.stops.filter(s => [from, "Em", to].includes(s.station_code)) },
                leg2: null,
                connectionRisk: false
            });
        }
    });
    return journeys;
};

const findConnections = (trains, from, change, to) => {
    const leg1Trains = trains.filter(t => {
        const s1 = t.stops.find(s => s.station_code === from);
        const s2 = t.stops.find(s => s.station_code === change);
        return s1 && s2 && new Date(s1.advertised_time) < new Date(s2.advertised_time);
    });

    const leg2Trains = trains.filter(t => {
        const s1 = t.stops.find(s => s.station_code === change);
        const s2 = t.stops.find(s => s.station_code === to);
        return s1 && s2 && new Date(s1.advertised_time) < new Date(s2.advertised_time);
    });

    const journeys = [];
    leg1Trains.forEach(l1 => {
        const depFromStart = l1.stops.find(s => s.station_code === from);
        const arrAtChange = l1.stops.find(s => s.station_code === change);
        const l1ArrTime = new Date(arrAtChange.actual_time || arrAtChange.advertised_time);

        const connections = leg2Trains.filter(l2 => {
            const depFromChange = l2.stops.find(s => s.station_code === change);
            const l2DepTime = new Date(depFromChange.advertised_time);
            const diff = (l2DepTime - l1ArrTime) / 60000;
            return diff >= 0 && diff <= 120;
        }).sort((a, b) => new Date(a.stops.find(s => s.station_code === change).advertised_time) - new Date(b.stops.find(s => s.station_code === change).advertised_time));

        const l2 = connections[0] || null;
        let connectionRisk = false;
        let connectionWarning = "";

        if (l2) {
            const depFromChange = l2.stops.find(s => s.station_code === change);
            const l2DepTime = new Date(depFromChange.actual_time || depFromChange.advertised_time);
            const marginal = Math.floor((l2DepTime - l1ArrTime) / 60000);
            if (marginal < 5) {
                connectionRisk = true;
                connectionWarning = `Risk för missat byte i ${STATION_NAMES[change]}! ${marginal} min marginal.`;
            }
        }

        journeys.push({
            id: l1.train_id,
            departureTime: depFromStart.advertised_time,
            leg1: l1,
            leg2: l2,
            connectionRisk,
            connectionWarning
        });
    });
    return journeys;
};
