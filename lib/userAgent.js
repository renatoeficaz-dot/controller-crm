// Detecção leve de dispositivo/navegador pelo User-Agent — sem depender de
// lib externa, só cobre os casos comuns o suficiente pra análise de cliques.
export function parseUserAgent(ua) {
  ua = ua || "";

  let dispositivo = "Computador";
  if (/iPad|Android(?=.*\bTablet\b)/i.test(ua)) dispositivo = "Tablet";
  else if (/Mobi|Android|iPhone|iPod/i.test(ua)) dispositivo = "Celular";

  let navegador = "Outro";
  if (/Instagram/i.test(ua)) navegador = "Instagram (in-app)";
  else if (/FBAN|FBAV|FB_IAB/i.test(ua)) navegador = "Facebook (in-app)";
  else if (/EdgA|Edge|Edg\//i.test(ua)) navegador = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) navegador = "Opera";
  else if (/CriOS/i.test(ua)) navegador = "Chrome (iOS)";
  else if (/Chrome/i.test(ua) && !/Chromium/i.test(ua)) navegador = "Chrome";
  else if (/FxiOS|Firefox/i.test(ua)) navegador = "Firefox";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) navegador = "Safari";

  return { dispositivo, navegador };
}
