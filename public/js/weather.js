const { useState, useCallback, useEffect } = React;
const { HashRouter, Route, Switch, useHistory, useParams } = ReactRouterDOM;

function wmoInfo(code, isDay = true) {
    const map = {
        0:  { icon: isDay ? '☀️' : '🌙', desc: 'Clear sky' },
        1:  { icon: isDay ? '🌤️' : '🌙', desc: 'Mainly clear' },
        2:  { icon: '⛅', desc: 'Partly cloudy' },
        3:  { icon: '☁️', desc: 'Overcast' },
        45: { icon: '🌫️', desc: 'Fog' },
        48: { icon: '🌫️', desc: 'Icy fog' },
        51: { icon: '🌦️', desc: 'Light drizzle' },
        53: { icon: '🌧️', desc: 'Drizzle' },
        55: { icon: '🌧️', desc: 'Heavy drizzle' },
        61: { icon: '🌧️', desc: 'Light rain' },
        63: { icon: '🌧️', desc: 'Rain' },
        65: { icon: '🌧️', desc: 'Heavy rain' },
        71: { icon: '🌨️', desc: 'Light snow' },
        73: { icon: '❄️', desc: 'Snow' },
        75: { icon: '❄️', desc: 'Heavy snow' },
        77: { icon: '🌨️', desc: 'Snow grains' },
        80: { icon: '🌦️', desc: 'Rain showers' },
        81: { icon: '🌧️', desc: 'Showers' },
        82: { icon: '⛈️', desc: 'Heavy showers' },
        85: { icon: '🌨️', desc: 'Snow showers' },
        86: { icon: '❄️', desc: 'Heavy snow showers' },
        95: { icon: '⛈️', desc: 'Thunderstorm' },
        96: { icon: '⛈️', desc: 'Thunderstorm + hail' },
        99: { icon: '⛈️', desc: 'Thunderstorm + heavy hail' },
    };
    return map[code] ?? { icon: '🌡️', desc: `Code ${code}` };
}

function fmtDay(date)       { return new Date(date).toLocaleDateString('en-US', { weekday: 'short' }); }
function fmtShortDate(date) { return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmtHour(isoStr)    { return new Date(isoStr).toLocaleTimeString('en-US', { hour: '2-digit', hour12: false }); }

function windDir(deg) {
    return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg / 45) % 8];
}

async function geocodeCity(cityName) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error('Geocoding service unavailable');
    const data = await res.json();
    if (!data.length) throw new Error(`Location "${cityName}" not found`);
    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name.split(',').slice(0, 2).join(', ')
    };
}

async function reverseGeocode(lat, lon) {
    const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
        { headers: { 'Accept-Language': 'en' } }
    );
    const geo = await res.json();
    const parts = [
        geo.address?.city || geo.address?.town || geo.address?.village || geo.address?.county,
        geo.address?.country
    ].filter(Boolean);
    return parts.join(', ') || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

async function fetchWeather(lat, lon) {
    const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current:  'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day,precipitation',
        hourly:   'temperature_2m,weather_code,precipitation_probability',
        daily:    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset',
        wind_speed_unit: 'kmh',
        forecast_days: 7,
        timezone: 'auto',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.reason || 'Unknown weather API error');
    return data;
}

function LoadingState() {
    return (
        <div className="loading-overlay">
            <div className="loading-dots"><span/><span/><span/></div>
            <div className="loading-text">Fetching intelligence report...</div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="empty-state">
            <div className="empty-icon">🗺️</div>
            <div>Enter a city name above to receive weather intelligence</div>
        </div>
    );
}

function CurrentWeather({ current, daily, city }) {
    const info = wmoInfo(current.weather_code, current.is_day);
    const dateStr = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    return (
        <div className="current-section">
            <div className="current-icon">{info.icon}</div>
            <div className="current-info">
                <div className="current-city">{city}</div>
                <div className="current-date">{dateStr}</div>
                <div className="current-temp">{Math.round(current.temperature_2m)}°C</div>
                <div className="current-desc">{info.desc}</div>
                <div className="current-details">
                    <div className="detail-item">Feels <strong>{Math.round(current.apparent_temperature)}°C</strong></div>
                    <div className="detail-item">Humidity <strong>{current.relative_humidity_2m}%</strong></div>
                    <div className="detail-item">Wind <strong>{Math.round(current.wind_speed_10m)} km/h {windDir(current.wind_direction_10m)}</strong></div>
                    <div className="detail-item">Precip <strong>{current.precipitation} mm</strong></div>
                    {daily && <>
                        <div className="detail-item">High <strong>{Math.round(daily.temperature_2m_max[0])}°C</strong></div>
                        <div className="detail-item">Low <strong>{Math.round(daily.temperature_2m_min[0])}°C</strong></div>
                        <div className="detail-item">Sunrise <strong>{daily.sunrise[0].split('T')[1]}</strong></div>
                        <div className="detail-item">Sunset <strong>{daily.sunset[0].split('T')[1]}</strong></div>
                    </>}
                </div>
            </div>
        </div>
    );
}

function ForecastGrid({ daily }) {
    return (
        <div className="forecast-section">
            <div className="forecast-title">7-Day Operational Forecast</div>
            <div className="forecast-grid">
                {daily.time.map((date, i) => {
                    const info = wmoInfo(daily.weather_code[i]);
                    return (
                        <div className="forecast-card" key={date}>
                            <div className="fc-day">{i === 0 ? 'Today' : fmtDay(date)}</div>
                            <div className="fc-date">{fmtShortDate(date)}</div>
                            <div className="fc-icon">{info.icon}</div>
                            <div className="fc-hi">{Math.round(daily.temperature_2m_max[i])}°</div>
                            <div className="fc-lo">{Math.round(daily.temperature_2m_min[i])}°</div>
                            {daily.precipitation_sum[i] > 0 &&
                                <div className="fc-rain">💧 {daily.precipitation_sum[i].toFixed(1)}mm</div>
                            }
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function HourlyScroll({ hourly }) {
    const now = new Date();
    const startIdx = hourly.time.findIndex(t => new Date(t) >= now);
    if (startIdx === -1) return null;

    const slice = hourly.time.slice(startIdx, startIdx + 24);
    const temps = hourly.temperature_2m.slice(startIdx, startIdx + 24);
    const codes = hourly.weather_code.slice(startIdx, startIdx + 24);
    const prec  = hourly.precipitation_probability.slice(startIdx, startIdx + 24);

    const minT  = Math.min(...temps);
    const range = (Math.max(...temps) - minT) || 1;

    return (
        <div className="hourly-section">
            <div className="forecast-title" style={{ paddingTop: 14 }}>Hourly Conditions (Next 24h)</div>
            <div className="hourly-scroll">
                {slice.map((t, i) => {
                    const info  = wmoInfo(codes[i]);
                    const barH  = Math.round(((temps[i] - minT) / range) * 36 + 4);
                    return (
                        <div className="hourly-item" key={t}>
                            <div className="h-time">{fmtHour(t)}</div>
                            <div className="h-icon">{info.icon}</div>
                            <div className="h-temp">{Math.round(temps[i])}°</div>
                            <div className="h-bar-wrap">
                                <div className="h-bar" style={{ height: barH + 'px' }} />
                            </div>
                            {prec[i] > 0 && <div style={{ fontSize: 9, color: '#4a6a8a', marginTop: 2 }}>{prec[i]}%</div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function SearchBar() {
    const [inputVal, setInputVal] = useState('');
    const [geoLoading, setGeoLoading] = useState(false);
    const [geoError,   setGeoError]   = useState(null);
    const history = useHistory();

    const handleSearch = () => {
        const q = inputVal.trim();
        if (!q) return;
        history.push(`/city/${encodeURIComponent(q)}`);
    };

    const handleGeo = () => {
        if (!navigator.geolocation) { setGeoError('Geolocation is not supported by your browser.'); return; }
        setGeoLoading(true);
        setGeoError(null);
        navigator.geolocation.getCurrentPosition(
            ({ coords: { latitude: lat, longitude: lon } }) => {
                setGeoLoading(false);
                history.push(`/geo/${lat.toFixed(5)}/${lon.toFixed(5)}`);
            },
            (err) => { setGeoError(`Geolocation denied: ${err.message}`); setGeoLoading(false); },
            { timeout: 10000 }
        );
    };

    return (
        <>
            <div className="search-row">
                <label>Location:</label>
                <input
                    type="text"
                    placeholder="Enter city name..."
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                    disabled={geoLoading}
                />
                <button className="mil-btn" onClick={handleSearch} disabled={geoLoading || !inputVal.trim()}>
                    Analyse
                </button>
                <button className="geo-btn" onClick={handleGeo} disabled={geoLoading} title="Use my location">
                    {geoLoading ? '…' : '📍'}
                </button>
            </div>
            {geoError && <div className="error-banner">⚠ {geoError}</div>}
        </>
    );
}

function CityWeatherPage() {
    const { cityName } = useParams();
    const [loading, setLoading] = useState(true);
    const [weather, setWeather] = useState(null);
    const [city,    setCity]    = useState('');
    const [error,   setError]   = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setWeather(null); setError(null);

        geocodeCity(decodeURIComponent(cityName))
            .then(({ lat, lon, displayName }) =>
                fetchWeather(lat, lon).then(data => ({ data, displayName }))
            )
            .then(({ data, displayName }) => {
                if (cancelled) return;
                setWeather(data);
                setCity(displayName);
                setLoading(false);
            })
            .catch(e => {
                if (cancelled) return;
                setError(e.message);
                setLoading(false);
            });

        return () => { cancelled = true; };
    }, [cityName]);

    if (loading) return <LoadingState />;
    if (error)   return <div className="error-banner">⚠ {error}</div>;
    return <>
        <CurrentWeather current={weather.current} daily={weather.daily} city={city} />
        <HourlyScroll hourly={weather.hourly} />
        <ForecastGrid daily={weather.daily} />
    </>;
}

function GeoWeatherPage() {
    const { lat, lon } = useParams();
    const [loading, setLoading] = useState(true);
    const [weather, setWeather] = useState(null);
    const [city,    setCity]    = useState('');
    const [error,   setError]   = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setWeather(null); setError(null);

        const la = parseFloat(lat), lo = parseFloat(lon);
        Promise.all([fetchWeather(la, lo), reverseGeocode(la, lo)])
            .then(([data, name]) => {
                if (cancelled) return;
                setWeather(data);
                setCity(name);
                setLoading(false);
            })
            .catch(e => {
                if (cancelled) return;
                setError(e.message);
                setLoading(false);
            });

        return () => { cancelled = true; };
    }, [lat, lon]);

    if (loading) return <LoadingState />;
    if (error)   return <div className="error-banner">⚠ {error}</div>;
    return <>
        <CurrentWeather current={weather.current} daily={weather.daily} city={city} />
        <HourlyScroll hourly={weather.hourly} />
        <ForecastGrid daily={weather.daily} />
    </>;
}

function WeatherApp() {
    return (
        <HashRouter>
            <SearchBar />
            <Switch>
                <Route exact path="/" component={EmptyState} />
                <Route path="/city/:cityName" component={CityWeatherPage} />
                <Route path="/geo/:lat/:lon"  component={GeoWeatherPage} />
            </Switch>
        </HashRouter>
    );
}

const root = ReactDOM.createRoot(document.getElementById('weather-client-root'));
root.render(<WeatherApp />);