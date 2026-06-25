// Bottom HUD: one angled arcade panel per fighter with the character name, a
// big scoreboard percent (that heats from white -> yellow -> red), and stock
// pips. Drawn in screen space so it ignores camera shake.

import { STAGE_WIDTH, STAGE_HEIGHT } from '../game/constants.js';

// Percent heat color, mirroring Smash's damage readout.
export function percentColor(p) {
  if (p < 6) return '#eef4ff';
  const hue = Math.max(0, 55 - (p / 165) * 55);
  const light = Math.max(46, 72 - p * 0.085);
  return `hsl(${hue}, 100%, ${light}%)`;
}

function panelPath(ctx, x, y, w, h, skew) {
  ctx.beginPath();
  ctx.moveTo(x + skew, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - skew, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

export function drawHud(ctx, match) {
  const fighters = match.fighters;
  const n = fighters.length;
  const margin = 24;
  const gap = 16;
  const totalW = STAGE_WIDTH - margin * 2 - gap * (n - 1);
  const w = totalW / n;
  const h = 86;
  const y = STAGE_HEIGHT - h - 18;
  const skew = 16;

  fighters.forEach((f, i) => {
    const x = margin + i * (w + gap);

    // panel base
    ctx.save();
    panelPath(ctx, x, y, w, h, skew);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(16,22,38,0.94)');
    g.addColorStop(1, 'rgba(8,11,20,0.94)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = f.eliminated ? 'rgba(120,130,150,0.5)' : f.color;
    ctx.stroke();
    ctx.clip();

    // accent bar
    ctx.fillStyle = f.color;
    ctx.globalAlpha = f.eliminated ? 0.3 : 1;
    ctx.fillRect(x + skew, y, w - skew, 5);
    ctx.globalAlpha = 1;

    // name + tag
    ctx.fillStyle = f.eliminated ? '#6b7488' : '#cdd8ee';
    ctx.font = '700 15px "Chakra Petch", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`P${i + 1}`, x + skew + 12, y + 26);
    ctx.fillStyle = f.color;
    ctx.fillText(f.def.name, x + skew + 44, y + 26);

    if (f.eliminated) {
      ctx.fillStyle = '#ff5470';
      ctx.font = '700 28px "Saira Condensed", "Chakra Petch", sans-serif';
      ctx.fillText('OUT', x + skew + 14, y + 64);
    } else {
      // big percent
      ctx.textAlign = 'right';
      ctx.fillStyle = percentColor(f.percent);
      ctx.font = '700 italic 46px "Saira Condensed", "Chakra Petch", sans-serif';
      ctx.fillText(Math.floor(f.percent).toString(), x + w - skew - 56, y + 70);
      ctx.font = '700 italic 18px "Saira Condensed", sans-serif';
      ctx.fillText('%', x + w - skew - 28, y + 64);
    }

    // stock pips
    const pipY = y + 44;
    for (let s = 0; s < Math.max(0, f.stocks); s++) {
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(x + skew + 18 + s * 16, pipY, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  });
}

// Centered banner ("GAME!", "READY?", countdowns).
export function drawBanner(ctx, text, sub, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#42e0ff';
  ctx.shadowBlur = 30;
  ctx.font = '700 italic 96px "Saira Condensed", "Chakra Petch", sans-serif';
  ctx.fillText(text, STAGE_WIDTH / 2, STAGE_HEIGHT / 2);
  if (sub) {
    ctx.shadowBlur = 0;
    ctx.font = '600 22px "Chakra Petch", monospace';
    ctx.fillStyle = '#9fb4d6';
    ctx.fillText(sub, STAGE_WIDTH / 2, STAGE_HEIGHT / 2 + 46);
  }
  ctx.restore();
}
