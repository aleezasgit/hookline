export const HOOK_TYPES = {
  problem_first: { label: "Problem first", description: "Opens on a relatable pain point, then the product" },
  pov:           { label: "POV", description: "A first-person 'POV: you...' scenario" },
  before_after:  { label: "Before and after", description: "Shows the change the product makes" },
  reaction:      { label: "Reaction", description: "A genuine surprised or delighted reaction" },
  myth_bust:     { label: "Myth bust", description: "Calls out a common mistake or belief" },
  quick_tip:     { label: "Quick tip", description: "A fast 'here is how I...' tip" },
  unboxing:      { label: "Unboxing", description: "First impression while opening it" },
  day_in_life:   { label: "Day in the life", description: "The product in a normal routine" },
} as const;
export type HookType = keyof typeof HOOK_TYPES;
export const HOOK_KEYS = Object.keys(HOOK_TYPES) as [HookType, ...HookType[]];
