export const RUBRIC = [
  { key: "hook", label: "Hook strength",
    definition: "Would the first 2 seconds stop someone scrolling? Is the subject or product clear immediately?" },
  { key: "native", label: "Feels native",
    definition: "Does it look like a real person filmed it for their own account, rather than a polished ad or obvious AI?" },
  { key: "onBrief", label: "On brief",
    definition: "Does it clearly show the product and fit the audience, goal and tone of the brief?" },
  { key: "quality", label: "Visual quality",
    definition: "Is it free of AI artifacts such as warped hands or faces, melting objects, garbled text or flicker?" },
] as const;
