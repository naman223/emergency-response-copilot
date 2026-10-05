import type { Incident, ReviewDraft } from "@copilot/contracts";
import {
  recommendedServices,
  routingServices,
  primaryRouting,
} from "@copilot/contracts";

const fields = [
  "summary",
  "urgency",
  "routing",
  "locationDescription",
] as const;
export function prefillReview(incident: Incident): ReviewDraft {
  const suggestions: ReviewDraft = {
    summary:
      incident.assessment?.summary ??
      incident.brief?.explanation ??
      incident.reportText ??
      incident.sourceTranscript?.slice(0, 2000) ??
      "Report received. Details remain unknown; review the original recording and clarification history.",
    urgency:
      incident.assessment?.urgency ?? incident.brief?.urgency ?? "unclear",
    routing:
      incident.assessment?.routing ?? incident.brief?.routing ?? "unclear",
    services: recommendedServices(incident),
    locationDescription:
      incident.assessment?.locationDescription ??
      incident.locationDescription ??
      "",
    confirmedFields: [],
    editedFields: [],
  };
  suggestions.routing = primaryRouting(suggestions.services ?? []);
  const saved = incident.reviewDraft;
  if (!saved) return suggestions;
  // Reviews saved before field provenance was introduced remain human-owned.
  const edited = saved.editedFields ?? [...fields];
  const next = { ...suggestions, editedFields: edited };
  for (const field of fields)
    if (edited.includes(field)) Object.assign(next, { [field]: saved[field] });
  if (edited.includes("services"))
    next.services = saved.services ?? routingServices(saved.routing);
  else if (edited.includes("routing"))
    next.services = routingServices(saved.routing);
  next.routing = primaryRouting(next.services ?? []);
  next.confirmedFields = saved.confirmedFields.filter(
    (field) => next[field] === saved[field],
  );
  if (
    next.locationDescription === saved.locationDescription &&
    saved.selectedLocation
  )
    next.selectedLocation = saved.selectedLocation;
  if (
    next.locationDescription === saved.locationDescription &&
    next.routing === saved.routing &&
    JSON.stringify(next.services) ===
      JSON.stringify(saved.services ?? routingServices(saved.routing)) &&
    next.confirmedFields.includes("locationDescription") &&
    saved.destinationName
  )
    next.destinationName = saved.destinationName;
  return next;
}
