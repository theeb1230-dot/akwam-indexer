# Stage #9 — Flutter API Integration Contract

Status: implementation in progress.

Scope:
- stable versioned search, series, episode and playback-session APIs;
- separate watch and download contracts;
- playback feedback events for first frame, buffering and fatal errors;
- client-safe schemas without provider HTML or temporary internal URLs;
- backward compatibility and contract tests.

Flutter remains a UI/player client and never contains provider scrapers.
