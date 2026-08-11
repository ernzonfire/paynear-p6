import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { io } from "socket.io-client";
import "leaflet/dist/leaflet.css";
import { api, socketOrigin } from "./api.js";
import payNearEmblem from "./assets/paynear-emblem.svg";
import instaPayLogo from "./assets/instapay-logo.svg";

const METHODS = ["GCash", "Maya", "QR Ph", "InstaPay", "BPI", "BDO", "UnionBank", "Card", "Cash", "Bank Transfer"];
const CATEGORIES = ["All", "Cafe", "Restaurant", "Grocery", "Pharmacy", "Convenience Store"];
const PAYMENT_FILTER_OPTIONS = [
  { method: "", label: "All places", detail: "No payment filter" },
  ...METHODS.map((method) => ({ method, label: method, detail: method === "QR Ph" ? "Scan to pay" : method === "InstaPay" ? "Instant transfer" : method === "Card" ? "Cards welcome" : method === "Cash" ? "Cash accepted" : "Accepted here" })),
];

const initialFilters = { query: "", method: "", radiusKm: 5, openNow: false, minRating: 0, latitude: "", longitude: "" };
const initialListing = {
  name: "",
  category: "Cafe",
  address: "",
  latitude: "",
  longitude: "",
  ownerName: "",
  ownerTitle: "Owner",
  acceptedPaymentMethods: ["GCash", "Cash"],
  openNow: true,
};

const DEMO_ACCOUNTS = {
  user: { email: "user@paynear.demo", password: "user123" },
  owner: { email: "owner@paynear.demo", password: "owner123" },
  admin: { email: "admin@paynear.demo", password: "admin123" },
};

const PAYMENT_BRANDS = {
  GCash: { mark: "G", className: "gcash", logoSrc: "https://commons.wikimedia.org/wiki/Special:FilePath/GCash_logo.svg" },
  Maya: { mark: "M", className: "maya", logoSrc: "https://commons.wikimedia.org/wiki/Special:FilePath/Maya_logo.svg" },
  "QR Ph": { mark: "QR", className: "qrph", logoSrc: "https://commons.wikimedia.org/wiki/Special:FilePath/QR_Ph_Logo.svg" },
  InstaPay: { mark: "IP", className: "instapay", logoSrc: instaPayLogo },
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
    {brand.logoSrc ? <img className="payment-brand-logo" src={brand.logoSrc} alt={`${method} logo`} /> : <b>{brand.mark}</b>}
    {!compact && <span>{method}</span>}
  </span>;
}

function PaymentPreference({ option, selected, onSelect }) {
  return <button className={`payment-preference ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={onSelect}>
    {option.method ? <PaymentLogo method={option.method} compact /> : <span className="all-payment-mark">All</span>}
    <span className="payment-preference-copy"><strong>{option.label}</strong><small>{option.detail}</small></span>
  </button>;
}

function escapeMarkerAttribute(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function storeMapIcon(place) {
  return L.divIcon({ className: "place-map-marker", html: `<img src="${escapeMarkerAttribute(place.imageUrl)}" alt="" />`, iconSize: [46, 46], iconAnchor: [23, 38], popupAnchor: [0, -38] });
}

const userMapIcon = L.divIcon({ className: "paynear-marker user-marker", html: "<span></span>", iconSize: [20, 20], iconAnchor: [10, 10] });

function formatTime(value) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function MapViewport({ center, radiusKm, liveLocation }) {
  const map = useMap();
  useEffect(() => {
    if (liveLocation) {
      const searchArea = L.latLng(center[0], center[1]).toBounds(radiusKm * 2000);
      const mapPadding = window.innerWidth > 720 ? { paddingTopLeft: [390, 70], paddingBottomRight: [70, 70] } : { padding: [24, 90] };
      map.fitBounds(searchArea, { animate: true, duration: .55, maxZoom: 15, ...mapPadding });
      return;
    }
    map.flyTo(center, map.getZoom(), { animate: true, duration: .55 });
  }, [center, liveLocation, map, radiusKm]);
  return null;
}

function NearbyMap({ establishments, setSelected, userPosition, radiusKm, locationStatus, onOpenChat, fullScreen = false }) {
  const fallbackCenter = [14.64, 121.049];
  const center = userPosition ? [userPosition.latitude, userPosition.longitude] : fallbackCenter;
  return <div className={`map-shell ${fullScreen ? "map-shell-fullscreen" : ""}`}>
    <MapContainer center={center} zoom={userPosition ? 14 : 13} scrollWheelZoom className="nearby-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
      <MapViewport center={center} radiusKm={radiusKm} liveLocation={Boolean(userPosition)} />
      {userPosition && <><Marker position={center} icon={userMapIcon}><Popup>You are here</Popup></Marker><Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: "#007c78", fillColor: "#8bdbd3", fillOpacity: .2, weight: 3, opacity: .95 }}><Tooltip className="radius-tooltip" permanent direction="top" offset={[0, -16]} opacity={1}>{radiusKm} km search area</Tooltip></Circle></>}
      {establishments.filter((place) => place.location?.coordinates?.length === 2).map((place) => {
        const [longitude, latitude] = place.location.coordinates;
        return <Marker key={place._id} position={[latitude, longitude]} icon={storeMapIcon(place)} eventHandlers={{ click: () => setSelected(place) }}><Popup><div className="map-popup"><div className="map-popup-hero"><img src={place.imageUrl} alt={`${place.name} storefront`} /><div><strong>{place.name}</strong><span>{place.distanceKm} km - {place.category}</span><small>{place.ownerName || "Listing contact"}</small></div></div><div className="map-popup-payments">{place.acceptedPaymentMethods.slice(0, 3).map((method) => <PaymentLogo key={method} method={method} compact />)}</div><button onClick={() => { setSelected(place); onOpenChat(); }}>Message {(place.ownerName || place.name).split(" ")[0]}</button></div></Popup></Marker>;
      })}
    </MapContainer>
    <div className="map-overlay"><strong>{userPosition ? `${radiusKm} km radius around you` : "Metro Manila marketplace view"}</strong><span>{locationStatus || "Use live location to show your exact search radius."}</span></div>
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
  const [userPosition, setUserPosition] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem("paynear-token") || "");
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("paynear-user") || "null"); } catch { return null; }
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", role: "user" });
  const [authError, setAuthError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState("");
  const [messages, setMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [chatStatus, setChatStatus] = useState("");
  const [listingForm, setListingForm] = useState(initialListing);
  const [listingImage, setListingImage] = useState(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [ownerListings, setOwnerListings] = useState([]);
  const [adminListings, setAdminListings] = useState([]);
  const socketRef = useRef(null);
  const locationWatchRef = useRef(null);

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

  const loadOwnerListings = useCallback(async () => {
    if (!token) return;
    try {
      const { establishments: listings } = await api.ownerListings(token);
      setOwnerListings(listings);
    } catch {
      setOwnerListings([]);
    }
  }, [token]);

  const loadAdminListings = useCallback(async () => {
    if (!token) return;
    try {
      const { establishments: listings } = await api.adminListings(token);
      setAdminListings(listings);
    } catch {
      setAdminListings([]);
    }
  }, [token]);

  useEffect(() => { loadResults(); }, [loadResults]);

  useEffect(() => () => {
    if (locationWatchRef.current !== null) navigator.geolocation?.clearWatch(locationWatchRef.current);
  }, []);

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
    if (user?.role === "owner") loadOwnerListings();
    else setOwnerListings([]);
  }, [loadOwnerListings, user?.role]);

  useEffect(() => {
    if (user?.role === "admin") loadAdminListings();
    else setAdminListings([]);
  }, [loadAdminListings, user?.role]);

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
    setOwnerListings([]);
    setAdminListings([]);
    setActivePage("discover");
    alert("You are signed out.");
  }

  function storeSession(result) {
    localStorage.setItem("paynear-token", result.token);
    localStorage.setItem("paynear-user", JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
    setActivePage(result.user.role === "admin" ? "admin" : result.user.role === "owner" ? "owner" : "discover");
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

  async function signInDemoAccount(role = "admin") {
    try {
      const account = DEMO_ACCOUNTS[role];
      if (!account) throw new Error("Choose a valid demo account.");
      storeSession(await api.login(account));
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
      setLocationStatus("This browser does not support location. Showing the Metro Manila preview instead.");
      return;
    }
    if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current);
    setLocationStatus("Getting your live location...");
    locationWatchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const location = { latitude: Number(coords.latitude.toFixed(6)), longitude: Number(coords.longitude.toFixed(6)) };
        setUserPosition(location);
        setFilters((current) => ({ ...current, ...location }));
        setLocationStatus("Live location is active. Your exact location is never shared with stores.");
      },
      (positionError) => {
        locationWatchRef.current = null;
        setLocationStatus(positionError.code === positionError.PERMISSION_DENIED
          ? "Location permission was not allowed. Showing the Metro Manila preview instead."
          : "We could not get your live location. Check your device location settings and try again.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
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
    const form = event.currentTarget;
    setAdminMessage("");
    try {
      const { establishment } = await api.createListing(listingForm, token);
      if (listingImage) await api.uploadImage(establishment._id, listingImage, token);
      setAdminMessage(`${establishment.name} was submitted for administrator review.`);
      setListingForm(initialListing);
      setListingImage(null);
      form.reset();
      await loadResults();
      if (user?.role === "owner") await loadOwnerListings();
      if (user?.role === "admin") await loadAdminListings();
    } catch (requestError) { setAdminMessage(requestError.message); }
  }

  async function updateListing(id, updates) {
    try {
      await api.updateListing(id, updates, token);
      await loadResults();
      if (user?.role === "owner") await loadOwnerListings();
      if (user?.role === "admin") await loadAdminListings();
      setAdminMessage("Listing updated.");
    } catch (requestError) { setAdminMessage(requestError.message); }
  }

  async function uploadListingImage(id, file) {
    if (!file) return;
    try {
      await api.uploadImage(id, file, token);
      await loadResults();
      if (user?.role === "owner") await loadOwnerListings();
      if (user?.role === "admin") await loadAdminListings();
      setAdminMessage(user?.role === "owner" ? "Image uploaded. The listing returned to the review queue." : "Image uploaded and linked to the listing.");
    } catch (requestError) { setAdminMessage(requestError.message); }
  }

  async function reviewListing(id, action, reviewNotes = "") {
    try {
      const { establishment } = await api.reviewListing(id, { action, reviewNotes }, token);
      await Promise.all([loadAdminListings(), loadResults()]);
      setAdminMessage(action === "verify"
        ? `${establishment.name} is verified and publicly visible.`
        : `${establishment.name} was returned to the owner with review notes.`);
    } catch (requestError) { setAdminMessage(requestError.message); }
  }

  function useCurrentLocationForListing() {
    if (userPosition) {
      setListingForm((current) => ({ ...current, ...userPosition }));
      setAdminMessage("Current coordinates added. Confirm that you are at the store before submitting.");
      return;
    }
    if (!navigator.geolocation) {
      setAdminMessage("Location is not available in this browser. Enter the coordinates manually.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = { latitude: Number(coords.latitude.toFixed(6)), longitude: Number(coords.longitude.toFixed(6)) };
        setListingForm((current) => ({ ...current, ...location }));
        setAdminMessage("Current coordinates added. Confirm that you are at the store before submitting.");
      },
      () => setAdminMessage("We could not read your location. Enter the coordinates manually."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  }

  function selectPage(page) {
    setActivePage(page);
    setShowNotifications(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => selectPage("discover")} aria-label="PayNear home"><img className="brand-emblem" src={payNearEmblem} alt="" /><span className="brand-wordmark"><span className="brand-pay">Pay</span><span className="brand-near">Near</span></span></button>
        <nav className="nav-links" aria-label="Primary navigation">
          <button className={activePage === "discover" ? "active" : ""} onClick={() => selectPage("discover")}>Discover</button>
          <button className={activePage === "saved" ? "active" : ""} onClick={() => selectPage("saved")}>Saved</button>
          <button className={activePage === "chat" ? "active" : ""} onClick={openChat}>Messages</button>
          {user?.role === "owner" && <button className={activePage === "owner" ? "active" : ""} onClick={() => selectPage("owner")}>My business</button>}
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
          loading={loading} error={error} favoriteIds={favoriteIds} toggleFavorite={toggleFavorite} openChat={openChat}
          userPosition={userPosition} requestNearbyLocation={requestNearbyLocation} locationStatus={locationStatus}
        />}
        {activePage === "saved" && <SavedPage user={user} savedPlaces={savedPlaces} selected={selected} setSelected={setSelected} toggleFavorite={toggleFavorite} updatePreference={updatePreference} openDiscover={() => selectPage("discover")} />}
        {activePage === "chat" && <ChatPage user={user} selected={selected} messages={messages} draft={messageDraft} setDraft={setMessageDraft} sendMessage={sendMessage} demoStoreReply={demoStoreReply} status={chatStatus} requestSignIn={() => { setAuthMode("login"); setAuthOpen(true); }} />}
        {activePage === "owner" && <OwnerPage
          user={user} listingForm={listingForm} setListingForm={setListingForm} createListing={createListing}
          listingImage={listingImage} setListingImage={setListingImage} useCurrentLocation={useCurrentLocationForListing}
          listings={ownerListings} updateListing={updateListing} uploadListingImage={uploadListingImage} message={adminMessage}
        />}
        {activePage === "admin" && <AdminPage
          user={user} listingForm={listingForm} setListingForm={setListingForm} createListing={createListing}
          listingImage={listingImage} setListingImage={setListingImage} useCurrentLocation={useCurrentLocationForListing}
          listings={adminListings} updateListing={updateListing} uploadListingImage={uploadListingImage}
          reviewListing={reviewListing} message={adminMessage} requestDemo={() => signInDemoAccount("admin")}
        />}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
      {authOpen && <AuthDialog mode={authMode} setMode={setAuthMode} form={authForm} setForm={setAuthForm} submit={submitAuth} error={authError} close={() => setAuthOpen(false)} demo={signInDemoAccount} />}
    </div>
  );
}

function DiscoverPage({ filters, setFilters, aiPrompt, setAiPrompt, applyAiSuggestion, aiMessage, aiProvider, establishments, selected, setSelected, loading, error, favoriteIds, toggleFavorite, openChat, userPosition, requestNearbyLocation, locationStatus }) {
  const clearFilters = () => setFilters(initialFilters);
  return <section className="discover-map-page map-mode">
    <NearbyMap establishments={establishments} setSelected={setSelected} userPosition={userPosition} radiusKm={filters.radiusKm} locationStatus={locationStatus} onOpenChat={openChat} fullScreen />

    <aside className="map-control-panel" aria-label="Find nearby places">
      <div className="map-panel-heading"><div><span className="eyebrow">PAYNEAR MARKETPLACE</span><h1>Find nearby</h1></div><button className="text-button" onClick={clearFilters}>Reset</button></div>
      <label className="map-input-label">Search a place or category<input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="e.g. cafe or pharmacy" /></label>
      <div className="map-filter-group"><span>What are you looking for?</span><div className="chip-row">{CATEGORIES.map((category) => <button key={category} className={filters.query === category ? "chip selected" : "chip"} onClick={() => setFilters((current) => ({ ...current, query: category === "All" ? "" : category }))}>{category}</button>)}</div></div>
      <div className="map-payment-section"><div className="map-payment-heading"><div><span>Payment preference <em>Optional</em></span><p>Choose one only when it matters to you.</p></div></div><div className="payment-preference-carousel">{PAYMENT_FILTER_OPTIONS.map((option) => <PaymentPreference key={option.method || "all"} option={option} selected={filters.method === option.method} onSelect={() => setFilters((current) => ({ ...current, method: option.method }))} />)}</div></div>
      <label className="range-label map-range"><span>Search radius <strong>{filters.radiusKm} km</strong></span><input type="range" min="1" max="10" value={filters.radiusKm} onChange={(event) => setFilters((current) => ({ ...current, radiusKm: Number(event.target.value) }))} /></label>
      <button className="location-button map-location-button" onClick={requestNearbyLocation}>{userPosition ? "Live location active" : "Use live location"}</button>
      <details className="map-advanced-filters"><summary>More filters</summary><label className="switch"><input type="checkbox" checked={filters.openNow} onChange={(event) => setFilters((current) => ({ ...current, openNow: event.target.checked }))} /><span>Open now only</span></label><label>Minimum rating<select value={filters.minRating} onChange={(event) => setFilters((current) => ({ ...current, minRating: Number(event.target.value) }))}><option value="0">Any rating</option><option value="4">4.0 and up</option><option value="4.5">4.5 and up</option></select></label></details>
      <form className="map-ai-box" onSubmit={applyAiSuggestion}><span className="ai-spark">AI</span><input value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Ask: cafe with GCash, open now" /><button className="button primary" type="submit">Ask</button></form>
      {aiMessage && <div className="ai-result"><strong>{aiProvider}</strong><span>{aiMessage}</span></div>}
      {error && <div className="error-box">{error}</div>}
      <div className="map-panel-footer"><span>{loading ? "Looking around..." : `${establishments.length} places nearby`}</span></div>
      <div className="map-sidebar-results"><div className="map-sidebar-results-heading"><span className="eyebrow">RESULTS</span><span>Select a place, then use Messages to contact its owner.</span></div><div className="map-sidebar-results-list">{!loading && establishments.map((place) => <PlaceCard key={place._id} place={place} selected={selected?._id === place._id} onClick={() => setSelected(place)} favorite={favoriteIds.includes(place._id)} toggleFavorite={toggleFavorite} />)}</div></div>
    </aside>
  </section>;
}

function PlaceCard({ place, selected, onClick, favorite, toggleFavorite }) {
  return <article className={`place-card ${selected ? "selected" : ""}`}><button className="card-main" onClick={onClick}><img src={place.imageUrl} alt={`${place.name} storefront`} /><div className="card-copy"><div className="card-topline"><span>{place.category}</span><span>{place.distanceKm} km</span></div><h3>{place.name}</h3><p>{place.address}</p><div className="card-footer"><span className="rating">Star {place.rating}</span>{place.openNow ? <span className="open">Open now</span> : <span className="closed">Closed</span>}<span className="card-payment-logos">{place.acceptedPaymentMethods.slice(0, 3).map((method) => <PaymentLogo key={method} method={method} compact />)}</span></div></div></button><button className={`favorite-button ${favorite ? "saved" : ""}`} aria-label="Save place" onClick={() => toggleFavorite(place._id)}>{favorite ? "Saved" : "Save"}</button></article>;
}

function SavedPage({ user, savedPlaces, selected, setSelected, toggleFavorite, updatePreference, openDiscover }) {
  if (!user) return <section className="simple-page"><span className="eyebrow">YOUR LIST</span><h1>Save places for later.</h1><p>Sign in to keep favorite places and a payment preference across sessions.</p></section>;
  return <section className="saved-page"><div className="page-heading"><span className="eyebrow">YOUR LIST</span><h1>Saved places</h1><p>Your search can start with {user.preferredPaymentMethod} when you are ready.</p></div><div className="saved-layout"><div className="saved-list">{savedPlaces.length ? savedPlaces.map((place) => <PlaceCard key={place._id} place={place} selected={selected?._id === place._id} onClick={() => setSelected(place)} favorite toggleFavorite={toggleFavorite} />) : <div className="empty-state"><h2>Nothing saved yet.</h2><p>Keep useful stores here for a faster next search.</p><button className="button primary" onClick={openDiscover}>Discover places</button></div>}</div><div className="preference-card"><span className="eyebrow">PREFERENCE</span><h2>Payment method</h2><p>Set your default for a more relevant discovery screen.</p><select className="preference-select" value={user.preferredPaymentMethod} onChange={(event) => updatePreference(event.target.value)}>{METHODS.map((method) => <option key={method}>{method}</option>)}</select></div></div></section>;
}

function ChatPage({ user, selected, messages, draft, setDraft, sendMessage, demoStoreReply, status, requestSignIn }) {
  if (!user) return <section className="simple-page"><span className="eyebrow">REAL-TIME CHAT</span><h1>Ask before you go.</h1><p>Sign in to use the protected Socket.IO chat channel with a selected establishment.</p><button className="button primary" onClick={requestSignIn}>Sign in to chat</button></section>;
  if (!selected) return <section className="simple-page"><h1>Choose an establishment first.</h1><p>Return to Discover, select a listing, then start a conversation.</p></section>;
  return <section className="chat-page"><div className="chat-card"><div className="chat-header"><img src={selected.imageUrl} alt="" /><div><span className="eyebrow">LIVE CHAT WITH {selected.ownerName || selected.name}</span><h1>{selected.name}</h1><p>{selected.ownerName ? `${selected.ownerName} · ${selected.ownerTitle || "Listing contact"} — ${status}` : status}</p></div></div><div className="messages">{messages.length === 0 ? <div className="chat-empty">Start by asking whether GCash is accepted today.</div> : messages.map((message) => <div key={message._id} className={`message ${message.senderRole === "establishment" ? "from-store" : "from-user"}`}><span>{message.senderRole === "establishment" ? selected.ownerName || selected.name : "You"}</span><p>{message.body}</p><small>{formatTime(message.createdAt)}</small></div>)}</div><form className="message-form" onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength="500" placeholder="Type a message..." /><button className="button primary">Send</button></form>{user.role === "admin" && <div className="chat-demo"><span>For reviewer demo</span><button className="text-button" onClick={demoStoreReply}>Send sample store reply</button></div>}</div></section>;
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{String(status || "pending").replace("_", " ")}</span>;
}

function ListingFormFields({ listingForm, setListingForm, setListingImage, useCurrentLocation, showContact = false }) {
  const toggleMethod = (method) => setListingForm((current) => ({
    ...current,
    acceptedPaymentMethods: current.acceptedPaymentMethods.includes(method)
      ? current.acceptedPaymentMethods.filter((item) => item !== method)
      : [...current.acceptedPaymentMethods, method],
  }));
  return <>
    <label>Store name<input required value={listingForm.name} onChange={(event) => setListingForm((current) => ({ ...current, name: event.target.value }))} /></label>
    <label>Category<select value={listingForm.category} onChange={(event) => setListingForm((current) => ({ ...current, category: event.target.value }))}>{CATEGORIES.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label>
    <label>Complete address<input required value={listingForm.address} onChange={(event) => setListingForm((current) => ({ ...current, address: event.target.value }))} placeholder="Street, barangay, city, province" /></label>
    <div className="coordinate-grid">
      <label>Latitude<input required type="number" step="any" min="-90" max="90" value={listingForm.latitude} onChange={(event) => setListingForm((current) => ({ ...current, latitude: event.target.value }))} placeholder="10.2935" /></label>
      <label>Longitude<input required type="number" step="any" min="-180" max="180" value={listingForm.longitude} onChange={(event) => setListingForm((current) => ({ ...current, longitude: event.target.value }))} placeholder="124.0005" /></label>
    </div>
    <button className="location-button" type="button" onClick={useCurrentLocation}>Use my current coordinates</button>
    {showContact && <>
      <label>Listing contact<input required value={listingForm.ownerName} onChange={(event) => setListingForm((current) => ({ ...current, ownerName: event.target.value }))} placeholder="e.g. Jamie Cruz" /></label>
      <label>Contact role<input required value={listingForm.ownerTitle} onChange={(event) => setListingForm((current) => ({ ...current, ownerTitle: event.target.value }))} placeholder="e.g. Store owner" /></label>
    </>}
    <label className="store-image-field">Storefront image<input required type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setListingImage(event.target.files?.[0] || null)} /><small>JPG, PNG, or WebP; maximum 3 MB. Admins require an image before verification.</small></label>
    <label className="switch"><input type="checkbox" checked={listingForm.openNow} onChange={(event) => setListingForm((current) => ({ ...current, openNow: event.target.checked }))} /><span>Open now</span></label>
    <div className="choice-group"><span>Accepted payment methods</span><div className="chip-row">{METHODS.map((method) => <button type="button" key={method} className={listingForm.acceptedPaymentMethods.includes(method) ? "chip selected" : "chip"} onClick={() => toggleMethod(method)}>{method}</button>)}</div></div>
  </>;
}

function OwnerPage({ user, listingForm, setListingForm, createListing, listingImage, setListingImage, useCurrentLocation, listings, updateListing, uploadListingImage, message }) {
  if (user?.role !== "owner") return <section className="simple-page"><span className="eyebrow">BUSINESS AREA</span><h1>Business owner access is required.</h1><p>Register as a business owner to submit and manage your own store listings.</p></section>;
  return <section className="admin-page owner-page">
    <div className="page-heading"><span className="eyebrow">BUSINESS OWNER AREA</span><h1>Submit your store</h1><p>Provide complete store information and a recognizable image. Your listing stays private until a PayNear administrator verifies and publishes it.</p></div>
    <div className="admin-grid">
      <form className="listing-form" onSubmit={createListing}>
        <h2>New store submission</h2>
        <div className="owner-account-note"><strong>{user.name}</strong><span>Automatically recorded as the listing owner</span></div>
        <ListingFormFields listingForm={listingForm} setListingForm={setListingForm} listingImage={listingImage} setListingImage={setListingImage} useCurrentLocation={useCurrentLocation} />
        <button className="button primary" type="submit">Submit store for review</button>
        {message && <p className="form-message">{message}</p>}
      </form>
      <div className="admin-list">
        <div className="list-heading"><div><span className="eyebrow">SUBMISSIONS</span><h2>My listings</h2></div><span>{listings.length} total</span></div>
        {listings.length === 0 ? <div className="empty-state"><h2>No store yet.</h2><p>Submit your first listing using the form.</p></div> : listings.map((place) => <article className="admin-row owner-listing-row" key={place._id}>
          <img src={place.imageUrl || payNearEmblem} alt="" />
          <div className="listing-summary"><div><strong>{place.name}</strong><StatusBadge status={place.verificationStatus} /></div><span>{place.category} · {place.address}</span><small>{place.isActive ? "Published publicly" : "Not visible to public users"}</small>{place.reviewNotes && <p className="review-note"><strong>Admin note:</strong> {place.reviewNotes}</p>}</div>
          <div className="admin-row-actions"><button className="text-button" onClick={() => updateListing(place._id, { openNow: !place.openNow })}>{place.openNow ? "Mark closed" : "Mark open"}</button><label className="upload-label">Replace image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadListingImage(place._id, event.target.files?.[0])} /></label></div>
        </article>)}
      </div>
    </div>
  </section>;
}

function AdminPage({ user, listingForm, setListingForm, createListing, listingImage, setListingImage, useCurrentLocation, listings, updateListing, uploadListingImage, reviewListing, message, requestDemo }) {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [notes, setNotes] = useState({});
  if (user?.role !== "admin") return <section className="simple-page"><span className="eyebrow">ADMIN AREA</span><h1>Verified listings need an admin.</h1><p>Use the demo administrator account to review the protected verification workflow.</p><button className="button primary" onClick={requestDemo}>Use demo admin</button></section>;
  const filteredListings = statusFilter === "all" ? listings : listings.filter((place) => place.verificationStatus === statusFilter);
  const pendingCount = listings.filter((place) => ["pending", "changes_requested"].includes(place.verificationStatus)).length;
  return <section className="admin-page moderation-page">
    <div className="page-heading"><span className="eyebrow">PROTECTED ADMIN AREA</span><h1>Review store submissions</h1><p>Only listings verified here become visible in public PayNear search and map results.</p></div>
    <div className="moderation-stats"><div><strong>{pendingCount}</strong><span>Needs review</span></div><div><strong>{listings.filter((place) => place.verificationStatus === "verified").length}</strong><span>Verified</span></div><div><strong>{listings.filter((place) => place.verificationStatus === "rejected").length}</strong><span>Rejected</span></div></div>
    {message && <p className="form-message moderation-message">{message}</p>}
    <div className="moderation-toolbar" role="group" aria-label="Filter submissions">{["pending", "changes_requested", "verified", "rejected", "all"].map((status) => <button key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>{status.replace("_", " ")}</button>)}</div>
    <div className="review-list">
      {filteredListings.length === 0 ? <div className="empty-state"><h2>No listings in this queue.</h2><p>Choose another status to inspect the directory.</p></div> : filteredListings.map((place) => <article className="review-card" key={place._id}>
        <img src={place.imageUrl || payNearEmblem} alt={`${place.name} storefront`} />
        <div className="review-card-body">
          <div className="review-card-heading"><div><StatusBadge status={place.verificationStatus} /><h2>{place.name}</h2><p>{place.ownerName || "Unassigned owner"} · {place.ownerTitle || "Listing contact"}</p></div><span>{place.category}</span></div>
          <dl><div><dt>Address</dt><dd>{place.address}</dd></div><div><dt>Coordinates</dt><dd>{place.location?.coordinates?.slice().reverse().join(", ") || "Missing"}</dd></div><div><dt>Payments</dt><dd>{place.acceptedPaymentMethods.join(", ")}</dd></div></dl>
          <label className="review-notes">Review notes<textarea maxLength="500" value={notes[place._id] ?? place.reviewNotes ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [place._id]: event.target.value }))} placeholder="Required when rejecting or requesting changes" /></label>
          <div className="review-actions"><button className="button primary" disabled={!place.imageUrl} onClick={() => reviewListing(place._id, "verify", notes[place._id] || "")}>Verify & publish</button><button className="button outline" onClick={() => reviewListing(place._id, "request_changes", notes[place._id] || "")}>Request changes</button><button className="text-button danger" onClick={() => reviewListing(place._id, "reject", notes[place._id] || "")}>Reject</button><label className="upload-label">Replace image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadListingImage(place._id, event.target.files?.[0])} /></label>{place.verificationStatus === "verified" && <button className="text-button" onClick={() => updateListing(place._id, { isActive: !place.isActive })}>{place.isActive ? "Unpublish" : "Republish"}</button>}</div>
        </div>
      </article>)}
    </div>
    <details className="manual-listing-panel"><summary>Add a listing manually</summary><form className="listing-form" onSubmit={createListing}><h2>Administrator-created listing</h2><ListingFormFields listingForm={listingForm} setListingForm={setListingForm} listingImage={listingImage} setListingImage={setListingImage} useCurrentLocation={useCurrentLocation} showContact /><button className="button primary" type="submit">Create pending listing</button></form></details>
  </section>;
}

function AuthDialog({ mode, setMode, form, setForm, submit, error, close, demo }) {
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  return <div className="modal-backdrop" role="presentation">
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="modal-close" onClick={close} aria-label="Close">x</button>
      <img className="auth-emblem" src={payNearEmblem} alt="" />
      <h2 id="auth-title">{mode === "login" ? "Welcome back" : "Create your PayNear account"}</h2>
      <p>{mode === "login" ? "Sign in with your PayNear account or choose a demo role below." : "Choose a personal or business account. Business owners can submit and manage their own store listings."}</p>
      <form onSubmit={submit}>
        {mode === "register" && <>
          <label>Name<input required value={form.name} onChange={update("name")} /></label>
          <fieldset className="role-choice">
            <legend>Account type</legend>
            <label><input type="radio" name="role" value="user" checked={form.role === "user"} onChange={update("role")} /><span><strong>User</strong><small>Search, save places, and chat with stores.</small></span></label>
            <label><input type="radio" name="role" value="owner" checked={form.role === "owner"} onChange={update("role")} /><span><strong>Business owner</strong><small>Submit and manage only your own store listings.</small></span></label>
          </fieldset>
        </>}
        <label>Email<input type="email" required value={form.email} onChange={update("email")} /></label>
        <label>Password<input type="password" minLength="6" required value={form.password} onChange={update("password")} /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="button primary full" type="submit">{mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      {mode === "login" && <div className="demo-accounts" aria-label="Demo role accounts">
        <span>Quick demo access</span>
        <button type="button" onClick={() => demo("user")}><strong>User</strong><small>user@paynear.demo · user123</small></button>
        <button type="button" onClick={() => demo("owner")}><strong>Owner</strong><small>owner@paynear.demo · owner123</small></button>
        <button type="button" onClick={() => demo("admin")}><strong>Admin</strong><small>admin@paynear.demo · admin123</small></button>
      </div>}
      <p className="auth-switch">{mode === "login" ? "New here?" : "Already have an account?"} <button onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Register" : "Sign in"}</button></p>
    </section>
  </div>;
}

export default App;
