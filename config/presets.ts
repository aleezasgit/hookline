import type { Aspect, ModelKey, PresetCategory } from "@/lib/types";

export interface Preset {
  key: string;
  name: string;
  category: PresetCategory;
  description: string;
  template: string;
  styleSuffix: string;
  defaultModel: ModelKey;
  defaultAspect: Aspect;
  placeholder: string; // prompt box placeholder on Create
}

export const PRESETS: Preset[] = [
  // Camera
  { key: "crash-zoom", name: "Crash Zoom", category: "camera",
    description: "A sudden fast zoom straight into the subject",
    template: "{subject}. The camera starts wide and performs a sudden, fast crash zoom straight into the subject, then settles.",
    styleSuffix: "Dramatic fast zoom-in, cinematic lighting, sharp focus, high energy.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A sneaker on a wet street at night" },
  { key: "dolly-in", name: "Dolly In", category: "camera",
    description: "A slow, smooth push toward the subject",
    template: "{subject}. A slow, smooth dolly push-in toward the subject.",
    styleSuffix: "Smooth dolly-in camera move, shallow depth of field, cinematic.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A perfume bottle on a marble counter" },
  { key: "orbit-360", name: "360 Orbit", category: "camera",
    description: "The camera circles all the way around",
    template: "{subject}. The camera orbits 360 degrees around the subject at eye level.",
    styleSuffix: "Continuous orbit camera move, subject stays centered, studio-quality lighting.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "Headphones on a pedestal" },
  { key: "fpv-fly-through", name: "FPV Drone", category: "camera",
    description: "A fast drone swoop through the scene",
    template: "{subject}. An FPV drone flies fast through the scene and swoops past the subject.",
    styleSuffix: "FPV drone shot, fast fluid motion, motion blur, dynamic.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A coffee cart in a busy market" },
  { key: "bullet-time", name: "Bullet Time", category: "camera",
    description: "Frozen moment, camera sweeps around it",
    template: "{subject}. Motion freezes mid-action while the camera sweeps around it in slow motion.",
    styleSuffix: "Bullet time effect, frozen moment, sweeping camera, crisp detail.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A skateboarder mid-jump" },
  // Effects
  { key: "disintegrate", name: "Disintegrate", category: "effects",
    description: "The subject breaks into glowing particles",
    template: "{subject}. The subject slowly disintegrates into glowing particles that drift away.",
    styleSuffix: "Particle disintegration effect, dark background, glowing embers, cinematic.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A red rose on black" },
  { key: "levitate", name: "Levitate", category: "effects",
    description: "The subject lifts off and floats",
    template: "{subject}. The subject lifts off the surface and floats, rotating slowly in mid-air.",
    styleSuffix: "Levitation effect, soft shadow below, clean background, premium product feel.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A smartwatch on a desk" },
  { key: "splash-reveal", name: "Splash Reveal", category: "effects",
    description: "A slow-motion liquid burst reveals the subject",
    template: "{subject}. A burst of liquid splashes around the subject in slow motion, revealing it.",
    styleSuffix: "High-speed liquid splash, slow motion, droplets frozen in light, commercial look.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A can of sparkling water" },
  // UGC
  { key: "ugc-handheld", name: "Handheld Review", category: "ugc",
    description: "Phone footage, like a quick honest review",
    template: "{subject}. Filmed by a person holding a phone, casually showing it to camera like a quick honest review.",
    styleSuffix: "Shot on a phone, handheld with slight natural shake, natural indoor lighting, vertical, authentic creator video, not an ad.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A reusable water bottle" },
  { key: "ugc-unboxing", name: "Unboxing POV", category: "ugc",
    description: "First-person hands opening the package",
    template: "{subject}. First-person POV of hands opening a package and revealing it.",
    styleSuffix: "POV phone footage, handheld, natural light, casual home setting, authentic unboxing, vertical.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "Wireless earbuds in a small box" },
  { key: "ugc-in-use", name: "In Real Life", category: "ugc",
    description: "Someone using it in an everyday moment",
    template: "{subject}. Someone using it naturally in an everyday moment at home or on the street.",
    styleSuffix: "Candid phone footage, handheld, natural light, real-life setting, authentic creator content, vertical.",
    defaultModel: "fast", defaultAspect: "9:16", placeholder: "A habit tracker app on a phone" },
];

export const PRESET_KEYS = PRESETS.map((p) => p.key);
export const getPreset = (key: string | null | undefined) =>
  PRESETS.find((p) => p.key === key) ?? null;
export const DEFAULT_CAMPAIGN_PRESET = "ugc-handheld";
