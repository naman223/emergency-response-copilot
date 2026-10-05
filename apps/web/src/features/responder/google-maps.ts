export type Point = { lat: number; lng: number };
type LatLng = { lat(): number; lng(): number };
export type MapInstance = {
  panTo(point: Point): void;
  setZoom(zoom: number): void;
  addListener(
    event: string,
    callback: (event: { latLng?: LatLng }) => void,
  ): { remove(): void };
};
export type GeocodeResult = {
  formatted_address: string;
  geometry: { location: LatLng };
};
export type MapsApi = {
  Map: new (element: HTMLElement, options: object) => MapInstance;
  InfoWindow: new () => {
    setPosition(point: Point): void;
    setContent(content: string | HTMLElement): void;
    open(options: { map: MapInstance }): void;
    close(): void;
  };
  Geocoder: new () => {
    geocode(request: {
      address: string;
    }): Promise<{ results: GeocodeResult[] }>;
  };
};
declare global {
  interface Window {
    google?: { maps: MapsApi };
    __copilotMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}
let loading: Promise<MapsApi> | undefined;
export function loadGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key)
    return Promise.reject(
      Error(
        "The map picker is not configured. Enter the location above or open Google Maps.",
      ),
    );
  loading = new Promise<MapsApi>((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject(
        Error(
          "Google Maps could not load. You can still enter a location and send the review.",
        ),
      );
    };
    const timer = setTimeout(fail, 15000);
    window.__copilotMapsReady = () => {
      if (settled) return;
      if (!window.google?.maps?.Map) return fail();
      settled = true;
      clearTimeout(timer);
      resolve(window.google.maps);
    };
    window.gm_authFailure = () => {
      fail();
      window.dispatchEvent(new Event("copilot-maps-auth-error"));
    };
    const query = new URLSearchParams({
      key,
      loading: "async",
      callback: "__copilotMapsReady",
      v: "quarterly",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${query}`;
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}
