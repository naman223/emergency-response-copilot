import { z } from "zod";
import type { Incident, ReviewDraft } from "./incident";

export const serviceSchema = z.enum(["police", "medical", "fire", "emergency"]);
export type ResponseService = z.infer<typeof serviceSchema>;
export const responseServices = serviceSchema.options;
export const serviceLabels: Record<ResponseService, string> = {
  police: "Police",
  medical: "Medical",
  fire: "Fire",
  emergency: "Emergency",
};
export const serviceSelectionsSchema = z
  .array(serviceSchema)
  .max(4)
  .refine(
    (values) => new Set(values).size === values.length,
    "Select each service only once.",
  );
export const simulatedSmsSchema = z.strictObject({
  id: z.uuid(),
  service: serviceSchema,
  body: z.string().min(1).max(1600),
  detailsUrl: z.url(),
  status: z.literal("simulated_sent"),
});
export type SmsPreview = {
  service: ResponseService;
  body: string;
  detailsUrl: string;
};

export function routingServices(
  routing: ReviewDraft["routing"],
): ResponseService[] {
  return routing === "unclear"
    ? []
    : [routing === "other" ? "emergency" : routing];
}
export function selectedServices(draft: ReviewDraft): ResponseService[] {
  const selected = draft.services ?? routingServices(draft.routing);
  return responseServices.filter((service) => selected.includes(service));
}
export function primaryRouting(
  services: ResponseService[],
): ReviewDraft["routing"] {
  const first = responseServices.find((service) => services.includes(service));
  return first === "emergency" ? "other" : (first ?? "unclear");
}
export function recommendedServices(incident: Incident): ResponseService[] {
  const indicators = incident.assessment?.indicators;
  const routing =
    incident.assessment?.routing ?? incident.brief?.routing ?? "unclear";
  if (!indicators) return routingServices(routing);
  const selected = responseServices.filter(
    (service) =>
      indicators[service]?.status === "yes" ||
      (service === "medical" && indicators.ambulance?.status === "yes"),
  );
  // The primary model recommendation remains useful for older or partial assessments.
  for (const service of routingServices(routing))
    if (indicators[service]?.status !== "no" && !selected.includes(service))
      selected.push(service);
  return responseServices.filter((service) => selected.includes(service));
}
export function buildSmsPreviews(
  id: string,
  draft: ReviewDraft,
  origin: string,
): SmsPreview[] {
  const summary = draft.summary.replace(/\s+/g, " ").trim();
  const brief = summary.length > 240 ? `${summary.slice(0, 237)}…` : summary;
  const location = draft.locationDescription.trim() || "Unknown";
  const verified =
    draft.confirmedFields.includes("locationDescription") &&
    !!draft.locationDescription.trim();
  const urgency =
    draft.urgency === "urgent_review"
      ? "URGENT"
      : draft.urgency === "standard_review"
        ? "STANDARD"
        : "UNDETERMINED";
  return selectedServices(draft).map((service) => {
    const url = new URL("/", origin);
    url.searchParams.set("incident", id);
    url.searchParams.set("service", service);
    const detailsUrl = url.toString();
    return {
      service,
      detailsUrl,
      body: [
        "[SIMULATION ONLY — no real SMS sent]",
        `To: ${serviceLabels[service]} | ${urgency} | Incident ${id.slice(0, 8).toUpperCase()}`,
        `Location: ${location} (${verified ? "reviewer verified" : "not verified"})`,
        ...(draft.selectedLocation
          ? [
              `${draft.selectedLocation.source === "device" ? "Device GPS" : "Map pin"}: ${draft.selectedLocation.latitude.toFixed(6)}, ${draft.selectedLocation.longitude.toFixed(6)}`,
              ...(draft.selectedLocation.source === "device" &&
              draft.selectedLocation.accuracyMeters !== undefined
                ? [
                    `GPS accuracy: ±${Math.round(draft.selectedLocation.accuracyMeters)} m`,
                  ]
                : []),
            ]
          : []),
        `Report: ${brief}`,
        `Services: ${selectedServices(draft)
          .map((s) => serviceLabels[s])
          .join(", ")}`,
        ...(draft.destinationName?.trim() &&
        service === selectedServices(draft)[0]
          ? [`Reviewer-selected destination: ${draft.destinationName.trim()}`]
          : []),
        `Details & clarifications (demo session access): ${detailsUrl}`,
      ].join("\n"),
    };
  });
}
