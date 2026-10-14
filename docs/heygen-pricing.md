# HeyGen API pricing (reference)

Pasted by the owner on 2026-10-14 from HeyGen's pricing page for self-serve
accounts. Kept here as the reference for cost decisions; check HeyGen's page
before relying on a number, since promotions end and rates change.

## How billing works

Calls made with an API key (`x-api-key` header) are billed on the API tier,
from a prepaid USD wallet. The balance is at `GET /v3/users/me` → `wallet`.

This is separate from the HeyGen **web plan** (Creator $29, Pro $49, per the
owner). The web plan sets workspace limits such as voice clone slots
(Creator 40, Pro 70); it does not pay for API renders.

## Video generation

### Avatar V
Highest-fidelity engine. Custom Video Avatars only, not Photo Avatars.

| Avatar type | 720p / 1080p |
|---|---|
| Custom Video Avatar | $0.12 / sec |

### Avatar IV
Default v3 engine.

| Avatar type | 720p / 1080p |
|---|---|
| Photo Avatar | $0.0385 / sec |
| Custom Video Avatar | $0.0805 / sec |
| Studio Avatar | $0.0805 / sec |

### Avatar III
Dedicated photo-to-video pipeline.

| Avatar type | 720p / 1080p |
|---|---|
| Custom Video Avatar | $0.01 / sec |
| Studio Avatar | $0.0165 / sec |
| Photo Avatar | $0.0165 / sec |

### Cinematic Avatar
Priced per video by output resolution (4–15 seconds, 720p/1080p only), not by duration.

| Item | Rate |
|---|---|
| Cinematic Avatar video, 720p | $7.30 / video |
| Cinematic Avatar video, 1080p | $17.67 / video |

### HeyGen Video
5–15 second scenes with synchronized audio from a prompt, an image, or
references. Reference to Video bills input plus output seconds; image and
audio references are free.

| Mode | Rate |
|---|---|
| Text to Video, 480p | $0.01 / sec |
| Text to Video, 768p | $0.015 / sec |
| Image to Video, 480p | $0.01 / sec |
| Image to Video, 768p | $0.015 / sec |
| Reference to Video, 480p | $0.02 / sec |
| Reference to Video, 768p | $0.03 / sec |

Launch promotion: 50% off. List price is double the rate shown.

### Video Agent

| Feature | Rate |
|---|---|
| Prompt to Video | $0.097 / sec |

### HyperFrames
Billed per minute of output; the rate scales with resolution and fps.

| Resolution / frame rate | Rate |
|---|---|
| 1080p / 30 fps | $0.10 / min |
| 1080p / 60 fps | $0.20 / min |
| 4K / 30 fps | $0.15 / min |
| 4K / 60 fps | $0.30 / min |

## Video translation

| Mode | Rate |
|---|---|
| Speed, audio only | $0.0095 / sec |
| Speed, lip sync | $0.0135 / sec |
| Precision, lip sync | $0.025 / sec |

Proofread mode is Enterprise only.

## Lipsync

| Mode | Rate |
|---|---|
| Speed | $0.014 / sec |
| Precision | $0.029 / sec |

## AI clipping

Long video into short highlight clips, billed per minute of the source video.

| Item | Rate |
|---|---|
| Highlight clip | $0.70 / min of source video |

## Filler word removal

Billed on the source video's duration, 1-minute minimum per job; refunded
automatically if a run changes nothing.

| Item | Rate |
|---|---|
| Filler word removal | $0.005 / sec of source video |

## Text-to-speech

HeyGen Voice speaks an instant voice clone made from one recording
(`POST /v3/models/audio/tts`), completed or streamed, billed on characters
submitted.

| Model | Rate |
|---|---|
| HeyGen Voice (instant voice clone) | $15 / 1M characters |
| Speech, Starfish | $0.002 / sec |

HeyGen Voice launch promotion: 50% off until 31 October 2026; list price is
double. Creating an instant voice is free during the preview.

## Avatar creation

| Operation | Rate |
|---|---|
| Custom Video Avatar | $2.13 / call |
| Photo Avatar | $1.32 / call |

## Against the app's own figures (2026-10-14)

`RATE_PER_SECOND_USD`, `AGENT_RATE_PER_SECOND` and `TRANSLATE_RATE_PER_SECOND`
in `lib/api/heygen.ts` estimate each render's cost (`heygen_cost_usd`) and
decide whether the wallet can pay before a render starts. They differ from
this page:

| Engine / avatar | App's rate | This page |
|---|---|---|
| Avatar III photo | $0.0433 / sec | $0.0165 / sec |
| Avatar III custom video (twin) | $0.0167 / sec | $0.01 / sec |
| Avatar III studio | $0.0167 / sec | $0.0165 / sec |
| Avatar IV photo | $0.05 / sec | $0.0385 / sec |
| Avatar IV custom video / studio | $0.0667 / sec | $0.0805 / sec |
| Avatar V custom video | $0.0667 / sec | $0.12 / sec |
| Video Agent | $0.0333 / sec | $0.097 / sec |
| Translation | $0.0333 / sec | $0.0095–$0.025 / sec |

Not changed yet; the app's comments say its figures were checked against an
invoice, so a recent invoice line should settle which is current.
