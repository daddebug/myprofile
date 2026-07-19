# Afterwarm Web build template notes

This exported Unity Web build is embedded by the portfolio at `/games/afterwarm/index.html`.

The generated Web template was adjusted after export to:

- use a bounded 16:9 portfolio player; Unity's default `matchWebGLToCanvasSize` behavior adapts the render buffer to the iframe;
- remove the default Unity footer, product title, logo, and fullscreen control;
- remove fixed desktop pixel sizing and centered transforms;
- let the canvas fill only its proportional iframe without viewport sizing, cropping, or stretching;
- keep the Unity loading progress elements required during startup.

A future Unity export may overwrite `index.html` and `TemplateData/style.css`; reapply these template-only changes after replacing the build.
