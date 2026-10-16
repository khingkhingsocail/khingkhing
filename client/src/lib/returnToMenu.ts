export interface MenuReturn {
  opener: HTMLElement;
  scroll: Array<{ element: HTMLElement; top: number; left: number }>;
  x: number;
  y: number;
}
export function captureMenuReturn(opener: HTMLElement): MenuReturn {
  const scroll: MenuReturn["scroll"] = [];
  for (
    let element = opener.parentElement;
    element;
    element = element.parentElement
  ) {
    if (
      element.scrollHeight > element.clientHeight ||
      element.scrollWidth > element.clientWidth
    )
      scroll.push({
        element,
        top: element.scrollTop,
        left: element.scrollLeft,
      });
  }
  return { opener, scroll, x: window.scrollX, y: window.scrollY };
}
export function restoreMenuReturn(snapshot: MenuReturn) {
  if (snapshot.opener.isConnected)
    snapshot.opener.focus({ preventScroll: true });
  for (const row of snapshot.scroll)
    if (row.element.isConnected) {
      row.element.scrollTop = row.top;
      row.element.scrollLeft = row.left;
    }
  window.scrollTo({ left: snapshot.x, top: snapshot.y, behavior: "instant" });
}
