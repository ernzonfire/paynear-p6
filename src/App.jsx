import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { io } from "socket.io-client";
import "leaflet/dist/leaflet.css";
import { api, socketOrigin } from "./api.js";

const METHODS = ["GCash", "Maya", "BPI", "BDO", "UnionBank", "Card", "Cash", "Bank Transfer"];
const CATEGORIES = ["All", "Cafe", "Restaurant", "Grocery", "Pharmacy", "Convenience Store"];

const initialFilters = { query: "", method: "GCash", radiusKm: 5, openNow: false, minRating: 0, latitude: "", longitude: "" };
const initialListing = { name: "", category: "Cafe", address: "", acceptedPaymentMethods: ["GCash", "Cash"], openNow: true, verificationStatus: "pending" };

const PAYMENT_BRANDS = {
  GCash: { mark: "G", className: "gcash", logoSrc: "https://commons.wikimedia.org/wiki/Special:FilePath/GCash_logo.svg" },
  Maya: { mark: "M", className: "maya", logoSrc: "https://commons.wikimedia.org/wiki/Special:FilePath/Maya_logo.svg" },
  BPI: { mark: "BPI", className: "bpi", logoSrc: "https://commons.wikimedia.org/wiki/Special:FilePath/Official_BPI_Logo.svg" },
  BDO: { mark: "BDO", className: "bdo", logoSrc: "https://commons.wikimedia.org/wiki/Special:FilePath/BDO_Unibank_(logo).svg" },
  UnionBank: { mark: "UB", className: "unionbank", logoSrc: "https://commons.wikimedia.org/wiki/Special:FilePath/Unionbanklogo.png" },
  Card: { mark: "CARD", className: "card" },
  Cash: { mark: "$", className: "cash" },
  "Bank Transfer": { mark: "BANK", className: "bank" },
};

function PaymentLogo({ method, compact = false }) {
  const brand = PAYMENT_BRANDS[method] || PAYMENT_BRANDS.Card;
  return <span className={`payment-logo ${brand.className} ${brand.logoSrc ? "has-logo" : ""} ${compact ? "compact" : ""}`} title={method}>
    {brand.logoSrc ? <img className="payment-brand-logo" src={brand.logoSrc} alt="" /> : <b>{brand.mark}</b>}
    {!compact && <span>{method}</span>}
  </span>;
}

function mapIcon(method) {
  const brand = PAYMENT_BRANDS[method] || PAYMENT_BRANDS.Card;
  const mark = brand.logoSrc ? `<img src="${brand.logoSrc}" alt="" />` : brand.mark;
  return L.divIcon({ className: "paynear-marker", html: `<span class="map-payment-logo ${brand.className} ${brand.logoSrc ? "has-logo" : ""}">${mark}</span>`, iconSize: [48, 38], iconAnchor: [24, 34], popupAnchor: [0, -34] });
}

const userMapIcon = L.divIcon({ className: "paynear-marker user-marker", html: "<span></span>", iconSize: [20, 20], iconAnchor: [10, 10] });

function formatTime(value) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function MapViewport({ center }) {
  const map = useMap();
  useEffect(() => { map.flyTo(center, map.getZoom(), { animate: true, duration: .55 }); }, [center, map]);
  return null;
}

function NearbyMap({ establishments, selected, setSelected, userPosition, radiusKm, locationStatus, activeMethod, fullScreen = false }) {
  const fallbackCenter = [10.3157, 123.8854];
  const center = userPosition ? [userPosition.latitude, userPosition.longitude] : fallbackCenter;
  return <div className={`map-shell ${fullScreen ? "map-shell-fullscreen" : ""}`}>
    <MapContainer center={center} zoom={userPosition ? 14 : 13} scrollWheelZoom className="nearby-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
      <MapViewport center={center} />
      {userPosition && <><Marker position={center} icon={userMapIcon}><Popup>You are here</Popup></Marker><Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: "#007c78", fillColor: "#8bdbd3", fillOpacity: .13, weight: 2 }} /></>}
      {establishments.filter((place) => place.location?.coordinates?.length === 2).map((place) => {
        const [longitude, latitude] = place.location.coordinates;
        const markerMethod = place.acceptedPaymentMethods.includes(activeMethod) ? activeMethod : place.acceptedPaymentMethods?.[0];
        return <Marker key={place._id} position={[latitude, longitude]} icon={mapIcon(markerMethod)} eventHandlers={{ click: () => setSelected(place) }}><Popup><div className="map-popup"><strong>{place.name}</strong><span>{place.distanceKm} km - {place.category}</span><div>{place.acceptedPaymentMethods.slice(0, 3).map((method) => <PaymentLogo key={method} method={method} compact />)}</div><button onClick={() => setSelected(place)}>{selected?._id === place._id ? "Selected" : "View details"}</button></div></Popup></Marker>;
      })}
    </MapContainer>
    <div className="map-overlay"><strong>{userPosition ? `${radiusKm} km radius around you` : "Cebu City marketplace view"}</strong><span>{locationStatus || "Turn on location for an exact nearby radius."}</span></div>
  </div>;
}

function App() {
  const [filters, setFilters] = useState(initialFilters);
  const [establishments, setEstablishments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [activePage, setActivePage] = useState("discover");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [aiProvider, setAiProvider] = useState("");
  const [mapView, setMapView] = useState(true);
  const [userPosition, setUserPosition] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem("paynear-token") || "");
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("paynear-user") || "null"); } catch { return null; }
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState("");
  const [messages, setMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [chatStatus, setChatStatus] = useState("");
  const [listingForm, setListingForm] = useState(initialListing);
  const [adminMessage, setAdminMessage] = useState("");
  const socketRef = useRef(null);

  const alert = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }, []);

  const loadResults = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { establishments: results } = await api.listEstablishments(filters);
      setEstablishments(results);
      setSelected((current) => results.find((item) => item._id === current?._id) || results[0] || null);
    } catch {
      setError("The API is not available yet. Start the client and server together with npm run dev:full.");
      setEstablishments([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadResults(); }, [loadResults]);

  useEffect(() => {
    if (!token) return;
    api.me(token)
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => logout());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) { setNotifications([]); return; }
    api.notifications(token).then(({ notifications: notices }) => setNotifications(notices)).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (activePage !== "chat" || !selected || !token || !user) return undefined;
    let mounted = true;
    setChatStatus("Connecting secure chat...");
    api.messages(selected._id, token).then(({ messages: history }) => {
      if (mounted) setMessages(history);
    }).catch((requestError) => mounted && setChatStatus(requestError.message));

    const socket = io(socketOrigin, { auth: { token } });
    socketRef.current = socket;
    socket.on("connect", () => {
      socket.emit("join-establishment", { establishmentId: selected._id }, (result) => {
        if (mounted) setChatStatus(result.ok ? "Live chat connected" : result.message);
      });
    });
    socket.on("connect_error", (socketError) => mounted && setChatStatus(socketError.message || "Chat connection failed."));
    socket.on("message:new", (message) => {
      if (String(message.establishmentId) === String(selected._id)) {
        setMessages((current) => current.some((item) => item._id === message._id) ? current : [...current, message]);
      }
    });
    socket.on("notification:new", (notice) => {
      setNotifications((current) => [notice, ...current]);
      alert(notice.title);
    });

    return () => { mounted = false; socket.disconnect(); socketRef.current = null; };
  }, [activePage, alert, selected, token, user]);

  const unreadCount = notifications.filter((notice) => !notice.isRead).length;
  const favoriteIds = user?.favoriteEstablishmentIds || [];
  const savedPlaces = establishments.filter((item) => favoriteIds.includes(item._id));

  function logout() {
    localStorage.removeItem("paynear-token");
    localStorage.removeItem("paynear-user");
    setToken("");
    setUser(null);
    setNotifications([]);
    setActivePage("discover");
    alert("You are signed out.");
  }

  function storeSession(result) {
    localStorage.setItem("paynear-token", result.token);
    localStorage.setItem("paynear-user", JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
    setAuthOpen(false);
    setAuthError("");
    alert(`Welcome, ${result.user.name.split(" ")[0]}.`);
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthError("");
    try {
      const result = authMode === "register" ? await api.register(authForm) : await api.login(authForm);
      storeSession(result);
    } catch (requestError) {
      setAuthError(requestError.message);
    }
  }

  async function useDemoAdmin() {
    try {
      storeSession(await api.login({ email: "admin@paynear.demo", password: "admin123" }));
    } catch (requestError) { setAuthError(requestError.message); }
  }

  async function applyAiSuggestion(event) {
    event.preventDefault();
    if (!aiPrompt.trim()) return;
    try {
      const suggestion = await api.aiSuggest(aiPrompt);
      setFilters((current) => ({ ...current, ...suggestion.filters }));
      setAiMessage(suggestion.message);
      setAiProvider(suggestion.provider === "openai" ? "OpenAI" : "PayNear local assistant");
    } catch (requestError) { alert(requestError.message); }
  }

  function requestNearbyLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("This browser does not support location. Showing Cebu City instead.");
      setMapView(true);
      return;
    }
    setLocationStatus("Requesting your location...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { latitude: Number(coords.latitude.toFixed(6)), longitude: Number(coords.longitude.toFixed(6)) };
        setUserPosition(location);
        setFilters((current) => ({ ...current, ...location }));
        setLocationStatus("Nearby results use your device location. It is never shared with stores.");
        setMapView(true);
      },
      () => {
        setLocationStatus("Location was not shared. Showing the Cebu City marketplace view instead.");
        setMapView(true);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }

  async function toggleFavorite(id) {
    if (!token) { setAuthOpen(true); setAuthMode("login"); return; }
    try {
      const result = await api.favorite(id, token);
      setUser(result.user);
      localStorage.setItem("paynear-user", JSON.stringify(result.user));
    } catch (requestError) { alert(requestError.message); }
  }

  async function updatePreference(preferredPaymentMethod) {
    if (!token) return;
    try {
      const result = await api.preferences(preferredPaymentMethod, token);
      setUser(result.user);
      localStorage.setItem("paynear-user", JSON.stringify(result.user));
      alert("Payment preference updated.");
    } catch (requestError) { alert(requestError.message); }
  }

  async function sendGcashNotice() {
    if (!selected) return;
    if (!token) { setAuthOpen(true); setAuthMode("login"); return; }
    try {
      const { notification } = await api.gcashNotice(selected._id, token);
      setNotifications((current) => [notification, ...current]);
      alert("GCash directory notification added.");
    } catch (requestError) { alert(requestError.message); }
  }

  async function markRead(id) {
    if (!token) return;
    try {
      const { notification } = await api.readNotification(id, token);
      setNotifications((current) => current.map((item) => item._id === id ? notification : item));
    } catch (requestError) { alert(requestError.message); }
  }

  function openChat() {
    if (!token) { setAuthOpen(true); setAuthMode("login"); return; }
    setActivePage("chat");
  }

  function sendMessage(event) {
    event.preventDefault();
    const body = messageDraft.trim();
    if (!body || !socketRef.current || !selected) return;
    socketRef.current.emit("send-message", { establishmentId: selected._id, body }, (result) => {
      if (!result.ok) alert(result.message);
    });
    setMessageDraft("");
  }

  function demoStoreReply() {
    if (!socketRef.current || !selected) return;
    socketRef.current.emit("demo-store-reply", { establishmentId: selected._id }, (result) => {
      if (!result.ok) alert(result.message);
    });
  }

  async function createListing(event) {
    event.preventDefault();
    setAdminMessage("");
    try {
      const { establishment } = await api.createListing(listingForm, token);
      setAdminMessage(`${establishment.name} added as a ${establishment.verificationStatus} listing.`);
      setListingForm(initialListing);
      await loadResults();
    } catch (requestError) { setAdminMessage(requestError.message); }
  }

  async function updateListing(id, updates) {
    try {
      await api.updateListing(id, updates, token);
      await loadResults();
      setAdminMessage("Listing updated.");
    } catch (requestError) { setAdminMessage(requestError.message); }
  }

  async function uploadListingImage(id, file) {
    if (!file) return;
    try {
      await api.uploadImage(id, file, token);
      await loadResults();
      setAdminMessage("Image uploaded and linked to the listing.");
    } catch (requestError) { setAdminMessage(requestError.message); }
  }

  function selectPage(page) {
    setActivePage(page);
    setShowNotifications(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => selectPage("discover")} aria-label="PayNear home"><span className="brand-dot">P</span><span>PayNear</span></button>
        <nav className="nav-links" aria-label="Primary navigation">
          <button className={activePage === "discover" ? "active" : ""} onClick={() => selectPage("discover")}>Discover</button>
          <button className={activePage === "saved" ? "active" : ""} onClick={() => selectPage("saved")}>Saved</button>
          <button className={activePage === "chat" ? "active" : ""} onClick={openChat}>Messages</button>
          {user?.role === "admin" && <button className={activePage === "admin" ? "active" : ""} onClick={() => selectPage("admin")}>Admin</button>}
        </nav>
        <div className="header-actions">
          {user && <div className="notice-wrap">
            <button className="icon-button" aria-label="Notifications" onClick={() => setShowNotifications((value) => !value)}>Notifications{unreadCount > 0 && <span className="notice-count">{unreadCount}</span>}</button>
            {showNotifications && <div className="notification-popover">
              <div className="popover-heading"><strong>Updates</strong><span>{unreadCount} unread</span></div>
              {notifications.length === 0 ? <p className="empty-note">No updates yet.</p> : notifications.slice(0, 5).map((notice) => <button key={notice._id} className={`notice-item ${notice.isRead ? "read" : ""}`} onClick={() => markRead(notice._id)}><strong>{notice.title}</strong><span>{notice.message}</span></button>)}
            </div>}
          </div>}
          {user ? <button className="profile-button" onClick={logout}><span>{user.name.slice(0, 1).toUpperCase()}</span>{user.name.split(" ")[0]}</button> : <button className="button outline" onClick={() => { setAuthMode("login"); setAuthOpen(true); }}>Sign in</button>}
        </div>
      </header>

      <main>
        {activePage === "discover" && <DiscoverPage
          filters={filters} setFilters={setFilters} aiPrompt={aiPrompt} setAiPrompt={setAiPrompt} applyAiSuggestion={applyAiSuggestion}
          aiMessage={aiMessage} aiProvider={aiProvider} establishments={establishments} selected={selected} setSelected={setSelected}
          loading={loading} error={error} favoriteIds={favoriteIds} toggleFavorite={toggleFavorite} openChat={openChat} sendGcashNotice={sendGcashNotice}
          mapView={mapView} setMapView={setMapView} userPosition={userPosition} requestNearbyLocation={requestNearbyLocation} locationStatus={locationStatus}
        />}
        {activePage === "saved" && <SavedPage user={user} savedPlaces={savedPlaces} selected={selected} setSelected={setSelected} toggleFavorite={toggleFavorite} updatePreference={updatePreference} openDiscover={() => selectPage("discover")} />}
        {activePage === "chat" && <ChatPage user={user} selected={selected} messages={messages} draft={messageDraft} setDraft={setMessageDraft} sendMessage={sendMessage} demoStoreReply={demoStoreReply} status={chatStatus} requestSignIn={() => { setAuthMode("login"); setAuthOpen(true); }} />}
        {activePage === "admin" && <AdminPage user={user} listingForm={listingForm} setListingForm={setListingForm} createListing={createListing} establishments={establishments} updateListing={updateListing} uploadListingImage={uploadListingImage} message={adminMessage} requestDemo={useDemoAdmin} />}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
      {authOpen && <AuthDialog mode={authMode} setMode={setAuthMode} form={authForm} setForm={setAuthForm} submit={submitAuth} error={authError} close={() => setAuthOpen(false)} demo={useDemoAdmin} />}
    </div>
  );
}

function DiscoverPage({ filters, setFilters, aiPrompt, setAiPrompt, applyAiSuggestion, aiMessage, aiProvider, establishments, selected, setSelected, loading, error, favoriteIds, toggleFavorite, openChat, sendGcashNotice, mapView, setMapView, userPosition, requestNearbyLocation, locationStatus }) {
  const clearFilters = () => setFilters(initialFilters);
  return <section className={`discover-map-page ${mapView ? "map-mode" : "list-mode"}`}>
    <NearbyMap establishments={establishments} selected={selected} setSelected={setSelected} userPosition={userPosition} radiusKm={filters.radiusKm} locationStatus={locationStatus} activeMethod={filters.method} fullScreen />

    <aside className="map-control-panel" aria-label="Find nearby places">
      <div className="map-panel-heading"><div><span className="eyebrow">PAYNEAR MARKETPLACE</span><h1>Find nearby</h1></div><button className="text-button" onClick={clearFilters}>Reset</button></div>
      <label className="map-input-label">Search a place or category<input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="e.g. cafe or pharmacy" /></label>
      <div className="map-filter-group"><span>Category</span><div className="chip-row">{CATEGORIES.map((category) => <button key={category} className={filters.query === category ? "chip selected" : "chip"} onClick={() => setFilters((current) => ({ ...current, query: category === "All" ? "" : category }))}>{category}</button>)}</div></div>
      <div className="map-filter-group"><span>Payment method</span><div className="payment-select">{METHODS.map((method) => <button key={method} className={filters.method === method ? "payment-choice selected" : "payment-choice"} onClick={() => setFilters((current) => ({ ...current, method }))}><PaymentLogo method={method} compact /><span>{method}</span></button>)}</div></div>
      <label className="range-label map-range"><span>Search radius <strong>{filters.radiusKm} km</strong></span><input type="range" min="1" max="10" value={filters.radiusKm} onChange={(event) => setFilters((current) => ({ ...current, radiusKm: Number(event.target.value) }))} /></label>
      <button className="location-button map-location-button" onClick={requestNearbyLocation}>{userPosition ? "Location active" : "Use my location"}</button>
      <details className="map-advanced-filters"><summary>More filters</summary><label className="switch"><input type="checkbox" checked={filters.openNow} onChange={(event) => setFilters((current) => ({ ...current, openNow: event.target.checked }))} /><span>Open now only</span></label><label>Minimum rating<select value={filters.minRating} onChange={(event) => setFilters((current) => ({ ...current, minRating: Number(event.target.value) }))}><option value="0">Any rating</option><option value="4">4.0 and up</option><option value="4.5">4.5 and up</option></select></label></details>
      <form className="map-ai-box" onSubmit={applyAiSuggestion}><span className="ai-spark">AI</span><input value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Ask: cafe with GCash, open now" /><button className="button primary" type="submit">Ask</button></form>
      {aiMessage && <div className="ai-result"><strong>{aiProvider}</strong><span>{aiMessage}</span></div>}
      {error && <div className="error-box">{error}</div>}
      <div className="map-panel-footer"><span>{loading ? "Looking around..." : `${establishments.length} places nearby`}</span><div className="view-switch"><button className={!mapView ? "active" : ""} onClick={() => setMapView(false)}>List</button><button className={mapView ? "active" : ""} onClick={() => setMapView(true)}>Map</button></div></div>
    </aside>

    {!mapView && <aside className="map-results-drawer"><div className="map-drawer-heading"><div><span className="eyebrow">RESULTS</span><h2>{loading ? "Looking around..." : `${establishments.length} places found`}</h2></div><button className="text-button" onClick={() => setMapView(true)}>Close</button></div><div className="map-results-list">{!loading && establishments.map((place) => <PlaceCard key={place._id} place={place} selected={selected?._id === place._id} onClick={() => { setSelected(place); setMapView(true); }} favorite={favoriteIds.includes(place._id)} toggleFavorite={toggleFavorite} />)}</div></aside>}
    {selected && <DetailsPanel variant="map-details-panel" selected={selected} favorite={favoriteIds.includes(selected._id)} toggleFavorite={toggleFavorite} openChat={openChat} sendGcashNotice={sendGcashNotice} />}
  </section>;
}

function PlaceCard({ place, selected, onClick, favorite, toggleFavorite }) {
  return <article className={`place-card ${selected ? "selected" : ""}`}><button className="card-main" onClick={onClick}><img src={place.imageUrl} alt={`${place.name} storefront`} /><div className="card-copy"><div className="card-topline"><span>{place.category}</span><span>{place.distanceKm} km</span></div><h3>{place.name}</h3><p>{place.address}</p><div className="card-footer"><span className="rating">Star {place.rating}</span>{place.openNow ? <span className="open">Open now</span> : <span className="closed">Closed</span>}<span className="card-payment-logos">{place.acceptedPaymentMethods.slice(0, 3).map((method) => <PaymentLogo key={method} method={method} compact />)}</span></div></div></button><button className={`favorite-button ${favorite ? "saved" : ""}`} aria-label="Save place" onClick={() => toggleFavorite(place._id)}>{favorite ? "Saved" : "Save"}</button></article>;
}

function DetailsPanel({ selected, favorite, toggleFavorite, openChat, sendGcashNotice, variant = "" }) {
  if (!selected) return <aside className={`details-panel empty ${variant}`}><p>Select a nearby place to view payment information.</p></aside>;
  return <aside className={`details-panel ${variant}`}><img className="details-image" src={selected.imageUrl} alt={`${selected.name} storefront`} /><div className="details-body"><div className="panel-heading"><span className="verify-badge">{selected.verificationStatus === "verified" ? "Verified listing" : "Pending verification"}</span><button className="text-button" onClick={() => toggleFavorite(selected._id)}>{favorite ? "Saved" : "Save"}</button></div><h2>{selected.name}</h2><p>{selected.address}</p><div className="detail-stats"><span>Star {selected.rating} ({selected.reviewCount || 0})</span><span>{selected.distanceKm} km away</span></div><div className="payment-list"><span>Accepted methods</span><div>{selected.acceptedPaymentMethods.map((method) => <PaymentLogo key={method} method={method} />)}</div></div><div className="details-actions"><button className="button primary" onClick={openChat}>Message place</button><button className="button outline" onClick={sendGcashNotice}>GCash update</button></div><p className="quiet-note">A GCash update is a demo directory notification, never a payment receipt.</p></div></aside>;
}

function SavedPage({ user, savedPlaces, selected, setSelected, toggleFavorite, updatePreference, openDiscover }) {
  if (!user) return <section className="simple-page"><span className="eyebrow">YOUR LIST</span><h1>Save places for later.</h1><p>Sign in to keep favorite places and a payment preference across sessions.</p></section>;
  return <section className="saved-page"><div className="page-heading"><span className="eyebrow">YOUR LIST</span><h1>Saved places</h1><p>Your search can start with {user.preferredPaymentMethod} when you are ready.</p></div><div className="saved-layout"><div className="saved-list">{savedPlaces.length ? savedPlaces.map((place) => <PlaceCard key={place._id} place={place} selected={selected?._id === place._id} onClick={() => setSelected(place)} favorite toggleFavorite={toggleFavorite} />) : <div className="empty-state"><h2>Nothing saved yet.</h2><p>Keep useful stores here for a faster next search.</p><button className="button primary" onClick={openDiscover}>Discover places</button></div>}</div><div className="preference-card"><span className="eyebrow">PREFERENCE</span><h2>Payment method</h2><p>Set your default for a more relevant discovery screen.</p><select className="preference-select" value={user.preferredPaymentMethod} onChange={(event) => updatePreference(event.target.value)}>{METHODS.map((method) => <option key={method}>{method}</option>)}</select></div></div></section>;
}

function ChatPage({ user, selected, messages, draft, setDraft, sendMessage, demoStoreReply, status, requestSignIn }) {
  if (!user) return <section className="simple-page"><span className="eyebrow">REAL-TIME CHAT</span><h1>Ask before you go.</h1><p>Sign in to use the protected Socket.IO chat channel with a selected establishment.</p><button className="button primary" onClick={requestSignIn}>Sign in to chat</button></section>;
  if (!selected) return <section className="simple-page"><h1>Choose an establishment first.</h1><p>Return to Discover, select a listing, then start a conversation.</p></section>;
  return <section className="chat-page"><div className="chat-card"><div className="chat-header"><img src={selected.imageUrl} alt="" /><div><span className="eyebrow">LIVE WITH SOCKET.IO</span><h1>{selected.name}</h1><p>{status}</p></div></div><div className="messages">{messages.length === 0 ? <div className="chat-empty">Start by asking whether GCash is accepted today.</div> : messages.map((message) => <div key={message._id} className={`message ${message.senderRole === "establishment" ? "from-store" : "from-user"}`}><span>{message.senderRole === "establishment" ? selected.name : "You"}</span><p>{message.body}</p><small>{formatTime(message.createdAt)}</small></div>)}</div><form className="message-form" onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength="500" placeholder="Type a message..." /><button className="button primary">Send</button></form><div className="chat-demo"><span>For reviewer demo</span><button className="text-button" onClick={demoStoreReply}>Send sample store reply</button></div></div></section>;
}

function AdminPage({ user, listingForm, setListingForm, createListing, establishments, updateListing, uploadListingImage, message, requestDemo }) {
  if (user?.role !== "admin") return <section className="simple-page"><span className="eyebrow">ADMIN AREA</span><h1>Verified listings need an admin.</h1><p>Use the demo administrator account to review the protected create, verify, edit, deactivate, and upload flows.</p><button className="button primary" onClick={requestDemo}>Use demo admin</button></section>;
  const toggleMethod = (method) => setListingForm((current) => ({ ...current, acceptedPaymentMethods: current.acceptedPaymentMethods.includes(method) ? current.acceptedPaymentMethods.filter((item) => item !== method) : [...current.acceptedPaymentMethods, method] }));
  return <section className="admin-page"><div className="page-heading"><span className="eyebrow">PROTECTED ADMIN AREA</span><h1>Verify the directory</h1><p>Add establishments, manage listing status, and upload a recognizable store or landmark image.</p></div><div className="admin-grid"><form className="listing-form" onSubmit={createListing}><h2>New establishment</h2><label>Store name<input required value={listingForm.name} onChange={(event) => setListingForm((current) => ({ ...current, name: event.target.value }))} /></label><label>Category<select value={listingForm.category} onChange={(event) => setListingForm((current) => ({ ...current, category: event.target.value }))}>{CATEGORIES.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label><label>Address<input required value={listingForm.address} onChange={(event) => setListingForm((current) => ({ ...current, address: event.target.value }))} /></label><label className="switch"><input type="checkbox" checked={listingForm.openNow} onChange={(event) => setListingForm((current) => ({ ...current, openNow: event.target.checked }))} /><span>Open now</span></label><div className="choice-group"><span>Accepted payment methods</span><div className="chip-row">{METHODS.map((method) => <button type="button" key={method} className={listingForm.acceptedPaymentMethods.includes(method) ? "chip selected" : "chip"} onClick={() => toggleMethod(method)}>{method}</button>)}</div></div><button className="button primary" type="submit">Create pending listing</button>{message && <p className="form-message">{message}</p>}</form><div className="admin-list"><h2>Manage listings</h2>{establishments.map((place) => <article className="admin-row" key={place._id}><img src={place.imageUrl} alt="" /><div><strong>{place.name}</strong><span>{place.category} - {place.verificationStatus}</span></div><div className="admin-row-actions"><button className="text-button" onClick={() => updateListing(place._id, { verificationStatus: place.verificationStatus === "verified" ? "pending" : "verified" })}>{place.verificationStatus === "verified" ? "Unverify" : "Verify"}</button><label className="upload-label">Upload image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadListingImage(place._id, event.target.files?.[0])} /></label><button className="text-button danger" onClick={() => updateListing(place._id, { isActive: !place.isActive })}>{place.isActive ? "Deactivate" : "Activate"}</button></div></article>)}</div></div></section>;
}

function AuthDialog({ mode, setMode, form, setForm, submit, error, close, demo }) {
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  return <div className="modal-backdrop" role="presentation"><section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" onClick={close} aria-label="Close">x</button><span className="brand-dot">P</span><h2 id="auth-title">{mode === "login" ? "Welcome back" : "Create your PayNear account"}</h2><p>{mode === "login" ? "Sign in for saved places, updates, and live chat." : "Save payment preferences and message nearby establishments."}</p><form onSubmit={submit}>{mode === "register" && <label>Name<input required value={form.name} onChange={update("name")} /></label>}<label>Email<input type="email" required value={form.email} onChange={update("email")} /></label><label>Password<input type="password" minLength="6" required value={form.password} onChange={update("password")} /></label>{error && <p className="form-error">{error}</p>}<button className="button primary full" type="submit">{mode === "login" ? "Sign in" : "Create account"}</button></form><button className="demo-button" onClick={demo}>Use demo admin account</button><p className="auth-switch">{mode === "login" ? "New here?" : "Already have an account?"} <button onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Register" : "Sign in"}</button></p></section></div>;
}

export default App;
