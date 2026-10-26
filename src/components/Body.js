import RestaurantCard from "./RestaurantCard";
import { useEffect, useMemo, useState } from "react";
import Shimmer from "./Shimmer";
import { Link } from "react-router-dom";
import useOnlineStatus from "../utilis/useOnlineStatus";

import { apiUrl } from "../config/api";
import { STORAGE } from "../utilis/constants";
import { readJSON, writeJSON } from "../utilis/storage";
const SEARCH_RADIUS = 7000;

const cuisineCategories = [
  ["Pizza", "🍕"], ["Biryani", "🍛"], ["Burger", "🍔"], ["Dosa", "🥞"],
  ["Chinese", "🥡"], ["Cakes", "🍰"], ["Rolls", "🌯"], ["Thali", "🍱"],
  ["Coffee", "☕"], ["Desserts", "🍨"],
];

const toRad = (value) => (value * Math.PI) / 180;
const distanceInKm = (lat1, lon1, lat2, lon2) => {
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const splitCuisine = (value, amenity) => {
  if (value) return value.split(/[;,]/).map((x) => x.trim().replaceAll("_", " ")).filter(Boolean).slice(0, 4);
  if (amenity === "cafe") return ["Cafe", "Beverages"];
  if (amenity === "fast_food") return ["Fast Food", "Snacks"];
  if (amenity === "food_court") return ["Food Court", "Indian"];
  return ["Indian", "North Indian"];
};

const formatAddress = (tags) => {
  const parts = [tags["addr:suburb"], tags["addr:city"]].filter(Boolean);
  return parts.join(", ") || tags["addr:street"] || tags["addr:full"] || "Near you";
};


const fallbackPlaces = (latitude, longitude) => {
  const names = [
    ["Blue Bowl Kitchen", "restaurant", ["North Indian", "Biryani"]],
    ["Rush Burger Co.", "fast_food", ["Burgers", "Fast Food"]],
    ["The Daily Dosa", "restaurant", ["South Indian", "Dosa"]],
    ["Cafe Cloud Nine", "cafe", ["Cafe", "Beverages"]],
    ["Spice Route", "restaurant", ["Indian", "Chinese"]],
    ["Pizza District", "fast_food", ["Pizza", "Italian"]],
    ["Chai & Bites", "cafe", ["Tea", "Snacks"]],
    ["FoodRush Food Court", "food_court", ["Indian", "Fast Food"]],
  ];
  return names.map(([name, amenity, cuisines], i) => ({ info: {
    id: `fallback-${i + 1}`, name, amenity, cuisines, address: "Popular near your selected area",
    distanceKm: 0.8 + i * 0.55, lat: latitude + (i + 1) * 0.001, lon: longitude + (i + 1) * 0.001,
    sla: { deliveryTime: 18 + i * 3 }, openingHours: "Hours vary", openStatus: i%3===0?"open":"unknown", costForTwo: 220 + (i%5)*80, avgRating: Number((4.0 + (i%8)/10).toFixed(1)), isFallback: true,
  }}));
};

const normalizePlaces = (elements, latitude, longitude) =>
  (elements || []).map((element) => {
    const tags = element.tags || {};
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!lat || !lon || !tags.name) return null;
    const distance = distanceInKm(latitude, longitude, lat, lon);
    const id = `${element.type}-${element.id}`;
    return {
      info: {
        id,
        osmType: element.type,
        osmId: element.id,
        name: tags.name,
        cuisines: splitCuisine(tags.cuisine, tags.amenity),
        amenity: tags.amenity,
        address: formatAddress(tags),
        distanceKm: distance,
        openingHours: tags.opening_hours || "Hours not listed",
        openStatus: tags.opening_hours === "24/7" ? "open" : "unknown",
        costForTwo: 220 + ((String(element.id).length % 5) * 80),
        avgRating: Number((3.9 + (Number(String(element.id).slice(-1)) % 10)/10).toFixed(1)),
        phone: tags.phone || tags["contact:phone"] || "",
        website: tags.website || tags["contact:website"] || "",
        takeaway: tags.takeaway || "",
        delivery: tags.delivery || "",
        vegetarian: tags["diet:vegetarian"] || "",
        lat,
        lon,
        sla: { deliveryTime: Math.max(15, Math.round(distance * 5 + 12)) },
      },
    };
  }).filter(Boolean).sort((a, b) => a.info.distanceKm - b.info.distanceKm).slice(0, 60);

const Body = () => {
  const cachedPlaces = readJSON("foodrush_last_places", []);
  const [restaurants, setRestaurants] = useState(cachedPlaces);
  const [filtered, setFiltered] = useState(cachedPlaces);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locationName, setLocationName] = useState("Detecting your location...");
  const [coords, setCoords] = useState(null);
  const [areaText, setAreaText] = useState("");
  const [areaSearching, setAreaSearching] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");
  const [sortBy,setSortBy]=useState("relevance");
  const [vegOnly,setVegOnly]=useState(false);
  const [openOnly,setOpenOnly]=useState(false);
  const [fastOnly,setFastOnly]=useState(false);
  const [budgetOnly,setBudgetOnly]=useState(false);
  const [recentSearches,setRecentSearches]=useState(()=>readJSON(STORAGE.RECENT_SEARCHES,[]));
  const onlineStatus = useOnlineStatus();

  useEffect(() => { useMyLocation(); }, []);

  const reverseGeocode = async (lat, lon) => {
    try {
      const r = await fetch(apiUrl(`/api/reverse?lat=${lat}&lon=${lon}`));
      if (!r.ok) return;
      const data = await r.json();
      const a = data?.address || {};
      const locality = a.suburb || a.neighbourhood || a.city_district || a.city || a.town || a.village;
      const city = a.city || a.town || a.village || a.state_district;
      setLocationName([locality, city].filter((v, i, arr) => v && arr.indexOf(v) === i).join(", ") || "Current location");
    } catch (_) { setLocationName("Current location"); }
  };

  const fetchNearby = async (lat, lon) => {
    setLoading(true); setError("");
    try {
      const r = await fetch(apiUrl(`/api/nearby?lat=${lat}&lon=${lon}&radius=${SEARCH_RADIUS}`));
      if (!r.ok) throw new Error();
      const data = await r.json();
      const items = normalizePlaces(data?.elements, lat, lon);
      setRestaurants(items); setFiltered(items); writeJSON("foodrush_last_places", items); setActiveFilter("all"); setSearchText("");
      if (!items.length) setError("No restaurants found nearby. Try another area.");
    } catch (_) {
      const cached = readJSON("foodrush_last_places", []);
      const picks = cached.length ? cached : fallbackPlaces(lat, lon);
      setRestaurants(picks); setFiltered(picks); setActiveFilter("all"); setSearchText("");
      setError("Live nearby service is temporarily unavailable, so FoodRush is showing popular picks for this area.");
    } finally { setLoading(false); }
  };

  const setAndLoadLocation = async (lat, lon) => {
    setCoords({ latitude: lat, longitude: lon });
    reverseGeocode(lat, lon);
    await fetchNearby(lat, lon);
  };

  const useMyLocation = () => {
    setError(""); setLoading(true); setLocationName("Detecting your location...");
    if (!navigator.geolocation) { setLoading(false); setError("Location is not supported. Search your area manually."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setAndLoadLocation(p.coords.latitude, p.coords.longitude),
      () => { setLoading(false); setLocationName("Choose delivery location"); setError("Allow location access or search your area below."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  const searchArea = async (e) => {
    e.preventDefault();
    const q = areaText.trim(); if (!q) return;
    setAreaSearching(true); setError("");
    try {
      const r = await fetch(apiUrl(`/api/geocode?q=${encodeURIComponent(q)}`));
      if (!r.ok) throw new Error();
      const results = await r.json();
      if (!results.length) { setError("Location not found. Try locality + city."); return; }
      const lat = Number(results[0].lat), lon = Number(results[0].lon);
      setLocationName(results[0].display_name.split(",").slice(0, 2).join(", "));
      setCoords({ latitude: lat, longitude: lon });
      await fetchNearby(lat, lon);
    } catch (_) { setError("Location search failed. Please try again."); }
    finally { setAreaSearching(false); }
  };

  const applyFilters = (text = searchText, type = activeFilter, sort = sortBy, veg = vegOnly, open = openOnly, fast = fastOnly, budget = budgetOnly) => {
    const q = text.toLowerCase().trim();
    let next = restaurants.filter(({ info }) => {
      const typeOk = type === "all" || info.amenity === type;
      const vegOk = !veg || info.vegetarian === "yes" || (info.cuisines||[]).some(c=>/veg|south indian|jain/i.test(c));
      const openOk = !open || info.openStatus === "open";
      const fastOk = !fast || (info.sla?.deliveryTime||99) <= 30;
      const budgetOk = !budget || (info.costForTwo||999) <= 300;
      const haystack = `${info.name} ${(info.cuisines || []).join(" ")} ${info.address}`.toLowerCase();
      return typeOk && vegOk && openOk && fastOk && budgetOk && (!q || haystack.includes(q));
    });
    if(sort==="nearest") next=[...next].sort((a,b)=>a.info.distanceKm-b.info.distanceKm);
    if(sort==="rating") next=[...next].sort((a,b)=>(Number(b.info.avgRating)||4.2)-(Number(a.info.avgRating)||4.2));
    if(sort==="fast") next=[...next].sort((a,b)=>(a.info.sla?.deliveryTime||99)-(b.info.sla?.deliveryTime||99));
    setFiltered(next);
  };

  const rememberSearch=(value)=>{const q=value.trim();if(!q)return;const next=[q,...recentSearches.filter(x=>x.toLowerCase()!=q.toLowerCase())].slice(0,6);setRecentSearches(next);writeJSON(STORAGE.RECENT_SEARCHES,next);};
  const filterCuisine = (name) => {
    setSearchText(name);
    rememberSearch(name);
    applyFilters(name, "all", sortBy, vegOnly, openOnly);
    document.getElementById("restaurants")?.scrollIntoView({ behavior: "smooth" });
  };

  const quickFilters = [
    ["all", "All"], ["fast_food", "Fast delivery"], ["restaurant", "Restaurants"], ["cafe", "Cafes"], ["food_court", "Food courts"]
  ];
  const resultCount = useMemo(() => filtered.length, [filtered]);

  return (
    <main className="fr-page">
      {!onlineStatus && <div className="fr-alert">You are offline. Showing your last available FoodRush results.</div>}
      <section className="fr-hero">
        <div className="fr-hero-content">
          <p className="fr-kicker">FAST. FRESH. FOODRUSH.</p>
          <h1>Hungry? We’ve got you.</h1>
          <p>Discover the best food and restaurants around you.</p>

          <div className="fr-location-box">
            <div className="fr-current-location"><span>📍</span><div><small>DELIVERING TO</small><strong>{locationName}</strong></div></div>
            <button type="button" onClick={useMyLocation}>Use current location</button>
          </div>

          <form className="fr-area-search" onSubmit={searchArea}>
            <input value={areaText} onChange={(e) => setAreaText(e.target.value)} placeholder="Enter your delivery location" />
            <button type="submit" disabled={areaSearching}>{areaSearching ? "Finding..." : "Find food"}</button>
          </form>
        </div>
        <div className="fr-hero-visual" aria-hidden="true">
          <div className="fr-food-orbit fr-o1">🍕</div><div className="fr-food-orbit fr-o2">🍔</div><div className="fr-food-orbit fr-o3">🥗</div>
          <div className="fr-main-bowl">🍜</div>
        </div>
      </section>

      {error && <div className="fr-alert">{error}{coords && <button onClick={() => fetchNearby(coords.latitude, coords.longitude)}>Retry</button>}</div>}

      <section className="fr-section">
        <div className="fr-section-title"><h2>What’s on your mind?</h2><span>Explore cuisines</span></div>
        <div className="fr-cuisine-row">
          {cuisineCategories.map(([name, emoji]) => <button key={name} onClick={() => filterCuisine(name)}><span>{emoji}</span><b>{name}</b></button>)}
        </div>
      </section>

      <section className="fr-offer-strip">
        <div><small>FOODRUSH SPECIAL</small><strong>Up to 60% OFF</strong><span>on delicious favourites near you</span></div>
        <div className="fr-offer-code">Use code <b>RUSH60</b></div>
      </section>

      <section className="fr-section" id="restaurants">
        <div className="fr-section-title"><div><h2>Restaurants with online food delivery</h2><p>{coords ? `Near ${locationName}` : "Choose a location"}</p></div><span>{resultCount} places</span></div>

        <div className="fr-searchbar"><span>⌕</span><input list="fr-search-suggestions" value={searchText} onBlur={()=>rememberSearch(searchText)} onChange={(e) => { setSearchText(e.target.value); applyFilters(e.target.value, activeFilter, sortBy, vegOnly, openOnly); }} placeholder="Search for restaurants and food" /><datalist id="fr-search-suggestions">{restaurants.slice(0,30).map(r=><option key={r.info.id} value={r.info.name}/>)}{[...new Set(restaurants.flatMap(r=>r.info.cuisines||[]))].slice(0,20).map(c=><option key={c} value={c}/>)}</datalist>{searchText && <button aria-label="Clear restaurant search" onClick={() => { setSearchText(""); applyFilters("", activeFilter, sortBy, vegOnly, openOnly); }}>×</button>}</div>

        {recentSearches.length>0 && !searchText && <div className="fr-recent-searches"><small>Recent</small>{recentSearches.map(x=><button key={x} onClick={()=>{setSearchText(x);applyFilters(x);}}>↺ {x}</button>)}</div>}

        <div className="fr-filter-row">
          {quickFilters.map(([value, label]) => <button key={value} className={activeFilter === value ? "active" : ""} onClick={() => { setActiveFilter(value); applyFilters(searchText, value, sortBy, vegOnly, openOnly); }}>{label}</button>)}
          <button className={vegOnly?"active":""} onClick={()=>{const v=!vegOnly;setVegOnly(v);applyFilters(searchText,activeFilter,sortBy,v,openOnly)}}>Pure veg</button>
          <button className={openOnly?"active":""} onClick={()=>{const v=!openOnly;setOpenOnly(v);applyFilters(searchText,activeFilter,sortBy,vegOnly,v,fastOnly,budgetOnly)}}>Open 24/7</button>
          <button className={fastOnly?"active":""} onClick={()=>{const v=!fastOnly;setFastOnly(v);applyFilters(searchText,activeFilter,sortBy,vegOnly,openOnly,v,budgetOnly)}}>Under 30 min</button>
          <button className={budgetOnly?"active":""} onClick={()=>{const v=!budgetOnly;setBudgetOnly(v);applyFilters(searchText,activeFilter,sortBy,vegOnly,openOnly,fastOnly,v)}}>Under ₹300</button>
          <select aria-label="Sort restaurants" value={sortBy} onChange={e=>{setSortBy(e.target.value);applyFilters(searchText,activeFilter,e.target.value,vegOnly,openOnly)}}><option value="relevance">Sort: Relevance</option><option value="nearest">Nearest</option><option value="rating">Top rated</option><option value="fast">Fastest delivery</option></select>
        </div>

        {loading ? <Shimmer /> : (
          <div className="fr-restaurant-grid">
            {filtered.length ? filtered.map((restaurant) => (
              <Link key={restaurant.info.id} to={`/restaurant/${restaurant.info.id}`} state={{ restaurant }} onClick={() => { try { sessionStorage.setItem("foodrush_selected_restaurant", JSON.stringify(restaurant)); } catch (_) {} }}><RestaurantCard resData={restaurant} /></Link>
            )) : <div className="fr-empty"><span>🍽️</span><h3>No matching restaurants</h3><p>Try another cuisine, restaurant name, or delivery location.</p></div>}
          </div>
        )}
      </section>
    </main>
  );
};

export default Body;
