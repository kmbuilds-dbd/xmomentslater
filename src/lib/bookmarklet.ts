export function getBookmarkletCode(appUrl: string): string {
  // Open a popup window (x.com's CSP blocks iframes).
  // Keep the handle so we can close it via postMessage from the popup.
  return `javascript:void(function(){var w=window.open('${appUrl}/bookmarklet?url='+encodeURIComponent(location.href),'xml','width=380,height=420,top=80,left='+Math.max(0,screen.width-420));window.addEventListener('message',function h(e){if(e.origin==='${appUrl}'&&(e.data==='xml-close')){try{w.close()}catch(x){}window.removeEventListener('message',h)}});}())`;
}
