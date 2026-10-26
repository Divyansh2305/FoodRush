# FoodRush V3

FoodRush is a responsive React food-delivery and quick-commerce experience with nearby restaurant discovery, grocery shopping, account-scoped cart/history/favorites/addresses, checkout, order tracking, support and company pages.

## Run
```bash
npm install
npm start
```
Open `http://localhost:1234`.

The location API starts on port `3001` by default and binds to `0.0.0.0` so the site can also be tested from a phone on the same network. Use `.env.example` for API host/port options.

## Main flows
- Current-location and manual-area restaurant discovery
- Restaurant filters, recent searches, favorites, menu, cart and coupons
- FoodRush Quick grocery catalog with product details, variants, stock and wishlist
- Account creation, password hashing, password reset, one-time-code sign-in and verification flows
- User-scoped cart, orders, addresses, favorites, grocery wishlist and support tickets
- Checkout with masked payment metadata, address selection, delivery scheduling and contactless delivery
- Order tracking, cancellation, rider details, receipt download, reorder and feedback
- Help Center, Contact, support tickets, partner onboarding, Careers, Corporate, Investor, Privacy, Terms and Accessibility pages
- Responsive desktop/mobile navigation, focus states, reduced-motion support and toast notifications

## Location data
Nearby place discovery uses public OpenStreetMap/Nominatim/Overpass data through the bundled Node API. The server includes request throttling, caching, multiple Overpass fallbacks and LAN-friendly binding.

## V4 CSS polish
A final visual consolidation layer is loaded from `src/styles/v4.css` after the legacy styles. It normalizes spacing, forms, cards, buttons, responsive behavior, account pages, checkout, orders, tracking, help, footer, grocery and mobile layouts without removing working legacy rules.
