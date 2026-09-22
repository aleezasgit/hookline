# Hookline: Product Spec

Working name. Rename freely, but do not use the Higgsfield name or logo in the product itself. The README can say "a Higgsfield AI clone".

## In one sentence

Hookline is a Higgsfield-style AI video studio with a Campaign mode on top: a brand writes one brief, gets several native-feeling short videos with different hooks, an AI reviewer pre-screens every clip, and a human decides what ships.

## Why it exists

This is the one-day take-home for the Software Engineer role at 8x. 8x runs large creator networks: it briefs creators, reviews what they post, measures the views, and pays for the work. Its whole business is "many people make many variants, a human keeps the winners."

Hookline has two halves:

1. **The clone.** A faithful rebuild of Higgsfield's core experience: browse visual presets, turn an image or an idea into a short video, keep everything in a library, spend credits.
2. **Campaign mode.** The 8x workflow compressed into one screen flow: brief once, generate many variants, review fast, keep the winners, render them in high quality.

The clone proves we can rebuild a real product. Campaign mode proves we understand the company we are applying to.

## Who uses it

- **The creator or marketer making a single clip.** Wants a great-looking video from a photo or an idea in under a minute. Uses the clone side.
- **The growth marketer at a consumer app or DTC brand.** Needs many hook variants to test on TikTok, Reels and Shorts, not one polished ad. Uses Campaign mode.
- **The reviewer.** The person who approves or rejects content. Needs to get through a batch quickly and explain what to fix.

## The problems we solve

| Problem | What Hookline does |
|---|---|
| Good clips take many re-rolls, and credits burn fast | Draft on a cheap fast model, render only the winners in high quality. Every button shows its cost before you press it. |
| Generators make clips, but nobody tells you which one to post | Every campaign clip gets an AI pre-review with scores and a suggested fix. A human makes the final call. |
| AI video looks like an ad, but organic content needs to feel native | UGC-style presets (handheld, unboxing, in-use) and a "feels native" score on every review. |
| One hook is not a test | One brief produces several meaningfully different hooks in one go. |

## Product principles

1. **The human decides, AI assists.** AI writes, generates and pre-screens. A person approves. This mirrors 8x's "human in the loop" thesis.
2. **Native over polished.** Defaults favor content that looks like a real person posted it.
3. **No surprise spending.** Cost is visible before every action that spends credits. Failed generations are refunded automatically.
4. **Never a dead end.** Every screen, empty state and error tells you the next thing to do.
5. **Review at speed.** Reviewing a batch should feel like triaging an inbox: keyboard shortcuts, one decision per clip, instant feedback.
6. **Honest labels.** AI scores are a pre-review checklist, never presented as a view prediction.

## Features

### Clone core

**Explore (home).** A gallery of visual presets grouped into Camera, Effects and UGC. Each card shows a looping preview. Clicking a card opens Create with that preset loaded. The top of the page has two clear entry points: "Create a video" and "Start a campaign".

**Create.** The main studio. On the left, a control panel: chosen preset, image drop zone, prompt box with an "Enhance prompt" helper, model choice (Fast or Pro), aspect ratio and length. At the bottom of the panel, one big button: "Generate · 10 credits". On the right, the latest result plays large, with actions underneath (Download, Remix, Use in campaign, Render in Pro). Below it, a strip of recent generations.

**Library.** Every video ever generated in this workspace, in a grid. Filters for All, Drafts, Pro renders and Campaign clips. Hover to play, click to open larger with actions.

**Credits.** Each visitor gets a private workspace with 300 demo credits, no sign-up. The balance is always visible in the top bar. Costs are shown on every spending button.

### Campaign mode (the standout feature)

A four-step flow with a progress bar across the top:

1. **Brief.** Product name, a one-line description, a product photo, target audience, goal, platform (TikTok, Reels or Shorts), tone, and how many variants (3 to 6). One button: "Write hooks".
2. **Hooks.** AI returns a set of concept cards. Each card has a hook type (for example "problem first", "before and after", "POV"), the opening line, what the video will show, a preset, and a post caption. The user can edit any field, re-roll a single card, or untick cards they don't want. Nothing has been spent yet. One button: "Generate 4 drafts · 40 credits".
3. **Review.** The review board. Cards turn from loading placeholders into playing videos as each one finishes. Each finished clip is scored automatically on four things: hook strength, feels native, on brief, visual quality, with a one-line reason each and a suggested fix. The hook line is shown as a caption over the video. For each clip the reviewer can Approve, Reject, or "Fix and regenerate" (write a note, the AI rewrites the video prompt, a new version appears). Tabs: Needs review, Approved, Rejected. Keyboard: A approve, R reject, F fix, arrow keys to move.
4. **Export.** Approved clips in a clean list. "Render all in Pro · 100 credits" as the main action, plus per-clip Download and Copy caption.

### Agent-ready (small, if time allows)

A plain-language description file at the site root that tells AI agents what Hookline does and how to use it. 8x publishes the same kind of file for its own platform. It shows we build for a world where agents are users too.

## Key journeys

**Journey 1: single clip (clone).**
Land on Explore, click "Crash Zoom", drop a product photo, type "sneaker on a wet street at night", press Generate. Watch progress, see the clip, press "Render in Pro". Find it later in Library.

**Journey 2: campaign (8x feature).**
Press "Start a campaign", fill the brief for a habit-tracker app, press "Write hooks". Edit one hook line, untick one concept, press "Generate 4 drafts". Watch four clips appear on the board with scores. Approve two, reject one, fix-and-regenerate one with the note "show the phone screen in the first second". Approve the new version. Go to Export, press "Render all in Pro", download.

**Journey 3: from clip to campaign.**
In Create or Library, a clip looks promising. Press "Use in campaign". The brief opens with that product photo already attached.

## Experience rules

- **One main action per screen**, always in the same place: bottom of the control panel on Create, bottom right of each campaign step, sticky at the bottom on phones.
- **Buttons name exactly what happens**, and the same word is used throughout: the button says "Approve", the toast says "Approved".
- **Every spending button shows its cost.**
- **Loading shows progress**, as a placeholder card with elapsed time ("Generating · 0:18"), never a lone spinner.
- **Failures explain and offer a fix**: "Generation failed. Credits refunded." with a "Try again" button.
- **Empty screens invite action**: an empty Library shows "Create your first video".
- **Works on a phone.** The Create panel becomes a bottom sheet, the main button stays reachable with a thumb.
- **Sentence case everywhere, plain words, no em dashes in any copy.**

## Priorities

**Must have (the demo fails without these)**
- Explore, Create and Library working end to end with real video generation
- 10 or more presets across Camera, Effects and UGC
- Campaign mode: brief, hooks, batch generation, review board with AI scores and approve or reject
- Credits with visible costs and automatic refunds

**Should have**
- Fix and regenerate with a note
- Render in Pro (single and bulk)
- Enhance prompt
- Keyboard shortcuts on the review board

**Could have**
- Polished phone layout
- Agent-ready description file
- Preset preview videos for every card

**Later (README only)**
- Paste the link of a posted TikTok and track its real views, so the system learns which hooks and presets win
- Burned-in captions and audio
- Team accounts, sharing a campaign with a brand for sign-off

## Out of scope

Sign-up and login, payments, a video editor or timeline, image generation, posting to social platforms, teams and permissions.

## What success looks like

A reviewer at 8x opens one link, with no sign-up, and within five minutes:
- makes a clip that looks and feels like Higgsfield,
- runs a campaign from brief to approved clips,
- sees an AI pre-review they find sensible,
- never hits a dead button, a blank screen or an unexplained error,
- understands in one sentence why Campaign mode was built for 8x specifically.

## Glossary

- **Preset:** a saved visual recipe (camera move, effect or UGC style) applied to a prompt or image.
- **Draft:** a clip made on the Fast model, cheap, for testing ideas.
- **Pro render:** the same clip re-made on the premium model.
- **Concept / hook:** one creative idea for a video, with an opening line.
- **Version:** a regenerated clip for the same concept after feedback.
- **Pre-review:** the AI's checklist scores on a clip. Advisory only.
- **Workspace:** the private space each visitor gets automatically, holding their credits and videos.
