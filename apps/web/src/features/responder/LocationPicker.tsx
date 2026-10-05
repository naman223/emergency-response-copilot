import { useEffect, useRef, useState } from "react";
import type { ReviewDraft, SourceLocation } from "@copilot/contracts";
import {
  loadGoogleMaps,
  type MapInstance,
  type MapsApi,
  type Point,
} from "./google-maps";
type Selection = { point: Point; description: string };
export function LocationPicker({
  description,
  selectedLocation,
  deviceLocation,
  disabled,
  onSelect,
}: {
  description: string;
  selectedLocation?: ReviewDraft["selectedLocation"];
  deviceLocation?: SourceLocation;
  disabled: boolean;
  onSelect: (
    description: string,
    location: NonNullable<ReviewDraft["selectedLocation"]>,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(description);
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [ready, setReady] = useState(false);
  const [candidate, setCandidate] = useState<Selection>();
  const [results, setResults] = useState<Selection[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<MapsApi | undefined>(undefined);
  const map = useRef<MapInstance | undefined>(undefined);
  const info = useRef<InstanceType<MapsApi["InfoWindow"]> | undefined>(
    undefined,
  );
  const sequence = useRef(0);
  const locked = useRef(disabled);
  locked.current = disabled;
  function select(selection: Selection) {
    if (locked.current) return;
    sequence.current++;
    setSearching(false);
    setCandidate(selection);
    setResults([]);
    setMessage(
      "Check the selected point, then confirm it as the incident location.",
    );
    map.current?.panTo(selection.point);
    map.current?.setZoom(17);
    info.current?.setPosition(selection.point);
    info.current?.setContent("Selected incident point");
    if (map.current) info.current?.open({ map: map.current });
  }
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let listener: { remove(): void } | undefined;
    const authFailure = () => {
      setReady(false);
      setMessage(
        "Google Maps access was denied. Enter the location above or use the external map link.",
      );
    };
    window.addEventListener("copilot-maps-auth-error", authFailure);
    setMessage("Loading Google Maps…");
    loadGoogleMaps()
      .then((maps) => {
        if (disposed || !host.current) return;
        api.current = maps;
        const center = selectedLocation ?? deviceLocation;
        map.current = new maps.Map(host.current, {
          center: center
            ? { lat: center.latitude, lng: center.longitude }
            : { lat: 20, lng: 0 },
          zoom: center ? 16 : 2,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "cooperative",
        });
        info.current = new maps.InfoWindow();
        listener = map.current.addListener("click", (event) => {
          if (!event.latLng) return;
          const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
          select({
            point,
            description: `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`,
          });
        });
        setReady(true);
        setMessage(
          center && !selectedLocation
            ? "Map centered on device GPS only. Search or click to select the incident location."
            : "Search an address or click the map to select the incident location.",
        );
      })
      .catch((error) => {
        if (!disposed) setMessage(error.message);
      });
    return () => {
      disposed = true;
      sequence.current++;
      listener?.remove();
      info.current?.close();
      map.current = undefined;
      window.removeEventListener("copilot-maps-auth-error", authFailure);
    };
  }, [open]);
  async function search() {
    if (!api.current || !query.trim() || disabled) return;
    const request = ++sequence.current;
    setSearching(true);
    setCandidate(undefined);
    setResults([]);
    info.current?.close();
    setMessage("Searching for the address…");
    try {
      const response = await new api.current.Geocoder().geocode({
        address: query.trim(),
      });
      if (request !== sequence.current) return;
      setResults(
        response.results.slice(0, 5).map((result) => ({
          point: {
            lat: result.geometry.location.lat(),
            lng: result.geometry.location.lng(),
          },
          description: result.formatted_address.slice(0, 500),
        })),
      );
      setMessage(
        response.results.length
          ? "Choose a result, check its position, and confirm the incident location."
          : "No address matched. Add a city or select a point on the map.",
      );
    } catch {
      if (request === sequence.current)
        setMessage(
          "Address search was unavailable. Refine the address or select a point on the map.",
        );
    } finally {
      if (request === sequence.current) setSearching(false);
    }
  }
  return (
    <div className="location-picker">
      <button
        className="secondary"
        type="button"
        disabled={disabled}
        onClick={() => {
          setQuery(description);
          setOpen((value) => !value);
          setReady(false);
          setSearching(false);
          setCandidate(undefined);
          setResults([]);
        }}
      >
        {" "}
        {open ? "Close location map" : "Select incident location on map"}
      </button>
      {selectedLocation && (
        <p className="hint">
          Map-selected point: {selectedLocation.latitude.toFixed(6)},{" "}
          {selectedLocation.longitude.toFixed(6)}
        </p>
      )}
      {open && (
        <>
          <label className="field">
            Search incident address
            <input
              value={query}
              maxLength={500}
              disabled={disabled}
              onChange={(event) => {
                sequence.current++;
                setSearching(false);
                setQuery(event.target.value);
                setResults([]);
                setCandidate(undefined);
                info.current?.close();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void search();
                }
              }}
            />
          </label>
          <button
            className="secondary"
            type="button"
            disabled={disabled || !ready || searching || !query.trim()}
            onClick={() => void search()}
          >
            Search address
          </button>
          <p className="hint" role="status">
            {message}
          </p>
          <div
            ref={host}
            className="incident-location-map"
            aria-label="Incident location map"
          />
          {results.length > 0 && (
            <ul className="map-results">
              {results.map((result, index) => (
                <li key={index}>
                  <button
                    className="secondary"
                    type="button"
                    disabled={disabled}
                    onClick={() => select(result)}
                  >
                    {result.description}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {candidate && (
            <div className="map-selection">
              <p>{candidate.description}</p>
              <p className="hint">
                {candidate.point.lat.toFixed(6)},{" "}
                {candidate.point.lng.toFixed(6)}
              </p>
              <button
                type="button"
                className="primary"
                disabled={disabled || !ready}
                onClick={() => {
                  onSelect(candidate.description, {
                    latitude: candidate.point.lat,
                    longitude: candidate.point.lng,
                    source: "map",
                    selectedAt: new Date().toISOString(),
                  });
                  setOpen(false);
                }}
              >
                Confirm this incident location
              </button>
            </div>
          )}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(description || "map")}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Google Maps in a new tab
          </a>
          <p className="hint">
            Address searches are sent to Google Maps. The incident narrative is
            not shared with Maps.
          </p>
        </>
      )}
    </div>
  );
}
