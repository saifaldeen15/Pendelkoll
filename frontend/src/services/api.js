import axios from 'axios';
import { set, formatISO, startOfDay, endOfDay } from 'date-fns';

const API_KEY = "b6565dadae6b48999f016edb0f5ebff2";

const STATION_NAMES = {
    "Mc": "Malmö C", "Lu": "Lund C", "Hm": "Hässleholm", "Av": "Alvesta", 
    "Vö": "Växjö", "Lo": "Lessebo", "Em": "Emmaboda", "Nyb": "Nybro", 
    "Kac": "Kalmar C", "Ck": "Karlskrona C", "Rnb": "Ronneby"
};

const RELEVANT_STATIONS = ["Mc", "Lu", "Hm", "Av", "Vö", "Lo", "Em", "Nyb", "Kac", "Ck", "Rnb"];

export const fetchTrainData = async () => {
    const url = "https://api.trafikinfo.trafikverket.se/v2/data.json";
    const now = new Date();
    const startTime = startOfDay(now);
    const endTime = endOfDay(now);

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
        return processJourneys(result);
    } catch (error) {
        console.error("Error fetching data:", error);
        throw error;
    }
};

const processJourneys = (rawData) => {
    const trains = {};
    rawData.forEach(entry => {
        const nr = entry.AdvertisedTrainIdent;
        if (!trains[nr]) trains[nr] = { train_id: nr, stops: {} };
        const station = entry.LocationSignature;
        if (!trains[nr].stops[station] || entry.ActivityType === "Avgang") {
            trains[nr].stops[station] = {
                station_code: station,
                station_name: STATION_NAMES[station] || station,
                advertised_time: entry.AdvertisedTimeAtLocation,
                actual_time: entry.TimeAtLocation || entry.EstimatedTimeAtLocation || entry.AdvertisedTimeAtLocation,
                delay: 0,
                reason: entry.Deviation?.map(d => d.Description).join(", ") || "",
                canceled: entry.Canceled || false,
                passed: !!entry.TimeAtLocation
            };
            const adv = new Date(trains[nr].stops[station].advertised_time);
            const act = new Date(trains[nr].stops[station].actual_time);
            trains[nr].stops[station].delay = Math.max(0, Math.floor((act - adv) / 60000));
        }
    });

    const trainList = Object.values(trains).map(t => ({
        ...t,
        stopsList: Object.values(t.stops).sort((a, b) => new Date(a.advertised_time) - new Date(b.advertised_time))
    }));

    const buildJourney = (from, to, changeStation = null) => {
        const journeys = [];
        trainList.forEach(t1 => {
            const startStop = t1.stops[from];
            if (!startStop) return;

            if (changeStation) {
                const changeArr = t1.stops[changeStation];
                if (!changeArr || new Date(changeArr.advertised_time) <= new Date(startStop.advertised_time)) return;

                const connections = trainList.filter(t2 => {
                    const cDep = t2.stops[changeStation];
                    const final = t2.stops[to];
                    if (!cDep || !final) return false;
                    const diff = (new Date(cDep.advertised_time) - new Date(changeArr.actual_time)) / 60000;
                    return diff >= 2 && diff <= 60 && new Date(cDep.advertised_time) < new Date(final.advertised_time);
                }).sort((a, b) => new Date(a.stops[changeStation].advertised_time) - new Date(b.stops[changeStation].advertised_time));

                if (connections.length > 0) {
                    const t2 = connections[0];
                    const finalStop = t2.stops[to];
                    const changeDep = t2.stops[changeStation];
                    journeys.push({
                        id: `${t1.train_id}-${t2.train_id}`,
                        date: formatISO(new Date(startStop.advertised_time), { representation: 'date' }),
                        fromName: STATION_NAMES[from],
                        toName: STATION_NAMES[to],
                        line: `Tåg ${t1.train_id} / ${t2.train_id}`,
                        changeAt: STATION_NAMES[changeStation],
                        // Din tidtabell
                        advDep: startStop.advertised_time,
                        advArr: finalStop.advertised_time,
                        // Verklig tid
                        actDep: startStop.actual_time,
                        actArr: finalStop.actual_time,
                        leg1: { ...t1, stops: t1.stopsList },
                        leg2: { ...t2, stops: t2.stopsList },
                        connectionRisk: (new Date(changeDep.actual_time) - new Date(changeArr.actual_time)) / 60000 < 5,
                        reason: startStop.reason || t2.stops[to].reason || ""
                    });
                }
            } else {
                const endStop = t1.stops[to];
                if (endStop && new Date(endStop.advertised_time) > new Date(startStop.advertised_time)) {
                    journeys.push({
                        id: t1.train_id,
                        date: formatISO(new Date(startStop.advertised_time), { representation: 'date' }),
                        fromName: STATION_NAMES[from],
                        toName: STATION_NAMES[to],
                        line: `Tåg ${t1.train_id}`,
                        changeAt: "Direkt",
                        advDep: startStop.advertised_time,
                        advArr: endStop.advertised_time,
                        actDep: startStop.actual_time,
                        actArr: endStop.actual_time,
                        leg1: { ...t1, stops: t1.stopsList },
                        leg2: null,
                        connectionRisk: false,
                        reason: startStop.reason || endStop.reason || ""
                    });
                }
            }
        });
        return journeys.sort((a, b) => new Date(a.advDep) - new Date(b.advDep));
    };

    const toKarlskrona = buildJourney("Lo", "Ck", "Em");
    const back1 = buildJourney("Ck", "Lo", "Em");
    const back2 = buildJourney("Kac", "Lo");

    const allInbound = [...back1, ...back2].sort((a, b) => new Date(a.advDep) - new Date(b.advDep));

    return {
        toKarlskrona: toKarlskrona.filter(j => new Date(j.advArr) > new Date(Date.now() - 60 * 60000)),
        toLessebo: allInbound.filter(j => new Date(j.advArr) > new Date(Date.now() - 60 * 60000)),
        history: [...toKarlskrona, ...allInbound].sort((a, b) => new Date(b.advDep) - new Date(a.advDep))
    };
};
