import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { io } from "socket.io-client";
import {
  Bell,
  BellOff,
  Bookmark,
  Building2,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  Compass,
  Eye,
  EyeOff,
  Heart,
  ImageUp,
  ListFilter,
  LocateFixed,
  LockKeyhole,
  LogIn,
  LogOut,
  MapPin,
  MapPinned,
  MessageCircle,
  MessageSquareWarning,
  Plus,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Trash2,
  UserRound,
  UserRoundPlus,
  X,
  XCircle,
} from "lucide-react";
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

const routePlaceId = () => window.location.pathname.match(/^\/places\/([^/]+)\/?$/)?.[1] || "";

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
const listingMapIcon = L.divIcon({ className: "listing-pin-marker", html: "<span></span>", iconSize: [30, 38], iconAnchor: [15, 36] });

function handleStoreImageError(event) {
  event.currentTarget.onerror = null;
  event.currentTarget.src = payNearEmblem;
}

function formatTime(value) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function MapInteractionTracker({ followUserRef }) {
  useMapEvents({
    dragstart: () => { followUserRef.current = false; },
  });
  return null;
}

function ManualSearchLocationPicker({ enabled, onChoose }) {
  useMapEvents({
    click: ({ latlng }) => {
      if (enabled) onChoose({ latitude: Number(latlng.lat.toFixed(6)), longitude: Number(latlng.lng.toFixed(6)) });
    },
  });
  return null;
}

function MapViewport({ latitude, longitude, radiusKm, liveLocation, followUserRef }) {
  const map = useMap();
  const hasCenteredOnUserRef = useRef(false);
  const previousRadiusRef = useRef(radiusKm);

  useEffect(() => {
    if (!liveLocation) {
      hasCenteredOnUserRef.current = false;
      previousRadiusRef.current = radiusKm;
      return;
    }

    const userLocation = L.latLng(latitude, longitude);
    const radiusChanged = previousRadiusRef.current !== radiusKm;

    if (!hasCenteredOnUserRef.current || radiusChanged) {
      const searchArea = userLocation.toBounds(radiusKm * 2000);
      const mapPadding = window.innerWidth > 720 ? { paddingTopLeft: [390, 70], paddingBottomRight: [70, 70] } : { padding: [24, 90] };
      map.stop();
      map.fitBounds(searchArea, { animate: hasCenteredOnUserRef.current, duration: .45, maxZoom: 15, ...mapPadding });
      hasCenteredOnUserRef.current = true;
      previousRadiusRef.current = radiusKm;
      followUserRef.current = true;
      return;
    }

    if (followUserRef.current && map.distance(map.getCenter(), userLocation) > 25) {
      map.panTo(userLocation, { animate: true, duration: .35 });
    }
  }, [followUserRef, latitude, liveLocation, longitude, map, radiusKm]);
  return null;
}

function ListingPinEvents({ onChange }) {
  useMapEvents({
    click: ({ latlng }) => onChange(latlng.lat, latlng.lng),
  });
  return null;
}

function ListingPinViewport({ latitude, longitude, hasPosition }) {
  const map = useMap();

  useEffect(() => {
    if (hasPosition) map.setView([latitude, longitude], Math.max(map.getZoom(), 17), { animate: false });
  }, [hasPosition, latitude, longitude, map]);
  return null;
}

function ListingLocationPicker({ latitude, longitude, onChange }) {
  const numericLatitude = Number(latitude);
  const numericLongitude = Number(longitude);
  const hasPosition = latitude !== "" && longitude !== "" && Number.isFinite(numericLatitude) && Number.isFinite(numericLongitude);
  const position = hasPosition ? [numericLatitude, numericLongitude] : [10.3157, 123.8854];

  const updatePosition = (nextLatitude, nextLongitude) => onChange({
    latitude: Number(nextLatitude.toFixed(6)),
    longitude: Number(nextLongitude.toFixed(6)),
  });

  return <div className="listing-location-picker">
    <div className="listing-location-heading"><strong>Pin the exact storefront</strong><span>Tap the map or drag the pin. The coordinates above update automatically.</span></div>
    <MapContainer center={position} zoom={hasPosition ? 17 : 12} scrollWheelZoom className="listing-location-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
      <ListingPinEvents onChange={updatePosition} />
      <ListingPinViewport latitude={numericLatitude} longitude={numericLongitude} hasPosition={hasPosition} />
      {hasPosition && <Marker
        position={position}
        icon={listingMapIcon}
        title="Exact storefront pin"
        alt="Exact storefront pin"
        draggable
        eventHandlers={{ dragend: (event) => {
          const point = event.target.getLatLng();
          updatePosition(point.lat, point.lng);
        } }}
      ><Popup>Exact storefront location</Popup></Marker>}
    </MapContainer>
    <small>{hasPosition ? `Pinned at ${numericLatitude.toFixed(6)}, ${numericLongitude.toFixed(6)}` : "No pin yet. Use your current location or tap the map."}</small>
  </div>;
}

function NearbyMap({ establishments, setSelected, userPosition, radiusKm, locationStatus, onOpenChat, onOpenDetails, manualPinMode = false, onManualLocation, fullScreen = false }) {
  const fallbackCenter = [14.64, 121.049];
  const center = userPosition ? [userPosition.latitude, userPosition.longitude] : fallbackCenter;
  const mapRef = useRef(null);
  const followUserRef = useRef(true);

  function recenterOnUser() {
    if (!userPosition || !mapRef.current) return;
    const map = mapRef.current;
    followUserRef.current = true;
    map.stop();
    map.flyTo(center, Math.max(map.getZoom(), 14), { animate: true, duration: .45 });
  }

  return <div className={`map-shell ${fullScreen ? "map-shell-fullscreen" : ""}`}>
    <MapContainer ref={mapRef} center={center} zoom={userPosition ? 14 : 13} scrollWheelZoom className={`nearby-map ${manualPinMode ? "manual-pin-active" : ""}`}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
      <MapInteractionTracker followUserRef={followUserRef} />
      <ManualSearchLocationPicker enabled={manualPinMode} onChoose={onManualLocation} />
      <MapViewport
        latitude={userPosition?.latitude ?? fallbackCenter[0]}
        longitude={userPosition?.longitude ?? fallbackCenter[1]}
        radiusKm={radiusKm}
        liveLocation={Boolean(userPosition)}
        followUserRef={followUserRef}
      />
      {userPosition && <><Marker position={center} icon={userMapIcon} title="Your live location" alt="Your live location"><Popup>You are here</Popup></Marker><Circle center={center} radius={radiusKm * 1000} pathOptions={{ color: "#007c78", fillColor: "#8bdbd3", fillOpacity: .2, weight: 3, opacity: .95 }}><Tooltip className="radius-tooltip" permanent direction="top" offset={[0, -16]} opacity={1}>{radiusKm} km search area</Tooltip></Circle></>}
      {establishments.filter((place) => place.location?.coordinates?.length === 2).map((place) => {
        const [longitude, latitude] = place.location.coordinates;
        return <Marker key={place._id} position={[latitude, longitude]} icon={storeMapIcon(place)} title={`${place.name}, ${place.distanceKm} kilometers away`} alt={`${place.name} map pin`} eventHandlers={{ click: () => setSelected(place) }}><Popup><div className="map-popup"><div className="map-popup-hero"><img src={place.imageUrl || payNearEmblem} onError={handleStoreImageError} alt={`${place.name} storefront`} /><div><strong>{place.name}</strong><span>{place.distanceKm} km - {place.category}</span><small>{place.ownerName || "Listing contact"}</small></div></div><div className="map-popup-payments">{place.acceptedPaymentMethods.slice(0, 3).map((method) => <PaymentLogo key={method} method={method} compact />)}</div><div className="map-popup-actions"><button onClick={() => onOpenDetails(place)}><Eye aria-hidden="true" />View details</button><button onClick={() => { setSelected(place); onOpenChat(place); }}><MessageCircle aria-hidden="true" />Message</button></div></div></Popup></Marker>;
      })}
    </MapContainer>
    {userPosition && <button className="map-recenter-button" type="button" aria-label="Center map on my live location" title="Center on my location" onClick={recenterOnUser}><LocateFixed aria-hidden="true" /></button>}
    <div className="map-overlay"><strong>{manualPinMode ? "Tap the map to set your search point" : userPosition ? `${radiusKm} km radius around you` : "Metro Manila marketplace view"}</strong><span>{locationStatus || "Use live location or choose a point manually."}</span></div>
  </div>;
}

function App() {
  const [filters, setFilters] = useState(initialFilters);
  const [establishments, setEstablishments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [activePage, setActivePage] = useState(() => routePlaceId() ? "details" : "discover");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [aiProvider, setAiProvider] = useState("");
  const [userPosition, setUserPosition] = useState(null);
  const [locationStatus, setLocationStatus] = useState("");
  const [manualPinMode, setManualPinMode] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem("paynear-token") || "");
  const [user, setUser] = useState(null);
  const [sessionChecking, setSessionChecking] = useState(() => Boolean(localStorage.getItem("paynear-token")));
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", role: "user" });
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ password: "", confirmPassword: "" });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [toast, setToast] = useState("");
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversationUserId, setActiveConversationUserId] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [chatStatus, setChatStatus] = useState("");
  const [listingForm, setListingForm] = useState(initialListing);
  const [listingImage, setListingImage] = useState(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [listingSubmitting, setListingSubmitting] = useState(false);
  const [listingActionBusy, setListingActionBusy] = useState("");
  const [ownerListings, setOwnerListings] = useState([]);
  const [adminListings, setAdminListings] = useState([]);
  const [favoritePlaces, setFavoritePlaces] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [myReview, setMyReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: "" });
  const [reviewBusy, setReviewBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(() => Boolean(routePlaceId()));
  const socketRef = useRef(null);
  const locationWatchRef = useRef(null);
  const lastAcceptedLocationRef = useRef(null);
  const profileMenuRef = useRef(null);
  const resultsRequestRef = useRef({ controller: null, id: 0 });

  const alert = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }, []);

  const loadPlaceDetails = useCallback(async (id, updateRoute = false) => {
    if (!id) return;
    if (updateRoute && window.location.pathname !== `/places/${id}`) window.history.pushState({}, "", `/places/${id}`);
    setDetailLoading(true);
    try {
      const [{ establishment }, { reviews: placeReviews }] = await Promise.all([api.getEstablishment(id), api.reviews(id)]);
      setSelected(establishment);
      setReviews(placeReviews);
      setActivePage("details");
      if (token) {
        const { review } = await api.myReview(id, token).catch(() => ({ review: null }));
        setMyReview(review);
        setReviewForm(review ? { rating: review.rating, comment: review.comment } : { rating: 5, comment: "" });
      } else {
        setMyReview(null);
        setReviewForm({ rating: 5, comment: "" });
      }
    } catch (requestError) {
      alert(requestError.message || "This verified place is no longer available.");
      setActivePage("discover");
      if (window.location.pathname !== "/") window.history.replaceState({}, "", "/");
    } finally {
      setDetailLoading(false);
    }
  }, [alert, token]);

  const loadResults = useCallback(async () => {
    resultsRequestRef.current.controller?.abort();
    const controller = new AbortController();
    const requestId = resultsRequestRef.current.id + 1;
    resultsRequestRef.current = { controller, id: requestId };
    setLoading(true);
    setError("");
    try {
      const { establishments: results } = await api.listEstablishments(filters, { signal: controller.signal });
      if (resultsRequestRef.current.id !== requestId) return;
      setEstablishments(results);
      setSelected((current) => activePage === "details" ? current : results.find((item) => item._id === current?._id) || results[0] || null);
    } catch (requestError) {
      if (requestError.name === "AbortError" || resultsRequestRef.current.id !== requestId) return;
      setError(requestError.message || "We could not load verified places. Please try again.");
      setEstablishments([]);
    } finally {
      if (resultsRequestRef.current.id === requestId) setLoading(false);
    }
  }, [activePage, filters]);

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

  const loadConversations = useCallback(async () => {
    if (!token || !new Set(["user", "owner"]).has(user?.role)) return [];
    try {
      const { conversations: items } = await api.conversations(token);
      setConversations(items);
      if (user.role === "owner" && items.length && !activeConversationUserId) {
        setSelected(items[0].establishment);
        setActiveConversationUserId(items[0].conversationUserId);
      }
      return items;
    } catch {
      setConversations([]);
      return [];
    }
  }, [activeConversationUserId, token, user?.role]);

  const loadFavoritePlaces = useCallback(async () => {
    if (!token || !user) { setFavoritePlaces([]); return; }
    try {
      const { establishments: places } = await api.favorites(token);
      setFavoritePlaces(places);
    } catch {
      setFavoritePlaces([]);
    }
  }, [token, user]);

  useEffect(() => {
    const openRoute = () => {
      const id = routePlaceId();
      if (id) loadPlaceDetails(id);
      else setActivePage((current) => current === "details" ? "discover" : current);
    };
    openRoute();
    window.addEventListener("popstate", openRoute);
    return () => window.removeEventListener("popstate", openRoute);
  }, [loadPlaceDetails]);

  useEffect(() => {
    const delay = filters.query.trim() ? 250 : 0;
    const timer = window.setTimeout(loadResults, delay);
    return () => window.clearTimeout(timer);
  }, [filters.query, loadResults]);

  useEffect(() => () => resultsRequestRef.current.controller?.abort(), []);

  useEffect(() => () => {
    if (locationWatchRef.current !== null) navigator.geolocation?.clearWatch(locationWatchRef.current);
  }, []);

  useEffect(() => {
    if (!token) { setSessionChecking(false); return undefined; }
    let mounted = true;
    setSessionChecking(true);
    api.me(token)
      .then(({ user: currentUser }) => {
        if (!mounted) return;
        setUser(currentUser);
        if (currentUser.mustChangePassword) setActivePage("change-password");
      })
      .catch(() => mounted && logout("Your previous session expired. Please sign in again."))
      .finally(() => mounted && setSessionChecking(false));
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || user?.mustChangePassword) { setNotifications([]); return; }
    api.notifications(token).then(({ notifications: notices }) => setNotifications(notices)).catch(() => {});
  }, [token, user?.mustChangePassword]);

  useEffect(() => {
    if (!showProfile) return undefined;
    const closeOutside = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setShowProfile(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setShowProfile(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [showProfile]);

  useEffect(() => {
    if (user?.role === "owner" && !user.mustChangePassword) loadOwnerListings();
    else setOwnerListings([]);
  }, [loadOwnerListings, user?.mustChangePassword, user?.role]);

  useEffect(() => {
    if (user?.role === "admin" && !user.mustChangePassword) loadAdminListings();
    else setAdminListings([]);
  }, [loadAdminListings, user?.mustChangePassword, user?.role]);

  useEffect(() => {
    if (activePage === "chat" && user && !user.mustChangePassword) loadConversations();
  }, [activePage, loadConversations, user]);

  useEffect(() => {
    if (user && !user.mustChangePassword) loadFavoritePlaces();
    else setFavoritePlaces([]);
  }, [loadFavoritePlaces, user]);

  useEffect(() => {
    if (activePage !== "chat" || !selected || !token || !user || user.mustChangePassword) return undefined;
    let mounted = true;
    setChatStatus("Connecting secure chat...");
    const conversationUserId = user.role === "user" ? user.id : activeConversationUserId;
    if (!conversationUserId) { setMessages([]); setChatStatus("Choose a conversation."); return undefined; }
    api.messages(selected._id, token, conversationUserId).then(({ messages: history }) => {
      if (mounted) setMessages(history);
    }).catch((requestError) => mounted && setChatStatus(requestError.message));

    const socket = io(socketOrigin, { auth: { token } });
    socketRef.current = socket;
    socket.on("connect", () => {
      socket.emit("join-establishment", { establishmentId: selected._id, conversationUserId }, (result) => {
        if (mounted) setChatStatus(result.ok ? "Live chat connected" : result.message);
      });
    });
    socket.on("connect_error", (socketError) => mounted && setChatStatus(socketError.message || "Chat connection failed."));
    socket.on("message:new", (message) => {
      if (String(message.establishmentId) === String(selected._id) && String(message.conversationUserId) === String(conversationUserId)) {
        setMessages((current) => current.some((item) => item._id === message._id) ? current : [...current, message]);
        loadConversations();
      }
    });
    socket.on("notification:new", (notice) => {
      setNotifications((current) => [notice, ...current]);
      alert(notice.title);
    });

    return () => { mounted = false; socket.disconnect(); socketRef.current = null; };
  }, [activeConversationUserId, activePage, alert, loadConversations, selected, token, user]);

  const unreadCount = notifications.filter((notice) => !notice.isRead).length;
  const favoriteIds = user?.favoriteEstablishmentIds || [];
  const savedPlaces = favoritePlaces;

  function logout(message = "You are signed out.") {
    const notice = typeof message === "string" ? message : "You are signed out.";
    localStorage.removeItem("paynear-token");
    localStorage.removeItem("paynear-user");
    setToken("");
    setUser(null);
    setSessionChecking(false);
    setNotifications([]);
    setOwnerListings([]);
    setAdminListings([]);
    setFavoritePlaces([]);
    setPasswordForm({ password: "", confirmPassword: "" });
    setPasswordError("");
    setShowNotifications(false);
    setShowProfile(false);
    setActivePage("discover");
    window.history.replaceState({}, "", "/");
    alert(notice);
  }

  function storeSession(result) {
    localStorage.setItem("paynear-token", result.token);
    localStorage.removeItem("paynear-user");
    setToken(result.token);
    setUser(result.user);
    setSessionChecking(false);
    setActivePage(result.user.mustChangePassword ? "change-password" : result.user.role === "admin" ? "admin" : result.user.role === "owner" ? "owner" : "discover");
    setAuthOpen(false);
    setAuthError("");
    setAuthForm({ name: "", email: "", password: "", role: "user" });
    alert(result.user.mustChangePassword ? "Set your new password to finish signing in." : `Welcome, ${result.user.name.split(" ")[0]}.`);
  }

  const closeAuthDialog = useCallback(() => {
    setAuthOpen(false);
    setAuthError("");
    setAuthForm((current) => ({ ...current, password: "" }));
  }, []);

  async function submitAuth(event) {
    event.preventDefault();
    if (authSubmitting) return;
    setAuthError("");
    setAuthSubmitting(true);
    try {
      const result = authMode === "register" ? await api.register(authForm) : await api.login(authForm);
      storeSession(result);
    } catch (requestError) {
      setAuthError(requestError.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function submitPasswordChange(event) {
    event.preventDefault();
    if (passwordSubmitting) return;
    setPasswordError("");
    if (passwordForm.password.length < 12) {
      setPasswordError("Use at least 12 characters for your new administrator password.");
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setPasswordError("The password confirmation does not match.");
      return;
    }
    setPasswordSubmitting(true);
    try {
      const result = await api.changePassword(passwordForm.password, token);
      localStorage.setItem("paynear-token", result.token);
      localStorage.removeItem("paynear-user");
      setToken(result.token);
      setUser(result.user);
      setPasswordForm({ password: "", confirmPassword: "" });
      setActivePage(result.user.role === "admin" ? "admin" : result.user.role === "owner" ? "owner" : "discover");
      alert("Password updated. Your PayNear account is ready.");
    } catch (requestError) {
      setPasswordError(requestError.message);
    } finally {
      setPasswordSubmitting(false);
    }
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
    setManualPinMode(false);
    setLocationStatus("Getting your live location...");
    locationWatchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const location = { latitude: Number(coords.latitude.toFixed(6)), longitude: Number(coords.longitude.toFixed(6)) };
        const previousLocation = lastAcceptedLocationRef.current;
        if (previousLocation && L.latLng(previousLocation.latitude, previousLocation.longitude).distanceTo(L.latLng(location.latitude, location.longitude)) < 15) {
          setLocationStatus("Live location is active. Your exact location is never shared with stores.");
          return;
        }
        lastAcceptedLocationRef.current = location;
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

  function setManualSearchLocation(location) {
    if (locationWatchRef.current !== null) {
      navigator.geolocation?.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
    lastAcceptedLocationRef.current = location;
    setUserPosition(location);
    setFilters((current) => ({ ...current, ...location }));
    setManualPinMode(false);
    setLocationStatus("Manual search point active. Tap Set on map to move it.");
  }

  function applyManualCoordinates() {
    const latitude = Number(filters.latitude);
    const longitude = Number(filters.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      alert("Enter valid latitude and longitude coordinates.");
      return;
    }
    setManualSearchLocation({ latitude, longitude });
  }

  async function toggleFavorite(id) {
    if (!token) { setAuthOpen(true); setAuthMode("login"); return; }
    try {
      const result = await api.favorite(id, token);
      setUser(result.user);
      await loadFavoritePlaces();
    } catch (requestError) { alert(requestError.message); }
  }

  async function updatePreference(preferredPaymentMethod) {
    if (!token) return;
    try {
      const result = await api.preferences(preferredPaymentMethod, token);
      setUser(result.user);
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

  async function openNotification(notice) {
    await markRead(notice._id);
    setShowNotifications(false);
    if (notice.type !== "chat") return;
    let conversation = conversations.find((item) => String(item.establishment._id) === String(notice.establishmentId)
      && (!notice.conversationUserId || String(item.conversationUserId) === String(notice.conversationUserId)));
    if (!conversation) {
      const refreshed = await loadConversations();
      conversation = refreshed.find((item) => String(item.establishment._id) === String(notice.establishmentId)
        && (!notice.conversationUserId || String(item.conversationUserId) === String(notice.conversationUserId)));
    }
    if (conversation) chooseConversation(conversation);
    else setActivePage("chat");
  }

  function openChat(place = selected, conversationUserId = "") {
    if (!token) { setAuthOpen(true); setAuthMode("login"); return; }
    if (user?.mustChangePassword) { setActivePage("change-password"); return; }
    if (place && (user?.role === "user" || String(place.ownerUserId || "") === String(user?.id))) setSelected(place);
    else if (user?.role === "owner" && !conversationUserId) setSelected(null);
    setActiveConversationUserId(user?.role === "user" ? user.id : conversationUserId);
    if (window.location.pathname !== "/") window.history.pushState({}, "", "/");
    setActivePage("chat");
  }

  function chooseConversation(conversation) {
    setSelected(conversation.establishment);
    setActiveConversationUserId(conversation.conversationUserId);
    setActivePage("chat");
  }

  function sendMessage(event) {
    event.preventDefault();
    const body = messageDraft.trim();
    if (!body || !socketRef.current || !selected) return;
    const conversationUserId = user?.role === "user" ? user.id : activeConversationUserId;
    socketRef.current.emit("send-message", { establishmentId: selected._id, conversationUserId, body }, (result) => {
      if (!result.ok) { alert(result.message); return; }
      setMessageDraft("");
      loadConversations();
    });
  }

  function openPlaceDetails(place) {
    loadPlaceDetails(place._id, true);
  }

  async function sharePlace() {
    if (!selected) return;
    const url = `${window.location.origin}/places/${selected._id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${selected.name} on PayNear`, text: `View verified payment methods and store details for ${selected.name}.`, url });
      else {
        await navigator.clipboard.writeText(url);
        alert("Place link copied.");
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError") alert("Could not share this link. Please try again.");
    }
  }

  async function submitReview(event) {
    event.preventDefault();
    if (!token) { setAuthMode("login"); setAuthOpen(true); return; }
    if (!selected || reviewBusy) return;
    setReviewBusy(true);
    try {
      const result = await api.saveReview(selected._id, reviewForm, token);
      setMyReview(result.review);
      setSelected((current) => ({ ...current, rating: result.rating, reviewCount: result.reviewCount }));
      const { reviews: placeReviews } = await api.reviews(selected._id);
      setReviews(placeReviews);
      alert(myReview ? "Review updated." : "Review published.");
    } catch (requestError) { alert(requestError.message); }
    finally { setReviewBusy(false); }
  }

  async function removeReview() {
    if (!selected || reviewBusy) return;
    setReviewBusy(true);
    try {
      const aggregate = await api.deleteReview(selected._id, token);
      setMyReview(null);
      setReviewForm({ rating: 5, comment: "" });
      setSelected((current) => ({ ...current, ...aggregate }));
      const { reviews: placeReviews } = await api.reviews(selected._id);
      setReviews(placeReviews);
      alert("Review removed.");
    } catch (requestError) { alert(requestError.message); }
    finally { setReviewBusy(false); }
  }

  async function createListing(event) {
    event.preventDefault();
    if (listingSubmitting) return;
    const form = event.currentTarget;
    setAdminMessage("");
    setListingSubmitting(true);
    let createdEstablishment = null;
    try {
      const { establishment } = await api.createListing(listingForm, token);
      createdEstablishment = establishment;
      if (listingImage) {
        try {
          await api.uploadImage(establishment._id, listingImage, token);
        } catch (uploadError) {
          setAdminMessage(`${establishment.name} was saved, but its image did not upload: ${uploadError.message} Use Replace image on the saved listing; do not submit a duplicate.`);
          await (user?.role === "owner" ? loadOwnerListings() : loadAdminListings());
          return;
        }
      }
      setAdminMessage(`${establishment.name} was submitted for administrator review.`);
      setListingForm(initialListing);
      setListingImage(null);
      form.reset();
      await loadResults();
      if (user?.role === "owner") await loadOwnerListings();
      if (user?.role === "admin") await loadAdminListings();
    } catch (requestError) {
      setAdminMessage(createdEstablishment
        ? `${createdEstablishment.name} was saved, but setup could not finish. Check My listings before trying again.`
        : requestError.message);
    } finally {
      setListingSubmitting(false);
    }
  }

  async function updateListing(id, updates) {
    if (listingActionBusy) return;
    setListingActionBusy(`update:${id}`);
    try {
      await api.updateListing(id, updates, token);
      await loadResults();
      if (user?.role === "owner") await loadOwnerListings();
      if (user?.role === "admin") await loadAdminListings();
      setAdminMessage("Listing updated.");
    } catch (requestError) { setAdminMessage(requestError.message); }
    finally { setListingActionBusy(""); }
  }

  async function uploadListingImage(id, file) {
    if (!file || listingActionBusy) return;
    setListingActionBusy(`image:${id}`);
    try {
      await api.uploadImage(id, file, token);
      await loadResults();
      if (user?.role === "owner") await loadOwnerListings();
      if (user?.role === "admin") await loadAdminListings();
      setAdminMessage(user?.role === "owner" ? "Image uploaded. The listing returned to the review queue." : "Image uploaded and linked to the listing.");
    } catch (requestError) { setAdminMessage(requestError.message); }
    finally { setListingActionBusy(""); }
  }

  async function reviewListing(id, action, reviewNotes = "") {
    if (listingActionBusy) return;
    setListingActionBusy(`${action}:${id}`);
    try {
      const { establishment } = await api.reviewListing(id, { action, reviewNotes }, token);
      await Promise.all([loadAdminListings(), loadResults()]);
      setAdminMessage(action === "verify"
        ? `${establishment.name} is verified and publicly visible.`
        : `${establishment.name} was returned to the owner with review notes.`);
    } catch (requestError) { setAdminMessage(requestError.message); }
    finally { setListingActionBusy(""); }
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
    if (window.location.pathname !== "/") window.history.pushState({}, "", "/");
    setActivePage(user?.mustChangePassword ? "change-password" : page);
    setShowNotifications(false);
    setShowProfile(false);
  }

  return (
    <div className={`app-shell ${activePage === "discover" && !user?.mustChangePassword ? "map-app-shell" : ""} ${user?.mustChangePassword ? "password-app-shell" : ""}`}>
      <header className="topbar">
        <button className="brand" onClick={() => selectPage("discover")} aria-label="PayNear home"><img className="brand-emblem" src={payNearEmblem} alt="" /><span className="brand-wordmark"><span className="brand-pay">Pay</span><span className="brand-near">Near</span></span></button>
        {!user?.mustChangePassword && <nav className="nav-links" aria-label="Primary navigation">
          <button className={activePage === "discover" ? "active" : ""} onClick={() => selectPage("discover")}><Compass aria-hidden="true" /><span>Discover</span></button>
          <button className={activePage === "saved" ? "active" : ""} onClick={() => selectPage("saved")}><Bookmark aria-hidden="true" /><span>Saved</span></button>
          {user?.role !== "admin" && <button className={activePage === "chat" ? "active" : ""} onClick={() => openChat(null)}><MessageCircle aria-hidden="true" /><span>Messages</span></button>}
          {user?.role === "owner" && <button className={activePage === "owner" ? "active" : ""} onClick={() => selectPage("owner")}><Store aria-hidden="true" /><span>My business</span></button>}
          {user?.role === "admin" && <button className={activePage === "admin" ? "active" : ""} onClick={() => selectPage("admin")}><ShieldCheck aria-hidden="true" /><span>Admin</span></button>}
        </nav>}
        <div className="header-actions">
          {!sessionChecking && user && !user.mustChangePassword && <div className="notice-wrap">
            <button className="icon-button" aria-label="Notifications" aria-expanded={showNotifications} onClick={() => { setShowNotifications((value) => !value); setShowProfile(false); }}><Bell aria-hidden="true" />{unreadCount > 0 && <span className="notice-count">{unreadCount}</span>}</button>
            {showNotifications && <div className="notification-popover">
              <div className="popover-heading"><strong><Bell aria-hidden="true" />Updates</strong><span>{unreadCount} unread</span></div>
              {notifications.length === 0 ? <p className="empty-note"><BellOff aria-hidden="true" />No updates yet.</p> : notifications.slice(0, 5).map((notice) => <button key={notice._id} className={`notice-item ${notice.isRead ? "read" : ""}`} onClick={() => openNotification(notice)}><strong>{notice.title}</strong><span>{notice.message}</span></button>)}
            </div>}
          </div>}
          {sessionChecking ? <span className="session-checking" role="status">Checking session…</span> : user ? <div className="profile-wrap" ref={profileMenuRef}>
            <button className="profile-button" aria-expanded={showProfile} aria-haspopup="menu" onClick={() => { setShowProfile((value) => !value); setShowNotifications(false); }}><span className="profile-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="profile-name">{user.name.split(" ")[0]}</span><ChevronDown className="profile-chevron" aria-hidden="true" /></button>
            {showProfile && <div className="profile-menu" role="menu">
              <div className="profile-summary"><span className="profile-avatar large">{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><span>{user.email}</span><small>{user.role === "owner" ? "Business owner" : user.role === "admin" ? "Administrator" : "PayNear user"}</small></div></div>
              <button className="signout-button" role="menuitem" onClick={logout}><LogOut aria-hidden="true" />Sign out</button>
            </div>}
          </div> : <button className="button outline sign-in-button" onClick={() => { setAuthMode("login"); setAuthOpen(true); }}><LogIn aria-hidden="true" />Sign in</button>}
        </div>
      </header>

      <main>
        {user?.mustChangePassword ? <PasswordChangePage
          user={user} form={passwordForm} setForm={setPasswordForm} submit={submitPasswordChange} error={passwordError} logout={logout} submitting={passwordSubmitting}
        /> : <>
        {activePage === "discover" && <DiscoverPage
          filters={filters} setFilters={setFilters} aiPrompt={aiPrompt} setAiPrompt={setAiPrompt} applyAiSuggestion={applyAiSuggestion}
          aiMessage={aiMessage} aiProvider={aiProvider} establishments={establishments} selected={selected} setSelected={setSelected}
          loading={loading} error={error} favoriteIds={favoriteIds} toggleFavorite={toggleFavorite} openChat={openChat} openDetails={openPlaceDetails}
          userPosition={userPosition} requestNearbyLocation={requestNearbyLocation} locationStatus={locationStatus} retryResults={loadResults}
          manualPinMode={manualPinMode} setManualPinMode={setManualPinMode} setManualLocation={setManualSearchLocation} applyManualCoordinates={applyManualCoordinates}
        />}
        {activePage === "saved" && <SavedPage user={user} savedPlaces={savedPlaces} selected={selected} openDetails={openPlaceDetails} toggleFavorite={toggleFavorite} updatePreference={updatePreference} openDiscover={() => selectPage("discover")} requestSignIn={() => { setAuthMode("login"); setAuthOpen(true); }} />}
        {activePage === "details" && <PlaceDetailPage user={user} place={selected} loading={detailLoading} reviews={reviews} myReview={myReview} reviewForm={reviewForm} setReviewForm={setReviewForm} submitReview={submitReview} removeReview={removeReview} reviewBusy={reviewBusy} toggleFavorite={toggleFavorite} favorite={selected ? favoriteIds.includes(selected._id) : false} openChat={openChat} sharePlace={sharePlace} goBack={() => selectPage("discover")} requestSignIn={() => { setAuthMode("login"); setAuthOpen(true); }} />}
        {activePage === "chat" && <ChatPage user={user} selected={selected} conversations={conversations} activeConversationUserId={activeConversationUserId} chooseConversation={chooseConversation} messages={messages} draft={messageDraft} setDraft={setMessageDraft} sendMessage={sendMessage} status={chatStatus} openDiscover={() => selectPage("discover")} requestSignIn={() => { setAuthMode("login"); setAuthOpen(true); }} />}
        {activePage === "owner" && <OwnerPage
          user={user} listingForm={listingForm} setListingForm={setListingForm} createListing={createListing}
          listingImage={listingImage} setListingImage={setListingImage} useCurrentLocation={useCurrentLocationForListing}
          listings={ownerListings} updateListing={updateListing} uploadListingImage={uploadListingImage} message={adminMessage}
          submitting={listingSubmitting} actionBusy={listingActionBusy}
        />}
        {activePage === "admin" && <AdminPage
          user={user} listingForm={listingForm} setListingForm={setListingForm} createListing={createListing}
          listingImage={listingImage} setListingImage={setListingImage} useCurrentLocation={useCurrentLocationForListing}
          listings={adminListings} updateListing={updateListing} uploadListingImage={uploadListingImage}
          reviewListing={reviewListing} message={adminMessage} requestSignIn={() => { setAuthMode("login"); setAuthOpen(true); }}
          submitting={listingSubmitting} actionBusy={listingActionBusy}
        />}
        </>}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
      {authOpen && <AuthDialog mode={authMode} setMode={(nextMode) => { setAuthMode(nextMode); setAuthError(""); }} form={authForm} setForm={setAuthForm} submit={submitAuth} error={authError} close={closeAuthDialog} submitting={authSubmitting} />}
    </div>
  );
}

function PasswordChangePage({ user, form, setForm, submit, error, logout, submitting }) {
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  return <section className="password-change-page">
    <div className="password-change-card">
      <img className="auth-emblem" src={payNearEmblem} alt="" />
      <span className="eyebrow"><LockKeyhole aria-hidden="true" />SECURE FIRST SIGN-IN</span>
      <h1>Create your private password</h1>
      <p>Hi {user.name.split(" ")[0]}. Your administrator account was issued with a one-time temporary password. Set a new password before opening the admin dashboard.</p>
      <form onSubmit={submit}>
        <label>New password<input required type="password" minLength="12" autoComplete="new-password" value={form.password} onChange={update("password")} /></label>
        <small>Use at least 12 characters. Do not reuse the temporary password.</small>
        <label>Confirm new password<input required type="password" minLength="12" autoComplete="new-password" value={form.confirmPassword} onChange={update("confirmPassword")} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary full" type="submit" disabled={submitting}><ShieldCheck aria-hidden="true" />{submitting ? "Securing account…" : "Set password and continue"}</button>
      </form>
      <button className="password-change-signout" type="button" onClick={logout}><LogOut aria-hidden="true" />Sign out and finish later</button>
    </div>
  </section>;
}

function DiscoverPage({ filters, setFilters, aiPrompt, setAiPrompt, applyAiSuggestion, aiMessage, aiProvider, establishments, selected, setSelected, loading, error, favoriteIds, toggleFavorite, openChat, openDetails, userPosition, requestNearbyLocation, locationStatus, retryResults, manualPinMode, setManualPinMode, setManualLocation, applyManualCoordinates }) {
  const clearFilters = () => setFilters({
    ...initialFilters,
    latitude: userPosition?.latitude ?? "",
    longitude: userPosition?.longitude ?? "",
  });
  const hasActiveFilters = Boolean(filters.query || filters.method || filters.openNow || Number(filters.minRating));
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  return <section className="discover-map-page map-mode">
    <h1 className="sr-only">Find nearby places</h1>
    <NearbyMap establishments={establishments} setSelected={setSelected} userPosition={userPosition} radiusKm={filters.radiusKm} locationStatus={locationStatus} onOpenChat={openChat} onOpenDetails={openDetails} manualPinMode={manualPinMode} onManualLocation={setManualLocation} fullScreen />

    <aside className={`map-control-panel ${mobilePanelOpen ? "mobile-expanded" : ""}`} aria-label="Find nearby places">
      <button className="mobile-sheet-toggle" type="button" aria-expanded={mobilePanelOpen} onClick={() => setMobilePanelOpen((value) => !value)}>
        <span className="mobile-sheet-grabber" aria-hidden="true" />
        <span className="mobile-sheet-copy"><strong>{mobilePanelOpen ? "Search and filters" : "Near you"}</strong><small>{loading ? "Looking around..." : `${establishments.length} verified places nearby`}</small></span>
        <span className="mobile-sheet-chevron" aria-hidden="true">{mobilePanelOpen ? <ChevronDown /> : <ChevronUp />}</span>
      </button>
      <div className="map-panel-heading"><div><span className="eyebrow"><MapPin aria-hidden="true" />PAYNEAR NEARBY</span><h2>Find a place to pay</h2></div><button className="text-button" onClick={clearFilters}><RefreshCw aria-hidden="true" />Reset</button></div>
      <label className="map-input-label"><span className="field-caption">Search stores or categories</span><span className="map-search-control"><Search aria-hidden="true" /><input value={filters.query} onFocus={() => setMobilePanelOpen(true)} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Search cafe, grocery, pharmacy" /></span></label>
      <div className="map-filter-group"><span>What are you looking for?</span><div className="chip-row">{CATEGORIES.map((category) => <button key={category} className={filters.query === category ? "chip selected" : "chip"} onClick={() => setFilters((current) => ({ ...current, query: category === "All" ? "" : category }))}>{category}</button>)}</div></div>
      <div className="map-payment-section"><div className="map-payment-heading"><div><span>Payment preference <em>Optional</em></span><p>Choose one only when it matters to you.</p></div></div><div className="payment-preference-carousel">{PAYMENT_FILTER_OPTIONS.map((option) => <PaymentPreference key={option.method || "all"} option={option} selected={filters.method === option.method} onSelect={() => setFilters((current) => ({ ...current, method: option.method }))} />)}</div></div>
      <label className="range-label map-range"><span>Search radius <strong>{filters.radiusKm} km</strong></span><input type="range" min="1" max="10" value={filters.radiusKm} onChange={(event) => setFilters((current) => ({ ...current, radiusKm: Number(event.target.value) }))} /></label>
      <div className="location-actions"><button className="location-button map-location-button" onClick={requestNearbyLocation}><LocateFixed aria-hidden="true" />{locationStatus.startsWith("Live") ? "Live location active" : "Use my location"}</button><button className={`location-button manual-location-button ${manualPinMode ? "active" : ""}`} type="button" onClick={() => setManualPinMode((value) => !value)}><MapPinned aria-hidden="true" />{manualPinMode ? "Tap the map" : "Set on map"}</button></div>
      <details className="map-advanced-filters"><summary><ListFilter aria-hidden="true" />More filters</summary><label className="switch"><input type="checkbox" checked={filters.openNow} onChange={(event) => setFilters((current) => ({ ...current, openNow: event.target.checked }))} /><span>Open now only</span></label><label>Minimum rating<select value={filters.minRating} onChange={(event) => setFilters((current) => ({ ...current, minRating: Number(event.target.value) }))}><option value="0">Any rating</option><option value="4">4.0 and up</option><option value="4.5">4.5 and up</option></select></label><div className="manual-coordinate-fields"><span>Manual coordinates</span><div><input aria-label="Search latitude" type="number" step="any" min="-90" max="90" value={filters.latitude} onChange={(event) => setFilters((current) => ({ ...current, latitude: event.target.value }))} placeholder="Latitude" /><input aria-label="Search longitude" type="number" step="any" min="-180" max="180" value={filters.longitude} onChange={(event) => setFilters((current) => ({ ...current, longitude: event.target.value }))} placeholder="Longitude" /></div><button className="button outline" type="button" onClick={applyManualCoordinates}><MapPin aria-hidden="true" />Apply coordinates</button></div></details>
      <form className="map-ai-box" onSubmit={applyAiSuggestion}><span className="ai-spark"><Sparkles aria-hidden="true" /></span><input aria-label="Smart search" value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Try “cafe with GCash, open now”" /><button className="button primary" type="submit">Apply</button></form>
      {aiMessage && <div className="ai-result"><strong>{aiProvider}</strong><span>{aiMessage}</span></div>}
      {error && <div className="error-box" role="alert"><span><CircleAlert aria-hidden="true" />{error}</span><button className="text-button" type="button" onClick={retryResults}><RefreshCw aria-hidden="true" />Retry</button></div>}
      <div className="map-panel-footer"><span>{loading ? "Looking around..." : `${establishments.length} places nearby`}</span></div>
      <div className="map-sidebar-results"><div className="map-sidebar-results-heading"><span className="eyebrow">RESULTS</span><span>{establishments.length ? "Select a place to inspect its exact map location." : "Only administrator-verified stores are published here."}</span></div><div className="map-sidebar-results-list">
        {!loading && !error && establishments.length === 0 && <div className="map-empty-state"><MapPin aria-hidden="true" /><strong>{hasActiveFilters ? "No verified places match." : "No verified places published yet."}</strong><span>{hasActiveFilters ? "Clear the filters or increase the search radius." : "Business submissions remain private until a PayNear administrator verifies and publishes them."}</span>{hasActiveFilters && <button className="text-button" type="button" onClick={clearFilters}><RefreshCw aria-hidden="true" />Clear filters</button>}</div>}
        {!loading && establishments.map((place) => <PlaceCard key={place._id} place={place} selected={selected?._id === place._id} onClick={() => { openDetails(place); setMobilePanelOpen(false); }} favorite={favoriteIds.includes(place._id)} toggleFavorite={toggleFavorite} />)}
      </div></div>
    </aside>
  </section>;
}

function PlaceCard({ place, selected, onClick, favorite, toggleFavorite }) {
  return <article className={`place-card ${selected ? "selected" : ""}`}><button className="card-main" onClick={onClick}><img src={place.imageUrl || payNearEmblem} onError={handleStoreImageError} alt={`${place.name} storefront`} /><div className="card-copy"><div className="card-topline"><span>{place.category}</span><span>{place.distanceKm} km</span></div><h3>{place.name}</h3><p>{place.address}</p><div className="card-footer"><span className="rating"><Star aria-hidden="true" />{place.rating}</span>{place.openNow ? <span className="open">Open now</span> : <span className="closed">Closed</span>}<span className="card-payment-logos">{place.acceptedPaymentMethods.slice(0, 3).map((method) => <PaymentLogo key={method} method={method} compact />)}</span></div></div></button><button className={`favorite-button ${favorite ? "saved" : ""}`} aria-label={`${favorite ? "Remove" : "Save"} ${place.name}`} onClick={() => toggleFavorite(place._id)}><Heart aria-hidden="true" fill={favorite ? "currentColor" : "none"} /><span>{favorite ? "Saved" : "Save"}</span></button></article>;
}

function SavedPage({ user, savedPlaces, selected, openDetails, toggleFavorite, updatePreference, openDiscover, requestSignIn }) {
  if (!user) return <section className="simple-page"><span className="page-icon"><Bookmark aria-hidden="true" /></span><span className="eyebrow">YOUR LIST</span><h1>Save places for later.</h1><p>Sign in to keep favorite places and a payment preference across sessions.</p><button className="button primary" onClick={requestSignIn}><LogIn aria-hidden="true" />Sign in to save places</button></section>;
  return <section className="saved-page"><div className="page-heading"><span className="eyebrow"><Bookmark aria-hidden="true" />YOUR LIST</span><h1>Saved places</h1><p>Your search can start with {user.preferredPaymentMethod} when you are ready.</p></div><div className="saved-layout"><div className="saved-list">{savedPlaces.length ? savedPlaces.map((place) => <PlaceCard key={place._id} place={place} selected={selected?._id === place._id} onClick={() => openDetails(place)} favorite toggleFavorite={toggleFavorite} />) : <div className="empty-state"><Bookmark aria-hidden="true" /><h2>Nothing saved yet.</h2><p>Keep useful stores here for a faster next search.</p><button className="button primary" onClick={openDiscover}><Compass aria-hidden="true" />Discover places</button></div>}</div><div className="preference-card"><span className="eyebrow">PREFERENCE</span><h2>Payment method</h2><p>Set your default for a more relevant discovery screen.</p><select className="preference-select" aria-label="Preferred payment method" value={user.preferredPaymentMethod} onChange={(event) => updatePreference(event.target.value)}>{METHODS.map((method) => <option key={method}>{method}</option>)}</select></div></div></section>;
}

function PlaceDetailPage({ user, place, loading, reviews, myReview, reviewForm, setReviewForm, submitReview, removeReview, reviewBusy, toggleFavorite, favorite, openChat, sharePlace, goBack, requestSignIn }) {
  if (loading || !place) return <section className="simple-page"><RefreshCw className="spin" aria-hidden="true" /><h1>Loading verified place…</h1></section>;
  return <section className="place-detail-page">
    <button className="text-button detail-back" type="button" onClick={goBack}><ArrowLeft aria-hidden="true" />Back to Discover</button>
    <div className="place-detail-hero"><img src={place.imageUrl || payNearEmblem} onError={handleStoreImageError} alt={`${place.name} storefront`} /><div className="place-detail-copy"><span className="verify-badge"><CheckCircle2 aria-hidden="true" />Verified by PayNear</span><span className="eyebrow">{place.category}</span><h1>{place.name}</h1><p><MapPin aria-hidden="true" />{place.address}</p><div className="place-detail-stats"><span><Star aria-hidden="true" />{place.reviewCount ? `${place.rating} from ${place.reviewCount} review${place.reviewCount === 1 ? "" : "s"}` : "No reviews yet"}</span><span className={place.openNow ? "open" : "closed"}><Clock3 aria-hidden="true" />{place.openNow ? "Open now" : "Closed"}</span>{Number.isFinite(place.distanceKm) && <span>{place.distanceKm} km away</span>}</div><div className="place-detail-actions"><button className="button primary" onClick={() => openChat(place)}><MessageCircle aria-hidden="true" />Message store</button><button className={`button outline ${favorite ? "saved" : ""}`} onClick={() => toggleFavorite(place._id)}><Heart aria-hidden="true" fill={favorite ? "currentColor" : "none"} />{favorite ? "Saved" : "Save"}</button><button className="button outline" onClick={sharePlace}><Share2 aria-hidden="true" />Share</button></div></div></div>
    <div className="place-detail-grid"><article className="place-info-card"><h2>Accepted payments</h2><p>These methods are reported by the store and verified through PayNear moderation.</p><div className="detail-payment-grid">{place.acceptedPaymentMethods.map((method) => <PaymentLogo key={method} method={method} />)}</div><h2>Store contact</h2><p><strong>{place.ownerName || "Store representative"}</strong><br />{place.ownerTitle || "Listing contact"}</p></article><article className="reviews-card"><div className="reviews-heading"><div><span className="eyebrow">COMMUNITY REVIEWS</span><h2>What people say</h2></div><span>{reviews.length}</span></div>{user?.role === "user" ? <form className="review-form" onSubmit={submitReview}><label>Your rating<select value={reviewForm.rating} onChange={(event) => setReviewForm((current) => ({ ...current, rating: Number(event.target.value) }))}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} star{rating === 1 ? "" : "s"}</option>)}</select></label><label>Your review<textarea required minLength="3" maxLength="700" value={reviewForm.comment} onChange={(event) => setReviewForm((current) => ({ ...current, comment: event.target.value }))} placeholder="Share a useful, honest experience" /></label><div className="review-form-actions"><button className="button primary" disabled={reviewBusy}><Save aria-hidden="true" />{reviewBusy ? "Saving…" : myReview ? "Update review" : "Publish review"}</button>{myReview && <button className="text-button danger" type="button" disabled={reviewBusy} onClick={removeReview}><Trash2 aria-hidden="true" />Remove</button>}</div></form> : !user ? <div className="review-signin"><p>Sign in with a consumer account to write a review.</p><button className="button outline" onClick={requestSignIn}><LogIn aria-hidden="true" />Sign in</button></div> : null}<div className="review-list">{reviews.length ? reviews.map((review) => <article key={review._id} className="user-review"><div><strong>{review.userName}</strong><span><Star aria-hidden="true" />{review.rating}</span></div><p>{review.comment}</p><small>{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(review.updatedAt || review.createdAt))}</small></article>) : <div className="empty-state compact"><Star aria-hidden="true" /><h3>Be the first to review.</h3><p>Helpful reviews make nearby decisions easier.</p></div>}</div></article></div>
  </section>;
}

function ChatPage({ user, selected, conversations, activeConversationUserId, chooseConversation, messages, draft, setDraft, sendMessage, status, openDiscover, requestSignIn }) {
  if (!user) return <section className="simple-page"><span className="page-icon"><MessageCircle aria-hidden="true" /></span><span className="eyebrow">STORE MESSAGES</span><h1>Ask before you go.</h1><p>Sign in to confirm payment options or store details with a verified establishment.</p><button className="button primary" onClick={requestSignIn}><LogIn aria-hidden="true" />Sign in to chat</button></section>;
  if (!selected) return <section className="simple-page"><span className="page-icon"><MapPin aria-hidden="true" /></span><h1>{user.role === "owner" ? "No customer conversations yet." : "Choose a place first."}</h1><p>{user.role === "owner" ? "New customer messages will appear here." : "Return to Discover, choose a verified listing, then start a conversation."}</p>{user.role === "user" && <button className="button primary" onClick={openDiscover}><Compass aria-hidden="true" />Discover places</button>}</section>;
  return <section className="chat-page chat-workspace"><div className="conversation-list"><div><span className="eyebrow">MESSAGES</span><h2>Conversations</h2></div>{conversations.length ? conversations.map((conversation) => <button key={`${conversation.establishment._id}:${conversation.conversationUserId}`} className={String(conversation.establishment._id) === String(selected._id) && String(conversation.conversationUserId) === String(activeConversationUserId || user.id) ? "active" : ""} onClick={() => chooseConversation(conversation)}><img src={conversation.establishment.imageUrl || payNearEmblem} onError={handleStoreImageError} alt="" /><span><strong>{user.role === "owner" ? conversation.counterpartName : conversation.establishment.name}</strong><small>{conversation.lastMessage}</small></span><time>{formatTime(conversation.updatedAt)}</time></button>) : <p className="empty-note">Your conversations will appear here.</p>}</div><div className="chat-card"><div className="chat-header"><img src={selected.imageUrl || payNearEmblem} onError={handleStoreImageError} alt="" /><div><span className="eyebrow"><MessageCircle aria-hidden="true" />{user.role === "owner" ? "CUSTOMER CONVERSATION" : `CHAT WITH ${selected.ownerName || selected.name}`}</span><h1>{user.role === "owner" ? conversations.find((item) => item.conversationUserId === activeConversationUserId)?.counterpartName || selected.name : selected.name}</h1><p>{selected.name} · {status}</p></div></div><div className="messages">{messages.length === 0 ? <div className="chat-empty"><MessageCircle aria-hidden="true" />Start by asking whether GCash is accepted today.</div> : messages.map((message) => { const fromMe = String(message.senderUserId) === String(user.id); return <div key={message._id} className={`message ${fromMe ? "from-user" : "from-store"}`}><span>{fromMe ? "You" : message.senderName}</span><p>{message.body}</p><small>{formatTime(message.createdAt)}</small></div>; })}</div><form className="message-form" onSubmit={sendMessage}><input aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength="500" placeholder="Type a message..." /><button className="button primary"><Send aria-hidden="true" />Send</button></form></div></section>;
}

function StatusBadge({ status }) {
  const BadgeIcon = status === "verified" ? CheckCircle2 : status === "rejected" ? XCircle : status === "changes_requested" ? MessageSquareWarning : Clock3;
  return <span className={`status-badge status-${status}`}><BadgeIcon aria-hidden="true" />{String(status || "pending").replace("_", " ")}</span>;
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
    <button className="location-button" type="button" onClick={useCurrentLocation}><LocateFixed aria-hidden="true" />Use my current coordinates</button>
    <ListingLocationPicker
      latitude={listingForm.latitude}
      longitude={listingForm.longitude}
      onChange={(location) => setListingForm((current) => ({ ...current, ...location }))}
    />
    {showContact && <>
      <label>Listing contact<input required value={listingForm.ownerName} onChange={(event) => setListingForm((current) => ({ ...current, ownerName: event.target.value }))} placeholder="e.g. Jamie Cruz" /></label>
      <label>Contact role<input required value={listingForm.ownerTitle} onChange={(event) => setListingForm((current) => ({ ...current, ownerTitle: event.target.value }))} placeholder="e.g. Store owner" /></label>
    </>}
    <label className="store-image-field">Storefront image<input required type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setListingImage(event.target.files?.[0] || null)} /><small>JPG, PNG, or WebP; maximum 3 MB. Admins require an image before verification.</small></label>
    <label className="switch"><input type="checkbox" checked={listingForm.openNow} onChange={(event) => setListingForm((current) => ({ ...current, openNow: event.target.checked }))} /><span>Open now</span></label>
    <div className="choice-group"><span>Accepted payment methods</span><div className="chip-row">{METHODS.map((method) => <button type="button" key={method} className={listingForm.acceptedPaymentMethods.includes(method) ? "chip selected" : "chip"} onClick={() => toggleMethod(method)}>{method}</button>)}</div></div>
  </>;
}

function ListingEditor({ place, updateListing, actionBusy, admin = false }) {
  const [form, setForm] = useState(() => ({
    name: place.name,
    category: place.category,
    address: place.address,
    latitude: place.location?.coordinates?.[1] ?? "",
    longitude: place.location?.coordinates?.[0] ?? "",
    ownerName: place.ownerName || "",
    ownerTitle: place.ownerTitle || "",
    acceptedPaymentMethods: [...place.acceptedPaymentMethods],
    openNow: Boolean(place.openNow),
    isActive: Boolean(place.isActive),
  }));
  const toggleMethod = (method) => setForm((current) => ({
    ...current,
    acceptedPaymentMethods: current.acceptedPaymentMethods.includes(method)
      ? current.acceptedPaymentMethods.filter((item) => item !== method)
      : [...current.acceptedPaymentMethods, method],
  }));
  const submit = (event) => {
    event.preventDefault();
    updateListing(place._id, {
      ...form,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      ...(admin ? {} : { isActive: undefined, ownerName: undefined, ownerTitle: undefined }),
    });
  };
  return <details className="listing-editor-panel"><summary><Pencil aria-hidden="true" />Edit complete listing</summary><form className="listing-editor-form" onSubmit={submit}><div className="editor-field-grid"><label>Store name<input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label>Category<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{CATEGORIES.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label></div><label>Complete address<input required value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></label><div className="coordinate-grid"><label>Latitude<input required type="number" step="any" min="-90" max="90" value={form.latitude} onChange={(event) => setForm((current) => ({ ...current, latitude: event.target.value }))} /></label><label>Longitude<input required type="number" step="any" min="-180" max="180" value={form.longitude} onChange={(event) => setForm((current) => ({ ...current, longitude: event.target.value }))} /></label></div><ListingLocationPicker latitude={form.latitude} longitude={form.longitude} onChange={(location) => setForm((current) => ({ ...current, ...location }))} />{admin && <div className="editor-field-grid"><label>Listing contact<input required value={form.ownerName} onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))} /></label><label>Contact role<input required value={form.ownerTitle} onChange={(event) => setForm((current) => ({ ...current, ownerTitle: event.target.value }))} /></label></div>}<div className="choice-group"><span>Accepted payment methods</span><div className="chip-row">{METHODS.map((method) => <button type="button" key={method} className={form.acceptedPaymentMethods.includes(method) ? "chip selected" : "chip"} onClick={() => toggleMethod(method)}>{method}</button>)}</div></div><div className="editor-switches"><label className="switch"><input type="checkbox" checked={form.openNow} onChange={(event) => setForm((current) => ({ ...current, openNow: event.target.checked }))} /><span>Open now</span></label>{admin && <label className="switch"><input type="checkbox" checked={form.isActive} disabled={place.verificationStatus !== "verified"} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /><span>Published publicly</span></label>}</div>{!admin && <p className="editor-review-warning"><CircleAlert aria-hidden="true" />Changes to the name, category, address, location, or payments return this listing to administrator review.</p>}<button className="button primary" disabled={Boolean(actionBusy) || form.acceptedPaymentMethods.length === 0}><Save aria-hidden="true" />{actionBusy === `update:${place._id}` ? "Saving…" : "Save listing changes"}</button></form></details>;
}

function OwnerPage({ user, listingForm, setListingForm, createListing, listingImage, setListingImage, useCurrentLocation, listings, updateListing, uploadListingImage, message, submitting, actionBusy }) {
  if (user?.role !== "owner") return <section className="simple-page"><span className="page-icon"><Store aria-hidden="true" /></span><span className="eyebrow">BUSINESS AREA</span><h1>Business owner access is required.</h1><p>Register as a business owner to submit and manage your own store listings.</p></section>;
  return <section className="admin-page owner-page">
    <div className="page-heading"><span className="eyebrow"><Store aria-hidden="true" />BUSINESS OWNER AREA</span><h1>Submit your store</h1><p>Provide complete store information and a recognizable image. Your listing stays private until a PayNear administrator verifies and publishes it.</p></div>
    <div className="admin-grid">
      <form className="listing-form" onSubmit={createListing}>
        <h2><Building2 aria-hidden="true" />New store submission</h2>
        <div className="owner-account-note"><UserRound aria-hidden="true" /><span><strong>{user.name}</strong><span>Automatically recorded as the listing owner</span></span></div>
        <ListingFormFields listingForm={listingForm} setListingForm={setListingForm} listingImage={listingImage} setListingImage={setListingImage} useCurrentLocation={useCurrentLocation} />
        <button className="button primary" type="submit" disabled={submitting}><Send aria-hidden="true" />{submitting ? "Submitting securely…" : "Submit store for review"}</button>
        {message && <p className="form-message" role="status">{message}</p>}
      </form>
      <div className="admin-list">
        <div className="list-heading"><div><span className="eyebrow">SUBMISSIONS</span><h2>My listings</h2></div><span>{listings.length} total</span></div>
        {listings.length === 0 ? <div className="empty-state"><Store aria-hidden="true" /><h2>No store yet.</h2><p>Submit your first listing using the form.</p></div> : listings.map((place) => <article className="admin-row owner-listing-row" key={place._id}>
          <img src={place.imageUrl || payNearEmblem} onError={handleStoreImageError} alt="" />
          <div className="listing-summary"><div><strong>{place.name}</strong><StatusBadge status={place.verificationStatus} /></div><span>{place.category} · {place.address}</span><small>{place.isActive ? "Published publicly" : "Not visible to public users"}</small>{place.reviewNotes && <p className="review-note"><strong>Admin note:</strong> {place.reviewNotes}</p>}</div>
          <div className="admin-row-actions"><button className="text-button" disabled={Boolean(actionBusy)} onClick={() => updateListing(place._id, { openNow: !place.openNow })}><Clock3 aria-hidden="true" />{actionBusy === `update:${place._id}` ? "Updating…" : place.openNow ? "Mark closed" : "Mark open"}</button><label className={`upload-label ${actionBusy ? "disabled" : ""}`}><ImageUp aria-hidden="true" />{actionBusy === `image:${place._id}` ? "Uploading…" : "Replace image"}<input disabled={Boolean(actionBusy)} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadListingImage(place._id, event.target.files?.[0])} /></label></div><ListingEditor place={place} updateListing={updateListing} actionBusy={actionBusy} />
        </article>)}
      </div>
    </div>
  </section>;
}

function AdminPage({ user, listingForm, setListingForm, createListing, listingImage, setListingImage, useCurrentLocation, listings, updateListing, uploadListingImage, reviewListing, message, requestSignIn, submitting, actionBusy }) {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [notes, setNotes] = useState({});
  if (user?.role !== "admin") return <section className="simple-page"><span className="page-icon"><ShieldCheck aria-hidden="true" /></span><span className="eyebrow">ADMIN AREA</span><h1>Administrator access is required.</h1><p>Sign in with an administrator account provisioned by the PayNear team.</p><button className="button primary" onClick={requestSignIn}><LogIn aria-hidden="true" />Admin sign in</button></section>;
  const filteredListings = statusFilter === "all" ? listings : listings.filter((place) => place.verificationStatus === statusFilter);
  const pendingCount = listings.filter((place) => ["pending", "changes_requested"].includes(place.verificationStatus)).length;
  return <section className="admin-page moderation-page">
    <div className="page-heading"><span className="eyebrow"><ShieldCheck aria-hidden="true" />PROTECTED ADMIN AREA</span><h1>Review store submissions</h1><p>Only listings verified here become visible in public PayNear search and map results.</p></div>
    <div className="moderation-stats"><div><Clock3 aria-hidden="true" /><strong>{pendingCount}</strong><span>Needs review</span></div><div><CheckCircle2 aria-hidden="true" /><strong>{listings.filter((place) => place.verificationStatus === "verified").length}</strong><span>Verified</span></div><div><XCircle aria-hidden="true" /><strong>{listings.filter((place) => place.verificationStatus === "rejected").length}</strong><span>Rejected</span></div></div>
    {message && <p className="form-message moderation-message" role="status">{message}</p>}
    <div className="moderation-toolbar" role="group" aria-label="Filter submissions">{["pending", "changes_requested", "verified", "rejected", "all"].map((status) => <button key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>{status.replace("_", " ")}</button>)}</div>
    <div className="review-list">
      {filteredListings.length === 0 ? <div className="empty-state"><ListFilter aria-hidden="true" /><h2>No listings in this queue.</h2><p>Choose another status to inspect the directory.</p></div> : filteredListings.map((place) => <article className="review-card" key={place._id}>
        <img src={place.imageUrl || payNearEmblem} onError={handleStoreImageError} alt={`${place.name} storefront`} />
        <div className="review-card-body">
          <div className="review-card-heading"><div><StatusBadge status={place.verificationStatus} /><h2>{place.name}</h2><p>{place.ownerName || "Unassigned owner"} · {place.ownerTitle || "Listing contact"}</p></div><span>{place.category}</span></div>
          <dl><div><dt>Address</dt><dd>{place.address}</dd></div><div><dt>Coordinates</dt><dd>{place.location?.coordinates?.slice().reverse().join(", ") || "Missing"}</dd></div><div><dt>Payments</dt><dd>{place.acceptedPaymentMethods.join(", ")}</dd></div></dl>
          <label className="review-notes">Review notes<textarea maxLength="500" value={notes[place._id] ?? place.reviewNotes ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [place._id]: event.target.value }))} placeholder="Required when rejecting or requesting changes" /></label>
          <div className="review-actions"><button className="button primary" disabled={!place.imageUrl || Boolean(actionBusy)} onClick={() => reviewListing(place._id, "verify", notes[place._id] || "")}><CheckCircle2 aria-hidden="true" />{actionBusy === `verify:${place._id}` ? "Publishing…" : "Verify & publish"}</button><button className="button outline" disabled={Boolean(actionBusy)} onClick={() => reviewListing(place._id, "request_changes", notes[place._id] || "")}><MessageSquareWarning aria-hidden="true" />Request changes</button><button className="text-button danger" disabled={Boolean(actionBusy)} onClick={() => reviewListing(place._id, "reject", notes[place._id] || "")}><XCircle aria-hidden="true" />Reject</button><label className={`upload-label ${actionBusy ? "disabled" : ""}`}><ImageUp aria-hidden="true" />{actionBusy === `image:${place._id}` ? "Uploading…" : "Replace image"}<input disabled={Boolean(actionBusy)} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadListingImage(place._id, event.target.files?.[0])} /></label>{place.verificationStatus === "verified" && <button className="text-button" disabled={Boolean(actionBusy)} onClick={() => updateListing(place._id, { isActive: !place.isActive })}>{place.isActive ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}{actionBusy === `update:${place._id}` ? "Updating…" : place.isActive ? "Unpublish" : "Republish"}</button>}</div><ListingEditor place={place} updateListing={updateListing} actionBusy={actionBusy} admin />
        </div>
      </article>)}
    </div>
    <details className="manual-listing-panel"><summary><Plus aria-hidden="true" />Add a listing manually</summary><form className="listing-form" onSubmit={createListing}><h2><Building2 aria-hidden="true" />Administrator-created listing</h2><ListingFormFields listingForm={listingForm} setListingForm={setListingForm} listingImage={listingImage} setListingImage={setListingImage} useCurrentLocation={useCurrentLocation} showContact /><button className="button primary" type="submit" disabled={submitting}><Plus aria-hidden="true" />{submitting ? "Creating listing…" : "Create pending listing"}</button></form></details>
  </section>;
}

function AuthDialog({ mode, setMode, form, setForm, submit, error, close, submitting }) {
  const dialogRef = useRef(null);
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => dialogRef.current?.querySelector("input")?.focus(), 0);
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !submittingRef.current) close();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [close]);

  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => {
    if (event.target === event.currentTarget && !submitting) close();
  }}>
    <section ref={dialogRef} className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" aria-describedby="auth-description">
      <button className="modal-close" type="button" onClick={close} disabled={submitting} aria-label="Close"><X aria-hidden="true" /></button>
      <img className="auth-emblem" src={payNearEmblem} alt="" />
      <h2 id="auth-title">{mode === "login" ? "Welcome back" : "Create your PayNear account"}</h2>
      <p id="auth-description">{mode === "login" ? "Enter your PayNear email and password to continue." : "Choose a personal or business account. Business owners can submit and manage their own store listings."}</p>
      <form onSubmit={submit} aria-busy={submitting}>
        {mode === "register" && <>
          <label>Name<input required autoComplete="name" value={form.name} onChange={update("name")} /></label>
          <fieldset className="role-choice">
            <legend>Account type</legend>
            <label><input type="radio" name="role" value="user" checked={form.role === "user"} onChange={update("role")} /><UserRound aria-hidden="true" /><span><strong>User</strong><small>Search, save places, and chat with stores.</small></span></label>
            <label><input type="radio" name="role" value="owner" checked={form.role === "owner"} onChange={update("role")} /><Store aria-hidden="true" /><span><strong>Business owner</strong><small>Submit and manage only your own store listings.</small></span></label>
          </fieldset>
        </>}
        <label>Email<input type="email" required autoComplete="email" value={form.email} onChange={update("email")} /></label>
        <label>Password<input type="password" minLength="8" required autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChange={update("password")} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary full auth-submit-button" type="submit" disabled={submitting}>{mode === "login" ? <LogIn aria-hidden="true" /> : <UserRoundPlus aria-hidden="true" />}{submitting ? (mode === "login" ? "Signing in…" : "Creating account…") : mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      {mode === "login" && <p className="admin-access-note">Administrator accounts are issued privately by the PayNear team and cannot be created here.</p>}
      <p className="auth-switch">{mode === "login" ? "New here?" : "Already have an account?"} <button type="button" disabled={submitting} onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Register" : "Sign in"}</button></p>
    </section>
  </div>;
}

export default App;
