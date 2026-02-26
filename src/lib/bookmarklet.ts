export function getBookmarkletCode(appUrl: string): string {
  // Use a popup window instead of an iframe — x.com's CSP blocks external iframes
  return `javascript:void(window.open('${appUrl}/bookmarklet?url='+encodeURIComponent(location.href),'xml','width=380,height=420,top=80,left='+Math.max(0,screen.width-420)))`;
}
