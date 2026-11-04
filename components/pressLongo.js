// Apertar e segurar (celular): chama `onLong` depois de `ms` com o dedo parado. O timer fica no próprio elemento para sobreviver a re-renders.
export function pressLongo(onLong, ms = 500) {
  const cancelar = (e) => {
    const el = e.currentTarget;
    clearTimeout(el.__lpTimer);
    el.__lpTimer = null;
  };
  return {
    onTouchStart: (e) => {
      const el = e.currentTarget;
      const p = e.touches[0];
      el.__lpPos = [p.clientX, p.clientY];
      clearTimeout(el.__lpTimer);
      el.__lpTimer = setTimeout(() => {
        el.__lpTimer = null;
        try { navigator.vibrate?.(30); } catch {}
        onLong();
      }, ms);
    },
    onTouchMove: (e) => {
      const el = e.currentTarget;
      const p = e.touches[0];
      const [x, y] = el.__lpPos || [p.clientX, p.clientY];
      if (Math.abs(p.clientX - x) > 10 || Math.abs(p.clientY - y) > 10) cancelar(e);
    },
    onTouchEnd: cancelar,
    onTouchCancel: cancelar,
    // O menu nativo de "segurar" do celular (selecionar/copiar) atrapalha: no toque, só o nosso fluxo.
    onContextMenu: (e) => {
      if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) e.preventDefault();
    },
  };
}
