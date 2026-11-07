HAL9K SIGNUP CD
===============

Run HAL9K.EXE (normally launched by Windows AutoRun).
HAL9K.INI configures the virtual signup service at:
http://192.168.86.2/api/signup

The browser connects to the same-origin Go daemon using WISP.
Nothing is submitted until you confirm in the signup wizard.
Confirmed submissions use the real signup API and may be logged and
sent to Slack. Use synthetic personal data when testing.
No Slack webhook credential is included on this CD.
