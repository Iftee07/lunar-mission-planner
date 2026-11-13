# Demo script

Click paths for **Video 2** (live demo, at most 240 s, NASA data named aloud) and **Video 3** (30 s,
English subtitles). Every value below was read off the app (production build) on 2026-11-13 for
**10 Jan 2027, 00:00 UTC**. If a number on screen differs, the date or the pin is not the one below.

## Before recording

- Desktop browser, private window, about 1440 × 900, network on (the globe streams NASA Moon Trek imagery).
- Live site: https://lunar-mission-planner.vercel.app/
- Backup if the venue network is slow: the same link with `?offline=1` (bundled Moon texture; every number
  is the same, because calculations never use the network).
- Have the Video 3 link ready to paste:
  `https://lunar-mission-planner.vercel.app/?site=shackleton_rim&t=2027-01-10T00:00Z&cmp=apollo11,shackleton_rim`

## Video 2: 4-minute click path

| Time | Do | Say (key points) |
|---|---|---|
| 0:00-0:25 | Welcome slide 1: drag the latitude slider to 90°S ("Highest Sun: 0.0°"). Next: slide 2 (Earth's monthly loop), slide 3 (raise the antenna mast). "Open the planner". | At the pole the Sun skims the horizon, so a hill decides whether you have power. Earth wobbles in the sky (libration), so contact comes and goes. |
| 0:25-0:50 | Spin the globe. Zoom towards the south pole: crater names appear. Hover a mission pin (Apollo 11, an Artemis III region). | The globe streams NASA's LRO Wide Angle Camera mosaic from Moon Trek. Crater names are from the IAU Gazetteer. Every pin has a cited source. |
| 0:50-1:00 | In the time bar, set the start date to **10 Jan 2027, 00:00 UTC**. | Positions of the Sun and Earth come from NASA JPL's SPICE ephemeris, 2026 to 2035. |
| 1:00-1:30 | Press **Search** (or Ctrl+K), type `89.4389 S, 222.904 E` and press Enter. The camera flies to the connecting ridge and drops the pin. | Typed coordinates work anywhere on the Moon. Near the pole we use NASA's LOLA laser-altimeter terrain at 120 m ("Polar HD · 120 m" badge). |
| 1:30-1:55 | Read the cards: Sun **Perfect** ("the Sun stays up 38.0 d", elevation +1.1°), Earth **Perfect** ("Earthset in 13.9 d"), Landing **Possible** (2.2° slope). | The Sun is only 1° up, yet it stays up for 38 days on this ridge. |
| 1:55-2:15 | Press the `?` on the Sun card: the checklist with live numbers, then "Show the science". | Every verdict explains itself: rule, live numbers, method, data, threshold, known error. |
| 2:15-2:45 | Compare drawer: press the **Equator vs pole** preset. Apollo 11: Sun -40.0°, Power **Not recommended**, sunlit 50%. Shackleton rim: Sun +1.0°, Power **Perfect**, sunlit 100%, Earth in view 74%. | On the equator a lunar day is two weeks of light, then two weeks of night. At the pole the Sun circles the horizon. |
| 2:45-3:05 | Press **Play**: the day/night line sweeps across the globe and the timeline playhead moves. Pause, then drag the playhead to a dark band and back. | Everything is linked: globe, timeline, cards and countdowns move together. |
| 3:05-3:25 | Switch to **Polar HD**. Layers: Sunlight (NASA's average illumination map) and Permanent shadow. Point at the "Move a little" card: within 500 m, sunlight 0% to 100%. | Within 500 m of the pin, some spots get no Sun during the whole stay and others get it all the time. That's why landing sites need precision. |
| 3:25-3:45 | Switch to **Surface**: the Sun and Earth against the real skyline. Antenna card: 2 m, then 10 m. | No refraction (there's no air), real terrain on the horizon, and a taller mast can see Earth over a ridge. |
| 3:45-4:00 | Press **Copy link**. | One link shares the whole scenario: sites, date, compare. Checked against NASA JPL Horizons and NASA's published illumination maps. |

## Video 3: 30-second path

| Time | Do | Subtitle |
|---|---|---|
| 0:00-0:05 | Paste the Video 3 link. The globe opens on Shackleton rim with Apollo 11 in the compare drawer. | Pick any landing site on the Moon. |
| 0:05-0:13 | Point at the drawer: Apollo 11 sunlit 50%, Shackleton rim sunlit 100%. | See when it has power and when it can talk to Earth. |
| 0:13-0:22 | Press Play: the day/night line sweeps the globe. | Watch a lunar day pass. |
| 0:22-0:30 | Polar HD view with the "Move a little" ring. | Move 500 m and everything changes. Lunar Mission Planner. |
