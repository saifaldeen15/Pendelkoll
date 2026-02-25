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

// Relevanta stationer längs med rutten för tidig varning (före Lessebo)
const RELEVANT_STATIONS_LEG1 = ["Mc", "Lu", "Hm", "Av", "Vö", "Lo", "Em"]; // Öresundståg
const RELEVANT_STATIONS_LEG2 = ["Em", "Rnb", "Bkb", "Khn", "Ck"]; // Krösatåg

export const fetchTrainData = async () => {
    const url = "https://api.trafikinfo.trafikverket.se/v2/data.json";

    // Tidsfönster: Idag 04:00 till 23:00
    const now = new Date();
    const startTime = set(now, { hours: 4, minutes: 0, seconds: 0, milliseconds: 0 });
    const endTime = set(now, { hours: 23, minutes: 0, seconds: 0, milliseconds: 0 });

    const xmlQuery = `
    <REQUEST>
        <LOGIN authenticationkey="${API_KEY}" />
        <QUERY objecttype="TrainAnnouncement" orderby="AdvertisedTimeAtLocation" schemaversion="1.9">
            <FILTER>
                <AND>
                    <OR>
                        <EQ name="ToLocation.LocationName" value="Kac" />
                        <EQ name="ToLocation.LocationName" value="Ck" />
                        <EQ name="ToLocation.LocationName" value="Em" />
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
        const response = await axios.post(url, xmlQuery, {
            headers: { 'Content-Type': 'text/xml' }
        });

        const result = response.data?.RESPONSE?.RESULT?.[0]?.TrainAnnouncement || [];
        return processTrainData(result);
    } catch (error) {
        console.error("Error fetching data:", error);
        throw error;
    }
};

const processTrainData = (rawData) => {
    const trains = {};

    rawData.forEach(entry => {
        const nr = entry.AdvertisedTrainIdent;

        if (!trains[nr]) {
            trains[nr] = {
                train_id: nr,
                destination: entry.ToLocation?.[0]?.LocationName,
                from: entry.FromLocation?.[0]?.LocationName,
                stops: { }
            };
        }

        const adv_time_str = entry.AdvertisedTimeAtLocation;
        const act_time_str = entry.TimeAtLocation || entry.EstimatedTimeAtLocation;

        let status = "green";
        let delay_min = 0;

        if (act_time_str) {
            const adv_time = new Date(adv_time_str);
            const act_time = new Date(act_time_str);
            delay_min = Math.max(0, Math.floor((act_time - adv_time) / 60000));

            if (delay_min > 5) {
                status = "red";
            } else if (delay_min > 0) {
                status = "yellow";
            }
        }

        const passed = !!entry.TimeAtLocation;
        const stationCode = entry.LocationSignature;

        const stop_data = {
            station_code: stationCode,
            station_name: STATION_NAMES[stationCode] || stationCode,
            advertised_time: adv_time_str,
            actual_time: act_time_str,
            delay: delay_min,
            status: status,
            passed: passed,
            canceled: entry.Canceled || false,
            deviations: entry.Deviation || [],
            activityType: entry.ActivityType
        };

        if (!trains[nr].stops[stationCode]) {
            trains[nr].stops[stationCode] = stop_data;
        } else if (entry.ActivityType === "Avgang") {
            trains[nr].stops[stationCode] = stop_data;
        }
    });

    const trainList = Object.values(trains).map(t => ({
        ...t,
        stops: Object.values(t.stops)
    }));

    trainList.forEach(train => {
        train.stops.sort((a, b) => new Date(a.advertised_time) - new Date(b.advertised_time));

        let last_passed = null;
        train.stops.forEach(stop => {
            if (stop.passed) {
                last_passed = stop.station_code;
            }
        });
        train.current_position = last_passed;
    });

    const leg1Trains = trainList.filter(t =>
        t.stops.some(s => s.station_code === "Lo") &&
        t.stops.some(s => s.station_code === "Em")
    );

    const leg2Trains = trainList.filter(t =>
        t.stops.some(s => s.station_code === "Em") &&
        t.stops.some(s => s.station_code === "Ck")
    );

    const journeys = [];

    leg1Trains.forEach(leg1 => {
        const depFromLo = leg1.stops.find(s => s.station_code === "Lo");
        const arrAtEm = leg1.stops.find(s => s.station_code === "Em");
        if (!depFromLo || !arrAtEm) return;

        const leg1ArrivalTime = new Date(arrAtEm.actual_time || arrAtEm.advertised_time);

        const possibleConnections = leg2Trains.filter(leg2 => {
            const depFromEm = leg2.stops.find(s => s.station_code === "Em");
            if (!depFromEm) return false;

            const leg2DepTime = new Date(depFromEm.advertised_time);
            const diffMin = (leg2DepTime - leg1ArrivalTime) / 60000;
            return diffMin >= 0 && diffMin <= 120;
        });

        possibleConnections.sort((a, b) => {
            const depA = new Date(a.stops.find(s => s.station_code === "Em").advertised_time);
            const depB = new Date(b.stops.find(s => s.station_code === "Em").advertised_time);
            return depA - depB;
        });

        let leg2 = possibleConnections.length > 0 ? possibleConnections[0] : null;

        let connectionRisk = false;
        let connectionWarning = "";

        if (leg2) {
            const depFromEm = leg2.stops.find(s => s.station_code === "Em");
            const leg2DepTime = new Date(depFromEm.actual_time || depFromEm.advertised_time);
            const actualArrival = new Date(arrAtEm.actual_time || arrAtEm.advertised_time);

            const marginalMin = Math.floor((leg2DepTime - actualArrival) / 60000);

            if (marginalMin < 5) {
                connectionRisk = true;
                connectionWarning = `Risk för missat byte i Emmaboda! Endast ${marginalMin > 0 ? marginalMin : 0} min marginal.`;
            }
        }

        const relevantStopsLeg1 = leg1.stops.filter(s => RELEVANT_STATIONS_LEG1.includes(s.station_code));

        journeys.push({
            id: leg1.train_id,
            departureTime: depFromLo.advertised_time,
            leg1: { ...leg1, stops: relevantStopsLeg1 },
            leg2: leg2 ? { ...leg2, stops: leg2.stops.filter(s => RELEVANT_STATIONS_LEG2.includes(s.station_code)) } : null,
            connectionRisk,
            connectionWarning,
        });
    });

    journeys.sort((a, b) => new Date(a.departureTime) - new Date(b.departureTime));

    const nowTime = new Date();
    const futureJourneys = journeys.filter(j => {
        const arrEm = j.leg1.stops.find(s => s.station_code === "Em");
        if (!arrEm) return false;
        return new Date(arrEm.advertised_time) > new Date(nowTime.getTime() - 60 * 60 * 1000);
    });

    return futureJourneys;
};
