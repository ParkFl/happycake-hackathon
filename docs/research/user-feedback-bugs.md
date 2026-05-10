\# User-tested production URL — bugs found (May 10)



Tested by: project owner via mobile + desktop browser

Tested on: production Vercel deployment



\## P0 Critical

1\. /api/chat returns fallback "Connection issue on our end" on simple 

&#x20;  "Hello" — agent never reaches MCP/Claude. Likely cause: claude -p 

&#x20;  binary not available in Vercel serverless runtime. Fix requires 

&#x20;  either local-only chat OR proxy to ngrok-tunneled local agent.



2\. Mobile top nav doesn't collapse to hamburger menu — broken responsive 

&#x20;  breakpoint or missing mobile menu component.



3\. "Order pickup" CTA button: text disappears on :active state (text 

&#x20;  color matches background fill on press).



4\. On-site chat widget: panel background same color as page background, 

&#x20;  widget effectively invisible when opened.



\## P1 UX

5\. Cannot add multiple items to one order — clicking product immediately 

&#x20;  navigates to /order. Need shopping cart with quantity controls and 

&#x20;  continue-browsing flow.



6\. Catalog grid: when fewer than 4 products in a category, cards stretch 

&#x20;  vertically and look ugly. Need fixed aspect-ratio cards in grid.



7\. No Google Maps embed or "Get directions" button — production site 

&#x20;  should have this for mobile users planning a visit.



8\. Instagram link is plain text — needs branded styled component (icon + 

&#x20;  gradient bg).



\## P2 Content

9\. Verify all 5 sandbox SKUs displayed on /catalog with correct prices 

&#x20;  (priceCents from MCP, formatted as $X.XX).



10\. Brand voice audit per brandbook: HappyCake spelling, cake "<Name>" 

&#x20;   format, no hype words, soft CTA close, sign as people.



11\. Remove all "100% Halal Kitchen" claims (badges, JSON-LD 

&#x20;   suitableForDiet, /policies section, /about mention) — unsupported 

&#x20;   by sandbox MCP catalog.

