import { pathToFileURL } from "node:url";
import { cropBottom, maxUpscale, statusBar, theme } from "./config.mjs";

/**
 * The phone claims whatever height the copy leaves, capped at the source
 * screenshot's own pixel height times maxUpscale. Its bottom bleeds off-canvas,
 * which also crops the system gesture bar away.
 */
function layout(target, source) {
	const { width: W, height: H } = target;
	const bezel = Math.max(10, Math.round(W * 0.011));
	const visibleH = source.height * (1 - cropBottom);
	const radius = Math.round(W * 0.062);

	return {
		W,
		H,
		bezel,
		radius,
		rim: Math.max(2, Math.round(W * 0.0025)),
		bar: statusBar.platforms[target.platform],
		bleed: Math.round(H * 0.05),
		maxScreenH: Math.round(visibleH * maxUpscale),
		aspect: source.width / visibleH,
		padX: Math.round(W * 0.085),
		padTop: Math.round(H * 0.055),
		gap: Math.round(H * 0.05),
		headlineSize: Math.round(W * 0.056),
		sublineSize: Math.round(W * 0.03),
	};
}

const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Sized in em so the icons follow the bar's font-size, not a fixed guess. */
function statusIcons() {
	const bar = (i) => {
		const h = 3.2 + i * 2.2;
		return `<rect x="${i * 2.6}" y="${10 - h}" width="1.7" height="${h}" rx="0.5" />`;
	};

	return `
    <svg class="si" viewBox="0 0 10 10" width="1em" height="1em">
      <g fill="currentColor">${[0, 1, 2, 3].map(bar).join("")}</g>
    </svg>
    <svg class="si" viewBox="2 5 20 15" width="1.2em" height="1.2em">
      <path fill="currentColor" d="M12 19.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Zm0-6.1c1.6 0 3 .6 4.1 1.7l1.7-1.7A8.2 8.2 0 0 0 12 11a8.2 8.2 0 0 0-5.8 2.4l1.7 1.7A5.8 5.8 0 0 1 12 13.4Zm0-5.3c3 0 5.8 1.2 7.9 3.3l1.7-1.8A13.4 13.4 0 0 0 12 5.8c-3.7 0-7 1.5-9.6 3.9l1.7 1.8A11.1 11.1 0 0 1 12 8.1Z"/>
    </svg>
    <svg class="si" viewBox="0 0 34 20" width="1.7em" height="1em">
      <rect x="0.9" y="0.9" width="28" height="18.2" rx="5" fill="none" stroke="currentColor" stroke-width="1.8" opacity="0.55"/>
      <rect x="3.4" y="3.4" width="23" height="13.2" rx="3" fill="currentColor"/>
      <path d="M31.4 6.6v6.8a3.6 3.6 0 0 0 0-6.8Z" fill="currentColor" opacity="0.55"/>
    </svg>`;
}

export function buildHtml(slide, target, source) {
	const box = layout(target, source);

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${box.W}px;
    height: ${box.H}px;
    overflow: hidden;
    background: ${theme.ink};
    font-family: "Noto Sans", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .canvas {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: ${box.W}px;
    height: ${box.H}px;
    padding: ${box.padTop}px ${box.padX}px 0;
    background:
      radial-gradient(86% 40% at 50% -8%,
        color-mix(in srgb, ${theme.accent} 62%, transparent) 0%, transparent 68%),
      radial-gradient(58% 34% at 96% 8%,
        color-mix(in srgb, ${theme.accent} 30%, transparent) 0%, transparent 70%),
      radial-gradient(70% 40% at 2% 104%,
        color-mix(in srgb, ${theme.green} 34%, transparent) 0%, transparent 72%),
      ${theme.ink};
  }
  .copy {
    flex: 0 0 auto;
    text-align: center;
  }
  .headline {
    text-wrap: balance;
    font-size: ${box.headlineSize}px;
    font-weight: 700;
    line-height: 1.06;
    letter-spacing: -0.025em;
    color: ${theme.headline};
  }
  .subline {
    max-width: ${Math.round(box.W * 0.72)}px;
    margin: ${Math.round(box.headlineSize * 0.5)}px auto 0;
    font-size: ${box.sublineSize}px;
    font-weight: 400;
    line-height: 1.4;
    letter-spacing: -0.008em;
    color: ${theme.subline};
  }
  .phone {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    min-height: 0;
    max-height: ${box.maxScreenH + box.bezel * 2}px;
    margin-top: ${box.gap}px;
    margin-bottom: ${-box.bleed}px;
    padding: ${box.bezel}px;
    border-radius: ${box.radius + box.bezel}px;
    background: ${theme.bezel};
    border: ${box.rim}px solid rgba(255, 255, 255, 0.22);
    box-shadow:
      inset 0 0 0 1px rgba(0, 0, 0, 0.8),
      0 ${Math.round(box.H * 0.012)}px ${Math.round(box.H * 0.05)}px rgba(0, 0, 0, 0.8),
      0 0 ${Math.round(box.H * 0.09)}px rgba(0, 0, 0, 0.55);
  }
  /* Wrapper clips the bottom of the capture; the img itself is never scaled
     against its own aspect, so nothing in the UI gets stretched. */
  .screen {
    height: 100%;
    aspect-ratio: ${box.aspect};
    overflow: hidden;
    border-radius: ${box.radius}px;
  }
  .screen img {
    display: block;
    width: 100%;
    height: auto;
  }
  .statusbar {
    position: absolute;
    top: ${box.bezel}px;
    left: ${box.bezel}px;
    right: ${box.bezel}px;
    height: ${(box.bar.height * 100).toFixed(1)}%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 ${(box.bar.inset * 100).toFixed(1)}%;
    border-radius: ${box.radius}px ${box.radius}px 0 0;
    background: ${statusBar.colors.background};
    color: ${statusBar.colors.foreground};
    font-size: ${Math.round(box.W * 0.021)}px;
  }
  .time {
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .icons {
    display: flex;
    align-items: center;
    gap: 0.42em;
  }
  .si { display: block; }
</style>
</head>
<body>
  <div class="canvas">
    <div class="copy">
      <h1 class="headline">${esc(slide.headline)}</h1>
      <p class="subline">${esc(slide.subline)}</p>
    </div>
    <div class="phone">
      <div class="screen"><img src="${pathToFileURL(slide.image).href}" alt=""></div>
      <div class="statusbar">
        <span class="time">${box.bar.time}</span>
        <span class="icons">${statusIcons()}</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}
