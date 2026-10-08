# All sound uses the shared visible mix

Audio, including sound added by an agent to a graphic, is represented as project sources and placements in one visible mix used by preview and rendering. We chose this over independently sounding HTML pages to make volume, fades, loops, pause, seeking and editor/command-line output agree, with picture/sound timing verified within one selected output frame. This narrows ADR 0001's allowance for independent Web Audio playback while preserving freedom of visual technique, stable element names and deterministic visual seeking.
