# Customer upload storage placeholder

This static storefront cannot write browser-uploaded customer artwork directly into this repository folder at runtime without a backend upload endpoint.

The sticker and snapback workspaces preserve uploaded originals as `uploadedAssets` data URLs inside each cart/order customization record so the files can be downloaded from the order confirmation data. If a backend is added later, this folder is the intended destination for server-side persisted customer artwork files.
