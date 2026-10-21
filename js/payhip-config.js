/* Payhip cart settings. Loaded as a classic script right before payhip.js,
   because Payhip reads window.PayhipConfig once, when the page finishes loading.
   Only the keys Payhip knows are allowed here; an unknown key stops its setup. */
window.PayhipConfig = {
  enableCart: true,
  cart: {
    position: 'bottom-right',          // keeps the cart button clear of the sticky header
    displayLauncherOnPageLoad: true,   // show the floating cart button when it has items
    launcherBackground: '#172B3B',
    checkoutButtonBackground: '#172B3B'
  }
};
