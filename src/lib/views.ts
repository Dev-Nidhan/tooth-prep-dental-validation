export const VIEWS = [
  { id: "occlusal", label: "Occlusal", hint: "Straight down on the table. Keep the whole outline in frame." },
  { id: "buccal", label: "Buccal", hint: "Finish line and a probe or bur, in the same plane as the lens." },
  { id: "lingual", label: "Lingual", hint: "Same as buccal. Keep the mirror edge off the margin." },
  { id: "mesial", label: "Mesial", hint: "Proximal wall and finish line. Retract the neighbour." },
  { id: "distal", label: "Distal", hint: "The view that gets skipped. Show the finish line, not just the contact." },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];

export function nextView(view: ViewId): ViewId {
  const index = VIEWS.findIndex((item) => item.id === view);
  return VIEWS[(index + 1) % VIEWS.length].id;
}
